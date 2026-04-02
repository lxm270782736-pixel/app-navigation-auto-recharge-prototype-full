import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, List, Modal, Empty, message, Space, Badge, Alert } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  EditOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { MapData } from '@/types';
import dayjs from 'dayjs';

// LocalStorage key for current map
const CURRENT_MAP_KEY = 'astribot_current_map_id';

export const MapManager: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useROS();
  const [maps, setMaps] = useState<MapData[]>([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedMap, setSelectedMap] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);

  // 从 localStorage 恢复当前地图ID
  const [currentMapId, setCurrentMapId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CURRENT_MAP_KEY);
    } catch (error) {
      console.error('读取当前地图ID失败:', error);
      return null;
    }
  });

  // 地图排序函数：优先按时间倒序，没有时间的按名字排序
  const sortMaps = (mapList: MapData[]): MapData[] => {
    return [...mapList].sort((a, b) => {
      const aHasTime = a.createdAt && !isNaN(new Date(a.createdAt).getTime());
      const bHasTime = b.createdAt && !isNaN(new Date(b.createdAt).getTime());

      // 如果都有有效时间，按时间倒序（最新的在前）
      if (aHasTime && bHasTime) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }

      // 如果只有 a 有时间，a 排在前面
      if (aHasTime && !bHasTime) {
        return -1;
      }

      // 如果只有 b 有时间，b 排在前面
      if (!aHasTime && bHasTime) {
        return 1;
      }

      // 如果都没有时间，按名字字母顺序排序
      return a.name.localeCompare(b.name);
    });
  };

  useEffect(() => {
    loadMaps(false); // 默认从本地加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 验证当前地图ID是否仍然存在
  useEffect(() => {
    if (currentMapId && maps.length > 0) {
      const mapExists = maps.some(map => map.id === currentMapId);
      if (!mapExists) {
        console.warn('[地图管理] 当前地图不存在，清除状态:', currentMapId);
        setCurrentMapId(null);
        try {
          localStorage.removeItem(CURRENT_MAP_KEY);
        } catch (error) {
          console.error('清除 localStorage 失败:', error);
        }
      } else {
        console.log('[地图管理] 当前地图状态已恢复:', currentMapId);
      }
    }
  }, [maps, currentMapId]);

  const loadMaps = async (forceRefresh: boolean = false) => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      message.warning('请先连接 ROS');
      return;
    }
    try {
      setLoading(true);
      if (forceRefresh) {
        try {
          const currentMapName = await rosService.getCurrentMapName();
          if (currentMapName) {
            setCurrentMapId(currentMapName);
            localStorage.setItem(CURRENT_MAP_KEY, currentMapName);
          } else {
            setCurrentMapId(null);
            localStorage.removeItem(CURRENT_MAP_KEY);
          }
        } catch (error) {
          console.error('[地图管理] 获取当前地图失败:', error);
        }
      }
      const rosMaps = await rosService.getAllMapMetadata();
      setMaps(sortMaps(rosMaps));
      loadFullMapData(rosMaps);
    } catch (error) {
      console.error('加载地图列表失败:', error);
      message.error('加载地图列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadFullMapData = async (mapList: MapData[]) => {
    const validMaps = mapList.filter(map => map.id && map.name && map.id !== 'unknown_map');
    await Promise.all(validMaps.map(async (map) => {
      try {
        const fullMapData = await rosService.loadMapFromROS(map.id);
        if (fullMapData) {
          setMaps((prevMaps) =>
            prevMaps.map((m) => m.id === map.id ? { ...map, ...fullMapData, thumbnail: map.thumbnail } : m)
          );
        }
      } catch (error) {
        console.error(`加载地图数据 ${map.name} 失败:`, error);
      }
    }));
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
      await rosService.setCurrentMap(map);
      setCurrentMapId(map.id);
      try { localStorage.setItem(CURRENT_MAP_KEY, map.id); } catch { /* ignore */ }
      message.success({ content: `地图 "${map.name}" 已应用为当前地图，SLAM 端将实时发布`, key: 'applyMap', duration: 3 });
    } catch (error) {
      message.error({ content: '应用地图失败: ' + (error instanceof Error ? error.message : '未知错误'), key: 'applyMap' });
    }
  };

  const handleDeleteMap = (map: MapData) => {
    setSelectedMap(map);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!selectedMap) return;
    try {
      await rosService.deleteMapFromROS(selectedMap.id);
      if (selectedMap.id === currentMapId) {
        setCurrentMapId(null);
        try { localStorage.removeItem(CURRENT_MAP_KEY); } catch { /* ignore */ }
      }
      setMaps((prevMaps) => prevMaps.filter((m) => m.id !== selectedMap.id));
      message.success('地图已删除');
      setDeleteModalVisible(false);
      setSelectedMap(null);
    } catch (error) {
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
            onClick={() => loadMaps(true)} // 强制从 ROS 刷新
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
        <div
          style={{
            maxHeight: 'calc(100vh - 280px)', // 动态计算最大高度，留出顶部空间
            overflowY: 'auto', // 垂直滚动
            paddingRight: '8px', // 为滚动条留出空间
          }}
        >
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
            renderItem={(map) => {
            const isCurrentMap = currentMapId === map.id;
            return (
              <List.Item>
                <Badge.Ribbon
                  text="使用中"
                  color="green"
                  style={{ display: isCurrentMap ? 'block' : 'none' }}
                >
                  <Card
                    hoverable
                    style={{
                      border: isCurrentMap ? '2px solid #52c41a' : undefined,
                      boxShadow: isCurrentMap ? '0 4px 12px rgba(82, 196, 26, 0.3)' : undefined,
                    }}
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
                    <Button
                      key="apply"
                      type="link"
                      icon={<CheckCircleOutlined />}
                      onClick={() => handleApplyMap(map)}
                      disabled={isCurrentMap}
                      style={{ color: isCurrentMap ? '#999' : '#52c41a' }}
                      title={isCurrentMap ? "当前使用中" : "应用此地图"}
                    >
                      {isCurrentMap ? '使用中' : '应用'}
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
                </Badge.Ribbon>
              </List.Item>
            );
          }}
        />
        </div>
      )}

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
            <span>删除地图</span>
          </div>
        }
        open={deleteModalVisible}
        centered
        onOk={confirmDelete}
        onCancel={() => setDeleteModalVisible(false)}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        width={520}
      >
        {selectedMap && (
          <div>
            <Alert
              message="警告：此操作不可恢复！"
              description="该地图将从 ROS 后端删除，删除后将无法恢复。"
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <div style={{
              display: 'flex',
              gap: 16,
              padding: 16,
              background: '#fafafa',
              borderRadius: 8,
              border: '1px solid #f0f0f0',
            }}>
              {/* 地图缩略图 */}
              <div style={{
                width: 120,
                height: 120,
                flexShrink: 0,
                background: '#f0f0f0',
                borderRadius: 4,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {selectedMap.thumbnail ? (
                  <img
                    src={selectedMap.thumbnail}
                    alt={selectedMap.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{ color: '#999', fontSize: 12 }}>无缩略图</span>
                )}
              </div>

              {/* 地图信息 */}
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                    {selectedMap.name}
                  </div>
                </div>

                <div style={{ fontSize: 13, color: '#666', lineHeight: '22px' }}>
                  <div>创建时间：{dayjs(selectedMap.createdAt).format('YYYY-MM-DD HH:mm:ss')}</div>
                  <div>地图尺寸：{selectedMap.width} × {selectedMap.height} 像素</div>
                  <div>分辨率：{selectedMap.resolution.toFixed(3)} m/px</div>
                  <div>存储位置：<span style={{ color: '#52c41a' }}> ROS后端</span></div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 13, color: '#666' }}>
              确定要删除地图 <strong style={{ color: '#ff4d4f' }}>"{selectedMap.name}"</strong> 吗？
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
