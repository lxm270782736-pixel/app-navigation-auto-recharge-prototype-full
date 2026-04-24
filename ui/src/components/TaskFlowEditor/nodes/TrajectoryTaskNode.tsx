import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Input } from '@astribot/ui';
import { RefreshCw } from 'lucide-react';
import { TaskNodeShell } from './TaskNodeShell';

export const TrajectoryTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [trajectoryId, setTrajectoryId] = useState(data.trajectoryId || 'trajectory_1');
  const [label, setLabel] = useState(data.label || '执行轨迹');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <TaskNodeShell
        icon={<RefreshCw className="h-5 w-5" />}
        iconClassName="text-primary"
        toneClassName="border-primary/50 bg-primary/10"
        label={label}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onLabelChange={(value) => {
          setLabel(value);
          data.label = value;
        }}
        collapsedSummary={trajectoryId}
      >
        <div>
          <div className="mb-1 text-[11px] text-muted-foreground">轨迹ID</div>
          <Input
            value={trajectoryId}
            onChange={(e) => {
              setTrajectoryId(e.target.value);
              data.trajectoryId = e.target.value;
            }}
            placeholder="trajectory_1"
            className="h-8"
          />
        </div>
      </TaskNodeShell>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
