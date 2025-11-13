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
}

// 位置和姿态
export interface Pose {
  x: number;
  y: number;
  theta: number; // 朝向角度（弧度）
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
