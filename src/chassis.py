"""Chassis control — velocity, initial pose, dock/undock."""
import math
import time

import roslibpy


class ChassisMixin:
    """Chassis control, velocity publish, and dock methods."""

    # Chassis control type
    def get_chassis_control_type(self) -> dict:
        result = self._call_service(
            "/astribot_chassis/control_type", "astribot_nav_msgs/srv/RawRequest",
            {"request": "get"}
        )
        if "response" in result:
            with self._lock:
                self._chassis_control_type = result["response"]
        return result

    def set_chassis_control_type(self, control_type: str) -> dict:
        result = self._call_service(
            "/astribot_chassis/control_type", "astribot_nav_msgs/srv/RawRequest",
            {"request": control_type}
        )
        if "response" in result:
            with self._lock:
                self._chassis_control_type = result["response"]
        return result

    # Velocity publish
    def send_velocity(self, linear_x: float, angular_z: float) -> dict:
        if not self._ros or not self._connected:
            return {"success": False, "message": "Not connected to ROS"}
        topic = roslibpy.Topic(self._ros, "/planner/navigation_twist", "geometry_msgs/msg/Twist")
        topic.publish(roslibpy.Message({
            "linear": {"x": linear_x, "y": 0.0, "z": 0.0},
            "angular": {"x": 0.0, "y": 0.0, "z": angular_z},
        }))
        return {"success": True, "message": "Velocity sent"}

    # Initial pose
    def set_initial_pose(self, x: float, y: float, theta: float) -> dict:
        if not self._ros or not self._connected:
            return {"success": False, "message": "Not connected to ROS"}
        topic = roslibpy.Topic(
            self._ros, "/initialpose", "geometry_msgs/msg/PoseWithCovarianceStamped"
        )
        topic.publish(roslibpy.Message({
            "header": {
                "stamp": {"sec": int(time.time()), "nanosec": 0},
                "frame_id": "map",
            },
            "pose": {
                "pose": {
                    "position": {"x": x, "y": y, "z": 0},
                    "orientation": {
                        "x": 0, "y": 0,
                        "z": math.sin(theta / 2), "w": math.cos(theta / 2),
                    },
                },
                "covariance": [0.0] * 36,
            },
        }))
        return {"success": True, "message": "Initial pose published"}

    # Dock
    def send_dock_goal(self, force_retry: bool = False) -> dict:
        if not self._ros or not self._connected:
            return {"success": False, "message": "Not connected to ROS"}
        try:
            self._dock_action_client = roslibpy.ActionClient(
                self._ros, "/dock", "astribot_nav_msgs/action/Dock",
            )
            goal = roslibpy.Goal({"force_retry": force_retry})
            self._dock_action_client.send_goal(
                goal,
                resultback=lambda r: print(f"[logic] Dock result: {r}"),
                feedback=lambda f: print(f"[logic] Dock feedback: {f}"),
                errback=lambda e: print(f"[logic] Dock error: {e}"),
            )
            return {"success": True, "message": "Dock goal sent"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def send_undock_goal(self, save_position: bool = True) -> dict:
        if not self._ros or not self._connected:
            return {"success": False, "message": "Not connected to ROS"}
        try:
            self._dock_action_client = roslibpy.ActionClient(
                self._ros, "/undock", "astribot_nav_msgs/action/Undock",
            )
            goal = roslibpy.Goal({"save_position": save_position})
            self._dock_action_client.send_goal(
                goal,
                resultback=lambda r: print(f"[logic] Undock result: {r}"),
                feedback=lambda f: print(f"[logic] Undock feedback: {f}"),
                errback=lambda e: print(f"[logic] Undock error: {e}"),
            )
            return {"success": True, "message": "Undock goal sent"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def cancel_dock(self) -> dict:
        if self._dock_action_client:
            try:
                self._dock_action_client.cancel_goal()
            except Exception:
                pass
        return {"success": True, "message": "Dock cancel requested"}
