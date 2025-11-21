# Astribot Navigation UI

> 基于 React + TypeScript 的机器人SLAM建图和自主导航界面系统

一个现代化的Web界面，为ROS机器人提供完整的建图、导航和监控功能。支持仿真模式和真实机器人模式，通过WebSocket与ROS后端实时通信。

## 特性亮点

- 🗺️ **一键式SLAM建图** - 自动启动建图流程，实时预览地图构建
- 🧭 **可视化导航** - 交互式地图操作，点击设置目标点
- 📊 **实时监控** - 机器人状态、电池电量、位置速度实时显示
- 🖱️ **直观交互** - 鼠标滚轮缩放、拖拽平移、轨迹跟踪
- 💾 **服务器存储** - 地图数据保存在服务器端，支持持久化存储
- 🔄 **自动重连** - ROS连接断开后自动重新连接
- 🎯 **附加任务** - 支持到达后停留、执行轨迹、自动拍照
- ✏️ **地图编辑** - 内置地图编辑器，支持绘制障碍物、自由区域和橡皮擦工具
- ↩️ **撤销/重做** - 完整的历史记录管理，支持键盘快捷键（Ctrl+Z/Ctrl+Y）

## 功能模块

### 1. 系统监控仪表板 (Dashboard)
- ROS连接状态实时指示
- 电池电量监控（百分比 + 进度条）
- 机器人位置（X, Y 坐标）
- 朝向角度显示
- 速度信息（线速度/角速度）
- 快捷导航卡片

### 2. 地图管理 (Map Manager)
- 地图列表网格展示
- 缩略图预览
- 地图信息（尺寸、创建时间）
- 地图删除功能
- 地图编辑功能（跳转到编辑器）
- 实时建图预览

### 3. SLAM建图 (Mapping)
- 一键启动/停止建图
- 实时地图预览
- 地图参数显示（宽高、分辨率）
- 地图命名和保存
- 自动生成缩略图

### 4. 地图编辑器 (Map Editor)
- **编辑工具**
  - 自由区域绘制（标记可通行区域）
  - 障碍物绘制（添加障碍物）
  - 橡皮擦工具（擦除为未知区域）
- **画笔控制**
  - 可调节画笔大小（1-20px）
  - 实时画笔预览（渐变圆圈）
  - 连续绘制模式
- **历史管理**
  - 撤销功能（Ctrl+Z）
  - 重做功能（Ctrl+Y）
  - 最多保存50步历史记录
- **地图操作**
  - 实时保存地图
  - 更新缩略图
  - 删除地图

### 5. 自主导航 (Navigation)
- 全屏地图可视化
- 手动重定位（设置机器人初始位姿）
- 目标点设置模式
- 浮动控制面板
- 机器人轨迹跟踪（最近500点）
- 坐标系可视化
- 路径规划实时显示

### 6. 导航参数配置
- **使用默认配置**: 切换使用系统默认参数或自定义参数
- **速度与避障参数**
  - 最小安全距离 (safe_dist, 0.1-1.0m)
  - 最大速度 (v_max, 0.1-2.0 m/s)
  - 最大角速度 (w_max, 0.1-3.0 rad/s)
- **加速度参数**
  - 最大加速度 (a_max, 0.1-2.0 m/s²)
  - 最大转向加速度 (dw_max, 0.1-3.0 rad/s²)
- **运动模式与减速策略**
  - 全向运动模式 (is_holonomic: true=全向, false=差速)
  - 减速策略距离 (deaccelaration_dist, 0.1-2.0m)
  - 减速策略系数 (deaccelaration_ratio, 0.1-1.0)

### 7. 地图交互功能
- 鼠标滚轮缩放
- 中键/Ctrl+左键拖动平移
- 机器人位置和方向箭头显示
- 目标点标记
- 世界坐标系原点和轴线显示

## 技术栈

### 前端技术
- **框架**: React 18.2.0 + TypeScript 5.2.2
- **UI组件库**: Ant Design (antd) 5.12.0
- **路由**: React Router 6.20.0
- **构建工具**: Vite 5.0.8
- **日期处理**: dayjs 1.11.10
- **图标**: @ant-design/icons 5.2.6

### ROS通信
- **通信库**: roslib 1.3.0
- **协议**: WebSocket
- **后端**: ROS 1 (Melodic/Noetic)
- **任务系统**: 可扩展的附加任务架构（支持15+任务类型）

## 系统架构

```
┌─────────────────────────────────────┐
│      React UI 界面层                │
│ (Dashboard/MapManager/MapEditor/    │
│  Navigation/Mapping)                │
└──────────────┬──────────────────────┘
               │ useROS Hook
┌──────────────▼──────────────────────┐
│   ROSContext (连接管理)              │
│  - connectionStatus                 │
│  - connect/disconnect               │
└──────────────┬──────────────────────┘
               │ rosService
┌──────────────▼──────────────────────┐
│   ROS Service Layer (ros.ts)        │
│  - subscribeTopic()                 │
│  - publishMessage()                 │
│  - callService()                    │
│  - sendNavigationGoal()             │
└──────────────┬──────────────────────┘
               │ ROSLIB
      WebSocket (ws://localhost:9090)
               │
┌──────────────▼──────────────────────┐
│    ROS Bridge (rosbridge_suite)     │
└──────────────┬──────────────────────┘
               │ ROS协议
┌──────────────▼──────────────────────┐
│   ROS 1 后端                        │
│  - SLAM节点 (gmapping/cartographer) │
│  - move_base 导航                  │
│  - AMCL 定位                        │
│  - 硬件驱动                         │
└──────────────────────────────────────┘

┌─────────────────────────────────────┐
│   地图存储架构                       │
└─────────────────────────────────────┘
┌──────────────────────────────────────┐
│  MapStorageService (storage.ts)     │
│  - getAllMaps() - 获取所有地图       │
│  - getMap(id) - 获取单个地图         │
│  - saveMap(map) - 保存地图          │
│  - deleteMap(id) - 删除地图         │
│  - generateThumbnail() - 生成缩略图  │
└──────────────┬───────────────────────┘
               │ HTTP API
      REST (http://localhost:8080/api)
               │
┌──────────────▼──────────────────────┐
│   HTTP API 服务器 (Python)           │
│  GET    /api/maps - 获取地图列表     │
│  GET    /api/maps/{id} - 获取地图    │
│  POST   /api/maps - 保存地图         │
│  DELETE /api/maps/{id} - 删除地图    │
└──────────────┬──────────────────────┘
               │ 文件系统
┌──────────────▼──────────────────────┐
│   saved_maps/ 目录                  │
│  - {map_id}.json (地图数据文件)      │
│  - 包含完整地图数据和元数据          │
└──────────────────────────────────────┘
```

## 快速开始

### 前置要求

- Node.js >= 16
- npm 或 yarn
- ROS 1 (Melodic/Noetic) - 用于真实机器人
- rosbridge_suite 已安装
```bash
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
sudo apt install ros-noetic-rosbridge-suite
```
### 安装依赖

```bash
cd astribot_navigation_ui
npm install
```

### 开发模式

```bash
npm run dev
```

应用将在 `http://localhost:3000` 启动

### 生产构建

```bash
npm run build    # 编译到dist/目录
npm run preview  # 预览构建结果（端口4173）
```

### 快速启动脚本

#### 仿真模式（推荐用于开发和测试）

```bash
./start-sim.sh
```

启动内容：
- 模拟ROS Bridge服务器（Python）在端口9090
- HTTP API 服务器在端口8080（地图存储）
- 前端服务器在端口4173
- 访问 http://localhost:4173

#### 真实机器人模式

```bash
./start-real.sh
```

需要真实ROS环境和硬件支持

详细启动说明请参考 [STARTUP_SCRIPTS.md](./STARTUP_SCRIPTS.md)

## ROS集成配置

### 必需的ROS包

1. **rosbridge_suite** - WebSocket通信
```bash
sudo apt-get install ros-noetic-rosbridge-suite
```

2. **SLAM包** (例如 gmapping, cartographer, 或 slam_toolbox)
```bash
sudo apt-get install ros-noetic-gmapping
```

3. **导航包** (navigation stack)
```bash
sudo apt-get install ros-noetic-navigation
```

### 启动ROS Bridge

```bash
roslaunch rosbridge_server rosbridge_websocket.launch
```

默认端口: 9090

如需修改端口，更新 `src/contexts/ROSContext.tsx` 中的 `rosUrl`:

```typescript
<ROSProvider autoConnect={true} rosUrl="ws://localhost:9090">
```

### ROS话题和服务接口

#### 订阅的话题

| 话题名 | 消息类型 | 描述 |
|--------|----------|------|
| `/map` | `nav_msgs/OccupancyGrid` | 地图数据 |
| `/odom` | `nav_msgs/Odometry` | 里程计/机器人位置 |
| `/cmd_vel` | `geometry_msgs/Twist` | 速度信息 |

#### 发布的话题

| 话题名 | 消息类型 | 描述 |
|--------|----------|------|
| `/initialpose` | `geometry_msgs/PoseWithCovarianceStamped` | 设置初始位姿 |

#### 调用的服务

| 服务名 | 服务类型 | 描述 |
|--------|----------|------|
| `/start_mapping` | `std_srvs/Trigger` | 启动建图 |
| `/stop_mapping` | `std_srvs/Trigger` | 停止建图 |
| `/save_map` | `nav_msgs/SaveMap` | 保存地图 |
| `/load_map` | `nav_msgs/LoadMap` | 加载地图 |
| `/get_map_list` | `astribot_msgs/GetMapList` | 获取地图列表 |

#### 使用的Action

| Action名 | Action类型 | 描述 |
|----------|------------|------|
| `/move_chassis_to_server` | `astribot_msgs/MoveChassisToAction` | 导航到目标点 |

详细的ROS后端配置请参考 [ROS_INTEGRATION.md](./ROS_INTEGRATION.md)

## 项目结构

```
astribot_navigation_ui/
├── src/
│   ├── components/            # React组件
│   │   ├── Dashboard/         # 主仪表板组件
│   │   ├── MapManager/        # 地图管理组件
│   │   ├── MapEditor/         # 地图编辑器组件（新增）
│   │   ├── Mapping/           # 建图功能组件
│   │   ├── Navigation/        # 导航功能组件
│   │   └── common/            # 公共组件
│   │       └── MapCanvas.tsx  # 地图渲染引擎
│   ├── contexts/              # React Context上下文
│   │   └── ROSContext.tsx     # ROS连接管理
│   ├── services/              # 业务服务层
│   │   ├── ros.ts             # ROS通信服务
│   │   └── storage.ts         # 地图存储服务（支持服务器端存储）
│   ├── types/                 # TypeScript类型定义
│   │   ├── index.ts           # 核心类型定义
│   │   └── roslib.d.ts        # ROS类型声明
│   ├── App.tsx                # 主应用组件
│   ├── main.tsx               # React入口
│   └── App.css                # 全局样式
├── dist/                      # 构建产物目录
├── saved_maps/                # 服务器端地图存储目录（新增）
├── mock_rosbridge.py          # 模拟ROS Bridge + HTTP API服务器
├── start.sh                   # 通用启动脚本
├── start-sim.sh               # 仿真模式启动脚本
├── start-real.sh              # 真实机器人启动脚本
├── package.json               # NPM包配置
├── tsconfig.json              # TypeScript配置
├── vite.config.ts             # Vite构建配置
└── [文档]
    ├── ROS_INTEGRATION.md     # ROS集成指南
    ├── QUICKSTART.md          # 快速开始
    ├── STARTUP_SCRIPTS.md     # 启动脚本说明
    ├── MOCK_ROSBRIDGE.md      # 模拟服务器说明
    ├── COORDINATE_SYSTEM.md   # 坐标系说明
    ├── DEBUG_ROBOT_DISPLAY.md # 调试指南
    ├── CHANGELOG.md           # 更新日志
    └── TEST_REPORT.md         # 测试报告
```

## 使用说明

### 1. 建图流程

1. 启动ROS Bridge和SLAM节点（或使用仿真模式）
2. 在主页面点击"SLAM建图"按钮
3. 系统自动启动建图流程
4. 使用遥控器控制机器人在环境中移动
5. 观察实时地图预览
6. 完成建图后点击"结束建图"
7. 输入地图名称并保存（保存到服务器）

### 2. 地图编辑流程

1. 在主页面点击"地图管理"
2. 选择要编辑的地图，点击"编辑"按钮
3. 使用编辑工具修改地图：
   - 选择"自由区域"绘制可通行区域（白色）
   - 选择"障碍物"添加障碍物（黑色）
   - 选择"橡皮擦"擦除为未知区域（灰色）
   - 调节画笔大小（1-20px）
4. 使用撤销/重做功能修正错误
   - 撤销: Ctrl+Z 或点击"撤销"按钮
   - 重做: Ctrl+Y 或点击"重做"按钮
5. 点击"保存"按钮保存修改

### 3. 导航流程

1. 在主页面点击"地图管理"
2. 选择已保存的地图进入导航界面
3. 切换到"手动重定位"
4. 在地图上点击机器人当前实际位置进行定位
5. 切换到"设置目标点"模式
6. 在地图上点击选择目标位置
7. （可选）配置附加任务
8. 点击"开始导航"按钮

### 3. 附加任务配置

- **到达后停留**: 勾选后可设置停留时长（1-60秒）
- **执行预设轨迹**: 机器人到达目标点后播放预设轨迹
- **自动拍照**: 到达目标点后自动拍照

### 4. 地图交互

- **缩放**: 鼠标滚轮向上/向下
- **平移**: 鼠标中键拖动 或 Ctrl+左键拖动
- **定位**: 手动重定位下左键点击地图
- **设置目标**: 目标点模式下左键点击地图

## 配置选项

### ROS连接配置

在 `src/contexts/ROSContext.tsx` 中修改：

```typescript
<ROSProvider
  autoConnect={true}                    // 是否自动连接
  rosUrl="ws://localhost:9090"          // ROS Bridge地址
>
```

### 地图存储

地图数据存储在服务器端的 `saved_maps/` 目录中：
- 每个地图保存为单独的 JSON 文件 ({map_id}.json)
- 包含地图数据、元数据和缩略图
- 支持服务器端持久化存储
- 降级支持：服务器不可用时自动使用浏览器 localStorage

**HTTP API 端点**：
- `GET /api/maps` - 获取所有地图列表
- `GET /api/maps/{id}` - 获取单个地图
- `POST /api/maps` - 保存地图
- `DELETE /api/maps/{id}` - 删除地图

### 缩略图尺寸

在 `src/services/storage.ts` 中的 `generateThumbnail` 函数修改 `maxSize` 参数

## 开发指南

### 添加新的ROS话题订阅

在 `src/services/ros.ts` 中使用 `subscribeTopic` 方法：

```typescript
rosService.subscribeTopic<MessageType>(
  '/topic_name',
  'package_name/MessageType',
  (message) => {
    // 处理消息
  }
);
```

### 添加新的ROS服务调用

```typescript
await rosService.callService<RequestType, ResponseType>(
  '/service_name',
  'package_name/ServiceType',
  { /* request data */ }
);
```

### 发送导航目标

```typescript
await rosService.sendNavigationGoal({
  x: targetX,
  y: targetY,
  theta: targetTheta
});
```

### 监听ROS事件

```typescript
rosService.on('connection', (status) => {
  console.log('Connection status:', status);
});

rosService.on('navigation-feedback', (feedback) => {
  console.log('Navigation feedback:', feedback);
});
```

## 核心组件说明

### MapCanvas.tsx - 地图渲染引擎

负责地图的可视化渲染和交互：

**渲染元素**:
- 栅格地图（灰色=未知，白色=空闲，黑色=占据）
- 坐标系原点和轴线（红色=X轴，绿色=Y轴）
- 机器人位置和方向箭头（蓝色）
- 目标位置标记（红色）
- 机器人轨迹线（半透明蓝色）

**交互功能**:
- 缩放和平移
- 点击设置位置/目标点
- 自动适配容器大小

### rosService - ROS通信服务

提供ROS通信的统一接口：

**核心方法**:
- `connect(url)` - 连接ROS Bridge
- `disconnect()` - 断开连接
- `subscribeTopic<T>()` - 订阅话题
- `publishMessage<T>()` - 发布消息
- `callService<Req, Res>()` - 调用服务
- `sendNavigationGoal()` - 发送导航目标

**事件系统**:
- `connection` - 连接状态变化
- `error` - 错误事件
- `navigation-feedback` - 导航反馈

## 常见问题

### 1. 无法连接到ROS Bridge

- 确保 rosbridge_server 已启动：`roslaunch rosbridge_server rosbridge_websocket.launch`
- 检查防火墙设置
- 确认端口号是否正确（默认9090）
- 查看浏览器控制台的错误信息

### 2. 地图无法显示

- 确认 `/map` 话题正在发布：`rostopic echo /map -n 1`
- 检查地图数据格式是否正确
- 查看浏览器控制台是否有渲染错误

### 3. 导航无法开始

- 确保已正确设置机器人初始位姿（手动重定位）
- 检查 move_base 节点是否正常运行：`rosnode info /move_base`
- 确认目标点在地图的可达区域内
- 查看导航服务器是否已加载地图

### 4. 机器人位置不准确

- 重新进行定位（手动重定位下点击机器人实际位置）
- 检查AMCL节点是否正常工作
- 确认里程计数据是否准确

### 5. 地图无法保存

- 检查 HTTP API 服务器是否启动（端口8080）
- 确认 `saved_maps/` 目录是否存在且有写权限
- 检查浏览器控制台的网络请求错误
- 降级模式：服务器不可用时会使用浏览器 localStorage

## 性能优化

- **轨迹采样**: 仅当移动距离>0.1m时添加新点
- **轨迹限制**: 最多保留500个轨迹点
- **Canvas渲染**: 使用Canvas API而非DOM，性能更好
- **图像渲染**: imageRendering: 'pixelated' 保持像素风格
- **自动重连**: 避免频繁重连，3秒间隔

## 安全和容错

- **连接失败处理**: try-catch包装ROS调用
- **超时保护**: 重连等待3秒
- **状态检查**: 导航前检查机器人位姿和目标点
- **错误提示**: 通过antd message显示用户友好的错误信息
- **自动重连**: 连接断开后自动尝试重新连接

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

### 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 联系方式

如有问题，请通过 Issue 联系我们

## 相关文档

- [ROS集成指南](./ROS_INTEGRATION.md) - 详细的ROS后端配置
- [快速开始](./QUICKSTART.md) - 快速上手指南
- [启动脚本说明](./STARTUP_SCRIPTS.md) - 启动脚本详解
- [导航事件处理](./NAVIGATION_EVENTS.md) - 导航结果和反馈的处理方式
- [坐标系说明](./COORDINATE_SYSTEM.md) - 坐标转换和显示
- [调试指南](./DEBUG_ROBOT_DISPLAY.md) - 机器人显示调试
- [任务系统架构](./TASK_SYSTEM.md) - 可扩展任务系统架构设计
- [任务使用指南](./TASK_USAGE_GUIDE.md) - 附加任务系统使用说明
- [更新日志](./CHANGELOG.md) - 版本更新记录
- [测试报告](./TEST_REPORT.md) - 测试覆盖和结果

## 致谢

感谢所有为这个项目做出贡献的开发者！
