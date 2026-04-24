import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, Tag, message } from 'antd';
import { RocketOutlined, ApiOutlined, PoweroffOutlined } from '@ant-design/icons';
import { apiService } from '@/services/api';

const STATE_LABELS: Record<string, { text: string; color: string }> = {
  disconnected: { text: '未连接', color: '#8c8c8c' },
  connected:    { text: '已连接', color: '#faad14' },
  unconfigured: { text: '未配置', color: '#fa8c16' },
  inactive:     { text: '未激活', color: '#1890ff' },
  active:       { text: '运行中', color: '#52c41a' },
  finalized:    { text: '已终止', color: '#8c8c8c' },
};

const SHORT_LABELS: Record<string, string> = {
  localization: '定位',
  astribot_navigation: '导航',
  detection: '检测',
  sales_replay: '轨迹回放',
  camera: '相机',
};

interface ServiceInfo {
  name: string;
  state: string;
  startup: boolean;
}

export const MetaLauncher: React.FC = () => {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({ all: false });

  const startupServices = services.filter(s => s.startup);
  const isAllActive = startupServices.length > 0 && startupServices.every(s => s.state === 'active');

  const getState = (name: string) => services.find(s => s.name === name)?.state || 'disconnected';
  const getShort = (name: string) => name.replace('meta.', '');
  const getLabel = (name: string) => SHORT_LABELS[getShort(name)] || getShort(name);

  // 从 SSE state 事件更新（实时）
  useEffect(() => {
    const handler = (state: any) => {
      setServices(prev => {
        if (!prev.length) return prev;
        return prev.map(s => {
          const short = getShort(s.name);
          const key = short === 'detection' ? 'fall_state' : `${short}_state`;
          const newState = state[key];
          return newState ? { ...s, state: newState } : s;
        });
      });
    };
    apiService.on('state', handler);
    return () => { apiService.off('state', handler); };
  }, []);

  // 初始加载 + 手动刷新
  const loadStatus = useCallback(async () => {
    try {
      const s = await apiService.getMetaStatus() as any;
      if (s.services) setServices(s.services);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleAll = async () => {
    setLoading(prev => ({ ...prev, all: true }));
    try {
      const result = await apiService.startMeta();
      if (result.success) message.success('Meta 服务已启动');
      else message.error(result.message || '启动失败');
      await loadStatus();
    } catch { message.error('启动失败'); }
    finally { setLoading(prev => ({ ...prev, all: false })); }
  };

  const handleControl = async (name: string, action: 'start' | 'stop') => {
    const short = getShort(name);
    // 映射到后端 metaControl 的 service key
    const keyMap: Record<string, string> = {
      localization: 'loc',
      astribot_navigation: 'nav',
      detection: 'detection',
    };
    const controlKey = keyMap[short];
    setLoading(prev => ({ ...prev, [name]: true }));
    try {
      if (controlKey) {
        const result = await apiService.metaControl(controlKey as any, action);
        if (result.success) message.success(action === 'start' ? '已启动' : '已停止');
        else message.error(result.message || '操作失败');
      } else {
        message.warning(`${short} 暂不支持单独控制`);
      }
      await loadStatus();
    } catch { message.error('操作失败'); }
    finally { setLoading(prev => ({ ...prev, [name]: false })); }
  };

  const StatusDot: React.FC<{ state: string }> = ({ state }) => (
    <span style={{
      width: 8, height: 8, borderRadius: '50%',
      background: STATE_LABELS[state]?.color || '#8c8c8c',
      display: 'inline-block', marginRight: 6, flexShrink: 0,
    }} />
  );

  return (
    <div style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderRadius: 8, padding: 16,
    }}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: 'white' }}>
            <ApiOutlined style={{ fontSize: 20, marginRight: 8 }} />
            <span style={{ fontSize: 16, fontWeight: 500 }}>Meta 服务控制</span>
          </div>
          {isAllActive && <Tag color="green" style={{ fontWeight: 500 }}>全部运行中</Tag>}
        </div>

        {/* 一键启动 / 停止 */}
        {isAllActive ? (
          <Button
            size="large" icon={<PoweroffOutlined />}
            onClick={async () => {
              setLoading(prev => ({ ...prev, all: true }));
              try {
                await apiService.deactivateMeta();
                message.info('Meta 服务已停用');
                await loadStatus();
              } catch { message.error('停用失败'); }
              finally { setLoading(prev => ({ ...prev, all: false })); }
            }}
            loading={loading.all} block
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', borderColor: 'rgba(255,255,255,0.3)', fontWeight: 500, height: 44 }}
          >
            停止所有服务
          </Button>
        ) : (
          <Button
            type="primary" size="large" icon={<RocketOutlined />}
            onClick={handleAll} loading={loading.all} block
            style={{ background: 'white', color: '#667eea', borderColor: 'white', fontWeight: 500, height: 44 }}
          >
            一键启动所有服务
          </Button>
        )}

        {/* 每个 startup 服务独立控制 */}
        <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 12px' }}>
          <Space direction="vertical" style={{ width: '100%' }} size={6}>
            {startupServices.map(({ name }) => {
              const state = getState(name);
              const isActive = state === 'active';
              return (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.9)', fontSize: 12, flex: 1 }}>
                    <StatusDot state={state} />
                    <span>{getLabel(name)}: </span>
                    <span style={{ marginLeft: 4, color: STATE_LABELS[state]?.color || '#fff' }}>
                      {STATE_LABELS[state]?.text || state}
                    </span>
                  </div>
                  <Space size={4}>
                    {!isActive && (
                      <Button
                        size="small" loading={loading[name]}
                        style={{ background: 'rgba(255,255,255,0.2)', color: 'white', borderColor: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                        onClick={() => handleControl(name, 'start')}
                      >
                        启动
                      </Button>
                    )}
                    {isActive && (
                      <Button
                        size="small" danger loading={loading[name]}
                        icon={<PoweroffOutlined />}
                        style={{ fontSize: 11 }}
                        onClick={() => handleControl(name, 'stop')}
                      >
                        停止
                      </Button>
                    )}
                  </Space>
                </div>
              );
            })}
          </Space>
        </div>
      </Space>
    </div>
  );
};
