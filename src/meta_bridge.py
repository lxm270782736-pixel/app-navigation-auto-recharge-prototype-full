"""Meta bridge — unified Meta service registry with persistent connections.

All services (startup or on-demand) maintain persistent connections after first use.
Service list and startup configuration driven by saved_nav_configs/meta_services.json.
"""
import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ._utils import log_throttled

logger = logging.getLogger(__name__)

# Meta lifecycle states (align with meta_base standard)
META_DISCONNECTED = "disconnected"   # astribot_link not connected
META_UNCONFIGURED = "unconfigured"   # connected, not yet configured
META_INACTIVE     = "inactive"       # configured, not yet activated
META_ACTIVE       = "active"         # activated, ready for business calls
META_FINALIZED    = "finalized"      # shutdown, non-recoverable

# Backward compat alias
META_CONNECTED = META_UNCONFIGURED

_SERVICES_CONFIG_FILE = Path(__file__).parent.parent / "saved_nav_configs" / "meta_services.json"

# Fallback default configs (used when meta_services.json is absent)
_DEFAULT_LOC_CONFIG = {
    "map_folder": "map_default",
    "map_name": "map_default.pcd",
    "map_optimize_en": False,
    "lidar_topic": "/livox/lidar",
    "imu_topic": "/livox/imu",
    "auto_relocalization": True,
    "voxel_size": 0.2,
}
_DEFAULT_NAV_CONFIG = {
    "map_path": "",
    "max_linear_velocity": 0.3,
    "max_angular_velocity": 0.5,
    "safety_distance": 0.4,
    "planning_frequency": 5,
    "control_frequency": 10,
}
_DEFAULT_LIDAR_CONFIG = {
    "user_config_path": "",
    "publish_freq": 10.0,
    "xfer_format": 0,
    "multi_topic": 1,
    "data_src": 0,
    "output_data_type": 0,
    "frame_id": "livox_frame",
}
_DEFAULT_SERVICES = [
    {"name": "meta.localization",        "startup": True,  "config": _DEFAULT_LOC_CONFIG},
    {"name": "meta.astribot_navigation", "startup": True,  "config": _DEFAULT_NAV_CONFIG},
    {"name": "meta.lidar",               "startup": True,  "config": _DEFAULT_LIDAR_CONFIG},
    {"name": "meta.detection",           "startup": True,  "config": {"simulated": True}},
    {"name": "meta.sales_replay",        "startup": False, "config": {}},
    {"name": "meta.sales_audio",         "startup": False, "config": {}},
    {"name": "meta.camera",              "startup": False, "config": {}},
]


def _is_success(result) -> bool:
    """Check transition result — handles string, dict, and enum (.value) returns."""
    if hasattr(result, 'value'):
        return result.value == "success"
    if isinstance(result, dict):
        return result.get("success", False)
    return result == "success"


@dataclass
class MetaServiceEntry:
    """Registry entry for one Meta service."""
    name: str
    proxy: Any = None                    # astribot_link proxy, None if not connected
    state: str = META_DISCONNECTED       # current lifecycle state
    config: dict = field(default_factory=dict)  # passed to .configure()
    startup: bool = False                # included in one-click start_meta()
    deactivate_after_step: bool = False  # 服务级默认：步骤完成后是否 deactivate
    _lock: Any = field(default_factory=threading.Lock, repr=False)


class MetaBridgeMixin:
    """Unified Meta service registry — persistent connections, config-driven startup."""

    # =================== Init ===================

    def _init_meta(self):
        """Initialize service registry. Call in __init__."""
        self._services: dict[str, MetaServiceEntry] = {}
        self._recovery_in_progress: dict[str, bool] = {}
        self._load_service_configs()

    def _load_service_configs(self):
        """Load service definitions from meta_services.json (fallback to defaults)."""
        service_defs = _DEFAULT_SERVICES
        try:
            with open(_SERVICES_CONFIG_FILE) as f:
                data = json.load(f)
            service_defs = data.get("services", _DEFAULT_SERVICES)
            logger.info("[meta] Loaded %d service configs from %s", len(service_defs), _SERVICES_CONFIG_FILE)
        except FileNotFoundError:
            logger.debug("[meta] meta_services.json not found, using defaults")
        except Exception as e:
            logger.warning("[meta] Failed to load meta_services.json: %s, using defaults", e)

        for svc in service_defs:
            name = svc["name"]
            self._services[name] = MetaServiceEntry(
                name=name,
                config=svc.get("config", {}),
                startup=svc.get("startup", False),
                deactivate_after_step=svc.get("deactivate_after_step", False),
            )

    # =================== Core: ensure active ===================

    def _ensure_service_active(self, name: str) -> MetaServiceEntry | None:
        """Idempotently bring a service to active state: connect → configure → activate.

        Returns the entry if active, None on failure.
        Creates a transient entry if service is not in registry (on-demand unknown service).
        """
        if name not in self._services:
            self._services[name] = MetaServiceEntry(name=name, startup=False)

        entry = self._services[name]

        with entry._lock:
            # Already active
            if entry.state == META_ACTIVE and entry.proxy is not None:
                return entry

            # Connect if not connected
            if entry.proxy is None or entry.state == META_DISCONNECTED:
                try:
                    from astribot_link import connect
                    entry.proxy = connect(name)
                    entry.state = META_UNCONFIGURED  # will probe below
                    logger.info("[meta] Connected to %s", name)
                except ImportError:
                    logger.warning("[meta] astribot_link not installed")
                    return None
                except Exception as e:
                    logger.warning("[meta] Failed to connect %s: %s", name, e)
                    entry.proxy = None
                    entry.state = META_DISCONNECTED
                    return None

            # Probe actual state
            actual = self._probe_service_state(entry.proxy, name)
            entry.state = actual

            # Probe 超时等失败 → 丢弃 proxy，让下次重连（避免持续 probe 僵尸连接）
            if actual == META_DISCONNECTED:
                try:
                    if hasattr(entry.proxy, 'close'):
                        entry.proxy.close()
                except Exception:
                    pass
                entry.proxy = None
                return None

            # Configure if unconfigured
            if entry.state == META_UNCONFIGURED:
                try:
                    result = entry.proxy.configure(entry.config)
                    logger.info("[meta] %s.configure() → %s", name, result)
                    if not _is_success(result):
                        logger.error("[meta] %s configure failed: %s", name, result)
                        return None
                    entry.state = META_INACTIVE
                except Exception as e:
                    logger.error("[meta] %s configure error: %s", name, e)
                    return None

            # Activate if inactive
            if entry.state == META_INACTIVE:
                try:
                    result = entry.proxy.activate()
                    logger.info("[meta] %s.activate() → %s", name, result)
                    if not _is_success(result):
                        logger.error("[meta] %s activate failed: %s", name, result)
                        return None
                    entry.state = META_ACTIVE
                except Exception as e:
                    logger.error("[meta] %s activate error: %s", name, e)
                    return None

            if entry.state == META_ACTIVE:
                return entry
            return None

    def _call_service(self, name: str, method_name: str, **kwargs) -> dict:
        """Unified call: ensure service active, then invoke method (keyword args only)."""
        return self._call_service_with_args(name, method_name, **kwargs)

    def _call_service_with_args(self, name: str, method_name: str, *args, **kwargs) -> dict:
        """Unified call with positional + keyword arg support.

        Auto-reconnects if service restarted (unconfigured/inactive error).
        Gracefully returns error dict if service unavailable.
        """
        entry = self._ensure_service_active(name)
        if entry is None:
            return {"success": False, "message": f"{name} unavailable"}

        try:
            log_throttled(logger, f"meta_call.{name}.{method_name}", 5.0, "info",
                          "[meta_call] Calling %s.%s()", name, method_name)
            result = getattr(entry.proxy, method_name)(*args, **kwargs)
            if result is None:
                return {"success": False, "message": f"{method_name} returned None"}
            return result
        except Exception as e:
            return self._handle_call_error(entry, method_name, e, *args, **kwargs)

    def _handle_call_error(self, entry: 'MetaServiceEntry', method_name: str,
                           error: Exception, *args, **kwargs) -> dict:
        """Handle unconfigured/inactive errors with auto-recovery or inline retry."""
        msg = str(error)
        new_state = None
        if "unconfigured" in msg:
            new_state = META_UNCONFIGURED
        elif "inactive" in msg:
            new_state = META_INACTIVE

        if new_state:
            logger.warning("[meta] %s went to %s, re-activating", entry.name, new_state)
            with entry._lock:
                entry.state = new_state
            if entry.startup:
                self._trigger_auto_recovery(entry.name)
            else:
                entry2 = self._ensure_service_active(entry.name)
                if entry2:
                    try:
                        result = getattr(entry2.proxy, method_name)(*args, **kwargs)
                        return result if result is not None else {"success": False, "message": "returned None"}
                    except Exception as e2:
                        return {"success": False, "message": str(e2)}
        else:
            logger.error("[meta] %s.%s failed: %s", entry.name, method_name, error)
        return {"success": False, "message": msg}

    # =================== Auto-recovery ===================

    def _trigger_auto_recovery(self, name: str | None = None):
        """Spawn background thread to re-activate a service (or all startup services)."""
        with self._lock:
            key = name or "_all"
            if self._recovery_in_progress.get(key):
                logger.info("[meta] Recovery already in progress for %s, skipping", key)
                return
            self._recovery_in_progress[key] = True

        def _recover():
            try:
                time.sleep(1.0)
                if name:
                    logger.info("[meta] Auto-recovery: re-activating %s", name)
                    self._ensure_service_active(name)
                else:
                    logger.info("[meta] Auto-recovery: re-activating all startup services")
                    self.start_meta()
            finally:
                with self._lock:
                    self._recovery_in_progress.pop(key, None)

        threading.Thread(target=_recover, daemon=True, name=f"meta-recovery-{name or 'all'}").start()

    # =================== Probe ===================

    def _probe_service_state(self, proxy, name: str) -> str:
        """Probe actual lifecycle state via get_status()."""
        if proxy is None:
            return META_DISCONNECTED
        try:
            status = proxy.get_status()
            logger.info("[meta] probe %s: status=%s", name, status)
            state_str = status.get("state", "")
            if state_str == "active":       return META_ACTIVE
            if state_str == "inactive":     return META_INACTIVE
            if state_str == "unconfigured": return META_UNCONFIGURED
            if state_str == "finalized":    return META_FINALIZED
            return META_UNCONFIGURED
        except Exception as e:
            msg = str(e)
            logger.info("[meta] probe %s → exception: %s", name, msg)
            if "inactive"     in msg: return META_INACTIVE
            if "unconfigured" in msg: return META_UNCONFIGURED
            return META_DISCONNECTED

    # =================== Public API ===================

    def start_meta(self) -> dict:
        """One-click startup: activate all startup=True services concurrently."""
        startup = [(n, e) for n, e in self._services.items() if e.startup]
        if not startup:
            return {"success": False, "results": {}}
        results = {}
        with ThreadPoolExecutor(max_workers=len(startup)) as pool:
            futures = {pool.submit(self._ensure_service_active, n): n for n, _ in startup}
            for f in as_completed(futures):
                name = futures[f]
                short = name.split(".")[-1]
                try:
                    results[short] = "active" if f.result() else "failed"
                except Exception as e:
                    results[short] = f"failed: {e}"
        ok = any(v == "active" for v in results.values())
        return {"success": ok, "results": results}

    def connect_meta(self) -> dict:
        """Connect all startup services (without configuring/activating)."""
        try:
            from astribot_link import connect
        except ImportError:
            return {"success": False, "message": "astribot_link not installed"}

        errors = []
        for name, entry in self._services.items():
            if not entry.startup:
                continue
            if entry.proxy is not None:
                continue
            try:
                entry.proxy = connect(name)
                entry.state = self._probe_service_state(entry.proxy, name)
                logger.info("[meta] Connected to %s (state=%s)", name, entry.state)
            except Exception as e:
                errors.append(f"{name}: {e}")
                logger.warning("[meta] Failed to connect %s: %s", name, e)

        connected = any(e.proxy is not None for e in self._services.values() if e.startup)
        if errors:
            return {"success": connected, "message": f"Partial: {'; '.join(errors)}"}
        return {"success": True, "message": "Meta connected"}

    def activate_meta(self) -> dict:
        """Activate all startup services (auto-configures if needed)."""
        return self.start_meta()

    def deactivate_meta(self) -> dict:
        """Deactivate all active services concurrently (regardless of startup flag)."""
        targets = [
            (name, entry) for name, entry in self._services.items()
            if entry.state == META_ACTIVE and entry.proxy
        ]
        if not targets:
            return {"success": True, "results": {}}

        def _deactivate_one(item):
            name, entry = item
            short = name.split(".")[-1]
            try:
                entry.proxy.deactivate()
                entry.state = META_INACTIVE
                logger.info("[meta] %s deactivated", name)
                return short, "deactivated"
            except Exception as e:
                logger.warning("[meta] %s deactivate failed: %s", name, e)
                return short, f"failed: {e}"

        results = {}
        with ThreadPoolExecutor(max_workers=len(targets)) as pool:
            for short, state in pool.map(_deactivate_one, targets):
                results[short] = state
        return {"success": True, "results": results}

    def get_services_config(self) -> dict:
        """返回当前服务配置（派生自内存 _services）。"""
        return {
            "services": [
                {
                    "name": entry.name,
                    "startup": entry.startup,
                    "deactivate_after_step": entry.deactivate_after_step,
                    "config": dict(entry.config),
                }
                for entry in self._services.values()
            ]
        }

    def update_services_config(self, services: list) -> dict:
        """写入新的 services 配置到 meta_services.json 并刷新内存。
        注意：已 active 的服务运行状态不受影响，config 字段需下次 deactivate→reactivate 才生效。
        """
        # 校验
        seen = set()
        for svc in services:
            if not isinstance(svc, dict):
                return {"success": False, "message": "Each service must be an object"}
            name = svc.get("name", "")
            if not name.startswith("meta."):
                return {"success": False, "message": f"Service name must start with 'meta.': {name}"}
            if name in seen:
                return {"success": False, "message": f"Duplicate service name: {name}"}
            seen.add(name)
            if not isinstance(svc.get("startup", False), bool):
                return {"success": False, "message": f"{name}: startup must be bool"}
            if not isinstance(svc.get("config", {}), dict):
                return {"success": False, "message": f"{name}: config must be dict"}

        data = {"services": services}
        try:
            _SERVICES_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
            tmp = _SERVICES_CONFIG_FILE.with_suffix(".tmp")
            with open(tmp, "w") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            tmp.rename(_SERVICES_CONFIG_FILE)
        except Exception as e:
            return {"success": False, "message": f"Write failed: {e}"}

        # 刷新内存：保留已有 entry 的 proxy/state，只更新 config/startup
        for svc in services:
            name = svc["name"]
            if name in self._services:
                entry = self._services[name]
                entry.config = svc.get("config", {})
                entry.startup = svc.get("startup", False)
                entry.deactivate_after_step = svc.get("deactivate_after_step", False)
            else:
                self._services[name] = MetaServiceEntry(
                    name=name,
                    config=svc.get("config", {}),
                    startup=svc.get("startup", False),
                    deactivate_after_step=svc.get("deactivate_after_step", False),
                )
        return {"success": True, "message": "Saved. Restart service or deactivate→activate to apply config changes."}

    def get_service_deactivate_default(self, service_name: str) -> bool:
        """查询服务级默认 deactivate_after_step 策略。"""
        entry = self._services.get(service_name)
        return entry.deactivate_after_step if entry else False

    def get_meta_status(self, refresh: bool = False) -> dict:
        """Return state of all registered services.

        Args:
            refresh: If True, re-probe each connected proxy's real lifecycle
                state (handles meta-side restart where cached state is stale).
        """
        if refresh:
            for name, entry in self._services.items():
                if entry.proxy is None:
                    continue
                probed = self._probe_service_state(entry.proxy, name)
                if probed != entry.state:
                    logger.info("[meta] refresh %s: %s → %s", name, entry.state, probed)
                entry.state = probed
                if probed == META_DISCONNECTED:
                    try:
                        if hasattr(entry.proxy, 'close'):
                            entry.proxy.close()
                    except Exception:
                        pass
                    entry.proxy = None
        alias_by_name = {
            "meta.localization": "loc_state",
            "meta.astribot_navigation": "nav_state",
            "meta.detection": "fall_state",
        }
        status = {
            "meta_connected": self.meta_connected,
            "services": [
                {"name": entry.name, "state": entry.state, "startup": entry.startup}
                for entry in self._services.values()
            ],
        }
        for name, entry in self._services.items():
            short = name.split(".")[-1]
            status[f"{short}_state"] = entry.state
            alias = alias_by_name.get(name)
            if alias:
                status[alias] = entry.state
        # Ensure backward-compat keys always present
        status.setdefault("loc_state", META_DISCONNECTED)
        status.setdefault("nav_state", META_DISCONNECTED)
        status.setdefault("lidar_state", META_DISCONNECTED)
        status.setdefault("fall_state", META_DISCONNECTED)
        return status

    # =================== Single service control ===================

    def _ctrl_service(self, name: str, action: str) -> dict:
        """start or stop a named service."""
        if action == "start":
            e = self._ensure_service_active(name)
            return {"success": bool(e), "state": e.state if e else META_DISCONNECTED}
        elif action == "stop":
            entry = self._services.get(name)
            if not entry or entry.state != META_ACTIVE or not entry.proxy:
                return {"success": False, "message": f"{name} not active"}
            try:
                entry.proxy.deactivate()
                entry.state = META_INACTIVE
                return {"success": True, "state": META_INACTIVE}
            except Exception as e:
                return {"success": False, "message": str(e)}
        return {"success": False, "message": f"Unknown action: {action}"}

    def start_localization(self) -> dict:
        return self._ctrl_service("meta.localization", "start")

    def stop_localization(self) -> dict:
        return self._ctrl_service("meta.localization", "stop")

    def start_navigation(self) -> dict:
        return self._ctrl_service("meta.astribot_navigation", "start")

    def stop_navigation(self) -> dict:
        return self._ctrl_service("meta.astribot_navigation", "stop")

    def start_detection(self) -> dict:
        return self._ctrl_service("meta.detection", "start")

    def stop_detection(self) -> dict:
        return self._ctrl_service("meta.detection", "stop")

    def start_lidar(self) -> dict:
        return self._ctrl_service("meta.lidar", "start")

    def stop_lidar(self) -> dict:
        return self._ctrl_service("meta.lidar", "stop")

    # =================== Backward-compat call methods ===================

    def _loc_call(self, method_name: str, *args, **kwargs) -> dict:
        """Localization shorthand — delegates to unified call with positional arg support."""
        return self._call_service_with_args("meta.localization", method_name, *args, **kwargs)

    def _detection_call(self, method_name: str, **kwargs) -> dict:
        return self._call_service("meta.detection", method_name, **kwargs)

    def _loc_call_timeout(self, method_name: str, timeout: float, *args, **kwargs) -> dict:
        """Call localization with extended timeout (uses fresh temp connection)."""
        entry = self._services.get("meta.localization")
        if not entry or entry.state != META_ACTIVE:
            return {"success": False, "message": f"Localization not active"}
        try:
            from astribot_link import connect
        except ImportError:
            return {"success": False, "message": "astribot_link not installed"}
        loc = None
        try:
            loc = connect("meta.localization", timeout=timeout)
            result = getattr(loc, method_name)(*args, **kwargs)
            return result if result is not None else {"success": False, "message": "returned None"}
        except Exception as e:
            logger.error("[loc] %s (timeout=%.0fs) failed: %s", method_name, timeout, e)
            return {"success": False, "message": str(e)}
        finally:
            if loc:
                try: loc.close()
                except Exception: pass


    # =================== Backward-compat properties ===================

    @property
    def _loc(self):
        e = self._services.get("meta.localization")
        return e.proxy if e else None

    @property
    def _loc_state(self) -> str:
        e = self._services.get("meta.localization")
        return e.state if e else META_DISCONNECTED

    @_loc_state.setter
    def _loc_state(self, value: str):
        e = self._services.get("meta.localization")
        if e: e.state = value

    @property
    def _nav(self):
        e = self._services.get("meta.astribot_navigation")
        return e.proxy if e else None

    @property
    def _nav_state(self) -> str:
        e = self._services.get("meta.astribot_navigation")
        return e.state if e else META_DISCONNECTED

    @_nav_state.setter
    def _nav_state(self, value: str):
        e = self._services.get("meta.astribot_navigation")
        if e: e.state = value

    @property
    def _detection(self):
        e = self._services.get("meta.detection")
        return e.proxy if e else None

    @property
    def _detection_state(self) -> str:
        e = self._services.get("meta.detection")
        return e.state if e else META_DISCONNECTED

    @_detection_state.setter
    def _detection_state(self, value: str):
        e = self._services.get("meta.detection")
        if e: e.state = value

    @property
    def _lidar_state(self) -> str:
        e = self._services.get("meta.lidar")
        return e.state if e else META_DISCONNECTED

    @property
    def meta_connected(self) -> bool:
        """True if at least one startup service is not disconnected."""
        return any(
            e.state != META_DISCONNECTED
            for e in self._services.values()
            if e.startup
        )
