import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, InputNumber, Input, Radio } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

export const ScanTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [scanType, setScanType] = useState(data.scanType || '3d');
  const [duration, setDuration] = useState(data.duration || 5);
  const [label, setLabel] = useState(data.label || '扫描');

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <Card
        size="small"
        style={{
          minWidth: 180,
          backgroundColor: '#e0f7fa',
          border: '2px solid #00838f',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SearchOutlined style={{ fontSize: 20, color: '#00838f' }} />
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
            <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>扫描类型</div>
            <Radio.Group
              size="small"
              value={scanType}
              onChange={(e) => {
                setScanType(e.target.value);
                data.scanType = e.target.value;
              }}
              buttonStyle="solid"
            >
              <Radio.Button value="3d">3D</Radio.Button>
              <Radio.Button value="2d">2D</Radio.Button>
            </Radio.Group>
          </div>

          <div>
            <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>扫描时长</div>
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
