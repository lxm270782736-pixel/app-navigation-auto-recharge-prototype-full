import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@astribot/ui';
import { ChevronDown, ChevronUp, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import {
  TaskConfig,
  TaskType,
  createPhotoTask,
  createWaitTask,
  validateTaskConfig,
} from '@/types';

interface TaskConfigPanelProps {
  value?: TaskConfig[];
  onChange?: (tasks: TaskConfig[]) => void;
}

const taskCategories = {
  basic: {
    label: '基础任务',
    tasks: [
      { type: TaskType.WAIT, label: '等待停留', icon: '⏱️' },
      { type: TaskType.PHOTO, label: '拍照', icon: '📷' },
      { type: TaskType.TRAJECTORY, label: '执行轨迹', icon: '🔄' },
    ],
  },
  perception: {
    label: '感知任务',
    tasks: [
      { type: TaskType.SCAN, label: '环境扫描', icon: '🔍' },
      { type: TaskType.INSPECT, label: '目标检测', icon: '👁️' },
    ],
  },
  interaction: {
    label: '交互任务',
    tasks: [
      { type: TaskType.SOUND, label: '播放声音', icon: '🔊' },
      { type: TaskType.DISPLAY, label: '显示信息', icon: '📺' },
      { type: TaskType.SIGNAL, label: '信号灯', icon: '💡' },
    ],
  },
};

const taskTypeNames: Record<string, string> = {
  [TaskType.WAIT]: '等待',
  [TaskType.PHOTO]: '拍照',
  [TaskType.TRAJECTORY]: '执行轨迹',
  [TaskType.SCAN]: '环境扫描',
  [TaskType.INSPECT]: '目标检测',
  [TaskType.SOUND]: '播放声音',
  [TaskType.DISPLAY]: '显示信息',
  [TaskType.SIGNAL]: '信号灯',
};

const getDefaultParams = (type: TaskType): Record<string, any> => {
  switch (type) {
    case TaskType.WAIT:
      return { duration: 5 };
    case TaskType.PHOTO:
      return { cameraId: 'default', resolution: '1920x1080', format: 'jpg', count: 1 };
    case TaskType.TRAJECTORY:
      return { trajectoryId: 'trajectory_1', speed: 0.5 };
    case TaskType.SCAN:
      return { scanType: '3d', duration: 5 };
    case TaskType.INSPECT:
      return { targetType: 'person', confidenceThreshold: 0.7 };
    case TaskType.SOUND:
      return { text: '', volume: 70, language: 'zh-CN' };
    case TaskType.DISPLAY:
      return { message: '', duration: 5, position: 'center' };
    case TaskType.SIGNAL:
      return { pattern: 'blink', color: 'green', duration: 3 };
    default:
      return {};
  }
};

const renderTaskSummary = (task: TaskConfig): string => {
  const params = (task.params as Record<string, any>) || {};
  switch (task.type) {
    case TaskType.WAIT:
      return `等待 ${params.duration || 5} 秒`;
    case TaskType.PHOTO:
      return `拍照 ${params.count || 1} 张 (${params.resolution || '1920x1080'})`;
    case TaskType.TRAJECTORY:
      return `执行轨迹: ${params.trajectoryId || 'trajectory_1'}`;
    case TaskType.SCAN:
      return `${params.scanType || '3d'} 扫描 ${params.duration || 5} 秒`;
    case TaskType.INSPECT:
      return `检测目标: ${params.targetType || 'unknown'}`;
    case TaskType.SOUND:
      return `播放: ${params.text || params.audioFile || '默认声音'}`;
    case TaskType.DISPLAY:
      return `显示: ${params.message || ''}`;
    case TaskType.SIGNAL:
      return `信号灯: ${params.color || '默认'} ${params.pattern || 'blink'}`;
    default:
      return '未配置';
  }
};

const createTask = (type: TaskType): TaskConfig => {
  switch (type) {
    case TaskType.WAIT:
      return createWaitTask(5);
    case TaskType.PHOTO:
      return createPhotoTask();
    default:
      return {
        type,
        name: taskTypeNames[type] || type,
        params: getDefaultParams(type),
      };
  }
};

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number): T[] => {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

export const TaskConfigPanel: React.FC<TaskConfigPanelProps> = ({ value = [], onChange }) => {
  const [tasks, setTasks] = useState<TaskConfig[]>(value);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setTasks(value);
  }, [value]);

  const updateTasks = (next: TaskConfig[]) => {
    setTasks(next);
    onChange?.(next);
  };

  const moveTask = (oldIndex: number, newIndex: number) => {
    const reordered = moveItem(tasks, oldIndex, newIndex);
    updateTasks(reordered);
    setNotice('任务顺序已调整');

    if (editingIndex !== null) {
      if (editingIndex === oldIndex) {
        setEditingIndex(newIndex);
      } else if (oldIndex < editingIndex && newIndex >= editingIndex) {
        setEditingIndex(editingIndex - 1);
      } else if (oldIndex > editingIndex && newIndex <= editingIndex) {
        setEditingIndex(editingIndex + 1);
      }
    }
  };

  const addTask = (type: TaskType) => {
    const next = [...tasks, createTask(type)];
    updateTasks(next);
    setEditingIndex(next.length - 1);
  };

  const removeTask = (index: number) => {
    updateTasks(tasks.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
    }
  };

  const updateTask = (index: number, updatedTask: TaskConfig) => {
    const next = [...tasks];
    next[index] = updatedTask;
    updateTasks(next);
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">添加任务</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(taskCategories).map(([key, category]) => (
            <div key={key} className="space-y-2">
              <div className="text-sm font-medium text-foreground">{category.label}</div>
              <div className="flex flex-wrap gap-2">
                {category.tasks.map((task) => (
                  <Button key={task.type} type="button" variant="outline" size="sm" onClick={() => addTask(task.type)}>
                    <span className="mr-2">{task.icon}</span>
                    {task.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {tasks.length > 0 ? (
        <Card className="border-border/70 bg-card/80 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">任务列表 ({tasks.length})</CardTitle>
              <span className="text-xs text-muted-foreground">执行顺序</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tasks.map((task, index) => (
                <TaskItem
                  key={`task-${index}`}
                  task={task}
                  index={index}
                  count={tasks.length}
                  isEditing={editingIndex === index}
                  onEdit={() => setEditingIndex(index)}
                  onDelete={() => removeTask(index)}
                  onMove={moveTask}
                  onUpdate={(updatedTask) => updateTask(index, updatedTask)}
                  onCloseEdit={() => setEditingIndex(null)}
                />
              ))}
            </div>
            {notice && <p className="mt-4 text-xs text-muted-foreground">{notice}</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-6 py-10 text-center text-sm text-muted-foreground">
          <Plus className="mx-auto mb-3 h-6 w-6" />
          暂无任务，点击上方按钮添加任务。
        </div>
      )}
    </div>
  );
};

interface TaskItemProps {
  task: TaskConfig;
  index: number;
  count: number;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onUpdate: (task: TaskConfig) => void;
  onCloseEdit: () => void;
}

const TaskItem: React.FC<TaskItemProps> = ({
  task,
  index,
  count,
  isEditing,
  onEdit,
  onDelete,
  onMove,
  onUpdate,
  onCloseEdit,
}) => {
  return (
    <div>
      <Card className={isEditing ? 'border-primary/50 bg-primary/5' : 'border-border/70 bg-background/40'}>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 flex-col">
                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5" title="上移" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5" title="下移" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Badge variant="secondary">{index + 1}</Badge>
                <span className="truncate font-medium text-foreground">{task.name || taskTypeNames[task.type] || task.type}</span>
                <Badge variant="outline">{task.type}</Badge>
              </div>

              {isEditing ? (
                <div className="mt-4">
                  <TaskEditor task={task} onChange={onUpdate} onClose={onCloseEdit} />
                </div>
              ) : (
                <div className="mt-3 text-sm text-muted-foreground">{renderTaskSummary(task)}</div>
              )}
            </div>

            <div className="flex gap-1">
              {!isEditing && (
                <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4 text-red-300" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const TaskEditor: React.FC<{
  task: TaskConfig;
  onChange: (task: TaskConfig) => void;
  onClose: () => void;
}> = ({ task, onChange, onClose }) => {
  const [localTask, setLocalTask] = useState<TaskConfig>(task);
  const [error, setError] = useState<string | null>(null);

  const updateParams = (params: Record<string, any>) => {
    setLocalTask((prev) => ({
      ...prev,
      params: { ...prev.params, ...params },
    }));
  };

  const handleSave = () => {
    const validation = validateTaskConfig(localTask);
    if (!validation.valid) {
      setError(validation.errors.join(', '));
      return;
    }
    onChange(localTask);
    onClose();
  };

  const params = (localTask.params as Record<string, any>) || {};

  return (
    <div className="space-y-4 rounded-lg border border-border/70 bg-background/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          <span>任务名称</span>
          <Input
            value={localTask.name || ''}
            onChange={(event) => setLocalTask({ ...localTask, name: event.target.value })}
            placeholder="可选"
          />
        </label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          <span>超时时间（秒）</span>
          <Input
            type="number"
            min="0"
            value={String(localTask.timeout ?? '')}
            onChange={(event) =>
              setLocalTask({
                ...localTask,
                timeout: event.target.value === '' ? undefined : Number(event.target.value),
              })
            }
            placeholder="0 = 无限制"
          />
        </label>
      </div>

      <TaskParamsEditor type={localTask.type} params={params} updateParams={updateParams} />

      {error && <p className="text-xs text-red-300">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          保存
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          <X className="mr-2 h-4 w-4" />
          取消
        </Button>
      </div>
    </div>
  );
};

const TaskParamsEditor: React.FC<{
  type: TaskType;
  params: Record<string, any>;
  updateParams: (params: Record<string, any>) => void;
}> = ({ type, params, updateParams }) => {
  switch (type) {
    case TaskType.WAIT:
      return (
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          <span>等待时长（秒）</span>
          <Input type="number" min="1" max="600" value={String(params.duration ?? 5)} onChange={(event) => updateParams({ duration: Number(event.target.value) || 5 })} />
        </label>
      );

    case TaskType.PHOTO:
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>相机 ID</span>
            <Input value={params.cameraId ?? 'default'} onChange={(event) => updateParams({ cameraId: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>分辨率</span>
            <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={params.resolution ?? '1920x1080'} onChange={(event) => updateParams({ resolution: event.target.value })}>
              <option value="640x480">640x480</option>
              <option value="1280x720">1280x720</option>
              <option value="1920x1080">1920x1080</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>拍照数量</span>
            <Input type="number" min="1" max="10" value={String(params.count ?? 1)} onChange={(event) => updateParams({ count: Number(event.target.value) || 1 })} />
          </label>
          {(params.count || 1) > 1 && (
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              <span>拍照间隔（秒）</span>
              <Input type="number" min="0.5" max="10" step="0.5" value={String(params.interval ?? 1)} onChange={(event) => updateParams({ interval: Number(event.target.value) || 1 })} />
            </label>
          )}
        </div>
      );

    case TaskType.TRAJECTORY:
      return (
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          <span>轨迹 ID</span>
          <Input value={params.trajectoryId ?? 'trajectory_1'} onChange={(event) => updateParams({ trajectoryId: event.target.value })} />
        </label>
      );

    case TaskType.SCAN:
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>扫描类型</span>
            <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={params.scanType ?? '3d'} onChange={(event) => updateParams({ scanType: event.target.value })}>
              <option value="3d">3D</option>
              <option value="2d">2D</option>
              <option value="thermal">热成像</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>扫描时长（秒）</span>
            <Input type="number" min="1" max="60" value={String(params.duration ?? 5)} onChange={(event) => updateParams({ duration: Number(event.target.value) || 5 })} />
          </label>
        </div>
      );

    case TaskType.INSPECT:
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>检测目标类型</span>
            <Input value={params.targetType ?? 'person'} onChange={(event) => updateParams({ targetType: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>置信度阈值</span>
            <Input type="number" min="0" max="1" step="0.1" value={String(params.confidenceThreshold ?? 0.7)} onChange={(event) => updateParams({ confidenceThreshold: Number(event.target.value) || 0.7 })} />
          </label>
        </div>
      );

    case TaskType.SOUND:
      return (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>语音文本（TTS）</span>
            <textarea className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={params.text ?? ''} onChange={(event) => updateParams({ text: event.target.value })} placeholder="要播放的语音文本" />
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>音量 (0-100)</span>
            <Input type="number" min="0" max="100" value={String(params.volume ?? 70)} onChange={(event) => updateParams({ volume: Number(event.target.value) || 70 })} />
          </label>
        </div>
      );

    case TaskType.DISPLAY:
      return (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>显示消息</span>
            <textarea className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={params.message ?? ''} onChange={(event) => updateParams({ message: event.target.value })} placeholder="要显示的消息" />
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>显示时长（秒）</span>
            <Input type="number" min="1" max="60" value={String(params.duration ?? 5)} onChange={(event) => updateParams({ duration: Number(event.target.value) || 5 })} />
          </label>
        </div>
      );

    case TaskType.SIGNAL:
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>信号模式</span>
            <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={params.pattern ?? 'blink'} onChange={(event) => updateParams({ pattern: event.target.value })}>
              <option value="blink">闪烁</option>
              <option value="pulse">脉冲</option>
              <option value="solid">常亮</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>颜色</span>
            <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={params.color ?? 'green'} onChange={(event) => updateParams({ color: event.target.value })}>
              <option value="red">红色</option>
              <option value="green">绿色</option>
              <option value="blue">蓝色</option>
              <option value="yellow">黄色</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>持续时间（秒）</span>
            <Input type="number" min="1" max="60" value={String(params.duration ?? 3)} onChange={(event) => updateParams({ duration: Number(event.target.value) || 3 })} />
          </label>
        </div>
      );

    default:
      return <div className="text-sm text-muted-foreground">该任务暂无轻量配置面板。</div>;
  }
};
