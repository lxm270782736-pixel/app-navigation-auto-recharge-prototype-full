"""Visual detection — delegates entirely to meta.detection service.

No local simulation fallback. If meta.detection is unavailable, returns safe defaults.
"""
from ._logger import logger


class DetectionMixin:

    def detect_bed_occupancy(self, room_id: str) -> dict:
        """在床检测 — 调用 meta.detection.detect_bed()。"""
        result = self._detection_call("detect_bed", room_id=room_id)
        if isinstance(result, dict) and "is_abnormal" in result:
            logger.info(
                f"[detection] detect_bed room={room_id} "
                f"is_abnormal={result.get('is_abnormal')} "
                f"in_bed={result.get('in_bed')} "
                f"person_detected={result.get('person_detected')} "
                f"confidence={result.get('confidence')} "
                f"description={result.get('description', '')}"
            )
            return result
        logger.warn(f"[detection] detect_bed unavailable for room {room_id}")
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
        return self._detect_floor_full(room_id).get("clutter") or \
            {"is_abnormal": False, "confidence": 0.0, "photo": None, "photo_meta": None}

    def detect_floor_water(self, room_id: str) -> dict:
        """水渍检测 — 调用 meta.detection.detect_floor()。"""
        return self._detect_floor_full(room_id).get("water") or \
            {"is_abnormal": False, "confidence": 0.0, "photo": None, "photo_meta": None}

    def _detect_floor_full(self, room_id: str) -> dict:
        """调用 meta.detection.detect_floor()，每次都重新推理最新帧。"""
        result = self._detection_call("detect_floor", room_id=room_id)
        if isinstance(result, dict) and "clutter" in result:
            clutter = result.get("clutter") or {}
            water = result.get("water") or {}
            water_desc = (
                f"{{is_abnormal:{water.get('is_abnormal')}, confidence:{water.get('confidence')}}}"
                if water else "N/A"
            )
            logger.info(
                f"[detection] detect_floor room={room_id} "
                f"clutter={{is_abnormal:{clutter.get('is_abnormal')}, "
                f"confidence:{clutter.get('confidence')}}} "
                f"water={water_desc} "
                f"any_abnormal={result.get('any_abnormal')}"
            )
            return result
        logger.warn(f"[detection] detect_floor unavailable for room {room_id}")
        return {
            "clutter": {"is_abnormal": False, "confidence": 0.0, "photo": None, "photo_meta": None},
            "water":   {"is_abnormal": False, "confidence": 0.0, "photo": None, "photo_meta": None},
            "room_id": room_id,
            "any_abnormal": False,
        }

    def capture_image(self) -> str | None:
        """拍照，返回 base64。真机替换为摄像头数据。"""
        return None
