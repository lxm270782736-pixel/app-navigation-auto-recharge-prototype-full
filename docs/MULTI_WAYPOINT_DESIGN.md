# 多目标点巡航导航设计

## 功能概述

在现有单点导航基础上，增加多目标点巡航导航功能，允许用户在地图上设置多个路径点，机器人将按顺序依次导航到每个目标点。

## UI设计

### 1. 导航模式切换

在NavigationControl面板顶部增加模式切换：

```
┌─────────────────────────────────┐
│ 导航模式                         │
│ ○ 单点导航  ● 多点巡航           │
└─────────────────────────────────┘
```

### 2. 路径点列表（多点模式）

```
┌─────────────────────────────────┐
│ 路径点列表 (3)        [清空全部] │
├─────────────────────────────────┤
│ ➊ (2.5, 3.2, 90°)     [删除]    │
│ ➋ (5.0, 4.1, 180°)    [删除] ✓  │← 当前导航目标
│ ➌ (7.2, 2.8, 45°)     [删除]    │
└─────────────────────────────────┘
```

### 3. 地图可视化

- **路径点标记**：圆形标记 + 序号（1, 2, 3...）
- **颜色状态**：
  - 待导航：蓝色 🔵
  - 当前目标：绿色 🟢（放大+高亮）
  - 已完成：灰色 ⚪
- **路径连线**：路径点之间虚线连接

### 4. 导航进度显示

```
┌─────────────────────────────────┐
│ 巡航进度: 2/3                    │
│ ████████░░░░ 66%                │
│ 当前目标: 路径点2 (5.0, 4.1)     │
│ 剩余距离: 1.2m | ETA: 3s         │
└─────────────────────────────────┘
```

## 交互流程

### 单点导航模式（默认）
1. 点击地图 → 设置目标点（覆盖之前的）
2. 点击"开始导航" → 导航到目标点
3. 到达后完成

### 多点巡航模式
1. 切换到"多点巡航"模式
2. 依次点击地图 → 添加路径点到列表末尾
3. 可删除/调整路径点顺序
4. 点击"开始巡航" → 按顺序导航
5. 每个点到达后自动导航到下一个
6. 全部完成后提示"巡航完成"

## 技术实现

### 1. 状态管理

```typescript
// 新增状态
const [waypointMode, setWaypointMode] = useState(false); // 是否为多点模式
const [waypoints, setWaypoints] = useState<Pose[]>([]); // 路径点列表
const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0); // 当前导航的路径点索引
const [completedWaypoints, setCompletedWaypoints] = useState<number[]>([]); // 已完成的路径点索引
```

### 2. 地图点击处理

```typescript
const handleMapClick = (x: number, y: number, theta?: number) => {
  const pose: Pose = { x, y, theta: theta || 0 };

  if (isRelocalizationMode) {
    // 重定位逻辑（保持不变）
    ...
  } else if (waypointMode) {
    // 多点模式：添加到路径点列表
    setWaypoints([...waypoints, pose]);
    message.success(`已添加路径点 ${waypoints.length + 1}`);
  } else {
    // 单点模式：设置单个目标点（保持不变）
    setGoalPose(pose);
    message.info(`目标点已设置`);
  }
};
```

### 3. 导航执行逻辑

```typescript
const handleStartWaypointNavigation = async () => {
  if (waypoints.length === 0) {
    message.error('请先添加路径点');
    return;
  }

  setCurrentWaypointIndex(0);
  setCompletedWaypoints([]);
  navigateToWaypoint(0);
};

const navigateToWaypoint = async (index: number) => {
  if (index >= waypoints.length) {
    message.success('巡航完成！所有路径点已到达');
    setIsNavigating(false);
    return;
  }

  const targetPose = waypoints[index];
  setGoalPose(targetPose);
  setCurrentWaypointIndex(index);
  setIsNavigating(true);

  // 发送导航目标
  await rosService.sendNavigationGoal({ pose: targetPose, tasks: [], actionConfig });
};

// 监听导航成功事件，自动导航到下一个点
useEffect(() => {
  const handleNavigationResult = (data: any) => {
    if (data.success && waypointMode && currentWaypointIndex < waypoints.length) {
      // 当前路径点导航成功
      setCompletedWaypoints([...completedWaypoints, currentWaypointIndex]);

      // 导航到下一个路径点
      const nextIndex = currentWaypointIndex + 1;
      if (nextIndex < waypoints.length) {
        setTimeout(() => {
          navigateToWaypoint(nextIndex);
        }, 1000); // 延迟1秒再导航到下一个点
      } else {
        // 所有路径点已完成
        message.success('巡航完成！所有路径点已到达');
        setIsNavigating(false);
      }
    }
  };

  rosService.on('navigation-result', handleNavigationResult);
  return () => rosService.off('navigation-result', handleNavigationResult);
}, [waypointMode, currentWaypointIndex, waypoints, completedWaypoints]);
```

### 4. MapCanvas增强

需要在MapCanvas中支持绘制多个路径点标记：

```typescript
interface MapCanvasProps {
  ...
  waypoints?: Pose[]; // 路径点列表
  currentWaypointIndex?: number; // 当前路径点索引
  completedWaypoints?: number[]; // 已完成的路径点
}

// 绘制逻辑
waypoints?.forEach((waypoint, index) => {
  const isCompleted = completedWaypoints?.includes(index);
  const isCurrent = index === currentWaypointIndex;

  // 绘制圆形标记
  const color = isCompleted ? '#999' : isCurrent ? '#52c41a' : '#1890ff';
  const radius = isCurrent ? 20 : 15;

  ctx.beginPath();
  ctx.arc(pixelX, pixelY, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 绘制序号
  ctx.fillStyle = 'white';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), pixelX, pixelY);

  // 绘制连线（到下一个点）
  if (index < waypoints.length - 1) {
    const nextPoint = waypoints[index + 1];
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#1890ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pixelX, pixelY);
    ctx.lineTo(nextPixelX, nextPixelY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
});
```

## 操作按钮

### 单点模式
- **开始导航** / **停止导航**

### 多点模式
- **开始巡航** / **暂停巡航** / **停止巡航**
- **清空路径点**
- **删除选中点**

## 注意事项

1. **模式切换**：从单点切换到多点时，当前目标点不自动加入路径点列表
2. **导航中断**：巡航过程中如果某个点导航失败，是否继续下一个？（可配置）
3. **路径优化**：暂不考虑TSP路径优化，按用户添加顺序导航
4. **保存/加载**：路径点列表支持保存到本地/ROS参数服务器（后续扩展）

## Mock服务器支持

mock_rosbridge.py 无需修改，现有的导航Action机制已支持顺序导航。

## 未来扩展

1. **智能路径规划**：TSP算法优化路径点顺序
2. **循环巡航**：到达终点后返回起点重复巡航
3. **路径模板**：保存常用巡航路径为模板
4. **动态调整**：巡航过程中可添加/删除路径点
5. **每个路径点独立任务配置**：不同路径点执行不同任务
