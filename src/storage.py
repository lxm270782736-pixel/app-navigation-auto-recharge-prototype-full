"""JSON daily storage — saves records as individual JSON files organized by date."""
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from ._logger import logger


class JsonDayStorage:
    """Store JSON records in data/{category}/{YYYY-MM-DD}/{record_id}.json"""

    def __init__(self, base_dir: str | Path | None = None):
        if base_dir is None:
            base_dir = Path(__file__).parent.parent / "data"
        self._base = Path(base_dir)

    def _dir(self, category: str, date: str) -> Path:
        return self._base / category / date

    def _path(self, category: str, date: str, record_id: str) -> Path:
        return self._dir(category, date) / f"{record_id}.json"

    @staticmethod
    def today() -> str:
        return datetime.now().strftime("%Y-%m-%d")

    def save(self, category: str, record_id: str, data: dict,
             date: str | None = None) -> bool:
        """Save a record. Returns True on success."""
        date = date or self.today()
        try:
            d = self._dir(category, date)
            d.mkdir(parents=True, exist_ok=True)
            p = self._path(category, date, record_id)
            tmp = p.with_suffix(".tmp")
            with open(tmp, "w") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            tmp.rename(p)
            return True
        except Exception as e:
            logger.error(f"[storage] save failed {category}/{date}/{record_id}: {e}")
            return False

    def load(self, category: str, record_id: str, date: str) -> dict | None:
        """Load a single record."""
        try:
            p = self._path(category, date, record_id)
            if p.exists():
                with open(p) as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"[storage] load failed {category}/{date}/{record_id}: {e}")
        return None

    def list_by_date(self, category: str, date: str) -> list[dict]:
        """List all records for a given date."""
        results = []
        d = self._dir(category, date)
        if not d.exists():
            return results
        try:
            for p in sorted(d.glob("*.json")):
                with open(p) as f:
                    results.append(json.load(f))
        except Exception as e:
            logger.error(f"[storage] list_by_date failed {category}/{date}: {e}")
        return results

    def list_recent(self, category: str, days: int = 7) -> list[dict]:
        """List records from the most recent N days."""
        results = []
        today = datetime.now()
        for i in range(days):
            date = (today - timedelta(days=i)).strftime("%Y-%m-%d")
            results.extend(self.list_by_date(category, date))
        return results

    def update(self, category: str, record_id: str, date: str,
               patch: dict) -> bool:
        """Partial update — merge patch into existing record."""
        data = self.load(category, record_id, date)
        if data is None:
            return False
        data.update(patch)
        return self.save(category, record_id, data, date)

    def delete(self, category: str, record_id: str, date: str) -> bool:
        """Delete a single record file."""
        try:
            p = self._path(category, date, record_id)
            if p.exists():
                p.unlink()
                return True
        except Exception as e:
            logger.error(f"[storage] delete failed {category}/{date}/{record_id}: {e}")
        return False
