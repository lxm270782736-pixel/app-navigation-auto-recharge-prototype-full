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
    {"type": "navigate", "target": "door_inside"},
    {"type": "navigate", "target": "door_outside"},
    {"type": "close_door"},
]

_TASK_CONFIG_FILE = Path(__file__).parent.parent / "saved_nav_configs" / "room_task_config.json"
_PRESETS_FILE = Path(__file__).parent.parent / "saved_nav_configs" / "task_presets.json"


class RoomPatrolMixin:
    """Room patrol orchestration — runs inspection steps per room."""

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

        # Run in background thread
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

        # Cancel any pending navigation
        if was_active:
            self.cancel_navigation()
            # Wake up nav wait
            if hasattr(self, '_nav_done_event'):
                self._nav_done_event.set()
            print("[room_patrol] Stopped by user")

        return {"success": True, "message": "Room patrol stopped"}

    def get_room_patrol_status(self) -> dict:
        """Return current room patrol state for SSE."""
        with self._lock:
            rooms = getattr(self, '_room_patrol_rooms_list', [])
            current_idx = self._room_patrol_current_room_idx
            current_room = ""
            if 0 <= current_idx < len(rooms):
                current_room = rooms[current_idx].get("room_id", "")
            return {
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

            for step_idx, step in enumerate(steps):
                with self._lock:
                    if not self._room_patrol_active:
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

                try:
                    if step_type == "navigate":
                        target = step.get("target", "")
                        pose = waypoints.get(target)
                        if pose:
                            success = self._patrol_navigate_and_wait(pose, retry_limit)
                        else:
                            print(f"[room_patrol] Unknown nav target: {target}")
                            success = False
                    elif step_type == "open_door":
                        success = self._mock_open_door(retry_limit)
                    elif step_type == "close_door":
                        success = self._mock_close_door(retry_limit)
                    elif step_type == "detect_bed":
                        detail = self.detect_bed_occupancy(room_id)
                        success = True
                        if detail.get("is_abnormal"):
                            alert = self.create_alert(
                                self._room_patrol_id, room_id, "bed_absence",
                                confidence=detail.get("confidence", 0),
                            )
                            room_result["alerts"].append(alert["id"])
                    elif step_type == "detect_floor":
                        clutter = self.detect_floor_clutter(room_id)
                        water = self.detect_floor_water(room_id)
                        detail = {"clutter": clutter, "water": water}
                        success = True
                        if clutter.get("is_abnormal"):
                            alert = self.create_alert(
                                self._room_patrol_id, room_id, "floor_clutter",
                                confidence=clutter.get("confidence", 0),
                            )
                            room_result["alerts"].append(alert["id"])
                        if water.get("is_abnormal"):
                            alert = self.create_alert(
                                self._room_patrol_id, room_id, "floor_water",
                                confidence=water.get("confidence", 0),
                            )
                            room_result["alerts"].append(alert["id"])
                    elif step_type == "photo":
                        # Placeholder — capture_image returns None for now
                        self.capture_image()
                        success = True
                        detail = {"label": step.get("label", "")}
                    elif step_type == "wait":
                        duration = step.get("duration", 1)
                        time.sleep(duration)
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
                room_result["steps"].append(step_result)
                print(f"[room_patrol] [{room_id}] Step {step_idx + 1}/{len(steps)}: {step_type}({step_target}) → {'OK' if success else 'FAIL'}")

                # Navigate/door failure → skip room
                if not success and step_type in ("navigate", "open_door"):
                    room_success = False
                    skip_room = True
                    room_result["error"] = f"{step_type} failed"
                    print(f"[room_patrol] {step_type} failed, skipping room {room_id}")
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

        # Navigate back to start position
        if start_pos and self._room_patrol_active:
            with self._lock:
                self._room_patrol_current_step = "returning"
            self._patrol_navigate_and_wait(start_pos, retry_limit=1)

        # Finish
        self._finish_room_patrol()

    def _patrol_navigate_and_wait(self, pose: dict, retry_limit: int) -> bool:
        """Navigate to a pose and block until result, with retries."""
        x, y, theta = pose.get("x", 0), pose.get("y", 0), pose.get("theta", 0)

        for attempt in range(retry_limit):
            with self._lock:
                if not self._room_patrol_active:
                    return False

            self._nav_done_event.clear()
            self._nav_done_success = False
            self.navigate_to(x, y, theta)

            # Wait up to 120s for navigation to complete
            self._nav_done_event.wait(timeout=120)

            with self._lock:
                if not self._room_patrol_active:
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

                # meta.sales_replay 使用持久连接，避免 dispatch + poll 过程中断连导致 deactivate
                if meta_service == "meta.sales_replay":
                    # 如果 sales_replay 未 activate，先尝试激活
                    if self._replay_state != "active" and self._replay:
                        logger.info("[replay_custom] sales_replay not active (state=%s), trying to activate...", self._replay_state)
                        self.activate_replay()

                    if self._replay_state != "active" or not self._replay:
                        return {"success": False, "message": f"Sales_replay Meta not active (state={self._replay_state})"}
                    try:
                        # 下发
                        result = getattr(self._replay, meta_method)(**resolved_kwargs)
                        if result is None:
                            return {"success": False, "message": f"{meta_method} returned None"}
                        ok = result.get("success", True) if isinstance(result, dict) else True
                        if not ok:
                            return False, result

                        # 轮询（使用同一连接）
                        if poll:
                            poll_method = poll["method"]
                            done_key    = poll["done_key"]
                            done_value  = poll["done_value"]
                            result_key  = poll.get("result_key", "success")
                            interval    = float(poll.get("interval", 0.5))
                            timeout     = float(poll.get("timeout", 120))
                            deadline    = time.time() + timeout

                            while time.time() < deadline:
                                time.sleep(interval)
                                status = getattr(self._replay, poll_method)()
                                if not isinstance(status, dict):
                                    continue
                                if status.get(done_key) == done_value:
                                    final = status.get(result_key)
                                    ok = bool(final) if final is not None else True
                                    result = status
                                    break
                            else:
                                return False, {"error": f"meta_poll timeout after {timeout}s"}
                    except Exception as e:
                        logger.error("[replay_custom] %s.%s failed: %s", meta_service, meta_method, e)
                        return {"success": False, "message": str(e)}

                    wait = params.get("duration", action.get("duration", 0))
                    if wait and wait > 0:
                        time.sleep(float(wait))
                    return ok, result

                # 其他 meta 服务使用临时连接
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

                    while time.time() < deadline:
                        time.sleep(interval)
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
