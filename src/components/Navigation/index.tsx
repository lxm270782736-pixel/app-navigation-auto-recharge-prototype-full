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
      '/amcl_pose',
      'geometry_msgs/PoseWithCovarianceStamped',
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
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
          返回
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px' }}>
        {/* 左侧：地图展示 */}
        <Card title={`地图: ${mapData.name}`}>
          <div style={{ marginBottom: '16px' }}>
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

          <div
            style={{
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '70vh',
            }}
          >
            <MapCanvas
              mapData={mapData}
              robotPose={robotPose}
              goalPose={goalPose}
              onMapClick={handleMapClick}
            />
          </div>

          <div style={{ marginTop: '16px', color: '#999', fontSize: '14px' }}>
            {operationMode === OperationMode.LOCALIZE ? (
              <p>
                <AimOutlined /> 点击地图设置机器人的初始位置
              </p>
            ) : (
              <p>
                <EnvironmentOutlined /> 点击地图选择导航目标点
              </p>
            )}
          </div>
        </Card>

        {/* 右侧：控制面板 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 导航控制 */}
          <Card title="导航控制">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {!robotPose && (
                <div
                  style={{
                    padding: '12px',
                    background: '#fff7e6',
                    border: '1px solid #ffd591',
                    borderRadius: '4px',
                  }}
                >
                  请先在地图上点击设置机器人初始位置
                </div>
              )}

              {robotPose && !goalPose && (
                <div
                  style={{
                    padding: '12px',
                    background: '#e6f7ff',
                    border: '1px solid #91d5ff',
                    borderRadius: '4px',
                  }}
                >
                  请切换到"设置目标点"模式，在地图上选择目标位置
                </div>
              )}

              {goalPose && (
                <div>
                  <p style={{ marginBottom: '8px' }}>
                    <strong>目标位置:</strong>
                  </p>
                  <p style={{ fontSize: '12px', color: '#666' }}>
                    X: {goalPose.x.toFixed(2)} m<br />
                    Y: {goalPose.y.toFixed(2)} m
                  </p>
                </div>
              )}

              <Button
                type="primary"
                size="large"
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
                  size="large"
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
          <Card title="附加任务">
            <Checkbox.Group
              style={{ width: '100%' }}
              onChange={handleTaskChange}
              value={selectedTasks}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Checkbox value="wait">
                  到达后停留
                  {selectedTasks.includes('wait' as TaskType) && (
                    <div style={{ marginTop: '8px', marginLeft: '24px' }}>
                      <InputNumber
                        min={1}
                        max={60}
                        value={waitDuration}
                        onChange={(value) => setWaitDuration(value || 5)}
                        addonAfter="秒"
                        style={{ width: '120px' }}
                      />
                    </div>
                  )}
                </Checkbox>

                <Checkbox value="trajectory">执行预设轨迹</Checkbox>

                <Checkbox value="photo">自动拍照</Checkbox>
              </Space>
            </Checkbox.Group>
          </Card>

          {/* 机器人状态 */}
          <Card title="机器人状态" size="small">
            {robotPose ? (
              <div style={{ fontSize: '12px' }}>
                <p>X: {robotPose.x.toFixed(2)} m</p>
                <p>Y: {robotPose.y.toFixed(2)} m</p>
                <p>朝向: {((robotPose.theta * 180) / Math.PI).toFixed(1)}°</p>
              </div>
            ) : (
              <p style={{ color: '#999' }}>未定位</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
