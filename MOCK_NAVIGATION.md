# 模拟导航功能说明

本文档说明 `mock_rosbridge.py` 中实现的模拟导航功能，用于在没有真实机器人的情况下测试导航界面。

## 功能概述

模拟导航系统完整实现了 ROS Action 协议，包括：
- **导航状态**：PENDING → ACTIVE → SUCCEEDED/ABORTED/PREEMPTED
- **实时反馈**：进度、剩余距离、预计到达时间
- **位置插值**：平滑模拟机器人从起点到终点的移动
- **取消支持**：支持中途取消导航

## Action 协议实现

### 1. Action Goal（发送导航目标）

**客户端发送**：
```json
{
  "op": "send_action_goal",
  "action": "/move_chassis_to_server",
  "type": "astribot_msgs/MoveChassisToAction",
  "id": "unique_action_id",
  "goal": {
    "target_pose": {
      "pose": {
        "position": {"x": 5.0, "y": 3.0, "z": 0.0},
        "orientation": {"x": 0.0, "y": 0.0, "z": 0.707, "w": 0.707}
      }
    },
    "use_default_config": false,
    "safe_dist": 0.2,
    "v_max": 0.5,
    "w_max": 1.0,
    "a_max": 0.5,
    "dw_max": 1.0
  }
}
```

**服务器响应流程**：
1. 解析目标位姿
2. 计算距离和导航时间
3. 启动异步导航任务
4. 发送状态和反馈消息

### 2. Action Status（导航状态）

**服务器发送**：
```json
{
  "op": "action_status",
  "id": "action_id",
  "action": "/move_chassis_to_server",
  "values": {
    "status": 1,
    "text": "ACTIVE"
  }
}
```

**状态码说明**：
| 状态码 | 名称 | 说明 |
|-------|------|------|
| 0 | PENDING | 等待开始 |
| 1 | ACTIVE | 正在执行 |
| 2 | PREEMPTED | 被取消 |
| 3 | SUCCEEDED | 成功完成 |
| 4 | ABORTED | 中止（失败） |

### 3. Action Feedback（导航反馈）

**服务器周期性发送**（每 0.15-0.3 秒）：
```json
{
  "op": "action_feedback",
  "id": "action_id",
  "action": "/move_chassis_to_server",
  "values": {
    "distance_to_goal": 2.5,
    "progress": 0.65,
    "eta": 5.0,
    "current_pose": {
      "position": {"x": 3.5, "y": 2.0, "z": 0.0},
      "orientation": {"x": 0.0, "y": 0.0, "z": 0.707, "w": 0.707}
    }
  }
}
```

**反馈字段说明**：
- `distance_to_goal`: 距离目标点的距离（米）
- `progress`: 导航进度（0.0-1.0）
- `eta`: 预计到达时间（秒）
- `current_pose`: 当前位姿

### 4. Action Result（导航结果）

**成功时服务器发送**：
```json
{
  "op": "action_result",
  "id": "action_id",
  "action": "/move_chassis_to_server",
  "values": {
    "status": {
      "goal_id": {"id": "action_id"},
      "status": 3
    },
    "result": {
      "success": true,
      "message": "Navigation completed successfully"
    }
  }
}
```

**失败/取消时**：
```json
{
  "op": "action_result",
  "id": "action_id",
  "action": "/move_chassis_to_server",
  "values": {
    "status": {
      "goal_id": {"id": "action_id"},
      "status": 2
    },
    "result": {
      "success": false,
      "message": "Navigation cancelled by user"
    }
  }
}
```

### 5. Cancel Action（取消导航）

**客户端发送**：
```json
{
  "op": "cancel_action_goal",
  "id": "action_id",
  "action": "/move_chassis_to_server"
}
```

**服务器响应**：
- 立即停止导航模拟
- 发送 PREEMPTED 状态结果
- 保持机器人在当前位置

## 导航模拟逻辑

### 时间计算

```python
# 根据距离计算导航时间
total_distance = sqrt((goal_x - start_x)^2 + (goal_y - start_y)^2)
navigation_duration = max(total_distance / 0.5, 3.0)  # 最少3秒
```

- 假设机器人速度：0.5 m/s
- 最小导航时间：3 秒
- 距离越远，导航时间越长

### 位置插值

```python
# 20步模拟导航过程
steps = 20
for i in range(steps):
    progress = (i + 1) / steps

    # 线性插值计算当前位置
    current_x = start_x + (goal_x - start_x) * progress
    current_y = start_y + (goal_y - start_y) * progress
    current_theta = goal_theta

    # 更新机器人位姿
    robot_pose = {x: current_x, y: current_y, theta: current_theta}
```

- 分20步完成导航
- 使用线性插值计算中间位置
- 每步之间有延迟：`navigation_duration / 20`

### 反馈频率

- 每完成一步发送一次反馈
- 反馈间隔：`navigation_duration / 20` 秒
- 包含剩余距离和进度信息

## 控制台输出示例

```
收到 Action Goal: /move_chassis_to_server (astribot_msgs/MoveChassisToAction)
目标位姿: {'pose': {'position': {'x': 5.0, 'y': 3.0, 'z': 0.0}, ...}}
导航参数: use_default=False, safe_dist=0.2, v_max=0.5, w_max=1.0
开始导航: 从 (2.00, 2.00) 到 (5.00, 3.00)
模拟导航: 距离 3.16m, 预计用时 6.3s
发送状态: PENDING
发送状态: ACTIVE
导航进度: 5%, 剩余距离: 3.01m
导航进度: 10%, 剩余距离: 2.85m
导航进度: 15%, 剩余距离: 2.69m
...
导航进度: 95%, 剩余距离: 0.16m
导航进度: 100%, 剩余距离: 0.00m
导航完成: 到达目标点 (5.00, 3.00)
```

## 与真实 ROS 的差异

| 特性 | 模拟导航 | 真实 ROS |
|------|---------|---------|
| 路径规划 | 直线插值 | 考虑障碍物的全局路径 |
| 避障 | 无 | 实时局部避障 |
| 速度控制 | 恒定速度 | 动态加减速 |
| 旋转 | 直接设置目标角度 | 平滑旋转控制 |
| 失败检测 | 无（总是成功） | 检测碰撞、超时等 |
| 重规划 | 无 | 动态重规划 |

## 测试场景

### 1. 正常导航

1. 设置初始位姿：(2.0, 2.0, 0°)
2. 设置目标点：(5.0, 3.0, 45°)
3. 点击"开始导航"
4. 观察：
   - 状态变化：PENDING → ACTIVE → SUCCEEDED
   - 进度条从 0% → 100%
   - 机器人位置平滑移动到目标点
   - 控制台显示导航日志

### 2. 取消导航

1. 开始导航
2. 导航进行到 50% 时点击"停止导航"
3. 观察：
   - 状态变为 PREEMPTED
   - 机器人停在中途位置
   - 显示"导航已取消"消息

### 3. 长距离导航

1. 设置起点：(0.0, 0.0)
2. 设置终点：(10.0, 10.0)
3. 距离：14.14m，预计用时：28.3秒
4. 观察缓慢的进度更新

### 4. 短距离导航

1. 设置起点：(2.0, 2.0)
2. 设置终点：(2.5, 2.5)
3. 距离：0.71m，但至少用时 3 秒
4. 观察最小时间限制

## 配置参数

模拟器会接收并打印导航参数，但不会实际应用（因为使用固定速度）：

```python
# 接收的参数
use_default_config: bool    # 是否使用默认配置
safe_dist: float           # 安全距离 (m)
v_max: float              # 最大速度 (m/s)
w_max: float              # 最大角速度 (rad/s)
a_max: float              # 最大加速度 (m/s²)
dw_max: float             # 最大转向加速度 (rad/s²)
is_holonomic: bool        # 是否全向运动
deaccelaration_dist: float # 减速距离 (m)
deaccelaration_ratio: float # 减速系数
```

## 扩展建议

### 添加失败模拟

```python
# 随机失败（10%概率）
if random.random() < 0.1:
    result = {
        "success": False,
        "message": "Obstacle detected"
    }
    status = 4  # ABORTED
```

### 添加速度变化

```python
# 根据 v_max 参数调整速度
speed = goal.get("v_max", 0.5)
navigation_duration = total_distance / speed
```

### 添加路径偏差

```python
# 添加随机偏差模拟真实情况
offset_x = random.uniform(-0.1, 0.1)
offset_y = random.uniform(-0.1, 0.1)
current_x = start_x + (goal_x - start_x) * progress + offset_x
current_y = start_y + (goal_y - start_y) * progress + offset_y
```

## 调试技巧

### 查看完整的 Action 消息

在 `handle_action_goal` 函数中添加：
```python
print(json.dumps(data, indent=2))
```

### 调整模拟速度

修改步数和延迟：
```python
steps = 40  # 更多步数，更平滑
await asyncio.sleep(navigation_duration / steps * 0.5)  # 2倍速
```

### 启用详细日志

```python
# 在每个反馈中打印更多信息
print(f"[{time.time():.2f}] Progress: {progress*100:.1f}%, "
      f"Pos: ({current_x:.2f}, {current_y:.2f}), "
      f"Distance: {remaining_distance:.2f}m")
```

## 相关文件

- [mock_rosbridge.py](mock_rosbridge.py) - 模拟服务器实现
- [src/services/ros.ts](src/services/ros.ts) - 客户端 Action 处理
- [NAVIGATION_EVENTS.md](NAVIGATION_EVENTS.md) - 导航事件处理文档
- [src/components/Navigation/index.tsx](src/components/Navigation/index.tsx) - 导航界面组件
