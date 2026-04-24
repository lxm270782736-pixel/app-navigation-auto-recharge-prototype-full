import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn } from '@astribot/ui';
import { Gamepad2, Loader2, Sparkles } from 'lucide-react';
import { apiService } from '@/services/api';

interface ChassisControlProps {
  isNavigating?: boolean;
  onControlTypeChange?: (type: 'twist' | 'joy') => void;
}

type ControlType = 'twist' | 'joy';

const MODE_META: Record<ControlType, { label: string; icon: React.ReactNode }> = {
  twist: { label: '自动模式', icon: <Sparkles className="h-3.5 w-3.5" /> },
  joy: { label: '手柄模式', icon: <Gamepad2 className="h-3.5 w-3.5" /> },
};

export const ChassisControl: React.FC<ChassisControlProps> = ({
  isNavigating = false,
  onControlTypeChange,
}) => {
  const [controlType, setControlType] = useState<ControlType>('twist');
  const [loading, setLoading] = useState(false);
  const [fetchingType, setFetchingType] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const initControlType = async () => {
      try {
        setFetchingType(true);
        const currentType = await apiService.getChassisControlType();
        if (currentType) {
          setControlType(currentType);
        }
      } catch (error) {
        console.error('Failed to fetch chassis control type:', error);
        setNotice('读取底盘控制模式失败');
      } finally {
        setFetchingType(false);
      }
    };

    initControlType();
  }, []);

  const handleControlTypeChange = async (newType: ControlType) => {
    if (isNavigating) {
      setNotice('导航中不允许切换控制模式');
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      await apiService.setChassisControlType(newType);
      setControlType(newType);
      onControlTypeChange?.(newType);
      setNotice(`已切换到${newType === 'twist' ? '自动' : '手柄'}模式`);
    } catch (error) {
      console.error('Failed to switch chassis control type:', error);
      setNotice('切换控制模式失败');
    } finally {
      setLoading(false);
    }
  };

  const currentMode = MODE_META[controlType];

  return (
    <Card className="border-border/70 bg-card/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">底盘控制</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">切换自动导航或手柄接管模式。</p>
          </div>
          <Badge variant="secondary" className="inline-flex items-center gap-1.5">
            {currentMode.icon}
            {currentMode.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {fetchingType ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载控制模式中...
          </div>
        ) : (
          <>
            {isNavigating && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                导航中不允许切换控制模式。
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={controlType === 'twist' ? 'default' : 'outline'}
                disabled={loading || isNavigating}
                className="justify-center"
                onClick={() => handleControlTypeChange('twist')}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                自动
              </Button>
              <Button
                type="button"
                variant={controlType === 'joy' ? 'default' : 'outline'}
                disabled={loading || isNavigating}
                className="justify-center"
                onClick={() => handleControlTypeChange('joy')}
              >
                <Gamepad2 className="mr-2 h-4 w-4" />
                手柄
              </Button>
            </div>

            <div
              className={cn(
                'rounded-lg border px-3 py-2 text-xs',
                controlType === 'twist'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-sky-500/30 bg-sky-500/10 text-sky-200'
              )}
            >
              {controlType === 'twist'
                ? '自动模式：接收导航指令，支持自动导航。'
                : '手柄模式：使用游戏手柄实时控制底盘。'}
            </div>
          </>
        )}

        {notice && (
          <p className="text-xs text-muted-foreground">
            {notice}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
