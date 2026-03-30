import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, message, Modal, Input, InputNumber, Tag, Tooltip, Empty } from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  AimOutlined,
  EditOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  EnvironmentOutlined,
  HomeOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { MapCanvas } from '@/components/common/MapCanvas';
import { rosService } from '@/services/ros';
import { ROS2_MESSAGE_TYPES } from '@/config/ros2MessageTypes';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { MapData, Pose, RoomConfig as RoomConfigType, RoomPatrolConfig } from '@/types';

// 点位类型定义
const WAYPOINT_TYPES = [
  { key: 'door_outside', label: '门外', color: '#1890ff' },
  { key: 'door_inside', label: '门内', color: '#52c41a' },
  { key: 'bed_check', label: '床位', color: '#ff4d4f' },
] as const;

export const RoomConfig: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useROS();

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
  // 加载配置（仅在连接时）
  const loadConfig = useCallback(async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    try {
      const data = await rosService.getRoomConfig();
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

  // 订阅地图
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    const unsubscribe = rosService.subscribeMap((mapData) => {
      setCurrentMap(mapData);
    });
    // 主动加载当前地图，不等 /map 话题推送
    rosService.getCurrentMapName().then(async (name) => {
      if (name) {
        try {
          const mapData = await rosService.loadMapFromROS(name);
          if (mapData) setCurrentMap(mapData);
        } catch (e) {
          console.warn('[房间配置] 加载地图失败:', e);
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
    const result = await rosService.addRoom(
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
        const result = await rosService.deleteRoom(roomId);
        if (result.success) {
          message.success(`已删除房间 ${roomId}`);
          loadConfig();
        } else {
          message.error(result.message);
        }
      },
    });
  };

  // 录制点位
  const handleRecord = async (roomId: string, waypointType: string) => {
    if (!robotPose) {
      message.error('无法获取机器人位置');
      return;
    }
    setLoading(true);
    try {
      const result = await rosService.recordRoomWaypoint(roomId, waypointType);
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
      const result = await rosService.recordStartPosition();
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

    const result = await rosService.saveRoomConfig(updated);
    if (result.success) {
      message.success(`${editTarget.label} 已更新`);
      setEditModalVisible(false);
      loadConfig();
    } else {
      message.error(result.message);
    }
  };

  // 收集所有已录制的点位用于地图显示
  const allWaypoints: Pose[] = [];
  if (config) {
    if (config.start_position) allWaypoints.push(config.start_position);
    for (const room of config.rooms) {
      if (room.door_outside) allWaypoints.push(room.door_outside);
      if (room.door_inside) allWaypoints.push(room.door_inside);
      if (room.bed_check) allWaypoints.push(room.bed_check);
    }
  }

  // 判断房间是否就绪
  const isRoomReady = (room: RoomConfigType) =>
    room.door_outside && room.door_inside && room.bed_check;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部工具栏 */}
      <div
        style={{
          padding: '16px 24px',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
          返回
        </Button>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
          <HomeOutlined /> 点位录制
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {config?.updated_at && (
            <span style={{ fontSize: '12px', color: '#999' }}>
              上次保存: {config.updated_at}
            </span>
          )}
          <Tag color={connectionStatus === ConnectionStatus.CONNECTED ? 'green' : 'red'}>
            {connectionStatus === ConnectionStatus.CONNECTED ? '已连接' : '未连接'}
          </Tag>
        </div>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左侧：地图 */}
        <div style={{ flex: 1, position: 'relative' }}>
          {currentMap ? (
            <MapCanvas
              mapData={currentMap}
              robotPose={robotPose}
              waypoints={allWaypoints}
              showCoordinateSystem={true}
              showRobotTrail={false}
            />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              {connectionStatus === ConnectionStatus.CONNECTED ? '等待地图数据...' : '请先连接 ROS'}
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
        </div>

        {/* 右侧：配置面板 */}
        <div
          style={{
            width: '360px',
            borderLeft: '1px solid #f0f0f0',
            background: '#fafafa',
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* 起始点位 */}
          <Card size="small" title={<><EnvironmentOutlined /> 起始/返回点位</>}>
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

          {config?.rooms.map((room) => (
            <Card
              key={room.room_id}
              size="small"
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {room.room_name || room.room_id}
                    {isRoomReady(room) ? (
                      <Tag color="green" style={{ marginLeft: 8, fontSize: '11px' }}>就绪</Tag>
                    ) : (
                      <Tag color="orange" style={{ marginLeft: 8, fontSize: '11px' }}>未完成</Tag>
                    )}
                  </span>
                  <Tooltip title="删除房间">
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteRoom(room.room_id)}
                    />
                  </Tooltip>
                </div>
              }
            >
              {WAYPOINT_TYPES.map(({ key, label, color }) => {
                const pose = room[key as keyof RoomConfigType] as Pose | null;
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '4px 0',
                      borderBottom: '1px solid #f5f5f5',
                    }}
                  >
                    <span style={{ fontSize: '13px' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6 }} />
                      {label}
                    </span>
                    {pose ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#666' }}>
                          ({pose.x.toFixed(2)}, {pose.y.toFixed(2)}, {(pose.theta * 180 / Math.PI).toFixed(1)}°)
                        </span>
                        <Button
                          size="small"
                          type="link"
                          icon={<EditOutlined />}
                          style={{ fontSize: '11px', padding: 0 }}
                          onClick={() => openEditModal(room.room_id, key, `${room.room_name} ${label}`, pose)}
                        />
                        <Button
                          size="small"
                          type="link"
                          style={{ fontSize: '11px', padding: 0 }}
                          onClick={() => handleRecord(room.room_id, key)}
                          loading={loading}
                        >
                          重录
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        icon={<AimOutlined />}
                        onClick={() => handleRecord(room.room_id, key)}
                        loading={loading}
                        disabled={!robotPose}
                      >
                        录制
                      </Button>
                    )}
                  </div>
                );
              })}
            </Card>
          ))}

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
