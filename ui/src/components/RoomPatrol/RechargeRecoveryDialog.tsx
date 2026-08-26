import { useEffect, useState } from 'react';
import { Clock3, LocateFixed, RotateCcw } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@astribot/ui';

import type { RechargeResumeConfig } from '@/types';

type WaypointOption = {
  value: string;
  label: string;
};

type RechargeRecoveryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskName: string;
  value?: RechargeResumeConfig;
  waypointOptions: WaypointOption[];
  onApply: (value: RechargeResumeConfig) => void;
  onClear: () => void;
};

export function RechargeRecoveryDialog({
  open,
  onOpenChange,
  taskName,
  value,
  waypointOptions,
  onApply,
  onClear,
}: RechargeRecoveryDialogProps) {
  const [resumeTime, setResumeTime] = useState(value?.time || '09:00');
  const [resumePoint, setResumePoint] = useState(value?.waypoint_id || waypointOptions[0]?.value || '');
  const [resumeMode, setResumeMode] = useState<RechargeResumeConfig['mode']>(value?.mode || 'immediate');

  useEffect(() => {
    if (!open) return;
    setResumeTime(value?.time || '09:00');
    setResumePoint(value?.waypoint_id || waypointOptions[0]?.value || '');
    setResumeMode(value?.mode || 'immediate');
  }, [open]);

  const handleApply = () => {
    onApply(resumeMode === 'scheduled'
      ? { mode: 'scheduled', time: resumeTime, waypoint_id: resumePoint }
      : { mode: 'immediate' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="recharge-recovery-settings">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <DialogTitle>自动回充后恢复任务</DialogTitle>
            <Badge variant="secondary">{taskName}</Badge>
          </div>
          <DialogDescription className="leading-6">
            仅在自动回充打断该任务时生效；一键回充不会自动恢复任务。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setResumeMode('immediate')}
            className={'rounded-md border p-3 text-left transition-colors ' + (resumeMode === 'immediate' ? 'border-primary bg-primary/10' : 'border-border bg-muted/15 hover:bg-muted/30')}
          >
            <p className="text-sm font-medium text-foreground">充满后自动恢复</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">前往任务起点，从第一步重新开始。</p>
          </button>
          <button
            type="button"
            onClick={() => setResumeMode('scheduled')}
            className={'rounded-md border p-3 text-left transition-colors ' + (resumeMode === 'scheduled' ? 'border-primary bg-primary/10' : 'border-border bg-muted/15 hover:bg-muted/30')}
          >
            <p className="text-sm font-medium text-foreground">指定时间恢复</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">到设定时间后，前往固定点重新开始任务。</p>
          </button>
        </div>

        {resumeMode === 'scheduled' && (
          <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="recharge-resume-time">恢复时间</Label>
            <div className="relative">
              <Clock3 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="recharge-resume-time"
                type="time"
                value={resumeTime}
                onInput={(event) => {
                  setResumeTime((event.target as HTMLInputElement).value);
                }}
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recharge-resume-point">固定恢复点</Label>
            <div className="relative">
              <LocateFixed className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <select
                id="recharge-resume-point"
                value={resumePoint}
                onChange={(event) => {
                  setResumePoint(event.target.value);
                }}
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground"
              >
                {waypointOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          </div>
        )}

        <div className="rounded-md border border-border bg-muted/25 px-4 py-3 text-sm leading-6 text-foreground">
          {resumeMode === 'scheduled'
            ? '到达恢复时间且电量足以安全离桩时，机器人前往固定恢复点并从第一步开始；电量不足时继续充电。'
            : '达到可安全离桩的电量后，机器人前往任务起点并从第一步开始。'}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {value ? (
            <Button variant="ghost" onClick={() => { onClear(); onOpenChange(false); }}>
              <RotateCcw className="mr-2 h-4 w-4" />
              使用默认恢复
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>取消</Button>
            <Button
              disabled={resumeMode === 'scheduled' && (!resumeTime || !resumePoint)}
              onClick={handleApply}
            >
              应用到任务
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
