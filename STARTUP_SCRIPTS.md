# 启动脚本说明

本项目提供了多个启动脚本，支持**仿真模式**和**真机模式**两种运行方式。

## 📁 脚本文件列表

| 脚本名称 | 用途 | 推荐场景 |
|---------|------|---------|
| `start.sh` | 主启动脚本，提供交互式模式选择 | 首次使用或不确定使用哪种模式 |
| `start-sim.sh` | 仿真模式启动脚本 | 开发测试、演示、无ROS环境 |
| `start-real.sh` | 真机模式启动脚本 | 连接真实机器人进行实际控制 |
| `run.sh` | 旧版快速启动脚本 | 简单的仿真模式（使用HTTP服务器）|

## 🚀 使用指南

### 1. 主启动脚本（推荐新手使用）

```bash
./start.sh
```

执行后会显示菜单：
```
==========================================
  机器人导航UI系统 - 启动脚本
==========================================

请选择启动模式:

  1) 仿真模式 (Mock ROS Bridge)
     - 使用模拟数据测试UI
     - 无需真实ROS环境
     - 适合开发和演示

  2) 真机模式 (Real Robot)
     - 连接真实ROS系统
     - 需要rosbridge_server
     - 用于实际机器人控制

  3) 退出

请输入选项 (1-3):
```

### 2. 仿真模式

```bash
./start-sim.sh
```

**功能：**
- 自动启动模拟ROS Bridge（Python实现）
- 启动前端预览服务器
- 提供完整的模拟数据（地图、位姿、传感器等）

**适用场景：**
- ✅ 前端UI开发和测试
- ✅ 功能演示
- ✅ 无需安装ROS
- ✅ 快速验证代码更改

**服务端口：**
- ROS Bridge: ws://localhost:9090
- 前端UI: http://localhost:4173

### 3. 真机模式

```bash
./start-real.sh
```

**功能：**
- 使用 `roslaunch rosbridge_server rosbridge_websocket.launch` 启动ROS Bridge
- 连接真实ROS Master和节点
- 启动前端预览服务器

**前置条件：**

1. **ROS环境已安装：**
   ```bash
   # 检查ROS环境
   echo $ROS_DISTRO
   # 应输出: noetic 或 melodic 等
   ```

2. **rosbridge_server已安装：**
   ```bash
   # 安装命令（ROS Noetic）
   sudo apt-get install ros-noetic-rosbridge-server

   # 验证安装
   rospack find rosbridge_server
   ```

3. **ROS核心节点运行中：**
   ```bash
   # 在另一个终端启动roscore
   roscore
   ```

4. **导航节点已启动（根据您的机器人）：**
   ```bash
   # 示例（根据实际情况调整）
   roslaunch your_robot_bringup bringup.launch
   roslaunch your_robot_navigation navigation.launch
   ```

**启动步骤：**

```bash
# 终端1: 启动ROS核心
roscore

# 终端2: 启动机器人节点（根据实际情况）
source /opt/ros/noetic/setup.bash
roslaunch your_robot_bringup robot.launch

# 终端3: 启动导航UI（真机模式）
source /opt/ros/noetic/setup.bash
./start-real.sh
```

**服务端口：**
- ROS Bridge: ws://localhost:9090
- 前端UI: http://localhost:4173

## ⚙️ 脚本工作流程

### 仿真模式 (start-sim.sh)

```
1. 检查端口9090是否被占用
   ├─ 已占用 → 询问是否停止现有进程
   └─ 未占用 → 继续

2. 启动模拟ROS Bridge
   ├─ python3 mock_rosbridge.py &
   └─ 等待2秒并验证

3. 检查端口4173是否被占用
   ├─ 已占用 → 跳过
   └─ 未占用 → 启动前端服务器

4. 启动前端预览服务器
   ├─ npm run preview &
   └─ 等待3秒并验证

5. 显示访问信息
   └─ 监听 Ctrl+C 信号以清理进程
```

### 真机模式 (start-real.sh)

```
1. 检查ROS环境
   ├─ $ROS_DISTRO 未设置 → 提示并退出
   └─ 环境正常 → 继续

2. 检查rosbridge_server
   ├─ 未安装 → 显示安装命令并退出
   └─ 已安装 → 继续

3. 检查端口9090是否被占用
   ├─ 已占用 → 询问是否停止现有进程
   └─ 未占用 → 继续

4. 启动ROS Bridge服务器
   ├─ roslaunch rosbridge_server rosbridge_websocket.launch &
   └─ 等待3秒并验证

5. 启动前端预览服务器
   ├─ npm run preview &
   └─ 等待3秒并验证

6. 显示访问信息和注意事项
   └─ 监听 Ctrl+C 信号以清理进程
```

## 🛑 停止服务

在任何运行的脚本终端中按 **Ctrl+C**，脚本会自动：
1. 停止前端服务器
2. 停止ROS Bridge（仿真或真机）
3. 清理所有子进程
4. 显示"服务已停止"

## 🔧 故障排查

### 问题1: 端口被占用

**现象：**
```
⚠️  端口9090已被占用
```

**解决：**
1. 脚本会询问是否停止现有进程，选择 `y`
2. 或手动停止：
   ```bash
   # 查看占用端口的进程
   lsof -i :9090

   # 停止进程
   kill <PID>
   ```

### 问题2: ROS环境未加载（真机模式）

**现象：**
```
⚠️  未检测到ROS环境
```

**解决：**
```bash
# 加载ROS环境
source /opt/ros/noetic/setup.bash

# 如果需要工作空间
source ~/catkin_ws/devel/setup.bash

# 验证
echo $ROS_DISTRO
```

### 问题3: rosbridge_server未安装

**现象：**
```
✗ 未找到rosbridge_server包
```

**解决：**
```bash
# ROS Noetic
sudo apt-get update
sudo apt-get install ros-noetic-rosbridge-server

# ROS Melodic
sudo apt-get install ros-melodic-rosbridge-server
```

### 问题4: 前端服务器启动失败

**现象：**
```
✗ 前端服务器启动失败
   尝试先运行: npm run build
```

**解决：**
```bash
# 安装依赖
npm install

# 构建前端
npm run build

# 重新运行启动脚本
./start-sim.sh  # 或 ./start-real.sh
```

### 问题5: 模拟服务器无法启动

**现象：**
```
✗ 模拟ROS Bridge启动失败
```

**解决：**
```bash
# 检查Python环境
python3 --version

# 安装依赖
pip3 install websockets

# 手动测试
python3 mock_rosbridge.py
```

## 📝 环境变量

真机模式会显示当前ROS环境信息：

```bash
ROS_DISTRO: noetic
ROS_MASTER_URI: http://localhost:11311
```

如果需要连接远程ROS Master：
```bash
export ROS_MASTER_URI=http://192.168.1.100:11311
export ROS_IP=192.168.1.50
./start-real.sh
```

## 💡 使用技巧

### 开发时使用仿真模式

```bash
# 启动仿真模式
./start-sim.sh

# 在另一个终端修改代码后重新构建
npm run build

# 刷新浏览器即可看到更改
```

### 测试时切换模式

```bash
# 先用仿真模式测试UI
./start-sim.sh
# 按 Ctrl+C 停止

# 确认功能正常后切换到真机模式
./start-real.sh
```

### 后台运行

如果需要后台运行（不推荐，因为难以停止）：

```bash
# 仿真模式
nohup ./start-sim.sh > sim.log 2>&1 &

# 查看日志
tail -f sim.log

# 停止
pkill -f start-sim.sh
pkill -f mock_rosbridge
pkill -f "npm run preview"
```

## 📊 日志查看

脚本会在终端输出所有状态信息，包括：
- ✓ 成功消息（绿色勾号）
- ✗ 错误消息（红色叉号）
- ⚠️ 警告消息（黄色感叹号）
- 📝 信息消息

建议保持终端可见以监控系统状态。

## 🔗 相关文档

- [QUICKSTART.md](QUICKSTART.md) - 快速启动指南
- [MOCK_ROSBRIDGE.md](MOCK_ROSBRIDGE.md) - 模拟ROS Bridge详细说明
- [README.md](README.md) - 项目总览

---

**需要帮助？** 查看终端输出的错误信息，或参考上述故障排查部分。
