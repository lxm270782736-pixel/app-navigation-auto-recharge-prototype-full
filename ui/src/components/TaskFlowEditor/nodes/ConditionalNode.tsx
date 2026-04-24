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
        iconColor="#d84315"
        borderColor="#d84315"
        backgroundColor="#fbe9e7"
        label="条件分支"
        collapsed={false}
        onToggle={() => {}}
        minWidth={200}
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
        style={{ left: '33%', backgroundColor: '#4caf50' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{ left: '66%', backgroundColor: '#f44336' }}
      />

      <div className="absolute -bottom-5 left-[33%] -translate-x-1/2 text-[10px] font-bold text-[#4caf50]">
        True
      </div>
      <div className="absolute -bottom-5 left-[66%] -translate-x-1/2 text-[10px] font-bold text-[#f44336]">
        False
      </div>
    </div>
  );
};
