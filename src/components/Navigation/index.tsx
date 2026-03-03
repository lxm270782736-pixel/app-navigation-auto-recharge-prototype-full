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
import { DockControl } from '@/components/common/DockControl';
import { rosService } from '@/services/ros';
import { ROS2_MESSAGE_TYPES } from '@/config/ros2MessageTypes';
import { mapStorageService } from '@/services/storage';
import { navigationStorageService } from '@/services/navigationStorage';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { MapData, Pose, Waypoint, PathPoint } from '@/types';
import dayjs from 'dayjs';

export const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useROS();

  // 导航规划路径
  const [navigationPath, setNavigationPath] = useState<PathPoint[]>([]);

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

  // 标记是否已经恢复了导航，防止重复恢复
  const navigationResumedRef = useRef(false);

  // 存储所有活跃的定时器，用于停止导航时清除
  const activeTimersRef = useRef<NodeJS.Timeout[]>([]);

  // 追踪是否收到过 feedback（用于判断是否有 action 在执行）
  const hasReceivedFeedbackRef = useRef(false);

  // Ref标记：是否正在等待当前 action 完成再继续下一个
  // 使用 Ref 而不是 State，确保闭包中能获取最新值
  const waitingForCurrentActionRef = useRef(false);

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

  // 页面加载时，恢复保存的导航配置（目标点、任务和路径点）
  const [savedNavConfig, setSavedNavConfig] = useState<any>(null);

  useEffect(() => {
    const loadSavedNavConfig = async () => {
      try {
        const savedConfig = await navigationStorageService.loadNavigationConfig();
        if (savedConfig) {
          console.log('[Navigation] 加载保存的导航配置:', savedConfig);
          setSavedNavConfig(savedConfig);

          if (savedConfig.navigationType === 'waypoint') {
            // 多点导航：恢复路径点和当前路径点索引
            if (savedConfig.waypoints && savedConfig.waypoints.length > 0) {
              const restoredWaypoints = savedConfig.waypoints.map(w => ({
                pose: w.pose,
                tasks: w.tasks || [],
                navigationMode: w.navigationMode || 'obstacle_avoidance',
                actionConfig: w.actionConfig || { use_default_config: true },
              }));
              setWaypoints(restoredWaypoints);
              setWaypointMode(true); // 进入多点导航模式

              // 恢复当前路径点索引
              const restoredIndex = savedConfig.currentWaypointIndex ?? -1;
              if (restoredIndex >= 0 && restoredIndex < restoredWaypoints.length) {
                // 先设置UI状态，但不立即发送导航指令
                // 等待2秒判断是否已有action在执行
                setCurrentWaypointIndex(restoredIndex);
                setGoalPose(restoredWaypoints[restoredIndex].pose);
                // 立即设置正在导航，确保按钮显示"停止导航"而不是灰色"开始导航"
                setIsNavigating(true);
                console.log(
                  '[Navigation] 恢复多点导航配置，路径点数:',
                  restoredWaypoints.length,
                  '当前路径点索引:',
                  restoredIndex,
                  '(等待2秒判断是否需要发送目标点)'
                );

                // 显示通知
                message.info({
                  content: `已恢复多点巡航配置，共 ${restoredWaypoints.length} 个路径点，当前停在路径点 ${restoredIndex + 1}`,
                  duration: 3,
                });

                // 标记已恢复，并设置为等待模式
                if (!navigationResumedRef.current) {
                  navigationResumedRef.current = true;
                  hasReceivedFeedbackRef.current = false; // 重置 feedback 标记
                  waitingForCurrentActionRef.current = true; // 设置等待模式
                  console.log('[Navigation] 多点巡航恢复模式：等待2秒判断是否有action执行...');

                  // 设置超时：判断是否需要重新发送导航指令
                  const waitTimer = setTimeout(() => {
                    console.log('[Navigation] 2秒超时，feedback更新情况:', {
                      hasReceivedFeedback: hasReceivedFeedbackRef.current,
                      navigationResumed: navigationResumedRef.current,
                      waitingForCurrentAction: waitingForCurrentActionRef.current
                    });

                    // 无论是否收到过 feedback，都需要重新发送目标点
                    // 原因：如果 action 已经完成，result 事件可能在刷新前已发送，不会再有新的 result
                    // 因此需要主动重新发送，以确保有活跃的 action
                    console.log('[Navigation] 重新发送导航指令，确保有活跃的 action');
                    setCurrentWaypointIndex(restoredIndex);
                    setGoalPose(restoredWaypoints[restoredIndex].pose);

                    // 延迟100ms后发送导航指令，确保状态已更新
                    const sendTimer = setTimeout(() => {
                      navigateToWaypoint(restoredIndex);
                    }, 100);
                    activeTimersRef.current.push(sendTimer);

                    waitingForCurrentActionRef.current = false; // 退出等待模式
                  }, 2000);

                  activeTimersRef.current.push(waitTimer);
                }
              } else {
                console.log('[Navigation] 恢复多点导航配置，路径点数:', restoredWaypoints.length);

                // 显示通知
                message.info({
                  content: `已恢复多点巡航配置，共 ${restoredWaypoints.length} 个路径点`,
                  duration: 3,
                });
              }
            }
          } else if (savedConfig.navigationType === 'single') {
            // 单点导航：恢复目标点
            if (savedConfig.goalPose) {
              setGoalPose(savedConfig.goalPose);
              console.log('[Navigation] 恢复单点导航目标点:', savedConfig.goalPose);

              // 显示通知
              message.info({
                content: '已恢复单点导航配置',
                duration: 3,
              });
            }
          }
        }
      } catch (error) {
        console.warn('[Navigation] 加载保存的导航配置失败:', error);
      }
    };

    loadSavedNavConfig();
  }, []);

  // 同步更新 ref 值（确保事件处理器能访问最新状态）
  useEffect(() => {
    waypointModeRef.current = waypointMode;
    waypointsRef.current = waypoints;
    currentWaypointIndexRef.current = currentWaypointIndex;
    completedWaypointsRef.current = completedWaypoints;
  }, [waypointMode, waypoints, currentWaypointIndex, completedWaypoints]);

  // 自动恢复多点导航（刷新网页后继续导航）
  // 注：该 useEffect 已在配置加载时处理，此处仅用于日志记录
  useEffect(() => {
    if (!savedNavConfig || navigationResumedRef.current) {
      return;
    }

    console.log('[Navigation] 检查恢复条件:', {
      navigationType: savedNavConfig.navigationType,
      currentWaypointIndex: savedNavConfig.currentWaypointIndex,
      waypointsLength: waypoints.length,
      currentWaypointIndexState: currentWaypointIndex,
      navigationResumed: navigationResumedRef.current,
    });
  }, [savedNavConfig, waypoints, currentWaypointIndex]);

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
      console.debug('[导航] 已检测到地图数据，无需打开地图选择');
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
        completedCount: currentCompleted.length,
        waitingForCurrentAction: waitingForCurrentActionRef.current,
        hasReceivedFeedback: hasReceivedFeedbackRef.current
      });

      // 如果是恢复后的等待状态，并且收到了 feedback（说明有 action 在执行），
      // 这个 result 就是当前 action 的完成结果，继续导航下一个路径点
      if (waitingForCurrentActionRef.current && hasReceivedFeedbackRef.current && data.success) {
        console.log('[Navigation] 恢复模式：当前action已完成，继续导航下一个路径点');
        waitingForCurrentActionRef.current = false; // 退出等待模式

        // 标记当前路径点为已完成
        setCompletedWaypoints([...currentCompleted, currentIndex]);

        const nextIndex = currentIndex + 1;
        if (nextIndex < currentWaypoints.length) {
          message.success(`路径点 ${currentIndex + 1} 已到达，准备前往路径点 ${nextIndex + 1}...`);
          const timer = setTimeout(() => {
            if (waypointModeRef.current && waypointsRef.current.length > nextIndex) {
              navigateToWaypoint(nextIndex);
            }
          }, 1000);
          activeTimersRef.current.push(timer);
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
          navigationStorageService.clearNavigationConfig().catch(err =>
            console.warn('[Navigation] 清除导航配置失败:', err)
          );
        }
        return;
      }

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
            const timer = setTimeout(() => {
              // 检查是否还在导航
              if (waypointModeRef.current && waypointsRef.current.length > nextIndex) {
                navigateToWaypoint(nextIndex);
              }
            }, 1000);
            activeTimersRef.current.push(timer);
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
            // 清除保存的导航配置
            navigationStorageService.clearNavigationConfig().catch(err =>
              console.warn('[Navigation] 清除导航配置失败:', err)
            );
          }
        } else {
          console.log('[Navigation] 单点导航成功处理', currentWaypointMode, currentIndex);
          // 单点导航模式
          message.success({
            content: '导航成功！机器人已到达目标位置',
            duration: 3,
          });
          setIsNavigating(false);
          setNavigationStatus('');
          setNavigationFeedback({});
          // 清除保存的导航配置
          navigationStorageService.clearNavigationConfig().catch(err =>
            console.warn('[Navigation] 清除导航配置失败:', err)
          );
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
        // 清除保存的导航配置
        navigationStorageService.clearNavigationConfig().catch(err =>
          console.warn('[Navigation] 清除导航配置失败:', err)
        );
      }
    };

    // 监听导航反馈（进度信息）
    // 反馈来自两个源：
    // 1. sendNavigationGoal 中的 goalMessage.on('feedback')（新发送的导航指令）
    // 2. NavigationControl 订阅的 ROS 话题反馈（包括刷新后已执行的导航）
    const handleNavigationFeedback = (data: any) => {
      // console.log('[Navigation] 导航反馈:', data);

      // 如果在等待状态下收到 feedback，说明有 action 在执行
      if (waitingForCurrentActionRef.current) {
        hasReceivedFeedbackRef.current = true;
        console.log('[Navigation] 收到feedback，检测到有action在执行，继续等待...');
      }

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
    console.log('[Navigation] 导航事件监听已设置feedback');

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
    // 重置恢复相关的标记
    navigationResumedRef.current = false;
    hasReceivedFeedbackRef.current = false;
    waitingForCurrentActionRef.current = false;
    message.info('已清空所有路径点');
  };

  // 停止巡航函数（清除定时器和状态）
  const handleStopWaypointNavigation = async () => {
    console.log('[Navigation] 停止巡航，清除所有定时器');

    // 1. 清除所有活跃的定时器
    activeTimersRef.current.forEach(timer => clearTimeout(timer));
    activeTimersRef.current = [];

    // 2. 重置恢复相关的标记
    navigationResumedRef.current = false;
    hasReceivedFeedbackRef.current = false;
    waitingForCurrentActionRef.current = false;

    // 3. 取消导航
    rosService.cancelNavigation();

    // 4. 重置导航状态
    setIsNavigating(false);
    setCurrentWaypointIndex(-1);
    setNavigationStatus('');
    setNavigationFeedback({});

    // 5. 清除保存的导航配置
    try {
      await navigationStorageService.clearNavigationConfig();
    } catch (error) {
      console.warn('[Navigation] 清除导航配置失败:', error);
    }

    message.info('巡航已停止');
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
    console.log('[Navigation] navigateToWaypoint 被调用，索引:', index);
    console.log('[Navigation] 调用栈:', new Error().stack);

    // 使用 ref 获取最新的 waypoints 列表
    const currentWaypoints = waypointsRef.current;
    const currentCompleted = completedWaypointsRef.current;

    if (index < 0 || index >= currentWaypoints.length) {
      console.error('[导航] 无效的路径点索引:', index);
      return;
    }

    // **重复检查：如果已经是这个路径点，就不再发送**
    if (currentWaypointIndexRef.current === index) {
      console.log('[导航] 已经是路径点', index, '，跳过重复发送');
      return;
    }

    const waypoint = currentWaypoints[index];
    console.log(`[导航] 开始导航到路径点 ${index + 1}/${currentWaypoints.length}:`, waypoint);

    // 设置当前目标点（用于地图显示）
    setGoalPose(waypoint.pose);
    setCurrentWaypointIndex(index);
    setIsNavigating(true);
    // 重置导航反馈，清除上一个路径点的进度数据
    setNavigationFeedback({});
    setNavigationStatus('');

    // 保存多点导航配置（包括当前路径点索引）
    // 使用非阻塞式保存，避免 await 导致的时序问题
    navigationStorageService.saveNavigationConfig({
      navigationType: 'waypoint', // 多点导航
      waypoints: currentWaypoints.map(w => ({
        pose: w.pose,
        tasks: w.tasks || [],
        navigationMode: w.navigationMode || 'obstacle_avoidance',
        actionConfig: w.actionConfig || { use_default_config: true },
      })),
      currentWaypointIndex: index, // 保存当前路径点索引
      timestamp: Date.now(),
    }).then(() => {
      console.log(`[导航] 多点导航配置已保存，当前路径点索引: ${index}`);
    }).catch(error => {
      console.error('[导航] 保存多点导航配置失败:', error);
    });

    try {
      // 根据导航模式选择发送方式
      if (waypoint.navigationMode === 'local_navigation') {
        // 局部导航模式：发送到 /small_range_goal 话题
        rosService.sendLocalNavigationGoal(waypoint.pose);
        message.success(`路径点 ${index + 1}: 局部导航目标已发送`);

        // 局部导航模式没有反馈，模拟3秒后完成
        const timer1 = setTimeout(() => {
          // 检查是否还在导航，防止停止后仍继续执行
          // 当停止导航时，currentWaypointIndex 会被设置为 -1
          if (currentWaypointIndexRef.current !== index) {
            return;
          }

          // 标记完成并导航到下一个
          setCompletedWaypoints([...currentCompleted, index]);

          const nextIndex = index + 1;
          // 重新获取最新的 waypoints（因为可能在这3秒内被修改）
          const latestWaypoints = waypointsRef.current;
          if (nextIndex < latestWaypoints.length) {
            message.success(`路径点 ${index + 1} 已到达，准备前往路径点 ${nextIndex + 1}...`);
            const timer2 = setTimeout(() => {
              // 再次检查是否还在导航
              if (currentWaypointIndexRef.current < 0) {
                return;
              }
              navigateToWaypoint(nextIndex);
            }, 1000);
            activeTimersRef.current.push(timer2);
          } else {
            message.success({
              content: `🎉 巡航完成！已到达所有 ${latestWaypoints.length} 个路径点`,
              duration: 5,
            });
            setIsNavigating(false);
            setCurrentWaypointIndex(-1);
          }
        }, 3000);
        activeTimersRef.current.push(timer1);
      } else {
        // 避障导航模式：使用Action接口
        // 在自动恢复的情况下，导航可能已经在进行中
        // 所以不使用 await，而是在后台发送，避免 Promise 无限挂起
        rosService.sendNavigationGoal({
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
          waypoints={waypointMode ? waypoints.map(w => w.pose) : []}
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

          {/* 回充控制 */}
          <DockControl isNavigating={isNavigating} />

          {/* 导航控制 */}
          <NavigationControl
            robotPose={robotPose || null}
            goalPose={goalPose}
            isNavigating={isNavigating}
            onNavigationStart={() => setIsNavigating(true)}
            onNavigationStop={() => setIsNavigating(false)}
            onStopWaypointNavigation={handleStopWaypointNavigation}
            navigationStatus={navigationStatus}
            navigationFeedback={navigationFeedback}
            connectionStatus={connectionStatus}
            waypointMode={waypointMode}
            onWaypointModeChange={handleModeChange}
            waypoints={waypoints.map(w => w.pose)}
            onStartWaypointNavigation={() => navigateToWaypoint(0)}
          />

          {/* 路径点管理 - 仅多点巡航模式下显示 */}
          {waypointMode && (
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
