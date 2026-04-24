import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
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
  Input,
  cn,
} from '@astribot/ui';
import { ArrowLeft, CheckCircle2, Crosshair, Edit3, Home, MapPin, Plus, Trash2 } from 'lucide-react';
import { MapCanvas } from '@/components/common/MapCanvas';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import type { MapData, Pose, RoomConfig as RoomConfigType, RoomPatrolConfig } from '@/types';

const WAYPOINT_COLORS: Record<string, string> = {
  door_outside: '#1890ff',
  door_inside: '#52c41a',
  bed_check: '#ff4d4f',
  custom: '#722ed1',
};

export const RoomConfig: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useRobot();

  const [config, setConfig] = useState<RoomPatrolConfig | null>(null);
  const [robotPose, setRobotPose] = useState<Pose | undefined>();
  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newRoomId, setNewRoomId] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [deleteRoomId, setDeleteRoomId] = useState<string | null>(null);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<{ roomId: string; waypointType: string; label: string } | null>(null);
  const [editX, setEditX] = useState<number>(0);
  const [editY, setEditY] = useState<number>(0);
  const [editTheta, setEditTheta] = useState<number>(0);

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

  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    const unsubscribe = apiService.subscribeMap((mapData) => {
      setCurrentMap(mapData);
    });
    apiService.getCurrentMapName().then(async (name) => {
      if (name) {
        try {
          const mapData = await apiService.loadMap(name);
          if (mapData) setCurrentMap(mapData);
        } catch (e) {
          console.warn('[区域配置] 加载地图失败:', e);
        }
      }
    });
    return () => unsubscribe();
  }, [connectionStatus]);

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

  const handleDeleteRoom = async (roomId: string) => {
    const result = await apiService.deleteRoom(roomId);
    if (result.success) {
      setNotice({ tone: 'success', text: `已删除区域 ${roomId}` });
      loadConfig();
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
    setDeleteRoomId(null);
  };

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
        setNotice({ tone: 'success', text: `已录制: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${(p.theta * 180 / Math.PI).toFixed(1)}°)` });
        loadConfig();
      } else {
        setNotice({ tone: 'error', text: result.message });
      }
    } finally {
      setLoading(false);
    }
  };

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
        setNotice({ tone: 'success', text: `起始点位已录制: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${(p.theta * 180 / Math.PI).toFixed(1)}°)` });
        loadConfig();
      } else {
        setNotice({ tone: 'error', text: result.message });
      }
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (roomId: string, waypointType: string, label: string, currentPose: Pose | null) => {
    setEditTarget({ roomId, waypointType, label });
    setEditX(currentPose?.x ?? 0);
    setEditY(currentPose?.y ?? 0);
    setEditTheta(currentPose ? +(currentPose.theta * 180 / Math.PI).toFixed(1) : 0);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editTarget || !config) return;
    const thetaRad = editTheta * Math.PI / 180;
    const newPose: Pose = { x: editX, y: editY, theta: thetaRad };

    const updated = { ...config };
    if (editTarget.waypointType === 'start_position') {
      updated.start_position = newPose;
    } else {
      updated.rooms = updated.rooms.map((r) =>
        r.room_id === editTarget.roomId
          ? { ...r, [editTarget.waypointType]: newPose }
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

  const allWaypoints: Pose[] = [];
  if (config) {
    if (config.start_position) allWaypoints.push(config.start_position);
    for (const room of config.rooms) {
      for (const wp of (room.waypoints || [])) {
        if (wp.pose) allWaypoints.push(wp.pose);
      }
    }
  }

  const isRoomReady = (room: RoomConfigType) => {
    const wps = room.waypoints || [];
    return wps.length > 0 && wps.some((wp) => wp.pose !== null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-4 border-b border-border/70 bg-card/90 px-6 py-4">
        <UIButton type="button" variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </UIButton>
        <div className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Home className="h-5 w-5" />
          点位录制
        </div>
        <div className="ml-auto flex items-center gap-2">
          {config?.updated_at && (
            <span className="text-xs text-muted-foreground">上次保存: {config.updated_at}</span>
          )}
          <Badge className={connectionStatus === ConnectionStatus.CONNECTED ? 'bg-emerald-500/15 text-emerald-300' : 'bg-destructive/15 text-destructive'}>
            {connectionStatus === ConnectionStatus.CONNECTED ? '已连接' : '未连接'}
          </Badge>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-w-0 flex-1">
          {currentMap ? (
            <MapCanvas
              mapData={currentMap}
              robotPose={robotPose}
              waypoints={allWaypoints}
              showCoordinateSystem={true}
              showRobotTrail={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {connectionStatus === ConnectionStatus.CONNECTED ? '等待地图数据...' : '请先连接 后端'}
            </div>
          )}

          {robotPose && (
            <div className="absolute bottom-4 left-4 rounded-md bg-black/75 px-3 py-2 font-mono text-xs text-white">
              <Crosshair className="mr-2 inline h-4 w-4" />
              x={robotPose.x.toFixed(3)} y={robotPose.y.toFixed(3)} θ={((robotPose.theta * 180) / Math.PI).toFixed(1)}°
            </div>
          )}
        </div>

        <div className="flex w-[360px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border/70 bg-card/70 p-4">
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

          <UICard className="border-border/70 bg-card/90">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4" />
                起始/返回点位
              </CardTitle>
            </CardHeader>
            <CardContent>
              {config?.start_position ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-foreground">
                    <CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-300" />
                    ({config.start_position.x.toFixed(2)}, {config.start_position.y.toFixed(2)}, {((config.start_position.theta * 180) / Math.PI).toFixed(1)}°)
                  </span>
                  <div className="flex gap-2">
                    <UIButton type="button" size="sm" variant="outline" onClick={() => openEditModal('', 'start_position', '起始点位', config.start_position)}>
                      <Edit3 className="mr-1 h-4 w-4" />
                      编辑
                    </UIButton>
                    <UIButton type="button" size="sm" onClick={handleRecordStart} disabled={loading}>
                      重录
                    </UIButton>
                  </div>
                </div>
              ) : (
                <UIButton type="button" className="w-full" onClick={handleRecordStart} disabled={loading || !robotPose}>
                  <Crosshair className="mr-2 h-4 w-4" />
                  录制当前位置
                </UIButton>
              )}
            </CardContent>
          </UICard>

          <div className="text-sm font-semibold text-foreground">
            区域列表 ({config?.rooms.length ?? 0})
          </div>

          {config?.rooms.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              暂无区域，点击下方按钮添加
            </div>
          )}

          {config?.rooms.map((room) => (
            <UICard key={room.room_id} className="border-border/70 bg-card/90">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">{room.room_name || room.room_id}</CardTitle>
                    <Badge className={isRoomReady(room) ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}>
                      {isRoomReady(room) ? '就绪' : '未完成'}
                    </Badge>
                  </div>
                  <UIButton type="button" variant="ghost" size="icon" onClick={() => setDeleteRoomId(room.room_id)} title="删除区域">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </UIButton>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {(room.waypoints || []).map((wp: any) => {
                  const color = WAYPOINT_COLORS[wp.type] || WAYPOINT_COLORS.custom;
                  return (
                    <div key={wp.id} className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 last:border-b-0 last:pb-0">
                      <div className="min-w-0 text-sm">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: color }} />
                        {wp.name}
                      </div>
                      {wp.pose ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            ({wp.pose.x.toFixed(2)}, {wp.pose.y.toFixed(2)}, {(wp.pose.theta * 180 / Math.PI).toFixed(1)}°)
                          </span>
                          <UIButton type="button" variant="ghost" size="icon" onClick={() => openEditModal(room.room_id, wp.id, `${room.room_name} ${wp.name}`, wp.pose)}>
                            <Edit3 className="h-4 w-4" />
                          </UIButton>
                          <UIButton type="button" size="sm" variant="outline" onClick={() => handleRecord(room.room_id, wp.id)} disabled={loading}>
                            重录
                          </UIButton>
                        </div>
                      ) : (
                        <UIButton type="button" size="sm" onClick={() => handleRecord(room.room_id, wp.id)} disabled={loading || !robotPose}>
                          <Crosshair className="mr-1 h-4 w-4" />
                          录制
                        </UIButton>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </UICard>
          ))}

          <UIButton type="button" variant="outline" className="mt-1 w-full" onClick={() => setAddModalVisible(true)}>
            <Plus className="mr-2 h-4 w-4" />
            新建区域
          </UIButton>
        </div>
      </div>

      <Dialog open={addModalVisible} onOpenChange={setAddModalVisible}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建区域</DialogTitle>
            <DialogDescription>创建新的区域配置，名称可留空自动生成。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <div className="mb-1 text-sm text-muted-foreground">区域号 *</div>
              <Input
                placeholder="如: 101"
                value={newRoomId}
                onChange={(e) => setNewRoomId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddRoom();
                }}
              />
            </div>
            <div>
              <div className="mb-1 text-sm text-muted-foreground">区域名称（可选）</div>
              <Input
                placeholder="如: 101室（留空则自动生成）"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddRoom();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <UIButton type="button" variant="outline" onClick={() => { setAddModalVisible(false); setNewRoomId(''); setNewRoomName(''); }}>取消</UIButton>
            <UIButton type="button" onClick={handleAddRoom}>添加</UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteRoomId !== null} onOpenChange={(open) => !open && setDeleteRoomId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除区域</DialogTitle>
            <DialogDescription>{`删除区域 ${deleteRoomId ?? ''} 后，该区域的所有点位数据将丢失。`}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <UIButton type="button" variant="outline" onClick={() => setDeleteRoomId(null)}>取消</UIButton>
            <UIButton type="button" variant="destructive" onClick={() => deleteRoomId && handleDeleteRoom(deleteRoomId)}>删除</UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editModalVisible} onOpenChange={setEditModalVisible}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{`编辑点位 — ${editTarget?.label ?? ''}`}</DialogTitle>
            <DialogDescription>手动修改点位坐标和朝向。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <div className="mb-1 text-sm text-muted-foreground">X (米)</div>
              <Input type="number" value={String(editX)} onChange={(e) => setEditX(Number(e.target.value) || 0)} />
            </div>
            <div>
              <div className="mb-1 text-sm text-muted-foreground">Y (米)</div>
              <Input type="number" value={String(editY)} onChange={(e) => setEditY(Number(e.target.value) || 0)} />
            </div>
            <div>
              <div className="mb-1 text-sm text-muted-foreground">角度 (度)</div>
              <Input type="number" value={String(editTheta)} onChange={(e) => setEditTheta(Number(e.target.value) || 0)} />
            </div>
          </div>
          <DialogFooter>
            <UIButton type="button" variant="outline" onClick={() => setEditModalVisible(false)}>取消</UIButton>
            <UIButton type="button" onClick={handleSaveEdit}>保存</UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
