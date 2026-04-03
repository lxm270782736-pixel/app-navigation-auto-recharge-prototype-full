# Astribot Navigation UI

> 基于 React + TypeScript 的机器人SLAM建图和自主导航界面系统

一个现代化的Web界面，为Astribot机器人提供完整的建图、导航和监控功能。前端通过HTTP REST + SSE与FastAPI后端通信，后端经由astribot_link连接Meta服务（定位和导航）。

## 特性亮点

- 🗺️ **一键式SLAM建图** - 自动启动建图流程，实时预览地图构建
- 🧭 **可视化导航** - 交互式地图操作，点击设置目标点
- 📊 **实时监控** - 机器人状态、电池电量、位置速度实时显示
- 🖱️ **直观交互** - 鼠标滚轮缩放、拖拽平移、轨迹跟踪
- 💾 **服务器存储** - 地图数据保存在服务器端，支持持久化存储
- 🔄 **自动重连** - 后端连接断开后自动重新连接
- 🎯 **可扩展任务系统** - 支持15+任务类型（等待、拍照、轨迹、扫描、检测、声音、显示等）
- 🎨 **可视化任务流编辑器** - Scratch风格的拖拽式任务编排界面
- 🚀 **一键节点启动** - Dashboard中一键启动SLAM和导航节点
- 🎛️ **定位模式管理** - 统一的模式切换界面（建图/定位/避障）
- ✏️ **地图编辑** - 内置地图编辑器，支持绘制障碍物、自由区域和橡皮擦工具
- ↩️ **撤销/重做** - 完整的历史记录管理，支持键盘快捷键（Ctrl+Z/Ctrl+Y）

## 功能模块

### 1. 系统监控仪表板 (Dashboard)
- 后端连接状态实时指示
- 电池电量监控（百分比 + 进度条）
- 机器人位置（X, Y 坐标）
- 朝向角度显示
- 速度信息（线速度/角速度）
- 快捷导航卡片
- **一键服务启动器** - 顺序启动定位服务和导航服务，带状态跟踪
- **定位模式管理** - 统一切换建图/定位/自动定位/避障模式

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
- 机器人轨迹跟踪（最近500点，距离采样>0.1m）
- 坐标系可视化
- 路径规划实时显示
- **可扩展任务系统** - 支持15+任务类型的附加任务配置
- **双重成功检查** - 验证机器人到达位置 + 任务执行成功

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

### 8. 可扩展任务系统
支持在导航目标点附加多种任务类型，模块化设计便于扩展：

**基础任务**
- WAIT - 等待指定时长
- PHOTO - 拍照
- TRAJECTORY - 执行预设轨迹

**感知任务**
- SCAN - 环境扫描
- INSPECT - 检测识别

**交互任务**
- SOUND - 播放声音
- DISPLAY - 显示信息
- SIGNAL - 发送信号

**操作任务**
- PICKUP - 抓取物体
- PLACE - 放置物体
- CHARGE - 充电

**复合任务**
- SEQUENCE - 顺序执行
- PARALLEL - 并行执行
- CONDITIONAL - 条件执行
- LOOP - 循环执行
- CUSTOM - 自定义服务调用

**任务配置方式**
- 列表模式：拖拽排序，表单配置参数
- 流程模式：Scratch风格可视化编程界面（React Flow）

详见 [任务系统架构文档](./docs/TASK_SYSTEM.md)

## 技术栈

### 前端技术
- **框架**: React 18.2.0 + TypeScript 5.2.2
- **UI组件库**: Ant Design (antd) 5.12.0
- **路由**: React Router 6.20.0
- **构建工具**: Vite 5.0.8
- **日期处理**: dayjs 1.11.10
- **图标**: @ant-design/icons 5.2.6

### 后端通信
- **后端框架**: FastAPI (Python)
- **实时推送**: SSE (Server-Sent Events) - 每500ms推送完整状态
- **API协议**: HTTP REST
- **机器人服务**: astribot_link (Meta服务桥接库)
- **任务系统**: 可扩展的附加任务架构（支持15+任务类型）

## 系统架构

### 四层架构设计

```
┌─────────────────────────────────────────────────────────┐
│  UI 组件层 (React Components)                           │
│  Dashboard / MapManager / MapEditor / Navigation /      │
│  Mapping / LocalizationManager / NodeLauncher          │
└────────────────────────┬────────────────────────────────┘
                         │ useRobot Hook / HTTP REST + SSE
┌────────────────────────▼────────────────────────────────┐
│  服务层 (ui/src/services/api.ts)                        │
│  - sendNavigationGoal() → POST /api/navigation/go       │
│  - loadMap() → GET /api/maps/{id}                       │
│  - SSE订阅 /api/state (每500ms推送状态快照)              │
│  - 大数据轮询 /api/maps (每2s)                          │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP REST + SSE
              http://localhost:17634
                         │
┌────────────────────────▼────────────────────────────────┐
│  FastAPI 后端 (src/main.py + src/logic.py)              │
│  ├── MetaBridgeMixin   - Meta服务生命周期管理            │
│  ├── LocalizationMixin - 建图/定位模式控制               │
│  ├── MapManagerMixin   - 地图存储管理                   │
│  ├── NavigationMixin   - 导航目标控制                   │
│  └── PatrolMixin       - 巡逻任务管理                   │
└────────────────────────┬────────────────────────────────┘
                         │ astribot_link Python库
┌────────────────────────▼────────────────────────────────┐
│  Meta 服务层                                            │
│  - localization  (建图、定位、位姿估计)                  │
│  - astribot_navigation  (路径规划、运动控制)             │
│  服务生命周期: disconnected→connected→inactive→active   │
└─────────────────────────────────────────────────────────┘
```
### 地图存储架构

```
┌─────────────────────────────────────────────────────────┐
│  MapStorageService (src/services/storage.ts)            │
│  - getAllMaps() - 获取所有地图                           │
│  - getMap(id) - 获取单个地图                            │
│  - saveMap(map) - 保存地图                              │
│  - deleteMap(id) - 删除地图                             │
│  - generateThumbnail() - 生成缩略图 (max 200x200px)     │
│  - 自动降级: HTTP API → localStorage                    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP REST API
              http://localhost:17634/api
                         │
┌────────────────────────▼────────────────────────────────┐
│  HTTP API 服务器 (FastAPI/src/main.py)                  │
│  GET    /api/maps - 获取地图列表                        │
│  GET    /api/maps/{id} - 获取单个地图                   │
│  POST   /api/maps - 保存地图 (GZIP压缩)                 │
│  DELETE /api/maps/{id} - 删除地图                       │
└────────────────────────┬────────────────────────────────┘
                         │ 文件系统
┌────────────────────────▼────────────────────────────────┐
│  saved_maps/ 目录                                       │
│  - {map_id}.json.gz (GZIP压缩的地图数据)                │
│  - 包含: 栅格数据、元数据、缩略图(base64)                │
└─────────────────────────────────────────────────────────┘
```

## 快速开始

### 前置要求

- Node.js >= 16
- npm 或 yarn
- Python >= 3.8（用于后端服务）
- astribot_link（Astribot私有PyPI包）

```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 Python 后端依赖
pip install fastapi sse-starlette astribot_link
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

应用将在 `http://localhost:3500` 启动

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
- FastAPI 后端服务器在端口17634（含Mock Meta服务）
- 前端开发服务器在端口3500
- 访问 http://localhost:3500

#### 真实机器人模式

```bash
./start-real.sh
```

需要已安装并可访问的astribot_link和Meta服务环境

详细启动说明请参考 [STARTUP_SCRIPTS.md](./docs/STARTUP_SCRIPTS.md)

## 后端服务配置

### API 端点

前端自动检测后端地址：
- 端口17634时：使用同源地址（无前缀）
- 其他端口：使用 `http://{hostname}:17634`

**状态推送（SSE）**

| 端点 | 描述 |
|------|------|
| `GET /api/state` | SSE流，每500ms推送机器人完整状态 |

**导航接口**

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/navigation/go` | POST | 发送导航目标 |
| `/api/patrol/start` | POST | 启动多点巡逻 |
| `/api/room-patrol/start` | POST | 启动房间巡逻 |

**地图接口**

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/maps` | GET | 获取地图列表 |
| `/api/maps/{id}` | GET | 获取单个地图 |
| `/api/maps` | POST | 保存地图 |
| `/api/maps/{id}` | DELETE | 删除地图 |
| `/api/maps/apply` | POST | 加载地图到导航系统 |

**定位接口**

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/localization/start_mapping` | POST | 启动建图 |
| `/api/localization/start_localization` | POST | 启动定位 |
| `/api/localization/start_localization_auto` | POST | 启动自动定位 |
| `/api/localization/start_obstacle_avoidance` | POST | 启动避障模式 |
| `/api/localization/stop` | POST | 停止当前模式 |

**Meta服务生命周期接口**

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/meta/start` | POST | 连接并激活Meta服务 |
| `/api/meta/status` | GET | 查询Meta服务状态 |

## 项目结构

```
astribot_navigation_ui/
├── src/                           # Python后端
│   ├── main.py                    # FastAPI入口，HTTP + SSE接口定义
│   ├── logic.py                   # 业务逻辑（Mixin组合）
│   ├── meta_bridge.py             # astribot_link Meta服务生命周期管理
│   ├── localization.py            # 定位模式控制
│   ├── map_manager.py             # 地图存储管理
│   ├── navigation.py              # 导航目标控制
│   └── patrol.py / patrol_room.py # 巡逻任务管理
├── ui/                            # React前端
│   └── src/
│       ├── components/            # React组件
│       │   ├── Dashboard/         # 主仪表板组件
│       │   ├── MapManager/        # 地图管理组件
│       │   ├── MapEditor/         # 地图编辑器组件
│       │   ├── Mapping/           # 建图功能组件
│       │   ├── Navigation/        # 导航功能组件
│       │   ├── TaskFlowEditor/    # 可视化任务流编辑器（React Flow）
│       │   └── common/            # 公共组件
│       │       ├── MapCanvas.tsx  # 地图渲染引擎
│       │       ├── LocalizationManager.tsx  # 定位模式管理
│       │       ├── NodeLauncher.tsx         # 服务启动器
│       │       └── TaskConfigPanel.tsx      # 任务配置面板
│       ├── contexts/              # React Context上下文
│       │   └── RobotContext.tsx     # 连接状态管理
│       ├── services/              # 业务服务层
│       │   ├── api.ts             # HTTP REST + SSE 通信服务（单例）
│       │   └── storage.ts         # 地图存储服务（HTTP + localStorage降级）
│       └── types/                 # TypeScript类型定义
│           ├── index.ts           # 核心类型定义
│           └── task.ts            # 任务系统类型（15+任务类型）
├── saved_maps/                    # 服务器端地图存储目录
├── start-sim.sh                   # 仿真模式启动脚本
├── start-real.sh                  # 真实机器人启动脚本
└── docs/                          # 文档目录
    ├── NAVIGATION_EVENTS.md       # 导航事件处理（关键）
    ├── TASK_SYSTEM.md             # 任务系统架构
    ├── TASK_USAGE_GUIDE.md        # 任务使用指南
    ├── VISUAL_TASK_FLOW_EDITOR.md # 可视化任务流编辑器
    ├── MAP_STORAGE_ARCHITECTURE.md # 地图存储架构
    └── [其他文档...]
```

## 使用说明

### 1. 建图流程

1. 确保后端服务已启动且Meta服务已连接（或使用仿真模式）
2. 在Dashboard中切换定位模式为"建图"
3. 在主页面点击"SLAM建图"按钮
4. 系统自动启动建图流程
5. 使用遥控器控制机器人在环境中移动
6. 观察实时地图预览
7. 完成建图后点击"结束建图"
8. 输入地图名称并保存（保存到服务器）

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
7. （可选）配置导航参数和附加任务
8. 点击"开始导航"按钮

**导航成功判定（关键）**
- 条件1: 导航状态 === SUCCEEDED - 机器人到达目标位置
- 条件2: result.success !== false - 所有附加任务执行成功
- 两个条件必须同时满足才算导航成功

### 4. 附加任务配置

**配置方式**
- **列表模式**: 拖拽排序，表单配置参数
- **流程模式**: Scratch风格可视化编程（React Flow）

**常用任务示例**
- **等待任务**: 到达后停留指定时长（1-60秒）
- **拍照任务**: 自动拍照并保存
- **轨迹任务**: 执行预设的运动轨迹
- **扫描任务**: 环境扫描和数据采集
- **复合任务**: 顺序/并行/条件/循环执行多个任务

详见 [任务使用指南](./docs/TASK_USAGE_GUIDE.md) 和 [可视化任务流编辑器](./docs/VISUAL_TASK_FLOW_EDITOR.md)

### 5. 地图交互

- **缩放**: 鼠标滚轮向上/向下
- **平移**: 鼠标中键拖动 或 Ctrl+左键拖动
- **定位**: 手动重定位模式下左键点击地图
- **设置目标**: 目标点模式下左键点击地图
- **坐标转换**: 自动处理世界坐标(米) ↔ 像素坐标转换

## 配置选项

### 后端连接配置

前端自动检测后端地址（`ui/src/services/api.ts`）：

```typescript
// 端口17634时使用同源，否则使用 http://{hostname}:17634
const BASE_URL = window.location.port === '17634'
  ? ''
  : `http://${window.location.hostname}:17634`;
```

如需自定义，修改 `ui/src/services/api.ts` 中的 `BASE_URL` 常量。

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

### 调用后端API

在 `ui/src/services/api.ts` 中封装了所有后端调用：

```typescript
// 发送导航目标
await apiService.sendNavigationGoal({
  pose: { x: targetX, y: targetY, theta: targetTheta },
  tasks: [
    { type: 'WAIT', params: { duration: 5 } },
    { type: 'PHOTO', params: {} }
  ]
});

// 获取地图列表
const maps = await apiService.getMapList();

// 加载地图到导航系统
await apiService.applyMap(mapId);
```

### 监听SSE状态推送

```typescript
// SSE每500ms推送完整状态快照
apiService.on('state', (state) => {
  console.log('Pose:', state.pose);
  console.log('Nav status:', state.nav_status);
  console.log('Meta connected:', state.meta_connected);
});

apiService.on('navigation-feedback', (feedback) => {
  console.log('Distance remaining:', feedback.distance_remaining);
});

apiService.on('navigation-result', (result) => {
  // 双重检查：位置到达 + 任务成功
  const success = result.status === 'SUCCEEDED' && result.success !== false;
});
```

### 添加新的后端接口调用

在 `ui/src/services/api.ts` 中添加方法：

```typescript
async myNewAction(params: MyParams): Promise<MyResponse> {
  const response = await fetch(`${BASE_URL}/api/my-endpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return response.json();
}
```

在 `src/main.py` 中添加对应FastAPI端点，在 `src/logic.py` 对应Mixin中实现逻辑。

### 添加新的任务类型

1. 在 `ui/src/types/task.ts` 中添加任务类型：
```typescript
export enum TaskType {
  // ... 现有类型
  NEW_TASK = 'NEW_TASK'
}

export interface NewTaskParams {
  param1: string;
  param2: number;
}
```

2. 在 `ui/src/components/common/TaskConfigPanel.tsx` 中添加UI配置

3. 在 `src/navigation.py` 中实现后端执行逻辑

详见 [任务系统架构文档](./docs/TASK_SYSTEM.md)

## 核心组件说明

### MapCanvas.tsx - 地图渲染引擎

基于Canvas的高性能地图渲染组件：

**渲染元素**:
- 栅格地图（灰色=未知，白色=空闲，黑色=占据）
- 坐标系原点和轴线（红色=X轴，绿色=Y轴）
- 机器人位置和方向箭头（蓝色）
- 目标位置标记（红色）
- 机器人轨迹线（半透明蓝色，最多500点）

**交互功能**:
- 缩放和平移
- 点击设置位置/目标点
- 自动适配容器大小
- 坐标转换: 世界坐标(米) ↔ 像素坐标

**重要**: 始终使用MapCanvas的坐标转换方法，不要手动实现转换逻辑

### apiService (api.ts) - 后端通信服务

HTTP适配层，封装了所有后端API调用，对外保持与旧接口兼容的方法名：

**核心方法**:
- `connect()` - 建立SSE连接
- `sendNavigationGoal()` - POST /api/navigation/go
- `getMapList()` - GET /api/maps
- `applyMap(id)` - POST /api/maps/apply
- `saveMap()` - POST /api/maps/save

**SSE状态推送**（每500ms）:
- `meta_connected` - Meta服务连接状态
- `pose` - 机器人当前位置和朝向
- `nav_status` / `nav_feedback` - 导航状态和进度
- `patrol` / `room_patrol` - 巡逻任务状态

**大数据轮询**（每2秒）:
- 地图栅格数据（通过REST获取，数据量太大不适合SSE）

### LocalizationManager - 定位模式管理

统一的机器人运行模式切换界面：

**支持模式**:
- idle - 空闲
- mapping - 建图
- localization - 定位
- localization_auto - 自动定位
- obstacle_avoidance - 避障

**后端API调用**:
- `POST /api/localization/start_mapping`
- `POST /api/localization/start_localization`
- `POST /api/localization/start_localization_auto`
- `POST /api/localization/start_obstacle_avoidance`
- `POST /api/localization/stop`

**状态同步**: 通过SSE `/api/state` 实时获取当前定位模式

### NodeLauncher - 服务启动器

Dashboard中的一键服务启动组件：

**启动流程**:
1. 顺序启动定位服务 → 导航服务
2. 调用 `POST /api/meta/start` 触发Meta服务生命周期
3. 通过SSE监听 `meta_connected` 状态变化
4. 可视化进度条和详细状态模态框

## 常见问题

### 1. 无法连接到后端

- 确保FastAPI后端服务已启动（端口17634）
- 检查防火墙设置
- 查看浏览器控制台的网络请求错误
- 确认 `http://localhost:17634/api/state` 是否可访问

### 2. Meta服务未连接

- 检查 astribot_link 是否正确安装
- 查看后端日志确认Meta服务状态
- 在Dashboard中点击"启动服务"重新连接
- 后端支持自动重连，等待几秒后刷新状态

### 3. 地图无法显示

- 确认后端服务已成功加载地图
- 检查 `GET /api/maps/{id}` 是否正常返回数据
- 查看浏览器控制台是否有渲染错误

### 4. 导航无法开始

- 确保已正确设置机器人初始位姿（手动重定位）
- 检查Meta导航服务状态是否为active
- 确认目标点在地图的可达区域内
- 查看后端日志中的导航错误信息

### 5. 机器人位置不准确

- 重新进行定位（手动重定位下点击机器人实际位置）
- 检查Meta定位服务是否正常工作
- 通过SSE状态确认 `pose` 数据是否在更新

### 6. 地图无法保存

- 检查后端服务是否启动（端口17634）
- 确认 `saved_maps/` 目录是否存在且有写权限
- 检查浏览器控制台的网络请求错误
- 降级模式：服务器不可用时会使用浏览器 localStorage

## 性能优化

- **轨迹采样**: 仅当移动距离>0.1m时添加新点
- **轨迹限制**: 最多保留500个轨迹点
- **Canvas渲染**: 使用Canvas API而非DOM，性能更好
- **图像渲染**: imageRendering: 'pixelated' 保持像素风格
- **SSE推送**: 状态每500ms推送一次，避免频繁请求
- **大数据轮询**: 地图等大数据每2秒REST轮询，不走SSE

## 安全和容错

- **连接失败处理**: try-catch包装API调用
- **Meta服务自动恢复**: 后端检测Meta服务崩溃后自动重连
- **状态检查**: 导航前检查机器人位姿和目标点
- **错误提示**: 通过antd message显示用户友好的错误信息
- **存储降级**: 后端不可用时自动降级到浏览器localStorage

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

**必读文档**
- [导航事件处理](./docs/NAVIGATION_EVENTS.md) - 关键：导航结果、反馈和状态事件处理详情
- [任务系统架构](./docs/TASK_SYSTEM.md) - 可扩展任务架构设计和添加新任务类型
- [可视化任务流编辑器](./docs/VISUAL_TASK_FLOW_EDITOR.md) - 基于React Flow的可视化编程界面
- [地图存储架构](./docs/MAP_STORAGE_ARCHITECTURE.md) - 地图存储架构和API设计

**补充文档**
- [任务使用指南](./docs/TASK_USAGE_GUIDE.md) - 附加任务系统使用说明和示例
- [启动脚本说明](./docs/STARTUP_SCRIPTS.md) - 启动脚本详解
- [坐标系说明](./docs/COORDINATE_SYSTEM.md) - 坐标转换和显示

## 致谢

感谢所有为这个项目做出贡献的开发者！
