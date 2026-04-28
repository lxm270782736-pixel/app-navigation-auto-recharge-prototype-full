import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Button as UIButton,
  Card as UICard,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  cn,
} from '@astribot/ui';
import { AlertTriangle, Image as ImageIcon } from 'lucide-react';
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
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [alertToasts, setAlertToasts] = useState<Array<{ id: string; message: string; description: string }>>([]);
  const [esdfData, setEsdfData] = useState<MapData | null>(null);
  const [navDebug, setNavDebug] = useState<{ mpc?: any; planner?: any } | null>(null);
  const [esdfLayerOn, setEsdfLayerOn] = useState(false);
  const [horizonLayerOn, setHorizonLayerOn] = useState(false);

  const fallEvent = patrolState?.fall_event ?? null;
  const stuckEvent = patrolState?.stuck_event ?? null;

  const pushAlertToast = useCallback((message: string, description: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setAlertToasts((prev) => [...prev.slice(-3), { id, message, description }]);
    window.setTimeout(() => {
      setAlertToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 8000);
  }, []);

  // 跌倒事件弹窗确认
  const handleAckFall = async () => {
    setFallAcking(true);
    try {
      await apiService.acknowledgeFall();
      setNotice({ tone: 'success', text: '已确认处理' });
    } catch {
      setNotice({ tone: 'error', text: '确认失败，请重试' });
    } finally {
      setFallAcking(false);
    }
  };

  // 机器人卡住事件弹窗确认
  const handleAckStuck = async () => {
    setStuckAcking(true);
    try {
      await apiService.acknowledgeStuck();
      setNotice({ tone: 'success', text: '已确认处理' });
    } catch {
      setNotice({ tone: 'error', text: '确认失败，请重试' });
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
          pushAlertToast(n.message, n.description);
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
      pushAlertToast(n.message, n.description);
    }
    pendingNotifications.current = [];
  }, [pushAlertToast]);

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
    // Monotonic seq guards against out-of-order responses overwriting newer
    // data; empty-streak tolerance smooths over transient RPC hiccups so
    // the path doesn't flicker when the backend returns [] for a frame.
    let seq = 0;
    let latestAccepted = 0;
    let emptyStreak = 0;
    const EMPTY_TOLERANCE = 3;

    const pollPath = async () => {
      const mySeq = ++seq;
      try {
        const path = await apiService.getNavigationPath();
        if (cancelled || mySeq <= latestAccepted) return;
        latestAccepted = mySeq;
        const points: PathPoint[] = Array.isArray(path)
          ? path
              .filter((p: any) => typeof p?.x === 'number' && typeof p?.y === 'number')
              .map((p: any) => ({ x: p.x, y: p.y }))
          : [];
        if (points.length === 0) {
          emptyStreak += 1;
          if (emptyStreak >= EMPTY_TOLERANCE) setNavigationPath([]);
        } else {
          emptyStreak = 0;
          setNavigationPath(points);
        }
      } catch {
        if (cancelled || mySeq <= latestAccepted) return;
        latestAccepted = mySeq;
        emptyStreak += 1;
        if (emptyStreak >= EMPTY_TOLERANCE) setNavigationPath([]);
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

  // ESDF snapshot polling — only when ESDF layer is on.
  useEffect(() => {
    if (!esdfLayerOn || connectionStatus !== ConnectionStatus.CONNECTED) {
      setEsdfData(null);
      return;
    }
    const intervalMs = isActive ? 1000 : 5000;
    let cancelled = false;
    const poll = async () => {
      const snap = await apiService.getEsdfSnapshot(2.0);
      if (cancelled) return;
      if (!snap || !snap.data || snap.data.length === 0) {
        return;
      }
      setEsdfData({
        id: 'esdf',
        name: 'esdf',
        createdAt: '',
        thumbnail: '',
        width: snap.width,
        height: snap.height,
        resolution: snap.resolution,
        origin: { x: snap.origin_x, y: snap.origin_y, orientation: 0 },
        data: snap.data,
      });
    };
    void poll();
    const timer = window.setInterval(() => void poll(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [esdfLayerOn, connectionStatus, isActive]);

  // MPC / planner debug polling — only when MPC layer is on and a run is active.
  useEffect(() => {
    if (!horizonLayerOn || connectionStatus !== ConnectionStatus.CONNECTED || !isActive) {
      setNavDebug(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const dbg = await apiService.getNavigationDebug();
      if (cancelled) return;
      setNavDebug(dbg);
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [horizonLayerOn, connectionStatus, isActive]);

  const handleLayerVisibilityChange = useCallback((next: { esdf: boolean; horizon: boolean }) => {
    setEsdfLayerOn(next.esdf);
    setHorizonLayerOn(next.horizon);
  }, []);

  const handleStart = async () => {
    const preset = presets.find(p => p.id === selectedPresetId);
    const taskConfig = preset
      ? { name: preset.name, rooms: preset.rooms, retry_limit: preset.retry_limit, fall_detection_enabled: preset.fall_detection_enabled, advance_mode: advanceMode }
      : { advance_mode: advanceMode };
    const result = await apiService.startRoomPatrol(taskConfig as any);
    if (result.success) {
      setNotice({ tone: 'success', text: result.message });
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  const handleStop = async () => {
    const result = await apiService.stopRoomPatrol();
    if (result.success) {
      setNotice({ tone: 'success', text: '导览已停止' });
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  const handlePause = async () => {
    const result = await apiService.pauseRoomPatrol();
    if (result.success) {
      setNotice({ tone: 'success', text: '导览已暂停' });
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  const handleResume = async () => {
    const result = await apiService.resumeRoomPatrol();
    if (result.success) {
      setNotice({ tone: 'success', text: '导览已恢复' });
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  const handleAdvance = async (targetStepIndex: number = -1) => {
    setAdvancing(true);
    try {
      const result = await apiService.advanceRoomPatrolStep(targetStepIndex);
      if (!result.success) setNotice({ tone: 'error', text: result.message });
    } finally {
      setAdvancing(false);
    }
  };

  const handleSkipStep = async () => {
    const idx = patrolState?.current_step_index ?? -1;
    setSkipping(true);
    try {
      const result = await apiService.skipRoomPatrolStep(idx);
      if (!result.success) setNotice({ tone: 'error', text: result.message });
    } finally {
      setSkipping(false);
    }
  };

  const progressPercent = patrolState ? Math.round(Math.max(0, Math.min(1, patrolState.progress)) * 100) : 0;

  // Build ALL waypoints for map display: dynamic per-room waypoints + start_position
  const roomLookup = new Map(roomConfigs.map(r => [r.room_id, r]));
  // 点位 id → 名称映射（用于步骤显示）
  const waypointNameMap = useMemo(() => {
    const map: Record<string, string> = { start_position: '起点' };
    for (const rc of roomConfigs) {
      for (const wp of (rc.waypoints || [])) {
        if (wp.id && wp.name && !map[wp.id]) map[wp.id] = wp.name;
      }
    }
    return map;
  }, [roomConfigs]);
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
    <div className="relative flex h-full overflow-hidden bg-background">
      {alertToasts.length > 0 && (
        <div className="pointer-events-none absolute right-4 top-4 z-50 flex w-[320px] flex-col gap-2">
          {alertToasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto rounded-lg border border-amber-500/30 bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
            >
              <div className="text-sm font-semibold text-amber-300">{toast.message}</div>
              <div className="mt-1 text-xs text-muted-foreground">{toast.description}</div>
            </div>
          ))}
        </div>
      )}

      {/* 跌倒检测告警弹窗 */}
      <Dialog open={!!fallEvent}>
        <DialogContent className="sm:max-w-lg [&>button]:hidden">
          <DialogHeader className="items-center text-center">
            <div className="mb-2 rounded-full bg-destructive/10 p-4 text-destructive">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <DialogTitle className="text-2xl text-destructive">检测到老人跌倒</DialogTitle>
            <DialogDescription>巡逻任务已暂停，请立即前往处理。</DialogDescription>
          </DialogHeader>
          {fallEvent && (
            <div className="text-center text-sm text-muted-foreground">
              位置：<strong>{fallEvent.location}</strong>
              {'  '}置信度：<strong>{(fallEvent.confidence * 100).toFixed(0)}%</strong>
            </div>
          )}
          {fallEvent?.photo ? (
            <img
              src={`data:image/png;base64,${fallEvent.photo}`}
              className="max-h-[220px] w-full rounded-lg border border-border/70 object-cover"
            />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
          <DialogFooter className="sm:justify-center">
            <UIButton type="button" variant="destructive" size="lg" onClick={handleAckFall} disabled={fallAcking}>
              确认已处理
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 机器人卡住告警弹窗 */}
      <Dialog open={!!stuckEvent}>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader className="items-center text-center">
            <div className="mb-2 rounded-full bg-amber-500/10 p-4 text-amber-400">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <DialogTitle className="text-2xl text-amber-300">机器人导航失败</DialogTitle>
            <DialogDescription>巡逻任务已暂停，请人工处理后确认。</DialogDescription>
          </DialogHeader>
          {stuckEvent && (
            <div className="text-center text-sm text-muted-foreground">
              区域：<strong>{stuckEvent.room_id}</strong>
            </div>
          )}
          <DialogFooter className="sm:justify-center">
            <UIButton type="button" size="lg" onClick={handleAckStuck} disabled={stuckAcking}>
              确认已处理
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Left: Map */}
      <div className="relative min-w-0 flex-1 overflow-hidden">
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
            esdfData={esdfLayerOn ? esdfData : null}
            horizonPath={horizonLayerOn && navDebug?.mpc?.horizon ? navDebug.mpc.horizon : undefined}
            availableLayers={['esdf', 'horizon']}
            onLayerVisibilityChange={handleLayerVisibilityChange}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {connectionStatus === ConnectionStatus.CONNECTED ? '等待地图数据...' : '请先连接 后端'}
          </div>
        )}

        {/* 导航调试浮窗 — horizon 图层开启时显示 */}
        {currentMap && horizonLayerOn && navDebug && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 w-52 space-y-1.5 rounded-md border border-border/70 bg-card/90 p-3 font-mono text-[11px] text-foreground shadow-sm backdrop-blur">
            <div className="mb-1 font-sans text-xs text-muted-foreground">导航调试</div>
            {navDebug.planner?.fsm_state && (
              <div>FSM: <span className="text-primary">{navDebug.planner.fsm_state}</span></div>
            )}
            {navDebug.planner?.last_replan_reason && navDebug.planner.last_replan_reason !== 'NONE' && (
              <div>重规划: {navDebug.planner.last_replan_reason}</div>
            )}
            {navDebug.mpc && typeof navDebug.mpc.proj_t === 'number' && (
              <div>proj_t: {navDebug.mpc.proj_t.toFixed(2)} / {navDebug.mpc.traj_duration?.toFixed(2) ?? '?'}</div>
            )}
            {navDebug.mpc && typeof navDebug.mpc.pos_err === 'number' && (
              <div>pos_err: {navDebug.mpc.pos_err.toFixed(3)} m</div>
            )}
            {navDebug.mpc && typeof navDebug.mpc.yaw_err === 'number' && (
              <div>yaw_err: {navDebug.mpc.yaw_err.toFixed(3)} rad</div>
            )}
            {navDebug.mpc?.in_rotation_phase && (
              <div className="text-amber-500">旋转阶段</div>
            )}
          </div>
        )}
      </div>

      {/* Right: Control panel */}
      <div className="flex w-80 min-w-[280px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border/70 bg-card/60 p-4">
        {notice && (
          <div
            className={cn(
              'rounded-lg border px-3 py-2 text-sm',
              notice.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-destructive/40 bg-destructive/10 text-destructive'
            )}
          >
            {notice.text}
          </div>
        )}
        {/* Start/Stop */}
        <UICard className="border-border/70 bg-card/90">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">导览控制</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
          {!isActive && presets.length > 0 && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">选择任务</div>
              <select
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {`${p.is_default ? '⭐ ' : ''}${p.name}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!isActive && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">步骤推进</div>
              <div className="grid grid-cols-2 gap-2">
                <UIButton type="button" variant={advanceMode === 'auto' ? 'default' : 'outline'} size="sm" onClick={() => setAdvanceMode('auto')}>
                  自动
                </UIButton>
                <UIButton type="button" variant={advanceMode === 'manual' ? 'default' : 'outline'} size="sm" onClick={() => setAdvanceMode('manual')}>
                  手动
                </UIButton>
              </div>
            </div>
          )}
          {isActive ? (
            <div className="space-y-2">
              {patrolState?.awaiting_advance && (
                <UIButton type="button" className="w-full" onClick={() => handleAdvance()} disabled={advancing}>
                  下一步
                </UIButton>
              )}
              <div className="grid grid-cols-2 gap-2">
                {patrolState?.status === 'paused_manual' ? (
                  <UIButton type="button" onClick={handleResume}>
                    继续导览
                  </UIButton>
                ) : (
                  <UIButton type="button" variant="outline" onClick={handlePause}>
                    暂停导览
                  </UIButton>
                )}
                <UIButton type="button" variant="destructive" onClick={handleStop}>
                  停止导览
                </UIButton>
              </div>
            </div>
          ) : (
            <UIButton type="button" className="w-full" onClick={handleStart} disabled={connectionStatus !== ConnectionStatus.CONNECTED}>
              开始导览
            </UIButton>
          )}
          </CardContent>
        </UICard>

        {/* Status */}
        {patrolState && patrolState.status !== 'idle' && (
          <UICard className="border-border/70 bg-card/90">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{`导览状态${patrolState.task_name ? ` — ${patrolState.task_name}` : ''}`}</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>状态</span>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-xs',
                  patrolState.status === 'paused_manual' ? 'bg-amber-500/15 text-amber-300' :
                  isActive ? 'bg-sky-500/15 text-sky-300' :
                  patrolState.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300' :
                  patrolState.status === 'failed' ? 'bg-destructive/15 text-destructive' :
                  'bg-muted text-muted-foreground'
                )}>
                  {patrolState.status === 'running' ? '导览中' :
                   patrolState.status === 'paused_manual' ? '已暂停' :
                   patrolState.status === 'paused_fall' ? '跌倒暂停' :
                   patrolState.status === 'paused_stuck' ? '卡住暂停' :
                   patrolState.status === 'completed' ? '已完成' :
                   patrolState.status === 'stopped' ? '已停止' :
                   patrolState.status === 'failed' ? '失败' : patrolState.status}
                </span>
              </div>

              <Progress value={progressPercent} className="h-2" />

              {isActive && patrolState.current_room && (
                <>
                  <div className="flex justify-between text-sm">
                    <span>当前区域</span>
                    <span className="font-semibold">{patrolState.current_room}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>当前步骤</span>
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-300">
                      {stepLabels[patrolState.current_step] || patrolState.current_step}
                    </span>
                  </div>
                  {patrolState.nav_fail_reason && (
                    <div className="flex justify-between text-sm">
                      <span>导航失败</span>
                      <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">{patrolState.nav_fail_reason}</span>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between text-sm">
                <span>完成</span>
                <span className="text-emerald-300">
                  {patrolState.rooms_completed.length} / {patrolState.rooms_total}
                </span>
              </div>

              {patrolState.rooms_failed.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span>失败</span>
                  <span className="text-destructive">
                    {patrolState.rooms_failed.join(', ')}
                  </span>
                </div>
              )}

              {patrolState.error && (
                <div className="text-xs text-destructive">
                  {patrolState.error}
                </div>
              )}
            </div>
            </CardContent>
          </UICard>
        )}

        {/* Room progress list with step detail — 选中任务后即显示，执行时显示进度 */}
        {displayRoomIds.length > 0 && (
          (() => {
            const isRunning = patrolState?.active ?? false;
            const title = isRunning ? "区域进度" : "任务预览";
            const roomList = isRunning
              ? (patrolState?.rooms || displayRoomIds.map((rid: string) => ({ room_id: rid, room_name: roomLookup.get(rid)?.room_name || rid, steps: taskRoomSteps[rid] || [] })))
              : displayRoomIds.map((rid: string) => ({ room_id: rid, room_name: roomLookup.get(rid)?.room_name || rid, steps: taskRoomSteps[rid] || [] }));
            return (
          <UICard className="flex-1 overflow-auto border-border/70 bg-card/90">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="space-y-2">
              {roomList.map((room: any) => {
                const rid = room.room_id;
                const isDone = isRunning && (patrolState?.rooms_completed?.includes(rid) ?? false);
                const isFailed = isRunning && (patrolState?.rooms_failed?.includes(rid) ?? false);
                const isCurrent = isRunning && (patrolState?.active ?? false) && patrolState?.current_room === rid;
                const isPending = !isDone && !isFailed && !isCurrent;
                const steps = room.steps || [];

                // Use step index from backend instead of findIndex by type name
                const currentStepIdx = isCurrent
                  ? (patrolState?.current_step_index ?? -1)
                  : -1;

                return (
                  <div
                    key={rid}
                    className={cn(
                      'rounded-lg border px-3 py-3',
                      isCurrent
                        ? 'border-sky-500/40 bg-sky-500/10'
                        : isDone
                          ? 'border-emerald-500/30 bg-emerald-500/10'
                          : isFailed
                            ? 'border-destructive/30 bg-destructive/10'
                            : 'border-border/70 bg-background/70'
                    )}
                  >
                    {/* Room header */}
                    <div className={cn('flex items-center justify-between', isCurrent && 'mb-2')}>
                      <span className="text-sm font-semibold text-foreground">
                        {room.room_name || rid}
                      </span>
                      {isDone && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">已完成</span>}
                      {isFailed && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">失败</span>}
                      {isCurrent && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-300">执行中</span>}
                      {isPending && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">等待</span>}
                    </div>

                    {/* Step progress — 执行中显示进度，预览时展开所有步骤 */}
                    {steps.length > 0 && (isCurrent || !isRunning) && (
                      <div className="mt-1 flex flex-col gap-1">
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
                          const targetName = step.target ? (waypointNameMap[step.target] || step.target) : '';
                          const suffix = step.type === 'navigate' ? ` → ${targetName}` : step.label ? ` (${step.label})` : '';
                          const isCurrentStep = isCurrent && si === currentStepIdx && status === 'process';
                          const canJump = isAwaiting && si !== currentStepIdx + 1;

                          const icon = status === 'finish'
                            ? <span className="text-sm text-emerald-400">●</span>
                            : status === 'error'
                              ? <span className="text-sm text-destructive">●</span>
                              : status === 'process'
                                ? <span className="text-sm text-sky-400">●</span>
                                : <span className="inline-block h-3.5 w-3.5 rounded-full border border-border/80" />;

                          return (
                            <div
                              key={si}
                              className={cn(
                                'flex items-center gap-2 rounded-md border px-2 py-1.5 transition',
                                status === 'process'
                                  ? 'border-sky-500/40 bg-sky-500/10'
                                  : status === 'error'
                                    ? 'border-destructive/30 bg-destructive/10'
                                    : status === 'finish'
                                      ? 'border-emerald-500/30 bg-emerald-500/10'
                                      : 'border-border/60 bg-transparent'
                              )}
                            >
                              {icon}
                              <span className={cn(
                                'flex-1 text-xs',
                                isCurrentStep && 'font-semibold',
                                status === 'error'
                                  ? 'text-destructive'
                                  : status === 'wait'
                                    ? 'text-muted-foreground'
                                    : 'text-foreground'
                              )}>
                                <span className="mr-1 text-muted-foreground">{si + 1}.</span>
                                {label}{suffix}
                              </span>
                              {isCurrentStep && (
                                <UIButton
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={skipping}
                                  onClick={(e) => { e.stopPropagation(); handleSkipStep(); }}
                                >
                                  跳过
                                </UIButton>
                              )}
                              {canJump && (
                                <UIButton
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={advancing}
                                  onClick={(e) => { e.stopPropagation(); handleAdvance(si); }}
                                >
                                  {si <= currentStepIdx ? '重新执行' : '从此执行'}
                                </UIButton>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </CardContent>
          </UICard>
            );
          })()
        )}
      </div>
    </div>
  );
};
