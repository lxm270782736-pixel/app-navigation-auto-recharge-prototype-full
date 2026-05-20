import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
  cn,
} from '@astribot/ui';
import { ChevronDown, Flag, Route, Settings2, Target, WandSparkles } from 'lucide-react';
import type { NavigationActionConfig, TaskConfig, Waypoint } from '@/types';

interface WaypointConfigModalProps {
  visible: boolean;
  waypoint: Waypoint | null;
  waypointIndex: number;
  onSave: (waypoint: Waypoint) => void;
  onCancel: () => void;
}

const FIELD_META: Array<{
  key: keyof Omit<NavigationActionConfig, 'use_default_config'>;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  isBoolean?: boolean;
}> = [
  { key: 'safe_dist', label: '安全距离 (m)', min: 0.1, max: 1.0, step: 0.05 },
  { key: 'v_max', label: '最大线速度 (m/s)', min: 0.1, max: 2.0, step: 0.1 },
  { key: 'w_max', label: '最大角速度 (rad/s)', min: 0.1, max: 3.0, step: 0.1 },
  { key: 'goal_tolerance', label: '到点容忍距离 (m)', min: 0.005, max: 0.5, step: 0.005 },
  { key: 'is_holonomic', label: '全向移动', isBoolean: true },
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

export const WaypointConfigModal: React.FC<WaypointConfigModalProps> = ({
  visible,
  waypoint,
  waypointIndex,
  onSave,
  onCancel,
}) => {
  const [poseX, setPoseX] = useState(0);
  const [poseY, setPoseY] = useState(0);
  const [poseTheta, setPoseTheta] = useState(0);
  const [tasks, setTasks] = useState<TaskConfig[]>([]);
  const [taskConfigModalVisible, setTaskConfigModalVisible] = useState(false);
  const [TaskConfigurationModalComponent, setTaskConfigurationModalComponent] = useState<
    React.ComponentType<{
      visible: boolean;
      tasks: TaskConfig[];
      onSave: (tasks: TaskConfig[]) => void;
      onCancel: () => void;
    }> | null
  >(null);
  const [navigationMode, setNavigationMode] = useState<'obstacle_avoidance' | 'local_navigation'>(
    'obstacle_avoidance'
  );
  const [useDefaultConfig, setUseDefaultConfig] = useState(true);
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Per-field raw input draft so number fields can hold transient states like
  // "", "0.", "0.0" without `Number('')→0` collapsing them on each keystroke.
  const [numberDrafts, setNumberDrafts] = useState<Partial<Record<string, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!waypoint) {
      return;
    }

    setPoseX(waypoint.pose.x);
    setPoseY(waypoint.pose.y);
    setPoseTheta(waypoint.pose.theta);
    setTasks(waypoint.tasks || []);
    setNavigationMode(waypoint.navigationMode || 'obstacle_avoidance');
    setUseDefaultConfig(waypoint.actionConfig?.use_default_config ?? true);
    if (waypoint.actionConfig) {
      setActionConfig(waypoint.actionConfig);
    }
  }, [waypoint]);

  const handleSave = () => {
    if (!waypoint) {
      return;
    }

    const updatedWaypoint: Waypoint = {
      ...waypoint,
      pose: {
        x: poseX,
        y: poseY,
        theta: poseTheta,
      },
      tasks,
      navigationMode,
      actionConfig: {
        ...actionConfig,
        use_default_config: useDefaultConfig,
      },
    };

    onSave(updatedWaypoint);
    setNotice(`路径点 ${waypointIndex + 1} 配置已保存`);
  };

  const handleSaveTasks = (newTasks: TaskConfig[]) => {
    setTasks(newTasks);
    setTaskConfigModalVisible(false);
    setNotice(`已保存 ${newTasks.length} 个任务`);
  };

  const openTaskConfigModal = async () => {
    if (!TaskConfigurationModalComponent) {
      const module = await import('./TaskConfigurationModal');
      setTaskConfigurationModalComponent(() => module.TaskConfigurationModal);
    }
    setTaskConfigModalVisible(true);
  };

  const updateNumberField = (key: keyof Omit<NavigationActionConfig, 'use_default_config'>, value: string) => {
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

  const commitNumberField = (key: keyof Omit<NavigationActionConfig, 'use_default_config'>) => {
    setNumberDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  if (!waypoint) {
    return null;
  }

  return (
    <>
      <Dialog open={visible} onOpenChange={(open) => !open && onCancel()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              路径点 {waypointIndex + 1} 配置
            </DialogTitle>
            <DialogDescription>编辑位姿、导航模式和到达后的附加任务。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="mb-3 text-sm font-medium text-foreground">位姿信息</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-xs text-muted-foreground">
                  <span>X 坐标 (m)</span>
                  <Input
                    type="number"
                    step="0.1"
                    value={String(poseX)}
                    onChange={(event) => setPoseX(Number(event.target.value) || 0)}
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-muted-foreground">
                  <span>Y 坐标 (m)</span>
                  <Input
                    type="number"
                    step="0.1"
                    value={String(poseY)}
                    onChange={(event) => setPoseY(Number(event.target.value) || 0)}
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-muted-foreground">
                  <span>方向 (°)</span>
                  <Input
                    type="number"
                    step="15"
                    min="-180"
                    max="180"
                    value={String(Math.round((poseTheta * 180) / Math.PI))}
                    onChange={(event) => setPoseTheta(((Number(event.target.value) || 0) * Math.PI) / 180)}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">导航模式</div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={navigationMode === 'obstacle_avoidance' ? 'default' : 'outline'}
                  onClick={() => setNavigationMode('obstacle_avoidance')}
                >
                  <WandSparkles className="mr-2 h-4 w-4" />
                  避障导航
                </Button>
                <Button
                  type="button"
                  variant={navigationMode === 'local_navigation' ? 'default' : 'outline'}
                  onClick={() => setNavigationMode('local_navigation')}
                >
                  <Target className="mr-2 h-4 w-4" />
                  局部导航
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {navigationMode === 'obstacle_avoidance' ? '全局路径规划，支持避障。' : '短距离快速导航，不做避障规划。'}
              </p>
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-foreground">到达后执行任务</div>
                <Button type="button" size="sm" onClick={() => void openTaskConfigModal()}>
                  <Flag className="mr-2 h-4 w-4" />
                  配置任务
                </Button>
              </div>
              {tasks.length > 0 ? (
                <div className="max-h-44 space-y-2 overflow-y-auto">
                  {tasks.map((task, index) => (
                    <div
                      key={`${task.type}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {index + 1}. {getTaskTypeLabel(task.type)}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{renderTaskSummary(task)}</div>
                      </div>
                      <Badge variant="secondary">{task.type}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 bg-background/40 px-4 py-6 text-center text-sm text-muted-foreground">
                  到达此路径点后不执行任务。
                </div>
              )}
            </div>

            {navigationMode === 'obstacle_avoidance' && (
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-left"
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      <Route className="h-4 w-4" />
                      高级参数配置
                    </span>
                    <ChevronDown className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="space-y-4 rounded-lg border border-border/70 bg-muted/10 p-4">
                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/50 px-3 py-2">
                      <span className="text-sm text-foreground">使用默认配置</span>
                      <Switch checked={useDefaultConfig} onCheckedChange={setUseDefaultConfig} />
                    </div>

                    {!useDefaultConfig && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {FIELD_META.map((field) =>
                          field.isBoolean ? (
                            <div
                              key={field.key}
                              className="flex items-center justify-between rounded-lg border border-border/70 bg-background/50 px-3 py-2 sm:col-span-2"
                            >
                              <span className="text-sm text-foreground">{field.label}</span>
                              <Switch
                                checked={Boolean(actionConfig[field.key])}
                                onCheckedChange={(checked) =>
                                  setActionConfig((prev) => ({ ...prev, [field.key]: checked }))
                                }
                              />
                            </div>
                          ) : (
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
                              />
                            </label>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
            <Button type="button" onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {taskConfigModalVisible && TaskConfigurationModalComponent && (
        <TaskConfigurationModalComponent
          visible={taskConfigModalVisible}
          tasks={tasks}
          onSave={handleSaveTasks}
          onCancel={() => setTaskConfigModalVisible(false)}
        />
      )}
    </>
  );
};
