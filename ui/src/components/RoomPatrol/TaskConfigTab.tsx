import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, Select, Space, Checkbox, message, Empty, Tag, Tooltip } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { RoomConfig, RoomTaskStep, PatrolTaskConfig } from '@/types';

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

export const TaskConfigTab: React.FC = () => {
  const { connectionStatus } = useROS();
  const [taskConfig, setTaskConfig] = useState<PatrolTaskConfig | null>(null);
  const [roomConfigs, setRoomConfigs] = useState<RoomConfig[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');

  // Load configs
  const loadData = useCallback(async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    try {
      const roomData = await rosService.getRoomConfig();
      const rooms = (roomData.rooms || []) as RoomConfig[];
      setRoomConfigs(rooms);

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

  if (!taskConfig) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>加载中...</div>;
  }

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Left: Room list */}
      <div style={{ width: 220, borderRight: '1px solid #f0f0f0', overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>巡房顺序</span>
          <Checkbox checked={allEnabled} onChange={toggleAll} style={{ fontSize: 12 }}>全选</Checkbox>
        </div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>勾选参与巡房的房间，上下箭头调整顺序</div>

        {taskConfig.rooms.length === 0 && (
          <Empty description="请先在「点位录制」录制房间" style={{ marginTop: 40 }} />
        )}

        {taskConfig.rooms.map((room, idx) => {
          const isReady = roomConfigs.find(r => r.room_id === room.room_id && r.door_outside && r.door_inside && r.bed_check);
          return (
            <div
              key={room.room_id}
              onClick={() => setSelectedRoomId(room.room_id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 8px',
                marginBottom: 4,
                borderRadius: 6,
                border: `1px solid ${selectedRoomId === room.room_id ? '#1890ff' : '#f0f0f0'}`,
                background: selectedRoomId === room.room_id ? '#e6f7ff' : '#fff',
                cursor: 'pointer',
                opacity: room.enabled ? 1 : 0.5,
              }}
            >
              <Checkbox
                checked={room.enabled}
                onChange={(e) => { e.stopPropagation(); toggleRoom(room.room_id); }}
                onClick={(e) => e.stopPropagation()}
              />
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
                <span style={{ color: '#999', marginRight: 4, fontSize: 11 }}>{idx + 1}.</span>
                {room.room_name || room.room_id}
              </span>
              {!isReady && <Tag color="red" style={{ fontSize: 9, lineHeight: '16px', padding: '0 4px' }}>未录</Tag>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }} onClick={(e) => e.stopPropagation()}>
                <Button type="text" size="small" icon={<ArrowUpOutlined style={{ fontSize: 10 }} />}
                  style={{ padding: 0, height: 16, width: 20 }}
                  disabled={idx === 0} onClick={() => moveRoom(room.room_id, -1)} />
                <Button type="text" size="small" icon={<ArrowDownOutlined style={{ fontSize: 10 }} />}
                  style={{ padding: 0, height: 16, width: 20 }}
                  disabled={idx === taskConfig.rooms.length - 1} onClick={() => moveRoom(room.room_id, 1)} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Right: Step editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>{selectedRoom?.room_name || '选择房间'}</span>
          <div style={{ flex: 1 }} />
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
              {selectedRoom.steps.map((step, idx) => (
                <Card
                  key={idx}
                  size="small"
                  style={{ borderLeft: `3px solid ${STEP_COLORS[step.type] || '#999'}` }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, width: 20, textAlign: 'center', color: '#999', fontSize: 12 }}>{idx + 1}</span>
                    <Select
                      size="small"
                      value={step.type}
                      onChange={(v) => updateStep(idx, { type: v as any })}
                      style={{ width: 120 }}
                      options={STEP_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
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
                    <div style={{ flex: 1 }} />
                    <Tooltip title="上移"><Button size="small" type="text" icon={<ArrowUpOutlined />} onClick={() => moveStep(idx, -1)} disabled={idx === 0} /></Tooltip>
                    <Tooltip title="下移"><Button size="small" type="text" icon={<ArrowDownOutlined />} onClick={() => moveStep(idx, 1)} disabled={idx === selectedRoom.steps.length - 1} /></Tooltip>
                    <Tooltip title="删除"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeStep(idx)} /></Tooltip>
                  </div>
                </Card>
              ))}
            </Space>
          )}
        </div>
      </div>
    </div>
  );
};
