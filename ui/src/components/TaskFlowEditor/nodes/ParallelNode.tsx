import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Zap } from 'lucide-react';
import { TaskNodeShell } from './TaskNodeShell';

export const ParallelNode: React.FC<NodeProps> = () => {
  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <TaskNodeShell
        icon={<Zap className="h-6 w-6" />}
        iconClassName="text-destructive"
        toneClassName="border-destructive/50 bg-destructive/10"
        label="并行执行"
        collapsed={false}
        onToggle={() => {}}
        collapsedSummary={null}
        minWidthClassName="min-w-[200px]"
      >
        <div className="text-center text-[11px] text-muted-foreground">所有分支同时执行</div>
      </TaskNodeShell>

      <Handle
        type="source"
        position={Position.Bottom}
        id="branch-1"
        className="!left-[33%]"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="branch-2"
        className="!left-[66%]"
      />
    </div>
  );
};
