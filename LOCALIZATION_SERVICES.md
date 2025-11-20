# Localization 服务接口文档

本文档描述了定位系统（Localization）提供的所有 ROS 服务接口和数据格式。

## 目录

- [定位模式控制服务](#定位模式控制服务)
- [地图管理服务](#地图管理服务)
- [话题订阅](#话题订阅)
- [数据格式定义](#数据格式定义)

---

## 定位模式控制服务

### 1. 启动建图模式

**服务名称**: `/localization/start_mapping`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{}
```

**返回格式**:
```json
{
  "success": true,
  "message": "建图模式已启动"
}
```

**说明**: 启动 SLAM 建图模式，开始构建环境地图。需要先启动遥控器。

---

### 2. 启动定位模式（手动初始化）

**服务名称**: `/localization/start_localization`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{}
```

**返回格式**:
```json
{
  "success": true,
  "message": "定位模式已启动（手动）"
}
```

**说明**: 启动手动定位模式，需要用户通过前端界面设置初始位姿（initial pose）。使用粒子滤波进行定位。

---

### 3. 启动定位模式（自动重定位）

**服务名称**: `/localization/start_localization_auto`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{}
```

**返回格式**:
```json
{
  "success": true,
  "message": "定位模式已启动（自动）"
}
```

**说明**: 启动自动定位模式，系统自动搜索机器人在地图中的位置，无需手动设置初始位姿。

---

### 4. 启动纯避障模式

**服务名称**: `/localization/start_obstacle_avoidance`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{}
```

**返回格式**:
```json
{
  "success": true,
  "message": "纯避障模式已启动"
}
```

**说明**: 启动纯避障模式，不进行定位和建图，仅输出避障路径。

---

### 5. 停止当前模式

**服务名称**: `/localization/stop`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{}
```

**返回格式**:
```json
{
  "success": true,
  "message": "定位服务已停止"
}
```

**说明**: 停止当前正在运行的定位模式（建图/定位/避障）。

---

### 6. 关闭定位服务

**服务名称**: `/localization/shutdown`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{}
```

**返回格式**:
```json
{
  "success": true,
  "message": "定位服务已关闭"
}
```

**说明**: 完全关闭定位服务，释放所有资源。

---

## 地图管理服务

### 1. 列出所有地图

**服务名称**: `/localization/list_maps`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{}
```

**返回格式**:
```json
{
  "success": true,
  "message": "找到 3 个地图",
  "maps": [
    {
      "id": "map_001",
      "name": "实时地图_2025-01-15 10:30:45",
      "created_at": 1736910645,
      "thumbnail": "",
      "width": 384,
      "height": 384,
      "resolution": 0.05,
      "origin_x": -10.0,
      "origin_y": -10.0,
      "origin_orientation": 0.0
    }
  ]
}
```

**说明**: 获取所有已保存地图的元数据列表。不包含地图的完整栅格数据（`data` 字段），缩略图由前端按需生成。

---

### 2. 加载地图

**服务名称**: `/localization/load_map`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{
  "map_name": "实时地图_2025-01-15 10:30:45"
}
```

**返回格式**:
```json
{
  "success": true,
  "message": "成功加载地图: 实时地图_2025-01-15 10:30:45",
  "map_data": {
    "header": {
      "frame_id": "map",
      "stamp": {
        "secs": 1736910645,
        "nsecs": 0
      }
    },
    "info": {
      "width": 384,
      "height": 384,
      "resolution": 0.05,
      "origin": {
        "position": {
          "x": -10.0,
          "y": -10.0,
          "z": 0.0
        },
        "orientation": {
          "x": 0.0,
          "y": 0.0,
          "z": 0.0,
          "w": 1.0
        }
      }
    },
    "data": [0, 0, 100, -1, ...]
  }
}
```

**说明**: 加载指定地图的完整数据，包含栅格占用数据。用于地图编辑或生成缩略图。

---

### 3. 保存地图

**服务名称**: `/localization/save_map`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{
  "map_name": "实时地图_2025-01-15 10:30:45",
  "created_at": 1736910645,
  "map_data": {
    "header": {
      "frame_id": "map"
    },
    "info": {
      "width": 384,
      "height": 384,
      "resolution": 0.05,
      "origin": {
        "position": {
          "x": -10.0,
          "y": -10.0,
          "z": 0.0
        },
        "orientation": {
          "x": 0.0,
          "y": 0.0,
          "z": 0.0,
          "w": 1.0
        }
      }
    },
    "data": [0, 0, 100, -1, ...]
  }
}
```

**返回格式**:
```json
{
  "success": true,
  "message": "地图 '实时地图_2025-01-15 10:30:45' 保存成功"
}
```

**说明**: 保存地图到服务器。只保存原生栅格数据，不保存缩略图。`created_at` 为 Unix 时间戳（秒）。

---

### 4. 删除地图

**服务名称**: `/localization/delete_map`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{
  "map_name": "实时地图_2025-01-15 10:30:45"
}
```

**返回格式**:
```json
{
  "success": true,
  "message": "地图 '实时地图_2025-01-15 10:30:45' 已删除"
}
```

**说明**: 从服务器删除指定地图。此操作不可恢复。

---

### 5. 应用地图

**服务名称**: `/localization/apply_map`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{
  "map_name": "实时地图_2025-01-15 10:30:45"
}
```

**返回格式**:
```json
{
  "success": true,
  "message": "地图 '实时地图_2025-01-15 10:30:45' 已应用为当前地图"
}
```

**说明**: 将指定地图设置为当前地图，SLAM 端将通过 `/map` 话题实时发布该地图。

---

## 话题订阅

### 定位状态话题

**话题名称**: `/localization/status`

**消息类型**: `std_msgs/String`

**数据格式**:
```json
{
  "data": "建图模式已启动"
}
```

**可能的状态值**:
- `"未启动"`
- `"建图模式已启动"`
- `"定位中（手动）..."`
- `"定位成功（手动）"`
- `"定位失败（手动）: 粒子收敛失败"`
- `"定位中（自动）..."`
- `"定位成功（自动）"`
- `"定位失败（自动）: 无法找到匹配位置"`
- `"纯避障模式已启动"`
- `"定位服务已停止"`
- `"定位服务已关闭"`

**说明**: 实时发布定位服务的状态信息，前端可订阅此话题显示当前状态。发布频率：1 Hz（每秒更新一次）。

---

## 数据格式定义

### MapMetadata（地图元数据）

用于 `/localization/list_maps` 返回的地图列表项。

```typescript
interface MapMetadata {
  id: string;                    // 地图唯一标识符
  name: string;                  // 地图名称
  created_at: number;            // 创建时间（Unix 时间戳，秒）
  thumbnail: string;             // 缩略图（Base64 编码，服务端返回空字符串）
  width: number;                 // 地图宽度（像素）
  height: number;                // 地图高度（像素）
  resolution: number;            // 分辨率（米/像素）
  origin_x: number;              // 地图原点 X 坐标（米）
  origin_y: number;              // 地图原点 Y 坐标（米）
  origin_orientation: number;    // 地图原点朝向（弧度）
}
```

---

### ROSMap（完整地图数据）

用于 `/localization/save_map` 请求参数和 `/localization/load_map` 返回值。

```typescript
interface ROSMap {
  header: {
    frame_id: string;            // 坐标系名称，通常为 "map"
    stamp?: {                    // 时间戳（可选）
      secs: number;              // 秒
      nsecs: number;             // 纳秒
    };
  };
  info: {
    width: number;               // 地图宽度（像素）
    height: number;              // 地图高度（像素）
    resolution: number;          // 分辨率（米/像素）
    origin: {
      position: {
        x: number;               // 原点 X 坐标（米）
        y: number;               // 原点 Y 坐标（米）
        z: number;               // 原点 Z 坐标（米，通常为 0）
      };
      orientation: {
        x: number;               // 四元数 X（通常为 0）
        y: number;               // 四元数 Y（通常为 0）
        z: number;               // 四元数 Z（朝向）
        w: number;               // 四元数 W（通常为 1）
      };
    };
  };
  data: number[];                // 占用栅格数据
}
```

**栅格数据说明** (`data` 字段):
- 数组长度：`width × height`
- 值范围：
  - `-1`: 未知区域（灰色）
  - `0`: 自由区域（白色）
  - `100`: 障碍物（黑色）
- 数组索引：`index = y * width + x`

---

## 使用示例

### 前端调用示例

#### 1. 启动建图模式
```typescript
const result = await rosService.startMapping();
if (result.success) {
  console.log('建图已启动');
}
```

#### 2. 获取地图列表
```typescript
const maps = await rosService.getAllMapMetadata();
console.log('已保存地图数量:', maps.length);
```

#### 3. 加载并生成缩略图
```typescript
const fullMap = await rosService.loadMapFromROS('map_001');
const thumbnail = mapStorageService.generateThumbnail(
  fullMap.data,
  fullMap.width,
  fullMap.height
);
```

#### 4. 保存当前地图
```typescript
await rosService.saveMapToROS({
  id: 'new_map',
  name: '实时地图_2025-01-15',
  createdAt: new Date().toISOString(),
  thumbnail: '',
  width: 384,
  height: 384,
  resolution: 0.05,
  origin: { x: -10.0, y: -10.0, orientation: 0.0 },
  data: [/* 栅格数据 */]
});
```

#### 5. 订阅状态更新
```typescript
const unsubscribe = rosService.subscribeLocalizationStatus((status) => {
  console.log('定位状态:', status.data);
});

// 取消订阅
unsubscribe();
```

---

## Mock 服务器实现

Mock 服务器（`mock_rosbridge.py`）完整实现了所有 localization 服务，用于开发和测试：

- **WebSocket 端口**: 9090（rosbridge 协议）
- **存储位置**: `mock_saved_maps/`（JSON 文件）
- **持久化**: 自动保存到磁盘，重启后自动加载

启动命令：
```bash
python3 mock_rosbridge.py
```

---

## 注意事项

1. **服务调用顺序**:
   - 建图前应先启动遥控器 (`/joystick/start`)
   - 定位前应先应用地图 (`/localization/apply_map`)

2. **地图存储策略**:
   - 服务端只存储原生栅格数据（不存储缩略图）
   - 前端按需从原图生成缩略图（200x200px）
   - 减少存储空间，保持数据原生性

3. **时间戳格式**:
   - 前端使用 ISO 8601 格式（`new Date().toISOString()`）
   - 服务端使用 Unix 时间戳（秒）
   - 转换：`timestamp = Date.parse(isoString) / 1000`

4. **错误处理**:
   - 所有服务调用都应使用 try-catch 捕获异常
   - 检查返回的 `success` 字段判断操作是否成功
   - 失败时显示 `message` 字段给用户

---

## 相关文档

- [ROS 集成文档](./ROS_INTEGRATION.md)
- [地图存储架构](./MAP_STORAGE_ARCHITECTURE.md)
- [导航事件处理](./NAVIGATION_EVENTS.md)
