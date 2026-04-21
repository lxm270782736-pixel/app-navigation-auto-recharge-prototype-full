#!/bin/bash
SCRIPT_DIR="$(dirname "$0")"
TIMESTAMP=$(date +%Y_%m_%d_%H_%M_%S)
LOG_BASE=/opt/astribot_ros/log
mkdir -p $LOG_BASE/{astribot_navigation,astribot_chassis,astribot_detection,astribot_localization,astribot_sales_replay,app_navigation}

"$SCRIPT_DIR/scripts/kill_all.sh"
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
    "$SCRIPT_DIR/scripts/kill_all.sh"
) &
disown

################################
# Terminal 1 (左上)
################################

xdotool type "cd /home/astribot/workspace/meta_astribot_navigation/"
xdotool key Return

xdotool type "source install/setup.bash"
xdotool key Return

xdotool type "PYTHONUNBUFFERED=1 python3 -m meta_base src.api:AstribotNavigation 2>&1 | tee $LOG_BASE/astribot_navigation/log_${TIMESTAMP}.log"
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

xdotool type "cd /home/astribot/workspace/meta_astribot_navigation/"
xdotool key Return

xdotool type "source /home/astribot/workspace/astribot_sdk_aarch64/env.sh"
xdotool key Return

xdotool type "PYTHONUNBUFFERED=1 python3 src/core/astribot_navigation/src/astribot_navigation/scripts/move_astribot_chassis_four_wheel_use_twist.py 2>&1 | tee $LOG_BASE/astribot_chassis/log_${TIMESTAMP}.log"
xdotool key Return


################################
# 在左下角再垂直分割出一个新终端（新增的c窗口）
################################

sleep 1
xdotool key Ctrl+Shift+E
sleep 1


################################
# Terminal 2.5 (左下右 - 新增的c窗口)
################################

xdotool type "cd /home/astribot/workspace/liyifan/meta_camera_detection_yifanli"
xdotool key Return

xdotool type "source /home/astribot/workspace/liyifan/miniconda3/bin/activate kangyang"
xdotool key Return

xdotool type "PYTHONUNBUFFERED=1 python3 -m meta_base src.api:Detection 2>&1 | tee $LOG_BASE/astribot_detection/log_${TIMESTAMP}.log"
xdotool key Return


################################
# 切换到右列
################################

sleep 1
xdotool key Alt+Right
sleep 0.5


################################
# Terminal 3 (右上)
################################

xdotool type "cd /home/astribot/workspace/meta_astribot_localization/"
xdotool key Return

xdotool type "source install/setup.bash"
xdotool key Return

xdotool type "PYTHONUNBUFFERED=1 python3 -m meta_base src.api:Localization 2>&1 | tee $LOG_BASE/astribot_localization/log_${TIMESTAMP}.log"
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

xdotool type "cd /home/astribot/workspace/app_navigation/"
xdotool key Return

xdotool type "PYTHONUNBUFFERED=1 python3 main.py 2>&1 | tee $LOG_BASE/app_navigation/log_${TIMESTAMP}.log"
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

xdotool type "cd /home/astribot/workspace/meta_sales_replay/"
xdotool key Return
xdotool type "source /home/astribot/workspace/astribot_sdk_aarch64/env.sh"
xdotool key Return
xdotool type "PYTHONUNBUFFERED=1 python3 -m meta_base src.api:SalesReplay 2>&1 | tee $LOG_BASE/astribot_sales_replay/log_${TIMESTAMP}.log"
xdotool key Return
