import React, { useState, useEffect } from 'react';
import { Modal, Space, Radio, Collapse, Switch, InputNumber, Button, message } from 'antd';
import {
  SettingOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import type { Waypoint, TaskConfig, NavigationActionConfig } from '@/types';
import { TaskConfigurationModal, TaskListView } from './TaskConfigurationModal';

interface WaypointConfigModalProps {
  visible: boolean;
  waypoint: Waypoint | null;
  waypointIndex: number;
  onSave: (waypoint: Waypoint) => void;
  onCancel: () => void;
}

export const WaypointConfigModal: React.FC<WaypointConfigModalProps> = ({
  visible,
  waypoint,
  waypointIndex,
  onSave,
  onCancel,
}) => {
  // 位姿编辑
  const [poseX, setPoseX] = useState(0);
  const [poseY, setPoseY] = useState(0);
  const [poseTheta, setPoseTheta] = useState(0); // 弧度

  // 任务配置
  const [tasks, setTasks] = useState<TaskConfig[]>([]);
  const [taskConfigModalVisible, setTaskConfigModalVisible] = useState(false);

  // 导航模式
  const [navigationMode, setNavigationMode] = useState<'obstacle_avoidance' | 'local_navigation'>(
    'obstacle_avoidance'
  );

  // 导航参数配置
  const [useDefaultConfig, setUseDefaultConfig] = useState(true);
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

  // 当waypoint改变时更新状态
  useEffect(() => {
    if (waypoint) {
      setPoseX(waypoint.pose.x);
      setPoseY(waypoint.pose.y);
      setPoseTheta(waypoint.pose.theta);
      setTasks(waypoint.tasks || []);
      setNavigationMode(waypoint.navigationMode || 'obstacle_avoidance');
      setUseDefaultConfig(waypoint.actionConfig?.use_default_config ?? true);
      if (waypoint.actionConfig) {
        setActionConfig(waypoint.actionConfig);
      }
    }
  }, [waypoint]);

  const handleSave = () => {
    if (!waypoint) return;

    const updatedWaypoint: Waypoint = {
      ...waypoint,
      pose: {
        x: poseX,
        y: poseY,
        theta: poseTheta,
      },
      tasks,
      navigationMode,
      actionConfig: {
        ...actionConfig,
        use_default_config: useDefaultConfig,
      },
    };

    onSave(updatedWaypoint);
    message.success(`路径点 ${waypointIndex + 1} 配置已保存`);
  };

  const handleSaveTasks = (newTasks: TaskConfig[]) => {
    setTasks(newTasks);
    setTaskConfigModalVisible(false);
    message.success(`已保存 ${newTasks.length} 个任务`);
  };

  if (!waypoint) return null;

  return (
    <>
      <Modal
        title={
          <div style={{ fontSize: '16px' }}>
            <SettingOutlined style={{ marginRight: 8 }} />
            路径点 {waypointIndex + 1} 配置
          </div>
        }
        open={visible}
        onOk={handleSave}
        onCancel={onCancel}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* 位姿信息 - 可编辑 */}
          <div
            style={{
              padding: '12px',
              background: '#f5f5f5',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: 12 }}>位姿信息</div>
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '12px', color: '#666', width: '60px' }}>X 坐标 (m):</span>
                <InputNumber
                  value={poseX}
                  onChange={(value) => setPoseX(value || 0)}
                  step={0.1}
                  precision={2}
                  style={{ flex: 1 }}
                  size="small"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '12px', color: '#666', width: '60px' }}>Y 坐标 (m):</span>
                <InputNumber
                  value={poseY}
                  onChange={(value) => setPoseY(value || 0)}
                  step={0.1}
                  precision={2}
                  style={{ flex: 1 }}
                  size="small"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '12px', color: '#666', width: '60px' }}>方向 (°):</span>
                <InputNumber
                  value={Math.round((poseTheta * 180) / Math.PI)}
                  onChange={(value) => setPoseTheta(((value || 0) * Math.PI) / 180)}
                  step={15}
                  min={-180}
                  max={180}
                  style={{ flex: 1 }}
                  size="small"
                />
              </div>
            </Space>
          </div>

          {/* 导航模式选择 */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: 8 }}>
              <ThunderboltOutlined style={{ marginRight: 4 }} />
              导航模式
            </div>
            <Radio.Group
              value={navigationMode}
              onChange={(e) => setNavigationMode(e.target.value)}
              buttonStyle="solid"
              style={{ width: '100%' }}
            >
              <Radio.Button value="obstacle_avoidance" style={{ width: '50%', textAlign: 'center' }}>
                避障导航
              </Radio.Button>
              <Radio.Button value="local_navigation" style={{ width: '50%', textAlign: 'center' }}>
                局部导航
              </Radio.Button>
            </Radio.Group>
            <div style={{ fontSize: '12px', color: '#8c8c8c', marginTop: 4 }}>
              {navigationMode === 'obstacle_avoidance'
                ? '全局路径规划，支持避障'
                : '短距离快速导航，无避障规划'}
            </div>
          </div>

          {/* 任务配置 */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 500 }}>
                <UnorderedListOutlined style={{ marginRight: 4 }} />
                到达后执行任务 ({tasks.length})
              </span>
              <Button
                type="primary"
                size="small"
                onClick={() => setTaskConfigModalVisible(true)}
              >
                配置任务
              </Button>
            </div>
            {tasks.length > 0 ? (
              <div
                style={{
                  maxHeight: '150px',
                  overflowY: 'auto',
                  border: '1px solid #f0f0f0',
                  borderRadius: '4px',
                }}
              >
                <TaskListView tasks={tasks} onConfigure={() => setTaskConfigModalVisible(true)} />
              </div>
            ) : (
              <div
                style={{
                  padding: '12px',
                  background: '#fafafa',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#8c8c8c',
                  textAlign: 'center',
                }}
              >
                到达此路径点后不执行任务
              </div>
            )}
          </div>

          {/* 导航参数配置 */}
          {navigationMode === 'obstacle_avoidance' && (
            <Collapse
              ghost
              items={[
                {
                  key: '1',
                  label: (
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>
                      <SettingOutlined style={{ marginRight: 4 }} />
                      高级参数配置
                    </span>
                  ),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size="small">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontSize: '12px' }}>使用默认配置</span>
                        <Switch
                          checked={useDefaultConfig}
                          onChange={setUseDefaultConfig}
                          size="small"
                        />
                      </div>

                      {!useDefaultConfig && (
                        <div
                          style={{
                            padding: '12px',
                            background: '#fafafa',
                            borderRadius: '4px',
                          }}
                        >
                          <Space direction="vertical" style={{ width: '100%' }} size="small">
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px' }}>安全距离 (m)</span>
                              <InputNumber
                                size="small"
                                min={0.1}
                                max={1.0}
                                step={0.1}
                                value={actionConfig.safe_dist}
                                onChange={(v) =>
                                  setActionConfig({ ...actionConfig, safe_dist: v || 0.2 })
                                }
                                style={{ width: 80 }}
                              />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px' }}>最大线速度 (m/s)</span>
                              <InputNumber
                                size="small"
                                min={0.1}
                                max={2.0}
                                step={0.1}
                                value={actionConfig.v_max}
                                onChange={(v) =>
                                  setActionConfig({ ...actionConfig, v_max: v || 0.5 })
                                }
                                style={{ width: 80 }}
                              />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px' }}>最大角速度 (rad/s)</span>
                              <InputNumber
                                size="small"
                                min={0.1}
                                max={3.0}
                                step={0.1}
                                value={actionConfig.w_max}
                                onChange={(v) =>
                                  setActionConfig({ ...actionConfig, w_max: v || 1.0 })
                                }
                                style={{ width: 80 }}
                              />
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <span style={{ fontSize: '12px' }}>全向移动</span>
                              <Switch
                                checked={actionConfig.is_holonomic}
                                onChange={(checked) =>
                                  setActionConfig({ ...actionConfig, is_holonomic: checked })
                                }
                                size="small"
                              />
                            </div>
                          </Space>
                        </div>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </Space>
      </Modal>

      {/* 任务配置Modal */}
      <TaskConfigurationModal
        visible={taskConfigModalVisible}
        tasks={tasks}
        onSave={handleSaveTasks}
        onCancel={() => setTaskConfigModalVisible(false)}
      />
    </>
  );
};
