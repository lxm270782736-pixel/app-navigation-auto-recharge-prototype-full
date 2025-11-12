import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, List, Modal, Empty, message, Radio, Checkbox, Space, InputNumber } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  AimOutlined,
  EnvironmentOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { mapStorageService } from '@/services/storage';
import { rosService } from '@/services/ros';
import { MapCanvas } from '@/components/common/MapCanvas';
import type { MapData, Pose, NavigationGoal, TaskType, TaskConfig } from '@/types';
import dayjs from 'dayjs';

enum OperationMode {
  LOCALIZE = 'localize', // 定位模式
  SET_GOAL = 'set_goal', // 设置目标点模式
}

export const MapManager: React.FC = () => {
  const navigate = useNavigate();
  const [maps, setMaps] = useState<MapData[]>([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedMap, setSelectedMap] = useState<MapData | null>(null);
  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [robotPose, setRobotPose] = useState<Pose | undefined>();
  const [isConnected, setIsConnected] = useState(false);

  // 导航控制相关状态
  const [goalPose, setGoalPose] = useState<Pose | undefined>();
  const [isNavigating, setIsNavigating] = useState(false);
  const [operationMode, setOperationMode] = useState<OperationMode>(
    OperationMode.LOCALIZE
  );

  // 任务配置
  const [selectedTasks, setSelectedTasks] = useState<TaskType[]>([]);
  const [waitDuration, setWaitDuration] = useState(5);

  useEffect(() => {
    loadMaps();

    // 监听 ROS 连接状态
    const handleConnection = (data: { connected: boolean }) => {
      setIsConnected(data.connected);
      if (!data.connected) {
        setCurrentMap(null);
      }
    };

    rosService.on('connection', handleConnection);

    // 检查当前连接状态
    if (rosService['ros']) {
      setIsConnected(true);
    }

    return () => {
      rosService.off('connection', handleConnection);
    };
  }, []);

  // 订阅实时地图数据
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = rosService.subscribeMap((mapData) => {
      setCurrentMap(mapData);
    });

    return () => {
      unsubscribe();
    };
  }, [isConnected]);

  // 订阅机器人位置
  useEffect(() => {
    if (!isConnected) {
      setRobotPose(undefined);
      return;
    }

    console.log('[MapManager] 开始订阅机器人位置...');

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

        const pose = {
          x: position.x,
          y: position.y,
          theta,
        };

        console.log('[MapManager] 收到机器人位置:', pose);
        setRobotPose(pose);
      }
    );

    return () => {
      console.log('[MapManager] 取消订阅机器人位置');
      unsubscribe();
    };
  }, [isConnected]);

  // 监听导航结果
  useEffect(() => {
    const handleNavigationResult = (data: { success: boolean; result: any }) => {
      console.log('[MapManager] 导航结果:', data);
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

  const loadMaps = () => {
    const allMaps = mapStorageService.getAllMaps();
    setMaps(allMaps);
  };

  const handleCreateMap = () => {
    navigate('/mapping');
  };

  const handleSelectMap = (map: MapData) => {
    navigate(`/navigation/${map.id}`);
  };

  const handleDeleteMap = (map: MapData) => {
    setSelectedMap(map);
    setDeleteModalVisible(true);
  };

  const confirmDelete = () => {
    if (selectedMap) {
      mapStorageService.deleteMap(selectedMap.id);
      message.success('地图已删除');
      loadMaps();
      setDeleteModalVisible(false);
      setSelectedMap(null);
    }
  };

  // 导航控制函数
  const handleMapClick = (x: number, y: number) => {
    if (!currentMap) return;

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

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
        >
          返回主页
        </Button>
      </div>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '28px' }}>地图管理</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={handleCreateMap}
        >
          新建地图
        </Button>
      </div>

      {/* 当前实时地图显示 - 带导航控制 */}
      {currentMap && (
        <Card
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>当前实时地图</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Radio.Group
                  value={operationMode}
                  onChange={(e) => setOperationMode(e.target.value)}
                  buttonStyle="solid"
                  size="small"
                >
                  <Radio.Button value={OperationMode.LOCALIZE}>
                    <AimOutlined /> 定位模式
                  </Radio.Button>
                  <Radio.Button value={OperationMode.SET_GOAL}>
                    <EnvironmentOutlined /> 设置目标点
                  </Radio.Button>
                </Radio.Group>
                <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#52c41a' }}>
                  ● 实时更新
                </span>
              </div>
            </div>
          }
          style={{ marginBottom: '24px' }}
          bodyStyle={{ padding: '16px' }}
        >
          <div style={{
            height: '600px',
            background: '#f0f0f0',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <MapCanvas
              mapData={currentMap}
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
                maxHeight: 'calc(600px - 32px)',
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

            {/* 操作提示 */}
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
          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '13px' }}>
            <span>尺寸: {currentMap.width} × {currentMap.height} px</span>
            <span>分辨率: {currentMap.resolution.toFixed(3)} m/px</span>
            <span style={{ color: '#999' }}>💡 支持滚轮缩放、中键拖动平移</span>
          </div>
        </Card>
      )}

      <h2 style={{ marginBottom: '16px', fontSize: '20px' }}>已保存的地图</h2>

      {maps.length === 0 ? (
        <Empty
          description="暂无已保存的地图，点击上方按钮创建新地图"
          style={{ marginTop: '60px' }}
        />
      ) : (
        <List
          grid={{
            gutter: 16,
            xs: 1,
            sm: 2,
            md: 3,
            lg: 3,
            xl: 4,
            xxl: 4,
          }}
          dataSource={maps}
          renderItem={(map) => (
            <List.Item>
              <Card
                hoverable
                cover={
                  <div
                    style={{
                      height: '200px',
                      background: '#f0f0f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                    onClick={() => handleSelectMap(map)}
                  >
                    {map.thumbnail ? (
                      <img
                        src={map.thumbnail}
                        alt={map.name}
                        style={{ maxWidth: '100%', maxHeight: '100%' }}
                      />
                    ) : (
                      <span style={{ color: '#999' }}>无缩略图</span>
                    )}
                  </div>
                }
                actions={[
                  <DeleteOutlined
                    key="delete"
                    onClick={() => handleDeleteMap(map)}
                  />,
                ]}
              >
                <Card.Meta
                  title={map.name}
                  description={dayjs(map.createdAt).format('YYYY-MM-DD HH:mm')}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
                  {map.width} × {map.height} px
                </div>
              </Card>
            </List.Item>
          )}
        />
      )}

      <Modal
        title="删除地图"
        open={deleteModalVisible}
        onOk={confirmDelete}
        onCancel={() => setDeleteModalVisible(false)}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>确定要删除地图 "{selectedMap?.name}" 吗？此操作不可恢复。</p>
      </Modal>
    </div>
  );
};
