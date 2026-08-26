import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@astribot/ui';
import { ArrowLeft, ClipboardList, History, MapPinned, Send } from 'lucide-react';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import { WaypointRecordTab } from './WaypointRecordTab';
import { TaskConfigTab } from './TaskConfigTab';
import { TaskDispatchTab } from './TaskDispatchTab';
import { HistoryTab } from './HistoryTab';
import { RechargeEntryControl } from '@/components/common/RechargeEntryControl';

type PatrolTab = 'waypoints' | 'tasks' | 'dispatch' | 'history';

export const RoomPatrol: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { connectionStatus } = useRobot();
  const [activeTab, setActiveTab] = useState<PatrolTab>(searchParams.get('tab') === 'tasks' ? 'tasks' : 'waypoints');
  const batteryLevel = searchParams.get('strategy') === 'emergency' ? 4 : 85;
  const setupReady = searchParams.get('setup') !== 'missing';
  const mapReady = searchParams.get('map') !== 'missing';
  const rechargeStatus = searchParams.get('rechargeStatus') ?? '';
  const mockState = searchParams.get('mock');
  const rechargeButtonState = !setupReady || !mapReady
    ? 'setup'
    : rechargeStatus === 'charging'
      ? 'charging'
      : rechargeStatus === 'returning'
        ? 'returning'
        : 'ready';

  const connectionBadge = useMemo(
    () =>
      connectionStatus === ConnectionStatus.CONNECTED
        ? { label: '已连接', className: 'bg-emerald-500/15 text-emerald-200' }
        : { label: '未连接', className: 'bg-red-500/15 text-red-200' },
    [connectionStatus]
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-card/80 px-4 py-4">
        <Button type="button" variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </Button>
        <div>
          <div className="text-base font-semibold text-foreground">导览任务</div>
          <div className="text-sm text-muted-foreground">点位录制、任务编排、任务下发和历史记录。</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
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
              navigate('/room-patrol?' + params.toString());
            }}
            onStopRecharge={() => navigate('/room-patrol')}
          />
          <Badge className={connectionBadge.className}>{connectionBadge.label}</Badge>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as PatrolTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border/70 bg-muted/20 px-4 py-3">
          <TabsList className="grid w-full max-w-3xl grid-cols-4">
            <TabsTrigger value="waypoints">
              <MapPinned className="mr-2 h-4 w-4" />
              点位录制
            </TabsTrigger>
            <TabsTrigger value="tasks">
              <ClipboardList className="mr-2 h-4 w-4" />
              任务编排
            </TabsTrigger>
            <TabsTrigger value="dispatch">
              <Send className="mr-2 h-4 w-4" />
              任务下发
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="mr-2 h-4 w-4" />
              历史记录
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="waypoints" className="mt-0 min-h-0 flex-1">
          <div className="h-full">
            <WaypointRecordTab />
          </div>
        </TabsContent>
        <TabsContent value="tasks" className="mt-0 min-h-0 flex-1">
          <div className="h-full">
            <TaskConfigTab
              initialRecoveryOpen={searchParams.get('mock') === 'recharge-recovery'}
              recoverySaveFails={searchParams.get('recoverySave') === 'fail'}
            />
          </div>
        </TabsContent>
        <TabsContent value="dispatch" className="mt-0 min-h-0 flex-1">
          <div className="h-full">
            <TaskDispatchTab />
          </div>
        </TabsContent>
        <TabsContent value="history" className="mt-0 min-h-0 flex-1">
          <div className="h-full">
            <HistoryTab />
          </div>
        </TabsContent>
      </Tabs>

    </div>
  );
};
