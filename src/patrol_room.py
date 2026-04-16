"""Room patrol orchestration — executes room-by-room inspection sequence."""
import json
import logging
import threading
import time
import uuid
from pathlib import Path

from .storage import JsonDayStorage

logger = logging.getLogger(__name__)


# Default step template for a standard room inspection
DEFAULT_ROOM_STEPS = [
    {"type": "navigate", "target": "door_outside"},
    {"type": "open_door"},
    {"type": "navigate", "target": "door_inside"},
    {"type": "detect_floor"},
    {"type": "photo", "label": "通道"},
    {"type": "navigate", "target": "bed_check"},
    {"type": "detect_bed"},
    {"type": "photo", "label": "床位"},
    {"type": "navigate", "target": "door_inside", "is_exit": True},
    {"type": "navigate", "target": "door_outside", "is_exit": True},
    {"type": "close_door"},
]

_TASK_CONFIG_FILE = Path(__file__).parent.parent / "saved_nav_configs" / "room_task_config.json"
_PRESETS_FILE = Path(__file__).parent.parent / "saved_nav_configs" / "task_presets.json"


class RoomPatrolMixin:
    """Room patrol orchestration — runs inspection steps per room."""

    # ------ Fall detection thread (parallel to patrol) ------

    def _start_fall_monitor(self):
        """Start fall detection monitoring thread."""
        self._fall_event = None
        self._alert_interrupted = False
        self._fall_monitor_enabled = True
        self._fall_stop_event = threading.Event()
        self._fall_thread = threading.Thread(
            target=self._fall_monitor_loop,
            daemon=True,
            name="fall-monitor",
        )
        self._fall_thread.start()
        logger.info("[fall] Monitor thread started")

    def _stop_fall_monitor(self):
        """Stop fall monitoring."""
        self._fall_monitor_enabled = False
        if hasattr(self, '_fall_stop_event'):
            self._fall_stop_event.set()

    def _fall_monitor_loop(self):
        """Background loop: poll meta.detection.get_fall_status() continuously."""
        poll_interval = 2.0
        logger.info("[fall] Monitor loop started, polling every %ss", poll_interval)

        stop_event = getattr(self, '_fall_stop_event', None)

        while getattr(self, '_room_patrol_active', False):
            # 用 Event.wait 替代 sleep，stop 时可立即唤醒
            if stop_event and stop_event.wait(timeout=poll_interval):
                break

            if not getattr(self, '_fall_monitor_enabled', False):
                continue

            # 手动暂停时不响应跌倒检测
            if getattr(self, '_paused_manually', False):
                continue

            try:
                # Call meta.fall_detection.get_fall_status()
                status = self._detection_call("get_fall_status")

                # 如果服务未激活或调用失败，跳过本次轮询
                if not isinstance(status, dict) or status.get("success") is False:
                    continue

                logger.info("[fall] poll: is_fall=%s has_photo=%s", status.get("is_fall"), bool(status.get("photo")))

                # New fall detected
                if status.get("is_fall") and not self._fall_event:
                    # 巡逻已结束则不再触发告警
                    if not getattr(self, '_room_patrol_active', False):
                        break
                    self._fall_event = {
                        "timestamp": time.time(),
                        "location": status.get("location", "unknown"),
                        "confidence": status.get("confidence", 0.0),
                        "photo": status.get("photo"),
                    }
                    logger.info("[fall] DETECTED at %s (confidence=%.2f)",
                                self._fall_event["location"], self._fall_event["confidence"])
                    self._on_fall_event(self._fall_event)

                # Nurse acknowledged, clear event
                if status.get("acknowledged"):
                    logger.info("[fall] Event acknowledged, cleared")
                    self._fall_event = None

            except Exception as e:
                logger.debug("[fall] Monitor poll error: %s", e)

        logger.info("[fall] Monitor thread stopped")

    def _on_fall_event(self, event):
        """Callback when fall event is detected — cancel navigation immediately."""
        alert = self.create_alert(
            getattr(self, '_room_patrol_id', ''),
            event.get('location', 'unknown'),
            "fall_detected",
            confidence=event.get('confidence', 0.0),
            photo=event.get('photo'),
        )
        # 先检查 _fall_event 是否还存在（可能已被 ack 清除）
        if self._fall_event is event:
            self._fall_event["alert_id"] = alert["id"]
            self._fall_event["alert_date"] = alert["created_at"][:10]
        # 标记当前步骤被告警中断（即使 _fall_event 被快速 ack 清除，步骤也能感知到）
        self._alert_interrupted = True
        # 立即取消导航 + 暂停 replay（if playing）
        self._suspend_motion("fall")

    def _pause_replay_if_playing(self, reason: str) -> bool:
        """暂停 replay（如果正在播放），返回是否实际暂停了。"""
        try:
            status = self._meta_call("meta.sales_replay", "get_replay_status")
            if isinstance(status, dict) and status.get("is_playing") and not status.get("is_paused"):
                result = self._meta_call("meta.sales_replay", "pause_replay")
                if isinstance(result, dict) and result.get("success"):
                    # 记住被暂停的 replay_id，恢复时验证
                    self._paused_replay_id = result.get("replay_id", "")
                    logger.info("[replay] Paused by %s (replay_id=%s)", reason, self._paused_replay_id)
                    return True
        except Exception:
            pass
        return False

    def _resume_replay_if_paused_by(self, reason: str):
        """恢复 replay（如果是由指定原因暂停的）。"""
        if getattr(self, '_replay_paused_by', None) != reason:
            return
        try:
            self._meta_call("meta.sales_replay", "resume_replay")
            logger.info("[replay] Resumed after %s", reason)
        except Exception:
            pass
        self._replay_paused_by = None
        self._paused_replay_id = ""

    def _suspend_motion(self, reason: str):
        """暂停导航（记住目标点）+ 暂停 replay（if playing）。"""
        try:
            # 优先用 pause_navigation（记住目标点），fallback 到 cancel
            result = self._meta_call("meta.astribot_navigation", "pause_navigation")
            if not (isinstance(result, dict) and result.get("success")):
                self.cancel_navigation()
                if hasattr(self, '_nav_done_event'):
                    self._nav_done_event.set()
            else:
                if hasattr(self, '_nav_done_event'):
                    self._nav_done_event.set()
        except Exception:
            try:
                self.cancel_navigation()
                if hasattr(self, '_nav_done_event'):
                    self._nav_done_event.set()
            except Exception:
                pass
        if self._pause_replay_if_playing(reason):
            self._replay_paused_by = reason

    def _restore_motion(self, reason: str):
        """恢复导航（重新下发目标点）+ 恢复 replay（if paused by same reason）。"""
        try:
            self._meta_call("meta.astribot_navigation", "resume_navigation")
        except Exception:
            pass
        self._resume_replay_if_paused_by(reason)

    def _handle_fall_blocking(self) -> bool:
        """Handle fall event — block until nurse acknowledges.
        Returns True if the current step should be retried (navigation was cancelled).
        """
        if not self._fall_event:
            return False

        logger.info("[fall] Task paused, waiting for nurse confirmation...")
        with self._lock:
            self._room_patrol_status = "paused_fall"

        while self._fall_event and self._room_patrol_active:
            time.sleep(1)

        logger.info("[fall] Task resumed")
        self._resume_replay_if_paused_by("fall")
        with self._lock:
            if self._room_patrol_active:
                self._room_patrol_status = "running"
        # 导航被取消了，需要重试当前步骤
        return True

    def _check_fall_before_step(self):
        """Check fall event before executing a step. Returns True if should proceed."""
        if self._fall_event:
            self._handle_fall_blocking()
        return self._fall_event is None and self._room_patrol_active

    # ------ Robot stuck handling ------

    def _on_stuck_event(self, room_id: str):
        """Trigger stuck alert when exit navigation fails."""
        stuck = {
            "timestamp": time.time(),
            "room_id": room_id,
        }
        self._stuck_event = stuck
        logger.info("[stuck] Robot stuck in room %s", room_id)
        alert = self.create_alert(
            getattr(self, '_room_patrol_id', ''),
            room_id,
            "robot_stuck",
        )
        # 先检查 _stuck_event 是否还是同一个对象
        if self._stuck_event is stuck:
            self._stuck_event["alert_id"] = alert["id"]
            self._stuck_event["alert_date"] = alert["created_at"][:10]

    def _handle_stuck_blocking(self) -> bool:
        """Block patrol until nurse acknowledges stuck robot.
        Returns True if the current step should be retried.
        """
        if not self._stuck_event:
            return False
        logger.info("[stuck] Task paused, waiting for nurse confirmation...")
        with self._lock:
            self._room_patrol_status = "paused_stuck"
        self._suspend_motion("stuck")
        while self._stuck_event and self._room_patrol_active:
            time.sleep(1)
        logger.info("[stuck] Task resumed")
        self._restore_motion("stuck")
        with self._lock:
            if self._room_patrol_active:
                self._room_patrol_status = "running"
        return True

    def _check_stuck_before_step(self):
        """Check stuck event before executing a step. Returns True if should proceed."""
        if self._stuck_event:
            self._handle_stuck_blocking()
        return self._stuck_event is None and self._room_patrol_active

    # ------ Task config persistence (backward-compatible, delegates to presets) ------

    def get_task_config(self) -> dict:
        """Load default preset as task config (backward-compatible)."""
        presets = self.get_task_presets().get("presets", [])
        default = next((p for p in presets if p.get("is_default")), None)
        if default:
            return {"rooms": default.get("rooms", []), "retry_limit": default.get("retry_limit", 3)}
        return {"rooms": [], "retry_limit": 3}

    def save_task_config(self, config: dict) -> dict:
        """Save to default preset (backward-compatible)."""
        presets_data = self.get_task_presets()
        presets = presets_data.get("presets", [])
        default = next((p for p in presets if p.get("is_default")), None)
        if default:
            default["rooms"] = config.get("rooms", [])
            default["retry_limit"] = config.get("retry_limit", 3)
            default["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        else:
            # No default yet — create one
            presets.append({
                "id": f"preset_{uuid.uuid4().hex[:8]}",
                "name": "默认任务",
                "description": "",
                "is_default": True,
                "rooms": config.get("rooms", []),
                "retry_limit": config.get("retry_limit", 3),
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            })
        presets_data["presets"] = presets
        return self._save_presets_file(presets_data)

    # ------ Task presets ------

    def get_task_presets(self) -> dict:
        """Load all task presets. Migrates from old config if needed."""
        try:
            if _PRESETS_FILE.exists():
                with open(_PRESETS_FILE) as f:
                    return json.load(f)
        except Exception as e:
            print(f"[room_patrol] Failed to load presets: {e}")

        # Migration: old room_task_config.json → first preset
        if _TASK_CONFIG_FILE.exists():
            try:
                with open(_TASK_CONFIG_FILE) as f:
                    old = json.load(f)
                preset = {
                    "id": f"preset_{uuid.uuid4().hex[:8]}",
                    "name": "默认任务",
                    "description": "从旧配置迁移",
                    "is_default": True,
                    "rooms": old.get("rooms", []),
                    "retry_limit": old.get("retry_limit", 3),
                    "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                }
                data = {"presets": [preset], "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
                self._save_presets_file(data)
                print("[room_patrol] Migrated old task config to presets")
                return data
            except Exception as e:
                print(f"[room_patrol] Migration failed: {e}")

        return {"presets": []}

    def get_task_preset(self, preset_id: str) -> dict | None:
        """Get a single preset by id."""
        for p in self.get_task_presets().get("presets", []):
            if p.get("id") == preset_id:
                return p
        return None

    def save_task_preset(self, preset: dict) -> dict:
        """Create or update a preset."""
        preset_id = preset.get("id", "").strip()
        name = preset.get("name", "").strip()
        if not name:
            return {"success": False, "message": "名称不能为空"}

        data = self.get_task_presets()
        presets = data.get("presets", [])

        if not preset_id:
            # New preset
            preset_id = f"preset_{uuid.uuid4().hex[:8]}"
            preset["id"] = preset_id
            preset.setdefault("is_default", len(presets) == 0)
            preset["created_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            preset["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            presets.append(preset)
        else:
            # Update existing
            found = False
            for i, p in enumerate(presets):
                if p.get("id") == preset_id:
                    preset["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                    preset.setdefault("created_at", p.get("created_at"))
                    preset.setdefault("is_default", p.get("is_default", False))
                    presets[i] = preset
                    found = True
                    break
            if not found:
                return {"success": False, "message": f"Preset '{preset_id}' not found"}

        data["presets"] = presets
        result = self._save_presets_file(data)
        result["preset_id"] = preset_id
        return result

    def delete_task_preset(self, preset_id: str) -> dict:
        """Delete a preset."""
        data = self.get_task_presets()
        presets = data.get("presets", [])
        before = len(presets)
        data["presets"] = [p for p in presets if p.get("id") != preset_id]
        if len(data["presets"]) == before:
            return {"success": False, "message": "Preset not found"}
        return self._save_presets_file(data)

    def duplicate_task_preset(self, preset_id: str, new_name: str) -> dict:
        """Duplicate a preset with a new name."""
        import copy
        source = self.get_task_preset(preset_id)
        if not source:
            return {"success": False, "message": "Source preset not found"}
        new_preset = copy.deepcopy(source)
        new_preset["id"] = f"preset_{uuid.uuid4().hex[:8]}"
        new_preset["name"] = new_name
        new_preset["is_default"] = False
        new_preset["created_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        new_preset["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        data = self.get_task_presets()
        data.get("presets", []).append(new_preset)
        result = self._save_presets_file(data)
        result["preset"] = new_preset
        return result

    def set_default_preset(self, preset_id: str) -> dict:
        """Set a preset as the default."""
        data = self.get_task_presets()
        found = False
        for p in data.get("presets", []):
            p["is_default"] = (p.get("id") == preset_id)
            if p["is_default"]:
                found = True
        if not found:
            return {"success": False, "message": "Preset not found"}
        return self._save_presets_file(data)

    def _save_presets_file(self, data: dict) -> dict:
        """Atomic write presets to disk."""
        try:
            data["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            _PRESETS_FILE.parent.mkdir(parents=True, exist_ok=True)
            tmp = _PRESETS_FILE.with_suffix(".tmp")
            with open(tmp, "w") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            tmp.rename(_PRESETS_FILE)
            return {"success": True, "message": "Saved"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    # ------ Patrol control ------

    def start_room_patrol(self, task_config: dict | None = None) -> dict:
        """Start room patrol. Uses saved config if task_config is None."""
        with self._lock:
            if self._room_patrol_active:
                return {"success": False, "message": "Room patrol already active"}

        config = task_config or self.get_task_config()
        rooms = config.get("rooms", [])
        if not rooms:
            return {"success": False, "message": "No rooms configured"}

        # Filter enabled rooms with valid waypoints
        room_config = self.get_room_config()
        room_lookup = {r["room_id"]: r for r in room_config.get("rooms", [])}
        valid_rooms = []
        for room in rooms:
            rid = room.get("room_id")
            rc = room_lookup.get(rid)
            if not rc:
                continue
            if not rc.get("door_outside") or not rc.get("door_inside") or not rc.get("bed_check"):
                continue
            if not room.get("enabled", True):
                continue
            # Merge waypoint coords into task config
            room_with_coords = {**room, "waypoints": {
                "door_outside": rc["door_outside"],
                "door_inside": rc["door_inside"],
                "bed_check": rc["bed_check"],
            }}
            valid_rooms.append(room_with_coords)

        if not valid_rooms:
            return {"success": False, "message": "No valid rooms (check waypoints)"}

        patrol_id = f"patrol_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:4]}"
        retry_limit = config.get("retry_limit", 3)
        task_name = config.get("name", "")

        with self._lock:
            self._room_patrol_active = True
            self._room_patrol_id = patrol_id
            self._paused_manually = False
            self._room_patrol_status = "running"
            self._room_patrol_current_room_idx = 0
            self._room_patrol_current_step = "preparing"
            self._room_patrol_rooms_completed = []
            self._room_patrol_rooms_failed = []
            self._room_patrol_error = ""
            self._room_patrol_task_name = task_name
            self._room_patrol_record = {
                "id": patrol_id,
                "task_name": task_name,
                "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "finished_at": None,
                "status": "running",
                "rooms_total": len(valid_rooms),
                "rooms_completed": 0,
                "rooms_failed": 0,
                "room_results": [],
            }

        print(f"[room_patrol] Starting patrol {patrol_id} with {len(valid_rooms)} rooms")

        # Reset per-patrol state
        self._last_photo = None
        self._stuck_event = None
        self._replay_paused_by = None
        self._paused_replay_id = ""  # 记录 replay 被谁暂停

        # Fall detection always runs throughout the entire patrol
        self._start_fall_monitor()

        # Run patrol in background thread
        t = threading.Thread(
            target=self._run_room_patrol,
            args=(valid_rooms, retry_limit),
            daemon=True,
        )
        t.start()

        return {"success": True, "message": f"Room patrol started: {len(valid_rooms)} rooms"}

    def stop_room_patrol(self) -> dict:
        """Stop the active room patrol."""
        with self._lock:
            was_active = self._room_patrol_active
            self._room_patrol_active = False
            self._room_patrol_status = "stopped"
            self._room_patrol_current_step = ""

        # Cancel fall/stuck monitoring
        self._stop_fall_monitor()
        self._fall_event = None
        self._stuck_event = None

        # Cancel any pending navigation
        if was_active:
            self.cancel_navigation()
            if hasattr(self, '_nav_done_event'):
                self._nav_done_event.set()
            print("[room_patrol] Stopped by user")

        return {"success": True, "message": "Room patrol stopped"}

    def pause_room_patrol(self) -> dict:
        """Pause the active room patrol."""
        with self._lock:
            if not self._room_patrol_active:
                return {"success": False, "message": "No active patrol"}
            if self._room_patrol_status == "paused_manual":
                return {"success": False, "message": "Already paused"}
            self._room_patrol_status = "paused_manual"
            self._paused_manually = True

        # 取消导航 + 暂停 replay，标记步骤中断（恢复后重试）
        self._alert_interrupted = True
        self._suspend_motion("manual")
        logger.info("[room_patrol] Paused by user")
        return {"success": True, "message": "Room patrol paused"}

    def resume_room_patrol(self) -> dict:
        """Resume a manually paused room patrol."""
        with self._lock:
            if not self._room_patrol_active:
                return {"success": False, "message": "No active patrol"}
            if not getattr(self, '_paused_manually', False):
                return {"success": False, "message": "Patrol is not manually paused"}
            self._room_patrol_status = "running"
            self._paused_manually = False

        # 恢复 replay（只有手动暂停的才恢复）
        self._restore_motion("manual")
        logger.info("[room_patrol] Resumed by user")
        return {"success": True, "message": "Room patrol resumed"}

    def get_room_patrol_status(self) -> dict:
        """Return current room patrol state for SSE."""
        with self._lock:
            rooms = getattr(self, '_room_patrol_rooms_list', [])
            current_idx = self._room_patrol_current_room_idx
            current_room = ""
            if 0 <= current_idx < len(rooms):
                current_room = rooms[current_idx].get("room_id", "")
            status = {
                "active": self._room_patrol_active,
                "status": self._room_patrol_status,
                "patrol_id": self._room_patrol_id,
                "task_name": getattr(self, '_room_patrol_task_name', ''),
                "current_room": current_room,
                "current_step": self._room_patrol_current_step,
                "current_step_index": getattr(self, '_room_patrol_current_step_index', -1),
                "rooms_completed": list(self._room_patrol_rooms_completed),
                "rooms_failed": list(self._room_patrol_rooms_failed),
                "rooms_total": len(rooms),
                "progress": (len(self._room_patrol_rooms_completed) + len(self._room_patrol_rooms_failed)) / max(len(rooms), 1),
                "error": self._room_patrol_error,
                "rooms": [{"room_id": r.get("room_id"), "room_name": r.get("room_name"), "steps": r.get("steps", [])} for r in rooms],
            }
            # Add fall detection status
            status["fall_event"] = getattr(self, '_fall_event', None)
            return status

    # ------ Patrol execution (background thread) ------

    def _run_room_patrol(self, rooms: list[dict], retry_limit: int):
        """Main patrol loop — runs in background thread."""
        with self._lock:
            self._room_patrol_rooms_list = rooms

        start_pos = self.get_room_config().get("start_position")

        for idx, room in enumerate(rooms):
            with self._lock:
                if not self._room_patrol_active:
                    break
                self._room_patrol_current_room_idx = idx

            room_id = room.get("room_id", "?")
            room_name = room.get("room_name", room_id)
            steps = room.get("steps", DEFAULT_ROOM_STEPS)
            waypoints = room.get("waypoints", {})

            print(f"[room_patrol] === Room {idx + 1}/{len(rooms)}: {room_name} ===")

            room_result = {
                "room_id": room_id,
                "room_name": room_name,
                "status": "running",
                "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "finished_at": None,
                "steps": [],
                "alerts": [],
                "error": None,
            }

            room_success = True
            skip_room = False
            self._last_photo = None  # reset per-room photo
            # 清除地面检测缓存，确保每次进入房间重新调用 meta 服务
            cache_key = f"_floor_cache_{room_id}"
            if hasattr(self, cache_key):
                delattr(self, cache_key)

            step_idx = 0
            while step_idx < len(steps):
                step = steps[step_idx]
                with self._lock:
                    if not self._room_patrol_active:
                        skip_room = True
                        break

                # 手动暂停：等待恢复
                while getattr(self, '_paused_manually', False) and self._room_patrol_active:
                    time.sleep(0.5)

                # Check fall/stuck event before executing step
                if not self._check_fall_before_step() or not self._check_stuck_before_step():
                    skip_room = True
                    break

                step_type = step.get("type", "")
                step_target = step.get("target", step.get("label", ""))
                step_result = {"step": step_type, "target": step_target, "status": "running", "started_at": time.strftime("%Y-%m-%dT%H:%M:%S")}

                with self._lock:
                    self._room_patrol_current_step = step_type
                    self._room_patrol_current_step_index = step_idx

                print(f"[room_patrol] [{room_id}] Step {step_idx + 1}/{len(steps)}: {step_type}({step_target}) → START")

                success = False
                detail = None
                self._alert_interrupted = False  # 每步开始前重置

                try:
                    if step_type == "navigate":
                        target = step.get("target", "")
                        # 特殊 target: start_position → 从 room config 取起点
                        if target == "start_position":
                            pose = self.get_room_config().get("start_position")
                        else:
                            pose = waypoints.get(target)
                        if pose:
                            success = self._patrol_navigate_and_wait(pose, retry_limit)
                            if not success and getattr(self, '_alert_interrupted', False):
                                pass
                        else:
                            print(f"[room_patrol] Unknown nav target: '{target}' (available: {list(waypoints.keys()) + ['start_position']})")
                            success = False
                    elif step_type == "open_door":
                        success = self._mock_open_door(retry_limit)
                    elif step_type == "close_door":
                        success = self._mock_close_door(retry_limit)
                    elif step_type == "detect_bed":
                        detail = self.detect_bed_occupancy(room_id)
                        success = True
                        bed_photo = detail.get("photos", [{}])[0].get("photo") if detail.get("photos") else None
                        if not detail.get("in_bed", True):
                            alert = self.create_alert(
                                self._room_patrol_id, room_id, "bed_absence",
                                confidence=detail.get("confidence", 0),
                                photo=bed_photo,
                            )
                            room_result["alerts"].append(alert["id"])
                    elif step_type == "detect_floor":
                        floor = self._detect_floor_full(room_id)
                        clutter = floor.get("clutter") or {}
                        water = floor.get("water") or {}
                        detail = {"clutter": clutter, "water": water}
                        success = True
                        if clutter.get("is_abnormal"):
                            alert = self.create_alert(
                                self._room_patrol_id, room_id, "floor_clutter",
                                confidence=clutter.get("confidence", 0),
                                photo=clutter.get("photo"),
                            )
                            room_result["alerts"].append(alert["id"])
                        if water and water.get("is_abnormal"):
                            alert = self.create_alert(
                                self._room_patrol_id, room_id, "floor_water",
                                confidence=water.get("confidence", 0),
                                photo=water.get("photo"),
                            )
                            room_result["alerts"].append(alert["id"])
                    elif step_type == "photo":
                        photo_b64 = self.capture_image()
                        self._last_photo = photo_b64
                        success = True
                        detail = {"label": step.get("label", ""), "has_photo": photo_b64 is not None}
                    elif step_type == "wait":
                        duration_ms = float(step.get("duration", 1000))
                        deadline = time.time() + duration_ms / 1000.0
                        while time.time() < deadline:
                            if not self._room_patrol_active:
                                break
                            if getattr(self, '_fall_event', None) or getattr(self, '_stuck_event', None):
                                break
                            time.sleep(0.2)
                        success = True
                    elif step_type.startswith("custom:"):
                        custom_id = step_type.split(":", 1)[1]
                        success, detail = self._execute_custom_step(custom_id, step.get("params", {}))
                    else:
                        print(f"[room_patrol] Unknown step type: {step_type}")
                        success = True  # Skip unknown steps
                except Exception as e:
                    print(f"[room_patrol] Step {step_type} error: {e}")
                    success = False

                step_result["status"] = "success" if success else "failed"
                step_result["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                if detail:
                    step_result["detail"] = detail

                logger.info("[room_patrol] step=%s success=%s alert_interrupted=%s fall_event=%s",
                            step_type, success, getattr(self, '_alert_interrupted', False), bool(getattr(self, '_fall_event', None)))

                # 步骤被告警中断
                if getattr(self, '_alert_interrupted', False):
                    if success:
                        # 步骤已完成，等待护工确认后继续下一步
                        logger.info("[room_patrol] Step %s completed before alert ack, waiting then continuing", step_type)
                        self._handle_fall_blocking()
                        self._handle_stuck_blocking()
                        if not self._room_patrol_active:
                            break
                        # 不重试，继续下一步
                    else:
                        # 步骤被中断未完成，等待护工确认后重试
                        logger.info("[room_patrol] Step %s interrupted by alert, retrying after ack", step_type)
                        self._handle_fall_blocking()
                        self._handle_stuck_blocking()
                        if not self._room_patrol_active:
                            break
                        logger.info("[room_patrol] Retrying step %s", step_type)
                        continue

                room_result["steps"].append(step_result)
                print(f"[room_patrol] [{room_id}] Step {step_idx + 1}/{len(steps)}: {step_type}({step_target}) → {'OK' if success else 'FAIL'}")
                step_idx += 1

                # Navigate/door failure → skip room (exit nav → stuck alert + wait)
                if not success and step_type in ("navigate", "open_door"):
                    # 短暂等待，让 fall monitor 有时间设置 _alert_interrupted
                    if not getattr(self, '_alert_interrupted', False):
                        time.sleep(0.3)
                    # 如果是告警中断导致的失败，不跳过房间（重试逻辑在上面已处理）
                    if getattr(self, '_alert_interrupted', False):
                        pass  # 已由 _alert_interrupted 分支处理
                    elif step_type == "navigate" and step.get("is_exit", False):
                        self._on_stuck_event(room_id)
                        self._handle_stuck_blocking()
                        room_result["error"] = "exit navigate failed (robot stuck)"
                        room_success = False
                        skip_room = True
                        break
                    else:
                        room_result["error"] = f"{step_type} failed"
                        print(f"[room_patrol] {step_type} failed, skipping room {room_id}")
                        room_success = False
                        skip_room = True
                        break
                # Close door failure → log but continue to next room
                if not success and step_type == "close_door":
                    room_result["error"] = "close_door failed"

            room_result["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            room_result["status"] = "success" if (room_success and not skip_room) else "failed"

            with self._lock:
                if room_success and not skip_room:
                    self._room_patrol_rooms_completed.append(room_id)
                else:
                    self._room_patrol_rooms_failed.append(room_id)
                self._room_patrol_record["room_results"].append(room_result)

            # Brief pause between rooms
            time.sleep(1)

        # Navigate back to start position (now handled as a step type)
        # Finish
        self._finish_room_patrol()

    def _patrol_navigate_and_wait(self, pose: dict, retry_limit: int) -> bool:
        """Navigate to a pose and block until result, with retries."""
        x, y, theta = pose.get("x", 0), pose.get("y", 0), pose.get("theta", 0)

        for attempt in range(retry_limit):
            with self._lock:
                if not self._room_patrol_active:
                    return False

            # 手动暂停时等待恢复后再下发导航
            while getattr(self, '_paused_manually', False) and self._room_patrol_active:
                time.sleep(0.5)

            if not self._room_patrol_active:
                return False

            # 用序列号区分不同导航请求，防止旧回调污染新导航
            nav_seq = getattr(self, '_nav_seq', 0) + 1
            self._nav_seq = nav_seq
            self._nav_done_event.clear()
            self._nav_done_success = False
            self._nav_done_seq = nav_seq  # 期望的序列号
            self.navigate_to(x, y, theta)

            # Wait up to 120s for navigation to complete
            self._nav_done_event.wait(timeout=120)

            with self._lock:
                if not self._room_patrol_active:
                    return False

            # 验证序列号，防止旧回调的结果被误用
            if getattr(self, '_nav_result_seq', 0) != nav_seq:
                logger.warning("[nav] Stale nav result (expected seq=%d), treating as failed", nav_seq)
                # 等待让 fall monitor 有时间设置 _alert_interrupted
                time.sleep(0.3)
                # stale 结果通常是告警取消导致的，直接返回 False 让上层处理
                return False

            if self._nav_done_success:
                print("nav success")
                return True

            print(f"[room_patrol] Nav attempt {attempt + 1}/{retry_limit} failed, retrying...")
            time.sleep(1)

        return False

    def _mock_open_door(self, retry_limit: int) -> bool:
        """Mock door opening — sleep to simulate."""
        for attempt in range(retry_limit):
            with self._lock:
                if not self._room_patrol_active:
                    return False
            print(f"[room_patrol] Opening door (attempt {attempt + 1})...")
            time.sleep(3)
            # Always succeed in mock mode
            return True
        return False

    def _mock_close_door(self, retry_limit: int) -> bool:
        """Mock door closing."""
        for attempt in range(retry_limit):
            with self._lock:
                if not self._room_patrol_active:
                    return False
            print(f"[room_patrol] Closing door (attempt {attempt + 1})...")
            time.sleep(2)
            return True
        return False

    def _finish_room_patrol(self):
        """Finalize patrol — save record, reset state."""
        with self._lock:
            record = self._room_patrol_record
            record["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            record["rooms_completed"] = len(self._room_patrol_rooms_completed)
            record["rooms_failed"] = len(self._room_patrol_rooms_failed)
            record["status"] = "completed" if self._room_patrol_active else "stopped"

            patrol_id = self._room_patrol_id
            self._room_patrol_active = False
            self._room_patrol_status = record["status"]
            self._room_patrol_current_step = ""

        # 先停止 fall monitor，防止在清除 _fall_event 后再次触发告警
        self._stop_fall_monitor()

        # 清除残留的告警事件，避免任务结束后弹窗继续显示
        self._fall_event = None
        self._stuck_event = None
        self._replay_paused_by = None

        # Save record to disk
        storage = self._get_storage()
        date = time.strftime("%Y-%m-%d")
        storage.save("records", patrol_id, record, date)
        print(f"[room_patrol] Patrol {patrol_id} finished: "
              f"{record['rooms_completed']} completed, {record['rooms_failed']} failed")

    # ------ History ------

    def get_patrol_records(self, days: int = 7) -> list[dict]:
        """List recent patrol records."""
        storage = self._get_storage()
        records = storage.list_recent("records", days)
        records.sort(key=lambda r: r.get("started_at", ""), reverse=True)
        return records

    def get_patrol_record(self, record_id: str, date: str) -> dict | None:
        """Get a single patrol record."""
        return self._get_storage().load("records", record_id, date)

    def delete_patrol_records(self, records: list[dict]) -> dict:
        """Delete patrol records by id+date. records: [{"id": str, "date": str}, ...]"""
        storage = self._get_storage()
        deleted, failed = 0, 0
        for r in records:
            ok = storage.delete("records", r["id"], r["date"])
            if ok:
                deleted += 1
            else:
                failed += 1
        return {"success": True, "deleted": deleted, "failed": failed}

    # ------ Custom step execution ------

    def _execute_custom_step(self, step_id: str, params: dict) -> tuple[bool, dict | None]:
        """Execute a user-defined custom step."""
        definition = self.get_custom_step_definition(step_id)
        if not definition:
            print(f"[room_patrol] Custom step '{step_id}' not found")
            return False, {"error": f"Custom step '{step_id}' not found"}

        action = definition.get("action", {})
        action_type = action.get("type", "")
        print(f"[room_patrol] Custom step '{step_id}' action={action_type}")

        try:
            if action_type == "service":
                resolved = self._resolve_params(action.get("request", {}), params)
                result = self._call_service(action["service_name"], action["service_type"], resolved)
                ok = result.get("success", True) if isinstance(result, dict) else True
                # Optional post-call wait
                wait = params.get("duration", action.get("duration", 0))
                if wait and wait > 0:
                    time.sleep(float(wait))
                return ok, result

            elif action_type == "topic":
                resolved = self._resolve_params(action.get("message", {}), params)
                result = self.publish_topic(action["topic_name"], action["msg_type"], resolved)
                wait = params.get("duration", action.get("duration", 0))
                if wait and wait > 0:
                    time.sleep(float(wait))
                return True, result

            elif action_type == "wait":
                duration = params.get("duration", action.get("duration", 1))
                time.sleep(float(duration))
                return True, {"duration": duration}

            elif action_type == "meta":
                meta_service = action.get("meta_service", "")
                meta_method = action.get("meta_method", "")
                raw_kwargs = action.get("meta_kwargs", {})
                resolved_kwargs = self._resolve_params(raw_kwargs, params)
                poll = action.get("meta_poll")
                # 支持在配置中指定连接超时（秒），默认 30 秒
                connect_timeout = float(action.get("connect_timeout", 30.0))

                # fall_detection 使用持久连接，其他服务使用 _meta_call
                if meta_service == "detection":
                    result = self._detection_call(meta_method, **resolved_kwargs)
                else:
                    result = self._meta_call(meta_service, meta_method, **resolved_kwargs)
                ok = result.get("success", True) if isinstance(result, dict) else True
                if not ok:
                    return False, result

                if poll:
                    poll_method = poll["method"]
                    done_key    = poll["done_key"]
                    done_value  = poll["done_value"]
                    result_key  = poll.get("result_key", "success")
                    interval    = float(poll.get("interval", 0.5))
                    timeout     = float(poll.get("timeout", 120))
                    deadline    = time.time() + timeout
                    poll_kwargs = poll.get("kwargs", {})  # 轮询方法可能需要的参数
                    # 轮询也使用相同的超时配置
                    poll_connect_timeout = float(poll.get("connect_timeout", connect_timeout))

                    while time.time() < deadline:
                        # 检查巡逻是否被停止
                        if not getattr(self, '_room_patrol_active', False):
                            return False, {"error": "patrol stopped"}
                        # 有告警事件时暂停轮询，等待护工确认后继续
                        if getattr(self, '_fall_event', None) or getattr(self, '_stuck_event', None):
                            # 等待告警被确认（_fall_event/_stuck_event 被清除）
                            while (getattr(self, '_fall_event', None) or getattr(self, '_stuck_event', None)) and getattr(self, '_room_patrol_active', False):
                                time.sleep(0.5)
                            if not getattr(self, '_room_patrol_active', False):
                                return False, {"error": "patrol stopped"}
                            # 告警已确认，继续轮询（不重试步骤）
                            logger.info("[meta_poll] Alert acknowledged, resuming poll for %s.%s", meta_service, poll_method)
                            deadline = time.time() + timeout  # 重置超时
                        time.sleep(interval)
                        # fall_detection 使用持久连接
                        if meta_service == "detection":
                            status = self._detection_call(poll_method, **poll_kwargs)
                        else:
                            status = self._meta_call(meta_service, poll_method, **poll_kwargs)
                        if not isinstance(status, dict):
                            continue
                        if status.get(done_key) == done_value:
                            final = status.get(result_key)
                            ok = bool(final) if final is not None else True
                            result = status
                            break
                    else:
                        return False, {"error": f"meta_poll timeout after {timeout}s"}

                wait = params.get("duration", action.get("duration", 0))
                if wait and wait > 0:
                    time.sleep(float(wait))
                return ok, result

            else:
                return False, {"error": f"Unknown action type: {action_type}"}

        except Exception as e:
            print(f"[room_patrol] Custom step '{step_id}' error: {e}")
            return False, {"error": str(e)}

    @staticmethod
    def _resolve_params(template: dict, params: dict) -> dict:
        """Recursively replace {{key}} placeholders in template with param values."""
        import copy

        def _walk(obj):
            if isinstance(obj, dict):
                return {k: _walk(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [_walk(v) for v in obj]
            elif isinstance(obj, str) and "{{" in obj:
                for key, val in params.items():
                    placeholder = "{{" + key + "}}"
                    if obj == placeholder:
                        return val  # Whole-value replacement preserves type
                    obj = obj.replace(placeholder, str(val))
                return obj
            return obj

        return _walk(copy.deepcopy(template))
