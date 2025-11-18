import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, InputNumber, Input } from 'antd';
import { DesktopOutlined } from '@ant-design/icons';

const { TextArea } = Input;

export const DisplayTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [message, setMessage] = useState(data.message || '');
  const [duration, setDuration] = useState(data.duration || 5);
  const [label, setLabel] = useState(data.label || '显示信息');

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <Card
        size="small"
        style={{
          minWidth: 180,
          backgroundColor: '#fff9c4',
          border: '2px solid #f57f17',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DesktopOutlined style={{ fontSize: 20, color: '#f57f17' }} />
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
            <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>显示消息</div>
            <TextArea
              size="small"
              rows={2}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                data.message = e.target.value;
              }}
              placeholder="要显示的消息"
            />
          </div>

          <div>
            <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>显示时长</div>
            <InputNumber
              size="small"
              min={1}
              max={60}
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
