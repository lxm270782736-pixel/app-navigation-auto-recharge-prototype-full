"""Single-point navigation — goal sending, callbacks, cancel."""
import json
import math
import threading
import time

import roslibpy

from ._utils import _to_dict


class NavigationMixin:
    """Navigation goal, feedback/result callbacks, cancel."""

    def navigate_to(self, x: float, y: float, theta: float,
                    config: dict | None = None, tasks: list | None = None) -> dict:
        if not self._ros or not self._connected:
            return {"success": False, "message": "Not connected to ROS"}

        with self._lock:
            self._nav_status = "navigating"
            self._nav_feedback = {}

        goal_msg = {
            "target_pose": {
                "header": {"frame_id": "map"},
                "pose": {
                    "position": {"x": x, "y": y, "z": 0},
                    "orientation": {
                        "x": 0, "y": 0,
                        "z": math.sin(theta / 2),
                        "w": math.cos(theta / 2),
                    },
                },
            },
            "use_default_config": config is None,
            "config": config or {
                "safe_dist": 0.35, "v_max": 0.5, "w_max": 1.0,
                "a_max": 1.0, "dw_max": 2.0, "is_holonomic": False,
                "deaccelaration_dist": 0.5, "deaccelaration_ratio": 0.5,
            },
        }
        if tasks:
            goal_msg["tasks"] = json.dumps(tasks)

        try:
            self._nav_action_client = roslibpy.ActionClient(
                self._ros, "/move_chassis_to_server",
                "astribot_nav_msgs/action/MoveChassisTo",
            )
            goal = roslibpy.Goal(goal_msg)
            self._nav_action_client.send_goal(
                goal,
                resultback=self._on_nav_result,
                feedback=self._on_nav_feedback,
                errback=lambda e: self._on_nav_error(str(e)),
            )
            return {"success": True, "message": "Navigation goal sent"}
        except Exception as e:
            with self._lock:
                self._nav_status = "failed"
            return {"success": False, "message": str(e)}

    def _on_nav_feedback(self, feedback):
        with self._lock:
            self._nav_feedback = dict(feedback) if feedback else {}

    def _on_nav_result(self, result):
        result = dict(result) if result else {}
        status = result.get("status")
        if hasattr(status, "value"):
            status = status.value
        success = status == 4  # SUCCEEDED
        values = result.get("values", {})
        if isinstance(values, dict):
            values = _to_dict(values)

        with self._lock:
            patrol_active = self._patrol_active
            patrol_index = self._patrol_current_index

        if patrol_active:
            # Patrol mode: advance to next waypoint
            with self._lock:
                self._nav_status = "succeeded" if success else "failed"
                self._nav_feedback = {"result": values, "goal_status": status}
                if success:
                    self._patrol_completed.append(patrol_index)
                    print(f"[patrol] Waypoint {patrol_index + 1} succeeded")
                else:
                    self._patrol_skipped.append(patrol_index)
                    error = values.get("result_text", "") if isinstance(values, dict) else ""
                    self._patrol_error = f"路径点 {patrol_index + 1} 导航失败: {error}"
                    print(f"[patrol] Waypoint {patrol_index + 1} failed, skipping")
            self._advance_patrol()
        else:
            # Single-point mode
            with self._lock:
                self._nav_status = "succeeded" if success else "failed"
                self._nav_feedback = {"result": values, "goal_status": status}
            def _reset():
                time.sleep(2)
                with self._lock:
                    if self._nav_status in ("succeeded", "failed"):
                        self._nav_status = "idle"
                        self._nav_feedback = {}
            threading.Thread(target=_reset, daemon=True).start()

        # Signal room patrol thread if waiting for nav completion
        if hasattr(self, '_nav_done_event') and getattr(self, '_room_patrol_active', False):
            self._nav_done_success = success
            self._nav_done_event.set()

    def _on_nav_error(self, error_msg):
        print(f"[logic] Navigation action error: {error_msg}")
        with self._lock:
            self._nav_status = "failed"
            self._nav_feedback = {"error": error_msg}
        # Signal room patrol thread
        if hasattr(self, '_nav_done_event') and getattr(self, '_room_patrol_active', False):
            self._nav_done_success = False
            self._nav_done_event.set()

    def cancel_navigation(self) -> dict:
        if self._nav_action_client:
            try:
                self._nav_action_client.cancel_goal()
            except Exception:
                pass
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
        """Publish to /small_range_goal topic."""
        if not self._ros or not self._connected:
            return {"success": False, "message": "Not connected to ROS"}
        topic = roslibpy.Topic(self._ros, "/small_range_goal", "geometry_msgs/msg/PoseStamped")
        topic.publish(roslibpy.Message({
            "header": {
                "stamp": {"sec": int(time.time()), "nanosec": 0},
                "frame_id": "map",
            },
            "pose": {
                "position": {"x": x, "y": y, "z": 0},
                "orientation": {
                    "x": 0, "y": 0,
                    "z": math.sin(theta / 2), "w": math.cos(theta / 2),
                },
            },
        }))
        return {"success": True, "message": "Local navigation goal sent"}
