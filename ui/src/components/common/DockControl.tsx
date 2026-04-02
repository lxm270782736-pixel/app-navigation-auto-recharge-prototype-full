import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Progress, message } from 'antd';
import {
  ThunderboltOutlined,
  PoweroffOutlined,
  LoadingOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { ConnectionStatus } from '@/types';
import { useRobot } from '@/contexts/RobotContext';

// DockStatus 状态码
enum DockStatusCode {
  IDLE = 0,
  DOCKING = 1,
  CHARGING = 2,
  UNDOCKING = 3,
  FAILED = 4,
}

const STATUS_LABELS: Record<number, string> = {
  [DockStatusCode.IDLE]: '空闲',
  [DockStatusCode.DOCKING]: '上桩中',
  [DockStatusCode.CHARGING]: '充电中',
  [DockStatusCode.UNDOCKING]: '下桩中',
  [DockStatusCode.FAILED]: '失败',
};

const STATUS_COLORS: Record<number, string> = {
  [DockStatusCode.IDLE]: '#999',
  [DockStatusCode.DOCKING]: '#1890ff',
  [DockStatusCode.CHARGING]: '#52c41a',
  [DockStatusCode.UNDOCKING]: '#faad14',
  [DockStatusCode.FAILED]: '#ff4d4f',
};

interface DockControlProps {
  isNavigating: boolean;
}

export const DockControl: React.FC<DockControlProps> = ({ isNavigating }) => {
  const { connectionStatus } = useRobot();

  // 来自 /dock_status 话题的状态
  const [dockStatus, setDockStatus] = useState<{
    status: number;
    state_code: number;
    state_description: string;
    progress: number;
    error_code: number;
    battery_percentage: number;
    is_charging: boolean;
    charging_current: number;
    qr_detected: boolean;
    dock_mode: number;
  }>({
    status: DockStatusCode.IDLE,
    state_code: 0,
    state_description: '',
    progress: 0,
    error_code: 0,
    battery_percentage: 0,
    is_charging: false,
    charging_current: 0,
    qr_detected: false,
    dock_mode: 0,
  });

  // Action 执行中的 feedback 状态
  const [actionFeedback, setActionFeedback] = useState<{
    progress: number;
    description: string;
  } | null>(null);

  // 是否有 action 正在执行
  const [isDockActionActive, setIsDockActionActive] = useState(false);
  // 上次失败的错误信息
  const [lastError, setLastError] = useState<string>('');

  // 订阅 /dock_status 话题
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    const unsubscribe = apiService.subscribeTopic<any>(
      '/dock_status',
      MESSAGE_TYPES.DOCK_STATUS,
      (msg) => {
        setDockStatus({
          status: msg.status ?? DockStatusCode.IDLE,
          state_code: msg.state_code ?? 0,
          state_description: msg.state_description ?? '',
          progress: msg.progress ?? 0,
          error_code: msg.error_code ?? 0,
          battery_percentage: msg.battery_percentage ?? 0,
          is_charging: msg.is_charging ?? false,
          charging_current: msg.charging_current ?? 0,
          qr_detected: msg.qr_detected ?? false,
          dock_mode: msg.dock_mode ?? 0,
        });
      }
    );

    return () => { unsubscribe(); };
  }, [connectionStatus]);

  // 监听 dock action 事件
  useEffect(() => {
    const handleDockFeedback = (data: any) => {
      setActionFeedback({
        progress: data.progress ?? 0,
        description: data.state_description ?? '',
      });
      setIsDockActionActive(true);
    };

    const handleDockResult = (data: any) => {
      setIsDockActionActive(false);
      setActionFeedback(null);
      if (data.success) {
        message.success('上桩成功');
      } else {
        setLastError(data.message || `上桩失败 (错误码: ${data.error_code})`);
        message.error(data.message || '上桩失败');
      }
    };

    const handleUndockFeedback = (data: any) => {
      setActionFeedback({
        progress: data.progress ?? 0,
        description: data.state_description ?? '',
      });
      setIsDockActionActive(true);
    };

    const handleUndockResult = (data: any) => {
      setIsDockActionActive(false);
      setActionFeedback(null);
      if (data.success) {
        message.success('下桩成功');
      } else {
        setLastError(data.message || `下桩失败 (错误码: ${data.error_code})`);
        message.error(data.message || '下桩失败');
      }
    };

    apiService.on('dock-feedback', handleDockFeedback);
    apiService.on('dock-result', handleDockResult);
    apiService.on('undock-feedback', handleUndockFeedback);
    apiService.on('undock-result', handleUndockResult);

    return () => {
      apiService.off('dock-feedback', handleDockFeedback);
      apiService.off('dock-result', handleDockResult);
      apiService.off('undock-feedback', handleUndockFeedback);
      apiService.off('undock-result', handleUndockResult);
    };
  }, []);

  const handleDock = useCallback(async (forceRetry = false) => {
    try {
      setLastError('');
      setIsDockActionActive(true);
      await apiService.sendDockGoal(forceRetry);
    } catch (error) {
      setIsDockActionActive(false);
      message.error('发送上桩指令失败');
      console.error('Dock failed:', error);
    }
  }, []);

  const handleUndock = useCallback(async () => {
    try {
      setLastError('');
      setIsDockActionActive(true);
      await apiService.sendUndockGoal(false);
    } catch (error) {
      setIsDockActionActive(false);
      message.error('发送下桩指令失败');
      console.error('Undock failed:', error);
    }
  }, []);

  const handleCancel = useCallback(() => {
    apiService.cancelDock();
    setIsDockActionActive(false);
    setActionFeedback(null);
    message.info('已取消');
  }, []);

  const isConnected = connectionStatus === ConnectionStatus.CONNECTED;
  const statusCode = dockStatus.status;
  const isDocking = statusCode === DockStatusCode.DOCKING;
  const isCharging = statusCode === DockStatusCode.CHARGING;
  const isUndocking = statusCode === DockStatusCode.UNDOCKING;
  const isFailed = statusCode === DockStatusCode.FAILED;

  // 进度百分比：优先使用 action feedback，否则用 dock_status
  const progressPercent = actionFeedback?.progress ?? dockStatus.progress;
  const stageDescription = actionFeedback?.description || dockStatus.state_description;

  return (
    <Card
      title="回充控制"
      size="small"
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
      extra={
        <span style={{
          fontSize: '12px',
          color: STATUS_COLORS[statusCode] || '#999',
          fontWeight: 600,
        }}>
          {STATUS_LABELS[statusCode] || '未知'}
        </span>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* 电量信息 */}
        {isConnected && dockStatus.battery_percentage > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <ThunderboltOutlined style={{
              color: dockStatus.is_charging ? '#52c41a' : '#999',
              fontSize: '14px',
            }} />
            <Progress
              percent={Math.round(dockStatus.battery_percentage)}
              size="small"
              style={{ flex: 1, marginBottom: 0 }}
              strokeColor={
                dockStatus.battery_percentage > 50 ? '#52c41a' :
                dockStatus.battery_percentage > 20 ? '#faad14' : '#ff4d4f'
              }
              format={(p) => `${p}%`}
            />
            {dockStatus.is_charging && (
              <span style={{ fontSize: '11px', color: '#52c41a' }}>
                {dockStatus.charging_current.toFixed(1)}A
              </span>
            )}
          </div>
        )}

        {/* 上桩/下桩进度 */}
        {(isDocking || isUndocking) && (
          <div>
            <div style={{
              fontSize: '12px',
              color: '#666',
              marginBottom: '4px',
            }}>
              {isDocking ? '上桩' : '下桩'}进度
            </div>
            <Progress
              percent={Math.round(progressPercent)}
              size="small"
              status="active"
              style={{ marginBottom: 0 }}
            />
            {stageDescription && (
              <div style={{
                fontSize: '11px',
                color: '#888',
                marginTop: '4px',
              }}>
                <LoadingOutlined style={{ marginRight: 4 }} />
                {stageDescription}
              </div>
            )}
          </div>
        )}

        {/* 失败信息 */}
        {isFailed && lastError && (
          <div style={{
            padding: '8px',
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#ff4d4f',
          }}>
            {lastError}
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {isDockActionActive ? (
            // 执行中：显示取消按钮
            <Button
              danger
              block
              icon={<CloseCircleOutlined />}
              onClick={handleCancel}
            >
              取消
            </Button>
          ) : isFailed ? (
            // 失败：显示重试按钮
            <Button
              type="primary"
              block
              icon={<ReloadOutlined />}
              onClick={() => handleDock(true)}
              disabled={!isConnected || isNavigating}
            >
              重试上桩
            </Button>
          ) : isCharging ? (
            // 充电中：显示下桩按钮
            <Button
              block
              icon={<PoweroffOutlined />}
              onClick={handleUndock}
              disabled={!isConnected || isNavigating}
            >
              下桩
            </Button>
          ) : (
            // 空闲 / 其他：显示上桩和下桩按钮
            <>
              <Button
                type="primary"
                block
                icon={<ThunderboltOutlined />}
                onClick={() => handleDock(false)}
                disabled={!isConnected || isNavigating || isDocking || isUndocking}
              >
                上桩
              </Button>
              <Button
                block
                icon={<PoweroffOutlined />}
                onClick={handleUndock}
                disabled={!isConnected || isNavigating || isDocking || isUndocking}
              >
                下桩
              </Button>
            </>
          )}
        </div>

        {/* 导航中禁用提示 */}
        {isNavigating && !isDockActionActive && (
          <div style={{
            fontSize: '11px',
            color: '#faad14',
          }}>
            导航中，回充操作已禁用
          </div>
        )}
      </div>
    </Card>
  );
};
