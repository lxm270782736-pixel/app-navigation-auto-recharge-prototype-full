"""Room waypoint configuration — recording and management."""
import json
import math
import time
from pathlib import Path


_CONFIG_DIR = Path(__file__).parent.parent / "saved_nav_configs"
_CONFIG_FILE = _CONFIG_DIR / "room_patrol_config.json"

_DEFAULT_CONFIG = {
    "start_position": None,
    "rooms": [],
    "retry_limit": 3,
    "detection_types": ["bed", "clutter", "water"],
    "updated_at": None,
}


class RoomConfigMixin:
    """Room waypoint configuration — record, add, delete, save/load."""

    def get_room_config(self) -> dict:
        """Read room config from disk."""
        try:
            if _CONFIG_FILE.exists():
                with open(_CONFIG_FILE) as f:
                    return json.load(f)
        except Exception as e:
            print(f"[room_config] Failed to load: {e}")
        return dict(_DEFAULT_CONFIG)

    def save_room_config(self, config: dict) -> dict:
        """Save full room config to disk (atomic write)."""
        try:
            config["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            tmp = _CONFIG_FILE.with_suffix(".tmp")
            with open(tmp, "w") as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            tmp.rename(_CONFIG_FILE)
            return {"success": True, "message": "Config saved"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def add_room(self, room_id: str, room_name: str) -> dict:
        """Add a new room with empty waypoints."""
        config = self.get_room_config()
        # Check duplicate
        for r in config.get("rooms", []):
            if r.get("room_id") == room_id:
                return {"success": False, "message": f"Room {room_id} already exists"}
        config.setdefault("rooms", []).append({
            "room_id": room_id,
            "room_name": room_name,
            "door_outside": None,
            "door_inside": None,
            "bed_check": None,
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

    def record_room_waypoint(self, room_id: str, waypoint_type: str) -> dict:
        """Record a waypoint by capturing the current robot pose.

        waypoint_type: 'door_outside' | 'door_inside' | 'bed_check' | 'start_position'
        """
        valid_types = ("door_outside", "door_inside", "bed_check", "start_position")
        if waypoint_type not in valid_types:
            return {"success": False, "message": f"Invalid type: {waypoint_type}. Must be one of {valid_types}"}

        # Grab current robot pose from /loc_high_freq topic
        with self._lock:
            odom = self._topic_data.get("/loc_high_freq")

        if not odom:
            return {"success": False, "message": "No robot pose available (no /loc_high_freq data)"}

        try:
            pos = odom["pose"]["pose"]["position"]
            ori = odom["pose"]["pose"]["orientation"]
            theta = math.atan2(
                2.0 * (ori["w"] * ori["z"] + ori["x"] * ori["y"]),
                1.0 - 2.0 * (ori["y"] ** 2 + ori["z"] ** 2),
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

        # Find room
        room = None
        for r in config.get("rooms", []):
            if r.get("room_id") == room_id:
                room = r
                break
        if room is None:
            return {"success": False, "message": f"Room {room_id} not found"}

        room[waypoint_type] = pose
        result = self.save_room_config(config)
        result["pose"] = pose
        return result
