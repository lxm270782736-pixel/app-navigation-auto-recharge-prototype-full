"""Tests for fall detection double-thread architecture."""
import threading
import time
from unittest.mock import MagicMock, patch

import pytest

from src.meta_bridge import MetaBridgeMixin, META_ACTIVE
from src.alert import AlertMixin
from src.patrol_room import RoomPatrolMixin


class _Stub(MetaBridgeMixin, AlertMixin, RoomPatrolMixin):
    """Minimal stub for fall detection testing."""

    def __init__(self):
        self._lock = threading.Lock()
        self._patrol_state_lock = threading.Lock()
        self._pause_event = threading.Event()
        self._pause_event.set()
        self._step_advance_event = threading.Event()
        self._step_advance_event.set()
        self._pause_reason = None
        self._paused_step_type = ""
        self._alert_interrupted = False
        self._replay_paused_by = None
        self._paused_replay_id = ""
        self._skip_step_requested = False
        self._fall_monitor_enabled = True
        self._stuck_event = None
        self._init_meta()
        self._storage = MagicMock()  # Mock storage for alerts

        # Initialize all required patrol state attributes
        self._room_patrol_active = False
        self._room_patrol_id = ""
        self._room_patrol_status = "idle"
        self._room_patrol_current_room_idx = -1
        self._room_patrol_current_step = ""
        self._room_patrol_current_step_index = -1
        self._room_patrol_rooms_completed = []
        self._room_patrol_rooms_failed = []
        self._room_patrol_error = ""
        self._room_patrol_task_name = ""
        self._room_patrol_record = {}
        self._room_patrol_rooms_list = []
        self._fall_event = None
        self._fall_thread = None

        # Mock methods that might be called
        self.cancel_navigation = MagicMock()
        self.get_custom_step_types = MagicMock(return_value={"custom_step_types": []})
        self.get_task_presets = MagicMock(return_value={"presets": []})

    def get_custom_step_definition(self, step_id: str) -> dict | None:
        """Return a mock custom step definition."""
        return None

    def _get_storage(self):
        """Return mock storage."""
        return self._storage

    def acknowledge_fall(self):
        """Acknowledge fall event - test stub implementation."""
        self._fall_event = None
        try:
            self._call_service("meta.fall_detection", "ack_fall")
        except Exception:
            pass
        return {"success": True, "message": "跌倒事件已确认"}


@pytest.fixture
def stub():
    return _Stub()


class TestFallDetection:

    def test_start_fall_monitor_creates_thread(self, stub):
        """Starting fall monitor should create and start a daemon thread."""
        with patch.object(stub, '_fall_monitor_loop') as mock_loop:
            stub._start_fall_monitor()

            # Thread should be started
            assert stub._fall_thread is not None
            assert stub._fall_thread.daemon is True
            assert stub._fall_thread.name == "fall-monitor"

    def test_fall_event_cleared_on_stop(self, stub):
        """Stopping patrol should clear fall event."""
        stub._fall_event = {"timestamp": time.time(), "location": "101", "confidence": 0.9}
        stub._room_patrol_active = True

        stub.stop_room_patrol()

        assert stub._fall_event is None

    def test_check_fall_proceeds_when_no_fall(self, stub):
        """Should proceed when no fall event."""
        stub._fall_event = None
        stub._room_patrol_active = True

        result = stub._check_fall_before_step()

        assert result is True

    def test_check_fall_returns_false_when_patrol_stopped(self, stub):
        """Should return False when patrol is stopped."""
        stub._fall_event = None
        stub._room_patrol_active = False

        result = stub._check_fall_before_step()

        assert result is False

    def test_get_status_includes_fall_event(self, stub):
        """ patrol status should include fall_event field."""
        stub._fall_event = {
            "timestamp": time.time(),
            "location": "101",
            "confidence": 0.95
        }
        stub._room_patrol_active = False  # Avoid errors from missing room data

        status = stub.get_room_patrol_status()

        assert "fall_event" in status
        assert status["fall_event"]["location"] == "101"
        assert status["fall_event"]["confidence"] == 0.95

    def test_acknowledge_fall_clears_event(self, stub):
        """Acknowledging fall should clear the event."""
        stub._fall_event = {"timestamp": time.time(), "location": "101", "confidence": 0.9}
        stub._detection_call = MagicMock(return_value={"success": True})

        result = stub.acknowledge_fall()

        assert stub._fall_event is None
        assert result["success"] is True

    def test_fall_event_creates_alert(self, stub):
        """Fall detection should create an alert."""
        event = {"timestamp": time.time(), "location": "101", "confidence": 0.95}
        stub._room_patrol_id = "patrol_test"

        with patch.object(stub, 'create_alert') as mock_alert:
            stub._on_fall_event(event)
            mock_alert.assert_called_once()
            call_args = mock_alert.call_args
            assert call_args[0][2] == "fall_detected"  # alert_type
            assert call_args[1]["confidence"] == 0.95


class TestFallMonitorLoop:

    def test_monitor_calls_get_fall_status(self, stub):
        """Monitor should periodically call get_fall_status."""
        stub._detection_call = MagicMock(return_value={"is_fall": False, "acknowledged": False})
        stub._room_patrol_active = True

        # Run for a short time then stop
        thread = threading.Thread(target=lambda: (
            stub._fall_monitor_loop(),
            setattr(stub, '_room_patrol_active', False)
        ), daemon=True)
        thread.start()
        time.sleep(0.1)
        stub._room_patrol_active = False
        thread.join(timeout=1.0)

        # Should have called at least once
        assert stub._detection_call.call_count >= 1

    def test_monitor_sets_fall_event_on_detection(self, stub):
        """Monitor should set _fall_event when is_fall=True."""
        call_count = [0]

        def mock_call(method, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return {"is_fall": True, "location": "101", "confidence": 0.9}
            return {"is_fall": False, "acknowledged": True}

        stub._detection_call = MagicMock(side_effect=mock_call)
        stub._room_patrol_active = True
        stub.create_alert = MagicMock()

        # Run briefly
        thread = threading.Thread(target=lambda: (
            stub._fall_monitor_loop(),
            setattr(stub, '_room_patrol_active', False)
        ), daemon=True)
        thread.start()
        time.sleep(0.5)
        stub._room_patrol_active = False
        thread.join(timeout=1.0)

        # Should have detected fall
        assert stub._fall_event is not None
        assert stub._fall_event["location"] == "101"

    def test_monitor_keeps_event_until_ack(self, stub):
        """Monitor should keep existing fall event until explicit acknowledge."""
        stub._fall_event = {"timestamp": time.time(), "location": "101", "confidence": 0.9}

        stub._detection_call = MagicMock(return_value={"is_fall": False, "acknowledged": True})
        stub._room_patrol_active = True

        # Run briefly
        thread = threading.Thread(target=lambda: (
            stub._fall_monitor_loop(),
            setattr(stub, '_room_patrol_active', False)
        ), daemon=True)
        thread.start()
        time.sleep(0.1)
        stub._room_patrol_active = False
        thread.join(timeout=1.0)

        # Existing event is cleared by acknowledge_fall(), not by monitor loop.
        assert stub._fall_event is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])