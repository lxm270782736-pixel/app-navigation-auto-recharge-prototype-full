"""Alert management — create, query, confirm, close alerts."""
import time
import uuid

from .storage import JsonDayStorage
from ._logger import logger

# Alert message templates (from PRD)
_ALERT_MESSAGES = {
    "bed_absence": "【异常提醒】{room_id} 房间老人离床，请及时查看",
    "floor_clutter": "【环境提醒】{room_id} 房间通道有障碍物，请清理",
    "floor_water": "【环境提醒】{room_id} 房间地面有水渍，请处理",
    "fall_detected": "【紧急告警】{room_id} 检测到老人跌倒，请立即处理！",
    "robot_stuck": "【机器人卡住】{room_id} 房间导航失败，机器人无法移动，请人工处理",
    "task_failed": "【任务失败】于{room_id}房间执行{step}任务失败",
    "patrol_complete": "【系统通知】巡视完毕，点击可查看巡视结果",
}


class AlertMixin:
    """Alert CRUD with JsonDayStorage backend."""

    # 内存队列：存放待推送给前端的新告警（不清空，每个连接自己跟踪已推送的 id）
    _pending_alerts: list

    def _init_alert_queue(self):
        import threading
        self._pending_alerts = []
        self._pending_alerts_lock = threading.Lock()
        # 最多保留最近 N 条，防止内存无限增长
        self._pending_alerts_max = 50

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
        logger.info(f"[alert] created: type={alert_type} room={room_id} id={alert_id} "
                    f"is_abnormal_photo={photo is not None}")

        # 放入待推送队列（加锁保证线程安全）
        if hasattr(self, '_pending_alerts'):
            with self._pending_alerts_lock:
                self._pending_alerts.append(alert)
                # 只保留最近 N 条
                if len(self._pending_alerts) > self._pending_alerts_max:
                    self._pending_alerts = self._pending_alerts[-self._pending_alerts_max:]
                logger.info(f"[alert] queued for SSE push, queue_size={len(self._pending_alerts)}")

        return alert

    def get_pending_alerts(self, seen_ids: set) -> list:
        """返回 seen_ids 中没有的新 alert，不清空队列。每个 SSE 连接维护自己的 seen_ids。"""
        if not hasattr(self, '_pending_alerts'):
            return []
        with self._pending_alerts_lock:
            new = [a for a in self._pending_alerts if a["id"] not in seen_ids]
        if new:
            logger.info(f"[alert] SSE get_pending: returning {len(new)} new alerts")
        return new

    def pop_pending_alerts(self) -> list:
        """取出并清空待推送告警队列（供 SSE get_state 消费）。已废弃，保留兼容。"""
        return self.get_pending_alerts(set())

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
