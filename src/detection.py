"""Visual detection — delegates entirely to meta.detection service.

No local simulation fallback. If meta.detection is unavailable, returns safe defaults.
"""
import logging

logger = logging.getLogger(__name__)


class DetectionMixin:

    def detect_bed_occupancy(self, room_id: str) -> dict:
        """在床检测 — 调用 meta.detection.detect_bed()。"""
        result = self._detection_call("detect_bed", room_id=room_id)
        if isinstance(result, dict) and "is_abnormal" in result:
            logger.info("[detection] detect_bed room=%s is_abnormal=%s in_bed=%s person_detected=%s confidence=%.2f description=%s",
                        room_id, result.get("is_abnormal"), result.get("in_bed"),
                        result.get("person_detected"), result.get("confidence", 0.0),
                        result.get("description", ""))
            return result
        logger.warning("[detection] detect_bed unavailable for room %s", room_id)
        return {
            "is_abnormal": False,
            "in_bed": True,
            "person_detected": False,
            "confidence": 0.0,
            "description": "检测不可用",
            "photos": [],
            "room_id": room_id,
        }

    def detect_floor_clutter(self, room_id: str) -> dict:
        """杂物检测 — 调用 meta.detection.detect_floor()。"""
        return self._detect_floor_full(room_id).get(
            "clutter", {"is_abnormal": False, "confidence": 0.0, "photo": None, "photo_meta": None}
        )

    def detect_floor_water(self, room_id: str) -> dict:
        """水渍检测 — 调用 meta.detection.detect_floor()。"""
        return self._detect_floor_full(room_id).get(
            "water", {"is_abnormal": False, "confidence": 0.0, "photo": None, "photo_meta": None}
        )

    def _detect_floor_full(self, room_id: str) -> dict:
        """调用 meta.detection.detect_floor()，同一房间同一步骤只调用一次。"""
        cache_key = f"_floor_cache_{room_id}"
        cached = getattr(self, cache_key, None)
        if cached:
            return cached
        result = self._detection_call("detect_floor", room_id=room_id)
        if isinstance(result, dict) and "clutter" in result:
            clutter = result.get("clutter") or {}
            water = result.get("water") or {}
            logger.info("[detection] detect_floor room=%s clutter=is_abnormal:%s,confidence:%.2f water=%s any_abnormal=%s",
                        room_id, clutter.get("is_abnormal"), clutter.get("confidence", 0.0),
                        "is_abnormal:%s,confidence:%.2f" % (water.get("is_abnormal"), water.get("confidence", 0.0)) if water else "N/A",
                        result.get("any_abnormal"))
            setattr(self, cache_key, result)
            return result
        logger.warning("[detection] detect_floor unavailable for room %s", room_id)
        fallback = {
            "clutter": {"is_abnormal": False, "confidence": 0.0, "photo": None, "photo_meta": None},
            "water":   {"is_abnormal": False, "confidence": 0.0, "photo": None, "photo_meta": None},
            "room_id": room_id,
            "any_abnormal": False,
        }
        setattr(self, cache_key, fallback)
        return fallback

    def capture_image(self) -> str | None:
        """拍照，返回 base64。真机替换为摄像头数据。"""
        return None
