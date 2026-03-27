"""Localization, joystick, and system node control.

Methods prefer Meta link (self._loc) when available, fallback to roslibpy.
"""
import logging

logger = logging.getLogger(__name__)


class LocalizationMixin:
    """Localization / mapping / joystick / system-node methods."""

    # Localization — prefer Meta link when active
    def start_mapping(self) -> dict:
        if self._loc_state == "active":
            try:
                return self._loc.start_mapping()
            except Exception as e:
                logger.warning(f"[loc] Meta start_mapping failed, fallback: {e}")
        return self._call_trigger("/localization/start_mapping")

    def stop_mapping(self) -> dict:
        if self._loc_state == "active":
            try:
                return self._loc.stop()
            except Exception as e:
                logger.warning(f"[loc] Meta stop failed, fallback: {e}")
        return self._call_trigger("/localization/stop")

    def start_localization(self) -> dict:
        if self._loc_state == "active":
            try:
                return self._loc.start_localization(auto_relocalize=False)
            except Exception as e:
                logger.warning(f"[loc] Meta start_localization failed, fallback: {e}")
        return self._call_trigger("/localization/start_localization")

    def start_localization_auto(self) -> dict:
        if self._loc_state == "active":
            try:
                return self._loc.relocalize(auto=True)
            except Exception as e:
                logger.warning(f"[loc] Meta relocalize failed, fallback: {e}")
        return self._call_trigger("/localization/start_localization_auto")

    def start_obstacle_avoidance(self) -> dict:
        return self._call_trigger("/localization/start_obstacle_avoidance")

    def stop_localization(self) -> dict:
        if self._loc_state == "active":
            try:
                return self._loc.stop()
            except Exception as e:
                logger.warning(f"[loc] Meta stop failed, fallback: {e}")
        return self._call_trigger("/localization/stop")

    def shutdown_localization(self) -> dict:
        # Meta 用生命周期管理，直接走 roslibpy
        return self._call_trigger("/localization/shutdown")

    # Joystick — Meta 未覆盖
    def start_joystick(self) -> dict:
        return self._call_trigger("/joystick/start")

    def stop_joystick(self) -> dict:
        return self._call_trigger("/joystick/stop")

    # System nodes — Meta 内部管理，保留 roslibpy fallback
    def start_slam_node(self) -> dict:
        return self._call_trigger("/system/start_slam_node")

    def start_navigation_node(self) -> dict:
        return self._call_trigger("/system/start_navigation_node")
