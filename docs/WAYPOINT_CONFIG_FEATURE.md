# 多路径点巡航导航 - 路径点独立配置功能

## 功能概述

为每个路径点增加了独立配置能力，每个路径点可以单独设置：
1. **附加任务**：到达该点后执行的任务列表
2. **导航模式**：避障导航或局部导航
3. **导航参数**：速度、加速度等高级配置

## 数据结构变更

### 新增Waypoint类型 (`src/types/index.ts`)

```typescript
export interface Waypoint {
  pose: Pose;                              // 位姿（x, y, theta）
  tasks?: TaskConfig[];                    // 到达后执行的任务
  navigationMode?: 'obstacle_avoidance' | 'local_navigation';  // 导航模式
  actionConfig?: NavigationActionConfig;   // 导航参数配置
}
```

### 与原Pose类型的区别

- **原Pose**：只包含位姿信息（x, y, theta）
- **新Waypoint**：包含位姿 + 任务 + 导航配置

## UI组件

### 1. WaypointConfigModal（新增）

**文件**：`src/components/common/WaypointConfigModal.tsx`

**功能**：
- 编辑单个路径点的完整配置
- 显示位姿信息（只读）
- 配置导航模式（避障/局部）
- 配置到达后执行的任务
- 配置导航参数（高级选项）

**UI布局**：
```
┌─────────────────────────────────────┐
│ 路径点 N 配置                    [X]│
├─────────────────────────────────────┤
│ 位姿信息（灰色背景，只读）           │
│ 坐标: (x, y)  方向: θ°              │
├─────────────────────────────────────┤
│ ⚡ 导航模式                          │
│ [ 避障导航 | 局部导航 ]             │
├─────────────────────────────────────┤
│ 📋 到达后执行任务 (N)    [配置任务] │
│ [任务列表预览]                       │
├─────────────────────────────────────┤
│ ⚙️ 高级参数配置 ▼                   │
│   [使用默认配置] ☑                  │
│   [参数调整面板]                     │
└─────────────────────────────────────┘
           [保存] [取消]
```

### 2. WaypointControl（增强）

**文件**：`src/components/common/WaypointControl.tsx`

**新增功能**：
- 每个路径点旁显示⚙️编辑按钮
- 显示路径点配置标签：
  - 🔵 "N个任务"标签（有任务时）
  - ⚡ "避障"/"局部"标签（导航模式）

**路径点列表增强**：
```
┌─────────────────────────────────────┐
│ ➊ (2.5, 3.2, 90°)         [⚙️] [🗑️]│
│   🔵 2个任务  ⚡ 避障               │
├─────────────────────────────────────┤
│ ➋ (5.0, 4.1, 180°)  ✓     [⚙️] [🗑️]│
│   ⚡ 局部                            │
├─────────────────────────────────────┤
│ ➌ (7.2, 2.8, 45°)         [⚙️] [🗑️]│
│   🔵 1个任务  ⚡ 避障               │
└─────────────────────────────────────┘
```

### 3. NavigationControl（优化）

**文件**：`src/components/common/NavigationControl.tsx`

**变更**：
- 多点巡航模式下**隐藏**导航模式选择
- 多点巡航模式下**隐藏**任务配置面板
- 单点导航模式保持原有功能

**原因**：每个路径点有自己的导航模式和任务，不需要全局配置

## 导航执行逻辑

### navigateToWaypoint函数增强 (`Navigation/index.tsx`)

```typescript
const navigateToWaypoint = async (index: number) => {
  const waypoint = waypoints[index];

  // 1. 根据路径点的navigationMode选择执行方式
  if (waypoint.navigationMode === 'local_navigation') {
    // 局部导航：发送到 /small_range_goal
    rosService.sendLocalNavigationGoal(waypoint.pose);
    // 模拟3秒后完成，自动进入下一个
  } else {
    // 避障导航：使用Action接口
    await rosService.sendNavigationGoal({
      pose: waypoint.pose,
      tasks: waypoint.tasks || [],           // 使用该路径点的任务
      actionConfig: waypoint.actionConfig    // 使用该路径点的参数
    });
  }
};
```

### 顺序执行流程

1. 用户点击"开始巡航"
2. 调用 `navigateToWaypoint(0)`
3. 发送第1个路径点的导航目标（使用该点的配置）
4. 等待导航完成（监听 `navigation-result` 事件）
5. 成功后调用 `navigateToWaypoint(1)`
6. 重复步骤3-5直到所有路径点完成

## 使用流程

### 设置路径点配置

1. **添加路径点**
   - 切换到"多点巡航"模式
   - 点击地图添加路径点（默认配置：避障导航，无任务）

2. **编辑路径点**
   - 点击路径点右侧的⚙️编辑按钮
   - 打开配置Modal

3. **配置导航模式**
   - 选择"避障导航"或"局部导航"
   - 避障：使用全局路径规划，支持避障
   - 局部：短距离快速导航，无避障

4. **配置任务**
   - 点击"配置任务"按钮
   - 添加到达该点后要执行的任务
   - 支持所有任务类型（等待、拍照、扫描等）

5. **配置导航参数**（可选，仅避障模式）
   - 展开"高级参数配置"
   - 关闭"使用默认配置"
   - 调整速度、加速度等参数

6. **保存配置**
   - 点击"保存"
   - 返回路径点列表

### 执行巡航

1. 配置好所有路径点
2. 点击"开始巡航"
3. 机器人按序导航到每个路径点
4. 每个点使用自己的导航模式和参数
5. 到达后执行该点配置的任务
6. 完成后自动前往下一个点

## 实际应用场景

### 场景1：巡检路线

```
路径点1: (入口，避障导航)
  - 任务: 拍照记录

路径点2: (设备A，避障导航)
  - 任务: 扫描设备状态
  - 参数: 慢速靠近 (v_max=0.3)

路径点3: (设备B，局部导航)  ← 短距离，快速移动
  - 任务: 拍照

路径点4: (出口，避障导航)
  - 任务: 无
```

### 场景2：物料搬运

```
路径点1: (取货区，避障导航)
  - 任务: 等待3秒（装货时间）

路径点2: (走廊，局部导航)  ← 直线通道，快速通过
  - 任务: 无

路径点3: (卸货区，避障导航)
  - 任务: 等待5秒（卸货时间）
  - 参数: 高精度对位 (safe_dist=0.1)

路径点4: (返回，避障导航)
  - 任务: 无
```

## 技术细节

### 状态管理

```typescript
// Navigation/index.tsx 新增状态
const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
const [waypointConfigModalVisible, setWaypointConfigModalVisible] = useState(false);
const [editingWaypointIndex, setEditingWaypointIndex] = useState(-1);
```

### 数据流

```
地图点击 → 创建默认Waypoint → 加入列表
     ↓
点击编辑 → 打开WaypointConfigModal → 修改配置 → 保存
     ↓
开始巡航 → navigateToWaypoint(0) → 使用该点配置发送目标
     ↓
导航完成 → navigateToWaypoint(1) → 循环直到完成
```

### MapCanvas坐标转换

```typescript
// Navigation组件传递给MapCanvas
waypoints={waypointMode ? waypoints.map(w => w.pose) : []}

// MapCanvas只需要Pose数组用于绘制
// 配置信息在导航执行时使用
```

## 文件变更清单

### 新增文件
- `src/components/common/WaypointConfigModal.tsx` - 路径点配置Modal

### 修改文件
1. `src/types/index.ts` - 新增Waypoint类型
2. `src/components/common/WaypointControl.tsx` - 添加编辑功能
3. `src/components/Navigation/index.tsx` - 集成配置功能
4. `src/components/common/NavigationControl.tsx` - 多点模式下隐藏全局配置

## 优势

1. **灵活性**：每个路径点独立配置，适应不同场景
2. **精细控制**：关键点用避障模式，直线段用局部模式提速
3. **任务自动化**：到达后自动执行任务，无需人工干预
4. **参数优化**：狭窄区域降速，开阔区域提速

## 注意事项

1. **导航模式选择**
   - 局部导航：适合直线、短距离、无障碍物场景
   - 避障导航：适合复杂环境、长距离、需要路径规划

2. **任务执行**
   - 任务在到达路径点后执行
   - 任务失败会导致整个巡航失败
   - 建议测试任务配置后再批量应用

3. **参数调整**
   - 建议使用默认配置
   - 仅在必要时调整参数（如精确对位）
   - 参数不当可能导致导航失败

## 未来扩展

1. **路径点模板**：保存常用配置为模板
2. **批量编辑**：选择多个路径点批量修改配置
3. **配置复制**：复制一个路径点的配置到其他点
4. **任务预览**：3D可视化任务执行过程
5. **参数建议**：AI推荐最优导航参数
