import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, message, Modal, List, Card, Empty, Spin, Switch, Select } from 'antd';
import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  SaveOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { MapCanvas } from '@/components/common/MapCanvas';
import { NavigationControl } from '@/components/common/NavigationControl';
import { SimpleLocalizationControl } from '@/components/common/SimpleLocalizationControl';
import { WaypointControl } from '@/components/common/WaypointControl';
import { WaypointConfigModal } from '@/components/common/WaypointConfigModal';
import { ChassisControl } from '@/components/common/ChassisControl';
import { DockControl } from '@/components/common/DockControl';
import { rosService } from '@/services/ros';
import { ROS2_MESSAGE_TYPES } from '@/config/ros2MessageTypes';
import { mapStorageService } from '@/services/storage';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { MapData, Pose, Waypoint, PathPoint } from '@/types';
import dayjs from 'dayjs';

// 巡航状态（来自后端SSE）
interface PatrolState {
  active: boolean;
  status: string;
  current_index: number;
  completed: number[];
  skipped: number[];
  total: number;
  error: string;
  waypoints: Waypoint[];
}

export const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useROS();

  // 导航规划路径
  const [navigationPath, setNavigationPath] = useState<PathPoint[]>([]);

  // 使用实时地图（通过 /map 话题订阅）
  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [isMapRealtime, setIsMapRealtime] = useState(false); // 地图是否为实时更新
  const [currentMapName, setCurrentMapName] = useState<string>(''); // 当前地图名称
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

  // 多路径点导航状态（本地编辑用）
  const [waypointMode, setWaypointMode] = useState(false); // 是否为多点巡航模式
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]); // 路径点列表（编辑缓冲区）

  // 后端巡航状态（通过SSE推送）
  const [patrolState, setPatrolState] = useState<PatrolState | null>(null);

  // 从巡航状态派生
  const isPatrolActive = patrolState?.active ?? false;
  const currentWaypointIndex = isPatrolActive ? (patrolState?.current_index ?? -1) : -1;
  const completedWaypoints = isPatrolActive ? (patrolState?.completed ?? []) : [];
  const skippedWaypoints = isPatrolActive ? (patrolState?.skipped ?? []) : [];

  // 路径点配置Modal
  const [waypointConfigModalVisible, setWaypointConfigModalVisible] = useState(false);
  const [editingWaypointIndex, setEditingWaypointIndex] = useState(-1);

  // 路径点交互状态
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState(-1);

  // 应用地图相关状态
  const [applyMapModalVisible, setApplyMapModalVisible] = useState(false);
  const [availableMaps, setAvailableMaps] = useState<MapData[]>([]);
  const [loadingMaps, setLoadingMaps] = useState(false);

  // 重定位模式状态
  const [isRelocalizationMode, setIsRelocalizationMode] = useState(false);

  // 图层显示状态
  const [layers, setLayers] = useState({
    grid: false,
    gridSize: 1.0,
    coordinateSystem: true,
    robotPose: true,
    goalPose: true,
    path: true,
    trail: true,
  });

  // 订阅后端巡航状态（SSE推送）
  useEffect(() => {
    const handlePatrolState = (data: PatrolState) => {
      setPatrolState(data);
      // 巡航激活时自动进入多点模式
      if (data.active && !waypointMode) {
        setWaypointMode(true);
      }
      // 巡航激活时同步导航状态
      if (data.active) {
        setIsNavigating(true);
        // 设置当前目标点用于地图显示
        if (data.current_index >= 0 && data.current_index < data.waypoints.length) {
          const wp = data.waypoints[data.current_index];
          if (wp?.pose) {
            setGoalPose(wp.pose);
          }
        }
      } else if (data.status === 'succeeded') {
        setIsNavigating(false);
        setGoalPose(undefined);
      } else if (data.status === 'idle' && !isNavigating) {
        // 巡航不活跃且状态为idle，不影响单点导航的isNavigating
      }
    };
    rosService.on('patrol-state', handlePatrolState);
    return () => rosService.off('patrol-state', handlePatrolState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypointMode]);

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
      setIsMapRealtime(true);
    });

    // 获取当前地图名称，并主动加载地图数据
    rosService.getCurrentMapName().then(async (name) => {
      if (name) {
        setCurrentMapName(name);
        if (!currentMap) {
          try {
            const mapData = await rosService.loadMapFromROS(name);
            if (mapData) {
              setCurrentMap(mapData);
              setIsMapRealtime(false);
            }
          } catch (e) {
            console.warn('[导航] 加载地图数据失败:', e);
          }
        }
      }
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

    if (currentMap) {
      return;
    }

    // 没有地图数据，等待2秒让/map话题有机会发布
    const timer = setTimeout(() => {
      if (!currentMap && connectionStatus === ConnectionStatus.CONNECTED) {
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
      '/loc_high_freq',
      ROS2_MESSAGE_TYPES.ODOMETRY,
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

  // 订阅导航规划路径
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      setNavigationPath([]);
      return;
    }

    const unsubscribe = rosService.subscribeTopic<any>(
      '/visualizer/mincoPath',
      ROS2_MESSAGE_TYPES.PATH,
      (pathMsg) => {
        const points: PathPoint[] = pathMsg.poses.map((ps: any) => ({
          x: ps.pose.position.x,
          y: ps.pose.position.y,
        }));
        setNavigationPath(points);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [connectionStatus]);

  // 监听导航事件（仅处理单点导航，巡航由后端管理）
  useEffect(() => {
    const handleNavigationResult = (data: any) => {
      // 巡航模式下由后端管理，前端不处理
      if (isPatrolActive) return;

      if (data.success) {
        message.success({
          content: '导航成功！机器人已到达目标位置',
          duration: 3,
        });
        setIsNavigating(false);
        setNavigationStatus('');
        setNavigationFeedback({});
      } else {
        let errorMsg = '导航失败';
        if (data.actionPreempted) {
          errorMsg = '导航已取消';
        } else if (data.actionAborted) {
          errorMsg = '导航中止';
          if (data.errorMessage) errorMsg += `: ${data.errorMessage}`;
        } else if (data.errorMessage) {
          errorMsg = `导航失败: ${data.errorMessage}`;
        }
        message.error({ content: errorMsg, duration: 5 });
        setIsNavigating(false);
        setNavigationStatus('');
        setNavigationFeedback({});
      }
    };

    const handleNavigationFeedback = (data: any) => {
      setNavigationFeedback({
        distance_to_goal: data.distance_to_goal,
        progress: data.progress,
        eta: data.eta,
        current_task: data.current_task,
      });
    };

    const handleNavigationStatus = (data: any) => {
      setNavigationStatus(data.text);
    };

    rosService.on('navigation-result', handleNavigationResult);
    rosService.on('navigation-feedback', handleNavigationFeedback);
    rosService.on('navigation-status', handleNavigationStatus);

    return () => {
      rosService.off('navigation-result', handleNavigationResult);
      rosService.off('navigation-feedback', handleNavigationFeedback);
      rosService.off('navigation-status', handleNavigationStatus);
    };
  }, [isPatrolActive]);

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
      setCurrentMapName(map.name);

      message.success({
        content: `地图 "${map.name}" 已应用为当前地图，SLAM 端将实时发布`,
        key: 'applyMap',
        duration: 3,
      });

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
    setIsRelocalizationMode(true);
  };

  const handleMapClick = (x: number, y: number, theta?: number) => {
    const pose: Pose = { x, y, theta: theta || 0 };

    if (isRelocalizationMode) {
      // 重定位模式：设置初始位置
      rosService.setInitialPose(pose);
      setInitialPose(pose); // 保存初始位姿以便显示标记
      message.success(`初始位置已发送，等待确认...`);
      setIsRelocalizationMode(false); // 退出重定位模式
    } else if (waypointMode) {
      // 多点巡航模式：添加路径点到列表（默认配置）
      const newWaypoint: Waypoint = {
        pose,
        tasks: [],
        navigationMode: 'obstacle_avoidance',
        actionConfig: { use_default_config: true },
      };
      setWaypoints([...waypoints, newWaypoint]);
      message.success(`已添加路径点 ${waypoints.length + 1}`);
    } else {
      // 单点导航模式：设置目标点
      setGoalPose(pose);
      message.info(`目标点已设置，方向: ${((theta || 0) * 180 / Math.PI).toFixed(1)}°`);
    }
  };

  // 删除路径点
  const handleDeleteWaypoint = (index: number) => {
    setWaypoints(waypoints.filter((_, i) => i !== index));
    message.info(`已删除路径点 ${index + 1}`);

    // 如果删除的是选中的路径点，取消选中
    if (selectedWaypointIndex === index) {
      setSelectedWaypointIndex(-1);
    } else if (selectedWaypointIndex > index) {
      // 如果删除的路径点在选中点之前，调整选中索引
      setSelectedWaypointIndex(selectedWaypointIndex - 1);
    }
  };

  // 点击路径点（选中）
  const handleWaypointClick = (index: number) => {
    setSelectedWaypointIndex(index);
  };

  // 拖动路径点修改位置
  const handleWaypointDrag = (index: number, newPose: Pose) => {
    const newWaypoints = [...waypoints];
    newWaypoints[index] = {
      ...newWaypoints[index],
      pose: newPose,
    };
    setWaypoints(newWaypoints);
  };

  // 键盘事件：Delete键删除选中的路径点
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' && selectedWaypointIndex >= 0 && !isNavigating) {
        handleDeleteWaypoint(selectedWaypointIndex);
      } else if (event.key === 'Escape' && selectedWaypointIndex >= 0) {
        // Escape键取消选中
        setSelectedWaypointIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedWaypointIndex, isNavigating, waypoints]);

  // 编辑路径点配置
  const handleEditWaypoint = (index: number) => {
    setEditingWaypointIndex(index);
    setWaypointConfigModalVisible(true);
  };

  // 保存路径点配置
  const handleSaveWaypointConfig = (updatedWaypoint: Waypoint) => {
    if (editingWaypointIndex >= 0 && editingWaypointIndex < waypoints.length) {
      const newWaypoints = [...waypoints];
      newWaypoints[editingWaypointIndex] = updatedWaypoint;
      setWaypoints(newWaypoints);
      setWaypointConfigModalVisible(false);
    }
  };

  // 清空所有路径点
  const handleClearWaypoints = () => {
    setWaypoints([]);
    message.info('已清空所有路径点');
  };

  // 停止巡航（通知后端）
  const handleStopPatrol = async () => {
    const result = await rosService.stopPatrol();
    if (result.success) {
      setIsNavigating(false);
      setNavigationStatus('');
      setNavigationFeedback({});
      message.info('巡航已停止');
    } else {
      message.error(result.message || '停止巡航失败');
    }
  };

  // 开始巡航（通知后端）
  const handleStartPatrol = async (startIndex: number = 0) => {
    if (waypoints.length === 0) {
      message.error('请先添加路径点');
      return;
    }
    const result = await rosService.startPatrol(waypoints, startIndex);
    if (result.success) {
      message.success(`巡航已启动，共 ${waypoints.length} 个路径点`);
    } else {
      message.error(result.message || '启动巡航失败');
    }
  };

  // 移动路径点顺序（用于拖拽排序）
  const handleMoveWaypoint = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= waypoints.length || toIndex < 0 || toIndex >= waypoints.length) {
      return;
    }

    const newWaypoints = [...waypoints];
    // 移除fromIndex位置的元素
    const [movedItem] = newWaypoints.splice(fromIndex, 1);
    // 插入到toIndex位置
    newWaypoints.splice(toIndex, 0, movedItem);

    setWaypoints(newWaypoints);
  };

  // 切换导航模式
  const handleModeChange = (mode: boolean) => {
    if (isNavigating || isPatrolActive) {
      message.warning('请先停止当前导航');
      return;
    }
    setWaypointMode(mode);
    if (mode) {
      // 切换到多点模式，清空单点目标
      setGoalPose(undefined);
    } else {
      // 切换到单点模式，清空路径点
      setWaypoints([]);
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
          导航 - {currentMapName || currentMap.name}
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
          robotPose={layers.robotPose ? robotPose : undefined}
          goalPose={layers.goalPose ? goalPose : undefined}
          initialPose={initialPose}
          path={layers.path ? navigationPath : undefined}
          onMapClick={handleMapClick}
          showCoordinateSystem={layers.coordinateSystem}
          showRobotTrail={layers.trail}
          showGrid={layers.grid}
          gridSize={layers.gridSize}
          waypoints={waypointMode ? (isPatrolActive ? (patrolState?.waypoints ?? []).map((w: any) => w.pose) : waypoints.map(w => w.pose)) : []}
          currentWaypointIndex={currentWaypointIndex}
          completedWaypoints={completedWaypoints}
          selectedWaypointIndex={selectedWaypointIndex}
          onWaypointClick={handleWaypointClick}
          onWaypointDrag={handleWaypointDrag}
          onWaypointDelete={handleDeleteWaypoint}
        />

        {/* 图层控制面板（地图右上角） */}
        <div
          style={{
            position: 'absolute',
            top: '16px',
            right: '350px',
            background: 'rgba(255, 255, 255, 0.92)',
            borderRadius: '8px',
            padding: '12px 16px',
            zIndex: 100,
            backdropFilter: 'blur(6px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            minWidth: '160px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#333' }}>图层</div>
          {[
            { key: 'coordinateSystem', label: '坐标系' },
            { key: 'robotPose', label: '机器人' },
            { key: 'goalPose', label: '目标点' },
            { key: 'path', label: '规划路径' },
            { key: 'trail', label: '轨迹' },
            { key: 'grid', label: '栅格' },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ fontSize: '13px', color: '#555' }}>{label}</span>
              <Switch
                size="small"
                checked={layers[key as keyof typeof layers] as boolean}
                onChange={(v) => setLayers(prev => ({ ...prev, [key]: v }))}
              />
            </div>
          ))}
          {layers.grid && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0', marginTop: '2px', borderTop: '1px solid #eee', paddingTop: '6px' }}>
              <span style={{ fontSize: '12px', color: '#888' }}>栅格大小</span>
              <Select
                size="small"
                value={layers.gridSize}
                onChange={(v) => setLayers(prev => ({ ...prev, gridSize: v }))}
                style={{ width: 72 }}
                options={[
                  { label: '0.5m', value: 0.5 },
                  { label: '1.0m', value: 1.0 },
                  { label: '2.0m', value: 2.0 },
                  { label: '5.0m', value: 5.0 },
                ]}
              />
            </div>
          )}
        </div>

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
            onModeChange={() => {}}
            onRelocalizationStart={handleRelocalizationStart}
            robotPose={robotPose}
          />

          {/* 底盘控制 */}
          <ChassisControl
            isNavigating={isNavigating}
            onControlTypeChange={() => {}}
            />

          {/* 回充控制 */}
          <DockControl isNavigating={isNavigating} />

          {/* 导航控制 */}
          <NavigationControl
            robotPose={robotPose || null}
            goalPose={goalPose}
            isNavigating={isNavigating || isPatrolActive}
            onNavigationStart={() => setIsNavigating(true)}
            onNavigationStop={() => setIsNavigating(false)}
            onStopWaypointNavigation={handleStopPatrol}
            navigationStatus={navigationStatus}
            navigationFeedback={navigationFeedback}
            connectionStatus={connectionStatus}
            waypointMode={waypointMode}
            onWaypointModeChange={handleModeChange}
            waypoints={waypoints.map(w => w.pose)}
            onStartWaypointNavigation={() => handleStartPatrol(0)}
            patrolState={patrolState}
          />

          {/* 路径点管理 - 仅多点巡航模式下显示 */}
          {waypointMode && (
            <WaypointControl
              waypointMode={waypointMode}
              onModeChange={handleModeChange}
              waypoints={isPatrolActive ? (patrolState?.waypoints ?? []) as Waypoint[] : waypoints}
              currentWaypointIndex={currentWaypointIndex}
              completedWaypoints={completedWaypoints}
              selectedWaypointIndex={selectedWaypointIndex}
              onEditWaypoint={handleEditWaypoint}
              onDeleteWaypoint={handleDeleteWaypoint}
              onClearWaypoints={handleClearWaypoints}
              onMoveWaypoint={handleMoveWaypoint}
              isNavigating={isNavigating || isPatrolActive}
            />
          )}
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
            fontSize: '12px',
            maxWidth: '320px',
            zIndex: 100,
            fontWeight: '500',
            lineHeight: '1.8',
          }}
        >
          {waypointMode ? (
            <>
              <div><EnvironmentOutlined /> 点击地图添加路径点</div>
              <div>🖱️ 点击路径点选中，拖动修改位置</div>
              <div>⌨️ Delete键删除选中路径点</div>
            </>
          ) : (
            <div>
              <EnvironmentOutlined /> 点击地图选择导航目标点
            </div>
          )}
        </div>
      </div>

      {/* 路径点配置Modal */}
      <WaypointConfigModal
        visible={waypointConfigModalVisible}
        waypoint={editingWaypointIndex >= 0 ? waypoints[editingWaypointIndex] : null}
        waypointIndex={editingWaypointIndex}
        onSave={handleSaveWaypointConfig}
        onCancel={() => setWaypointConfigModalVisible(false)}
      />
    </div>
  );
};
