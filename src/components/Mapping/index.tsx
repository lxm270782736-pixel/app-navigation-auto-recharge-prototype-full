import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, message, Modal, Input, Spin } from 'antd';
import { ArrowLeftOutlined, StopOutlined } from '@ant-design/icons';
import { rosService } from '@/services/ros';
import { mapStorageService } from '@/services/storage';
import type { MapData } from '@/types';

export const Mapping: React.FC = () => {
  const navigate = useNavigate();
  const [isMapping, setIsMapping] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [mapName, setMapName] = useState('');
  const [currentMapData, setCurrentMapData] = useState<Partial<MapData> | null>(null);

  useEffect(() => {
    // 自动启动建图
    startMapping();

    return () => {
      // 组件卸载时停止建图
      if (isMapping) {
        rosService.stopMapping().catch(console.error);
      }
    };
  }, []);

  // 订阅地图话题
  useEffect(() => {
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
  }, []);

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
      const defaultName = mapStorageService.generateDefaultMapName();
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

      mapStorageService.saveMap(mapData);
      message.success('地图保存成功');

      setSaveModalVisible(false);
      navigate('/');
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
          返回
        </Button>
      </div>

      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>正在建图</span>
            <Button
              type="primary"
              danger
              icon={<StopOutlined />}
              onClick={stopMapping}
              disabled={!isMapping}
            >
              结束建图
            </Button>
          </div>
        }
      >
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          {isMapping ? (
            <>
              <Spin size="large" />
              <p style={{ marginTop: '24px', fontSize: '16px' }}>
                建图进行中，请使用遥控器控制机器人移动
              </p>
              <p style={{ color: '#999' }}>
                遥控手柄已自动启动，完成后点击"结束建图"按钮
              </p>
            </>
          ) : (
            <p>建图已停止</p>
          )}
        </div>

        {currentMapData && (
          <div style={{ marginTop: '24px', padding: '16px', background: '#f5f5f5', borderRadius: '4px' }}>
            <h4>当前地图信息</h4>
            <p>尺寸: {currentMapData.width} × {currentMapData.height} 像素</p>
            <p>分辨率: {currentMapData.resolution} 米/像素</p>
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
