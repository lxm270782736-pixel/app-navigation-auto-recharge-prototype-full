"""Visual detection — calls meta.detection service for bed/floor checks.

Falls back to local simulation when meta service is unavailable.
"""
import base64
import random
import time

_PLACEHOLDER_PNG = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01'
    b'\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00'
    b'\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18'
    b'\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
)
_PLACEHOLDER_B64 = base64.b64encode(_PLACEHOLDER_PNG).decode('ascii')

_BED_ABSENCE_PROB = 0.1
_CLUTTER_PROB = 0.1
_WATER_PROB = 0.1


def _photo(room_id: str, detection_type: str) -> dict:
    return {
        "photo": _PLACEHOLDER_B64,
        "meta": {
            "room_id": room_id,
            "detection_type": detection_type,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "unix_ts": time.time(),
        },
    }


class DetectionMixin:

    def detect_bed_occupancy(self, room_id: str) -> dict:
        """
        在床检测 — 优先调用 meta.detection.detect_bed()，不可用时本地模拟。
        正常（在床）：1 张照片；异常（不在床）：2 张照片。
        """
        try:
            result = self._detection_call("detect_bed", room_id=room_id)
            if isinstance(result, dict) and "is_abnormal" in result:
                return result
        except Exception:
            pass
        # 本地模拟 fallback
        import logging
        logging.getLogger(__name__).debug("[detection] meta.detection unavailable, using local simulation for detect_bed")
        in_bed = random.random() > _BED_ABSENCE_PROB
        is_abnormal = not in_bed
        photos = [_photo(room_id, "bed_check")]
        if is_abnormal:
            photos.append(_photo(room_id, "bed_absence_area"))
        return {
            "is_abnormal": is_abnormal,
            "in_bed": in_bed,
            "confidence": random.uniform(0.85, 0.98),
            "description": "老人不在床" if is_abnormal else "老人在床",
            "photos": photos,
            "room_id": room_id,
        }

    def detect_floor_clutter(self, room_id: str) -> dict:
        """杂物检测 — 优先调用 meta.detection.detect_floor()，不可用时本地模拟。"""
        return self._detect_floor_full(room_id).get(
            "clutter", {"is_abnormal": False, "confidence": 0.9, "photo": None, "photo_meta": None}
        )

    def detect_floor_water(self, room_id: str) -> dict:
        """水渍检测 — 优先调用 meta.detection.detect_floor()，不可用时本地模拟。"""
        return self._detect_floor_full(room_id).get(
            "water", {"is_abnormal": False, "confidence": 0.88, "photo": None, "photo_meta": None}
        )

    def _detect_floor_full(self, room_id: str) -> dict:
        """调用 meta.detection.detect_floor()，同一房间同一步骤只调用一次。"""
        cache_key = f"_floor_cache_{room_id}"
        cached = getattr(self, cache_key, None)
        if cached:
            return cached
        try:
            result = self._detection_call("detect_floor", room_id=room_id)
            if isinstance(result, dict) and "clutter" in result:
                setattr(self, cache_key, result)
                return result
        except Exception:
            pass
        # 本地模拟 fallback
        has_clutter = random.random() < _CLUTTER_PROB
        has_water = random.random() < _WATER_PROB
        fallback = {
            "clutter": {
                "is_abnormal": has_clutter,
                "confidence": random.uniform(0.85, 0.97),
                "photo": _PLACEHOLDER_B64 if has_clutter else None,
                "photo_meta": _photo(room_id, "floor_clutter")["meta"] if has_clutter else None,
            },
            "water": {
                "is_abnormal": has_water,
                "confidence": random.uniform(0.85, 0.97),
                "photo": _PLACEHOLDER_B64 if has_water else None,
                "photo_meta": _photo(room_id, "floor_water")["meta"] if has_water else None,
            },
            "room_id": room_id,
            "any_abnormal": has_clutter or has_water,
        }
        setattr(self, cache_key, fallback)
        return fallback

    def capture_image(self) -> str | None:
        """拍照，返回 base64 PNG。真机替换为摄像头数据。"""
        return _PLACEHOLDER_B64
