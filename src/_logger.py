"""Centralized logger for app_navigation with version-agnostic surface.

All modules in this package should import the shared `logger` from here:

    from ._logger import logger

The process entry point (`src/main.py`) calls `init_logger("app_navigation")`
once at startup to direct logs to `/opt/astribot_ros/log/app_navigation/`.

Design — why the wrapper:

We can't depend on the throttling primitives (`info_every`, `warn_once`, ...)
being present on the native ast_logger_v2 logger: they were added in 0.1.10,
and older installs are still in the field. The wrapper:

- forwards basic calls (init/info/warn/error/...) to the underlying logger
- locally implements throttling (`*_every` / `*_c` / `*_once`) using the same
  semantics as ast_logger_v2 0.1.10+ — so this code works whether the native
  logger has them or not
- locally implements `log_exception` (traceback) when the native logger lacks it
- aliases `warn` ↔ `warning`

When `ast_logger_v2` is not installed at all (e.g. unit tests on machines
without the internal PyPI), an inner backed by stdlib `logging` is used.
"""
from __future__ import annotations

import threading
import time

_INIT_LOCK = threading.RLock()
_INITIALIZED = False


class _StdlibInner:
    """Stdlib-logging-backed inner with the minimal surface our wrapper expects."""

    def __init__(self) -> None:
        import logging as _stdlib_logging
        self._stdlib = _stdlib_logging.getLogger("app_navigation")

    def init(self, module_name: str, options: dict | None = None) -> None:
        import logging as _stdlib_logging
        if not _stdlib_logging.getLogger().handlers:
            _stdlib_logging.basicConfig(
                level=_stdlib_logging.INFO,
                format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
            )

    def trace(self, message: str) -> None: self._stdlib.debug(message)
    def debug(self, message: str) -> None: self._stdlib.debug(message)
    def info(self, message: str) -> None: self._stdlib.info(message)
    def warn(self, message: str) -> None: self._stdlib.warning(message)
    def warning(self, message: str) -> None: self._stdlib.warning(message)
    def error(self, message: str) -> None: self._stdlib.error(message)
    def fatal(self, message: str) -> None: self._stdlib.critical(message)

    def log_exception(self, message: str = "Caught exception") -> None:
        self._stdlib.exception(message)


class _LoggerWrapper:
    """Version-agnostic wrapper providing a unified surface over any inner logger.

    Delegates basic logging and `init` to the inner via explicit methods (so
    `warn`/`warning` and missing `trace`/`fatal` are normalized), and locally
    implements throttling primitives so they work regardless of the inner's
    version. Anything else (e.g. `install_exception_hooks`, custom helpers)
    falls through to the inner via __getattr__.
    """

    def __init__(self, inner) -> None:
        self._inner = inner
        self._throttle_state: dict = {}
        self._counter_state: dict = {}
        self._once_state: set = set()
        self._state_lock = threading.Lock()

    # Forward unknown attrs to the wrapped logger (covers `install_exception_hooks`,
    # `get_config`, native helpers, etc.).
    def __getattr__(self, name: str):
        return getattr(self._inner, name)

    # ---- init ----
    def init(self, module_name: str, options: dict | None = None):
        if hasattr(self._inner, "init"):
            try:
                return self._inner.init(module_name, options) if options is not None else self._inner.init(module_name)
            except TypeError:
                # Older signature without `options`
                return self._inner.init(module_name)

    # ---- basic levels (normalize warn/warning, fall back trace/fatal) ----
    def trace(self, message: str) -> None:
        fn = getattr(self._inner, "trace", None) or self._inner.debug
        fn(message)

    def debug(self, message: str) -> None:
        self._inner.debug(message)

    def info(self, message: str) -> None:
        self._inner.info(message)

    def warn(self, message: str) -> None:
        fn = getattr(self._inner, "warn", None) or getattr(self._inner, "warning")
        fn(message)

    def warning(self, message: str) -> None:
        self.warn(message)

    def error(self, message: str) -> None:
        self._inner.error(message)

    def fatal(self, message: str) -> None:
        fn = (getattr(self._inner, "fatal", None)
              or getattr(self._inner, "critical", None)
              or self._inner.error)
        fn(message)

    # ---- log_exception (always supply traceback) ----
    def log_exception(self, message: str = "Caught exception") -> None:
        if hasattr(self._inner, "log_exception"):
            self._inner.log_exception(message)
            return
        if hasattr(self._inner, "exception"):
            self._inner.exception(message)
            return
        import traceback
        self.error(f"{message}\n{traceback.format_exc()}")

    # ---- throttling primitives — local implementation, version-independent ----
    def _should_emit_every(self, key: tuple, interval_ms: int) -> bool:
        if interval_ms <= 0:
            return True
        now = time.monotonic() * 1000.0
        with self._state_lock:
            last = self._throttle_state.get(key, 0.0)
            if now - last >= interval_ms:
                self._throttle_state[key] = now
                return True
        return False

    def _should_emit_c(self, key: tuple, count: int) -> bool:
        if count <= 1:
            return True
        with self._state_lock:
            n = self._counter_state.get(key, 0)
            self._counter_state[key] = n + 1
            return n % count == 0

    def _should_emit_once(self, key: tuple) -> bool:
        with self._state_lock:
            if key in self._once_state:
                return False
            self._once_state.add(key)
            return True

    def _emit_every(self, level: str, interval_ms: int, message: str, key) -> None:
        k = ("every", level, key) if key is not None else ("__auto__", "every", level)
        if self._should_emit_every(k, interval_ms):
            getattr(self, level)(f"[{interval_ms}ms]{message}")

    def _emit_c(self, level: str, count: int, message: str, key) -> None:
        k = ("c", level, key) if key is not None else ("__auto__", "c", level)
        if self._should_emit_c(k, count):
            getattr(self, level)(f"[c{count}]{message}")

    def _emit_once(self, level: str, message: str, key) -> None:
        k = ("once", level, key) if key is not None else ("__auto__", "once", level)
        if self._should_emit_once(k):
            getattr(self, level)(f"[once]{message}")

    # ---- generated *_every / *_c / *_once ----
    def trace_every(self, interval_ms: int, message: str, *, key=None) -> None:
        self._emit_every("trace", interval_ms, message, key)
    def debug_every(self, interval_ms: int, message: str, *, key=None) -> None:
        self._emit_every("debug", interval_ms, message, key)
    def info_every(self, interval_ms: int, message: str, *, key=None) -> None:
        self._emit_every("info", interval_ms, message, key)
    def warn_every(self, interval_ms: int, message: str, *, key=None) -> None:
        self._emit_every("warn", interval_ms, message, key)
    def warning_every(self, interval_ms: int, message: str, *, key=None) -> None:
        self._emit_every("warn", interval_ms, message, key)
    def error_every(self, interval_ms: int, message: str, *, key=None) -> None:
        self._emit_every("error", interval_ms, message, key)

    def trace_c(self, count: int, message: str, *, key=None) -> None:
        self._emit_c("trace", count, message, key)
    def debug_c(self, count: int, message: str, *, key=None) -> None:
        self._emit_c("debug", count, message, key)
    def info_c(self, count: int, message: str, *, key=None) -> None:
        self._emit_c("info", count, message, key)
    def warn_c(self, count: int, message: str, *, key=None) -> None:
        self._emit_c("warn", count, message, key)
    def warning_c(self, count: int, message: str, *, key=None) -> None:
        self._emit_c("warn", count, message, key)
    def error_c(self, count: int, message: str, *, key=None) -> None:
        self._emit_c("error", count, message, key)

    def trace_once(self, message: str, *, key=None) -> None:
        self._emit_once("trace", message, key)
    def debug_once(self, message: str, *, key=None) -> None:
        self._emit_once("debug", message, key)
    def info_once(self, message: str, *, key=None) -> None:
        self._emit_once("info", message, key)
    def warn_once(self, message: str, *, key=None) -> None:
        self._emit_once("warn", message, key)
    def warning_once(self, message: str, *, key=None) -> None:
        self._emit_once("warn", message, key)
    def error_once(self, message: str, *, key=None) -> None:
        self._emit_once("error", message, key)


# Pick the inner backend at import time and wrap it.
try:
    from ast_logger_v2 import logger as _native_logger  # type: ignore
    _inner = _native_logger
except ImportError:
    _inner = _StdlibInner()

logger = _LoggerWrapper(_inner)


def init_logger(module_name: str = "app_navigation") -> None:
    """Initialize the global logger.

    Safe to call multiple times. Call once in the process entry point before
    any logging happens. Default `module_name="app_navigation"` matches the
    package, putting logs under `/opt/astribot_ros/log/app_navigation/`.
    """
    global _INITIALIZED
    with _INIT_LOCK:
        if _INITIALIZED:
            return
        try:
            logger.init(module_name)
        except Exception:
            # init() failures should never block startup.
            pass
        _INITIALIZED = True
