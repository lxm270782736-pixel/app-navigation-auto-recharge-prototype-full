import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Card, Progress, Tag, message, Space, Badge, Select, Modal, notification, Segmented } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  EnvironmentOutlined,
  WarningFilled,
  PauseCircleOutlined,
  PictureOutlined,
  StepForwardOutlined,
} from '@ant-design/icons';
import { MapCanvas } from '@/components/common/MapCanvas';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import type { MapData, Pose, RoomPatrolState, RoomConfig, PathPoint } from '@/types';

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
  const [navigationPath, setNavigationPath] = useState<PathPoint[]>([]);
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
  const [advanceMode, setAdvanceMode] = useState<'auto' | 'manual'>('auto');
  const [advancing, setAdvancing] = useState(false);
  const [skipping, setSkipping] = useState(false);

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
    const ALERT_TYPE_LABELS: Record<string, string> = {
      bed_absence: '老人离床',
      floor_clutter: '地面有杂物',
      floor_water: '地面有水渍',
    };
    const handler = (data: RoomPatrolState) => {
      setPatrolState(data);
      // 直接在 handler 里处理 alert，不依赖 patrolState state 更新后的 useEffect
      const alerts = data.new_alerts;
      if (!alerts?.length) return;
      console.log('[patrol] room-patrol-state received with new_alerts:', alerts.map((a: any) => a.id));
      const hasModal = !!data.fall_event || !!data.stuck_event;
      for (const alert of alerts) {
        if (notifiedAlertIds.current.has(alert.id)) continue;
        if (['fall_detected', 'robot_stuck'].includes(alert.alert_type)) continue;
        notifiedAlertIds.current.add(alert.id);
        const label = ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type;
        const n = {
          type: alert.alert_type,
          message: label,
          description: `${alert.room_id} — ${alert.message}`,
        };
        if (hasModal) {
          console.log('[alert] queued (modal open):', alert.id, alert.alert_type);
          pendingNotifications.current.push(n);
        } else {
          console.log('[alert] showing notification:', alert.id, alert.alert_type);
          notification.warning({ message: n.message, description: n.description, duration: 8, placement: 'topRight' });
        }
      }
    };
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

  // Modal 关闭後 flush 排队的 notification
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

  // Poll navigation MINCO path via backend meta API
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      setNavigationPath([]);
      return;
    }

    let cancelled = false;

    const pollPath = async () => {
      try {
        const path = await apiService.getNavigationPath();
        if (cancelled) return;
        const points: PathPoint[] = Array.isArray(path)
          ? path
              .filter((p: any) => typeof p?.x === 'number' && typeof p?.y === 'number')
              .map((p: any) => ({ x: p.x, y: p.y }))
          : [];
        setNavigationPath(points);
      } catch {
        if (!cancelled) setNavigationPath([]);
      }
    };

    pollPath();
    const timer = window.setInterval(pollPath, 500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connectionStatus]);

  const isActive = patrolState?.active ?? false;

  const handleStart = async () => {
    const preset = presets.find(p => p.id === selectedPresetId);
    const taskConfig = preset
      ? { name: preset.name, rooms: preset.rooms, retry_limit: preset.retry_limit, fall_detection_enabled: preset.fall_detection_enabled, advance_mode: advanceMode }
      : { advance_mode: advanceMode };
    const result = await apiService.startRoomPatrol(taskConfig as any);
    if (result.success) {
      message.success(result.message);
    } else {
      message.error(result.message);
    }
  };

  const handleStop = async () => {
    const result = await apiService.stopRoomPatrol();
    if (result.success) {
      message.info('导览已停止');
    } else {
      message.error(result.message);
    }
  };

  const handlePause = async () => {
    const result = await apiService.pauseRoomPatrol();
    if (result.success) {
      message.info('导览已暂停');
    } else {
      message.error(result.message);
    }
  };

  const handleResume = async () => {
    const result = await apiService.resumeRoomPatrol();
    if (result.success) {
      message.success('导览已恢复');
    } else {
      message.error(result.message);
    }
  };

  const handleAdvance = async (targetStepIndex: number = -1) => {
    setAdvancing(true);
    try {
      const result = await apiService.advanceRoomPatrolStep(targetStepIndex);
      if (!result.success) message.error(result.message);
    } finally {
      setAdvancing(false);
    }
  };

  const handleSkipStep = async () => {
    const idx = patrolState?.current_step_index ?? -1;
    setSkipping(true);
    try {
      const result = await apiService.skipRoomPatrolStep(idx);
      if (!result.success) message.error(result.message);
    } finally {
      setSkipping(false);
    }
  };

  const progressPercent = patrolState ? Math.round(Math.max(0, Math.min(1, patrolState.progress)) * 100) : 0;

  // Build ALL waypoints for map display: dynamic per-room waypoints + start_position
  const roomLookup = new Map(roomConfigs.map(r => [r.room_id, r]));
  const displayRoomIds = taskRoomIds.length > 0 ? taskRoomIds : roomConfigs.filter(r => (r.waypoints || []).some(wp => wp.pose)).map(r => r.room_id);
  const waypoints: Pose[] = [];
  const waypointMeta: { roomId: string; type: string; waypointIdx: number }[] = [];
  const waypointLabels: string[] = [];
  const waypointColors: string[] = [];

  for (let i = 0; i < displayRoomIds.length; i++) {
    const rid = displayRoomIds[i];
    const rc = roomLookup.get(rid);
    if (!rc) continue;
    const roomLabel = String(i + 1);
    for (const wp of (rc.waypoints || [])) {
      if (wp.pose) {
        waypointMeta.push({ roomId: rid, type: wp.id, waypointIdx: waypoints.length });
        waypoints.push(wp.pose);
        waypointLabels.push(roomLabel);
        waypointColors.push(WAYPOINT_TYPE_COLORS[wp.type] || '#999');
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

  // Determine current waypoint index: highlight the first waypoint of the current room
  let currentWaypointIndex = -1;
  if (patrolState?.active && patrolState.current_room) {
    const meta = waypointMeta.find(m => m.roomId === patrolState.current_room);
    if (meta) currentWaypointIndex = meta.waypointIdx;
  }

  // Completed: mark all points of completed rooms
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
        width={460}
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
          {/* 跌倒现场照片 */}
          {fallEvent?.photo ? (
            <img
              src={`data:image/png;base64,${fallEvent.photo}`}
              style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 16 }}
            />
          ) : (
            <div style={{ width: '100%', height: 120, background: '#f5f5f5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <PictureOutlined style={{ fontSize: 32, color: '#ccc' }} />
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
              区域：<strong>{stuckEvent.room_id}</strong>
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
            path={navigationPath}
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
        <Card size="small" title="导览控制">
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
          {!isActive && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>步骤推进</div>
              <Segmented
                size="small"
                block
                value={advanceMode}
                onChange={(v) => setAdvanceMode(v as 'auto' | 'manual')}
                options={[
                  { label: '自动', value: 'auto' },
                  { label: '手动', value: 'manual' },
                ]}
              />
            </div>
          )}
          {isActive ? (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {patrolState?.awaiting_advance && (
                <Button
                  type="primary"
                  block
                  icon={<StepForwardOutlined />}
                  onClick={() => handleAdvance()}
                  loading={advancing}
                >
                  下一步
                </Button>
              )}
              <Space.Compact block>
                {patrolState?.status === 'paused_manual' ? (
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleResume} style={{ flex: 1 }}>
                    继续导览
                  </Button>
                ) : (
                  <Button icon={<PauseCircleOutlined />} onClick={handlePause} style={{ flex: 1 }}>
                    暂停导览
                  </Button>
                )}
                <Button type="primary" danger icon={<StopOutlined />} onClick={handleStop} style={{ flex: 1 }}>
                  停止导览
                </Button>
              </Space.Compact>
            </Space>
          ) : (
            <Button type="primary" block icon={<PlayCircleOutlined />} onClick={handleStart}
              disabled={connectionStatus !== ConnectionStatus.CONNECTED}>
              开始导览
            </Button>
          )}
        </Card>

        {/* Status */}
        {patrolState && patrolState.status !== 'idle' && (
          <Card size="small" title={`导览状态${patrolState.task_name ? ` — ${patrolState.task_name}` : ''}`}>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>状态</span>
                <Tag color={
                  patrolState.status === 'paused_manual' ? 'warning' :
                  isActive ? 'processing' :
                  patrolState.status === 'completed' ? 'success' :
                  patrolState.status === 'failed' ? 'error' : 'default'
                }>
                  {patrolState.status === 'running' ? '导览中' :
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
                    <span>当前区域</span>
                    <span style={{ fontWeight: 600 }}><EnvironmentOutlined /> {patrolState.current_room}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>当前步骤</span>
                    <Tag color="blue"><LoadingOutlined /> {stepLabels[patrolState.current_step] || patrolState.current_step}</Tag>
                  </div>
                  {patrolState.nav_fail_reason && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>导航失败</span>
                      <Tag color="red">{patrolState.nav_fail_reason}</Tag>
                    </div>
                  )}
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

        {/* Room progress list with step detail — 选中任务后即显示，执行时显示进度 */}
        {displayRoomIds.length > 0 && (
          (() => {
            const isRunning = patrolState?.active ?? false;
            const title = isRunning ? "区域进度" : "任务预览";
            const roomList = isRunning
              ? (patrolState.rooms || displayRoomIds.map((rid: string) => ({ room_id: rid, room_name: roomLookup.get(rid)?.room_name || rid, steps: taskRoomSteps[rid] || [] })))
              : displayRoomIds.map((rid: string) => ({ room_id: rid, room_name: roomLookup.get(rid)?.room_name || rid, steps: taskRoomSteps[rid] || [] }));
            return (
          <Card size="small" title={title} style={{ flex: 1, overflow: 'auto' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {roomList.map((room: any) => {
                const rid = room.room_id;
                const isDone = isRunning && (patrolState?.rooms_completed?.includes(rid) ?? false);
                const isFailed = isRunning && (patrolState?.rooms_failed?.includes(rid) ?? false);
                const isCurrent = isRunning && (patrolState?.active ?? false) && patrolState?.current_room === rid;
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

                    {/* Step progress — 执行中显示进度，预览时展开所有步骤 */}
                    {steps.length > 0 && (isCurrent || !isRunning) && (
                      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {steps.map((step: any, si: number) => {
                          const isAwaiting = isCurrent && (patrolState?.awaiting_advance ?? false);
                          const lastStepFailed = isAwaiting && (patrolState?.last_step_failed ?? false);
                          let status: 'wait' | 'process' | 'finish' | 'error' = 'wait';
                          if (isCurrent) {
                            if (isAwaiting) {
                              if (si < currentStepIdx) status = 'finish';
                              else if (si === currentStepIdx) status = lastStepFailed ? 'error' : 'finish';
                            } else {
                              if (si < currentStepIdx) status = 'finish';
                              else if (si === currentStepIdx) status = 'process';
                            }
                          }

                          const label = stepLabels[step.type] || step.type;
                          const suffix = step.type === 'navigate' ? ` → ${step.target || ''}` : step.label ? ` (${step.label})` : '';
                          const isCurrentStep = isCurrent && si === currentStepIdx && status === 'process';
                          const canJump = isAwaiting && si !== currentStepIdx + 1;

                          const bgColor = status === 'process' ? '#e6f7ff' : status === 'error' ? '#fff2f0' : status === 'finish' ? '#f6ffed' : 'transparent';
                          const borderColor = status === 'process' ? '#1890ff' : status === 'error' ? '#ff4d4f' : status === 'finish' ? '#b7eb8f' : '#f0f0f0';
                          const icon = status === 'finish' ? <CheckCircleFilled style={{ color: '#52c41a', fontSize: 14 }} />
                            : status === 'error' ? <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 14 }} />
                            : status === 'process' ? <LoadingOutlined style={{ color: '#1890ff', fontSize: 14 }} />
                            : <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #d9d9d9', boxSizing: 'border-box' }} />;

                          return (
                            <div
                              key={si}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '5px 8px', borderRadius: 4,
                                border: `1px solid ${borderColor}`,
                                background: bgColor,
                                transition: 'all 0.2s',
                              }}
                            >
                              {icon}
                              <span style={{
                                fontSize: 12, flex: 1, fontWeight: isCurrentStep ? 600 : 400,
                                color: status === 'error' ? '#ff4d4f' : status === 'wait' ? '#999' : undefined,
                              }}>
                                <span style={{ color: '#bbb', marginRight: 4 }}>{si + 1}.</span>
                                {label}{suffix}
                              </span>
                              {isCurrentStep && (
                                <Button
                                  size="small" type="link" danger
                                  style={{ fontSize: 11, padding: '0 4px', height: 'auto' }}
                                  loading={skipping}
                                  onClick={(e) => { e.stopPropagation(); handleSkipStep(); }}
                                >
                                  跳过
                                </Button>
                              )}
                              {canJump && (
                                <Button
                                  size="small" type="link"
                                  style={{ fontSize: 11, padding: '0 4px', height: 'auto' }}
                                  loading={advancing}
                                  onClick={(e) => { e.stopPropagation(); handleAdvance(si); }}
                                >
                                  {si <= currentStepIdx ? '重新执行' : '从此执行'}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </Space>
          </Card>
            );
          })()
        )}
      </div>
    </div>
  );
};
