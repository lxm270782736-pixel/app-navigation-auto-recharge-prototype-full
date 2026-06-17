import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Layers3,
  MapPinned,
  Navigation2,
  Save,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Badge,
  Switch,
} from '@astribot/ui';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import type { MapData, PathPoint, Pose, Waypoint } from '@/types';
import dayjs from 'dayjs';

const MapCanvas = lazy(() => import('@/components/common/MapCanvas').then((module) => ({ default: module.MapCanvas })));
const NavigationControl = lazy(() =>
  import('@/components/common/NavigationControl').then((module) => ({ default: module.NavigationControl })),
);
const SimpleLocalizationControl = lazy(() =>
  import('@/components/common/SimpleLocalizationControl').then((module) => ({ default: module.SimpleLocalizationControl })),
);
const WaypointControl = lazy(() =>
  import('@/components/common/WaypointControl').then((module) => ({ default: module.WaypointControl })),
);
const WaypointConfigModal = lazy(() =>
  import('@/components/common/WaypointConfigModal').then((module) => ({ default: module.WaypointConfigModal })),
);
const ChassisControl = lazy(() =>
  import('@/components/common/ChassisControl').then((module) => ({ default: module.ChassisControl })),
);
const DockControl = lazy(() =>
  import('@/components/common/DockControl').then((module) => ({ default: module.DockControl })),
);

interface PatrolState {
  active: boolean;
  status: string;
  current_index: number;
  completed: number[];
  skipped: number[];
  total: number;
  error: string;
  waypoints: Waypoint[];
}

const GRID_SIZE_OPTIONS = [0.5, 1.0, 2.0, 5.0];

function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/90 p-4 shadow-sm backdrop-blur">
      <div className="mb-3 text-sm font-medium text-foreground">{title}</div>
      {children}
    </div>
  );
}

export function Navigation() {
  const navigate = useNavigate();
  const { connectionStatus } = useRobot();

  const [navigationPath, setNavigationPath] = useState<PathPoint[]>([]);
  const [jpsPath, setJpsPath] = useState<PathPoint[]>([]);
  const [esdfData, setEsdfData] = useState<MapData | null>(null);
  const [navDebug, setNavDebug] = useState<{ mpc?: any; planner?: any } | null>(null);
  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [isMapRealtime, setIsMapRealtime] = useState(false);
  const [currentMapName, setCurrentMapName] = useState('');
  const [robotPose, setRobotPose] = useState<Pose | undefined>();
  const [goalPose, setGoalPose] = useState<Pose | undefined>();
  const [initialPose, setInitialPose] = useState<Pose | undefined>();
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationStatus, setNavigationStatus] = useState('');
  const [navigationFeedback, setNavigationFeedback] = useState<{
    distance_to_goal?: number;
    progress?: number;
    eta?: number;
    current_task?: string;
  }>({});

  const [waypointMode, setWaypointMode] = useState(false);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [patrolState, setPatrolState] = useState<PatrolState | null>(null);
  // 巡航中断后的恢复点索引：停止时记录 current_index，再次开始时传给后端。
  // 任何 waypoints 编辑、巡航完成、切单点模式都会清空它，回到从 0 开始。
  const [resumeFromIndex, setResumeFromIndex] = useState<number | null>(null);
  const isPatrolActive = patrolState?.active ?? false;
  // Backend keeps status='succeeded' + completed=[...all] for ~3s after flipping
  // active=false. Treat that window as terminal so the 100% bar / checkmarks
  // stay visible instead of snapping back to 0.
  const isPatrolTerminalSuccess = !isPatrolActive && patrolState?.status === 'succeeded';
  const showPatrolProgress = isPatrolActive || isPatrolTerminalSuccess;
  const currentWaypointIndex = isPatrolActive ? (patrolState?.current_index ?? -1) : -1;
  const completedWaypoints = showPatrolProgress ? (patrolState?.completed ?? []) : [];
  const [waypointConfigModalVisible, setWaypointConfigModalVisible] = useState(false);
  const [editingWaypointIndex, setEditingWaypointIndex] = useState(-1);
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState(-1);
  const [applyMapModalVisible, setApplyMapModalVisible] = useState(false);
  const [availableMaps, setAvailableMaps] = useState<MapData[]>([]);
  const [loadingMaps, setLoadingMaps] = useState(false);
  const [isRelocalizationMode, setIsRelocalizationMode] = useState(false);
  const [saveMapDialogVisible, setSaveMapDialogVisible] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  // 需要用户显式确认的严重错误（如 meta 掉线）。顶部 statusMessage
  // 可能被后续地图点击等操作覆盖，用 Dialog 保证提示不丢。
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  const [layers, setLayers] = useState({
    grid: false,
    gridSize: 1.0,
    coordinateSystem: true,
    robotPose: true,
    goalPose: true,
    path: true,
    trail: true,
    esdf: false,
    horizon: false,
    jps: true,
  });

  // 任何路径点编辑（add / delete / drag / move / config / clear）都会替换 waypoints 引用，
  // 此时让恢复点失效，下次开始巡航回到从 0 开始。stop / start 流程不会改 waypoints，所以
  // 不会被这条副作用误清。
  const isFirstWaypointsEffect = useRef(true);
  useEffect(() => {
    if (isFirstWaypointsEffect.current) {
      isFirstWaypointsEffect.current = false;
      return;
    }
    setResumeFromIndex(null);
  }, [waypoints]);

  useEffect(() => {
    const handlePatrolState = (data: PatrolState) => {
      setPatrolState(data);
      if (data.active && !waypointMode) {
        setWaypointMode(true);
      }
      if (data.active) {
        setIsNavigating(true);
        if (data.current_index >= 0 && data.current_index < data.waypoints.length) {
          const waypoint = data.waypoints[data.current_index];
          if (waypoint?.pose) {
            setGoalPose(waypoint.pose);
          }
        }
      } else if (data.status === 'succeeded') {
        setIsNavigating(false);
        setGoalPose(undefined);
        // 巡航整体跑完，恢复点失效
        setResumeFromIndex(null);
      }
    };
    apiService.on('patrol-state', handlePatrolState);
    return () => apiService.off('patrol-state', handlePatrolState);
  }, [waypointMode]);

  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      if (currentMap) {
        setIsMapRealtime(false);
      }
      return;
    }

    const unsubscribe = apiService.subscribeMap((mapData) => {
      setCurrentMap(mapData);
      setIsMapRealtime(true);
    });

    void apiService.getCurrentMapName().then(async (name) => {
      if (!name) {
        return;
      }
      setCurrentMapName(name);
      if (!currentMap) {
        try {
          const mapData = await apiService.loadMap(name);
          if (mapData) {
            setCurrentMap(mapData);
            setIsMapRealtime(false);
          }
        } catch (error) {
          console.warn('[导航] 加载地图数据失败:', error);
        }
      }
    });

    return () => unsubscribe();
  }, [connectionStatus, currentMap]);

  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED || currentMap) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (!currentMap && connectionStatus === ConnectionStatus.CONNECTED) {
        void handleOpenApplyMapModal();
      }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [connectionStatus, currentMap]);

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
        setRobotPose({ x: position.x, y: position.y, theta });
      },
    );
    return () => unsubscribe();
  }, [connectionStatus]);

  useEffect(() => {
    // Only poll planning data while a navigation task is actually in flight.
    // When idle we burn backend + Meta RPC cycles for nothing (observed in
    // server logs: /path every 500 ms while sitting idle).
    const isActive = isNavigating || isPatrolActive;
    if (connectionStatus !== ConnectionStatus.CONNECTED || !isActive) {
      // 不清空 navigationPath / jpsPath：保留上次导航的最后一帧供查看，
      // 等到下次开始新的导航再清。
      return;
    }
    // 进入新一次导航：先清掉上次留下的路径，避免误以为是这次的。
    setNavigationPath([]);
    setJpsPath([]);

    let cancelled = false;
    // Monotonic request id — protects against out-of-order responses: a
    // slow N then a fast N+1 would otherwise let N overwrite N+1. We only
    // accept a response if its id is still the freshest one observed.
    let seq = 0;
    let latestAccepted = 0;
    // Hold the last non-empty path across short gaps (meta restart / RPC
    // hiccup / transient _nav_state downgrade). Without this the user sees
    // the path flicker every 500 ms that polling returns []. 3 consecutive
    // empties (~1.5 s) is treated as "really cleared".
    let emptyStreak = 0;
    let jpsEmptyStreak = 0;
    const EMPTY_TOLERANCE = 3;

    const pollPath = async () => {
      const mySeq = ++seq;
      try {
        const path = await apiService.getNavigationPath();
        if (cancelled || mySeq <= latestAccepted) return;
        latestAccepted = mySeq;
        const points: PathPoint[] = Array.isArray(path)
          ? path
              .filter((point: any) => typeof point?.x === 'number' && typeof point?.y === 'number')
              .map((point: any) => ({ x: point.x, y: point.y }))
          : [];
        if (points.length === 0) {
          emptyStreak += 1;
          if (emptyStreak >= EMPTY_TOLERANCE) {
            setNavigationPath([]);
          }
          // else: keep showing the previous path
        } else {
          emptyStreak = 0;
          setNavigationPath(points);
        }
      } catch {
        if (cancelled || mySeq <= latestAccepted) return;
        latestAccepted = mySeq;
        emptyStreak += 1;
        if (emptyStreak >= EMPTY_TOLERANCE) {
          setNavigationPath([]);
        }
      }

      // Piggy-back: pull the JPS fallback path on the same cadence. 与
      // navigationPath 同样使用 empty streak 容忍，避免导航刚结束时最后一帧
      // 返回空就把图层瞬间抹掉；真正导航中 JPS 被 MINCO 顶掉时，连续 3 帧
      // (~1.5 s) 空后仍会清除。
      try {
        const jps = await apiService.getNavigationJpsPath();
        if (cancelled) return;
        const jpsPts: PathPoint[] = Array.isArray(jps)
          ? jps
              .filter((p: any) => typeof p?.x === 'number' && typeof p?.y === 'number')
              .map((p: any) => ({ x: p.x, y: p.y }))
          : [];
        if (jpsPts.length === 0) {
          jpsEmptyStreak += 1;
          if (jpsEmptyStreak >= EMPTY_TOLERANCE) setJpsPath([]);
        } else {
          jpsEmptyStreak = 0;
          setJpsPath(jpsPts);
        }
      } catch {
        if (cancelled) return;
        jpsEmptyStreak += 1;
        if (jpsEmptyStreak >= EMPTY_TOLERANCE) setJpsPath([]);
      }
    };

    void pollPath();
    const timer = window.setInterval(() => void pollPath(), 500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connectionStatus, isNavigating, isPatrolActive]);

  // ESDF overlay polling — always available while the layer is on, but the
  // cadence tracks navigation state: fast (1 Hz) when actively navigating so
  // the heatmap stays in sync with the robot; slow (every 5 s) when idle so
  // the user can still inspect the local distance field without hammering the
  // backend.
  useEffect(() => {
    if (!layers.esdf || connectionStatus !== ConnectionStatus.CONNECTED) {
      setEsdfData(null);
      return;
    }
    const isActive = isNavigating || isPatrolActive;
    const intervalMs = isActive ? 1000 : 5000;
    let cancelled = false;
    const poll = async () => {
      const snap = await apiService.getEsdfSnapshot(2.0);
      if (cancelled) return;
      // If the backend can't reach meta.astribot_navigation right now
      // (RPC timeout) we receive null here. Keep whatever we had before
      // so the overlay doesn't flicker on transient failures.
      if (!snap || !snap.data || snap.data.length === 0) {
        return;
      }
      const frame: MapData = {
        id: 'esdf',
        name: 'esdf',
        createdAt: '',
        thumbnail: '',
        width: snap.width,
        height: snap.height,
        resolution: snap.resolution,
        origin: { x: snap.origin_x, y: snap.origin_y, orientation: 0 },
        data: snap.data,
      };
      setEsdfData(frame);
    };
    void poll();
    const timer = window.setInterval(() => void poll(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [layers.esdf, connectionStatus, isNavigating, isPatrolActive]);

  // MPC horizon + FSM debug polling — layer on + navigating. When idle the
  // MPC horizon is stale and the FSM sits in IDLE, so polling is pointless.
  useEffect(() => {
    const isActive = isNavigating || isPatrolActive;
    if (!layers.horizon || connectionStatus !== ConnectionStatus.CONNECTED || !isActive) {
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
  }, [layers.horizon, connectionStatus, isNavigating, isPatrolActive]);

  useEffect(() => {
    const handleNavigationResult = (data: any) => {
      if (isPatrolActive) {
        return;
      }
      if (data.success) {
        setStatusMessage('导航成功，机器人已到达目标位置。');
        setIsNavigating(false);
        setNavigationStatus('');
        setNavigationFeedback({});
      } else {
        let errorMessage = '导航失败';
        if (data.actionPreempted) {
          errorMessage = '导航已取消';
        } else if (data.actionAborted) {
          errorMessage = `导航中止${data.errorMessage ? `: ${data.errorMessage}` : ''}`;
        } else if (data.errorMessage) {
          errorMessage = `导航失败: ${data.errorMessage}`;
        }
        setStatusMessage(errorMessage);
        setIsNavigating(false);
        setNavigationStatus('');
        setNavigationFeedback({});
        // 结构性错误用 Dialog 强提示，避免顶部 statusMessage 被其他操作覆盖。
        // - meta 掉线/未激活
        // - 参数校验失败 (invalid_override / out of range / unknown override key)
        const errMsg = (typeof data.errorMessage === 'string') ? data.errorMessage : '';
        const isParamError = errMsg.startsWith('invalid_override')
          || errMsg.includes('out of range')
          || errMsg.includes('unknown override');
        if (data.failReason === 'meta_disconnected'
            || errMsg.includes('Meta')
            || isParamError) {
          setErrorDialog(errMsg || '导航请求被拒绝');
        }
      }
    };

    const handleNavigationFeedback = (data: any) => {
      setNavigationFeedback({
        distance_to_goal: data.distance_to_goal,
        progress: data.progress,
        eta: data.eta,
        current_task: data.current_task,
      });
    };

    const handleNavigationStatus = (data: any) => {
      setNavigationStatus(data.text);
    };

    apiService.on('navigation-result', handleNavigationResult);
    apiService.on('navigation-feedback', handleNavigationFeedback);
    apiService.on('navigation-status', handleNavigationStatus);
    return () => {
      apiService.off('navigation-result', handleNavigationResult);
      apiService.off('navigation-feedback', handleNavigationFeedback);
      apiService.off('navigation-status', handleNavigationStatus);
    };
  }, [isPatrolActive]);

  async function loadAvailableMaps() {
    setLoadingMaps(true);
    try {
      if (connectionStatus !== ConnectionStatus.CONNECTED) {
        setStatusMessage('请先连接后端。');
        setAvailableMaps([]);
        return;
      }
      const maps = await apiService.getAllMapMetadata();
      setAvailableMaps(maps);
    } catch (error) {
      console.error('加载地图列表失败:', error);
      setStatusMessage('加载地图列表失败。');
    } finally {
      setLoadingMaps(false);
    }
  }

  async function handleOpenApplyMapModal() {
    setApplyMapModalVisible(true);
    await loadAvailableMaps();
  }

  async function handleApplyMap(map: MapData) {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      setStatusMessage('请先连接后端。');
      return;
    }
    try {
      setStatusMessage(`正在应用地图 “${map.name}” ...`);
      await apiService.setCurrentMap(map);
      const fullMapData = await apiService.loadMap(map.name);
      setCurrentMap(fullMapData);
      setIsMapRealtime(true);
      setCurrentMapName(map.name);
      setApplyMapModalVisible(false);
      setStatusMessage(`地图 “${map.name}” 已应用。`);
    } catch (error) {
      console.error('应用地图失败:', error);
      setStatusMessage(`应用地图失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  function handleRelocalizationStart() {
    setIsRelocalizationMode(true);
  }

  function handleMapClick(x: number, y: number, theta?: number) {
    const pose: Pose = { x, y, theta: theta || 0 };
    if (isRelocalizationMode) {
      apiService.setInitialPose(pose);
      setInitialPose(pose);
      setStatusMessage('初始位置已发送，等待确认。');
      setIsRelocalizationMode(false);
      return;
    }
    if (waypointMode) {
      const newWaypoint: Waypoint = {
        pose,
        tasks: [],
        navigationMode: 'obstacle_avoidance',
        actionConfig: { use_default_config: true },
      };
      setWaypoints((prev) => [...prev, newWaypoint]);
      setStatusMessage(`已添加路径点 ${waypoints.length + 1}。`);
      return;
    }
    setGoalPose(pose);
    setStatusMessage(`目标点已设置，方向 ${(pose.theta * 180 / Math.PI).toFixed(1)}°`);
  }

  function handleDeleteWaypoint(index: number) {
    setWaypoints((prev) => prev.filter((_, idx) => idx !== index));
    setStatusMessage(`已删除路径点 ${index + 1}。`);
    if (selectedWaypointIndex === index) {
      setSelectedWaypointIndex(-1);
    } else if (selectedWaypointIndex > index) {
      setSelectedWaypointIndex((prev) => prev - 1);
    }
  }

  function handleWaypointClick(index: number) {
    setSelectedWaypointIndex(index);
  }

  function handleWaypointDrag(index: number, newPose: Pose) {
    setWaypoints((prev) => prev.map((waypoint, idx) => (idx === index ? { ...waypoint, pose: newPose } : waypoint)));
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' && selectedWaypointIndex >= 0 && !isNavigating) {
        handleDeleteWaypoint(selectedWaypointIndex);
      } else if (event.key === 'Escape' && selectedWaypointIndex >= 0) {
        setSelectedWaypointIndex(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedWaypointIndex, isNavigating]);

  function handleEditWaypoint(index: number) {
    setEditingWaypointIndex(index);
    setWaypointConfigModalVisible(true);
  }

  function handleSaveWaypointConfig(updatedWaypoint: Waypoint) {
    if (editingWaypointIndex < 0 || editingWaypointIndex >= waypoints.length) {
      return;
    }
    setWaypoints((prev) => prev.map((waypoint, idx) => (idx === editingWaypointIndex ? updatedWaypoint : waypoint)));
    setWaypointConfigModalVisible(false);
  }

  function handleClearWaypoints() {
    setWaypoints([]);
    setStatusMessage('已清空所有路径点。');
  }

  async function handleStopPatrol() {
    // 在调 stopPatrol 之前抓快照——后端 cancel_navigation 会把 current_index 置 -1，
    // 等 SSE 推回来再读就来不及了。0 也是合法 index，所以判断要 >= 0。
    const interruptedAt = patrolState?.current_index;
    const result = await apiService.stopPatrol();
    if (result.success) {
      setIsNavigating(false);
      setNavigationStatus('');
      setNavigationFeedback({});
      setGoalPose(undefined);
      // 保留 waypoints / selectedWaypointIndex，让用户可以原地点「开始巡航」从中断点继续
      if (typeof interruptedAt === 'number' && interruptedAt >= 0) {
        setResumeFromIndex(interruptedAt);
        setStatusMessage(`巡航已停止，下次将从路径点 ${interruptedAt + 1} 继续。`);
      } else {
        setResumeFromIndex(null);
        setStatusMessage('巡航已停止。');
      }
    } else {
      setStatusMessage(result.message || '停止巡航失败。');
    }
  }

  async function handleStartPatrol(startIndex?: number) {
    if (waypoints.length === 0) {
      setStatusMessage('请先添加路径点。');
      return;
    }
    // 优先用显式传入的 startIndex；否则若有中断点则从中断点继续，否则从 0 开始。
    let actualStart = typeof startIndex === 'number' ? startIndex : (resumeFromIndex ?? 0);
    if (actualStart < 0 || actualStart >= waypoints.length) {
      actualStart = 0;
    }
    const result = await apiService.startPatrol(waypoints, actualStart);
    if (result.success) {
      // 启动成功后清掉恢复点，避免下一次开始还套用旧值
      setResumeFromIndex(null);
      setStatusMessage(`巡航已启动，共 ${waypoints.length} 个路径点${actualStart > 0 ? `，从路径点 ${actualStart + 1} 开始` : ''}。`);
    } else {
      setStatusMessage(result.message || '启动巡航失败。');
    }
  }

  function handleMoveWaypoint(fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex >= waypoints.length || toIndex < 0 || toIndex >= waypoints.length) {
      return;
    }
    const next = [...waypoints];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setWaypoints(next);
  }

  function handleModeChange(mode: boolean) {
    if (isNavigating || isPatrolActive) {
      setStatusMessage('请先停止当前导航。');
      return;
    }
    setWaypointMode(mode);
    if (mode) {
      setGoalPose(undefined);
    } else {
      setWaypoints([]);
    }
  }

  async function confirmSaveMap() {
    if (!currentMap) {
      setStatusMessage('当前没有地图数据。');
      return;
    }
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      setStatusMessage('请先连接后端。');
      return;
    }
    try {
      const now = new Date();
      const mapName = `map_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const mapToSave: MapData = {
        ...currentMap,
        id: mapName,
        name: mapName,
        createdAt: new Date().toISOString(),
      };
      await apiService.saveMap(mapToSave);
      setSaveMapDialogVisible(false);
      setStatusMessage(`地图已保存：${mapName}`);
    } catch (error) {
      console.error('保存地图失败:', error);
      setStatusMessage(`保存地图失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  const mapTitle = currentMapName || currentMap?.name || '未加载地图';
  const realtimeBadge = isMapRealtime ? (
    <Badge className="bg-green-500/15 text-green-500 hover:bg-green-500/15">实时更新</Badge>
  ) : (
    <Badge variant="secondary">历史地图</Badge>
  );

  if (!currentMap) {
    return (
      <>
        <div className="mx-auto flex h-full min-h-[28rem] w-full max-w-5xl flex-col items-center justify-center gap-6 px-4 py-6">
          <Card className="w-full max-w-2xl border-dashed border-border bg-card/70">
            <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="rounded-2xl bg-primary/10 p-4 text-primary">
                <MapPinned className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <div className="text-lg font-semibold text-foreground">
                  {connectionStatus === ConnectionStatus.CONNECTED ? '等待地图数据' : '等待后端连接'}
                </div>
                <p className="text-sm text-muted-foreground">
                  {connectionStatus === ConnectionStatus.CONNECTED
                    ? '未检测到实时地图，正在尝试加载历史地图。'
                    : '请先连接后端，再进入导航视图。'}
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => navigate('/')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  返回主页
                </Button>
                <Button onClick={() => void handleOpenApplyMapModal()}>
                  选择历史地图
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={applyMapModalVisible} onOpenChange={setApplyMapModalVisible}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>应用历史地图</DialogTitle>
              <DialogDescription>选择一张已保存的地图作为当前导航地图。</DialogDescription>
            </DialogHeader>
            {loadingMaps ? (
              <div className="py-12 text-center text-sm text-muted-foreground">正在加载地图列表...</div>
            ) : availableMaps.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">暂无可用地图。</div>
            ) : (
              <div className="grid max-h-[60vh] gap-4 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
                {availableMaps.map((map) => (
                  <Card key={map.id} className="overflow-hidden border-border bg-card/80">
                    <div className="flex h-44 items-center justify-center overflow-hidden bg-secondary/40">
                      {map.thumbnail ? (
                        <img src={map.thumbnail} alt={map.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="text-sm text-muted-foreground">无缩略图</div>
                      )}
                    </div>
                    <CardHeader>
                      <CardTitle className="text-base">{map.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-sm text-muted-foreground">
                        <div>{dayjs(map.createdAt).format('YYYY-MM-DD HH:mm')}</div>
                        <div>{map.width} × {map.height} px</div>
                      </div>
                      <Button className="w-full" onClick={() => void handleApplyMap(map)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        应用地图
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-4 border-b border-border bg-card/90 px-6 py-4 shadow-sm">
        <Button variant="secondary" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </Button>
        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">导航工作台</div>
          <div className="text-xs text-muted-foreground">{mapTitle}</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {realtimeBadge}
          <Button variant="secondary" onClick={() => setSaveMapDialogVisible(true)}>
            <Save className="mr-2 h-4 w-4" />
            保存地图
          </Button>
        </div>
      </header>

      {statusMessage && (
        <div className="border-b border-border bg-secondary/60 px-6 py-3 text-sm text-muted-foreground">
          {statusMessage}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">正在加载地图组件...</div>}>
          <MapCanvas
            mapData={currentMap}
            robotPose={layers.robotPose ? robotPose : undefined}
            goalPose={layers.goalPose ? goalPose : undefined}
            initialPose={initialPose}
            path={layers.path ? navigationPath : undefined}
            jpsPath={layers.jps ? jpsPath : undefined}
            esdfData={layers.esdf ? esdfData : null}
            horizonPath={layers.horizon && navDebug?.mpc?.horizon ? navDebug.mpc.horizon : undefined}
            onMapClick={handleMapClick}
            showCoordinateSystem={layers.coordinateSystem}
            showRobotTrail={layers.trail}
            showGrid={layers.grid}
            gridSize={layers.gridSize}
            showLayerPanel={false}
            waypoints={waypointMode ? (isPatrolActive ? (patrolState?.waypoints ?? []).map((waypoint: Waypoint) => waypoint.pose) : waypoints.map((waypoint) => waypoint.pose)) : []}
            currentWaypointIndex={currentWaypointIndex}
            completedWaypoints={completedWaypoints}
            selectedWaypointIndex={selectedWaypointIndex}
            onWaypointClick={handleWaypointClick}
            onWaypointDrag={handleWaypointDrag}
            onWaypointDelete={handleDeleteWaypoint}
          />
        </Suspense>

        <div className="absolute right-[350px] top-4 z-50 w-44">
          <InfoPanel title="图层">
            <div className="space-y-3">
              {[
                { key: 'coordinateSystem', label: '坐标系' },
                { key: 'robotPose', label: '机器人' },
                { key: 'goalPose', label: '目标点' },
                { key: 'path', label: '规划路径' },
                { key: 'jps', label: 'JPS 路径' },
                { key: 'trail', label: '轨迹' },
                { key: 'grid', label: '栅格' },
                { key: 'esdf', label: 'ESDF 距离场' },
                { key: 'horizon', label: 'MPC 预测' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <Switch
                    checked={layers[key as keyof typeof layers] as boolean}
                    onCheckedChange={(value) => setLayers((prev) => ({ ...prev, [key]: value }))}
                  />
                </div>
              ))}

              {layers.grid && (
                <div className="space-y-2 border-t border-border pt-3">
                  <div className="text-xs text-muted-foreground">栅格大小</div>
                  <div className="grid grid-cols-2 gap-2">
                    {GRID_SIZE_OPTIONS.map((size) => (
                      <Button
                        key={size}
                        size="sm"
                        variant={layers.gridSize === size ? 'default' : 'secondary'}
                        onClick={() => setLayers((prev) => ({ ...prev, gridSize: size }))}
                      >
                        {size}m
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {layers.horizon && navDebug && (
                <div className="space-y-1.5 border-t border-border pt-3 font-mono text-[11px] text-foreground">
                  <div className="mb-1 text-xs text-muted-foreground">导航调试</div>
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
          </InfoPanel>
        </div>

        <div className="absolute right-4 top-4 z-50 flex max-h-[calc(100%-2rem)] w-80 flex-col gap-3 overflow-y-auto">
          <Suspense fallback={<div className="rounded-xl border border-border bg-card/90 p-4 text-sm text-muted-foreground">正在加载控制面板...</div>}>
            <SimpleLocalizationControl
              onModeChange={() => {}}
              onRelocalizationStart={handleRelocalizationStart}
              robotPose={robotPose}
            />
            <ChassisControl isNavigating={isNavigating} onControlTypeChange={() => {}} />
            <DockControl isNavigating={isNavigating} />
            <NavigationControl
              robotPose={robotPose || null}
              goalPose={goalPose}
              isNavigating={isNavigating || isPatrolActive}
              onNavigationStart={() => setIsNavigating(true)}
              onNavigationStop={() => setIsNavigating(false)}
              onStopWaypointNavigation={handleStopPatrol}
              navigationStatus={navigationStatus}
              navigationFeedback={navigationFeedback}
              connectionStatus={connectionStatus}
              waypointMode={waypointMode}
              onWaypointModeChange={handleModeChange}
              waypoints={waypoints.map((waypoint) => waypoint.pose)}
              onStartWaypointNavigation={() => void handleStartPatrol()}
              patrolState={patrolState}
            />
            {waypointMode && (
              <WaypointControl
                waypointMode={waypointMode}
                onModeChange={handleModeChange}
                waypoints={showPatrolProgress ? ((patrolState?.waypoints ?? []) as Waypoint[]) : waypoints}
                currentWaypointIndex={currentWaypointIndex}
                completedWaypoints={completedWaypoints}
                selectedWaypointIndex={selectedWaypointIndex}
                onEditWaypoint={handleEditWaypoint}
                onDeleteWaypoint={handleDeleteWaypoint}
                onClearWaypoints={handleClearWaypoints}
                onMoveWaypoint={handleMoveWaypoint}
                isNavigating={isNavigating || showPatrolProgress}
              />
            )}
          </Suspense>
        </div>

        <div className="absolute bottom-4 right-[350px] z-50 max-w-xs rounded-xl bg-black/75 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {waypointMode ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2"><Navigation2 className="h-4 w-4" /> 点击地图添加路径点</div>
              <div>点击路径点选中，拖动修改位置</div>
              <div>Delete 删除选中路径点</div>
            </div>
          ) : (
            <div className="flex items-center gap-2"><MapPinned className="h-4 w-4" /> 点击地图选择导航目标点</div>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <WaypointConfigModal
          visible={waypointConfigModalVisible}
          waypoint={editingWaypointIndex >= 0 ? waypoints[editingWaypointIndex] : null}
          waypointIndex={editingWaypointIndex}
          onSave={handleSaveWaypointConfig}
          onCancel={() => setWaypointConfigModalVisible(false)}
        />
      </Suspense>

      <Dialog open={applyMapModalVisible} onOpenChange={setApplyMapModalVisible}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>应用历史地图</DialogTitle>
            <DialogDescription>选择地图后将立即切换为当前导航地图。</DialogDescription>
          </DialogHeader>
          {loadingMaps ? (
            <div className="py-12 text-center text-sm text-muted-foreground">正在加载地图列表...</div>
          ) : availableMaps.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">暂无可用地图。</div>
          ) : (
            <div className="grid max-h-[60vh] gap-4 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
              {availableMaps.map((map) => (
                <Card key={map.id} className="overflow-hidden border-border bg-card/80">
                  <div className="flex h-40 items-center justify-center bg-secondary/40">
                    {map.thumbnail ? (
                      <img src={map.thumbnail} alt={map.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-sm text-muted-foreground">无缩略图</div>
                    )}
                  </div>
                  <CardHeader>
                    <CardTitle className="text-base">{map.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      <div>{dayjs(map.createdAt).format('YYYY-MM-DD HH:mm')}</div>
                      <div>{map.width} × {map.height} px</div>
                    </div>
                    <Button className="w-full" onClick={() => void handleApplyMap(map)}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      应用地图
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={saveMapDialogVisible} onOpenChange={setSaveMapDialogVisible}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存地图</DialogTitle>
            <DialogDescription>
              确认保存当前实时地图吗？地图尺寸 {currentMap.width} × {currentMap.height}px，分辨率 {currentMap.resolution.toFixed(3)} m/px。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSaveMapDialogVisible(false)}>
              取消
            </Button>
            <Button onClick={() => void confirmSaveMap()}>
              确认保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!errorDialog} onOpenChange={(open) => { if (!open) setErrorDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导航失败</DialogTitle>
            <DialogDescription>{errorDialog}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorDialog(null)}>知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
