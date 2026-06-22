"""Single-point navigation — all calls go through Meta navigation service."""
import logging
import math
import threading
import time
from datetime import datetime

from ._utils import log_throttled

logger = logging.getLogger(__name__)


# Per-goal soft-parameter overrides supported by meta.astribot_navigation.
# Field names mirror astribot_nav_msgs/NavigationPlannerConfig.msg (the
# legacy MoveChassisTo server payload) plus an MPC-side ``goal_tolerance``
# knob. Keep this list in sync with
# meta_astribot_navigation/src/core/navigation_driver.OVERRIDE_WHITELIST.
_NAV_OVERRIDE_KEYS = (
    "safe_dist",
    "v_max",
    "w_max",
    "a_max",
    "dw_max",
    "is_holonomic",
    "jps_safe_dis_margin",
    "goal_tolerance",
)
# How long to block on the planner before returning to the caller. The Meta
# side's set_goal+plan latency is normally well under a second on a healthy
# map; 3 s gives slow first-plan headroom without keeping the HTTP request
# pinned forever.
_NAV_PLAN_WAIT_SEC = 3.0

# Grace window after the poller starts during which a "reached" / "failed"
# status is treated as stale residue from the previous goal and discarded.
# The Meta navigation core publishes terminal status only on GOAL_REACHED
# ticks, and racy interactions with the driver's sticky reached/failed state
# can leak the previous segment's terminal status into the next poll cycle.
# For multi-waypoint patrol that manifests as a waypoint being skipped a
# fraction of a second after the next segment starts. The window is anchored
# at poller start (= after navigate_to RPC returns), so 1.5 s comfortably
# covers the observed leakage without delaying a real "reached" by a
# noticeable amount on legitimate segments (next poll tick is at most 0.5 s).
_NAV_REACHED_GRACE_SEC = 1.5

# Distance sanity check on "reached": a genuine arrival requires the robot to
# physically be at the goal. If the driver reports reached while current_pose
# is still farther than this from target_pose, that "reached" is sticky
# residue from the previous goal (the Meta navigation_driver keeps the last
# terminal state until the C++ core pushes a new status, which it only does on
# real state transitions — so between two patrol segments the previous
# segment's reached can persist and be read by the next segment's poller).
# This is the root-cause guard: regardless of timing / cancel races, a reached
# that violates physics is rejected. The threshold is the goal_tolerance
# whitelist max (0.5 m) — a real arrival is always within that (default
# tolerance is 0.01 m), while sticky residue leaves the robot at the previous
# waypoint, typically 0.5–several m away. failed is NOT distance-checked: a
# failed can be a legitimate planner rejection that must propagate.
_NAV_REACHED_MAX_DISTANCE_M = 0.1


def _filter_overrides(config: dict | None) -> dict:
    """Strip the inbound web payload to the override whitelist.

    Honours ``use_default_config``: when truthy (or missing other keys), the
    front-end is asking for YAML defaults — return {} so meta resets to
    planner_config_init_.
    """
    if not isinstance(config, dict):
        return {}
    if config.get("use_default_config"):
        return {}
    return {k: config[k] for k in _NAV_OVERRIDE_KEYS if k in config}


def _ts():
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


class NavigationMixin:
    """Navigation goal, status polling, cancel — via Meta link."""

    def navigate_to(self, x: float, y: float, theta: float,
                    config: dict | None = None, tasks: list | None = None) -> dict:
        if self._nav_state != "active" or not self._nav:
            return {"success": False,
                    "message": f"导航 Meta 未激活（当前状态：{self._nav_state}），请先启动 meta.astribot_navigation"}

        try:
            # 生成唯一 goal_id，用时间戳标识本次导航任务
            goal_id = f"nav_{int(time.time() * 1000)}"
            overrides = _filter_overrides(config)
            result = self._nav.navigate_to(
                x=x, y=y, yaw=theta, goal_id=goal_id,
                overrides=overrides or None,
                wait_plan_timeout=_NAV_PLAN_WAIT_SEC,
            )
            plan_result = (result or {}).get("plan_result") or {}
            with self._lock:
                self._nav_status = "navigating"
                self._nav_feedback = {"plan_result": plan_result} if plan_result else {}
                self._nav_generation = getattr(self, '_nav_generation', 0) + 1
                self._nav_goal_id = goal_id
                self._nav_last_plan_result = plan_result
                my_gen = self._nav_generation
            logger.info(
                "[nav] %s Meta navigate_to(%.3f, %.3f, %.3f) goal_id=%s overrides=%s "
                "plan_success=%s plan_latency_ms=%.1f",
                _ts(), x, y, theta, goal_id, overrides,
                plan_result.get("success"),
                float(plan_result.get("plan_latency_ms") or 0.0),
            )
            self._start_nav_status_poller(my_gen, goal_id)
            return {"success": result.get("status") == "success",
                    "message": result.get("message", ""),
                    "plan_result": plan_result}
        except Exception as e:
            msg = str(e)
            logger.error("[nav] navigate_to failed: %s", e)
            with self._lock:
                self._nav_status = "failed"
                if "unconfigured" in msg or "inactive" in msg or "expected active" in msg:
                    self._nav_fail_reason = "meta_disconnected"
                    return {"success": False,
                            "message": "导航 Meta 未连接或未激活，请检查 meta.astribot_navigation 服务"}
            return {"success": False, "message": msg}

    def get_last_plan_result(self, goal_id: str = "") -> dict:
        """Return the last plan-result snapshot for the requested goal_id (or
        the most recent if goal_id is empty). Falls through to whatever the
        Meta side has cached, with a local-cache fallback when Meta is down.
        """
        cached = getattr(self, "_nav_last_plan_result", None) or {}
        if self._nav_state != "active" or not self._nav:
            if goal_id and cached.get("goal_id") != goal_id:
                return {}
            return cached
        try:
            result = self._nav.get_last_plan_result(goal_id=goal_id)
            if isinstance(result, dict) and result:
                with self._lock:
                    self._nav_last_plan_result = result
                return result
        except Exception as e:
            log_throttled(logger, "nav.plan_result.rpc_fail", 5.0, "warning",
                          "[nav] get_last_plan_result failed: %s", e)
        if goal_id and cached.get("goal_id") != goal_id:
            return {}
        return cached

    def _start_nav_status_poller(self, generation: int, goal_id: str = ""):
        """Poll Meta navigation status until terminal state for the given generation.

        A "stale-reached" guard is enforced for the first
        ``_NAV_REACHED_GRACE_SEC`` seconds **after the poller starts**: terminal
        statuses (reached/failed) seen inside this window are dropped on the
        assumption they are residual state from the previous goal that hasn't
        been overwritten yet by the Meta core. Real terminal status is still
        picked up on subsequent ticks once the segment actually completes.

        The grace timer is anchored at the poller's start (i.e. after the
        synchronous navigate_to RPC returns), not at the navigate_to call site,
        because that RPC blocks for up to ``_NAV_PLAN_WAIT_SEC`` waiting on
        plan_result and would eat the grace window if measured from earlier.
        """
        with self._lock:
            self._nav_polling = True

        # Anchor the stale-reached grace window at poller start (= first poll
        # is no earlier than ~0.5 s from now). See class docstring above.
        poller_start = time.monotonic()

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
                        msg = str(e)
                        # meta 掉线 / 未 active：没必要继续 poll，直接失败给前端报错。
                        if "unconfigured" in msg or "inactive" in msg or "expected active" in msg:
                            logger.warning("[nav] Meta navigation disconnected during poll: %s", e)
                            self._on_nav_completed(False, {
                                "state": "failed",
                                "fail_reason": "meta_disconnected",
                                "message": "导航 Meta 未连接或未激活，请检查 meta.astribot_navigation 服务",
                            })
                            break
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
                        # Stale-status guard: within the grace window after the
                        # poller starts, treat reached/failed as residual status
                        # from the previous goal (Meta core publishes terminal
                        # status only on GOAL_REACHED ticks; sticky state in
                        # navigation_driver can leak the previous segment's
                        # reached into the next poll cycle).
                        elapsed = time.monotonic() - poller_start
                        if elapsed < _NAV_REACHED_GRACE_SEC:
                            log_throttled(logger, f"nav.stale.gen{generation}", 5.0, "info",
                                          "[nav] poller gen=%d DISCARD stale state=%s "
                                          "(elapsed=%.2fs < grace=%.2fs goal_id=%s)",
                                          generation, state, elapsed,
                                          _NAV_REACHED_GRACE_SEC, goal_id)
                            continue

                        # Root-cause guard: a real "reached" requires the robot
                        # to physically be at the goal. A reached reported while
                        # the robot is still far from target is sticky residue
                        # from the previous segment, not a real arrival — drop
                        # it and keep polling until the robot actually arrives
                        # (or a new goal supersedes this generation). Not applied
                        # to "failed": that can be a genuine planner rejection.
                        if state == "reached":
                            cur = status.get("current_pose") or {}
                            tgt = status.get("target_pose") or {}
                            try:
                                dist = math.hypot(
                                    float(tgt.get("x", 0.0)) - float(cur.get("x", 0.0)),
                                    float(tgt.get("y", 0.0)) - float(cur.get("y", 0.0)),
                                )
                            except (TypeError, ValueError):
                                dist = 0.0  # missing pose → don't block, fall through
                            if dist > _NAV_REACHED_MAX_DISTANCE_M:
                                log_throttled(logger, f"nav.farreach.gen{generation}", 2.0, "warning",
                                              "[nav] poller gen=%d DISCARD reached far from target "
                                              "(dist=%.2fm > %.2fm cur=(%.2f,%.2f) tgt=(%.2f,%.2f) goal_id=%s)",
                                              generation, dist, _NAV_REACHED_MAX_DISTANCE_M,
                                              float(cur.get("x", 0.0)), float(cur.get("y", 0.0)),
                                              float(tgt.get("x", 0.0)), float(tgt.get("y", 0.0)), goal_id)
                                continue

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
