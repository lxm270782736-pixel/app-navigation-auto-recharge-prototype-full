# 附加任务系统使用指南

## 概述

本系统支持在机器人到达导航目标点后自动执行各种附加任务。任务系统采用可扩展架构，易于添加新的任务类型。

## 当前支持的任务类型

### 1. 等待任务 (WAIT)
机器人到达目标点后停留指定时间。

**UI 配置**：
- 在导航控制面板的"附加任务"区域勾选"到达后停留"
- 设置停留时长（1-60秒）

**内部实现**：
```typescript
{
  type: TaskType.WAIT,
  params: {
    duration: 5  // 停留5秒
  }
}
```

### 2. 拍照任务 (PHOTO)
使用机器人相机拍照。

**UI 配置**：
- 勾选"自动拍照"

**内部实现**：
```typescript
{
  type: TaskType.PHOTO,
  params: {
    cameraId: 'default',
    resolution: '1920x1080',
    format: 'jpg',
    count: 1,
    interval: 1
  }
}
```

### 3. 轨迹任务 (TRAJECTORY)
执行预设的运动轨迹。

**UI 配置**：
- 勾选"执行预设轨迹"

**内部实现**：
```typescript
{
  type: TaskType.TRAJECTORY,
  params: {
    trajectoryId: 'trajectory_1',
    speed: 0.5,
    loop: false
  }
}
```

## 测试步骤

### 使用仿真模式测试

1. **启动模拟服务器**
   ```bash
   ./start-sim.sh
   ```

2. **打开浏览器访问**
   ```
   http://localhost:4173
   ```

3. **进入导航界面**
   - 点击"地图管理"
   - 选择或创建一个地图
   - 进入导航模式

4. **配置任务并导航**
   - 在"附加任务"区域勾选需要的任务
   - 如果选择"到达后停留"，设置停留时长
   - 设置机器人初始位置（手动重定位）
   - 设置目标点
   - 点击"开始导航"

5. **观察任务执行**
   - 导航进行中会显示距离和进度
   - 到达目标点后，会在控制台看到任务执行日志
   - UI 的"当前任务"字段会显示正在执行的任务

### 控制台输出示例

导航开始：
```
收到 Action Goal: /move_chassis_to_server
收到 2 个附加任务:
  任务 1: wait - {'duration': 5}
  任务 2: photo - {}
开始导航: 从 (2.00, 2.00) 到 (5.00, 5.00)
```

导航过程：
```
导航进度: 50%, 剩余距离: 2.12m
导航进度: 100%, 剩余距离: 0.00m
导航完成: 到达目标点 (5.00, 5.00)
```

任务执行：
```
开始执行 2 个附加任务...

执行任务 1/2: 任务 1 (wait)
  等待 5 秒...
  等待完成

执行任务 2/2: 任务 2 (photo)
  使用相机 default 拍摄 1 张照片...
    拍照 1/1
  拍照完成

所有任务执行完成！
```

## 扩展新任务类型

### 1. 在类型定义中添加任务类型

编辑 `src/types/task.ts`：

```typescript
export enum TaskType {
  // ... 现有类型
  NEW_TASK = 'new_task',  // 添加新类型
}

// 定义参数接口
export interface NewTaskParams {
  param1: string;
  param2: number;
}

// 添加到联合类型
export type TaskParams =
  | WaitTaskParams
  | PhotoTaskParams
  // ...
  | NewTaskParams;
```

### 2. 在 UI 中添加配置选项

编辑 `src/components/common/NavigationControl.tsx`：

```typescript
<Checkbox value="new_task" style={{ fontSize: '13px' }}>
  执行新任务
  {selectedTasks.includes('new_task' as TaskType) && (
    <div style={{ marginTop: '6px', marginLeft: '24px' }}>
      {/* 添加任务参数配置 UI */}
      <Input placeholder="参数1" />
    </div>
  )}
</Checkbox>
```

### 3. 在模拟服务器中添加执行逻辑

编辑 `mock_rosbridge.py` 的 `execute_tasks` 函数：

```python
elif task_type == "new_task":
    # 新任务执行逻辑
    param1 = task_params.get("param1", "default")
    param2 = task_params.get("param2", 0)
    print(f"  执行新任务: {param1}, {param2}...")
    await asyncio.sleep(2)
    print(f"  新任务完成")
```

### 4. 在真实 ROS 后端实现

在 ROS 端的导航 Action 服务器中添加任务处理代码：

```python
def execute_task(self, task):
    task_type = task.get('type')
    task_params = task.get('params', {})

    if task_type == 'new_task':
        # 调用 ROS 服务或发布话题
        self.execute_new_task(task_params)
```

## 使用工厂函数创建任务

系统提供了便捷的工厂函数：

```typescript
import { createWaitTask, createPhotoTask, TaskType } from '@/types';

// 创建等待任务
const waitTask = createWaitTask(5, "等待5秒");

// 创建拍照任务
const photoTask = createPhotoTask({
  cameraId: 'front_camera',
  count: 3,
  interval: 2
}, "连拍3张");

// 创建导航目标
const goal: NavigationGoal = {
  pose: { x: 5.0, y: 5.0, theta: 0 },
  tasks: [waitTask, photoTask],
  actionConfig: { use_default_config: true }
};

// 发送导航目标
await rosService.sendNavigationGoal(goal);
```

## 复杂任务示例

### 顺序执行多个任务

```typescript
import { createSequenceTask, createWaitTask, createPhotoTask } from '@/types';

const sequenceTask = createSequenceTask([
  createWaitTask(3, "稳定"),
  createPhotoTask({ count: 3, interval: 1 }, "连拍"),
  createWaitTask(2, "完成")
], "拍照流程");
```

### 并行执行任务

```typescript
import { createParallelTask } from '@/types';

const parallelTask = createParallelTask([
  { type: TaskType.PHOTO, params: { cameraId: 'front' } },
  { type: TaskType.SCAN, params: { scanType: '3d', duration: 5 } }
], "同时拍照和扫描");
```

## 任务验证

使用内置的验证函数检查任务配置：

```typescript
import { validateTaskConfig } from '@/types';

const task = createWaitTask(5);
const validation = validateTaskConfig(task);

if (!validation.valid) {
  console.error('任务配置错误:', validation.errors);
}
```

## 调试技巧

1. **查看任务发送日志**
   - 打开浏览器控制台
   - 发送导航目标时会看到：`[ROS] Sending tasks with navigation goal`

2. **查看模拟服务器日志**
   - 观察终端输出
   - 可以看到任务接收和执行的详细信息

3. **监控导航反馈**
   - UI 的"当前任务"字段会实时显示
   - 导航状态卡片会更新任务进度

## 注意事项

1. **任务超时**：每个任务都应该设置合理的超时时间
2. **错误处理**：任务失败不应该影响后续任务（除非设置了 `stopOnFailure`）
3. **资源管理**：注意任务之间的资源依赖和冲突
4. **性能考虑**：避免创建过多的小任务，优先使用复合任务

## 相关文档

- [任务系统架构设计](./TASK_SYSTEM.md) - 详细的架构文档
- [类型定义](./src/types/task.ts) - 完整的 TypeScript 类型
- [ROS 集成指南](./ROS_INTEGRATION.md) - ROS 后端集成

## 常见问题

**Q: 任务没有执行？**
A: 检查：
1. 是否在导航前勾选了任务
2. 浏览器控制台是否有错误
3. 模拟服务器是否正常运行

**Q: 如何添加自定义参数？**
A: 参考"扩展新任务类型"部分，在类型定义中添加参数接口。

**Q: 可以取消正在执行的任务吗？**
A: 点击"停止导航"按钮会取消导航和所有剩余任务。
