#!/bin/bash

LOG_FILE="/tmp/nav_ui.log"
exec > >(tee -a "$LOG_FILE") 2>&1

NAVI_UI_DIR="$(cd "$(dirname "$0")"; pwd)"
cd $NAVI_UI_DIR
echo "NAVI_UI_DIR: $NAVI_UI_DIR"
echo "=========================================="
echo "  机器人导航UI - 真机模式"
echo "=========================================="
echo ""
echo "📝 模式: 真机 (ROS Bridge Server)"
echo ""

# 检查ROS环境
if [ -z "$ROS_DISTRO" ]; then
    echo "⚠️  未检测到ROS环境"
    echo "   请先执行: source /opt/ros/<distro>/setup.bash"
    echo "   例如: source /opt/ros/noetic/setup.bash"
    exit 1
fi

echo "✓ ROS环境已加载: $ROS_DISTRO"
echo ""

# 检查rosbridge_server是否安装
if ! rospack find rosbridge_server >/dev/null 2>&1; then
    echo "✗ 未找到rosbridge_server包"
    echo ""
    echo "   请安装rosbridge_server:"
    echo "   sudo apt-get install ros-$ROS_DISTRO-rosbridge-server"
    exit 1
fi

echo "✓ rosbridge_server已安装"
echo ""

source /home/astribot/Documents/astribot_slam_navi_ws/devel/setup.bash

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
        echo "   跳过ROS Bridge启动"
        ROSBRIDGE_LAUNCHED=false
    fi
fi

# 启动ROS Bridge Server
if [ "$ROSBRIDGE_LAUNCHED" != "false" ] && ! lsof -Pi :9090 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "启动ROS Bridge服务器..."
    roslaunch rosbridge_server rosbridge_websocket.launch &
    ROSBRIDGE_PID=$!
    sleep 3

    if lsof -Pi :9090 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "✓ ROS Bridge服务器已启动 (PID: $ROSBRIDGE_PID)"
    else
        echo "✗ ROS Bridge服务器启动失败"
        echo "   请检查ROS环境和rosbridge_server安装"
        exit 1
    fi
else
    echo "✓ ROS Bridge服务器已在端口9090运行"
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
echo "  🤖 ROS Bridge (真机):"
echo "     ws://localhost:9090"
echo ""
echo "  📊 连接到真实ROS系统:"
echo "     ROS_DISTRO: $ROS_DISTRO"
echo "     ROS_MASTER_URI: ${ROS_MASTER_URI:-未设置}"
echo ""
echo "  ⚠️  注意事项:"
echo "     - 确保ROS核心节点正在运行 (roscore)"
echo "     - 确保导航相关节点已启动"
echo "     - 确保机器人硬件已连接"
echo ""
echo "  💡 提示:"
echo "     - 在浏览器中打开上述地址"
echo "     - 按 Ctrl+C 停止所有服务"
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
        # 同时停止roslaunch启动的所有节点
        pkill -P $ROSBRIDGE_PID 2>/dev/null
    fi
    echo "服务已停止"
    exit
}

trap cleanup INT TERM

wait
