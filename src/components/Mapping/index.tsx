import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, message, Modal, Input, Spin, Steps, Space, Checkbox } from 'antd';
import {
  ArrowLeftOutlined,
  StopOutlined,
  PlayCircleOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
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

  // 建图启动流程状态
  const [mappingModalVisible, setMappingModalVisible] = useState(false);
  const [mappingStep, setMappingStep] = useState(0);
  const [mappingStepStatus, setMappingStepStatus] = useState<('wait' | 'process' | 'finish' | 'error')[]>(['wait', 'wait']);
  const [skipJoystick, setSkipJoystick] = useState(false);
  const [skipMappingNode, setSkipMappingNode] = useState(false);

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

  const startMapping = () => {
    // 打开建图启动交互框
    setMappingModalVisible(true);
    setMappingStep(0);
    setMappingStepStatus(['wait', 'wait']);
    setSkipJoystick(false);
    setSkipMappingNode(false);
  };

  const executeMappingStartup = async () => {
    try {
      // 步骤 1: 启动遥控器（可跳过）
      setMappingStep(1);
      setMappingStepStatus(['process', 'wait']);

      if (skipJoystick) {
        console.log('[建图] 跳过启动遥控器');
        setMappingStepStatus(['finish', 'wait']);
        message.info('已跳过启动遥控器');
      } else {
        const joystickResult = await rosService.startJoystick();
        if (!joystickResult.success) {
          setMappingStepStatus(['error', 'wait']);
          message.error(joystickResult.message || '启动遥控器失败');
          return;
        }

        setMappingStepStatus(['finish', 'wait']);
        message.success('遥控器已启动');
      }

      // 延迟一下，让用户看到第一步完成
      await new Promise(resolve => setTimeout(resolve, 500));

      // 步骤 2: 启动建图节点（可跳过）
      setMappingStep(2);
      setMappingStepStatus(['finish', 'process']);

      if (skipMappingNode) {
        console.log('[建图] 跳过启动建图节点');
        setMappingStepStatus(['finish', 'finish']);
        setIsMapping(true);
        message.info('已跳过启动建图节点');
      } else {
        const mappingResult = await rosService.startMapping();
        if (!mappingResult.success) {
          setMappingStepStatus(['finish', 'error']);
          message.error(mappingResult.message || '启动建图模式失败');
          return;
        }

        setMappingStepStatus(['finish', 'finish']);
        setIsMapping(true);
        message.success('建图模式已启动');
      }
    } catch (error) {
      message.error('启动建图失败');
      console.error(error);
      setMappingStepStatus(prev => {
        const newStatus = [...prev];
        if (mappingStep === 1) newStatus[0] = 'error';
        if (mappingStep === 2) newStatus[1] = 'error';
        return newStatus as ('wait' | 'process' | 'finish' | 'error')[];
      });
    }
  };

  const stopMapping = async () => {
    try {
      // 步骤 1: 停止建图节点
      const stopResult = await rosService.stopLocalization();
      if (!stopResult.success) {
        message.error(stopResult.message || '停止建图失败');
        return;
      }

      // 步骤 2: 停止遥控器
      const joystickResult = await rosService.stopJoystick();
      if (!joystickResult.success) {
        // 遥控器停止失败不影响整体流程，只是警告
        message.warning(joystickResult.message || '停止遥控器失败');
      }

      setIsMapping(false);
      message.success('建图已停止，遥控器已关闭');

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

    // 规范化地图名称（移除特殊字符）
    const sanitizedName = mapStorageService.sanitizeMapName(mapName);
    if (sanitizedName !== mapName) {
      message.warning(`地图名称已规范化为: ${sanitizedName}`);
    }

    try {
      // 生成缩略图
      const thumbnail = mapStorageService.generateThumbnail(
        currentMapData.data,
        currentMapData.width!,
        currentMapData.height!
      );

      // 创建地图数据（含缩略图）
      const mapData: MapData = {
        id: sanitizedName, // 使用规范化后的 name 作为 id
        name: sanitizedName,
        createdAt: new Date().toISOString(),
        thumbnail, // 保存缩略图
        width: currentMapData.width!,
        height: currentMapData.height!,
        resolution: currentMapData.resolution!,
        origin: currentMapData.origin!,
        data: currentMapData.data,
      };

      // 保存到 ROS 服务
      await rosService.saveMapToROS(mapData);

      // 同时保存到本地缓存
      mapStorageService.saveMapToLocalCache(mapData);

      message.success('地图保存成功');

      setSaveModalVisible(false);
      navigate('/maps');
    } catch (error) {
      message.error('保存地图失败: ' + (error instanceof Error ? error.message : '未知错误'));
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

      {/* 建图启动流程Modal */}
      <Modal
        title="启动建图模式"
        open={mappingModalVisible}
        centered
        onCancel={() => {
          if (mappingStep === 0 || mappingStepStatus[1] === 'finish' || mappingStepStatus.includes('error')) {
            setMappingModalVisible(false);
          }
        }}
        footer={
          mappingStep === 0 ? (
            <Space>
              <Button onClick={() => setMappingModalVisible(false)}>取消</Button>
              <Button type="primary" onClick={executeMappingStartup}>
                开始执行
              </Button>
            </Space>
          ) : (
            mappingStepStatus[1] === 'finish' ? (
              <Button type="primary" onClick={() => setMappingModalVisible(false)}>
                关闭
              </Button>
            ) : mappingStepStatus.includes('error') ? (
              <Space>
                <Button onClick={() => setMappingModalVisible(false)}>关闭</Button>
                <Button type="primary" onClick={() => {
                  setMappingStep(0);
                  setMappingStepStatus(['wait', 'wait']);
                  executeMappingStartup();
                }}>
                  重试
                </Button>
              </Space>
            ) : null
          )
        }
        width={500}
        closable={mappingStep === 0 || mappingStepStatus[1] === 'finish' || mappingStepStatus.includes('error')}
        maskClosable={false}
      >
        <div style={{ padding: '24px 0' }}>
          {mappingStep === 0 ? (
            <div>
              <p style={{ marginBottom: 16, color: '#666', fontSize: 14 }}>
                启动建图模式需要按以下步骤执行：
              </p>
              <Steps
                direction="vertical"
                size="small"
                current={-1}
                items={[
                  {
                    title: '启动遥控器',
                    description: '启动机器人遥控系统，使机器人可以通过手柄控制移动',
                  },
                  {
                    title: '启动建图节点',
                    description: '启动SLAM建图算法，开始构建环境地图',
                  },
                ]}
              />

              <div style={{ marginTop: 24, padding: 16, background: '#fafafa', borderRadius: 4 }}>
                <div style={{ marginBottom: 12, color: '#666', fontSize: 13, fontWeight: 500 }}>
                  跳过选项：
                </div>
                <Space direction="vertical">
                  <Checkbox
                    checked={skipJoystick}
                    onChange={(e) => setSkipJoystick(e.target.checked)}
                  >
                    <span style={{ fontSize: 13 }}>跳过启动遥控器</span>
                    <div style={{ fontSize: 12, color: '#999', marginLeft: 24 }}>
                      如果遥控器已手动启动，可跳过此步骤
                    </div>
                  </Checkbox>
                  <Checkbox
                    checked={skipMappingNode}
                    onChange={(e) => setSkipMappingNode(e.target.checked)}
                  >
                    <span style={{ fontSize: 13 }}>跳过启动建图节点</span>
                    <div style={{ fontSize: 12, color: '#999', marginLeft: 24 }}>
                      如果建图节点已手动启动，可跳过此步骤
                    </div>
                  </Checkbox>
                </Space>
              </div>
            </div>
          ) : (
            <div>
              <Steps
                direction="vertical"
                size="small"
                current={mappingStep - 1}
                items={[
                  {
                    title: skipJoystick ? '启动遥控器（已跳过）' : '启动遥控器',
                    status: mappingStepStatus[0],
                    description: skipJoystick
                      ? '用户选择跳过此步骤'
                      : '启动机器人遥控系统，使机器人可以通过手柄控制移动',
                    icon: mappingStepStatus[0] === 'process' ? <LoadingOutlined /> :
                      mappingStepStatus[0] === 'finish' ? <CheckCircleOutlined /> :
                      mappingStepStatus[0] === 'error' ? <CloseCircleOutlined /> : undefined,
                  },
                  {
                    title: skipMappingNode ? '启动建图节点（已跳过）' : '启动建图节点',
                    status: mappingStepStatus[1],
                    description: skipMappingNode
                      ? '用户选择跳过此步骤'
                      : '启动SLAM建图算法，开始构建环境地图',
                    icon: mappingStepStatus[1] === 'process' ? <LoadingOutlined /> :
                      mappingStepStatus[1] === 'finish' ? <CheckCircleOutlined /> :
                      mappingStepStatus[1] === 'error' ? <CloseCircleOutlined /> : undefined,
                  },
                ]}
              />
              {mappingStepStatus[1] === 'finish' && (
                <div style={{
                  marginTop: 24,
                  padding: 16,
                  background: '#f0f9ff',
                  borderRadius: 4,
                  border: '1px solid #91d5ff',
                }}>
                  <div style={{ color: '#0958d9', fontWeight: 500, marginBottom: 8 }}>
                    ✅ 建图模式已成功启动
                  </div>
                  <div style={{ color: '#666', fontSize: 13 }}>
                    {skipJoystick && skipMappingNode
                      ? '所有步骤均已跳过，请确认遥控器和建图节点已手动启动'
                      : skipJoystick
                      ? '遥控器启动已跳过，请确认遥控器已手动启动后使用'
                      : skipMappingNode
                      ? '建图节点启动已跳过，请确认建图节点已手动启动'
                      : '请使用遥控器控制机器人在环境中移动，系统将自动构建地图'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* 保存地图Modal */}
      <Modal
        title="保存地图"
        open={saveModalVisible}
        centered
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
