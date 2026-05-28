import React, { useEffect, useRef, useState } from 'react';
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
  Label,
  Switch,
} from '@astribot/ui';
import { Pencil, Play, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { apiService } from '@/services/api';

interface ServiceEntry {
  name: string;
  startup: boolean;
  deactivate_after_step?: boolean;
  display_name?: string;
  config: Record<string, any>;
}

interface ServiceStatus {
  name: string;
  state: string;
  startup: boolean;
}

const STATE_BADGE: Record<string, { className: string; text: string }> = {
  active: { className: 'bg-emerald-500/15 text-emerald-200', text: '运行中' },
  inactive: { className: 'bg-amber-500/15 text-amber-200', text: '已停用' },
  unconfigured: { className: 'bg-sky-500/15 text-sky-200', text: '未配置' },
  disconnected: { className: 'bg-muted text-muted-foreground', text: '未连接' },
  finalized: { className: 'bg-red-500/15 text-red-200', text: '已关闭' },
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
  const [notice, setNotice] = useState<string | null>(null);
  const [addingOpen, setAddingOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newConfigDraft, setNewConfigDraft] = useState('{}');
  const [newError, setNewError] = useState('');
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiService.getMetaServicesConfig();
      setServices(data.services || []);
      setDirty(false);
      setNotice(null);
    } catch {
      setNotice('加载服务配置失败');
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = async (refresh: boolean = false) => {
    try {
      const data = await apiService.getMetaStatus(refresh) as any;
      if (data.services) {
        setStatuses(data.services);
      }
    } catch {
      return;
    }
  };

  useEffect(() => {
    void load();
    void pollStatus(true);
    pollRef.current = setInterval(() => {
      void pollStatus();
    }, 3000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
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

  const handleChangeDisplayName = (idx: number, value: string) => {
    const next = [...services];
    next[idx] = { ...next[idx], display_name: value };
    setServices(next);
    setDirty(true);
  };

  const handleAddService = () => {
    const name = newName.trim();
    if (!name.startsWith('meta.')) {
      setNewError('服务名必须以 meta. 开头');
      return;
    }
    if (services.some((s) => s.name === name)) {
      setNewError('服务已存在');
      return;
    }
    let parsed: Record<string, any> = {};
    try {
      const draft = newConfigDraft.trim() || '{}';
      parsed = JSON.parse(draft);
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        setNewError('config 必须是 JSON 对象');
        return;
      }
    } catch (error: any) {
      setNewError(`config JSON 解析失败: ${error.message}`);
      return;
    }
    setServices([
      ...services,
      {
        name,
        startup: false,
        deactivate_after_step: false,
        display_name: newDisplayName.trim(),
        config: parsed,
      },
    ]);
    setDirty(true);
    setAddingOpen(false);
    setNewName('');
    setNewDisplayName('');
    setNewConfigDraft('{}');
    setNewError('');
    setNotice('已新增服务草稿，记得保存');
  };

  const handleConfirmRemove = () => {
    if (removingIdx === null) return;
    const removed = services[removingIdx];
    setServices(services.filter((_, i) => i !== removingIdx));
    setDirty(true);
    setRemovingIdx(null);
    setNotice(`已移除 ${removed.name} 草稿，记得保存`);
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
      setNotice('服务配置草稿已更新');
    } catch (error: any) {
      setConfigError(`JSON 解析失败: ${error.message}`);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const result = await apiService.updateMetaServicesConfig(services);
      if (result.success) {
        setNotice(result.message || '已保存');
        setDirty(false);
      } else {
        setNotice(result.message || '保存失败');
      }
    } catch {
      setNotice('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleStartMeta = async () => {
    setStarting(true);
    try {
      const result = await apiService.startMeta();
      setNotice(result.success ? '启动完成' : '部分服务启动失败');
      void pollStatus();
    } catch {
      setNotice('启动失败');
    } finally {
      setStarting(false);
    }
  };

  const getServiceState = (name: string): string => {
    const current = statuses.find((status) => status.name === name);
    return current?.state || 'disconnected';
  };

  return (
    <>
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="space-y-3 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Meta 服务配置</CardTitle>
            <p className="text-sm text-muted-foreground">
              配置一键启动会激活哪些 meta 服务，以及各服务的默认参数。修改 config 后，已 active 的服务需要下次 deactivate → activate 才会生效。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleStartMeta} disabled={starting}>
              <Play className="mr-2 h-4 w-4" />
              一键启动
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { void load(); void pollStatus(); }} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重载
            </Button>
            <span className="hidden h-5 w-px bg-border/70 sm:block" />
            <Button type="button" variant="outline" size="sm" onClick={() => setAddingOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              新增服务
            </Button>
            <Button type="button" size="sm" onClick={handleSaveAll} disabled={!dirty || saving}>
              <Save className="mr-2 h-4 w-4" />
              {dirty ? '保存 *' : '保存'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {services.map((service, idx) => {
            const state = getServiceState(service.name);
            const badge = STATE_BADGE[state] || STATE_BADGE.disconnected;
            return (
              <div
                key={service.name}
                className="space-y-3 rounded-lg border border-border/70 bg-background/40 p-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="truncate font-medium text-foreground">{service.name}</span>
                  <Badge className={badge.className}>{badge.text}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {Object.keys(service.config).length} 项配置
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => handleOpenConfigEditor(idx)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      编辑配置
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRemovingIdx(idx)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <div className="flex items-center gap-2">
                    <Label className="shrink-0 text-xs text-muted-foreground">显示名</Label>
                    <Input
                      value={service.display_name ?? ''}
                      onChange={(event) => handleChangeDisplayName(idx, event.target.value)}
                      placeholder="例如：定位"
                      className="h-9 text-sm"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-1.5 md:min-w-36">
                    <span className="text-sm text-foreground">随启动</span>
                    <Switch checked={service.startup} onCheckedChange={(checked) => handleToggleStartup(idx, checked)} />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-1.5 md:min-w-40">
                    <span className="text-sm text-foreground">步骤后停用</span>
                    <Switch
                      checked={service.deactivate_after_step === true}
                      onCheckedChange={(checked) => handleToggleDeactivate(idx, checked)}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {loading && <p className="text-sm text-muted-foreground">加载服务配置中...</p>}
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        </CardContent>
      </Card>

      <Dialog open={editingIdx !== null} onOpenChange={(open) => !open && setEditingIdx(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingIdx !== null ? `编辑 ${services[editingIdx]?.name} 的 config` : '编辑 config'}
            </DialogTitle>
            <DialogDescription>直接编辑 JSON。保存后仍需要点击页面主操作区的“保存”。</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <textarea
              rows={16}
              value={configDraft}
              onChange={(event) => {
                setConfigDraft(event.target.value);
                setConfigError('');
              }}
              className="min-h-80 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
            />
            {configError && <div className="text-sm text-red-300">{configError}</div>}
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setEditingIdx(null)}>
              取消
            </Button>
            <Button type="button" onClick={handleSaveConfig}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addingOpen} onOpenChange={(open) => { if (!open) { setAddingOpen(false); setNewError(''); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新增 Meta 服务</DialogTitle>
            <DialogDescription>新增草稿后请点击工具栏「保存」写入配置文件。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>服务名（必须以 meta. 开头）</Label>
              <Input
                value={newName}
                onChange={(event) => { setNewName(event.target.value); setNewError(''); }}
                placeholder="meta.example"
              />
            </div>
            <div className="space-y-1">
              <Label>显示名（可选，UI 中显示的中文标题）</Label>
              <Input
                value={newDisplayName}
                onChange={(event) => setNewDisplayName(event.target.value)}
                placeholder="例如：示例服务"
              />
            </div>
            <div className="space-y-1">
              <Label>初始 config（JSON 对象）</Label>
              <textarea
                rows={8}
                value={newConfigDraft}
                onChange={(event) => { setNewConfigDraft(event.target.value); setNewError(''); }}
                className="min-h-40 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
              />
            </div>
            {newError && <div className="text-sm text-red-300">{newError}</div>}
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => { setAddingOpen(false); setNewError(''); }}>
              取消
            </Button>
            <Button type="button" onClick={handleAddService}>
              新增
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removingIdx !== null} onOpenChange={(open) => !open && setRemovingIdx(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>移除服务</DialogTitle>
            <DialogDescription>
              {removingIdx !== null
                ? `确认从配置中移除 ${services[removingIdx]?.name}？此操作仅修改草稿，保存后才会写入配置文件。`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setRemovingIdx(null)}>
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmRemove}>
              移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
