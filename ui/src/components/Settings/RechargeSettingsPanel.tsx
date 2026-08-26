import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  Loader2,
  MapPinned,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
} from '@astribot/ui';
import { OneClickRechargeSetupDialog } from './OneClickRechargeSetupDialog';

type LoadState = 'loading' | 'error' | 'ready';
type RechargeSettings = {
  lowPowerMode: 'immediate' | 'after-guide';
  lowPowerThreshold: number;
  callDuringTaskEnabled: boolean;
  safeThreshold: number;
  autoResumeEnabled: boolean;
};

type Notice = {
  tone: 'success' | 'error';
  text: string;
};

type StrategyGroupProps = {
  title: string;
  description: string;
  action: React.ReactNode;
  disabled?: boolean;
  children?: React.ReactNode;
};

function StrategyGroup({ title, description, action, disabled, children }: StrategyGroupProps) {
  return (
    <section className={'space-y-4 rounded-lg border border-border p-4 ' + (disabled ? 'opacity-60' : 'bg-card/40')}>
      <div className="flex items-start justify-between gap-5">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {children}
    </section>
  );
}

function NumberField({
  id,
  label,
  value,
  unit,
  min,
  max,
  disabled,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  disabled?: boolean;
  error?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className={'flex h-10 overflow-hidden rounded-md border bg-background ' + (error ? 'border-red-500/70' : 'border-input')}>
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={id + '-help'}
          onChange={(event) => onChange(Number(event.target.value))}
          onBlur={() => {
            if (!Number.isFinite(value)) onChange(min);
          }}
          className="h-10 rounded-none border-0 bg-transparent focus-visible:ring-0"
        />
        <span className="flex min-w-14 items-center justify-center border-l border-input px-3 text-xs text-muted-foreground">
          {unit}
        </span>
      </div>
      <p id={id + '-help'} className={'text-[11px] ' + (error ? 'text-red-300' : 'text-muted-foreground')}>
        {error || '可设置范围 ' + min + '-' + max + unit}
      </p>
    </div>
  );
}

function buildInitialSettings(): RechargeSettings {
  return {
    lowPowerMode: 'after-guide',
    lowPowerThreshold: 10,
    callDuringTaskEnabled: true,
    safeThreshold: 10,
    autoResumeEnabled: true,
  };
}

export function RechargeSettingsPanel() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const prerequisitesReady = searchParams.get('setup') !== 'missing';
  const setupFlow = searchParams.get('setupFlow');
  const setupAttemptValue = searchParams.get('setupAttempt');
  const setupAttempt = setupAttemptValue === 'position-repeat'
    || setupAttemptValue === 'docking-single'
    || setupAttemptValue === 'docking-repeat'
    || setupAttemptValue === 'not-front'
    ? setupAttemptValue
    : 'position-single';
  const mapReady = searchParams.get('map') !== 'missing';
  const locationReady = prerequisitesReady && mapReady;
  const initialLoadState = searchParams.get('settings') === 'loading'
    ? 'loading'
    : searchParams.get('settings') === 'error'
      ? 'error'
      : 'ready';
  const [loadState, setLoadState] = useState<LoadState>(initialLoadState);
  const [settings, setSettings] = useState<RechargeSettings>(() => buildInitialSettings());
  const [savedSettings, setSavedSettings] = useState<RechargeSettings>(() => buildInitialSettings());
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [setupDialogOpen, setSetupDialogOpen] = useState(Boolean(setupFlow));

  useEffect(() => {
    if (setupFlow) setSetupDialogOpen(true);
  }, [setupFlow]);

  const lowPowerRangeError = settings.lowPowerThreshold < 5 || settings.lowPowerThreshold > 50
    ? '可设置范围 5-50%'
    : '';
  const safeThresholdError = settings.safeThreshold < 10 || settings.safeThreshold > 50
    ? '可设置范围 10-50%'
    : '';
  const hasValidationError = Boolean(
    lowPowerRangeError || safeThresholdError,
  );
  const isDirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(savedSettings),
    [settings, savedSettings],
  );

  function updateSettings(patch: Partial<RechargeSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
    setNotice(null);
  }

  function retryLoad() {
    setLoadState('loading');
    window.setTimeout(() => setLoadState('ready'), 500);
  }

  function saveSettings() {
    if (!isDirty || hasValidationError || isSaving) return;
    setIsSaving(true);
    setNotice(null);
    window.setTimeout(() => {
      setIsSaving(false);
      if (searchParams.get('save') === 'fail') {
        setNotice({ tone: 'error', text: '设置保存失败，当前输入已保留，请重试。' });
        return;
      }
      setSavedSettings(settings);
      setNotice({ tone: 'success', text: '回充设置已保存。' });
    }, 600);
  }

  function openSetupDialog() {
    if (!mapReady) {
      const next = new URLSearchParams(searchParams);
      next.set('mapPrompt', '1');
      setSearchParams(next);
      return;
    }
    const mock = searchParams.get('mock');
    const setupFailure = mock === 'setup-not-front'
      ? 'not-front'
      : mock === 'setup-position' && searchParams.get('attempt') === 'repeat'
        ? 'position-repeat'
        : mock === 'setup-position'
          ? 'position-single'
          : mock === 'setup-docking' && searchParams.get('attempt') === 'repeat'
            ? 'docking-repeat'
            : mock === 'setup-docking' || mock === 'dock-placement'
              ? 'docking-single'
              : null;
    setSetupDialogOpen(true);
    const next = new URLSearchParams(searchParams);
    next.set('setupFlow', setupFailure ? 'failure' : 'confirm');
    if (setupFailure) next.set('setupAttempt', setupFailure);
    else next.delete('setupAttempt');
    setSearchParams(next);
  }

  const handleSetupComplete = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('setup');
    next.set('setupFlow', 'success');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  return (
    <div className="space-y-4" data-testid="recharge-settings">
      <Card className="border-border bg-card/80 shadow-sm">
        <CardHeader className="border-b border-border">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BatteryCharging className="h-4 w-4 text-primary" />
                回充设置
              </CardTitle>
              <CardDescription>回充位置供一键回充和智能回充共用。</CardDescription>
            </div>
          </div>
        </CardHeader>

        <>
          <CardContent className="space-y-4 p-5" data-testid="one-click-recharge-settings">
            <div className="border-b border-border pb-3">
              <h2 className="text-sm font-semibold text-foreground">回充位置</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">一键回充和自动回充共用同一个回充位置。</p>
            </div>
            <section className="rounded-lg border border-border bg-card/40">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={locationReady ? 'rounded-md bg-emerald-500/10 p-2 text-emerald-400' : 'rounded-md bg-amber-500/10 p-2 text-amber-300'}>
                    {locationReady ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">回充位置</h3>
                      <Badge variant="secondary">{locationReady ? '已设置' : '未设置'}</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {locationReady
                        ? '已通过真实对接和充电检测；位置变化后请重新设置。'
                        : '完成一次真实回充，确认充电桩位置可用。'}
                    </p>
                  </div>
                </div>
                <Button size="sm" onClick={openSetupDialog}>
                  {locationReady ? '重新设置' : '设置回充位置'}
                </Button>
              </div>
            </section>

            <section className="flex gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">设置前检查现场</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  保持回充路线和充电桩前方无遮挡；回充桩位置或路线变化后需要重新设置。
                </p>
              </div>
            </section>
          </CardContent>

          <CardContent className="space-y-4 p-5" data-testid="smart-recharge-settings">
            <div className="border-b border-border pb-3">
              <h2 className="text-sm font-semibold text-foreground">自动回充</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">设置低电触发方式、任务执行时的安全电量和回充后的任务衔接。</p>
            </div>
            {!locationReady ? (
              <div className="flex flex-col gap-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div>
                    <p className="text-sm font-medium text-foreground">智能回充暂不可用</p>
                    <p className="mt-1 text-xs text-muted-foreground">请先完成回充位置设置。</p>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={openSetupDialog}>去设置</Button>
              </div>
            ) : loadState === 'loading' ? (
              <div className="space-y-4" data-testid="recharge-settings-loading">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-24 animate-pulse rounded-lg border border-border bg-muted/25" />
                ))}
              </div>
            ) : loadState === 'error' ? (
              <div className="flex flex-col gap-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="recharge-settings-error">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                  <div>
                    <p className="text-sm font-medium text-foreground">设置加载失败</p>
                    <p className="mt-1 text-xs text-muted-foreground">未读取到设备端配置，页面不会使用默认值覆盖。</p>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={retryLoad}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  重试
                </Button>
              </div>
            ) : (
              <>
                <StrategyGroup
                  title="低电触发自动回充"
                  description="机器人电量低于预设值时自动进入回充。"
                  action={<Badge className="bg-primary/15 text-primary">自动执行</Badge>}
                >
                  <div className="space-y-4">
                    <NumberField
                      id="low-power-threshold"
                      label="触发电量"
                      value={settings.lowPowerThreshold}
                      unit="%"
                      min={5}
                      max={50}
                      error={lowPowerRangeError || undefined}
                      onChange={(value) => updateSettings({ lowPowerThreshold: value })}
                    />
                    <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">低电量讲解完成后回充</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">触发低电量回充后，先完成当前讲解，再前往充电桩。</p>
                      </div>
                      <Switch
                        checked={settings.lowPowerMode === 'after-guide'}
                        onCheckedChange={(checked) => updateSettings({ lowPowerMode: checked ? 'after-guide' : 'immediate' })}
                        aria-label="低电量讲解完成后回充"
                      />
                    </div>
                  </div>
                </StrategyGroup>

                <StrategyGroup
                  title="执行充电任务时可呼叫设置"
                  description="执行充电任务时允许用户发起回充；只有电量高于安全电量时才允许被其他任务打断。"
                  action={(
                    <Switch
                      checked={settings.callDuringTaskEnabled}
                      onCheckedChange={(checked) => updateSettings({ callDuringTaskEnabled: checked })}
                      aria-label="执行充电任务时可呼叫设置"
                    />
                  )}
                >
                  <NumberField
                    id="safe-threshold"
                    label="安全电量"
                    value={settings.safeThreshold}
                    unit="%"
                    min={10}
                    max={50}
                    disabled={!settings.callDuringTaskEnabled}
                    error={safeThresholdError || undefined}
                    onChange={(value) => updateSettings({ safeThreshold: value })}
                  />
                </StrategyGroup>

                <StrategyGroup
                  title="回充完成之后，自动开始任务"
                  description="开启后，回充完成且满足任务恢复条件时，机器人自动开始任务。"
                  action={(
                    <Switch
                      checked={settings.autoResumeEnabled}
                      onCheckedChange={(checked) => updateSettings({ autoResumeEnabled: checked })}
                      aria-label="回充完成之后，自动开始任务"
                    />
                  )}
                />

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
                  <Button disabled={!isDirty || hasValidationError || isSaving} onClick={saveSettings}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isSaving ? '保存中' : '保存设置'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </>
      </Card>

      {notice && (
        <div
          role="status"
          className={'rounded-md border px-3 py-2 text-xs ' + (notice.tone === 'success' ? 'border-primary/25 bg-primary/10 text-foreground' : 'border-red-500/30 bg-red-500/10 text-red-100')}
        >
          {notice.text}
        </div>
      )}

      <OneClickRechargeSetupDialog
        open={setupDialogOpen}
        initialStage={setupFlow === 'running' ? 'running' : setupFlow === 'success' ? 'success' : setupFlow === 'failure' ? 'failure' : 'confirm'}
        failureAttempt={setupAttempt}
        onOpenChange={(open) => {
          setSetupDialogOpen(open);
          if (!open) {
            const next = new URLSearchParams(searchParams);
            next.delete('setupFlow');
            next.delete('setupAttempt');
            setSearchParams(next);
          }
        }}
        onComplete={handleSetupComplete}
      />

      {searchParams.get('mapPrompt') === '1' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="map-required-title">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex gap-3">
              <div className="rounded-md bg-amber-500/10 p-2 text-amber-300"><MapPinned className="h-5 w-5" /></div>
              <div>
                <h2 id="map-required-title" className="text-base font-semibold text-foreground">请先选择地图</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">设置回充位置需要依赖当前地图。选择并保存有效地图后，再回来完成真实回充设置。</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { const next = new URLSearchParams(searchParams); next.delete('mapPrompt'); setSearchParams(next); }}>关闭</Button>
              <Button onClick={() => navigate('/maps')}><MapPinned className="mr-2 h-4 w-4" />去地图设置</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
