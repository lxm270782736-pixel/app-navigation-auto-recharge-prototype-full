import React, { useState } from 'react';
import { Card, Space, Button, Switch, Collapse, message, InputNumber } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';
import type { Pose, NavigationGoal, TaskConfig, NavigationActionConfig } from '@/types';
import { TaskConfigurationModal, TaskListView } from './TaskConfigurationModal';

const { Panel } = Collapse;

enum OperationMode {
  SET_GOAL = 'set_goal', // 设置目标点模式
}

export { OperationMode };

interface NavigationControlProps {
  robotPose: Pose | null;
  goalPose?: Pose;
  isNavigating: boolean;
  onNavigationStart: () => void;
  onNavigationStop: () => void;
  navigationStatus?: string;
  navigationFeedback?: {
    distance_to_goal?: number;
    progress?: number;
    eta?: number;
    current_task?: string;
  };
}

export const NavigationControl: React.FC<NavigationControlProps> = ({
  robotPose,
  goalPose,
  isNavigating,
  onNavigationStart,
  onNavigationStop,
  navigationStatus,
  navigationFeedback,
}) => {

  // 调试日志：监控 isNavigating 状态变化
  // useEffect(() => {
  //   console.log('[NavigationControl] isNavigating 状态变化:', isNavigating);
  //   console.log('[NavigationControl] navigationStatus:', navigationStatus);
  //   console.log('[NavigationControl] navigationFeedback:', navigationFeedback);
  // }, [isNavigating, navigationStatus, navigationFeedback]);

  // 任务配置
  const [tasks, setTasks] = useState<TaskConfig[]>([]);
  const [taskConfigModalVisible, setTaskConfigModalVisible] = useState(false);

  const handleSaveTasks = (newTasks: TaskConfig[]) => {
    setTasks(newTasks);
    setTaskConfigModalVisible(false);
    message.success(`已保存 ${newTasks.length} 个任务`);
  };

  // 导航参数配置
  const [actionConfig, setActionConfig] = useState<NavigationActionConfig>({
    use_default_config: true,
    safe_dist: 0.2,
    v_max: 0.5,
    w_max: 1.0,
    a_max: 0.5,
    dw_max: 1.0,
    is_holonomic: false,
    deaccelaration_dist: 0.5,
    deaccelaration_ratio: 0.5,
  });

  const handleStartNavigation = async () => {
    if (!goalPose) {
      message.error('请先设置目标点');
      return;
    }

    try {
      const goal: NavigationGoal = {
        pose: goalPose,
        tasks, // 使用任务配置面板的任务列表
        actionConfig, // 添加导航参数配置
      };

      // console.log('[NavigationControl] 开始导航，调用 onNavigationStart');
      onNavigationStart(); // 先设置状态
      await rosService.sendNavigationGoal(goal);
      // message.success('导航已开始'); // 移除立即提示，通过导航状态显示
    } catch (error) {
      message.error('导航失败');
      console.error('Navigation failed:', error);
      onNavigationStop(); // 失败时重置状态
    }
  };

  const handleStopNavigation = () => {
    rosService.cancelNavigation();
    // message.info('导航已取消'); // 移除立即提示，等待服务器响应
    onNavigationStop();
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
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
              请先在"定位服务管理"中启动定位模式
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
              请在地图上点击选择导航目标位置
            </div>
          )}

          {goalPose && (
            <div style={{ padding: '8px', background: '#f6ffed', borderRadius: '4px' }}>
              <div style={{ fontSize: '12px', color: '#52c41a', fontWeight: 'bold', marginBottom: '4px' }}>
                目标位姿
              </div>
              <div style={{ fontSize: '11px', color: '#666' }}>
                X: {goalPose.x.toFixed(2)} m | Y: {goalPose.y.toFixed(2)} m | θ:{' '}
                {((goalPose.theta * 180) / Math.PI).toFixed(1)}°
              </div>
            </div>
          )}

          {isNavigating ? (
            <Button
              danger
              size="middle"
              block
              icon={<StopOutlined />}
              onClick={handleStopNavigation}
            >
              停止导航
            </Button>
          ) : (
            <Button
              type="primary"
              size="middle"
              block
              icon={<PlayCircleOutlined />}
              onClick={handleStartNavigation}
              disabled={!robotPose || !goalPose}
            >
              开始导航
            </Button>
          )}

          {/* 导航状态 - 默认显示 */}
          <div style={{
            padding: '8px',
            background: isNavigating ? '#e6f7ff' : '#f5f5f5',
            borderRadius: '4px',
            border: isNavigating ? '1px solid #91d5ff' : '1px solid #d9d9d9'
          }}>
            <div style={{ fontSize: '12px', marginBottom: '6px' }}>
              <span style={{ color: '#666' }}>状态：</span>
              <span style={{ fontWeight: 'bold', color: isNavigating ? '#1890ff' : '#999' }}>
                {isNavigating ? (navigationStatus || 'ACTIVE') : 'IDLE'}
              </span>
            </div>

            {/* 进度条 - 仅在导航时显示 */}
            {isNavigating && navigationFeedback?.progress !== undefined && (
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>
                  进度：{(navigationFeedback.progress * 100).toFixed(1)}%
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '6px',
                    background: '#f0f0f0',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(navigationFeedback.progress * 100).toFixed(1)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #1890ff, #52c41a)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )}

            {/* 剩余距离和预计到达时间 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span>
                <span style={{ color: '#666' }}>剩余：</span>
                <span style={{ fontWeight: 'bold' }}>
                  {isNavigating && navigationFeedback?.distance_to_goal !== undefined
                    ? navigationFeedback.distance_to_goal.toFixed(2)
                    : '0.00'} m
                </span>
              </span>
              {isNavigating && navigationFeedback?.eta !== undefined && (
                <span>
                  <span style={{ color: '#666' }}>ETA：</span>
                  <span style={{ fontWeight: 'bold' }}>
                    {navigationFeedback.eta.toFixed(1)} s
                  </span>
                </span>
              )}
            </div>

            {/* 当前任务 - 仅在导航时显示 */}
            {isNavigating && navigationFeedback?.current_task && (
              <div style={{
                marginTop: '6px',
                paddingTop: '6px',
                borderTop: '1px dashed #91d5ff',
                fontSize: '11px'
              }}>
                <span style={{ color: '#666' }}>任务：</span>
                <span style={{ fontWeight: 'bold', color: '#52c41a' }}>
                  {navigationFeedback.current_task}
                </span>
              </div>
            )}
          </div>

          {/* 折叠面板 - 附加任务和导航参数 */}
          <Collapse
            ghost
            size="small"
            style={{ background: 'transparent' }}
          >
            <Panel
              header={<span style={{ fontSize: '12px' }}>附加任务</span>}
              key="tasks"
            >
              <TaskListView
                tasks={tasks}
                onConfigure={() => setTaskConfigModalVisible(true)}
              />
            </Panel>

            <Panel
              header={<span style={{ fontSize: '12px' }}><SettingOutlined /> 导航参数</span>}
              key="params"
            >
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px' }}>使用默认配置</span>
                  <Switch
                    size="small"
                    checked={actionConfig.use_default_config}
                    onChange={(checked) =>
                      setActionConfig({ ...actionConfig, use_default_config: checked })
                    }
                  />
                </div>

                {!actionConfig.use_default_config && (
                  <Collapse
                    ghost
                    size="small"
                    style={{ background: '#fafafa', borderRadius: '4px', marginTop: '8px' }}
                  >
                    <Panel header={<span style={{ fontSize: '11px' }}>速度与避障</span>} key="1">
                      <Space direction="vertical" style={{ width: '100%' }} size="small">
                        <div>
                          <div style={{ fontSize: '11px', marginBottom: '4px' }}>安全距离 (m)</div>
                          <InputNumber
                            min={0.1}
                            max={1.0}
                            step={0.05}
                            value={actionConfig.safe_dist}
                            onChange={(value) =>
                              setActionConfig({ ...actionConfig, safe_dist: value || 0.2 })
                            }
                            size="small"
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', marginBottom: '4px' }}>最大速度 (m/s)</div>
                          <InputNumber
                            min={0.1}
                            max={2.0}
                            step={0.1}
                            value={actionConfig.v_max}
                            onChange={(value) =>
                              setActionConfig({ ...actionConfig, v_max: value || 0.5 })
                            }
                            size="small"
                            style={{ width: '100%' }}
                          />
                              </div>
                        <div>
                          <div style={{ fontSize: '11px', marginBottom: '4px' }}>最大角速度 (rad/s)</div>
                          <InputNumber
                            min={0.1}
                            max={3.0}
                            step={0.1}
                            value={actionConfig.w_max}
                            onChange={(value) =>
                              setActionConfig({ ...actionConfig, w_max: value || 1.0 })
                            }
                            size="small"
                            style={{ width: '100%' }}
                          />
                        </div>
                      </Space>
                    </Panel>

                    <Panel header={<span style={{ fontSize: '11px' }}>加速度</span>} key="2">
                      <Space direction="vertical" style={{ width: '100%' }} size="small">
                        <div>
                          <div style={{ fontSize: '11px', marginBottom: '4px' }}>最大加速度 (m/s²)</div>
                          <InputNumber
                            min={0.1}
                            max={2.0}
                            step={0.1}
                            value={actionConfig.a_max}
                            onChange={(value) =>
                              setActionConfig({ ...actionConfig, a_max: value || 0.5 })
                            }
                            size="small"
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', marginBottom: '4px' }}>最大转向加速度 (rad/s²)</div>
                          <InputNumber
                            min={0.1}
                            max={3.0}
                            step={0.1}
                            value={actionConfig.dw_max}
                            onChange={(value) =>
                              setActionConfig({ ...actionConfig, dw_max: value || 1.0 })
                            }
                            size="small"
                            style={{ width: '100%' }}
                          />
                        </div>
                      </Space>
                    </Panel>

                    <Panel header={<span style={{ fontSize: '11px' }}>运动与减速</span>} key="3">
                      <Space direction="vertical" style={{ width: '100%' }} size="small">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '11px' }}>全向轮</span>
                          <Switch
                            size="small"
                            checked={actionConfig.is_holonomic}
                            onChange={(checked) =>
                              setActionConfig({ ...actionConfig, is_holonomic: checked })
                            }
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', marginBottom: '4px' }}>减速距离 (m)</div>
                          <InputNumber
                            min={0.1}
                            max={5.0}
                            step={0.1}
                            value={actionConfig.deaccelaration_dist}
                            onChange={(value) =>
                              setActionConfig({ ...actionConfig, deaccelaration_dist: value || 1.0 })
                            }
                            size="small"
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', marginBottom: '4px' }}>减速比例</div>
                          <InputNumber
                            min={0.1}
                            max={1.0}
                            step={0.05}
                            value={actionConfig.deaccelaration_ratio}
                            onChange={(value) =>
                              setActionConfig({ ...actionConfig, deaccelaration_ratio: value || 0.5 })
                            }
                            size="small"
                            style={{ width: '100%' }}
                          />
                        </div>
                      </Space>
                    </Panel>
                  </Collapse>
                )}
              </Space>
            </Panel>
          </Collapse>
        </Space>
      </Card>

      {/* 任务配置模态框 */}
      <TaskConfigurationModal
        visible={taskConfigModalVisible}
        tasks={tasks}
        onSave={handleSaveTasks}
        onCancel={() => setTaskConfigModalVisible(false)}
      />
    </div>
  );
};
