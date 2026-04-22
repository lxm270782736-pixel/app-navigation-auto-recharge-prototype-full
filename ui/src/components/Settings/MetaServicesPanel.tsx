import React, { useState, useEffect, useRef } from 'react';
import { Card, Table, Switch, Button, Modal, message, Input, Space, Tag, Badge } from 'antd';
import { ReloadOutlined, SaveOutlined, EditOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { apiService } from '@/services/api';

interface ServiceEntry {
  name: string;
  startup: boolean;
  deactivate_after_step?: boolean;
  config: Record<string, any>;
}

interface ServiceStatus {
  name: string;
  state: string;
  startup: boolean;
}

const STATE_BADGE: Record<string, { status: 'success' | 'processing' | 'warning' | 'error' | 'default'; text: string }> = {
  active: { status: 'success', text: '运行中' },
  inactive: { status: 'warning', text: '已停用' },
  unconfigured: { status: 'processing', text: '未配置' },
  disconnected: { status: 'default', text: '未连接' },
  finalized: { status: 'error', text: '已关闭' },
};

export const MetaServicesPanel: React.FC = () => {
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [configDraft, setConfigDraft] = useState('');
  const [configError, setConfigError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiService.getMetaServicesConfig();
      setServices(data.services || []);
      setDirty(false);
    } catch (e) {
      message.error('加载服务配置失败');
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = async () => {
    try {
      const data = await apiService.getMetaStatus() as any;
      if (data.services) setStatuses(data.services);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    load();
    pollStatus();
    pollRef.current = setInterval(pollStatus, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleToggleStartup = (idx: number, value: boolean) => {
    const next = [...services];
    next[idx] = { ...next[idx], startup: value };
    setServices(next);
    setDirty(true);
  };

  const handleToggleDeactivate = (idx: number, value: boolean) => {
    const next = [...services];
    next[idx] = { ...next[idx], deactivate_after_step: value };
    setServices(next);
    setDirty(true);
  };

  const handleOpenConfigEditor = (idx: number) => {
    setEditingIdx(idx);
    setConfigDraft(JSON.stringify(services[idx].config, null, 2));
    setConfigError('');
  };

  const handleSaveConfig = () => {
    try {
      const parsed = JSON.parse(configDraft);
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        setConfigError('config 必须是对象');
        return;
      }
      if (editingIdx !== null) {
        const next = [...services];
        next[editingIdx] = { ...next[editingIdx], config: parsed };
        setServices(next);
        setDirty(true);
      }
      setEditingIdx(null);
    } catch (e: any) {
      setConfigError(`JSON 解析失败: ${e.message}`);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const result = await apiService.updateMetaServicesConfig(services);
      if (result.success) {
        message.success(result.message || '已保存');
        setDirty(false);
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleStartMeta = async () => {
    setStarting(true);
    try {
      const result = await apiService.startMeta();
      if (result.success) {
        message.success('启动完成');
      } else {
        message.warning('部分服务启动失败');
      }
      pollStatus();
    } catch (e) {
      message.error('启动失败');
    } finally {
      setStarting(false);
    }
  };

  // 按 name 查找实时状态
  const getServiceState = (name: string): string => {
    const s = statuses.find(s => s.name === name);
    return s?.state || 'disconnected';
  };

  const columns = [
    {
      title: '服务名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Tag color="blue">{name}</Tag>,
    },
    {
      title: '状态',
      key: 'state',
      width: 100,
      render: (_: any, record: ServiceEntry) => {
        const state = getServiceState(record.name);
        const badge = STATE_BADGE[state] || STATE_BADGE.disconnected;
        return <Badge status={badge.status} text={badge.text} />;
      },
    },
    {
      title: '随启动',
      dataIndex: 'startup',
      key: 'startup',
      width: 80,
      render: (val: boolean, _: ServiceEntry, idx: number) => (
        <Switch checked={val} onChange={(v) => handleToggleStartup(idx, v)} />
      ),
    },
    {
      title: '步骤后停用',
      key: 'deactivate_after_step',
      width: 100,
      render: (_: any, record: ServiceEntry, idx: number) => (
        <Switch
          checked={record.deactivate_after_step === true}
          onChange={(v) => handleToggleDeactivate(idx, v)}
        />
      ),
    },
    {
      title: '配置',
      dataIndex: 'config',
      key: 'config',
      render: (config: Record<string, any>, _: ServiceEntry, idx: number) => (
        <Space>
          <span style={{ fontSize: 12, color: '#666' }}>
            {Object.keys(config).length} 项
          </span>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenConfigEditor(idx)}>
            编辑
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Meta 服务配置"
      style={{ maxWidth: 900 }}
      extra={
        <Space>
          <Button
            icon={<PlayCircleOutlined />}
            onClick={handleStartMeta}
            loading={starting}
          >
            一键启动
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => { load(); pollStatus(); }} disabled={loading}>
            重载
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveAll}
            loading={saving}
            disabled={!dirty}
          >
            {dirty ? '保存 *' : '保存'}
          </Button>
        </Space>
      }
    >
      <p style={{ color: '#666', marginBottom: 16 }}>
        配置一键启动会激活哪些 meta 服务，以及各服务的默认 config 参数。
        <br />
        <strong>注意</strong>：修改 config 后，已 active 的服务需下次 deactivate→activate 才生效。
      </p>

      <Table
        dataSource={services}
        columns={columns}
        rowKey="name"
        size="small"
        pagination={false}
        loading={loading}
      />

      <Modal
        title={editingIdx !== null ? `编辑 ${services[editingIdx]?.name} 的 config` : ''}
        open={editingIdx !== null}
        onOk={handleSaveConfig}
        onCancel={() => setEditingIdx(null)}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <Input.TextArea
          rows={14}
          value={configDraft}
          onChange={(e) => { setConfigDraft(e.target.value); setConfigError(''); }}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        {configError && <div style={{ color: '#ff4d4f', marginTop: 8 }}>{configError}</div>}
      </Modal>
    </Card>
  );
};
