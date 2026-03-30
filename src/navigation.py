"""Single-point navigation — all calls go through Meta navigation service."""
import logging
import threading
import time
from datetime import datetime

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
            result = self._nav.navigate_to(x=x, y=y, yaw=theta)
            with self._lock:
                self._nav_status = "navigating"
                self._nav_feedback = {}
            logger.info("[nav] %s Meta navigate_to(%.3f, %.3f, %.3f): %s", _ts(), x, y, theta, result)
            self._start_nav_status_poller()
            return {"success": result.get("status") == "success",
                    "message": result.get("message", "")}
        except Exception as e:
            logger.error("[nav] navigate_to failed: %s", e)
            with self._lock:
                self._nav_status = "failed"
            return {"success": False, "message": str(e)}

    def _start_nav_status_poller(self):
        """Poll Meta navigation status until terminal state."""
        def _poll():
            while True:
                time.sleep(0.5)
                if not self._nav:
                    break
                with self._lock:
                    if self._nav_status not in ("navigating",):
                        break
                try:
                    status = self._nav.get_navigation_status()
                except Exception as e:
                    logger.warning("[nav] Meta status poll error: %s", e)
                    continue

                state = status.get("state", "idle")
                with self._lock:
                    self._nav_feedback = status

                if state in ("reached", "failed"):
                    success = state == "reached"
                    logger.info("[nav] %s Meta nav result: state=%s", _ts(), state)
                    self._on_nav_completed(success, status)
                    break

        threading.Thread(target=_poll, daemon=True, name="nav-meta-poller").start()

    def _on_nav_completed(self, success: bool, status: dict):
        """Handle navigation result — drive patrol/room-patrol logic."""
        with self._lock:
            patrol_active = self._patrol_active
            patrol_index = self._patrol_current_index

        if patrol_active:
            with self._lock:
                self._nav_status = "succeeded" if success else "failed"
                self._nav_feedback = {"result": status, "goal_status": 4 if success else 3}
                if success:
                    self._patrol_completed.append(patrol_index)
                else:
                    self._patrol_skipped.append(patrol_index)
                    self._patrol_error = f"路径点 {patrol_index + 1} 导航失败"
            self._advance_patrol()
        else:
            with self._lock:
                self._nav_status = "succeeded" if success else "failed"
                self._nav_feedback = {"result": status, "goal_status": 4 if success else 3}

            def _reset():
                time.sleep(2)
                with self._lock:
                    if self._nav_status in ("succeeded", "failed"):
                        self._nav_status = "idle"
                        self._nav_feedback = {}
            threading.Thread(target=_reset, daemon=True).start()

        # Signal room patrol thread
        if hasattr(self, '_nav_done_event') and getattr(self, '_room_patrol_active', False):
            logger.info("[nav] %s Signaling room_patrol: success=%s", _ts(), success)
            self._nav_done_success = success
            self._nav_done_event.set()

    def cancel_navigation(self) -> dict:
        if self._nav_state == "active" and self._nav:
            try:
                self._nav.cancel_navigation()
                logger.info("[nav] cancel → Meta link")
            except Exception as e:
                logger.warning("[nav] Meta cancel failed: %s", e)

        with self._lock:
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
