import React from 'react';
import { Card, Collapse } from 'antd';
import './TaskPalette.css';

const { Panel } = Collapse;

const taskCategories = {
  basic: {
    label: '基础任务',
    tasks: [
      { type: 'waitTask', label: '等待停留', icon: '⏱️', color: '#1890ff' },
      { type: 'photoTask', label: '拍照', icon: '📷', color: '#52c41a' },
      { type: 'trajectoryTask', label: '执行轨迹', icon: '🔄', color: '#722ed1' },
    ],
  },
  perception: {
    label: '感知任务',
    tasks: [
      { type: 'scanTask', label: '环境扫描', icon: '🔍', color: '#13c2c2' },
      { type: 'inspectTask', label: '目标检测', icon: '👁️', color: '#eb2f96' },
    ],
  },
  interaction: {
    label: '交互任务',
    tasks: [
      { type: 'soundTask', label: '播放声音', icon: '🔊', color: '#fa8c16' },
      { type: 'displayTask', label: '显示信息', icon: '📺', color: '#faad14' },
      { type: 'signalTask', label: '信号灯', icon: '💡', color: '#fadb14' },
    ],
  },
  control: {
    label: '控制流',
    tasks: [
      { type: 'parallel', label: '并行执行', icon: '⚡', color: '#f5222d' },
      { type: 'conditional', label: '条件分支', icon: '🔀', color: '#fa541c' },
    ],
  },
};

export const TaskPalette: React.FC = () => {
  const onDragStart = (event: React.DragEvent, taskType: string) => {
    event.dataTransfer.setData('application/reactflow', taskType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <Card
      size="small"
      title="任务工具箱"
      style={{ width: 220, height: '100%', overflow: 'auto' }}
      bodyStyle={{ padding: 8 }}
    >
      <div style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
        拖拽任务到右侧画布
      </div>

      <Collapse ghost defaultActiveKey={['basic', 'perception', 'interaction', 'control']}>
        {Object.entries(taskCategories).map(([key, category]) => (
          <Panel header={category.label} key={key}>
            <div className="task-palette-items">
              {category.tasks.map((task) => (
                <div
                  key={task.type}
                  className="palette-item"
                  draggable
                  onDragStart={(e) => onDragStart(e, task.type)}
                  style={{
                    borderColor: task.color,
                    backgroundColor: `${task.color}15`,
                  }}
                >
                  <span className="palette-icon">{task.icon}</span>
                  <span className="palette-label">{task.label}</span>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </Collapse>
    </Card>
  );
};
