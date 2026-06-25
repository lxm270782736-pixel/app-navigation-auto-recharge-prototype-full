"""Localization control — all calls go through Meta localization service."""


class LocalizationMixin:
    """Localization / mapping methods via Meta link."""

    def start_mapping(self) -> dict:
        return self._loc_call("start_mapping")

    def stop_mapping(self) -> dict:
        return self._loc_call("stop_mapping")

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

    def get_localization_state(self) -> dict:
        """运行时健康度（来自 /localization/state，1Hz）。"""
        return self._loc_call("get_localization_state")

    def get_relocalization_status(self) -> dict:
        """重定位事件状态（来自 /relocalizer/status，事件留存）。"""
        return self._loc_call("get_relocalization_status")

    def get_pose(self) -> dict:
        return self._loc_call("get_pose")

    def set_initial_pose(self, x: float, y: float, theta: float) -> dict:
        return self._loc_call("set_initial_pose", x, y, theta)
