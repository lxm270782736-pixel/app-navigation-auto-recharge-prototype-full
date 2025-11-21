import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, List, Modal, Empty, message, Space } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  EditOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';
import { mapStorageService } from '@/services/storage';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { MapData } from '@/types';
import dayjs from 'dayjs';

export const MapManager: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useROS();
  const [maps, setMaps] = useState<MapData[]>([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedMap, setSelectedMap] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [thumbnailsLoading, setThumbnailsLoading] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadMaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMaps = async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      message.warning('请先连接 ROS');
      return;
    }

    try {
      setLoading(true);
      // 从 ROS Service 获取地图列表（不含 data 和缩略图）
      const allMaps = await rosService.getAllMapMetadata();
      setMaps(allMaps);
      console.log('[地图管理] 已加载', allMaps.length, '个地图');

      // 异步加载每个地图的缩略图
      loadThumbnails(allMaps);
    } catch (error) {
      console.error('加载地图列表失败:', error);
      message.error('加载地图列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadThumbnails = async (mapList: MapData[]) => {
    // 过滤掉无效的地图（id 或 name 为空/undefined）
    const validMaps = mapList.filter(map => {
      if (!map.id || !map.name || map.id === 'unknown_map') {
        console.warn('[地图管理] 跳过无效地图:', map);
        return false;
      }
      return true;
    });

    // 并行加载所有地图的缩略图和元数据
    const thumbnailPromises = validMaps.map(async (map) => {
      setThumbnailsLoading((prev) => new Set(prev).add(map.id));

      try {
        // 从 ROS 加载完整地图数据（获取真实的元数据）
        const fullMapData = await rosService.loadMapFromROS(map.id);

        // 生成缩略图
        const thumbnail = mapStorageService.generateThumbnail(
          fullMapData.data,
          fullMapData.width,
          fullMapData.height
        );

        // 更新地图的缩略图、元数据和完整数据
        setMaps((prevMaps) =>
          prevMaps.map((m) =>
            m.id === map.id ? {
              ...m,
              thumbnail,
              // 更新真实的元数据
              width: fullMapData.width,
              height: fullMapData.height,
              resolution: fullMapData.resolution,
              origin: fullMapData.origin,
              createdAt: fullMapData.createdAt,
              // 最重要：更新完整的地图数据
              data: fullMapData.data,
            } : m
          )
        );

        console.log('[地图管理] 已加载地图完整数据:', map.name, `${fullMapData.width}×${fullMapData.height}`, `数据量: ${fullMapData.data.length} 像素`);
      } catch (error) {
        console.error(`加载地图 ${map.name || map.id} 失败:`, error);
      } finally {
        setThumbnailsLoading((prev) => {
          const newSet = new Set(prev);
          newSet.delete(map.id);
          return newSet;
        });
      }
    });

    // 等待所有地图数据加载完成
    await Promise.all(thumbnailPromises);
    console.log('[地图管理] 所有地图数据已加载完成');
  };

  const handleCreateMap = () => {
    navigate('/mapping');
  };

  const handleEditMap = (map: MapData) => {
    // 传递完整的地图数据，避免在编辑器中重复加载
    navigate(`/map-editor/${map.id}`, { state: { mapData: map } });
  };

  const handleApplyMap = async (map: MapData) => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      message.warning('请先连接 ROS');
      return;
    }

    try {
      message.loading({ content: '正在应用地图...', key: 'applyMap', duration: 0 });

      // 调用 ROS 服务，将地图设置为当前地图
      await rosService.setCurrentMap(map);

      message.success({
        content: `地图 "${map.name}" 已应用为当前地图，SLAM 端将实时发布`,
        key: 'applyMap',
        duration: 3,
      });

      console.log('[地图管理] 已应用地图:', map.name);
    } catch (error) {
      console.error('应用地图失败:', error);
      message.error({
        content: '应用地图失败: ' + (error instanceof Error ? error.message : '未知错误'),
        key: 'applyMap',
      });
    }
  };

  const handleDeleteMap = (map: MapData) => {
    setSelectedMap(map);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!selectedMap) return;

    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      message.warning('请先连接 ROS');
      setDeleteModalVisible(false);
      return;
    }

    try {
      // 调用 ROS 服务删除地图
      await rosService.deleteMapFromROS(selectedMap.id);
      message.success('地图已删除');

      // 重新加载地图列表
      await loadMaps();

      setDeleteModalVisible(false);
      setSelectedMap(null);
    } catch (error) {
      console.error('删除地图失败:', error);
      message.error('删除地图失败: ' + (error instanceof Error ? error.message : '未知错误'));
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
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadMaps}
            disabled={connectionStatus !== ConnectionStatus.CONNECTED}
            loading={loading}
          >
            刷新列表
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={handleCreateMap}
          >
            新建地图
          </Button>
        </Space>
      </div>

      {connectionStatus !== ConnectionStatus.CONNECTED && (
        <div style={{
          padding: '16px',
          background: '#fff7e6',
          border: '1px solid #ffd591',
          borderRadius: '4px',
          marginBottom: '16px',
        }}>
          ⚠️ 请先连接 ROS 以加载地图列表
        </div>
      )}

      <h2 style={{ marginBottom: '16px', fontSize: '20px' }}>已保存的地图 ({maps.length})</h2>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#999' }}>
          加载中...
        </div>
      ) : maps.length === 0 ? (
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
                    onClick={() => handleEditMap(map)}
                  >
                    {thumbnailsLoading.has(map.id) ? (
                      <span style={{ color: '#999' }}>加载缩略图中...</span>
                    ) : map.thumbnail ? (
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
                  <Button
                    key="apply"
                    type="link"
                    icon={<CheckCircleOutlined />}
                    onClick={() => handleApplyMap(map)}
                    style={{ color: '#52c41a' }}
                  >
                    应用
                  </Button>,
                  <Button
                    key="edit"
                    type="link"
                    icon={<EditOutlined />}
                    onClick={() => handleEditMap(map)}
                  >
                    编辑
                  </Button>,
                  <Button
                    key="delete"
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteMap(map)}
                  >
                    删除
                  </Button>,
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
