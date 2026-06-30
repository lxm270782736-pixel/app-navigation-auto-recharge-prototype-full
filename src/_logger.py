"""Centralized ast_logger_v2 wrapper for app_navigation.

All modules in this package should import the shared `logger` from here:

    from ._logger import logger

The process entry point (`src/main.py`) calls `init_logger("app_navigation")`
once at startup to direct logs to `/opt/astribot_ros/log/app_navigation/`.

A stdlib `logging` fallback is provided for environments where
`ast_logger_v2` is not installed (e.g. unit tests, local dev without the
internal PyPI). The fallback emulates the ast_logger_v2 surface used by
this project — `info/warn/error/...`, plus throttling primitives
(`*_every`, `*_c`, `*_once`) and `log_exception`.
"""
from __future__ import annotations

import threading
import time

_INIT_LOCK = threading.RLock()
_INITIALIZED = False


try:
    from ast_logger_v2 import logger as _native_logger  # type: ignore

    logger = _native_logger
    _HAS_NATIVE = True
except ImportError:
    _HAS_NATIVE = False

    # ---- stdlib logging fallback with ast_logger_v2-compatible surface ----
    import logging as _stdlib_logging

    class _FallbackLogger:
        """Subset of ast_logger_v2.logger backed by stdlib logging.

        Implements: trace/debug/info/warn/warning/error/fatal,
        their *_every / *_c / *_once throttled variants, and log_exception.
        Single-string messages only (matches ast_logger_v2 semantics).
        """

        def __init__(self) -> None:
            self._stdlib = _stdlib_logging.getLogger("app_navigation")
            self._throttle_state: dict[tuple, float] = {}
            self._counter_state: dict[tuple, int] = {}
            self._once_state: set[tuple] = set()
            self._state_lock = threading.Lock()

        # ---- init / config ----
        def init(self, module_name: str, options: dict | None = None) -> None:
            global _INITIALIZED
            with _INIT_LOCK:
                if _INITIALIZED:
                    return
                # Match basicConfig style used by the original main.py
                if not _stdlib_logging.getLogger().handlers:
                    _stdlib_logging.basicConfig(
                        level=_stdlib_logging.INFO,
                        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
                    )
                _INITIALIZED = True

        # ---- basic levels ----
        def trace(self, message: str) -> None:  # stdlib has no TRACE → map to DEBUG
            self._stdlib.debug(message)

        def debug(self, message: str) -> None:
            self._stdlib.debug(message)

        def info(self, message: str) -> None:
            self._stdlib.info(message)

        def warn(self, message: str) -> None:
            self._stdlib.warning(message)

        def warning(self, message: str) -> None:
            self._stdlib.warning(message)

        def error(self, message: str) -> None:
            self._stdlib.error(message)

        def fatal(self, message: str) -> None:
            self._stdlib.critical(message)

        # ---- exception helper ----
        def log_exception(self, message: str = "Caught exception") -> None:
            self._stdlib.exception(message)

        # ---- throttling helpers ----
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

        @staticmethod
        def _autokey(kind: str, level: str) -> tuple:
            # ast_logger_v2 default key = (file, line, level, kind). Without
            # source introspection we fall back to (level, kind) which is
            # coarser; explicit key= is preferred at call sites for that
            # reason — and most existing call sites already pass one.
            return ("__auto__", level, kind)

        def _emit_every(self, level: str, interval_ms: int, message: str, key=None) -> None:
            k = ("every", level, key) if key is not None else self._autokey("every", level)
            if self._should_emit_every(k, interval_ms):
                getattr(self, level)(f"[{interval_ms}ms]{message}")

        def _emit_c(self, level: str, count: int, message: str, key=None) -> None:
            k = ("c", level, key) if key is not None else self._autokey("c", level)
            if self._should_emit_c(k, count):
                getattr(self, level)(f"[c{count}]{message}")

        def _emit_once(self, level: str, message: str, key=None) -> None:
            k = ("once", level, key) if key is not None else self._autokey("once", level)
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

    logger = _FallbackLogger()


def init_logger(module_name: str = "app_navigation") -> None:
    """Initialize the global logger.

    Safe to call multiple times — the native ast_logger_v2 will WARN on
    repeated init and the fallback wrapper is idempotent. Call this once
    in the process entry point before any logging happens.

    Default `module_name="app_navigation"` matches the package, putting
    logs under `/opt/astribot_ros/log/app_navigation/`.
    """
    global _INITIALIZED
    with _INIT_LOCK:
        if _INITIALIZED:
            return
        try:
            logger.init(module_name)
        except Exception:
            # init() failures should never block startup — keep going with
            # whatever logger surface is available.
            pass
        _INITIALIZED = True
