#!/bin/bash
SCRIPT_DIR="$(dirname "$0")"
"$SCRIPT_DIR/kill_all.sh"
terminator &
TERM_PID=$!
sleep 2

# terminator 退出时自动清理所有子进程（延迟3秒，避免与重启时的 kill_all 竞争）
(
    while kill -0 $TERM_PID 2>/dev/null; do sleep 1; done
    sleep 3
    # 如果已有新 terminator 启动，说明是重启，不需要清理
    if pgrep -f "terminator" > /dev/null 2>&1; then
        exit 0
    fi
    "$SCRIPT_DIR/kill_all.sh"
) &
disown
################################
# Terminal 1 (左上)
################################
xdotool type "cd /home/instellar/Documents/Codes/Planning/meta_astribot_navigation/"
xdotool key Return
xdotool type "source install/setup.bash"
xdotool key Return
xdotool type "NAV_MODE=sim python3 -m meta_base src.api:AstribotNavigation"
xdotool key Return
################################
# 创建右侧列
################################
sleep 1
xdotool key Ctrl+Shift+E
sleep 1
################################
# 回到左列 → 创建左下
################################
xdotool key Alt+Left
sleep 0.5
xdotool key Ctrl+Shift+O
sleep 1
################################
# Terminal 2 (左下)
################################
xdotool type "/home/instellar/Documents/Codes/Planning/meta_astribot_navigation/"
xdotool key Return
xdotool type "source install/setup.bash"
xdotool key Return
xdotool type "ros2 launch webots_mechanum webots_mecanum.launch.py"
xdotool key Return

sleep 10
################################
# 切换到右列
################################
sleep 1
xdotool key Alt+Right
sleep 0.5
################################
# Terminal 3 (右上)
################################
xdotool type "cd /home/instellar/Documents/Codes/Planning/meta_astribot_localization/"
xdotool key Return
xdotool type "source install/setup.bash"
xdotool key Return
xdotool type "python3 -m meta_base src.api:Localization"
xdotool key Return
################################
# 创建右下
################################
sleep 1
xdotool key Ctrl+Shift+O
sleep 1
################################
# Terminal 5 (右下)
################################
xdotool type "cd /home/instellar/Documents/Codes/Planning/app_navigation/"
xdotool key Return
xdotool type "python3 -m src.main"
xdotool key Return
################################
# 回到右上 → 再垂直分一个
################################
sleep 1
xdotool key Alt+Up
sleep 0.5
xdotool key Ctrl+Shift+E
sleep 1
################################
# Terminal 4 (右上右)
################################
xdotool type "cd /home/instellar/workspace/sales/meta_sales_replay/"
xdotool key Return
xdotool type "source /home/instellar/workspace/SDK/astribot_sdk_ros2/env.sh"
xdotool key Return
xdotool type "python3 -m meta_base src.api:SalesReplay"
xdotool key Return



# 回到右上 → 再垂直分一个
################################
sleep 0.5
xdotool key Ctrl+Shift+O
sleep 1
################################
# Terminal 4 (右上右)
################################
xdotool type "cd /home/instellar/workspace/SDK/astribot_simulation"
xdotool key Return
xdotool type "source env.sh"
xdotool key Return
xdotool type "python3 astribot_simulation.py "
xdotool key Return
