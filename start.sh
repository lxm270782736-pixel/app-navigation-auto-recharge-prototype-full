#!/bin/bash

echo "=========================================="
echo "  机器人导航UI系统 - 启动脚本"
echo "=========================================="
echo ""
echo "请选择启动模式:"
echo ""
echo "  1) 仿真模式 (Mock ROS Bridge)"
echo "     - 使用模拟数据测试UI"
echo "     - 无需真实ROS环境"
echo "     - 适合开发和演示"
echo ""
echo "  2) 真机模式 (Real Robot)"
echo "     - 连接真实ROS系统"
echo "     - 需要rosbridge_server"
echo "     - 用于实际机器人控制"
echo ""
echo "  3) 退出"
echo ""

read -p "请输入选项 (1-3): " choice

case $choice in
    1)
        echo ""
        echo "启动仿真模式..."
        echo ""
        ./start-sim.sh
        ;;
    2)
        echo ""
        echo "启动真机模式..."
        echo ""
        ./start-real.sh
        ;;
    3)
        echo "退出"
        exit 0
        ;;
    *)
        echo "无效选项，退出"
        exit 1
        ;;
esac
