import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, InputNumber, Select, Radio, Input, Button } from 'antd';
import { BulbOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';

export const SignalTaskNode: React.FC<NodeProps> = ({ data }) => {
  const [pattern, setPattern] = useState(data.pattern || 'blink');
  const [color, setColor] = useState(data.color || 'green');
  const [duration, setDuration] = useState(data.duration || 3);
  const [label, setLabel] = useState(data.label || '信号灯');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="custom-task-node">
      <Handle type="target" position={Position.Top} />

      <Card
        size="small"
        style={{
          minWidth: 180,
          backgroundColor: '#fffde7',
          border: '2px solid #f9a825',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BulbOutlined style={{ fontSize: 20, color: '#f9a825' }} />
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
                <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>模式</div>
                <Radio.Group
                  size="small"
                  value={pattern}
                  onChange={(e) => {
                    setPattern(e.target.value);
                    data.pattern = e.target.value;
                  }}
                  buttonStyle="solid"
                >
                  <Radio.Button value="blink">闪烁</Radio.Button>
                  <Radio.Button value="solid">常亮</Radio.Button>
                </Radio.Group>
              </div>

              <div>
                <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>颜色</div>
                <Select
                  size="small"
                  style={{ width: '100%' }}
                  value={color}
                  onChange={(value) => {
                    setColor(value);
                    data.color = value;
                  }}
                >
                  <Select.Option value="red">红色</Select.Option>
                  <Select.Option value="green">绿色</Select.Option>
                  <Select.Option value="blue">蓝色</Select.Option>
                  <Select.Option value="yellow">黄色</Select.Option>
                </Select>
              </div>

              <div>
                <div style={{ fontSize: 11, marginBottom: 4, color: '#666' }}>持续时间</div>
                <InputNumber
                  size="small"
                  min={1}
                  max={60}
                  value={duration}
                  onChange={(value) => {
                    setDuration(value || 3);
                    data.duration = value || 3;
                  }}
                  addonAfter="秒"
                  style={{ width: '100%' }}
                />
              </div>
            </>
          )}

          {collapsed && (
            <div style={{ fontSize: 11, color: '#666' }}>
              {color === 'red' ? '红色' : color === 'green' ? '绿色' : color === 'blue' ? '蓝色' : '黄色'} · {pattern === 'blink' ? '闪烁' : '常亮'} · {duration}秒
            </div>
          )}
        </div>
      </Card>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
