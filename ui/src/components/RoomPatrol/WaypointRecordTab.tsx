import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Card, message, Modal, Input, InputNumber, Tag, Tooltip, Empty, Switch } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  AimOutlined,
  EditOutlined,
  CheckCircleFilled,
  EnvironmentOutlined,
  DragOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MapCanvas } from '@/components/common/MapCanvas';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import type { MapData, Pose, RoomConfig as RoomConfigType, RoomPatrolConfig } from '@/types';

// 点位类型定义
const WAYPOINT_TYPES = [
  { key: 'door_outside', label: '门外', color: '#1890ff' },
  { key: 'door_inside', label: '门内', color: '#52c41a' },
  { key: 'bed_check', label: '床位', color: '#ff4d4f' },
] as const;

interface SortableRoomCardProps {
  room: any;
  roomIdx: number;
  isRoomReady: (room: any) => any;
  onDelete: (roomId: string) => void;
  waypointTypes: typeof WAYPOINT_TYPES;
  onRecord: (roomId: string, wpType: string) => void;
  onEdit: (roomId: string, wpType: string, label: string, pose: any) => void;
  robotPose: any;
}

const SortableRoomCard: React.FC<SortableRoomCardProps> = ({
  room, roomIdx, isRoomReady, onDelete, waypointTypes, onRecord, onEdit, robotPose,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: room.room_id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        size="small"
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* 房间拖拽 handle — 始终显示 */}
              <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#bbb', display: 'flex', alignItems: 'center' }}>
                <DragOutlined />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#1890ff', color: '#fff', fontSize: 11, fontWeight: 'bold', flexShrink: 0 }}>{roomIdx + 1}</span>
              {room.room_name || room.room_id}
              {isRoomReady(room) ? (
                <Tag color="green" style={{ marginLeft: 8, fontSize: '11px' }}>就绪</Tag>
              ) : (
                <Tag color="orange" style={{ marginLeft: 8, fontSize: '11px' }}>未完成</Tag>
              )}
            </span>
            <Tooltip title="删除房间">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(room.room_id)} />
            </Tooltip>
          </div>
        }
      >
        {waypointTypes.map(({ key, label, color }) => {
          const pose = room[key];
          return (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
              <span style={{ fontSize: '13px' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6 }} />
                {label}
              </span>
              {pose ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#666' }}>
                    ({pose.x.toFixed(2)}, {pose.y.toFixed(2)}, {(pose.theta * 180 / Math.PI).toFixed(1)}°)
                  </span>
                  <Button size="small" type="link" icon={<EditOutlined />} style={{ fontSize: '11px', padding: 0 }}
                    onClick={() => onEdit(room.room_id, key, `${room.room_name} ${label}`, pose)} />
                  <Button size="small" type="link" style={{ fontSize: '11px', padding: 0 }}
                    onClick={() => onRecord(room.room_id, key)}>重录</Button>
                </div>
              ) : (
                <Button size="small" type="primary" ghost icon={<AimOutlined />}
                  onClick={() => onRecord(room.room_id, key)} disabled={!robotPose}>录制</Button>
              )}
            </div>
          );
        })}
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

  // 新建房间 Modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newRoomId, setNewRoomId] = useState('');
  const [newRoomName, setNewRoomName] = useState('');

  // 编辑点位 Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<{ roomId: string; waypointType: string; label: string } | null>(null);
  const [editX, setEditX] = useState<number>(0);
  const [editY, setEditY] = useState<number>(0);
  const [editTheta, setEditTheta] = useState<number>(0);

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
          console.warn('[巡房] 加载地图失败:', e);
        }
      }
    });
    return () => unsubscribe();
  }, [connectionStatus]);

  // 新建房间
  const handleAddRoom = async () => {
    if (!newRoomId.trim()) {
      message.error('请输入房间号');
      return;
    }
    const result = await apiService.addRoom(
      newRoomId.trim(),
      newRoomName.trim() || `${newRoomId.trim()}室`,
    );
    if (result.success) {
      message.success(`已添加房间 ${newRoomId}`);
      setAddModalVisible(false);
      setNewRoomId('');
      setNewRoomName('');
      loadConfig();
    } else {
      message.error(result.message);
    }
  };

  // 删除房间
  const handleDeleteRoom = (roomId: string) => {
    Modal.confirm({
      title: `删除房间 ${roomId}？`,
      content: '删除后该房间的所有点位数据将丢失',
      onOk: async () => {
        const result = await apiService.deleteRoom(roomId);
        if (result.success) {
          message.success(`已删除房间 ${roomId}`);
          loadConfig();
        } else {
          message.error(result.message);
        }
      },
    });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleRoomDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !config) return;
    const oldIdx = config.rooms.findIndex(r => r.room_id === active.id);
    const newIdx = config.rooms.findIndex(r => r.room_id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const newRooms = arrayMove(config.rooms, oldIdx, newIdx);
    const updated = { ...config, rooms: newRooms };
    setConfig(updated);
    apiService.saveRoomConfig(updated).catch(() => message.error('保存顺序失败'));
  };

  // 录制点位
  const handleRecord = async (roomId: string, waypointType: string) => {
    if (!robotPose) {
      message.error('无法获取机器人位置');
      return;
    }
    setLoading(true);
    try {
      const result = await apiService.recordRoomWaypoint(roomId, waypointType);
      if (result.success) {
        const p = result.pose;
        message.success(`已录制: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${(p.theta * 180 / Math.PI).toFixed(1)}°)`);
        loadConfig();
      } else {
        message.error(result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // 录制起始点位（专用端点）
  const handleRecordStart = async () => {
    if (!robotPose) {
      message.error('无法获取机器人位置');
      return;
    }
    setLoading(true);
    try {
      const result = await apiService.recordStartPosition();
      if (result.success) {
        const p = result.pose;
        message.success(`起始点位已录制: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${(p.theta * 180 / Math.PI).toFixed(1)}°)`);
        loadConfig();
      } else {
        message.error(result.message);
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
          ? { ...r, [editTarget.waypointType]: newPose }
          : r,
      );
    }

    const result = await apiService.saveRoomConfig(updated);
    if (result.success) {
      message.success(`${editTarget.label} 已更新`);
      setEditModalVisible(false);
      loadConfig();
    } else {
      message.error(result.message);
    }
  };

  // 收集所有已录制的点位用于地图显示 (起点=0, 房间从1开始编号)
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
        for (const wp of WAYPOINT_TYPES) {
          const pose = room[wp.key as keyof RoomConfigType] as Pose | null;
          if (pose) {
            wps.push(pose);
            labels.push(label);
            colors.push(wp.color);
            meta.push({ roomId: room.room_id, type: wp.key });
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
        r.room_id === meta.roomId ? { ...r, [meta.type]: newPose } : r
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
      message.success('点位已保存');
    } else {
      message.error('保存失败');
      loadConfig();
    }
  }, [loadConfig]);

  // 判断房间是否就绪
  const isRoomReady = (room: RoomConfigType) =>
    room.door_outside && room.door_inside && room.bed_check;

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* 左侧：地图 */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative', height: '100%' }}>
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
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              {connectionStatus === ConnectionStatus.CONNECTED ? '等待地图数据...' : '请先连接 后端'}
            </div>
          )}

          {/* 机器人位置信息 */}
          {robotPose && (
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '16px',
                background: 'rgba(0,0,0,0.75)',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            >
              <AimOutlined /> x={robotPose.x.toFixed(3)} y={robotPose.y.toFixed(3)} θ={((robotPose.theta * 180) / Math.PI).toFixed(1)}°
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
              style={{
                position: 'absolute',
                bottom: '16px',
                right: '16px',
                background: keyboardFocused ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.6)',
                color: '#fff',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'monospace',
                minWidth: 140,
                textAlign: 'center',
                cursor: 'pointer',
                outline: keyboardFocused ? '2px solid #52c41a' : '2px solid transparent',
                transition: 'outline 0.2s, background 0.2s',
              }}
              onClick={() => joystickRef.current?.focus()}
            >
              <div style={{ marginBottom: 6, fontWeight: 'bold', color: keyboardFocused ? '#52c41a' : '#999' }}>
                {keyboardFocused ? '遥控中 — 方向键控制' : '点击此处开始遥控'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <span style={{ padding: '2px 8px', border: '1px solid', borderColor: velocity.linear > 0 ? '#52c41a' : '#555', borderRadius: 3 }}>↑</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                <span style={{ padding: '2px 8px', border: '1px solid', borderColor: velocity.angular > 0 ? '#52c41a' : '#555', borderRadius: 3 }}>←</span>
                <span style={{ padding: '2px 8px', border: '1px solid', borderColor: velocity.linear < 0 ? '#52c41a' : '#555', borderRadius: 3 }}>↓</span>
                <span style={{ padding: '2px 8px', border: '1px solid', borderColor: velocity.angular < 0 ? '#52c41a' : '#555', borderRadius: 3 }}>→</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#aaa' }}>
                v={velocity.linear.toFixed(2)} ω={velocity.angular.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {/* 右侧：配置面板 */}
        <div
          style={{
            width: 320,
            minWidth: 280,
            flexShrink: 0,
            borderLeft: '1px solid #f0f0f0',
            background: '#fafafa',
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* 工具开关 */}
          <Card size="small">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}><DragOutlined /> 拖拽点位</span>
              <Switch size="small" checked={dragEnabled} onChange={setDragEnabled} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>⌨️ 键盘遥控</span>
              <Switch size="small" checked={keyboardEnabled} onChange={setKeyboardEnabled}
                disabled={connectionStatus !== ConnectionStatus.CONNECTED} />
            </div>
          </Card>

          {/* 起始点位 */}
          <Card size="small" title={
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#722ed1', color: '#fff', fontSize: 11, fontWeight: 'bold' }}>0</span>
              <EnvironmentOutlined /> 起始/返回点位
            </span>
          }>
            {config?.start_position ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                  <CheckCircleFilled style={{ color: '#52c41a', marginRight: 4 }} />
                  ({config.start_position.x.toFixed(2)}, {config.start_position.y.toFixed(2)}, {((config.start_position.theta * 180) / Math.PI).toFixed(1)}°)
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <Button
                    size="small"
                    type="link"
                    icon={<EditOutlined />}
                    style={{ fontSize: '11px', padding: 0 }}
                    onClick={() => openEditModal('', 'start_position', '起始点位', config.start_position)}
                  />
                  <Button size="small" onClick={handleRecordStart} loading={loading}>
                    重录
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="dashed"
                block
                icon={<AimOutlined />}
                onClick={handleRecordStart}
                loading={loading}
                disabled={!robotPose}
              >
                录制当前位置
              </Button>
            )}
          </Card>

          {/* 房间列表 */}
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#333' }}>
            房间列表 ({config?.rooms.length ?? 0})
          </div>

          {config?.rooms.length === 0 && (
            <Empty description="暂无房间，点击下方按钮添加" style={{ padding: '20px 0' }} />
          )}

          <DndContext sensors={sensors} onDragEnd={handleRoomDragEnd}>
            <SortableContext items={config?.rooms.map(r => r.room_id) ?? []} strategy={verticalListSortingStrategy}>
              {config?.rooms.map((room, roomIdx) => (
                <SortableRoomCard
                  key={room.room_id}
                  room={room}
                  roomIdx={roomIdx}
                  isRoomReady={isRoomReady}
                  onDelete={handleDeleteRoom}
                  waypointTypes={WAYPOINT_TYPES}
                  onRecord={handleRecord}
                  onEdit={(roomId, wpType, label, pose) => {
                    setEditTarget({ roomId, waypointType: wpType, label });
                    setEditX(pose?.x ?? 0);
                    setEditY(pose?.y ?? 0);
                    setEditTheta(pose?.theta ?? 0);
                    setEditModalVisible(true);
                  }}
                  robotPose={robotPose}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* 新建房间按钮 */}
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() => setAddModalVisible(true)}
            style={{ marginTop: '4px' }}
          >
            新建房间
          </Button>
        </div>

      {/* 新建房间 Modal */}
      <Modal
        title="新建房间"
        open={addModalVisible}
        onOk={handleAddRoom}
        onCancel={() => { setAddModalVisible(false); setNewRoomId(''); setNewRoomName(''); }}
        okText="添加"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: '13px' }}>房间号 *</div>
            <Input
              placeholder="如: 101"
              value={newRoomId}
              onChange={(e) => setNewRoomId(e.target.value)}
              onPressEnter={handleAddRoom}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: '13px' }}>房间名称（可选）</div>
            <Input
              placeholder="如: 101室（留空则自动生成）"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onPressEnter={handleAddRoom}
            />
          </div>
        </div>
      </Modal>

      {/* 编辑点位 Modal */}
      <Modal
        title={`编辑点位 — ${editTarget?.label ?? ''}`}
        open={editModalVisible}
        onOk={handleSaveEdit}
        onCancel={() => setEditModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: '13px' }}>X (米)</div>
            <InputNumber
              style={{ width: '100%' }}
              value={editX}
              onChange={(v) => setEditX(v ?? 0)}
              step={0.01}
              precision={4}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: '13px' }}>Y (米)</div>
            <InputNumber
              style={{ width: '100%' }}
              value={editY}
              onChange={(v) => setEditY(v ?? 0)}
              step={0.01}
              precision={4}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: '13px' }}>角度 (度)</div>
            <InputNumber
              style={{ width: '100%' }}
              value={editTheta}
              onChange={(v) => setEditTheta(v ?? 0)}
              step={1}
              precision={1}
              min={-180}
              max={180}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
