/**
 * 可扩展的任务系统类型定义
 * 支持在到达目标点后执行各种附加任务
 */

// ==================== 任务类型 ====================

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

// ==================== 任务参数 ====================

// 等待任务参数
export interface WaitTaskParams {
  duration: number;              // 等待时长（秒）
}

// 拍照任务参数
export interface PhotoTaskParams {
  cameraId?: string;             // 相机ID
  resolution?: string;           // 分辨率 (如 "1920x1080")
  format?: 'jpg' | 'png';        // 图片格式
  savePath?: string;             // 保存路径
  count?: number;                // 拍照数量
  interval?: number;             // 连拍间隔（秒）
}

// 轨迹任务参数
export interface TrajectoryTaskParams {
  trajectoryId: string;          // 轨迹ID
  speed?: number;                // 执行速度 (0.1-1.0)
  loop?: boolean;                // 是否循环
}

// 扫描任务参数
export interface ScanTaskParams {
  scanType: '3d' | '2d' | 'thermal'; // 扫描类型
  resolution?: number;            // 扫描分辨率
  range?: number;                // 扫描范围（米）
  duration?: number;             // 扫描持续时间（秒）
  savePath?: string;             // 保存路径
}

// 检测任务参数
export interface InspectTaskParams {
  targetType: string;            // 目标类型 (如 "person", "object")
  detectionModel?: string;       // 检测模型名称
  confidenceThreshold?: number;  // 置信度阈值 (0-1)
  maxTargets?: number;           // 最大检测目标数
  timeout?: number;              // 超时时间（秒）
}

// 声音任务参数
export interface SoundTaskParams {
  audioFile?: string;            // 音频文件路径
  text?: string;                 // 语音合成文本
  volume?: number;               // 音量 (0-100)
  language?: string;             // 语言（用于TTS）
  voice?: string;                // 语音类型
}

// 显示任务参数
export interface DisplayTaskParams {
  message: string;               // 显示的消息
  duration?: number;             // 显示时长（秒）
  position?: 'top' | 'center' | 'bottom'; // 显示位置
  fontSize?: number;             // 字体大小
  color?: string;                // 文字颜色
}

// 信号灯任务参数
export interface SignalTaskParams {
  pattern: 'blink' | 'pulse' | 'solid' | 'off'; // 信号模式
  color?: string;                // 颜色 (如 "red", "green", "blue")
  duration?: number;             // 持续时间（秒）
  frequency?: number;            // 闪烁频率（Hz）
}

// 拾取任务参数
export interface PickupTaskParams {
  objectId?: string;             // 物体ID
  objectType?: string;           // 物体类型
  graspType?: 'top' | 'side' | 'custom'; // 抓取方式
  force?: number;                // 抓取力度 (0-100)
}

// 放置任务参数
export interface PlaceTaskParams {
  location?: { x: number; y: number; z: number }; // 放置位置
  orientation?: number;          // 放置方向（弧度）
  placeType?: 'gentle' | 'normal' | 'drop'; // 放置方式
}

// 充电任务参数
export interface ChargeTaskParams {
  targetLevel?: number;          // 目标电量百分比
  chargingStationId?: string;    // 充电站ID
  timeout?: number;              // 超时时间（秒）
}

// 顺序任务参数
export interface SequenceTaskParams {
  tasks: TaskConfig[];           // 顺序执行的任务列表
  stopOnFailure?: boolean;       // 遇到失败是否停止
}

// 并行任务参数
export interface ParallelTaskParams {
  tasks: TaskConfig[];           // 并行执行的任务列表
  waitForAll?: boolean;          // 是否等待所有任务完成
}

// 条件任务参数
export interface ConditionalTaskParams {
  condition: TaskCondition;      // 条件
  ifTrue: TaskConfig[];          // 条件为真时执行的任务
  ifFalse?: TaskConfig[];        // 条件为假时执行的任务
}

// 循环任务参数
export interface LoopTaskParams {
  tasks: TaskConfig[];           // 循环执行的任务
  iterations?: number;           // 循环次数（undefined表示无限循环）
  condition?: TaskCondition;     // 循环条件
}

// 自定义任务参数
export interface CustomTaskParams {
  serviceName: string;           // ROS服务名称
  serviceType: string;           // ROS服务类型
  request: any;                  // 服务请求参数
}

// 任务参数联合类型
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

// ==================== 任务条件 ====================

export interface TaskCondition {
  type: 'battery' | 'sensor' | 'time' | 'custom';
  operator: '>' | '<' | '==' | '!=' | '>=' | '<=';
  value: any;
  topic?: string;                // ROS话题（用于sensor类型）
  field?: string;                // 字段名（用于sensor类型）
}

// ==================== 任务配置 ====================

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

// ==================== 任务状态 ====================

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

// ==================== 任务模板 ====================

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  category: 'inspection' | 'delivery' | 'cleaning' | 'security' | 'custom';
  tasks: TaskConfig[];
  thumbnail?: string;
  author?: string;
  version?: string;
  tags?: string[];
}

// ==================== 辅助类型 ====================

// 任务执行结果
export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  message?: string;
  error?: string;
  data?: any;
  duration?: number;             // 执行时长（毫秒）
}

// 任务反馈
export interface TaskFeedback {
  taskId: string;
  progress: number;
  currentStep?: string;
  message?: string;
  estimatedTimeRemaining?: number; // 预计剩余时间（秒）
}

// ==================== 工厂函数 ====================

/**
 * 创建一个简单的等待任务
 */
export function createWaitTask(duration: number, name?: string): TaskConfig {
  return {
    id: generateTaskId(),
    type: TaskType.WAIT,
    name: name || `等待 ${duration} 秒`,
    params: { duration }
  };
}

/**
 * 创建一个拍照任务
 */
export function createPhotoTask(params?: Partial<PhotoTaskParams>, name?: string): TaskConfig {
  return {
    id: generateTaskId(),
    type: TaskType.PHOTO,
    name: name || '拍照',
    params: {
      cameraId: 'default',
      resolution: '1920x1080',
      format: 'jpg',
      count: 1,
      ...params
    }
  };
}

/**
 * 创建一个顺序任务
 */
export function createSequenceTask(tasks: TaskConfig[], name?: string): TaskConfig {
  return {
    id: generateTaskId(),
    type: TaskType.SEQUENCE,
    name: name || '顺序任务',
    params: {
      tasks,
      stopOnFailure: true
    }
  };
}

/**
 * 创建一个并行任务
 */
export function createParallelTask(tasks: TaskConfig[], name?: string): TaskConfig {
  return {
    id: generateTaskId(),
    type: TaskType.PARALLEL,
    name: name || '并行任务',
    params: {
      tasks,
      waitForAll: true
    }
  };
}

/**
 * 生成任务ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ==================== 类型守卫 ====================

export function isWaitTask(params: any): params is WaitTaskParams {
  return params && typeof params.duration === 'number';
}

export function isPhotoTask(params: any): params is PhotoTaskParams {
  return params && (params.cameraId !== undefined || params.count !== undefined);
}

export function isTrajectoryTask(params: any): params is TrajectoryTaskParams {
  return params && typeof params.trajectoryId === 'string';
}

export function isSequenceTask(params: any): params is SequenceTaskParams {
  return params && Array.isArray(params.tasks);
}

export function isParallelTask(params: any): params is ParallelTaskParams {
  return params && Array.isArray(params.tasks);
}

// ==================== 验证函数 ====================

/**
 * 验证任务配置的有效性
 */
export function validateTaskConfig(task: TaskConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!task.type) {
    errors.push('任务类型不能为空');
  }

  if (!task.params) {
    errors.push('任务参数不能为空');
  }

  // 根据任务类型验证参数
  switch (task.type) {
    case TaskType.WAIT:
      if (!isWaitTask(task.params)) {
        errors.push('等待任务缺少 duration 参数');
      } else if (task.params.duration <= 0) {
        errors.push('等待时长必须大于0');
      }
      break;

    case TaskType.TRAJECTORY:
      if (!isTrajectoryTask(task.params)) {
        errors.push('轨迹任务缺少 trajectoryId 参数');
      }
      break;

    case TaskType.SEQUENCE:
    case TaskType.PARALLEL:
      if (!isSequenceTask(task.params) && !isParallelTask(task.params)) {
        errors.push('复合任务缺少 tasks 参数');
      } else if (task.params.tasks.length === 0) {
        errors.push('复合任务至少需要一个子任务');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
