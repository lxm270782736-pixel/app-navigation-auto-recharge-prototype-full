"""
Navigation App — Business Logic Layer

Assembles all feature mixins into a single BusinessLogic class.
The FastAPI layer (main.py) only imports BusinessLogic.

Mixins:
  - LocalizationMixin  (localization.py)  — mapping, localization, joystick, system nodes
  - MapManagerMixin     (map_manager.py)   — map CRUD
  - ChassisMixin        (chassis.py)       — velocity, initial pose, dock
  - NavigationMixin     (navigation.py)    — single-point navigation + callbacks
  - PatrolMixin         (patrol.py)        — multi-waypoint patrol + persistence
  - RoomConfigMixin     (room_config.py)   — room waypoint configuration
  - DetectionMixin      (detection.py)     — VLM visual detection (interface)
  - AlertMixin          (alert.py)         — alert management
  - RoomPatrolMixin     (patrol_room.py)   — room patrol orchestration
"""
import threading
import time

import roslibpy

from ._utils import _to_dict, _load_ros_url
from .localization import LocalizationMixin
from .map_manager import MapManagerMixin
from .chassis import ChassisMixin
from .navigation import NavigationMixin
from .patrol import PatrolMixin
from .room_config import RoomConfigMixin
from .detection import DetectionMixin
from .alert import AlertMixin
from .patrol_room import RoomPatrolMixin
from .custom_steps import CustomStepsMixin


class BusinessLogic(
    LocalizationMixin,
    MapManagerMixin,
    ChassisMixin,
    NavigationMixin,
    PatrolMixin,
    RoomConfigMixin,
    DetectionMixin,
    AlertMixin,
    RoomPatrolMixin,
    CustomStepsMixin,
):
    def __init__(self):
        self._ros_url = _load_ros_url()
        url_parts = self._ros_url.replace("ws://", "").split(":")
        self._ros_host = url_parts[0] if url_parts else "localhost"
        self._ros_port = int(url_parts[1]) if len(url_parts) > 1 else 9090

        self._ros: roslibpy.Ros | None = None
        self._connected = False
        self._lock = threading.Lock()

        # Raw topic messages — keyed by topic name, stores latest message
        self._topic_data: dict[str, dict] = {}

        # Processed state
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

        # Patrol state (multi-waypoint navigation)
        self._patrol_active = False
        self._patrol_waypoints: list[dict] = []
        self._patrol_current_index = -1
        self._patrol_completed: list[int] = []
        self._patrol_skipped: list[int] = []
        self._patrol_status = "idle"
        self._patrol_error = ""
        self._patrol_started_at: float = 0
        self._patrol_local_timer: threading.Timer | None = None

        # Room patrol state (night patrol)
        self._room_patrol_active = False
        self._room_patrol_id = ""
        self._room_patrol_status = "idle"
        self._room_patrol_current_room_idx = -1
        self._room_patrol_current_step = ""
        self._room_patrol_rooms_completed: list[str] = []
        self._room_patrol_rooms_failed: list[str] = []
        self._room_patrol_error = ""
        self._room_patrol_task_name = ""
        self._room_patrol_record: dict = {}
        self._room_patrol_rooms_list: list[dict] = []
        self._room_patrol_current_step_index = -1
        self._nav_done_event = threading.Event()
        self._nav_done_success = False

        # Load saved patrol config (if any) — NOT auto-resumed, frontend decides
        self._try_resume_patrol()

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
            raw = {
                "connected": self._connected,
                "nav_status": self._nav_status,
                "nav_feedback": self._nav_feedback.copy(),
                "current_map_name": self._current_map_name,
                "chassis_control_type": self._chassis_control_type,
                "topics": light_topics,
                "patrol": {
                    "active": self._patrol_active,
                    "status": self._patrol_status,
                    "current_index": self._patrol_current_index,
                    "completed": list(self._patrol_completed),
                    "skipped": list(self._patrol_skipped),
                    "total": len(self._patrol_waypoints),
                    "error": self._patrol_error,
                    "waypoints": list(self._patrol_waypoints),
                },
                "room_patrol": {
                    "active": self._room_patrol_active,
                    "status": self._room_patrol_status,
                    "patrol_id": self._room_patrol_id,
                    "task_name": getattr(self, '_room_patrol_task_name', ''),
                    "current_room": self._room_patrol_rooms_list[self._room_patrol_current_room_idx].get("room_id", "") if 0 <= self._room_patrol_current_room_idx < len(self._room_patrol_rooms_list) else "",
                    "current_step": self._room_patrol_current_step,
                    "current_step_index": self._room_patrol_current_step_index,
                    "rooms_completed": list(self._room_patrol_rooms_completed),
                    "rooms_failed": list(self._room_patrol_rooms_failed),
                    "rooms_total": len(self._room_patrol_rooms_list),
                    "progress": (len(self._room_patrol_rooms_completed) + len(self._room_patrol_rooms_failed)) / max(len(self._room_patrol_rooms_list), 1) if self._room_patrol_rooms_list else 0,
                    "error": self._room_patrol_error,
                    "rooms": [{"room_id": r.get("room_id"), "room_name": r.get("room_name"), "steps": r.get("steps", [])} for r in self._room_patrol_rooms_list],
                },
            }
        # _to_dict conversion outside lock to reduce lock hold time
        return _to_dict(raw)

    def get_topic(self, topic_name: str) -> dict | None:
        """Get latest message for a specific topic (including heavy ones)."""
        with self._lock:
            data = self._topic_data.get(topic_name)
            return _to_dict(data) if data else None

    # ------ ROS Service Helpers ------

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

    # ------ Generic Passthrough ------

    def call_ros_service(self, service_name: str, service_type: str, request: dict) -> dict:
        return self._call_service(service_name, service_type, request)

    def publish_topic(self, topic_name: str, msg_type: str, message: dict) -> dict:
        if not self._ros or not self._connected:
            return {"success": False, "message": "Not connected to ROS"}
        try:
            topic = roslibpy.Topic(self._ros, topic_name, msg_type)
            topic.publish(roslibpy.Message(message))
            return {"success": True, "message": f"Published to {topic_name}"}
        except Exception as e:
            return {"success": False, "message": str(e)}
