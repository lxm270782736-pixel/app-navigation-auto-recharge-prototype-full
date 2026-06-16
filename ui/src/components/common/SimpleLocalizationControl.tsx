import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@astribot/ui';
import { CheckCircle2, Crosshair, Loader2, LocateFixed, RefreshCw, Target, XCircle } from 'lucide-react';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus, Pose } from '@/types';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';

interface SimpleLocalizationControlProps {
  onModeChange?: (mode: string) => void;
  onRelocalizationStart?: () => void;
  robotPose?: Pose;
}

type LocalizationMode = 'idle' | 'localization' | 'localization_auto';

const MODE_META: Record<LocalizationMode, { text: string; className: string }> = {
  idle: { text: '未启动', className: 'bg-muted text-muted-foreground' },
  localization: { text: '定位模式（手动）', className: 'bg-emerald-500/15 text-emerald-200' },
  localization_auto: { text: '定位模式（自动）', className: 'bg-sky-500/15 text-sky-200' },
};

export const SimpleLocalizationControl: React.FC<SimpleLocalizationControlProps> = ({
  onModeChange,
  onRelocalizationStart,
  robotPose,
}) => {
  const { connectionStatus } = useRobot();
  const [currentMode, setCurrentMode] = useState<LocalizationMode>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('未启动');
  const [loading, setLoading] = useState<string | null>(null);
  const [failureModalVisible, setFailureModalVisible] = useState(false);
  const [failureMessage, setFailureMessage] = useState('');
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [lastLocalizationType, setLastLocalizationType] = useState<'manual' | 'auto'>('auto');
  const [selectedRelocMode, setSelectedRelocMode] = useState<'auto' | 'manual'>('auto');
  const [switchingModalVisible, setSwitchingModalVisible] = useState(false);
  const [waitingForInitialPoseModalVisible, setWaitingForInitialPoseModalVisible] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    const unsubscribe = apiService.subscribeTopic<{ data: number }>(
      '/localization/mode',
      MESSAGE_TYPES.INT32,
      (msg) => {
        const modeValue = msg.data;

        if (modeValue === 3) {
          setCurrentMode('idle');
          setStatusMessage('未启动');
        } else if (modeValue === 2) {
          if (lastLocalizationType === 'manual') {
            setCurrentMode('localization');
            setStatusMessage('定位模式（手动）');
          } else {
            setCurrentMode('localization_auto');
            setStatusMessage('定位模式（自动）');
          }
        } else if (modeValue === 0) {
          setCurrentMode('idle');
          setStatusMessage('避障模式');
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [connectionStatus, lastLocalizationType]);

  const handleLocalizationManual = async () => {
    setLoading('localization');
    setLastLocalizationType('manual');
    setStatusMessage('启动定位模式...');
    setNotice(null);

    try {
      onRelocalizationStart?.();
      setSwitchingModalVisible(true);
      setTimeout(() => {
        setSwitchingModalVisible(false);
        setWaitingForInitialPoseModalVisible(true);
      }, 2000);

      const result = await apiService.startLocalization();
      setWaitingForInitialPoseModalVisible(false);

      if (result.success) {
        setCurrentMode('localization');
        setStatusMessage('定位模式（手动）');
        setSuccessModalVisible(true);
        onModeChange?.('localization');
      } else {
        setCurrentMode('idle');
        setStatusMessage('定位失败（手动）');
        setFailureMessage(result.message || '初始位置设置失败，请重试');
        setFailureModalVisible(true);
      }
    } catch (error) {
      console.error(error);
      setCurrentMode('idle');
      setStatusMessage('启动失败');
      setWaitingForInitialPoseModalVisible(false);
      setNotice('启动手动重定位失败');
    } finally {
      setLoading(null);
    }
  };

  const handleLocalizationAuto = async () => {
    setLoading('localization_auto');
    setLastLocalizationType('auto');
    setStatusMessage('定位中（自动）...');
    setNotice(null);

    setSwitchingModalVisible(true);
    setTimeout(() => {
      setSwitchingModalVisible(false);
    }, 2000);

    try {
      const result = await apiService.startLocalizationAuto();
      if (result.success) {
        setCurrentMode('localization_auto');
        setStatusMessage('定位模式（自动）');
        setSuccessModalVisible(true);
        onModeChange?.('localization_auto');
      } else {
        setCurrentMode('idle');
        setStatusMessage('定位失败（自动）');
        setFailureMessage(result.message || '定位失败，请重试');
        setFailureModalVisible(true);
      }
    } catch (error) {
      console.error(error);
      setCurrentMode('idle');
      setStatusMessage('定位失败');
      setNotice('启动自动定位模式失败');
    } finally {
      setLoading(null);
    }
  };

  const handleRetryLocalization = () => {
    setFailureModalVisible(false);
    if (lastLocalizationType === 'manual') {
      void handleLocalizationManual();
    } else {
      void handleLocalizationAuto();
    }
  };

  const handleStartRelocalization = () => {
    if (selectedRelocMode === 'auto') {
      void handleLocalizationAuto();
    } else {
      void handleLocalizationManual();
    }
  };

  const modeMeta = MODE_META[currentMode];

  return (
    <>
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">定位控制</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">切换定位模式并执行重定位。</p>
            </div>
            <Badge className={modeMeta.className}>{modeMeta.text}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">当前模式</span>
              <span className="font-medium text-foreground">{modeMeta.text}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">状态信息</span>
              <span className="font-medium text-foreground">{statusMessage}</span>
            </div>
            <div className="border-t border-border/60 pt-2">
              <div className="mb-2 text-muted-foreground">机器人位置</div>
              {robotPose ? (
                <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-foreground">
                  <span>X: {robotPose.x.toFixed(3)}</span>
                  <span>Y: {robotPose.y.toFixed(3)}</span>
                  <span>θ: {((robotPose.theta * 180) / Math.PI).toFixed(1)}°</span>
                </div>
              ) : (
                <div className="text-muted-foreground">未获取</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={selectedRelocMode === 'auto' ? 'default' : 'outline'}
              disabled={loading !== null}
              onClick={() => setSelectedRelocMode('auto')}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              自动
            </Button>
            <Button
              type="button"
              variant={selectedRelocMode === 'manual' ? 'default' : 'outline'}
              disabled={loading !== null}
              onClick={() => setSelectedRelocMode('manual')}
            >
              <Target className="mr-2 h-4 w-4" />
              手动
            </Button>
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={loading !== null}
            onClick={handleStartRelocalization}
          >
            {loading !== null ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : selectedRelocMode === 'auto' ? (
              <RefreshCw className="mr-2 h-4 w-4" />
            ) : (
              <LocateFixed className="mr-2 h-4 w-4" />
            )}
            {loading !== null
              ? `${selectedRelocMode === 'auto' ? '自动' : '手动'}定位中...`
              : `开始${selectedRelocMode === 'auto' ? '自动' : '手动'}重定位`}
          </Button>

          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {loading !== null
              ? '定位过程约需 10 秒，请等待完成。'
              : selectedRelocMode === 'auto'
                ? '自动模式：系统自动搜索机器人位置。'
                : '手动模式：需要在地图上点击机器人初始位置。'}
          </div>

          {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
        </CardContent>
      </Card>

      <Dialog open={switchingModalVisible} onOpenChange={setSwitchingModalVisible}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>定位模式切换中</DialogTitle>
            <DialogDescription>
              {lastLocalizationType === 'manual' ? '正在进入手动定位模式。' : '正在进入自动定位模式。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
              {lastLocalizationType === 'manual'
                ? '请在地图上点击机器人当前位置，并拖拽方向箭头调整朝向。'
                : '系统正在自动搜索机器人位置并匹配地图特征。'}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={successModalVisible} onOpenChange={setSuccessModalVisible}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              定位成功
            </DialogTitle>
            <DialogDescription>机器人位置已成功确定。</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            可以回到地图页面设置目标点，继续导航任务。
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setSuccessModalVisible(false)}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={failureModalVisible} onOpenChange={setFailureModalVisible}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-400" />
              {lastLocalizationType === 'auto' ? '自动定位失败' : '手动定位失败'}
            </DialogTitle>
            <DialogDescription>当前定位流程没有成功完成。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
              失败原因：{failureMessage}
            </div>
            {lastLocalizationType === 'auto' && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                建议切换到手动模式，在地图上手动指定机器人当前位置。
              </div>
            )}
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>检查机器人是否在地图覆盖范围内。</li>
              <li>确认激光雷达工作正常。</li>
              {lastLocalizationType === 'manual' && <li>可以尝试切换到自动定位模式。</li>}
              <li>确认环境特征清晰，再点击重试。</li>
            </ul>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            {lastLocalizationType === 'auto' && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFailureModalVisible(false);
                  setSelectedRelocMode('manual');
                  setNotice('已切换到手动模式，请重新发起重定位。');
                }}
              >
                切换手动模式
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setFailureModalVisible(false)}>取消</Button>
            <Button type="button" onClick={handleRetryLocalization}>重试</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={waitingForInitialPoseModalVisible} onOpenChange={setWaitingForInitialPoseModalVisible}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crosshair className="h-5 w-5 text-primary" />
              请设置机器人初始位置
            </DialogTitle>
            <DialogDescription>手动重定位已经就绪，等待你在地图上指定位置和朝向。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-5 text-center">
              <div className="mb-2 text-4xl">🗺️</div>
              <div className="text-sm font-medium text-foreground">定位模式已就绪，等待地图交互。</div>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li>1. 在地图上找到机器人当前所在位置。</li>
              <li>2. 点击该位置设置初始位置。</li>
              <li>3. 拖拽方向箭头调整机器人朝向。</li>
              <li>4. 系统会自动完成粒子滤波初始化。</li>
            </ol>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              初始位置越准确，定位成功率越高。
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setWaitingForInitialPoseModalVisible(false)}>
              我知道了，开始设置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
