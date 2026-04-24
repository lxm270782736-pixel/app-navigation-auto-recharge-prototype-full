import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Edit3, Map, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@astribot/ui';
import { apiService } from '@/services/api';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus, type MapData } from '@/types';
import dayjs from 'dayjs';

const CURRENT_MAP_KEY = 'astribot_current_map_id';

function sortMaps(mapList: MapData[]): MapData[] {
  return [...mapList].sort((a, b) => {
    const aHasTime = a.createdAt && !Number.isNaN(new Date(a.createdAt).getTime());
    const bHasTime = b.createdAt && !Number.isNaN(new Date(b.createdAt).getTime());

    if (aHasTime && bHasTime) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (aHasTime && !bHasTime) {
      return -1;
    }
    if (!aHasTime && bHasTime) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function formatCreatedAt(createdAt: string) {
  const parsed = dayjs(createdAt);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '未知时间';
}

export function MapManager() {
  const navigate = useNavigate();
  const { connectionStatus } = useRobot();
  const [maps, setMaps] = useState<MapData[]>([]);
  const [selectedMap, setSelectedMap] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [currentMapId, setCurrentMapId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CURRENT_MAP_KEY);
    } catch (error) {
      console.error('读取当前地图ID失败:', error);
      return null;
    }
  });

  useEffect(() => {
    void loadMaps(false);
  }, []);

  useEffect(() => {
    if (!currentMapId || maps.length === 0) {
      return;
    }
    const mapExists = maps.some((map) => map.id === currentMapId);
    if (!mapExists) {
      setCurrentMapId(null);
      try {
        localStorage.removeItem(CURRENT_MAP_KEY);
      } catch (error) {
        console.error('清除当前地图失败:', error);
      }
    }
  }, [currentMapId, maps]);

  const mapCountLabel = useMemo(() => `${maps.length} 张地图`, [maps.length]);

  async function loadMaps(forceRefresh = false) {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      setStatusMessage('请先连接后端，再加载地图列表。');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage(null);

      if (forceRefresh) {
        try {
          const currentMapName = await apiService.getCurrentMapName();
          if (currentMapName) {
            setCurrentMapId(currentMapName);
            localStorage.setItem(CURRENT_MAP_KEY, currentMapName);
          } else {
            setCurrentMapId(null);
            localStorage.removeItem(CURRENT_MAP_KEY);
          }
        } catch (error) {
          console.error('获取当前地图失败:', error);
        }
      }

      const rosMaps = await apiService.getAllMapMetadata();
      setMaps(sortMaps(rosMaps));
      void loadFullMapData(rosMaps);
    } catch (error) {
      console.error('加载地图列表失败:', error);
      setStatusMessage('加载地图列表失败。');
    } finally {
      setLoading(false);
    }
  }

  async function loadFullMapData(mapList: MapData[]) {
    const validMaps = mapList.filter((map) => map.id && map.name && map.id !== 'unknown_map');
    await Promise.all(
      validMaps.map(async (map) => {
        try {
          const fullMapData = await apiService.loadMap(map.id);
          if (fullMapData) {
            setMaps((prevMaps) =>
              prevMaps.map((item) =>
                item.id === map.id ? { ...map, ...fullMapData, thumbnail: map.thumbnail } : item,
              ),
            );
          }
        } catch (error) {
          console.error(`加载地图数据 ${map.name} 失败:`, error);
        }
      }),
    );
  }

  function handleCreateMap() {
    navigate('/mapping');
  }

  function handleEditMap(map: MapData) {
    const latestMap = maps.find((item) => item.id === map.id) ?? map;
    if (!latestMap.data?.length) {
      navigate(`/map-editor/${map.id}`);
      return;
    }
    navigate(`/map-editor/${map.id}`, { state: { mapData: latestMap } });
  }

  async function handleApplyMap(map: MapData) {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      setStatusMessage('请先连接后端，再应用地图。');
      return;
    }

    try {
      setStatusMessage(`正在应用地图 “${map.name}” ...`);
      await apiService.setCurrentMap(map);
      setCurrentMapId(map.id);
      localStorage.setItem(CURRENT_MAP_KEY, map.id);
      setStatusMessage(`地图 “${map.name}” 已应用为当前地图。`);
    } catch (error) {
      console.error('应用地图失败:', error);
      setStatusMessage(`应用地图失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async function confirmDelete() {
    if (!selectedMap) {
      return;
    }
    try {
      await apiService.deleteMap(selectedMap.id);
      if (selectedMap.id === currentMapId) {
        setCurrentMapId(null);
        localStorage.removeItem(CURRENT_MAP_KEY);
      }
      setMaps((prevMaps) => prevMaps.filter((map) => map.id !== selectedMap.id));
      setStatusMessage(`地图 “${selectedMap.name}” 已删除。`);
    } catch (error) {
      console.error('删除地图失败:', error);
      setStatusMessage(`删除地图失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setSelectedMap(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card/80 p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Button variant="ghost" className="-ml-3 w-fit" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回主页
          </Button>
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Map Library</div>
            <h1 className="text-2xl font-semibold text-foreground">地图管理</h1>
            <p className="text-sm text-muted-foreground">查看已保存地图、应用到导航系统、或直接进入编辑模式。</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">{mapCountLabel}</Badge>
          <Button variant="secondary" onClick={() => void loadMaps(true)} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新列表
          </Button>
          <Button onClick={handleCreateMap}>
            <Plus className="mr-2 h-4 w-4" />
            新建地图
          </Button>
        </div>
      </section>

      {connectionStatus !== ConnectionStatus.CONNECTED && (
        <Card className="border-yellow-500/30 bg-yellow-500/10">
          <CardContent className="p-4 text-sm text-yellow-500">
            请先连接后端，再加载地图列表。
          </CardContent>
        </Card>
      )}

      {statusMessage && (
        <Card className="border-border bg-secondary/40">
          <CardContent className="p-4 text-sm text-muted-foreground">{statusMessage}</CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="border-border bg-card/80">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">正在加载地图列表...</CardContent>
        </Card>
      ) : maps.length === 0 ? (
        <Card className="border-dashed border-border bg-card/60">
          <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-10 text-center">
            <div className="rounded-2xl bg-primary/10 p-4 text-primary">
              <Map className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="text-base font-medium">暂无地图</div>
              <p className="text-sm text-muted-foreground">先去建图，或从后端同步地图元数据。</p>
            </div>
            <Button onClick={handleCreateMap}>
              <Plus className="mr-2 h-4 w-4" />
              创建第一张地图
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {maps.map((map) => {
            const isCurrentMap = currentMapId === map.id;
            return (
              <Card key={map.id} className="overflow-hidden border-border bg-card/80 shadow-sm">
                <div
                  className="flex h-52 cursor-pointer items-center justify-center overflow-hidden bg-secondary/40"
                  onClick={() => handleEditMap(map)}
                >
                  {map.thumbnail ? (
                    <img src={map.thumbnail} alt={map.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="text-sm text-muted-foreground">无缩略图</div>
                  )}
                </div>

                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{map.name}</CardTitle>
                      <CardDescription>{formatCreatedAt(map.createdAt)}</CardDescription>
                    </div>
                    {isCurrentMap ? (
                      <Badge className="bg-green-500/15 text-green-500 hover:bg-green-500/15">使用中</Badge>
                    ) : (
                      <Badge variant="secondary">可应用</Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">尺寸</dt>
                      <dd className="font-medium">{map.width} × {map.height}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">分辨率</dt>
                      <dd className="font-medium">{map.resolution} m/px</dd>
                    </div>
                  </dl>

                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      size="sm"
                      variant={isCurrentMap ? 'secondary' : 'default'}
                      onClick={() => void handleApplyMap(map)}
                      disabled={isCurrentMap}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {isCurrentMap ? '当前地图' : '应用'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleEditMap(map)}>
                      <Edit3 className="mr-2 h-4 w-4" />
                      编辑
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setSelectedMap(map)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      <Dialog open={Boolean(selectedMap)} onOpenChange={(open) => !open && setSelectedMap(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除地图</DialogTitle>
            <DialogDescription>
              {selectedMap ? `确定删除地图 “${selectedMap.name}” 吗？此操作无法撤销。` : '确定删除当前地图吗？'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSelectedMap(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
