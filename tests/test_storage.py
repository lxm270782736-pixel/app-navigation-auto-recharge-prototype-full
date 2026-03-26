"""Tests for src/storage.py — JsonDayStorage CRUD."""
import json
from datetime import datetime

import pytest

from src.storage import JsonDayStorage


@pytest.fixture
def storage(tmp_path):
    return JsonDayStorage(base_dir=tmp_path)


class TestJsonDayStorage:

    def test_save_and_load(self, storage):
        data = {"name": "test", "value": 42}
        assert storage.save("logs", "rec1", data, date="2026-03-26")
        loaded = storage.load("logs", "rec1", "2026-03-26")
        assert loaded == data

    def test_load_nonexistent_returns_none(self, storage):
        assert storage.load("logs", "missing", "2026-01-01") is None

    def test_save_creates_directory_structure(self, storage, tmp_path):
        storage.save("events", "e1", {"ok": True}, date="2026-03-26")
        path = tmp_path / "events" / "2026-03-26" / "e1.json"
        assert path.exists()

    def test_save_overwrites_existing(self, storage):
        storage.save("logs", "r1", {"v": 1}, date="2026-01-01")
        storage.save("logs", "r1", {"v": 2}, date="2026-01-01")
        loaded = storage.load("logs", "r1", "2026-01-01")
        assert loaded["v"] == 2

    def test_list_by_date(self, storage):
        storage.save("cat", "a", {"id": "a"}, date="2026-03-01")
        storage.save("cat", "b", {"id": "b"}, date="2026-03-01")
        storage.save("cat", "c", {"id": "c"}, date="2026-03-02")

        results = storage.list_by_date("cat", "2026-03-01")
        assert len(results) == 2
        ids = {r["id"] for r in results}
        assert ids == {"a", "b"}

    def test_list_by_date_empty(self, storage):
        assert storage.list_by_date("cat", "2099-01-01") == []

    def test_update_merges_patch(self, storage):
        storage.save("logs", "r1", {"a": 1, "b": 2}, date="2026-01-01")
        assert storage.update("logs", "r1", "2026-01-01", {"b": 99, "c": 3})
        loaded = storage.load("logs", "r1", "2026-01-01")
        assert loaded == {"a": 1, "b": 99, "c": 3}

    def test_update_nonexistent_returns_false(self, storage):
        assert storage.update("logs", "missing", "2026-01-01", {"x": 1}) is False

    def test_delete(self, storage):
        storage.save("logs", "r1", {"x": 1}, date="2026-01-01")
        assert storage.delete("logs", "r1", "2026-01-01")
        assert storage.load("logs", "r1", "2026-01-01") is None

    def test_delete_nonexistent_returns_false(self, storage):
        assert storage.delete("logs", "nope", "2026-01-01") is False

    def test_today_format(self):
        today = JsonDayStorage.today()
        # Should be YYYY-MM-DD format
        datetime.strptime(today, "%Y-%m-%d")

    def test_unicode_content(self, storage):
        data = {"name": "导航测试", "description": "中文内容"}
        storage.save("nav", "u1", data, date="2026-01-01")
        loaded = storage.load("nav", "u1", "2026-01-01")
        assert loaded["name"] == "导航测试"

    def test_list_recent(self, storage):
        storage.save("cat", "a", {"id": "a"}, date=JsonDayStorage.today())
        results = storage.list_recent("cat", days=1)
        assert len(results) >= 1
