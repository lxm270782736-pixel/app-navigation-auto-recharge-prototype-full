import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Card, Select, Space, Checkbox, message, Empty, Tag, Tooltip, Input, InputNumber, Switch } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  HolderOutlined,
  SettingOutlined,
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
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { rosService } from '@/services/ros';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { RoomConfig, RoomTaskStep, PatrolTaskConfig } from '@/types';
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
];

// Default inspection steps for a room
const DEFAULT_STEPS: RoomTaskStep[] = [
  { type: 'navigate', target: 'door_outside' },
  { type: 'open_door' },
  { type: 'navigate', target: 'door_inside' },
  { type: 'detect_floor' },
  { type: 'photo', label: '通道' },
  { type: 'navigate', target: 'bed_check' },
  { type: 'detect_bed' },
  { type: 'photo', label: '床位' },
  { type: 'navigate', target: 'door_inside' },
  { type: 'navigate', target: 'door_outside' },
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

export const TaskConfigTab: React.FC = () => {
  const { connectionStatus } = useROS();
  const [taskConfig, setTaskConfig] = useState<PatrolTaskConfig | null>(null);
  const [roomConfigs, setRoomConfigs] = useState<RoomConfig[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [customStepTypes, setCustomStepTypes] = useState<CustomStepDefinition[]>([]);
  const [showManager, setShowManager] = useState(false);

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

  // Load configs
  const loadData = useCallback(async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    try {
      const [roomData, customData] = await Promise.all([
        rosService.getRoomConfig(),
        rosService.getCustomStepTypes().catch(() => ({ custom_step_types: [] })),
      ]);
      const rooms = (roomData.rooms || []) as RoomConfig[];
      setRoomConfigs(rooms);
      setCustomStepTypes(customData.custom_step_types || []);

      let taskData: any = { rooms: [], retry_limit: 3 };
      try {
        taskData = await rosService.getTaskConfig();
      } catch {
        // Task config not saved yet — use empty
      }

      // Merge: ensure task config has entries for all recorded rooms
      const existingRooms = (taskData.rooms || []) as any[];
      const existingIds = new Set(existingRooms.map((r: any) => r.room_id));
      const merged = [...existingRooms];
      for (const r of rooms) {
        if (!existingIds.has(r.room_id) && r.door_outside && r.door_inside && r.bed_check) {
          merged.push({
            room_id: r.room_id,
            room_name: r.room_name,
            enabled: true,
            steps: [...DEFAULT_STEPS],
          });
        }
      }
      setTaskConfig({ rooms: merged, retry_limit: taskData.retry_limit || 3 });
      if (merged.length > 0) {
        setSelectedRoomId(prev => prev || merged[0].room_id);
      }
    } catch (e) {
      console.warn('Failed to load task config:', e);
      // Set empty config so UI doesn't stay stuck on "loading"
      setTaskConfig({ rooms: [], retry_limit: 3 });
    }
  }, [connectionStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedRoom = taskConfig?.rooms.find(r => r.room_id === selectedRoomId);

  // Update steps for selected room
  const updateSteps = (newSteps: RoomTaskStep[]) => {
    if (!taskConfig || !selectedRoomId) return;
    setTaskConfig({
      ...taskConfig,
      rooms: taskConfig.rooms.map(r =>
        r.room_id === selectedRoomId ? { ...r, steps: newSteps } : r
      ),
    });
  };

  // Add a step
  const addStep = () => {
    if (!selectedRoom) return;
    updateSteps([...selectedRoom.steps, { type: 'wait', duration: 1 }]);
  };

  // Remove a step
  const removeStep = (idx: number) => {
    if (!selectedRoom) return;
    updateSteps(selectedRoom.steps.filter((_, i) => i !== idx));
  };

  // Move step up/down
  const moveStep = (idx: number, dir: -1 | 1) => {
    if (!selectedRoom) return;
    const steps = [...selectedRoom.steps];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= steps.length) return;
    [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
    updateSteps(steps);
  };

  // Update single step field
  const updateStep = (idx: number, patch: Partial<RoomTaskStep>) => {
    if (!selectedRoom) return;
    // When changing to a custom type, init params with defaults
    if (patch.type && patch.type.startsWith('custom:') && patch.type !== selectedRoom.steps[idx].type) {
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
    updateSteps(selectedRoom.steps.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  // Apply default template
  const applyDefault = () => {
    if (!selectedRoom) return;
    updateSteps([...DEFAULT_STEPS]);
    message.success('已应用默认巡检模板');
  };

  // Save
  const handleSave = async () => {
    if (!taskConfig) return;
    const result = await rosService.saveTaskConfig(taskConfig);
    if (result.success) {
      message.success('任务配置已保存');
    } else {
      message.error(result.message);
    }
  };

  // Toggle room enabled
  const toggleRoom = (roomId: string) => {
    if (!taskConfig) return;
    setTaskConfig({
      ...taskConfig,
      rooms: taskConfig.rooms.map(r =>
        r.room_id === roomId ? { ...r, enabled: !r.enabled } : r
      ),
    });
  };

  // Select all / deselect all
  const allEnabled = taskConfig?.rooms.every(r => r.enabled) ?? false;
  const toggleAll = () => {
    if (!taskConfig) return;
    const newEnabled = !allEnabled;
    setTaskConfig({
      ...taskConfig,
      rooms: taskConfig.rooms.map(r => ({ ...r, enabled: newEnabled })),
    });
  };

  // Move room up/down (巡房顺序)
  const moveRoom = (roomId: string, dir: -1 | 1) => {
    if (!taskConfig) return;
    const rooms = [...taskConfig.rooms];
    const idx = rooms.findIndex(r => r.room_id === roomId);
    const newIdx = idx + dir;
    if (idx < 0 || newIdx < 0 || newIdx >= rooms.length) return;
    [rooms[idx], rooms[newIdx]] = [rooms[newIdx], rooms[idx]];
    setTaskConfig({ ...taskConfig, rooms });
  };

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!taskConfig) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const rooms = [...taskConfig.rooms];
    const oldIdx = rooms.findIndex(r => r.room_id === active.id);
    const newIdx = rooms.findIndex(r => r.room_id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const [moved] = rooms.splice(oldIdx, 1);
    rooms.splice(newIdx, 0, moved);
    setTaskConfig({ ...taskConfig, rooms });
  };

  if (!taskConfig) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>加载中...</div>;
  }

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Left: Room list with drag-and-drop reorder */}
      <div style={{ width: 220, borderRight: '1px solid #f0f0f0', overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>巡房顺序</span>
          <Checkbox checked={allEnabled} onChange={toggleAll} style={{ fontSize: 12 }}>全选</Checkbox>
        </div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>拖拽调整顺序，勾选参与巡房的房间</div>

        {taskConfig.rooms.length === 0 ? (
          <Empty description="请先在「点位录制」录制房间" style={{ marginTop: 40 }} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={taskConfig.rooms.map(r => r.room_id)} strategy={verticalListSortingStrategy}>
              {taskConfig.rooms.map((room, idx) => {
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

      {/* Right: Step editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>{selectedRoom?.room_name || '选择房间'}</span>
          <div style={{ flex: 1 }} />
          <Button size="small" icon={<SettingOutlined />} onClick={() => setShowManager(true)}>自定义步骤</Button>
          <Button size="small" onClick={applyDefault} disabled={!selectedRoom}>默认模板</Button>
          <Button size="small" icon={<PlusOutlined />} onClick={addStep} disabled={!selectedRoom}>添加步骤</Button>
          <Button size="small" type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存配置</Button>
        </div>

        {/* Step list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {!selectedRoom ? (
            <Empty description="选择左侧房间编辑步骤" />
          ) : selectedRoom.steps.length === 0 ? (
            <Empty description="暂无步骤，点击「默认模板」或「添加步骤」" />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {selectedRoom.steps.map((step, idx) => {
                const isCustom = step.type.startsWith('custom:');
                const customDef = isCustom ? customStepTypes.find(d => `custom:${d.id}` === step.type) : null;
                return (
                  <Card
                    key={idx}
                    size="small"
                    style={{ borderLeft: `3px solid ${stepColors[step.type] || '#999'}` }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, width: 20, textAlign: 'center', color: '#999', fontSize: 12 }}>{idx + 1}</span>
                      <Select
                        size="small"
                        value={step.type}
                        onChange={(v) => updateStep(idx, { type: v as any })}
                        style={{ width: 140 }}
                        options={allStepOptions.map(o => ({ value: o.value, label: o.label }))}
                      />
                      {step.type === 'navigate' && (
                        <Select
                          size="small"
                          value={step.target || 'door_outside'}
                          onChange={(v) => updateStep(idx, { target: v })}
                          style={{ width: 100 }}
                          options={NAV_TARGETS}
                        />
                      )}
                      {step.type === 'photo' && (
                        <input
                          placeholder="标签"
                          value={step.label || ''}
                          onChange={(e) => updateStep(idx, { label: e.target.value })}
                          style={{ width: 80, fontSize: 12, border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 6px' }}
                        />
                      )}
                      {/* Custom step params inline */}
                      {isCustom && customDef && customDef.parameters.map(p => (
                        <span key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: 11, color: '#999' }}>{p.label}:</span>
                          {p.type === 'number' && (
                            <InputNumber
                              size="small"
                              value={step.params?.[p.key] ?? p.default_value}
                              onChange={v => updateStep(idx, { params: { ...step.params, [p.key]: v } })}
                              style={{ width: 60 }}
                            />
                          )}
                          {p.type === 'string' && (
                            <Input
                              size="small"
                              value={step.params?.[p.key] ?? p.default_value ?? ''}
                              onChange={e => updateStep(idx, { params: { ...step.params, [p.key]: e.target.value } })}
                              style={{ width: 80 }}
                            />
                          )}
                          {p.type === 'boolean' && (
                            <Switch
                              size="small"
                              checked={step.params?.[p.key] ?? p.default_value ?? false}
                              onChange={v => updateStep(idx, { params: { ...step.params, [p.key]: v } })}
                            />
                          )}
                          {p.type === 'select' && (
                            <Select
                              size="small"
                              value={step.params?.[p.key] ?? p.default_value}
                              onChange={v => updateStep(idx, { params: { ...step.params, [p.key]: v } })}
                              style={{ width: 80 }}
                              options={p.options || []}
                            />
                          )}
                        </span>
                      ))}
                      <div style={{ flex: 1 }} />
                      <Tooltip title="上移"><Button size="small" type="text" icon={<ArrowUpOutlined />} onClick={() => moveStep(idx, -1)} disabled={idx === 0} /></Tooltip>
                      <Tooltip title="下移"><Button size="small" type="text" icon={<ArrowDownOutlined />} onClick={() => moveStep(idx, 1)} disabled={idx === selectedRoom.steps.length - 1} /></Tooltip>
                      <Tooltip title="删除"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeStep(idx)} /></Tooltip>
                    </div>
                  </Card>
                );
              })}
            </Space>
          )}
        </div>
      </div>

      {/* Custom step manager modal */}
      <CustomStepManager open={showManager} onClose={() => { setShowManager(false); loadData(); }} />
    </div>
  );
};
