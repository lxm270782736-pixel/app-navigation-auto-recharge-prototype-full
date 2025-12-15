import React, { useState, useEffect, useRef } from 'react';
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
import { rosService } from '@/services/ros';
import { mapStorageService } from '@/services/storage';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { MapData, Pose, Waypoint } from '@/types';
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

  // 多路径点导航状态
  const [waypointMode, setWaypointMode] = useState(false); // 是否为多点巡航模式
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]); // 路径点列表
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(-1); // 当前导航的路径点索引
  const [completedWaypoints, setCompletedWaypoints] = useState<number[]>([]); // 已完成的路径点索引

  // 使用 ref 存储最新的状态值，解决事件处理器中的闭包问题
  const waypointModeRef = useRef(waypointMode);
  const waypointsRef = useRef(waypoints);
  const currentWaypointIndexRef = useRef(currentWaypointIndex);
  const completedWaypointsRef = useRef(completedWaypoints);

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

  // 栅格显示状态
  const [showGrid, setShowGrid] = useState(false);
  const [gridSize, setGridSize] = useState(1.0); // 栅格大小（米）

  // 同步更新 ref 值（确保事件处理器能访问最新状态）
  useEffect(() => {
    waypointModeRef.current = waypointMode;
    waypointsRef.current = waypoints;
    currentWaypointIndexRef.current = currentWaypointIndex;
    completedWaypointsRef.current = completedWaypoints;
  }, [waypointMode, waypoints, currentWaypointIndex, completedWaypoints]);

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
      '/loc_high_freq',
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
      console.log('[Navigation] 导航结果:', data);

      // 使用 ref.current 获取最新状态值
      const currentWaypointMode = waypointModeRef.current;
      const currentWaypoints = waypointsRef.current;
      const currentIndex = currentWaypointIndexRef.current;
      const currentCompleted = completedWaypointsRef.current;

      console.log('[Navigation] 当前状态:', {
        waypointMode: currentWaypointMode,
        currentWaypointIndex: currentIndex,
        waypointsLength: currentWaypoints.length,
        completedCount: currentCompleted.length
      });

      if (data.success) {
        // 导航成功
        if (currentWaypointMode && currentIndex >= 0 && currentIndex < currentWaypoints.length) {
          // 多点巡航模式：标记当前路径点为已完成
          setCompletedWaypoints([...currentCompleted, currentIndex]);

          // 检查是否还有下一个路径点
          const nextIndex = currentIndex + 1;
          if (nextIndex < currentWaypoints.length) {
            // 还有下一个路径点，延迟1秒后导航到下一个
            message.success(`路径点 ${currentIndex + 1} 已到达，准备前往路径点 ${nextIndex + 1}...`);
            setTimeout(() => {
              navigateToWaypoint(nextIndex);
            }, 1000);
          } else {
            // 所有路径点已完成
            message.success({
              content: `🎉 巡航完成！已到达所有 ${currentWaypoints.length} 个路径点`,
              duration: 5,
            });
            setIsNavigating(false);
            setCurrentWaypointIndex(-1);
            setNavigationStatus('');
            setNavigationFeedback({});
          }
        } else {
          // 单点导航模式
          message.success({
            content: '导航成功！机器人已到达目标位置',
            duration: 3,
          });
          setIsNavigating(false);
          setNavigationStatus('');
          setNavigationFeedback({});
        }
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

        // 多点模式失败处理
        if (currentWaypointMode && currentIndex >= 0) {
          errorMsg += ` (路径点 ${currentIndex + 1})`;
          message.error({
            content: errorMsg + '\n巡航已停止',
            duration: 5,
          });
        } else {
          message.error({
            content: errorMsg,
            duration: 5,
          });
        }

        setIsNavigating(false);
        setNavigationStatus('');
        setNavigationFeedback({});
        // 多点模式失败时重置状态
        if (currentWaypointMode) {
          setCurrentWaypointIndex(-1);
        }
      }
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
    setCurrentWaypointIndex(-1);
    setCompletedWaypoints([]);
    message.info('已清空所有路径点');
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
    if (isNavigating) {
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
      setCurrentWaypointIndex(-1);
      setCompletedWaypoints([]);
    }
  };

  // 导航到指定的路径点
  const navigateToWaypoint = async (index: number) => {
    // 使用 ref 获取最新的 waypoints 列表
    const currentWaypoints = waypointsRef.current;
    const currentCompleted = completedWaypointsRef.current;

    if (index < 0 || index >= currentWaypoints.length) {
      console.error('[导航] 无效的路径点索引:', index);
      return;
    }

    const waypoint = currentWaypoints[index];
    console.log(`[导航] 开始导航到路径点 ${index + 1}/${currentWaypoints.length}:`, waypoint);

    // 设置当前目标点（用于地图显示）
    setGoalPose(waypoint.pose);
    setCurrentWaypointIndex(index);
    setIsNavigating(true);

    try {
      // 根据导航模式选择发送方式
      if (waypoint.navigationMode === 'local_navigation') {
        // 局部导航模式：发送到 /small_range_goal 话题
        rosService.sendLocalNavigationGoal(waypoint.pose);
        message.success(`路径点 ${index + 1}: 局部导航目标已发送`);

        // 局部导航模式没有反馈，模拟3秒后完成
        setTimeout(() => {
          // 标记完成并导航到下一个
          setCompletedWaypoints([...currentCompleted, index]);

          const nextIndex = index + 1;
          // 重新获取最新的 waypoints（因为可能在这3秒内被修改）
          const latestWaypoints = waypointsRef.current;
          if (nextIndex < latestWaypoints.length) {
            message.success(`路径点 ${index + 1} 已到达，准备前往路径点 ${nextIndex + 1}...`);
            setTimeout(() => {
              navigateToWaypoint(nextIndex);
            }, 1000);
          } else {
            message.success({
              content: `🎉 巡航完成！已到达所有 ${latestWaypoints.length} 个路径点`,
              duration: 5,
            });
            setIsNavigating(false);
            setCurrentWaypointIndex(-1);
          }
        }, 3000);
      } else {
        // 避障导航模式：使用Action接口
        await rosService.sendNavigationGoal({
          pose: waypoint.pose,
          tasks: waypoint.tasks || [],
          actionConfig: waypoint.actionConfig || { use_default_config: true },
        });
      }
    } catch (error) {
      console.error('[导航] 发送路径点目标失败:', error);
      message.error(`导航到路径点 ${index + 1} 失败`);
      setIsNavigating(false);
      setCurrentWaypointIndex(-1);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: '#666' }}>栅格</span>
            <Switch
              size="small"
              checked={showGrid}
              onChange={setShowGrid}
            />
            {showGrid && (
              <Select
                size="small"
                value={gridSize}
                onChange={setGridSize}
                style={{ width: 80 }}
                options={[
                  { label: '0.5m', value: 0.5 },
                  { label: '1.0m', value: 1.0 },
                  { label: '2.0m', value: 2.0 },
                  { label: '5.0m', value: 5.0 },
                ]}
              />
            )}
          </div>
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
          showGrid={showGrid}
          gridSize={gridSize}
          waypoints={waypointMode ? waypoints.map(w => w.pose) : []}
          currentWaypointIndex={currentWaypointIndex}
          completedWaypoints={completedWaypoints}
          selectedWaypointIndex={selectedWaypointIndex}
          onWaypointClick={handleWaypointClick}
          onWaypointDrag={handleWaypointDrag}
          onWaypointDelete={handleDeleteWaypoint}
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

          {/* 底盘控制 */}
          <ChassisControl
            isNavigating={isNavigating}
            onControlTypeChange={(type) => {
              console.log('Chassis control type changed:', type);
            }}
            />

          {/* 导航模式切换和路径点管理 */}
          <WaypointControl
            waypointMode={waypointMode}
            onModeChange={handleModeChange}
            waypoints={waypoints}
            currentWaypointIndex={currentWaypointIndex}
            completedWaypoints={completedWaypoints}
            selectedWaypointIndex={selectedWaypointIndex}
            onEditWaypoint={handleEditWaypoint}
            onDeleteWaypoint={handleDeleteWaypoint}
            onClearWaypoints={handleClearWaypoints}
            onMoveWaypoint={handleMoveWaypoint}
            isNavigating={isNavigating}
          />

          {/* 导航控制 */}
          <NavigationControl
            robotPose={robotPose || null}
            goalPose={goalPose}
            isNavigating={isNavigating}
            onNavigationStart={() => setIsNavigating(true)}
            onNavigationStop={() => setIsNavigating(false)}
            navigationStatus={navigationStatus}
            navigationFeedback={navigationFeedback}
            connectionStatus={connectionStatus}
            waypointMode={waypointMode}
            waypoints={waypoints.map(w => w.pose)}
            onStartWaypointNavigation={() => navigateToWaypoint(0)}
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
