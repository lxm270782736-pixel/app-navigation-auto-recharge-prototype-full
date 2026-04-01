"""Custom step type definitions — CRUD and persistence."""
import json
import re
import time
from pathlib import Path


_CUSTOM_STEPS_FILE = Path(__file__).parent.parent / "saved_nav_configs" / "custom_step_types.json"

_VALID_ACTION_TYPES = {"ros_service", "ros_topic", "wait"}
_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")


class CustomStepsMixin:
    """Custom step type management — define, save, load, delete."""

    def get_custom_step_types(self) -> dict:
        """Load all custom step type definitions."""
        try:
            if _CUSTOM_STEPS_FILE.exists():
                with open(_CUSTOM_STEPS_FILE) as f:
                    return json.load(f)
        except Exception as e:
            print(f"[custom_steps] Failed to load: {e}")
        return {"custom_step_types": []}

    def get_custom_step_definition(self, step_id: str) -> dict | None:
        """Lookup a single custom step definition by id."""
        data = self.get_custom_step_types()
        for d in data.get("custom_step_types", []):
            if d.get("id") == step_id:
                return d
        return None

    def save_custom_step_type(self, definition: dict) -> dict:
        """Create or update a custom step type definition."""
        # Validate
        step_id = definition.get("id", "").strip()
        if not step_id or not _ID_PATTERN.match(step_id):
            return {"success": False, "message": "ID 只能包含字母、数字、下划线"}

        name = definition.get("name", "").strip()
        if not name:
            return {"success": False, "message": "名称不能为空"}

        action = definition.get("action", {})
        action_type = action.get("type", "")
        if action_type not in _VALID_ACTION_TYPES:
            return {"success": False, "message": f"动作类型必须是 {_VALID_ACTION_TYPES} 之一"}

        if action_type == "ros_service":
            if not action.get("service_name") or not action.get("service_type"):
                return {"success": False, "message": "ROS Service 需要 service_name 和 service_type"}
        elif action_type == "ros_topic":
            if not action.get("topic_name") or not action.get("msg_type"):
                return {"success": False, "message": "ROS Topic 需要 topic_name 和 msg_type"}

        definition["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")

        # Load existing
        data = self.get_custom_step_types()
        types = data.get("custom_step_types", [])

        # Update existing or append
        found = False
        for i, d in enumerate(types):
            if d.get("id") == step_id:
                types[i] = definition
                found = True
                break
        if not found:
            definition.setdefault("created_at", time.strftime("%Y-%m-%dT%H:%M:%S"))
            types.append(definition)

        data["custom_step_types"] = types
        data["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        return self._save_custom_steps_file(data)

    def delete_custom_step_type(self, step_id: str) -> dict:
        """Delete a custom step type by id."""
        data = self.get_custom_step_types()
        types = data.get("custom_step_types", [])
        before = len(types)
        data["custom_step_types"] = [d for d in types if d.get("id") != step_id]
        if len(data["custom_step_types"]) == before:
            return {"success": False, "message": f"Step type '{step_id}' not found"}
        data["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        return self._save_custom_steps_file(data)

    def _save_custom_steps_file(self, data: dict) -> dict:
        """Atomic write to disk."""
        tmp = _CUSTOM_STEPS_FILE.with_suffix(".tmp")
        try:
            _CUSTOM_STEPS_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(tmp, "w") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            tmp.rename(_CUSTOM_STEPS_FILE)
            return {"success": True, "message": "Saved"}
        except Exception as e:
            tmp.unlink(missing_ok=True)
            return {"success": False, "message": str(e)}
