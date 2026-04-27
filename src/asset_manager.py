"""Asset Manager Mixin — HDF5 trajectory + MP3 audio pair management.

Manages 4 categories (迎宾/引领/展厅讲解/告别) with local storage
and RPC sync to meta.sales_replay + meta.sales_audio.
"""
import logging
import os
import re
from pathlib import Path

logger = logging.getLogger(__name__)

ASSET_CATEGORIES = {
    "yingbin": "迎宾",
    "yinling": "引领",
    "zhantingjiangjie": "展厅讲解",
    "gaobie": "告别",
}

_PROJECT_ROOT = Path(__file__).parent.parent
_HDF5_DIR = _PROJECT_ROOT / "assets" / "hdf5"
_AUDIO_DIR = _PROJECT_ROOT / "assets" / "audio"

_INDEX_RE = re.compile(r"^(.+?)_(\d+)\.(hdf5|mp3)$")


class AssetManagerMixin:
    """Manage paired HDF5 + MP3 assets across 4 categories."""

    def init_asset_dirs(self):
        for cat in ASSET_CATEGORIES:
            os.makedirs(_HDF5_DIR / cat, exist_ok=True)
            os.makedirs(_AUDIO_DIR / cat, exist_ok=True)
        logger.info("[assets] Directories initialized under %s", _PROJECT_ROOT / "assets")

    # ---- List ----

    def list_assets(self, category: str) -> dict:
        if category not in ASSET_CATEGORIES:
            return {"success": False, "message": f"Unknown category: {category}"}

        hdf5_dir = _HDF5_DIR / category
        audio_dir = _AUDIO_DIR / category

        hdf5_map: dict[int, dict] = {}
        audio_map: dict[int, dict] = {}

        for f in hdf5_dir.iterdir():
            m = _INDEX_RE.match(f.name)
            if m and m.group(3) == "hdf5":
                idx = int(m.group(2))
                stat = f.stat()
                hdf5_map[idx] = {"filename": f.name, "size": stat.st_size, "mtime": stat.st_mtime}

        for f in audio_dir.iterdir():
            m = _INDEX_RE.match(f.name)
            if m and m.group(3) == "mp3":
                idx = int(m.group(2))
                stat = f.stat()
                audio_map[idx] = {"filename": f.name, "size": stat.st_size, "mtime": stat.st_mtime}

        all_indices = sorted(set(hdf5_map) | set(audio_map))
        pairs = []
        for idx in all_indices:
            pairs.append({
                "index": idx,
                "hdf5": hdf5_map.get(idx),
                "audio": audio_map.get(idx),
            })

        return {"success": True, "category": category, "category_name": ASSET_CATEGORIES[category], "pairs": pairs}

    def _next_pair_index(self, category: str, uploading_hdf5: bool, uploading_mp3: bool) -> int:
        """Find the right index: fill incomplete pair first, else create new."""
        existing = self.list_assets(category)
        pairs = existing.get("pairs", [])
        max_idx = max((p["index"] for p in pairs), default=0)

        if uploading_hdf5 and not uploading_mp3:
            for p in pairs:
                if p["audio"] and not p["hdf5"]:
                    return p["index"]
        elif uploading_mp3 and not uploading_hdf5:
            for p in pairs:
                if p["hdf5"] and not p["audio"]:
                    return p["index"]

        return max_idx + 1

    # ---- Upload ----

    def upload_asset_pair(self, category: str, hdf5_data: bytes | None, mp3_data: bytes | None) -> dict:
        if category not in ASSET_CATEGORIES:
            return {"success": False, "message": f"Unknown category: {category}"}
        if not hdf5_data and not mp3_data:
            return {"success": False, "message": "At least one file (HDF5 or MP3) is required"}

        idx = self._next_pair_index(category, bool(hdf5_data), bool(mp3_data))

        saved = []
        if hdf5_data:
            hdf5_path = _HDF5_DIR / category / f"{category}_{idx}.hdf5"
            hdf5_path.write_bytes(hdf5_data)
            saved.append(str(hdf5_path))
            self._rpc_upload_to_metas(f"hdf5/{category}", f"{category}_{idx}.hdf5", hdf5_data)

        if mp3_data:
            mp3_path = _AUDIO_DIR / category / f"{category}_{idx}.mp3"
            mp3_path.write_bytes(mp3_data)
            saved.append(str(mp3_path))
            self._rpc_upload_to_metas(f"audio/{category}", f"{category}_{idx}.mp3", mp3_data)

        logger.info("[assets] Uploaded pair #%d to %s: %s", idx, category, saved)
        return {"success": True, "message": f"Uploaded pair #{idx}", "pair_index": idx}

    # ---- Delete ----

    def delete_asset_pair(self, category: str, pair_index: int) -> dict:
        if category not in ASSET_CATEGORIES:
            return {"success": False, "message": f"Unknown category: {category}"}

        hdf5_file = _HDF5_DIR / category / f"{category}_{pair_index}.hdf5"
        mp3_file = _AUDIO_DIR / category / f"{category}_{pair_index}.mp3"
        deleted = []

        if hdf5_file.exists():
            hdf5_file.unlink()
            deleted.append("hdf5")
            self._rpc_delete_from_metas(f"hdf5/{category}", f"{category}_{pair_index}.hdf5")

        if mp3_file.exists():
            mp3_file.unlink()
            deleted.append("mp3")
            self._rpc_delete_from_metas(f"audio/{category}", f"{category}_{pair_index}.mp3")

        if not deleted:
            return {"success": False, "message": f"No files found for pair #{pair_index}"}

        logger.info("[assets] Deleted pair #%d from %s: %s", pair_index, category, deleted)
        return {"success": True, "message": f"Deleted pair #{pair_index}", "deleted": deleted}


    # ---- Trajectory listing (cross-category) ----

    def list_all_trajectories(self) -> dict:
        trajectories = []
        for cat in ASSET_CATEGORIES:
            hdf5_dir = _HDF5_DIR / cat
            if not hdf5_dir.exists():
                continue
            for f in hdf5_dir.iterdir():
                m = _INDEX_RE.match(f.name)
                if m and m.group(3) == "hdf5":
                    idx = int(m.group(2))
                    trajectories.append(f"{cat}/{cat}_{idx}")
        trajectories.sort()
        return {"success": True, "trajectories": trajectories}

    # ---- Preview ----

    def preview_audio(self, category: str, pair_index: int) -> dict:
        filename = f"{category}/{category}_{pair_index}"
        return self._call_service("meta.sales_audio", "play", filename=filename)

    def stop_audio(self) -> dict:
        return self._call_service("meta.sales_audio", "stop")

    def preview_action(self, category: str, pair_index: int) -> dict:
        traj_name = f"{category}/{category}_{pair_index}"
        return self._call_service("meta.sales_replay", "replay", traj_name=traj_name, use_traj_head=True)

    def stop_replay(self) -> dict:
        return self._call_service("meta.sales_replay", "cancel_replay")

    def get_replay_status(self) -> dict:
        return self._call_service("meta.sales_replay", "get_replay_status")

    # ---- RPC sync helpers ----

    def _rpc_upload_to_metas(self, subdir: str, filename: str, data: bytes):
        for svc in ["meta.sales_replay", "meta.sales_audio"]:
            try:
                entry = self._ensure_service_active(svc)
                if entry and entry.proxy:
                    try:
                        from astribot_link import LargeBuffer
                        entry.proxy.upload_asset(subdir, filename, LargeBuffer(data))
                    except (TypeError, Exception) as e:
                        if "serializable" in str(e) or "LargeBuffer" in str(e):
                            entry.proxy.upload_asset(subdir, filename, data)
                        else:
                            raise
                    logger.info("[assets] RPC uploaded %s/%s to %s", subdir, filename, svc)
            except Exception as e:
                logger.error("[assets] RPC upload to %s failed: %s", svc, e)

    def _rpc_delete_from_metas(self, subdir: str, filename: str):
        for svc in ["meta.sales_replay", "meta.sales_audio"]:
            try:
                entry = self._ensure_service_active(svc)
                if entry and entry.proxy:
                    entry.proxy.delete_asset(subdir, filename)
                    logger.info("[assets] RPC deleted %s/%s from %s", subdir, filename, svc)
            except Exception as e:
                logger.error("[assets] RPC delete from %s failed: %s", svc, e)
