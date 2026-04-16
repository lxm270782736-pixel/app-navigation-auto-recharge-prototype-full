"""
Navigation App — Business Logic Layer

All communication goes through Meta services via astribot_link.
Frontend communicates with this layer via FastAPI REST + SSE.

Mixins:
  - MetaBridgeMixin    (meta_bridge.py)  — astribot_link lifecycle
  - LocalizationMixin  (localization.py)  — mapping, localization
  - MapManagerMixin     (map_manager.py)   — map CRUD
  - ChassisMixin        (chassis.py)       — velocity, initial pose, dock
  - NavigationMixin     (navigation.py)    — single-point navigation
  - PatrolMixin         (patrol.py)        — multi-waypoint patrol
  - RoomConfigMixin     (room_config.py)   — room waypoint configuration
  - DetectionMixin      (detection.py)     — VLM visual detection
  - AlertMixin          (alert.py)         — alert management
  - RoomPatrolMixin     (patrol_room.py)   — room patrol orchestration
"""
import threading

from .meta_bridge import MetaBridgeMixin
from .localization import LocalizationMixin
from .map_manager import MapManagerMixin
from .storage import JsonDayStorage
from .chassis import ChassisMixin
from .navigation import NavigationMixin
from .patrol import PatrolMixin
from .room_config import RoomConfigMixin
from .detection import DetectionMixin
from .alert import AlertMixin
from .patrol_room import RoomPatrolMixin
from .custom_steps import CustomStepsMixin


class BusinessLogic(
    MetaBridgeMixin,
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
    def __init__(self) -> None:
        """Initialize BusinessLogic and all Meta service connections.

        Sets up internal state for navigation, patrol, and room patrol,
        then restores any in-progress patrol from disk.
        """
        self._lock = threading.Lock()

        # Shared storage (AlertMixin uses this; initialized here to avoid lazy-init race)
        self._storage = JsonDayStorage()

        # Alert push queue
        self._init_alert_queue()

        # Meta link proxies
        self._init_meta()

        # Processed state
        self._nav_status = "idle"
        self._nav_feedback: dict = {}
        self._current_map_name = ""

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
        self._room_patrol_current_step_index = 0
        self._nav_done_event = threading.Event()
        self._nav_done_success = False

        # Load saved patrol config (if any)
        self._try_resume_patrol()

    # ------ SSE State ------

    def get_state(self) -> dict:
        """Return full application state snapshot for SSE push (every 500 ms).

        Returns:
            dict with keys: meta_connected, loc_state, nav_state, nav_status,
            nav_feedback, current_map_name, pose, patrol, room_patrol.
        """
        # Poll Meta pose if localization is active
        pose = None
        if self._loc_state == "active" and self._loc:
            try:
                pose = self._loc.get_pose()
            except Exception:
                pass

        # pop_pending_alerts 有自己的锁，必须在 self._lock 外调用，避免锁竞争
        new_alerts = self.pop_pending_alerts()

        with self._lock:
            raw = {
                "meta_connected": self.meta_connected,
                "loc_state": self._loc_state,
                "nav_state": self._nav_state,
                "fall_state": self._detection_state,
                "nav_status": self._nav_status,
                "nav_feedback": self._nav_feedback.copy(),
                "current_map_name": self._current_map_name,
                "pose": pose,
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
                    "fall_event": getattr(self, '_fall_event', None),
                    "stuck_event": getattr(self, '_stuck_event', None),
                    "new_alerts": new_alerts,
                },
            }

        return raw

    def acknowledge_fall(self):
        """护工弹窗确认跌倒事件 — 恢复任务，告警标记为处理中（护工需在历史记录里手动处置）"""
        event = self._fall_event
        self._fall_event = None
        # 通知 meta.detection 服务（使用持久连接）
        try:
            self._detection_call("ack_fall")
        except Exception:
            pass
        # 告警状态 new → processing（护工已知晓，但需手动处置后关闭）
        if event:
            alert_id = event.get("alert_id")
            alert_date = event.get("alert_date")
            if alert_id and alert_date:
                try:
                    self.confirm_alert(alert_id, alert_date)
                except Exception:
                    pass
        return {"success": True, "message": "跌倒事件已确认"}

    def acknowledge_stuck(self):
        """护工弹窗确认机器人卡住事件 — 恢复任务，告警标记为处理中"""
        event = self._stuck_event
        self._stuck_event = None
        if event:
            alert_id = event.get("alert_id")
            alert_date = event.get("alert_date")
            if alert_id and alert_date:
                try:
                    self.confirm_alert(alert_id, alert_date)
                except Exception:
                    pass
        return {"success": True, "message": "机器人卡住事件已确认"}
