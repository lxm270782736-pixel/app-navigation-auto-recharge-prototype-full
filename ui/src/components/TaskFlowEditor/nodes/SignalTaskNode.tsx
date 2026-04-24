import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Input } from '@astribot/ui';
import { Lightbulb } from 'lucide-react';
import { TaskNodeShell } from './TaskNodeShell';

export const SignalTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [pattern, setPattern] = useState(data.pattern || 'blink');
  const [color, setColor] = useState(data.color || 'green');
  const [duration, setDuration] = useState(data.duration || 3);
  const [label, setLabel] = useState(data.label || '信号灯');
  const [collapsed, setCollapsed] = useState(false);

  const colorLabel = color === 'red' ? '红色' : color === 'green' ? '绿色' : color === 'blue' ? '蓝色' : '黄色';

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <TaskNodeShell
        icon={<Lightbulb className="h-5 w-5" />}
        iconClassName="text-yellow-600"
        toneClassName="border-yellow-600/50 bg-yellow-500/10"
        label={label}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onLabelChange={(value) => {
          setLabel(value);
          data.label = value;
        }}
        collapsedSummary={`${colorLabel} · ${pattern === 'blink' ? '闪烁' : '常亮'} · ${duration}秒`}
      >
        <div className="space-y-2">
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">模式</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'blink', label: '闪烁' },
                { value: 'solid', label: '常亮' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setPattern(option.value);
                    data.pattern = option.value;
                  }}
                  className={pattern === option.value ? 'rounded-md border border-primary bg-primary/15 px-2 py-1 text-xs text-primary' : 'rounded-md border border-input px-2 py-1 text-xs text-foreground'}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">颜色</div>
            <select
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                data.color = e.target.value;
              }}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="red">红色</option>
              <option value="green">绿色</option>
              <option value="blue">蓝色</option>
              <option value="yellow">黄色</option>
            </select>
          </div>

          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">持续时间</div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={60}
                value={String(duration)}
                onChange={(e) => {
                  const value = Number(e.target.value) || 3;
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
