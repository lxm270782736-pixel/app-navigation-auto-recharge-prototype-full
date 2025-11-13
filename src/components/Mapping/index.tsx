import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, message, Modal, Input, Spin } from 'antd';
import { ArrowLeftOutlined, StopOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { rosService } from '@/services/ros';
import { mapStorageService } from '@/services/storage';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { MapData } from '@/types';
import { MapCanvas } from '@/components/common/MapCanvas';

export const Mapping: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useROS();
  const [isMapping, setIsMapping] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [mapName, setMapName] = useState('');
  const [currentMapData, setCurrentMapData] = useState<Partial<MapData> | null>(null);

  // 组件卸载时停止建图
  useEffect(() => {
    return () => {
      if (isMapping) {
        rosService.stopMapping().catch(console.error);
      }
    };
  }, [isMapping]);

  // 订阅地图话题
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    const unsubscribe = rosService.subscribeTopic<any>(
      '/map',
      'nav_msgs/OccupancyGrid',
      (mapMsg) => {
        setCurrentMapData({
          width: mapMsg.info.width,
          height: mapMsg.info.height,
          resolution: mapMsg.info.resolution,
          origin: {
            x: mapMsg.info.origin.position.x,
            y: mapMsg.info.origin.position.y,
            orientation: mapMsg.info.origin.orientation.z,
          },
          data: mapMsg.data,
        });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [connectionStatus]);

  const startMapping = async () => {
    try {
      await rosService.startMapping();
      setIsMapping(true);
      message.success('建图已启动，请使用遥控器控制机器人移动');
    } catch (error) {
      message.error('启动建图失败');
      console.error('Failed to start mapping:', error);
    }
  };

  const stopMapping = async () => {
    try {
      await rosService.stopMapping();
      setIsMapping(false);

      // 生成默认地图名称
      const defaultName = await mapStorageService.generateDefaultMapName();
      setMapName(defaultName);
      setSaveModalVisible(true);
    } catch (error) {
      message.error('停止建图失败');
      console.error('Failed to stop mapping:', error);
    }
  };

  const saveMap = async () => {
    if (!mapName.trim()) {
      message.error('请输入地图名称');
      return;
    }

    if (!currentMapData || !currentMapData.data) {
      message.error('地图数据不完整，无法保存');
      return;
    }

    try {
      // 调用ROS服务保存地图到后端
      await rosService.saveMap(mapName);

      // 生成缩略图
      const thumbnail = mapStorageService.generateThumbnail(
        currentMapData.data,
        currentMapData.width!,
        currentMapData.height!
      );

      // 保存到本地存储
      const mapData: MapData = {
        id: Date.now().toString(),
        name: mapName,
        createdAt: new Date().toISOString(),
        thumbnail,
        width: currentMapData.width!,
        height: currentMapData.height!,
        resolution: currentMapData.resolution!,
        origin: currentMapData.origin!,
        data: currentMapData.data,
      };

      await mapStorageService.saveMap(mapData);
      message.success('地图保存成功');

      setSaveModalVisible(false);
      navigate('/maps');
    } catch (error) {
      message.error('保存地图失败');
      console.error('Failed to save map:', error);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
          style={{ marginRight: '16px' }}
        >
          返回主页
        </Button>
      </div>

      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>SLAM 建图</span>
            <div style={{ display: 'flex', gap: '12px' }}>
              {!isMapping ? (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={startMapping}
                  disabled={connectionStatus !== ConnectionStatus.CONNECTED}
                >
                  开始建图
                </Button>
              ) : (
                <Button
                  type="primary"
                  danger
                  icon={<StopOutlined />}
                  onClick={stopMapping}
                >
                  结束建图
                </Button>
              )}
            </div>
          </div>
        }
      >
        {/* 如果有地图数据则显示地图,否则显示状态提示 */}
        {currentMapData && currentMapData.data && currentMapData.data.length > 0 ? (
          <div>
            {/* 地图显示区域容器 */}
            <div style={{ position: 'relative' }}>
              {/* 地图画布 */}
              <div style={{
                height: '600px',
                background: '#f0f0f0',
                borderRadius: '4px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <MapCanvas
                  mapData={{
                    id: 'temp',
                    name: '建图中',
                    createdAt: new Date().toISOString(),
                    thumbnail: '',
                    width: currentMapData.width!,
                    height: currentMapData.height!,
                    resolution: currentMapData.resolution!,
                    origin: currentMapData.origin!,
                    data: currentMapData.data,
                  }}
                  showRobotPose={true}
                  showRobotTrail={true}
                  showCoordinateSystem={false}
                  showOperationHints={false}
                />

                {/* 状态指示器 */}
                {isMapping && (
                  <div style={{
                    position: 'absolute',
                    top: '16px',
                    left: '16px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    padding: '12px 16px',
                    borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    zIndex: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Spin size="small" />
                      <span style={{ color: '#52c41a', fontWeight: 'bold' }}>● 建图进行中</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 操作提示 - 与MapCanvas平级 */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '16px',
                  left: '16px',
                  background: 'rgba(0, 0, 0, 0.75)',
                  color: 'white',
                  padding: '12px 16px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  zIndex: 10,
                  fontWeight: '500',
                }}
              >
                <div>🖱️ 滚轮缩放、中键拖动平移</div>
                <div style={{ marginTop: '4px' }}>🎮 使用遥控器控制机器人移动探索环境</div>
                <div style={{ marginTop: '4px' }}>✅ 完成后点击"结束建图"按钮保存</div>
              </div>
            </div>

            {/* 地图信息 */}
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '13px' }}>
              <span>尺寸: {currentMapData.width} × {currentMapData.height} px</span>
              <span>分辨率: {currentMapData.resolution?.toFixed(3)} m/px</span>
              <span style={{ color: '#999' }}>💡 实时地图更新中</span>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            {connectionStatus !== ConnectionStatus.CONNECTED ? (
              <>
                <p style={{ fontSize: '16px', color: '#999' }}>
                  等待 ROS 连接...
                </p>
                <p style={{ color: '#999' }}>
                  请确保 ROS 主节点正在运行
                </p>
              </>
            ) : !isMapping ? (
              <>
                <PlayCircleOutlined style={{ fontSize: '64px', color: '#1890ff', marginBottom: '24px' }} />
                <p style={{ fontSize: '16px' }}>
                  准备开始建图
                </p>
                <p style={{ color: '#999' }}>
                  点击"开始建图"按钮启动 SLAM 建图功能
                </p>
                <p style={{ color: '#999', marginTop: '16px' }}>
                  建图过程中请使用遥控器控制机器人移动，探索环境
                </p>
              </>
            ) : (
              <>
                <Spin size="large" />
                <p style={{ marginTop: '24px', fontSize: '16px' }}>
                  建图进行中，等待地图数据...
                </p>
                <p style={{ color: '#999' }}>
                  遥控手柄已自动启动，请使用遥控器控制机器人移动
                </p>
              </>
            )}
          </div>
        )}
      </Card>

      <Modal
        title="保存地图"
        open={saveModalVisible}
        onOk={saveMap}
        onCancel={() => setSaveModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <div style={{ marginBottom: '16px' }}>
          <p>请为地图命名：</p>
          <Input
            value={mapName}
            onChange={(e) => setMapName(e.target.value)}
            placeholder="输入地图名称"
            maxLength={50}
          />
        </div>
      </Modal>
    </div>
  );
};
