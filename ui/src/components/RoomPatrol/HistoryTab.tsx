import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Button, Empty, Space, message, Modal } from 'antd';
import { ReloadOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { rosService } from '@/services/ros';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { PatrolRecord, Alert } from '@/types';

const STATUS_TAGS: Record<string, { color: string; text: string }> = {
  completed: { color: 'success', text: '已完成' },
  running: { color: 'processing', text: '进行中' },
  stopped: { color: 'warning', text: '已停止' },
  failed: { color: 'error', text: '失败' },
};

const ALERT_TYPES: Record<string, string> = {
  bed_absence: '老人离床',
  floor_clutter: '地面杂物',
  floor_water: '地面水渍',
  task_failed: '任务失败',
};

const ALERT_STATUS: Record<string, { color: string; text: string }> = {
  new: { color: 'red', text: '新告警' },
  processing: { color: 'orange', text: '处理中' },
  closed: { color: 'green', text: '已关闭' },
};

export const HistoryTab: React.FC = () => {
  const { connectionStatus } = useROS();
  const [records, setRecords] = useState<PatrolRecord[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PatrolRecord | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) return;
    setLoading(true);
    try {
      const [recordsData, alertsData] = await Promise.all([
        rosService.getPatrolRecords(),
        rosService.getAlerts(),
      ]);
      setRecords(Array.isArray(recordsData) ? recordsData : []);
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
    } catch (e) {
      console.warn('Failed to load history:', e);
    } finally {
      setLoading(false);
    }
  }, [connectionStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleConfirmAlert = async (alert: Alert) => {
    const date = alert.created_at.slice(0, 10);
    const result = await rosService.confirmAlert(date, alert.id);
    if (result.success) {
      message.success('告警已确认');
      loadData();
    } else {
      message.error(result.message);
    }
  };

  const handleCloseAlert = async (alert: Alert) => {
    const date = alert.created_at.slice(0, 10);
    const result = await rosService.closeAlert(date, alert.id);
    if (result.success) {
      message.success('告警已关闭');
      loadData();
    } else {
      message.error(result.message);
    }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Patrol records */}
      <Card
        size="small"
        title="巡房记录"
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>}
      >
        {records.length === 0 ? (
          <Empty description="暂无巡房记录" />
        ) : (
          <Table
            dataSource={records}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10 }}
            onRow={(record) => ({
              onClick: () => setSelectedRecord(record),
              style: { cursor: 'pointer', background: selectedRecord?.id === record.id ? '#e6f7ff' : undefined },
            })}
            columns={[
              {
                title: '时间', dataIndex: 'started_at', width: 160,
                render: (v: string) => v?.replace('T', ' '),
              },
              {
                title: '状态', dataIndex: 'status', width: 80,
                render: (v: string) => {
                  const t = STATUS_TAGS[v] || { color: 'default', text: v };
                  return <Tag color={t.color}>{t.text}</Tag>;
                },
              },
              { title: '房间数', dataIndex: 'rooms_total', width: 70 },
              {
                title: '完成', dataIndex: 'rooms_completed', width: 60,
                render: (v: number) => <span style={{ color: '#52c41a' }}>{v}</span>,
              },
              {
                title: '失败', dataIndex: 'rooms_failed', width: 60,
                render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>{v}</span> : '0',
              },
            ]}
          />
        )}
      </Card>

      {/* Selected record detail */}
      {selectedRecord && selectedRecord.room_results && (
        <Card size="small" title={`详情 — ${selectedRecord.id}`}>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {selectedRecord.room_results.map((room: any, idx: number) => (
              <Card key={idx} size="small" style={{ borderLeft: `3px solid ${room.status === 'success' ? '#52c41a' : '#ff4d4f'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{room.room_name || room.room_id}</span>
                  <Tag color={room.status === 'success' ? 'success' : 'error'}>{room.status}</Tag>
                </div>
                {room.error && <div style={{ color: '#ff4d4f', fontSize: 12 }}>{room.error}</div>}
                <div style={{ fontSize: 11, color: '#999' }}>
                  {room.steps?.length ?? 0} 步骤 | {room.started_at?.replace('T', ' ')} ~ {room.finished_at?.replace('T', ' ')}
                </div>
              </Card>
            ))}
          </Space>
        </Card>
      )}

      {/* Alerts */}
      <Card size="small" title="告警记录">
        {alerts.length === 0 ? (
          <Empty description="暂无告警" />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {alerts.map(alert => {
              const st = ALERT_STATUS[alert.status] || { color: 'default', text: alert.status };
              return (
                <Card key={alert.id} size="small" style={{ borderLeft: `3px solid ${st.color === 'red' ? '#ff4d4f' : st.color === 'orange' ? '#faad14' : '#52c41a'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Tag color={st.color}>{st.text}</Tag>
                      <span style={{ fontWeight: 600, marginRight: 8 }}>{alert.room_id}</span>
                      <span style={{ color: '#666' }}>{ALERT_TYPES[alert.alert_type] || alert.alert_type}</span>
                    </div>
                    <Space size={4}>
                      {alert.status === 'new' && (
                        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleConfirmAlert(alert)}>确认</Button>
                      )}
                      {alert.status === 'processing' && (
                        <Button size="small" icon={<CloseOutlined />} onClick={() => handleCloseAlert(alert)}>已处置</Button>
                      )}
                    </Space>
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                    {alert.message} | {alert.created_at?.replace('T', ' ')}
                  </div>
                </Card>
              );
            })}
          </Space>
        )}
      </Card>
    </div>
  );
};
