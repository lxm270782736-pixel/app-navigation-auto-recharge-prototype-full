# 附加任务系统架构设计

## 概述

本文档描述了机器人导航系统中的附加任务架构，该架构支持在到达目标点后执行各种可扩展的任务。

## 设计原则

1. **可扩展性**: 易于添加新的任务类型，无需修改核心代码
2. **灵活性**: 任务参数可自定义，支持复杂配置
3. **可组合性**: 支持任务链和并行任务执行
4. **错误处理**: 完善的错误处理和重试机制
5. **状态跟踪**: 实时反馈任务执行状态和进度

## 核心概念

### 1. 任务类型 (TaskType)

任务类型定义了可执行的任务种类：

```typescript
export enum TaskType {
  // 基础任务
  WAIT = 'wait',              // 停留等待
  PHOTO = 'photo',            // 拍照
  TRAJECTORY = 'trajectory',  // 执行预设轨迹

  // 感知任务
  SCAN = 'scan',              // 环境扫描
  INSPECT = 'inspect',        // 目标检测/识别

  // 交互任务
  SOUND = 'sound',            // 播放声音/语音
  DISPLAY = 'display',        // 显示信息
  SIGNAL = 'signal',          // 发送信号灯

  // 操作任务
  PICKUP = 'pickup',          // 拾取物体
  PLACE = 'place',            // 放置物体
  CHARGE = 'charge',          // 充电

  // 复合任务
  SEQUENCE = 'sequence',      // 顺序执行多个任务
  PARALLEL = 'parallel',      // 并行执行多个任务
  CONDITIONAL = 'conditional', // 条件执行
  LOOP = 'loop',              // 循环执行

  // 自定义任务
  CUSTOM = 'custom',          // 自定义任务（通过ROS服务）
}
```

### 2. 任务配置 (TaskConfig)

每个任务都有一个配置对象，包含任务类型和参数：

```typescript
export interface TaskConfig {
  id?: string;                    // 任务唯一标识
  type: TaskType;                 // 任务类型
  name?: string;                  // 任务名称（可选）
  description?: string;           // 任务描述（可选）
  params?: TaskParams;            // 任务参数
  timeout?: number;               // 超时时间（秒）
  retryOnFailure?: boolean;       // 失败时是否重试
  maxRetries?: number;            // 最大重试次数
  onSuccess?: TaskConfig[];       // 成功后执行的任务
  onFailure?: TaskConfig[];       // 失败后执行的任务
  condition?: TaskCondition;      // 执行条件
}
```

### 3. 任务参数 (TaskParams)

不同任务类型有不同的参数：

```typescript
export type TaskParams =
  | WaitTaskParams
  | PhotoTaskParams
  | TrajectoryTaskParams
  | ScanTaskParams
  | InspectTaskParams
  | SoundTaskParams
  | DisplayTaskParams
  | SignalTaskParams
  | PickupTaskParams
  | PlaceTaskParams
  | ChargeTaskParams
  | SequenceTaskParams
  | ParallelTaskParams
  | ConditionalTaskParams
  | LoopTaskParams
  | CustomTaskParams;

// 各种任务参数的定义
export interface WaitTaskParams {
  duration: number;              // 等待时长（秒）
}

export interface PhotoTaskParams {
  cameraId?: string;             // 相机ID
  resolution?: string;           // 分辨率 (如 "1920x1080")
  format?: 'jpg' | 'png';        // 图片格式
  savePath?: string;             // 保存路径
  count?: number;                // 拍照数量
  interval?: number;             // 连拍间隔（秒）
}

export interface TrajectoryTaskParams {
  trajectoryId: string;          // 轨迹ID
  speed?: number;                // 执行速度 (0.1-1.0)
  loop?: boolean;                // 是否循环
}

export interface ScanTaskParams {
  scanType: '3d' | '2d' | 'thermal'; // 扫描类型
  resolution?: number;            // 扫描分辨率
  range?: number;                // 扫描范围（米）
  duration?: number;             // 扫描持续时间（秒）
  savePath?: string;             // 保存路径
}

export interface InspectTaskParams {
  targetType: string;            // 目标类型 (如 "person", "object")
  detectionModel?: string;       // 检测模型名称
  confidenceThreshold?: number;  // 置信度阈值 (0-1)
  maxTargets?: number;           // 最大检测目标数
  timeout?: number;              // 超时时间（秒）
}

export interface SoundTaskParams {
  audioFile?: string;            // 音频文件路径
  text?: string;                 // 语音合成文本
  volume?: number;               // 音量 (0-100)
  language?: string;             // 语言（用于TTS）
  voice?: string;                // 语音类型
}

export interface DisplayTaskParams {
  message: string;               // 显示的消息
  duration?: number;             // 显示时长（秒）
  position?: 'top' | 'center' | 'bottom'; // 显示位置
  fontSize?: number;             // 字体大小
  color?: string;                // 文字颜色
}

export interface SignalTaskParams {
  pattern: 'blink' | 'pulse' | 'solid' | 'off'; // 信号模式
  color?: string;                // 颜色 (如 "red", "green", "blue")
  duration?: number;             // 持续时间（秒）
  frequency?: number;            // 闪烁频率（Hz）
}

export interface PickupTaskParams {
  objectId?: string;             // 物体ID
  objectType?: string;           // 物体类型
  graspType?: 'top' | 'side' | 'custom'; // 抓取方式
  force?: number;                // 抓取力度 (0-100)
}

export interface PlaceTaskParams {
  location?: { x: number; y: number; z: number }; // 放置位置
  orientation?: number;          // 放置方向（弧度）
  placeType?: 'gentle' | 'normal' | 'drop'; // 放置方式
}

export interface ChargeTaskParams {
  targetLevel?: number;          // 目标电量百分比
  chargingStationId?: string;    // 充电站ID
  timeout?: number;              // 超时时间（秒）
}

export interface SequenceTaskParams {
  tasks: TaskConfig[];           // 顺序执行的任务列表
  stopOnFailure?: boolean;       // 遇到失败是否停止
}

export interface ParallelTaskParams {
  tasks: TaskConfig[];           // 并行执行的任务列表
  waitForAll?: boolean;          // 是否等待所有任务完成
}

export interface ConditionalTaskParams {
  condition: TaskCondition;      // 条件
  ifTrue: TaskConfig[];          // 条件为真时执行的任务
  ifFalse?: TaskConfig[];        // 条件为假时执行的任务
}

export interface LoopTaskParams {
  tasks: TaskConfig[];           // 循环执行的任务
  iterations?: number;           // 循环次数（undefined表示无限循环）
  condition?: TaskCondition;     // 循环条件
}

export interface CustomTaskParams {
  serviceName: string;           // ROS服务名称
  serviceType: string;           // ROS服务类型
  request: any;                  // 服务请求参数
}
```

### 4. 任务条件 (TaskCondition)

用于条件执行和循环控制：

```typescript
export interface TaskCondition {
  type: 'battery' | 'sensor' | 'time' | 'custom';
  operator: '>' | '<' | '==' | '!=' | '>=' | '<=';
  value: any;
  topic?: string;                // ROS话题（用于sensor类型）
  field?: string;                // 字段名（用于sensor类型）
}
```

### 5. 任务状态 (TaskStatus)

跟踪任务执行状态：

```typescript
export enum TaskStatus {
  PENDING = 'pending',           // 等待执行
  RUNNING = 'running',           // 执行中
  COMPLETED = 'completed',       // 已完成
  FAILED = 'failed',             // 失败
  CANCELLED = 'cancelled',       // 已取消
  RETRYING = 'retrying',         // 重试中
}

export interface TaskExecutionState {
  taskId: string;
  status: TaskStatus;
  progress?: number;             // 进度 (0-100)
  message?: string;              // 状态消息
  error?: string;                // 错误信息
  startTime?: number;            // 开始时间（时间戳）
  endTime?: number;              // 结束时间（时间戳）
  result?: any;                  // 任务结果
}
```

## 使用示例

### 示例 1: 简单任务

到达目标点后等待5秒并拍照：

```typescript
const tasks: TaskConfig[] = [
  {
    type: TaskType.WAIT,
    params: { duration: 5 }
  },
  {
    type: TaskType.PHOTO,
    params: {
      cameraId: 'front_camera',
      resolution: '1920x1080',
      format: 'jpg'
    }
  }
];
```

### 示例 2: 条件任务

检测到人时播放语音提示：

```typescript
const task: TaskConfig = {
  type: TaskType.CONDITIONAL,
  params: {
    condition: {
      type: 'sensor',
      topic: '/person_detection',
      field: 'detected',
      operator: '==',
      value: true
    },
    ifTrue: [
      {
        type: TaskType.SOUND,
        params: {
          text: '检测到人员，正在等待',
          language: 'zh-CN'
        }
      },
      {
        type: TaskType.WAIT,
        params: { duration: 10 }
      }
    ]
  }
};
```

### 示例 3: 循环任务

每隔10秒拍照一次，共拍3次：

```typescript
const task: TaskConfig = {
  type: TaskType.LOOP,
  params: {
    iterations: 3,
    tasks: [
      {
        type: TaskType.PHOTO,
        params: {
          cameraId: 'front_camera',
          format: 'jpg'
        }
      },
      {
        type: TaskType.WAIT,
        params: { duration: 10 }
      }
    ]
  }
};
```

### 示例 4: 并行任务

同时拍照和环境扫描：

```typescript
const task: TaskConfig = {
  type: TaskType.PARALLEL,
  params: {
    waitForAll: true,
    tasks: [
      {
        type: TaskType.PHOTO,
        params: { cameraId: 'front_camera' }
      },
      {
        type: TaskType.SCAN,
        params: {
          scanType: '3d',
          duration: 5
        }
      }
    ]
  }
};
```

### 示例 5: 带重试的任务

拾取物体，失败时最多重试3次：

```typescript
const task: TaskConfig = {
  type: TaskType.PICKUP,
  params: {
    objectType: 'box',
    graspType: 'top'
  },
  retryOnFailure: true,
  maxRetries: 3,
  timeout: 30,
  onFailure: [
    {
      type: TaskType.SOUND,
      params: {
        text: '拾取失败，请检查物体位置',
        language: 'zh-CN'
      }
    }
  ],
  onSuccess: [
    {
      type: TaskType.SIGNAL,
      params: {
        pattern: 'blink',
        color: 'green',
        duration: 3
      }
    }
  ]
};
```

### 示例 6: 复杂任务链

到达目标点后的完整工作流：

```typescript
const tasks: TaskConfig[] = [
  // 1. 到达后等待稳定
  {
    id: 'wait-stabilize',
    type: TaskType.WAIT,
    name: '等待稳定',
    params: { duration: 2 }
  },

  // 2. 播放到达提示音
  {
    id: 'arrival-sound',
    type: TaskType.SOUND,
    name: '到达提示',
    params: {
      text: '已到达目标位置，开始执行任务',
      language: 'zh-CN'
    }
  },

  // 3. 环境检测
  {
    id: 'environment-check',
    type: TaskType.INSPECT,
    name: '环境检测',
    params: {
      targetType: 'obstacle',
      confidenceThreshold: 0.7,
      timeout: 10
    },
    onFailure: [
      {
        type: TaskType.SOUND,
        params: {
          text: '环境检测失败',
          language: 'zh-CN'
        }
      }
    ]
  },

  // 4. 并行执行拍照和扫描
  {
    id: 'parallel-sensing',
    type: TaskType.PARALLEL,
    name: '感知数据采集',
    params: {
      waitForAll: true,
      tasks: [
        {
          type: TaskType.PHOTO,
          params: {
            cameraId: 'front_camera',
            count: 3,
            interval: 1
          }
        },
        {
          type: TaskType.SCAN,
          params: {
            scanType: '3d',
            duration: 5
          }
        }
      ]
    }
  },

  // 5. 条件执行：电量低时提示
  {
    id: 'battery-check',
    type: TaskType.CONDITIONAL,
    name: '电量检查',
    params: {
      condition: {
        type: 'battery',
        operator: '<',
        value: 20
      },
      ifTrue: [
        {
          type: TaskType.SOUND,
          params: {
            text: '电量低于20%，建议尽快充电',
            language: 'zh-CN'
          }
        },
        {
          type: TaskType.SIGNAL,
          params: {
            pattern: 'blink',
            color: 'red',
            duration: 5,
            frequency: 2
          }
        }
      ]
    }
  },

  // 6. 完成提示
  {
    id: 'completion-signal',
    type: TaskType.SIGNAL,
    name: '完成提示',
    params: {
      pattern: 'pulse',
      color: 'green',
      duration: 3
    }
  }
];
```

## ROS 集成

### Action 定义

在 ROS 端定义任务执行的 Action：

```
# TaskExecution.action

# Goal
TaskConfig task

---
# Result
bool success
string message
string error
any result_data

---
# Feedback
float32 progress
string current_step
string status_message
```

### 服务调用

前端通过 ROS Action 发送任务：

```typescript
// 在 ros.ts 中添加任务执行方法
async executeTask(task: TaskConfig): Promise<void> {
  if (!this.ros || !this.connected) {
    throw new Error('ROS not connected');
  }

  const actionClient = new ROSLIB.ActionClient({
    ros: this.ros,
    serverName: '/task_executor',
    actionName: 'astribot_msgs/TaskExecution'
  });

  const goal = new ROSLIB.Goal({
    actionClient: actionClient,
    goalMessage: {
      task: this.convertTaskToROS(task)
    }
  });

  goal.on('feedback', (feedback) => {
    this.emit('task-feedback', {
      taskId: task.id,
      progress: feedback.progress,
      currentStep: feedback.current_step,
      message: feedback.status_message
    });
  });

  goal.on('result', (result) => {
    this.emit('task-result', {
      taskId: task.id,
      success: result.success,
      message: result.message,
      error: result.error,
      result: result.result_data
    });
  });

  goal.send();
}
```

## UI 集成

### 任务配置面板

创建可视化的任务配置界面：

```typescript
// TaskConfigPanel.tsx
export const TaskConfigPanel: React.FC = () => {
  const [tasks, setTasks] = useState<TaskConfig[]>([]);

  const addTask = (type: TaskType) => {
    const newTask: TaskConfig = {
      id: generateId(),
      type,
      params: getDefaultParams(type)
    };
    setTasks([...tasks, newTask]);
  };

  return (
    <Card title="附加任务配置">
      <TaskTypeSelector onSelect={addTask} />
      <TaskList tasks={tasks} onChange={setTasks} />
      <TaskPreview tasks={tasks} />
    </Card>
  );
};
```

### 任务执行监控

实时显示任务执行状态：

```typescript
// TaskMonitor.tsx
export const TaskMonitor: React.FC<{ tasks: TaskExecutionState[] }> = ({ tasks }) => {
  return (
    <Card title="任务执行状态">
      {tasks.map(task => (
        <TaskStatusCard
          key={task.taskId}
          task={task}
        />
      ))}
    </Card>
  );
};
```

## 扩展指南

### 添加新的任务类型

1. **在 TaskType 枚举中添加新类型**：
```typescript
export enum TaskType {
  // ... 现有类型
  NEW_TASK = 'new_task',
}
```

2. **定义任务参数接口**：
```typescript
export interface NewTaskParams {
  param1: string;
  param2: number;
}
```

3. **添加到 TaskParams 联合类型**：
```typescript
export type TaskParams =
  | WaitTaskParams
  | PhotoTaskParams
  // ... 现有类型
  | NewTaskParams;
```

4. **在 UI 中添加配置组件**：
```typescript
const NewTaskConfigForm: React.FC<{ onChange: (params: NewTaskParams) => void }> = ({ onChange }) => {
  // 表单组件
};
```

5. **在 ROS 端实现任务执行器**：
```python
class NewTaskExecutor:
    def execute(self, params):
        # 执行任务逻辑
        pass
```

## 最佳实践

1. **任务粒度**: 保持任务单一职责，复杂功能通过组合实现
2. **错误处理**: 为每个任务设置合理的超时和重试策略
3. **状态反馈**: 及时反馈任务执行进度和状态
4. **参数验证**: 在发送任务前验证参数的有效性
5. **资源管理**: 注意任务之间的资源依赖和冲突
6. **日志记录**: 记录任务执行的详细日志便于调试
7. **测试**: 为每种任务类型编写单元测试和集成测试

## 性能考虑

1. **并行优化**: 充分利用并行任务提高效率
2. **资源限制**: 控制同时执行的任务数量
3. **超时保护**: 防止任务无限期挂起
4. **内存管理**: 及时清理已完成任务的状态
5. **网络优化**: 批量发送多个小任务减少通信开销

## 安全性

1. **权限控制**: 某些敏感任务需要权限验证
2. **参数校验**: 防止恶意参数注入
3. **资源限制**: 限制任务可访问的系统资源
4. **审计日志**: 记录所有任务执行的审计信息

## 未来展望

1. **可视化编排**: 提供拖拽式任务流程编辑器
2. **模板库**: 预定义常用任务组合模板
3. **AI 辅助**: 根据场景自动推荐任务配置
4. **云端同步**: 任务配置云端存储和同步
5. **任务市场**: 分享和下载第三方任务插件
