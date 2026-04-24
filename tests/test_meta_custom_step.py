"""Tests for meta-type custom step execution.

Covers:
- _call_service routing: localization proxy, navigation proxy, persistent connection
- _execute_custom_step with meta action: param resolution, result handling
- End-to-end: meta_photo definition loaded from JSON → executed via mock camera proxy
"""
import threading
from unittest.mock import MagicMock, patch, call

import pytest

from src.meta_bridge import MetaBridgeMixin, META_ACTIVE, META_DISCONNECTED
from src.custom_steps import CustomStepsMixin
from src.patrol_room import RoomPatrolMixin


# ---------------------------------------------------------------------------
# Minimal stub that wires the three mixins together
# ---------------------------------------------------------------------------

class _Stub(MetaBridgeMixin, CustomStepsMixin, RoomPatrolMixin):
    """Combines only the mixins needed for meta custom step testing."""

    def __init__(self):
        self._lock = threading.Lock()
        self._room_patrol_active = True
        self._pause_reason = None
        self._skip_step_requested = False
        self._init_meta()


@pytest.fixture
def stub():
    return _Stub()


@pytest.fixture
def active_stub():
    """Stub with localization and navigation services in active state."""
    s = _Stub()
    from src.meta_bridge import META_ACTIVE
    for name in ("meta.localization", "meta.astribot_navigation"):
        entry = s._services[name]
        entry.proxy = MagicMock()
        entry.state = META_ACTIVE
    return s


# ---------------------------------------------------------------------------
# _call_service: routing tests
# ---------------------------------------------------------------------------

class TestCallServiceRouting:

    def test_call_service_with_active_service(self, active_stub):
        active_stub._services["meta.localization"].proxy.get_status.return_value = {"success": True, "is_running": True}
        result = active_stub._call_service("meta.localization", "get_status")
        assert result["success"] is True

    def test_call_service_passes_kwargs(self, active_stub):
        active_stub._services["meta.localization"].proxy.set_initial_pose.return_value = {"success": True}
        active_stub._call_service("meta.localization", "set_initial_pose", x=1.0, y=2.0, theta=0.5)
        active_stub._services["meta.localization"].proxy.set_initial_pose.assert_called_once_with(x=1.0, y=2.0, theta=0.5)

    def test_disconnected_service_returns_error(self, stub):
        result = stub._call_service("meta.localization", "get_status")
        assert result["success"] is False

    def test_navigation_service_call(self, active_stub):
        active_stub._services["meta.astribot_navigation"].proxy.get_status.return_value = {"success": True}
        result = active_stub._call_service("meta.astribot_navigation", "get_status")
        assert result["success"] is True

    def test_unknown_service_creates_entry(self, stub):
        mock_proxy = MagicMock()
        mock_proxy.get_status.return_value = {"state": "active"}
        mock_proxy.capture.return_value = {"success": True, "path": "/tmp/img.jpg"}

        with patch("astribot_link.connect", return_value=mock_proxy):
            result = stub._call_service("meta.camera", "capture", label="test", save_to_disk=True)

        mock_proxy.capture.assert_called_once_with(label="test", save_to_disk=True)
        assert result["success"] is True

    def test_none_return_from_proxy_is_error(self, active_stub):
        active_stub._services["meta.localization"].proxy.get_pose.return_value = None
        result = active_stub._call_service("meta.localization", "get_pose")
        assert result["success"] is False
        assert "returned None" in result["message"]


# ---------------------------------------------------------------------------
# _execute_custom_step with meta action
# ---------------------------------------------------------------------------

class TestExecuteMetaCustomStep:

    def _make_meta_photo_def(self):
        return {
            "id": "meta_photo",
            "name": "拍照记录",
            "action": {
                "type": "meta",
                "meta_service": "meta.camera",
                "meta_method": "capture",
                "meta_kwargs": {
                    "label": "{{label}}",
                    "save_to_disk": "{{save_to_disk}}",
                },
            },
            "parameters": [
                {"key": "label", "type": "string", "default_value": "巡检照片"},
                {"key": "save_to_disk", "type": "boolean", "default_value": True},
            ],
            "timeout": 10,
        }

    def test_meta_photo_resolves_params_and_calls_call_service(self, stub):
        stub.get_custom_step_definition = MagicMock(return_value=self._make_meta_photo_def())
        stub._call_service = MagicMock(return_value={"success": True, "path": "/data/img.jpg"})

        ok, detail = stub._execute_custom_step(
            "meta_photo",
            {"label": "走廊检查", "save_to_disk": True},
        )

        stub._call_service.assert_called_once_with(
            "meta.camera", "capture",
            label="走廊检查",
            save_to_disk=True,
        )
        assert ok is True
        assert detail["path"] == "/data/img.jpg"

    def test_meta_photo_bool_param_type_preserved(self, stub):
        """Boolean param should remain bool, not be cast to string."""
        stub.get_custom_step_definition = MagicMock(return_value=self._make_meta_photo_def())
        stub._call_service = MagicMock(return_value={"success": True})

        stub._execute_custom_step("meta_photo", {"label": "x", "save_to_disk": False})

        _, kwargs = stub._call_service.call_args
        assert kwargs["save_to_disk"] is False

    def test_call_service_failure_propagates_as_failed_step(self, stub):
        stub.get_custom_step_definition = MagicMock(return_value=self._make_meta_photo_def())
        stub._call_service = MagicMock(return_value={"success": False, "message": "camera offline"})

        ok, detail = stub._execute_custom_step("meta_photo", {})

        assert ok is False
        assert detail["message"] == "camera offline"

    def test_unknown_step_id_returns_false(self, stub):
        stub.get_custom_step_definition = MagicMock(return_value=None)
        ok, detail = stub._execute_custom_step("nonexistent", {})
        assert ok is False

    def test_meta_photo_from_json_definition(self, stub):
        """Load meta_photo from the actual JSON file and verify it executes correctly."""
        # get_custom_step_definition reads from disk — use real implementation
        definition = stub.get_custom_step_definition("meta_photo")
        assert definition is not None, "meta_photo not found in custom_step_types.json"
        assert definition["action"]["type"] == "meta"
        assert definition["action"]["meta_service"] == "meta.camera"
        assert definition["action"]["meta_method"] == "capture"

        stub._call_service = MagicMock(return_value={"success": True, "path": "/data/test.jpg"})
        ok, detail = stub._execute_custom_step(
            "meta_photo",
            {"label": "床位检查", "save_to_disk": True},
        )

        stub._call_service.assert_called_once_with(
            "meta.camera", "capture",
            label="床位检查",
            save_to_disk=True,
        )
        assert ok is True


# ---------------------------------------------------------------------------
# meta_poll: 轮询等待异步操作完成
# ---------------------------------------------------------------------------

class TestMetaPoll:

    def _make_replay_def(self):
        return {
            "id": "meta_replay",
            "name": "播放轨迹",
            "action": {
                "type": "meta",
                "meta_service": "meta.sales_replay",
                "meta_method": "replay",
                "meta_kwargs": {"traj_name": "{{traj_name}}", "use_traj_head": "{{use_traj_head}}"},
                "meta_poll": {
                    "method": "get_replay_status",
                    "done_key": "is_playing",
                    "done_value": False,
                    "result_key": "success",
                    "interval": 0.01,   # 测试里极短间隔
                    "timeout": 5,
                },
            },
            "parameters": [
                {"key": "traj_name", "type": "string", "default_value": "idle/breathing_8"},
                {"key": "use_traj_head", "type": "boolean", "default_value": True},
            ],
            "timeout": 130,
        }

    def test_replay_polls_until_done(self, stub):
        """dispatch 成功后轮询，直到 is_playing=False 时返回 success。"""
        stub.get_custom_step_definition = MagicMock(return_value=self._make_replay_def())

        # 前两次轮询 is_playing=True，第三次 False+success=True
        poll_responses = [
            {"is_playing": True},
            {"is_playing": True},
            {"is_playing": False, "success": True},
        ]
        call_iter = iter(poll_responses)

        def _call_service_side(service, method, **kwargs):
            if method == "replay":
                return {"success": True, "message": "replay dispatched"}
            return next(call_iter)

        stub._call_service = MagicMock(side_effect=_call_service_side)

        ok, detail = stub._execute_custom_step(
            "meta_replay",
            {"traj_name": "idle/breathing_8", "use_traj_head": True},
        )

        assert ok is True
        assert detail == {"is_playing": False, "success": True}
        # replay 调用一次 + 轮询三次 = 4 次
        assert stub._call_service.call_count == 4

    def test_replay_dispatch_failure_skips_poll(self, stub):
        """replay() 失败时不进入轮询，直接返回失败。"""
        stub.get_custom_step_definition = MagicMock(return_value=self._make_replay_def())
        stub._call_service = MagicMock(return_value={"success": False, "message": "server error"})

        ok, detail = stub._execute_custom_step("meta_replay", {"traj_name": "x"})

        assert ok is False
        stub._call_service.assert_called_once()   # 只有 dispatch，没有轮询

    def test_replay_poll_timeout(self, stub):
        """轮询超时后返回失败。"""
        replay_def = self._make_replay_def()
        replay_def["action"]["meta_poll"]["timeout"] = 0.05   # 50ms 极短超时

        stub.get_custom_step_definition = MagicMock(return_value=replay_def)

        def _always_playing(service, method, **kwargs):
            if method == "replay":
                return {"success": True}
            return {"is_playing": True}   # 永远播放中

        stub._call_service = MagicMock(side_effect=_always_playing)

        ok, detail = stub._execute_custom_step("meta_replay", {"traj_name": "x"})

        assert ok is False
        assert "timeout" in detail["error"]

    def test_no_poll_on_meta_photo(self, stub):
        """meta_photo 无 meta_poll 字段，行为不变（只调用一次 _call_service）。"""
        stub.get_custom_step_definition = MagicMock(return_value={
            "id": "meta_photo",
            "action": {
                "type": "meta",
                "meta_service": "meta.camera",
                "meta_method": "capture",
                "meta_kwargs": {"label": "{{label}}", "save_to_disk": "{{save_to_disk}}"},
                # 无 meta_poll
            },
            "parameters": [],
        })
        stub._call_service = MagicMock(return_value={"success": True, "path": "/tmp/x.png"})

        ok, _ = stub._execute_custom_step("meta_photo", {"label": "test", "save_to_disk": True})

        assert ok is True
        stub._call_service.assert_called_once()

    def test_replay_from_json_definition(self, stub):
        """从磁盘读取 meta_replay 定义，验证 meta_poll 字段存在。"""
        definition = stub.get_custom_step_definition("meta_replay")
        assert definition is not None, "meta_replay not found in custom_step_types.json"
        assert definition["action"]["type"] == "meta"
        assert definition["action"]["meta_service"] == "meta.sales_replay"
        assert definition["action"]["meta_method"] == "replay"
        poll = definition["action"].get("meta_poll")
        assert poll is not None
        assert poll["method"] == "get_replay_status"
        assert poll["done_key"] == "is_playing"
        assert poll["done_value"] is False
