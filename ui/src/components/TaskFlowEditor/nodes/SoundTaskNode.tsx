import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Input } from '@astribot/ui';
import { Volume2 } from 'lucide-react';
import { TaskNodeShell } from './TaskNodeShell';

export const SoundTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [text, setText] = useState(data.text || '');
  const [volume, setVolume] = useState(data.volume || 70);
  const [label, setLabel] = useState(data.label || '播放声音');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <TaskNodeShell
        icon={<Volume2 className="h-5 w-5" />}
        iconClassName="text-orange-600"
        toneClassName="border-orange-600/50 bg-orange-500/10"
        label={label}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onLabelChange={(value) => {
          setLabel(value);
          data.label = value;
        }}
        collapsedSummary={`${text.slice(0, 20)}${text.length > 20 ? '...' : ''} · ${volume}%`}
      >
        <div className="space-y-2">
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">语音文本</div>
            <textarea
              rows={2}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                data.text = e.target.value;
              }}
              placeholder="要播放的语音文本"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">音量</div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={String(volume)}
                onChange={(e) => {
                  const value = Number(e.target.value) || 70;
                  setVolume(value);
                  data.volume = value;
                }}
                className="h-8"
              />
              <span className="text-[11px] text-muted-foreground">%</span>
            </div>
          </div>
        </div>
      </TaskNodeShell>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
