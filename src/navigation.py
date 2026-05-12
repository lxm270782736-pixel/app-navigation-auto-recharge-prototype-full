"""Single-point navigation — all calls go through Meta navigation service."""
import logging
import threading
import time
from datetime import datetime

from ._utils import log_throttled

logger = logging.getLogger(__name__)


def _ts():
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


class NavigationMixin:
    """Navigation goal, status polling, cancel — via Meta link."""

    def navigate_to(self, x: float, y: float, theta: float,
                    config: dict | None = None, tasks: list | None = None) -> dict:
        if self._nav_state != "active" or not self._nav:
            return {"success": False, "message": f"Navigation Meta not active (state={self._nav_state})"}

        try:
            # 生成唯一 goal_id，用时间戳标识本次导航任务
            goal_id = f"nav_{int(time.time() * 1000)}"
            result = self._nav.navigate_to(x=x, y=y, yaw=theta, goal_id=goal_id)
            with self._lock:
                self._nav_status = "navigating"
                self._nav_feedback = {}
                self._nav_generation = getattr(self, '_nav_generation', 0) + 1
                self._nav_goal_id = goal_id
                my_gen = self._nav_generation
            logger.info("[nav] %s Meta navigate_to(%.3f, %.3f, %.3f) goal_id=%s: %s",
                        _ts(), x, y, theta, goal_id, result)
            self._start_nav_status_poller(my_gen, goal_id)
            return {"success": result.get("status") == "success",
                    "message": result.get("message", "")}
        except Exception as e:
            logger.error("[nav] navigate_to failed: %s", e)
            with self._lock:
                self._nav_status = "failed"
            return {"success": False, "message": str(e)}

    def _start_nav_status_poller(self, generation: int, goal_id: str = ""):
        """Poll Meta navigation status until terminal state for the given generation."""
        with self._lock:
            self._nav_polling = True

        def _poll():
            try:
                while True:
                    time.sleep(0.5)
                    if not self._nav:
                        break
                    with self._lock:
                        if getattr(self, '_nav_generation', 0) != generation:
                            logger.info("[nav] poller gen=%d superseded, exiting", generation)
                            break
                        if self._nav_status not in ("navigating",):
                            break
                    try:
                        status = self._nav.get_navigation_status()
                    except Exception as e:
                        logger.warning("[nav] Meta status poll error: %s", e)
                        continue

                    state = status.get("state", "idle")
                    returned_goal_id = status.get("goal_id", "")
                    log_throttled(logger, f"nav.poll.gen{generation}", 5.0, "info",
                                  "[nav] poller gen=%d poll: state=%s returned_goal_id=%r expected=%r",
                                  generation, state, returned_goal_id, goal_id)

                    with self._lock:
                        if getattr(self, '_nav_generation', 0) != generation:
                            logger.info("[nav] poller gen=%d superseded after RPC, exiting", generation)
                            break
                        self._nav_feedback = status

                    # goal_id 不匹配 → 旧任务残留，跳过
                    if goal_id and returned_goal_id and returned_goal_id != goal_id:
                        log_throttled(logger, f"nav.discard.gen{generation}", 5.0, "info",
                                      "[nav] poller gen=%d DISCARD stale goal_id (got=%r expected=%r) state=%s",
                                      generation, returned_goal_id, goal_id, state)
                        continue

                    if state in ("reached", "failed"):
                        success = state == "reached"
                        logger.info("[nav] %s Meta nav result: state=%s (gen=%d goal_id=%s)",
                                    _ts(), state, generation, goal_id)
                        self._on_nav_completed(success, status)
                        break
            finally:
                with self._lock:
                    if getattr(self, '_nav_generation', 0) == generation:
                        self._nav_polling = False

        threading.Thread(target=_poll, daemon=True, name="nav-meta-poller").start()

    def _on_nav_completed(self, success: bool, status: dict):
        """Handle navigation result — drive patrol/room-patrol logic."""
        with self._lock:
            self._nav_fail_reason = status.get("fail_reason") if not success else None
            patrol_active = self._patrol_active

        if patrol_active:
            self._on_nav_completed_patrol(success, status)
        else:
            self._on_nav_completed_standalone(success, status)

        # Signal room patrol thread
        if hasattr(self, '_nav_done_event') and getattr(self, '_room_patrol_active', False):
            logger.info("[nav] %s Signaling room_patrol: success=%s", _ts(), success)
            self._nav_done_success = success
            self._nav_result_seq = getattr(self, '_nav_done_seq', 0)
            self._nav_done_event.set()

    def _on_nav_completed_patrol(self, success: bool, status: dict):
        """Handle nav result during multi-waypoint patrol."""
        with self._lock:
            patrol_index = self._patrol_current_index
            self._nav_status = "succeeded" if success else "failed"
            self._nav_feedback = {"result": status, "goal_status": 4 if success else 3}
            if success:
                self._patrol_completed.append(patrol_index)
            else:
                self._patrol_skipped.append(patrol_index)
                self._patrol_error = f"路径点 {patrol_index + 1} 导航失败"
        self._advance_patrol()

    def _on_nav_completed_standalone(self, success: bool, status: dict):
        """Handle nav result for single-point navigation — auto-reset via timestamp."""
        with self._lock:
            self._nav_status = "succeeded" if success else "failed"
            self._nav_feedback = {"result": status, "goal_status": 4 if success else 3}
            self._nav_result_timestamp = time.time()

    def get_navigation_path(self) -> list[dict]:
        """Return current MINCO path from meta.astribot_navigation without auto-activating the service."""
        if self._nav_state != "active" or not self._nav:
            # Throttled: the frontend polls this at 2 Hz; if the cached state
            # is stale (meta restart, pending auto-recovery) this branch fires
            # continuously. One log line every 5 s is enough to diagnose.
            log_throttled(logger, "nav.path.not_active", 5.0, "info",
                          "[nav] get_navigation_path skipped: nav_state=%s, proxy=%s",
                          self._nav_state, "yes" if self._nav else "no")
            return []
        if getattr(self, '_nav_path_unsupported', False):
            return []
        try:
            path = self._nav.get_navigation_path()
            return path if isinstance(path, list) else []
        except Exception as e:
            if "not found" in str(e).lower() or "has no attribute" in str(e).lower():
                self._nav_path_unsupported = True
                logger.info("[nav] get_navigation_path not supported by this nav service, disabling")
            else:
                log_throttled(logger, "nav.path.rpc_fail", 5.0, "warning",
                              "[nav] get_navigation_path failed: %s", e)
            return []

    def get_jps_path(self) -> list[dict]:
        """Return current JPS fallback path from meta.astribot_navigation.

        Empty when MINCO is healthy. Same shape as get_navigation_path()
        ([{x, y, yaw}, ...]). Marked unsupported automatically if the upstream
        Meta service is older and lacks the RPC.
        """
        if self._nav_state != "active" or not self._nav:
            return []
        if getattr(self, '_nav_jps_path_unsupported', False):
            return []
        try:
            path = self._nav.get_jps_path()
            return path if isinstance(path, list) else []
        except Exception as e:
            if "not found" in str(e).lower() or "has no attribute" in str(e).lower():
                self._nav_jps_path_unsupported = True
                logger.info("[nav] get_jps_path not supported by this nav service, disabling")
            else:
                log_throttled(logger, "nav.jps_path.rpc_fail", 5.0, "warning",
                              "[nav] get_jps_path failed: %s", e)
            return []

    def cancel_navigation(self) -> dict:
        if self._nav_state == "active" and self._nav:
            try:
                self._nav.cancel_navigation()
                logger.info("[nav] cancel → Meta link")
            except Exception as e:
                logger.warning("[nav] Meta cancel failed: %s", e)

        with self._lock:
            # 递增 generation，让所有正在运行的 poller 线程退出
            self._nav_generation = getattr(self, '_nav_generation', 0) + 1
            self._nav_status = "idle"
            self._nav_feedback = {}
            if self._patrol_active:
                self._patrol_active = False
                self._patrol_status = "idle"
                self._patrol_current_index = -1
                self._patrol_error = ""
        if self._patrol_local_timer:
            self._patrol_local_timer.cancel()
            self._patrol_local_timer = None
        self._delete_patrol_config()
        return {"success": True, "message": "Cancel requested"}

    def send_local_navigation_goal(self, x: float, y: float, theta: float) -> dict:
        """Local navigation — not available via Meta yet."""
        return {"success": False, "message": "Local navigation not available via Meta"}

    # ---- Debug snapshots (ESDF grid, MPC/planner debug) ----

    def get_esdf_snapshot(self, max_dist: float = 2.0) -> dict:
        """Fetch ESDF grid snapshot from meta.astribot_navigation.

        Caches the last successful snapshot. On RPC timeout / service inactive
        we fall back to the cache and mark it ``stale`` so the UI can still
        render the last known distance field instead of blanking out. Cache is
        cleared on cancel_navigation / service shutdown.
        """
        cached = getattr(self, '_last_esdf_snapshot', None)

        def _stale_reply(msg: str) -> dict:
            if cached is not None:
                return {"success": True, "stale": True, "message": msg, "data": cached}
            return {"success": False, "message": msg}

        if self._nav_state != "active" or not self._nav:
            return _stale_reply("Navigation service not active")
        try:
            result = self._nav.get_esdf_snapshot(max_dist=float(max_dist))
            if isinstance(result, dict) and result.get("success") and result.get("data"):
                self._last_esdf_snapshot = result["data"]
                return result
            # Upstream said failure — keep serving cache.
            return _stale_reply(
                (result or {}).get("message", "ESDF not available") if isinstance(result, dict) else "ESDF not available"
            )
        except Exception as e:
            logger.debug("[nav] get_esdf_snapshot failed: %s", e)
            return _stale_reply(str(e))

    def get_occ_snapshot(self) -> dict:
        cached = getattr(self, '_last_occ_snapshot', None)

        def _stale_reply(msg: str) -> dict:
            if cached is not None:
                return {"success": True, "stale": True, "message": msg, "data": cached}
            return {"success": False, "message": msg}

        if self._nav_state != "active" or not self._nav:
            return _stale_reply("Navigation service not active")
        try:
            result = self._nav.get_occ_snapshot()
            if isinstance(result, dict) and result.get("success") and result.get("data"):
                self._last_occ_snapshot = result["data"]
                return result
            return _stale_reply(
                (result or {}).get("message", "Occupancy grid not available") if isinstance(result, dict) else "Occupancy grid not available"
            )
        except Exception as e:
            logger.debug("[nav] get_occ_snapshot failed: %s", e)
            return _stale_reply(str(e))

    def get_nav_debug_snapshot(self) -> dict:
        """Combined MPC + planner debug in a single Meta RPC."""
        if self._nav_state != "active" or not self._nav:
            return {"success": False, "message": "Navigation service not active"}
        try:
            return self._nav.get_debug_snapshot()
        except Exception as e:
            logger.debug("[nav] get_debug_snapshot failed: %s", e)
            return {"success": False, "message": str(e)}
