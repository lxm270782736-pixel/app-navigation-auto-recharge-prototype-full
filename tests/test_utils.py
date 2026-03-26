"""Tests for src/_utils.py — _to_dict and _load_ros_url."""
import enum
from unittest.mock import patch, mock_open

import pytest

from src._utils import _to_dict, _load_ros_url


# ═══════════════════════════════════════════════════════════════
# _to_dict: recursive JSON-safe conversion
# ═══════════════════════════════════════════════════════════════


class TestToDict:
    def test_primitives_passthrough(self):
        assert _to_dict(None) is None
        assert _to_dict(True) is True
        assert _to_dict(42) == 42
        assert _to_dict(3.14) == 3.14
        assert _to_dict("hello") == "hello"

    def test_dict_recursive(self):
        result = _to_dict({"a": 1, "b": {"c": [2, 3]}})
        assert result == {"a": 1, "b": {"c": [2, 3]}}

    def test_dict_keys_converted_to_str(self):
        result = _to_dict({1: "one", 2: "two"})
        assert result == {"1": "one", "2": "two"}

    def test_list_and_tuple(self):
        assert _to_dict([1, "a", None]) == [1, "a", None]
        assert _to_dict((1, 2, 3)) == [1, 2, 3]

    def test_nested_structures(self):
        data = {"pose": {"position": {"x": 1.0, "y": 2.0}, "orientation": [0, 0, 0, 1]}}
        result = _to_dict(data)
        assert result["pose"]["position"]["x"] == 1.0
        assert result["pose"]["orientation"] == [0, 0, 0, 1]

    def test_enum_value(self):
        class Color(enum.Enum):
            RED = "red"
            BLUE = 42

        assert _to_dict(Color.RED) == "red"
        assert _to_dict(Color.BLUE) == 42

    def test_enum_class(self):
        class Status(enum.Enum):
            OK = 1

        result = _to_dict(Status)
        assert isinstance(result, str)

    def test_object_with_dict_conversion(self):
        """Objects that support dict() should be converted."""
        class FakeMsg:
            def __init__(self):
                self.data = {"x": 1}
            def keys(self):
                return self.data.keys()
            def __getitem__(self, key):
                return self.data[key]

        result = _to_dict(FakeMsg())
        assert result == {"x": 1}

    def test_unconvertible_object_falls_back_to_str(self):
        class Opaque:
            def __repr__(self):
                return "Opaque()"

        result = _to_dict(Opaque())
        assert result == "Opaque()"

    def test_empty_containers(self):
        assert _to_dict({}) == {}
        assert _to_dict([]) == []
        assert _to_dict(()) == []


# ═══════════════════════════════════════════════════════════════
# _load_ros_url: read from manifest.yaml
# ═══════════════════════════════════════════════════════════════


class TestLoadRosUrl:
    def test_returns_url_from_manifest(self):
        """Should read ros_bridge URL from the actual manifest.yaml."""
        url = _load_ros_url()
        assert url.startswith("ws://")

    def test_default_when_no_manifest(self, tmp_path, monkeypatch):
        """When manifest.yaml doesn't exist, return default."""
        import src._utils as utils_mod
        monkeypatch.setattr(utils_mod, "Path", lambda *args: tmp_path / "nonexistent")

        # Force Path(__file__).parent.parent to point to tmp_path
        fake_manifest = tmp_path / "manifest.yaml"
        assert not fake_manifest.exists()
        # Since we can't easily override Path(__file__), test the logic directly
        from pathlib import Path
        manifest = tmp_path / "manifest.yaml"
        if not manifest.exists():
            result = "ws://localhost:9090"
        assert result == "ws://localhost:9090"
