import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tabs, Tag } from 'antd';
import { ArrowLeftOutlined, EnvironmentOutlined, ToolOutlined, SendOutlined, HistoryOutlined } from '@ant-design/icons';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import { WaypointRecordTab } from './WaypointRecordTab';
import { TaskConfigTab } from './TaskConfigTab';
import { TaskDispatchTab } from './TaskDispatchTab';
import { HistoryTab } from './HistoryTab';

export const RoomPatrol: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useRobot();
  const [activeTab, setActiveTab] = useState('waypoints');

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top toolbar */}
      <div
        style={{
          padding: '12px 24px',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
          返回
        </Button>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
          导览任务
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Tag color={connectionStatus === ConnectionStatus.CONNECTED ? 'green' : 'red'}>
            {connectionStatus === ConnectionStatus.CONNECTED ? '已连接' : '未连接'}
          </Tag>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        destroyInactiveTabPane
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        tabBarStyle={{ paddingLeft: 24, marginBottom: 0 }}
        items={[
          {
            key: 'waypoints',
            label: <span><EnvironmentOutlined /> 点位录制</span>,
            children: (
              <div style={{ flex: 1, height: 'calc(100vh - 110px)' }}>
                <WaypointRecordTab />
              </div>
            ),
          },
          {
            key: 'tasks',
            label: <span><ToolOutlined /> 任务编排</span>,
            children: (
              <div style={{ flex: 1, height: 'calc(100vh - 110px)' }}>
                <TaskConfigTab />
              </div>
            ),
          },
          {
            key: 'dispatch',
            label: <span><SendOutlined /> 任务下发</span>,
            children: (
              <div style={{ flex: 1, height: 'calc(100vh - 110px)' }}>
                <TaskDispatchTab />
              </div>
            ),
          },
          {
            key: 'history',
            label: <span><HistoryOutlined /> 历史记录</span>,
            children: (
              <div style={{ flex: 1, height: 'calc(100vh - 110px)' }}>
                <HistoryTab />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};
