import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, InputNumber, Input, Button } from 'antd';
import { EyeOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';

export const InspectTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [targetType, setTargetType] = useState(data.targetType || 'person');
  const [confidenceThreshold, setConfidenceThreshold] = useState(data.confidenceThreshold || 0.7);
  const [label, setLabel] = useState(data.label || '检测');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <Card
        size="small"
        style={{
          minWidth: 180,
          backgroundColor: '#fce4ec',
          border: '2px solid #c2185b',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EyeOutlined style={{ fontSize: 20, color: '#c2185b' }} />
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
                <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>目标类型</div>
                <Input
                  size="small"
                  value={targetType}
                  onChange={(e) => {
                    setTargetType(e.target.value);
                    data.targetType = e.target.value;
                  }}
                  placeholder="person, object, etc."
                />
              </div>

              <div>
                <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>置信度阈值</div>
                <InputNumber
                  size="small"
                  min={0}
                  max={1}
                  step={0.1}
                  value={confidenceThreshold}
                  onChange={(value) => {
                    setConfidenceThreshold(value || 0.7);
                    data.confidenceThreshold = value || 0.7;
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            </>
          )}

          {collapsed && (
            <div style={{ fontSize: 11, color: '#666' }}>
              {targetType} · {confidenceThreshold}
            </div>
          )}
        </div>
      </Card>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
