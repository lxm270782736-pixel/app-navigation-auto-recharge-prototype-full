import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Input } from '@astribot/ui';
import { Clock3 } from 'lucide-react';
import { TaskNodeShell } from './TaskNodeShell';

export const WaitTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [duration, setDuration] = useState(data.duration || 5);
  const [label, setLabel] = useState(data.label || '等待');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <TaskNodeShell
        icon={<Clock3 className="h-5 w-5" />}
        iconClassName="text-sky-600"
        toneClassName="border-sky-600/50 bg-sky-500/10"
        label={label}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onLabelChange={(value) => {
          setLabel(value);
          data.label = value;
        }}
        collapsedSummary={`${duration} 秒`}
      >
        <div>
          <div className="mb-1 text-[11px] text-muted-foreground">等待时长</div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={600}
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
      </TaskNodeShell>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
