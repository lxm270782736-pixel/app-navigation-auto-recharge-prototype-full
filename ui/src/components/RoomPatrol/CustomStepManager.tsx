import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Input, Select, InputNumber, Switch, Space, Card, message, Empty, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { apiService } from '@/services/api';
import type { CustomStepDefinition, CustomStepParamDef, CustomStepAction } from '@/types';

const { TextArea } = Input;

const PRESET_COLORS = ['#1890ff', '#52c41a', '#ff4d4f', '#faad14', '#722ed1', '#eb2f96', '#13c2c2', '#fa8c16'];

const ACTION_TYPE_OPTIONS = [
  { value: 'service', label: 'ROS Service' },
  { value: 'topic', label: 'ROS Topic' },
  { value: 'wait', label: '等待' },
  { value: 'meta', label: 'Meta 服务' },
];

const PARAM_TYPE_OPTIONS = [
  { value: 'string', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '开关' },
  { value: 'select', label: '下拉选择' },
];

const EMPTY_DEF: CustomStepDefinition = {
  id: '', name: '', description: '', icon_color: '#1890ff',
  action: { type: 'wait', duration: 1 },
  parameters: [],
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export const CustomStepManager: React.FC<Props> = ({ open, onClose }) => {
  const [definitions, setDefinitions] = useState<CustomStepDefinition[]>([]);
  const [editing, setEditing] = useState<CustomStepDefinition | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [requestJson, setRequestJson] = useState('{}');

  const load = useCallback(async () => {
    try {
      const data = await apiService.getCustomStepTypes();
      setDefinitions(data.custom_step_types || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const handleNew = () => {
    setEditing({ ...EMPTY_DEF });
    setIsNew(true);
    setRequestJson('{}');
  };

  const handleEdit = (def: CustomStepDefinition) => {
    setEditing({ ...def, parameters: def.parameters.map(p => ({ ...p })) });
    setIsNew(false);
    const json = def.action.request || def.action.message || def.action.meta_kwargs || {};
    setRequestJson(JSON.stringify(json, null, 2));
  };

  const handleDelete = async (id: string) => {
    const result = await apiService.deleteCustomStepType(id);
    if (result.success) {
      message.success('已删除');
      load();
      if (editing?.id === id) setEditing(null);
    } else {
      message.error(result.message);
    }
  };

  const handleSave = async () => {
    if (!editing) return;

    // Parse JSON
    let parsedJson: Record<string, any> = {};
    if (editing.action.type !== 'wait') {
      try {
        parsedJson = JSON.parse(requestJson);
      } catch {
        message.error('JSON 格式错误');
        return;
      }
    }

    const def = { ...editing };
    if (def.action.type === 'service') {
      def.action = { ...def.action, request: parsedJson };
    } else if (def.action.type === 'topic') {
      def.action = { ...def.action, message: parsedJson };
    } else if (def.action.type === 'meta') {
      def.action = { ...def.action, meta_kwargs: parsedJson };
    }

    const result = await apiService.saveCustomStepType(def);
    if (result.success) {
      message.success('已保存');
      load();
      setIsNew(false);
    } else {
      message.error(result.message);
    }
  };

  const updateAction = (patch: Partial<CustomStepAction>) => {
    if (!editing) return;
    setEditing({ ...editing, action: { ...editing.action, ...patch } });
  };

  const updateParam = (idx: number, patch: Partial<CustomStepParamDef>) => {
    if (!editing) return;
    const params = [...editing.parameters];
    params[idx] = { ...params[idx], ...patch };
    setEditing({ ...editing, parameters: params });
  };

  const addParam = () => {
    if (!editing) return;
    setEditing({
      ...editing,
      parameters: [...editing.parameters, { key: '', label: '', type: 'string', default_value: '' }],
    });
  };

  const removeParam = (idx: number) => {
    if (!editing) return;
    setEditing({ ...editing, parameters: editing.parameters.filter((_, i) => i !== idx) });
  };

  return (
    <Modal
      title="自定义步骤类型管理"
      open={open}
      onCancel={onClose}
      footer={null}
      width={860}
      styles={{ body: { padding: 0, height: 520, display: 'flex', overflow: 'hidden' } }}
    >
      {/* Left: list */}
      <div style={{ width: 240, borderRight: '1px solid #f0f0f0', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {definitions.length === 0 && <Empty description="暂无自定义步骤" style={{ marginTop: 40 }} />}
        {definitions.map(def => (
          <Card
            key={def.id}
            size="small"
            style={{
              cursor: 'pointer',
              borderLeft: `3px solid ${def.icon_color || '#999'}`,
              background: editing?.id === def.id ? '#e6f7ff' : undefined,
            }}
            onClick={() => handleEdit(def)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{def.name}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{def.id}</div>
              </div>
              <Space size={4}>
                <Button size="small" type="text" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); handleEdit(def); }} />
                <Popconfirm title="确认删除？" onConfirm={() => handleDelete(def.id)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={e => e.stopPropagation()} />
                </Popconfirm>
              </Space>
            </div>
          </Card>
        ))}
        <Button type="dashed" block icon={<PlusOutlined />} onClick={handleNew} style={{ marginTop: 8 }}>
          新建
        </Button>
      </div>

      {/* Right: editor */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {!editing ? (
          <Empty description="选择左侧步骤或新建" style={{ marginTop: 80 }} />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {/* Basic info */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>ID *</div>
                <Input
                  value={editing.id}
                  onChange={e => setEditing({ ...editing, id: e.target.value })}
                  disabled={!isNew}
                  placeholder="如: uv_disinfect"
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>名称 *</div>
                <Input
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="如: UV消毒"
                />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>描述</div>
              <Input
                value={editing.description}
                onChange={e => setEditing({ ...editing, description: e.target.value })}
                placeholder="步骤功能说明"
              />
            </div>

            {/* Color */}
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>颜色</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {PRESET_COLORS.map(c => (
                  <div
                    key={c}
                    onClick={() => setEditing({ ...editing, icon_color: c })}
                    style={{
                      width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: editing.icon_color === c ? '2px solid #000' : '2px solid transparent',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Action */}
            <Card size="small" title="动作配置">
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>动作类型 *</div>
                <Select
                  value={editing.action.type}
                  onChange={v => updateAction({ type: v as any })}
                  options={ACTION_TYPE_OPTIONS}
                  style={{ width: '100%' }}
                />
              </div>

              {editing.action.type === 'service' && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>Service Name *</div>
                      <Input value={editing.action.service_name || ''} onChange={e => updateAction({ service_name: e.target.value })} placeholder="/service/name" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>Service Type *</div>
                      <Input value={editing.action.service_type || ''} onChange={e => updateAction({ service_type: e.target.value })} placeholder="std_srvs/srv/Trigger" />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Request JSON (支持 {'{{param}}'} 占位符)</div>
                    <TextArea rows={3} value={requestJson} onChange={e => setRequestJson(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                  </div>
                </>
              )}

              {editing.action.type === 'topic' && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>Topic Name *</div>
                      <Input value={editing.action.topic_name || ''} onChange={e => updateAction({ topic_name: e.target.value })} placeholder="/topic/name" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>Message Type *</div>
                      <Input value={editing.action.msg_type || ''} onChange={e => updateAction({ msg_type: e.target.value })} placeholder="std_msgs/msg/String" />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Message JSON (支持 {'{{param}}'} 占位符)</div>
                    <TextArea rows={3} value={requestJson} onChange={e => setRequestJson(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                  </div>
                </>
              )}

              {editing.action.type === 'wait' && (
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>默认等待时长 (秒)</div>
                  <InputNumber value={editing.action.duration ?? 1} onChange={v => updateAction({ duration: v ?? 1 })} min={0} style={{ width: '100%' }} />
                </div>
              )}

              {editing.action.type === 'meta' && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>Meta 服务 *</div>
                      <Input
                        value={editing.action.meta_service || ''}
                        onChange={e => updateAction({ meta_service: e.target.value })}
                        placeholder="localization / navigation / ..."
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>方法名 *</div>
                      <Input
                        value={editing.action.meta_method || ''}
                        onChange={e => updateAction({ meta_method: e.target.value })}
                        placeholder="get_status / start_mapping / ..."
                      />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Kwargs JSON（支持 {'{{param}}'} 占位符）</div>
                    <TextArea rows={3} value={requestJson} onChange={e => setRequestJson(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                  </div>
                </>
              )}
            </Card>

            {/* Parameters */}
            <Card size="small" title="参数定义" extra={<Button size="small" icon={<PlusOutlined />} onClick={addParam}>添加</Button>}>
              {editing.parameters.length === 0 && <div style={{ color: '#999', fontSize: 12 }}>无自定义参数</div>}
              {editing.parameters.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <Input size="small" value={p.key} onChange={e => updateParam(idx, { key: e.target.value })} placeholder="key" style={{ width: 80 }} />
                  <Input size="small" value={p.label} onChange={e => updateParam(idx, { label: e.target.value })} placeholder="显示名" style={{ width: 80 }} />
                  <Select size="small" value={p.type} onChange={v => updateParam(idx, { type: v as any })} options={PARAM_TYPE_OPTIONS} style={{ width: 80 }} />
                  <Input size="small" value={String(p.default_value ?? '')} onChange={e => updateParam(idx, { default_value: p.type === 'number' ? Number(e.target.value) || 0 : e.target.value })} placeholder="默认值" style={{ width: 70 }} />
                  {p.type === 'select' && (
                    <Input
                      size="small"
                      value={(p.options || []).map(o => `${o.value}:${o.label}`).join(',')}
                      onChange={e => {
                        const options = e.target.value.split(',').filter(Boolean).map(s => {
                          const [v, l] = s.split(':');
                          return { value: v?.trim() || '', label: l?.trim() || v?.trim() || '' };
                        });
                        updateParam(idx, { options });
                      }}
                      placeholder="val:标签,val:标签"
                      style={{ width: 140 }}
                    />
                  )}
                  <Switch size="small" checked={p.required} onChange={v => updateParam(idx, { required: v })} checkedChildren="必填" unCheckedChildren="可选" />
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeParam(idx)} />
                </div>
              ))}
            </Card>

            {/* Save */}
            <Button type="primary" block onClick={handleSave}>
              {isNew ? '创建' : '保存修改'}
            </Button>
          </Space>
        )}
      </div>
    </Modal>
  );
};
