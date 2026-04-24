import React, { useState, useEffect, useCallback } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
  cn,
} from '@astribot/ui';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiService } from '@/services/api';
import type { CustomStepDefinition, CustomStepParamDef, CustomStepAction } from '@/types';

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
  id: '',
  name: '',
  description: '',
  icon_color: '#1890ff',
  action: { type: 'wait', duration: 1 },
  parameters: [],
};

type NoticeState = {
  tone: 'success' | 'error';
  text: string;
} | null;

interface Props {
  open: boolean;
  onClose: () => void;
}

function parseParamDefaultValue(type: CustomStepParamDef['type'], raw: string) {
  if (type === 'number') {
    return Number(raw) || 0;
  }
  if (type === 'boolean') {
    return raw === 'true';
  }
  return raw;
}

export const CustomStepManager: React.FC<Props> = ({ open, onClose }) => {
  const [definitions, setDefinitions] = useState<CustomStepDefinition[]>([]);
  const [editing, setEditing] = useState<CustomStepDefinition | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [requestJson, setRequestJson] = useState('{}');
  const [notice, setNotice] = useState<NoticeState>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiService.getCustomStepTypes();
      setDefinitions(data.custom_step_types || []);
    } catch {
      setNotice({ tone: 'error', text: '加载自定义步骤失败' });
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleNew = () => {
    setEditing({ ...EMPTY_DEF });
    setIsNew(true);
    setRequestJson('{}');
    setNotice(null);
  };

  const handleEdit = (def: CustomStepDefinition) => {
    setEditing({ ...def, parameters: def.parameters.map((p) => ({ ...p })) });
    setIsNew(false);
    const json = def.action.request || def.action.message || def.action.meta_kwargs || {};
    setRequestJson(JSON.stringify(json, null, 2));
    setNotice(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await apiService.deleteCustomStepType(deleteTarget);
    if (result.success) {
      setNotice({ tone: 'success', text: '已删除' });
      await load();
      if (editing?.id === deleteTarget) setEditing(null);
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
    setDeleteTarget(null);
  };

  const handleSave = async () => {
    if (!editing) return;

    let parsedJson: Record<string, any> = {};
    if (editing.action.type !== 'wait') {
      try {
        parsedJson = JSON.parse(requestJson);
      } catch {
        setNotice({ tone: 'error', text: 'JSON 格式错误' });
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
      setNotice({ tone: 'success', text: '已保存' });
      await load();
      setIsNew(false);
    } else {
      setNotice({ tone: 'error', text: result.message });
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
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border/70 px-6 py-4">
            <DialogTitle>自定义步骤类型管理</DialogTitle>
            <DialogDescription>定义可复用的服务、话题、等待或 Meta 步骤模板。</DialogDescription>
          </DialogHeader>

          <div className="flex h-[620px] overflow-hidden">
            <div className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border/70 bg-muted/10 p-3">
              {definitions.length === 0 && (
                <div className="mt-10 text-center text-sm text-muted-foreground">暂无自定义步骤</div>
              )}

              {definitions.map((def) => (
                <Card
                  key={def.id}
                  className={cn(
                    'cursor-pointer border-border/70 bg-card/90 shadow-sm transition',
                    editing?.id === def.id && 'border-primary/50 bg-primary/10'
                  )}
                  style={{ borderLeft: `3px solid ${def.icon_color || '#999'}` }}
                  onClick={() => handleEdit(def)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{def.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{def.id}</div>
                      </div>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEdit(def); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteTarget(def.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Button type="button" variant="outline" className="mt-2 w-full" onClick={handleNew}>
                <Plus className="mr-2 h-4 w-4" />
                新建
              </Button>
            </div>

            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
              {notice && (
                <div
                  className={cn(
                    'mb-4 rounded-lg border px-3 py-2 text-sm',
                    notice.tone === 'success'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-destructive/40 bg-destructive/10 text-destructive'
                  )}
                >
                  {notice.text}
                </div>
              )}

              {!editing ? (
                <div className="mt-16 text-center text-sm text-muted-foreground">选择左侧步骤或新建</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5 text-sm text-muted-foreground">
                      <span>ID *</span>
                      <Input
                        value={editing.id}
                        onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                        disabled={!isNew}
                        placeholder="如: uv_disinfect"
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm text-muted-foreground">
                      <span>名称 *</span>
                      <Input
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        placeholder="如: UV消毒"
                      />
                    </label>
                  </div>

                  <label className="grid gap-1.5 text-sm text-muted-foreground">
                    <span>描述</span>
                    <Input
                      value={editing.description}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      placeholder="步骤功能说明"
                    />
                  </label>

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-foreground">颜色</div>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setEditing({ ...editing, icon_color: color })}
                          className={cn(
                            'h-7 w-7 rounded-full border-2 transition',
                            editing.icon_color === color ? 'border-foreground' : 'border-transparent'
                          )}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <Card className="border-border/70 bg-card/90">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">动作配置</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <label className="grid gap-1.5 text-sm text-muted-foreground">
                        <span>动作类型 *</span>
                        <select
                          value={editing.action.type}
                          onChange={(e) => updateAction({ type: e.target.value as CustomStepAction['type'] })}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                        >
                          {ACTION_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>

                      {editing.action.type === 'service' && (
                        <>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-1.5 text-sm text-muted-foreground">
                              <span>Service Name *</span>
                              <Input value={editing.action.service_name || ''} onChange={(e) => updateAction({ service_name: e.target.value })} placeholder="/service/name" />
                            </label>
                            <label className="grid gap-1.5 text-sm text-muted-foreground">
                              <span>Service Type *</span>
                              <Input value={editing.action.service_type || ''} onChange={(e) => updateAction({ service_type: e.target.value })} placeholder="std_srvs/srv/Trigger" />
                            </label>
                          </div>
                          <label className="grid gap-1.5 text-sm text-muted-foreground">
                            <span>Request JSON (支持 {'{{param}}'} 占位符)</span>
                            <textarea
                              rows={4}
                              value={requestJson}
                              onChange={(e) => setRequestJson(e.target.value)}
                              className="min-h-[110px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
                            />
                          </label>
                        </>
                      )}

                      {editing.action.type === 'topic' && (
                        <>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-1.5 text-sm text-muted-foreground">
                              <span>Topic Name *</span>
                              <Input value={editing.action.topic_name || ''} onChange={(e) => updateAction({ topic_name: e.target.value })} placeholder="/topic/name" />
                            </label>
                            <label className="grid gap-1.5 text-sm text-muted-foreground">
                              <span>Message Type *</span>
                              <Input value={editing.action.msg_type || ''} onChange={(e) => updateAction({ msg_type: e.target.value })} placeholder="std_msgs/msg/String" />
                            </label>
                          </div>
                          <label className="grid gap-1.5 text-sm text-muted-foreground">
                            <span>Message JSON (支持 {'{{param}}'} 占位符)</span>
                            <textarea
                              rows={4}
                              value={requestJson}
                              onChange={(e) => setRequestJson(e.target.value)}
                              className="min-h-[110px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
                            />
                          </label>
                        </>
                      )}

                      {editing.action.type === 'wait' && (
                        <label className="grid gap-1.5 text-sm text-muted-foreground">
                          <span>默认等待时长 (秒)</span>
                          <Input
                            type="number"
                            min={0}
                            value={String(editing.action.duration ?? 1)}
                            onChange={(e) => updateAction({ duration: Number(e.target.value) || 1 })}
                          />
                        </label>
                      )}

                      {editing.action.type === 'meta' && (
                        <>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-1.5 text-sm text-muted-foreground">
                              <span>Meta 服务 *</span>
                              <Input
                                value={editing.action.meta_service || ''}
                                onChange={(e) => updateAction({ meta_service: e.target.value })}
                                placeholder="localization / navigation / ..."
                              />
                            </label>
                            <label className="grid gap-1.5 text-sm text-muted-foreground">
                              <span>方法名 *</span>
                              <Input
                                value={editing.action.meta_method || ''}
                                onChange={(e) => updateAction({ meta_method: e.target.value })}
                                placeholder="get_status / start_mapping / ..."
                              />
                            </label>
                          </div>
                          <label className="grid gap-1.5 text-sm text-muted-foreground">
                            <span>Kwargs JSON（支持 {'{{param}}'} 占位符）</span>
                            <textarea
                              rows={4}
                              value={requestJson}
                              onChange={(e) => setRequestJson(e.target.value)}
                              className="min-h-[110px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
                            />
                          </label>
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={editing.action.deactivate_after === true}
                              onCheckedChange={(checked) => updateAction({ deactivate_after: checked })}
                            />
                            <span className="text-sm text-muted-foreground">完成后停用此服务（默认值，可在任务编排中覆盖）</span>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/70 bg-card/90">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                      <CardTitle className="text-sm">参数定义</CardTitle>
                      <Button type="button" variant="outline" size="sm" onClick={addParam}>
                        <Plus className="mr-2 h-4 w-4" />
                        添加
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {editing.parameters.length === 0 && (
                        <div className="text-sm text-muted-foreground">无自定义参数</div>
                      )}
                      {editing.parameters.map((param, idx) => (
                        <div key={idx} className="rounded-lg border border-border/60 bg-muted/15 p-3">
                          <div className="grid gap-3 xl:grid-cols-[80px_100px_120px_120px_minmax(0,1fr)_auto]">
                            <Input
                              value={param.key}
                              onChange={(e) => updateParam(idx, { key: e.target.value })}
                              placeholder="key"
                            />
                            <Input
                              value={param.label}
                              onChange={(e) => updateParam(idx, { label: e.target.value })}
                              placeholder="显示名"
                            />
                            <select
                              value={param.type}
                              onChange={(e) => updateParam(idx, { type: e.target.value as CustomStepParamDef['type'] })}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                            >
                              {PARAM_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                            <Input
                              value={String(param.default_value ?? '')}
                              onChange={(e) => updateParam(idx, { default_value: parseParamDefaultValue(param.type, e.target.value) })}
                              placeholder="默认值"
                            />
                            {param.type === 'select' ? (
                              <Input
                                value={(param.options || []).map((option) => `${option.value}:${option.label}`).join(',')}
                                onChange={(e) => {
                                  const options = e.target.value
                                    .split(',')
                                    .filter(Boolean)
                                    .map((entry) => {
                                      const [value, label] = entry.split(':');
                                      return {
                                        value: value?.trim() || '',
                                        label: label?.trim() || value?.trim() || '',
                                      };
                                    });
                                  updateParam(idx, { options });
                                }}
                                placeholder="val:标签,val:标签"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={param.required === true}
                                  onCheckedChange={(checked) => updateParam(idx, { required: checked })}
                                />
                                <span className="text-sm text-muted-foreground">{param.required ? '必填' : '可选'}</span>
                              </div>
                            )}
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeParam(idx)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          {param.type === 'select' && (
                            <div className="mt-3 flex items-center gap-2">
                              <Switch
                                checked={param.required === true}
                                onCheckedChange={(checked) => updateParam(idx, { required: checked })}
                              />
                              <span className="text-sm text-muted-foreground">{param.required ? '必填' : '可选'}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button type="button" onClick={handleSave}>
                      {isNew ? '创建' : '保存修改'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-border/70 px-6 py-4 sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除自定义步骤</DialogTitle>
            <DialogDescription>确认删除 {deleteTarget}？删除后相关任务步骤需要重新配置。</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button type="button" variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
