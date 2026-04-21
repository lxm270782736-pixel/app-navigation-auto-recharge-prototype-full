"""Shared utility functions for the business logic layer."""
import enum
import time
import yaml
from pathlib import Path


def _to_dict(obj):
    """Recursively convert any roslibpy/non-standard types to JSON-safe primitives."""
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, dict):
        return {str(k): _to_dict(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_dict(i) for i in obj]
    if isinstance(obj, enum.Enum):
        return obj.value
    if isinstance(obj, (type, enum.EnumMeta)):
        return str(obj)
    # roslibpy Message/Goal/Feedback etc — try dict()
    try:
        return _to_dict(dict(obj))
    except (TypeError, ValueError):
        pass
    return str(obj)


def _load_ros_url() -> str:
    """Read ROS Bridge URL from manifest.yaml."""
    manifest = Path(__file__).parent.parent / "manifest.yaml"
    if manifest.exists():
        with open(manifest) as f:
            cfg = yaml.safe_load(f)
        return cfg.get("remote_routes", {}).get("ros_bridge", "ws://localhost:9090")
    return "ws://localhost:9090"


# 每个 key 上次打印日志的时间戳
_throttle_last_ts: dict[str, float] = {}


def log_throttled(logger, key: str, interval: float, level_method: str, msg: str, *args):
    """节流日志：同一 key 在 interval 秒内最多打印一次。

    用法:
        log_throttled(logger, "fall.poll", 5.0, "info",
                      "[fall] poll: is_fall=%s", is_fall)
    """
    now = time.time()
    if now - _throttle_last_ts.get(key, 0) >= interval:
        getattr(logger, level_method)(msg, *args)
        _throttle_last_ts[key] = now
