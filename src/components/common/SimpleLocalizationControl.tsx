import React, { useState, useEffect } from 'react';
import { Card, Button, Space, message, Modal, Tag, Descriptions } from 'antd';
import {
  AimOutlined,
  SyncOutlined,
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
  const [localizationModalVisible, setLocalizationModalVisible] = useState(false);

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
        <Button
          type="primary"
          icon={<AimOutlined />}
          onClick={handleStartLocalization}
          loading={loading === 'localization' || loading === 'localization_auto'}
          block
          size="small"
        >
          进入定位模式
        </Button>

        <div style={{ fontSize: 12, color: '#666', paddingLeft: 8 }}>
          💡 定位模式支持手动/自动初始化重定位
        </div>
      </Space>

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
