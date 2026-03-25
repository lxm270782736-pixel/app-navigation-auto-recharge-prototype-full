import React, { useState, useEffect } from 'react';
import { Button, Card, Progress, Tag, message, Space, Badge } from 'antd';
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
import type { MapData, Pose, RoomPatrolState } from '@/types';

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

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Left: Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        {currentMap ? (
          <MapCanvas
            mapData={currentMap}
            robotPose={robotPose}
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

        {/* Room progress list */}
        {patrolState && isActive && (
          <Card size="small" title="房间进度">
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              {[...patrolState.rooms_completed.map(r => ({ id: r, status: 'done' as const })),
                ...(patrolState.current_room && !patrolState.rooms_completed.includes(patrolState.current_room) && !patrolState.rooms_failed.includes(patrolState.current_room)
                  ? [{ id: patrolState.current_room, status: 'active' as const }] : []),
                ...patrolState.rooms_failed.map(r => ({ id: r, status: 'failed' as const })),
              ].map(({ id, status }) => (
                <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span>{id}</span>
                  {status === 'done' && <CheckCircleFilled style={{ color: '#52c41a' }} />}
                  {status === 'active' && <LoadingOutlined style={{ color: '#1890ff' }} />}
                  {status === 'failed' && <CloseCircleFilled style={{ color: '#ff4d4f' }} />}
                </div>
              ))}
            </Space>
          </Card>
        )}
      </div>
    </div>
  );
};
