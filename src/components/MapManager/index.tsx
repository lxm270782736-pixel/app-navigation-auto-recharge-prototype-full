import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, List, Modal, Empty, message } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { mapStorageService } from '@/services/storage';
import type { MapData } from '@/types';
import dayjs from 'dayjs';

export const MapManager: React.FC = () => {
  const navigate = useNavigate();
  const [maps, setMaps] = useState<MapData[]>([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedMap, setSelectedMap] = useState<MapData | null>(null);

  useEffect(() => {
    loadMaps();
  }, []);

  const loadMaps = async () => {
    const allMaps = await mapStorageService.getAllMaps();
    setMaps(allMaps);
  };

  const handleCreateMap = () => {
    navigate('/mapping');
  };

  const handleSelectMap = (map: MapData) => {
    navigate(`/map-editor/${map.id}`);
  };

  const handleDeleteMap = (map: MapData) => {
    setSelectedMap(map);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (selectedMap) {
      await mapStorageService.deleteMap(selectedMap.id);
      message.success('地图已删除');
      loadMaps();
      setDeleteModalVisible(false);
      setSelectedMap(null);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
        >
          返回主页
        </Button>
      </div>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '28px' }}>地图管理</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={handleCreateMap}
        >
          新建地图
        </Button>
      </div>

      <h2 style={{ marginBottom: '16px', fontSize: '20px' }}>已保存的地图</h2>

      {maps.length === 0 ? (
        <Empty
          description="暂无已保存的地图，点击上方按钮创建新地图"
          style={{ marginTop: '60px' }}
        />
      ) : (
        <List
          grid={{
            gutter: 16,
            xs: 1,
            sm: 2,
            md: 3,
            lg: 3,
            xl: 4,
            xxl: 4,
          }}
          dataSource={maps}
          renderItem={(map) => (
            <List.Item>
              <Card
                hoverable
                cover={
                  <div
                    style={{
                      height: '200px',
                      background: '#f0f0f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                    onClick={() => handleSelectMap(map)}
                  >
                    {map.thumbnail ? (
                      <img
                        src={map.thumbnail}
                        alt={map.name}
                        style={{ maxWidth: '100%', maxHeight: '100%' }}
                      />
                    ) : (
                      <span style={{ color: '#999' }}>无缩略图</span>
                    )}
                  </div>
                }
                actions={[
                  <DeleteOutlined
                    key="delete"
                    onClick={() => handleDeleteMap(map)}
                  />,
                ]}
              >
                <Card.Meta
                  title={map.name}
                  description={dayjs(map.createdAt).format('YYYY-MM-DD HH:mm')}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
                  {map.width} × {map.height} px
                </div>
              </Card>
            </List.Item>
          )}
        />
      )}

      <Modal
        title="删除地图"
        open={deleteModalVisible}
        onOk={confirmDelete}
        onCancel={() => setDeleteModalVisible(false)}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>确定要删除地图 "{selectedMap?.name}" 吗？此操作不可恢复。</p>
      </Modal>
    </div>
  );
};
