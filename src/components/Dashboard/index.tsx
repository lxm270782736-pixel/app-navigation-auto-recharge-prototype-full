import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Statistic, Badge, Progress, Space, Button, Modal, message, List } from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  WifiOutlined,
  EnvironmentOutlined,
  CompassOutlined,
  DashboardOutlined,
  ToolOutlined,
  ApiOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { Pose, MapData } from '@/types';
import { MapCanvas } from '@/components/common/MapCanvas';
import { NavigationControl } from '@/components/common/NavigationControl';
import { mapStorageService } from '@/services/storage';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useROS();
  const [robotPose, setRobotPose] = useState<Pose | null>(null);
  // 暂时使用固定电池电量，等待真实 ROS 环境提供电池话题
  const [batteryLevel] = useState<number>(85);
  const [velocity, setVelocity] = useState({ linear: 0, angular: 0 });

  // 实时地图和导航控制相关状态
  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [isMapRealtime, setIsMapRealtime] = useState(false); // 地图是否为实时更新
  const [goalPose, setGoalPose] = useState<Pose | undefined>();
  const [isNavigating, setIsNavigating] = useState(false);

  // 导航地图选择
  const [mapSelectModalVisible, setMapSelectModalVisible] = useState(false);
  const [availableMaps, setAvailableMaps] = useState<MapData[]>([]);

  // 订阅机器人位姿
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    const unsubscribe = rosService.subscribeTopic<any>(
      '/odom',
      'nav_msgs/Odometry',
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

  //   const unsubscribe = rosService.subscribeTopic<any>(
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

    const unsubscribe = rosService.subscribeTopic<any>(
      '/cmd_vel',
      'geometry_msgs/Twist',
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

  // 订阅实时地图数据
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      // 断开连接时,如果有地图则标记为历史地图
      if (currentMap) {
        setIsMapRealtime(false);
      }
      return;
    }

    const unsubscribe = rosService.subscribeMap((mapData) => {
      setCurrentMap(mapData);
      setIsMapRealtime(true); // 接收到实时地图数据
    });

    return () => {
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus]);

  // 监听导航结果
  useEffect(() => {
    const handleNavigationResult = (data: any) => {
      console.log('[Dashboard] 导航结果:', data);

      if (data.success) {
        // 导航成功
        message.success({
          content: '导航成功！机器人已到达目标位置',
          duration: 3,
        });
        setIsNavigating(false);
        // 保留目标点供参考，用户可以继续导航到相同位置
      } else {
        // 导航失败
        let errorMsg = '导航失败';

        if (data.actionPreempted) {
          errorMsg = '导航已取消';
        } else if (data.actionAborted) {
          errorMsg = '导航中止';
          if (data.errorMessage) {
            errorMsg += `: ${data.errorMessage}`;
          }
        } else if (data.errorMessage) {
          errorMsg = `导航失败: ${data.errorMessage}`;
        }

        message.error({
          content: errorMsg,
          duration: 5,
        });
        setIsNavigating(false);
      }
    };

    // 监听导航反馈（进度信息）
    const handleNavigationFeedback = (data: any) => {
      console.log('[Dashboard] 导航反馈:', data);
      // 可以在Dashboard显示导航进度
    };

    // 监听导航状态更新
    const handleNavigationStatus = (data: any) => {
      console.log('[Dashboard] 导航状态:', data.text);
    };

    rosService.on('navigation-result', handleNavigationResult);
    rosService.on('navigation-feedback', handleNavigationFeedback);
    rosService.on('navigation-status', handleNavigationStatus);

    return () => {
      rosService.off('navigation-result', handleNavigationResult);
      rosService.off('navigation-feedback', handleNavigationFeedback);
      rosService.off('navigation-status', handleNavigationStatus);
    };
  }, []);

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

  // 导航控制函数
  const handleMapClick = (x: number, y: number, theta?: number) => {
    if (!currentMap) return;

    // 设置目标点
    const pose: Pose = { x, y, theta: theta || 0 };
    setGoalPose(pose);
    message.info(`目标点已设置，方向: ${((theta || 0) * 180 / Math.PI).toFixed(1)}°`);
  };

  // 处理导航功能点击
  const handleNavigationClick = async () => {
    try {
      const maps = await mapStorageService.getAllMaps();
      if (maps.length === 0) {
        message.warning('暂无保存的地图，请先创建地图');
        return;
      }
      setAvailableMaps(maps);
      setMapSelectModalVisible(true);
    } catch (error) {
      console.error('加载地图列表失败:', error);
      message.error('加载地图列表失败');
    }
  };

  // 处理地图选择
  const handleMapSelect = (mapId: string) => {
    setMapSelectModalVisible(false);
    navigate(`/navigation/${mapId}`);
  };

  // 保存地图
  const handleSaveMap = () => {
    if (!currentMap) {
      message.error('当前没有地图数据');
      return;
    }

    Modal.confirm({
      title: '保存地图',
      content: (
        <div>
          <p>确认保存当前实时地图吗？</p>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
            地图尺寸: {currentMap.width} × {currentMap.height} px<br />
            分辨率: {currentMap.resolution.toFixed(3)} m/px
          </p>
        </div>
      ),
      onOk: async () => {
        try {
          // 生成地图名称
          const timestamp = new Date().toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }).replace(/\//g, '-');
          const mapName = `实时地图_${timestamp}`;

          // 生成缩略图
          const thumbnail = mapStorageService.generateThumbnail(
            currentMap.data,
            currentMap.width,
            currentMap.height
          );

          // 创建地图数据副本
          const mapToSave: MapData = {
            ...currentMap,
            id: Date.now().toString(),
            name: mapName,
            createdAt: new Date().toISOString(),
            thumbnail, // 添加缩略图
          };

          // 保存地图
          await mapStorageService.saveMap(mapToSave);
          message.success(`地图已保存为 "${mapName}"`);
        } catch (error) {
          console.error('保存地图失败:', error);
          message.error('保存地图失败');
        }
      },
    });
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

      {/* 连接状态卡片 */}
      <Card style={{ marginBottom: '24px' }}>
        <Row align="middle">
          <Col flex="auto">
            <Space size="large">
              <div>
                <ApiOutlined style={{ fontSize: '24px', marginRight: '8px', color: '#1890ff' }} />
                <span style={{ fontSize: '16px' }}>ROS连接状态：</span>
                <Badge
                  status={statusInfo.status as any}
                  text={statusInfo.text}
                  style={{ marginLeft: '8px', fontSize: '16px' }}
                />
              </div>
              {connectionStatus === ConnectionStatus.CONNECTED && (
                <div style={{ color: '#52c41a' }}>
                  <WifiOutlined style={{ marginRight: '4px' }} />
                  ws://localhost:9090
                </div>
              )}
            </Space>
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

      {/* 当前地图 - 带导航控制 */}
      {currentMap && (
        <Card
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>当前地图</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Button
                  type="default"
                  icon={<SaveOutlined />}
                  onClick={handleSaveMap}
                  size="small"
                >
                  保存地图
                </Button>
                <span style={{
                  fontSize: '14px',
                  fontWeight: 'normal',
                  color: isMapRealtime ? '#52c41a' : '#ff4d4f'
                }}>
                  ● {isMapRealtime ? '实时更新' : '历史地图'}
                </span>
              </div>
            </div>
          }
          style={{ marginBottom: '24px' }}
          bodyStyle={{ padding: '16px' }}
        >
          <div style={{
            height: '600px',
            background: '#f0f0f0',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <MapCanvas
              mapData={currentMap}
              robotPose={robotPose || undefined}
              goalPose={goalPose}
              onMapClick={handleMapClick}
            />

            {/* 浮动控制面板 */}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                width: '320px',
                maxHeight: 'calc(600px - 32px)',
                overflowY: 'auto',
                zIndex: 100,
              }}
            >
              <NavigationControl
                robotPose={robotPose}
                goalPose={goalPose}
                isNavigating={isNavigating}
                onNavigationStart={() => setIsNavigating(true)}
                onNavigationStop={() => setIsNavigating(false)}
              />
            </div>

            {/* 操作提示 */}
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                right: '350px',
                background: 'rgba(0, 0, 0, 0.75)',
                color: 'white',
                padding: '12px 16px',
                borderRadius: '4px',
                fontSize: '13px',
                maxWidth: '300px',
                zIndex: 100,
                fontWeight: '500',
              }}
            >
              <div>
                <EnvironmentOutlined /> 点击地图选择导航目标点
              </div>
            </div>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '13px' }}>
            <span>尺寸: {currentMap.width} × {currentMap.height} px</span>
            <span>分辨率: {currentMap.resolution.toFixed(3)} m/px</span>
            <span style={{ color: '#999' }}>💡 支持滚轮缩放、中键拖动平移</span>
          </div>
        </Card>
      )}

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
            onClick={handleNavigationClick}
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

        {/* 系统设置 */}
        <Col xs={24} md={12} lg={8}>
          <Card
            hoverable
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

      {/* 最近活动 */}
      <Card title="系统信息" style={{ marginTop: '24px' }}>
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <p><strong>ROS版本:</strong> ROS 1 Noetic</p>
            <p><strong>导航栈:</strong> move_base</p>
          </Col>
          <Col span={12}>
            <p><strong>SLAM算法:</strong> GMapping</p>
            <p><strong>定位方法:</strong> AMCL</p>
          </Col>
        </Row>
      </Card>

      {/* 地图选择模态框 */}
      <Modal
        title="选择导航地图"
        open={mapSelectModalVisible}
        onCancel={() => setMapSelectModalVisible(false)}
        footer={null}
        width={800}
      >
        <List
          grid={{ gutter: 16, xs: 1, sm: 2, md: 2, lg: 3, xl: 3 }}
          dataSource={availableMaps}
          renderItem={(map) => (
            <List.Item>
              <Card
                hoverable
                onClick={() => handleMapSelect(map.id)}
                cover={
                  <img
                    alt={map.name}
                    src={map.thumbnail}
                    style={{
                      height: '150px',
                      objectFit: 'cover',
                      background: '#f0f0f0',
                    }}
                  />
                }
              >
                <Card.Meta
                  title={map.name}
                  description={
                    <div style={{ fontSize: '12px' }}>
                      <div>{new Date(map.createdAt).toLocaleString('zh-CN')}</div>
                      <div style={{ marginTop: '4px', color: '#999' }}>
                        {map.width} × {map.height} px
                      </div>
                    </div>
                  }
                />
              </Card>
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
};
