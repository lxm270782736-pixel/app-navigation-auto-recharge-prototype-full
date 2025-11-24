import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, Button, message, Input, Space, Radio, Slider, Modal, Tag, Alert } from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  DeleteOutlined,
  BgColorsOutlined,
  HighlightOutlined,
  ClearOutlined,
  QuestionCircleOutlined,
  UndoOutlined,
  RedoOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { MapCanvas } from '@/components/common/MapCanvas';
import { rosService } from '@/services/ros';
import { mapStorageService } from '@/services/storage';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';
import type { MapData } from '@/types';
import dayjs from 'dayjs';

// 编辑工具类型
enum EditTool {
  NONE = 'none',
  OBSTACLE = 'obstacle', // 绘制障碍物
  FREE = 'free', // 绘制自由区域
  UNKNOWN = 'unknown', // 橡皮擦（恢复为未知）
}

// 历史记录项
interface HistoryState {
  data: number[];
  timestamp: number;
}

export const MapEditor: React.FC = () => {
  const { mapId } = useParams<{ mapId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { connectionStatus } = useROS();

  const [mapData, setMapData] = useState<MapData | null>(null);
  const [mapName, setMapName] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // 编辑工具状态
  const [editTool, setEditTool] = useState<EditTool>(EditTool.NONE);
  const [brushSize, setBrushSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false); // 是否正在绘制

  // 历史记录（撤销/重做）
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingHistorySave, setPendingHistorySave] = useState<number[] | null>(null);

  // 初始化地图数据并保存初始状态到历史
  useEffect(() => {
    const loadMap = async () => {
      if (!mapId) {
        message.error('地图ID无效');
        navigate('/maps');
        return;
      }

      // 优先使用从地图管理界面传递过来的数据（避免重复加载）
      const passedMapData = (location.state as any)?.mapData as MapData | undefined;
      if (passedMapData && passedMapData.id === mapId) {
        console.log('[地图编辑器] 使用传递的地图数据，无需重新加载');
        setMapData(passedMapData);
        setMapName(passedMapData.name);

        // 初始化历史记录
        setHistory([{ data: [...passedMapData.data], timestamp: Date.now() }]);
        setHistoryIndex(0);
        return;
      }

      // 如果没有传递数据，或者数据不匹配，则从 ROS 加载
      if (connectionStatus !== ConnectionStatus.CONNECTED) {
        message.warning('请先连接 ROS');
        navigate('/maps');
        return;
      }

      try {
        console.log('[地图编辑器] 从 ROS 加载地图数据');
        // 从 ROS 加载地图数据
        const map = await rosService.loadMapFromROS(mapId);
        if (!map) {
          message.error('地图不存在');
          navigate('/maps');
          return;
        }

        setMapData(map);
        setMapName(map.name);

        // 初始化历史记录
        setHistory([{ data: [...map.data], timestamp: Date.now() }]);
        setHistoryIndex(0);
      } catch (error) {
        console.error('加载地图失败:', error);
        message.error('加载地图失败: ' + (error instanceof Error ? error.message : '未知错误'));
        navigate('/maps');
      }
    };

    loadMap();
  }, [mapId, navigate, location.state, connectionStatus]);

  // 保存当前状态到历史记录
  const saveToHistory = useCallback((newData: number[]) => {
    setHistory((prev) => {
      // 如果当前不在最新状态，移除后面的历史
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ data: [...newData], timestamp: Date.now() });
      // 限制历史记录数量为50
      return newHistory.slice(-50);
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 49));
    setHasUnsavedChanges(true);
  }, [historyIndex]);

  // 撤销
  const handleUndo = useCallback(() => {
    if (historyIndex > 0 && mapData) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setMapData({
        ...mapData,
        data: [...history[newIndex].data],
      });
      setHasUnsavedChanges(true);
    }
  }, [historyIndex, mapData, history]);

  // 重做
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1 && mapData) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setMapData({
        ...mapData,
        data: [...history[newIndex].data],
      });
      setHasUnsavedChanges(true);
    }
  }, [historyIndex, history, mapData]);

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // 处理pending的历史保存（在绘制结束时）
  useEffect(() => {
    if (!isDrawing && pendingHistorySave) {
      saveToHistory(pendingHistorySave);
      setPendingHistorySave(null);
    }
  }, [isDrawing, pendingHistorySave, saveToHistory]);

  // 监听全局mouseup事件来结束绘制
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDrawing) {
        setIsDrawing(false);
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isDrawing]);

  // 地图编辑处理
  const handleMapEdit = useCallback((x: number, y: number) => {
    if (!mapData || editTool === EditTool.NONE) return;

    const newData = [...mapData.data];
    const { width, height, resolution, origin } = mapData;

    // 将世界坐标转换为地图像素坐标
    const mapX = Math.floor((x - origin.x) / resolution);
    const mapY = Math.floor((y - origin.y) / resolution);

    // 根据画笔大小绘制
    const radius = Math.floor(brushSize / 2);
    let modified = false;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        // 圆形画笔
        if (dx * dx + dy * dy > radius * radius) continue;

        const px = mapX + dx;
        const py = mapY + dy;

        // 边界检查
        if (px < 0 || px >= width || py < 0 || py >= height) continue;

        const index = py * width + px;

        // 根据工具类型设置值
        let newValue: number;
        switch (editTool) {
          case EditTool.OBSTACLE:
            newValue = 100; // 障碍物
            break;
          case EditTool.FREE:
            newValue = 0; // 自由区域
            break;
          case EditTool.UNKNOWN:
            newValue = -1; // 未知
            break;
          default:
            continue;
        }

        if (newData[index] !== newValue) {
          newData[index] = newValue;
          modified = true;
        }
      }
    }

    if (modified) {
      setMapData({
        ...mapData,
        data: newData,
      });
      // 延迟保存到历史，等待绘制结束
      setPendingHistorySave(newData);
      setIsDrawing(true);
    }
  }, [mapData, editTool, brushSize]);

  const handleSave = async () => {
    if (!mapData) return;

    if (!mapName.trim()) {
      message.error('请输入地图名称');
      return;
    }

    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      message.warning('请先连接 ROS');
      return;
    }

    // 规范化地图名称（移除特殊字符）
    const sanitizedName = mapStorageService.sanitizeMapName(mapName);
    if (sanitizedName !== mapName) {
      message.warning(`地图名称已规范化为: ${sanitizedName}`);
    }

    try {
      // 生成缩略图
      const thumbnail = mapStorageService.generateThumbnail(
        mapData.data,
        mapData.width,
        mapData.height
      );

      const updatedMap: MapData = {
        ...mapData,
        id: sanitizedName, // 更新 id
        name: sanitizedName, // 使用规范化后的名称
        thumbnail, // 保存缩略图
      };

      // 保存到 ROS 服务
      await rosService.saveMapToROS(updatedMap);

      // 同时保存到本地缓存
      mapStorageService.saveMapToLocalCache(updatedMap);

      message.success('地图已保存');
      setIsEditing(false);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('保存地图失败:', error);
      message.error('保存地图失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const handleDelete = async () => {
    if (!mapData) return;

    Modal.confirm({
      title: '删除地图',
      centered: true,
      width: 520,
      icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <Alert
            message="警告：此操作不可恢复！"
            description={
              mapData.localOnly
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
              {mapData.thumbnail ? (
                <img
                  src={mapData.thumbnail}
                  alt={mapData.name}
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
                  {mapData.name}
                </div>
                {mapData.localOnly && (
                  <Tag color="orange" style={{ margin: 0 }}>仅本地</Tag>
                )}
              </div>

              <div style={{ fontSize: 13, color: '#666', lineHeight: '22px' }}>
                <div>创建时间：{dayjs(mapData.createdAt).format('YYYY-MM-DD HH:mm:ss')}</div>
                <div>地图尺寸：{mapData.width} × {mapData.height} 像素</div>
                <div>分辨率：{mapData.resolution.toFixed(3)} m/px</div>
                <div>存储位置：
                  {mapData.localOnly ? (
                    <span style={{ color: '#fa8c16' }}> 仅本地缓存</span>
                  ) : (
                    <span style={{ color: '#52c41a' }}> 本地缓存 + ROS后端</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, fontSize: 13, color: '#666' }}>
            确定要删除地图 <strong style={{ color: '#ff4d4f' }}>"{mapData.name}"</strong> 吗？
          </div>
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          let rosDeleteSuccess = false;
          let localDeleteSuccess = false;

          // 1. 立即删除本地缓存（优先本地策略）
          try {
            mapStorageService.deleteMapFromLocalCache(mapData.id);
            localDeleteSuccess = true;
            console.log('[地图删除] 本地缓存已删除');
          } catch (error) {
            console.error('[地图删除] 本地缓存删除失败:', error);
          }

          // 2. 尝试删除ROS后端（如果已连接）
          if (connectionStatus === ConnectionStatus.CONNECTED) {
            try {
              await rosService.deleteMapFromROS(mapData.id);
              rosDeleteSuccess = true;
              console.log('[地图删除] ROS后端已删除');
            } catch (error) {
              console.error('[地图删除] ROS后端删除失败:', error);
              // ROS删除失败不阻止本地删除
            }
          }

          // 3. 显示结果并返回
          if (localDeleteSuccess && rosDeleteSuccess) {
            message.success('地图已删除（本地和ROS同步完成）');
          } else if (localDeleteSuccess && !rosDeleteSuccess) {
            message.warning('地图已从本地删除，但ROS删除失败');
          } else if (!localDeleteSuccess) {
            message.error('地图删除失败');
            return; // 失败不跳转
          }

          navigate('/maps');
        } catch (error) {
          console.error('删除地图失败:', error);
          message.error('删除地图失败: ' + (error instanceof Error ? error.message : '未知错误'));
        }
      },
    });
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
                保存{hasUnsavedChanges ? ' *' : ''}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setIsEditing(true)}>
                编辑名称
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                disabled={!hasUnsavedChanges}
              >
                保存地图{hasUnsavedChanges ? ' *' : ''}
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
                删除地图
              </Button>
            </>
          )}
        </Space>
      </div>

      {/* 编辑工具栏 */}
      <div
        style={{
          padding: '12px 24px',
          background: '#fafafa',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>编辑工具:</span>
          <Radio.Group
            value={editTool}
            onChange={(e) => setEditTool(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value={EditTool.NONE}>
              <QuestionCircleOutlined /> 无
            </Radio.Button>
            <Radio.Button value={EditTool.FREE}>
              <HighlightOutlined /> 自由区域
            </Radio.Button>
            <Radio.Button value={EditTool.OBSTACLE}>
              <BgColorsOutlined /> 障碍物
            </Radio.Button>
            <Radio.Button value={EditTool.UNKNOWN}>
              <ClearOutlined /> 橡皮擦
            </Radio.Button>
          </Radio.Group>
        </div>

        {editTool !== EditTool.NONE && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '300px' }}>
            <span style={{ fontSize: '14px' }}>画笔大小:</span>
            <Slider
              min={1}
              max={20}
              value={brushSize}
              onChange={setBrushSize}
              style={{ flex: 1 }}
              marks={{ 1: '1', 5: '5', 10: '10', 15: '15', 20: '20' }}
            />
            <span style={{ fontSize: '14px', minWidth: '30px' }}>{brushSize}px</span>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <Button
            icon={<UndoOutlined />}
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            title="撤销 (Ctrl+Z)"
          >
            撤销
          </Button>
          <Button
            icon={<RedoOutlined />}
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            title="重做 (Ctrl+Y)"
          >
            重做
          </Button>
        </div>
      </div>

      {/* 地图显示区域 - 填满剩余空间 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#f0f0f0', minHeight: 0 }}>
        <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
          <MapCanvas
            mapData={mapData}
            showRobotTrail={false}
            showCoordinateSystem={false}
            showOperationHints={false}
            onMapClick={editTool !== EditTool.NONE ? handleMapEdit : undefined}
            disableDirectionSetting={editTool !== EditTool.NONE}
            brushSize={brushSize}
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
            <div>💡 滚轮缩放、中键或右键拖动平移</div>
            {editTool !== EditTool.NONE && (
              <div style={{ marginTop: '4px' }}>
                🖱️ 左键点击或拖动编辑地图
              </div>
            )}
            <div style={{ marginTop: '4px' }}>⌨️ Ctrl+Z 撤销 | Ctrl+Y 重做</div>
          </div>
        </div>
      </div>
    </div>
  );
};
