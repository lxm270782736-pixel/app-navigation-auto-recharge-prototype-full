import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  BatteryCharging,
  Compass,
  Map,
  MoveRight,
  Package,
  Radar,
  Route,
  Settings2,
  Wifi,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@astribot/ui';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { MetaLauncher } from '@/components/common/MetaLauncher';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus, type Pose } from '@/types';
import { RechargeEntryControl } from '@/components/common/RechargeEntryControl';

type MetricCardProps = {
  title: string;
  value: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning';
  onClick?: () => void;
};

type ActionCardProps = {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function MetricCard({ title, value, subtitle, icon: Icon, tone = 'default', onClick }: MetricCardProps) {
  const toneClass =
    tone === 'success'
      ? 'bg-green-500/10 text-green-500'
      : tone === 'warning'
        ? 'bg-yellow-500/10 text-yellow-500'
        : 'bg-primary/10 text-primary';

  const card = (
    <Card className="border-border bg-card/80 shadow-sm">
      <CardContent className="flex items-start justify-between p-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</p>
          <div className="text-2xl font-semibold text-foreground">{value}</div>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className={cn('rounded-xl p-3', toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
  if (!onClick) return card;
  return (
    <button type="button" onClick={onClick} className="text-left transition-transform hover:-translate-y-0.5" aria-label="打开工作区入口">
      {card}
    </button>
  );
}

function ActionCard({ title, description, icon: Icon, onClick }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border border-border bg-card/80 p-5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <MoveRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { connectionStatus } = useRobot();
  const [robotPose, setRobotPose] = useState<Pose | null>(null);
  const [batteryLevel] = useState<number>(searchParams.get('strategy') === 'emergency' ? 4 : 85);
  const setupReady = searchParams.get('setup') !== 'missing';
  const mapReady = searchParams.get('map') !== 'missing';
  const [velocity, setVelocity] = useState({ linear: 0, angular: 0 });
  const rechargeStatusParam = searchParams.get('rechargeStatus')
    || (searchParams.get('prototype') === 'failed' ? 'failed' : '');
  const rechargeStatus = rechargeStatusParam;
  const mockState = searchParams.get('mock');
  const rechargeButtonState = !setupReady || !mapReady
    ? 'setup'
    : rechargeStatus === 'charging'
      ? 'charging'
      : rechargeStatus === 'returning'
        ? 'returning'
        : 'ready';

  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    const unsubscribe = apiService.subscribeTopic<any>(
      '/loc_high_freq',
      MESSAGE_TYPES.ODOMETRY,
      (poseMsg) => {
        const position = poseMsg.pose.pose.position;
        const orientation = poseMsg.pose.pose.orientation;
        const theta = Math.atan2(
          2.0 * (orientation.w * orientation.z + orientation.x * orientation.y),
          1.0 - 2.0 * (orientation.y * orientation.y + orientation.z * orientation.z),
        );

        setRobotPose({
          x: position.x,
          y: position.y,
          theta,
        });
      },
    );

    return () => {
      unsubscribe();
    };
  }, [connectionStatus]);

  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    const unsubscribe = apiService.subscribeTopic<any>(
      '/cmd_vel',
      MESSAGE_TYPES.TWIST,
      (twistMsg) => {
        setVelocity({
          linear: twistMsg.linear.x,
          angular: twistMsg.angular.z,
        });
      },
    );

    return () => {
      unsubscribe();
    };
  }, [connectionStatus]);

  const connectionBadge = useMemo(() => {
    switch (connectionStatus) {
      case ConnectionStatus.CONNECTED:
        return <Badge className="bg-green-500/15 text-green-500 hover:bg-green-500/15">在线</Badge>;
      case ConnectionStatus.CONNECTING:
        return <Badge className="bg-yellow-500/15 text-yellow-500 hover:bg-yellow-500/15">连接中</Badge>;
      case ConnectionStatus.ERROR:
        return <Badge variant="destructive">错误</Badge>;
      default:
        return <Badge variant="secondary">离线</Badge>;
    }
  }, [connectionStatus]);

  const positionText = robotPose ? `${robotPose.x.toFixed(2)}, ${robotPose.y.toFixed(2)}` : '--';
  const headingText = robotPose ? `${((robotPose.theta * 180) / Math.PI).toFixed(1)}°` : '--';
  const speedText = `${velocity.linear.toFixed(2)} m/s`;
  const speedSubtitle = `角速度 ${velocity.angular.toFixed(2)} rad/s`;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <section className="rounded-2xl border border-border bg-card/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Route className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Navigation Control</div>
                <h1 className="text-2xl font-semibold text-foreground">机器人建图与导航</h1>
              </div>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              按照宿主应用模板渲染的导航控制台。首屏只保留核心状态与入口，重型导航页面按路由懒加载。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <RechargeEntryControl
            batteryLevel={batteryLevel}
            setupReady={setupReady}
            mapReady={mapReady}
            state={rechargeButtonState}
            disabledReason="正在充电，暂不可发起一键回充"
            onStartRecharge={() => {
              const params = new URLSearchParams({ rechargeStatus: 'returning' });
              if (mockState) params.set('mock', mockState);
              if (mockState) params.set('mockTrigger', mockState);
              navigate('/?' + params.toString());
            }}
            onStopRecharge={() => navigate('/')}
            />
            <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
              <Wifi className="h-4 w-4" />
              ROS / FastAPI
              {connectionBadge}
            </div>
            <Button variant="secondary" onClick={() => navigate('/settings')}>
              <Settings2 className="mr-2 h-4 w-4" />
              设置
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="电池"
          value={`${batteryLevel}%`}
          subtitle="续航正常"
          icon={BatteryCharging}
          tone="success"
        />
        <MetricCard title="位置" value={positionText} subtitle="X / Y 坐标" icon={Map} />
        <MetricCard title="朝向" value={headingText} subtitle="机器人当前朝向角" icon={Compass} />
        <MetricCard title="速度" value={speedText} subtitle={speedSubtitle} icon={Activity} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr,0.75fr]">
        <Card className="border-border bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="h-4 w-4 text-primary" />
              工作区入口
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ActionCard title="地图管理" description="查看地图版本、切换地图、编辑已有栅格数据。" icon={Map} onClick={() => navigate('/maps')} />
            <ActionCard title="SLAM 建图" description="启动建图流程并把结果保存为导航地图。" icon={Compass} onClick={() => navigate('/mapping')} />
            <ActionCard title="自主导航" description="基于当前地图下发导航目标并观测轨迹反馈。" icon={Route} onClick={() => navigate('/navigation')} />
            <ActionCard title="导览任务" description="配置点位、编排任务流并下发巡检/导览任务。" icon={Radar} onClick={() => navigate('/room-patrol')} />
            <ActionCard title="素材管理" description="管理回放轨迹与音频素材，供任务编排和预览使用。" icon={Package} onClick={() => navigate('/asset-manager')} />
            <ActionCard title="系统设置" description="集中管理导航相关 Meta、参数与运行模式。" icon={Settings2} onClick={() => navigate('/settings')} />
          </CardContent>
        </Card>

        <MetaLauncher />
      </section>


    </div>
  );
}
