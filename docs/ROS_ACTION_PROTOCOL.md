# ROS Actionlib 协议实现

本文档描述了项目中 ROS Action 的标准协议实现，确保 mock 服务器和前端完全符合 ROS actionlib 标准。

## 标准协议概述

ROS actionlib 使用以下话题进行通信：

1. **Goal 话题** (`/action_name/goal`) - 发送目标
2. **Status 话题** (`/action_name/status`) - 接收状态更新
3. **Feedback 话题** (`/action_name/feedback`) - 接收进度反馈
4. **Result 话题** (`/action_name/result`) - 接收最终结果
5. **Cancel 话题** (`/action_name/cancel`) - 取消目标

## 消息格式

### 1. Result 消息 (`/move_chassis_to_server/result`)

**标准格式**（ActionResult）：
```json
{
  "op": "publish",
  "topic": "/move_chassis_to_server/result",
  "msg": {
    "header": {
      "stamp": {"secs": 1234567890, "nsecs": 0}
    },
    "status": {
      "goal_id": {"id": "goal_xxx"},
      "status": 3,  // 0=PENDING, 1=ACTIVE, 2=PREEMPTED, 3=SUCCEEDED, 4=ABORTED
      "text": "The goal has been successfully achieved by the SimpleActionServer"
    },
    "result": {
      "success": true,
      "message": "Navigation completed successfully"
    }
  }
}
```

**ROSLIB 行为**：
- `goalMessage.on('result', callback)` 只接收 `msg.result` 字段
- 回调接收：`{success: true, message: "..."}`
- Status 信息需要从 `status` 事件中获取

### 2. Feedback 消息 (`/move_chassis_to_server/feedback`)

**标准格式**（ActionFeedback）：
```json
{
  "op": "publish",
  "topic": "/move_chassis_to_server/feedback",
  "msg": {
    "header": {
      "stamp": {"secs": 1234567890, "nsecs": 0}
    },
    "status": {
      "goal_id": {"id": "goal_xxx"},
      "status": 1,  // ACTIVE
      "text": "This goal has been accepted by the simple action server"
    },
    "feedback": {
      "distance_to_goal": 5.2,
      "progress": 0.75,
      "eta": 10.5,
      "current_pose": {
        "position": {"x": 1.0, "y": 2.0, "z": 0.0},
        "orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
      }
    }
  }
}
```

**ROSLIB 行为**：
- `goalMessage.on('feedback', callback)` 只接收 `msg.feedback` 字段
- 回调接收：`{distance_to_goal: 5.2, progress: 0.75, ...}`

### 3. Status 消息 (`/move_chassis_to_server/status`)

**标准格式**（GoalStatusArray）：
```json
{
  "op": "publish",
  "topic": "/move_chassis_to_server/status",
  "msg": {
    "header": {
      "stamp": {"secs": 1234567890, "nsecs": 0}
    },
    "status_list": [{
      "goal_id": {"id": "goal_xxx"},
      "status": 1,  // 当前状态码
      "text": "ACTIVE"
    }]
  }
}
```

**ROSLIB 行为**：
- `goalMessage.on('status', callback)` 接收 `status_list[0]`（单个 GoalStatus）
- 回调接收：`{goal_id: {...}, status: 1, text: "ACTIVE"}`

## 前端实现

### Result 处理逻辑

```typescript
// 存储最后的 action status（从 status 事件获取）
let lastActionStatus: number | undefined;

// 监听 status 事件（在 result 之前）
goalMessage.on('status', (status: any) => {
  lastActionStatus = status.status;  // 记录最后的状态码
  this.emit('navigation-status', {
    status: status.status,
    text: this.getActionStatusText(status.status),
  });
});

// 处理 result 事件
goalMessage.on('result', (result: any) => {
  // result 只包含 {success, message}
  const actionStatus = lastActionStatus;  // 从之前记录的状态获取
  const actionSucceeded = actionStatus === 3;
  const resultSuccess = result.success === true;

  // 综合判断：action 成功 && result 成功
  const success = actionSucceeded && resultSuccess;

  this.emit('navigation-result', {
    success,
    actionStatus,
    resultData: result,
    errorMessage: result.message,
  });
});
```

### 为什么需要 lastActionStatus？

因为 ROSLIB 的 `result` 回调**只接收 `msg.result` 字段**，不包含 `msg.status`。我们需要：

1. 先从 `status` 事件记录最后的 action status（3=SUCCEEDED）
2. 然后在 `result` 回调中使用这个状态码
3. 综合判断：`actionStatus === 3 && result.success === true`

## Mock 实现要点

### ✅ 正确的实现

```python
# Result 消息（通过话题发布）
result_message = {
    "op": "publish",
    "topic": "/move_chassis_to_server/result",
    "msg": {
        "header": {...},
        "status": {
            "goal_id": {"id": action_id},
            "status": 3,  # SUCCEEDED
            "text": "..."
        },
        "result": {
            "success": True,
            "message": "Navigation completed successfully"
        }
    }
}
```

### ❌ 错误的实现

```python
# 错误：使用自定义的 op
result_message = {
    "op": "action_result",  # ❌ 不标准
    "id": action_id,
    "action": "/move_chassis_to_server",
    "values": {...}
}
```

## 状态码对照表

| 状态码 | 名称 | 含义 |
|--------|------|------|
| 0 | PENDING | 等待处理 |
| 1 | ACTIVE | 正在执行 |
| 2 | PREEMPTED | 被抢占（取消） |
| 3 | SUCCEEDED | 成功完成 |
| 4 | ABORTED | 中止（失败） |
| 5 | REJECTED | 被拒绝 |
| 6 | PREEMPTING | 正在抢占 |
| 7 | RECALLING | 正在撤回 |
| 8 | RECALLED | 已撤回 |
| 9 | LOST | 丢失 |

## 导航成功判断逻辑

导航成功需要**同时满足两个条件**：

1. **Action 状态** = SUCCEEDED (3) - 机器人到达目标位置
2. **Result 结果** = success: true - 附加任务全部完成

```typescript
const success = (actionStatus === 3) && (result.success === true);
```

**示例场景**：
- ✅ 机器人到达 + 拍照成功 → success: true
- ❌ 机器人到达 + 拍照失败 → success: false（actionStatus=3 但 result.success=false）
- ❌ 机器人未到达 → success: false（actionStatus=4）

## 参考资料

- [ROS actionlib Documentation](http://wiki.ros.org/actionlib)
- [actionlib_msgs/GoalStatus](http://docs.ros.org/en/api/actionlib_msgs/html/msg/GoalStatus.html)
- [roslibjs Documentation](http://robotwebtools.org/jsdoc/roslibjs/current/Goal.html)
