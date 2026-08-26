import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  Route,
  X,
} from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@astribot/ui';

type SetupStage = 'confirm' | 'running' | 'success' | 'failure';

type OneClickRechargeSetupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStage?: SetupStage;
  failureAttempt?: 'position-single' | 'position-repeat' | 'docking-single' | 'docking-repeat' | 'not-front';
  onComplete?: () => void;
};

const SETUP_STEPS = [
  { label: '确认机器人当前位置', icon: Bot },
  { label: '识别充电桩', icon: Camera },
  { label: '对接充电桩', icon: Route },
  { label: '检测充电状态', icon: BatteryCharging },
];

function SetupIllustration() {
  return (
    <div className="rounded-lg border border-border bg-background/50 px-5 py-6">
      <div className="flex items-center justify-center gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-primary">
            <Bot className="h-8 w-8" />
          </div>
          <span className="text-xs text-muted-foreground">机器人</span>
        </div>
        <div className="flex min-w-24 flex-col items-center gap-1 text-xs text-muted-foreground">
          <span>约 30-50cm</span>
          <div className="flex w-full items-center gap-1 text-primary">
            <span className="h-px flex-1 border-t border-dashed border-primary/60" />
            <Route className="h-4 w-4 rotate-180" />
          </div>
          <span>摄像头朝向标识</span>
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-orange-400/60 bg-orange-400/10 text-orange-300">
            <BatteryCharging className="h-8 w-8" />
          </div>
          <span className="text-xs text-muted-foreground">充电桩</span>
        </div>
      </div>
    </div>
  );
}

function StepRow({ index, activeIndex, failure }: { index: number; activeIndex: number; failure?: boolean }) {
  const StepIcon = SETUP_STEPS[index].icon;
  const done = index < activeIndex;
  const active = index === activeIndex;
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${done ? 'bg-emerald-500/10 text-emerald-300' : active && failure ? 'bg-red-500/10 text-red-300' : active ? 'bg-primary/10 text-primary' : 'bg-muted/40 text-muted-foreground'}`}>
          {done ? <Check className="h-4 w-4" /> : active && failure ? <AlertTriangle className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <StepIcon className="h-4 w-4" />}
        </div>
        <span className={`text-sm ${active || done ? 'text-foreground' : 'text-muted-foreground'}`}>{SETUP_STEPS[index].label}</span>
      </div>
      <span className={`text-xs ${done ? 'text-emerald-300' : active && failure ? 'text-red-300' : active ? 'text-primary' : 'text-muted-foreground'}`}>
        {done ? '完成' : active && failure ? '失败' : active ? '进行中' : '等待'}
      </span>
    </div>
  );
}

export function OneClickRechargeSetupDialog({
  open,
  onOpenChange,
  initialStage = 'confirm',
  failureAttempt = 'position-single',
  onComplete,
}: OneClickRechargeSetupDialogProps) {
  const [stage, setStage] = useState<SetupStage>(initialStage);
  const [activeIndex, setActiveIndex] = useState(initialStage === 'failure' ? 2 : initialStage === 'success' ? SETUP_STEPS.length : initialStage === 'running' ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    setStage(initialStage);
    setActiveIndex(initialStage === 'failure' ? 2 : initialStage === 'success' ? SETUP_STEPS.length : initialStage === 'running' ? 1 : 0);
  }, [initialStage, open]);

  useEffect(() => {
    if (!open || stage !== 'running') return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => {
        if (current >= SETUP_STEPS.length) {
          window.clearInterval(timer);
          setStage('success');
          onComplete?.();
          return current;
        }
        return current + 1;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [onComplete, open, stage]);

  function beginSetup() {
    setActiveIndex(1);
    setStage('running');
  }

  function cancel() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="one-click-recharge-setup-dialog">
        {stage === 'confirm' && (
          <>
            <DialogHeader className="space-y-2">
              <DialogTitle className="flex items-center justify-between pr-5">设置回充位置</DialogTitle>
              <DialogDescription className="leading-6">
                请先将机器人停在充电桩前方约 30-50cm，确保摄像头能看到充电桩标识。
              </DialogDescription>
            </DialogHeader>
            <SetupIllustration />
            <div className="space-y-2 text-xs leading-5 text-muted-foreground">
              <p>设置前请确认回充路线没有斜坡或低矮障碍物，充电桩前方无遮挡；复杂环境请留意机器人状态。</p>
              <p>开始后请不要移动机器人或充电桩。</p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={cancel}>取消</Button>
              <Button onClick={beginSetup}><BatteryCharging className="mr-2 h-4 w-4" />开始设置</Button>
            </DialogFooter>
          </>
        )}

        {stage === 'running' && (
          <>
            <DialogHeader className="space-y-2">
              <DialogTitle className="flex items-center gap-2"><BatteryCharging className="h-5 w-5 text-primary" />设置一键回充中</DialogTitle>
              <DialogDescription className="leading-6">机器人将识别充电桩并完成低速对接；设置成功前，请不要移动机器人或充电桩。</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {SETUP_STEPS.map((_, index) => <StepRow key={index} index={index} activeIndex={activeIndex} />)}
            </div>
            <DialogFooter><Button variant="secondary" onClick={cancel}>取消</Button></DialogFooter>
          </>
        )}

        {stage === 'success' && (
          <>
            <DialogHeader className="space-y-2">
              <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-300" />一键回充设置成功</DialogTitle>
              <DialogDescription className="leading-6">已保存当前地图的回充位置，之后可以从首页或导览任务入口长按发起一键回充。</DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-foreground">
              机器人已识别充电桩并检测到充电状态。位置变化后，请重新设置。
            </div>
            <DialogFooter><Button onClick={() => onOpenChange(false)}>完成</Button></DialogFooter>
          </>
        )}

        {stage === 'failure' && (
          <>
            <DialogHeader className="space-y-2">
              <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-300" />一键回充设置失败</DialogTitle>
              <DialogDescription className="leading-6">
                {failureAttempt === 'not-front'
                ? '机器人当前不在充电桩前方，无法设置回充位置。'
                  : failureAttempt?.startsWith('docking')
                    ? '未能完成充电桩低速对接，当前回充位置没有被覆盖。'
                    : '未能完成定位导航，当前回充位置没有被覆盖。'}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-foreground">
              {failureAttempt === 'not-front'
                ? '请先将机器人停在充电桩前，再点击“设置回充位置”。'
                : failureAttempt === 'position-repeat'
                  ? '连续多次定位失败，请进入导航功能进行手动重定位，或联系客服处理。'
                  : failureAttempt === 'docking-repeat'
                    ? '连续多次对接失败，请确认充电桩位置没有移动、前方无遮挡，并联系客服处理。'
                    : failureAttempt?.startsWith('docking')
                      ? '请确认充电桩位置没有移动、前方无遮挡。当前为首次对接报错，可重试设置。'
                      : '请检查回充路线和充电桩位置。当前为首次定位报错，可重试设置。'}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={cancel}><X className="mr-2 h-4 w-4" />关闭</Button>
              {failureAttempt === 'position-repeat' || failureAttempt === 'docking-repeat' ? (
                <Button onClick={() => onOpenChange(false)}>去导航处理</Button>
              ) : (
                <Button onClick={() => { setStage('confirm'); setActiveIndex(0); }}>重试设置</Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
