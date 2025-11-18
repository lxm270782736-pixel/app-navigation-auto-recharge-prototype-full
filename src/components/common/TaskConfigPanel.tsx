import React, { useState } from 'react';
import {
  Card,
  Button,
  Select,
  InputNumber,
  Input,
  Space,
  Divider,
  Radio,
  Collapse,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  InfoCircleOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  TaskType,
  TaskConfig,
  createWaitTask,
  createPhotoTask,
  validateTaskConfig,
} from '@/types';

const { Panel } = Collapse;
const { TextArea } = Input;

interface TaskConfigPanelProps {
  value?: TaskConfig[];
  onChange?: (tasks: TaskConfig[]) => void;
}

// 任务类型分组
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

export const TaskConfigPanel: React.FC<TaskConfigPanelProps> = ({ value = [], onChange }) => {
  const [tasks, setTasks] = useState<TaskConfig[]>(value);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 移动8px后才开始拖拽，避免误触
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const updateTasks = (newTasks: TaskConfig[]) => {
    setTasks(newTasks);
    onChange?.(newTasks);
  };

  // 处理拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tasks.findIndex((_, index) => `task-${index}` === active.id);
      const newIndex = tasks.findIndex((_, index) => `task-${index}` === over.id);

      const newTasks = arrayMove(tasks, oldIndex, newIndex);
      updateTasks(newTasks);

      // 如果正在编辑的任务被移动了，更新编辑索引
      if (editingIndex !== null) {
        if (editingIndex === oldIndex) {
          setEditingIndex(newIndex);
        } else if (oldIndex < editingIndex && newIndex >= editingIndex) {
          setEditingIndex(editingIndex - 1);
        } else if (oldIndex > editingIndex && newIndex <= editingIndex) {
          setEditingIndex(editingIndex + 1);
        }
      }

      message.success('任务顺序已调整');
    }
  };

  const addTask = (type: TaskType) => {
    let newTask: TaskConfig;

    switch (type) {
      case TaskType.WAIT:
        newTask = createWaitTask(5);
        break;
      case TaskType.PHOTO:
        newTask = createPhotoTask();
        break;
      default:
        newTask = {
          type,
          name: getTaskTypeName(type),
          params: getDefaultParams(type),
        };
    }

    updateTasks([...tasks, newTask]);
    setEditingIndex(tasks.length);
  };

  const removeTask = (index: number) => {
    updateTasks(tasks.filter((_, i) => i !== index));
  };

  const updateTask = (index: number, updatedTask: TaskConfig) => {
    const newTasks = [...tasks];
    newTasks[index] = updatedTask;
    updateTasks(newTasks);
  };


  return (
    <div>
      {/* 任务选择器 */}
      <Card size="small" title="添加任务" style={{ marginBottom: 12 }}>
        <Collapse ghost>
          {Object.entries(taskCategories).map(([key, category]) => (
            <Panel header={category.label} key={key}>
              <Space wrap>
                {category.tasks.map((task) => (
                  <Button
                    key={task.type}
                    size="small"
                    icon={<span>{task.icon}</span>}
                    onClick={() => addTask(task.type)}
                  >
                    {task.label}
                  </Button>
                ))}
              </Space>
            </Panel>
          ))}
        </Collapse>
      </Card>

      {/* 任务列表 */}
      {tasks.length > 0 && (
        <Card size="small" title={`任务列表 (${tasks.length})`}>
          <div style={{ marginBottom: 8, fontSize: 12, color: '#999' }}>
            <HolderOutlined /> 拖拽任务可调整顺序
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tasks.map((_, index) => `task-${index}`)}
              strategy={verticalListSortingStrategy}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {tasks.map((task, index) => (
                  <SortableTaskItem
                    key={`task-${index}`}
                    id={`task-${index}`}
                    task={task}
                    index={index}
                    isEditing={editingIndex === index}
                    onEdit={() => setEditingIndex(index)}
                    onDelete={() => removeTask(index)}
                    onUpdate={(updatedTask) => updateTask(index, updatedTask)}
                    onCloseEdit={() => setEditingIndex(null)}
                  />
                ))}
              </Space>
            </SortableContext>
          </DndContext>
        </Card>
      )}

      {tasks.length === 0 && (
        <div style={{
          padding: 24,
          textAlign: 'center',
          color: '#999',
          border: '1px dashed #d9d9d9',
          borderRadius: 4,
        }}>
          <PlusOutlined style={{ fontSize: 24, marginBottom: 8 }} />
          <div>暂无任务，点击上方按钮添加任务</div>
        </div>
      )}
    </div>
  );
};

// 可拖拽的任务项组件
interface SortableTaskItemProps {
  id: string;
  task: TaskConfig;
  index: number;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (task: TaskConfig) => void;
  onCloseEdit: () => void;
}

const SortableTaskItem: React.FC<SortableTaskItemProps> = ({
  id,
  task,
  index,
  isEditing,
  onEdit,
  onDelete,
  onUpdate,
  onCloseEdit,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        size="small"
        style={{
          backgroundColor: isEditing ? '#f0f5ff' : '#fafafa',
          cursor: isDragging ? 'grabbing' : 'default',
        }}
        extra={
          <Space>
            {!isEditing && (
              <>
                <Button
                  type="text"
                  size="small"
                  icon={<HolderOutlined />}
                  style={{ cursor: 'grab' }}
                  {...attributes}
                  {...listeners}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={onEdit}
                />
              </>
            )}
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={onDelete}
            />
          </Space>
        }
      >
        <div style={{ marginBottom: isEditing ? 12 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color="blue">{index + 1}</Tag>
            <span style={{ fontWeight: 'bold' }}>
              {task.name || getTaskTypeName(task.type)}
            </span>
            <Tag>{getTaskTypeName(task.type)}</Tag>
          </div>

          {isEditing ? (
            <div style={{ marginTop: 12 }}>
              <TaskEditor
                task={task}
                onChange={onUpdate}
                onClose={onCloseEdit}
              />
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
              {renderTaskSummary(task)}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

// 任务编辑器
const TaskEditor: React.FC<{
  task: TaskConfig;
  onChange: (task: TaskConfig) => void;
  onClose: () => void;
}> = ({ task, onChange, onClose }) => {
  const [localTask, setLocalTask] = useState<TaskConfig>(task);

  const updateParams = (params: Partial<any>) => {
    setLocalTask({
      ...localTask,
      params: { ...localTask.params, ...params },
    });
  };

  const handleSave = () => {
    const validation = validateTaskConfig(localTask);
    if (!validation.valid) {
      message.error(validation.errors.join(', '));
      return;
    }
    onChange(localTask);
    onClose();
  };

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* 任务名称 */}
        <div>
          <div style={{ fontSize: 11, marginBottom: 4 }}>任务名称</div>
          <Input
            size="small"
            value={localTask.name}
            onChange={(e) => setLocalTask({ ...localTask, name: e.target.value })}
            placeholder="可选"
          />
        </div>

        {/* 超时设置 */}
        <div>
          <div style={{ fontSize: 11, marginBottom: 4 }}>
            超时时间（秒）
            <Tooltip title="任务执行超时时间，0表示无限制">
              <InfoCircleOutlined style={{ marginLeft: 4 }} />
            </Tooltip>
          </div>
          <InputNumber
            size="small"
            style={{ width: '100%' }}
            min={0}
            value={localTask.timeout}
            onChange={(value) => setLocalTask({ ...localTask, timeout: value || undefined })}
            placeholder="0 = 无限制"
          />
        </div>

        <Divider style={{ margin: '8px 0' }} />

        {/* 根据任务类型渲染不同的配置表单 */}
        {renderTaskParamsEditor(localTask.type, localTask.params, updateParams)}

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={handleSave}
            style={{ flex: 1 }}
          >
            保存
          </Button>
          <Button
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
          >
            取消
          </Button>
        </div>
      </Space>
    </div>
  );
};

// 渲染任务参数编辑器
function renderTaskParamsEditor(
  type: TaskType,
  params: any = {},
  updateParams: (params: Partial<any>) => void
) {
  switch (type) {
    case TaskType.WAIT:
      return (
        <div>
          <div style={{ fontSize: 11, marginBottom: 4 }}>等待时长（秒）</div>
          <InputNumber
            size="small"
            style={{ width: '100%' }}
            min={1}
            max={600}
            value={params.duration}
            onChange={(value) => updateParams({ duration: value || 5 })}
          />
        </div>
      );

    case TaskType.PHOTO:
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>相机ID</div>
            <Input
              size="small"
              value={params.cameraId}
              onChange={(e) => updateParams({ cameraId: e.target.value })}
              placeholder="default"
            />
          </div>
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>分辨率</div>
            <Select
              size="small"
              style={{ width: '100%' }}
              value={params.resolution}
              onChange={(value) => updateParams({ resolution: value })}
            >
              <Select.Option value="640x480">640x480</Select.Option>
              <Select.Option value="1280x720">1280x720</Select.Option>
              <Select.Option value="1920x1080">1920x1080</Select.Option>
            </Select>
          </div>
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>拍照数量</div>
            <InputNumber
              size="small"
              style={{ width: '100%' }}
              min={1}
              max={10}
              value={params.count}
              onChange={(value) => updateParams({ count: value || 1 })}
            />
          </div>
          {(params.count || 1) > 1 && (
            <div>
              <div style={{ fontSize: 11, marginBottom: 4 }}>拍照间隔（秒）</div>
              <InputNumber
                size="small"
                style={{ width: '100%' }}
                min={0.5}
                max={10}
                step={0.5}
                value={params.interval}
                onChange={(value) => updateParams({ interval: value || 1 })}
              />
            </div>
          )}
        </Space>
      );

    case TaskType.TRAJECTORY:
      return (
        <div>
          <div style={{ fontSize: 11, marginBottom: 4 }}>轨迹ID</div>
          <Input
            size="small"
            value={params.trajectoryId}
            onChange={(e) => updateParams({ trajectoryId: e.target.value })}
            placeholder="trajectory_1"
          />
        </div>
      );

    case TaskType.SCAN:
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>扫描类型</div>
            <Radio.Group
              size="small"
              value={params.scanType}
              onChange={(e) => updateParams({ scanType: e.target.value })}
            >
              <Radio.Button value="3d">3D</Radio.Button>
              <Radio.Button value="2d">2D</Radio.Button>
              <Radio.Button value="thermal">热成像</Radio.Button>
            </Radio.Group>
          </div>
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>扫描时长（秒）</div>
            <InputNumber
              size="small"
              style={{ width: '100%' }}
              min={1}
              max={60}
              value={params.duration}
              onChange={(value) => updateParams({ duration: value || 5 })}
            />
          </div>
        </Space>
      );

    case TaskType.INSPECT:
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>检测目标类型</div>
            <Input
              size="small"
              value={params.targetType}
              onChange={(e) => updateParams({ targetType: e.target.value })}
              placeholder="person, object, etc."
            />
          </div>
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>置信度阈值</div>
            <InputNumber
              size="small"
              style={{ width: '100%' }}
              min={0}
              max={1}
              step={0.1}
              value={params.confidenceThreshold}
              onChange={(value) => updateParams({ confidenceThreshold: value || 0.7 })}
            />
          </div>
        </Space>
      );

    case TaskType.SOUND:
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>语音文本（TTS）</div>
            <TextArea
              size="small"
              rows={2}
              value={params.text}
              onChange={(e) => updateParams({ text: e.target.value })}
              placeholder="要播放的语音文本"
            />
          </div>
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>音量 (0-100)</div>
            <InputNumber
              size="small"
              style={{ width: '100%' }}
              min={0}
              max={100}
              value={params.volume}
              onChange={(value) => updateParams({ volume: value || 70 })}
            />
          </div>
        </Space>
      );

    case TaskType.DISPLAY:
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>显示消息</div>
            <TextArea
              size="small"
              rows={2}
              value={params.message}
              onChange={(e) => updateParams({ message: e.target.value })}
              placeholder="要显示的消息"
            />
          </div>
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>显示时长（秒）</div>
            <InputNumber
              size="small"
              style={{ width: '100%' }}
              min={1}
              max={60}
              value={params.duration}
              onChange={(value) => updateParams({ duration: value || 5 })}
            />
          </div>
        </Space>
      );

    case TaskType.SIGNAL:
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>信号模式</div>
            <Radio.Group
              size="small"
              value={params.pattern}
              onChange={(e) => updateParams({ pattern: e.target.value })}
            >
              <Radio.Button value="blink">闪烁</Radio.Button>
              <Radio.Button value="pulse">脉冲</Radio.Button>
              <Radio.Button value="solid">常亮</Radio.Button>
            </Radio.Group>
          </div>
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>颜色</div>
            <Select
              size="small"
              style={{ width: '100%' }}
              value={params.color}
              onChange={(value) => updateParams({ color: value })}
            >
              <Select.Option value="red">红色</Select.Option>
              <Select.Option value="green">绿色</Select.Option>
              <Select.Option value="blue">蓝色</Select.Option>
              <Select.Option value="yellow">黄色</Select.Option>
            </Select>
          </div>
          <div>
            <div style={{ fontSize: 11, marginBottom: 4 }}>持续时间（秒）</div>
            <InputNumber
              size="small"
              style={{ width: '100%' }}
              min={1}
              max={60}
              value={params.duration}
              onChange={(value) => updateParams({ duration: value || 3 })}
            />
          </div>
        </Space>
      );

    default:
      return <div style={{ fontSize: 12, color: '#999' }}>暂无配置项</div>;
  }
}

// 渲染任务摘要
function renderTaskSummary(task: TaskConfig): string {
  const params = task.params as any || {};

  switch (task.type) {
    case TaskType.WAIT:
      return `等待 ${params.duration || 5} 秒`;
    case TaskType.PHOTO:
      return `拍照 ${params.count || 1} 张 (${params.resolution || '1920x1080'})`;
    case TaskType.TRAJECTORY:
      return `执行轨迹: ${params.trajectoryId || 'trajectory_1'}`;
    case TaskType.SCAN:
      return `${params.scanType || '3d'}扫描 ${params.duration || 5} 秒`;
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
}

// 获取任务类型名称
function getTaskTypeName(type: TaskType): string {
  const names: Record<string, string> = {
    [TaskType.WAIT]: '等待',
    [TaskType.PHOTO]: '拍照',
    [TaskType.TRAJECTORY]: '执行轨迹',
    [TaskType.SCAN]: '环境扫描',
    [TaskType.INSPECT]: '目标检测',
    [TaskType.SOUND]: '播放声音',
    [TaskType.DISPLAY]: '显示信息',
    [TaskType.SIGNAL]: '信号灯',
  };
  return names[type] || type;
}

// 获取默认参数
function getDefaultParams(type: TaskType): any {
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
}
