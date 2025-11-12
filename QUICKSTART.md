# 快速启动指南

## 🚀 推荐启动方式

### 方式一：智能启动（推荐）

```bash
./start.sh
```

脚本会提示您选择运行模式：
- **选项 1 - 仿真模式**: 使用模拟ROS数据，无需真实ROS环境，适合开发测试
- **选项 2 - 真机模式**: 连接真实ROS系统，用于实际机器人控制
- **选项 3 - 退出**

### 方式二：直接启动特定模式

#### 仿真模式（开发测试）

```bash
./start-sim.sh
```

**特点：**
- ✅ 无需安装ROS
- ✅ 模拟机器人位姿和地图数据
- ✅ 支持所有UI功能测试
- 访问地址：http://localhost:4173

#### 真机模式（实际控制）

```bash
# 1. 加载ROS环境
source /opt/ros/noetic/setup.bash

# 2. 启动真机模式
./start-real.sh
```

**前置要求：**
- ✅ ROS环境已安装
- ✅ rosbridge_server已安装：`sudo apt-get install ros-noetic-rosbridge-server`
- ✅ ROS核心节点正在运行：`roscore`
- 访问地址：http://localhost:4173

### 方式三：使用旧版快速启动

```bash
./run.sh
```

这会自动启动：
- ✅ 模拟ROS Bridge (端口 9090)
- ✅ Web服务器 (端口 8080)

然后在浏览器中访问: **http://localhost:8080**

## 📝 手动启动

### 步骤1：启动模拟ROS Bridge
```bash
python3 mock_rosbridge.py
```

### 步骤2：构建前端（如果还没构建）
```bash
npm run build
```

### 步骤3：启动Web服务器
```bash
cd dist
python3 -m http.server 8080
```

### 步骤4：打开浏览器
访问: http://localhost:8080

## 🌐 访问地址

- **本地访问**: http://localhost:8080
- **网络访问**: http://10.11.106.243:8080 (从其他设备)
- **ROS Bridge**: ws://localhost:9090

## 🎯 功能导航

### 1. Dashboard主页 (/)
- 查看机器人状态
  - ROS连接状态
  - 电池电量
  - 位置和朝向
  - 速度信息
- 快速访问功能模块

### 2. 地图管理 (/maps)
- 查看所有已保存的地图
- 创建新地图
- 选择地图进入导航

### 3. SLAM建图 (/mapping)
- 一键启动建图
- 实时查看地图数据
- 保存并命名地图

### 4. 导航模式 (/navigation/:mapId)
- **地图交互**:
  - 🖱️ 滚轮缩放（50%-500%）
  - 🖱️ 中键拖动 平移地图
  - 🖱️ 左键点击设置位置
  - 📐 工具栏：+/- 缩放按钮，重置视图

- **导航功能**:
  - 设置机器人初始位置
  - 选择目标点
  - 查看规划路径
  - 配置附加任务（停留/轨迹/拍照）

## 🛠️ 故障排查

### 问题1: 端口被占用
```bash
# 查找占用端口的进程
lsof -i :8080
lsof -i :9090

# 杀死进程
kill -9 <PID>
```

### 问题2: 页面无法打开
1. 确认服务器正在运行
   ```bash
   netstat -tuln | grep 8080
   ```

2. 检查防火墙设置
   ```bash
   sudo ufw status
   ```

3. 尝试其他浏览器

### 问题3: ROS连接失败
1. 检查模拟服务器是否运行
   ```bash
   netstat -tuln | grep 9090
   ```

2. 查看浏览器控制台错误信息
   - 按F12打开开发者工具
   - 查看Console和Network选项卡

### 问题4: 地图无法显示
1. 检查ROS Bridge连接状态
2. 查看浏览器控制台是否有WebSocket错误
3. 确认模拟服务器正在发布地图数据

## 📱 使用技巧

### 地图缩放和拖动
- **缩放**:
  - 滚动鼠标滚轮
  - 或使用右上角 +/- 按钮
  - 缩放范围：50% - 500%

- **拖动**:
  - 按住Ctrl键 + 左键拖动
  - 或使用鼠标中键拖动

- **重置视图**:
  - 点击右上角"重置"按钮

### 快速导航
- 主页 → 地图管理 → 选择地图 → 导航
- 主页 → SLAM建图 → 保存 → 地图管理

### 键盘快捷键
- `Ctrl + 拖动`: 平移地图
- 滚轮: 缩放地图
- 右键: 防止浏览器右键菜单（地图交互使用）

## 🔄 更新代码后

```bash
# 重新构建
npm run build

# 重启Web服务器
pkill -f "python3 -m http.server"
cd dist && python3 -m http.server 8080 &
```

## 📦 端口使用说明

| 端口 | 服务 | 协议 |
|------|------|------|
| 8080 | Web UI | HTTP |
| 9090 | ROS Bridge | WebSocket |

## 🎬 演示视频步骤

1. **启动服务**
   ```bash
   ./run.sh
   ```

2. **打开浏览器访问** http://localhost:8080

3. **查看Dashboard**
   - 观察机器人状态
   - 电池电量显示

4. **进入地图管理**
   - 点击"地图管理"卡片

5. **创建新地图**
   - 点击"新建地图"
   - 观察建图过程
   - 结束并保存

6. **测试导航**
   - 选择地图
   - 设置初始位置
   - 选择目标点
   - 开始导航

7. **测试地图交互**
   - 滚轮缩放
   - Ctrl+拖动平移
   - 查看工具栏
   - 阅读操作提示

## 💡 开发提示

### 修改ROS Bridge地址
编辑 `src/contexts/ROSContext.tsx`:
```typescript
rosUrl="ws://your-robot-ip:9090"
```

### 修改地图缩放范围
编辑 `src/components/common/MapCanvas.tsx`:
```typescript
const newScale = Math.max(0.5, Math.min(5, scale * scaleFactor));
// 改为: Math.max(0.2, Math.min(10, scale * scaleFactor))
```

## 📚 相关文档

- [README.md](README.md) - 项目总览
- [CHANGELOG.md](CHANGELOG.md) - 更新日志
- [ROS_INTEGRATION.md](ROS_INTEGRATION.md) - ROS集成指南
- [MOCK_ROSBRIDGE.md](MOCK_ROSBRIDGE.md) - 模拟服务器说明

## ❓ 获取帮助

如有问题，请：
1. 查看浏览器控制台错误信息
2. 检查服务器运行日志
3. 参考上述故障排查部分
4. 提交Issue到项目仓库

---

**🎉 现在就开始使用吧！**
