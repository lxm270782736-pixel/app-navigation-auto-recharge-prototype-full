# Localization 服务接口文档

本文档描述了定位系统（Localization）提供的所有 ROS 服务接口、数据格式和前端使用策略。

## 目录

- [定位模式控制服务](#定位模式控制服务)
- [遥控器控制服务](#遥控器控制服务)
- [地图管理服务](#地图管理服务)
- [话题订阅](#话题订阅)
- [数据格式定义](#数据格式定义)
- [前端缓存策略](#前端缓存策略)
- [使用示例](#使用示例)
- [注意事项](#注意事项)

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

**说明**:
- 启动 SLAM 建图模式，开始构建环境地图
- 建议先启动遥控器（`/joystick/start`），但可跳过
- 前端提供跳过选项，允许用户手动管理启动流程

**启动流程**（前端实现）:
1. **步骤1**: 启动遥控器 `/joystick/start`（可跳过）
2. **步骤2**: 进入建图模式 `/localization/start_mapping`（可跳过）
3. 用户可选择跳过任一步骤，适用于已手动启动的场景

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

**说明**:
- 停止当前正在运行的定位模式（建图/定位/避障）
- **重要**: 前端会根据启动时的跳过状态智能跳过停止
  - 如启动时跳过了遥控器，停止时也会跳过停止遥控器
  - 如启动时跳过了建图节点，停止时也会跳过停止建图节点

**停止流程**（前端实现）:
1. **步骤1**: 停止建图/定位节点 `/localization/stop`（根据启动状态决定是否跳过）
2. **步骤2**: 停止遥控器 `/joystick/stop`（根据启动状态决定是否跳过）

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

**说明**: 完全关闭定位服务，释放所有资源。服务将在1秒后自动退出。

---

## 遥控器控制服务

### 1. 启动遥控器

**服务名称**: `/joystick/start`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{}
```

**返回格式**:
```json
{
  "success": true,
  "message": "遥控器已启动"
}
```

**说明**: 启动遥控器节点，使机器人可通过手柄控制移动。建图模式建议先启动遥控器。

---

### 2. 停止遥控器

**服务名称**: `/joystick/stop`

**服务类型**: `std_srvs/Trigger`

**请求参数**:
```json
{}
```

**返回格式**:
```json
{
  "success": true,
  "message": "遥控器已停止"
}
```

**说明**: 停止遥控器节点。前端会根据启动时是否跳过来决定停止时是否调用此服务。

---

## 地图管理服务

### 1. 列出所有地图

**服务名称**: `/map_manager/list_maps`

**服务类型**: `localization_msgs/ListMaps`

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
      "id": "map_20250115_103045",
      "name": "map_20250115_103045",
      "created_at": 1736910645,
      "thumbnail": "data:image/png;base64,iVBORw0KGgoAAAANS...",
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

**返回类型**: `MapMetadata[]` （完整元数据数组）

**说明**:
- 返回所有已保存地图的完整元数据列表
- **包含缩略图**：服务端从PGM文件生成200x200缩略图（Base64 PNG格式）
- **不包含完整data字段**：需要完整栅格数据时使用 `load_map` 服务
- 缩略图在服务端实时生成，无需前端处理

**ROS消息定义** (`localization_msgs/ListMaps.srv`):
```
---
bool success
string message
localization_msgs/MapMetadata[] maps
```

**ROS消息定义** (`localization_msgs/MapMetadata.msg`):
```
string id
string name
int64 created_at
string thumbnail
int32 width
int32 height
float32 resolution
float32 origin_x
float32 origin_y
float32 origin_orientation
```

---

### 2. 加载地图

**服务名称**: `/map_manager/load_map`

**服务类型**: `localization_msgs/LoadMap`

**请求参数**:
```json
{
  "map_name": "map_20250115_103045"
}
```

**返回格式**:
```json
{
  "success": true,
  "message": "成功加载地图: map_20250115_103045",
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

**说明**:
- 加载指定地图的完整数据，包含栅格占用数据
- 用于地图编辑或需要完整数据的场景
- 数据量较大，仅在必要时调用

---

### 3. 保存地图

**服务名称**: `/map_manager/save_map`

**服务类型**: `localization_msgs/SaveMap`

**请求参数**:
```json
{
  "map_name": "map_20250115_103045",
  "created_at": 1736910645,
  "thumbnail": "data:image/png;base64,iVBORw0KGgoAAAANS...",
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
  "message": "地图 'map_20250115_103045' 保存成功"
}
```

**说明**:
- 保存地图到ROS后端（YAML + PGM格式）
- **新增参数**：
  - `created_at`: Unix时间戳（秒），记录地图创建时间
  - `thumbnail`: Base64编码的缩略图（200x200 JPEG，60%质量）
- 服务端将thumbnail转换为PNG格式保存

**ROS消息定义** (`localization_msgs/SaveMap.srv`):
```
string map_name
int64 created_at
string thumbnail
nav_msgs/OccupancyGrid map_data
---
bool success
string message
```

---

### 4. 删除地图

**服务名称**: `/map_manager/delete_map`

**服务类型**: `localization_msgs/DeleteMap`

**请求参数**:
```json
{
  "map_name": "map_20250115_103045"
}
```

**返回格式**:
```json
{
  "success": true,
  "message": "地图 'map_20250115_103045' 已删除"
}
```

**说明**:
- 从ROS后端删除指定地图（删除YAML、PGM、PNG文件）
- 此操作不可恢复
- 前端会同步删除本地缓存

---

### 5. 应用地图

**服务名称**: `/map_manager/apply_map`

**服务类型**: `localization_msgs/SetMapName`

**请求参数**:
```json
{
  "map_name": "map_20250115_103045"
}
```

**返回格式**:
```json
{
  "success": true,
  "message": "地图 'map_20250115_103045' 已应用为当前地图"
}
```

**说明**:
- 将指定地图设置为当前地图
- SLAM端将通过 `/map` 话题实时发布该地图
- 用于定位和导航前切换地图

---

## 话题订阅

### 1. 定位状态话题

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

### 2. 实时地图话题

**话题名称**: `/map`

**消息类型**: `nav_msgs/OccupancyGrid`

**说明**:
- 建图模式下实时发布构建中的地图
- 应用地图后实时发布当前地图
- 前端订阅此话题实时显示地图

---

### 3. 机器人位置话题

**话题名称**: `/odom`

**消息类型**: `nav_msgs/Odometry`

**说明**:
- 发布机器人当前位置和姿态
- 前端订阅用于显示机器人在地图上的位置

---

## 数据格式定义

### MapMetadata（地图元数据）

**TypeScript接口定义**:
```typescript
interface MapMetadata {
  id: string;                    // 地图唯一标识符
  name: string;                  // 地图名称
  created_at: number;            // 创建时间（Unix 时间戳，秒）
  thumbnail: string;             // 缩略图（Base64 PNG，200x200px）
  width: number;                 // 地图宽度（像素）
  height: number;                // 地图高度（像素）
  resolution: number;            // 分辨率（米/像素）
  origin_x: number;              // 地图原点 X 坐标（米）
  origin_y: number;              // 地图原点 Y 坐标（米）
  origin_orientation: number;    // 地图原点朝向（弧度）
}
```

**ROS消息定义** (`localization_msgs/MapMetadata.msg`):
```
string id
string name
int64 created_at
string thumbnail
int32 width
int32 height
float32 resolution
float32 origin_x
float32 origin_y
float32 origin_orientation
```

---

### MapData（前端地图数据）

**TypeScript接口定义**:
```typescript
interface MapData {
  id: string;                    // 地图唯一标识符
  name: string;                  // 地图名称
  createdAt: string;             // 创建时间（ISO 8601格式）
  thumbnail: string;             // 缩略图（Base64）
  width: number;                 // 地图宽度（像素）
  height: number;                // 地图高度（像素）
  resolution: number;            // 分辨率（米/像素）
  origin: {
    x: number;                   // 原点 X 坐标（米）
    y: number;                   // 原点 Y 坐标（米）
    orientation: number;         // 原点朝向（弧度）
  };
  data: number[];                // 占用栅格数据
  localOnly?: boolean;           // 仅存在于本地缓存，未同步到ROS
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

### ROSMap（ROS地图格式）

用于 `/map_manager/save_map` 请求参数和 `/map_manager/load_map` 返回值。

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

---

## 前端缓存策略

### 本地缓存优先策略

前端使用 `localStorage` 实现地图本地缓存，采用"前端优先"策略：

**缓存策略**:
1. **保存地图**：双写（同时保存到ROS和本地缓存）
2. **加载地图**：
   - 默认从本地缓存加载（快速）
   - 缓存为空或点击"刷新列表"时从ROS加载
3. **删除地图**：双删（同时从ROS和本地缓存删除）

**数据压缩**:
- 使用 Run-Length Encoding (RLE) 压缩地图数据
- 压缩率通常达到 90%+
- 缩略图使用 JPEG 格式（60%质量）

**同步检测**:
- 点击"刷新列表"时对比本地和ROS
- 标记仅存在于本地的地图（`localOnly: true`）
- 提供"同步到ROS"按钮上传本地独有地图

**本地独有地图处理**:
- 显示橙色"仅本地"标记
- 不能应用为当前地图（需先同步）
- 可以编辑和删除
- 点击"同步到ROS"上传到后端

**存储位置**:
- 元数据列表：`localStorage['astribot_maps']`
- 地图数据：`localStorage['astribot_map_data_' + mapId]`

---

## 使用示例

### 前端调用示例

#### 1. 启动建图模式（带跳过选项）

```typescript
// 用户选择跳过选项
const skipJoystick = true;  // 遥控器已手动启动
const skipMappingNode = false;

// 步骤1: 启动遥控器（可跳过）
if (!skipJoystick) {
  const joystickResult = await rosService.startJoystick();
  if (!joystickResult.success) {
    message.error('启动遥控器失败');
    return;
  }
}

// 步骤2: 进入建图模式（可跳过）
if (!skipMappingNode) {
  const mappingResult = await rosService.startMapping();
  if (!mappingResult.success) {
    message.error('启动建图失败');
    return;
  }
}

setIsMapping(true);
message.success('建图已启动');
```

#### 2. 停止建图（智能跳过）

```typescript
// 停止时根据启动状态智能跳过
if (!skipMappingNode) {
  await rosService.stopLocalization();
}

if (!skipJoystick) {
  await rosService.stopJoystick();
}

setIsMapping(false);
```

#### 3. 加载地图列表（本地缓存优先）

```typescript
// 默认从本地缓存加载
const loadMaps = async (forceRefresh = false) => {
  // 优先本地缓存
  if (!forceRefresh) {
    const localMaps = mapStorageService.getAllMapsFromLocalCache();
    if (localMaps.length > 0) {
      setMaps(localMaps);
      return;
    }
  }

  // 从ROS加载
  const rosMaps = await rosService.getAllMapMetadata();

  // 对比本地和远端，标记本地独有地图
  if (forceRefresh) {
    const localMaps = mapStorageService.getAllMapsFromLocalCache();
    const rosMapIds = new Set(rosMaps.map(m => m.id));
    const localOnlyMaps = localMaps.filter(m => !rosMapIds.has(m.id));

    // 标记为本地独有
    localOnlyMaps.forEach(m => m.localOnly = true);

    setMaps([...rosMaps, ...localOnlyMaps]);
  } else {
    setMaps(rosMaps);
  }
};
```

#### 4. 保存地图（双写）

```typescript
// 生成缩略图
const thumbnail = mapStorageService.generateThumbnail(
  mapData.data,
  mapData.width,
  mapData.height
);

const mapToSave: MapData = {
  id: 'map_20250115_103045',
  name: 'map_20250115_103045',
  createdAt: new Date().toISOString(),
  thumbnail,
  width: 384,
  height: 384,
  resolution: 0.05,
  origin: { x: -10.0, y: -10.0, orientation: 0.0 },
  data: [/* 栅格数据 */]
};

// 保存到ROS
await rosService.saveMapToROS(mapToSave);

// 同时保存到本地缓存
mapStorageService.saveMapToLocalCache(mapToSave);

message.success('地图已保存');
```

#### 5. 同步本地独有地图到ROS

```typescript
const handleSyncToROS = async (map: MapData) => {
  // 保存到ROS
  await rosService.saveMapToROS(map);

  // 移除localOnly标记
  setMaps(prevMaps =>
    prevMaps.map(m =>
      m.id === map.id ? { ...m, localOnly: false } : m
    )
  );

  message.success('地图已同步到ROS');
};
```

#### 6. 删除地图（双删）

```typescript
const handleDelete = async (mapId: string) => {
  let rosDeleteSuccess = false;
  let localDeleteSuccess = false;

  // 删除本地缓存
  try {
    mapStorageService.deleteMapFromLocalCache(mapId);
    localDeleteSuccess = true;
  } catch (error) {
    console.error('本地删除失败:', error);
  }

  // 删除ROS后端（如果连接）
  if (connectionStatus === ConnectionStatus.CONNECTED) {
    try {
      await rosService.deleteMapFromROS(mapId);
      rosDeleteSuccess = true;
    } catch (error) {
      console.error('ROS删除失败:', error);
    }
  }

  // 显示结果
  if (localDeleteSuccess && rosDeleteSuccess) {
    message.success('地图已删除（本地和ROS同步完成）');
  } else if (localDeleteSuccess) {
    message.warning('地图已从本地删除，但ROS删除失败');
  } else {
    message.error('地图删除失败');
  }
};
```

#### 7. 订阅定位状态

```typescript
const unsubscribe = rosService.subscribeLocalizationStatus((status) => {
  console.log('定位状态:', status.data);
  setLocalizationStatus(status.data);
});

// 取消订阅
unsubscribe();
```

---

## 注意事项

### 1. 启动流程跳过选项

- **使用场景**：
  - 遥控器或建图节点已通过命令行手动启动
  - 调试时需要单独控制某个组件
  - 避免重复启动导致的错误

- **跳过规则**：
  - 启动时跳过的服务，停止时也会自动跳过
  - 前端会记住启动状态，保持一致性
  - 不会调用不存在的服务，避免错误

### 2. 服务调用顺序

- **建图模式**：
  1. （可选）启动遥控器 `/joystick/start`
  2. 启动建图 `/localization/start_mapping`
  3. 通过 `/map` 话题订阅实时地图

- **定位模式**：
  1. 应用地图 `/map_manager/apply_map`
  2. 启动定位 `/localization/start_localization` 或 `start_localization_auto`
  3. （手动模式）设置初始位姿

- **切换地图**：
  1. 停止定位 `/localization/stop`
  2. 应用新地图 `/map_manager/apply_map`
  3. 重启定位 `/localization/start_localization_auto`

### 3. 地图存储策略

- **双重存储**：
  - ROS后端：YAML + PGM + PNG（持久化）
  - 前端缓存：localStorage + RLE压缩（性能）

- **缓存优先**：
  - 默认从本地加载（秒开）
  - 定期刷新同步状态
  - 自动标记本地独有地图

- **数据一致性**：
  - 保存时双写（ROS + 本地）
  - 删除时双删（ROS + 本地）
  - 刷新时对比差异

### 4. 时间戳格式

- **前端**：ISO 8601 格式（`2025-01-15T10:30:45.000Z`）
  ```typescript
  createdAt: new Date().toISOString()
  ```

- **ROS服务**：Unix 时间戳（秒）
  ```python
  created_at: int(time.time())
  ```

- **转换**：
  ```typescript
  // ISO → Unix timestamp
  const timestamp = Math.floor(new Date(isoString).getTime() / 1000);

  // Unix timestamp → ISO
  const isoString = new Date(timestamp * 1000).toISOString();
  ```

### 5. 缩略图处理

- **生成**：前端在保存时生成（200x200 JPEG，60%质量）
- **存储**：Base64格式同时保存到ROS和本地
- **服务端**：
  - `save_map`：接收前端缩略图，转换为PNG保存
  - `list_maps`：从PNG文件读取并转换为Base64返回

### 6. 错误处理

- **服务调用**：
  ```typescript
  try {
    const result = await rosService.someService();
    if (!result.success) {
      message.error(result.message);
      return;
    }
  } catch (error) {
    message.error('服务调用失败: ' + error.message);
  }
  ```

- **跳过检测**：
  ```typescript
  if (skipJoystick) {
    console.log('[建图] 跳过启动遥控器');
  } else {
    const result = await rosService.startJoystick();
    // 处理结果...
  }
  ```

### 7. 性能优化

- **地图列表加载**：
  - 首次加载：从本地缓存秒开
  - 后台异步：加载完整地图数据
  - 刷新列表：对比差异，智能合并

- **缩略图策略**：
  - 服务端生成并缓存（PNG文件）
  - 前端不需要重复生成
  - 200x200尺寸平衡质量和性能

- **数据压缩**：
  - RLE压缩地图数据（压缩率90%+）
  - JPEG压缩缩略图（60%质量）
  - 减少localStorage占用

---

## Mock 服务器实现

Mock 服务器（`mock_rosbridge.py`）完整实现了所有 localization 服务，用于开发和测试：

- **WebSocket 端口**: 9090（rosbridge 协议）
- **存储位置**: `mock_saved_maps/`（JSON 文件）
- **持久化**: 自动保存到磁盘，重启后自动加载
- **缩略图**: 支持生成和存储Base64缩略图

启动命令：
```bash
python3 mock_rosbridge.py
```

---

## 相关文档

- [ROS 集成文档](./ROS_INTEGRATION.md)
- [地图存储架构](./MAP_STORAGE_ARCHITECTURE.md)
- [导航事件处理](./NAVIGATION_EVENTS.md)
- [任务系统架构](./TASK_SYSTEM.md)
- [启动脚本说明](./STARTUP_SCRIPTS.md)
