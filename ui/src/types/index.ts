// 任务系统类型 - 从专用模块导入并重新导出
import type {
  TaskConfig as TaskConfigType,
  TaskParams,
  WaitTaskParams,
  PhotoTaskParams,
  TrajectoryTaskParams,
  ScanTaskParams,
  InspectTaskParams,
  SoundTaskParams,
  DisplayTaskParams,
  SignalTaskParams,
  PickupTaskParams,
  PlaceTaskParams,
  ChargeTaskParams,
  SequenceTaskParams,
  ParallelTaskParams,
  ConditionalTaskParams,
  LoopTaskParams,
  CustomTaskParams,
  TaskCondition,
  TaskExecutionState,
  TaskTemplate,
  TaskExecutionResult,
  TaskFeedback,
} from './task';

import {
  TaskType,
  TaskStatus,
  createWaitTask,
  createPhotoTask,
  createSequenceTask,
  createParallelTask,
  isWaitTask,
  isPhotoTask,
  isTrajectoryTask,
  isSequenceTask,
  isParallelTask,
  validateTaskConfig,
} from './task';

// 重新导出任务类型
export type TaskConfig = TaskConfigType;
export type {
  TaskParams,
  WaitTaskParams,
  PhotoTaskParams,
  TrajectoryTaskParams,
  ScanTaskParams,
  InspectTaskParams,
  SoundTaskParams,
  DisplayTaskParams,
  SignalTaskParams,
  PickupTaskParams,
  PlaceTaskParams,
  ChargeTaskParams,
  SequenceTaskParams,
  ParallelTaskParams,
  ConditionalTaskParams,
  LoopTaskParams,
  CustomTaskParams,
  TaskCondition,
  TaskExecutionState,
  TaskTemplate,
  TaskExecutionResult,
  TaskFeedback,
};

export {
  TaskType,
  TaskStatus,
  createWaitTask,
  createPhotoTask,
  createSequenceTask,
  createParallelTask,
  isWaitTask,
  isPhotoTask,
  isTrajectoryTask,
  isSequenceTask,
  isParallelTask,
  validateTaskConfig,
};

// 地图数据类型
export interface MapData {
  id: string;
  name: string;
  createdAt: string;
  thumbnail: string; // base64编码的缩略图
  width: number;
  height: number;
  resolution: number; // 米/像素
  origin: {
    x: number;
    y: number;
    orientation: number;
  };
  data: number[]; // 占据栅格数据: -1=未知, 0=空闲, 100=占据
  localOnly?: boolean; // 仅存在于本地缓存，未同步到ROS
}

// 位置和姿态
export interface Pose {
  x: number;
  y: number;
  theta: number; // 朝向角度（弧度）
}

// 导航路径点（支持独立配置）
export interface Waypoint {
  pose: Pose; // 位姿
  tasks?: TaskConfig[]; // 到达该点后执行的任务
  navigationMode?: 'obstacle_avoidance' | 'local_navigation'; // 导航模式
  actionConfig?: NavigationActionConfig; // 导航参数配置
}

// 路径点
export interface PathPoint {
  x: number;
  y: number;
}

// 导航目标
export interface NavigationGoal {
  pose: Pose;
  tasks: TaskConfig[];
  actionConfig?: NavigationActionConfig; // Action配置
}

// 导航 Action 配置
export interface NavigationActionConfig {
  use_default_config: boolean; // 是否使用默认配置
  safe_dist?: number; // 底层避障的最小安全距离 (m)
  v_max?: number; // 最大速度 (m/s)
  w_max?: number; // 最大角速度 (rad/s)
  a_max?: number; // 最大加速度 (m/s²)
  dw_max?: number; // 最大转向加速度 (rad/s²)
  is_holonomic?: boolean; // 是否为全向运动 (true=全向, false=差速)
  deaccelaration_dist?: number; // 减速策略距离 (m)
  deaccelaration_ratio?: number; // 减速策略系数
}

// 机器人状态
export enum RobotShapeType {
  CIRCLE = 'circle',       // 圆形
  POLYGON = 'polygon'      // 多边形
}

// 机器人碰撞形状配置
export interface RobotShapeConfig {
  type: RobotShapeType;
  // 圆形参数
  radius?: number;         // 半径 (m)
  // 多边形参数 (相对于机器人中心的顶点坐标)
  vertices?: { x: number; y: number }[];
}

// 机器人状态
export enum RobotStatus {
  IDLE = 'idle',
  MAPPING = 'mapping',
  NAVIGATING = 'navigating',
  EXECUTING_TASK = 'executing_task',
  ERROR = 'error',
}

// ROS连接状态
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

// 导航状态
export interface NavigationState {
  status: RobotStatus;
  currentPose?: Pose;
  goalPose?: Pose;
  path?: PathPoint[];
  progress?: number; // 0-100
  errorMessage?: string;
}

// 建图状态
export interface MappingState {
  isMapping: boolean;
  mapData?: Partial<MapData>;
}

// 雷达扫描数据
export interface LaserScan {
  angle_min: number; // 最小角度（弧度）
  angle_max: number; // 最大角度（弧度）
  angle_increment: number; // 角度增量（弧度）
  time_increment: number; // 测量时间增量（秒）
  scan_time: number; // 扫描周期（秒）
  range_min: number; // 最小距离（米）
  range_max: number; // 最大距离（米）
  ranges: number[]; // 距离数组（米），NaN/Inf表示无效
  intensities?: number[]; // 强度数组（可选）
}

// 房间点位配置
export interface RoomConfig {
  room_id: string;
  room_name: string;
  door_outside: Pose | null;
  door_inside: Pose | null;
  bed_check: Pose | null;
  door_type: string;
  enabled: boolean;
}

export interface RoomPatrolConfig {
  start_position: Pose | null;
  rooms: RoomConfig[];
  retry_limit: number;
  detection_types: string[];
  updated_at?: string;
}

// 巡房任务步骤
export interface RoomTaskStep {
  type: string;  // 内置类型 或 'custom:xxx'
  target?: string;
  label?: string;
  duration?: number;
  params?: Record<string, any>;  // 自定义步骤参数
}

// 自定义步骤参数定义
export interface CustomStepParamDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default_value?: any;
  required?: boolean;
  options?: { value: string; label: string }[];
}

// Meta 轮询配置（用于 replay 等异步操作）
export interface CustomStepMetaPoll {
  method: string;
  done_key: string;
  done_value: boolean | number | string;
  result_key?: string;
  interval?: number;
  timeout?: number;
}

// 自定义步骤动作配置
export interface CustomStepAction {
  type: 'service' | 'topic' | 'wait' | 'meta';
  service_name?: string;
  service_type?: string;
  request?: Record<string, any>;
  topic_name?: string;
  msg_type?: string;
  message?: Record<string, any>;
  duration?: number;
  meta_service?: string;
  meta_method?: string;
  meta_kwargs?: Record<string, any>;
  meta_poll?: CustomStepMetaPoll;
}

// 自定义步骤类型定义
export interface CustomStepDefinition {
  id: string;
  name: string;
  description: string;
  icon_color?: string;
  action: CustomStepAction;
  parameters: CustomStepParamDef[];
  timeout?: number;
  created_at?: string;
}

// 单房间任务配置
export interface RoomTaskConfig {
  room_id: string;
  room_name: string;
  enabled: boolean;
  steps: RoomTaskStep[];
}

// 巡房任务编排配置
export interface PatrolTaskConfig {
  rooms: RoomTaskConfig[];
  retry_limit: number;
  updated_at?: string;
}

// 任务预设
export interface TaskPreset {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  rooms: RoomTaskConfig[];
  retry_limit: number;
  fall_detection_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

// 告警
export interface Alert {
  id: string;
  patrol_id: string;
  room_id: string;
  alert_type: string;
  status: 'new' | 'processing' | 'closed';
  message: string;
  confidence: number;
  photo: string | null;
  created_at: string;
  confirmed_at: string | null;
  closed_at: string | null;
}

// 巡房记录
export interface PatrolRecord {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  rooms_total: number;
  rooms_completed: number;
  rooms_failed: number;
  room_results: any[];
}

// 巡房实时状态 (SSE)
export interface RoomPatrolState {
  active: boolean;
  status: string;
  patrol_id: string;
  task_name?: string;
  current_room: string;
  current_step: string;
  current_step_index: number;
  rooms_completed: string[];
  rooms_failed: string[];
  rooms_total: number;
  progress: number;
  error: string;
  rooms?: Array<{ room_id: string; room_name: string; steps: any[] }>;
  fall_event?: {
    timestamp: number;
    location: string;
    confidence: number;
    photo?: string | null;
  } | null;
  stuck_event?: {
    timestamp: number;
    room_id: string;
  } | null;
  new_alerts?: Alert[];
}
