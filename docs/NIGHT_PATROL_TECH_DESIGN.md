# 机器人夜间巡房系统 技术设计

## 基本信息

| 项目 | 内容 |
|------|------|
| 需求来源 | 机器人夜间巡房系统 PRD（泰康之家 POC）v1.2 |
| 项目类型 | 增量功能 |
| 涉及算法 | 是（VLM 视觉检测：在床检测、杂物检测、水渍检测，当前 Mock） |
| 关联仓库 | app_navigation（当前仓库） |
| 状态 | 已实现（POC） |

---

## 一、需求理解

### 技术问题

在现有导航巡航架构上，扩展出完整的"夜间巡房"业务流程：

1. **点位录制**：为每个房间录制门外、门内、床位三个关键点位
2. **巡房编排**：支持多任务预设，每个预设包含房间列表和可定制的步骤序列（导航→开门→检测→拍照→关门等）
3. **自定义步骤**：可扩展的自定义步骤系统，支持 ROS Service/Topic 调用和参数模板
4. **视觉检测集成**：调用 VLM 进行三类异常检测（在床/杂物/水渍），当前 Mock 实现
5. **告警系统**：告警生成、存储、确认、关闭的完整链路
6. **历史记录**：巡房记录按天归档，支持查看详细步骤执行结果

### 关键约束

- POC 级别，优先可用性，5 间房 + 1 走廊
- 依赖 S1 机械臂能力（开门/关门），当前 Mock 实现
- 单房间巡房 ≤3 分钟，5 间房总计 ≤30 分钟
- 告警延迟 ≤10 秒（检测到推送）

---

## 二、系统架构

### 2.1 分层架构

```
┌───────────────────────────────────────────────────────────────┐
│  Web Frontend (React + TypeScript + Ant Design, port 3500)     │
│  ├── RoomPatrol 页面 (4 Tab: 点位录制/任务编排/任务下发/历史)  │
│  ├── Navigation / Dashboard / MapManager 等                    │
│  └── CustomStepManager Modal                                   │
├───────────────────────────────────────────────────────────────┤
│  FastAPI Backend (Python, port 17659)                           │
│  ├── src/main.py           — REST + SSE 路由                   │
│  ├── src/logic.py          — BusinessLogic 组装类 + 连接管理    │
│  ├── src/room_config.py    — RoomConfigMixin (点位录制)         │
│  ├── src/patrol_room.py    — RoomPatrolMixin (巡房编排+预设)    │
│  ├── src/custom_steps.py   — CustomStepsMixin (自定义步骤类型)  │
│  ├── src/detection.py      — DetectionMixin (VLM Mock)          │
│  ├── src/alert.py          — AlertMixin (告警管理)              │
│  ├── src/storage.py        — JsonDayStorage (按天 JSON 存储)    │
│  ├── src/navigation.py     — NavigationMixin (单点导航)         │
│  ├── src/patrol.py         — PatrolMixin (多点巡航)             │
│  ├── src/map_manager.py    — MapManagerMixin (地图管理)          │
│  ├── src/chassis.py        — ChassisMixin (底盘/Dock)           │
│  └── src/localization.py   — LocalizationMixin (定位/建图)      │
├───────────────────────────────────────────────────────────────┤
│  ROS 2 (roslibpy via WebSocket, port 9090)                     │
│  ├── Nav2 导航                                                 │
│  ├── SLAM 建图                                                 │
│  ├── 机械臂控制 (开门/关门 — 待对接)                           │
│  └── 摄像头图像话题 (待对接)                                    │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 调用关系

```
Web 前端 ──HTTP/SSE──▶ FastAPI 后端
                          ├──roslibpy──▶ ROS 2（导航/SLAM/机械臂）
                          ├──HTTP──▶ VLM 检测服务（待对接，当前 Mock）
                          └──JSON 文件──▶ 本地存储
```

### 2.3 BusinessLogic Mixin 继承

```python
class BusinessLogic(
    LocalizationMixin,     # 定位/建图/遥控器
    MapManagerMixin,       # 地图 CRUD
    ChassisMixin,          # 底盘速度/初始位姿/Dock
    NavigationMixin,       # 单点导航 + Action 回调
    PatrolMixin,           # 多点巡航
    RoomConfigMixin,       # 房间点位配置
    DetectionMixin,        # VLM 视觉检测 (Mock)
    AlertMixin,            # 告警 CRUD
    RoomPatrolMixin,       # 巡房编排 + 任务预设
    CustomStepsMixin,      # 自定义步骤类型
):
```

所有 Mixin 共享 `self._lock`、`self._topic_data`、`self._ros` 等 BusinessLogic 基础属性。

---

## 三、前端页面结构

### 3.1 巡房任务 — 4 Tab 布局

路由：`/room-patrol`，组件 `RoomPatrol/index.tsx`

```
┌──────────────────────────────────────────────────┐
│ [← 返回] 巡房任务                   [已连接]      │
├──────────────────────────────────────────────────┤
│ 点位录制 | 任务编排 | 任务下发 | 历史记录          │
├──────────────────────────────────────────────────┤
│               Tab Content                        │
│           (100vh - 110px)                        │
└──────────────────────────────────────────────────┘
```

Tab 使用 `destroyInactiveTabPane` 确保切换时重新加载数据。

### 3.2 Tab 1: 点位录制 (`WaypointRecordTab.tsx`)

两栏布局：左侧地图，右侧配置面板。

```
┌─────────────────────┬──────────────────────┐
│                     │ [拖拽点位] [键盘遥控]  │
│                     │                      │
│     MapCanvas       │ 起始/返回点位         │
│  (机器人 + 点位      │  (0.00, 0.00, 0.0°)  │
│   蓝=门外 绿=门内    │                      │
│   红=床位 紫=起点)   │ 房间列表 (N)          │
│                     │ ┌──────────────────┐  │
│                     │ │ 1. 101室 [就绪]   │  │
│                     │ │  ● 门外 (x,y,θ)  │  │
│                     │ │  ● 门内 (x,y,θ)  │  │
│                     │ │  ● 床位 (x,y,θ)  │  │
│  [x=5.20 y=3.10     │ └──────────────────┘  │
│   θ=90.0°]          │ [+ 新建房间]           │
└─────────────────────┴──────────────────────┘
```

**功能**：
- 点位颜色：蓝=门外 `#1890ff`、绿=门内 `#52c41a`、红=床位 `#ff4d4f`、紫=起点 `#722ed1`
- 录制按钮抓取当前机器人 pose（从 `/loc_high_freq` 话题）
- 支持手动编辑坐标（Modal 输入 x, y, θ）
- 支持拖拽调整点位位置（Switch 开关控制）
- 键盘遥控：方向键控制机器人移动（点击聚焦后生效）
- 地图底部显示实时机器人坐标

### 3.3 Tab 2: 任务编排 (`TaskConfigTab.tsx`)

三栏布局，栏间可拖拽调整宽度（ResizeHandle 组件）。

```
┌──────────┬──────────────┬─────────────────────────┐
│ 任务管理  │   巡房顺序    │     步骤编辑器           │
│ (180px)  │   (220px)    │     (flex)              │
│          │              │                         │
│ ⭐ 默认任务│  ☑ 1. 101室  │  ⠿ 1 [导航▼] [门外▼]    │
│   早间巡逻│  ☐ 2. 102室  │  ⠿ 2 [开门▼]            │
│          │              │  ⠿ 3 [导航▼] [门内▼]    │
│          │  □ 全选       │  ⠿ 4 [地面检测▼]         │
│          │  拖拽调整顺序  │  ...                    │
│ [+ 新建]  │              │  [自定义步骤] [默认模板]   │
│          │              │  [添加步骤] [保存配置]     │
└──────────┴──────────────┴─────────────────────────┘
```

**Col 1 — 任务管理**：
- 预设列表：名称 + ⭐默认标记 + 未保存标记 ⚠
- 操作：重命名（双击 → Input）、复制、设为默认、删除
- 新建任务 → Modal 输入名称

**Col 2 — 巡房顺序**：
- @dnd-kit 拖拽排序
- Checkbox 启用/禁用房间
- 全选 Checkbox
- 未录制的房间显示红色"未录"Tag

**Col 3 — 步骤编辑器**：
- @dnd-kit 拖拽排序步骤
- 步骤类型下拉：导航、开门、关门、在床检测、地面检测、拍照、等待 + 自定义步骤
- 导航步骤显示 target 下拉（门外/门内/床位）
- 拍照步骤显示 label 输入
- 自定义步骤显示参数编辑器（number/string/boolean/select）
- 步骤左侧色条标识类型颜色
- "默认模板" 按钮一键应用标准巡检流程
- "自定义步骤" 按钮打开 CustomStepManager Modal
- Dirty 状态追踪：未保存时按钮显示"保存配置 *"

**ResizeHandle 组件**：纯 CSS 实现，6px 宽，鼠标拖拽改变列宽，悬停/拖拽时蓝色高亮。

### 3.4 Tab 3: 任务下发 (`TaskDispatchTab.tsx`)

两栏布局：左侧地图，右侧控制面板。

```
┌─────────────────────┬──────────────────────┐
│                     │ 巡房控制              │
│     MapCanvas       │ 选择任务: [默认任务▼]  │
│  (机器人 + 巡房点位  │ [开始巡房]            │
│   蓝=门外 绿=门内    │                      │
│   红=床位)          │ 巡房状态 — 默认任务    │
│                     │ 状态: [巡房中]         │
│                     │ ▓▓▓▓▓▓░░░ 60%        │
│                     │ 当前房间: 101          │
│                     │ 当前步骤: [导航中]     │
│                     │ 完成: 2 / 5           │
│                     │                      │
│                     │ 房间进度              │
│                     │ ┌──────────────────┐  │
│                     │ │ 101室 [已完成]    │  │
│                     │ │ 102室 [执行中]    │  │
│                     │ │  → Steps 进度条    │  │
│                     │ │ 103室 [等待]      │  │
│                     │ └──────────────────┘  │
└─────────────────────┴──────────────────────┘
```

**功能**：
- 预设选择器（仅在未巡房时显示）
- 地图上显示选中预设的所有房间点位（颜色与点位录制一致）
- 当前巡房的房间门外点高亮
- 已完成房间点位标记完成
- 房间进度列表：当前房间展开显示 Steps 步骤进度条
- 步骤进度使用 antd Steps 组件（vertical, small），显示 finish/process/wait 状态

### 3.5 Tab 4: 历史记录 (`HistoryTab.tsx`)

单栏滚动布局。

**巡房记录**：
- Table 列：任务名、时间、状态、房间数、完成数、失败数
- 点击行展开详情：每个房间一张 Card，左侧绿/红色条标识成功/失败
- 房间详情显示每个步骤的执行结果（✅/❌）、时间范围
- 失败步骤红色高亮 + "失败" Tag + 错误详情

**告警记录**：
- Card 列表，左侧色条标识状态（红=新告警、橙=处理中、绿=已关闭）
- 新告警显示"确认"按钮，处理中显示"已处置"按钮
- 告警类型：老人离床、地面杂物、地面水渍、任务失败

### 3.6 自定义步骤管理 (`CustomStepManager.tsx`)

Modal 弹窗，两栏布局（左列表 + 右编辑器），860px 宽。

**支持的动作类型**：
- ROS Service：配置 service_name、service_type、request JSON（支持 `{{param}}` 占位符）
- ROS Topic：配置 topic_name、msg_type、message JSON（支持占位符）
- 等待：配置默认时长

**参数定义**：支持 string/number/boolean/select 四种类型，可设默认值和必填。

---

## 四、后端实现

### 4.1 点位录制 (`src/room_config.py` — `RoomConfigMixin`)

```python
class RoomConfigMixin:
    def get_room_config(self) -> dict                          # 读取配置
    def save_room_config(self, config: dict) -> dict           # 保存完整配置（原子写入）
    def add_room(self, room_id: str, room_name: str) -> dict   # 新建房间
    def delete_room(self, room_id: str) -> dict                # 删除房间
    def record_room_waypoint(self, room_id: str, waypoint_type: str) -> dict
        # 从 self._topic_data['/loc_high_freq'] 抓取当前 pose
        # waypoint_type: 'door_outside' | 'door_inside' | 'bed_check' | 'start_position'
```

存储文件：`saved_nav_configs/room_patrol_config.json`

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

### 4.2 任务预设 (`src/patrol_room.py` — `RoomPatrolMixin`)

#### 预设 CRUD

```python
class RoomPatrolMixin:
    def get_task_presets(self) -> dict                            # 加载所有预设（含旧配置迁移）
    def get_task_preset(self, preset_id: str) -> dict | None     # 获取单个预设
    def save_task_preset(self, preset: dict) -> dict             # 创建/更新预设
    def delete_task_preset(self, preset_id: str) -> dict         # 删除预设
    def duplicate_task_preset(self, preset_id: str, new_name: str) -> dict  # 复制预设
    def set_default_preset(self, preset_id: str) -> dict         # 设为默认

    # 向后兼容旧接口（委托到默认预设）
    def get_task_config(self) -> dict     # 返回默认预设内容
    def save_task_config(self, config: dict) -> dict  # 保存到默认预设
```

存储文件：`saved_nav_configs/task_presets.json`

```json
{
  "presets": [
    {
      "id": "preset_29ec65f1",
      "name": "默认任务",
      "description": "从旧配置迁移",
      "is_default": true,
      "rooms": [
        {
          "room_id": "101",
          "room_name": "101室",
          "enabled": true,
          "steps": [
            {"type": "navigate", "target": "door_outside"},
            {"type": "open_door"},
            {"type": "navigate", "target": "door_inside"},
            {"type": "detect_floor"},
            {"type": "photo", "label": "通道"},
            {"type": "navigate", "target": "bed_check"},
            {"type": "detect_bed"},
            {"type": "photo", "label": "床位"},
            {"type": "navigate", "target": "door_inside"},
            {"type": "navigate", "target": "door_outside"},
            {"type": "close_door"},
            {"type": "custom:voice_broadcast", "params": {"text": "...", "duration": 3}}
          ]
        }
      ],
      "retry_limit": 3,
      "created_at": "2026-03-26T11:54:54",
      "updated_at": "2026-03-26T15:20:42"
    }
  ],
  "updated_at": "2026-03-26T15:20:42"
}
```

**迁移**：首次加载时若 `task_presets.json` 不存在但 `room_task_config.json` 存在，自动迁移为第一个默认预设。

#### 巡房编排执行

```python
    def start_room_patrol(self, task_config: dict | None = None) -> dict
    def stop_room_patrol(self) -> dict
    def get_room_patrol_status(self) -> dict
```

执行流程（`_run_room_patrol`，后台线程）：

```
for each room in rooms:
    for each step in room.steps:
        match step.type:
            "navigate"     → _patrol_navigate_and_wait(pose, retry_limit)
            "open_door"    → _mock_open_door(retry_limit)
            "close_door"   → _mock_close_door(retry_limit)
            "detect_bed"   → detect_bed_occupancy() → create_alert (if abnormal)
            "detect_floor" → detect_floor_clutter() + detect_floor_water() → create_alert
            "photo"        → capture_image()
            "wait"         → time.sleep(duration)
            "custom:*"     → _execute_custom_step()

    navigate back to start_position
    _finish_room_patrol() → save record to disk
```

**导航同步机制**：`_patrol_navigate_and_wait()` 调用 `navigate_to()` 后阻塞在 `threading.Event`，`NavigationMixin._on_nav_result()` 回调中 signal 该 Event。超时 120 秒。

**失败策略**：
- 导航/开门失败：重试 retry_limit 次 → 跳过该房间
- 关门失败：记录失败 → 继续下一房间
- 检测失败：标记异常 → 继续

### 4.3 自定义步骤 (`src/custom_steps.py` — `CustomStepsMixin`)

```python
class CustomStepsMixin:
    def get_custom_step_types(self) -> dict
    def get_custom_step_definition(self, step_id: str) -> dict | None
    def save_custom_step_type(self, definition: dict) -> dict
    def delete_custom_step_type(self, step_id: str) -> dict
```

存储文件：`saved_nav_configs/custom_step_types.json`

```json
{
  "custom_step_types": [
    {
      "id": "voice_broadcast",
      "name": "语音播报",
      "description": "播放指定文本语音",
      "icon_color": "#722ed1",
      "action": {
        "type": "ros_topic",
        "topic_name": "/tts/speak",
        "msg_type": "std_msgs/msg/String",
        "message": {"data": "{{text}}"}
      },
      "parameters": [
        {"key": "text", "label": "播报内容", "type": "string", "default_value": "巡检中"},
        {"key": "duration", "label": "等待秒", "type": "number", "default_value": 3}
      ]
    }
  ],
  "updated_at": "..."
}
```

**执行方式**（在 `RoomPatrolMixin._execute_custom_step` 中）：
- `ros_service` → `self._call_service()` + 可选等待
- `ros_topic` → `self.publish_topic()` + 可选等待
- `wait` → `time.sleep(duration)`
- 支持 `{{param}}` 占位符，运行时从步骤 `params` 字段替换

### 4.4 视觉检测 (`src/detection.py` — `DetectionMixin`)

当前 Mock 实现，所有方法返回正常结果。

```python
class DetectionMixin:
    def detect_bed_occupancy(self, room_id: str) -> dict    # 在床检测
    def detect_floor_clutter(self, room_id: str) -> dict    # 杂物检测
    def detect_floor_water(self, room_id: str) -> dict      # 水渍检测
    def capture_image(self) -> bytes | None                  # 拍照（返回 None）
```

返回格式：
```json
{
  "detection_type": "bed|clutter|water",
  "is_abnormal": false,
  "confidence": 0.95,
  "description": "老人在床（mock）",
  "timestamp": 1711382700.0,
  "room_id": "101"
}
```

### 4.5 告警系统 (`src/alert.py` — `AlertMixin`)

```python
class AlertMixin:
    def create_alert(self, patrol_id, room_id, alert_type, confidence, photo, extra_message) -> dict
    def get_alerts(self, status=None, date=None, days=7) -> list[dict]
    def get_alert(self, alert_id, date) -> dict | None
    def confirm_alert(self, alert_id, date) -> dict     # new → processing
    def close_alert(self, alert_id, date) -> dict       # processing → closed
    def get_recent_alerts(self, limit=10) -> list[dict]
```

告警消息模板：
```python
"bed_absence":    "【异常提醒】{room_id} 房间老人离床，请及时查看"
"floor_clutter":  "【环境提醒】{room_id} 房间通道有障碍物，请清理"
"floor_water":    "【环境提醒】{room_id} 房间地面有水渍，请处理"
"task_failed":    "【任务失败】于{room_id}房间执行{step}任务失败"
"patrol_complete":"【系统通知】巡视完毕，点击可查看巡视结果"
```

生命周期：`new → processing（确认） → closed（关闭）`

### 4.6 数据存储 (`src/storage.py` — `JsonDayStorage`)

JSON 文件按天归档，目录结构：

```
data/
├── records/                          # 巡房任务记录
│   └── 2026-03-25/
│       └── patrol_20260325_234500_a1b2.json
└── alerts/                           # 告警记录
    └── 2026-03-25/
        └── alert_1711382700_x1y2z3.json
```

```python
class JsonDayStorage:
    def save(self, category, record_id, data, date=None) -> bool    # 原子写入（tmp+rename）
    def load(self, category, record_id, date) -> dict | None
    def list_by_date(self, category, date) -> list[dict]
    def list_recent(self, category, days=7) -> list[dict]
    def update(self, category, record_id, date, patch) -> bool      # 部分更新
    def delete(self, category, record_id, date) -> bool
```

默认 base_dir: `{project_root}/data/`

#### 巡房记录格式

```json
{
  "id": "patrol_20260325_234500_a1b2",
  "task_name": "默认任务",
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
        {
          "step": "navigate",
          "target": "door_outside",
          "status": "success",
          "started_at": "2026-03-25T23:45:30",
          "finished_at": "2026-03-25T23:45:45"
        },
        {
          "step": "open_door",
          "target": "",
          "status": "success",
          "started_at": "2026-03-25T23:45:45",
          "finished_at": "2026-03-25T23:45:48"
        },
        {
          "step": "detect_bed",
          "target": "",
          "status": "success",
          "started_at": "...",
          "finished_at": "...",
          "detail": {"detection_type": "bed", "is_abnormal": false, "confidence": 0.95}
        }
      ],
      "alerts": [],
      "error": null
    }
  ]
}
```

#### 告警记录格式

```json
{
  "id": "alert_1711382700_x1y2z3",
  "patrol_id": "patrol_20260325_234500_a1b2",
  "room_id": "102",
  "alert_type": "bed_absence",
  "status": "new",
  "message": "【异常提醒】102 房间老人离床，请及时查看",
  "confidence": 0.92,
  "photo": null,
  "created_at": "2026-03-25T23:48:00",
  "confirmed_at": null,
  "closed_at": null
}
```

---

## 五、REST 接口

### 5.1 房间点位配置

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/room-config` | 获取房间配置 |
| `POST` | `/api/room-config` | 保存完整配置 |
| `POST` | `/api/room-config/rooms` | 新建房间（body: room_id, room_name） |
| `DELETE` | `/api/room-config/rooms/{room_id}` | 删除房间 |
| `POST` | `/api/room-config/rooms/{room_id}/record` | 录制点位（body: waypoint_type） |
| `POST` | `/api/room-config/record-start` | 录制起始点位（专用端点） |

### 5.2 任务预设

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/task-presets` | 列出所有预设 |
| `POST` | `/api/task-presets` | 创建/更新预设（body: preset dict） |
| `DELETE` | `/api/task-presets/{preset_id}` | 删除预设 |
| `POST` | `/api/task-presets/{preset_id}/duplicate` | 复制预设（body: new_name） |
| `POST` | `/api/task-presets/{preset_id}/default` | 设为默认预设 |

### 5.3 巡房控制

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/room-patrol/start` | 启动巡房（body: task_config 可选） |
| `POST` | `/api/room-patrol/stop` | 停止巡房 |
| `GET` | `/api/room-patrol/status` | 获取巡房状态 |
| `GET` | `/api/room-patrol/task-config` | 获取默认任务配置（兼容旧接口） |
| `POST` | `/api/room-patrol/task-config` | 保存默认任务配置（兼容旧接口） |

启动巡房时，前端传入完整 task_config（包含 name、rooms、retry_limit），不传则使用默认预设。

### 5.4 自定义步骤类型

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/custom-step-types` | 获取所有自定义步骤 |
| `POST` | `/api/custom-step-types` | 创建/更新自定义步骤（body: definition） |
| `DELETE` | `/api/custom-step-types/{step_id}` | 删除自定义步骤 |

### 5.5 告警管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/alerts` | 告警列表（query: status, date） |
| `POST` | `/api/alerts/{date}/{alert_id}/confirm` | 确认告警 |
| `POST` | `/api/alerts/{date}/{alert_id}/close` | 关闭告警 |

### 5.6 历史记录

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/patrol-records` | 巡房记录列表（最近 7 天） |
| `GET` | `/api/patrol-records/{date}/{record_id}` | 单条记录详情 |

### 5.7 SSE 状态推送

`GET /api/state` — 每 500ms 推送一次全量状态（使用 `run_in_executor` 避免阻塞事件循环）。

`room_patrol` 字段内容：

```json
{
  "room_patrol": {
    "active": true,
    "status": "running",
    "patrol_id": "patrol_20260325_234500_a1b2",
    "task_name": "默认任务",
    "current_room": "101",
    "current_step": "navigate",
    "current_step_index": 2,
    "rooms_completed": ["101"],
    "rooms_failed": [],
    "rooms_total": 5,
    "progress": 0.2,
    "error": "",
    "rooms": [
      {"room_id": "101", "room_name": "101室", "steps": [...]},
      {"room_id": "102", "room_name": "102室", "steps": [...]}
    ]
  }
}
```

**性能优化**：`_to_dict()` 转换放在 `self._lock` 之外，减少锁持有时间。支持多浏览器 Tab 同时连接。

---

## 六、前端类型定义 (`ui/src/types/index.ts`)

```typescript
// 房间点位配置
interface RoomConfig {
  room_id: string;
  room_name: string;
  door_outside: Pose | null;
  door_inside: Pose | null;
  bed_check: Pose | null;
  door_type: string;
  enabled: boolean;
}

interface RoomPatrolConfig {
  start_position: Pose | null;
  rooms: RoomConfig[];
  retry_limit: number;
  detection_types: string[];
  updated_at?: string;
}

// 巡房任务步骤
interface RoomTaskStep {
  type: string;            // 内置类型 或 'custom:xxx'
  target?: string;         // 导航目标: door_outside | door_inside | bed_check
  label?: string;          // 拍照标签
  duration?: number;       // 等待时长
  params?: Record<string, any>;  // 自定义步骤参数
}

// 任务预设
interface TaskPreset {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  rooms: RoomTaskConfig[];
  retry_limit: number;
  created_at?: string;
  updated_at?: string;
}

// 自定义步骤类型定义
interface CustomStepDefinition {
  id: string;
  name: string;
  description: string;
  icon_color?: string;
  action: CustomStepAction;
  parameters: CustomStepParamDef[];
  timeout?: number;
  created_at?: string;
}

interface CustomStepAction {
  type: 'ros_service' | 'ros_topic' | 'wait';
  service_name?: string;
  service_type?: string;
  request?: Record<string, any>;
  topic_name?: string;
  msg_type?: string;
  message?: Record<string, any>;
  duration?: number;
}

interface CustomStepParamDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default_value?: any;
  required?: boolean;
  options?: { value: string; label: string }[];
}

// 告警
interface Alert {
  id: string;
  patrol_id: string;
  room_id: string;
  alert_type: string;
  status: 'new' | 'processing' | 'closed';
  message: string;
  confidence: number;
  photo: string | null;
  created_at: string;
  confirmed_at: string | null;
  closed_at: string | null;
}

// 巡房实时状态 (SSE)
interface RoomPatrolState {
  active: boolean;
  status: string;
  patrol_id: string;
  current_room: string;
  current_step: string;
  current_step_index: number;
  rooms_completed: string[];
  rooms_failed: string[];
  rooms_total: number;
  progress: number;
  error: string;
}
```

---

## 七、前端 API 方法 (`ui/src/services/ros.ts`)

```typescript
// 房间配置
getRoomConfig(): Promise<RoomPatrolConfig>
saveRoomConfig(config: RoomPatrolConfig): Promise<Result>
addRoom(roomId: string, roomName: string): Promise<Result>
deleteRoom(roomId: string): Promise<Result>
recordRoomWaypoint(roomId: string, waypointType: string): Promise<Result & { pose }>
recordStartPosition(): Promise<Result & { pose }>

// 任务预设
getTaskPresets(): Promise<{ presets: TaskPreset[] }>
saveTaskPreset(preset: TaskPreset): Promise<Result & { preset_id? }>
deleteTaskPreset(presetId: string): Promise<Result>
duplicateTaskPreset(presetId: string, newName: string): Promise<Result & { preset? }>
setDefaultPreset(presetId: string): Promise<Result>

// 自定义步骤
getCustomStepTypes(): Promise<{ custom_step_types: CustomStepDefinition[] }>
saveCustomStepType(definition: CustomStepDefinition): Promise<Result>
deleteCustomStepType(stepId: string): Promise<Result>

// 巡房控制
startRoomPatrol(taskConfig?: dict): Promise<Result>
stopRoomPatrol(): Promise<Result>
getTaskConfig(): Promise<PatrolTaskConfig>

// 告警
getAlerts(status?, date?): Promise<Alert[]>
confirmAlert(date: string, alertId: string): Promise<Result>
closeAlert(date: string, alertId: string): Promise<Result>

// 历史记录
getPatrolRecords(): Promise<PatrolRecord[]>
getPatrolRecord(date: string, recordId: string): Promise<PatrolRecord>

// SSE 事件
on('room-patrol-state', handler)   // 巡房实时状态
```

---

## 八、关键文件清单

| 文件 | 说明 |
|------|------|
| **后端** | |
| `src/logic.py` | BusinessLogic 组装类，10 个 Mixin + 连接管理 + SSE 状态 |
| `src/main.py` | FastAPI 路由（30+ REST 端点 + SSE） |
| `src/room_config.py` | RoomConfigMixin — 房间点位配置 + 录制 |
| `src/patrol_room.py` | RoomPatrolMixin — 巡房编排 + 任务预设 CRUD + 执行线程 |
| `src/custom_steps.py` | CustomStepsMixin — 自定义步骤类型 CRUD + 执行 |
| `src/detection.py` | DetectionMixin — VLM 检测 Mock |
| `src/alert.py` | AlertMixin — 告警 CRUD |
| `src/storage.py` | JsonDayStorage — 按天 JSON 归档存储 |
| `src/navigation.py` | NavigationMixin — 单点导航 + 巡房 Event 信号 |
| **前端** | |
| `ui/src/components/RoomPatrol/index.tsx` | 巡房任务页面入口（4 Tab） |
| `ui/src/components/RoomPatrol/WaypointRecordTab.tsx` | 点位录制（地图 + 配置面板） |
| `ui/src/components/RoomPatrol/TaskConfigTab.tsx` | 任务编排（三栏 + ResizeHandle + @dnd-kit） |
| `ui/src/components/RoomPatrol/TaskDispatchTab.tsx` | 任务下发（地图 + 控制面板 + Steps） |
| `ui/src/components/RoomPatrol/HistoryTab.tsx` | 历史记录（Table + 告警卡片） |
| `ui/src/components/RoomPatrol/CustomStepManager.tsx` | 自定义步骤管理 Modal |
| `ui/src/types/index.ts` | TypeScript 类型定义 |
| `ui/src/services/ros.ts` | HTTP/SSE 适配器 |
| **数据文件** | |
| `saved_nav_configs/room_patrol_config.json` | 房间点位配置 |
| `saved_nav_configs/task_presets.json` | 任务预设列表 |
| `saved_nav_configs/custom_step_types.json` | 自定义步骤类型定义 |
| `data/records/{date}/*.json` | 巡房记录（按天归档） |
| `data/alerts/{date}/*.json` | 告警记录（按天归档） |

---

## 九、内置步骤类型

| 步骤 type | 前端标签 | 说明 | 步骤颜色 |
|-----------|---------|------|---------|
| `navigate` | 导航 | 导航到 target 点位（door_outside/door_inside/bed_check） | `#1890ff` |
| `open_door` | 开门 | 打开房间门（当前 Mock：sleep 3s） | `#52c41a` |
| `close_door` | 关门 | 关闭房间门（当前 Mock：sleep 2s） | `#52c41a` |
| `detect_bed` | 在床检测 | VLM 检测老人是否在床（当前 Mock） | `#ff4d4f` |
| `detect_floor` | 地面检测 | VLM 检测杂物和水渍（当前 Mock） | `#faad14` |
| `photo` | 拍照 | 拍摄照片（当前 Mock） | `#722ed1` |
| `wait` | 等待 | 停留等待指定秒数 | `#999` |
| `custom:*` | 自定义 | 执行用户定义的自定义步骤 | 用户配置 |

默认巡检步骤模板（11 步）：
```
导航→门外 → 开门 → 导航→门内 → 地面检测 → 拍照(通道) →
导航→床位 → 在床检测 → 拍照(床位) → 导航→门内 → 导航→门外 → 关门
```

---

## 十、线程安全与并发

### 锁策略

- 所有巡房状态变量受 `self._lock` 保护
- `get_state()` 在锁内复制数据，`_to_dict()` 转换在锁外执行
- SSE 使用 `run_in_executor` 在线程池中调用 `get_state()`，避免阻塞 asyncio 事件循环
- 支持多浏览器 Tab 同时连接 SSE

### 导航同步

```
RoomPatrolMixin (后台线程)          NavigationMixin (回调)
        │                                   │
        ├─ navigate_to(x,y,θ)              │
        ├─ _nav_done_event.wait(120s) ──────┤
        │                                   ├─ _on_nav_result()
        │                                   ├─ _nav_done_success = True/False
        │◄──────── _nav_done_event.set() ◄──┤
        ├─ check _nav_done_success          │
        │                                   │
```

---

## 十一、待对接（Mock 状态）

| 功能 | 当前状态 | 对接需求 |
|------|---------|---------|
| 开门/关门 | `time.sleep(3/2)` 模拟 | ROS Action: `/arm/open_door`, `/arm/close_door` |
| VLM 在床检测 | 固定返回正常 | HTTP API → VLM 服务 |
| VLM 杂物检测 | 固定返回正常 | HTTP API → VLM 服务 |
| VLM 水渍检测 | 固定返回正常 | HTTP API → VLM 服务 |
| 摄像头拍照 | 返回 None | 订阅 ROS 摄像头话题抓帧 |
| 照片存储 | 未实现 | `data/photos/{date}/` 目录 + REST 访问端点 |
