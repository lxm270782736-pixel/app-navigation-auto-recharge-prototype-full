"""Chassis control — velocity, initial pose, dock/undock.

These features are not yet available via Meta. Returns not-available errors.
Will be implemented when Meta navigation adds dock/velocity APIs.
"""


class ChassisMixin:
    """Chassis control methods — pending Meta API support."""

    def get_chassis_control_type(self) -> dict:
        return {"success": True, "response": "meta"}

    def set_chassis_control_type(self, control_type: str) -> dict:
        return {"success": True, "response": control_type}

    def send_velocity(self, linear_x: float, angular_z: float) -> dict:
        return {"success": False, "message": "Velocity control not available via Meta"}

    def send_dock_goal(self, force_retry: bool = False) -> dict:
        return {"success": False, "message": "Dock not available via Meta"}

    def send_undock_goal(self, save_position: bool = True) -> dict:
        return {"success": False, "message": "Undock not available via Meta"}

    def cancel_dock(self) -> dict:
        return {"success": True, "message": "No dock action to cancel"}
