import React, { useState, useEffect } from 'react';
import { Card, Button, Space, message, Descriptions, Tag, Modal, Steps } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  PoweroffOutlined,
  AimOutlined,
  SyncOutlined,
  WarningOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';

interface LocalizationManagerProps {
  onModeChange?: (mode: string) => void;
}

type LocalizationMode = 'idle' | 'mapping' | 'localization' | 'localization_auto' | 'obstacle_avoidance';

export const LocalizationManager: React.FC<LocalizationManagerProps> = ({ onModeChange }) => {
  const [currentMode, setCurrentMode] = useState<LocalizationMode>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('未启动');
  const [loading, setLoading] = useState<string | null>(null);
  const [localizationModalVisible, setLocalizationModalVisible] = useState(false);
  const [mappingModalVisible, setMappingModalVisible] = useState(false);
  const [mappingStep, setMappingStep] = useState(0); // 0: 待启动, 1: 启动遥控器中, 2: 遥控器已启动, 3: 启动建图节点中, 4: 完成
  const [mappingStepStatus, setMappingStepStatus] = useState<('wait' | 'process' | 'finish' | 'error')[]>(['wait', 'wait']);

  // 订阅定位状态
  useEffect(() => {
    const unsubscribe = rosService.subscribeLocalizationStatus((status) => {
      console.log('Localization status:', status);
      if (status && status.data) {
        setStatusMessage(status.data);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleStartMapping = () => {
    // 打开建图启动交互框
    setMappingModalVisible(true);
    setMappingStep(0);
    setMappingStepStatus(['wait', 'wait']);
  };

  const executeMappingStartup = async () => {
    try {
      // 步骤 1: 启动遥控器
      setMappingStep(1);
      setMappingStepStatus(['process', 'wait']);

      const joystickResult = await rosService.startJoystick();
      if (!joystickResult.success) {
        setMappingStepStatus(['error', 'wait']);
        message.error(joystickResult.message || '启动遥控器失败');
        return;
      }

      setMappingStepStatus(['finish', 'wait']);
      message.success('遥控器已启动');

      // 延迟一下，让用户看到第一步完成
      await new Promise(resolve => setTimeout(resolve, 500));

      // 步骤 2: 启动建图节点
      setMappingStep(2);
      setMappingStepStatus(['finish', 'process']);

      const mappingResult = await rosService.startMapping();
      if (!mappingResult.success) {
        setMappingStepStatus(['finish', 'error']);
        message.error(mappingResult.message || '启动建图模式失败');
        return;
      }

      setMappingStepStatus(['finish', 'finish']);
      setCurrentMode('mapping');
      setStatusMessage(mappingResult.message);
      message.success('建图模式已启动');
      onModeChange?.('mapping');

      // 延迟关闭 Modal
      setTimeout(() => {
        setMappingModalVisible(false);
      }, 1500);
    } catch (error) {
      message.error('启动建图失败');
      console.error(error);
      setMappingStepStatus(prev => {
        const newStatus = [...prev];
        if (mappingStep === 1) newStatus[0] = 'error';
        if (mappingStep === 2) newStatus[1] = 'error';
        return newStatus as ('wait' | 'process' | 'finish' | 'error')[];
      });
    }
  };

  const handleStartLocalization = () => {
    setLocalizationModalVisible(true);
  };

  const handleLocalizationManual = async () => {
    setLocalizationModalVisible(false);
    setLoading('localization');
    try {
      const result = await rosService.startLocalization();
      if (result.success) {
        setCurrentMode('localization');
        setStatusMessage(result.message);
        message.success('定位模式已启动（手动）');
        message.info('请在地图上点击设置初始位置');
        onModeChange?.('localization');
      } else {
        message.error(result.message || '启动定位模式失败');
      }
    } catch (error) {
      message.error('启动定位模式失败');
      console.error(error);
    } finally {
      setLoading(null);
    }
  };

  const handleLocalizationAuto = async () => {
    setLocalizationModalVisible(false);
    setLoading('localization_auto');
    try {
      const result = await rosService.startLocalizationAuto();
      if (result.success) {
        setCurrentMode('localization_auto');
        setStatusMessage(result.message);
        message.success('定位模式已启动（自动）');
        onModeChange?.('localization_auto');
      } else {
        message.error(result.message || '启动自动定位模式失败');
      }
    } catch (error) {
      message.error('启动自动定位模式失败');
      console.error(error);
    } finally {
      setLoading(null);
    }
  };

  const handleStartObstacleAvoidance = async () => {
    setLoading('obstacle_avoidance');
    try {
      const result = await rosService.startObstacleAvoidance();
      if (result.success) {
        setCurrentMode('obstacle_avoidance');
        setStatusMessage(result.message);
        message.success('纯避障模式已启动');
        onModeChange?.('obstacle_avoidance');
      } else {
        message.error(result.message || '启动避障模式失败');
      }
    } catch (error) {
      message.error('启动避障模式失败');
      console.error(error);
    } finally {
      setLoading(null);
    }
  };

  const handleStop = async () => {
    setLoading('stop');
    try {
      const result = await rosService.stopLocalization();
      if (result.success) {
        setCurrentMode('idle');
        setStatusMessage(result.message);
        message.success('定位服务已停止');
        onModeChange?.('idle');
      } else {
        message.error(result.message || '停止定位服务失败');
      }
    } catch (error) {
      message.error('停止定位服务失败');
      console.error(error);
    } finally {
      setLoading(null);
    }
  };

  const handleShutdown = () => {
    Modal.confirm({
      title: '关闭定位服务',
      icon: <WarningOutlined />,
      content: '确定要关闭整个定位服务吗？这将停止所有节点并退出服务。',
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setLoading('shutdown');
        try {
          const result = await rosService.shutdownLocalization();
          if (result.success) {
            setCurrentMode('idle');
            setStatusMessage('服务已关闭');
            message.success('定位服务已关闭');
            onModeChange?.('shutdown');
          } else {
            message.error(result.message || '关闭定位服务失败');
          }
        } catch (error) {
          message.error('关闭定位服务失败');
          console.error(error);
        } finally {
          setLoading(null);
        }
      },
    });
  };

  const getModeTag = () => {
    const modeConfig = {
      idle: { color: 'default', text: '未启动' },
      mapping: { color: 'blue', text: '建图模式' },
      localization: { color: 'green', text: '定位模式（手动）' },
      localization_auto: { color: 'cyan', text: '定位模式（自动）' },
      obstacle_avoidance: { color: 'orange', text: '纯避障模式' },
    };

    const config = modeConfig[currentMode] || modeConfig.idle;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  return (
    <Card
      size="small"
      title="定位服务管理"
      style={{ marginBottom: 12 }}
      extra={getModeTag()}
    >
      <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
        <Descriptions.Item label="当前模式">{getModeTag()}</Descriptions.Item>
        <Descriptions.Item label="状态信息">{statusMessage}</Descriptions.Item>
      </Descriptions>

      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <Space wrap style={{ width: '100%' }}>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleStartMapping}
            loading={loading === 'mapping'}
            disabled={currentMode !== 'idle'}
            size="small"
          >
            建图模式
          </Button>

          <Button
            type="primary"
            icon={<AimOutlined />}
            onClick={handleStartLocalization}
            loading={loading === 'localization' || loading === 'localization_auto'}
            disabled={currentMode !== 'idle'}
            size="small"
          >
            定位模式
          </Button>

          <Button
            icon={<WarningOutlined />}
            onClick={handleStartObstacleAvoidance}
            loading={loading === 'obstacle_avoidance'}
            disabled={currentMode !== 'idle'}
            size="small"
          >
            纯避障
          </Button>
        </Space>

        <Space style={{ width: '100%' }}>
          <Button
            danger
            icon={<StopOutlined />}
            onClick={handleStop}
            loading={loading === 'stop'}
            disabled={currentMode === 'idle'}
            size="small"
          >
            停止当前模式
          </Button>

          <Button
            danger
            icon={<PoweroffOutlined />}
            onClick={handleShutdown}
            loading={loading === 'shutdown'}
            size="small"
          >
            关闭所有服务
          </Button>
        </Space>
      </Space>

      <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
        <div>💡 <strong>建图模式</strong>: 创建新地图</div>
        <div>💡 <strong>定位模式</strong>: 支持手动/自动初始化</div>
        <div>💡 <strong>纯避障</strong>: 只输出局部动态地图，不保存信息</div>
      </div>

      {/* 建图启动流程Modal */}
      <Modal
        title="启动建图模式"
        open={mappingModalVisible}
        onCancel={() => {
          if (mappingStep === 0 || mappingStepStatus[1] === 'finish' || mappingStepStatus.includes('error')) {
            setMappingModalVisible(false);
          }
        }}
        footer={
          mappingStep === 0 ? (
            <Space>
              <Button onClick={() => setMappingModalVisible(false)}>取消</Button>
              <Button type="primary" onClick={executeMappingStartup}>
                开始执行
              </Button>
            </Space>
          ) : (
            mappingStepStatus[1] === 'finish' ? (
              <Button type="primary" onClick={() => setMappingModalVisible(false)}>
                关闭
              </Button>
            ) : mappingStepStatus.includes('error') ? (
              <Space>
                <Button onClick={() => setMappingModalVisible(false)}>关闭</Button>
                <Button type="primary" onClick={() => {
                  setMappingStep(0);
                  setMappingStepStatus(['wait', 'wait']);
                  executeMappingStartup();
                }}>
                  重试
                </Button>
              </Space>
            ) : null
          )
        }
        width={500}
        closable={mappingStep === 0 || mappingStepStatus[1] === 'finish' || mappingStepStatus.includes('error')}
        maskClosable={false}
      >
        <div style={{ padding: '24px 0' }}>
          {mappingStep === 0 ? (
            <div>
              <p style={{ marginBottom: 16, color: '#666', fontSize: 14 }}>
                启动建图模式需要按以下步骤执行：
              </p>
              <Steps
                direction="vertical"
                size="small"
                current={-1}
                items={[
                  {
                    title: '启动遥控器',
                    description: '启动机器人遥控系统，使机器人可以通过手柄控制移动',
                  },
                  {
                    title: '启动建图节点',
                    description: '启动SLAM建图算法，开始构建环境地图',
                  },
                ]}
              />
            </div>
          ) : (
            <div>
              <Steps
                direction="vertical"
                size="small"
                current={mappingStep - 1}
                items={[
                  {
                    title: '启动遥控器',
                    status: mappingStepStatus[0],
                    description: '启动机器人遥控系统，使机器人可以通过手柄控制移动',
                    icon: mappingStepStatus[0] === 'process' ? <LoadingOutlined /> :
                      mappingStepStatus[0] === 'finish' ? <CheckCircleOutlined /> :
                      mappingStepStatus[0] === 'error' ? <CloseCircleOutlined /> : undefined,
                  },
                  {
                    title: '启动建图节点',
                    status: mappingStepStatus[1],
                    description: '启动SLAM建图算法，开始构建环境地图',
                    icon: mappingStepStatus[1] === 'process' ? <LoadingOutlined /> :
                      mappingStepStatus[1] === 'finish' ? <CheckCircleOutlined /> :
                      mappingStepStatus[1] === 'error' ? <CloseCircleOutlined /> : undefined,
                  },
                ]}
              />
              {mappingStepStatus[1] === 'finish' && (
                <div style={{
                  marginTop: 24,
                  padding: 16,
                  background: '#f0f9ff',
                  borderRadius: 4,
                  border: '1px solid #91d5ff',
                }}>
                  <div style={{ color: '#0958d9', fontWeight: 500, marginBottom: 8 }}>
                    ✅ 建图模式已成功启动
                  </div>
                  <div style={{ color: '#666', fontSize: 13 }}>
                    请使用遥控器控制机器人在环境中移动，系统将自动构建地图
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* 定位模式选择Modal */}
      <Modal
        title="启动定位模式"
        open={localizationModalVisible}
        onCancel={() => setLocalizationModalVisible(false)}
        footer={null}
        width={400}
      >
        <div style={{ padding: '16px 0' }}>
          <p style={{ marginBottom: 16, color: '#666' }}>请选择定位初始化方式：</p>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Button
              type="primary"
              block
              size="large"
              icon={<AimOutlined />}
              onClick={handleLocalizationManual}
              loading={loading === 'localization'}
            >
              手动初始化
            </Button>
            <div style={{ fontSize: 12, color: '#999', paddingLeft: 8 }}>
              需要在地图上手动点击设置机器人的初始位置
            </div>

            <Button
              type="primary"
              block
              size="large"
              icon={<SyncOutlined />}
              onClick={handleLocalizationAuto}
              loading={loading === 'localization_auto'}
              style={{ marginTop: 8 }}
            >
              自动初始化
            </Button>
            <div style={{ fontSize: 12, color: '#999', paddingLeft: 8 }}>
              系统自动进行重定位，无需手动设置
            </div>
          </Space>
        </div>
      </Modal>
    </Card>
  );
};
