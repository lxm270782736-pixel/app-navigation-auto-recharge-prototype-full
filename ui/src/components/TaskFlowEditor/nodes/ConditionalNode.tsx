import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, Input } from 'antd';
import { BranchesOutlined } from '@ant-design/icons';

export const ConditionalNode: React.FC<NodeProps> = ({ data }) => {
  const [condition, setCondition] = useState(data.condition || '');

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <Card
        size="small"
        style={{
          minWidth: 200,
          backgroundColor: '#fbe9e7',
          border: '2px solid #d84315',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <BranchesOutlined style={{ fontSize: 24, color: '#d84315' }} />
            <div style={{ fontWeight: 'bold', marginTop: 4 }}>条件分支</div>
          </div>

          <div>
            <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>条件表达式</div>
            <Input
              size="small"
              value={condition}
              onChange={(e) => {
                setCondition(e.target.value);
                data.condition = e.target.value;
              }}
              placeholder="例如: battery > 20"
            />
          </div>
        </div>
      </Card>

      {/* True和False两个输出端口 */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        style={{ left: '33%', backgroundColor: '#4caf50' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{ left: '66%', backgroundColor: '#f44336' }}
      />

      {/* 标签 */}
      <div style={{
        position: 'absolute',
        bottom: -20,
        left: '33%',
        transform: 'translateX(-50%)',
        fontSize: 10,
        color: '#4caf50',
        fontWeight: 'bold'
      }}>
        True
      </div>
      <div style={{
        position: 'absolute',
        bottom: -20,
        left: '66%',
        transform: 'translateX(-50%)',
        fontSize: 10,
        color: '#f44336',
        fontWeight: 'bold'
      }}>
        False
      </div>
    </div>
  );
};
