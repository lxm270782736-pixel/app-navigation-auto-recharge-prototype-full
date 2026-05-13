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
  Switch,
} from '@astribot/ui';
import { Pencil, Play, RefreshCw, Save } from 'lucide-react';
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
      <Card className="max-w-5xl border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Meta 服务配置</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                配置一键启动会激活哪些 meta 服务，以及各服务的默认参数。修改 config 后，已 active 的服务需要下次 deactivate → activate 才会生效。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleStartMeta} disabled={starting}>
                <Play className="mr-2 h-4 w-4" />
                一键启动
              </Button>
              <Button type="button" variant="outline" onClick={() => { void load(); void pollStatus(); }} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重载
              </Button>
              <Button type="button" onClick={handleSaveAll} disabled={!dirty || saving}>
                <Save className="mr-2 h-4 w-4" />
                {dirty ? '保存 *' : '保存'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {services.map((service, idx) => {
            const state = getServiceState(service.name);
            const badge = STATE_BADGE[state] || STATE_BADGE.disconnected;
            return (
              <div
                key={service.name}
                className="grid gap-3 rounded-lg border border-border/70 bg-background/40 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{service.name}</span>
                    <Badge className={badge.className}>{badge.text}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {Object.keys(service.config).length} 项配置
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 sm:min-w-40">
                  <span className="text-sm text-foreground">随启动</span>
                  <Switch checked={service.startup} onCheckedChange={(checked) => handleToggleStartup(idx, checked)} />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 sm:min-w-44">
                  <span className="text-sm text-foreground">步骤后停用</span>
                  <Switch
                    checked={service.deactivate_after_step === true}
                    onCheckedChange={(checked) => handleToggleDeactivate(idx, checked)}
                  />
                </div>

                <div className="flex items-center justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => handleOpenConfigEditor(idx)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    编辑配置
                  </Button>
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
    </>
  );
};
