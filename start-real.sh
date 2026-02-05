#!/bin/bash

LOG_FILE="/tmp/nav_ui.log"
exec > >(tee -a "$LOG_FILE") 2>&1

NAVI_UI_DIR="$(cd "$(dirname "$0")"; pwd)"
cd $NAVI_UI_DIR
echo "NAVI_UI_DIR: $NAVI_UI_DIR"
echo "=========================================="
echo "  机器人导航UI - 真机模式 (ROS2)"
echo "=========================================="
echo ""
echo "📝 模式: 真机 (ROS2 Bridge Server)"
echo ""

# 检查ROS2环境
if [ -z "$ROS_DISTRO" ]; then
    echo "⚠️  未检测到ROS2环境"
    echo "   请先执行: source /opt/ros/<distro>/setup.bash"
    echo "   例如: source /opt/ros/humble/setup.bash"
    exit 1
fi

# 检查是否为ROS2 Humble
if [ "$ROS_DISTRO" != "humble" ] && [ "$ROS_DISTRO" != "iron" ] && [ "$ROS_DISTRO" != "jazzy" ]; then
    echo "⚠️  当前ROS版本: $ROS_DISTRO"
    echo "   本项目已迁移至ROS2，推荐使用 ROS2 Humble (LTS)"
    echo "   请执行: source /opt/ros/humble/setup.bash"
    echo ""
    read -p "   是否继续？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "✓ ROS2环境已加载: $ROS_DISTRO"
echo ""

# 检查rosbridge_server是否安装 (ROS2方式)
if ! ros2 pkg list 2>/dev/null | grep -q "rosbridge_server"; then
    echo "✗ 未找到rosbridge_server包"
    echo ""
    echo "   请安装rosbridge_suite:"
    echo "   sudo apt-get install ros-$ROS_DISTRO-rosbridge-suite"
    exit 1
fi

echo "✓ rosbridge_server已安装"
echo ""

# 加载用户工作空间 (如果存在)
# 注意: 请根据实际情况修改工作空间路径
USER_WS_SETUP="/home/instellarma/Documents/Codes/Planning/astribot_slam_navi_ws/install/setup.bash"
if [ -f "/home/astribot/ros2_ws/install/setup.bash" ]; then
    USER_WS_SETUP="/home/astribot/ros2_ws/install/setup.bash"
elif [ -f "$HOME/ros2_ws/install/setup.bash" ]; then
    USER_WS_SETUP="$HOME/ros2_ws/install/setup.bash"
elif [ -f "$HOME/astribot_ws/install/setup.bash" ]; then
    USER_WS_SETUP="$HOME/astribot_ws/install/setup.bash"
fi

if [ -n "$USER_WS_SETUP" ]; then
    echo "加载用户工作空间: $USER_WS_SETUP"
    source "$USER_WS_SETUP"
    echo "✓ 用户工作空间已加载"
    echo ""
fi

# 检查是否已有进程在运行
if lsof -Pi :9090 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  端口9090已被占用"
    echo "   正在检查进程..."
    EXISTING_PID=$(lsof -t -i:9090)
    echo "   进程PID: $EXISTING_PID"
    read -p "   是否要停止现有进程并重启？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "   正在停止现有进程..."
        kill $EXISTING_PID 2>/dev/null
        sleep 2
    else
        echo "   跳过ROS2 Bridge启动"
        ROSBRIDGE_LAUNCHED=false
    fi
fi

# 启动ROS2 Bridge Server
if [ "$ROSBRIDGE_LAUNCHED" != "false" ] && ! lsof -Pi :9090 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "启动ROS2 Bridge服务器..."
    ros2 launch rosbridge_server rosbridge_websocket_launch.xml &
    ROSBRIDGE_PID=$!
    sleep 3

    if lsof -Pi :9090 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "✓ ROS2 Bridge服务器已启动 (PID: $ROSBRIDGE_PID)"
    else
        echo "✗ ROS2 Bridge服务器启动失败"
        echo "   请检查ROS2环境和rosbridge_suite安装"
        exit 1
    fi
else
    echo "✓ ROS2 Bridge服务器已在端口9090运行"
    ROSBRIDGE_PID=""
fi

echo ""

# 检查前端服务器
if lsof -Pi :3500 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "✓ 前端服务器已在端口3500运行"
    VITE_PID=""
else
    echo "启动前端服务器..."
    npm run dev &
    VITE_PID=$!
    sleep 3

    if lsof -Pi :3500 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "✓ 前端服务器已启动 (PID: $VITE_PID)"
    else
        echo "✗ 前端服务器启动失败"
        echo "   尝试先运行: npm run build"
        kill $ROSBRIDGE_PID 2>/dev/null
        exit 1
    fi
fi

echo ""
echo "=========================================="
echo "  ✅ 所有服务已启动！"
echo "=========================================="
echo ""
echo "  🌐 访问地址:"
echo "     http://localhost:3500"
echo ""
echo "  🤖 ROS2 Bridge (真机):"
echo "     ws://localhost:9090"
echo ""
echo "  📊 连接到真实ROS2系统:"
echo "     ROS_DISTRO: $ROS_DISTRO"
echo "     ROS_DOMAIN_ID: ${ROS_DOMAIN_ID:-0 (默认)}"
echo ""
echo "  ⚠️  注意事项:"
echo "     - 确保导航相关节点已启动 (Nav2)"
echo "     - 确保SLAM节点已启动 (slam_toolbox)"
echo "     - 确保机器人硬件已连接"
echo ""
echo "  💡 提示:"
echo "     - 在浏览器中打开上述地址"
echo "     - 按 Ctrl+C 停止所有服务"
echo "     - 查看ROS2节点: ros2 node list"
echo "     - 查看ROS2话题: ros2 topic list"
echo ""
echo "=========================================="
echo ""

# 等待中断信号
cleanup() {
    echo ""
    echo "正在停止服务..."
    if [ -n "$VITE_PID" ]; then
        kill $VITE_PID 2>/dev/null
    fi
    if [ -n "$ROSBRIDGE_PID" ]; then
        kill $ROSBRIDGE_PID 2>/dev/null
        # 同时停止ros2 launch启动的所有节点
        pkill -P $ROSBRIDGE_PID 2>/dev/null
    fi
    echo "服务已停止"
    exit
}

trap cleanup INT TERM

wait
