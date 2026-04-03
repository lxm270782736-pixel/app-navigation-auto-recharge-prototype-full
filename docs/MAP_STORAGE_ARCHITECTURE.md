# 地图存储架构分析与改进方案

## 当前架构分析

### 1. 现有地图交互方式

#### 存储层次
```
UI 层 (MapManager/MapEditor/Navigation)
       ↓
mapStorageService (storage.ts)
       ↓ ↓
   HTTP API (17659)  ←──────  LocalStorage (降级)
       ↓
   saved_maps/ 目录
```

#### 当前实现细节

**HTTP API 方式 (优先)**:
- `GET /api/maps` - 获取所有地图列表
- `GET /api/maps/:id` - 获取单个地图
- `POST /api/maps` - 保存地图
- `DELETE /api/maps/:id` - 删除地图
- 端口: 17659
- 数据格式: JSON (带 GZIP 压缩)

**LocalStorage 降级**:
- 元数据: `astribot_maps` (JSON 数组)
- 地图数据: `astribot_map_data_<id>` (RLE 压缩 + Base64)
- 压缩率: ~95% (通过 Run-Length Encoding)
- 缩略图: JPEG 格式, 200px 最大尺寸, 60% 质量

**数据结构**:
```typescript
interface MapData {
  id: string;
  name: string;
  createdAt: string;
  thumbnail: string;        // base64 JPEG
  width: number;
  height: number;
  resolution: number;       // 米/像素
  origin: {
    x: number;
    y: number;
    orientation: number;
  };
  data: number[];          // occupancy grid: -1=未知, 0=空闲, 1-100=占据
}
```

### 2. 当前 ROS 地图相关服务

**已实现的 ROS 服务**:
```typescript
// 建图相关
startMapping()    // /start_mapping (std_srvs/Trigger)
stopMapping()     // /stop_mapping (std_srvs/Trigger)
saveMap(name)     // /save_map (nav_msgs/SaveMap)

// 地图加载
loadMap(name)     // /load_map (nav_msgs/LoadMap)
getMapList()      // /get_map_list (astribot_msgs/GetMapList)

// 地图订阅
subscribeMap()    // /map (nav_msgs/OccupancyGrid)
```

### 3. 当前架构问题

1. **双重存储混乱**:
   - HTTP API (saved_maps/) 和 ROS 地图系统 (/map_server) 分离
   - UI 通过 HTTP 保存/加载地图,但 ROS navigation 需要从 map_server 加载
   - 地图数据不同步,容易出现"UI 有地图但导航找不到"的情况

2. **历史地图管理缺失**:
   - 无法列出 ROS 端保存的历史地图
   - 无法在 UI 中切换不同历史地图进行导航
   - 地图版本管理困难

3. **数据流不一致**:
   ```
   建图流程:
   SLAM → /map topic → UI 显示 → HTTP API 保存 (仅 UI 有)
         ↓
       saveMap() → ROS /save_map → map_server (仅 ROS 有)
   ```

4. **缺少统一接口**:
   - 地图的增删改查分散在 HTTP API 和 ROS Service
   - 地图元数据 (名称、创建时间、缩略图) ROS 端不维护

---

## 改进方案: 统一 ROS Service 架构

### 1. 核心设计原则

**单一数据源**: 所有地图数据由 ROS 端统一管理
**ROS Service 优先**: UI 通过 ROS Service 进行所有地图操作
**LocalStorage 只做缓存**: 离线查看和快速加载

### 2. 新的 ROS Service 定义

#### 地图管理服务 (astribot_msgs/MapManager.srv)

```python
# 列出所有地图
GetMapList.srv:
---
MapMetadata[] maps

# 地图元数据
MapMetadata.msg:
string id
string name
time created_at
uint32 width
uint32 height
float32 resolution
geometry_msgs/Pose origin
string thumbnail_base64   # 缩略图 (可选)
bool is_active           # 当前是否加载到 navigation

# 保存当前地图
SaveCurrentMap.srv:
string name
string description
bool set_as_active       # 是否立即用于导航
---
bool success
string message
string map_id

# 加载历史地图 (用于导航)
LoadMapForNavigation.srv:
string map_id
---
bool success
string message
nav_msgs/OccupancyGrid map

# 删除地图
DeleteMap.srv:
string map_id
---
bool success
string message

# 获取地图详情 (含完整数据)
GetMapDetail.srv:
string map_id
---
bool success
MapMetadata metadata
nav_msgs/OccupancyGrid map

# 更新地图元数据 (重命名等)
UpdateMapMetadata.srv:
string map_id
string name
string description
---
bool success
string message

# 编辑地图数据
UpdateMapData.srv:
string map_id
nav_msgs/OccupancyGrid map
---
bool success
string message

# 导出地图 (PGM + YAML)
ExportMap.srv:
string map_id
string export_path
---
bool success
string message
string pgm_path
string yaml_path
```

### 3. ROS 端实现架构

```python
# map_manager_node.py

class MapManagerNode:
    def __init__(self):
        self.maps_dir = '/opt/astribot/maps/'  # 统一地图存储目录
        self.db = MapDatabase(self.maps_dir)   # SQLite 元数据库

        # 服务
        self.srv_get_list = rospy.Service('/map_manager/get_list',
                                          GetMapList, self.handle_get_list)
        self.srv_save = rospy.Service('/map_manager/save_current',
                                      SaveCurrentMap, self.handle_save)
        self.srv_load = rospy.Service('/map_manager/load',
                                      LoadMapForNavigation, self.handle_load)
        self.srv_delete = rospy.Service('/map_manager/delete',
                                        DeleteMap, self.handle_delete)
        self.srv_get_detail = rospy.Service('/map_manager/get_detail',
                                           GetMapDetail, self.handle_get_detail)
        self.srv_update_meta = rospy.Service('/map_manager/update_metadata',
                                            UpdateMapMetadata, self.handle_update_meta)
        self.srv_update_data = rospy.Service('/map_manager/update_data',
                                            UpdateMapData, self.handle_update_data)
        self.srv_export = rospy.Service('/map_manager/export',
                                       ExportMap, self.handle_export)

        # 订阅当前地图
        self.map_sub = rospy.Subscriber('/map', OccupancyGrid, self.map_callback)
        self.current_map = None

        # 当前活动地图
        self.active_map_id = None

    def handle_save(self, req):
        """保存当前 /map 到文件系统和数据库"""
        if self.current_map is None:
            return SaveCurrentMapResponse(False, "No map available", "")

        map_id = self.generate_map_id()

        # 保存 PGM + YAML
        pgm_path = os.path.join(self.maps_dir, f"{map_id}.pgm")
        yaml_path = os.path.join(self.maps_dir, f"{map_id}.yaml")
        self.save_map_files(self.current_map, pgm_path, yaml_path)

        # 生成缩略图
        thumbnail = self.generate_thumbnail(self.current_map)

        # 保存元数据到数据库
        self.db.insert_map(
            id=map_id,
            name=req.name,
            description=req.description,
            width=self.current_map.info.width,
            height=self.current_map.info.height,
            resolution=self.current_map.info.resolution,
            origin=self.current_map.info.origin,
            thumbnail=thumbnail,
            pgm_path=pgm_path,
            yaml_path=yaml_path,
            created_at=rospy.Time.now()
        )

        # 如果设置为活动地图,重启 map_server
        if req.set_as_active:
            self.set_active_map(map_id)

        return SaveCurrentMapResponse(True, "Map saved successfully", map_id)

    def handle_load(self, req):
        """加载历史地图并设置为 navigation 使用"""
        map_info = self.db.get_map(req.map_id)
        if not map_info:
            return LoadMapForNavigationResponse(False, "Map not found", OccupancyGrid())

        # 读取地图文件
        map_data = self.load_map_from_file(map_info['pgm_path'], map_info['yaml_path'])

        # 重启 map_server 使用新地图
        self.restart_map_server(map_info['yaml_path'])

        self.active_map_id = req.map_id

        return LoadMapForNavigationResponse(True, "Map loaded", map_data)

    def set_active_map(self, map_id):
        """设置活动地图 (重启 map_server)"""
        map_info = self.db.get_map(map_id)
        self.restart_map_server(map_info['yaml_path'])
        self.active_map_id = map_id
        self.db.set_active_map(map_id)

    def restart_map_server(self, yaml_path):
        """动态重启 map_server 加载新地图"""
        # 方法 1: 使用 roslaunch API
        # 方法 2: 使用 map_server 的动态加载服务 (如果支持)
        # 方法 3: 发布到 /map_server/reload 服务
        pass
```

### 4. UI 端适配 (rosMapService.ts)

```typescript
// src/services/rosMapService.ts

import { rosService } from './ros';
import type { MapData } from '@/types';

class ROSMapService {

  // 获取所有地图列表
  async getAllMaps(): Promise<MapData[]> {
    try {
      const response = await rosService.callService<{}, { maps: any[] }>(
        '/map_manager/get_list',
        'astribot_msgs/GetMapList',
        {}
      );

      return response.maps.map(this.convertROSMetadataToMapData);
    } catch (error) {
      console.error('Failed to get maps from ROS:', error);
      // 降级到 LocalStorage
      return this.getFromLocalStorageCache();
    }
  }

  // 保存当前地图
  async saveCurrentMap(name: string, setAsActive: boolean = true): Promise<string> {
    const response = await rosService.callService<any, any>(
      '/map_manager/save_current',
      'astribot_msgs/SaveCurrentMap',
      {
        name,
        description: '',
        set_as_active: setAsActive
      }
    );

    if (!response.success) {
      throw new Error(response.message);
    }

    return response.map_id;
  }

  // 加载历史地图用于导航
  async loadMapForNavigation(mapId: string): Promise<MapData> {
    const response = await rosService.callService<any, any>(
      '/map_manager/load',
      'astribot_msgs/LoadMapForNavigation',
      { map_id: mapId }
    );

    if (!response.success) {
      throw new Error(response.message);
    }

    // 缓存到 LocalStorage 用于快速显示
    const mapData = this.convertROSMapToMapData(response.map, mapId);
    this.cacheToLocalStorage(mapData);

    return mapData;
  }

  // 删除地图
  async deleteMap(mapId: string): Promise<void> {
    const response = await rosService.callService<any, any>(
      '/map_manager/delete',
      'astribot_msgs/DeleteMap',
      { map_id: mapId }
    );

    if (!response.success) {
      throw new Error(response.message);
    }

    // 同时删除本地缓存
    this.removeFromLocalStorageCache(mapId);
  }

  // 获取地图详情 (含完整数据)
  async getMapDetail(mapId: string): Promise<MapData> {
    // 先尝试从本地缓存快速加载
    const cached = this.getFromLocalStorageCache(mapId);
    if (cached) {
      // 异步后台获取最新数据
      this.fetchAndUpdateCache(mapId);
      return cached;
    }

    // 从 ROS 获取
    const response = await rosService.callService<any, any>(
      '/map_manager/get_detail',
      'astribot_msgs/GetMapDetail',
      { map_id: mapId }
    );

    if (!response.success) {
      throw new Error('Map not found');
    }

    const mapData = this.convertROSMapToMapData(response.map, mapId, response.metadata);
    this.cacheToLocalStorage(mapData);

    return mapData;
  }

  // 更新地图元数据 (重命名)
  async updateMapMetadata(mapId: string, name: string): Promise<void> {
    const response = await rosService.callService<any, any>(
      '/map_manager/update_metadata',
      'astribot_msgs/UpdateMapMetadata',
      {
        map_id: mapId,
        name,
        description: ''
      }
    );

    if (!response.success) {
      throw new Error(response.message);
    }
  }

  // 更新地图数据 (编辑后)
  async updateMapData(mapId: string, mapData: MapData): Promise<void> {
    const rosMap = this.convertMapDataToROSMap(mapData);

    const response = await rosService.callService<any, any>(
      '/map_manager/update_data',
      'astribot_msgs/UpdateMapData',
      {
        map_id: mapId,
        map: rosMap
      }
    );

    if (!response.success) {
      throw new Error(response.message);
    }

    // 更新本地缓存
    this.cacheToLocalStorage(mapData);
  }

  // LocalStorage 缓存管理
  private cacheToLocalStorage(mapData: MapData): void {
    // 使用 mapStorageService 的压缩功能
    // 只缓存用于快速显示,不作为主数据源
  }

  private getFromLocalStorageCache(mapId?: string): MapData | MapData[] | null {
    // 从 LocalStorage 读取缓存
    return null;
  }

  private removeFromLocalStorageCache(mapId: string): void {
    // 删除本地缓存
  }

  private async fetchAndUpdateCache(mapId: string): Promise<void> {
    // 后台异步更新缓存
  }

  // 数据转换
  private convertROSMetadataToMapData(rosMetadata: any): MapData {
    return {
      id: rosMetadata.id,
      name: rosMetadata.name,
      createdAt: new Date(rosMetadata.created_at.secs * 1000).toISOString(),
      thumbnail: rosMetadata.thumbnail_base64,
      width: rosMetadata.width,
      height: rosMetadata.height,
      resolution: rosMetadata.resolution,
      origin: {
        x: rosMetadata.origin.position.x,
        y: rosMetadata.origin.position.y,
        orientation: rosMetadata.origin.orientation.z,
      },
      data: [], // 列表时不加载完整数据
    };
  }

  private convertROSMapToMapData(rosMap: any, id: string, metadata?: any): MapData {
    return {
      id,
      name: metadata?.name || 'Unknown',
      createdAt: metadata?.created_at
        ? new Date(metadata.created_at.secs * 1000).toISOString()
        : new Date().toISOString(),
      thumbnail: metadata?.thumbnail_base64 || '',
      width: rosMap.info.width,
      height: rosMap.info.height,
      resolution: rosMap.info.resolution,
      origin: {
        x: rosMap.info.origin.position.x,
        y: rosMap.info.origin.position.y,
        orientation: rosMap.info.origin.orientation.z,
      },
      data: rosMap.data,
    };
  }

  private convertMapDataToROSMap(mapData: MapData): any {
    return {
      header: {
        frame_id: 'map',
      },
      info: {
        width: mapData.width,
        height: mapData.height,
        resolution: mapData.resolution,
        origin: {
          position: {
            x: mapData.origin.x,
            y: mapData.origin.y,
            z: 0,
          },
          orientation: {
            x: 0,
            y: 0,
            z: mapData.origin.orientation,
            w: 1,
          },
        },
      },
      data: mapData.data,
    };
  }
}

export const rosMapService = new ROSMapService();
```

### 5. 历史地图应用场景

#### 场景 1: 多地图切换导航
```typescript
// 在 MapManager 中选择历史地图并切换
const handleSwitchMap = async (mapId: string) => {
  try {
    // 加载地图并设置为 navigation 使用
    const mapData = await rosMapService.loadMapForNavigation(mapId);

    // UI 显示新地图
    setCurrentMap(mapData);

    // 提示用户设置初始位姿
    message.info('地图已切换,请设置机器人初始位姿');

    // 跳转到 Navigation 页面
    navigate('/navigation');
  } catch (error) {
    message.error('切换地图失败: ' + error.message);
  }
};
```

#### 场景 2: 地图版本对比
```typescript
// 显示同一区域不同时间的地图
const MapComparison: React.FC = () => {
  const [map1, setMap1] = useState<MapData>();
  const [map2, setMap2] = useState<MapData>();

  return (
    <div style={{ display: 'flex' }}>
      <MapCanvas map={map1} title="2025-01-10 地图" />
      <MapCanvas map={map2} title="2025-01-15 地图" />
    </div>
  );
};
```

#### 场景 3: 地图历史记录
```typescript
// 显示地图变更历史
const MapHistory: React.FC = () => {
  const [maps, setMaps] = useState<MapData[]>([]);

  useEffect(() => {
    rosMapService.getAllMaps().then(setMaps);
  }, []);

  return (
    <Timeline>
      {maps.map(map => (
        <Timeline.Item key={map.id}>
          <div>{map.name}</div>
          <div>{new Date(map.createdAt).toLocaleString()}</div>
          <img src={map.thumbnail} alt={map.name} />
          <Button onClick={() => handleSwitchMap(map.id)}>
            使用此地图
          </Button>
        </Timeline.Item>
      ))}
    </Timeline>
  );
};
```

### 6. 迁移步骤

#### 阶段 1: ROS 端实现 (1-2 周)
1. 创建 `map_manager_node` 包
2. 实现 8 个 ROS Service
3. 集成 SQLite 数据库存储元数据
4. 实现 map_server 动态切换
5. 添加缩略图生成功能

#### 阶段 2: UI 端适配 (1 周)
1. 创建 `rosMapService.ts`
2. 更新所有组件使用新服务:
   - MapManager: 使用 `rosMapService.getAllMaps()`
   - MapEditor: 使用 `rosMapService.updateMapData()`
   - Mapping: 使用 `rosMapService.saveCurrentMap()`
   - Navigation: 使用 `rosMapService.loadMapForNavigation()`
3. 保留 `mapStorageService` 作为缓存层

#### 阶段 3: 历史地图功能 (1 周)
1. 添加地图历史列表组件
2. 实现地图切换功能
3. 添加地图对比功能
4. 实现地图导出功能

#### 阶段 4: 向后兼容 (可选)
1. 迁移工具: LocalStorage → ROS 数据库
2. HTTP API → ROS Service 转发层
3. 逐步废弃旧的 HTTP API

### 7. 架构优势

 

### 8. 数据库 Schema

```sql
CREATE TABLE maps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  resolution REAL NOT NULL,
  origin_x REAL NOT NULL,
  origin_y REAL NOT NULL,
  origin_orientation REAL NOT NULL,
  thumbnail_base64 TEXT,
  pgm_path TEXT NOT NULL,
  yaml_path TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 0,
  file_size INTEGER,
  checksum TEXT
);

CREATE INDEX idx_created_at ON maps(created_at DESC);
CREATE INDEX idx_is_active ON maps(is_active);
```

---

## 总结

**现有问题**:
- HTTP API 和 ROS 地图系统分离,数据不一致
- 无历史地图管理和版本控制
- 导航使用的地图和 UI 显示的地图可能不一致

**改进方案**:
- 统一使用 ROS Service 管理所有地图操作
- ROS 端维护完整的地图数据库和元数据
- UI 端通过 ROS Service 访问,LocalStorage 仅作缓存
- 支持历史地图列表、切换、对比等功能

**实施建议**:
优先实现阶段 1 和阶段 2,建立基础的 ROS Service 架构。阶段 3 的历史地图功能可以根据需求逐步添加。
