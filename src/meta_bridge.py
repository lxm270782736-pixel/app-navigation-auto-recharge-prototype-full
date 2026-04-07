"""Meta bridge — astribot_link connection management for Meta services."""
import logging

logger = logging.getLogger(__name__)

# 生命周期状态: Unconfigured → configure → Inactive → activate → Active
META_DISCONNECTED = "disconnected"
META_CONNECTED = "connected"       # link 已连接，未 configure
META_INACTIVE = "inactive"         # 已 configure，未 activate
META_ACTIVE = "active"             # 已 activate，可调用业务方法


def _is_success(result) -> bool:
    """Check transition result — handles both string and enum (.value) returns."""
    if hasattr(result, 'value'):
        return result.value == "success"
    return result == "success"

# 默认配置
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


class MetaBridgeMixin:
    """Manages astribot_link connections to Meta localization and navigation."""

    def _init_meta(self):
        """Initialize Meta service proxies (call in __init__)."""
        self._loc = None
        self._nav = None
        self._loc_state = META_DISCONNECTED
        self._nav_state = META_DISCONNECTED
        self._recovery_in_progress = False

    def _trigger_auto_recovery(self):
        """Spawn a background thread to re-run start_meta() after a brief delay.

        No-op if a recovery is already in progress.
        """
        import threading
        with self._lock:
            if self._recovery_in_progress:
                logger.info("[meta] Auto-recovery already in progress, skipping")
                return
            self._recovery_in_progress = True

        def _recover():
            import time
            try:
                time.sleep(1.0)
                logger.info("[meta] Auto-recovery: calling start_meta()")
                result = self.start_meta()
                logger.info("[meta] Auto-recovery result: %s", result)
            finally:
                with self._lock:
                    self._recovery_in_progress = False

        threading.Thread(target=_recover, daemon=True, name="meta-auto-recovery").start()

    def _loc_call(self, method_name: str, *args, **kwargs) -> dict:
        """Call a method on the localization Meta proxy.

        Args:
            method_name: Name of the method to call on self._loc.
            *args, **kwargs: Forwarded to the method.

        Returns:
            dict: {"success": bool, ...} — error dict if Meta not active.
        """
        if self._loc_state != "active" or not self._loc:
            return {"success": False, "message": f"Localization Meta not active (state={self._loc_state})"}
        try:
            result = getattr(self._loc, method_name)(*args, **kwargs)
            if result is None:
                return {"success": False, "message": f"{method_name} returned None"}
            return result
        except Exception as e:
            msg = str(e)
            # Sync local state if Meta service was restarted externally,
            # then auto-recover in background.
            if "unconfigured" in msg:
                logger.warning("[loc] %s: service went back to unconfigured, triggering auto-recovery", method_name)
                self._loc_state = META_CONNECTED
                self._trigger_auto_recovery()
            elif "inactive" in msg:
                logger.warning("[loc] %s: service is inactive, triggering auto-recovery", method_name)
                self._loc_state = META_INACTIVE
                self._trigger_auto_recovery()
            else:
                logger.error("[loc] %s failed: %s", method_name, e)
            return {"success": False, "message": msg}

    def _loc_call_timeout(self, method_name: str, timeout: float, *args, **kwargs) -> dict:
        """Call a slow localization method using a dedicated connection with extended timeout.

        Use this instead of _loc_call for operations known to take longer than the
        default connection timeout (e.g. apply_map which reloads map data).
        The temporary connection is always closed in a finally block to prevent leaks.

        Args:
            method_name: Name of the method to call on the localization proxy.
            timeout: Per-connection timeout in seconds.
            *args, **kwargs: Forwarded to the method.

        Returns:
            dict: {"success": bool, ...} — error dict if Meta not active or call fails.
        """
        if self._loc_state != "active":
            return {"success": False, "message": f"Localization Meta not active (state={self._loc_state})"}
        try:
            from astribot_link import connect
        except ImportError:
            return {"success": False, "message": "astribot_link not installed"}

        loc = None
        try:
            loc = connect("localization", timeout=timeout)
            result = getattr(loc, method_name)(*args, **kwargs)
            if result is None:
                return {"success": False, "message": f"{method_name} returned None"}
            return result
        except Exception as e:
            logger.error("[loc] %s (timeout=%.0fs) failed: %s", method_name, timeout, e)
            return {"success": False, "message": str(e)}
        finally:
            if loc is not None:
                try:
                    loc.close()
                except Exception:
                    pass

    def connect_meta(self) -> dict:
        """Connect to Meta localization and navigation services via astribot_link.

        Returns:
            dict: {"success": bool, "message": str}
            success is True if at least one service connected.
        """
        try:
            from astribot_link import connect
        except ImportError:
            logger.warning("[meta] astribot_link not installed, Meta disabled")
            return {"success": False, "message": "astribot_link not installed"}

        errors = []

        try:
            self._loc = connect("meta.localization")
            self._loc_state = META_CONNECTED
            logger.info("[meta] Connected to localization")
        except Exception as e:
            self._loc = None
            errors.append(f"localization: {e}")
            logger.warning("[meta] Failed to connect localization: %s", e)

        try:
            self._nav = connect("meta.astribot_navigation")
            self._nav_state = META_CONNECTED
            logger.info("[meta] Connected to astribot_navigation")
        except Exception as e:
            self._nav = None
            errors.append(f"navigation: {e}")
            logger.warning("[meta] Failed to connect astribot_navigation: %s", e)

        # Sync local state with actual Meta state
        if self.meta_connected:
            self._sync_meta_state()

        if errors:
            return {"success": self.meta_connected,
                    "message": f"Partial: {'; '.join(errors)}"}
        return {"success": True, "message": "Meta connected"}

    def _probe_service_state(self, proxy, name: str) -> str:
        """Probe a Meta service's actual lifecycle state.

        For localization: uses get_status().is_running (not require_active protected,
        but is_running reliably reflects whether on_activate() has been called).
        For navigation: also uses get_status().is_running for consistency.
        """
        if proxy is None:
            return META_DISCONNECTED
        try:
            status = proxy.get_status()
            logger.info("[meta] probe %s: status=%s", name, status)
            # 兼容两种返回格式：is_running 或 running
            is_active = status.get("is_running") or status.get("running", False)
            return META_ACTIVE if is_active else META_CONNECTED
        except Exception as e:
            msg = str(e)
            logger.info("[meta] probe %s → %s", name, msg)
            if "inactive" in msg:
                return META_INACTIVE
            return META_CONNECTED

    def _sync_meta_state(self):
        """Sync local state with actual Meta service state after connect."""
        if self._loc:
            self._loc_state = self._probe_service_state(self._loc, "localization")
            logger.info("[meta] Localization actual state: %s", self._loc_state)
        if self._nav:
            self._nav_state = self._probe_service_state(self._nav, "navigation")
            logger.info("[meta] Navigation actual state: %s", self._nav_state)

    def configure_meta(self, loc_config: dict | None = None,
                       nav_config: dict | None = None) -> dict:
        """Configure Meta services with the given parameters.

        Only takes effect when services are in the connected (unconfigured) state.
        Merges provided values on top of _DEFAULT_LOC_CONFIG / _DEFAULT_NAV_CONFIG.

        Args:
            loc_config: Override keys for localization config (e.g. map_folder, voxel_size).
            nav_config: Override keys for navigation config (e.g. max_linear_velocity).

        Returns:
            dict: {"success": bool, "results": {"localization": str, "navigation": str}}
        """
        if not self.meta_connected:
            return {"success": False, "message": "Meta not connected"}

        results = {}
        logger.info("[meta] configure_meta: loc_state=%s nav_state=%s", self._loc_state, self._nav_state)

        if self._loc and self._loc_state == META_CONNECTED:
            try:
                cfg = {**_DEFAULT_LOC_CONFIG, **(loc_config or {})}
                logger.info("[meta] Configuring localization with: %s", cfg)
                result = self._loc.configure(cfg)
                logger.info("[meta] Localization configure result: %s", result)
                if _is_success(result):
                    self._loc_state = META_INACTIVE
                    results["localization"] = "configured"
                    logger.info("[meta] Localization configured")
                else:
                    results["localization"] = f"failed: {result}"
                    logger.warning("[meta] Localization configure returned: %s", result)
            except Exception as e:
                results["localization"] = f"failed: {e}"
                logger.warning("[meta] Localization configure failed: %s", e)

        if self._nav and self._nav_state == META_CONNECTED:
            try:
                cfg = {**_DEFAULT_NAV_CONFIG, **(nav_config or {})}
                logger.info("[meta] Configuring navigation with: %s", cfg)
                result = self._nav.configure(cfg)
                logger.info("[meta] Navigation configure result: %s", result)
                if _is_success(result):
                    self._nav_state = META_INACTIVE
                    results["navigation"] = "configured"
                    logger.info("[meta] Navigation configured")
                else:
                    results["navigation"] = f"failed: {result}"
                    logger.warning("[meta] Navigation configure returned: %s", result)
            except Exception as e:
                results["navigation"] = f"failed: {e}"
                logger.warning("[meta] Navigation configure failed: %s", e)

        return {"success": True, "results": results}

    def activate_meta(self, loc_config: dict | None = None,
                      nav_config: dict | None = None) -> dict:
        """Configure (if needed) then activate Meta services.

        Skips configure if services are already in inactive/active state.
        Idempotent — safe to call when already active.

        Args:
            loc_config: Optional localization config overrides passed to configure_meta.
            nav_config: Optional navigation config overrides passed to configure_meta.

        Returns:
            dict: {"success": bool, "results": {"localization": str, "navigation": str}}
            success is True if at least one service reached active state.
        """
        if not self.meta_connected:
            return {"success": False, "message": "Meta not connected"}

        # Already active — nothing to do
        if self._loc_state == META_ACTIVE and self._nav_state == META_ACTIVE:
            return {"success": True, "results": {"localization": "already active", "navigation": "already active"}}

        # Auto-configure if still in connected state
        if self._loc_state == META_CONNECTED or self._nav_state == META_CONNECTED:
            cfg_result = self.configure_meta(loc_config, nav_config)
            # Check if any service failed to configure
            cfg_failures = {k: v for k, v in cfg_result.get("results", {}).items()
                           if v.startswith("failed")}
            if cfg_failures and self._loc_state != META_INACTIVE and self._nav_state != META_INACTIVE:
                return {"success": False, "message": f"Configure failed: {cfg_failures}"}

        results = {}
        logger.info("[meta] activate_meta: loc_state=%s nav_state=%s", self._loc_state, self._nav_state)

        if self._loc and self._loc_state == META_INACTIVE:
            try:
                logger.info("[meta] Activating localization...")
                result = self._loc.activate()
                logger.info("[meta] Localization activate result: %s", result)
                if _is_success(result):
                    self._loc_state = META_ACTIVE
                    results["localization"] = "activated"
                    logger.info("[meta] Localization activated")
                else:
                    results["localization"] = f"failed: {result}"
            except Exception as e:
                results["localization"] = f"failed: {e}"
                logger.warning("[meta] Localization activate failed: %s", e)
        elif self._loc and self._loc_state == META_ACTIVE:
            results["localization"] = "already active"

        if self._nav and self._nav_state == META_INACTIVE:
            try:
                logger.info("[meta] Activating navigation...")
                result = self._nav.activate()
                logger.info("[meta] Navigation activate result: %s", result)
                if _is_success(result):
                    self._nav_state = META_ACTIVE
                    results["navigation"] = "activated"
                    logger.info("[meta] Navigation activated")
                else:
                    results["navigation"] = f"failed: {result}"
            except Exception as e:
                results["navigation"] = f"failed: {e}"
                logger.warning("[meta] Navigation activate failed: %s", e)
        elif self._nav and self._nav_state == META_ACTIVE:
            results["navigation"] = "already active"

        ok = self._loc_state == META_ACTIVE or self._nav_state == META_ACTIVE
        return {"success": ok, "results": results}

    def deactivate_meta(self) -> dict:
        """Deactivate active Meta services (localization and navigation).

        Returns:
            dict: {"success": bool, "results": {"localization": str, "navigation": str}}
        """
        results = {}

        if self._loc and self._loc_state == META_ACTIVE:
            try:
                self._loc.deactivate()
                self._loc_state = META_INACTIVE
                results["localization"] = "deactivated"
                logger.info("[meta] Localization deactivated")
            except Exception as e:
                results["localization"] = f"failed: {e}"
                logger.warning("[meta] Localization deactivate failed: %s", e)

        if self._nav and self._nav_state == META_ACTIVE:
            try:
                self._nav.deactivate()
                self._nav_state = META_INACTIVE
                results["navigation"] = "deactivated"
                logger.info("[meta] Navigation deactivated")
            except Exception as e:
                results["navigation"] = f"failed: {e}"
                logger.warning("[meta] Navigation deactivate failed: %s", e)

        return {"success": True, "results": results}

    def start_meta(self) -> dict:
        """One-shot startup: connect → configure → activate.

        Returns:
            dict: {"success": bool, "results": {...}} from activate_meta,
            or {"success": False, "message": str} if connect fails.
        """
        # Step 1: connect
        if not self.meta_connected:
            result = self.connect_meta()
            if not result.get("success") and not self.meta_connected:
                return {"success": False, "message": f"Connect failed: {result.get('message')}"}

        # Step 2: activate (auto-configures if needed)
        return self.activate_meta()

    def get_meta_status(self) -> dict:
        """Return current Meta service lifecycle states.

        Returns:
            dict: {"meta_connected": bool, "loc_state": str, "nav_state": str}
            State values: "disconnected" | "connected" | "inactive" | "active"
        """
        return {
            "meta_connected": self.meta_connected,
            "loc_state": self._loc_state,
            "nav_state": self._nav_state,
        }

    def _meta_call(self, service_name: str, method_name: str, _timeout: float = 30.0, **kwargs) -> dict:
        """Call a method on an arbitrary Meta service proxy.

        Routes to existing proxies when service_name matches known services,
        otherwise opens a temporary astribot_link connection.

        Args:
            service_name: Meta service identifier.
                          "localization" → self._loc
                          "navigation" / "astribot_navigation" → self._nav
                          anything else → temporary astribot_link.connect(service_name)
            method_name: Name of the method to call on the proxy.
            _timeout: Timeout for temporary connection (default 30s).
                      Use keyword argument only, not positional.
            **kwargs: Keyword arguments forwarded to the method.

        Returns:
            dict: {"success": bool, ...} — error dict on failure.
        """
        _NAV_ALIASES = {"navigation", "astribot_navigation"}

        # --- Route to existing proxy ---
        if service_name == "localization":
            return self._loc_call(method_name, **kwargs)

        if service_name in _NAV_ALIASES:
            if self._nav_state != "active" or not self._nav:
                return {"success": False, "message": f"Navigation Meta not active (state={self._nav_state})"}
            try:
                result = getattr(self._nav, method_name)(**kwargs)
                if result is None:
                    return {"success": False, "message": f"{method_name} returned None"}
                return result
            except Exception as e:
                logger.error("[meta_call] nav.%s failed: %s", method_name, e)
                return {"success": False, "message": str(e)}

        # --- Temporary connection for any other Meta service ---
        try:
            from astribot_link import connect
        except ImportError:
            return {"success": False, "message": "astribot_link not installed"}

        proxy = None
        try:
            proxy = connect(service_name, timeout=_timeout)

            # 探测当前状态，按需推进生命周期（不 deactivate，那是服务端自己的事）
            state = self._probe_service_state(proxy, service_name)
            if state == META_CONNECTED:           # unconfigured
                cfg = proxy.configure({})
                if not _is_success(cfg):
                    return {"success": False, "message": f"{service_name} configure failed: {cfg}"}
                state = META_INACTIVE
            if state == META_INACTIVE:
                act = proxy.activate()
                if not _is_success(act):
                    return {"success": False, "message": f"{service_name} activate failed: {act}"}

            result = getattr(proxy, method_name)(**kwargs)
            if result is None:
                return {"success": False, "message": f"{method_name} returned None"}
            return result
        except Exception as e:
            logger.error("[meta_call] %s.%s failed: %s", service_name, method_name, e)
            return {"success": False, "message": str(e)}
        finally:
            if proxy is not None:
                try:
                    proxy.close()
                except Exception:
                    pass

    @property
    def meta_connected(self) -> bool:
        """True if at least one Meta service has been connected (not disconnected)."""
        return self._loc_state != META_DISCONNECTED or self._nav_state != META_DISCONNECTED
