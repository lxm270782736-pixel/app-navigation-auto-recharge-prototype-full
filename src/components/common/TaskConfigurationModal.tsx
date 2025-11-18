import React, { useState } from 'react';
import { Modal, Button, Space, Tag, Empty, Segmented } from 'antd';
import {
  SettingOutlined,
  CloseOutlined,
  CheckOutlined,
  UnorderedListOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import { TaskConfig } from '@/types';
import { TaskConfigPanel } from './TaskConfigPanel';
import { TaskFlowEditor } from '../TaskFlowEditor';

interface TaskConfigurationModalProps {
  visible: boolean;
  tasks: TaskConfig[];
  onSave: (tasks: TaskConfig[]) => void;
  onCancel: () => void;
}

export const TaskConfigurationModal: React.FC<TaskConfigurationModalProps> = ({
  visible,
  tasks: initialTasks,
  onSave,
  onCancel,
}) => {
  const [tasks, setTasks] = useState<TaskConfig[]>(initialTasks);
  const [viewMode, setViewMode] = useState<'list' | 'flow'>('list');

  const handleSave = () => {
    onSave(tasks);
  };

  const handleCancel = () => {
    // 恢复初始任务
    setTasks(initialTasks);
    onCancel();
  };

  // 当visible变化时，更新tasks
  React.useEffect(() => {
    setTasks(initialTasks);
  }, [visible, initialTasks]);

  return (
    <Modal
      title="附加任务配置"
      open={visible}
      onCancel={handleCancel}
      width="90%"
      style={{ top: 20, maxWidth: 1200 }}
      bodyStyle={{
        height: 'calc(100vh - 200px)',
        overflow: 'auto',
        padding: '24px',
      }}
      footer={
        <Space>
          <Button icon={<CloseOutlined />} onClick={handleCancel}>
            取消
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={handleSave}
          >
            保存并返回
          </Button>
        </Space>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
            在此页面配置机器人到达目标点后需要执行的附加任务。支持多种任务类型，任务将按顺序执行。
          </p>

          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(value as 'list' | 'flow')}
            options={[
              {
                label: '列表模式',
                value: 'list',
                icon: <UnorderedListOutlined />,
              },
              {
                label: '流程图模式',
                value: 'flow',
                icon: <ApartmentOutlined />,
              },
            ]}
          />
        </div>
      </div>

      {viewMode === 'list' ? (
        <TaskConfigPanel value={tasks} onChange={setTasks} />
      ) : (
        <TaskFlowEditor tasks={tasks} onChange={setTasks} />
      )}
    </Modal>
  );
};

// 简化的任务列表显示组件（用于NavigationControl）
interface TaskListViewProps {
  tasks: TaskConfig[];
  onConfigure: () => void;
}

export const TaskListView: React.FC<TaskListViewProps> = ({ tasks, onConfigure }) => {
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

  const getTaskIcon = (type: string): string => {
    const icons: Record<string, string> = {
      wait: '⏱️',
      photo: '📷',
      trajectory: '🔄',
      scan: '🔍',
      inspect: '👁️',
      sound: '🔊',
      display: '📺',
      signal: '💡',
      pickup: '🤏',
      place: '📦',
      charge: '🔋',
      sequence: '📋',
      parallel: '⚡',
    };
    return icons[type] || '📌';
  };

  const renderTaskSummary = (task: TaskConfig): string => {
    const params = task.params as any || {};

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
        return params.text ? `"${params.text.slice(0, 10)}..."` : '音频';
      case 'display':
        return params.message ? `"${params.message.slice(0, 10)}..."` : '';
      case 'signal':
        return `${params.color || '默认'} ${params.pattern || 'blink'}`;
      default:
        return '';
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 13, color: '#666' }}>
          {tasks.length > 0 ? `已配置 ${tasks.length} 个任务` : '暂无任务'}
        </span>
        <Button
          type="primary"
          size="small"
          icon={<SettingOutlined />}
          onClick={onConfigure}
        >
          配置任务
        </Button>
      </div>

      {tasks.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="点击上方按钮配置任务"
          style={{ margin: '16px 0' }}
        />
      ) : (
        <div
          style={{
            maxHeight: 200,
            overflow: 'auto',
            border: '1px solid #f0f0f0',
            borderRadius: 4,
            padding: 8,
          }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            {tasks.map((task, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  background: '#fafafa',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                <span style={{ fontSize: 14 }}>{getTaskIcon(task.type)}</span>
                <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
                  {index + 1}
                </Tag>
                <span style={{ flex: 1, fontWeight: 500 }}>
                  {task.name || getTaskTypeLabel(task.type)}
                </span>
                <span style={{ color: '#999', fontSize: 11 }}>
                  {renderTaskSummary(task)}
                </span>
              </div>
            ))}
          </Space>
        </div>
      )}
    </div>
  );
};
