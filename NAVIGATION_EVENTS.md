# 导航事件处理说明

本文档详细说明了导航过程中的事件处理机制，包括导航结果(result)和导航反馈(feedback)的处理方式。

## 概述

导航系统使用 ROS Action 机制，通过三种类型的事件来跟踪和管理导航过程：

1. **navigation-result** - 导航完成时的最终结果
2. **navigation-feedback** - 导航过程中的实时反馈（进度信息）
3. **navigation-status** - 导航状态变化通知

## 事件详解

### 1. navigation-result（导航结果）

导航任务完成（成功、失败或取消）时触发此事件。

#### 事件数据结构

```typescript
{
  success: boolean;                // 综合判断结果（actionlib状态码 + result.result）
  actionStatus: number;            // actionlib 状态码（见下表）
  actionSucceeded: boolean;        // actionlib 是否为成功状态（status === 3）
  actionAborted: boolean;          // 是否中止（status === 4）
  actionPreempted: boolean;        // 是否被取消（status === 2）
  resultData: object;              // result.result 中的实际数据
  errorMessage?: string;           // 错误信息（如果有）
  statusText: string;              // 状态码对应的文本描述
}
```

#### actionlib 状态码

| 状态码 | 名称 | 说明 |
|-------|------|------|
| 0 | PENDING | 等待处理 |
| 1 | ACTIVE | 正在执行 |
| 2 | PREEMPTED | 被抢占（用户取消） |
| 3 | SUCCEEDED | 成功完成 |
| 4 | ABORTED | 中止（失败） |
| 5 | REJECTED | 被拒绝 |
| 6 | PREEMPTING | 正在抢占 |
| 7 | RECALLING | 正在撤回 |
| 8 | RECALLED | 已撤回 |
| 9 | LOST | 连接丢失 |

参考: [ROS actionlib_msgs/GoalStatus](http://docs.ros.org/en/api/actionlib_msgs/html/msg/GoalStatus.html)

#### 成功判断逻辑

```typescript
// 1. 检查 actionlib 状态码
const actionSucceeded = result.status?.status === 3;

// 2. 检查 result.result 中的实际结果
const resultSuccess = result.result?.success !== false;

// 3. 综合判断（两者都必须成功）
const success = actionSucceeded && resultSuccess;
```

**为什么需要两层检查？**

- `actionlib` 状态码表示 Action 执行过程的状态（任务是否完成）
- `result.result` 包含任务的实际执行结果（附加任务是否成功）
- 例如：机器人到达目标点（actionlib=SUCCEEDED），但拍照任务失败（result.success=false）

#### 处理示例

```typescript
const handleNavigationResult = (data: any) => {
  if (data.success) {
    // 完全成功
    message.success('导航成功！机器人已到达目标位置');
  } else {
    // 失败情况
    let errorMsg = '导航失败';

    if (data.actionPreempted) {
      // 用户主动取消
      errorMsg = '导航已取消';
    } else if (data.actionAborted) {
      // 导航中止（可能是路径规划失败、碰撞等）
      errorMsg = '导航中止';
      if (data.errorMessage) {
        errorMsg += `: ${data.errorMessage}`;
      }
    } else if (data.errorMessage) {
      // 其他错误
      errorMsg = `导航失败: ${data.errorMessage}`;
    }

    message.error(errorMsg);
  }

  setIsNavigating(false);
};
```

### 2. navigation-feedback（导航反馈）

导航过程中定期发送的进度信息，用于实时显示导航状态。

#### 事件数据结构

```typescript
{
  distance_to_goal?: number;       // 距离目标的距离（米）
  current_pose?: object;           // 当前位姿
  current_task?: string;           // 当前执行的任务（wait/trajectory/photo）
  progress?: number;               // 进度（0-1）
  eta?: number;                    // 预计到达时间（秒）
  raw: object;                     // 原始反馈数据
}
```

#### 处理示例

```typescript
const handleNavigationFeedback = (data: any) => {
  // 显示剩余距离
  if (data.distance_to_goal !== undefined) {
    console.log(`距离目标: ${data.distance_to_goal.toFixed(2)}m`);
  }

  // 显示当前任务
  if (data.current_task) {
    console.log(`当前任务: ${data.current_task}`);
  }

  // 显示进度百分比
  if (data.progress !== undefined) {
    console.log(`进度: ${(data.progress * 100).toFixed(1)}%`);
  }
};
```

#### 使用场景

- 在 UI 上显示进度条
- 显示剩余距离和预计到达时间
- 显示当前执行的附加任务
- 实时更新导航状态

### 3. navigation-status（导航状态）

导航状态变化时触发，提供状态码和描述文本。

#### 事件数据结构

```typescript
{
  status: number;                  // actionlib 状态码
  text: string;                    // 状态文本（PENDING/ACTIVE/SUCCEEDED等）
}
```

#### 处理示例

```typescript
const handleNavigationStatus = (data: any) => {
  console.log(`导航状态: ${data.text}`);

  // 可以根据状态更新 UI
  if (data.status === 1) { // ACTIVE
    // 显示"导航中"状态
  }
};
```

## 完整使用示例

### 在组件中订阅事件

```typescript
useEffect(() => {
  // 导航结果处理
  const handleNavigationResult = (data: any) => {
    if (data.success) {
      message.success('导航成功！');
      setIsNavigating(false);
    } else {
      let errorMsg = '导航失败';
      if (data.actionPreempted) {
        errorMsg = '导航已取消';
      } else if (data.actionAborted && data.errorMessage) {
        errorMsg = `导航中止: ${data.errorMessage}`;
      }
      message.error(errorMsg);
      setIsNavigating(false);
    }
  };

  // 导航反馈处理
  const handleNavigationFeedback = (data: any) => {
    if (data.distance_to_goal !== undefined) {
      setDistanceToGoal(data.distance_to_goal);
    }
    if (data.progress !== undefined) {
      setProgress(data.progress);
    }
  };

  // 导航状态处理
  const handleNavigationStatus = (data: any) => {
    setNavigationStatus(data.text);
  };

  // 订阅事件
  rosService.on('navigation-result', handleNavigationResult);
  rosService.on('navigation-feedback', handleNavigationFeedback);
  rosService.on('navigation-status', handleNavigationStatus);

  // 清理订阅
  return () => {
    rosService.off('navigation-result', handleNavigationResult);
    rosService.off('navigation-feedback', handleNavigationFeedback);
    rosService.off('navigation-status', handleNavigationStatus);
  };
}, []);
```

## 调试技巧

### 1. 查看控制台日志

所有导航事件都会在控制台打印详细日志，日志前缀为 `[ROS]`：

```
[ROS] Navigation result received: { status: {...}, result: {...} }
[ROS] Navigation result analysis: { success: true, statusText: 'SUCCEEDED', ... }
[ROS] Navigation feedback: { distance_to_goal: 2.5, ... }
[ROS] Navigation status: ACTIVE
```

### 2. 检查事件数据

在组件的事件处理函数中打印完整数据：

```typescript
const handleNavigationResult = (data: any) => {
  console.log('完整结果数据:', JSON.stringify(data, null, 2));
  // ... 处理逻辑
};
```

### 3. 常见问题排查

**Q: 导航完成但显示失败？**
- 检查 `data.resultData.success` 是否为 false
- 检查 `data.errorMessage` 获取具体错误信息
- 检查附加任务（wait/trajectory/photo）是否执行失败

**Q: feedback 事件没有触发？**
- 确认 ROS Action Server 是否发送 feedback
- 检查是否正确订阅了 `navigation-feedback` 事件
- 查看控制台日志确认是否收到数据

**Q: 状态显示不正确？**
- 对照 actionlib 状态码表检查状态值
- 使用 `data.statusText` 获取可读的状态描述

## 文件位置

- **事件发送**: [src/services/ros.ts:199-274](../src/services/ros.ts#L199-L274)
- **Navigation 组件处理**: [src/components/Navigation/index.tsx:84-161](../src/components/Navigation/index.tsx#L84-L161)
- **Dashboard 组件处理**: [src/components/Dashboard/index.tsx:140-196](../src/components/Dashboard/index.tsx#L140-L196)
- **状态码辅助函数**: [src/services/ros.ts:378-395](../src/services/ros.ts#L378-L395)

## 扩展建议

### 显示进度条

```typescript
const [progress, setProgress] = useState(0);

const handleNavigationFeedback = (data: any) => {
  if (data.progress !== undefined) {
    setProgress(data.progress * 100);
  }
};

// UI 中显示
<Progress percent={progress} status={isNavigating ? 'active' : 'normal'} />
```

### 显示剩余距离

```typescript
const [distanceToGoal, setDistanceToGoal] = useState<number | null>(null);

const handleNavigationFeedback = (data: any) => {
  if (data.distance_to_goal !== undefined) {
    setDistanceToGoal(data.distance_to_goal);
  }
};

// UI 中显示
{distanceToGoal !== null && (
  <div>剩余距离: {distanceToGoal.toFixed(2)} m</div>
)}
```

### 显示当前任务

```typescript
const [currentTask, setCurrentTask] = useState<string>('');

const handleNavigationFeedback = (data: any) => {
  if (data.current_task) {
    setCurrentTask(data.current_task);
  }
};

// UI 中显示
{currentTask && (
  <Tag color="processing">执行任务: {currentTask}</Tag>
)}
```

## 参考资料

- [ROS actionlib 文档](http://wiki.ros.org/actionlib)
- [actionlib_msgs/GoalStatus](http://docs.ros.org/en/api/actionlib_msgs/html/msg/GoalStatus.html)
- [roslib.js 文档](http://robotwebtools.org/jsdoc/roslibjs/current/)
