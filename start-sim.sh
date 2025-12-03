#!/bin/bash

echo "=========================================="
echo "  机器人导航UI - 仿真模式"
echo "=========================================="
echo ""
echo "📝 模式: 仿真 (Mock ROS Bridge)"
echo ""

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
        ROSBRIDGE_PID=""
    fi
fi

# 启动模拟ROS Bridge
if [ -z "$ROSBRIDGE_PID" ] && ! lsof -Pi :9090 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "启动模拟ROS Bridge服务器..."
    python3 mock_rosbridge.py &
    ROSBRIDGE_PID=$!
    sleep 2

    if lsof -Pi :9090 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "✓ 模拟ROS Bridge已启动 (PID: $ROSBRIDGE_PID)"
    else
        echo "✗ 模拟ROS Bridge启动失败"
        exit 1
    fi
else
    echo "✓ ROS Bridge服务器已在端口9090运行"
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
echo "  🤖 ROS Bridge (模拟):"
echo "     ws://localhost:9090"
echo ""
echo "  📊 支持的功能:"
echo "     ✓ 地图数据发布"
echo "     ✓ 机器人位姿模拟"
echo "     ✓ 建图流程模拟"
echo "     ✓ 导航功能模拟"
echo "     ✓ 系统节点启动服务（SLAM/导航）"
echo ""
echo "  💡 提示:"
echo "     - 在浏览器中打开上述地址"
echo "     - 按 Ctrl+C 停止所有服务"
echo ""
echo "=========================================="
echo ""

# 等待中断信号
trap 'echo ""; echo "正在停止服务..."; kill $ROSBRIDGE_PID $VITE_PID 2>/dev/null; echo "服务已停止"; exit' INT TERM

wait
