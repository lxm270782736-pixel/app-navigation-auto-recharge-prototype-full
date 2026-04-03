#!/bin/bash

echo "=================================================="
echo "  机器人导航UI系统 - 快速启动"
echo "=================================================="
echo ""

# 检查并清理旧进程
if lsof -Pi :17634 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  端口17634已被占用，尝试清理..."
    kill $(lsof -t -i:17634) 2>/dev/null
    sleep 1
fi

if lsof -Pi :9090 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "✓ 模拟ROS Bridge已在运行"
else
    echo "启动模拟ROS Bridge..."
    python3 mock_rosbridge.py &
    sleep 2
fi

# 检查是否已构建
if [ ! -d "dist" ]; then
    echo "首次运行，正在构建..."
    npm run build
fi

# 启动Web服务器
echo "启动Web服务器..."
cd dist && python3 -m http.server 17634 &
WEB_PID=$!
sleep 2

echo ""
echo "=================================================="
echo "  ✅ 所有服务已启动！"
echo "=================================================="
echo ""
echo "  📱 访问地址:"
echo "     http://localhost:17634"
echo ""
echo "  🤖 ROS Bridge:"
echo "     ws://localhost:9090"
echo ""
echo "  ⚙️  服务进程:"
echo "     Web服务器: PID $WEB_PID"
echo ""
echo "  💡 提示:"
echo "     - 在浏览器中打开 http://localhost:17634"
echo "     - 按 Ctrl+C 停止所有服务"
echo ""
echo "=================================================="
echo ""

# 等待中断信号
trap 'echo ""; echo "正在停止服务..."; kill $WEB_PID 2>/dev/null; pkill -f mock_rosbridge 2>/dev/null; echo "服务已停止"; exit' INT TERM

# 保持脚本运行
wait
