"""Shared utility functions for the business logic layer."""
import enum
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
