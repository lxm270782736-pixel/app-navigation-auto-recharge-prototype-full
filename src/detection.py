"""Visual detection — interface for VLM-based anomaly detection.

Currently returns mock results. Replace method internals when VLM service is available.
"""
import base64
import time

# 1x1 white PNG placeholder (68 bytes)
_PLACEHOLDER_PNG = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01'
    b'\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00'
    b'\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18'
    b'\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
)


class DetectionMixin:
    """Visual detection methods — bed occupancy, floor clutter, water stains."""

    def detect_bed_occupancy(self, room_id: str) -> dict:
        """Detect whether an elderly person is in bed.

        Returns: {detection_type, is_abnormal, confidence, description, timestamp, room_id}
        """
        # TODO: Replace with VLM API call when service is available
        return {
            "detection_type": "bed",
            "is_abnormal": False,
            "confidence": 0.95,
            "description": "老人在床（mock）",
            "timestamp": time.time(),
            "room_id": room_id,
        }

    def detect_floor_clutter(self, room_id: str) -> dict:
        """Detect floor clutter/obstacles in the corridor."""
        return {
            "detection_type": "clutter",
            "is_abnormal": False,
            "confidence": 0.90,
            "description": "通道无杂物（mock）",
            "timestamp": time.time(),
            "room_id": room_id,
        }

    def detect_floor_water(self, room_id: str) -> dict:
        """Detect water stains on the floor."""
        return {
            "detection_type": "water",
            "is_abnormal": False,
            "confidence": 0.88,
            "description": "地面无水渍（mock）",
            "timestamp": time.time(),
            "room_id": room_id,
        }

    def capture_image(self) -> str | None:
        """Capture current frame from ROS camera topic.

        Returns base64-encoded PNG string, or None if unavailable.
        TODO: Replace with real camera topic subscription when available.
        """
        return base64.b64encode(_PLACEHOLDER_PNG).decode('ascii')
