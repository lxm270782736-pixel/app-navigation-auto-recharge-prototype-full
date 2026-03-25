"""Multi-waypoint patrol — orchestration + persistence."""
import json
import threading
import time
from pathlib import Path


class PatrolMixin:
    """Multi-waypoint patrol management."""

    _PATROL_CONFIG_DIR = Path(__file__).parent.parent / "saved_nav_configs"
    _PATROL_CONFIG_FILE = _PATROL_CONFIG_DIR / "patrol_active.json"

    def start_patrol(self, waypoints: list[dict], start_index: int = 0) -> dict:
        """Start a multi-waypoint patrol, optionally resuming from start_index."""
        if not waypoints:
            return {"success": False, "message": "No waypoints provided"}
        if start_index < 0 or start_index >= len(waypoints):
            return {"success": False, "message": f"Invalid start_index: {start_index}"}

        with self._lock:
            if self._patrol_active:
                return {"success": False, "message": "Patrol already active"}

            self._patrol_active = True
            self._patrol_waypoints = waypoints
            self._patrol_current_index = start_index
            self._patrol_completed = []
            self._patrol_skipped = []
            self._patrol_status = "navigating"
            self._patrol_error = ""
            self._patrol_started_at = time.time()

        print(f"[patrol] Starting patrol with {len(waypoints)} waypoints from index {start_index}")
        self._save_patrol_config()
        self._navigate_to_current_waypoint()
        return {"success": True, "message": f"Patrol started with {len(waypoints)} waypoints"}

    def stop_patrol(self) -> dict:
        """Stop the active patrol."""
        if self._patrol_local_timer:
            self._patrol_local_timer.cancel()
            self._patrol_local_timer = None
        if self._nav_action_client:
            try:
                self._nav_action_client.cancel_goal()
            except Exception:
                pass
        with self._lock:
            was_active = self._patrol_active
            self._patrol_active = False
            self._patrol_status = "idle"
            self._patrol_current_index = -1
            self._patrol_error = ""
            self._nav_status = "idle"
            self._nav_feedback = {}
        self._delete_patrol_config()
        if was_active:
            print("[patrol] Patrol stopped by user")
        return {"success": True, "message": "Patrol stopped"}

    def get_patrol_status(self) -> dict:
        """Return full patrol state."""
        with self._lock:
            return {
                "active": self._patrol_active,
                "status": self._patrol_status,
                "current_index": self._patrol_current_index,
                "completed": list(self._patrol_completed),
                "skipped": list(self._patrol_skipped),
                "total": len(self._patrol_waypoints),
                "error": self._patrol_error,
                "waypoints": list(self._patrol_waypoints),
            }

    def update_patrol_waypoints(self, waypoints: list[dict]) -> dict:
        """Update waypoint list when patrol is not active."""
        with self._lock:
            if self._patrol_active:
                return {"success": False, "message": "Cannot update while patrol is active"}
            self._patrol_waypoints = waypoints
            self._patrol_completed = []
            self._patrol_skipped = []
        return {"success": True, "message": f"Updated {len(waypoints)} waypoints"}

    def _navigate_to_current_waypoint(self):
        """Send navigation goal for the current patrol waypoint."""
        with self._lock:
            if not self._patrol_active:
                return
            if self._patrol_current_index < 0 or self._patrol_current_index >= len(self._patrol_waypoints):
                return
            wp = self._patrol_waypoints[self._patrol_current_index]
            idx = self._patrol_current_index

        pose = wp.get("pose", {})
        x, y, theta = pose.get("x", 0), pose.get("y", 0), pose.get("theta", 0)
        nav_mode = wp.get("navigationMode", "obstacle_avoidance")
        tasks = wp.get("tasks", [])
        action_config = wp.get("actionConfig")

        print(f"[patrol] Navigating to waypoint {idx + 1}: ({x:.2f}, {y:.2f}, {theta:.2f}) mode={nav_mode}")

        if nav_mode == "local_navigation":
            self.send_local_navigation_goal(x, y, theta)
            with self._lock:
                self._nav_status = "navigating"
            self._patrol_local_timer = threading.Timer(3.0, self._on_local_nav_timeout, args=[idx])
            self._patrol_local_timer.daemon = True
            self._patrol_local_timer.start()
        else:
            config = None
            if action_config and not action_config.get("use_default_config", True):
                config = {k: v for k, v in action_config.items() if k != "use_default_config"}
            self.navigate_to(x, y, theta, config, tasks if tasks else None)

    def _on_local_nav_timeout(self, expected_index: int):
        """Called when local navigation timer fires (simulated completion)."""
        with self._lock:
            if not self._patrol_active:
                return
            if self._patrol_current_index != expected_index:
                return
            self._patrol_completed.append(expected_index)
            self._nav_status = "idle"
            print(f"[patrol] Waypoint {expected_index + 1} (local nav) completed")
        self._advance_patrol()

    def _advance_patrol(self):
        """Move to the next waypoint or finish the patrol."""
        with self._lock:
            if not self._patrol_active:
                return
            next_index = self._patrol_current_index + 1
            total = len(self._patrol_waypoints)

        if next_index < total:
            with self._lock:
                self._patrol_current_index = next_index
            self._save_patrol_config()
            def _send_next():
                time.sleep(1)
                with self._lock:
                    if not self._patrol_active:
                        return
                self._navigate_to_current_waypoint()
            threading.Thread(target=_send_next, daemon=True).start()
        else:
            with self._lock:
                completed_count = len(self._patrol_completed)
                skipped_count = len(self._patrol_skipped)
                self._patrol_status = "succeeded"
                self._patrol_active = False
                self._patrol_current_index = -1
            self._delete_patrol_config()
            print(f"[patrol] Patrol complete: {completed_count} succeeded, {skipped_count} skipped")
            def _reset():
                time.sleep(2)
                with self._lock:
                    if self._nav_status in ("succeeded", "failed"):
                        self._nav_status = "idle"
                        self._nav_feedback = {}
                time.sleep(1)
                with self._lock:
                    if self._patrol_status == "succeeded":
                        self._patrol_status = "idle"
            threading.Thread(target=_reset, daemon=True).start()

    # ------ Persistence ------

    def _save_patrol_config(self):
        """Atomic write of patrol config to disk."""
        try:
            with self._lock:
                config = {
                    "waypoints": self._patrol_waypoints,
                    "current_index": self._patrol_current_index,
                    "completed": list(self._patrol_completed),
                    "skipped": list(self._patrol_skipped),
                    "started_at": self._patrol_started_at,
                    "updated_at": time.time(),
                }
            self._PATROL_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            tmp = self._PATROL_CONFIG_FILE.with_suffix(".tmp")
            with open(tmp, "w") as f:
                json.dump(config, f, indent=2)
            tmp.rename(self._PATROL_CONFIG_FILE)
        except Exception as e:
            print(f"[patrol] Failed to save config: {e}")

    def _load_patrol_config(self) -> dict | None:
        """Load patrol config from disk."""
        try:
            if self._PATROL_CONFIG_FILE.exists():
                with open(self._PATROL_CONFIG_FILE) as f:
                    return json.load(f)
        except Exception as e:
            print(f"[patrol] Failed to load config: {e}")
        return None

    def _delete_patrol_config(self):
        """Remove patrol config file."""
        try:
            if self._PATROL_CONFIG_FILE.exists():
                self._PATROL_CONFIG_FILE.unlink()
        except Exception as e:
            print(f"[patrol] Failed to delete config: {e}")

    def _try_resume_patrol(self):
        """Called at startup to check for saved patrol config.
        Does NOT auto-resume — frontend must call start_patrol to resume."""
        config = self._load_patrol_config()
        if not config:
            return
        waypoints = config.get("waypoints", [])
        current_index = config.get("current_index", -1)
        if not waypoints or current_index < 0 or current_index >= len(waypoints):
            self._delete_patrol_config()
            return
        # Store config for frontend to query, but do NOT activate patrol
        with self._lock:
            self._patrol_waypoints = waypoints
            self._patrol_completed = config.get("completed", [])
            self._patrol_skipped = config.get("skipped", [])
            self._patrol_started_at = config.get("started_at", 0)
            # Keep patrol inactive — frontend decides whether to resume
            self._patrol_active = False
            self._patrol_status = "interrupted"
            self._patrol_current_index = current_index
            self._patrol_error = ""
        print(f"[patrol] Found saved patrol config: index={current_index}, "
              f"completed={len(self._patrol_completed)}, total={len(waypoints)}. "
              f"Waiting for frontend to resume.")
