import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, Input, Button } from 'antd';
import { ReloadOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';

export const TrajectoryTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [trajectoryId, setTrajectoryId] = useState(data.trajectoryId || 'trajectory_1');
  const [label, setLabel] = useState(data.label || '执行轨迹');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <Card
        size="small"
        style={{
          minWidth: 180,
          backgroundColor: '#f3e5f5',
          border: '2px solid #7b1fa2',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ReloadOutlined style={{ fontSize: 20, color: '#7b1fa2' }} />
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
            <div>
              <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>轨迹ID</div>
              <Input
                size="small"
                value={trajectoryId}
                onChange={(e) => {
                  setTrajectoryId(e.target.value);
                  data.trajectoryId = e.target.value;
                }}
                placeholder="trajectory_1"
              />
            </div>
          )}

          {collapsed && (
            <div style={{ fontSize: 11, color: '#666' }}>
              {trajectoryId}
            </div>
          )}
        </div>
      </Card>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
