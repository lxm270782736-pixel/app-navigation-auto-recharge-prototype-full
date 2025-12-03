# 路径点交互优化设计

## 需求概述

### 1. UI优化
- 路径点列表：位置和角度合并为一行显示
- 增加视觉紧凑性，减少列表高度

### 2. 列表拖动排序
- 支持拖动路径点调整顺序
- 实时更新序号
- 自动保存新顺序

### 3. 地图路径点交互
- **拖动移动**：鼠标拖动路径点修改位置
- **删除**：点击路径点显示删除按钮
- **旋转**：拖动方向箭头调整角度

---

## 设计方案

### 方案1：列表拖动排序

#### 技术选型

**选项A：上移/下移按钮**
- 优点：简单稳定，无需额外依赖
- 缺点：多个路径点调整顺序麻烦
- 适用场景：路径点数量少（≤5个）

**选项B：react-beautiful-dnd**
- 优点：成熟的拖拽库，体验好
- 缺点：额外依赖，需要配置
- 适用场景：复杂拖拽需求

**选项C：@dnd-kit/sortable**
- 优点：轻量级，性能好，TypeScript支持好
- 缺点：需要学习新API
- 适用场景：现代化拖拽需求

**推荐方案**：先实现上移/下移按钮（快速实现），后续可升级为拖拽

#### 实现细节

```typescript
// 上移
const handleMoveUp = (index: number) => {
  if (index === 0) return;
  const newWaypoints = [...waypoints];
  [newWaypoints[index - 1], newWaypoints[index]] =
    [newWaypoints[index], newWaypoints[index - 1]];
  setWaypoints(newWaypoints);
};

// 下移
const handleMoveDown = (index: number) => {
  if (index === waypoints.length - 1) return;
  const newWaypoints = [...waypoints];
  [newWaypoints[index], newWaypoints[index + 1]] =
    [newWaypoints[index + 1], newWaypoints[index]];
  setWaypoints(newWaypoints);
};
```

#### UI设计

```
┌─────────────────────────────────────┐
│ ➊ (2.5, 3.2, 90°)  [↑↓] [⚙️] [🗑️] │
│   🔵 2个任务  ⚡ 避障               │
├─────────────────────────────────────┤
│ ➋ (5.0, 4.1, 180°) [↑↓] [⚙️] [🗑️] │
│   ⚡ 局部                            │
└─────────────────────────────────────┘
```

---

### 方案2：地图路径点交互

#### 2.1 选中状态管理

```typescript
// Navigation组件状态
const [selectedWaypointIndex, setSelectedWaypointIndex] = useState(-1);
```

#### 2.2 拖动修改位置

**交互流程**：
1. 鼠标悬停路径点 → 显示可拖动提示（光标变化）
2. 按下鼠标 → 进入拖动模式
3. 移动鼠标 → 实时更新路径点位置
4. 松开鼠标 → 确认新位置，自动调整列表数据

**实现要点**：
```typescript
// MapCanvas状态
const [draggingWaypointIndex, setDraggingWaypointIndex] = useState(-1);
const [dragStartPos, setDragStartPos] = useState<{x: number, y: number} | null>(null);

// 鼠标事件处理
onMouseDown: (e) => {
  // 检测点击的是否是路径点
  const clickedIndex = getClickedWaypointIndex(e.clientX, e.clientY);
  if (clickedIndex >= 0) {
    setDraggingWaypointIndex(clickedIndex);
    setDragStartPos({x: e.clientX, y: e.clientY});
  }
}

onMouseMove: (e) => {
  if (draggingWaypointIndex >= 0) {
    // 计算新位置（屏幕坐标 -> 世界坐标）
    const newPose = screenToWorld(e.clientX, e.clientY);
    // 实时更新预览
    onWaypointDragMove?.(draggingWaypointIndex, newPose);
  }
}

onMouseUp: (e) => {
  if (draggingWaypointIndex >= 0) {
    // 确认新位置
    const newPose = screenToWorld(e.clientX, e.clientY);
    onWaypointDragEnd?.(draggingWaypointIndex, newPose);
    setDraggingWaypointIndex(-1);
  }
}
```

**视觉反馈**：
- 拖动时：路径点放大、半透明
- 拖动时：显示虚线连接线
- 拖动时：显示目标位置预览

#### 2.3 删除路径点

**交互方式A：悬浮删除按钮**
- 点击路径点 → 选中（高亮）
- 在路径点旁显示❌删除按钮
- 点击删除按钮 → 确认删除

**交互方式B：右键菜单**
- 右键点击路径点 → 显示菜单
- 菜单项：删除、编辑、上移、下移
- 点击删除 → 确认删除

**推荐方案**：悬浮删除按钮（更直观）

**实现**：
```typescript
// 绘制选中的路径点时，额外绘制删除按钮
if (index === selectedWaypointIndex) {
  // 删除按钮位置：路径点右上角
  const buttonX = pixelX + size + 10;
  const buttonY = pixelY - size;

  drawDeleteButton(ctx, buttonX, buttonY);
}
```

#### 2.4 旋转方向

**交互流程**：
1. 点击路径点 → 选中
2. 显示方向箭头（延长）
3. 拖动箭头端点 → 旋转方向
4. 松开鼠标 → 确认新方向

**实现**：
```typescript
// 绘制可交互的方向箭头
if (index === selectedWaypointIndex) {
  const arrowLength = size * 3; // 延长箭头便于拖动
  const endX = centerX + Math.cos(theta) * arrowLength;
  const endY = centerY + Math.sin(theta) * arrowLength;

  // 绘制箭头 + 端点拖动手柄
  drawArrow(ctx, centerX, centerY, endX, endY);
  drawRotationHandle(ctx, endX, endY); // 圆形手柄
}

// 拖动手柄计算新角度
onMouseMove: (e) => {
  if (isRotatingWaypoint) {
    const dx = e.clientX - waypointCenterX;
    const dy = e.clientY - waypointCenterY;
    const newTheta = Math.atan2(dy, dx);
    onWaypointRotate?.(selectedIndex, newTheta);
  }
}
```

---

## 交互模式切换

### 多模式管理

为避免冲突，需要明确交互模式：

```typescript
enum MapInteractionMode {
  ADD_WAYPOINT = 'add_waypoint',      // 添加路径点（默认）
  DRAG_WAYPOINT = 'drag_waypoint',    // 拖动路径点
  ROTATE_WAYPOINT = 'rotate_waypoint', // 旋转方向
  SELECT_WAYPOINT = 'select_waypoint', // 选中路径点
  RELOCALIZE = 'relocalize',           // 重定位模式
}
```

### 模式切换规则

| 状态 | 点击空白 | 点击路径点 | 拖动路径点 | 拖动箭头 |
|------|---------|-----------|-----------|---------|
| 默认 | 添加新点 | 选中 | - | - |
| 选中 | 取消选中 | 切换选中 | 移动位置 | 旋转方向 |
| 拖动中 | - | - | 更新位置 | - |
| 旋转中 | - | - | - | 更新角度 |

---

## UI/UX优化

### 视觉提示

1. **路径点状态**
   - 默认：蓝色圆圈
   - 悬停：边框加粗 + 光标变为抓手
   - 选中：边框加粗 + 外发光
   - 拖动：半透明 + 虚线轨迹

2. **删除按钮**
   - 位置：路径点右上角
   - 样式：红色❌，白色背景圆形
   - 悬停：放大动画

3. **方向箭头**
   - 默认：细线短箭头
   - 选中：粗线长箭头 + 端点圆形手柄
   - 拖动：实时预览新方向

### 操作提示

```
┌─────────────────────────────────────┐
│ 💡 操作提示                          │
│ • 点击路径点：选中/显示删除按钮      │
│ • 拖动路径点：修改位置               │
│ • 拖动箭头：调整方向                 │
│ • 点击❌：删除路径点                 │
└─────────────────────────────────────┘
```

---

## 实现优先级

### P0（核心功能）
1. ✅ 位置和角度一行显示
2. ✅ 列表拖拽排序（@dnd-kit/sortable）

### P1（重要功能）
3. ✅ 地图拖动修改位置
4. ✅ 地图点击选中 + 键盘删除（Delete键）

### P2（增强功能）
5. 🔲 拖动旋转方向
6. 🔲 视觉删除按钮（点击路径点显示❌按钮）

---

## 技术难点

### 难点1：坐标转换

拖动路径点时需要实时将屏幕坐标转换为世界坐标，考虑：
- Canvas缩放
- Canvas平移偏移
- 地图分辨率和原点

**解决**：使用MapCanvas已有的坐标转换方法

### 难点2：点击区域判定

判断鼠标是否点击在路径点上：
```typescript
function isPointInWaypoint(
  mouseX: number,
  mouseY: number,
  waypointPixelX: number,
  waypointPixelY: number,
  radius: number
): boolean {
  const dx = mouseX - waypointPixelX;
  const dy = mouseY - waypointPixelY;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
}
```

### 难点3：状态同步

地图上拖动修改位置后，需要同步：
1. waypoints数组
2. 列表显示
3. 地图渲染

**解决**：使用统一的状态管理，回调函数更新

---

## 实现步骤

### 第一步：UI优化（10分钟）
- [x] 修改WaypointControl.tsx，位置和角度一行显示

### 第二步：列表排序（20分钟）
- [ ] 添加上移/下移按钮
- [ ] 实现交换逻辑
- [ ] 更新序号显示

### 第三步：地图选中（30分钟）
- [ ] MapCanvas添加点击检测
- [ ] 传递选中状态到Navigation
- [ ] 高亮显示选中的路径点

### 第四步：地图拖动（60分钟）
- [ ] 实现拖动检测
- [ ] 实时坐标转换
- [ ] 更新路径点位置
- [ ] 视觉反馈优化

### 第五步：删除和旋转（40分钟）
- [ ] 绘制删除按钮
- [ ] 实现删除逻辑
- [ ] 实现旋转交互

---

## 测试场景

### 场景1：基础操作
1. 添加5个路径点
2. 使用上移/下移调整顺序
3. 观察序号更新

### 场景2：地图拖动
1. 添加3个路径点
2. 点击选中第2个点
3. 拖动到新位置
4. 检查列表坐标更新

### 场景3：删除操作
1. 添加路径点
2. 点击选中
3. 点击删除按钮
4. 确认删除成功

### 场景4：方向调整
1. 添加路径点
2. 拖动方向箭头
3. 观察角度实时更新

---

## 用户体验优化

1. **撤销功能**：误删除后可恢复
2. **批量操作**：选中多个路径点批量删除
3. **复制粘贴**：复制路径点配置
4. **键盘快捷键**：Delete删除、Ctrl+Z撤销
5. **吸附功能**：拖动时吸附到栅格

---

## 后续扩展

1. **路径优化**：TSP算法自动优化顺序
2. **路径模拟**：预览机器人行走轨迹
3. **碰撞检测**：路径点位置检查
4. **路径导入导出**：保存/加载路径配置

---

## 已实现功能总结

### 2025-12-03 实现版本

**P0核心功能（已完成）**：
1. ✅ 路径点列表优化：位置和角度合并为一行显示
2. ✅ **列表拖拽排序**：
   - 使用 @dnd-kit/sortable 实现拖拽重排
   - 左侧拖拽手柄图标（⋮⋮图标）
   - 拖动时半透明显示（opacity: 0.5）
   - 支持键盘辅助拖拽（方向键）
   - 导航中禁用拖拽

**P1重要功能（已完成）**：
3. ✅ **地图点击选中**：
   - 点击路径点可选中，显示橙色边框和外发光效果
   - 选中时路径点放大1.2倍
   - 鼠标悬停显示抓手光标和高亮效果

4. ✅ **地图拖动修改位置**：
   - 按住路径点拖动可实时修改其世界坐标
   - 拖动时光标变为grabbing
   - 保持路径点的原有角度theta不变
   - 实时更新列表显示

5. ✅ **键盘快捷键删除**：
   - Delete键删除选中的路径点
   - Escape键取消选中
   - 删除时自动调整选中索引，避免越界

**技术实现细节**：

1. **WaypointControl.tsx改动**：
   - 安装依赖：`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
   - 创建 `SortableWaypointItem` 组件：使用 `useSortable` hook
   - 添加传感器配置：`PointerSensor`, `KeyboardSensor`
   - 实现 `handleDragEnd`：调用 `onMoveWaypoint` 重排数组
   - 用 `DndContext` 和 `SortableContext` 包裹列表
   - 添加拖拽手柄：`HolderOutlined` 图标，仅在非导航状态显示
   - 拖动反馈：拖动时 opacity: 0.5，cursor: grab/grabbing

2. **MapCanvas.tsx改动**：
   - 新增状态：`draggingWaypointIndex`, `hoveredWaypointIndex`
   - 新增函数：`getClickedWaypointIndex` - 检测鼠标点击的路径点
   - 新增props：`selectedWaypointIndex`, `onWaypointClick`, `onWaypointDrag`, `onWaypointDelete`
   - 修改`drawWaypoint`函数：新增`isSelected`和`isHovered`参数，不同状态显示不同视觉效果
   - 修改`handleMouseDown`：优先检测路径点点击，再处理地图点击
   - 修改`handleMouseMove`：处理路径点拖动和悬停检测
   - 修改`handleMouseUp`：结束路径点拖动
   - 更新canvas光标样式：根据拖动/悬停状态显示不同光标

3. **Navigation/index.tsx改动**：
   - 新增状态：`selectedWaypointIndex`
   - 新增函数：`handleWaypointClick`, `handleWaypointDrag`
   - 修改`handleMoveWaypoint`：使用 splice 实现拖拽重排（移除+插入）
   - 修改`handleDeleteWaypoint`：处理选中索引调整
   - 新增useEffect：监听Delete和Escape键盘事件
   - 更新MapCanvas props：传递waypoint交互回调
   - 更新操作提示：多点模式下显示交互说明

4. **用户交互流程**：
   ```
   点击路径点 → 选中（橙色边框，外发光）
        ↓
   拖动路径点 → 实时更新位置（光标grabbing）
        ↓
   松开鼠标 → 确认新位置

   或

   点击路径点 → 选中
        ↓
   按Delete键 → 删除路径点 + 取消选中

   或

   悬停路径点 → 高亮显示 + 抓手光标
   ```

4. **视觉反馈**：
   - 默认状态：蓝色圆圈（待导航）/ 绿色（当前）/ 灰色（已完成）
   - 选中状态：橙色边框（3px）+ 外发光 + 放大1.2倍
   - 悬停状态：外发光 + 放大1.2倍 + grab光标
   - 拖动状态：grabbing光标 + 实时位置更新

**未实现功能（P2低优先级）**：
- 拖动旋转方向（复杂度较高，需求不强烈）
- 列表拖拽排序（react-beautiful-dnd或@dnd-kit/sortable，上下按钮已满足需求）
- 视觉删除按钮（键盘Delete已足够，减少UI复杂度）

**设计权衡**：
1. **键盘删除 vs 视觉删除按钮**：选择键盘删除更简洁，减少UI元素，提高交互效率
2. **上下按钮 vs 拖拽排序**：当前路径点数量通常≤10个，按钮操作足够且更稳定
3. **保持角度 vs 自动调整角度**：拖动仅修改位置，角度保持不变，避免意外修改
