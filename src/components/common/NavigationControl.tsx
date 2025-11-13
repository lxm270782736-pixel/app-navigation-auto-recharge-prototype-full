import React, { useState, useEffect } from 'react';
import { Card, Space, Button, Radio, Checkbox, InputNumber, Switch, Collapse, message } from 'antd';
import {
  AimOutlined,
  EnvironmentOutlined,
  PlayCircleOutlined,
  StopOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';
import type { Pose, NavigationGoal, TaskType, TaskConfig, NavigationActionConfig } from '@/types';

const { Panel } = Collapse;

enum OperationMode {
  LOCALIZE = 'localize', // 手动重定位
  SET_GOAL = 'set_goal', // 设置目标点模式
}

export { OperationMode };

interface NavigationControlProps {
  robotPose: Pose | null;
  goalPose?: Pose;
  isNavigating: boolean;
  operationMode: OperationMode;
  onOperationModeChange: (mode: OperationMode) => void;
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
  operationMode,
  onOperationModeChange,
  onNavigationStart,
  onNavigationStop,
  navigationStatus,
  navigationFeedback,
}) => {

  // 调试日志：监控 isNavigating 状态变化
  useEffect(() => {
    console.log('[NavigationControl] isNavigating 状态变化:', isNavigating);
    console.log('[NavigationControl] navigationStatus:', navigationStatus);
    console.log('[NavigationControl] navigationFeedback:', navigationFeedback);
  }, [isNavigating, navigationStatus, navigationFeedback]);

  // 任务配置
  const [selectedTasks, setSelectedTasks] = useState<TaskType[]>([]);
  const [waitDuration, setWaitDuration] = useState(5);

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

  const handleTaskChange = (checkedValues: any[]) => {
    setSelectedTasks(checkedValues);
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
        actionConfig, // 添加导航参数配置
      };

      console.log('[NavigationControl] 开始导航，调用 onNavigationStart');
      onNavigationStart(); // 先设置状态
      message.success('导航已开始'); // 移除立即提示，通过导航状态显示
      await rosService.sendNavigationGoal(goal);
      
    } catch (error) {
      message.error('导航失败');
      console.error('Navigation failed:', error);
      onNavigationStop(); // 失败时重置状态
    }
  };

  const handleStopNavigation = () => {
    rosService.cancelNavigation();
    message.info('导航已取消'); // 移除立即提示，等待服务器响应
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
      {/* 操作模式选择 */}
      <Card size="small" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <Radio.Group
          value={operationMode}
          onChange={(e) => onOperationModeChange(e.target.value)}
          buttonStyle="solid"
          size="small"
          style={{ width: '100%' }}
        >
          <Radio.Button value={OperationMode.LOCALIZE} style={{ width: '50%', textAlign: 'center' }}>
            <AimOutlined /> 手动重定位
          </Radio.Button>
          <Radio.Button value={OperationMode.SET_GOAL} style={{ width: '50%', textAlign: 'center' }}>
            <EnvironmentOutlined /> 设置目标点
          </Radio.Button>
        </Radio.Group>
      </Card>

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
                <strong>目标位姿:</strong>
              </p>
              <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>
                X: {goalPose.x.toFixed(2)} m | Y: {goalPose.y.toFixed(2)} m | θ:{' '}
                {((goalPose.theta * 180) / Math.PI).toFixed(1)}°
              </p>
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
        </Space>
      </Card>

      {/* 导航状态信息 */}
      <Card
        title="导航状态"
        size="small"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          {/* 状态 */}
          <div>
            <span style={{ fontSize: '12px', color: '#666' }}>状态：</span>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: isNavigating ? '#1890ff' : '#999' }}>
              {isNavigating ? (navigationStatus || 'ACTIVE') : 'IDLE'}
            </span>
          </div>

          {/* 进度条 - 仅在导航时显示 */}
          {isNavigating && navigationFeedback?.progress !== undefined && (
            <div>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                进度：{(navigationFeedback.progress * 100).toFixed(1)}%
              </div>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  background: '#f0f0f0',
                  borderRadius: '4px',
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

          {/* 剩余距离 */}
          <div>
            <span style={{ fontSize: '12px', color: '#666' }}>剩余距离：</span>
            <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
              {isNavigating && navigationFeedback?.distance_to_goal !== undefined
                ? navigationFeedback.distance_to_goal.toFixed(2)
                : '0.00'}{' '}
              m
            </span>
          </div>

          {/* 预计到达 - 仅在导航时显示 */}
          {isNavigating && navigationFeedback?.eta !== undefined && (
            <div>
              <span style={{ fontSize: '12px', color: '#666' }}>预计到达：</span>
              <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
                {navigationFeedback.eta.toFixed(1)} 秒
              </span>
            </div>
          )}

          {/* 当前任务 - 仅在导航时显示 */}
          {isNavigating && navigationFeedback?.current_task && (
            <div>
              <span style={{ fontSize: '12px', color: '#666' }}>当前任务：</span>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#52c41a' }}>
                {navigationFeedback.current_task}
              </span>
            </div>
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

      {/* 导航参数 */}
      <Card
        title={
          <span>
            <SettingOutlined /> 导航参数
          </span>
        }
        size="small"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px' }}>使用默认配置</span>
            <Switch
              checked={actionConfig.use_default_config}
              onChange={(checked) =>
                setActionConfig({ ...actionConfig, use_default_config: checked })
              }
              size="small"
            />
          </div>

          {!actionConfig.use_default_config && (
            <Collapse
              ghost
              size="small"
              style={{ background: '#fafafa', borderRadius: '4px' }}
            >
              <Panel header="速度与避障参数" key="1" style={{ fontSize: '12px' }}>
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <div>
                    <div style={{ fontSize: '11px', marginBottom: '4px' }}>最小安全距离 (m)</div>
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

              <Panel header="加速度参数" key="2" style={{ fontSize: '12px' }}>
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

              <Panel header="运动模式与减速策略" key="3" style={{ fontSize: '12px' }}>
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <div>
                    <div style={{ fontSize: '11px', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>全向运动</span>
                      <Switch
                        checked={actionConfig.is_holonomic}
                        onChange={(checked) =>
                          setActionConfig({ ...actionConfig, is_holonomic: checked })
                        }
                        size="small"
                      />
                    </div>
                    <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>
                      开启=全向运动，关闭=差速运动
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', marginBottom: '4px' }}>减速策略距离 (m)</div>
                    <InputNumber
                      min={0.1}
                      max={2.0}
                      step={0.1}
                      value={actionConfig.deaccelaration_dist}
                      onChange={(value) =>
                        setActionConfig({ ...actionConfig, deaccelaration_dist: value || 0.5 })
                      }
                      size="small"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', marginBottom: '4px' }}>减速策略系数</div>
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
      </Card>

      {/* 机器人状态 */}
      <Card
        title="机器人状态"
        size="small"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
      >
        {robotPose ? (
          <div style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
            X: {robotPose.x.toFixed(2)}m | Y: {robotPose.y.toFixed(2)}m | θ:{' '}
            {((robotPose.theta * 180) / Math.PI).toFixed(1)}°
          </div>
        ) : (
          <p style={{ color: '#999', fontSize: '12px', margin: 0 }}>未定位</p>
        )}
      </Card>
    </div>
  );
};
