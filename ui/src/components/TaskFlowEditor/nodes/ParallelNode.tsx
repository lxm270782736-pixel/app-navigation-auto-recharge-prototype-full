import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';

export const ParallelNode: React.FC<NodeProps> = () => {
  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <Card
        size="small"
        style={{
          minWidth: 200,
          backgroundColor: '#ffebee',
          border: '2px solid #d32f2f',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <ThunderboltOutlined style={{ fontSize: 24, color: '#d32f2f' }} />
          <div style={{ fontWeight: 'bold', marginTop: 4 }}>并行执行</div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
            所有分支同时执行
          </div>
        </div>
      </Card>

      {/* 多个输出端口用于并行分支 */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="branch-1"
        style={{ left: '33%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="branch-2"
        style={{ left: '66%' }}
      />
    </div>
  );
};
