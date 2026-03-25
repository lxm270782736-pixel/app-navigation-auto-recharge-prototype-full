"""
Navigation App — Business Logic Layer

Wraps all ROS operations via roslibpy. The FastAPI layer calls methods here,
and get_state() is polled by SSE to push real-time state to the frontend.

SSE pushes raw ROS topic messages so frontend components get the same data
format as direct WebSocket — zero component changes needed.
"""
import enum
import json
import math
import threading
import time
import yaml
from pathlib import Path

import roslibpy


def _to_dict(obj):
    """Recursively convert any roslibpy/non-standard types to JSON-safe primitives."""
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, dict):
        return {str(k): _to_dict(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_dict(i) for i in obj]
    if isinstance(obj, enum.Enum):
        return obj.value
    if isinstance(obj, (type, enum.EnumMeta)):
        return str(obj)
    # roslibpy Message/Goal/Feedback etc — try dict()
    try:
        return _to_dict(dict(obj))
    except (TypeError, ValueError):
        pass
    return str(obj)


def _load_ros_url() -> str:
    """Read ROS Bridge URL from manifest.yaml."""
    manifest = Path(__file__).parent.parent / "manifest.yaml"
    if manifest.exists():
        with open(manifest) as f:
            cfg = yaml.safe_load(f)
        return cfg.get("remote_routes", {}).get("ros_bridge", "ws://localhost:9090")
    return "ws://localhost:9090"


class BusinessLogic:
    def __init__(self):
        self._ros_url = _load_ros_url()
        url_parts = self._ros_url.replace("ws://", "").split(":")
        self._ros_host = url_parts[0] if url_parts else "localhost"
        self._ros_port = int(url_parts[1]) if len(url_parts) > 1 else 9090

        self._ros: roslibpy.Ros | None = None
        self._connected = False
        self._lock = threading.Lock()

        # Raw topic messages — keyed by topic name, stores latest message
        # Frontend subscribeTopic() reads from here
        self._topic_data: dict[str, dict] = {}

        # Processed state for convenience
        self._nav_status = "idle"
        self._nav_feedback: dict = {}
        self._current_map_name = ""
        self._chassis_control_type = "twist"

        # Active action handles
        self._nav_action_client = None
        self._nav_goal = None
        self._dock_action_client = None
        self._dock_goal = None

        self._subscribers: list = []

        # Auto-connect in background
        self._connect_thread = threading.Thread(target=self._connect_loop, daemon=True)
        self._connect_thread.start()

    # ------ Connection ------

    def _connect_loop(self):
        while True:
            if not self._connected:
                try:
                    self._do_connect()
                except Exception as e:
                    print(f"[logic] ROS connect failed: {e}")
            time.sleep(3)

    def _do_connect(self):
        ros = roslibpy.Ros(host=self._ros_host, port=self._ros_port)
        ros.run(timeout=5)
        if ros.is_connected:
            self._on_connected(ros)
        else:
            raise ConnectionError("Failed to connect to ROS")

    def _on_connected(self, ros: roslibpy.Ros):
        with self._lock:
            self._ros = ros
            self._connected = True
        print(f"[logic] Connected to ROS Bridge at {self._ros_url}")
        self._setup_subscriptions()

    def _setup_subscriptions(self):
        """Subscribe to ALL topics the frontend needs."""
        if not self._ros:
            return

        topics = [
            ("/loc_high_freq", "nav_msgs/msg/Odometry"),
            ("/cmd_vel", "geometry_msgs/msg/Twist"),
            ("/map", "nav_msgs/msg/OccupancyGrid"),
            ("/scan", "sensor_msgs/msg/LaserScan"),
            ("/dock_status", "astribot_nav_msgs/msg/DockStatus"),
            ("/slam/status", "std_msgs/msg/Bool"),
            ("/navigation/status", "std_msgs/msg/Bool"),
            ("/localization/mode", "std_msgs/msg/Int32"),
            ("/localization/status", "std_msgs/msg/String"),
            ("/visualizer/mincoPath", "nav_msgs/msg/Path"),
            ("/amcl_pose", "geometry_msgs/msg/PoseWithCovarianceStamped"),
        ]

        for topic_name, msg_type in topics:
            listener = roslibpy.Topic(self._ros, topic_name, msg_type)
            listener.subscribe(lambda msg, t=topic_name: self._on_topic(t, msg))
            self._subscribers.append(listener)

    # Large topics excluded from SSE — fetched via REST instead
    HEAVY_TOPICS = {"/map", "/scan", "/visualizer/mincoPath"}

    def _on_topic(self, topic_name: str, msg: dict):
        with self._lock:
            self._topic_data[topic_name] = msg

    # ------ SSE State ------

    def get_state(self) -> dict:
        """Return state for SSE — excludes heavy topics to keep payload small."""
        with self._lock:
            light_topics = {
                k: v for k, v in self._topic_data.items()
                if k not in self.HEAVY_TOPICS
            }
            return _to_dict({
                "connected": self._connected,
                "nav_status": self._nav_status,
                "nav_feedback": self._nav_feedback.copy(),
                "current_map_name": self._current_map_name,
                "chassis_control_type": self._chassis_control_type,
                "topics": light_topics,
            })

    def get_topic(self, topic_name: str) -> dict | None:
        """Get latest message for a specific topic (including heavy ones)."""
        with self._lock:
            data = self._topic_data.get(topic_name)
            return _to_dict(data) if data else None

    # ------ ROS Service Calls (REST endpoints) ------

    def _call_trigger(self, service_name: str) -> dict:
        if not self._ros or not self._connected:
            return {"success": False, "message": "Not connected to ROS"}
        try:
            svc = roslibpy.Service(self._ros, service_name, "std_srvs/srv/Trigger")
            result = svc.call(roslibpy.ServiceRequest())
            return {"success": result.get("success", False), "message": result.get("message", "")}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def _call_service(self, service_name: str, service_type: str, request: dict) -> dict:
        if not self._ros or not self._connected:
            return {"success": False, "message": "Not connected to ROS"}
        try:
            svc = roslibpy.Service(self._ros, service_name, service_type)
            result = svc.call(roslibpy.ServiceRequest(request))
            return result
        except Exception as e:
            return {"success": False, "message": str(e)}

    # Localization
    def start_mapping(self) -> dict:
        return self._call_trigger("/localization/start_mapping")

    def stop_mapping(self) -> dict:
        return self._call_trigger("/localization/stop")

    def start_localization(self) -> dict:
        return self._call_trigger("/localization/start_localization")

    def start_localization_auto(self) -> dict:
        return self._call_trigger("/localization/start_localization_auto")

    def start_obstacle_avoidance(self) -> dict:
        return self._call_trigger("/localization/start_obstacle_avoidance")

    def stop_localization(self) -> dict:
        return self._call_trigger("/localization/stop")

    def shutdown_localization(self) -> dict:
        return self._call_trigger("/localization/shutdown")

    # Joystick
    def start_joystick(self) -> dict:
        return self._call_trigger("/joystick/start")

    def stop_joystick(self) -> dict:
        return self._call_trigger("/joystick/stop")

    # System nodes
    def start_slam_node(self) -> dict:
        return self._call_trigger("/system/start_slam_node")

    def start_navigation_node(self) -> dict:
        return self._call_trigger("/system/start_navigation_node")

    # Map management
    def get_current_map_name(self) -> dict:
        result = self._call_trigger("/map_manager/get_current_map_name")
        if result.get("success"):
            with self._lock:
                self._current_map_name = result.get("message", "")
        return result

    def list_maps(self) -> dict:
        result = self._call_service(
            "/map_manager/list_maps", "localization_msgs/srv/ListMaps", {}
        )
        return result

    def apply_map(self, map_name: str) -> dict:
        result = self._call_service(
            "/map_manager/apply_map", "localization_msgs/srv/ApplyMap",
            {"map_name": map_name}
        )
        if result.get("success"):
            with self._lock:
                self._current_map_name = map_name
        return result

    def save_map(self, map_name: str, map_data: dict | None = None) -> dict:
        request = {"map_name": map_name}
        if map_data:
            request.update(map_data)
        return self._call_service(
            "/map_manager/save_map", "localization_msgs/srv/SaveMap", request
        )

    def load_map(self, map_name: str) -> dict:
        return self._call_service(
            "/map_manager/load_map", "localization_msgs/srv/LoadMap",
            {"map_name": map_name}
        )

    def delete_map(self, map_name: str) -> dict:
        return self._call_service(
            "/map_manager/delete_map", "localization_msgs/srv/DeleteMap",
            {"map_name": map_name}
        )

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

    # Navigation
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
        # roslibpy 2.0: result has {status: GoalStatus, values: {...}}
        # GoalStatus 4 = SUCCEEDED, 6 = ABORTED, 5 = CANCELED
        status = result.get("status")
        if hasattr(status, "value"):
            status = status.value
        success = status == 4  # SUCCEEDED
        values = result.get("values", {})
        if isinstance(values, dict):
            values = _to_dict(values)
        with self._lock:
            self._nav_status = "succeeded" if success else "failed"
            self._nav_feedback = {"result": values, "goal_status": status}
        # Auto-reset to idle after 2s so SSE stops re-emitting terminal state
        def _reset():
            time.sleep(2)
            with self._lock:
                if self._nav_status in ("succeeded", "failed"):
                    self._nav_status = "idle"
                    self._nav_feedback = {}
        threading.Thread(target=_reset, daemon=True).start()

    def _on_nav_error(self, error_msg):
        print(f"[logic] Navigation action error: {error_msg}")
        with self._lock:
            self._nav_status = "failed"
            self._nav_feedback = {"error": error_msg}

    def cancel_navigation(self) -> dict:
        if self._nav_action_client:
            try:
                self._nav_action_client.cancel_goal()
            except Exception:
                pass
        with self._lock:
            self._nav_status = "idle"
            self._nav_feedback = {}
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

    # Velocity / Pose publish
    def send_velocity(self, linear_x: float, angular_z: float) -> dict:
        if not self._ros or not self._connected:
            return {"success": False, "message": "Not connected to ROS"}
        topic = roslibpy.Topic(self._ros, "/cmd_vel", "geometry_msgs/msg/Twist")
        topic.publish(roslibpy.Message({
            "linear": {"x": linear_x, "y": 0.0, "z": 0.0},
            "angular": {"x": 0.0, "y": 0.0, "z": angular_z},
        }))
        return {"success": True, "message": "Velocity sent"}

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

    # Generic ROS service call (passthrough)
    def call_ros_service(self, service_name: str, service_type: str, request: dict) -> dict:
        return self._call_service(service_name, service_type, request)

    # Generic topic publish (passthrough)
    def publish_topic(self, topic_name: str, msg_type: str, message: dict) -> dict:
        if not self._ros or not self._connected:
            return {"success": False, "message": "Not connected to ROS"}
        try:
            topic = roslibpy.Topic(self._ros, topic_name, msg_type)
            topic.publish(roslibpy.Message(message))
            return {"success": True, "message": f"Published to {topic_name}"}
        except Exception as e:
            return {"success": False, "message": str(e)}
