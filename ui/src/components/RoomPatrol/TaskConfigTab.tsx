import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Card, Select, Checkbox, message, Empty, Tag, Tooltip, Input, InputNumber, Switch, Modal, Popconfirm } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  HolderOutlined,
  SettingOutlined,
  CopyOutlined,
  StarOutlined,
  StarFilled,
  EditOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
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
import { apiService } from '@/services/api';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import type { RoomConfig, RoomTaskStep, TaskPreset } from '@/types';
import type { CustomStepDefinition } from '@/types';
import { CustomStepManager } from './CustomStepManager';

// Available step types
const STEP_OPTIONS = [
  { value: 'navigate', label: '导航', desc: '导航到指定点位' },
  { value: 'open_door', label: '开门', desc: '打开房间门' },
  { value: 'close_door', label: '关门', desc: '关闭房间门' },
  { value: 'detect_bed', label: '在床检测', desc: '检测老人是否在床' },
  { value: 'detect_floor', label: '地面检测', desc: '检测杂物和水渍' },
  { value: 'photo', label: '拍照', desc: '拍摄照片' },
  { value: 'wait', label: '等待', desc: '停留等待' },
];

const NAV_TARGETS = [
  { value: 'door_outside', label: '门外' },
  { value: 'door_inside', label: '门内' },
  { value: 'bed_check', label: '床位' },
  { value: 'start_position', label: '起点' },
];

// Default inspection steps for a room
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
      style={{
        width: 6,
        cursor: 'col-resize',
        background: active ? 'rgba(24,144,255,0.3)' : 'transparent',
        flexShrink: 0,
        position: 'relative',
        zIndex: 5,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'rgba(24,144,255,0.15)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 2, height: 24, borderRadius: 1, background: active ? '#1890ff' : '#d9d9d9',
        transition: 'background 0.15s',
      }} />
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
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        marginBottom: 4,
        borderRadius: 6,
        border: `1px solid ${isSelected ? '#1890ff' : '#f0f0f0'}`,
        background: isSelected ? '#e6f7ff' : '#fff',
        cursor: 'pointer',
      }}
      onClick={onSelect}
    >
      <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#999', display: 'flex' }} onClick={e => e.stopPropagation()}>
        <HolderOutlined />
      </span>
      <Checkbox
        checked={room.enabled}
        onChange={() => onToggle()}
        onClick={e => e.stopPropagation()}
      />
      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
        <span style={{ color: '#999', marginRight: 4, fontSize: 11 }}>{idx + 1}.</span>
        {room.room_name || room.room_id}
      </span>
      {!isReady && <Tag color="red" style={{ fontSize: 9, lineHeight: '16px', padding: '0 4px' }}>未录</Tag>}
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
    marginBottom: 8,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <Card size="small" style={{ borderLeft: `3px solid ${borderColor}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#999', display: 'flex' }}>
            <HolderOutlined />
          </span>
          {children}
        </div>
      </Card>
    </div>
  );
};

export const TaskConfigTab: React.FC = () => {
  const { connectionStatus } = useRobot();
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
        if (!existingIds.has(r.room_id) && r.door_outside && r.door_inside && r.bed_check) {
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
        if (!patch.target) patch.target = 'door_outside';
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
    message.success('已应用默认巡检模板');
  };

  // Save current editing preset to backend
  const handleSave = async () => {
    if (!editingPreset) return;
    const result = await apiService.saveTaskPreset(editingPreset);
    if (result.success) {
      message.success('已保存');
      setIsDirty(false);
      loadData();
    } else {
      message.error(result.message);
    }
  };

  // Preset management
  const handleNewPreset = async () => {
    if (!newPresetName.trim()) { message.error('请输入任务名称'); return; }
    const preset: any = {
      id: '',
      name: newPresetName.trim(),
      description: '',
      is_default: presets.length === 0,
      rooms: roomConfigs.filter(r => r.door_outside && r.door_inside && r.bed_check).map(r => ({
        room_id: r.room_id, room_name: r.room_name, enabled: true, steps: [...DEFAULT_STEPS],
      })),
      retry_limit: 3,
      fall_detection_enabled: true,
    };
    const result = await apiService.saveTaskPreset(preset);
    if (result.success) {
      message.success('已创建');
      setNewPresetModal(false);
      setNewPresetName('');
      await loadData();
      if (result.preset_id) setSelectedPresetId(result.preset_id);
    } else {
      message.error(result.message);
    }
  };

  const handleDuplicate = async (presetId: string) => {
    const source = presets.find(p => p.id === presetId);
    const result = await apiService.duplicateTaskPreset(presetId, `${source?.name || '任务'} 副本`);
    if (result.success) {
      message.success('已复制');
      await loadData();
      if (result.preset?.id) setSelectedPresetId(result.preset.id);
    } else {
      message.error(result.message);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    const result = await apiService.deleteTaskPreset(presetId);
    if (result.success) {
      message.success('已删除');
      if (selectedPresetId === presetId) setSelectedPresetId('');
      loadData();
    } else {
      message.error(result.message);
    }
  };

  const handleSetDefault = async (presetId: string) => {
    const result = await apiService.setDefaultPreset(presetId);
    if (result.success) {
      message.success('已设为默认');
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
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Col 1: Preset list */}
      <div style={{ width: col1Width, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>任务管理</div>

        {presets.length === 0 && <Empty description="暂无任务" style={{ marginTop: 30 }} />}

        {presets.map(p => (
          <div
            key={p.id}
            onClick={() => setSelectedPresetId(p.id)}
            style={{
              padding: '8px 10px',
              marginBottom: 4,
              borderRadius: 6,
              border: `1px solid ${selectedPresetId === p.id ? '#1890ff' : '#f0f0f0'}`,
              background: selectedPresetId === p.id ? '#e6f7ff' : '#fff',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {renamingId === p.id ? (
                <Input
                  size="small"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onPressEnter={async () => {
                    if (!renameValue.trim()) return;
                    const target = presets.find(x => x.id === p.id);
                    if (target) {
                      await apiService.saveTaskPreset({ ...target, name: renameValue.trim() });
                      loadData();
                    }
                    setRenamingId(null);
                  }}
                  onBlur={() => setRenamingId(null)}
                  autoFocus
                  style={{ width: '100%' }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {p.is_default ? <StarFilled style={{ color: '#faad14', marginRight: 4, fontSize: 11 }} /> : null}
                  {p.name}
                  {selectedPresetId === p.id && isDirty && (
                    <ExclamationCircleOutlined style={{ color: '#faad14', marginLeft: 4, fontSize: 11 }} />
                  )}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
              <Tooltip title="重命名">
                <Button size="small" type="text" icon={<EditOutlined />} style={{ fontSize: 11, padding: '0 2px' }}
                  onClick={e => { e.stopPropagation(); setRenamingId(p.id); setRenameValue(p.name); }} />
              </Tooltip>
              {!p.is_default && (
                <Tooltip title="设为默认">
                  <Button size="small" type="text" icon={<StarOutlined />} style={{ fontSize: 11, padding: '0 2px' }}
                    onClick={e => { e.stopPropagation(); handleSetDefault(p.id); }} />
                </Tooltip>
              )}
              <Tooltip title="复制">
                <Button size="small" type="text" icon={<CopyOutlined />} style={{ fontSize: 11, padding: '0 2px' }}
                  onClick={e => { e.stopPropagation(); handleDuplicate(p.id); }} />
              </Tooltip>
              <Popconfirm title="确认删除？" onConfirm={() => handleDeletePreset(p.id)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ fontSize: 11, padding: '0 2px' }}
                  onClick={e => e.stopPropagation()} />
              </Popconfirm>
            </div>
          </div>
        ))}

        <Button type="dashed" block icon={<PlusOutlined />} onClick={() => setNewPresetModal(true)} style={{ marginTop: 8 }}>
          新建任务
        </Button>
      </div>

      <ResizeHandle onResize={handleResize1} />

      {/* Col 2: Room list */}
      <div style={{ width: col2Width, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>巡房顺序</span>
          {editingPreset && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' }}>
              跌倒检测
              <Switch
                size="small"
                checked={editingPreset.fall_detection_enabled ?? true}
                onChange={v => setEditingPreset({ ...editingPreset, fall_detection_enabled: v })}
              />
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Checkbox checked={allEnabled} onChange={toggleAll} style={{ fontSize: 12 }}>全选</Checkbox>
        </div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>拖拽调整顺序，勾选参与巡房的房间</div>

        {!editingPreset ? (
          <Empty description="选择左侧任务" style={{ marginTop: 40 }} />
        ) : editingPreset.rooms.length === 0 ? (
          <Empty description="请先在「点位录制」录制房间" style={{ marginTop: 40 }} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRoomDragEnd}>
            <SortableContext items={editingPreset.rooms.map(r => r.room_id)} strategy={verticalListSortingStrategy}>
              {editingPreset.rooms.map((room, idx) => {
                const isReady = !!roomConfigs.find(r => r.room_id === room.room_id && r.door_outside && r.door_inside && r.bed_check);
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>{selectedRoom?.room_name || '选择房间'}</span>
          <div style={{ flex: 1 }} />
          <Button size="small" icon={<SettingOutlined />} onClick={() => setShowManager(true)}>自定义步骤</Button>
          <Button size="small" onClick={applyDefault} disabled={!selectedRoom}>默认模板</Button>
          <Button size="small" icon={<PlusOutlined />} onClick={addStep} disabled={!selectedRoom}>添加步骤</Button>
          <Button size="small" type="primary" icon={<SaveOutlined />} onClick={handleSave} disabled={!editingPreset}>
            {isDirty ? '保存配置 *' : '保存配置'}
          </Button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {!selectedRoom ? (
            <Empty description={editingPreset ? '选择房间编辑步骤' : '选择左侧任务'} />
          ) : selectedRoom.steps.length === 0 ? (
            <Empty description="暂无步骤，点击「默认模板」或「添加步骤」" />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStepDragEnd}>
              <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
                {selectedRoom.steps.map((step, idx) => {
                  const isCustom = step.type.startsWith('custom:');
                  const customDef = isCustom ? customStepTypes.find(d => `custom:${d.id}` === step.type) : null;
                  return (
                    <SortableStepItem key={stepIds[idx]} id={stepIds[idx]} borderColor={stepColors[step.type] || '#999'}>
                      <span style={{ fontWeight: 600, width: 20, textAlign: 'center', color: '#999', fontSize: 12 }}>{idx + 1}</span>
                      <Switch size="small" checked={step.enabled !== false} onChange={(v) => updateStep(idx, { enabled: v })} />
                      <Select
                        size="small"
                        value={step.type}
                        onChange={(v) => updateStep(idx, { type: v as any })}
                        style={{ width: 140, opacity: step.enabled === false ? 0.45 : 1 }}
                        disabled={step.enabled === false}
                        options={allStepOptions.map(o => ({ value: o.value, label: o.label }))}
                      />
                      {step.type === 'navigate' && (
                        <>
                          <Select size="small" value={step.target || 'door_outside'} onChange={(v) => updateStep(idx, { target: v })} style={{ width: 100 }} options={NAV_TARGETS} />
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 11, color: '#999' }}>重试:</span>
                            <InputNumber
                              size="small"
                              min={1}
                              max={100}
                              value={step.retry_limit ?? 30}
                              onChange={(v) => updateStep(idx, { retry_limit: v ?? 30 })}
                              style={{ width: 70 }}
                            />
                          </span>
                        </>
                      )}
                      {step.type === 'wait' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <InputNumber
                            size="small"
                            min={100}
                            step={500}
                            value={step.duration ?? 1000}
                            onChange={(v) => updateStep(idx, { duration: v ?? 1000 })}
                            style={{ width: 80 }}
                          />
                          <span style={{ fontSize: 11, color: '#999' }}>ms</span>
                        </span>
                      )}
                      {step.type === 'photo' && (
                        <input placeholder="标签" value={step.label || ''} onChange={(e) => updateStep(idx, { label: e.target.value })}
                          style={{ width: 80, fontSize: 12, border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 6px' }} />
                      )}
                      {isCustom && customDef && customDef.parameters.map(p => (
                        <span key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: 11, color: '#999' }}>{p.label}:</span>
                          {p.type === 'number' && <InputNumber size="small" value={step.params?.[p.key] ?? p.default_value} onChange={v => updateStep(idx, { params: { ...step.params, [p.key]: v } })} style={{ width: 60 }} />}
                          {p.type === 'string' && <Input size="small" value={step.params?.[p.key] ?? p.default_value ?? ''} onChange={e => updateStep(idx, { params: { ...step.params, [p.key]: e.target.value } })} style={{ width: 80 }} />}
                          {p.type === 'boolean' && <Switch size="small" checked={step.params?.[p.key] ?? p.default_value ?? false} onChange={v => updateStep(idx, { params: { ...step.params, [p.key]: v } })} />}
                          {p.type === 'select' && <Select size="small" value={step.params?.[p.key] ?? p.default_value} onChange={v => updateStep(idx, { params: { ...step.params, [p.key]: v } })} style={{ width: 80 }} options={p.options || []} />}
                        </span>
                      ))}
                      {isCustom && customDef?.action?.type === 'meta' && (
                        <Tooltip title="步骤完成后停用对应服务（释放资源，下次使用需重新激活）">
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 11, color: '#999' }}>结束后停用:</span>
                            <Switch
                              size="small"
                              checked={step.deactivate_after ?? customDef.action.deactivate_after ?? false}
                              onChange={v => updateStep(idx, { deactivate_after: v })}
                            />
                          </span>
                        </Tooltip>
                      )}
                      {!isCustom && BUILTIN_META_SERVICE[step.type] && (
                        <Tooltip title="步骤完成后停用对应服务（释放资源，下次使用需重新激活）">
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 11, color: '#999' }}>结束后停用:</span>
                            <Switch
                              size="small"
                              checked={step.deactivate_after ?? false}
                              onChange={v => updateStep(idx, { deactivate_after: v })}
                            />
                          </span>
                        </Tooltip>
                      )}
                      <div style={{ flex: 1 }} />
                      <Tooltip title="删除"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeStep(idx)} /></Tooltip>
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

      <Modal
        title="新建任务"
        open={newPresetModal}
        onOk={handleNewPreset}
        onCancel={() => { setNewPresetModal(false); setNewPresetName(''); }}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ marginBottom: 4, fontSize: 13 }}>任务名称 *</div>
        <Input
          placeholder="如: 标准巡检"
          value={newPresetName}
          onChange={e => setNewPresetName(e.target.value)}
          onPressEnter={handleNewPreset}
        />
      </Modal>
    </div>
  );
};
