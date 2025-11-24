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

  // 地图名称输入状态
  const [mapNameModalVisible, setMapNameModalVisible] = useState(false);
  const [inputMapName, setInputMapName] = useState('');
  const [existingMaps, setExistingMaps] = useState<string[]>([]);
  const [pendingMapName, setPendingMapName] = useState<string>(''); // 记住建图开始前设置的地图名称
  const [successModalVisible, setSuccessModalVisible] = useState(false); // 建图成功弹窗

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
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      message.warning('请先连接 ROS');
      return;
    }

    // 先弹出地图名称输入对话框
    try {
      // 生成默认地图名称
      const defaultName = await mapStorageService.generateDefaultMapName();
      setInputMapName(defaultName);

      // 获取已存在的地图列表（如果失败不影响建图流程）
      try {
        const maps = await rosService.getAllMapMetadata();
        setExistingMaps(maps.map(m => m.name));
      } catch (error) {
        console.warn('获取地图列表失败，将使用空列表继续:', error);
        message.warning('无法获取现有地图列表，请注意可能存在同名地图');
        setExistingMaps([]);
      }

      // 打开地图名称输入对话框（无论地图列表是否获取成功）
      setMapNameModalVisible(true);
    } catch (error) {
      console.error('初始化建图流程失败:', error);
      message.error('初始化建图流程失败');
    }
  };

  // 确认地图名称并开始建图
  const confirmMapNameAndStart = async () => {
    if (!inputMapName.trim()) {
      message.error('请输入地图名称');
      return;
    }

    // 规范化地图名称
    const sanitizedName = mapStorageService.sanitizeMapName(inputMapName);

    // 检查是否存在同名地图
    if (existingMaps.includes(sanitizedName)) {
      Modal.confirm({
        title: '地图名称冲突',
        content: `地图 "${sanitizedName}" 已存在，是否覆盖？`,
        centered: true,
        okText: '覆盖',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          try {
            // 先删除旧地图
            message.loading({ content: `正在删除旧地图 "${sanitizedName}"...`, key: 'deleteMap', duration: 0 });

            await rosService.deleteMapFromROS(sanitizedName);

            // 同时从本地缓存删除
            mapStorageService.deleteMapFromLocalCache(sanitizedName);

            message.success({
              content: `旧地图 "${sanitizedName}" 已删除`,
              key: 'deleteMap',
              duration: 2,
            });

            console.log('[建图] 已删除旧地图:', sanitizedName);

            // 继续设置地图名称并开始建图
            await setMapNameAndStartMapping(sanitizedName);
          } catch (error) {
            console.error('删除旧地图失败:', error);
            message.error({
              content: '删除旧地图失败: ' + (error instanceof Error ? error.message : '未知错误'),
              key: 'deleteMap',
            });
          }
        },
      });
    } else {
      await setMapNameAndStartMapping(sanitizedName);
    }
  };

  // 设置地图名称并开始建图流程
  const setMapNameAndStartMapping = async (finalMapName: string) => {
    try {
      message.loading({ content: '正在设置地图名称...', key: 'setMapName', duration: 0 });

      // 调用 ROS 服务设置地图名称
      await rosService.setMapName(finalMapName);

      // 记住这个地图名称供后续使用
      setPendingMapName(finalMapName);

      message.success({ content: `地图名称已设置为 "${finalMapName}"`, key: 'setMapName', duration: 2 });

      // 关闭地图名称输入对话框
      setMapNameModalVisible(false);

      // 打开建图启动交互框
      setMappingModalVisible(true);
      setMappingStep(0);
      setMappingStepStatus(['wait', 'wait']);
      setSkipJoystick(false);
      setSkipMappingNode(false);
    } catch (error) {
      console.error('设置地图名称失败:', error);
      message.error({
        content: '设置地图名称失败: ' + (error instanceof Error ? error.message : '未知错误'),
        key: 'setMapName',
      });
    }
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
      // 步骤 1: 停止建图节点（如果启动时跳过了，则停止时也跳过）
      if (!skipMappingNode) {
        const stopResult = await rosService.stopLocalization();
        if (!stopResult.success) {
          message.error(stopResult.message || '停止建图失败');
          return;
        }
      } else {
        console.log('[建图] 停止时跳过建图节点（启动时已跳过）');
      }

      // 步骤 2: 停止遥控器（如果启动时跳过了，则停止时也跳过）
      if (!skipJoystick) {
        const joystickResult = await rosService.stopJoystick();
        if (!joystickResult.success) {
          // 遥控器停止失败不影响整体流程，只是警告
          message.warning(joystickResult.message || '停止遥控器失败');
        }
      } else {
        console.log('[建图] 停止时跳过遥控器（启动时已跳过）');
      }

      setIsMapping(false);

      // 根据跳过情况显示不同的提示
      if (skipJoystick && skipMappingNode) {
        message.success('建图已停止（所有服务均由您手动管理）');
      } else if (skipJoystick) {
        message.success('建图已停止（遥控器请手动管理）');
      } else if (skipMappingNode) {
        message.success('建图已停止，遥控器已关闭（建图节点请手动管理）');
      } else {
        message.success('建图已停止，遥控器已关闭');
      }

      // 从ROS同步地图到本地缓存，并显示成功弹窗
      if (pendingMapName) {
        message.loading({
          content: `地图 "${pendingMapName}" 已保存到ROS，正在同步到本地...`,
          key: 'syncMap',
          duration: 0,
        });

        try {
          // 从ROS同步地图到本地缓存
          await syncMapFromROS();

          // 显示建图成功弹窗
          setSuccessModalVisible(true);
        } catch (error) {
          // 同步失败也显示弹窗，但不影响建图完成的流程
          console.error('同步地图失败，但建图已完成:', error);
          setSuccessModalVisible(true);
        }
      } else {
        message.warning('未设置地图名称');
      }
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

  // 从ROS同步地图到本地缓存
  const syncMapFromROS = async () => {
    // 如果没有设置过地图名称，直接返回
    if (!pendingMapName) {
      console.log('[建图] 没有待加载的地图名称');
      return;
    }

    try {
      // 加载完整的地图数据
      const mapData = await rosService.loadMapFromROS(pendingMapName);

      // 保存到本地缓存
      mapStorageService.saveMapToLocalCache(mapData);

      message.success({
        content: `地图 "${pendingMapName}" 已同步到本地`,
        key: 'syncMap',
        duration: 2,
      });

      console.log('[建图] 已从ROS同步地图到本地:', pendingMapName);
    } catch (error) {
      console.error('同步地图失败:', error);
      message.error({
        content: `地图 "${pendingMapName}" 同步失败，ROS端可能尚未保存`,
        key: 'syncMap',
        duration: 3,
      });
      throw error; // 抛出错误以便调用者处理
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

      {/* 地图名称输入Modal */}
      <Modal
        title="设置地图名称"
        open={mapNameModalVisible}
        centered
        onOk={confirmMapNameAndStart}
        onCancel={() => setMapNameModalVisible(false)}
        okText="确认并开始建图"
        cancelText="取消"
        width={480}
      >
        <div style={{ padding: '12px 0' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8, color: '#666', fontSize: 14 }}>
              请为即将建立的地图命名：
            </div>
            <Input
              value={inputMapName}
              onChange={(e) => setInputMapName(e.target.value)}
              placeholder="输入地图名称"
              maxLength={50}
              onPressEnter={confirmMapNameAndStart}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
              地图名称将用于保存和识别地图，建议使用有意义的名称
            </div>
          </div>

          {existingMaps.length > 0 && (
            <div style={{
              padding: 12,
              background: '#fafafa',
              borderRadius: 4,
              border: '1px solid #f0f0f0'
            }}>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
                已存在的地图 ({existingMaps.length}):
              </div>
              <div style={{
                maxHeight: 120,
                overflowY: 'auto',
                fontSize: 12,
                color: '#999'
              }}>
                {existingMaps.map((name, index) => (
                  <div key={index} style={{ padding: '4px 0' }}>
                    • {name}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#fa8c16' }}>
                ⚠️ 如果输入已存在的地图名称，将提示是否覆盖
              </div>
            </div>
          )}
        </div>
      </Modal>

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

      {/* 保存地图Modal（已废弃，改用Modal.confirm） */}
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

      {/* 建图成功弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircleOutlined style={{ fontSize: '24px', color: '#52c41a' }} />
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>建图成功</span>
          </div>
        }
        open={successModalVisible}
        centered
        width={500}
        footer={null}
        onCancel={() => setSuccessModalVisible(false)}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{
            marginBottom: 24,
            padding: 16,
            background: '#f6ffed',
            borderRadius: 8,
            border: '1px solid #b7eb8f',
          }}>
            <div style={{ color: '#389e0d', fontSize: 16, marginBottom: 8, fontWeight: 500 }}>
              地图已成功保存
            </div>
            <div style={{ color: '#666', fontSize: 14 }}>
              地图名称：<strong>{pendingMapName}</strong>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
              💡 下一步操作：
            </div>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Button
                type="primary"
                size="large"
                block
                onClick={async () => {
                  try {
                    // 加载地图数据
                    const mapData = await rosService.loadMapFromROS(pendingMapName);
                    // 应用地图
                    await rosService.setCurrentMap(mapData);
                    message.success('地图已应用');
                    setSuccessModalVisible(false);
                    // 跳转到导航界面
                    navigate('/navigation');
                  } catch (error) {
                    console.error('应用地图失败:', error);
                    message.error('应用地图失败');
                  }
                }}
              >
                应用地图并开始导航
              </Button>
              <Button
                size="large"
                block
                onClick={() => {
                  setSuccessModalVisible(false);
                  navigate('/maps');
                }}
              >
                进入地图管理
              </Button>
              <Button
                size="large"
                block
                onClick={() => {
                  setSuccessModalVisible(false);
                }}
              >
                继续建图
              </Button>
            </Space>
          </div>
        </div>
      </Modal>
    </div>
  );
};
