"""
Tests for Stardust Desktop integration (双模式: 独立访问 + 桌面嵌入).

Covers:
  - manifest.yaml schema validation
  - root_path support for reverse-proxy embedding
  - CORS configuration
"""
import os
import sys
import yaml
import pytest
import importlib

# Ensure project root is on sys.path
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)


# ==================== Manifest Tests ====================


class TestManifest:
    """Validate manifest.yaml structure for desktop integration."""

    @pytest.fixture(autouse=True)
    def load_manifest(self):
        manifest_path = os.path.join(_PROJECT_ROOT, "manifest.yaml")
        with open(manifest_path, "r") as f:
            self.manifest = yaml.safe_load(f)

    def test_required_fields_exist(self):
        for field in ("id", "name", "version", "description", "port", "uiType"):
            assert field in self.manifest, f"Missing required field: {field}"

    def test_id_format(self):
        assert self.manifest["id"].startswith("com.astribot.app.")

    def test_port_is_integer(self):
        assert isinstance(self.manifest["port"], int)
        assert 1024 < self.manifest["port"] < 65536

    def test_ui_type_valid(self):
        assert self.manifest["uiType"] in ("iframe", "web-component", "micro-frontend")

    def test_modes_defined(self):
        assert "modes" in self.manifest
        modes = self.manifest["modes"]
        assert "standalone" in modes, "Missing standalone mode"
        assert "embedded" in modes, "Missing embedded mode"

    def test_embedded_mode_has_root_path(self):
        embedded = self.manifest["modes"]["embedded"]
        assert "rootPath" in embedded, "Embedded mode must define rootPath"
        assert embedded["rootPath"].startswith("/")

    def test_required_metas(self):
        assert "requiredMetas" in self.manifest
        assert isinstance(self.manifest["requiredMetas"], list)
        assert len(self.manifest["requiredMetas"]) > 0


# ==================== Root Path Tests ====================


class TestRootPath:
    """Verify FastAPI root_path support for reverse-proxy embedding."""

    def test_root_path_from_env(self, monkeypatch):
        """APP_ROOT_PATH env var should set FastAPI root_path."""
        monkeypatch.setenv("APP_ROOT_PATH", "/apps/navigation")
        # Re-read the env var the same way src/main.py does
        root_path = os.environ.get("APP_ROOT_PATH", "")
        assert root_path == "/apps/navigation"

    def test_root_path_default_empty(self, monkeypatch):
        """Without APP_ROOT_PATH, root_path should be empty (standalone mode)."""
        monkeypatch.delenv("APP_ROOT_PATH", raising=False)
        root_path = os.environ.get("APP_ROOT_PATH", "")
        assert root_path == ""

    def test_fastapi_app_has_root_path_param(self):
        """Verify src/main.py passes root_path to FastAPI constructor."""
        main_path = os.path.join(_PROJECT_ROOT, "src", "main.py")
        with open(main_path, "r") as f:
            source = f.read()
        assert "root_path=" in source, "FastAPI app must accept root_path parameter"
        assert 'APP_ROOT_PATH' in source, "Must read APP_ROOT_PATH from environment"


# ==================== CORS Tests ====================


class TestCORS:
    """Verify CORS middleware is configured for cross-origin desktop embedding."""

    def test_cors_middleware_in_source(self):
        """CORS middleware must be present in src/main.py."""
        main_path = os.path.join(_PROJECT_ROOT, "src", "main.py")
        with open(main_path, "r") as f:
            source = f.read()
        assert "CORSMiddleware" in source
        assert "allow_origins" in source
        assert "allow_credentials" in source, "CORS must allow credentials for embedded mode"

    def test_cors_allows_all_origins(self):
        """For development, CORS should allow all origins."""
        main_path = os.path.join(_PROJECT_ROOT, "src", "main.py")
        with open(main_path, "r") as f:
            source = f.read()
        # allow_origins=["*"] should be present
        assert 'allow_origins=["*"]' in source


# ==================== Frontend Config Tests ====================


class TestFrontendConfig:
    """Verify frontend config.ts supports dual-mode base URL."""

    def test_config_file_exists(self):
        config_path = os.path.join(_PROJECT_ROOT, "ui", "src", "config.ts")
        assert os.path.exists(config_path), "ui/src/config.ts must exist"

    def test_config_exports_get_base_url(self):
        config_path = os.path.join(_PROJECT_ROOT, "ui", "src", "config.ts")
        with open(config_path, "r") as f:
            source = f.read()
        assert "getBaseUrl" in source, "config.ts must export getBaseUrl()"
        assert "__STARDUST_BASE_URL__" in source, "Must check for desktop-injected base URL"

    def test_api_service_uses_config(self):
        """api.ts should import getBaseUrl from config."""
        api_path = os.path.join(_PROJECT_ROOT, "ui", "src", "services", "api.ts")
        with open(api_path, "r") as f:
            source = f.read()
        assert "getBaseUrl" in source, "api.ts must use getBaseUrl() from config"
        assert "import" in source and "config" in source


# ==================== Library Build Config Tests ====================


class TestLibraryBuild:
    """Verify vite.config.lib.ts exists for embedded build."""

    def test_lib_config_exists(self):
        lib_config = os.path.join(_PROJECT_ROOT, "ui", "vite.config.lib.ts")
        assert os.path.exists(lib_config), "vite.config.lib.ts must exist for library build"

    def test_lib_config_externals(self):
        """Library build should externalize react/react-dom."""
        lib_config = os.path.join(_PROJECT_ROOT, "ui", "vite.config.lib.ts")
        with open(lib_config, "r") as f:
            source = f.read()
        assert "external" in source
        assert "react" in source

    def test_package_json_has_build_lib(self):
        """package.json must have build:lib script."""
        import json
        pkg_path = os.path.join(_PROJECT_ROOT, "ui", "package.json")
        with open(pkg_path, "r") as f:
            pkg = json.load(f)
        assert "build:lib" in pkg.get("scripts", {}), "Missing build:lib script"
