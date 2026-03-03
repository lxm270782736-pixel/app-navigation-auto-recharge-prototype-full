import React, { useState, useEffect } from 'react';
import { Card, Radio, Space, message, Spin, Tag } from 'antd';
import {
  DesktopOutlined,
  SyncOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';

interface ChassisControlProps {
  isNavigating?: boolean; // 是否正在导航
  onControlTypeChange?: (type: 'twist' | 'joy') => void; // 控制类型变化回调
}

type ControlType = 'twist' | 'joy';

export const ChassisControl: React.FC<ChassisControlProps> = ({
  isNavigating = false,
  onControlTypeChange,
}) => {
  const [controlType, setControlType] = useState<ControlType>('twist');
  const [loading, setLoading] = useState(false);
  const [fetchingType, setFetchingType] = useState(true);

  // 初始化时获取当前控制类型
  useEffect(() => {
    const initControlType = async () => {
      try {
        setFetchingType(true);
        const currentType = await rosService.getChassisControlType();
        if (currentType) {
          setControlType(currentType);
        }
      } catch (error) {
        console.error('Failed to fetch chassis control type:', error);
      } finally {
        setFetchingType(false);
      }
    };

    initControlType();
  }, []);

  const handleControlTypeChange = async (newType: ControlType) => {
    // 如果正在导航，不允许切换手柄模式
    if (isNavigating && newType === 'joy') {
      message.warning('导航中不允许切换到手柄模式');
      return;
    }

    // 如果正在导航，不允许切换控制模式
    if (isNavigating) {
      message.warning('导航中不允许切换控制模式');
      return;
    }

    setLoading(true);
    try {
      await rosService.setChassisControlType(newType);
      setControlType(newType);
      onControlTypeChange?.(newType);
      message.success(`已切换到${newType === 'twist' ? '自动' : '手柄'}模式`);
    } catch (error) {
      message.error('切换控制模式失败');
      console.error('Failed to switch chassis control type:', error);
    } finally {
      setLoading(false);
    }
  };

  const getControlTypeTag = () => {
    const config = {
      twist: { color: 'blue', text: '自动模式', icon: <SyncOutlined /> },
      joy: { color: 'orange', text: '手柄模式', icon: <DesktopOutlined /> },
    };

    const { color, text, icon } = config[controlType];
    return (
      <Tag color={color}>
        {icon} {text}
      </Tag>
    );
  };

  if (fetchingType) {
    return (
      <Card
        size="small"
        title="底盘控制"
        style={{ marginBottom: 12 }}
        extra={<Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} size="small" />}
      >
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#999' }}>
          加载控制模式中...
        </div>
      </Card>
    );
  }

  return (
    <Card
      size="small"
      title="底盘控制"
      style={{ marginBottom: 12 }}
      extra={getControlTypeTag()}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* 警告信息 */}
        {isNavigating && (
          <div
            style={{
              padding: '8px',
              background: '#fff7e6',
              border: '1px solid #ffd591',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#d46b08',
            }}
          >
            ⚠️ 导航中不允许切换控制模式
          </div>
        )}

        {/* 模式选择 */}
        <div>
          <div style={{ fontSize: 13, marginBottom: 8, color: '#666' }}>
            控制模式：
          </div>
          <Radio.Group
            value={controlType}
            onChange={(e) => handleControlTypeChange(e.target.value as ControlType)}
            disabled={loading || isNavigating}
            style={{ width: '100%' }}
            buttonStyle="solid"
          >
            <Radio.Button value="twist" style={{ width: '50%', textAlign: 'center' }}>
              <SyncOutlined /> 自动
            </Radio.Button>
            <Radio.Button value="joy" style={{ width: '50%', textAlign: 'center' }}>
              <DesktopOutlined /> 手柄
            </Radio.Button>
          </Radio.Group>
        </div>

        {/* 自动模式说明 */}
        {controlType === 'twist' && (
          <div
            style={{
              padding: '8px',
              background: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#52c41a',
            }}
          >
            ✓ 自动模式：接收导航指令，支持自动导航
          </div>
        )}

        {controlType === 'joy' && (
          <div
            style={{
              padding: '8px',
              background: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#52c41a',
            }}
          >
            ✓ 手柄模式：使用游戏手柄实时控制底盘
          </div>
        )}
      </Space>
    </Card>
  );
};
