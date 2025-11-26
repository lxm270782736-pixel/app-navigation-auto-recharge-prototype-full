import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, message, Modal, List, Card, Empty, Spin } from 'antd';
import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  SaveOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { MapCanvas } from '@/components/common/MapCanvas';
import { NavigationControl } from '@/components/common/NavigationControl';
import { SimpleLocalizationControl } from '@/components/common/SimpleLocalizationControl';
import { rosService } from '@/services/ros';
import { mapStorageService } from '@/services/storage';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { MapData, Pose } from '@/types';
import dayjs from 'dayjs';

export const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useROS();

  // 使用实时地图（通过 /map 话题订阅）
  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [isMapRealtime, setIsMapRealtime] = useState(false); // 地图是否为实时更新
  const [robotPose, setRobotPose] = useState<Pose | undefined>();
  const [goalPose, setGoalPose] = useState<Pose | undefined>();
  const [initialPose, setInitialPose] = useState<Pose | undefined>(); // 初始化位姿
  const [isNavigating, setIsNavigating] = useState(false);
  // 导航状态信息
  const [navigationStatus, setNavigationStatus] = useState<string>('');
  const [navigationFeedback, setNavigationFeedback] = useState<{
    distance_to_goal?: number;
    progress?: number;
    eta?: number;
    current_task?: string;
  }>({});

  // 应用地图相关状态
  const [applyMapModalVisible, setApplyMapModalVisible] = useState(false);
  const [availableMaps, setAvailableMaps] = useState<MapData[]>([]);
  const [loadingMaps, setLoadingMaps] = useState(false);

  // 重定位模式状态
  const [isRelocalizationMode, setIsRelocalizationMode] = useState(false);

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

  // 自动检测并打开地图选择（连接后2秒仍无地图数据）
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    // 如果已经有地图数据，不需要等待
    if (currentMap) {
      console.log('[导航] 已检测到地图数据，无需打开地图选择');
      return;
    }

    // 没有地图数据，等待2秒让/map话题有机会发布
    const timer = setTimeout(() => {
      if (!currentMap && connectionStatus === ConnectionStatus.CONNECTED) {
        // 2秒后仍无地图数据，自动打开地图选择modal
        console.log('[导航] 未检测到地图数据，自动打开地图选择');
        handleOpenApplyMapModal();
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus, currentMap]);

  // 订阅机器人位置
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

        // 四元数转欧拉角
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

  // 监听导航事件（始终监听，但只在必要时处理）
  useEffect(() => {
    const handleNavigationResult = (data: any) => {
      // console.log('[Navigation] 导航结果:', data);
      // console.log('[Navigation] 当前 isNavigating 状态:', isNavigating);

      if (data.success) {
        // 导航成功
        message.success({
          content: '导航成功！机器人已到达目标位置',
          duration: 3,
        });
        // console.log('[Navigation] 设置 isNavigating = false (成功)');
        setIsNavigating(false);
        // 清除导航状态信息
        setNavigationStatus('');
        setNavigationFeedback({});
        // 保留目标点供参考，用户可以继续导航到相同位置
        // 如果想清除目标点，取消注释下一行
        // setGoalPose(undefined);
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
        // console.log('[Navigation] 设置 isNavigating = false (失败/取消)');
        setIsNavigating(false);
        // 清除导航状态信息
        setNavigationStatus('');
        setNavigationFeedback({});
      }

      // 打印详细状态信息供调试
      // console.log('[Navigation] 状态详情:', {
      //   statusText: data.statusText,
      //   actionStatus: data.actionStatus,
      //   resultData: data.resultData,
      // });
    };

    // 监听导航反馈（进度信息）
    const handleNavigationFeedback = (data: any) => {
      // console.log('[Navigation] 导航反馈:', data);

      // 更新导航反馈状态
      setNavigationFeedback({
        distance_to_goal: data.distance_to_goal,
        progress: data.progress,
        eta: data.eta,
        current_task: data.current_task,
      });

      // 打印日志
      // if (data.distance_to_goal !== undefined) {
      //   console.log(`[Navigation] 距离目标: ${data.distance_to_goal.toFixed(2)}m`);
      // }

      // if (data.current_task) {
      //   console.log(`[Navigation] 当前任务: ${data.current_task}`);
      // }

      // if (data.progress !== undefined) {
      //   console.log(`[Navigation] 进度: ${(data.progress * 100).toFixed(1)}%`);
      // }
    };

    // 监听导航状态更新
    const handleNavigationStatus = (data: any) => {
      // console.log('[Navigation] 导航状态:', data.text);
      setNavigationStatus(data.text);
    };

    // 始终订阅事件
    rosService.on('navigation-result', handleNavigationResult);
    rosService.on('navigation-feedback', handleNavigationFeedback);
    rosService.on('navigation-status', handleNavigationStatus);

    // console.log('[Navigation] 导航事件监听已设置');

    return () => {
      rosService.off('navigation-result', handleNavigationResult);
      rosService.off('navigation-feedback', handleNavigationFeedback);
      rosService.off('navigation-status', handleNavigationStatus);
      // console.log('[Navigation] 导航事件监听已清除');
    };
  }, []); // 只在组件挂载时设置一次

  // 监控 isNavigating 状态变化
  // useEffect(() => {
  //   console.log('[Navigation] isNavigating 状态已更新为:', isNavigating);
  // }, [isNavigating]);

  // 加载可用地图列表（只从ROS后端加载）
  const loadAvailableMaps = async () => {
    setLoadingMaps(true);
    try {
      // 只从ROS后端加载地图，不使用本地缓存
      if (connectionStatus === ConnectionStatus.CONNECTED) {
        const rosMaps = await rosService.getAllMapMetadata();
        // 过滤掉本地独有的地图
        const rosOnlyMaps = rosMaps.filter(map => !map.localOnly);
        setAvailableMaps(rosOnlyMaps);
      } else {
        message.warning('请先连接 ROS');
        setAvailableMaps([]);
      }
    } catch (error) {
      console.error('加载地图列表失败:', error);
      message.error('加载地图列表失败');
    } finally {
      setLoadingMaps(false);
    }
  };

  // 打开应用地图对话框
  const handleOpenApplyMapModal = () => {
    setApplyMapModalVisible(true);
    loadAvailableMaps();
  };

  // 应用选中的地图
  const handleApplyMap = async (map: MapData) => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      message.warning('请先连接 ROS');
      return;
    }

    try {
      message.loading({ content: '正在应用地图...', key: 'applyMap', duration: 0 });

      // 调用 ROS 服务，将地图设置为当前地图
      await rosService.setCurrentMap(map);

      // 从ROS加载完整的地图数据（包含occupancy grid）
      const fullMapData = await rosService.loadMapFromROS(map.name);

      // 立即设置当前地图，不等待/map话题发布
      setCurrentMap(fullMapData);
      setIsMapRealtime(true);

      message.success({
        content: `地图 "${map.name}" 已应用为当前地图，SLAM 端将实时发布`,
        key: 'applyMap',
        duration: 3,
      });

      console.log('[导航] 已应用地图:', map.name);
      setApplyMapModalVisible(false);
    } catch (error) {
      console.error('应用地图失败:', error);
      message.error({
        content: '应用地图失败: ' + (error instanceof Error ? error.message : '未知错误'),
        key: 'applyMap',
      });
    }
  };

  // 处理重定位开始
  const handleRelocalizationStart = () => {
    console.log('[导航] 进入重定位模式');
    setIsRelocalizationMode(true);
  };

  const handleMapClick = (x: number, y: number, theta?: number) => {
    const pose: Pose = { x, y, theta: theta || 0 };

    if (isRelocalizationMode) {
      // 重定位模式：设置初始位置
      console.log('[重定位] 设置初始位置:', pose);
      rosService.setInitialPose(pose);
      setInitialPose(pose); // 保存初始位姿以便显示标记
      message.success(`初始位置已发送，等待确认...`);
      setIsRelocalizationMode(false); // 退出重定位模式
    } else {
      // 导航模式：设置目标点
      setGoalPose(pose);
      message.info(`目标点已设置，方向: ${((theta || 0) * 180 / Math.PI).toFixed(1)}°`);
    }
  };

  // 保存地图
  const handleSaveMap = () => {
    if (!currentMap) {
      message.error('当前没有地图数据');
      return;
    }

    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      message.warning('请先连接 ROS');
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
          // 生成安全的地图名称（只包含字母、数字、下划线）
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const hours = String(now.getHours()).padStart(2, '0');
          const minutes = String(now.getMinutes()).padStart(2, '0');
          const seconds = String(now.getSeconds()).padStart(2, '0');

          const mapName = `map_${year}${month}${day}_${hours}${minutes}${seconds}`;

          // 生成缩略图
          const thumbnail = mapStorageService.generateThumbnail(
            currentMap.data,
            currentMap.width,
            currentMap.height
          );

          // 创建地图数据（含缩略图）
          const mapToSave: MapData = {
            ...currentMap,
            id: mapName,
            name: mapName,
            createdAt: new Date().toISOString(),
            thumbnail,
          };

          // 保存地图到 ROS
          await rosService.saveMapToROS(mapToSave);

          // 同时保存到本地缓存
          mapStorageService.saveMapToLocalCache(mapToSave);

          message.success(`地图已保存: ${mapName}`);
        } catch (error) {
          console.error('保存地图失败:', error);
          message.error('保存地图失败: ' + (error instanceof Error ? error.message : '未知错误'));
        }
      },
    });
  };

  if (!currentMap) {
    return (
      <>
        <div style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
        }}>
          {connectionStatus === ConnectionStatus.CONNECTED ? (
            <>
              <Spin size="large" />
              <div style={{ fontSize: '16px', color: '#666' }}>
                等待地图数据...
              </div>
              <div style={{ fontSize: '14px', color: '#999' }}>
                未检测到实时地图，正在加载历史地图列表...
              </div>
            </>
          ) : (
            <div style={{ fontSize: '16px', color: '#666' }}>
              请先连接 ROS...
            </div>
          )}
        </div>

        {/* 应用历史地图对话框 */}
        <Modal
          title="应用历史地图"
          open={applyMapModalVisible}
          onCancel={() => setApplyMapModalVisible(false)}
          footer={null}
          width={800}
          centered
        >
          {loadingMaps ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16, color: '#666' }}>加载地图列表...</div>
            </div>
          ) : availableMaps.length === 0 ? (
            <Empty
              description="暂无可用地图"
              style={{ padding: '40px 0' }}
            />
          ) : (
            <List
              grid={{ gutter: 16, xs: 1, sm: 2, md: 3 }}
              dataSource={availableMaps}
              renderItem={(map) => (
                <List.Item>
                  <Card
                    hoverable
                    cover={
                      map.thumbnail ? (
                        <img
                          alt={map.name}
                          src={map.thumbnail}
                          style={{
                            width: '100%',
                            height: '180px',
                            objectFit: 'cover',
                            background: '#f0f0f0',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '180px',
                            background: '#f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#999',
                          }}
                        >
                          无缩略图
                        </div>
                      )
                    }
                    actions={[
                      <Button
                        key="apply"
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        onClick={() => handleApplyMap(map)}
                      >
                        应用
                      </Button>
                    ]}
                  >
                    <Card.Meta
                      title={map.name}
                      description={
                        <div>
                          <div style={{ marginBottom: 4 }}>
                            {dayjs(map.createdAt).format('YYYY-MM-DD HH:mm')}
                          </div>
                          <div style={{ fontSize: '12px', color: '#999' }}>
                            {map.width} × {map.height} px
                          </div>
                        </div>
                      }
                    />
                  </Card>
                </List.Item>
              )}
            />
          )}
        </Modal>
      </>
    );
  }

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
          导航 - {isMapRealtime ? '实时地图' : currentMap.name}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Button
            icon={<SaveOutlined />}
            onClick={handleSaveMap}
          >
            保存地图
          </Button>
          <span style={{
            fontSize: '14px',
            color: isMapRealtime ? '#52c41a' : '#ff4d4f'
          }}>
            ● {isMapRealtime ? '实时更新' : '历史地图'}
          </span>
        </div>
      </div>

      {/* 地图区域（全屏） */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <MapCanvas
          mapData={currentMap}
          robotPose={robotPose}
          goalPose={goalPose}
          initialPose={initialPose}
          onMapClick={handleMapClick}
          showCoordinateSystem={true}
        />

        {/* 浮动控制面板 */}
        <div
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '320px',
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: 100,
          }}
        >
          {/* 定位控制 */}
          <SimpleLocalizationControl
            onModeChange={(mode) => {
              console.log('Localization mode changed:', mode);
            }}
            onRelocalizationStart={handleRelocalizationStart}
            robotPose={robotPose}
          />

          <NavigationControl
            robotPose={robotPose || null}
            goalPose={goalPose}
            isNavigating={isNavigating}
            onNavigationStart={() => setIsNavigating(true)}
            onNavigationStop={() => setIsNavigating(false)}
            navigationStatus={navigationStatus}
            navigationFeedback={navigationFeedback}
          />
        </div>

        {/* 底部操作提示 */}
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
    </div>
  );
};
