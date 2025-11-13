import React from 'react';
import { Card, Progress, Tag, Timeline, Space } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { TaskExecutionState, TaskStatus } from '@/types';

interface TaskMonitorProps {
  tasks: TaskExecutionState[];
  compact?: boolean;
}

export const TaskMonitor: React.FC<TaskMonitorProps> = ({ tasks, compact = false }) => {
  if (tasks.length === 0) {
    return null;
  }

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.PENDING:
        return <ClockCircleOutlined style={{ color: '#d9d9d9' }} />;
      case TaskStatus.RUNNING:
        return <LoadingOutlined style={{ color: '#1890ff' }} />;
      case TaskStatus.COMPLETED:
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case TaskStatus.FAILED:
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case TaskStatus.CANCELLED:
        return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
      case TaskStatus.RETRYING:
        return <LoadingOutlined style={{ color: '#faad14' }} />;
      default:
        return <ClockCircleOutlined />;
    }
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.PENDING:
        return 'default';
      case TaskStatus.RUNNING:
        return 'processing';
      case TaskStatus.COMPLETED:
        return 'success';
      case TaskStatus.FAILED:
        return 'error';
      case TaskStatus.CANCELLED:
        return 'warning';
      case TaskStatus.RETRYING:
        return 'warning';
      default:
        return 'default';
    }
  };

  const getStatusText = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.PENDING:
        return '等待中';
      case TaskStatus.RUNNING:
        return '执行中';
      case TaskStatus.COMPLETED:
        return '已完成';
      case TaskStatus.FAILED:
        return '失败';
      case TaskStatus.CANCELLED:
        return '已取消';
      case TaskStatus.RETRYING:
        return '重试中';
      default:
        return status;
    }
  };

  const calculateOverallProgress = () => {
    if (tasks.length === 0) return 0;
    const completedTasks = tasks.filter(
      (t) => t.status === TaskStatus.COMPLETED
    ).length;
    return (completedTasks / tasks.length) * 100;
  };

  if (compact) {
    return (
      <Card size="small" title="任务执行状态" style={{ fontSize: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div>
            <div style={{ marginBottom: 4 }}>总体进度</div>
            <Progress
              percent={Math.round(calculateOverallProgress())}
              size="small"
              status={tasks.some((t) => t.status === TaskStatus.FAILED) ? 'exception' : 'active'}
            />
          </div>

          {tasks.map((task, index) => (
            <div
              key={task.taskId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
              }}
            >
              {getStatusIcon(task.status)}
              <span style={{ flex: 1, fontSize: 11 }}>
                {index + 1}. {task.message || task.taskId}
              </span>
              <Tag size="small" color={getStatusColor(task.status)}>
                {getStatusText(task.status)}
              </Tag>
            </div>
          ))}
        </Space>
      </Card>
    );
  }

  return (
    <Card title="任务执行监控" size="small">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* 总体进度 */}
        <div>
          <div style={{ marginBottom: 8, fontWeight: 'bold' }}>总体进度</div>
          <Progress
            percent={Math.round(calculateOverallProgress())}
            status={
              tasks.some((t) => t.status === TaskStatus.FAILED)
                ? 'exception'
                : tasks.every((t) => t.status === TaskStatus.COMPLETED)
                ? 'success'
                : 'active'
            }
          />
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            已完成 {tasks.filter((t) => t.status === TaskStatus.COMPLETED).length} /{' '}
            {tasks.length} 个任务
          </div>
        </div>

        {/* 任务时间线 */}
        <div>
          <div style={{ marginBottom: 8, fontWeight: 'bold' }}>任务详情</div>
          <Timeline>
            {tasks.map((task, index) => {
              const isActive = task.status === TaskStatus.RUNNING;
              const isCompleted = task.status === TaskStatus.COMPLETED;
              const isFailed =
                task.status === TaskStatus.FAILED || task.status === TaskStatus.CANCELLED;

              return (
                <Timeline.Item
                  key={task.taskId}
                  dot={getStatusIcon(task.status)}
                  color={
                    isCompleted
                      ? 'green'
                      : isActive
                      ? 'blue'
                      : isFailed
                      ? 'red'
                      : 'gray'
                  }
                >
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                      任务 {index + 1}: {task.taskId}
                    </div>

                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                      <Tag color={getStatusColor(task.status)}>
                        {getStatusText(task.status)}
                      </Tag>
                      {task.message && <span>{task.message}</span>}
                    </div>

                    {/* 进度条 */}
                    {isActive && task.progress !== undefined && (
                      <Progress
                        percent={Math.round(task.progress)}
                        size="small"
                        status="active"
                      />
                    )}

                    {/* 执行时间 */}
                    {task.startTime && (
                      <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                        开始时间:{' '}
                        {new Date(task.startTime).toLocaleTimeString('zh-CN')}
                        {task.endTime && (
                          <>
                            {' '}
                            | 耗时:{' '}
                            {((task.endTime - task.startTime) / 1000).toFixed(1)} 秒
                          </>
                        )}
                      </div>
                    )}

                    {/* 错误信息 */}
                    {task.error && (
                      <div
                        style={{
                          marginTop: 4,
                          padding: 8,
                          background: '#fff2f0',
                          border: '1px solid #ffccc7',
                          borderRadius: 4,
                          fontSize: 11,
                          color: '#cf1322',
                        }}
                      >
                        错误: {task.error}
                      </div>
                    )}

                    {/* 任务结果 */}
                    {task.result && (
                      <div
                        style={{
                          marginTop: 4,
                          padding: 8,
                          background: '#f6ffed',
                          border: '1px solid #b7eb8f',
                          borderRadius: 4,
                          fontSize: 11,
                          color: '#389e0d',
                        }}
                      >
                        结果: {JSON.stringify(task.result)}
                      </div>
                    )}
                  </div>
                </Timeline.Item>
              );
            })}
          </Timeline>
        </div>
      </Space>
    </Card>
  );
};

// 简化版本的任务状态显示（用于导航控制面板）
export const TaskStatusBadge: React.FC<{ task: TaskExecutionState }> = ({ task }) => {
  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.RUNNING:
        return 'processing';
      case TaskStatus.COMPLETED:
        return 'success';
      case TaskStatus.FAILED:
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Tag color={getStatusColor(task.status)}>
      {task.message || task.taskId}
    </Tag>
  );
};
