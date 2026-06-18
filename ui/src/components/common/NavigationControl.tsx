import React, { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Separator,
  Switch,
  cn,
} from '@astribot/ui';
import {
  ChevronDown,
  Crosshair,
  Flag,
  Loader2,
  MapPinned,
  Play,
  Settings2,
  Square,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { apiService } from '@/services/api';
import { ConnectionStatus } from '@/types';
import type { NavigationActionConfig, NavigationGoal, Pose, TaskConfig } from '@/types';

enum OperationMode {
  SET_GOAL = 'set_goal',
}

enum NavigationMode {
  OBSTACLE_AVOIDANCE = 'obstacle_avoidance',
  LOCAL_NAVIGATION = 'local_navigation',
}

export { OperationMode };

interface NavigationControlProps {
  robotPose: Pose | null;
  goalPose?: Pose;
  isNavigating: boolean;
  onNavigationStart: () => void;
  onNavigationStop: () => void;
  onStopWaypointNavigation?: () => void;
  navigationStatus?: string;
  navigationFeedback?: {
    distance_to_goal?: number;
    progress?: number;
    eta?: number;
    current_task?: string;
  };
  connectionStatus?: ConnectionStatus;
  waypointMode?: boolean;
  onWaypointModeChange?: (mode: boolean) => void;
  waypoints?: Pose[];
  onStartWaypointNavigation?: () => void;
  patrolState?: {
    active: boolean;
    status: string;
    current_index: number;
    completed: number[];
    skipped: number[];
    total: number;
    error: string;
  } | null;
}

const FIELD_META: Array<{
  key: keyof Omit<NavigationActionConfig, 'use_default_config' | 'is_holonomic'>;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'safe_dist', label: '安全距离 (m)', min: 0.1, max: 1.0, step: 0.05 },
  { key: 'goal_tolerance', label: '到点容忍距离 (m)', min: 0.005, max: 0.5, step: 0.005 },
  { key: 'v_max', label: '最大线速度 (m/s)', min: 0.1, max: 2.0, step: 0.1 },
  { key: 'w_max', label: '最大角速度 (rad/s)', min: 0.1, max: 3.0, step: 0.1 },
  { key: 'a_max', label: '最大线加速度 (m/s²)', min: 0.1, max: 2.0, step: 0.1 },
  { key: 'dw_max', label: '最大角加速度 (rad/s²)', min: 0.1, max: 3.0, step: 0.1 },
  { key: 'jps_safe_dis_margin', label: 'JPS 宽路余量 (m)', min: 0.0, max: 1.0, step: 0.05 },
];

const getTaskTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    wait: '等待',
    photo: '拍照',
    trajectory: '轨迹',
    scan: '扫描',
    inspect: '检测',
    sound: '声音',
    display: '显示',
    signal: '信号灯',
    pickup: '拾取',
    place: '放置',
    charge: '充电',
    sequence: '顺序任务',
    parallel: '并行任务',
  };
  return labels[type] || type;
};

const renderTaskSummary = (task: TaskConfig): string => {
  const params = (task.params as Record<string, unknown>) || {};
  switch (task.type) {
    case 'wait':
      return `${params.duration || 5}秒`;
    case 'photo':
      return `${params.count || 1}张`;
    case 'trajectory':
      return `${params.trajectoryId || 'trajectory_1'}`;
    case 'scan':
      return `${params.scanType || '3d'} ${params.duration || 5}秒`;
    case 'inspect':
      return `${params.targetType || 'object'}`;
    case 'sound':
      return typeof params.text === 'string' ? `"${params.text.slice(0, 10)}..."` : '音频';
    case 'display':
      return typeof params.message === 'string' ? `"${params.message.slice(0, 10)}..."` : '';
    case 'signal':
      return `${params.color || '默认'} ${params.pattern || 'blink'}`;
    default:
      return '';
  }
};

export const NavigationControl: React.FC<NavigationControlProps> = ({
  robotPose,
  goalPose,
  isNavigating,
  onNavigationStart,
  onNavigationStop,
  onStopWaypointNavigation,
  navigationStatus,
  navigationFeedback,
  connectionStatus = ConnectionStatus.DISCONNECTED,
  waypointMode = false,
  onWaypointModeChange,
  waypoints = [],
  onStartWaypointNavigation,
  patrolState,
}) => {
  const [navigationMode, setNavigationMode] = useState<NavigationMode>(
    NavigationMode.OBSTACLE_AVOIDANCE
  );
  const [chassisControlType, setChassisControlType] = useState<'twist' | 'joy' | null>(null);
  const [tasks, setTasks] = useState<TaskConfig[]>([]);
  const [taskConfigModalVisible, setTaskConfigModalVisible] = useState(false);
  const [hasActiveAction, setHasActiveAction] = useState(false);
  const [hasSavedConfig, setHasSavedConfig] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(true);
  const [TaskConfigurationModalComponent, setTaskConfigurationModalComponent] = useState<
    React.ComponentType<{
      visible: boolean;
      tasks: TaskConfig[];
      onSave: (tasks: TaskConfig[]) => void;
      onCancel: () => void;
    }> | null
  >(null);
  const [actionConfig, setActionConfig] = useState<NavigationActionConfig>({
    use_default_config: true,
    safe_dist: 0.35,
    v_max: 0.5,
    w_max: 1.0,
    a_max: 0.5,
    dw_max: 1.0,
    is_holonomic: false,
    jps_safe_dis_margin: 0.3,
    goal_tolerance: 0.02,
  });
  // Per-field raw input draft so number fields can hold transient states like
  // "", "0.", "0.0" without `Number('')→0` collapsing them on each keystroke.
  const [numberDrafts, setNumberDrafts] = useState<Partial<Record<string, string>>>({});

  useEffect(() => {
    const initChassisControlType = async () => {
      try {
        const currentType = await apiService.getChassisControlType();
        setChassisControlType(currentType);
      } catch (error) {
        console.warn('Failed to fetch chassis control type:', error);
      }
    };

    initChassisControlType();

    const handleChassisTypeChange = (data: { controlType: 'twist' | 'joy' }) => {
      setChassisControlType(data.controlType);
    };

    apiService.on('chassis-control-type-changed', handleChassisTypeChange);
    return () => {
      apiService.off('chassis-control-type-changed', handleChassisTypeChange);
    };
  }, []);

  useEffect(() => {
    const handleNavigationFeedback = () => {
      setHasActiveAction(true);
    };
    const handleNavigationStatus = (data: { status?: string }) => {
      // 后端取消或空闲时只会走 navigating → idle，不会发 navigation-result，
      // 这里兜底把 hasActiveAction 置回 false，避免"开始导航"按钮永久灰掉。
      if (data?.status === 'idle') {
        setHasActiveAction(false);
      }
    };
    const handleNavigationResult = () => {
      setHasActiveAction(false);
    };

    apiService.on('navigation-feedback', handleNavigationFeedback);
    apiService.on('navigation-status', handleNavigationStatus);
    apiService.on('navigation-result', handleNavigationResult);

    return () => {
      apiService.off('navigation-feedback', handleNavigationFeedback);
      apiService.off('navigation-status', handleNavigationStatus);
      apiService.off('navigation-result', handleNavigationResult);
    };
  }, []);

  const handleSaveTasks = (newTasks: TaskConfig[]) => {
    setTasks(newTasks);
    setTaskConfigModalVisible(false);
    setNotice(`已保存 ${newTasks.length} 个任务`);
  };

  const handleStartNavigation = async () => {
    if (!goalPose) {
      setNotice('请先设置目标点');
      return;
    }

    if (hasActiveAction) {
      setNotice('还有正在执行的导航 action，请等待完成或取消后再开始新导航');
      return;
    }

    try {
      onNavigationStart();
      setNotice(null);

      if (navigationMode === NavigationMode.LOCAL_NAVIGATION) {
        apiService.sendLocalNavigationGoal(goalPose);
        setNotice('局部导航目标已发送');
        setTimeout(() => {
          onNavigationStop();
        }, 1000);
      } else {
        const goal: NavigationGoal = {
          pose: goalPose,
          tasks,
          actionConfig,
        };
        apiService.sendNavigationGoal(goal);
      }
    } catch (error) {
      console.error('Navigation failed:', error);
      setNotice('导航失败');
      onNavigationStop();
    }
  };

  const handleStopNavigation = () => {
    if (waypointMode && onStopWaypointNavigation) {
      onStopWaypointNavigation();
      setHasActiveAction(false);
      setHasSavedConfig(false);
    } else {
      apiService.cancelNavigation();
      onNavigationStop();
      setHasActiveAction(false);
    }
    setNotice('已发送停止指令');
  };

  const handleClearNavigationConfig = async () => {
    setHasSavedConfig(false);
    setNotice('已清除保存的导航配置');
  };

  const openTaskConfigModal = async () => {
    if (!TaskConfigurationModalComponent) {
      const module = await import('./TaskConfigurationModal');
      setTaskConfigurationModalComponent(() => module.TaskConfigurationModal);
    }
    setTaskConfigModalVisible(true);
  };

  const updateNumberField = (
    key: keyof Omit<NavigationActionConfig, 'use_default_config' | 'is_holonomic'>,
    value: string
  ) => {
    setNumberDrafts((prev) => ({ ...prev, [key]: value }));
    if (value === '' || value === '-' || value.endsWith('.')) {
      // Allow transient input states (empty, lone minus, trailing dot) without
      // committing — otherwise Number('') === 0 collapses small decimals.
      return;
    }
    const next = Number(value);
    if (Number.isNaN(next)) {
      return;
    }
    setActionConfig((prev) => ({ ...prev, [key]: next }));
  };

  const commitNumberField = (
    key: keyof Omit<NavigationActionConfig, 'use_default_config' | 'is_holonomic'>
  ) => {
    setNumberDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // meta 不上报有效 progress / distance_to_goal（in-process driver 没有
  // 接 pose/distance 回调），所以前端用 robot_pose 和 goal_pose 自己算，
  // 起点距离锚定在目标下发的那一刻。
  const goalAnchorRef = useRef<{ x: number; y: number; initial: number } | null>(null);
  const [navCompleted, setNavCompleted] = useState(false);

  useEffect(() => {
    const onResult = (data: { success?: boolean }) => {
      if (data?.success) setNavCompleted(true);
    };
    apiService.on('navigation-result', onResult);
    return () => { apiService.off('navigation-result', onResult); };
  }, []);

  useEffect(() => {
    if (!goalPose || !robotPose) {
      goalAnchorRef.current = null;
      return;
    }
    const anchor = goalAnchorRef.current;
    const goalChanged = !anchor || anchor.x !== goalPose.x || anchor.y !== goalPose.y;
    if (goalChanged) {
      goalAnchorRef.current = {
        x: goalPose.x,
        y: goalPose.y,
        initial: Math.hypot(goalPose.x - robotPose.x, goalPose.y - robotPose.y),
      };
      setNavCompleted(false);
    }
  }, [goalPose, robotPose]);

  const remainingDistance = navCompleted ? 0
    : (robotPose && goalPose ? Math.hypot(goalPose.x - robotPose.x, goalPose.y - robotPose.y) : 0);
  // 巡航完成的 sticky 窗口期保持 100%，避免归零闪烁。
  const inPatrolTerminalSuccess = !patrolState?.active && patrolState?.status === 'succeeded';
  // 导航结束（单点完成 / 巡航整体 succeeded）后，再保持 2s 让用户看到 100%，
  // 然后把进度条与剩余距离一起归零。下次开始新一段导航时由 navCompleted /
  // patrolState 的变化自动复位。
  //
  // 巡航期间不进入归零窗口：每段 waypoint 完成都会推送 navigation-result，
  // 把 navCompleted 翻成 true，如果纳入 isCompleted 会让中间段触发 2s 归零。
  // 必须等到巡航整体结束（patrolState.active=false 且 status=succeeded）。
  const isCompleted = (navCompleted && !patrolState?.active) || inPatrolTerminalSuccess;
  const [progressForceZero, setProgressForceZero] = useState(false);
  useEffect(() => {
    if (!isCompleted) {
      setProgressForceZero(false);
      return;
    }
    const t = window.setTimeout(() => setProgressForceZero(true), 2000);
    return () => window.clearTimeout(t);
  }, [isCompleted]);

  const progress = (() => {
    if (progressForceZero) return 0;
    if (inPatrolTerminalSuccess) return 1;
    if (navCompleted) return 1;
    const anchor = goalAnchorRef.current;
    if (!anchor || anchor.initial <= 0.05) return 0;
    return Math.max(0, Math.min(1, 1 - remainingDistance / anchor.initial));
  })();
  const displayRemainingDistance = progressForceZero ? 0 : remainingDistance;
  // 巡航刚结束（succeeded）后，后端有 ~3 s 的 sticky 窗口在把 _nav_status /
  // _patrol_status 复位到 idle，期间 driver._state 仍是 reached。如果用户在这
  // 个窗口里再次点「开始巡航」，下一段会从 sticky reached 起步，poller 立刻
  // 看到 reached 直接跳过该路径点。等 patrolState.status 不再是 succeeded
  // （即 UI 上完成态视觉效果消失，路径点变蓝）再允许开始。
  const inPatrolFinishWindow = waypointMode && patrolState?.status === 'succeeded';
  const canStart = !robotPose
    || (waypointMode ? waypoints.length === 0 : !goalPose)
    || chassisControlType === 'joy'
    || hasActiveAction
    || inPatrolFinishWindow;

  return (
    <div className="space-y-3">
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">导航控制</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">设置目标点、切换巡航模式并查看实时导航状态。</p>
            </div>
            <Badge variant={isNavigating ? 'default' : 'secondary'}>
              {isNavigating ? navigationStatus || 'ACTIVE' : 'IDLE'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectionStatus !== ConnectionStatus.CONNECTED && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              ROS 未连接，请先连接后端。
            </div>
          )}

          {connectionStatus === ConnectionStatus.CONNECTED && !robotPose && (
            <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
              <Loader2 className="h-4 w-4 animate-spin" />
              等待定位数据，如未启动定位，请先开启定位服务。
            </div>
          )}

          {robotPose && !goalPose && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              已获取定位数据，请在地图上点击选择导航目标位置。
            </div>
          )}

          {goalPose && (
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
              <div className="mb-1 font-medium text-foreground">目标位姿</div>
              <div className="font-mono text-muted-foreground">
                X: {goalPose.x.toFixed(2)} m | Y: {goalPose.y.toFixed(2)} m | θ: {((goalPose.theta * 180) / Math.PI).toFixed(1)}°
              </div>
            </div>
          )}

          {!isNavigating && onWaypointModeChange && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">导航模式</div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={!waypointMode ? 'default' : 'outline'}
                  onClick={() => onWaypointModeChange(false)}
                >
                  <Crosshair className="mr-2 h-4 w-4" />
                  单点导航
                </Button>
                <Button
                  type="button"
                  variant={waypointMode ? 'default' : 'outline'}
                  onClick={() => onWaypointModeChange(true)}
                >
                  <MapPinned className="mr-2 h-4 w-4" />
                  多点巡航
                </Button>
              </div>
            </div>
          )}

          {!isNavigating && !waypointMode && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">导航方式</div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={navigationMode === NavigationMode.OBSTACLE_AVOIDANCE ? 'default' : 'outline'}
                  onClick={() => setNavigationMode(NavigationMode.OBSTACLE_AVOIDANCE)}
                >
                  <WandSparkles className="mr-2 h-4 w-4" />
                  避障
                </Button>
                <Button
                  type="button"
                  variant={navigationMode === NavigationMode.LOCAL_NAVIGATION ? 'default' : 'outline'}
                  onClick={() => setNavigationMode(NavigationMode.LOCAL_NAVIGATION)}
                >
                  <Flag className="mr-2 h-4 w-4" />
                  局部
                </Button>
              </div>
            </div>
          )}

          {isNavigating ? (
            <Button type="button" variant="destructive" className="w-full" onClick={handleStopNavigation}>
              <Square className="mr-2 h-4 w-4" />
              {waypointMode ? '停止巡航' : '停止导航'}
            </Button>
          ) : (
            <div className="space-y-2">
              <Button
                type="button"
                className="w-full"
                disabled={canStart}
                onClick={waypointMode ? onStartWaypointNavigation : handleStartNavigation}
              >
                <Play className="mr-2 h-4 w-4" />
                {waypointMode ? '开始巡航' : '开始导航'}
              </Button>
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {inPatrolFinishWindow
                  ? '上一轮巡航刚结束，请等待路径点状态复位（约 3 秒）后再开始下一轮。'
                  : waypointMode
                    ? `将按序导航到 ${waypoints.length} 个路径点。`
                    : navigationMode === NavigationMode.OBSTACLE_AVOIDANCE
                      ? '全局路径规划，支持避障和附加任务。'
                      : '短距离快速导航，不做避障规划。'}
              </div>
              {chassisControlType === 'joy' && (
                <div className="text-xs text-red-300">手柄模式下不允许开始导航，请先切换到底盘自动模式。</div>
              )}
              {hasSavedConfig && hasActiveAction && (
                <Button type="button" variant="outline" className="w-full" onClick={() => void handleClearNavigationConfig()}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  清除保存的导航配置
                </Button>
              )}
            </div>
          )}

          <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground">进度</span>
              <span className="font-medium text-foreground">{(progress * 100).toFixed(1)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(0, Math.min(progress * 100, 100))}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-muted-foreground">
              <span>剩余：<span className="font-medium text-foreground">{displayRemainingDistance.toFixed(2)} m</span></span>
              {isNavigating && navigationFeedback?.eta !== undefined && (
                <span>ETA：<span className="font-medium text-foreground">{navigationFeedback.eta.toFixed(1)} s</span></span>
              )}
            </div>
            {isNavigating && navigationFeedback?.current_task && (
              <div className="mt-3 border-t border-border/60 pt-3 text-muted-foreground">
                任务：<span className="font-medium text-foreground">{navigationFeedback.current_task}</span>
              </div>
            )}
            {(patrolState?.active || patrolState?.status === 'succeeded') && (patrolState.skipped.length > 0 || patrolState.error) && (
              <div className="mt-3 border-t border-border/60 pt-3 text-muted-foreground">
                {patrolState.skipped.length > 0 && (
                  <div className="text-amber-200">
                    跳过：{patrolState.skipped.map((i) => i + 1).join(', ')} 号路径点
                  </div>
                )}
                {patrolState.error && (
                  <div className="mt-2 text-red-300">{patrolState.error}</div>
                )}
              </div>
            )}
          </div>

          {!waypointMode && (
            <>
              <Separator />

              <Collapsible open={tasksOpen} onOpenChange={setTasksOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-left text-sm font-medium text-foreground"
                  >
                    <span>附加任务</span>
                    <ChevronDown className={cn('h-4 w-4 transition-transform', tasksOpen && 'rotate-180')} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">
                        {tasks.length > 0 ? `已配置 ${tasks.length} 个任务` : '暂无任务'}
                      </span>
                      <Button type="button" size="sm" onClick={() => void openTaskConfigModal()}>
                        <Settings2 className="mr-2 h-4 w-4" />
                        配置任务
                      </Button>
                    </div>
                    {tasks.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/70 bg-background/40 px-4 py-6 text-center text-sm text-muted-foreground">
                        点击上方按钮配置任务。
                      </div>
                    ) : (
                      <div className="max-h-56 space-y-2 overflow-y-auto">
                        {tasks.map((task, index) => (
                          <div
                            key={`${task.type}-${index}`}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-foreground">
                                {index + 1}. {getTaskTypeLabel(task.type)}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {renderTaskSummary(task)}
                              </div>
                            </div>
                            <Badge variant="secondary">{task.type}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={paramsOpen} onOpenChange={setParamsOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-left text-sm font-medium text-foreground"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      导航参数
                    </span>
                    <ChevronDown className={cn('h-4 w-4 transition-transform', paramsOpen && 'rotate-180')} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-3">
                  <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                    <span className="text-sm text-foreground">使用默认配置</span>
                    <Switch
                      checked={actionConfig.use_default_config}
                      onCheckedChange={(checked) => setActionConfig((prev) => ({ ...prev, use_default_config: checked }))}
                    />
                  </div>

                  {!actionConfig.use_default_config && (
                    <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:grid-cols-2">
                      {FIELD_META.map((field) => (
                        <label key={field.key} className="grid gap-1.5 text-xs text-muted-foreground">
                          <span>{field.label}</span>
                          <Input
                            type="number"
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            value={
                              numberDrafts[field.key] ?? String(actionConfig[field.key] ?? '')
                            }
                            onChange={(event) => updateNumberField(field.key, event.target.value)}
                            onBlur={() => commitNumberField(field.key)}
                            className="h-9"
                          />
                        </label>
                      ))}

                      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/50 px-3 py-2 sm:col-span-2">
                        <span className="text-sm text-foreground">全向轮</span>
                        <Switch
                          checked={actionConfig.is_holonomic}
                          onCheckedChange={(checked) => setActionConfig((prev) => ({ ...prev, is_holonomic: checked }))}
                        />
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

          {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
        </CardContent>
      </Card>

      {taskConfigModalVisible && TaskConfigurationModalComponent && (
        <TaskConfigurationModalComponent
            visible={taskConfigModalVisible}
            tasks={tasks}
            onSave={handleSaveTasks}
            onCancel={() => setTaskConfigModalVisible(false)}
          />
      )}
    </div>
  );
};
