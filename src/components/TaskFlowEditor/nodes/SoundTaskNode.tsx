import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, InputNumber, Input, Button } from 'antd';
import { SoundOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';

const { TextArea } = Input;

export const SoundTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [text, setText] = useState(data.text || '');
  const [volume, setVolume] = useState(data.volume || 70);
  const [label, setLabel] = useState(data.label || '播放声音');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <Card
        size="small"
        style={{
          minWidth: 180,
          backgroundColor: '#fff3e0',
          border: '2px solid #e65100',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SoundOutlined style={{ fontSize: 20, color: '#e65100' }} />
            <Input
              size="small"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                data.label = e.target.value;
              }}
              style={{ fontWeight: 'bold', flex: 1 }}
              bordered={false}
            />
            <Button
              type="text"
              size="small"
              icon={collapsed ? <DownOutlined /> : <UpOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ padding: '0 4px' }}
            />
          </div>

          {!collapsed && (
            <>
              <div>
                <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>语音文本</div>
                <TextArea
                  size="small"
                  rows={2}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    data.text = e.target.value;
                  }}
                  placeholder="要播放的语音文本"
                />
              </div>

              <div>
                <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>音量</div>
                <InputNumber
                  size="small"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(value) => {
                    setVolume(value || 70);
                    data.volume = value || 70;
                  }}
                  addonAfter="%"
                  style={{ width: '100%' }}
                />
              </div>
            </>
          )}

          {collapsed && (
            <div style={{ fontSize: 11, color: '#666' }}>
              {text.slice(0, 20)}{text.length > 20 ? '...' : ''} · {volume}%
            </div>
          )}
        </div>
      </Card>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
