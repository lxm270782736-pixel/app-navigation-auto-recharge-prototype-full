import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Input } from '@astribot/ui';
import { Monitor } from 'lucide-react';
import { TaskNodeShell } from './TaskNodeShell';

export const DisplayTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [message, setMessage] = useState(data.message || '');
  const [duration, setDuration] = useState(data.duration || 5);
  const [label, setLabel] = useState(data.label || '显示信息');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <TaskNodeShell
        icon={<Monitor className="h-5 w-5" />}
        iconClassName="text-amber-600"
        toneClassName="border-amber-600/50 bg-amber-500/10"
        label={label}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onLabelChange={(value) => {
          setLabel(value);
          data.label = value;
        }}
        collapsedSummary={`${message.slice(0, 20)}${message.length > 20 ? '...' : ''} · ${duration}秒`}
      >
        <div className="space-y-2">
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">显示消息</div>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                data.message = e.target.value;
              }}
              placeholder="要显示的消息"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">显示时长</div>
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
