import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@astribot/ui';
import { BatteryCharging, Loader2, PlugZap, Power, RotateCcw, XCircle } from 'lucide-react';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { ConnectionStatus } from '@/types';
import { useRobot } from '@/contexts/RobotContext';

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

const STATUS_BADGE: Record<number, string> = {
  [DockStatusCode.IDLE]: 'bg-muted text-muted-foreground',
  [DockStatusCode.DOCKING]: 'bg-sky-500/15 text-sky-200',
  [DockStatusCode.CHARGING]: 'bg-emerald-500/15 text-emerald-200',
  [DockStatusCode.UNDOCKING]: 'bg-amber-500/15 text-amber-200',
  [DockStatusCode.FAILED]: 'bg-red-500/15 text-red-200',
};

interface DockControlProps {
  isNavigating: boolean;
}

export const DockControl: React.FC<DockControlProps> = ({ isNavigating }) => {
  const { connectionStatus } = useRobot();
  const [dockStatus, setDockStatus] = useState({
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
  const [actionFeedback, setActionFeedback] = useState<{ progress: number; description: string } | null>(null);
  const [isDockActionActive, setIsDockActionActive] = useState(false);
  const [lastError, setLastError] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

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

    return () => {
      unsubscribe();
    };
  }, [connectionStatus]);

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
        setNotice('上桩成功');
      } else {
        setLastError(data.message || `上桩失败 (错误码: ${data.error_code})`);
        setNotice(data.message || '上桩失败');
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
        setNotice('下桩成功');
      } else {
        setLastError(data.message || `下桩失败 (错误码: ${data.error_code})`);
        setNotice(data.message || '下桩失败');
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
      setNotice(null);
      setIsDockActionActive(true);
      await apiService.sendDockGoal(forceRetry);
    } catch (error) {
      console.error('Dock failed:', error);
      setIsDockActionActive(false);
      setNotice('发送上桩指令失败');
    }
  }, []);

  const handleUndock = useCallback(async () => {
    try {
      setLastError('');
      setNotice(null);
      setIsDockActionActive(true);
      await apiService.sendUndockGoal(false);
    } catch (error) {
      console.error('Undock failed:', error);
      setIsDockActionActive(false);
      setNotice('发送下桩指令失败');
    }
  }, []);

  const handleCancel = useCallback(() => {
    apiService.cancelDock();
    setIsDockActionActive(false);
    setActionFeedback(null);
    setNotice('已取消回充操作');
  }, []);

  const isConnected = connectionStatus === ConnectionStatus.CONNECTED;
  const statusCode = dockStatus.status;
  const isDocking = statusCode === DockStatusCode.DOCKING;
  const isCharging = statusCode === DockStatusCode.CHARGING;
  const isUndocking = statusCode === DockStatusCode.UNDOCKING;
  const isFailed = statusCode === DockStatusCode.FAILED;
  const progressPercent = actionFeedback?.progress ?? dockStatus.progress;
  const stageDescription = actionFeedback?.description || dockStatus.state_description;

  return (
    <Card className="border-border/70 bg-card/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">回充控制</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">查看电池状态并发起上桩、下桩操作。</p>
          </div>
          <Badge className={STATUS_BADGE[statusCode] || STATUS_BADGE[DockStatusCode.IDLE]}>
            {STATUS_LABELS[statusCode] || '未知'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected && dockStatus.battery_percentage > 0 && (
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <BatteryCharging className="h-4 w-4" />
                电量
              </span>
              <span className="font-medium text-foreground">
                {Math.round(dockStatus.battery_percentage)}%
                {dockStatus.is_charging && ` · ${dockStatus.charging_current.toFixed(1)}A`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(0, Math.min(Math.round(dockStatus.battery_percentage), 100))}%` }}
              />
            </div>
          </div>
        )}

        {(isDocking || isUndocking) && (
          <div className="space-y-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-sky-100">{isDocking ? '上桩进度' : '下桩进度'}</span>
              <span className="font-medium text-sky-100">{Math.round(progressPercent)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(0, Math.min(Math.round(progressPercent), 100))}%` }}
              />
            </div>
            {stageDescription && (
              <div className="flex items-center gap-2 text-xs text-sky-100">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {stageDescription}
              </div>
            )}
          </div>
        )}

        {isFailed && lastError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            {lastError}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {isDockActionActive ? (
            <Button type="button" variant="destructive" className="sm:col-span-2" onClick={handleCancel}>
              <XCircle className="mr-2 h-4 w-4" />
              取消
            </Button>
          ) : isFailed ? (
            <Button
              type="button"
              className="sm:col-span-2"
              onClick={() => void handleDock(true)}
              disabled={!isConnected || isNavigating}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              重试上桩
            </Button>
          ) : isCharging ? (
            <Button
              type="button"
              variant="outline"
              className="sm:col-span-2"
              onClick={() => void handleUndock()}
              disabled={!isConnected || isNavigating}
            >
              <Power className="mr-2 h-4 w-4" />
              下桩
            </Button>
          ) : (
            <>
              <Button
                type="button"
                onClick={() => void handleDock(false)}
                disabled={!isConnected || isNavigating || isDocking || isUndocking}
              >
                <PlugZap className="mr-2 h-4 w-4" />
                上桩
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleUndock()}
                disabled={!isConnected || isNavigating || isDocking || isUndocking}
              >
                <Power className="mr-2 h-4 w-4" />
                下桩
              </Button>
            </>
          )}
        </div>

        {isNavigating && !isDockActionActive && (
          <div className="text-xs text-amber-200">导航中，回充操作已禁用。</div>
        )}

        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      </CardContent>
    </Card>
  );
};
