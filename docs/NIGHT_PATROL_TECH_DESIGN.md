# 机器人夜间巡房系统 技术设计

## 基本信息

| 项目 | 内容 |
|------|------|
| 需求来源 | 机器人夜间巡房系统 PRD（泰康之家 POC）v1.2 |
| 项目类型 | 增量功能 |
| 涉及算法 | 是（VLM 视觉检测：在床检测、杂物检测、水渍检测） |
| 关联仓库 | app_navigation（当前仓库） |
| 技术负责人 | — |
| 状态 | 草稿 |

## 一、需求理解

### 技术问题

在现有导航巡航架构上，扩展出完整的"夜间巡房"业务流程：

1. **巡房编排**：现有多点巡航只支持"导航到点 → 执行附加任务"，需扩展为"导航 → 开门 → 进入 → 检测 → 拍照 → 退出 → 关门"的房间级编排
2. **视觉检测集成**：需调用 VLM（视觉语言模型）进行三类异常检测（在床/杂物/水渍），当前任务系统无此能力
3. **告警系统**：需新建告警生成、存储、推送、处理的完整链路，当前架构无告警概念
4. **Web 告警后台**：在现有 React 前端上新增告警管理页面

### 关键约束

- POC 级别，优先可用性，5 间房 + 1 走廊
- 依赖 S1 机械臂能力（开门/关门），通过 ROS Action 调用
- 无夜视能力，走廊照度 ≥30lux，房间 ≥50lux
- 单房间巡房 ≤3 分钟，5 间房总计 ≤30 分钟
- 告警延迟 ≤10 秒（检测到推送）

---

## 二、系统拆解

### 组件清单

| 组件 | 类型 | 说明 | 部署 |
|------|------|------|------|
| app_navigation（后端） | App | FastAPI 后端，巡房编排 + 告警管理 + 数据存储 | x86 |
| app_navigation（前端） | App | React UI，导航地图 + 告警后台 | Browser |
| VLM 检测服务 | 外部服务 | 视觉语言模型，提供三类异常检测 API | x86/Cloud |
| ROS 2 底层 | 底层 | SLAM、Nav2、机械臂控制 | Robot |

### 调用关系

```
Web 前端 ──HTTP/SSE──▶ FastAPI 后端
                          ├──roslibpy──▶ ROS 2（导航/SLAM/机械臂）
                          ├──HTTP──▶ VLM 检测服务（图像分析）
                          └──SQLite──▶ 本地数据库（告警/巡房记录）
```

---

## 三、现有架构分析

### 3.1 系统分层架构

```
┌─────────────────────────────────────────────────────────┐
│  Web Frontend (React + TypeScript, port 3500)           │
│  ├── Navigation 页面 (地图 + 导航 + 多点巡航)          │
│  ├── Dashboard / MapManager / Mapping 等                │
│  └── [新增] Alert 告警管理页面                          │
├─────────────────────────────────────────────────────────┤
│  FastAPI Backend (Python, port 8080)                    │
│  ├── src/main.py          — REST + SSE 路由             │
│  ├── src/logic.py         — 组装类 + 连接管理           │
│  ├── src/navigation.py    — 单点导航                    │
│  ├── src/patrol.py        — 多点巡航编排                │
│  ├── src/map_manager.py   — 地图管理                    │
│  ├── src/chassis.py       — 底盘/Dock                   │
│  ├── src/localization.py  — 定位/建图                   │
│  ├── [新增] src/room_config.py  — 房间点位配置 + 录制       │
│  ├── [新增] src/patrol_room.py — 巡房编排               │
│  ├── [新增] src/detection.py   — VLM 检测调用           │
│  ├── [新增] src/alert.py       — 告警管理               │
│  └── [新增] src/storage.py     — JSON 按天存储工具       │
├─────────────────────────────────────────────────────────┤
│  ROS 2 (roslibpy via WebSocket, port 9090)              │
│  ├── Nav2 导航                                          │
│  ├── SLAM 建图                                          │
│  ├── 机械臂控制 (开门/关门 Action)                      │
│  └── 摄像头图像话题                                     │
└─────────────────────────────────────────────────────────┘
```

### 3.2 关键文件

| 文件 | 说明 |
|------|------|
| `src/logic.py` | BusinessLogic 组装类，Mixin 继承所有功能模块 |
| `src/patrol.py` | PatrolMixin — 多点巡航编排、持久化、自动推进 |
| `src/navigation.py` | NavigationMixin — 单点导航、Action 回调 |
| `src/main.py` | FastAPI 路由，SSE 状态推送 |
| `ui/src/types/task.ts` | 15+ 可扩展任务类型（PHOTO、INSPECT、CUSTOM 等） |
| `ui/src/services/ros.ts` | 前端 HTTP/SSE 适配器 |
| `ui/src/components/Navigation/index.tsx` | 导航页面，巡航 SSE 状态驱动 |

### 3.3 现有巡航机制

当前 `PatrolMixin` 支持：
- 多路径点按序导航，失败跳过继续
- 每个路径点可附加 TaskConfig（tasks 数组）
- 后端编排，前端刷新不丢失（磁盘持久化）
- SSE 实时推送巡航进度

**巡房需在此基础上扩展**：路径点从"坐标点"升级为"房间"概念，任务从简单附加升级为房间级巡检流程。

### 3.4 改动影响分析

| 改动项 | 现有实现 | 改动内容 | 影响范围 |
|--------|---------|---------|---------|
| `src/patrol.py` | 多点巡航 | 不变，巡房复用其编排机制 | 无 |
| `src/main.py` | REST 路由 | 新增巡房/告警/检测/点位录制端点 | 新增，不影响现有 |
| `src/logic.py` | Mixin 组装 | 新增 RoomConfigMixin、RoomPatrolMixin、DetectionMixin、AlertMixin | 新增继承 |
| `ui/src/services/ros.ts` | HTTP 适配器 | 新增巡房/告警/点位录制 API 方法 | 新增方法 |
| 前端 | Navigation 页面 | 新增 Alert 页面 + 点位录制页面 + 路由 | 新增页面 |
| 数据存储 | 无 | 新增 JSON 按天归档存储（data/ 目录） | 新增 |

---

## 四、技术方案

### 4.1 点位录制 (`src/room_config.py` — `RoomConfigMixin`)

巡房的前提是每个房间有精确的点位数据。点位录制是**首次部署时的必需步骤**，由操作员在现场通过 Web UI 完成。

#### 录制交互流程

```
1. 操作员进入"点位录制"页面
2. 选择"新建房间"，输入房间号（如 101）
3. 系统显示当前机器人实时位置（来自 /loc_high_freq）
4. 操作员遥控机器人到门外位置 → 点击"记录门外点位" → 保存当前 pose
5. 操作员遥控机器人到门内通道位置 → 点击"记录门内点位" → 保存
6. 操作员遥控机器人到床位检测位置 → 点击"记录床位点位" → 保存
7. 重复 2-6 录制所有房间
8. 最后录制"起始/返回点位"
9. 点击"保存配置" → 后端写入 JSON 文件
```

#### 前端 UI — RoomConfigPage (`/room-patrol/config`)

```
┌──────────────────────────────────────────────────────┐
│  点位录制                                    [保存配置] │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────────┐  ┌────────────────────────┐│
│  │                     │  │ 起始点位               ││
│  │                     │  │  (0.00, 0.00, 0°) [录制]││
│  │     地图实时显示      │  │                        ││
│  │  （显示机器人位置      │  │ 房间列表               ││
│  │    + 已录制点位标记）  │  │ ┌────────────────────┐││
│  │                     │  │ │ 101室          [删除]│││
│  │                     │  │ │  门外: ✅ (5.2, 3.1) │││
│  │                     │  │ │  门内: ✅ (5.2, 4.0) │││
│  │                     │  │ │  床位: ✅ (5.2, 5.5) │││
│  │                     │  │ ├────────────────────┤││
│  │                     │  │ │ 102室          [删除]│││
│  │                     │  │ │  门外: ✅            │││
│  │                     │  │ │  门内: ❌ [录制]     │││
│  │                     │  │ │  床位: ❌ [录制]     │││
│  │                     │  │ └────────────────────┘││
│  │                     │  │                        ││
│  │                     │  │ [+ 新建房间]            ││
│  └─────────────────────┘  └────────────────────────┘│
│                                                      │
│  当前机器人位置: x=5.20  y=3.10  θ=90.0°             │
└──────────────────────────────────────────────────────┘
```

**交互细节**：
- 地图上用不同颜色标记已录制点位（蓝=门外、绿=门内、红=床位）
- 点击"录制"按钮时，自动抓取当前机器人 pose 填入
- 已录制的点位可点击重新录制（覆盖）
- 支持在地图上点击微调点位坐标
- 点位未录制完整的房间标记为"未就绪"，无法参与巡房

#### 后端接口

```python
class RoomConfigMixin:
    """房间点位配置管理"""

    def get_room_config(self) -> dict:
        """读取房间配置"""
        ...

    def save_room_config(self, config: dict) -> dict:
        """保存完整房间配置"""
        ...

    def record_room_waypoint(self, room_id: str, waypoint_type: str) -> dict:
        """录制单个点位 — 抓取当前机器人 pose 保存
        waypoint_type: 'door_outside' | 'door_inside' | 'bed_check' | 'start_position'
        """
        # 从 self._topic_data['/loc_high_freq'] 获取当前 pose
        ...

    def add_room(self, room_id: str, room_name: str) -> dict:
        """新建房间（点位待录制）"""
        ...

    def delete_room(self, room_id: str) -> dict:
        """删除房间"""
        ...
```

#### REST 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/room-config` | 获取房间配置 |
| `POST` | `/api/room-config` | 保存完整配置 |
| `POST` | `/api/room-config/rooms` | 新建房间 |
| `DELETE` | `/api/room-config/rooms/{room_id}` | 删除房间 |
| `POST` | `/api/room-config/rooms/{room_id}/record` | 录制点位（抓取当前 pose） |

录制点位请求：
```python
class RecordWaypointRequest(BaseModel):
    waypoint_type: str   # "door_outside" | "door_inside" | "bed_check" | "start_position"
```

#### 存储文件

`saved_nav_configs/room_patrol_config.json`：

```json
{
    "start_position": {"x": 0, "y": 0, "theta": 0},
    "rooms": [
        {
            "room_id": "101",
            "room_name": "101室",
            "door_outside": {"x": 5.2, "y": 3.1, "theta": 1.57},
            "door_inside": {"x": 5.2, "y": 4.0, "theta": 1.57},
            "bed_check": {"x": 5.2, "y": 5.5, "theta": 0},
            "door_type": "L_handle",
            "enabled": true
        }
    ],
    "retry_limit": 3,
    "detection_types": ["bed", "clutter", "water"],
    "updated_at": "2026-03-25T14:30:00"
}
```

### 4.2 巡房编排 (`src/patrol_room.py` — `RoomPatrolMixin`)

#### 核心逻辑

巡房是在多点巡航基础上的**高级编排**。每个"房间"由多个路径点 + 任务序列组成：

```
巡房任务 = [房间1, 房间2, ..., 房间N]

每个房间 = {
  room_id: "101",
  room_name: "101室",
  waypoints: {
    door_outside:  {x, y, theta},   # 门外点位
    door_inside:   {x, y, theta},   # 门内通道点位
    bed_check:     {x, y, theta},   # 床位检测点位
  },
  tasks: [                           # 房间内任务序列
    NAVIGATE_TO(door_outside),
    OPEN_DOOR,
    NAVIGATE_TO(door_inside),
    DETECT_FLOOR(杂物+水渍) + PHOTO,
    NAVIGATE_TO(bed_check),
    DETECT_BED(在床检测) + PHOTO,
    NAVIGATE_TO(door_inside),
    NAVIGATE_TO(door_outside),
    CLOSE_DOOR,
  ]
}
```

#### 状态机

```
idle → preparing → room_N_navigating → room_N_opening_door
  → room_N_entering → room_N_detecting_floor → room_N_detecting_bed
  → room_N_exiting → room_N_closing_door → (下一房间 | completed)
```

每个步骤失败时：
- 导航失败：重试 3 次 → 跳过该房间
- 开门失败：重试 3 次 → 跳过该房间（记录失败）
- 检测失败：标记"待确认" → 继续下一步
- 关门失败：重试 3 次 → 记录失败 → 继续下一房间

#### 数据模型

```python
@dataclass
class RoomConfig:
    room_id: str                    # "101"
    room_name: str                  # "101室"
    door_outside: dict              # {x, y, theta}
    door_inside: dict               # {x, y, theta}
    bed_check: dict                 # {x, y, theta}
    door_type: str = "L_handle"     # 门类型
    enabled: bool = True            # 是否参与巡房

@dataclass
class RoomPatrolConfig:
    rooms: list[RoomConfig]
    start_position: dict            # 起始/返回点位
    retry_limit: int = 3
    detection_types: list[str] = field(default_factory=lambda: ["bed", "clutter", "water"])
```

#### SSE 状态推送

在 `get_state()` 中新增 `room_patrol` 字段：

```python
"room_patrol": {
    "active": bool,
    "status": "idle|navigating|detecting|completed|failed",
    "current_room": "101",
    "current_step": "opening_door",
    "rooms_completed": ["101", "102"],
    "rooms_failed": ["103"],
    "rooms_total": 5,
    "progress": 0.4,
    "current_detection": {...},      # 当前检测结果
    "error": "",
}
```

### 4.3 视觉检测 (`src/detection.py` — `DetectionMixin`)

#### 检测流程

```
摄像头图像话题 → 抓取单帧 → 调用 VLM API → 解析结果 → 生成告警
```

#### VLM 调用接口

```python
class DetectionMixin:
    async def detect_bed_occupancy(self, image: bytes) -> DetectionResult:
        """在床检测：老人是否在床"""
        ...

    async def detect_floor_clutter(self, image: bytes) -> DetectionResult:
        """杂物检测：通道是否有障碍物"""
        ...

    async def detect_floor_water(self, image: bytes) -> DetectionResult:
        """水渍检测：地面是否有水渍"""
        ...

    def capture_image(self) -> bytes:
        """从 ROS 摄像头话题抓取当前帧"""
        ...
```

#### DetectionResult

```python
@dataclass
class DetectionResult:
    detection_type: str       # "bed" | "clutter" | "water"
    is_abnormal: bool         # True=异常
    confidence: float         # 0-1 置信度
    description: str          # 描述文本
    image_data: bytes         # 原始图像
    timestamp: float
    room_id: str
```

#### VLM 配置

VLM 服务地址在 `manifest.yaml` 中配置：

```yaml
remote_routes:
  ros_bridge: "ws://localhost:9090"
  vlm_service: "http://localhost:8090"    # 新增
```

### 4.4 告警系统 (`src/alert.py` — `AlertMixin`)

#### 告警生命周期

```
异常检测 → 生成告警(NEW) → 推送到前端
  → 护工确认(PROCESSING) → 护工处置(CLOSED)
```

#### 数据模型

```python
@dataclass
class Alert:
    id: str                   # UUID
    room_id: str              # "101"
    alert_type: str           # "bed_absence" | "floor_clutter" | "floor_water"
    status: str               # "new" | "processing" | "closed"
    message: str              # 推送文案
    photo_url: str            # 照片 URL
    photo_thumbnail: str      # 缩略图 base64
    confidence: float         # 检测置信度
    created_at: str           # ISO 时间
    confirmed_at: str | None  # 确认时间
    closed_at: str | None     # 关闭时间
    patrol_id: str            # 关联巡房任务 ID
```

#### 存储

JSON 文件按天存储，目录结构：

```
data/
├── records/
│   └── 2026-03-25/
│       ├── patrol_a1b2c3.json        # 单次巡房任务记录
│       └── patrol_d4e5f6.json
├── alerts/
│   └── 2026-03-25/
│       ├── alert_x1y2z3.json         # 单条告警
│       └── alert_x4y5z6.json
└── photos/
    └── 2026-03-25/
        ├── 101_1711382700_bed.jpg
        └── 103_1711382800_floor.jpg
```

#### SSE 告警推送

新告警实时通过 SSE 推送：

```python
"alerts": {
    "new_count": 2,
    "latest": [...],          # 最新 N 条告警
}
```

### 4.5 机械臂控制（开门/关门）

通过 ROS Action 调用 S1 机械臂：

| 操作 | ROS Action | 说明 |
|------|-----------|------|
| 开门 | `/arm/open_door` | 识别门把手 → 下压 → 拉开（向外） |
| 关门 | `/arm/close_door` | 识别门把手 → 下压 → 向内推 |

Action 接口由机械臂团队提供，本系统仅负责调用和结果处理。

### 4.6 照片管理

```
拍照 → 保存到 data/photos/{YYYY-MM-DD}/{room_id}_{timestamp}_{type}.jpg
     → 生成缩略图（200x200）
     → 写入巡房记录 JSON
     → 关联到告警 JSON（如有异常）
```

照片通过 REST 端点提供访问：`GET /api/photos/{photo_id}`

---

## 五、接口设计

### 5.1 后端新增 REST 端点

#### 巡房控制

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/room-patrol/start` | 启动巡房任务 |
| `POST` | `/api/room-patrol/stop` | 停止巡房任务 |
| `GET` | `/api/room-patrol/status` | 获取巡房状态 |
| `GET` | `/api/room-patrol/config` | 获取房间配置 |
| `POST` | `/api/room-patrol/config` | 更新房间配置（点位、启用状态） |

```python
class StartRoomPatrolRequest(BaseModel):
    room_ids: list[str] | None = None   # None=全部房间

class RoomConfigRequest(BaseModel):
    rooms: list[dict]                   # RoomConfig 列表
```

#### 告警管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/alerts` | 告警列表（支持 status/type 过滤） |
| `GET` | `/api/alerts/{id}` | 告警详情 |
| `POST` | `/api/alerts/{id}/confirm` | 确认告警（new → processing） |
| `POST` | `/api/alerts/{id}/close` | 关闭告警（processing → closed） |

#### 历史记录

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/patrol-records` | 巡房历史记录列表 |
| `GET` | `/api/patrol-records/{id}` | 单次巡房详情（含每个房间结果） |

#### 照片

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/photos/{photo_id}` | 获取照片原图 |
| `GET` | `/api/photos/{photo_id}/thumbnail` | 获取缩略图 |

### 5.2 SSE 状态扩展

`GET /api/state` 响应新增：

```json
{
    "connected": true,
    "nav_status": "...",
    "patrol": { "..." },
    "room_patrol": {
        "active": true,
        "status": "detecting",
        "current_room": "101",
        "current_step": "detect_bed",
        "rooms_completed": ["101"],
        "rooms_failed": [],
        "rooms_total": 5,
        "progress": 0.2
    },
    "alerts": {
        "new_count": 1,
        "latest": [
            {
                "id": "...",
                "room_id": "101",
                "alert_type": "bed_absence",
                "status": "new",
                "message": "101 房间老人离床",
                "photo_thumbnail": "data:image/...",
                "created_at": "2026-03-22T23:45:00"
            }
        ]
    }
}
```

### 5.3 前端新增

#### ros.ts 新增方法

```typescript
// 巡房
startRoomPatrol(roomIds?: string[]): Promise<Result>
stopRoomPatrol(): Promise<Result>
getRoomPatrolConfig(): Promise<RoomConfig[]>
updateRoomPatrolConfig(rooms: RoomConfig[]): Promise<Result>

// 告警
getAlerts(filter?: {status?, type?}): Promise<Alert[]>
getAlertDetail(id: string): Promise<Alert>
confirmAlert(id: string): Promise<Result>
closeAlert(id: string): Promise<Result>

// SSE 事件
emit('room-patrol-state', data)
emit('alerts-update', data)
```

#### 新增页面

| 页面 | 路由 | 说明 |
|------|------|------|
| RoomConfigPage | `/room-patrol/config` | 点位录制 — 房间管理 + 实时 pose 录制 |
| AlertDashboard | `/alerts` | 告警列表 + 实时推送 |
| AlertDetail | `/alerts/:id` | 告警详情 + 大图查看 |
| RoomPatrolMonitor | `/room-patrol` | 巡房实时监控 |

---

## 六、数据模型

### 存储策略：JSON 按天归档

不使用数据库，所有运行时数据以 JSON 文件按天存储，简单直观，便于调试和导出。

#### 目录结构

```
data/
├── records/                          # 巡房任务记录
│   └── 2026-03-25/
│       └── patrol_{id}.json
├── alerts/                           # 告警记录
│   └── 2026-03-25/
│       └── alert_{id}.json
└── photos/                           # 照片文件
    └── 2026-03-25/
        └── {room_id}_{timestamp}_{type}.jpg
```

#### 巡房记录 `data/records/{date}/patrol_{id}.json`

```json
{
    "id": "patrol_20260325_234500",
    "started_at": "2026-03-25T23:45:00",
    "finished_at": "2026-03-25T23:58:00",
    "status": "completed",
    "rooms_total": 5,
    "rooms_completed": 4,
    "rooms_failed": 1,
    "room_results": [
        {
            "room_id": "101",
            "room_name": "101室",
            "status": "success",
            "started_at": "2026-03-25T23:45:30",
            "finished_at": "2026-03-25T23:48:00",
            "steps": [
                {"step": "navigate_door", "status": "success", "duration": 15.2},
                {"step": "open_door", "status": "success", "duration": 8.5},
                {"step": "detect_floor", "status": "success", "result": {"clutter": false, "water": false}},
                {"step": "detect_bed", "status": "success", "result": {"in_bed": true, "confidence": 0.95}},
                {"step": "exit_room", "status": "success"},
                {"step": "close_door", "status": "success"}
            ],
            "photos": ["101_1711382730_floor.jpg", "101_1711382745_bed.jpg"],
            "alerts": []
        },
        {
            "room_id": "103",
            "status": "failed",
            "error": "open_door failed after 3 retries",
            "alerts": []
        }
    ]
}
```

#### 告警记录 `data/alerts/{date}/alert_{id}.json`

```json
{
    "id": "alert_20260325_234800",
    "patrol_id": "patrol_20260325_234500",
    "room_id": "102",
    "alert_type": "bed_absence",
    "status": "new",
    "message": "【异常提醒】102 房间老人离床，请及时查看",
    "confidence": 0.92,
    "photo": "102_1711382880_bed.jpg",
    "photo_thumbnail": "data:image/jpeg;base64,...",
    "created_at": "2026-03-25T23:48:00",
    "confirmed_at": null,
    "closed_at": null
}
```

#### 读写工具 (`src/storage.py`)

```python
class JsonDayStorage:
    """按天存储 JSON 文件的通用工具"""

    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)

    def save(self, category: str, record_id: str, data: dict, date: str | None = None):
        """保存记录到 data/{category}/{date}/{record_id}.json"""
        ...

    def load(self, category: str, record_id: str, date: str) -> dict | None:
        """加载单条记录"""
        ...

    def list_by_date(self, category: str, date: str) -> list[dict]:
        """列出某天所有记录"""
        ...

    def list_recent(self, category: str, days: int = 7) -> list[dict]:
        """列出最近 N 天的记录"""
        ...

    def update(self, category: str, record_id: str, date: str, patch: dict):
        """部分更新（告警状态流转等）"""
        ...
```

### 房间配置文件

`saved_nav_configs/room_patrol_config.json`（与点位录制共用）：

```json
{
    "start_position": {"x": 0, "y": 0, "theta": 0},
    "rooms": [
        {
            "room_id": "101",
            "room_name": "101室",
            "door_outside": {"x": 5.2, "y": 3.1, "theta": 1.57},
            "door_inside": {"x": 5.2, "y": 4.0, "theta": 1.57},
            "bed_check": {"x": 5.2, "y": 5.5, "theta": 0},
            "door_type": "L_handle",
            "enabled": true
        }
    ],
    "retry_limit": 3,
    "detection_types": ["bed", "clutter", "water"],
    "updated_at": "2026-03-25T14:30:00"
}
```

---

## 七、风险与排期

### 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| VLM 检测服务不稳定 | 巡房中断或告警缺失 | 超时兜底 + 标记"待确认" + 仍拍照保存 |
| 开门/关门 ROS Action 未就绪 | 无法实机测试 | 先用 mock Action 开发，接口对齐后切换 |
| 低照度环境检测准确率下降 | 误报/漏报增多 | VLM prompt 优化 + 置信度阈值调整 |
| JSON 文件量增长 | 长期运行后文件数多 | 按天归档 + 定期清理（保留 N 天） |
| 网络抖动导致照片上传失败 | 照片缺失 | 本地先存 → 异步上传 → 重试机制 |

### 排期

| 任务 | 开始日期 | 截止日期 | 前置任务 | 优先级 |
|------|---------|---------|---------|--------|
| **阶段一：点位录制 + 数据层** | | | | |
| ├─ JsonDayStorage 存储工具 | 2026-03-26 | 2026-03-26 | — | P0 |
| ├─ RoomConfigMixin 房间配置后端 | 2026-03-26 | 2026-03-27 | — | P0 |
| ├─ 点位录制前端页面 (RoomConfigPage) | 2026-03-27 | 2026-03-29 | RoomConfigMixin | P0 |
| └─ ros.ts 新增录制 API 方法 | 2026-03-27 | 2026-03-28 | — | P0 |
| **阶段二：后端巡房核心** | | | | |
| ├─ RoomPatrolMixin 巡房编排 | 2026-03-29 | 2026-04-02 | 点位录制 | P0 |
| ├─ DetectionMixin VLM 调用 | 2026-03-29 | 2026-03-31 | — | P0 |
| ├─ AlertMixin 告警管理 | 2026-03-31 | 2026-04-02 | JsonDayStorage | P0 |
| └─ REST 端点 + SSE 扩展 | 2026-04-02 | 2026-04-03 | 上述全部 | P0 |
| **阶段三：前端告警后台** | | | | |
| ├─ AlertDashboard 告警列表 | 2026-04-03 | 2026-04-05 | REST 端点 | P0 |
| ├─ AlertDetail 告警详情 | 2026-04-05 | 2026-04-06 | 告警列表 | P0 |
| └─ RoomPatrolMonitor 巡房监控 | 2026-04-06 | 2026-04-09 | SSE 扩展 | P1 |
| **阶段四：集成调试** | | | | |
| ├─ Mock 巡房流程端到端测试 | 2026-04-09 | 2026-04-11 | 阶段二+三 | P0 |
| ├─ VLM 服务对接调试 | 2026-04-11 | 2026-04-14 | DetectionMixin | P0 |
| └─ 机械臂 Action 对接 | 2026-04-11 | 2026-04-14 | RoomPatrolMixin | P0 |
| **阶段五：实机验证** | | | | |
| ├─ 泰康现场建图 + 点位录制 | 2026-04-15 | 2026-04-16 | 全部 | P0 |
| └─ 5 间房全链路验收测试 | 2026-04-16 | 2026-04-18 | 现场建图 | P0 |
