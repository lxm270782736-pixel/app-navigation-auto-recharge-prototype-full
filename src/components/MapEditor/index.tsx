import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, message, Input, Space } from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { MapCanvas } from '@/components/common/MapCanvas';
import { mapStorageService } from '@/services/storage';
import type { MapData } from '@/types';
import dayjs from 'dayjs';

export const MapEditor: React.FC = () => {
  const { mapId } = useParams<{ mapId: string }>();
  const navigate = useNavigate();

  const [mapData, setMapData] = useState<MapData | null>(null);
  const [mapName, setMapName] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!mapId) {
      message.error('地图ID无效');
      navigate('/maps');
      return;
    }

    // 加载地图数据
    const map = mapStorageService.getMap(mapId);
    if (!map) {
      message.error('地图不存在');
      navigate('/maps');
      return;
    }

    setMapData(map);
    setMapName(map.name);
  }, [mapId, navigate]);

  const handleSave = () => {
    if (!mapData) return;

    if (!mapName.trim()) {
      message.error('请输入地图名称');
      return;
    }

    const updatedMap: MapData = {
      ...mapData,
      name: mapName,
    };

    mapStorageService.saveMap(updatedMap);
    message.success('地图已保存');
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (!mapData) return;

    if (window.confirm(`确定要删除地图 "${mapData.name}" 吗？此操作不可恢复。`)) {
      mapStorageService.deleteMap(mapData.id);
      message.success('地图已删除');
      navigate('/maps');
    }
  };

  if (!mapData) {
    return <div>加载中...</div>;
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 顶部工具栏 */}
      <div
        style={{
          padding: '16px 24px',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexShrink: 0,
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/maps')}>
          返回地图管理
        </Button>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isEditing ? (
            <Input
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
              style={{ width: '300px' }}
              placeholder="输入地图名称"
              onPressEnter={handleSave}
            />
          ) : (
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
              地图: {mapData.name}
            </div>
          )}
        </div>

        <Space>
          {isEditing ? (
            <>
              <Button onClick={() => {
                setMapName(mapData.name);
                setIsEditing(false);
              }}>
                取消
              </Button>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
                保存
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setIsEditing(true)}>
                编辑名称
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
                删除地图
              </Button>
            </>
          )}
        </Space>
      </div>

      {/* 地图显示区域 - 填满剩余空间 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#f0f0f0', minHeight: 0 }}>
        <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
          <MapCanvas
            mapData={mapData}
            showRobotTrail={false}
            showCoordinateSystem={true}
            showOperationHints={false}
          />

          {/* 地图信息卡片 */}
          <Card
            title="地图信息"
            size="small"
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '320px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 10,
            }}
          >
            <div style={{ fontSize: '12px' }}>
              <p><strong>创建时间:</strong> {dayjs(mapData.createdAt).format('YYYY-MM-DD HH:mm')}</p>
              <p><strong>地图尺寸:</strong> {mapData.width} × {mapData.height} px</p>
              <p><strong>分辨率:</strong> {mapData.resolution.toFixed(3)} m/px</p>
              <p><strong>地图原点:</strong> ({mapData.origin.x.toFixed(2)}, {mapData.origin.y.toFixed(2)})</p>
              <p style={{ marginBottom: 0 }}><strong>像素总数:</strong> {mapData.data.length.toLocaleString()}</p>
            </div>
          </Card>

          {/* 操作提示 */}
          <div
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '16px',
              background: 'rgba(0, 0, 0, 0.75)',
              color: 'white',
              padding: '12px 16px',
              borderRadius: '4px',
              fontSize: '13px',
              zIndex: 10,
              fontWeight: '500',
            }}
          >
            <div>💡 支持滚轮缩放、中键拖动平移</div>
            <div>📝 点击"编辑名称"可修改地图名称</div>
          </div>
        </div>
      </div>
    </div>
  );
};
