import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, InputNumber, Input } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';

export const WaitTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [duration, setDuration] = useState(data.duration || 5);
  const [label, setLabel] = useState(data.label || '等待');

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <Card
        size="small"
        style={{
          minWidth: 180,
          backgroundColor: '#e3f2fd',
          border: '2px solid #1976d2',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClockCircleOutlined style={{ fontSize: 20, color: '#1976d2' }} />
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
          </div>

          <div>
            <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>等待时长</div>
            <InputNumber
              size="small"
              min={1}
              max={600}
              value={duration}
              onChange={(value) => {
                setDuration(value || 5);
                data.duration = value || 5;
              }}
              addonAfter="秒"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </Card>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
