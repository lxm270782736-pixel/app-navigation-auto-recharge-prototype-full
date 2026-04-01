"""Alert management — create, query, confirm, close alerts."""
import time
import uuid

from .storage import JsonDayStorage

# Alert message templates (from PRD)
_ALERT_MESSAGES = {
    "bed_absence": "【异常提醒】{room_id} 房间老人离床，请及时查看",
    "floor_clutter": "【环境提醒】{room_id} 房间通道有障碍物，请清理",
    "floor_water": "【环境提醒】{room_id} 房间地面有水渍，请处理",
    "task_failed": "【任务失败】于{room_id}房间执行{step}任务失败",
    "patrol_complete": "【系统通知】巡视完毕，点击可查看巡视结果",
}


class AlertMixin:
    """Alert CRUD with JsonDayStorage backend."""

    def _get_storage(self) -> JsonDayStorage:
        return self._storage

    def create_alert(self, patrol_id: str, room_id: str, alert_type: str,
                     confidence: float = 0.0, photo: str | None = None,
                     extra_message: str | None = None) -> dict:
        """Create a new alert and save to disk."""
        storage = self._get_storage()
        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        date = time.strftime("%Y-%m-%d")
        alert_id = f"alert_{int(time.time())}_{uuid.uuid4().hex[:6]}"

        template = _ALERT_MESSAGES.get(alert_type, "【告警】{room_id} 房间异常")
        message = extra_message or template.format(room_id=room_id, step="")

        alert = {
            "id": alert_id,
            "patrol_id": patrol_id,
            "room_id": room_id,
            "alert_type": alert_type,
            "status": "new",
            "message": message,
            "confidence": confidence,
            "photo": photo,
            "created_at": now,
            "confirmed_at": None,
            "closed_at": None,
        }
        storage.save("alerts", alert_id, alert, date)
        print(f"[alert] Created: {alert_type} for room {room_id}")
        return alert

    def get_alerts(self, status: str | None = None, date: str | None = None,
                   days: int = 7) -> list[dict]:
        """Get alerts, optionally filtered by status and date."""
        storage = self._get_storage()
        if date:
            alerts = storage.list_by_date("alerts", date)
        else:
            alerts = storage.list_recent("alerts", days)

        if status:
            alerts = [a for a in alerts if a.get("status") == status]

        # Sort newest first
        alerts.sort(key=lambda a: a.get("created_at", ""), reverse=True)
        return alerts

    def get_alert(self, alert_id: str, date: str) -> dict | None:
        """Get a single alert by ID and date."""
        return self._get_storage().load("alerts", alert_id, date)

    def confirm_alert(self, alert_id: str, date: str) -> dict:
        """Transition alert: new → processing."""
        storage = self._get_storage()
        alert = storage.load("alerts", alert_id, date)
        if not alert:
            return {"success": False, "message": f"Alert {alert_id} not found"}
        if alert["status"] != "new":
            return {"success": False, "message": f"Alert is {alert['status']}, expected 'new'"}

        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        storage.update("alerts", alert_id, date, {"status": "processing", "confirmed_at": now})
        return {"success": True, "message": "Alert confirmed"}

    def close_alert(self, alert_id: str, date: str) -> dict:
        """Transition alert: processing → closed."""
        storage = self._get_storage()
        alert = storage.load("alerts", alert_id, date)
        if not alert:
            return {"success": False, "message": f"Alert {alert_id} not found"}
        if alert["status"] != "processing":
            return {"success": False, "message": f"Alert is {alert['status']}, expected 'processing'"}

        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        storage.update("alerts", alert_id, date, {"status": "closed", "closed_at": now})
        return {"success": True, "message": "Alert closed"}

    def get_recent_alerts(self, limit: int = 10) -> list[dict]:
        """Get most recent alerts for SSE push."""
        alerts = self.get_alerts(days=1)
        return alerts[:limit]
