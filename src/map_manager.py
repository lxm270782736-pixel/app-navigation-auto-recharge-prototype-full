"""Map management — all calls go through Meta localization service."""
from ._logger import logger


class MapManagerMixin:
    """Map CRUD methods via Meta link."""

    def get_current_map_name(self) -> dict:
        result = self._loc_call("get_current_map")
        if result.get("success"):
            with self._lock:
                self._current_map_name = result.get("map_name", "")
        return result

    def list_maps(self) -> dict:
        return self._loc_call("list_maps")

    def apply_map(self, map_name: str) -> dict:
        # apply_map reloads map data — needs a longer timeout than the default 5 s
        if not isinstance(map_name, str):
            return {"success": False, "message": f"Invalid map_name type: {type(map_name)}"}

        map_name_clean = map_name.strip()
        if not map_name_clean:
            return {"success": False, "message": "Empty map name"}

        logger.warn(f"[map] apply_map: {map_name_clean!r}")
        result = self._loc_call("apply_map", map_name_clean)
        logger.warn(f"[map] apply_map result: {result}")
        if result.get("success"):
            with self._lock:
                self._current_map_name = map_name_clean
        return result

    def save_map(self, map_name: str, map_data: dict | None = None) -> dict:
        # Frontend sends map_data as a wrapper dict containing the actual OccupancyGrid
        # plus created_at and thumbnail — extract them before forwarding to Meta
        created_at = 0
        thumbnail = ""
        og_data = map_data
        if isinstance(map_data, dict):
            created_at = map_data.get("created_at", 0)
            thumbnail = map_data.get("thumbnail", "")
            og_data = map_data.get("map_data", map_data)
        return self._loc_call("save_map", map_name, og_data, created_at, thumbnail)

    def load_map(self, map_name: str) -> dict:
        result = self._loc_call("load_map", map_name)
        if not result.get("success"):
            return result
        og = result.get("map_data")
        if not isinstance(og, dict):
            logger.error(f"[map] load_map: map_data has unexpected type: {type(og)}")
            return {"success": False, "message": f"map_data has unexpected type: {type(og)}"}
        try:
            info = og["info"]
            origin = info["origin"]
            return {
                "success": True,
                "name": map_name,
                "resolution": float(info["resolution"]),
                "width": int(info["width"]),
                "height": int(info["height"]),
                "origin": {
                    "x": float(origin["position"]["x"]),
                    "y": float(origin["position"]["y"]),
                    "orientation": float(origin["orientation"]["z"]),
                },
                "data": list(og["data"]),
                "zones_json": result.get("zones_json", ""),
            }
        except (KeyError, TypeError) as e:
            logger.error(f"[map] load_map: map_data missing field: {e}")
            return {"success": False, "message": f"Failed to read map_data fields: {e}"}
        except Exception as e:
            logger.error(f"[map] load_map: serialization failed: {e}")
            return {"success": False, "message": f"Failed to serialize map: {e}"}

    def delete_map(self, map_name: str) -> dict:
        return self._loc_call("delete_map", map_name)
