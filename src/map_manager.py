"""Map management — list, load, save, delete, apply.

Prefers Meta link (self._loc) when available, fallback to roslibpy.
"""
import logging

logger = logging.getLogger(__name__)


class MapManagerMixin:
    """Map CRUD methods."""

    def get_current_map_name(self) -> dict:
        result = self._call_trigger("/map_manager/get_current_map_name")
        if result.get("success"):
            with self._lock:
                self._current_map_name = result.get("message", "")
        return result

    def _loc_is_active(self) -> bool:
        return self._loc_state == "active" and self._loc is not None

    def list_maps(self) -> dict:
        if self._loc_is_active():
            try:
                return self._loc.list_maps()
            except Exception as e:
                logger.warning(f"[map] Meta list_maps failed, fallback: {e}")
        return self._call_service(
            "/map_manager/list_maps", "localization_msgs/srv/ListMaps", {}
        )

    def apply_map(self, map_name: str) -> dict:
        if self._loc_is_active():
            try:
                result = self._loc.apply_map(map_name)
                if result.get("success"):
                    with self._lock:
                        self._current_map_name = map_name
                return result
            except Exception as e:
                logger.warning(f"[map] Meta apply_map failed, fallback: {e}")
        result = self._call_service(
            "/map_manager/apply_map", "localization_msgs/srv/ApplyMap",
            {"map_name": map_name}
        )
        if result.get("success"):
            with self._lock:
                self._current_map_name = map_name
        return result

    def save_map(self, map_name: str, map_data: dict | None = None) -> dict:
        if self._loc_is_active():
            try:
                return self._loc.save_map(map_name, map_data)
            except Exception as e:
                logger.warning(f"[map] Meta save_map failed, fallback: {e}")
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
        if self._loc_is_active():
            try:
                return self._loc.delete_map(map_name)
            except Exception as e:
                logger.warning(f"[map] Meta delete_map failed, fallback: {e}")
        return self._call_service(
            "/map_manager/delete_map", "localization_msgs/srv/DeleteMap",
            {"map_name": map_name}
        )
