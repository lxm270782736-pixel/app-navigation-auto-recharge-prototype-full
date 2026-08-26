import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BatteryCharging, MapPinned, Square } from 'lucide-react';
import { Badge, Button } from '@astribot/ui';

type RechargeButtonState = 'setup' | 'ready' | 'returning' | 'charging';

type RechargeEntryControlProps = {
  setupReady: boolean;
  mapReady?: boolean;
  state?: RechargeButtonState;
  disabledReason?: string;
  onStartRecharge: () => void;
  onStopRecharge: () => void;
};

export function RechargeEntryControl({
  setupReady,
  mapReady = true,
  state,
  disabledReason,
  onStartRecharge,
  onStopRecharge,
}: RechargeEntryControlProps) {
  const navigate = useNavigate();
  const timerRef = useRef<number | null>(null);
  const buttonState: RechargeButtonState = state || (!setupReady || !mapReady ? 'setup' : 'ready');

  function openRechargeSettings() {
    navigate(`/settings?tab=recharge&rechargeTab=one-click${setupReady ? '' : '&setup=missing'}${mapReady ? '' : '&map=missing'}`);
  }

  function clearHold() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function startHold() {
    if (buttonState !== 'ready' || timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onStartRecharge();
    }, 900);
  }

  // Reserve one stable slot for every recharge state so the app header does not jump.
  const slotClassName = 'flex h-10 w-[208px] shrink-0 items-center';
  const buttonClassName = 'h-10 w-full whitespace-nowrap';

  if (buttonState === 'setup') {
    return (
      <div className={slotClassName} data-testid="recharge-entry-setup-slot">
        <Button type="button" className={buttonClassName} onClick={openRechargeSettings} data-testid="recharge-entry-setup" title="设置回充位置">
          <MapPinned className="mr-2 h-4 w-4" />
          设置回充位置
        </Button>
      </div>
    );
  }

  if (buttonState === 'charging') {
    return (
      <div className={slotClassName} data-testid="recharge-entry-charging-slot">
        <Button type="button" className={buttonClassName} disabled data-testid="recharge-entry-charging" title={disabledReason || '正在充电，暂不可发起一键回充'}>
          <BatteryCharging className="mr-2 h-4 w-4" />
          充电中
        </Button>
      </div>
    );
  }

  if (buttonState === 'returning') {
    return (
      <div className={`${slotClassName} gap-2`} data-testid="recharge-entry-returning" aria-label="回充中，可停止回充">
        <Badge className="h-10 w-[76px] shrink-0 justify-center whitespace-nowrap rounded-md bg-amber-500/15 px-2 text-amber-700 hover:bg-amber-500/15 dark:text-amber-200">
          <BatteryCharging className="mr-1.5 h-3.5 w-3.5" />
          回充中
        </Badge>
        <Button type="button" variant="secondary" className="h-10 min-w-0 flex-1 whitespace-nowrap" onClick={onStopRecharge} data-testid="recharge-entry-stop" title="停止回充">
          <Square className="mr-2 h-4 w-4" />
          停止回充
        </Button>
      </div>
    );
  }

  return (
    <div className={slotClassName} data-testid="recharge-entry-ready-slot">
      <Button
        type="button"
        className={buttonClassName}
        data-testid="recharge-entry-one-click"
        title="长按一键回充"
        onPointerDown={startHold}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) startHold();
        }}
        onKeyUp={clearHold}
        aria-label="长按一键回充"
      >
        <BatteryCharging className="mr-2 h-4 w-4" />
        长按一键回充
      </Button>
    </div>
  );
}
