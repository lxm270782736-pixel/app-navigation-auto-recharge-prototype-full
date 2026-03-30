"""Map management — all calls go through Meta localization service."""
import logging

logger = logging.getLogger(__name__)


class MapManagerMixin:
    """Map CRUD methods via Meta link."""

    def _loc_call(self, method_name: str, *args, **kwargs) -> dict:
        if self._loc_state != "active" or not self._loc:
            return {"success": False, "message": f"Localization Meta not active (state={self._loc_state})"}
        try:
            result = getattr(self._loc, method_name)(*args, **kwargs)
            if result is None:
                return {"success": False, "message": f"{method_name} returned None"}
            return result
        except Exception as e:
            logger.error("[map] %s failed: %s", method_name, e)
            return {"success": False, "message": str(e)}

    def get_current_map_name(self) -> dict:
        result = self._loc_call("get_current_map")
        if result.get("success"):
            with self._lock:
                self._current_map_name = result.get("map_name", "")
        return result

    def list_maps(self) -> dict:
        return self._loc_call("list_maps")

    def apply_map(self, map_name: str) -> dict:
        # apply_map loads map data — needs a longer timeout than the default 5s
        try:
            from astribot_link import connect
            loc = connect("localization", timeout=60.0)
            result = loc.apply_map(map_name)
            if result is None:
                result = {"success": False, "message": "apply_map returned None"}
        except Exception as e:
            logger.error("[map] apply_map failed: %s", e)
            result = {"success": False, "message": str(e)}
        if result.get("success"):
            with self._lock:
                self._current_map_name = map_name
        return result

    def save_map(self, map_name: str, map_data: dict | None = None) -> dict:
        return self._loc_call("save_map", map_name, map_data)

    def load_map(self, map_name: str) -> dict:
        return self._loc_call("load_map", map_name)

    def delete_map(self, map_name: str) -> dict:
        return self._loc_call("delete_map", map_name)
