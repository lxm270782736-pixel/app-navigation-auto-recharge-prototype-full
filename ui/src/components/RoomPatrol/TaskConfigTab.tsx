import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Badge,
  Button as UIButton,
  Card as UICard,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch as UISwitch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@astribot/ui';
import { CircleAlert, Copy, GripVertical, Pencil, Plus, Settings2, Star, Trash2 } from 'lucide-react';
import { apiService } from '@/services/api';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import type { RoomConfig, RoomTaskStep, TaskPreset } from '@/types';
import type { CustomStepDefinition } from '@/types';
import { CustomStepManager } from './CustomStepManager';

// Available step types
const STEP_OPTIONS = [
  { value: 'navigate', label: '导航', desc: '导航到指定点位' },
  { value: 'open_door', label: '开门', desc: '打开区域门' },
  { value: 'close_door', label: '关门', desc: '关闭区域门' },
  { value: 'detect_bed', label: '在床检测', desc: '检测老人是否在床' },
  { value: 'detect_floor', label: '地面检测', desc: '检测杂物和水渍' },
  { value: 'photo', label: '拍照', desc: '拍摄照片' },
  { value: 'wait', label: '等待', desc: '停留等待' },
];

const DEFAULT_STEPS: RoomTaskStep[] = [
  { type: 'navigate', target: 'door_outside', retry_limit: 30 },
  { type: 'open_door' },
  { type: 'navigate', target: 'door_inside', retry_limit: 30 },
  { type: 'detect_floor' },
  { type: 'photo', label: '通道' },
  { type: 'navigate', target: 'bed_check', retry_limit: 30 },
  { type: 'detect_bed' },
  { type: 'photo', label: '床位' },
  { type: 'navigate', target: 'door_inside', retry_limit: 30 },
  { type: 'navigate', target: 'door_outside', retry_limit: 30 },
  { type: 'close_door' },
];

const buildNavTargetOptions = (roomConfig?: RoomConfig | null) => {
  const options = (roomConfig?.waypoints || []).map((wp) => ({
    value: wp.id,
    label: wp.name,
  }));
  options.push({ value: 'start_position', label: '起点' });
  return options;
};

const STEP_COLORS: Record<string, string> = {
  navigate: '#1890ff',
  open_door: '#52c41a',
  close_door: '#52c41a',
  detect_bed: '#ff4d4f',
  detect_floor: '#faad14',
  photo: '#722ed1',
  wait: '#999',
};

// 内置步骤对应的 meta 服务名（用于停用开关）
const BUILTIN_META_SERVICE: Record<string, string> = {
  navigate: 'meta.astribot_navigation',
  detect_bed: 'meta.detection',
  detect_floor: 'meta.detection',
};

// Draggable resize handle between columns
const ResizeHandle: React.FC<{
  onResize: (delta: number) => void;
}> = ({ onResize }) => {
  const [active, setActive] = useState(false);
  const startX = useRef(0);

  useEffect(() => {
    if (!active) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      startX.current = e.clientX;
      onResize(delta);
    };
    const onUp = () => setActive(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [active, onResize]);

  return (
    <div
      onMouseDown={e => { startX.current = e.clientX; setActive(true); }}
      className={cn(
        'relative z-[5] w-1.5 shrink-0 cursor-col-resize transition-colors',
        active ? 'bg-sky-500/30' : 'bg-transparent'
      )}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'rgba(24,144,255,0.15)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <div
        className={cn(
          'absolute left-1/2 top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-[1px] transition-colors',
          active ? 'bg-sky-500' : 'bg-border'
        )}
      />
    </div>
  );
};

// Sortable room item for drag-and-drop reorder
const SortableRoomItem: React.FC<{
  room: any;
  idx: number;
  isSelected: boolean;
  isReady: boolean;
  onSelect: () => void;
  onToggle: () => void;
}> = ({ room, idx, isSelected, isReady, onSelect, onToggle }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: room.room_id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : room.enabled ? 1 : 0.5,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'mb-2 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition',
        isSelected ? 'border-primary/50 bg-primary/10' : 'border-border/70 bg-card/90',
        !room.enabled && 'opacity-50'
      )}
      onClick={onSelect}
    >
      <span {...attributes} {...listeners} className="flex cursor-grab text-muted-foreground" onClick={e => e.stopPropagation()}>
        <GripVertical className="h-4 w-4" />
      </span>
      <input
        type="checkbox"
        checked={room.enabled}
        onChange={() => onToggle()}
        onClick={e => e.stopPropagation()}
        className="h-4 w-4 accent-[hsl(var(--primary))]"
      />
      <span className="flex-1 text-sm font-medium text-foreground">
        <span className="mr-1 text-[11px] text-muted-foreground">{idx + 1}.</span>
        {room.room_name || room.room_id}
      </span>
      {!isReady && <Badge className="bg-destructive/15 text-destructive">未录</Badge>}
    </div>
  );
};

// Sortable step item for drag-and-drop reorder
const SortableStepItem: React.FC<{
  id: string;
  borderColor: string;
  children: React.ReactNode;
}> = ({ id, borderColor, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="mb-2">
      <UICard className="border-l-[3px] border-border/70 bg-card/90 shadow-sm" style={{ borderLeftColor: borderColor }}>
        <CardContent className="flex items-center gap-2 p-3">
          <span {...attributes} {...listeners} className="flex cursor-grab text-muted-foreground">
            <GripVertical className="h-4 w-4" />
          </span>
          {children}
        </CardContent>
      </UICard>
    </div>
  );
};

export const TaskConfigTab: React.FC = () => {
  const { connectionStatus } = useRobot();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [presets, setPresets] = useState<TaskPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [roomConfigs, setRoomConfigs] = useState<RoomConfig[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [customStepTypes, setCustomStepTypes] = useState<CustomStepDefinition[]>([]);
  const [showManager, setShowManager] = useState(false);
  const [newPresetModal, setNewPresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Resizable column widths
  const [col1Width, setCol1Width] = useState(180);
  const [col2Width, setCol2Width] = useState(220);
  const handleResize1 = useCallback((delta: number) => setCol1Width(w => Math.max(120, Math.min(300, w + delta))), []);
  const handleResize2 = useCallback((delta: number) => setCol2Width(w => Math.max(160, Math.min(360, w + delta))), []);

  // The currently selected preset (editable in-memory)
  const [editingPreset, setEditingPreset] = useState<TaskPreset | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null);

  // Dynamic step options: built-in + custom
  const allStepOptions = useMemo(() => [
    ...STEP_OPTIONS,
    ...customStepTypes.map(d => ({
      value: `custom:${d.id}`, label: `⚡ ${d.name}`, desc: d.description,
    })),
  ], [customStepTypes]);

  const stepColors = useMemo(() => {
    const c: Record<string, string> = { ...STEP_COLORS };
    for (const d of customStepTypes) c[`custom:${d.id}`] = d.icon_color || '#8c8c8c';
    return c;
  }, [customStepTypes]);

  // Load all data
  const loadData = useCallback(async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    try {
      const [roomData, presetsData, customData] = await Promise.all([
        apiService.getRoomConfig(),
        apiService.getTaskPresets().catch(() => ({ presets: [] })),
        apiService.getCustomStepTypes().catch(() => ({ custom_step_types: [] })),
      ]);
      const rooms = (roomData.rooms || []) as RoomConfig[];
      setRoomConfigs(rooms);
      setCustomStepTypes(customData.custom_step_types || []);
      const loadedPresets = presetsData.presets || [];
      setPresets(loadedPresets);

      // Auto-select default or first preset
      if (loadedPresets.length > 0) {
        setSelectedPresetId(prev => {
          const exists = loadedPresets.find((p: TaskPreset) => p.id === prev);
          if (exists) return prev;
          const def = loadedPresets.find((p: TaskPreset) => p.is_default);
          return def ? def.id : loadedPresets[0].id;
        });
      }
    } catch (e) {
      console.warn('Failed to load:', e);
    }
  }, [connectionStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  // When selectedPresetId changes, load that preset into editing state
  useEffect(() => {
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset) {
      // Merge with room configs: add any new rooms that have waypoints
      const existingIds = new Set(preset.rooms.map(r => r.room_id));
      const merged = [...preset.rooms];
      for (const r of roomConfigs) {
        if (!existingIds.has(r.room_id) && (r.waypoints || []).some(wp => wp.pose !== null)) {
          merged.push({ room_id: r.room_id, room_name: r.room_name, enabled: true, steps: [...DEFAULT_STEPS] });
        }
      }
      // 为旧数据的 navigate 步骤补默认 retry_limit
      for (const room of merged) {
        room.steps = room.steps.map(s =>
          s.type === 'navigate' && s.retry_limit === undefined ? { ...s, retry_limit: 30 } : s
        );
      }
      setEditingPreset({ ...preset, rooms: merged });
      setIsDirty(false);
      if (merged.length > 0) {
        setSelectedRoomId(prev => merged.find(r => r.room_id === prev) ? prev : merged[0].room_id);
      }
    } else {
      setEditingPreset(null);
    }
  }, [selectedPresetId, presets, roomConfigs]);

  const selectedRoom = editingPreset?.rooms.find(r => r.room_id === selectedRoomId);

  // Update rooms in editing preset
  const updateRooms = (rooms: TaskPreset['rooms']) => {
    if (!editingPreset) return;
    setEditingPreset({ ...editingPreset, rooms });
    setIsDirty(true);
  };

  // Update steps for selected room
  const updateSteps = (newSteps: RoomTaskStep[]) => {
    if (!editingPreset || !selectedRoomId) return;
    updateRooms(editingPreset.rooms.map(r =>
      r.room_id === selectedRoomId ? { ...r, steps: newSteps } : r
    ));
  };

  const addStep = () => {
    if (!selectedRoom) return;
    updateSteps([...selectedRoom.steps, { type: 'wait', duration: 1000 }]);
  };

  const removeStep = (idx: number) => {
    if (!selectedRoom) return;
    updateSteps(selectedRoom.steps.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, patch: Partial<RoomTaskStep>) => {
    if (!selectedRoom) return;
    const oldStep = selectedRoom.steps[idx];
    // 类型切换时清理旧类型的专属字段
    if (patch.type && patch.type !== oldStep.type) {
      if (patch.type === 'navigate') {
        // 切换到 navigate：设置默认 target + retry_limit，清理其他字段
        if (!patch.target) {
          const rc = roomConfigs.find(r => r.room_id === selectedRoomId);
          const firstWp = (rc?.waypoints || [])[0];
          patch.target = firstWp?.id || 'start_position';
        }
        if (oldStep.retry_limit === undefined) patch.retry_limit = 30;
        patch.params = undefined as any;
      } else {
        // 切换离开 navigate：清理 target + retry_limit
        (patch as any).target = undefined;
        (patch as any).retry_limit = undefined;
      }
      if (patch.type.startsWith('custom:')) {
        const customId = patch.type.split(':', 2)[1];
        const def = customStepTypes.find(d => d.id === customId);
        if (def) {
          const defaultParams: Record<string, any> = {};
          for (const p of def.parameters) {
            if (p.default_value !== undefined) defaultParams[p.key] = p.default_value;
          }
          patch.params = defaultParams;
        }
      }
    }
    // 合并时过滤掉 undefined 字段
    const merged = { ...oldStep, ...patch };
    if ((merged as any).target === undefined) delete (merged as any).target;
    updateSteps(selectedRoom.steps.map((s, i) => i === idx ? merged : s));
  };

  const applyDefault = () => {
    if (!selectedRoom) return;
    updateSteps([...DEFAULT_STEPS]);
    setNotice({ tone: 'success', text: '已应用默认巡检模板' });
  };

  // Save current editing preset to backend
  const handleSave = async () => {
    if (!editingPreset) return;
    const result = await apiService.saveTaskPreset(editingPreset);
    if (result.success) {
      setNotice({ tone: 'success', text: '已保存' });
      setIsDirty(false);
      loadData();
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  // Preset management
  const handleNewPreset = async () => {
    if (!newPresetName.trim()) { setNotice({ tone: 'error', text: '请输入任务名称' }); return; }
    const preset: any = {
      id: '',
      name: newPresetName.trim(),
      description: '',
      is_default: presets.length === 0,
      rooms: roomConfigs.filter(r => (r.waypoints || []).some(wp => wp.pose !== null)).map(r => ({
        room_id: r.room_id, room_name: r.room_name, enabled: true, steps: [...DEFAULT_STEPS],
      })),
      retry_limit: 3,
      fall_detection_enabled: true,
    };
    const result = await apiService.saveTaskPreset(preset);
    if (result.success) {
      setNotice({ tone: 'success', text: '已创建' });
      setNewPresetModal(false);
      setNewPresetName('');
      await loadData();
      if (result.preset_id) setSelectedPresetId(result.preset_id);
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  const handleDuplicate = async (presetId: string) => {
    const source = presets.find(p => p.id === presetId);
    const result = await apiService.duplicateTaskPreset(presetId, `${source?.name || '任务'} 副本`);
    if (result.success) {
      setNotice({ tone: 'success', text: '已复制' });
      await loadData();
      if (result.preset?.id) setSelectedPresetId(result.preset.id);
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    const result = await apiService.deleteTaskPreset(presetId);
    if (result.success) {
      setNotice({ tone: 'success', text: '已删除' });
      if (selectedPresetId === presetId) setSelectedPresetId('');
      loadData();
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  const handleSetDefault = async (presetId: string) => {
    const result = await apiService.setDefaultPreset(presetId);
    if (result.success) {
      setNotice({ tone: 'success', text: '已设为默认' });
      loadData();
    }
  };

  // Room toggles
  const toggleRoom = (roomId: string) => {
    if (!editingPreset) return;
    updateRooms(editingPreset.rooms.map(r =>
      r.room_id === roomId ? { ...r, enabled: !r.enabled } : r
    ));
  };

  const allEnabled = editingPreset?.rooms.every(r => r.enabled) ?? false;
  const toggleAll = () => {
    if (!editingPreset) return;
    const v = !allEnabled;
    updateRooms(editingPreset.rooms.map(r => ({ ...r, enabled: v })));
  };

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleRoomDragEnd = (event: DragEndEvent) => {
    if (!editingPreset) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const rooms = [...editingPreset.rooms];
    const oldIdx = rooms.findIndex(r => r.room_id === active.id);
    const newIdx = rooms.findIndex(r => r.room_id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const [moved] = rooms.splice(oldIdx, 1);
    rooms.splice(newIdx, 0, moved);
    updateRooms(rooms);
  };

  const handleStepDragEnd = (event: DragEndEvent) => {
    if (!selectedRoom) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = Number(String(active.id).replace('step-', ''));
    const newIdx = Number(String(over.id).replace('step-', ''));
    if (isNaN(oldIdx) || isNaN(newIdx)) return;
    updateSteps(arrayMove(selectedRoom.steps, oldIdx, newIdx));
  };

  const stepIds = useMemo(
    () => (selectedRoom?.steps || []).map((_, i) => `step-${i}`),
    [selectedRoom?.steps],
  );

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Col 1: Preset list */}
      <div style={{ width: col1Width }} className="flex shrink-0 flex-col overflow-y-auto p-3">
        <div className="mb-3 text-sm font-semibold text-foreground">任务管理</div>

        {notice && (
          <div
            className={cn(
              'mb-3 rounded-lg border px-3 py-2 text-sm',
              notice.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-destructive/40 bg-destructive/10 text-destructive'
            )}
          >
            {notice.text}
          </div>
        )}

        {presets.length === 0 && <div className="mt-8 text-center text-sm text-muted-foreground">暂无任务</div>}

        {presets.map(p => (
          <div
            key={p.id}
            onClick={() => setSelectedPresetId(p.id)}
            className={cn(
              'mb-2 cursor-pointer rounded-lg border px-3 py-2 transition',
              selectedPresetId === p.id ? 'border-primary/50 bg-primary/10' : 'border-border/70 bg-card/90'
            )}
          >
            <div className="flex items-center justify-between">
              {renamingId === p.id ? (
                <Input
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key !== 'Enter' || !renameValue.trim()) return;
                    const target = presets.find(x => x.id === p.id);
                    if (target) {
                      await apiService.saveTaskPreset({ ...target, name: renameValue.trim() });
                      loadData();
                    }
                    setRenamingId(null);
                  }}
                  onBlur={() => setRenamingId(null)}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                  className="h-8"
                />
              ) : (
                <span className="text-sm font-medium text-foreground">
                  {p.is_default ? <Star className="mr-1 inline h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /> : null}
                  {p.name}
                  {selectedPresetId === p.id && isDirty && (
                    <CircleAlert className="ml-1 inline h-3.5 w-3.5 text-yellow-400" />
                  )}
                </span>
              )}
            </div>
            <div className="mt-2 flex gap-1">
              <UIButton
                type="button"
                variant="ghost"
                size="icon"
                title="重命名"
                onClick={e => { e.stopPropagation(); setRenamingId(p.id); setRenameValue(p.name); }}
              >
                <Pencil className="h-4 w-4" />
              </UIButton>
              {!p.is_default && (
                <UIButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="设为默认"
                  onClick={e => { e.stopPropagation(); handleSetDefault(p.id); }}
                >
                  <Star className="h-4 w-4" />
                </UIButton>
              )}
              <UIButton
                type="button"
                variant="ghost"
                size="icon"
                title="复制"
                onClick={e => { e.stopPropagation(); handleDuplicate(p.id); }}
              >
                <Copy className="h-4 w-4" />
              </UIButton>
              <UIButton
                type="button"
                variant="ghost"
                size="icon"
                title="删除"
                onClick={e => { e.stopPropagation(); setDeletePresetId(p.id); }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </UIButton>
            </div>
          </div>
        ))}

        <UIButton type="button" variant="outline" className="mt-2 w-full" onClick={() => setNewPresetModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          新建任务
        </UIButton>
      </div>

      <ResizeHandle onResize={handleResize1} />

      {/* Col 2: Room list */}
      <div style={{ width: col2Width }} className="flex shrink-0 flex-col overflow-y-auto p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">导览顺序</span>
          {editingPreset && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              跌倒检测
              <UISwitch
                checked={editingPreset.fall_detection_enabled ?? true}
                onCheckedChange={v => setEditingPreset({ ...editingPreset, fall_detection_enabled: v })}
              />
            </span>
          )}
        </div>
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={allEnabled}
              onChange={toggleAll}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            全选
          </label>
        </div>
        <div className="mb-3 text-xs text-muted-foreground">拖拽调整顺序，勾选参与导览的区域</div>

        {!editingPreset ? (
          <div className="mt-10 text-center text-sm text-muted-foreground">选择左侧任务</div>
        ) : editingPreset.rooms.length === 0 ? (
          <div className="mt-10 text-center text-sm text-muted-foreground">请先在「点位录制」录制区域</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRoomDragEnd}>
            <SortableContext items={editingPreset.rooms.map(r => r.room_id)} strategy={verticalListSortingStrategy}>
              {editingPreset.rooms.map((room, idx) => {
                const rc = roomConfigs.find(r => r.room_id === room.room_id);
                const isReady = rc ? (rc.waypoints || []).some(wp => wp.pose !== null) : false;
                return (
                  <SortableRoomItem
                    key={room.room_id}
                    room={room}
                    idx={idx}
                    isSelected={selectedRoomId === room.room_id}
                    isReady={isReady}
                    onSelect={() => setSelectedRoomId(room.room_id)}
                    onToggle={() => toggleRoom(room.room_id)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <ResizeHandle onResize={handleResize2} />

      {/* Col 3: Step editor */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/70 bg-card/70 px-4 py-3">
          <span className="text-sm font-semibold text-foreground">{selectedRoom?.room_name || '选择区域'}</span>
          <div className="flex-1" />
          <UIButton type="button" variant="outline" size="sm" onClick={() => setShowManager(true)}>
            <Settings2 className="mr-2 h-4 w-4" />
            自定义步骤
          </UIButton>
          <UIButton type="button" variant="outline" size="sm" onClick={applyDefault} disabled={!selectedRoom}>默认模板</UIButton>
          <UIButton type="button" variant="outline" size="sm" onClick={addStep} disabled={!selectedRoom}>
            <Plus className="mr-2 h-4 w-4" />
            添加步骤
          </UIButton>
          <UIButton type="button" size="sm" onClick={handleSave} disabled={!editingPreset}>
            {isDirty ? '保存配置 *' : '保存配置'}
          </UIButton>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!selectedRoom ? (
            <div className="mt-10 text-center text-sm text-muted-foreground">
              {editingPreset ? '选择区域编辑步骤' : '选择左侧任务'}
            </div>
          ) : selectedRoom.steps.length === 0 ? (
            <div className="mt-10 text-center text-sm text-muted-foreground">
              暂无步骤，点击「默认模板」或「添加步骤」
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStepDragEnd}>
              <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
                {selectedRoom.steps.map((step, idx) => {
                  const isCustom = step.type.startsWith('custom:');
                  const customDef = isCustom ? customStepTypes.find(d => `custom:${d.id}` === step.type) : null;
                  return (
                    <SortableStepItem key={stepIds[idx]} id={stepIds[idx]} borderColor={stepColors[step.type] || '#999'}>
                      <span className="w-5 text-center text-xs font-semibold text-muted-foreground">{idx + 1}</span>
                      <UISwitch checked={step.enabled !== false} onCheckedChange={(v) => updateStep(idx, { enabled: v })} />
                      <select
                        value={step.type}
                        onChange={(e) => updateStep(idx, { type: e.target.value as any })}
                        className={cn(
                          'h-8 w-[140px] rounded-md border border-input bg-background px-2 text-xs text-foreground',
                          step.enabled === false && 'opacity-[0.45]'
                        )}
                        disabled={step.enabled === false}
                      >
                        {allStepOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {step.type === 'navigate' && (
                        <>
                          <select
                            value={step.target}
                            onChange={(e) => updateStep(idx, { target: e.target.value })}
                            className="h-8 w-[100px] rounded-md border border-input bg-background px-2 text-xs text-foreground"
                          >
                            {buildNavTargetOptions(roomConfigs.find(r => r.room_id === selectedRoomId)).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span className="flex items-center gap-1">
                            <span className="text-[11px] text-muted-foreground">重试:</span>
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              value={String(step.retry_limit ?? 30)}
                              onChange={(e) => updateStep(idx, { retry_limit: Number(e.target.value) || 30 })}
                              className="h-8 w-[70px]"
                            />
                          </span>
                        </>
                      )}
                      {step.type === 'wait' && (
                        <span className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={100}
                            step={500}
                            value={String(step.duration ?? 1000)}
                            onChange={(e) => updateStep(idx, { duration: Number(e.target.value) || 1000 })}
                            className="h-8 w-20"
                          />
                          <span className="text-[11px] text-muted-foreground">ms</span>
                        </span>
                      )}
                      {step.type === 'photo' && (
                        <Input
                          placeholder="标签"
                          value={step.label || ''}
                          onChange={(e) => updateStep(idx, { label: e.target.value })}
                          className="h-8 w-20"
                        />
                      )}
                      {isCustom && customDef && customDef.parameters.map(p => (
                        <span key={p.key} className="flex items-center gap-1">
                          <span className="text-[11px] text-muted-foreground">{p.label}:</span>
                          {p.type === 'number' && (
                            <Input
                              type="number"
                              value={String(step.params?.[p.key] ?? p.default_value ?? 0)}
                              onChange={e => updateStep(idx, { params: { ...step.params, [p.key]: Number(e.target.value) || 0 } })}
                              className="h-8 w-[60px]"
                            />
                          )}
                          {p.type === 'string' && <Input value={step.params?.[p.key] ?? p.default_value ?? ''} onChange={e => updateStep(idx, { params: { ...step.params, [p.key]: e.target.value } })} className="h-8 w-20" />}
                          {p.type === 'boolean' && <UISwitch checked={step.params?.[p.key] ?? p.default_value ?? false} onCheckedChange={v => updateStep(idx, { params: { ...step.params, [p.key]: v } })} />}
                          {p.type === 'select' && (
                            <select
                              value={String(step.params?.[p.key] ?? p.default_value ?? '')}
                              onChange={e => updateStep(idx, { params: { ...step.params, [p.key]: e.target.value } })}
                              className="h-8 w-20 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                            >
                              {(p.options || []).map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </span>
                      ))}
                      {isCustom && customDef?.action?.type === 'meta' && (
                        <span className="flex items-center gap-1">
                          <span className="text-[11px] text-muted-foreground">结束后停用:</span>
                          <UISwitch
                            checked={step.deactivate_after ?? customDef.action.deactivate_after ?? false}
                            onCheckedChange={v => updateStep(idx, { deactivate_after: v })}
                          />
                        </span>
                      )}
                      {!isCustom && BUILTIN_META_SERVICE[step.type] && (
                        <span className="flex items-center gap-1">
                          <span className="text-[11px] text-muted-foreground">结束后停用:</span>
                          <UISwitch
                            checked={step.deactivate_after ?? false}
                            onCheckedChange={v => updateStep(idx, { deactivate_after: v })}
                          />
                        </span>
                      )}
                      <div className="flex-1" />
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <UIButton type="button" variant="ghost" size="icon" onClick={() => removeStep(idx)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </UIButton>
                          </TooltipTrigger>
                          <TooltipContent>删除</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </SortableStepItem>
                  );
                })}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Modals */}
      <CustomStepManager open={showManager} onClose={() => { setShowManager(false); loadData(); }} />

      <Dialog open={newPresetModal} onOpenChange={(open) => {
        setNewPresetModal(open);
        if (!open) setNewPresetName('');
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建任务</DialogTitle>
            <DialogDescription>创建一个新的巡检任务预设，并自动带入当前已录制房间。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <label className="text-sm text-muted-foreground">任务名称 *</label>
            <Input
              placeholder="如: 标准巡检"
              value={newPresetName}
              onChange={e => setNewPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNewPreset();
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <UIButton type="button" variant="outline" onClick={() => setNewPresetModal(false)}>取消</UIButton>
            <UIButton type="button" onClick={handleNewPreset}>创建</UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletePresetId !== null} onOpenChange={(open) => !open && setDeletePresetId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除任务预设</DialogTitle>
            <DialogDescription>确认删除该任务预设？这不会删除已经生成的巡检历史。</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <UIButton type="button" variant="outline" onClick={() => setDeletePresetId(null)}>取消</UIButton>
            <UIButton
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!deletePresetId) return;
                await handleDeletePreset(deletePresetId);
                setDeletePresetId(null);
              }}
            >
              删除
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
