import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, Tag, message } from 'antd';
import {
  ThunderboltOutlined,
  PoweroffOutlined,
  ApiOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';

const STATE_LABELS: Record<string, { text: string; color: string }> = {
  disconnected: { text: '未连接', color: '#8c8c8c' },
  connected: { text: '已连接', color: '#faad14' },
  inactive: { text: '待激活', color: '#1890ff' },
  active: { text: '运行中', color: '#52c41a' },
};

export const MetaLauncher: React.FC = () => {
  const { connectionStatus } = useROS();
  const [locState, setLocState] = useState('disconnected');
  const [navState, setNavState] = useState('disconnected');
  const [loading, setLoading] = useState(false);

  const metaConnected = locState !== 'disconnected' || navState !== 'disconnected';
  const isActive = locState === 'active' || navState === 'active';

  // SSE 状态同步
  useEffect(() => {
    const handler = (state: any) => {
      if (state.loc_state !== undefined) setLocState(state.loc_state);
      if (state.nav_state !== undefined) setNavState(state.nav_state);
    };
    rosService.on('state', handler);
    return () => { rosService.off('state', handler); };
  }, []);

  // 初始获取
  const loadStatus = useCallback(async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    try {
      const s = await rosService.getMetaStatus();
      setLocState(s.loc_state || 'disconnected');
      setNavState(s.nav_state || 'disconnected');
    } catch { /* ignore */ }
  }, [connectionStatus]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const result = await rosService.connectMeta();
      if (result.success) message.success('Meta 服务已连接');
      else message.warning(result.message);
      await loadStatus();
    } catch { message.error('连接失败'); }
    finally { setLoading(false); }
  };

  const handleActivate = async () => {
    setLoading(true);
    try {
      const result = await rosService.activateMeta();
      if (result.success) message.success('Meta 服务已激活');
      else message.error('激活失败');
      await loadStatus();
    } catch { message.error('激活失败'); }
    finally { setLoading(false); }
  };

  const handleDeactivate = async () => {
    setLoading(true);
    try {
      const result = await rosService.deactivateMeta();
      if (result.success) message.info('Meta 服务已停用');
      await loadStatus();
    } catch { message.error('停用失败'); }
    finally { setLoading(false); }
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
          {metaConnected && (
            <Tag color={isActive ? 'green' : 'blue'} style={{ fontWeight: 500 }}>
              {isActive ? '已激活' : '待激活'}
            </Tag>
          )}
        </div>

        {!metaConnected ? (
          <Button type="primary" size="large" icon={<LinkOutlined />}
            onClick={handleConnect} loading={loading}
            disabled={connectionStatus !== ConnectionStatus.CONNECTED} block
            style={{ background: 'white', color: '#667eea', borderColor: 'white', fontWeight: 500, height: '44px' }}>
            {loading ? '连接中...' : '连接 Meta 服务'}
          </Button>
        ) : !isActive ? (
          <Button type="primary" size="large" icon={<ThunderboltOutlined />}
            onClick={handleActivate} loading={loading} block
            style={{ background: 'white', color: '#667eea', borderColor: 'white', fontWeight: 500, height: '44px' }}>
            {loading ? '激活中...' : '激活 Meta 服务'}
          </Button>
        ) : (
          <Button size="large" icon={<PoweroffOutlined />}
            onClick={handleDeactivate} loading={loading} block
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', borderColor: 'rgba(255,255,255,0.3)', fontWeight: 500, height: '44px' }}>
            停用 Meta 服务
          </Button>
        )}

        {connectionStatus !== ConnectionStatus.CONNECTED && (
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
            请先连接 ROS Bridge
          </div>
        )}

        {connectionStatus === ConnectionStatus.CONNECTED && (
          <div style={{
            fontSize: '12px', color: 'rgba(255,255,255,0.9)',
            padding: '8px 12px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
              <StatusDot state={locState} />
              <span>定位 (Localization): {STATE_LABELS[locState]?.text || locState}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <StatusDot state={navState} />
              <span>导航 (Navigation): {STATE_LABELS[navState]?.text || navState}</span>
            </div>
          </div>
        )}
      </Space>
    </div>
  );
};
