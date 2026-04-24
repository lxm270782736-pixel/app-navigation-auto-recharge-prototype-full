import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Input } from '@astribot/ui';
import { Camera } from 'lucide-react';
import { TaskNodeShell } from './TaskNodeShell';

export const PhotoTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [count, setCount] = useState(data.count || 1);
  const [resolution, setResolution] = useState(data.resolution || '1920x1080');
  const [label, setLabel] = useState(data.label || '拍照');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <TaskNodeShell
        icon={<Camera className="h-5 w-5" />}
        iconClassName="text-emerald-600"
        toneClassName="border-emerald-600/50 bg-emerald-500/10"
        label={label}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onLabelChange={(value) => {
          setLabel(value);
          data.label = value;
        }}
        collapsedSummary={`${count} 张 · ${resolution}`}
      >
        <div className="space-y-2">
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">拍照数量</div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={10}
                value={String(count)}
                onChange={(e) => {
                  const value = Number(e.target.value) || 1;
                  setCount(value);
                  data.count = value;
                }}
                className="h-8"
              />
              <span className="text-[11px] text-muted-foreground">张</span>
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">分辨率</div>
            <select
              value={resolution}
              onChange={(e) => {
                setResolution(e.target.value);
                data.resolution = e.target.value;
              }}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="640x480">640x480</option>
              <option value="1280x720">1280x720</option>
              <option value="1920x1080">1920x1080</option>
            </select>
          </div>
        </div>
      </TaskNodeShell>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
