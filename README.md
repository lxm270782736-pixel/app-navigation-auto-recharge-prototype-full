# 机器人SLAM建图和自主导航UI系统

基于 React + TypeScript 的机器人导航界面系统，提供一键式建图、地图管理和自主导航功能。

## 功能特性

### 1. 地图管理
- 地图列表展示（缩略图 + 名称 + 创建日期）
- 创建新地图
- 删除地图
- 地图选择和加载

### 2. SLAM建图
- 一键启动建图流程
- 自动启动遥控手柄驱动
- 实时地图预览
- 地图命名和保存
- 自动生成缩略图

### 3. 自主导航
- 地图可视化展示
- 机器人位置初始化（手动定位）
- 目标点选择（点击地图设置）
- 实时路径规划显示
- 导航控制（开始/停止）

### 4. 附加任务
- 到达后停留（可配置时长）
- 执行预设轨迹
- 自动拍照

## 技术栈

- **前端框架**: React 18 + TypeScript
- **UI组件库**: Ant Design 5
- **ROS通信**: roslibjs (WebSocket)
- **路由**: React Router 6
- **构建工具**: Vite
- **地图渲染**: Canvas API

## 系统架构

```
┌─────────────────────────────────────┐
│        React UI 界面层               │
├─────────────────────────────────────┤
│     业务逻辑层 (Hooks & Context)     │
├─────────────────────────────────────┤
│      ROS通信层 (roslibjs)            │
├─────────────────────────────────────┤
│      ROS Bridge (WebSocket)          │
├─────────────────────────────────────┤
│   ROS 1 后端 (SLAM & Navigation)     │
└─────────────────────────────────────┘
```

## 快速开始

### 前置要求

- Node.js >= 16
- npm 或 yarn
- ROS 1 (Melodic/Noetic)
- rosbridge_suite 已安装并运行

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

应用将在 `http://localhost:3000` 启动

### 生产构建

```bash
npm run build
```

构建产物将在 `dist/` 目录

### 预览生产构建

```bash
npm run preview
```

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
| `/map` | `nav_msgs/OccupancyGrid` | 建图时的地图数据 |
| `/amcl_pose` | `geometry_msgs/PoseWithCovarianceStamped` | 机器人定位位姿 |

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

#### 使用的Action

| Action名 | Action类型 | 描述 |
|----------|------------|------|
| `/move_base` | `move_base_msgs/MoveBaseAction` | 导航到目标点 |

详细的ROS后端配置请参考 [ROS_INTEGRATION.md](./ROS_INTEGRATION.md)

## 项目结构

```
astribot_navigation_ui/
├── public/                    # 静态资源
├── src/
│   ├── components/            # React组件
│   │   ├── MapManager/        # 地图管理页面
│   │   ├── Mapping/           # 建图页面
│   │   ├── Navigation/        # 导航页面
│   │   └── common/            # 通用组件
│   │       └── MapCanvas.tsx  # 地图渲染组件
│   ├── contexts/              # React Context
│   │   └── ROSContext.tsx     # ROS连接管理
│   ├── services/              # 业务服务层
│   │   ├── ros.ts             # ROS通信服务
│   │   └── storage.ts         # 本地存储服务
│   ├── types/                 # TypeScript类型定义
│   │   └── index.ts
│   ├── App.tsx                # 主应用组件
│   ├── App.css                # 全局样式
│   └── main.tsx               # 入口文件
├── index.html                 # HTML模板
├── package.json               # 项目配置
├── tsconfig.json              # TypeScript配置
└── vite.config.ts             # Vite配置
```

## 使用说明

### 1. 建图流程

1. 在主页面点击"新建地图"按钮
2. 系统自动启动SLAM建图模块
3. 使用遥控器控制机器人在环境中移动
4. 完成建图后点击"结束建图"
5. 输入地图名称并保存

### 2. 导航流程

1. 在主页面选择已建地图
2. 进入导航界面后，先切换到"定位模式"
3. 在地图上点击机器人当前实际位置进行定位
4. 切换到"设置目标点"模式
5. 在地图上点击选择目标位置
6. （可选）勾选需要执行的附加任务
7. 点击"开始导航"按钮

### 3. 附加任务配置

- **到达后停留**: 勾选后可设置停留时长（1-60秒）
- **执行预设轨迹**: 机器人到达目标点后播放预设轨迹
- **自动拍照**: 到达目标点后自动拍照

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

地图数据存储在浏览器的 `localStorage` 中，键名为 `astribot_maps`

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

## 常见问题

### 1. 无法连接到ROS Bridge

- 确保 rosbridge_server 已启动
- 检查防火墙设置
- 确认端口号是否正确（默认9090）

### 2. 地图无法保存

- 检查浏览器是否禁用了localStorage
- 确认ROS的 `/save_map` 服务可用

### 3. 导航无法开始

- 确保已正确设置机器人初始位姿
- 检查 move_base 节点是否正常运行
- 确认目标点在地图的可达区域内

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request

## 联系方式

如有问题，请通过 Issue 联系我们
