import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Card, Progress, Tag, message, Space, Badge, Steps, Select, Modal, notification } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  EnvironmentOutlined,
  WarningFilled,
  PauseCircleOutlined,
} from '@ant-design/icons';
import { MapCanvas } from '@/components/common/MapCanvas';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { useRobot } from '@/contexts/RobotContext';
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

const WAYPOINT_TYPE_COLORS: Record<string, string> = {
  door_outside: '#1890ff',
  door_inside: '#52c41a',
  bed_check: '#ff4d4f',
};

export const TaskDispatchTab: React.FC = () => {
  const { connectionStatus } = useRobot();
  const [patrolState, setPatrolState] = useState<RoomPatrolState | null>(null);
  const [robotPose, setRobotPose] = useState<Pose | undefined>();
  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [roomConfigs, setRoomConfigs] = useState<RoomConfig[]>([]);
  const [startPosition, setStartPosition] = useState<Pose | null>(null);
  const [taskRoomIds, setTaskRoomIds] = useState<string[]>([]);
  const [taskRoomSteps, setTaskRoomSteps] = useState<Record<string, any[]>>({});
  const [customStepTypes, setCustomStepTypes] = useState<any[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [fallAcking, setFallAcking] = useState(false);
  const [stuckAcking, setStuckAcking] = useState(false);

  const fallEvent = patrolState?.fall_event ?? null;
  const stuckEvent = patrolState?.stuck_event ?? null;

  // 跌倒事件弹窗确认
  const handleAckFall = async () => {
    setFallAcking(true);
    try {
      await apiService.acknowledgeFall();
      message.success('已确认处理');
    } catch {
      message.error('确认失败，请重试');
    } finally {
      setFallAcking(false);
    }
  };

  // 机器人卡住事件弹窗确认
  const handleAckStuck = async () => {
    setStuckAcking(true);
    try {
      await apiService.acknowledgeStuck();
      message.success('已确认处理');
    } catch {
      message.error('确认失败，请重试');
    } finally {
      setStuckAcking(false);
    }
  };

  // Dynamic step labels: built-in + custom
  const stepLabels = useMemo(() => {
    const labels = { ...STEP_LABELS };
    for (const d of customStepTypes) labels[`custom:${d.id}`] = d.name;
    return labels;
  }, [customStepTypes]);

  // Load room config + task config to know which rooms and their waypoints
  const loadConfigs = useCallback(async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    try {
      const [roomData, taskData, customData, presetsData] = await Promise.all([
        apiService.getRoomConfig(),
        apiService.getTaskConfig().catch(() => ({ rooms: [] })),
        apiService.getCustomStepTypes().catch(() => ({ custom_step_types: [] })),
        apiService.getTaskPresets().catch(() => ({ presets: [] })),
      ]);
      setRoomConfigs(roomData.rooms || []);
      setStartPosition(roomData.start_position || null);
      setCustomStepTypes(customData.custom_step_types || []);
      const loadedPresets = presetsData.presets || [];
      setPresets(loadedPresets);
      if (loadedPresets.length > 0) {
        setSelectedPresetId(prev => {
          if (prev && loadedPresets.find((p: any) => p.id === prev)) return prev;
          const def = loadedPresets.find((p: any) => p.is_default);
          return def ? def.id : loadedPresets[0].id;
        });
      }
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

  // Update displayed rooms when preset selection changes
  useEffect(() => {
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset) {
      const rooms = (preset.rooms || []).filter((r: any) => r.enabled !== false);
      setTaskRoomIds(rooms.map((r: any) => r.room_id));
      const stepsMap: Record<string, any[]> = {};
      for (const r of rooms) stepsMap[r.room_id] = r.steps || [];
      setTaskRoomSteps(stepsMap);
    }
  }, [selectedPresetId, presets]);

  // Subscribe to SSE room patrol state
  useEffect(() => {
    const handler = (data: RoomPatrolState) => setPatrolState(data);
    apiService.on('room-patrol-state', handler);
    return () => apiService.off('room-patrol-state', handler);
  }, []);

  const notifiedAlertIds = useRef<Set<string>>(new Set());
  const pendingNotifications = useRef<Array<{type: string, message: string, description: string}>>([]);

  // 组件卸载时清理，防止重新挂载时重复弹窗
  useEffect(() => {
    return () => {
      notifiedAlertIds.current.clear();
      pendingNotifications.current = [];
    };
  }, []);

  const flushNotifications = useCallback(() => {
    for (const n of pendingNotifications.current) {
      notification.warning({ message: n.message, description: n.description, duration: 8, placement: 'topRight' });
    }
    pendingNotifications.current = [];
  }, []);

  // 监听 patrolState.new_alerts，弹出非阻塞通知（有 Modal 时排队，Modal 关闭后显示）
  useEffect(() => {
    const alerts = patrolState?.new_alerts;
    if (!alerts?.length) return;
    const ALERT_TYPE_LABELS: Record<string, string> = {
      bed_absence: '老人离床',
      floor_clutter: '地面有杂物',
      floor_water: '地面有水渍',
    };
    const hasModal = !!fallEvent || !!stuckEvent;
    for (const alert of alerts) {
      if (notifiedAlertIds.current.has(alert.id)) continue;
      if (['fall_detected', 'robot_stuck'].includes(alert.alert_type)) continue;
      notifiedAlertIds.current.add(alert.id);
      const n = {
        type: alert.alert_type,
        message: ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type,
        description: `${alert.room_id} — ${alert.message}`,
      };
      if (hasModal) {
        pendingNotifications.current.push(n);
      } else {
        notification.warning({ message: n.message, description: n.description, duration: 8, placement: 'topRight' });
      }
    }
  }, [patrolState?.new_alerts, fallEvent, stuckEvent]);

  // Modal 关闭后 flush 排队的 notification
  useEffect(() => {
    if (!fallEvent && !stuckEvent) {
      flushNotifications();
    }
  }, [fallEvent, stuckEvent, flushNotifications]);

  // Subscribe to robot pose
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    const unsubscribe = apiService.subscribeTopic<any>(
      '/loc_high_freq',
      MESSAGE_TYPES.ODOMETRY,
      (msg) => {
        const pos = msg?.pose?.pose?.position;
        const ori = msg?.pose?.pose?.orientation;
        if (!pos || !ori || typeof ori.w !== 'number') return;
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
    const unsubscribe = apiService.subscribeMap((mapData) => setCurrentMap(mapData));
    // 主动加载当前地图，不等 /map 话题推送
    apiService.getCurrentMapName().then(async (name) => {
      if (name) {
        try {
          const mapData = await apiService.loadMap(name);
          if (mapData) setCurrentMap(mapData);
        } catch (e) {
          console.warn('[任务下发] 加载地图失败:', e);
        }
      }
    });
    return () => unsubscribe();
  }, [connectionStatus]);

  const isActive = patrolState?.active ?? false;

  const handleStart = async () => {
    const preset = presets.find(p => p.id === selectedPresetId);
    const taskConfig = preset ? { name: preset.name, rooms: preset.rooms, retry_limit: preset.retry_limit, fall_detection_enabled: preset.fall_detection_enabled } : undefined;
    const result = await apiService.startRoomPatrol(taskConfig);
    if (result.success) {
      message.success(result.message);
    } else {
      message.error(result.message);
    }
  };

  const handleStop = async () => {
    const result = await apiService.stopRoomPatrol();
    if (result.success) {
      message.info('巡房已停止');
    } else {
      message.error(result.message);
    }
  };

  const handlePause = async () => {
    const result = await apiService.pauseRoomPatrol();
    if (result.success) {
      message.info('巡房已暂停');
    } else {
      message.error(result.message);
    }
  };

  const handleResume = async () => {
    const result = await apiService.resumeRoomPatrol();
    if (result.success) {
      message.success('巡房已恢复');
    } else {
      message.error(result.message);
    }
  };

  const progressPercent = patrolState ? Math.round(Math.max(0, Math.min(1, patrolState.progress)) * 100) : 0;

  // Build ALL waypoints for map display: 3 points per room (door_outside, door_inside, bed_check) + start_position
  // Structure: [room1_outside, room1_inside, room1_bed, room2_outside, ..., start_position]
  const roomLookup = new Map(roomConfigs.map(r => [r.room_id, r]));
  const displayRoomIds = taskRoomIds.length > 0 ? taskRoomIds : roomConfigs.filter(r => r.door_outside).map(r => r.room_id);
  const waypoints: Pose[] = [];
  const waypointMeta: { roomId: string; type: string; waypointIdx: number }[] = [];
  const waypointLabels: string[] = [];
  const waypointColors: string[] = [];

  for (let i = 0; i < displayRoomIds.length; i++) {
    const rid = displayRoomIds[i];
    const rc = roomLookup.get(rid);
    if (!rc) continue;
    const roomLabel = String(i + 1);
    const points = [
      { pose: rc.door_outside, type: 'door_outside' },
      { pose: rc.door_inside, type: 'door_inside' },
      { pose: rc.bed_check, type: 'bed_check' },
    ];
    for (const p of points) {
      if (p.pose) {
        waypointMeta.push({ roomId: rid, type: p.type, waypointIdx: waypoints.length });
        waypoints.push(p.pose);
        waypointLabels.push(roomLabel);
        waypointColors.push(WAYPOINT_TYPE_COLORS[p.type] || '#999');
      }
    }
  }

  // 起点：只要配置了就显示在地图上
  if (startPosition) {
    waypointMeta.push({ roomId: '', type: 'start_position', waypointIdx: waypoints.length });
    waypoints.push(startPosition);
    waypointLabels.push('S');
    waypointColors.push('#722ed1');
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
      {/* 跌倒检测告警弹窗 */}
      <Modal
        open={!!fallEvent}
        closable={false}
        maskClosable={false}
        footer={null}
        centered
        width={420}
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <WarningFilled style={{ fontSize: 56, color: '#ff4d4f' }} />
          <div style={{ fontSize: 22, fontWeight: 700, color: '#ff4d4f', margin: '16px 0 8px' }}>
            检测到老人跌倒！
          </div>
          {fallEvent && (
            <div style={{ color: '#666', marginBottom: 8 }}>
              位置：<strong>{fallEvent.location}</strong>
              &nbsp;&nbsp;置信度：<strong>{(fallEvent.confidence * 100).toFixed(0)}%</strong>
            </div>
          )}
          <div style={{ color: '#999', fontSize: 13, marginBottom: 24 }}>
            巡逻任务已暂停，请立即前往处理
          </div>
          <Button
            type="primary"
            danger
            size="large"
            loading={fallAcking}
            onClick={handleAckFall}
            style={{ width: 200 }}
          >
            确认已处理
          </Button>
        </div>
      </Modal>

      {/* 机器人卡住告警弹窗 */}
      <Modal
        open={!!stuckEvent}
        closable={false}
        maskClosable={false}
        footer={null}
        centered
        width={420}
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <WarningFilled style={{ fontSize: 56, color: '#faad14' }} />
          <div style={{ fontSize: 22, fontWeight: 700, color: '#faad14', margin: '16px 0 8px' }}>
            机器人导航失败，无法移动！
          </div>
          {stuckEvent && (
            <div style={{ color: '#666', marginBottom: 8 }}>
              房间：<strong>{stuckEvent.room_id}</strong>
            </div>
          )}
          <div style={{ color: '#999', fontSize: 13, marginBottom: 24 }}>
            巡逻任务已暂停，请人工处理后确认
          </div>
          <Button
            type="primary"
            size="large"
            loading={stuckAcking}
            onClick={handleAckStuck}
            style={{ width: 200 }}
          >
            确认已处理
          </Button>
        </div>
      </Modal>

      {/* Left: Map */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        {currentMap ? (
          <MapCanvas
            mapData={currentMap}
            robotPose={robotPose}
            waypoints={waypoints}
            waypointLabels={waypointLabels}
            waypointColors={waypointColors}
            currentWaypointIndex={currentWaypointIndex}
            completedWaypoints={completedWaypoints}
            showCoordinateSystem={true}
            showRobotTrail={true}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
            {connectionStatus === ConnectionStatus.CONNECTED ? '等待地图数据...' : '请先连接 后端'}
          </div>
        )}
      </div>

      {/* Right: Control panel */}
      <div style={{ width: 320, minWidth: 280, flexShrink: 0, borderLeft: '1px solid #f0f0f0', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Start/Stop */}
        <Card size="small" title="巡房控制">
          {!isActive && presets.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>选择任务</div>
              <Select
                size="small"
                value={selectedPresetId}
                onChange={setSelectedPresetId}
                style={{ width: '100%' }}
                options={presets.map(p => ({ value: p.id, label: `${p.is_default ? '⭐ ' : ''}${p.name}` }))}
              />
            </div>
          )}
          {isActive ? (
            <Space.Compact block>
              {patrolState?.status === 'paused_manual' ? (
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleResume} style={{ flex: 1 }}>
                  继续巡房
                </Button>
              ) : (
                <Button icon={<PauseCircleOutlined />} onClick={handlePause} style={{ flex: 1 }}>
                  暂停巡房
                </Button>
              )}
              <Button type="primary" danger icon={<StopOutlined />} onClick={handleStop} style={{ flex: 1 }}>
                停止巡房
              </Button>
            </Space.Compact>
          ) : (
            <Button type="primary" block icon={<PlayCircleOutlined />} onClick={handleStart}
              disabled={connectionStatus !== ConnectionStatus.CONNECTED}>
              开始巡房
            </Button>
          )}
        </Card>

        {/* Status */}
        {patrolState && patrolState.status !== 'idle' && (
          <Card size="small" title={`巡房状态${patrolState.task_name ? ` — ${patrolState.task_name}` : ''}`}>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>状态</span>
                <Tag color={
                  patrolState.status === 'paused_manual' ? 'warning' :
                  isActive ? 'processing' :
                  patrolState.status === 'completed' ? 'success' :
                  patrolState.status === 'failed' ? 'error' : 'default'
                }>
                  {patrolState.status === 'running' ? '巡房中' :
                   patrolState.status === 'paused_manual' ? '已暂停' :
                   patrolState.status === 'paused_fall' ? '跌倒暂停' :
                   patrolState.status === 'paused_stuck' ? '卡住暂停' :
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
                    <Tag color="blue"><LoadingOutlined /> {stepLabels[patrolState.current_step] || patrolState.current_step}</Tag>
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
              {(patrolState.rooms || displayRoomIds.map((rid: string) => ({ room_id: rid, room_name: roomLookup.get(rid)?.room_name || rid, steps: taskRoomSteps[rid] || [] }))).map((room: any) => {
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

                          const label = stepLabels[step.type] || step.type;
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
