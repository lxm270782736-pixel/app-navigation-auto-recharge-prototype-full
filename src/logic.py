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
import time

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
        self._patrol_state_lock = threading.Lock()  # protects _fall_event, _stuck_event, _alert_interrupted, _pause_reason
        self._pause_reason: str | None = None  # None | "manual" | "fall" | "stuck"
        self._pause_event = threading.Event()  # replaces _paused_manually bool
        self._pause_event.set()  # initially not paused (set = unblocked)
        # Step advance mode: "auto" or "manual"
        self._step_advance_mode: str = "auto"
        self._step_advance_event = threading.Event()
        self._step_advance_event.set()
        # Skip current step signal
        self._skip_step_requested = False
        # Jump-to-step target: when set, patrol loop jumps step_idx to this value
        self._step_jump_target: int = -1
        # Whether the last step failed (for manual advance UI)
        self._last_step_failed: bool = False

        # Shared storage (AlertMixin uses this; initialized here to avoid lazy-init race)
        self._storage = JsonDayStorage()

        # Alert push queue
        self._init_alert_queue()

        # Meta link proxies
        self._init_meta()

        # Processed state
        self._nav_status = "idle"
        self._nav_feedback: dict = {}
        self._nav_fail_reason: str | None = None
        self._nav_result_timestamp: float = 0
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

        # Cached pose updated by background poller to avoid blocking SSE
        self._cached_pose: dict | None = None
        self._pose_poller_thread: threading.Thread | None = None
        self._pose_poller_stop = threading.Event()
        self._start_pose_poller()

        # Load saved patrol config (if any)
        self._try_resume_patrol()

    def _start_pose_poller(self):
        """Background thread: poll loc.get_pose() every 500ms, cache result for SSE."""
        if self._pose_poller_thread and self._pose_poller_thread.is_alive():
            return
        self._pose_poller_stop.clear()

        def _poll():
            while not self._pose_poller_stop.is_set():
                if self._loc_state == "active" and self._loc:
                    try:
                        self._cached_pose = self._loc.get_pose()
                    except Exception:
                        pass
                self._pose_poller_stop.wait(timeout=0.5)

        self._pose_poller_thread = threading.Thread(target=_poll, daemon=True, name="pose-poller")
        self._pose_poller_thread.start()

    # ------ SSE State ------

    def get_state(self, seen_alert_ids: set | None = None) -> dict:
        """Return full application state snapshot for SSE push (every 500 ms).

        Returns:
            dict with keys: meta_connected, loc_state, nav_state, nav_status,
            nav_feedback, current_map_name, pose, patrol, room_patrol.
        """
        # Use cached pose from background poller (non-blocking)
        pose = self._cached_pose

        # 每个 SSE 连接维护自己的 seen_ids，避免多连接时 alert 被第一个连接消费掉
        if seen_alert_ids is None:
            seen_alert_ids = set()
        new_alerts = self.get_pending_alerts(seen_alert_ids)
        for a in new_alerts:
            seen_alert_ids.add(a["id"])

        with self._lock:
            # Auto-reset nav status after 2s (timestamp-based, replaces timer thread)
            if self._nav_status in ("succeeded", "failed"):
                ts = getattr(self, '_nav_result_timestamp', 0)
                if ts and (time.time() - ts > 2):
                    self._nav_status = "idle"
                    self._nav_feedback = {}
            raw = {
                "meta_connected": self.meta_connected,
                "loc_state": self._loc_state,
                "nav_state": self._nav_state,
                "fall_state": self._detection_state,
                "nav_status": self._nav_status,
                "nav_fail_reason": getattr(self, '_nav_fail_reason', None),
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
                    "advance_mode": self._step_advance_mode,
                    "awaiting_advance": (
                        self._step_advance_mode == "manual"
                        and self._room_patrol_status == "paused_manual_advance"
                    ),
                },
            }

        return raw

    def acknowledge_fall(self):
        """护工弹窗确认跌倒事件 — 恢复任务，告警标记为处理中（护工需在历史记录里手动处置）"""
        event = self._fall_event
        # 设置 ack 冷却时间，期间 fall_monitor 忽略残留的 is_fall=True
        self._fall_ack_cooldown_until = time.time() + 5.0
        # 先恢复导航 + replay，再清事件 —— 否则 patrol 线程会抢跑
        self._exit_pause()
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
        # 先恢复导航 + replay，再清事件 —— 否则 patrol 线程会抢跑
        self._exit_pause()
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

    def advance_room_patrol_step(self, target_step_index: int = -1) -> dict:
        """手动模式下推进。target_step_index >= 0 时跳转到指定步骤。"""
        if not self._room_patrol_active:
            return {"success": False, "message": "No active patrol"}
        if self._step_advance_mode != "manual":
            return {"success": False, "message": "Not in manual mode"}
        if target_step_index >= 0:
            self._step_jump_target = target_step_index
        self._step_advance_event.set()
        return {"success": True, "message": "Step advanced"}

    def skip_room_patrol_step(self, step_index: int = -1) -> dict:
        """跳过当前正在执行的步骤（自动/手动模式均可）。校验 step_index 防止跳错。"""
        if not self._room_patrol_active:
            return {"success": False, "message": "No active patrol"}
        # 校验序号：如果前端传了序号，必须与当前执行的步骤一致
        current_idx = getattr(self, '_room_patrol_current_step_index', -1)
        if step_index >= 0 and step_index != current_idx:
            return {"success": False, "message": f"Step index mismatch (requested={step_index}, current={current_idx})"}
        self._skip_step_requested = True
        current_step = getattr(self, '_room_patrol_current_step', '')
        # 取消导航让 navigate 步骤立即返回
        if current_step == "navigate":
            try:
                self.cancel_navigation()
                if hasattr(self, '_nav_done_event'):
                    self._nav_done_event.set()
            except Exception:
                pass
        # 停止 replay 让 meta_poll 退出（仅当前步骤是 replay 类型时）
        if current_step.startswith("custom:"):
            defn = self.get_custom_step_definition(current_step.split(":", 1)[1])
            if defn and defn.get("action", {}).get("meta_service") == "meta.sales_replay":
                try:
                    self._call_service("meta.sales_replay", "stop_replay")
                except Exception:
                    pass
        # 如果在手动等待推进，也解除阻塞
        self._step_advance_event.set()
        return {"success": True, "message": "Skip requested"}
