"""Meta bridge — astribot_link connection management for Meta services."""
import logging

logger = logging.getLogger(__name__)

# 生命周期状态: Unconfigured → configure → Inactive → activate → Active
META_DISCONNECTED = "disconnected"
META_CONNECTED = "connected"       # link 已连接，未 configure
META_INACTIVE = "inactive"         # 已 configure，未 activate
META_ACTIVE = "active"             # 已 activate，可调用业务方法

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

    def connect_meta(self) -> dict:
        """Connect to Meta services via astribot_link."""
        try:
            from astribot_link import connect
        except ImportError:
            logger.warning("[meta] astribot_link not installed, Meta disabled")
            return {"success": False, "message": "astribot_link not installed"}

        errors = []

        try:
            self._loc = connect("localization")
            self._loc_state = META_CONNECTED
            logger.info("[meta] Connected to localization")
        except Exception as e:
            self._loc = None
            errors.append(f"localization: {e}")
            logger.warning(f"[meta] Failed to connect localization: {e}")

        try:
            self._nav = connect("astribot_navigation")
            self._nav_state = META_CONNECTED
            logger.info("[meta] Connected to astribot_navigation")
        except Exception as e:
            self._nav = None
            errors.append(f"navigation: {e}")
            logger.warning(f"[meta] Failed to connect astribot_navigation: {e}")

        # Sync local state with actual Meta state
        if self.meta_connected:
            self._sync_meta_state()

        if errors:
            return {"success": self.meta_connected,
                    "message": f"Partial: {'; '.join(errors)}"}
        return {"success": True, "message": "Meta connected"}

    def _probe_service_state(self, proxy, name: str) -> str:
        """Probe a Meta service's actual lifecycle state by calling a business method."""
        if proxy is None:
            return META_DISCONNECTED
        try:
            # Try a read-only business method — only works when active
            if name == "localization":
                proxy.get_status()
            else:
                proxy.get_navigation_status()
            return META_ACTIVE
        except Exception as e:
            msg = str(e)
            if "unconfigured" in msg:
                return META_CONNECTED
            if "inactive" in msg:
                return META_INACTIVE
            # Other errors — assume connected but not active
            return META_CONNECTED

    def _sync_meta_state(self):
        """Sync local state with actual Meta service state after connect."""
        if self._loc:
            self._loc_state = self._probe_service_state(self._loc, "localization")
            logger.info(f"[meta] Localization actual state: {self._loc_state}")
        if self._nav:
            self._nav_state = self._probe_service_state(self._nav, "navigation")
            logger.info(f"[meta] Navigation actual state: {self._nav_state}")

    def configure_meta(self, loc_config: dict | None = None,
                       nav_config: dict | None = None) -> dict:
        """Configure Meta services — only if in connected state."""
        if not self.meta_connected:
            return {"success": False, "message": "Meta not connected"}

        results = {}

        if self._loc and self._loc_state == META_CONNECTED:
            try:
                cfg = {**_DEFAULT_LOC_CONFIG, **(loc_config or {})}
                result = self._loc.configure(cfg)
                if hasattr(result, 'value') and result.value == "success":
                    self._loc_state = META_INACTIVE
                    results["localization"] = "configured"
                    logger.info("[meta] Localization configured")
                else:
                    results["localization"] = f"failed: {result}"
                    logger.warning(f"[meta] Localization configure returned: {result}")
            except Exception as e:
                results["localization"] = f"failed: {e}"
                logger.warning(f"[meta] Localization configure failed: {e}")

        if self._nav and self._nav_state == META_CONNECTED:
            try:
                cfg = {**_DEFAULT_NAV_CONFIG, **(nav_config or {})}
                result = self._nav.configure(cfg)
                if hasattr(result, 'value') and result.value == "success":
                    self._nav_state = META_INACTIVE
                    results["navigation"] = "configured"
                    logger.info("[meta] Navigation configured")
                else:
                    results["navigation"] = f"failed: {result}"
                    logger.warning(f"[meta] Navigation configure returned: {result}")
            except Exception as e:
                results["navigation"] = f"failed: {e}"
                logger.warning(f"[meta] Navigation configure failed: {e}")

        return {"success": True, "results": results}

    def activate_meta(self, loc_config: dict | None = None,
                      nav_config: dict | None = None) -> dict:
        """Configure (if needed) + Activate Meta services."""
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

        if self._loc and self._loc_state == META_INACTIVE:
            try:
                result = self._loc.activate()
                if hasattr(result, 'value') and result.value == "success":
                    self._loc_state = META_ACTIVE
                    results["localization"] = "activated"
                    logger.info("[meta] Localization activated")
                else:
                    results["localization"] = f"failed: {result}"
            except Exception as e:
                results["localization"] = f"failed: {e}"
                logger.warning(f"[meta] Localization activate failed: {e}")
        elif self._loc and self._loc_state == META_ACTIVE:
            results["localization"] = "already active"

        if self._nav and self._nav_state == META_INACTIVE:
            try:
                result = self._nav.activate()
                if hasattr(result, 'value') and result.value == "success":
                    self._nav_state = META_ACTIVE
                    results["navigation"] = "activated"
                    logger.info("[meta] Navigation activated")
                else:
                    results["navigation"] = f"failed: {result}"
            except Exception as e:
                results["navigation"] = f"failed: {e}"
                logger.warning(f"[meta] Navigation activate failed: {e}")
        elif self._nav and self._nav_state == META_ACTIVE:
            results["navigation"] = "already active"

        ok = self._loc_state == META_ACTIVE or self._nav_state == META_ACTIVE
        return {"success": ok, "results": results}

    def deactivate_meta(self) -> dict:
        """Deactivate Meta services — on_deactivate()."""
        results = {}

        if self._loc and self._loc_state == META_ACTIVE:
            try:
                self._loc.deactivate()
                self._loc_state = META_INACTIVE
                results["localization"] = "deactivated"
                logger.info("[meta] Localization deactivated")
            except Exception as e:
                results["localization"] = f"failed: {e}"
                logger.warning(f"[meta] Localization deactivate failed: {e}")

        if self._nav and self._nav_state == META_ACTIVE:
            try:
                self._nav.deactivate()
                self._nav_state = META_INACTIVE
                results["navigation"] = "deactivated"
                logger.info("[meta] Navigation deactivated")
            except Exception as e:
                results["navigation"] = f"failed: {e}"
                logger.warning(f"[meta] Navigation deactivate failed: {e}")

        return {"success": True, "results": results}

    def start_meta(self) -> dict:
        """一键启动：connect → configure → activate。"""
        # Step 1: connect
        if not self.meta_connected:
            result = self.connect_meta()
            if not result.get("success") and not self.meta_connected:
                return {"success": False, "message": f"Connect failed: {result.get('message')}"}

        # Step 2: activate (auto-configures if needed)
        return self.activate_meta()

    def get_meta_status(self) -> dict:
        """Return Meta service status for SSE/API."""
        return {
            "meta_connected": self.meta_connected,
            "loc_state": self._loc_state,
            "nav_state": self._nav_state,
        }

    @property
    def meta_connected(self) -> bool:
        return self._loc_state != META_DISCONNECTED or self._nav_state != META_DISCONNECTED
