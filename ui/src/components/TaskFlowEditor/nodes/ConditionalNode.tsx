import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Input } from '@astribot/ui';
import { GitBranch } from 'lucide-react';
import { TaskNodeShell } from './TaskNodeShell';

export const ConditionalNode: React.FC<NodeProps> = ({ data }) => {
  const [condition, setCondition] = useState(data.condition || '');

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <TaskNodeShell
        icon={<GitBranch className="h-6 w-6" />}
        iconClassName="text-orange-600"
        toneClassName="border-orange-600/50 bg-orange-500/10"
        label="条件分支"
        collapsed={false}
        onToggle={() => {}}
        minWidthClassName="min-w-[200px]"
      >
        <div>
          <div className="mb-1 text-[11px] text-muted-foreground">条件表达式</div>
          <Input
            value={condition}
            onChange={(e) => {
              setCondition(e.target.value);
              data.condition = e.target.value;
            }}
            placeholder="例如: battery > 20"
            className="h-8"
          />
        </div>
      </TaskNodeShell>

      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!left-[33%] !bg-emerald-500"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!left-[66%] !bg-destructive"
      />

      <div className="absolute -bottom-5 left-[33%] -translate-x-1/2 text-[10px] font-bold text-emerald-500">
        True
      </div>
      <div className="absolute -bottom-5 left-[66%] -translate-x-1/2 text-[10px] font-bold text-destructive">
        False
      </div>
    </div>
  );
};
