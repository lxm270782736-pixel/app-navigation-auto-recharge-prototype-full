import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Card, Progress, Tag, message, Space, Badge, Steps } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { MapCanvas } from '@/components/common/MapCanvas';
import { rosService } from '@/services/ros';
import { ROS2_MESSAGE_TYPES } from '@/config/ros2MessageTypes';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { MapData, Pose, RoomPatrolState, RoomConfig } from '@/types';

const STEP_LABELS: Record<string, string> = {
  navigate: '导航中',
  open_door: '开门中',
  close_door: '关门中',
  detect_bed: '在床检测',
  detect_floor: '地面检测',
  photo: '拍照中',
  wait: '等待中',
  preparing: '准备中',
  returning: '返回起点',
};

export const TaskDispatchTab: React.FC = () => {
  const { connectionStatus } = useROS();
  const [patrolState, setPatrolState] = useState<RoomPatrolState | null>(null);
  const [robotPose, setRobotPose] = useState<Pose | undefined>();
  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [roomConfigs, setRoomConfigs] = useState<RoomConfig[]>([]);
  const [taskRoomIds, setTaskRoomIds] = useState<string[]>([]);
  const [taskRoomSteps, setTaskRoomSteps] = useState<Record<string, any[]>>({});

  // Load room config + task config to know which rooms and their waypoints
  const loadConfigs = useCallback(async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    try {
      const [roomData, taskData] = await Promise.all([
        rosService.getRoomConfig(),
        rosService.getTaskConfig().catch(() => ({ rooms: [] })),
      ]);
      setRoomConfigs(roomData.rooms || []);
      const taskRooms = (taskData.rooms || []).filter((r: any) => r.enabled !== false);
      const enabledIds = taskRooms.map((r: any) => r.room_id);
      setTaskRoomIds(enabledIds);
      // Build per-room step list for progress display
      const stepsMap: Record<string, any[]> = {};
      for (const r of taskRooms) {
        stepsMap[r.room_id] = r.steps || [];
      }
      setTaskRoomSteps(stepsMap);
    } catch { /* ignore */ }
  }, [connectionStatus]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  // Subscribe to SSE room patrol state
  useEffect(() => {
    const handler = (data: RoomPatrolState) => setPatrolState(data);
    rosService.on('room-patrol-state', handler);
    return () => rosService.off('room-patrol-state', handler);
  }, []);

  // Subscribe to robot pose
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    const unsubscribe = rosService.subscribeTopic<any>(
      '/loc_high_freq',
      ROS2_MESSAGE_TYPES.ODOMETRY,
      (msg) => {
        const pos = msg.pose.pose.position;
        const ori = msg.pose.pose.orientation;
        const theta = Math.atan2(
          2.0 * (ori.w * ori.z + ori.x * ori.y),
          1.0 - 2.0 * (ori.y * ori.y + ori.z * ori.z),
        );
        setRobotPose({ x: pos.x, y: pos.y, theta });
      },
    );
    return () => unsubscribe();
  }, [connectionStatus]);

  // Subscribe to map
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    const unsubscribe = rosService.subscribeMap((mapData) => setCurrentMap(mapData));
    return () => unsubscribe();
  }, [connectionStatus]);

  const isActive = patrolState?.active ?? false;

  const handleStart = async () => {
    const result = await rosService.startRoomPatrol();
    if (result.success) {
      message.success(result.message);
    } else {
      message.error(result.message);
    }
  };

  const handleStop = async () => {
    const result = await rosService.stopRoomPatrol();
    if (result.success) {
      message.info('巡房已停止');
    } else {
      message.error(result.message);
    }
  };

  const progressPercent = patrolState ? Math.round(patrolState.progress * 100) : 0;

  // Build ALL waypoints for map display: 3 points per room (door_outside, door_inside, bed_check)
  // Structure: [room1_outside, room1_inside, room1_bed, room2_outside, room2_inside, room2_bed, ...]
  const roomLookup = new Map(roomConfigs.map(r => [r.room_id, r]));
  const displayRoomIds = taskRoomIds.length > 0 ? taskRoomIds : roomConfigs.filter(r => r.door_outside).map(r => r.room_id);
  const waypoints: Pose[] = [];
  const waypointMeta: { roomId: string; type: string; waypointIdx: number }[] = [];

  for (const rid of displayRoomIds) {
    const rc = roomLookup.get(rid);
    if (!rc) continue;
    const points = [
      { pose: rc.door_outside, type: 'door_outside' },
      { pose: rc.door_inside, type: 'door_inside' },
      { pose: rc.bed_check, type: 'bed_check' },
    ];
    for (const p of points) {
      if (p.pose) {
        waypointMeta.push({ roomId: rid, type: p.type, waypointIdx: waypoints.length });
        waypoints.push(p.pose);
      }
    }
  }

  // Determine current waypoint index: highlight the door_outside of the current room being visited
  let currentWaypointIndex = -1;
  if (patrolState?.active && patrolState.current_room) {
    // Find the first point of the current room (door_outside)
    const meta = waypointMeta.find(m => m.roomId === patrolState.current_room && m.type === 'door_outside');
    if (meta) currentWaypointIndex = meta.waypointIdx;
  }

  // Completed: mark all 3 points of completed rooms
  const completedSet = new Set(patrolState?.rooms_completed || []);
  const completedWaypoints = waypointMeta
    .filter(m => completedSet.has(m.roomId))
    .map(m => m.waypointIdx);

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Left: Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        {currentMap ? (
          <MapCanvas
            mapData={currentMap}
            robotPose={robotPose}
            waypoints={waypoints}
            currentWaypointIndex={currentWaypointIndex}
            completedWaypoints={completedWaypoints}
            showCoordinateSystem={true}
            showRobotTrail={true}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
            {connectionStatus === ConnectionStatus.CONNECTED ? '等待地图数据...' : '请先连接 ROS'}
          </div>
        )}
      </div>

      {/* Right: Control panel */}
      <div style={{ width: 320, borderLeft: '1px solid #f0f0f0', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Start/Stop */}
        <Card size="small" title="巡房控制">
          {isActive ? (
            <Button type="primary" danger block icon={<StopOutlined />} onClick={handleStop}>
              停止巡房
            </Button>
          ) : (
            <Button type="primary" block icon={<PlayCircleOutlined />} onClick={handleStart}
              disabled={connectionStatus !== ConnectionStatus.CONNECTED}>
              开始巡房
            </Button>
          )}
        </Card>

        {/* Status */}
        {patrolState && patrolState.status !== 'idle' && (
          <Card size="small" title="巡房状态">
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>状态</span>
                <Tag color={isActive ? 'processing' : patrolState.status === 'completed' ? 'success' : patrolState.status === 'failed' ? 'error' : 'default'}>
                  {patrolState.status === 'running' ? '巡房中' :
                   patrolState.status === 'completed' ? '已完成' :
                   patrolState.status === 'stopped' ? '已停止' :
                   patrolState.status === 'failed' ? '失败' : patrolState.status}
                </Tag>
              </div>

              <Progress percent={progressPercent} size="small" />

              {isActive && patrolState.current_room && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>当前房间</span>
                    <span style={{ fontWeight: 600 }}><EnvironmentOutlined /> {patrolState.current_room}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>当前步骤</span>
                    <Tag color="blue"><LoadingOutlined /> {STEP_LABELS[patrolState.current_step] || patrolState.current_step}</Tag>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>完成</span>
                <span>
                  <Badge status="success" /> {patrolState.rooms_completed.length} / {patrolState.rooms_total}
                </span>
              </div>

              {patrolState.rooms_failed.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>失败</span>
                  <span style={{ color: '#ff4d4f' }}>
                    {patrolState.rooms_failed.join(', ')}
                  </span>
                </div>
              )}

              {patrolState.error && (
                <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>
                  {patrolState.error}
                </div>
              )}
            </Space>
          </Card>
        )}

        {/* Room progress list with step detail */}
        {patrolState && patrolState.status !== 'idle' && (
          <Card size="small" title="房间进度" style={{ flex: 1, overflow: 'auto' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {((patrolState as any).rooms || displayRoomIds.map((rid: string) => ({ room_id: rid, room_name: roomLookup.get(rid)?.room_name || rid, steps: taskRoomSteps[rid] || [] }))).map((room: any) => {
                const rid = room.room_id;
                const isDone = patrolState.rooms_completed.includes(rid);
                const isFailed = patrolState.rooms_failed.includes(rid);
                const isCurrent = patrolState.active && patrolState.current_room === rid;
                const isPending = !isDone && !isFailed && !isCurrent;
                const steps = room.steps || [];

                // Use step index from backend instead of findIndex by type name
                const currentStepIdx = isCurrent
                  ? (patrolState.current_step_index ?? -1)
                  : -1;

                return (
                  <div key={rid} style={{
                    border: `1px solid ${isCurrent ? '#1890ff' : '#f0f0f0'}`,
                    borderRadius: 6,
                    padding: '8px 10px',
                    background: isCurrent ? '#e6f7ff' : isDone ? '#f6ffed' : isFailed ? '#fff2f0' : '#fff',
                  }}>
                    {/* Room header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isCurrent ? 8 : 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        {room.room_name || rid}
                      </span>
                      {isDone && <Tag color="success" style={{ margin: 0 }}>已完成</Tag>}
                      {isFailed && <Tag color="error" style={{ margin: 0 }}>失败</Tag>}
                      {isCurrent && <Tag color="processing" style={{ margin: 0 }}><LoadingOutlined /> 执行中</Tag>}
                      {isPending && <Tag style={{ margin: 0 }}>等待</Tag>}
                    </div>

                    {/* Step progress — only show for current room */}
                    {isCurrent && steps.length > 0 && (
                      <Steps
                        size="small"
                        direction="vertical"
                        current={currentStepIdx >= 0 ? currentStepIdx : 0}
                        style={{ marginTop: 4 }}
                        items={steps.map((step: any, si: number) => {
                          let status: 'wait' | 'process' | 'finish' | 'error' = 'wait';
                          if (si < currentStepIdx) status = 'finish';
                          else if (si === currentStepIdx) status = 'process';

                          const label = STEP_LABELS[step.type] || step.type;
                          const suffix = step.type === 'navigate' ? ` → ${step.target || ''}` : step.label ? ` (${step.label})` : '';

                          return {
                            title: <span style={{ fontSize: 12 }}>{label}{suffix}</span>,
                            status,
                          };
                        })}
                      />
                    )}
                  </div>
                );
              })}
            </Space>
          </Card>
        )}
      </div>
    </div>
  );
};
