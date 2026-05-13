import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Badge,
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
  Input,
  Separator,
  Switch,
  cn,
} from '@astribot/ui';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Crosshair,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { MapCanvas } from '@/components/common/MapCanvas';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import type { MapData, Pose, RoomConfig as RoomConfigType, RoomPatrolConfig } from '@/types';

// 点位颜色映射
const WAYPOINT_COLORS: Record<string, string> = {
  door_outside: '#1890ff',
  door_inside: '#52c41a',
  bed_check: '#ff4d4f',
  custom: '#722ed1',
};

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number): T[] => {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

interface SortableRoomCardProps {
  room: any;
  roomIdx: number;
  isRoomReady: (room: any) => any;
  onDelete: (roomId: string) => void;
  onRecord: (roomId: string, wpId: string) => void;
  onEdit: (roomId: string, wpId: string, label: string, pose: any) => void;
  onAddWaypoint: (roomId: string) => void;
  onDeleteWaypoint: (roomId: string, wpId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  roomCount: number;
  robotPose: any;
}

type NoticeState = {
  tone: 'success' | 'error';
  text: string;
} | null;

const SortableRoomCard: React.FC<SortableRoomCardProps> = ({
  room, roomIdx, roomCount, isRoomReady, onDelete, onRecord, onEdit, onAddWaypoint, onDeleteWaypoint, onMove, robotPose,
}) => {
  return (
    <div>
      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardHeader className="gap-3 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex shrink-0 flex-col">
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="上移" disabled={roomIdx === 0} onClick={() => onMove(roomIdx, roomIdx - 1)}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="下移" disabled={roomIdx === roomCount - 1} onClick={() => onMove(roomIdx, roomIdx + 1)}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {roomIdx + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {room.room_name || room.room_id}
                  </div>
                  <div className="text-xs text-muted-foreground">{room.room_id}</div>
                </div>
                <Badge className={cn(
                  'border-0',
                  isRoomReady(room)
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : 'bg-amber-500/15 text-amber-200'
                )}>
                  {isRoomReady(room) ? '就绪' : '未完成'}
                </Badge>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(room.room_id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {(room.waypoints || []).map((wp: any) => {
            const color = WAYPOINT_COLORS[wp.type] || WAYPOINT_COLORS.custom;
            return (
              <div
                key={wp.id}
                className="rounded-lg border border-border/60 bg-muted/15 px-3 py-3"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="truncate">{wp.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-[11px]">
                      {wp.id}
                    </Badge>
                  </div>
                  {wp.pose ? (
                    <>
                      <div className="rounded-md border border-border/50 bg-background/60 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
                        ({wp.pose.x.toFixed(2)}, {wp.pose.y.toFixed(2)}, {(wp.pose.theta * 180 / Math.PI).toFixed(1)}°)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onEdit(room.room_id, wp.id, `${room.room_name} ${wp.name}`, wp.pose)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          编辑
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => onRecord(room.room_id, wp.id)}>
                          <Crosshair className="mr-2 h-4 w-4" />
                          重录
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => onDeleteWaypoint(room.room_id, wp.id)}>
                          <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                          删除
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onRecord(room.room_id, wp.id)}
                        disabled={!robotPose}
                      >
                        <Crosshair className="mr-2 h-4 w-4" />
                        录制
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => onDeleteWaypoint(room.room_id, wp.id)}>
                        <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                        删除
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" className="w-full" onClick={() => onAddWaypoint(room.room_id)}>
            <Plus className="mr-2 h-4 w-4" />
            添加自定义点位
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export const WaypointRecordTab: React.FC = () => {
  const { connectionStatus } = useRobot();

  const [config, setConfig] = useState<RoomPatrolConfig | null>(null);
  const [robotPose, setRobotPose] = useState<Pose | undefined>();
  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  // 新建区域 Modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newRoomId, setNewRoomId] = useState('');
  const [newRoomName, setNewRoomName] = useState('');

  // 新建点位 Modal
  const [addWpModalVisible, setAddWpModalVisible] = useState(false);
  const [addWpRoomId, setAddWpRoomId] = useState('');
  const [newWpId, setNewWpId] = useState('');
  const [newWpName, setNewWpName] = useState('');

  // 编辑点位 Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<{ roomId: string; waypointType: string; label: string } | null>(null);
  const [editX, setEditX] = useState<number>(0);
  const [editY, setEditY] = useState<number>(0);
  const [editTheta, setEditTheta] = useState<number>(0);
  const [deleteRoomTarget, setDeleteRoomTarget] = useState<string | null>(null);
  const [deleteWaypointTarget, setDeleteWaypointTarget] = useState<{ roomId: string; waypointId: string } | null>(null);

  // 拖拽开关 (默认关闭)
  const [dragEnabled, setDragEnabled] = useState(false);

  // 键盘遥控
  const [keyboardEnabled, setKeyboardEnabled] = useState(false);
  const [velocity, setVelocity] = useState({ linear: 0, angular: 0 });
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const keysPressed = useRef<Set<string>>(new Set());
  const velocityTimerRef = useRef<number | null>(null);
  const joystickRef = useRef<HTMLDivElement>(null);

  const LINEAR_SPEED = 0.3;  // m/s
  const ANGULAR_SPEED = 0.5; // rad/s

  // 键盘遥控 — 持续发送定时器
  useEffect(() => {
    if (!keyboardEnabled || !keyboardFocused || connectionStatus !== ConnectionStatus.CONNECTED) {
      if (velocityTimerRef.current) { clearInterval(velocityTimerRef.current); velocityTimerRef.current = null; }
      return;
    }

    velocityTimerRef.current = window.setInterval(() => {
      const keys = keysPressed.current;
      if (keys.size > 0) {
        let linear = 0, angular = 0;
        if (keys.has('ArrowUp')) linear += LINEAR_SPEED;
        if (keys.has('ArrowDown')) linear -= LINEAR_SPEED;
        if (keys.has('ArrowLeft')) angular += ANGULAR_SPEED;
        if (keys.has('ArrowRight')) angular -= ANGULAR_SPEED;
        apiService.sendVelocity(linear, angular);
      }
    }, 100);

    return () => {
      if (velocityTimerRef.current) { clearInterval(velocityTimerRef.current); velocityTimerRef.current = null; }
    };
  }, [keyboardEnabled, keyboardFocused, connectionStatus]);

  const handleJoystickKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      if (!keysPressed.current.has(e.key)) {
        keysPressed.current.add(e.key);
        let linear = 0, angular = 0;
        const keys = keysPressed.current;
        if (keys.has('ArrowUp')) linear += LINEAR_SPEED;
        if (keys.has('ArrowDown')) linear -= LINEAR_SPEED;
        if (keys.has('ArrowLeft')) angular += ANGULAR_SPEED;
        if (keys.has('ArrowRight')) angular -= ANGULAR_SPEED;
        setVelocity({ linear, angular });
        apiService.sendVelocity(linear, angular);
      }
    }
  }, []);

  const handleJoystickKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (keysPressed.current.has(e.key)) {
      keysPressed.current.delete(e.key);
      let linear = 0, angular = 0;
      const keys = keysPressed.current;
      if (keys.has('ArrowUp')) linear += LINEAR_SPEED;
      if (keys.has('ArrowDown')) linear -= LINEAR_SPEED;
      if (keys.has('ArrowLeft')) angular += ANGULAR_SPEED;
      if (keys.has('ArrowRight')) angular -= ANGULAR_SPEED;
      setVelocity({ linear, angular });
      apiService.sendVelocity(linear, angular);
    }
  }, []);

  const handleJoystickBlur = useCallback(() => {
    keysPressed.current.clear();
    setVelocity({ linear: 0, angular: 0 });
    setKeyboardFocused(false);
    apiService.sendVelocity(0, 0);
  }, []);
  // 加载配置（仅在连接时）
  const loadConfig = useCallback(async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    try {
      const data = await apiService.getRoomConfig();
      setConfig(data);
    } catch (e) {
      console.warn('Failed to load room config:', e);
    }
  }, [connectionStatus]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // 订阅机器人位置
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    const unsubscribe = apiService.subscribeTopic<any>(
      '/loc_high_freq',
      MESSAGE_TYPES.ODOMETRY,
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

  // 订阅地图
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    const unsubscribe = apiService.subscribeMap((mapData) => {
      setCurrentMap(mapData);
    });
    // 主动加载当前地图，不等 /map 话题推送
    apiService.getCurrentMapName().then(async (name) => {
      if (name) {
        try {
          const mapData = await apiService.loadMap(name);
          if (mapData) setCurrentMap(mapData);
        } catch (e) {
          console.warn('[巡检] 加载地图失败:', e);
        }
      }
    });
    return () => unsubscribe();
  }, [connectionStatus]);

  // 新建区域
  const handleAddRoom = async () => {
    if (!newRoomId.trim()) {
      setNotice({ tone: 'error', text: '请输入区域号' });
      return;
    }
    const result = await apiService.addRoom(
      newRoomId.trim(),
      newRoomName.trim() || `${newRoomId.trim()}室`,
    );
    if (result.success) {
      setNotice({ tone: 'success', text: `已添加区域 ${newRoomId}` });
      setAddModalVisible(false);
      setNewRoomId('');
      setNewRoomName('');
      loadConfig();
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  // 删除区域
  const handleDeleteRoom = (roomId: string) => {
    setDeleteRoomTarget(roomId);
  };

  const handleMoveRoom = (fromIndex: number, toIndex: number) => {
    if (!config) return;
    const newRooms = moveItem(config.rooms, fromIndex, toIndex);
    const updated = { ...config, rooms: newRooms };
    setConfig(updated);
    apiService.saveRoomConfig(updated).catch(() => setNotice({ tone: 'error', text: '保存顺序失败' }));
  };

  // 录制点位
  const handleRecord = async (roomId: string, waypointType: string) => {
    if (!robotPose) {
      setNotice({ tone: 'error', text: '无法获取机器人位置' });
      return;
    }
    setLoading(true);
    try {
        const result = await apiService.recordRoomWaypoint(roomId, waypointType);
      if (result.success) {
        const p = result.pose;
        setNotice({
          tone: 'success',
          text: `已录制: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${(p.theta * 180 / Math.PI).toFixed(1)}°)`,
        });
        loadConfig();
      } else {
        setNotice({ tone: 'error', text: result.message });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddWaypoint = async (roomId: string) => {
    setAddWpRoomId(roomId);
    setNewWpId('');
    setNewWpName('');
    setAddWpModalVisible(true);
  };

  const handleAddWaypointConfirm = async () => {
    if (!newWpId.trim()) {
      setNotice({ tone: 'error', text: '请输入点位 ID' });
      return;
    }
    const result = await apiService.addRoomWaypoint(addWpRoomId, newWpId.trim(), newWpName.trim() || newWpId.trim());
    if (result.success) {
      setNotice({ tone: 'success', text: '点位已添加' });
      setAddWpModalVisible(false);
      loadConfig();
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  const handleDeleteWaypoint = async (roomId: string, waypointId: string) => {
    setDeleteWaypointTarget({ roomId, waypointId });
  };

  // 录制起始点位（专用端点）
  const handleRecordStart = async () => {
    if (!robotPose) {
      setNotice({ tone: 'error', text: '无法获取机器人位置' });
      return;
    }
    setLoading(true);
    try {
      const result = await apiService.recordStartPosition();
      if (result.success) {
        const p = result.pose;
        setNotice({
          tone: 'success',
          text: `起始点位已录制: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${(p.theta * 180 / Math.PI).toFixed(1)}°)`,
        });
        loadConfig();
      } else {
        setNotice({ tone: 'error', text: result.message });
      }
    } finally {
      setLoading(false);
    }
  };

  // 打开编辑点位 Modal
  const openEditModal = (roomId: string, waypointType: string, label: string, currentPose: Pose | null) => {
    setEditTarget({ roomId, waypointType, label });
    setEditX(currentPose?.x ?? 0);
    setEditY(currentPose?.y ?? 0);
    setEditTheta(currentPose ? +(currentPose.theta * 180 / Math.PI).toFixed(1) : 0);
    setEditModalVisible(true);
  };

  // 保存手动编辑的点位
  const handleSaveEdit = async () => {
    if (!editTarget || !config) return;
    const thetaRad = editTheta * Math.PI / 180;
    const newPose: Pose = { x: editX, y: editY, theta: thetaRad };

    const updated = { ...config };
    if (editTarget.waypointType === 'start_position') {
      updated.start_position = newPose;
    } else {
      updated.rooms = updated.rooms.map(r =>
        r.room_id === editTarget.roomId
          ? {
              ...r,
              waypoints: (r.waypoints || []).map((wp: any) =>
                wp.id === editTarget.waypointType ? { ...wp, pose: newPose } : wp
              ),
            }
          : r,
      );
    }

    const result = await apiService.saveRoomConfig(updated);
    if (result.success) {
      setNotice({ tone: 'success', text: `${editTarget.label} 已更新` });
      setEditModalVisible(false);
      loadConfig();
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  // 收集所有已录制的点位用于地图显示 (起点=0, 区域从1开始编号)
  const { allWaypoints, waypointLabels, waypointColors, waypointMeta } = useMemo(() => {
    const wps: Pose[] = [];
    const labels: string[] = [];
    const colors: string[] = [];
    const meta: { roomId: string; type: string }[] = [];

    if (config) {
      if (config.start_position) {
        wps.push(config.start_position);
        labels.push('0');
        colors.push('#722ed1');
        meta.push({ roomId: '', type: 'start_position' });
      }
      config.rooms.forEach((room, roomIdx) => {
        const label = String(roomIdx + 1);
        for (const wp of (room.waypoints || [])) {
          if (wp.pose) {
            const color = WAYPOINT_COLORS[wp.type] || WAYPOINT_COLORS.custom;
            wps.push(wp.pose);
            labels.push(label);
            colors.push(color);
            meta.push({ roomId: room.room_id, type: wp.id });
          }
        }
      });
    }

    return { allWaypoints: wps, waypointLabels: labels, waypointColors: colors, waypointMeta: meta };
  }, [config]);

  // Refs for stable access in drag callbacks
  const configRef = useRef(config);
  configRef.current = config;
  const waypointMetaRef = useRef(waypointMeta);
  waypointMetaRef.current = waypointMeta;

  // 拖拽点位 — 实时更新本地状态
  const handleWaypointDrag = useCallback((index: number, newPose: Pose) => {
    const cur = configRef.current;
    const meta = waypointMetaRef.current[index];
    if (!cur || !meta) return;
    const updated = { ...cur };
    if (meta.type === 'start_position') {
      updated.start_position = newPose;
    } else {
      updated.rooms = updated.rooms.map(r =>
        r.room_id === meta.roomId
          ? {
              ...r,
              waypoints: (r.waypoints || []).map(wp =>
                wp.id === meta.type ? { ...wp, pose: newPose } : wp
              ),
            }
          : r
      );
    }
    setConfig(updated);
  }, []);

  // 拖拽结束 — 保存到后端
  const handleWaypointDragEnd = useCallback(async () => {
    const cur = configRef.current;
    if (!cur) return;
    const result = await apiService.saveRoomConfig(cur);
    if (result.success) {
      setNotice({ tone: 'success', text: '点位已保存' });
    } else {
      setNotice({ tone: 'error', text: '保存失败' });
      loadConfig();
    }
  }, [loadConfig]);

  const confirmDeleteRoom = async () => {
    if (!deleteRoomTarget) return;
    const result = await apiService.deleteRoom(deleteRoomTarget);
    if (result.success) {
      setNotice({ tone: 'success', text: `已删除区域 ${deleteRoomTarget}` });
      loadConfig();
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
    setDeleteRoomTarget(null);
  };

  const confirmDeleteWaypoint = async () => {
    if (!deleteWaypointTarget) return;
    const result = await apiService.deleteRoomWaypoint(deleteWaypointTarget.roomId, deleteWaypointTarget.waypointId);
    if (result.success) {
      setNotice({ tone: 'success', text: '点位已删除' });
      loadConfig();
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
    setDeleteWaypointTarget(null);
  };

  // 判断区域是否就绪
  const isRoomReady = (room: RoomConfigType) => {
    const wps = room.waypoints || [];
    return wps.length > 0 && wps.some(wp => wp.pose !== null);
  };

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* 左侧：地图 */}
      <div className="relative h-full min-w-0 flex-1 overflow-hidden">
          {currentMap ? (
            <MapCanvas
              mapData={currentMap}
              robotPose={robotPose}
              waypoints={allWaypoints}
              waypointLabels={waypointLabels}
              waypointColors={waypointColors}
              onWaypointDrag={dragEnabled ? handleWaypointDrag : undefined}
              onWaypointDragEnd={dragEnabled ? handleWaypointDragEnd : undefined}
              showCoordinateSystem={true}
              showRobotTrail={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {connectionStatus === ConnectionStatus.CONNECTED ? '等待地图数据...' : '请先连接 后端'}
            </div>
          )}

          {/* 机器人位置信息 */}
          {robotPose && (
            <div
              className="absolute bottom-4 left-4 rounded-md border border-border/60 bg-background/85 px-3 py-2 font-mono text-xs text-foreground shadow-sm backdrop-blur"
            >
              <div className="flex items-center gap-2">
                <Crosshair className="h-4 w-4 text-primary" />
                <span>x={robotPose.x.toFixed(3)} y={robotPose.y.toFixed(3)} θ={((robotPose.theta * 180) / Math.PI).toFixed(1)}°</span>
              </div>
            </div>
          )}

          {/* 键盘遥控区域 — 点击聚焦后方向键生效 */}
          {keyboardEnabled && (
            <div
              ref={joystickRef}
              tabIndex={0}
              onKeyDown={handleJoystickKeyDown}
              onKeyUp={handleJoystickKeyUp}
              onFocus={() => setKeyboardFocused(true)}
              onBlur={handleJoystickBlur}
              className={cn(
                'absolute bottom-4 right-4 min-w-[160px] cursor-pointer rounded-xl border px-4 py-3 text-center font-mono text-xs text-foreground shadow-sm backdrop-blur transition',
                keyboardFocused
                  ? 'border-emerald-500/60 bg-background/90 ring-2 ring-emerald-500/40'
                  : 'border-border/60 bg-background/80'
              )}
              onClick={() => joystickRef.current?.focus()}
            >
              <div className={cn('mb-2 font-semibold', keyboardFocused ? 'text-emerald-300' : 'text-muted-foreground')}>
                {keyboardFocused ? '遥控中 — 方向键控制' : '点击此处开始遥控'}
              </div>
              <div className="mb-1 flex justify-center">
                <span className={cn(
                  'rounded border px-2 py-0.5',
                  velocity.linear > 0 ? 'border-emerald-500 text-emerald-300' : 'border-border/70 text-muted-foreground'
                )}>
                  ↑
                </span>
              </div>
              <div className="flex justify-center gap-1">
                <span className={cn(
                  'rounded border px-2 py-0.5',
                  velocity.angular > 0 ? 'border-emerald-500 text-emerald-300' : 'border-border/70 text-muted-foreground'
                )}>
                  ←
                </span>
                <span className={cn(
                  'rounded border px-2 py-0.5',
                  velocity.linear < 0 ? 'border-emerald-500 text-emerald-300' : 'border-border/70 text-muted-foreground'
                )}>
                  ↓
                </span>
                <span className={cn(
                  'rounded border px-2 py-0.5',
                  velocity.angular < 0 ? 'border-emerald-500 text-emerald-300' : 'border-border/70 text-muted-foreground'
                )}>
                  →
                </span>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                v={velocity.linear.toFixed(2)} ω={velocity.angular.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {/* 右侧：配置面板 */}
        <div
          className="flex w-80 min-w-[280px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border/70 bg-card/60 p-4"
        >
          {notice && (
            <div
              className={cn(
                'rounded-xl border px-3 py-3 text-sm',
                notice.tone === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-destructive/40 bg-destructive/10 text-destructive'
              )}
            >
              {notice.text}
            </div>
          )}

          {/* 工具开关 */}
          <Card className="border-border/70 bg-card/90">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">工具开关</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-foreground">拖拽点位</div>
                  <div className="text-xs text-muted-foreground">在地图上直接调整已录制的位姿。</div>
                </div>
                <Switch checked={dragEnabled} onCheckedChange={setDragEnabled} />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-foreground">键盘遥控</div>
                  <div className="text-xs text-muted-foreground">点击地图右下角控制器后使用方向键。</div>
                </div>
                <Switch
                  checked={keyboardEnabled}
                  onCheckedChange={setKeyboardEnabled}
                  disabled={connectionStatus !== ConnectionStatus.CONNECTED}
                />
              </div>
            </CardContent>
          </Card>

          {/* 起始点位 */}
          <Card className="border-border/70 bg-card/90">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">0</span>
                <MapPin className="h-4 w-4 text-primary" />
                起始/返回点位
              </CardTitle>
            </CardHeader>
            <CardContent>
            {config?.start_position ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs text-muted-foreground">
                  <span className="mr-2 inline-flex items-center gap-1 text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  ({config.start_position.x.toFixed(2)}, {config.start_position.y.toFixed(2)}, {((config.start_position.theta * 180) / Math.PI).toFixed(1)}°)
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openEditModal('', 'start_position', '起始点位', config.start_position)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    编辑
                  </Button>
                  <Button type="button" size="sm" onClick={handleRecordStart} disabled={loading}>
                    <Crosshair className="mr-2 h-4 w-4" />
                    重录
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleRecordStart}
                disabled={loading || !robotPose}
              >
                <Crosshair className="mr-2 h-4 w-4" />
                录制当前位置
              </Button>
            )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground">
              区域列表 ({config?.rooms.length ?? 0})
            </div>
            <Badge variant="secondary">顺序</Badge>
          </div>

          {config?.rooms.length === 0 && (
            <Card className="border-dashed border-border bg-card/60">
              <CardContent className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Plus className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">暂无区域</div>
                  <div className="text-xs text-muted-foreground">先创建房间，再为每个区域录制关键点位。</div>
                </div>
              </CardContent>
            </Card>
          )}

          {config?.rooms.map((room, roomIdx) => (
            <SortableRoomCard
              key={room.room_id}
              room={room}
              roomIdx={roomIdx}
              roomCount={config.rooms.length}
              isRoomReady={isRoomReady}
              onDelete={handleDeleteRoom}
              onRecord={handleRecord}
              onEdit={openEditModal}
              onAddWaypoint={handleAddWaypoint}
              onDeleteWaypoint={handleDeleteWaypoint}
              onMove={handleMoveRoom}
              robotPose={robotPose}
            />
          ))}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setAddModalVisible(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            新建区域
          </Button>
        </div>

      <Dialog open={addModalVisible} onOpenChange={(open) => {
        setAddModalVisible(open);
        if (!open) {
          setNewRoomId('');
          setNewRoomName('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建区域</DialogTitle>
            <DialogDescription>为巡检房间创建唯一标识和显示名称。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label className="grid gap-1.5 text-sm text-muted-foreground">
              <span>区域号 *</span>
              <Input
                placeholder="如: 101"
                value={newRoomId}
                onChange={(e) => setNewRoomId(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleAddRoom();
                }}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-muted-foreground">
              <span>区域名称（可选）</span>
              <Input
                placeholder="如: 101室（留空则自动生成）"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleAddRoom();
                }}
              />
            </label>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setAddModalVisible(false)}>取消</Button>
            <Button type="button" onClick={() => void handleAddRoom()}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addWpModalVisible} onOpenChange={(open) => {
        setAddWpModalVisible(open);
        if (!open) {
          setNewWpId('');
          setNewWpName('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建自定义点位</DialogTitle>
            <DialogDescription>为当前区域添加一个额外的自定义巡检点。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label className="grid gap-1.5 text-sm text-muted-foreground">
              <span>点位 ID *</span>
              <Input
                placeholder="英文字母开头，字母数字下划线"
                value={newWpId}
                onChange={(e) => setNewWpId(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleAddWaypointConfirm();
                }}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-muted-foreground">
              <span>显示名称（可选）</span>
              <Input
                placeholder="如: 窗边左（留空则使用 ID）"
                value={newWpName}
                onChange={(e) => setNewWpName(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleAddWaypointConfirm();
                }}
              />
            </label>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setAddWpModalVisible(false)}>取消</Button>
            <Button type="button" onClick={() => void handleAddWaypointConfirm()}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editModalVisible} onOpenChange={setEditModalVisible}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑点位 — {editTarget?.label ?? ''}</DialogTitle>
            <DialogDescription>直接输入坐标和角度，保存后会写回当前巡检配置。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label className="grid gap-1.5 text-sm text-muted-foreground">
              <span>X (米)</span>
              <Input
                type="number"
                step="0.01"
                value={String(editX)}
                onChange={(event) => setEditX(Number(event.target.value) || 0)}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-muted-foreground">
              <span>Y (米)</span>
              <Input
                type="number"
                step="0.01"
                value={String(editY)}
                onChange={(event) => setEditY(Number(event.target.value) || 0)}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-muted-foreground">
              <span>角度 (度)</span>
              <Input
                type="number"
                step="1"
                min="-180"
                max="180"
                value={String(editTheta)}
                onChange={(event) => setEditTheta(Number(event.target.value) || 0)}
              />
            </label>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setEditModalVisible(false)}>取消</Button>
            <Button type="button" onClick={() => void handleSaveEdit()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteRoomTarget !== null} onOpenChange={(open) => !open && setDeleteRoomTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除区域</DialogTitle>
            <DialogDescription>
              确定删除区域 {deleteRoomTarget}？删除后该区域的所有点位数据都会丢失。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setDeleteRoomTarget(null)}>取消</Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDeleteRoom()}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteWaypointTarget !== null} onOpenChange={(open) => !open && setDeleteWaypointTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除点位</DialogTitle>
            <DialogDescription>
              确定删除点位「{deleteWaypointTarget?.waypointId}」？已引用该点位的任务步骤将无法执行。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setDeleteWaypointTarget(null)}>取消</Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDeleteWaypoint()}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
