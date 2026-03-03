import React, { useState, useEffect } from "react";
import {
  Card,
  Space,
  Button,
  Switch,
  Collapse,
  message,
  InputNumber,
  Spin,
  Radio,
} from "antd";
import {
  PlayCircleOutlined,
  StopOutlined,
  SettingOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  AimOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { rosService } from "@/services/ros";
import { ConnectionStatus } from "@/types";
import type {
  Pose,
  NavigationGoal,
  TaskConfig,
  NavigationActionConfig,
} from "@/types";
import { TaskConfigurationModal, TaskListView } from "./TaskConfigurationModal";
import { navigationStorageService } from "@/services/navigationStorage";

enum OperationMode {
  SET_GOAL = "set_goal", // 设置目标点模式
}

// 导航模式
enum NavigationMode {
  OBSTACLE_AVOIDANCE = "obstacle_avoidance", // 避障导航模式
  LOCAL_NAVIGATION = "local_navigation", // 局部导航模式
}

export { OperationMode };

interface NavigationControlProps {
  robotPose: Pose | null;
  goalPose?: Pose;
  isNavigating: boolean;
  onNavigationStart: () => void;
  onNavigationStop: () => void;
  onStopWaypointNavigation?: () => void; // 停止多点巡航回调
  navigationStatus?: string;
  navigationFeedback?: {
    distance_to_goal?: number;
    progress?: number;
    eta?: number;
    current_task?: string;
  };
  connectionStatus?: ConnectionStatus;
  waypointMode?: boolean; // 是否为多点巡航模式
  waypoints?: Pose[]; // 路径点列表
  onStartWaypointNavigation?: () => void; // 开始巡航回调
}

export const NavigationControl: React.FC<NavigationControlProps> = ({
  robotPose,
  goalPose,
  isNavigating,
  onNavigationStart,
  onNavigationStop,
  onStopWaypointNavigation,
  navigationStatus,
  navigationFeedback,
  connectionStatus = ConnectionStatus.DISCONNECTED,
  waypointMode = false,
  waypoints = [],
  onStartWaypointNavigation,
}) => {
  // 调试日志：监控开始导航按钮的disable条件
  // useEffect(() => {
  //   const isDisabled = !robotPose || (waypointMode ? waypoints.length === 0 : !goalPose);

  //   console.log('[NavigationControl] 开始导航按钮状态检查:');
  //   console.log('  robotPose:', robotPose);
  //   console.log('  !robotPose:', !robotPose);
  //   console.log('  waypointMode:', waypointMode);
  //   if (waypointMode) {
  //     console.log('  waypoints.length:', waypoints.length);
  //     console.log('  waypoints.length === 0:', waypoints.length === 0);
  //   } else {
  //     console.log('  goalPose:', goalPose);
  //     console.log('  !goalPose:', !goalPose);
  //   }
  //   console.log('  isDisabled (按钮灰色):', isDisabled);
  // }, [robotPose, waypointMode, waypoints, goalPose]);

  // 导航模式选择已保存导航配置
  const [navigationMode, setNavigationMode] = useState<NavigationMode>(
    NavigationMode.OBSTACLE_AVOIDANCE
  );

  // 底盘控制模式
  const [chassisControlType, setChassisControlType] = useState<
    "twist" | "joy" | null
  >(null);

  // 初始化时获取底盘控制模式
  useEffect(() => {
    const initChassisControlType = async () => {
      try {
        const currentType = await rosService.getChassisControlType();
        setChassisControlType(currentType);
      } catch (error) {
        console.warn("Failed to fetch chassis control type:", error);
      }
    };

    initChassisControlType();

    // 监听底盘控制类型变化事件
    const handleChassisTypeChange = (data: any) => {
      console.log(
        "[NavigationControl] Chassis control type changed:",
        data.controlType
      );
      setChassisControlType(data.controlType);
    };

    rosService.on("chassis-control-type-changed", handleChassisTypeChange);

    return () => {
      rosService.off("chassis-control-type-changed", handleChassisTypeChange);
    };
  }, []);

  // 任务配置
  const [tasks, setTasks] = useState<TaskConfig[]>([]);
  const [taskConfigModalVisible, setTaskConfigModalVisible] = useState(false);

  const handleSaveTasks = (newTasks: TaskConfig[]) => {
    setTasks(newTasks);
    setTaskConfigModalVisible(false);
    message.success(`已保存 ${newTasks.length} 个任务`);
  };

  // 是否有正在执行的action
  const [hasActiveAction, setHasActiveAction] = useState(false);

  // 是否存在保存的导航配置
  const [hasSavedConfig, setHasSavedConfig] = useState(false);

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

  // 初始化时加载保存的导航配置并监听导航事件
  useEffect(() => {
    let isMounted = true;

    const initializeConfig = async () => {
      try {
        // 1. 加载之前保存的配置
        const savedConfig =
          await navigationStorageService.loadNavigationConfig();
        if (isMounted && savedConfig) {
          // 只有单点导航时才设置 hasActiveAction
          // 多点导航由 Navigation 组件通过 isNavigating props 控制
          if (savedConfig.navigationType === "single") {
            // 如果检测到保存的单点导航配置，表明导航可能还在执行中
            // 设置 hasActiveAction = true 来禁用"开始导航"按钮
            setHasActiveAction(true);

            setNavigationMode(savedConfig.navigationMode as any);
            setTasks(savedConfig.tasks || []);
            setActionConfig(savedConfig.actionConfig || { use_default_config: true });
            setHasSavedConfig(true);
            robotPose = savedConfig.goalPose || null;
            message.warning(
              "检测到导航正在执行或未完成，按钮已禁用。请等待导航完成或刷新页面重试。"
            );
          }
        }
      } catch (error) {
        console.error("加载导航配置失败:", error);
      }
    };

    initializeConfig();
  }, []);


  // 监听导航事件（feedback、status、result），追踪action执行状态
  useEffect(() => {
    // 监听导航反馈（feedback），说明有action在执行
    const handleNavigationFeedback = (feedback: any) => {
      console.debug("[NavigationControl] 收到导航反馈，标记action正在执行:", feedback);
      // 只要有反馈消息，说明正在有action在执行
      setHasActiveAction(true);
    };

    // 监听导航状态（status）
    const handleNavigationStatus = (status: any) => {
      console.debug("[NavigationControl] 导航状态:", status);
      // 状态更新，可以在需要时使用
    };

    // 监听导航完成事件（result），清除action执行标记
    const handleNavigationResult = (result: any) => {
      console.log("[NavigationControl] 导航完成，清除action标记:", result);
      setHasActiveAction(false);
    };

    rosService.on("navigation-feedback", handleNavigationFeedback);
    rosService.on("navigation-status", handleNavigationStatus);
    rosService.on("navigation-result", handleNavigationResult);

    return () => {
      rosService.off("navigation-feedback", handleNavigationFeedback);
      rosService.off("navigation-status", handleNavigationStatus);
      rosService.off("navigation-result", handleNavigationResult);
    };
  }, []);

  const handleStartNavigation = async () => {
    if (!goalPose) {
      message.error("请先设置目标点");
      return;
    }

    // 检查是否有正在执行的action
    if (hasActiveAction) {
      message.error("还有正在执行的导航action，请等待完成或取消后再开始新导航");
      return;
    }

    try {
      onNavigationStart(); // 先设置状态

      if (navigationMode === NavigationMode.LOCAL_NAVIGATION) {
        // 局部导航模式：发送到 /small_range_goal 话题
        rosService.sendLocalNavigationGoal(goalPose);
        message.success("局部导航目标已发送");

        // 局部导航模式没有反馈，立即重置导航状态
        setTimeout(() => {
          onNavigationStop();
        }, 1000);
      } else {
        // 避障导航模式：使用现有的 Action 接口
        const goal: NavigationGoal = {
          pose: goalPose,
          tasks, // 使用任务配置面板的任务列表
          actionConfig, // 添加导航参数配置
        };

        rosService.sendNavigationGoal(goal);
        // message.success('导航已开始'); // 移除立即提示，通过导航状态显示
      }
    } catch (error) {
      message.error("导航失败");
      console.error("Navigation failed:", error);
      onNavigationStop(); // 失败时重置状态
    }
  };

  const handleStopNavigation = () => {
    // 多点巡航模式下，调用专门的停止函数清除定时器
    if (waypointMode && onStopWaypointNavigation) {
      onStopWaypointNavigation();
      // 多点模式停止后，也要清除action执行标记和已保存配置标记
      setHasActiveAction(false);
      setHasSavedConfig(false);
    } else {
      // 单点导航模式
      rosService.cancelNavigation();
      // message.info('导航已取消'); // 移除立即提示，等待服务器响应
      onNavigationStop();
      // 导航停止时，清除action执行标记
      setHasActiveAction(false);
    }
  };

  // 清除保存的导航配置
  const handleClearNavigationConfig = async () => {
    try {
      await navigationStorageService.clearNavigationConfig();
      setHasSavedConfig(false); // 更新状态，隐藏提示
      message.success("已清除保存的导航配置");
    } catch (error) {
      console.error("清除导航配置失败:", error);
      message.error("清除导航配置失败");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* 导航控制 */}
      <Card
        title="导航控制"
        size="small"
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size="small">
          {/* ROS 未连接提示 */}
          {connectionStatus !== ConnectionStatus.CONNECTED && (
            <div
              style={{
                padding: "8px",
                background: "#fff7e6",
                border: "1px solid #ffd591",
                borderRadius: "4px",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              ⚠️ ROS 未连接，请先连接 ROS
            </div>
          )}

          {/* 等待定位数据提示 */}
          {connectionStatus === ConnectionStatus.CONNECTED && !robotPose && (
            <div
              style={{
                padding: "8px",
                background: "#e6f7ff",
                border: "1px solid #91d5ff",
                borderRadius: "4px",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Spin
                indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />}
                size="small"
              />
              等待定位数据...（如未启动定位，请在"定位服务管理"中启动）
            </div>
          )}

          {/* 设置目标点提示 */}
          {robotPose && !goalPose && (
            <div
              style={{
                padding: "8px",
                background: "#f6ffed",
                border: "1px solid #b7eb8f",
                borderRadius: "4px",
                fontSize: "12px",
              }}
            >
              ✓ 已获取定位数据，请在地图上点击选择导航目标位置
            </div>
          )}

          {goalPose && (
            <div
              style={{
                padding: "8px",
                background: "#f6ffed",
                borderRadius: "4px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  color: "#52c41a",
                  fontWeight: "bold",
                  marginBottom: "4px",
                }}
              >
                目标位姿
              </div>
              <div style={{ fontSize: "11px", color: "#666" }}>
                X: {goalPose.x.toFixed(2)} m | Y: {goalPose.y.toFixed(2)} m | θ:{" "}
                {((goalPose.theta * 180) / Math.PI).toFixed(1)}°
              </div>
            </div>
          )}

          {/* 导航模式选择 - 仅在单点导航模式下显示 */}
          {!isNavigating && !waypointMode && (
            <div>
              <div style={{ fontSize: 13, marginBottom: 8, color: "#666" }}>
                导航模式：
              </div>
              <Radio.Group
                value={navigationMode}
                onChange={(e) => setNavigationMode(e.target.value)}
                style={{ width: "100%" }}
                buttonStyle="solid"
              >
                <Radio.Button
                  value={NavigationMode.OBSTACLE_AVOIDANCE}
                  style={{ width: "50%", textAlign: "center" }}
                >
                  <ThunderboltOutlined /> 避障
                </Radio.Button>
                <Radio.Button
                  value={NavigationMode.LOCAL_NAVIGATION}
                  style={{ width: "50%", textAlign: "center" }}
                >
                  <AimOutlined /> 局部
                </Radio.Button>
              </Radio.Group>
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
              {waypointMode ? "停止巡航" : "停止导航"}
            </Button>
          ) : (
            <>
              <Button
                type="primary"
                size="middle"
                block
                icon={<PlayCircleOutlined />}
                onClick={
                  waypointMode
                    ? onStartWaypointNavigation
                    : handleStartNavigation
                }
                disabled={
                  !robotPose ||
                  (waypointMode ? waypoints.length === 0 : !goalPose) ||
                  chassisControlType === "joy" ||
                  hasActiveAction
                }
              >
                {waypointMode ? "开始巡航" : "开始导航"}
              </Button>
              <div style={{ fontSize: 12, color: "#666", paddingLeft: 8 }}>
                💡{" "}
                {waypointMode
                  ? `将按序导航到 ${waypoints.length} 个路径点`
                  : navigationMode === NavigationMode.OBSTACLE_AVOIDANCE
                  ? "全局路径规划，支持避障和任务"
                  : "短距离快速导航，无避障规划"}
              </div>

              {/* 手柄模式下的禁用提示 */}
              {chassisControlType === "joy" && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#ff4d4f",
                    paddingLeft: 8,
                    marginTop: 4,
                  }}
                >
                  ⚠️ 手柄模式下不允许开始导航，请切换到自动模式
                </div>
              )}

              {/* 清除保存的导航配置按钮 - 当检测到有保存的配置时显示 */}
              {hasSavedConfig && hasActiveAction && (
                <Button
                  danger
                  size="small"
                  block
                  icon={<DeleteOutlined />}
                  onClick={handleClearNavigationConfig}
                  type="text"
                  style={{ marginTop: 8 }}
                >
                  清除保存的导航配置
                </Button>
              )}
            </>
          )}

          {/* 导航状态 - 默认显示 */}
          <div
            style={{
              padding: "8px",
              background: isNavigating ? "#e6f7ff" : "#f5f5f5",
              borderRadius: "4px",
              border: isNavigating ? "1px solid #91d5ff" : "1px solid #d9d9d9",
            }}
          >
            <div style={{ fontSize: "12px", marginBottom: "6px" }}>
              <span style={{ color: "#666" }}>状态：</span>
              <span
                style={{
                  fontWeight: "bold",
                  color: isNavigating ? "#1890ff" : "#999",
                }}
              >
                {isNavigating ? navigationStatus || "ACTIVE" : "IDLE"}
              </span>
            </div>

            {/* 进度条 - 仅在导航时显示 */}
            {isNavigating && navigationFeedback?.progress !== undefined && (
              <div style={{ marginBottom: "6px" }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#666",
                    marginBottom: "2px",
                  }}
                >
                  进度：{(navigationFeedback.progress * 100).toFixed(1)}%
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "6px",
                    background: "#f0f0f0",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(navigationFeedback.progress * 100).toFixed(
                        1
                      )}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #1890ff, #52c41a)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            )}

            {/* 剩余距离和预计到达时间 */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "11px",
              }}
            >
              <span>
                <span style={{ color: "#666" }}>剩余：</span>
                <span style={{ fontWeight: "bold" }}>
                  {isNavigating &&
                  navigationFeedback?.distance_to_goal !== undefined
                    ? navigationFeedback.distance_to_goal.toFixed(2)
                    : "0.00"}{" "}
                  m
                </span>
              </span>
              {isNavigating && navigationFeedback?.eta !== undefined && (
                <span>
                  <span style={{ color: "#666" }}>ETA：</span>
                  <span style={{ fontWeight: "bold" }}>
                    {navigationFeedback.eta.toFixed(1)} s
                  </span>
                </span>
              )}
            </div>

            {/* 当前任务 - 仅在导航时显示 */}
            {isNavigating && navigationFeedback?.current_task && (
              <div
                style={{
                  marginTop: "6px",
                  paddingTop: "6px",
                  borderTop: "1px dashed #91d5ff",
                  fontSize: "11px",
                }}
              >
                <span style={{ color: "#666" }}>任务：</span>
                <span style={{ fontWeight: "bold", color: "#52c41a" }}>
                  {navigationFeedback.current_task}
                </span>
              </div>
            )}
          </div>

          {/* 折叠面板 - 附加任务和导航参数（仅在单点导航模式下显示） */}
          {!waypointMode && (
            <Collapse
              ghost
              size="small"
              style={{ background: 'transparent' }}
              items={[
                {
                  key: 'tasks',
                  label: <span style={{ fontSize: '12px' }}>附加任务</span>,
                  children: (
                    <TaskListView
                      tasks={tasks}
                      onConfigure={() => setTaskConfigModalVisible(true)}
                    />
                  ),
                },
                {
                  key: 'params',
                  label: <span style={{ fontSize: '12px' }}><SettingOutlined /> 导航参数</span>,
                  children: (
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
                          items={[
                            {
                              key: '1',
                              label: <span style={{ fontSize: '11px' }}>速度与避障</span>,
                              children: (
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
                              ),
                            },
                            {
                              key: '2',
                              label: <span style={{ fontSize: '11px' }}>加速度</span>,
                              children: (
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
                              ),
                            },
                            {
                              key: '3',
                              label: <span style={{ fontSize: '11px' }}>运动与减速</span>,
                              children: (
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
                              ),
                            },
                          ]}
                        />
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          )}
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
