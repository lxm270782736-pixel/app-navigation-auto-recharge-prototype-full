import { useSearchParams } from 'react-router-dom';
import { BatteryCharging, CheckCircle2, Clock3, MapPinned, PanelRight, Route, Settings2, Square } from 'lucide-react';
import { Badge, Button } from '@astribot/ui';

type RechargeMockPanelProps = {
  onOpenRecharge: (mock?: string) => void;
};

export function RechargeMockPanel({ onOpenRecharge }: RechargeMockPanelProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const setupReady = searchParams.get('setup') !== 'missing' && searchParams.get('map') !== 'missing';
  // Keep the mock entry resident without covering the product on first open.
  const isCollapsed = searchParams.get('mockPanelCollapsed') !== '0' && searchParams.get('mockPanel') !== '1';

  function updateQuery(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null) next.delete(key);
      else next.set(key, value);
    });
    next.delete('mockPanelCollapsed');
    setSearchParams(next);
  }

  function toggleCollapsed() {
    updateQuery({ mockPanelCollapsed: isCollapsed ? null : '1' });
  }

  function setMockState(mock: string | null, attempt?: 'single' | 'repeat') {
    const next = new URLSearchParams(searchParams);
    next.delete('mockTrigger');
    next.delete('mapPrompt');
    next.delete('setupFlow');
    next.delete('setupAttempt');
    next.delete('rechargeStatus');
    next.delete('mockPanelCollapsed');

    if (mock === 'map-missing') {
      next.set('mock', mock);
      next.set('map', 'missing');
      next.delete('setup');
    } else if (mock === 'location-missing') {
      next.set('mock', mock);
      next.delete('map');
      next.set('setup', 'missing');
    } else if (mock === null) {
      next.delete('mock');
      next.delete('attempt');
      next.delete('map');
      next.delete('setup');
    } else {
      next.set('mock', mock);
      next.delete('map');
      next.delete('setup');
      if (attempt) next.set('attempt', attempt);
      else next.delete('attempt');
    }

    next.set('mockPanel', '1');
    setSearchParams(next);
  }

  function advanceRechargeStatus(status: 'charging' | 'task') {
    const patch: Record<string, string | null> = {
      rechargeStatus: status === 'charging' ? 'charging' : null,
      mockTrigger: null,
      attempt: null,
    };
    updateQuery(patch);
  }

  return (
    <aside
      className="fixed right-4 top-4 z-[80] max-h-[calc(100vh-2rem)] w-[340px] overflow-y-auto rounded-xl border border-border bg-card/95 p-4 text-foreground shadow-xl backdrop-blur"
      data-testid="recharge-mock-panel"
      aria-label="回充 Mock"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-2 text-primary"><BatteryCharging className="h-4 w-4" /></div>
          <div>
            <p className="text-sm font-semibold">回充 Mock</p>
            <p className="text-[11px] text-muted-foreground">仅演示功能详情中的回充分支</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={toggleCollapsed} aria-label={isCollapsed ? '展开回充 Mock' : '收起回充 Mock'}><PanelRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-4 space-y-4">
          <section className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">回充设置分支</p>
            <div className="grid gap-2">
              <Button type="button" variant={searchParams.get('mock') === 'map-missing' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('map-missing')}>
                <MapPinned className="mr-2 h-4 w-4" />未选地图
              </Button>
              <Button type="button" variant={searchParams.get('mock') === 'location-missing' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('location-missing')}>
                <MapPinned className="mr-2 h-4 w-4" />未设置回充位置
              </Button>
              <Button type="button" variant={searchParams.get('mock') === null ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState(null)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />地图和回充位置已设置
              </Button>
              <Button type="button" variant={searchParams.get('mock') === 'setup-not-front' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('setup-not-front')}>
                <Settings2 className="mr-2 h-4 w-4" />设置位置：机器人不在桩前
              </Button>
              <Button type="button" variant={searchParams.get('mock') === 'dock-placement' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('dock-placement')}>
                <Settings2 className="mr-2 h-4 w-4" />设置位置：充电桩摆放异常
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={searchParams.get('mock') === 'setup-position' && searchParams.get('attempt') === 'single' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('setup-position', 'single')}>
                  <Settings2 className="mr-2 h-4 w-4" />设置位置：定位首次
                </Button>
                <Button type="button" variant={searchParams.get('mock') === 'setup-position' && searchParams.get('attempt') === 'repeat' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('setup-position', 'repeat')}>
                  <Settings2 className="mr-2 h-4 w-4" />设置位置：定位多次
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={searchParams.get('mock') === 'setup-docking' && searchParams.get('attempt') === 'single' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('setup-docking', 'single')}>
                  <Settings2 className="mr-2 h-4 w-4" />设置位置：对接首次
                </Button>
                <Button type="button" variant={searchParams.get('mock') === 'setup-docking' && searchParams.get('attempt') === 'repeat' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('setup-docking', 'repeat')}>
                  <Settings2 className="mr-2 h-4 w-4" />设置位置：对接多次
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">自动回充 / 执行回充分支</p>
            <div className="grid gap-2">
              <Button type="button" variant={searchParams.get('mock') === 'task-interrupt-blocked' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('task-interrupt-blocked')}>
                <BatteryCharging className="mr-2 h-4 w-4" />低于安全电量：任务不可打断
              </Button>
              <Button type="button" variant={searchParams.get('mock') === 'task-interrupt-allowed' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('task-interrupt-allowed')}>
                <BatteryCharging className="mr-2 h-4 w-4" />高于安全电量：任务可打断
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={searchParams.get('mock') === 'navigation-obstacle' && searchParams.get('attempt') === 'single' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('navigation-obstacle', 'single')}>
                  <Route className="mr-2 h-4 w-4" />导航：首次报错
                </Button>
                <Button type="button" variant={searchParams.get('mock') === 'navigation-obstacle' && searchParams.get('attempt') === 'repeat' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('navigation-obstacle', 'repeat')}>
                  <Route className="mr-2 h-4 w-4" />导航：多次报错
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={searchParams.get('mock') === 'dock-obstacle' && searchParams.get('attempt') === 'single' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('dock-obstacle', 'single')}>
                  <Clock3 className="mr-2 h-4 w-4" />桩前障碍：首次
                </Button>
                <Button type="button" variant={searchParams.get('mock') === 'dock-obstacle' && searchParams.get('attempt') === 'repeat' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('dock-obstacle', 'repeat')}>
                  <Clock3 className="mr-2 h-4 w-4" />桩前障碍：多次
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={searchParams.get('mock') === 'docking-failed' && searchParams.get('attempt') === 'single' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('docking-failed', 'single')}>
                  <Settings2 className="mr-2 h-4 w-4" />对接：首次报错
                </Button>
                <Button type="button" variant={searchParams.get('mock') === 'docking-failed' && searchParams.get('attempt') === 'repeat' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('docking-failed', 'repeat')}>
                  <Settings2 className="mr-2 h-4 w-4" />对接多次报错
                </Button>
              </div>
              <Button type="button" variant={searchParams.get('mock') === 'charging-interrupted' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('charging-interrupted')}>
                <BatteryCharging className="mr-2 h-4 w-4" />充电中断
              </Button>
              <Button type="button" variant={searchParams.get('mock') === 'cannot-locate' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('cannot-locate')}>
                <Route className="mr-2 h-4 w-4" />无法定位到充电桩前
              </Button>
              <Button type="button" variant={searchParams.get('mock') === 'dock-shifted' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('dock-shifted')}>
                <MapPinned className="mr-2 h-4 w-4" />充电桩位置发生偏移
              </Button>
              <Button type="button" variant={searchParams.get('mock') === 'recharge-stopped' ? 'default' : 'outline'} className="justify-start" onClick={() => setMockState('recharge-stopped')}>
                <Square className="mr-2 h-4 w-4" />停止回充后再次发起
              </Button>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-muted/15 p-3">
            <div className="flex items-start gap-3">
              <div className={setupReady ? 'rounded-md bg-emerald-500/10 p-2 text-emerald-400' : 'rounded-md bg-amber-500/10 p-2 text-amber-300'}>{setupReady ? <CheckCircle2 className="h-4 w-4" /> : <MapPinned className="h-4 w-4" />}</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{setupReady ? '已设置回充位置' : '尚未设置回充位置'}</p><Badge variant="secondary">{setupReady ? '可回充' : '需设置'}</Badge></div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">先选择状态，再通过页面上的回充按钮触发对应交互。</p>
              </div>
            </div>
          </section>

          <section className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">当前入口行为</p>
            <Button type="button" className="w-full justify-start" variant={setupReady ? 'default' : 'secondary'} onClick={() => onOpenRecharge(searchParams.get('mock') || undefined)} title={setupReady ? '打开回充设置' : '进入回充设置'}>
              {setupReady ? <BatteryCharging className="mr-2 h-4 w-4" /> : <MapPinned className="mr-2 h-4 w-4" />}
              {setupReady ? '打开回充设置' : '设置回充位置'}
            </Button>
            {searchParams.get('rechargeStatus') === 'returning' && (
              <Button type="button" variant="outline" className="w-full justify-start" onClick={() => advanceRechargeStatus('charging')}>
                <BatteryCharging className="mr-2 h-4 w-4" />回充到桩：进入正在充电中
              </Button>
            )}
            {searchParams.get('rechargeStatus') === 'charging' && (
              <Button type="button" variant="outline" className="w-full justify-start" onClick={() => advanceRechargeStatus('task')}>
                <Route className="mr-2 h-4 w-4" />结束充电：执行任务
              </Button>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
