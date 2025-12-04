import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, List, Modal, Empty, message, Space, Badge, Tag, Alert } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  EditOutlined,
  ReloadOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { rosService } from '@/services/ros';
import { mapStorageService } from '@/services/storage';
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
  const [thumbnailsLoading, setThumbnailsLoading] = useState<Set<string>>(new Set());

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
    try {
      setLoading(true);

      // 如果是强制刷新，从ROS获取当前地图名称
      if (forceRefresh && connectionStatus === ConnectionStatus.CONNECTED) {
        try {
          const currentMapName = await rosService.getCurrentMapName();
          if (currentMapName) {
            // 根据地图名称查找对应的地图ID
            // 注意：这里假设地图ID和名称相同，如果不同需要调整
            setCurrentMapId(currentMapName);
            // 同步到 localStorage
            localStorage.setItem(CURRENT_MAP_KEY, currentMapName);
            console.log('[地图管理] 从ROS获取当前地图:', currentMapName);
          } else {
            // 如果ROS返回空，清除当前地图状态
            setCurrentMapId(null);
            localStorage.removeItem(CURRENT_MAP_KEY);
            console.log('[地图管理] ROS未设置当前地图，已清除本地状态');
          }
        } catch (error) {
          console.error('[地图管理] 获取当前地图失败:', error);
        }
      }

      // 如果不是强制刷新，优先从本地缓存加载
      if (!forceRefresh) {
        const localMaps = mapStorageService.getAllMapsFromLocalCache();
        if (localMaps.length > 0) {
          setMaps(sortMaps(localMaps));
          console.log('[地图管理] 从本地缓存加载', localMaps.length, '个地图');
          setLoading(false);
          return;
        }
        console.log('[地图管理] 本地缓存为空，从 ROS 加载');
      } else {
        console.log('[地图管理] 强制刷新，对比本地和远端');
      }

      // 本地为空或强制刷新，从 ROS 加载
      if (connectionStatus !== ConnectionStatus.CONNECTED) {
        message.warning('请先连接 ROS');
        setLoading(false);
        return;
      }

      // 从 ROS Service 获取地图列表（已包含元数据和缩略图，但不含完整 data）
      const rosMaps = await rosService.getAllMapMetadata();
      console.log('[地图管理] 从 ROS 加载', rosMaps.length, '个地图（含元数据和缩略图）');

      // 如果是强制刷新，对比本地缓存和ROS，标记本地独有的地图
      let finalMaps: MapData[] = [...rosMaps];
      if (forceRefresh) {
        const localMaps = mapStorageService.getAllMapsFromLocalCache();
        const rosMapIds = new Set(rosMaps.map(m => m.id));

        // 找出只存在于本地的地图
        const localOnlyMaps = localMaps.filter(localMap => !rosMapIds.has(localMap.id));

        if (localOnlyMaps.length > 0) {
          console.log('[地图管理] 发现', localOnlyMaps.length, '个仅存在于本地的地图:', localOnlyMaps.map(m => m.name));

          // 标记为本地独有
          localOnlyMaps.forEach(map => {
            map.localOnly = true;
          });

          // 合并到最终列表
          finalMaps = [...rosMaps, ...localOnlyMaps];

          message.warning(`发现 ${localOnlyMaps.length} 个地图仅存在于本地，未同步到ROS`);
        }
      }

      // 排序地图列表
      const sortedMaps = sortMaps(finalMaps);
      setMaps(sortedMaps);

      // 异步加载每个地图的完整数据（用于编辑）
      loadFullMapData(sortedMaps, forceRefresh);
    } catch (error) {
      console.error('加载地图列表失败:', error);
      message.error('加载地图列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadFullMapData = async (mapList: MapData[], saveToCache: boolean = true) => {
    // 过滤掉无效的地图（id 或 name 为空/undefined）
    // 同时过滤掉仅本地的地图（它们已经有完整数据，不需要从ROS加载）
    const validMaps = mapList.filter(map => {
      if (!map.id || !map.name || map.id === 'unknown_map') {
        console.warn('[地图管理] 跳过无效地图:', map);
        return false;
      }
      if (map.localOnly) {
        console.log('[地图管理] 跳过仅本地地图（已有完整数据）:', map.name);
        return false;
      }
      return true;
    });

    // 并行加载所有地图的完整数据（用于编辑）
    const dataPromises = validMaps.map(async (map) => {
      setThumbnailsLoading((prev) => new Set(prev).add(map.id));

      try {
        // 从 ROS 加载完整地图数据（只需要 data 字段，元数据和缩略图已有）
        const fullMapData = await rosService.loadMapFromROS(map.id);

        // 创建完整的地图对象
        const completeMap: MapData = {
          ...map,
          data: fullMapData.data,
        };

        // 更新 state
        setMaps((prevMaps) =>
          prevMaps.map((m) =>
            m.id === map.id ? completeMap : m
          )
        );

        // 保存到本地缓存（如果需要）
        if (saveToCache) {
          mapStorageService.saveMapToLocalCache(completeMap);
        }

        console.log('[地图管理] 已加载地图数据:', map.name, `数据量: ${fullMapData.data.length} 像素`);
      } catch (error) {
        console.error(`加载地图数据 ${map.name || map.id} 失败:`, error);
      } finally {
        setThumbnailsLoading((prev) => {
          const newSet = new Set(prev);
          newSet.delete(map.id);
          return newSet;
        });
      }
    });

    // 等待所有地图数据加载完成
    await Promise.all(dataPromises);
    console.log('[地图管理] 所有地图数据已加载完成' + (saveToCache ? '（已保存到本地缓存）' : ''));
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

    // 如果是本地独有的地图，不能应用
    if (map.localOnly) {
      message.warning('该地图仅存在于本地，请先同步到ROS后再应用');
      return;
    }

    try {
      message.loading({ content: '正在应用地图...', key: 'applyMap', duration: 0 });

      // 调用 ROS 服务，将地图设置为当前地图
      await rosService.setCurrentMap(map);

      // 更新当前地图ID
      setCurrentMapId(map.id);

      // 持久化到 localStorage
      try {
        localStorage.setItem(CURRENT_MAP_KEY, map.id);
        console.log('[地图管理] 当前地图ID已保存到 localStorage:', map.id);
      } catch (error) {
        console.error('保存当前地图ID到 localStorage 失败:', error);
      }

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

  const handleSyncToROS = async (map: MapData) => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      message.warning('请先连接 ROS');
      return;
    }

    try {
      message.loading({ content: '正在同步到ROS...', key: 'syncMap', duration: 0 });

      // 保存到 ROS
      await rosService.saveMapToROS(map);

      message.success({
        content: `地图 "${map.name}" 已同步到ROS`,
        key: 'syncMap',
        duration: 2,
      });

      console.log('[地图管理] 地图已同步到ROS:', map.name);

      // 更新地图状态，移除 localOnly 标记
      setMaps((prevMaps) =>
        prevMaps.map((m) =>
          m.id === map.id ? { ...m, localOnly: false } : m
        )
      );
    } catch (error) {
      console.error('同步到ROS失败:', error);
      message.error({
        content: '同步到ROS失败: ' + (error instanceof Error ? error.message : '未知错误'),
        key: 'syncMap',
      });
    }
  };

  const handleDeleteMap = (map: MapData) => {
    setSelectedMap(map);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!selectedMap) return;

    try {
      // 同步删除：本地和ROS并行处理
      let rosDeleteSuccess = false;
      let localDeleteSuccess = false;

      // 1. 立即删除本地缓存（优先本地策略）
      try {
        mapStorageService.deleteMapFromLocalCache(selectedMap.id);
        localDeleteSuccess = true;
        console.log('[地图删除] 本地缓存已删除');
      } catch (error) {
        console.error('[地图删除] 本地缓存删除失败:', error);
      }

      // 2. 尝试删除ROS后端（如果已连接）
      if (connectionStatus === ConnectionStatus.CONNECTED) {
        try {
          await rosService.deleteMapFromROS(selectedMap.id);
          rosDeleteSuccess = true;
          console.log('[地图删除] ROS后端已删除');
        } catch (error) {
          console.error('[地图删除] ROS后端删除失败:', error);
          // ROS删除失败不阻止本地删除
        }
      }

      // 3. 如果删除的是当前地图，清除当前地图状态
      if (selectedMap.id === currentMapId) {
        setCurrentMapId(null);
        try {
          localStorage.removeItem(CURRENT_MAP_KEY);
          console.log('[地图删除] 已清除当前地图状态');
        } catch (error) {
          console.error('清除 localStorage 失败:', error);
        }
      }

      // 4. 更新UI状态
      setMaps((prevMaps) => prevMaps.filter((m) => m.id !== selectedMap.id));

      // 5. 显示结果
      if (localDeleteSuccess && rosDeleteSuccess) {
        message.success('地图已删除（本地和ROS同步完成）');
      } else if (localDeleteSuccess && !rosDeleteSuccess) {
        message.warning('地图已从本地删除，但ROS删除失败');
      } else if (!localDeleteSuccess) {
        message.error('地图删除失败');
      }

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
                  text={isCurrentMap ? "使用中" : "仅本地"}
                  color={isCurrentMap ? "green" : "orange"}
                  style={{ display: (isCurrentMap || map.localOnly) ? 'block' : 'none' }}
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
                  actions={
                    map.localOnly
                      ? [
                          <Button
                            key="sync"
                            type="link"
                            icon={<CloudUploadOutlined />}
                            onClick={() => handleSyncToROS(map)}
                            style={{ color: '#fa8c16' }}
                          >
                            同步到ROS
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
                        ]
                      : [
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
                        ]
                  }
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
              description={
                selectedMap.localOnly
                  ? '该地图仅存在于本地缓存，删除后将无法恢复。'
                  : '该地图将从本地缓存和ROS后端同时删除，删除后将无法恢复。'
              }
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
                  {selectedMap.localOnly && (
                    <Tag color="orange" style={{ margin: 0 }}>仅本地</Tag>
                  )}
                </div>

                <div style={{ fontSize: 13, color: '#666', lineHeight: '22px' }}>
                  <div>创建时间：{dayjs(selectedMap.createdAt).format('YYYY-MM-DD HH:mm:ss')}</div>
                  <div>地图尺寸：{selectedMap.width} × {selectedMap.height} 像素</div>
                  <div>分辨率：{selectedMap.resolution.toFixed(3)} m/px</div>
                  <div>存储位置：
                    {selectedMap.localOnly ? (
                      <span style={{ color: '#fa8c16' }}> 仅本地缓存</span>
                    ) : (
                      <span style={{ color: '#52c41a' }}> 本地缓存 + ROS后端</span>
                    )}
                  </div>
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
