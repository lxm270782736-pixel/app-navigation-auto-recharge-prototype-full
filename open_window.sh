#!/bin/bash
"$(dirname "$0")/scripts/kill_all.sh"  
terminator &
sleep 2

################################
# Terminal 1 (左上)
################################

xdotool type "cd /home/astribot/workspace/meta_astribot_navigation/"
xdotool key Return

xdotool type "source install/setup.bash"
xdotool key Return

xdotool type "python3 -m meta_base src.api:AstribotNavigation"
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

xdotool type "python3 src/core/astribot_navigation/src/astribot_navigation/scripts/move_astribot_chassis_four_wheel_use_twist.py"
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

xdotool type "python3 -m meta_base src.api:Detection"
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

xdotool type "cd /home/astribot/workspace/app_navigation/"
xdotool key Return

xdotool type "python3 main.py"
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
xdotool type "python3 -m meta_base src.api:SalesReplay"
xdotool key Return
