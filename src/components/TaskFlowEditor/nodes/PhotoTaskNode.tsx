import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, InputNumber, Input, Select, Button } from 'antd';
import { CameraOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';

export const PhotoTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [count, setCount] = useState(data.count || 1);
  const [resolution, setResolution] = useState(data.resolution || '1920x1080');
  const [label, setLabel] = useState(data.label || '拍照');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <Card
        size="small"
        style={{
          minWidth: 180,
          backgroundColor: '#f1f8e9',
          border: '2px solid #689f38',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CameraOutlined style={{ fontSize: 20, color: '#689f38' }} />
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
                <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>拍照数量</div>
                <InputNumber
                  size="small"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(value) => {
                    setCount(value || 1);
                    data.count = value || 1;
                  }}
                  addonAfter="张"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>分辨率</div>
                <Select
                  size="small"
                  style={{ width: '100%' }}
                  value={resolution}
                  onChange={(value) => {
                    setResolution(value);
                    data.resolution = value;
                  }}
                >
                  <Select.Option value="640x480">640x480</Select.Option>
                  <Select.Option value="1280x720">1280x720</Select.Option>
                  <Select.Option value="1920x1080">1920x1080</Select.Option>
                </Select>
              </div>
            </>
          )}

          {collapsed && (
            <div style={{ fontSize: 11, color: '#666' }}>
              {count} 张 · {resolution}
            </div>
          )}
        </div>
      </Card>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
