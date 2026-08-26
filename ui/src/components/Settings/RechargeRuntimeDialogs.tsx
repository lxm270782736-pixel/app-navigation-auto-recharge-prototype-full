import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BatteryWarning, RotateCcw, Wrench } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@astribot/ui';

type ConflictScenario = {
  title: string;
  description: string;
  detail?: string;
  secondary: string;
  primary?: string;
  danger?: boolean;
};

const CONFLICT_SCENARIOS: Record<string, ConflictScenario> = {
  'conflict-low': {
    title: '低电量，讲解完成后回充？',
    description: '当前电量为 10%。机器人会完成当前讲解，再前往充电桩。',
    detail: '确认后，本次讲解继续执行；讲解完成后自动开始回充。',
    secondary: '暂不回充',
    primary: '讲解完成后回充',
  },
  'task-interrupt-blocked': {
    title: '当前电量不足，暂不能接收新任务',
    description: '当前电量不高于安全电量。正在回充的任务不能被新的任务打断。',
    secondary: '知道了',
  },
  'task-interrupt-allowed': {
    title: '可以接收新任务',
    description: '当前电量高于安全电量。新的任务可以打断当前回充任务。',
    secondary: '知道了',
  },
};

const FAILURE_SCENARIOS: Record<string, { title: string; description: string; singleDetail: string; repeatDetail: string }> = {
  'navigation-obstacle': {
    title: '回充导航遇到障碍',
    description: '机器人已安全停止，暂时无法继续前往充电桩。',
    singleDetail: '这是本次回充的首次报错。清理障碍后，可重试导航。',
    repeatDetail: '这是本次回充的多次报错。请进入导航功能手动重定位，或联系客服处理。',
  },
  'dock-obstacle': {
    title: '充电桩前有障碍物',
    description: '机器人已到达充电桩前，但检测到对接区域被占用。',
    singleDetail: '机器人原地不动并播报提示；播报后 1 分钟自动重试导航对桩。',
    repeatDetail: '桩前障碍已多次出现。机器人停止对桩，等待人工清理现场。',
  },
  'docking-failed': {
    title: '充电桩对接失败',
    description: '机器人未能完成低速对接，已停在当前位置。',
    singleDetail: '这是本次回充的首次报错。确认桩位和对接区域后，可重试。',
    repeatDetail: '这是本次回充的多次报错。请确认桩位、遮挡和对接条件，并联系客服处理。',
  },
};

const SIMPLE_SCENARIOS: Record<string, ConflictScenario> = {
  'map-changed': {
    title: '地图已更换，回充位置需要重新设置',
    description: '当前地图与已保存的回充位置不一致，暂不能直接使用原位置。',
    detail: '请在当前地图下重新设置回充位置。',
    secondary: '知道了',
  },
  'dock-placement': {
    title: '充电桩摆放可能影响回充',
    description: '充电桩未固定或摆放不正确，可能导致多次回充失败。',
    detail: '请检查充电桩是否固定，以及回充区域是否无遮挡。',
    secondary: '知道了',
  },
  'cannot-locate': {
    title: '无法定位到充电桩前',
    description: '机器人已安全停止，暂时无法继续回充。',
    detail: '请检查当前地图、定位状态和回充位置设置。',
    secondary: '知道了',
  },
  'dock-shifted': {
    title: '充电桩位置可能已变化',
    description: '当前充电桩位置偏移过大，暂不允许继续回充。',
    detail: '请将充电桩恢复到原位置，并重新设置回充位置。',
    secondary: '知道了',
  },
  'recharge-stopped': {
    title: '回充已停止',
    description: '本次回充已结束，机器人进入自然待机状态。',
    detail: '如需继续回充，请重新长按一键回充。',
    secondary: '知道了',
  },
};

const CHARGING_INTERRUPTED: ConflictScenario = {
  title: '充电已中断',
  description: '机器人暂时没有检测到稳定的充电状态，已停止当前充电。',
  detail: '请检查充电桩电源、机器人与充电桩的连接状态。机器人不会自动反复重新对接，你可以手动重试，或退出本次回充。',
  secondary: '退出本次回充',
  primary: '重试充电',
};

export function RechargeRuntimeDialogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mock = searchParams.get('mockTrigger') || '';
  const attempt = searchParams.get('attempt') || 'early';
  const [open, setOpen] = useState(Boolean(mock));
  const scenario = CONFLICT_SCENARIOS[mock];
  const simpleScenario = SIMPLE_SCENARIOS[mock];
  const chargingInterrupted = mock === 'charging-interrupted' ? CHARGING_INTERRUPTED : null;

  useEffect(() => {
    setOpen(Boolean(mock));
  }, [mock]);

  function closeDialog() {
    setOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete('mockTrigger');
    next.delete('attempt');
    setSearchParams(next);
  }

  if (scenario) {
    return (
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeDialog(); }}>
        <DialogContent className="sm:max-w-md" data-testid={`runtime-${mock}`}>
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2">
              <BatteryWarning className="h-5 w-5 text-amber-300" />
              {scenario.title}
            </DialogTitle>
            <DialogDescription className="leading-6">{scenario.description}</DialogDescription>
          </DialogHeader>

          {scenario.detail && (
            <div className="rounded-lg border border-border bg-muted/25 px-4 py-3 text-sm leading-5 text-foreground">
              {scenario.detail}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={closeDialog}>{scenario.secondary}</Button>
            {scenario.primary && <Button onClick={closeDialog}>{scenario.primary}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (simpleScenario) {
    return (
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeDialog(); }}>
        <DialogContent className="sm:max-w-md" data-testid={`runtime-${mock}`}>
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-amber-300" />
              {simpleScenario.title}
            </DialogTitle>
            <DialogDescription className="leading-6">{simpleScenario.description}</DialogDescription>
          </DialogHeader>
          {simpleScenario.detail && <div className="rounded-lg border border-border bg-muted/25 px-4 py-3 text-sm leading-5 text-foreground">{simpleScenario.detail}</div>}
          <DialogFooter><Button variant="secondary" onClick={closeDialog}>{simpleScenario.secondary}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (chargingInterrupted) {
    return (
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeDialog(); }}>
        <DialogContent className="sm:max-w-md" data-testid="runtime-charging-interrupted">
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2">
              <BatteryWarning className="h-5 w-5 text-red-300" />
              {chargingInterrupted.title}
            </DialogTitle>
            <DialogDescription className="leading-6">{chargingInterrupted.description}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-foreground">
            {chargingInterrupted.detail}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={closeDialog}>{chargingInterrupted.secondary}</Button>
            <Button onClick={closeDialog}><RotateCcw className="mr-2 h-4 w-4" />{chargingInterrupted.primary}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const failure = FAILURE_SCENARIOS[mock];
  if (failure) {
    return (
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeDialog(); }}>
        <DialogContent className="sm:max-w-md" data-testid={`runtime-${mock}`}>
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-red-300" />
              {failure.title}
            </DialogTitle>
            <DialogDescription className="leading-6">{failure.description}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-5 text-foreground">
            {attempt === 'repeat' || attempt === 'third' ? failure.repeatDetail : failure.singleDetail}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={closeDialog}>停止回充</Button>
            {attempt !== 'repeat' && attempt !== 'third' && <Button onClick={closeDialog}><RotateCcw className="mr-2 h-4 w-4" />重试</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
