import React, { useState, useEffect } from 'react';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus, Pose } from '@/types';
import { Card, Button, Space, message, Modal, Tag, Descriptions, Radio } from 'antd';
import {
  AimOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';

interface SimpleLocalizationControlProps {
  onModeChange?: (mode: string) => void;
  onRelocalizationStart?: () => void; // 开始重定位时的回调
  robotPose?: Pose; // 机器人实时位置
}

type LocalizationMode = 'idle' | 'localization' | 'localization_auto';

export const SimpleLocalizationControl: React.FC<SimpleLocalizationControlProps> = ({ onModeChange, onRelocalizationStart, robotPose }) => {
  const { connectionStatus } = useROS();
  const [currentMode, setCurrentMode] = useState<LocalizationMode>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('未启动');
  const [loading, setLoading] = useState<string | null>(null);
  const [failureModalVisible, setFailureModalVisible] = useState(false);
  const [failureMessage, setFailureMessage] = useState('');
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [lastLocalizationType, setLastLocalizationType] = useState<'manual' | 'auto'>('auto'); // 默认自动
  const [selectedRelocMode, setSelectedRelocMode] = useState<'auto' | 'manual'>('auto'); // 默认选中自动
  const [switchingModalVisible, setSwitchingModalVisible] = useState(false); // 模式切换中Modal
  const [waitingForInitialPoseModalVisible, setWaitingForInitialPoseModalVisible] = useState(false); // 等待用户点击地图Modal

  // 订阅后端定位模式状态 /localization/mode (std_msgs/Int32)
  // 0: obstacle, 1: mapping, 2: localization, 3: idle
  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    const unsubscribe = rosService.subscribeTopic<{ data: number }>(
      '/localization/mode',
      'std_msgs/Int32',
      (msg) => {
        const modeValue = msg.data;
        console.debug('[定位控制] 收到后端模式状态:', modeValue);

        // 映射后端模式值到前端状态
        // 0: obstacle -> idle (暂时映射，前端没有obstacle模式显示)
        // 1: mapping -> 不处理（由建图界面管理）
        // 2: localization -> localization 或 localization_auto
        // 3: idle -> idle
        if (modeValue === 3) {
          setCurrentMode('idle');
          setStatusMessage('未启动');
        } else if (modeValue === 2) {
          // 收到定位模式状态
          console.debug('[定位控制] 定位模式已启动');

          // 定位模式 - 根据上次选择的类型设置状态
          if (lastLocalizationType === 'manual') {
            setCurrentMode('localization');
            setStatusMessage('定位模式（手动）');
          } else {
            setCurrentMode('localization_auto');
            setStatusMessage('定位模式（自动）');
          }
        } else if (modeValue === 1) {
          // 建图模式 - 不在此组件处理
          console.debug('[定位控制] 后端处于建图模式');
        } else if (modeValue === 0) {
          // 避障模式 - 暂时映射到 idle
          setCurrentMode('idle');
          setStatusMessage('避障模式');
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [connectionStatus, lastLocalizationType]);

  const handleLocalizationManual = async () => {
    setLoading('localization');
    setLastLocalizationType('manual');
    setStatusMessage('启动定位模式...');

    try {
      // 1. 通知父组件进入重定位模式（让地图可以点击设置初始位置）
      onRelocalizationStart?.();

      // 2. 显示"定位模式切换中"Modal，2秒后自动关闭并显示操作提示Modal
      setSwitchingModalVisible(true);
      setTimeout(() => {
        setSwitchingModalVisible(false);
        // Modal关闭后，显示等待用户操作的确认弹窗
        setWaitingForInitialPoseModalVisible(true);
      }, 2000);

      console.log('[重定位] 调用 startLocalization 服务，等待用户点击地图...');

      // 3. 调用 startLocalization 服务（会阻塞等待 /initialpose 话题）
      // 这个调用会等待用户在地图上点击并发布 /initialpose 后，后端完成重定位才返回
      const result = await rosService.startLocalization();

      console.log('[重定位] 服务返回结果:', result);

      // 4. 关闭等待操作的Modal（如果还在显示）
      setWaitingForInitialPoseModalVisible(false);

      // 5. 服务返回后，根据结果处理
      if (result.success) {
        // 定位成功 - 显示成功Modal
        setSuccessModalVisible(true);
        onModeChange?.('localization');
      } else {
        // 定位失败 - 显示失败Modal
        setCurrentMode('idle');
        setStatusMessage('定位失败（手动）');
        setFailureMessage(result.message || '初始位置设置失败，请重试');
        setFailureModalVisible(true);
      }
    } catch (error) {
      message.error('启动重定位模式失败');
      console.error(error);
      setCurrentMode('idle');
      setStatusMessage('启动失败');
      setWaitingForInitialPoseModalVisible(false);
    } finally {
      setLoading(null);
    }
  };

  const handleLocalizationAuto = async () => {
    setLoading('localization_auto');
    setLastLocalizationType('auto');
    setStatusMessage('定位中（自动）...');

    // 显示切换中弹窗，2秒后自动关闭
    setSwitchingModalVisible(true);
    setTimeout(() => {
      setSwitchingModalVisible(false);
    }, 2000);

    try {
      const result = await rosService.startLocalizationAuto();

      // 服务返回后，根据结果显示成功/失败Modal
      if (result.success) {
        // 定位成功
        setSuccessModalVisible(true);
        onModeChange?.('localization_auto');
      } else {
        // 定位失败
        setCurrentMode('idle');
        setStatusMessage('定位失败（自动）');
        setFailureMessage(result.message || '定位失败，请重试');
        setFailureModalVisible(true);
      }
    } catch (error) {
      message.error('启动自动定位模式失败');
      console.error(error);
      setCurrentMode('idle');
      setStatusMessage('定位失败');
    } finally {
      setLoading(null);
    }
  };

  const handleRetryLocalization = () => {
    setFailureModalVisible(false);
    if (lastLocalizationType === 'manual') {
      handleLocalizationManual();
    } else {
      handleLocalizationAuto();
    }
  };

  const handleStartRelocalization = () => {
    if (selectedRelocMode === 'auto') {
      handleLocalizationAuto();
    } else {
      handleLocalizationManual();
    }
  };

  const getModeTag = () => {
    const modeConfig = {
      idle: { color: 'default', text: '未启动' },
      localization: { color: 'green', text: '定位模式（手动）' },
      localization_auto: { color: 'cyan', text: '定位模式（自动）' },
    };

    const config = modeConfig[currentMode] || modeConfig.idle;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  return (
    <Card
      size="small"
      title="定位控制"
      style={{ marginBottom: 12 }}
      extra={getModeTag()}
    >
      <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
        <Descriptions.Item label="当前模式">{getModeTag()}</Descriptions.Item>
        <Descriptions.Item label="状态信息">{statusMessage}</Descriptions.Item>
        <Descriptions.Item label="机器人位置">
          {robotPose ? (
            <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
              <div>X: {robotPose.x.toFixed(3)} m</div>
              <div>Y: {robotPose.y.toFixed(3)} m</div>
              <div>θ: {((robotPose.theta * 180) / Math.PI).toFixed(1)}°</div>
            </div>
          ) : (
            <span style={{ color: '#999' }}>未获取</span>
          )}
        </Descriptions.Item>
      </Descriptions>

      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* 模式选择 */}
        <div>
          <div style={{ fontSize: 13, marginBottom: 8, color: '#666' }}>重定位模式：</div>
          <Radio.Group
            value={selectedRelocMode}
            onChange={(e) => setSelectedRelocMode(e.target.value)}
            disabled={loading !== null}
            style={{ width: '100%' }}
            buttonStyle="solid"
          >
            <Radio.Button value="auto" style={{ width: '50%', textAlign: 'center' }}>
              <SyncOutlined /> 自动
            </Radio.Button>
            <Radio.Button value="manual" style={{ width: '50%', textAlign: 'center' }}>
              <AimOutlined /> 手动
            </Radio.Button>
          </Radio.Group>
        </div>

        {/* 开始重定位按钮 */}
        <Button
          type="primary"
          icon={selectedRelocMode === 'auto' ? <SyncOutlined /> : <AimOutlined />}
          onClick={handleStartRelocalization}
          loading={loading !== null}
          disabled={loading !== null}
          size="middle"
          block
        >
          {loading !== null
            ? `${selectedRelocMode === 'auto' ? '自动' : '手动'}定位中...`
            : `开始${selectedRelocMode === 'auto' ? '自动' : '手动'}重定位`}
        </Button>

        <div style={{ fontSize: 12, color: '#666', paddingLeft: 8 }}>
          💡 {loading !== null
            ? '定位过程约需10秒，请等待完成'
            : selectedRelocMode === 'auto'
              ? '自动模式：系统自动搜索机器人位置'
              : '手动模式：需在地图点击初始位置'}
        </div>
      </Space>

      {/* 定位模式切换中Modal */}
      <Modal
        title="定位模式切换中"
        open={switchingModalVisible}
        centered
        closable={false}
        footer={null}
        width={420}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <SyncOutlined spin style={{ fontSize: '48px', color: '#1890ff' }} />
            <div style={{ fontSize: '16px', fontWeight: 500 }}>
              {lastLocalizationType === 'manual'
                ? '正在切换到手动定位模式'
                : '正在切换到自动定位模式'}
            </div>
            <div style={{ fontSize: '14px', color: '#666' }}>
              {lastLocalizationType === 'manual'
                ? '请在地图上点击机器人的当前位置'
                : '系统正在自动搜索机器人位置，请稍候...'}
            </div>

            {/* 手动模式显示操作步骤 */}
            {lastLocalizationType === 'manual' && (
              <div style={{
                marginTop: '16px',
                padding: '16px',
                background: '#f0f5ff',
                borderRadius: '4px',
                textAlign: 'left'
              }}>
                <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.8' }}>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>📍 操作步骤：</div>
                  <div>1. 在地图上找到机器人当前位置</div>
                  <div>2. 点击地图设置初始位置</div>
                  <div>3. 拖拽调整机器人朝向</div>
                  <div>4. 系统将自动完成初始化</div>
                </div>
              </div>
            )}

            {/* 自动模式显示提示 */}
            {lastLocalizationType === 'auto' && (
              <div style={{
                marginTop: '16px',
                padding: '16px',
                background: '#f0f5ff',
                borderRadius: '4px',
                textAlign: 'left'
              }}>
                <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.8' }}>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>⏳ 正在进行：</div>
                  <div>• 全局定位算法运行中</div>
                  <div>• 分析激光雷达数据</div>
                  <div>• 匹配地图特征点</div>
                  <div>• 预计耗时：10-15秒</div>
                </div>
              </div>
            )}
          </Space>
        </div>
      </Modal>

      {/* 定位成功Modal */}
      <Modal
        title="定位成功"
        open={successModalVisible}
        centered
        onCancel={() => setSuccessModalVisible(false)}
        footer={
          <Button type="primary" onClick={() => setSuccessModalVisible(false)}>
            确定
          </Button>
        }
        width={420}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />
          </div>
          <div style={{ fontSize: 16, marginBottom: 16, textAlign: 'center', fontWeight: 500 }}>
            定位成功完成！
          </div>
          <div style={{
            marginBottom: 16,
            padding: 16,
            background: '#f6ffed',
            borderRadius: 4,
            border: '1px solid #b7eb8f',
          }}>
            <div style={{ color: '#389e0d', fontSize: 14, marginBottom: 8 }}>
              <strong>✅ 机器人位置已成功确定</strong>
            </div>
            <div style={{ color: '#666', fontSize: 13 }}>
              机器人已在地图中完成定位，定位模式将持续运行直到关闭。
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#666' }}>
            <div style={{ marginBottom: 8 }}>💡 下一步操作：</div>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li>点击地图设置目标导航点</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* 定位失败Modal */}
      <Modal
        title="定位失败"
        open={failureModalVisible}
        centered
        onCancel={() => setFailureModalVisible(false)}
        footer={
          <Space>
            <Button onClick={() => setFailureModalVisible(false)}>取消</Button>
            {lastLocalizationType === 'auto' && (
              <Button
                onClick={() => {
                  setFailureModalVisible(false);
                  setSelectedRelocMode('manual');
                  message.info('已切换到手动模式，请再次点击"开始手动重定位"按钮');
                }}
              >
                切换手动模式
              </Button>
            )}
            <Button type="primary" onClick={handleRetryLocalization}>
              重试
            </Button>
          </Space>
        }
        width={450}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <CloseCircleOutlined style={{ fontSize: 48, color: '#ff4d4f' }} />
          </div>
          <div style={{ fontSize: 16, marginBottom: 16, textAlign: 'center', fontWeight: 500 }}>
            {lastLocalizationType === 'auto' ? '自动定位失败' : '手动定位失败'}
          </div>
          <div style={{ marginBottom: 16, padding: 12, background: '#fff2f0', borderRadius: 4, border: '1px solid #ffccc7' }}>
            <div style={{ color: '#cf1322', fontSize: 14 }}>
              <strong>失败原因：</strong>{failureMessage}
            </div>
          </div>

          {lastLocalizationType === 'auto' && (
            <div style={{
              marginBottom: 16,
              padding: 12,
              background: '#fff7e6',
              borderRadius: 4,
              border: '1px solid #ffd591'
            }}>
              <div style={{ color: '#d46b08', fontSize: 14, marginBottom: 8 }}>
                <strong>💡 建议切换到手动模式</strong>
              </div>
              <div style={{ color: '#666', fontSize: 13 }}>
                自动定位失败可能是因为环境特征不明显，建议切换到手动模式，在地图上手动指定机器人当前位置。
              </div>
            </div>
          )}

          <div style={{ fontSize: 13, color: '#666' }}>
            <div style={{ marginBottom: 8 }}>💡 其他建议操作：</div>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li>检查机器人是否在地图覆盖范围内</li>
              <li>确保激光雷达工作正常</li>
              {lastLocalizationType === 'manual' && <li>尝试切换到自动定位模式</li>}
              <li>点击"重试"按钮再次尝试定位</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* 等待用户设置初始位置Modal */}
      <Modal
        title={
          <div style={{ fontSize: 18, fontWeight: 600, color: '#1890ff' }}>
            <AimOutlined style={{ marginRight: 8 }} />
            请设置机器人初始位置
          </div>
        }
        open={waitingForInitialPoseModalVisible}
        centered
        closable={false}
        footer={
          <Button
            type="primary"
            size="large"
            onClick={() => setWaitingForInitialPoseModalVisible(false)}
            style={{ width: '100%' }}
          >
            我知道了，开始设置
          </Button>
        }
        width={500}
      >
        <div style={{ padding: '24px 0' }}>
          <div style={{
            marginBottom: 24,
            padding: 20,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 8,
            textAlign: 'center',
            color: 'white'
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🗺️</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              定位模式已就绪，等待您的操作
            </div>
          </div>

          <div style={{
            padding: 20,
            background: '#f0f5ff',
            borderRadius: 8,
            marginBottom: 20
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#1890ff' }}>
              📍 操作步骤：
            </div>
            <div style={{ fontSize: 14, color: '#666', lineHeight: 2 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
                <span style={{
                  display: 'inline-block',
                  width: 24,
                  height: 24,
                  lineHeight: '24px',
                  textAlign: 'center',
                  background: '#1890ff',
                  color: 'white',
                  borderRadius: '50%',
                  marginRight: 12,
                  flexShrink: 0,
                  fontWeight: 600
                }}>1</span>
                <span>在地图上找到机器人当前所在位置</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
                <span style={{
                  display: 'inline-block',
                  width: 24,
                  height: 24,
                  lineHeight: '24px',
                  textAlign: 'center',
                  background: '#1890ff',
                  color: 'white',
                  borderRadius: '50%',
                  marginRight: 12,
                  flexShrink: 0,
                  fontWeight: 600
                }}>2</span>
                <span>点击该位置设置初始位置</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
                <span style={{
                  display: 'inline-block',
                  width: 24,
                  height: 24,
                  lineHeight: '24px',
                  textAlign: 'center',
                  background: '#1890ff',
                  color: 'white',
                  borderRadius: '50%',
                  marginRight: 12,
                  flexShrink: 0,
                  fontWeight: 600
                }}>3</span>
                <span>拖拽方向箭头调整机器人朝向</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <span style={{
                  display: 'inline-block',
                  width: 24,
                  height: 24,
                  lineHeight: '24px',
                  textAlign: 'center',
                  background: '#1890ff',
                  color: 'white',
                  borderRadius: '50%',
                  marginRight: 12,
                  flexShrink: 0,
                  fontWeight: 600
                }}>4</span>
                <span>系统将自动完成粒子滤波初始化</span>
              </div>
            </div>
          </div>

          <div style={{
            padding: 16,
            background: '#fffbe6',
            borderRadius: 8,
            border: '1px solid #ffe58f'
          }}>
            <div style={{ fontSize: 14, color: '#d48806' }}>
              💡 <strong>提示：</strong>初始位置设置越准确，定位成功率越高
            </div>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
