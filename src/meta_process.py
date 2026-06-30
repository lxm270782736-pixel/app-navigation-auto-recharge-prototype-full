"""Launch required background processes for app_navigation.

This module only starts OS processes. It does not connect, configure, or
activate Meta services; lifecycle control stays in meta_bridge.py.
"""
from __future__ import annotations

import base64
import os
import shlex
import signal
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from ._logger import logger

ROBOT_ENV = Path("/opt/astribot_ros/robot_system_ctrl/robot_env.sh")
NAVIGATION_SETUP = Path("/opt/astribot_os/meta/meta_astribot_navigation/install/setup.bash")
LOCALIZATION_SETUP = Path("/opt/astribot_os/meta/meta_astribot_localization/install/setup.bash")
SDK_ENV = Path("/opt/astribot_os/meta/astribot_sdk_aarch64/env.sh")
SLAVE_HOST = os.environ.get("APP_NAVIGATION_SLAVE_HOST", "192.168.0.11")
SLAVE_USER = os.environ.get("APP_NAVIGATION_SLAVE_USER", "astribot")
SLAVE_SSH_KEY = Path(
    os.environ.get("APP_NAVIGATION_SLAVE_SSH_KEY", "/etc/astribot_config/ssh/master_to_slave_key")
)
CHASSIS_TWIST_SCRIPT = Path(
    "/opt/astribot_os/meta/meta_astribot_navigation/src/core/astribot_navigation/src/"
    "astribot_navigation/scripts/move_astribot_chassis_four_wheel_use_twist.py"
)
LOG_DIR = Path(os.environ.get("APP_NAVIGATION_META_LOG_DIR", "/tmp/app_navigation_meta"))


@dataclass(frozen=True)
class MetaProcessSpec:
    name: str
    workdir: Path
    target: str = ""
    command: tuple[str, ...] = ()
    setup_files: tuple[Path, ...] = (ROBOT_ENV, NAVIGATION_SETUP)
    required_paths: tuple[Path, ...] = ()
    match_pattern: str = ""
    remote_host: str = ""
    remote_user: str = SLAVE_USER
    ssh_key: Path = SLAVE_SSH_KEY
    env: dict[str, str] = field(default_factory=dict)


_META_PROCESS_SPECS = {
    "meta.localization": MetaProcessSpec(
        name="meta.localization",
        workdir=Path("/opt/astribot_os/meta/meta_astribot_localization"),
        target="src.api:AstribotLocalization",
        setup_files=(ROBOT_ENV, NAVIGATION_SETUP, LOCALIZATION_SETUP),
        remote_host=SLAVE_HOST,
    ),
    "meta.astribot_navigation": MetaProcessSpec(
        name="meta.astribot_navigation",
        workdir=Path("/opt/astribot_os/meta/meta_astribot_navigation"),
        target="src.api:AstribotNavigation",
        remote_host=SLAVE_HOST,
        env={"NAV_MODE": "real"},
    ),
    "chassis.twist_bridge": MetaProcessSpec(
        name="chassis.twist_bridge",
        workdir=CHASSIS_TWIST_SCRIPT.parent,
        command=("python3", str(CHASSIS_TWIST_SCRIPT)),
        setup_files=(ROBOT_ENV, SDK_ENV),
        required_paths=(CHASSIS_TWIST_SCRIPT,),
        remote_host=SLAVE_HOST,
    ),
}


class MetaProcessLauncher:
    """Small supervisor for the background processes required by navigation."""

    def __init__(
        self,
        specs: dict[str, MetaProcessSpec] | None = None,
        robot_env: Path = ROBOT_ENV,
        navigation_setup: Path = NAVIGATION_SETUP,
        log_dir: Path = LOG_DIR,
    ) -> None:
        self._specs = specs or _META_PROCESS_SPECS
        self._robot_env = robot_env
        self._navigation_setup = navigation_setup
        self._log_dir = log_dir
        self._processes: dict[str, subprocess.Popen] = {}
        self._remote_pids: dict[str, int] = {}

    def launch_all(self, names: Iterable[str] | None = None) -> dict:
        """Launch selected Meta processes if they are not already running."""
        selected = list(names) if names is not None else list(self._specs)
        results = {}
        for name in selected:
            try:
                results[name] = self.launch(name)
            except Exception as exc:
                logger.log_exception(f"[meta_process] launch failed for {name}")
                results[name] = {"success": False, "running": False, "message": str(exc)}
        return {
            "success": any(item.get("running") for item in results.values()),
            "results": results,
        }

    def launch(self, name: str) -> dict:
        """Launch one known process without activating any Meta lifecycle."""
        spec = self._specs.get(name)
        if spec is None:
            return {"success": False, "running": False, "message": f"Unknown meta process: {name}"}
        if spec.remote_host:
            return self._launch_remote(spec)

        missing = [
            str(path)
            for path in (*spec.setup_files, spec.workdir, *spec.required_paths)
            if not path.exists()
        ]
        if missing:
            return {
                "success": False,
                "running": False,
                "message": f"Missing launch prerequisite(s): {', '.join(missing)}",
            }

        existing_pid = self._find_existing_pid(spec)
        if existing_pid:
            return {
                "success": True,
                "running": True,
                "pid": existing_pid,
                "message": "Already running",
            }

        self._log_dir.mkdir(parents=True, exist_ok=True)
        log_path = self._log_dir / f"{name.replace('.', '_')}.log"
        command = self._build_command(spec)
        log_file = open(log_path, "ab")

        try:
            proc = subprocess.Popen(
                ["bash", "-lc", command],
                cwd=spec.workdir,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        except Exception as exc:
            log_file.close()
            logger.log_exception(f"[meta_process] failed to launch {name}")
            return {"success": False, "running": False, "message": str(exc), "log": str(log_path)}
        finally:
            if not log_file.closed:
                log_file.close()

        self._processes[name] = proc
        time.sleep(0.2)
        if proc.poll() is not None:
            return {
                "success": False,
                "running": False,
                "pid": proc.pid,
                "message": f"Process exited immediately with code {proc.returncode}",
                "log": str(log_path),
            }

        logger.info(f"[meta_process] launched {name} pid={proc.pid}")
        return {"success": True, "running": True, "pid": proc.pid, "log": str(log_path)}

    def status_all(self) -> dict:
        """Return process status for known Meta processes."""
        return {"processes": {name: self.status(name) for name in self._specs}}

    def status(self, name: str) -> dict:
        spec = self._specs.get(name)
        if spec is None:
            return {"running": False, "message": f"Unknown meta process: {name}"}
        if spec.remote_host:
            pid = self._remote_pids.get(name)
            if pid and self._remote_pid_alive(spec, pid):
                return {"running": True, "pid": pid, "managed": True, "host": spec.remote_host}
            existing_pid = self._find_existing_pid(spec)
            if existing_pid:
                return {"running": True, "pid": existing_pid, "managed": False, "host": spec.remote_host}
            return {"running": False, "host": spec.remote_host}

        proc = self._processes.get(name)
        if proc and proc.poll() is None:
            return {"running": True, "pid": proc.pid, "managed": True}

        existing_pid = self._find_existing_pid(spec)
        if existing_pid:
            return {"running": True, "pid": existing_pid, "managed": False}

        return {"running": False}

    def terminate_started(self, timeout: float = 5.0) -> None:
        """Terminate only processes started by this app instance."""
        for name, pid in list(self._remote_pids.items()):
            spec = self._specs.get(name)
            if not spec or not spec.remote_host:
                continue
            logger.info(f"[meta_process] terminating remote {name} pid={pid} host={spec.remote_host}")
            self._terminate_remote(spec, pid, timeout)
            self._remote_pids.pop(name, None)

        for name, proc in list(self._processes.items()):
            if proc.poll() is not None:
                continue
            logger.info(f"[meta_process] terminating {name} pid={proc.pid}")
            try:
                os.killpg(proc.pid, signal.SIGTERM)
                proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    def _launch_remote(self, spec: MetaProcessSpec) -> dict:
        missing = self._remote_missing_prerequisites(spec)
        if missing:
            return {
                "success": False,
                "running": False,
                "host": spec.remote_host,
                "message": f"Missing launch prerequisite(s): {', '.join(missing)}",
            }

        existing_pid = self._find_existing_pid(spec)
        if existing_pid:
            return {
                "success": True,
                "running": True,
                "pid": existing_pid,
                "host": spec.remote_host,
                "message": "Already running",
            }

        remote_log_dir = str(self._log_dir)
        remote_log_path = f"{remote_log_dir}/{spec.name.replace('.', '_')}.log"
        command = self._build_command(spec)
        remote_script = (
            f"mkdir -p {shlex.quote(remote_log_dir)}; "
            f"nohup setsid bash -lc {shlex.quote(command)} "
            f">>{shlex.quote(remote_log_path)} 2>&1 < /dev/null & pid=$!; echo $pid; disown $pid 2>/dev/null || true; exit 0"
        )
        try:
            proc = self._ssh(spec, remote_script, timeout=10)
        except subprocess.TimeoutExpired:
            logger.warn(f"[meta_process] remote launch timed out for {spec.name} on {spec.remote_host}")
            existing_pid = self._find_existing_pid(spec)
            if existing_pid:
                self._remote_pids[spec.name] = existing_pid
                return {
                    "success": True,
                    "running": True,
                    "pid": existing_pid,
                    "host": spec.remote_host,
                    "message": "Launch SSH timed out, but process is running",
                    "log": remote_log_path,
                }
            return {
                "success": False,
                "running": False,
                "host": spec.remote_host,
                "message": "Launch SSH timed out",
                "log": remote_log_path,
            }
        if proc.returncode != 0:
            return {
                "success": False,
                "running": False,
                "host": spec.remote_host,
                "message": (proc.stderr.strip() or proc.stdout.strip() or f"ssh exited {proc.returncode}")[:500],
                "log": remote_log_path,
            }

        try:
            pid = int(proc.stdout.strip().splitlines()[-1])
        except (IndexError, ValueError):
            return {
                "success": False,
                "running": False,
                "host": spec.remote_host,
                "message": f"Could not parse remote pid from: {proc.stdout.strip()}",
                "log": remote_log_path,
            }

        time.sleep(0.2)
        if not self._remote_pid_alive(spec, pid):
            return {
                "success": False,
                "running": False,
                "pid": pid,
                "host": spec.remote_host,
                "message": "Remote process exited immediately",
                "log": remote_log_path,
            }

        self._remote_pids[spec.name] = pid
        logger.info(f"[meta_process] launched remote {spec.name} pid={pid} host={spec.remote_host}")
        return {"success": True, "running": True, "pid": pid, "host": spec.remote_host, "log": remote_log_path}

    def _remote_missing_prerequisites(self, spec: MetaProcessSpec) -> list[str]:
        if not spec.ssh_key.exists():
            return [str(spec.ssh_key)]
        paths = [*spec.setup_files, spec.workdir, *spec.required_paths]
        checks = " && ".join(f"test -e {shlex.quote(str(path))}" for path in paths)
        proc = self._ssh(spec, checks, timeout=10)
        if proc.returncode == 0:
            return []

        missing = []
        for path in paths:
            result = self._ssh(spec, f"test -e {shlex.quote(str(path))}", timeout=5)
            if result.returncode != 0:
                missing.append(str(path))
        return missing

    def _remote_pid_alive(self, spec: MetaProcessSpec, pid: int) -> bool:
        proc = self._ssh(spec, f"kill -0 {int(pid)}", timeout=5)
        return proc.returncode == 0

    def _terminate_remote(self, spec: MetaProcessSpec, pid: int, timeout: float) -> None:
        grace = max(1, int(timeout))
        script = (
            f"kill -TERM -{int(pid)} 2>/dev/null || kill -TERM {int(pid)} 2>/dev/null || true; "
            f"for i in $(seq 1 {grace}); do kill -0 {int(pid)} 2>/dev/null || exit 0; sleep 1; done; "
            f"kill -KILL -{int(pid)} 2>/dev/null || kill -KILL {int(pid)} 2>/dev/null || true"
        )
        self._ssh(spec, script, timeout=grace + 5)

    def _ssh(self, spec: MetaProcessSpec, remote_command: str, timeout: int) -> subprocess.CompletedProcess:
        return subprocess.run(
            [
                "ssh",
                "-n",
                "-i",
                str(spec.ssh_key),
                "-o",
                "BatchMode=yes",
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "UserKnownHostsFile=/tmp/app_navigation_known_hosts",
                f"{spec.remote_user}@{spec.remote_host}",
                remote_command,
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
        )

    def _build_command(self, spec: MetaProcessSpec) -> str:
        env_args = " ".join(f"{key}={shlex.quote(value)}" for key, value in spec.env.items())
        env_prefix = f"env {env_args} " if env_args else ""
        if spec.command:
            command = " ".join(shlex.quote(part) for part in spec.command)
        else:
            command = f"python3 -m meta_base {shlex.quote(spec.target)}"

        return " && ".join(
            [f"source {shlex.quote(str(path))}" for path in spec.setup_files]
            + [
                f"cd {shlex.quote(str(spec.workdir))}",
                f"exec {env_prefix}{command}",
            ]
        )

    def _find_existing_pid(self, spec: MetaProcessSpec) -> int | None:
        if spec.match_pattern:
            pattern = spec.match_pattern
        elif spec.command:
            pattern = " ".join(spec.command)
        else:
            pattern = f"python3 -m meta_base {spec.target}"
        try:
            if spec.remote_host:
                encoded = base64.b64encode(pattern.encode()).decode()
                script = (
                    "python3 -c "
                    + shlex.quote(
                        "import base64, os\n"
                        f"pattern = base64.b64decode({encoded!r}).decode()\n"
                        "self_pid = os.getpid()\n"
                        "for pid in sorted(p for p in os.listdir('/proc') if p.isdigit()):\n"
                        "    if int(pid) == self_pid:\n"
                        "        continue\n"
                        "    try:\n"
                        "        data = open(f'/proc/{pid}/cmdline', 'rb').read().replace(b'\\x00', b' ').decode(errors='ignore')\n"
                        "    except OSError:\n"
                        "        continue\n"
                        "    if pattern in data:\n"
                        "        print(pid)\n"
                        "        raise SystemExit(0)\n"
                        "raise SystemExit(1)\n"
                    )
                )
                result = self._ssh(spec, script, timeout=5)
            else:
                result = subprocess.run(
                    ["pgrep", "-f", pattern],
                    check=False,
                    capture_output=True,
                    text=True,
                )
        except FileNotFoundError:
            return None
        except subprocess.SubprocessError:
            return None
        if result.returncode != 0:
            return None
        for line in result.stdout.splitlines():
            try:
                return int(line.strip())
            except ValueError:
                continue
        return None


meta_process_launcher = MetaProcessLauncher()
