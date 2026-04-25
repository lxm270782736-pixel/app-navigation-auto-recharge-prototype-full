import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Statistic, Badge, Progress, Space } from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  WifiOutlined,
  EnvironmentOutlined,
  CompassOutlined,
  DashboardOutlined,
  ToolOutlined,
  ApiOutlined,
  SendOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import type { Pose } from '@/types';
import { MetaLauncher } from '@/components/common/MetaLauncher';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useRobot();
  const [robotPose, setRobotPose] = useState<Pose | null>(null);
  // 暂时使用固定电池电量，等待真实 ROS 环境提供电池话题
  const [batteryLevel] = useState<number>(85);
  const [velocity, setVelocity] = useState({ linear: 0, angular: 0 });

  // 订阅机器人位姿
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
          1.0 - 2.0 * (orientation.y * orientation.y + orientation.z * orientation.z)
        );

        setRobotPose({
          x: position.x,
          y: position.y,
          theta,
        });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [connectionStatus]);

  // 订阅电池状态
  // 注意：真实 ROS 环境中暂时没有 /battery_state 话题，暂时注释掉
  // useEffect(() => {
  //   if (connectionStatus !== ConnectionStatus.CONNECTED) {
  //     return;
  //   }

  //   const unsubscribe = apiService.subscribeTopic<any>(
  //     '/battery_state',
  //     'sensor_msgs/BatteryState',
  //     (batteryMsg) => {
  //       setBatteryLevel(batteryMsg.percentage * 100);
  //     }
  //   );

  //   return () => {
  //     unsubscribe();
  //   };
  // }, [connectionStatus]);

  // 订阅速度信息
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    const unsubscribe = apiService.subscribeTopic<any>(
      '/cmd_vel',
      MESSAGE_TYPES.TWIST,
      (twistMsg) => {
        setVelocity({
          linear: twistMsg.linear.x,
          angular: twistMsg.angular.z,
        });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [connectionStatus]);

  const getBatteryColor = (level: number) => {
    if (level > 60) return '#52c41a';
    if (level > 30) return '#faad14';
    return '#ff4d4f';
  };

  const getConnectionStatusInfo = () => {
    switch (connectionStatus) {
      case ConnectionStatus.CONNECTED:
        return { status: 'success', text: '在线' };
      case ConnectionStatus.CONNECTING:
        return { status: 'processing', text: '连接中' };
      case ConnectionStatus.ERROR:
        return { status: 'error', text: '错误' };
      default:
        return { status: 'default', text: '离线' };
    }
  };

  const statusInfo = getConnectionStatusInfo();

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 标题栏 */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>
          <RobotOutlined /> 机器人建图导航
        </h1>
        <p style={{ color: '#666', fontSize: '14px' }}>实时监控机器人状态和性能</p>
      </div>

      {/* 连接状态和节点控制区域 */}
      <Card style={{ marginBottom: '24px' }}>
        <Row gutter={[24, 16]}>
          {/* ROS连接状态 */}
          <Col xs={24} lg={12}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <ApiOutlined style={{ fontSize: '24px', marginRight: '8px', color: '#1890ff' }} />
                <span style={{ fontSize: '16px', fontWeight: 500 }}>ROS连接状态</span>
              </div>
              <div style={{ paddingLeft: '32px' }}>
                <Space size="large">
                  <div>
                    <Badge
                      status={statusInfo.status as any}
                      text={statusInfo.text}
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  {connectionStatus === ConnectionStatus.CONNECTED && (
                    <div style={{ color: '#52c41a' }}>
                      <WifiOutlined style={{ marginRight: '4px' }} />
                      ws://localhost:9090
                    </div>
                  )}
                </Space>
              </div>
            </Space>
          </Col>

          {/* Meta 服务控制 */}
          <Col xs={24} lg={12}>
            <MetaLauncher />
          </Col>
        </Row>
      </Card>

      {/* 主要状态卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        {/* 电池状态 */}
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="电池电量"
              value={batteryLevel}
              precision={0}
              valueStyle={{ color: getBatteryColor(batteryLevel) }}
              prefix={<ThunderboltOutlined />}
              suffix="%"
            />
            <Progress
              percent={batteryLevel}
              strokeColor={getBatteryColor(batteryLevel)}
              showInfo={false}
              style={{ marginTop: '12px' }}
            />
          </Card>
        </Col>

        {/* 位置信息 */}
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="位置 (X, Y)"
              value={robotPose ? `${robotPose.x.toFixed(2)}, ${robotPose.y.toFixed(2)}` : '-'}
              prefix={<EnvironmentOutlined />}
              valueStyle={{ fontSize: '18px' }}
            />
          </Card>
        </Col>

        {/* 朝向 */}
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="朝向角度"
              value={robotPose ? ((robotPose.theta * 180) / Math.PI).toFixed(1) : '-'}
              prefix={<CompassOutlined />}
              suffix="°"
            />
          </Card>
        </Col>

        {/* 速度 */}
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="线速度"
              value={velocity.linear.toFixed(2)}
              prefix={<DashboardOutlined />}
              suffix="m/s"
            />
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
              角速度: {velocity.angular.toFixed(2)} rad/s
            </div>
          </Card>
        </Col>
      </Row>

      {/* 功能卡片 */}
      <Row gutter={[16, 16]}>
        {/* 地图管理 */}
        <Col xs={24} md={12} lg={8}>
          <Card
            hoverable
            onClick={() => navigate('/maps')}
            style={{ height: '180px', cursor: 'pointer' }}
          >
            <div style={{ textAlign: 'center', paddingTop: '20px' }}>
              <EnvironmentOutlined style={{ fontSize: '48px', color: '#1890ff' }} />
              <h3 style={{ marginTop: '16px', fontSize: '18px' }}>地图管理</h3>
              <p style={{ color: '#999', marginTop: '8px' }}>
                查看、编辑和管理地图
              </p>
            </div>
          </Card>
        </Col>

        {/* 建图功能 */}
        <Col xs={24} md={12} lg={8}>
          <Card
            hoverable
            onClick={() => navigate('/mapping')}
            style={{ height: '180px', cursor: 'pointer' }}
          >
            <div style={{ textAlign: 'center', paddingTop: '20px' }}>
              <CompassOutlined style={{ fontSize: '48px', color: '#52c41a' }} />
              <h3 style={{ marginTop: '16px', fontSize: '18px' }}>SLAM建图</h3>
              <p style={{ color: '#999', marginTop: '8px' }}>
                启动建图模式创建新地图
              </p>
            </div>
          </Card>
        </Col>

        {/* 导航功能 */}
        <Col xs={24} md={12} lg={8}>
          <Card
            hoverable
            onClick={() => navigate('/navigation')}
            style={{ height: '180px', cursor: 'pointer' }}
          >
            <div style={{ textAlign: 'center', paddingTop: '20px' }}>
              <SendOutlined style={{ fontSize: '48px', color: '#722ed1' }} />
              <h3 style={{ marginTop: '16px', fontSize: '18px' }}>导航功能</h3>
              <p style={{ color: '#999', marginTop: '8px' }}>
                选择地图进行自主导航
              </p>
            </div>
          </Card>
        </Col>

        {/* 导览任务 */}
        <Col xs={24} md={12} lg={8}>
          <Card
            hoverable
            onClick={() => navigate('/room-patrol')}
            style={{ height: '180px', cursor: 'pointer' }}
          >
            <div style={{ textAlign: 'center', paddingTop: '20px' }}>
              <EnvironmentOutlined style={{ fontSize: '48px', color: '#eb2f96' }} />
              <h3 style={{ marginTop: '16px', fontSize: '18px' }}>导览任务</h3>
              <p style={{ color: '#999', marginTop: '8px' }}>
                点位录制、任务编排、任务下发
              </p>
            </div>
          </Card>
        </Col>

        {/* 素材管理 */}
        <Col xs={24} md={12} lg={8}>
          <Card
            hoverable
            onClick={() => navigate('/asset-manager')}
            style={{ height: '180px', cursor: 'pointer' }}
          >
            <div style={{ textAlign: 'center', paddingTop: '20px' }}>
              <AppstoreOutlined style={{ fontSize: '48px', color: '#13c2c2' }} />
              <h3 style={{ marginTop: '16px', fontSize: '18px' }}>素材管理</h3>
              <p style={{ color: '#999', marginTop: '8px' }}>
                管理图片、音频、视频等素材资源
              </p>
            </div>
          </Card>
        </Col>

        {/* 系统设置 */}
        <Col xs={24} md={12} lg={8}>
          <Card
            hoverable
            onClick={() => navigate('/settings')}
            style={{ height: '180px', cursor: 'pointer' }}
          >
            <div style={{ textAlign: 'center', paddingTop: '20px' }}>
              <ToolOutlined style={{ fontSize: '48px', color: '#faad14' }} />
              <h3 style={{ marginTop: '16px', fontSize: '18px' }}>系统设置</h3>
              <p style={{ color: '#999', marginTop: '8px' }}>
                配置机器人参数和选项
              </p>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
