import React, { useState } from 'react';
import { Card, Button, Space, message, Modal, Tag, Descriptions } from 'antd';
import {
  AimOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';

interface SimpleLocalizationControlProps {
  onModeChange?: (mode: string) => void;
}

type LocalizationMode = 'idle' | 'localization' | 'localization_auto';

export const SimpleLocalizationControl: React.FC<SimpleLocalizationControlProps> = ({ onModeChange }) => {
  const [currentMode, setCurrentMode] = useState<LocalizationMode>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('未启动');
  const [loading, setLoading] = useState<string | null>(null);
  const [failureModalVisible, setFailureModalVisible] = useState(false);
  const [failureMessage, setFailureMessage] = useState('');
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [lastLocalizationType, setLastLocalizationType] = useState<'manual' | 'auto'>('manual');

  const handleLocalizationManual = async () => {
    setLoading('localization');
    setLastLocalizationType('manual');
    setStatusMessage('定位中（手动）...');
    message.info('正在定位中，请等待约10秒...');

    try {
      const result = await rosService.startLocalization();

      if (result.success) {
        // 定位成功
        setCurrentMode('localization');
        setStatusMessage('定位成功（手动）');
        setSuccessModalVisible(true);
        onModeChange?.('localization');
      } else {
        // 定位失败
        setCurrentMode('idle');
        setStatusMessage('定位失败（手动）');
        setFailureMessage(result.message || '定位失败，请重试');
        setFailureModalVisible(true);
      }
    } catch (error) {
      message.error('启动定位模式失败');
      console.error(error);
      setCurrentMode('idle');
      setStatusMessage('定位失败');
    } finally {
      setLoading(null);
    }
  };

  const handleLocalizationAuto = async () => {
    setLoading('localization_auto');
    setLastLocalizationType('auto');
    setStatusMessage('定位中（自动）...');
    message.info('正在自动定位中，请等待约10秒...');

    try {
      const result = await rosService.startLocalizationAuto();

      if (result.success) {
        // 定位成功
        setCurrentMode('localization_auto');
        setStatusMessage('定位成功（自动）');
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
      </Descriptions>

      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <Button
            type="primary"
            icon={<AimOutlined />}
            onClick={handleLocalizationManual}
            loading={loading === 'localization'}
            disabled={loading !== null}
            size="small"
            style={{ flex: 1 }}
          >
            {loading === 'localization' ? '手动定位中...' : '手动重定位'}
          </Button>

          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={handleLocalizationAuto}
            loading={loading === 'localization_auto'}
            disabled={loading !== null}
            size="small"
            style={{ flex: 1 }}
          >
            {loading === 'localization_auto' ? '自动定位中...' : '自动重定位'}
          </Button>
        </div>

        <div style={{ fontSize: 12, color: '#666', paddingLeft: 8 }}>
          💡 {loading !== null ? '定位过程约需10秒，请等待完成' : '手动需在地图点击初始位置，自动则系统自动搜索'}
        </div>
      </Space>

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
              机器人已在地图中完成定位，现在可以进行导航操作了。
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#666' }}>
            <div style={{ marginBottom: 8 }}>💡 下一步操作：</div>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li>点击地图设置目标导航点</li>
              <li>或继续调整机器人姿态</li>
              <li>定位模式将持续运行直到关闭</li>
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
            <Button type="primary" onClick={handleRetryLocalization}>
              重试
            </Button>
          </Space>
        }
        width={400}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <CloseCircleOutlined style={{ fontSize: 48, color: '#ff4d4f' }} />
          </div>
          <div style={{ fontSize: 16, marginBottom: 16, textAlign: 'center', fontWeight: 500 }}>
            定位失败
          </div>
          <div style={{ marginBottom: 16, padding: 12, background: '#fff2f0', borderRadius: 4, border: '1px solid #ffccc7' }}>
            <div style={{ color: '#cf1322', fontSize: 14 }}>
              <strong>失败原因：</strong>{failureMessage}
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#666' }}>
            <div style={{ marginBottom: 8 }}>💡 建议操作：</div>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li>检查机器人是否在地图覆盖范围内</li>
              <li>确保激光雷达工作正常</li>
              <li>尝试切换定位方式（手动/自动）</li>
              <li>点击"重试"按钮再次尝试定位</li>
            </ul>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
