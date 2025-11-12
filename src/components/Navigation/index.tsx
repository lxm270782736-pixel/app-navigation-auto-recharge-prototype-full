import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, message, Radio, Checkbox, Space, Modal, InputNumber } from 'antd';
import {
  ArrowLeftOutlined,
  AimOutlined,
  EnvironmentOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { MapCanvas } from '@/components/common/MapCanvas';
import { rosService } from '@/services/ros';
import { mapStorageService } from '@/services/storage';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { MapData, Pose, NavigationGoal, TaskType, TaskConfig } from '@/types';

enum OperationMode {
  LOCALIZE = 'localize', // 定位模式
  SET_GOAL = 'set_goal', // 设置目标点模式
}

export const Navigation: React.FC = () => {
  const { mapId } = useParams<{ mapId: string }>();
  const navigate = useNavigate();
  const { connectionStatus } = useROS();

  const [mapData, setMapData] = useState<MapData | null>(null);
  const [robotPose, setRobotPose] = useState<Pose | undefined>();
  const [goalPose, setGoalPose] = useState<Pose | undefined>();
  const [isNavigating, setIsNavigating] = useState(false);
  const [operationMode, setOperationMode] = useState<OperationMode>(
    OperationMode.LOCALIZE
  );

  // 任务配置
  const [selectedTasks, setSelectedTasks] = useState<TaskType[]>([]);
  const [waitDuration, setWaitDuration] = useState(5);

  useEffect(() => {
    if (!mapId) {
      message.error('地图ID无效');
      navigate('/');
      return;
    }

    // 加载地图数据
    const map = mapStorageService.getMap(mapId);
    if (!map) {
      message.error('地图不存在');
      navigate('/');
      return;
    }

    setMapData(map);
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

  // 监听导航结果
  useEffect(() => {
    const handleNavigationResult = (data: { success: boolean; result: any }) => {
      console.log('[Navigation] 导航结果:', data);
      if (data.success) {
        message.success('导航成功！可以开始新一轮导航');
        // 重置导航状态，但保留目标点供参考
        setIsNavigating(false);
        // 如果想清除目标点，取消注释下一行
        // setGoalPose(undefined);
      } else {
        message.error('导航失败');
        setIsNavigating(false);
      }
    };

    rosService.on('navigation-result', handleNavigationResult);

    return () => {
      rosService.off('navigation-result', handleNavigationResult);
    };
  }, []);

  const handleMapClick = (x: number, y: number) => {
    if (operationMode === OperationMode.LOCALIZE) {
      // 设置初始位姿
      Modal.confirm({
        title: '设置初始位姿',
        content: '确认将机器人定位到此位置吗？',
        onOk: () => {
          const pose: Pose = { x, y, theta: 0 };
          rosService.setInitialPose(pose);
          setRobotPose(pose);
          message.success('初始位姿已设置');
          setOperationMode(OperationMode.SET_GOAL);
        },
      });
    } else if (operationMode === OperationMode.SET_GOAL) {
      // 设置目标点
      const pose: Pose = { x, y, theta: 0 };
      setGoalPose(pose);
      message.info('目标点已设置，请调整方向或直接开始导航');
    }
  };

  const handleStartNavigation = async () => {
    if (!goalPose) {
      message.error('请先设置目标点');
      return;
    }

    try {
      // 构建任务配置
      const tasks: TaskConfig[] = selectedTasks.map((taskType) => {
        const task: TaskConfig = { type: taskType };
        if (taskType === 'wait') {
          task.params = { duration: waitDuration };
        }
        return task;
      });

      const goal: NavigationGoal = {
        pose: goalPose,
        tasks,
      };

      setIsNavigating(true);
      await rosService.sendNavigationGoal(goal);
      message.success('导航已开始');
    } catch (error) {
      message.error('导航失败');
      console.error('Navigation failed:', error);
      setIsNavigating(false);
    }
  };

  const handleStopNavigation = () => {
    rosService.cancelNavigation();
    setIsNavigating(false);
    message.info('导航已取消');
  };

  const handleTaskChange = (checkedValues: any[]) => {
    setSelectedTasks(checkedValues);
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
        <div style={{ marginLeft: 'auto' }}>
          <Radio.Group
            value={operationMode}
            onChange={(e) => setOperationMode(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value={OperationMode.LOCALIZE}>
              <AimOutlined /> 定位模式
            </Radio.Button>
            <Radio.Button value={OperationMode.SET_GOAL}>
              <EnvironmentOutlined /> 设置目标点
            </Radio.Button>
          </Radio.Group>
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
          {/* 导航控制 */}
          <Card
            title="导航控制"
            size="small"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              {!robotPose && (
                <div
                  style={{
                    padding: '8px',
                    background: '#fff7e6',
                    border: '1px solid #ffd591',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  请先在地图上点击设置机器人初始位置
                </div>
              )}

              {robotPose && !goalPose && (
                <div
                  style={{
                    padding: '8px',
                    background: '#e6f7ff',
                    border: '1px solid #91d5ff',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  请切换到"设置目标点"模式，在地图上选择目标位置
                </div>
              )}

              {goalPose && (
                <div>
                  <p style={{ marginBottom: '4px', fontSize: '12px' }}>
                    <strong>目标位置:</strong>
                  </p>
                  <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>
                    X: {goalPose.x.toFixed(2)} m | Y: {goalPose.y.toFixed(2)} m
                  </p>
                </div>
              )}

              <Button
                type="primary"
                size="middle"
                block
                icon={<PlayCircleOutlined />}
                onClick={handleStartNavigation}
                disabled={!robotPose || !goalPose || isNavigating}
              >
                开始导航
              </Button>

              {isNavigating && (
                <Button
                  danger
                  size="middle"
                  block
                  icon={<StopOutlined />}
                  onClick={handleStopNavigation}
                >
                  停止导航
                </Button>
              )}
            </Space>
          </Card>

          {/* 附加任务 */}
          <Card
            title="附加任务"
            size="small"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
          >
            <Checkbox.Group
              style={{ width: '100%' }}
              onChange={handleTaskChange}
              value={selectedTasks}
            >
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <Checkbox value="wait" style={{ fontSize: '13px' }}>
                  到达后停留
                  {selectedTasks.includes('wait' as TaskType) && (
                    <div style={{ marginTop: '6px', marginLeft: '24px' }}>
                      <InputNumber
                        min={1}
                        max={60}
                        value={waitDuration}
                        onChange={(value) => setWaitDuration(value || 5)}
                        addonAfter="秒"
                        size="small"
                        style={{ width: '110px' }}
                      />
                    </div>
                  )}
                </Checkbox>

                <Checkbox value="trajectory" style={{ fontSize: '13px' }}>
                  执行预设轨迹
                </Checkbox>

                <Checkbox value="photo" style={{ fontSize: '13px' }}>
                  自动拍照
                </Checkbox>
              </Space>
            </Checkbox.Group>
          </Card>

          {/* 机器人状态 */}
          <Card
            title="机器人状态"
            size="small"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
          >
            {robotPose ? (
              <div style={{ fontSize: '12px' }}>
                <p style={{ margin: '4px 0' }}>X: {robotPose.x.toFixed(2)} m</p>
                <p style={{ margin: '4px 0' }}>Y: {robotPose.y.toFixed(2)} m</p>
                <p style={{ margin: '4px 0' }}>
                  朝向: {((robotPose.theta * 180) / Math.PI).toFixed(1)}°
                </p>
              </div>
            ) : (
              <p style={{ color: '#999', fontSize: '12px', margin: 0 }}>未定位</p>
            )}
          </Card>
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
          {operationMode === OperationMode.LOCALIZE ? (
            <div>
              <AimOutlined /> 点击地图设置机器人的初始位置
            </div>
          ) : (
            <div>
              <EnvironmentOutlined /> 点击地图选择导航目标点
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
