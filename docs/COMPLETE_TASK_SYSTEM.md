# 完整任务系统实现文档

## 概述

本文档描述了基于TASK_SYSTEM.md架构的完整任务系统实现，包括UI组件、后端执行逻辑和使用说明。

## 已实现的功能

### 1. UI组件

#### TaskConfigPanel (任务配置面板)

**位置**: `src/components/common/TaskConfigPanel.tsx`

**功能**:
- 支持8种任务类型的可视化配置
- 任务分类展示（基础、感知、交互）
- 可视化任务编辑器，支持参数配置
- 任务列表管理（添加、删除、编辑）
- 任务验证和错误提示

**支持的任务类型**:

| 类别 | 任务类型 | 配置参数 |
|------|---------|---------|
| 基础任务 | WAIT（等待停留） | 等待时长（1-600秒） |
| | PHOTO（拍照） | 相机ID、分辨率、拍照数量、拍照间隔 |
| | TRAJECTORY（执行轨迹） | 轨迹ID |
| 感知任务 | SCAN（环境扫描） | 扫描类型（3D/2D/热成像）、扫描时长 |
| | INSPECT（目标检测） | 目标类型、置信度阈值 |
| 交互任务 | SOUND（播放声音） | TTS文本、音量、语言 |
| | DISPLAY（显示信息） | 显示消息、显示时长 |
| | SIGNAL（信号灯） | 信号模式、颜色、持续时间 |

**使用方法**:
```tsx
import { TaskConfigPanel } from '@/components/common/TaskConfigPanel';

const [tasks, setTasks] = useState<TaskConfig[]>([]);

<TaskConfigPanel value={tasks} onChange={setTasks} />
```

#### TaskMonitor (任务监控组件)

**位置**: `src/components/common/TaskMonitor.tsx`

**功能**:
- 实时显示任务执行状态
- 进度条和时间线展示
- 错误信息和执行结果显示
- 支持紧凑模式和详细模式

**使用方法**:
```tsx
import { TaskMonitor } from '@/components/common/TaskMonitor';

<TaskMonitor tasks={taskExecutionStates} compact={false} />
```

### 2. NavigationControl更新

**修改内容**:
- 移除了简单的checkbox任务选择
- 集成了完整的TaskConfigPanel组件
- 任务配置直接传递给导航目标

**使用流程**:
1. 在"附加任务"卡片中配置任务
2. 点击"添加任务"选择任务类型
3. 编辑任务参数
4. 设置目标点后开始导航
5. 机器人到达目标点后自动执行配置的任务

### 3. 后端执行逻辑

**位置**: `mock_rosbridge.py` - `execute_tasks()` 函数

**已实现的任务执行器**:

#### 基础任务
- **WAIT**: 等待指定时长
- **PHOTO**: 拍照（支持连拍、间隔设置）
- **TRAJECTORY**: 执行预设轨迹

#### 感知任务
- **SCAN**: 环境扫描（3D/2D/热成像）
  - 显示扫描范围和时长
  - 模拟扫描数据保存

- **INSPECT**: 目标检测
  - 模拟检测成功率（70%）
  - 显示检测结果

#### 交互任务
- **SOUND**: 播放声音/语音
  - 支持TTS文本转语音
  - 支持音频文件播放
  - 音量和语言设置

- **DISPLAY**: 显示信息
  - 在屏幕上显示消息
  - 可配置位置和时长

- **SIGNAL**: 信号灯控制
  - 支持闪烁、脉冲、常亮模式
  - 颜色和频率可配置

#### 操作任务（额外实现）
- **PICKUP**: 拾取物体
  - 模拟抓取成功率（80%）
  - 支持不同抓取方式

- **PLACE**: 放置物体
  - 指定放置位置和方式

- **CHARGE**: 充电
  - 模拟充电过程和进度

#### 复合任务
- **SEQUENCE**: 顺序执行子任务
- **PARALLEL**: 并行执行子任务（简化为顺序执行）

## 使用指南

### 快速开始

1. **启动模拟服务器**
   ```bash
   python main.py  # 后端；另开终端: cd ui && npm run dev
   ```

2. **打开浏览器**
   访问 http://localhost:4173

3. **配置任务并导航**
   - 进入导航界面
   - 在"附加任务"卡片中点击"添加任务"
   - 选择任务类型（如"拍照"）
   - 配置任务参数
   - 设置目标点并开始导航

### 配置示例

#### 示例1: 到达后拍照
```typescript
// 任务配置
{
  type: TaskType.PHOTO,
  name: "到达后拍照",
  params: {
    cameraId: "front_camera",
    resolution: "1920x1080",
    count: 3,
    interval: 1
  },
  timeout: 30
}
```

**操作步骤**:
1. 点击"添加任务" → "基础任务" → "拍照"
2. 设置分辨率为 1920x1080
3. 设置拍照数量为 3
4. 设置间隔为 1 秒
5. 保存任务
6. 开始导航

**后端输出**:
```
执行任务 1/1: 到达后拍照 (photo)
  使用相机 front_camera 拍摄 3 张照片...
    拍照 1/3
    拍照 2/3
    拍照 3/3
  拍照完成
```

#### 示例2: 环境检测任务链
```typescript
[
  // 1. 等待稳定
  {
    type: TaskType.WAIT,
    name: "等待稳定",
    params: { duration: 2 }
  },
  // 2. 环境扫描
  {
    type: TaskType.SCAN,
    name: "3D扫描",
    params: {
      scanType: "3d",
      duration: 5
    }
  },
  // 3. 目标检测
  {
    type: TaskType.INSPECT,
    name: "检测人员",
    params: {
      targetType: "person",
      confidenceThreshold: 0.7
    }
  },
  // 4. 语音提示
  {
    type: TaskType.SOUND,
    name: "语音提示",
    params: {
      text: "环境检测完成",
      language: "zh-CN",
      volume: 80
    }
  }
]
```

**操作步骤**:
1. 添加"等待"任务，设置2秒
2. 添加"环境扫描"任务，选择3D扫描，5秒
3. 添加"目标检测"任务，目标类型"person"
4. 添加"播放声音"任务，输入TTS文本
5. 开始导航

**后端输出**:
```
开始执行 4 个附加任务...

执行任务 1/4: 等待稳定 (wait)
  等待 2 秒...
  等待完成

执行任务 2/4: 3D扫描 (scan)
  执行 3d 扫描 (范围: 5.0m, 时长: 5s)...
  扫描完成，已保存扫描数据

执行任务 3/4: 检测人员 (inspect)
  开始检测目标: person (置信度阈值: 0.7)...
  检测成功: 发现 person

执行任务 4/4: 语音提示 (sound)
  播放声音 (音量: 80%):
    TTS文本: 环境检测完成 (语言: zh-CN)
  声音播放完成

所有任务执行完成！
```

#### 示例3: 信号灯提示
```typescript
{
  type: TaskType.SIGNAL,
  name: "绿灯闪烁",
  params: {
    pattern: "blink",
    color: "green",
    duration: 5,
    frequency: 2
  }
}
```

**后端输出**:
```
执行任务 1/1: 绿灯闪烁 (signal)
  信号灯: green blink (频率: 2Hz)
  信号灯关闭
```

## 扩展任务类型

### 添加新任务类型的步骤

#### 1. 在类型定义中添加
编辑 `src/types/task.ts`:
```typescript
export enum TaskType {
  // ... 现有类型
  NEW_TASK = 'new_task',
}

export interface NewTaskParams {
  param1: string;
  param2: number;
}

export type TaskParams =
  | WaitTaskParams
  | PhotoTaskParams
  // ...
  | NewTaskParams;
```

#### 2. 在TaskConfigPanel中添加UI
编辑 `src/components/common/TaskConfigPanel.tsx`:

```typescript
// 在taskCategories中添加
custom: {
  label: '自定义任务',
  tasks: [
    { type: TaskType.NEW_TASK, label: '新任务', icon: '🆕' },
  ],
}

// 在renderTaskParamsEditor中添加配置表单
case TaskType.NEW_TASK:
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      <div>
        <div style={{ fontSize: 11, marginBottom: 4 }}>参数1</div>
        <Input
          size="small"
          value={params.param1}
          onChange={(e) => updateParams({ param1: e.target.value })}
        />
      </div>
      <div>
        <div style={{ fontSize: 11, marginBottom: 4 }}>参数2</div>
        <InputNumber
          size="small"
          style={{ width: '100%' }}
          value={params.param2}
          onChange={(value) => updateParams({ param2: value || 0 })}
        />
      </div>
    </Space>
  );

// 在renderTaskSummary中添加显示
case TaskType.NEW_TASK:
  return `新任务: ${params.param1} (${params.param2})`;

// 在getTaskTypeName中添加名称
[TaskType.NEW_TASK]: '新任务',

// 在getDefaultParams中添加默认值
case TaskType.NEW_TASK:
  return { param1: '', param2: 0 };
```

#### 3. 在后端实现执行逻辑
编辑 `mock_rosbridge.py`:

```python
elif task_type == "new_task":
    # 新任务执行逻辑
    param1 = task_params.get("param1", "")
    param2 = task_params.get("param2", 0)
    print(f"  执行新任务: {param1}, {param2}")
    await asyncio.sleep(2)
    print(f"  新任务完成")
```

## 调试技巧

### 1. 查看任务发送日志
打开浏览器控制台，发送导航目标时会看到：
```
[ROS] Sending navigation goal with tasks: [...]
```

### 2. 查看后端执行日志
观察终端输出，可以看到详细的任务执行过程：
```
收到 2 个附加任务:
  任务 1: wait - {'duration': 5}
  任务 2: photo - {}
开始执行 2 个附加任务...
...
```

### 3. 任务验证
系统会自动验证任务配置的有效性：
```typescript
const validation = validateTaskConfig(task);
if (!validation.valid) {
  console.error('任务配置错误:', validation.errors);
}
```

## 性能优化建议

1. **任务数量限制**: 建议每次导航配置不超过10个任务
2. **超时设置**: 为每个任务设置合理的超时时间
3. **复合任务**: 使用SEQUENCE和PARALLEL组合多个小任务
4. **错误处理**: 在真实ROS实现中添加重试机制

## 与真实ROS集成

### Action定义
在ROS端需要实现 `TaskExecution.action`:
```
# Goal
string task_type
string task_params_json

---
# Result
bool success
string message
string result_data

---
# Feedback
float32 progress
string current_step
string status_message
```

### 服务端实现
```python
class TaskExecutionServer:
    def __init__(self):
        self.action_server = actionlib.SimpleActionServer(
            '/task_executor',
            TaskExecutionAction,
            execute_cb=self.execute_cb,
            auto_start=False
        )
        self.action_server.start()

    def execute_cb(self, goal):
        task = json.loads(goal.task_params_json)
        task_type = goal.task_type

        # 执行任务
        result = self.execute_task(task_type, task)

        # 返回结果
        self.action_server.set_succeeded(result)
```

## 已知限制

1. **模拟服务器**: 不支持真实的硬件控制
2. **并行任务**: 当前简化为顺序执行
3. **条件任务**: UI暂未实现，仅后端支持
4. **循环任务**: UI暂未实现，仅后端支持
5. **自定义任务**: 需要手动配置ROS服务

## 未来改进

1. **可视化任务流编辑器**: 拖拽式任务流程设计
2. **任务模板库**: 预定义常用任务组合
3. **实时任务监控**: 在导航界面显示任务执行进度
4. **任务历史记录**: 保存和回放任务执行记录
5. **条件和循环UI**: 实现复杂任务流程配置

## 相关文档

- [TASK_SYSTEM.md](./TASK_SYSTEM.md) - 任务系统架构设计
- [TASK_USAGE_GUIDE.md](./TASK_USAGE_GUIDE.md) - 原始使用指南
- [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md) - 导航事件处理
- [src/types/task.ts](./src/types/task.ts) - 任务类型定义

## 常见问题

**Q: 任务没有执行？**
A: 检查：
1. 浏览器控制台是否有错误
2. 任务配置是否有效（使用validateTaskConfig）
3. 后端服务器是否正常运行
4. 导航是否成功到达目标点

**Q: 如何调试任务参数？**
A: 在TaskConfigPanel中添加console.log，或在后端execute_tasks函数中打印task_params

**Q: 可以在导航过程中修改任务吗？**
A: 不可以，任务在导航开始时确定，到达目标点后执行

**Q: 任务执行失败会影响导航结果吗？**
A: 会的，任务失败会导致整个导航结果为失败状态（根据NAVIGATION_EVENTS.md的双重检查机制）

## 总结

本次实现完成了：

✅ 完整的任务配置UI（TaskConfigPanel）
✅ 任务监控组件（TaskMonitor）
✅ 8种基础任务类型的配置界面
✅ NavigationControl集成新组件
✅ 后端支持11种任务类型执行
✅ 任务验证和错误处理
✅ 详细的使用文档和示例

系统现在支持灵活的任务配置和扩展，为机器人导航提供了丰富的附加功能。
