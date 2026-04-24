import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Input } from '@astribot/ui';
import { Eye } from 'lucide-react';
import { TaskNodeShell } from './TaskNodeShell';

export const InspectTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [targetType, setTargetType] = useState(data.targetType || 'person');
  const [confidenceThreshold, setConfidenceThreshold] = useState(data.confidenceThreshold || 0.7);
  const [label, setLabel] = useState(data.label || '检测');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <TaskNodeShell
        icon={<Eye className="h-5 w-5" />}
        iconClassName="text-rose-600"
        toneClassName="border-rose-600/50 bg-rose-500/10"
        label={label}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onLabelChange={(value) => {
          setLabel(value);
          data.label = value;
        }}
        collapsedSummary={`${targetType} · ${confidenceThreshold}`}
      >
        <div className="space-y-2">
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">目标类型</div>
            <Input
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value);
                data.targetType = e.target.value;
              }}
              placeholder="person, object, etc."
              className="h-8"
            />
          </div>
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">置信度阈值</div>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={String(confidenceThreshold)}
              onChange={(e) => {
                const value = Number(e.target.value) || 0.7;
                setConfidenceThreshold(value);
                data.confidenceThreshold = value;
              }}
              className="h-8"
            />
          </div>
        </div>
      </TaskNodeShell>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
