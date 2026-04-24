import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button as UIButton,
  Card as UICard,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from '@astribot/ui';
import { Check, CheckCircle2, Image as ImageIcon, RefreshCw, Trash2, X } from 'lucide-react';
import { apiService } from '@/services/api';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import type { Alert, CustomStepDefinition, PatrolRecord } from '@/types';

const STATUS_TAGS: Record<string, { tone: string; text: string }> = {
  completed: { tone: 'bg-emerald-500/15 text-emerald-300', text: '已完成' },
  running: { tone: 'bg-sky-500/15 text-sky-300', text: '进行中' },
  stopped: { tone: 'bg-amber-500/15 text-amber-300', text: '已停止' },
  failed: { tone: 'bg-destructive/15 text-destructive', text: '失败' },
};

const STEP_LABELS: Record<string, string> = {
  navigate: '导航',
  open_door: '开门',
  close_door: '关门',
  detect_bed: '在床检测',
  detect_floor: '地面检测',
  photo: '拍照',
  wait: '等待',
  preparing: '准备',
  returning: '返回起点',
};

const TARGET_LABELS: Record<string, string> = {
  door_outside: '门外',
  door_inside: '门内',
  bed_check: '床位',
  start_position: '起点',
};

const ALERT_TYPES: Record<string, string> = {
  bed_absence: '老人离床',
  floor_clutter: '地面杂物',
  floor_water: '地面水渍',
  fall_detected: '老人跌倒',
  robot_stuck: '机器人卡住',
  task_failed: '任务失败',
};

const ALERT_STATUS: Record<string, { tone: string; text: string }> = {
  new: { tone: 'bg-destructive/15 text-destructive', text: '新告警' },
  processing: { tone: 'bg-amber-500/15 text-amber-300', text: '处理中' },
  closed: { tone: 'bg-emerald-500/15 text-emerald-300', text: '已处置' },
};

export const HistoryTab: React.FC = () => {
  const { connectionStatus } = useRobot();
  const [records, setRecords] = useState<PatrolRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PatrolRecord | null>(null);
  const [recordAlerts, setRecordAlerts] = useState<Alert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [customStepTypes, setCustomStepTypes] = useState<CustomStepDefinition[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const stepLabels = useMemo(() => {
    const labels = { ...STEP_LABELS };
    for (const d of customStepTypes) labels[`custom:${d.id}`] = d.name;
    return labels;
  }, [customStepTypes]);

  const loadData = useCallback(async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    setLoading(true);
    try {
      const [recordsData, customData] = await Promise.all([
        apiService.getPatrolRecords(),
        apiService.getCustomStepTypes().catch(() => ({ custom_step_types: [] })),
      ]);
      setRecords(Array.isArray(recordsData) ? recordsData : []);
      setCustomStepTypes(customData.custom_step_types || []);
    } catch (e) {
      console.warn('Failed to load history:', e);
    } finally {
      setLoading(false);
    }
  }, [connectionStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSelectRecord = useCallback(async (record: PatrolRecord) => {
    setSelectedRecord(record);
    setRecordAlerts([]);
    try {
      const filtered = await apiService.getAlerts({ patrol_id: record.id });
      setRecordAlerts(Array.isArray(filtered) ? filtered : []);
    } catch (e) {
      console.warn('Failed to load alerts for record:', e);
    }
  }, []);

  const handleConfirmAlert = async (alert: Alert) => {
    setActionLoading(alert.id);
    const date = alert.created_at?.split('T')[0] ?? new Date().toISOString().split('T')[0];
    const result = await apiService.confirmAlert(date, alert.id);
    setActionLoading(null);
    if (result.success) {
      setNotice({ tone: 'success', text: '告警已确认' });
      if (selectedRecord) handleSelectRecord(selectedRecord);
    } else {
      setNotice({ tone: 'error', text: result.message || '操作失败，请重试' });
    }
  };

  const handleCloseAlert = async (alert: Alert) => {
    setActionLoading(alert.id);
    const date = alert.created_at?.split('T')[0] ?? new Date().toISOString().split('T')[0];
    const result = await apiService.closeAlert(date, alert.id);
    setActionLoading(null);
    if (result.success) {
      setNotice({ tone: 'success', text: '已处置' });
      if (selectedAlert?.id === alert.id) setSelectedAlert(null);
      if (selectedRecord) handleSelectRecord(selectedRecord);
    } else {
      setNotice({ tone: 'error', text: result.message || '操作失败，请重试' });
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedRowKeys.length) return;
    setDeleteLoading(true);
    const toDelete = records
      .filter((r) => selectedRowKeys.includes(r.id))
      .map((r) => ({ id: r.id, date: r.started_at?.split('T')[0] ?? '' }));
    try {
      const result = await apiService.deletePatrolRecords(toDelete);
      if (result.success) {
        setNotice({ tone: 'success', text: `已删除 ${result.deleted} 条记录` });
        setSelectedRowKeys([]);
        if (selectedRecord && selectedRowKeys.includes(selectedRecord.id)) {
          setSelectedRecord(null);
          setRecordAlerts([]);
        }
        await loadData();
      } else {
        setNotice({ tone: 'error', text: '删除失败' });
      }
    } catch (e) {
      setNotice({ tone: 'error', text: '删除失败' });
    } finally {
      setDeleteLoading(false);
      setConfirmDeleteOpen(false);
    }
  };

  const allSelected = records.length > 0 && selectedRowKeys.length === records.length;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto bg-background p-4">
      <UICard className="border-border/70 bg-card/90">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm">导览记录</CardTitle>
          <div className="flex items-center gap-2">
            {selectedRowKeys.length > 0 && (
              <UIButton type="button" variant="destructive" size="sm" disabled={deleteLoading} onClick={() => setConfirmDeleteOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                删除 ({selectedRowKeys.length})
              </UIButton>
            )}
            <UIButton type="button" variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </UIButton>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {notice && (
            <div
              className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                notice.tone === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-destructive/40 bg-destructive/10 text-destructive'
              )}
            >
              {notice.text}
            </div>
          )}

          {records.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              暂无导览记录
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/70">
              <div className="grid grid-cols-[40px_minmax(120px,1fr)_180px_90px_70px_70px_70px] border-b border-border/70 bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                <label className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelectedRowKeys(allSelected ? [] : records.map((record) => record.id))}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                </label>
                <div>任务</div>
                <div>时间</div>
                <div>状态</div>
                <div>区域数</div>
                <div>完成</div>
                <div>失败</div>
              </div>
              <div className="divide-y divide-border/60">
                {records.map((record) => {
                  const status = STATUS_TAGS[record.status] || { tone: 'bg-muted text-muted-foreground', text: record.status };
                  const checked = selectedRowKeys.includes(record.id);
                  return (
                    <div
                      key={record.id}
                      className={cn(
                        'grid cursor-pointer grid-cols-[40px_minmax(120px,1fr)_180px_90px_70px_70px_70px] items-center px-3 py-2 text-sm transition',
                        selectedRecord?.id === record.id ? 'bg-primary/10' : 'bg-card/50 hover:bg-muted/20'
                      )}
                      onClick={() => handleSelectRecord(record)}
                    >
                      <label className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedRowKeys((prev) =>
                              checked ? prev.filter((id) => id !== record.id) : [...prev, record.id]
                            )
                          }
                          className="h-4 w-4 accent-[hsl(var(--primary))]"
                        />
                      </label>
                      <div className="truncate">{record.task_name || '-'}</div>
                      <div className="text-xs text-muted-foreground">{record.started_at?.replace('T', ' ')}</div>
                      <div><Badge className={status.tone}>{status.text}</Badge></div>
                      <div>{record.rooms_total}</div>
                      <div className="text-emerald-300">{record.rooms_completed}</div>
                      <div className={record.rooms_failed > 0 ? 'text-destructive' : 'text-foreground'}>{record.rooms_failed || 0}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </UICard>

      {selectedRecord && selectedRecord.room_results && (
        <UICard className="border-border/70 bg-card/90">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{`详情 — ${selectedRecord.id}`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const fallAlerts = recordAlerts.filter((a) => a.alert_type === 'fall_detected');
              if (fallAlerts.length === 0) return null;
              return (
                <UICard className="border-destructive/30 border-l-[3px] border-l-destructive bg-destructive/10">
                  <CardContent className="space-y-2 p-4">
                    <div className="font-semibold text-destructive">跌倒告警（全任务）</div>
                    <div className="space-y-2">
                      {fallAlerts.map((alert) => {
                        const st = ALERT_STATUS[alert.status] || { tone: 'bg-muted text-muted-foreground', text: alert.status };
                        return (
                          <div key={alert.id} className="flex cursor-pointer items-center gap-2 rounded-md bg-background px-2 py-2" onClick={() => setSelectedAlert(alert)}>
                            {alert.photo ? (
                              <img src={`data:image/png;base64,${alert.photo}`} className="h-8 w-8 shrink-0 rounded object-cover" />
                            ) : (
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="text-xs">
                                <Badge className={st.tone}>{st.text}</Badge>
                                <span className="ml-2">{alert.room_id} — 置信度 {alert.confidence ? `${(alert.confidence * 100).toFixed(0)}%` : '—'}</span>
                              </div>
                              <div className="text-[11px] text-muted-foreground">{alert.created_at?.replace('T', ' ')}</div>
                            </div>
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                              {alert.status === 'new' && (
                                <UIButton type="button" size="sm" variant="destructive" disabled={actionLoading === alert.id} onClick={() => handleConfirmAlert(alert)}>
                                  <Check className="mr-1 h-4 w-4" />
                                  确认
                                </UIButton>
                              )}
                              {alert.status === 'processing' && (
                                <UIButton type="button" size="sm" variant="outline" disabled={actionLoading === alert.id} onClick={() => handleCloseAlert(alert)}>
                                  <X className="mr-1 h-4 w-4" />
                                  已处置
                                </UIButton>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </UICard>
              );
            })()}

            {selectedRecord.room_results.map((room: any, idx: number) => {
              const roomAlerts = recordAlerts.filter((a) => a.room_id === room.room_id && a.alert_type !== 'fall_detected');
              return (
                <UICard
                  key={idx}
                  className={cn(
                    'border-l-[3px] border-border/70 bg-card/80',
                    room.status === 'success' ? 'border-l-emerald-500' : 'border-l-destructive'
                  )}
                >
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">{room.room_name || room.room_id}</div>
                        {room.error && <div className="mt-1 text-xs text-destructive">{room.error}</div>}
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {room.steps?.length ?? 0} 步骤 | {room.started_at?.replace('T', ' ')} ~ {room.finished_at?.replace('T', ' ')}
                        </div>
                      </div>
                      <Badge className={room.status === 'success' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-destructive/15 text-destructive'}>
                        {room.status}
                      </Badge>
                    </div>

                    {room.steps?.length > 0 && (
                      <div className="space-y-2 border-t border-border/60 pt-3">
                        {room.steps.map((step: any, si: number) => {
                          const isOk = step.status === 'success';
                          const label = stepLabels[step.step] || step.step;
                          const target = step.target ? (TARGET_LABELS[step.target] || step.target) : '';
                          const errorDetail = !isOk && step.detail?.error ? step.detail.error : '';
                          return (
                            <div key={si} className="rounded-md bg-background/60 px-3 py-2">
                              <div className="flex items-center gap-2 text-xs">
                                {isOk ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                                ) : (
                                  <X className="h-4 w-4 text-destructive" />
                                )}
                                <span className={cn('font-medium', !isOk && 'text-destructive')}>{label}</span>
                                {target && <span className="text-muted-foreground">→ {target}</span>}
                                {!isOk && <Badge className="bg-destructive/15 text-destructive">失败</Badge>}
                                <span className="ml-auto text-[11px] text-muted-foreground">
                                  {step.started_at?.slice(11)} ~ {step.finished_at?.slice(11)}
                                </span>
                              </div>
                              {!isOk && errorDetail && <div className="mt-2 pl-6 text-[11px] text-destructive">{errorDetail}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {roomAlerts.length > 0 && (
                      <div className="space-y-2 border-t border-border/60 pt-3">
                        <div className="text-[11px] text-muted-foreground">告警</div>
                        {roomAlerts.map((alert) => {
                          const st = ALERT_STATUS[alert.status] || { tone: 'bg-muted text-muted-foreground', text: alert.status };
                          return (
                            <div
                              key={alert.id}
                              className="flex cursor-pointer items-center gap-2 rounded-md border-l-[3px] border-l-amber-400 bg-background/70 px-3 py-2"
                              onClick={() => setSelectedAlert(alert)}
                            >
                              {alert.photo ? (
                                <img src={`data:image/png;base64,${alert.photo}`} className="h-8 w-8 shrink-0 rounded object-cover" />
                              ) : (
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40">
                                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="text-xs">
                                  <Badge className={st.tone}>{st.text}</Badge>
                                  <span className="ml-2">{ALERT_TYPES[alert.alert_type] || alert.alert_type}</span>
                                </div>
                                <div className="text-[11px] text-muted-foreground">{alert.created_at?.replace('T', ' ')}</div>
                              </div>
                              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                {alert.status === 'new' && (
                                  <UIButton type="button" size="sm" onClick={() => handleConfirmAlert(alert)} disabled={actionLoading === alert.id}>
                                    <Check className="mr-1 h-4 w-4" />
                                    确认
                                  </UIButton>
                                )}
                                {alert.status === 'processing' && (
                                  <UIButton type="button" size="sm" variant="outline" onClick={() => handleCloseAlert(alert)} disabled={actionLoading === alert.id}>
                                    <X className="mr-1 h-4 w-4" />
                                    已处置
                                  </UIButton>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </UICard>
              );
            })}
          </CardContent>
        </UICard>
      )}

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除导览记录</DialogTitle>
            <DialogDescription>{`确认删除选中的 ${selectedRowKeys.length} 条记录？`}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <UIButton type="button" variant="outline" onClick={() => setConfirmDeleteOpen(false)}>取消</UIButton>
            <UIButton type="button" variant="destructive" disabled={deleteLoading} onClick={handleDeleteSelected}>删除</UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedAlert} onOpenChange={(open) => !open && setSelectedAlert(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{selectedAlert ? `${ALERT_TYPES[selectedAlert.alert_type] || selectedAlert.alert_type} — ${selectedAlert.room_id}` : ''}</DialogTitle>
            <DialogDescription>查看告警详情、图片和处置状态。</DialogDescription>
          </DialogHeader>
          {selectedAlert && (
            <div className="space-y-4">
              {selectedAlert.photo ? (
                <img src={`data:image/png;base64,${selectedAlert.photo}`} className="w-full rounded-lg border border-border/70" />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                  <span className="ml-2">暂无图片</span>
                </div>
              )}
              <div className="grid gap-2 rounded-lg border border-border/70 bg-card/60 p-4 text-sm">
                <div><span className="text-muted-foreground">状态:</span> <Badge className={ALERT_STATUS[selectedAlert.status]?.tone || 'bg-muted text-muted-foreground'}>{ALERT_STATUS[selectedAlert.status]?.text || selectedAlert.status}</Badge></div>
                <div><span className="text-muted-foreground">区域:</span> {selectedAlert.room_id}</div>
                <div><span className="text-muted-foreground">类型:</span> {ALERT_TYPES[selectedAlert.alert_type] || selectedAlert.alert_type}</div>
                <div><span className="text-muted-foreground">置信度:</span> {selectedAlert.confidence ? `${(selectedAlert.confidence * 100).toFixed(0)}%` : '—'}</div>
                <div><span className="text-muted-foreground">告警内容:</span> {selectedAlert.message}</div>
                <div><span className="text-muted-foreground">创建时间:</span> {selectedAlert.created_at?.replace('T', ' ')}</div>
                {selectedAlert.confirmed_at && <div><span className="text-muted-foreground">确认时间:</span> {selectedAlert.confirmed_at?.replace('T', ' ')}</div>}
                {selectedAlert.closed_at && <div><span className="text-muted-foreground">处置时间:</span> {selectedAlert.closed_at?.replace('T', ' ')}</div>}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-end">
            {selectedAlert?.status === 'new' && (
              <UIButton type="button" onClick={() => handleConfirmAlert(selectedAlert)}>
                确认告警
              </UIButton>
            )}
            {selectedAlert?.status === 'processing' && (
              <UIButton type="button" variant="outline" onClick={() => handleCloseAlert(selectedAlert)}>
                标记已处置
              </UIButton>
            )}
            <UIButton type="button" variant="outline" onClick={() => setSelectedAlert(null)}>关闭</UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
