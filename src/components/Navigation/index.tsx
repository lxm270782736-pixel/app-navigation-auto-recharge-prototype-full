import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, message } from 'antd';
import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { MapCanvas } from '@/components/common/MapCanvas';
import { NavigationControl } from '@/components/common/NavigationControl';
import { SimpleLocalizationControl } from '@/components/common/SimpleLocalizationControl';
import { rosService } from '@/services/ros';
import { mapStorageService } from '@/services/storage';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { MapData, Pose } from '@/types';

export const Navigation: React.FC = () => {
  const { mapId } = useParams<{ mapId: string }>();
  const navigate = useNavigate();
  const { connectionStatus } = useROS();

  const [mapData, setMapData] = useState<MapData | null>(null);
  const [robotPose, setRobotPose] = useState<Pose | undefined>();
  const [goalPose, setGoalPose] = useState<Pose | undefined>();
  const [isNavigating, setIsNavigating] = useState(false);
  // 导航状态信息
  const [navigationStatus, setNavigationStatus] = useState<string>('');
  const [navigationFeedback, setNavigationFeedback] = useState<{
    distance_to_goal?: number;
    progress?: number;
    eta?: number;
    current_task?: string;
  }>({});

  useEffect(() => {
    const loadMap = async () => {
      if (!mapId) {
        message.error('地图ID无效');
        navigate('/');
        return;
      }

      // 加载地图数据
      const map = await mapStorageService.getMap(mapId);
      if (!map) {
        message.error('地图不存在');
        navigate('/');
        return;
      }

      setMapData(map);
    };

    loadMap();
  }, [mapId, navigate]);

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

  const handleMapClick = (x: number, y: number, theta?: number) => {
    // 设置目标点
    const pose: Pose = { x, y, theta: theta || 0 };
    setGoalPose(pose);
    message.info(`目标点已设置，方向: ${((theta || 0) * 180 / Math.PI).toFixed(1)}°`);
  };

  if (!mapData) {
    return <div>加载中...</div>;
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
          地图: {mapData.name}
        </div>
      </div>

      {/* 地图区域（全屏） */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <MapCanvas
          mapData={mapData}
          robotPose={robotPose}
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
