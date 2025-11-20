import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Space, message, Modal, Tag, Descriptions } from 'antd';
import {
  AimOutlined,
  SyncOutlined,
  CloseCircleOutlined,
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
  const [isLocalizing, setIsLocalizing] = useState(false);
  const [failureModalVisible, setFailureModalVisible] = useState(false);
  const [failureMessage, setFailureMessage] = useState('');
  const [lastLocalizationType, setLastLocalizationType] = useState<'manual' | 'auto'>('manual');
  const hasShownSuccessRef = useRef(false);
  const hasShownFailureRef = useRef(false);

  // 订阅定位状态
  useEffect(() => {
    const unsubscribe = rosService.subscribeLocalizationStatus((status) => {
      console.log('Localization status:', status);
      if (status && status.data) {
        setStatusMessage(status.data);
        // 检查定位是否完成
        if (status.data.includes('定位成功')) {
          setLoading(null);
          setIsLocalizing(false);
          // 显示成功提示（只显示一次）
          if (!hasShownSuccessRef.current) {
            message.success({
              content: '定位成功！机器人位置已确定',
              duration: 3,
            });
            hasShownSuccessRef.current = true;
          }
        } else if (status.data.includes('定位失败')) {
          setLoading(null);
          setIsLocalizing(false);
          // 提取失败原因并显示失败弹窗（只显示一次）
          if (!hasShownFailureRef.current) {
            const errorMatch = status.data.match(/定位失败[^:]*:\s*(.+)/);
            const errorReason = errorMatch ? errorMatch[1] : '定位失败，请重试';
            setFailureMessage(errorReason);
            setFailureModalVisible(true);
            hasShownFailureRef.current = true;
          }
        } else if (status.data.includes('定位中')) {
          setIsLocalizing(true);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleLocalizationManual = async () => {
    setLoading('localization');
    setIsLocalizing(true);
    setLastLocalizationType('manual');
    hasShownSuccessRef.current = false; // 重置成功提示标志
    hasShownFailureRef.current = false; // 重置失败提示标志
    try {
      const result = await rosService.startLocalization();
      if (result.success) {
        setCurrentMode('localization');
        message.success('定位模式已启动（手动）');
        message.info('正在定位中，请等待...');
        onModeChange?.('localization');
        // 不在这里清除loading，等待定位完成的状态消息
      } else {
        message.error(result.message || '启动定位模式失败');
        setLoading(null);
        setIsLocalizing(false);
      }
    } catch (error) {
      message.error('启动定位模式失败');
      console.error(error);
      setLoading(null);
      setIsLocalizing(false);
    }
  };

  const handleLocalizationAuto = async () => {
    setLoading('localization_auto');
    setIsLocalizing(true);
    setLastLocalizationType('auto');
    hasShownSuccessRef.current = false; // 重置成功提示标志
    hasShownFailureRef.current = false; // 重置失败提示标志
    try {
      const result = await rosService.startLocalizationAuto();
      if (result.success) {
        setCurrentMode('localization_auto');
        message.success('定位模式已启动（自动）');
        message.info('正在自动定位中，请等待...');
        onModeChange?.('localization_auto');
        // 不在这里清除loading，等待定位完成的状态消息
      } else {
        message.error(result.message || '启动自动定位模式失败');
        setLoading(null);
        setIsLocalizing(false);
      }
    } catch (error) {
      message.error('启动自动定位模式失败');
      console.error(error);
      setLoading(null);
      setIsLocalizing(false);
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
            disabled={isLocalizing}
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
            disabled={isLocalizing}
            size="small"
            style={{ flex: 1 }}
          >
            {loading === 'localization_auto' ? '自动定位中...' : '自动重定位'}
          </Button>
        </div>

        <div style={{ fontSize: 12, color: '#666', paddingLeft: 8 }}>
          💡 {isLocalizing ? '定位过程约需10秒，请等待完成' : '手动需在地图点击初始位置，自动则系统自动搜索'}
        </div>
      </Space>

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
