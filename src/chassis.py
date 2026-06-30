"""Chassis control — velocity, initial pose, dock/undock.

Dock/undock calls go through meta.astribot_dock via the MetaBridge proxy.
"""
from ._logger import logger


class ChassisMixin:
    """Chassis control methods — dock/undock via meta.astribot_dock."""

    def get_chassis_control_type(self) -> dict:
        return {"success": True, "response": "meta"}

    def set_chassis_control_type(self, control_type: str) -> dict:
        return {"success": True, "response": control_type}

    def send_velocity(self, linear_x: float, angular_z: float) -> dict:
        return {"success": False, "message": "Velocity control not available via Meta"}

    def send_dock_goal(self, force_retry: bool = False) -> dict:
        if self._dock_state != "active" or not self._dock:
            return {"success": False,
                    "message": f"Dock Meta 未激活（当前状态：{self._dock_state}）"}
        try:
            result = self._dock.start_dock(dock_id="")
            success = result.get("status") == "success"
            return {"success": success, "message": result.get("message", "")}
        except Exception as e:
            logger.error(f"[dock] start_dock failed: {e}")
            return {"success": False, "message": str(e)}

    def send_undock_goal(self, save_position: bool = True) -> dict:
        if self._dock_state != "active" or not self._dock:
            return {"success": False,
                    "message": f"Dock Meta 未激活（当前状态：{self._dock_state}）"}
        try:
            result = self._dock.start_undock(undock_id="")
            success = result.get("status") == "success"
            return {"success": success, "message": result.get("message", "")}
        except Exception as e:
            logger.error(f"[dock] start_undock failed: {e}")
            return {"success": False, "message": str(e)}

    def cancel_dock(self) -> dict:
        if self._dock_state != "active" or not self._dock:
            return {"success": True, "message": "No dock action to cancel"}
        try:
            result = self._dock.cancel_dock()
            return {"success": True, "message": result.get("message", "Cancelled")}
        except Exception as e:
            logger.error(f"[dock] cancel_dock failed: {e}")
            return {"success": False, "message": str(e)}

    def get_dock_status(self) -> dict:
        """获取 dock 状态，供 SSE 推送给前端。"""
        if self._dock_state != "active" or not self._dock:
            return {"dock_state": "idle", "undock_state": "idle", "is_charging": False}
        try:
            return self._dock.get_dock_status()
        except Exception as e:
            logger.debug(f"[dock] get_dock_status failed: {e}")
            return {"dock_state": "idle", "undock_state": "idle", "is_charging": False}
