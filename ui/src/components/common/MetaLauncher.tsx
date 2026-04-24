import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bot, Power, Radar, RefreshCw, Rocket } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@astribot/ui';
import { apiService } from '@/services/api';

const STATE_LABELS: Record<string, { text: string; tone: string }> = {
  disconnected: { text: '未连接', tone: 'bg-muted text-muted-foreground' },
  connected: { text: '已连接', tone: 'bg-yellow-500/15 text-yellow-500' },
  unconfigured: { text: '未配置', tone: 'bg-orange-500/15 text-orange-500' },
  inactive: { text: '未激活', tone: 'bg-blue-500/15 text-blue-400' },
  active: { text: '运行中', tone: 'bg-green-500/15 text-green-500' },
  finalized: { text: '已终止', tone: 'bg-muted text-muted-foreground' },
};

const SHORT_LABELS: Record<string, string> = {
  localization: '定位',
  astribot_navigation: '导航',
  detection: '检测',
  sales_replay: '轨迹回放',
  camera: '相机',
};

const SERVICE_ICONS: Record<string, typeof Bot> = {
  localization: Radar,
  astribot_navigation: Bot,
  detection: Activity,
};

interface ServiceInfo {
  name: string;
  state: string;
  startup: boolean;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function getShortName(name: string) {
  return name.replace('meta.', '');
}

function getServiceLabel(name: string) {
  return SHORT_LABELS[getShortName(name)] || getShortName(name);
}

function getServiceIcon(name: string) {
  return SERVICE_ICONS[getShortName(name)] ?? Bot;
}

export function MetaLauncher() {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({ all: false });
  const startupServices = useMemo(() => services.filter((service) => service.startup), [services]);
  const isAllActive = startupServices.length > 0 && startupServices.every((service) => service.state === 'active');

  useEffect(() => {
    const handler = (state: Record<string, unknown>) => {
      setServices((prev) =>
        prev.map((service) => {
          const short = getShortName(service.name);
          const key = short === 'detection' ? 'fall_state' : `${short}_state`;
          const nextState = state[key];
          return typeof nextState === 'string' ? { ...service, state: nextState } : service;
        }),
      );
    };

    apiService.on('state', handler);
    return () => {
      apiService.off('state', handler);
    };
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const metaConfig = await apiService.getMetaServicesConfig();
      const metaStatus = (await apiService.getMetaStatus()) as Record<string, unknown>;
      const statesByName: Record<string, string> = {
        'meta.localization': String(metaStatus.loc_state ?? 'disconnected'),
        'meta.astribot_navigation': String(metaStatus.nav_state ?? 'disconnected'),
        'meta.detection': String(metaStatus.fall_state ?? 'disconnected'),
      };

      setServices(
        (metaConfig.services ?? []).map((service) => ({
          name: service.name,
          startup: service.startup,
          state: statesByName[service.name] ?? 'disconnected',
        })),
      );
    } catch (error) {
      console.error('Failed to load meta status:', error);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleAll = useCallback(async () => {
    setLoading((prev) => ({ ...prev, all: true }));
    try {
      if (isAllActive) {
        await apiService.deactivateMeta();
      } else {
        await apiService.startMeta();
      }
      await loadStatus();
    } catch (error) {
      console.error('Failed to toggle meta services:', error);
    } finally {
      setLoading((prev) => ({ ...prev, all: false }));
    }
  }, [isAllActive, loadStatus]);

  const handleControl = useCallback(
    async (name: string, action: 'start' | 'stop') => {
      const short = getShortName(name);
      const keyMap: Record<string, 'loc' | 'nav' | 'detection'> = {
        localization: 'loc',
        astribot_navigation: 'nav',
        detection: 'detection',
      };
      const controlKey = keyMap[short];
      if (!controlKey) {
        return;
      }

      setLoading((prev) => ({ ...prev, [name]: true }));
      try {
        await apiService.metaControl(controlKey, action);
        await loadStatus();
      } catch (error) {
        console.error(`Failed to ${action} ${name}:`, error);
      } finally {
        setLoading((prev) => ({ ...prev, [name]: false }));
      }
    },
    [loadStatus],
  );

  return (
    <Card className="border-border bg-card/80 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4 text-primary" />
            Meta 服务控制
          </CardTitle>
          <p className="text-xs text-muted-foreground">导航链路依赖的基础服务生命周期</p>
        </div>
        <div className="flex items-center gap-2">
          {isAllActive ? (
            <Badge className="bg-green-500/15 text-green-500 hover:bg-green-500/15">全部运行中</Badge>
          ) : (
            <Badge variant="secondary">待启动</Badge>
          )}
          <Button variant="ghost" size="icon" onClick={() => void loadStatus()} aria-label="刷新状态">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button className="w-full" variant={isAllActive ? 'secondary' : 'default'} onClick={() => void handleAll()} disabled={loading.all}>
          {isAllActive ? (
            <>
              <Power className="mr-2 h-4 w-4" />
              停止所有服务
            </>
          ) : (
            <>
              <Rocket className="mr-2 h-4 w-4" />
              一键启动所有服务
            </>
          )}
        </Button>

        <div className="grid gap-3 md:grid-cols-3">
          {startupServices.map((service) => {
            const Icon = getServiceIcon(service.name);
            const stateInfo = STATE_LABELS[service.state] ?? STATE_LABELS.disconnected;
            const isActive = service.state === 'active';

            return (
              <div key={service.name} className="rounded-lg border border-border bg-secondary/30 p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-md bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{getServiceLabel(service.name)}</div>
                      <div className="text-xs text-muted-foreground">{getShortName(service.name)}</div>
                    </div>
                  </div>
                  <span className={cn('rounded-full px-2 py-1 text-[11px] font-medium', stateInfo.tone)}>
                    {stateInfo.text}
                  </span>
                </div>
                <Button
                  className="w-full"
                  size="sm"
                  variant={isActive ? 'secondary' : 'default'}
                  onClick={() => void handleControl(service.name, isActive ? 'stop' : 'start')}
                  disabled={Boolean(loading[service.name])}
                >
                  {isActive ? '停止' : '启动'}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
