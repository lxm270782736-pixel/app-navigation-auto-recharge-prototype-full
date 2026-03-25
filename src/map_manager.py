"""Map management — list, load, save, delete, apply."""


class MapManagerMixin:
    """Map CRUD methods."""

    def get_current_map_name(self) -> dict:
        result = self._call_trigger("/map_manager/get_current_map_name")
        if result.get("success"):
            with self._lock:
                self._current_map_name = result.get("message", "")
        return result

    def list_maps(self) -> dict:
        return self._call_service(
            "/map_manager/list_maps", "localization_msgs/srv/ListMaps", {}
        )

    def apply_map(self, map_name: str) -> dict:
        result = self._call_service(
            "/map_manager/apply_map", "localization_msgs/srv/ApplyMap",
            {"map_name": map_name}
        )
        if result.get("success"):
            with self._lock:
                self._current_map_name = map_name
        return result

    def save_map(self, map_name: str, map_data: dict | None = None) -> dict:
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
        return self._call_service(
            "/map_manager/delete_map", "localization_msgs/srv/DeleteMap",
            {"map_name": map_name}
        )
