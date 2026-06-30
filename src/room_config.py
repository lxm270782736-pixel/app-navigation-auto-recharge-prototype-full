"""Room waypoint configuration — dynamic per-room waypoints with legacy migration."""
import json
import math
import re
import time
from pathlib import Path

from ._logger import logger


_CONFIG_DIR = Path(__file__).parent.parent / "saved_nav_configs"
_CONFIG_FILE = _CONFIG_DIR / "room_patrol_config.json"

_DEFAULT_CONFIG = {
    "start_position": None,
    "rooms": [],
    "retry_limit": 3,
    "detection_types": ["bed", "clutter", "water"],
    "updated_at": None,
}

_LEGACY_FIELDS = ("door_outside", "door_inside", "bed_check")
_LEGACY_LABELS = {"door_outside": "门外", "door_inside": "门内", "bed_check": "床位"}
_WAYPOINT_ID_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*$")


def _migrate_room(room: dict) -> dict:
    """把旧的固定字段 door_outside/door_inside/bed_check 迁移到 waypoints[]。"""
    if "waypoints" in room and isinstance(room["waypoints"], list):
        return room

    waypoints: list[dict] = []
    for legacy_id in _LEGACY_FIELDS:
        pose = room.get(legacy_id)
        name = _LEGACY_LABELS.get(legacy_id, legacy_id)
        waypoints.append({"id": legacy_id, "name": name, "type": legacy_id, "pose": pose, "builtin": False})

    room["waypoints"] = waypoints
    for legacy_id in _LEGACY_FIELDS:
        room.pop(legacy_id, None)
    return room


def _migrate_config(config: dict) -> dict:
    """迁移整份配置：rooms 里每个房间转成动态 waypoints。"""
    for room in config.get("rooms", []):
        _migrate_room(room)
    return config


class RoomConfigMixin:
    """Room waypoint configuration — dynamic per-room waypoints."""

    def get_room_config(self) -> dict:
        """Read room config from disk, migrating legacy format on the fly."""
        try:
            if _CONFIG_FILE.exists():
                with open(_CONFIG_FILE) as f:
                    config = json.load(f)
                return _migrate_config(config)
        except Exception as e:
            logger.error(f"[room_config] Failed to load: {e}")
        return dict(_DEFAULT_CONFIG)

    def save_room_config(self, config: dict) -> dict:
        """Save full room config to disk (atomic write). Always migrate first."""
        try:
            _migrate_config(config)
            config["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            tmp = _CONFIG_FILE.with_suffix(".tmp")
            with open(tmp, "w") as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            tmp.rename(_CONFIG_FILE)
            return {"success": True, "message": "Config saved"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def add_room(self, room_id: str, room_name: str, waypoint_template: list | None = None) -> dict:
        """Add a new room/zone. waypoint_template: optional list of {id, name, type} to auto-create."""
        config = self.get_room_config()
        for r in config.get("rooms", []):
            if r.get("room_id") == room_id:
                return {"success": False, "message": f"区域 {room_id} 已存在"}
        wps = []
        for tpl in (waypoint_template or []):
            wps.append({
                "id": tpl.get("id", ""),
                "name": tpl.get("name", tpl.get("id", "")),
                "type": tpl.get("type", "custom"),
                "pose": None,
                "builtin": False,
            })
        config.setdefault("rooms", []).append({
            "room_id": room_id,
            "room_name": room_name,
            "waypoints": wps,
            "door_type": "L_handle",
            "enabled": True,
        })
        return self.save_room_config(config)

    def delete_room(self, room_id: str) -> dict:
        """Delete a room by ID."""
        config = self.get_room_config()
        rooms = config.get("rooms", [])
        before = len(rooms)
        config["rooms"] = [r for r in rooms if r.get("room_id") != room_id]
        if len(config["rooms"]) == before:
            return {"success": False, "message": f"Room {room_id} not found"}
        return self.save_room_config(config)

    # ---------- Waypoint CRUD ----------

    def add_room_waypoint(self, room_id: str, waypoint_id: str, name: str, wp_type: str = "custom") -> dict:
        """为房间新增一个自定义点位（pose 初始为 None）。"""
        if not _WAYPOINT_ID_PATTERN.match(waypoint_id):
            return {"success": False, "message": "waypoint_id 只能包含字母、数字、下划线，且以字母开头"}
        config = self.get_room_config()
        room = self._find_room(config, room_id)
        if room is None:
            return {"success": False, "message": f"Room {room_id} not found"}
        existing_ids = {wp.get("id") for wp in room.get("waypoints", [])}
        if waypoint_id in existing_ids:
            return {"success": False, "message": f"Waypoint {waypoint_id} already exists"}
        room.setdefault("waypoints", []).append({
            "id": waypoint_id,
            "name": name or waypoint_id,
            "type": wp_type or "custom",
            "pose": None,
            "builtin": False,
        })
        return self.save_room_config(config)

    def delete_room_waypoint(self, room_id: str, waypoint_id: str) -> dict:
        """删除区域的点位。"""
        config = self.get_room_config()
        room = self._find_room(config, room_id)
        if room is None:
            return {"success": False, "message": f"区域 {room_id} 不存在"}
        wps = room.get("waypoints", [])
        target = next((wp for wp in wps if wp.get("id") == waypoint_id), None)
        if target is None:
            return {"success": False, "message": f"点位 {waypoint_id} 不存在"}
        room["waypoints"] = [wp for wp in wps if wp.get("id") != waypoint_id]
        return self.save_room_config(config)

    def rename_room_waypoint(self, room_id: str, waypoint_id: str, name: str) -> dict:
        """重命名点位 name（builtin 允许重命名 name，不改 id）。"""
        if not name:
            return {"success": False, "message": "name 不能为空"}
        config = self.get_room_config()
        room = self._find_room(config, room_id)
        if room is None:
            return {"success": False, "message": f"Room {room_id} not found"}
        target = next((wp for wp in room.get("waypoints", []) if wp.get("id") == waypoint_id), None)
        if target is None:
            return {"success": False, "message": f"Waypoint {waypoint_id} not found"}
        target["name"] = name
        return self.save_room_config(config)

    # ---------- Pose 录制 ----------

    def record_room_waypoint(self, room_id: str, waypoint_type: str) -> dict:
        """把当前机器人 pose 写入指定点位。
        waypoint_type: waypoint id (e.g. 'door_outside', 'window_left') 或 'start_position'
        """
        pose_result = self.get_pose()
        if not pose_result.get("success"):
            return {"success": False, "message": "No robot pose available"}

        try:
            pos = pose_result["position"]
            quat = pose_result.get("quaternion", {})
            qz = quat.get("z", 0)
            qw = quat.get("w", 1)
            qx = quat.get("x", 0)
            qy = quat.get("y", 0)
            theta = math.atan2(
                2.0 * (qw * qz + qx * qy),
                1.0 - 2.0 * (qy ** 2 + qz ** 2),
            )
            pose = {"x": round(pos["x"], 4), "y": round(pos["y"], 4), "theta": round(theta, 4)}
        except (KeyError, TypeError) as e:
            return {"success": False, "message": f"Failed to parse pose: {e}"}

        config = self.get_room_config()

        if waypoint_type == "start_position":
            config["start_position"] = pose
            result = self.save_room_config(config)
            result["pose"] = pose
            return result

        room = self._find_room(config, room_id)
        if room is None:
            return {"success": False, "message": f"Room {room_id} not found"}

        wps = room.setdefault("waypoints", [])
        target = next((wp for wp in wps if wp.get("id") == waypoint_type), None)
        if target is None:
            # 用户在前端传入了不存在的 id（比如忘记先 add_room_waypoint）
            return {"success": False, "message": f"Waypoint '{waypoint_type}' not found in room {room_id}"}
        target["pose"] = pose

        result = self.save_room_config(config)
        result["pose"] = pose
        return result

    # ---------- 内部辅助 ----------

    @staticmethod
    def _find_room(config: dict, room_id: str) -> dict | None:
        for r in config.get("rooms", []):
            if r.get("room_id") == room_id:
                return r
        return None
