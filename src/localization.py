"""Localization control — all calls go through Meta localization service."""


class LocalizationMixin:
    """Localization / mapping methods via Meta link."""

    def start_mapping(self) -> dict:
        return self._loc_call("start_mapping")

    def stop_mapping(self) -> dict:
        return self._loc_call("stop")

    def start_localization(self) -> dict:
        return self._loc_call("start_localization")

    def start_localization_auto(self) -> dict:
        return self._loc_call("start_localization_auto")

    def start_obstacle_avoidance(self) -> dict:
        # Meta 未暴露，返回提示
        return {"success": False, "message": "Obstacle avoidance not available via Meta"}

    def stop_localization(self) -> dict:
        return self._loc_call("stop")

    def shutdown_localization(self) -> dict:
        # Meta 用 deactivate 管理生命周期
        return self.deactivate_meta()

    def get_localization_status(self) -> dict:
        return self._loc_call("get_status")

    def get_pose(self) -> dict:
        return self._loc_call("get_pose")
