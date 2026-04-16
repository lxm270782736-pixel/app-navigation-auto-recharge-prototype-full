#!/bin/bash
"$(dirname "$0")/kill_all.sh"
terminator &
sleep 2
################################
# Terminal 1 (左上)
################################
xdotool type "cd /home/instellar/Documents/Codes/Planning/meta_astribot_navigation/"
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
