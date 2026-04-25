from pathlib import Path

from src.meta_process import SLAVE_HOST, SLAVE_SSH_KEY, MetaProcessLauncher, MetaProcessSpec, _META_PROCESS_SPECS


def test_meta_process_command_sources_env_before_launching_meta_base():
    launcher = MetaProcessLauncher()

    command = launcher._build_command(launcher._specs["meta.localization"])

    assert "source /opt/astribot_ros/robot_system_ctrl/robot_env.sh" in command
    assert "source /opt/astribot_os/meta/meta_astribot_navigation/install/setup.bash" in command
    assert "source /opt/astribot_os/meta/meta_astribot_localization/install/setup.bash" in command
    assert "cd /opt/astribot_os/meta/meta_astribot_localization" in command
    assert "exec python3 -m meta_base src.api:AstribotLocalization" in command
    assert "configure" not in command
    assert "activate" not in command


def test_navigation_meta_process_command_sets_real_nav_mode():
    launcher = MetaProcessLauncher(
        specs={
            "meta.astribot_navigation": MetaProcessSpec(
                name="meta.astribot_navigation",
                workdir=Path("/opt/astribot_os/meta/meta_astribot_navigation"),
                target="src.api:AstribotNavigation",
                env={"NAV_MODE": "real"},
            )
        }
    )

    command = launcher._build_command(launcher._specs["meta.astribot_navigation"])

    assert "exec env NAV_MODE=real python3 -m meta_base src.api:AstribotNavigation" in command


def test_chassis_twist_bridge_sources_sdk_env_before_launching_script():
    script = Path(
        "/opt/astribot_os/meta/meta_astribot_navigation/src/core/astribot_navigation/src/"
        "astribot_navigation/scripts/move_astribot_chassis_four_wheel_use_twist.py"
    )
    launcher = MetaProcessLauncher(
        specs={
            "chassis.twist_bridge": MetaProcessSpec(
                name="chassis.twist_bridge",
                workdir=script.parent,
                command=("python3", str(script)),
                setup_files=(
                    Path("/opt/astribot_ros/robot_system_ctrl/robot_env.sh"),
                    Path("/opt/astribot_os/meta/astribot_sdk_aarch64/env.sh"),
                ),
                required_paths=(script,),
            )
        }
    )

    command = launcher._build_command(launcher._specs["chassis.twist_bridge"])

    assert "source /opt/astribot_ros/robot_system_ctrl/robot_env.sh" in command
    assert "source /opt/astribot_os/meta/astribot_sdk_aarch64/env.sh" in command
    assert f"exec python3 {script}" in command
    assert "meta_base" not in command
    assert "configure" not in command
    assert "activate" not in command


def test_default_processes_launch_on_slave_with_release_ssh_key():
    for name in ("meta.localization", "meta.astribot_navigation", "chassis.twist_bridge"):
        spec = _META_PROCESS_SPECS[name]
        assert spec.remote_host == SLAVE_HOST
        assert spec.remote_user == "astribot"
        assert spec.ssh_key == SLAVE_SSH_KEY
