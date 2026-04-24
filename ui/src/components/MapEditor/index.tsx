import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Input, Switch } from '@astribot/ui';
import {
  ArrowLeft,
  Eraser,
  Grid3X3,
  Map as MapIcon,
  Pencil,
  Redo2,
  Save,
  SquareDashedMousePointer,
  Trash2,
  Undo2,
} from 'lucide-react';
import dayjs from 'dayjs';
import { MapCanvas } from '@/components/common/MapCanvas';
import { apiService } from '@/services/api';
import { mapStorageService } from '@/services/storage';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import type { MapData } from '@/types';

enum EditTool {
  NONE = 'none',
  OBSTACLE = 'obstacle',
  FREE = 'free',
  UNKNOWN = 'unknown',
}

interface HistoryState {
  data: number[];
  timestamp: number;
}

export const MapEditor: React.FC = () => {
  const { mapId } = useParams<{ mapId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { connectionStatus } = useRobot();

  const [mapData, setMapData] = useState<MapData | null>(null);
  const [mapName, setMapName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editTool, setEditTool] = useState<EditTool>(EditTool.NONE);
  const [brushSize, setBrushSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [gridSize, setGridSize] = useState(1.0);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingHistorySave, setPendingHistorySave] = useState<number[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const loadMap = async () => {
      if (!mapId) {
        setNotice('地图ID无效');
        navigate('/maps');
        return;
      }

      const passedMapData = (location.state as any)?.mapData as MapData | undefined;
      if (passedMapData && passedMapData.id === mapId) {
        setMapData(passedMapData);
        setMapName(passedMapData.name);
        setHistory([{ data: [...passedMapData.data], timestamp: Date.now() }]);
        setHistoryIndex(0);
        return;
      }

      if (connectionStatus !== ConnectionStatus.CONNECTED) {
        setNotice('请先连接后端');
        navigate('/maps');
        return;
      }

      try {
        const map = await apiService.loadMap(mapId);
        if (!map) {
          setNotice('地图不存在');
          navigate('/maps');
          return;
        }

        setMapData(map);
        setMapName(map.name);
        setHistory([{ data: [...map.data], timestamp: Date.now() }]);
        setHistoryIndex(0);
      } catch (error) {
        console.error('加载地图失败:', error);
        setNotice('加载地图失败');
        navigate('/maps');
      }
    };

    void loadMap();
  }, [mapId, navigate, location.state, connectionStatus]);

  const saveToHistory = useCallback((newData: number[]) => {
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      next.push({ data: [...newData], timestamp: Date.now() });
      return next.slice(-50);
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 49));
    setHasUnsavedChanges(true);
  }, [historyIndex]);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        handleUndo();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!isDrawing && pendingHistorySave) {
      saveToHistory(pendingHistorySave);
      setPendingHistorySave(null);
    }
  }, [isDrawing, pendingHistorySave, saveToHistory]);

  useEffect(() => {
    const handleMouseUp = () => {
      if (isDrawing) {
        setIsDrawing(false);
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isDrawing]);

  const handleMapEdit = useCallback((x: number, y: number) => {
    if (!mapData || editTool === EditTool.NONE) return;

    const newData = [...mapData.data];
    const { width, height, resolution, origin } = mapData;
    const mapX = Math.floor((x - origin.x) / resolution);
    const mapY = Math.floor((y - origin.y) / resolution);
    const radius = Math.floor(brushSize / 2);
    let modified = false;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;

        const px = mapX + dx;
        const py = mapY + dy;
        if (px < 0 || px >= width || py < 0 || py >= height) continue;

        const index = py * width + px;
        let newValue: number;
        switch (editTool) {
          case EditTool.OBSTACLE:
            newValue = 100;
            break;
          case EditTool.FREE:
            newValue = 0;
            break;
          case EditTool.UNKNOWN:
            newValue = -1;
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
      setPendingHistorySave(newData);
      setIsDrawing(true);
    }
  }, [mapData, editTool, brushSize]);

  const handleSave = async () => {
    if (!mapData) return;

    if (!mapName.trim()) {
      setNotice('请输入地图名称');
      return;
    }

    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      setNotice('请先连接后端');
      return;
    }

    const sanitizedName = mapStorageService.sanitizeMapName(mapName);
    if (sanitizedName !== mapName) {
      setNotice(`地图名称已规范化为: ${sanitizedName}`);
    }

    try {
      const updatedMap: MapData = {
        ...mapData,
        id: sanitizedName,
        name: sanitizedName,
      };

      await apiService.saveMap(updatedMap);
      setMapData(updatedMap);
      setMapName(updatedMap.name);
      setIsEditing(false);
      setHasUnsavedChanges(false);
      setNotice('地图已保存');
    } catch (error) {
      console.error('保存地图失败:', error);
      setNotice('保存地图失败');
    }
  };

  const handleBack = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('您有未保存的地图修改，确定要离开吗？未保存的更改将丢失。');
      if (!confirmed) return;
    }
    navigate('/maps');
  };

  const handleDelete = async () => {
    if (!mapData) return;

    const confirmed = window.confirm(`确定要删除地图 "${mapData.name}" 吗？此操作不可恢复。`);
    if (!confirmed) return;

    try {
      let rosDeleteSuccess = false;
      let localDeleteSuccess = false;

      try {
        mapStorageService.deleteMapFromLocalCache(mapData.id);
        localDeleteSuccess = true;
      } catch (error) {
        console.error('[地图删除] 本地缓存删除失败:', error);
      }

      if (connectionStatus === ConnectionStatus.CONNECTED) {
        try {
          await apiService.deleteMap(mapData.id);
          rosDeleteSuccess = true;
        } catch (error) {
          console.error('[地图删除] 后端删除失败:', error);
        }
      }

      if (localDeleteSuccess && rosDeleteSuccess) {
        setNotice('地图已删除（本地和后端同步完成）');
      } else if (localDeleteSuccess && !rosDeleteSuccess) {
        setNotice('地图已从本地删除，但后端删除失败');
      } else {
        setNotice('地图删除失败');
        return;
      }

      navigate('/maps');
    } catch (error) {
      console.error('删除地图失败:', error);
      setNotice('删除地图失败');
    }
  };

  if (!mapData) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        加载中...
      </div>
    );
  }

  const toolMeta: Array<{ key: EditTool; label: string; icon: React.ReactNode }> = [
    { key: EditTool.NONE, label: '无', icon: <SquareDashedMousePointer className="h-4 w-4" /> },
    { key: EditTool.FREE, label: '自由区域', icon: <Pencil className="h-4 w-4" /> },
    { key: EditTool.OBSTACLE, label: '障碍物', icon: <MapIcon className="h-4 w-4" /> },
    { key: EditTool.UNKNOWN, label: '未知区域', icon: <Eraser className="h-4 w-4" /> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-card/80 px-4 py-4">
        <Button type="button" variant="outline" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回地图管理
        </Button>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <Input
              value={mapName}
              onChange={(event) => setMapName(event.target.value)}
              className="max-w-sm"
              placeholder="输入地图名称"
            />
          ) : (
            <div className="text-base font-semibold text-foreground">
              地图: {mapData.name}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {isEditing ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMapName(mapData.name);
                  setIsEditing(false);
                }}
              >
                取消
              </Button>
              <Button type="button" onClick={() => void handleSave()}>
                <Save className="mr-2 h-4 w-4" />
                保存{hasUnsavedChanges ? ' *' : ''}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setIsEditing(true)}>
                编辑名称
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={!hasUnsavedChanges}>
                <Save className="mr-2 h-4 w-4" />
                保存地图{hasUnsavedChanges ? ' *' : ''}
              </Button>
              <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
                <Trash2 className="mr-2 h-4 w-4" />
                删除地图
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 border-b border-border/70 bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">编辑工具</span>
          {toolMeta.map((tool) => (
            <Button
              key={tool.key}
              type="button"
              size="sm"
              variant={editTool === tool.key ? 'default' : 'outline'}
              onClick={() => setEditTool(tool.key)}
            >
              {tool.icon}
              <span className="ml-2">{tool.label}</span>
            </Button>
          ))}
        </div>

        {editTool !== EditTool.NONE && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">画笔大小</span>
            <input
              type="range"
              min={1}
              max={20}
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              className="w-44"
            />
            <Badge variant="secondary">{brushSize}px</Badge>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
            <Grid3X3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">栅格</span>
            <Switch checked={showGrid} onCheckedChange={setShowGrid} />
            {showGrid && (
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={gridSize}
                onChange={(event) => setGridSize(Number(event.target.value))}
              >
                <option value={0.5}>0.5m</option>
                <option value={1}>1.0m</option>
                <option value={2}>2.0m</option>
                <option value={5}>5.0m</option>
              </select>
            )}
          </div>

          <Button type="button" variant="outline" onClick={handleUndo} disabled={historyIndex <= 0}>
            <Undo2 className="mr-2 h-4 w-4" />
            撤销
          </Button>
          <Button type="button" variant="outline" onClick={handleRedo} disabled={historyIndex >= history.length - 1}>
            <Redo2 className="mr-2 h-4 w-4" />
            重做
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/10">
        <div className="absolute inset-0">
          <MapCanvas
            mapData={mapData}
            showRobotTrail={false}
            showCoordinateSystem={true}
            showOperationHints={false}
            onMapClick={editTool !== EditTool.NONE ? handleMapEdit : undefined}
            disableDirectionSetting={editTool !== EditTool.NONE}
            brushSize={brushSize}
            showGrid={showGrid}
            gridSize={gridSize}
          />

          <div className="absolute right-4 top-4 w-80 rounded-lg border border-border/70 bg-background/90 p-4 shadow-sm">
            <div className="mb-3 text-sm font-medium text-foreground">地图信息</div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p><strong>创建时间:</strong> {dayjs(mapData.createdAt).format('YYYY-MM-DD HH:mm')}</p>
              <p><strong>地图尺寸:</strong> {mapData.width} × {mapData.height} px</p>
              <p><strong>分辨率:</strong> {mapData.resolution.toFixed(3)} m/px</p>
              <p><strong>地图原点:</strong> ({mapData.origin?.x?.toFixed(2) ?? '?'}, {mapData.origin?.y?.toFixed(2) ?? '?'})</p>
              <p><strong>像素总数:</strong> {mapData.data.length.toLocaleString()}</p>
              <p><strong>连接状态:</strong> {connectionStatus === ConnectionStatus.CONNECTED ? '已连接' : '未连接'}</p>
            </div>
          </div>

          <div className="absolute bottom-4 left-4 rounded-lg bg-black/75 px-4 py-3 text-sm text-white">
            <div>滚轮缩放，中键或右键拖动平移</div>
            {editTool !== EditTool.NONE && <div className="mt-1">左键点击或拖动编辑地图</div>}
            <div className="mt-1">Ctrl+Z 撤销 | Ctrl+Y 重做</div>
          </div>
        </div>
      </div>

      {notice && (
        <div className="border-t border-border/70 bg-card/80 px-4 py-3 text-sm text-muted-foreground">
          {notice}
        </div>
      )}
    </div>
  );
};
