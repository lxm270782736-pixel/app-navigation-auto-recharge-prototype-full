import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, Tag, message } from 'antd';
import {
  RocketOutlined,
  PoweroffOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { apiService } from '@/services/api';

const STATE_LABELS: Record<string, { text: string; color: string }> = {
  disconnected: { text: '未连接', color: '#8c8c8c' },
  connected: { text: '已连接', color: '#faad14' },
  unconfigured: { text: '未配置', color: '#fa8c16' },
  inactive: { text: '未激活', color: '#1890ff' },
  active: { text: '运行中', color: '#52c41a' },
};

export const MetaLauncher: React.FC = () => {
  const [locState, setLocState] = useState('disconnected');
  const [navState, setNavState] = useState('disconnected');
  const [detectionState, setDetectionState] = useState('disconnected');
  const [loading, setLoading] = useState(false);

  const isActive = locState === 'active' || navState === 'active';

  // SSE 状态同步
  useEffect(() => {
    const handler = (state: any) => {
      if (state.loc_state !== undefined) setLocState(state.loc_state);
      if (state.nav_state !== undefined) setNavState(state.nav_state);
      if (state.fall_state !== undefined) setDetectionState(state.fall_state);
    };
    apiService.on('state', handler);
    return () => { apiService.off('state', handler); };
  }, []);

  // 初始获取
  const loadStatus = useCallback(async () => {
    try {
      const s = await apiService.getMetaStatus();
      setLocState(s.loc_state || 'disconnected');
      setNavState(s.nav_state || 'disconnected');
      setDetectionState(s.fall_state || 'disconnected');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const result = await apiService.startMeta();
      if (result.success) {
        message.success('Meta 服务已启动');
      } else {
        message.error(result.message || '启动失败');
      }
      await loadStatus();
    } catch {
      message.error('启动失败');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await apiService.deactivateMeta();
      message.info('Meta 服务已停用');
      await loadStatus();
    } catch {
      message.error('停用失败');
    } finally {
      setLoading(false);
    }
  };

  const StatusDot: React.FC<{ state: string }> = ({ state }) => (
    <span style={{
      width: 8, height: 8, borderRadius: '50%',
      background: STATE_LABELS[state]?.color || '#8c8c8c',
      display: 'inline-block', marginRight: 8,
    }} />
  );

  return (
    <div style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderRadius: '8px', padding: '16px',
    }}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: 'white' }}>
            <ApiOutlined style={{ fontSize: '20px', marginRight: '8px' }} />
            <span style={{ fontSize: '16px', fontWeight: 500 }}>Meta 服务控制</span>
          </div>
          {isActive && (
            <Tag color="green" style={{ fontWeight: 500 }}>已启动</Tag>
          )}
        </div>

        {!isActive ? (
          <Button type="primary" size="large" icon={<RocketOutlined />}
            onClick={handleStart} loading={loading} block
            style={{ background: 'white', color: '#667eea', borderColor: 'white', fontWeight: 500, height: '44px' }}>
            {loading ? '启动中...' : '一键启动所有服务'}
          </Button>
        ) : (
          <Button size="large" icon={<PoweroffOutlined />}
            onClick={handleStop} loading={loading} block
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', borderColor: 'rgba(255,255,255,0.3)', fontWeight: 500, height: '44px' }}>
            停用服务
          </Button>
        )}

        {/* 服务状态 */}
        <div style={{
          fontSize: '12px', color: 'rgba(255,255,255,0.9)',
          padding: '8px 12px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <StatusDot state={locState} />
            <span>定位 (Localization): {STATE_LABELS[locState]?.text || locState}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <StatusDot state={navState} />
            <span>导航 (Navigation): {STATE_LABELS[navState]?.text || navState}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot state={detectionState} />
            <span>检测 (Detection): {STATE_LABELS[detectionState]?.text || detectionState}</span>
          </div>
        </div>
      </Space>
    </div>
  );
};
