import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Input } from '@astribot/ui';
import { Search } from 'lucide-react';
import { TaskNodeShell } from './TaskNodeShell';

export const ScanTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [scanType, setScanType] = useState(data.scanType || '3d');
  const [duration, setDuration] = useState(data.duration || 5);
  const [label, setLabel] = useState(data.label || '扫描');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <TaskNodeShell
        icon={<Search className="h-5 w-5" />}
        iconClassName="text-cyan-600"
        toneClassName="border-cyan-600/50 bg-cyan-500/10"
        label={label}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onLabelChange={(value) => {
          setLabel(value);
          data.label = value;
        }}
        collapsedSummary={`${scanType === '3d' ? '3D' : '2D'} · ${duration}秒`}
      >
        <div className="space-y-2">
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">扫描类型</div>
            <div className="grid grid-cols-2 gap-2">
              {['3d', '2d'].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setScanType(value);
                    data.scanType = value;
                  }}
                  className={scanType === value ? 'rounded-md border border-primary bg-primary/15 px-2 py-1 text-xs text-primary' : 'rounded-md border border-input px-2 py-1 text-xs text-foreground'}
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">扫描时长</div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={60}
                value={String(duration)}
                onChange={(e) => {
                  const value = Number(e.target.value) || 5;
                  setDuration(value);
                  data.duration = value;
                }}
                className="h-8"
              />
              <span className="text-[11px] text-muted-foreground">秒</span>
            </div>
          </div>
        </div>
      </TaskNodeShell>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
