"""Localization, joystick, and system node control."""


class LocalizationMixin:
    """Localization / mapping / joystick / system-node methods."""

    # Localization
    def start_mapping(self) -> dict:
        return self._call_trigger("/localization/start_mapping")

    def stop_mapping(self) -> dict:
        return self._call_trigger("/localization/stop")

    def start_localization(self) -> dict:
        return self._call_trigger("/localization/start_localization")

    def start_localization_auto(self) -> dict:
        return self._call_trigger("/localization/start_localization_auto")

    def start_obstacle_avoidance(self) -> dict:
        return self._call_trigger("/localization/start_obstacle_avoidance")

    def stop_localization(self) -> dict:
        return self._call_trigger("/localization/stop")

    def shutdown_localization(self) -> dict:
        return self._call_trigger("/localization/shutdown")

    # Joystick
    def start_joystick(self) -> dict:
        return self._call_trigger("/joystick/start")

    def stop_joystick(self) -> dict:
        return self._call_trigger("/joystick/stop")

    # System nodes
    def start_slam_node(self) -> dict:
        return self._call_trigger("/system/start_slam_node")

    def start_navigation_node(self) -> dict:
        return self._call_trigger("/system/start_navigation_node")
