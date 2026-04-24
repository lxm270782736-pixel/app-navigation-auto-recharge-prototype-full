import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
} from '@astribot/ui';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Map,
  Radar,
  Save,
  Square,
  TriangleAlert,
  WandSparkles,
  XCircle,
} from 'lucide-react';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { mapStorageService } from '@/services/storage';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import type { LaserScan, MapData } from '@/types';
import { MapCanvas } from '@/components/common/MapCanvas';

type StepStatus = 'wait' | 'process' | 'finish' | 'error';

export const Mapping: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus } = useRobot();
  const [isMapping, setIsMapping] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [mapName, setMapName] = useState('');
  const [currentMapData, setCurrentMapData] = useState<Partial<MapData> | null>(null);
  const [laserScan, setLaserScan] = useState<LaserScan | null>(null);
  const [showLaserScan, setShowLaserScan] = useState(false);
  const [hasLaserData, setHasLaserData] = useState(false);
  const laserDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [gridSize, setGridSize] = useState(1.0);
  const [mappingModalVisible, setMappingModalVisible] = useState(false);
  const [mappingStep, setMappingStep] = useState(0);
  const [mappingStepStatus, setMappingStepStatus] = useState<StepStatus[]>(['wait', 'wait']);
  const [skipJoystick, setSkipJoystick] = useState(false);
  const [skipMappingNode, setSkipMappingNode] = useState(false);
  const [mapNameModalVisible, setMapNameModalVisible] = useState(false);
  const [inputMapName, setInputMapName] = useState('');
  const [existingMaps, setExistingMaps] = useState<string[]>([]);
  const [pendingMapName, setPendingMapName] = useState<string>('');
  const [savingModalVisible, setSavingModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [failureModalVisible, setFailureModalVisible] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);
  const isMappingRef = useRef(false);
  isMappingRef.current = isMapping;

  useEffect(() => {
    return () => {
      if (isMappingRef.current) {
        apiService.stopLocalization().catch(console.error);
      }
    };
  }, []);

  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    const unsubscribe = apiService.subscribeTopic<any>(
      '/map',
      MESSAGE_TYPES.OCCUPANCY_GRID,
      (mapMsg) => {
        setCurrentMapData({
          width: mapMsg.info.width,
          height: mapMsg.info.height,
          resolution: mapMsg.info.resolution,
          origin: {
            x: mapMsg.info.origin.position.x,
            y: mapMsg.info.origin.position.y,
            orientation: mapMsg.info.origin.orientation.z,
          },
          data: mapMsg.data,
        });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [connectionStatus]);

  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      setHasLaserData(false);
      setLaserScan(null);
      if (laserDataTimeoutRef.current) {
        clearTimeout(laserDataTimeoutRef.current);
        laserDataTimeoutRef.current = null;
      }
      return;
    }

    setHasLaserData(true);

    const unsubscribe = apiService.subscribeTopic<any>(
      '/scan',
      MESSAGE_TYPES.LASER_SCAN,
      (scanMsg) => {
        setHasLaserData(true);
        setLaserScan({
          angle_min: scanMsg.angle_min,
          angle_max: scanMsg.angle_max,
          angle_increment: scanMsg.angle_increment,
          time_increment: scanMsg.time_increment,
          scan_time: scanMsg.scan_time,
          range_min: scanMsg.range_min,
          range_max: scanMsg.range_max,
          ranges: scanMsg.ranges,
          intensities: scanMsg.intensities,
        });

        if (laserDataTimeoutRef.current) {
          clearTimeout(laserDataTimeoutRef.current);
        }

        laserDataTimeoutRef.current = setTimeout(() => {
          setHasLaserData(false);
        }, 2000);
      }
    );

    laserDataTimeoutRef.current = setTimeout(() => {
      setHasLaserData(false);
    }, 2000);

    return () => {
      unsubscribe();
      if (laserDataTimeoutRef.current) {
        clearTimeout(laserDataTimeoutRef.current);
        laserDataTimeoutRef.current = null;
      }
    };
  }, [connectionStatus]);

  const startMapping = async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      setNotice('请先连接后端');
      return;
    }

    try {
      const defaultName = await mapStorageService.generateDefaultMapName();
      setInputMapName(defaultName);

      try {
        const maps = await apiService.getAllMapMetadata();
        setExistingMaps(maps.map((m) => m.name));
      } catch (error) {
        console.warn('获取地图列表失败，将使用空列表继续:', error);
        setNotice('无法获取现有地图列表，请注意可能存在同名地图');
        setExistingMaps([]);
      }

      setMapNameModalVisible(true);
    } catch (error) {
      console.error('初始化建图流程失败:', error);
      setNotice('初始化建图流程失败');
    }
  };

  const setMapNameAndStartMapping = async (finalMapName: string) => {
    try {
      const applyResult = await apiService.applyMap(finalMapName);
      if (!applyResult.success) {
        setNotice(applyResult.message || '设置地图名称失败');
        return;
      }

      setPendingMapName(finalMapName);
      setNotice(`地图名称已设置为 "${finalMapName}"`);
      setMapNameModalVisible(false);
      setMappingModalVisible(true);
      setMappingStep(0);
      setMappingStepStatus(['wait', 'wait']);
      setSkipJoystick(false);
      setSkipMappingNode(false);
    } catch (error) {
      console.error('设置地图名称失败:', error);
      setNotice('设置地图名称失败');
    }
  };

  const confirmMapNameAndStart = async () => {
    if (!inputMapName.trim()) {
      setNotice('请输入地图名称');
      return;
    }

    const sanitizedName = mapStorageService.sanitizeMapName(inputMapName);

    if (existingMaps.includes(sanitizedName)) {
      const shouldOverwrite = window.confirm(`地图 "${sanitizedName}" 已存在，是否覆盖？`);
      if (!shouldOverwrite) {
        return;
      }

      try {
        await apiService.deleteMap(sanitizedName);
        mapStorageService.deleteMapFromLocalCache(sanitizedName);
      } catch (error) {
        console.error('删除旧地图失败:', error);
        setNotice('删除旧地图失败');
        return;
      }
    }

    await setMapNameAndStartMapping(sanitizedName);
  };

  const executeMappingStartup = async () => {
    try {
      setMappingStep(1);
      setMappingStepStatus(['process', 'wait']);

      if (skipJoystick) {
        setMappingStepStatus(['finish', 'wait']);
      } else {
        const joystickResult = await apiService.startJoystick();
        if (!joystickResult.success) {
          setMappingStepStatus(['error', 'wait']);
          setNotice(joystickResult.message || '启动遥控器失败');
          return;
        }
        setMappingStepStatus(['finish', 'wait']);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      setMappingStep(2);
      setMappingStepStatus(['finish', 'process']);

      if (skipMappingNode) {
        setMappingStepStatus(['finish', 'finish']);
        setIsMapping(true);
      } else {
        const mappingResult = await apiService.startMapping();
        if (!mappingResult.success) {
          setMappingStepStatus(['finish', 'error']);
          setNotice(mappingResult.message || '启动建图模式失败');
          return;
        }
        setMappingStepStatus(['finish', 'finish']);
        setIsMapping(true);
      }
    } catch (error) {
      console.error(error);
      setNotice('启动建图失败');
      setMappingStepStatus((prev) => {
        const next = [...prev];
        if (mappingStep === 1) next[0] = 'error';
        if (mappingStep === 2) next[1] = 'error';
        return next as StepStatus[];
      });
    }
  };

  const syncMapFromBackend = async () => {
    if (!pendingMapName) {
      throw new Error('未设置地图名称');
    }

    const mapData = await apiService.loadMap(pendingMapName);
    if (!mapData) {
      throw new Error('地图数据为空');
    }

    mapStorageService.saveMapToLocalCache(mapData);
  };

  const stopMapping = async () => {
    setSavingModalVisible(true);

    try {
      if (!skipMappingNode) {
        const stopResult = await apiService.stopMapping();
        if (!stopResult.success) {
          setSavingModalVisible(false);
          setFailureMessage(stopResult.message || '停止建图失败');
          setFailureModalVisible(true);
          return;
        }
      }

      if (!skipJoystick) {
        const joystickResult = await apiService.stopJoystick();
        if (!joystickResult.success) {
          console.warn('[建图] 停止遥控器失败:', joystickResult.message);
        }
      }

      setIsMapping(false);

      if (pendingMapName) {
        try {
          await syncMapFromBackend();
          setSavingModalVisible(false);
          setSuccessModalVisible(true);
        } catch (error) {
          console.error('同步地图失败:', error);
          setSavingModalVisible(false);
          setFailureMessage('地图同步失败: ' + (error instanceof Error ? error.message : '未知错误'));
          setFailureModalVisible(true);
        }
      } else {
        setSavingModalVisible(false);
        setFailureMessage('未设置地图名称');
        setFailureModalVisible(true);
      }
    } catch (error) {
      console.error('停止建图失败:', error);
      setSavingModalVisible(false);
      setFailureMessage('停止建图失败: ' + (error instanceof Error ? error.message : '未知错误'));
      setFailureModalVisible(true);
    }
  };

  const saveMap = async () => {
    if (!mapName.trim()) {
      setNotice('请输入地图名称');
      return;
    }

    if (!currentMapData || !currentMapData.data) {
      setNotice('地图数据不完整，无法保存');
      return;
    }

    const sanitizedName = mapStorageService.sanitizeMapName(mapName);

    try {
      const thumbnail = mapStorageService.generateThumbnail(
        currentMapData.data,
        currentMapData.width!,
        currentMapData.height!
      );

      const mapData: MapData = {
        id: sanitizedName,
        name: sanitizedName,
        createdAt: new Date().toISOString(),
        thumbnail,
        width: currentMapData.width!,
        height: currentMapData.height!,
        resolution: currentMapData.resolution!,
        origin: currentMapData.origin!,
        data: currentMapData.data,
      };

      await apiService.saveMap(mapData);
      mapStorageService.saveMapToLocalCache(mapData);
      setNotice('地图保存成功');
      setSaveModalVisible(false);
      navigate('/maps');
    } catch (error) {
      console.error('Failed to save map:', error);
      setNotice('保存地图失败');
    }
  };

  const stepLabels = [
    {
      title: skipJoystick ? '启动遥控器（已跳过）' : '启动遥控器',
      description: skipJoystick ? '用户选择跳过此步骤' : '启动机器人遥控系统',
    },
    {
      title: skipMappingNode ? '进入建图模式（已跳过）' : '进入建图模式',
      description: skipMappingNode ? '用户选择跳过此步骤' : '启动 SLAM 建图算法',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回主页
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">SLAM 建图</h1>
          <p className="text-sm text-muted-foreground">管理建图启动流程、雷达叠加和地图同步保存。</p>
        </div>
      </div>

      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">建图工作区</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">实时查看地图、雷达和建图状态。</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                <span className="text-muted-foreground">栅格</span>
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

              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                <Radar className={`h-4 w-4 ${showLaserScan ? 'text-primary' : 'text-muted-foreground'}`} />
                <Switch checked={showLaserScan} onCheckedChange={setShowLaserScan} disabled={!hasLaserData} />
                <span className="text-muted-foreground">雷达</span>
                {!hasLaserData && connectionStatus === ConnectionStatus.CONNECTED && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-300">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    无雷达数据
                  </span>
                )}
              </div>

              {!isMapping ? (
                <Button type="button" onClick={() => void startMapping()} disabled={connectionStatus !== ConnectionStatus.CONNECTED}>
                  <WandSparkles className="mr-2 h-4 w-4" />
                  开始建图
                </Button>
              ) : (
                <Button type="button" variant="destructive" onClick={() => void stopMapping()}>
                  <Square className="mr-2 h-4 w-4" />
                  结束建图
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentMapData && currentMapData.data && currentMapData.data.length > 0 ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-lg border border-border/70 bg-muted/10">
                <div className="relative h-[600px] overflow-hidden">
                  <MapCanvas
                    mapData={{
                      id: 'temp',
                      name: '建图中',
                      createdAt: new Date().toISOString(),
                      thumbnail: '',
                      width: currentMapData.width!,
                      height: currentMapData.height!,
                      resolution: currentMapData.resolution!,
                      origin: currentMapData.origin!,
                      data: currentMapData.data,
                    }}
                    showRobotPose={true}
                    showRobotTrail={true}
                    showCoordinateSystem={true}
                    showOperationHints={false}
                    laserScan={laserScan}
                    showLaserScan={showLaserScan}
                    showGrid={showGrid}
                    gridSize={gridSize}
                  />

                  {isMapping && (
                    <div className="absolute left-4 top-4 rounded-lg border border-sky-500/30 bg-background/90 px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="font-medium text-emerald-400">建图进行中</span>
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-4 left-4 rounded-lg bg-black/75 px-4 py-3 text-sm text-white">
                    <div>滚轮缩放，中键拖动平移</div>
                    <div className="mt-1">使用遥控器控制机器人移动探索环境</div>
                    <div className="mt-1">完成后点击“结束建图”按钮保存</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span>尺寸: {currentMapData.width} × {currentMapData.height} px</span>
                <span>分辨率: {currentMapData.resolution?.toFixed(3)} m/px</span>
                <Badge variant="secondary">实时地图更新中</Badge>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-6 py-16 text-center">
              {connectionStatus !== ConnectionStatus.CONNECTED ? (
                <>
                  <p className="text-base text-muted-foreground">等待后端连接...</p>
                  <p className="mt-2 text-sm text-muted-foreground">请确保后端服务正在运行。</p>
                </>
              ) : !isMapping ? (
                <>
                  <Map className="mx-auto mb-6 h-16 w-16 text-primary/70" />
                  <p className="text-base text-foreground">准备开始建图</p>
                  <p className="mt-2 text-sm text-muted-foreground">点击“开始建图”启动 SLAM 建图功能。</p>
                  <p className="mt-4 text-sm text-muted-foreground">建图过程中请使用遥控器控制机器人移动，探索环境。</p>
                </>
              ) : (
                <>
                  <Loader2 className="mx-auto mb-6 h-10 w-10 animate-spin text-primary" />
                  <p className="text-base text-foreground">建图进行中，等待地图数据...</p>
                  <p className="mt-2 text-sm text-muted-foreground">遥控手柄已自动启动，请使用遥控器控制机器人移动。</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

      <Dialog open={mapNameModalVisible} onOpenChange={(open) => !open && setMapNameModalVisible(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>设置地图名称</DialogTitle>
            <DialogDescription>请为即将建立的地图命名。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                value={inputMapName}
                onChange={(event) => setInputMapName(event.target.value)}
                placeholder="输入地图名称"
                maxLength={50}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void confirmMapNameAndStart();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">地图名称将用于保存和识别地图，建议使用有意义的名称。</p>
            </div>

            {existingMaps.length > 0 && (
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <div className="mb-2 text-sm font-medium text-foreground">已存在的地图 ({existingMaps.length})</div>
                <div className="max-h-32 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                  {existingMaps.map((name, index) => (
                    <div key={`${name}-${index}`}>• {name}</div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-amber-200">如果输入已存在的地图名称，将提示是否覆盖。</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMapNameModalVisible(false)}>取消</Button>
            <Button type="button" onClick={() => void confirmMapNameAndStart()}>确认并开始建图</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={mappingModalVisible}
        onOpenChange={(open) => {
          const closable = mappingStep === 0 || mappingStepStatus[1] === 'finish' || mappingStepStatus.includes('error');
          if (!open && closable) {
            setMappingModalVisible(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>启动建图模式</DialogTitle>
            <DialogDescription>分两步启动：遥控器、建图模式。</DialogDescription>
          </DialogHeader>

          {mappingStep === 0 ? (
            <div className="space-y-4">
              <div className="space-y-3">
                {stepLabels.map((step, index) => (
                  <div key={step.title} className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="text-sm font-medium text-foreground">{index + 1}. {step.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{step.description}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <div className="mb-3 text-sm font-medium text-foreground">跳过选项</div>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" checked={skipJoystick} onChange={(event) => setSkipJoystick(event.target.checked)} className="mt-1" />
                    <div>
                      <div className="text-foreground">跳过启动遥控器</div>
                      <div className="text-xs text-muted-foreground">如果遥控器已手动启动，可跳过此步骤。</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" checked={skipMappingNode} onChange={(event) => setSkipMappingNode(event.target.checked)} className="mt-1" />
                    <div>
                      <div className="text-foreground">跳过进入建图模式</div>
                      <div className="text-xs text-muted-foreground">如果建图节点已手动启动，可跳过此步骤。</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {stepLabels.map((step, index) => {
                const status = mappingStepStatus[index];
                return (
                  <div key={step.title} className="flex gap-3 rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="mt-0.5">
                      {status === 'process' ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      ) : status === 'finish' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : status === 'error' ? (
                        <XCircle className="h-5 w-5 text-red-400" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border border-border/70" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{step.title}</div>
                      <div className="text-sm text-muted-foreground">{step.description}</div>
                    </div>
                  </div>
                );
              })}

              {mappingStepStatus[1] === 'finish' && (
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100">
                  {skipJoystick && skipMappingNode
                    ? '所有步骤均已跳过，请确认遥控器和建图节点已手动启动。'
                    : skipJoystick
                      ? '遥控器启动已跳过，请确认遥控器已手动启动后使用。'
                      : skipMappingNode
                        ? '建图节点启动已跳过，请确认建图节点已手动启动。'
                        : '建图模式已成功启动，请使用遥控器控制机器人在环境中移动。'}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {mappingStep === 0 ? (
              <>
                <Button type="button" variant="outline" onClick={() => setMappingModalVisible(false)}>取消</Button>
                <Button type="button" onClick={() => void executeMappingStartup()}>开始执行</Button>
              </>
            ) : mappingStepStatus[1] === 'finish' ? (
              <Button type="button" onClick={() => setMappingModalVisible(false)}>关闭</Button>
            ) : mappingStepStatus.includes('error') ? (
              <>
                <Button type="button" variant="outline" onClick={() => setMappingModalVisible(false)}>关闭</Button>
                <Button
                  type="button"
                  onClick={() => {
                    setMappingStep(0);
                    setMappingStepStatus(['wait', 'wait']);
                    void executeMappingStartup();
                  }}
                >
                  重试
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saveModalVisible} onOpenChange={(open) => !open && setSaveModalVisible(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>保存地图</DialogTitle>
            <DialogDescription>为当前地图输入名称。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={mapName} onChange={(event) => setMapName(event.target.value)} placeholder="输入地图名称" maxLength={50} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveModalVisible(false)}>取消</Button>
            <Button type="button" onClick={() => void saveMap()}>
              <Save className="mr-2 h-4 w-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={savingModalVisible} onOpenChange={() => undefined}>
        <DialogContent className="sm:max-w-md">
          <div className="py-8 text-center">
            <Loader2 className="mx-auto mb-6 h-12 w-12 animate-spin text-primary" />
            <div className="text-lg font-medium text-foreground">地图保存中...</div>
            <div className="mt-3 text-sm text-muted-foreground">正在保存地图 <strong>{pendingMapName}</strong></div>
            <div className="mt-2 text-xs text-muted-foreground">请稍候，不要关闭窗口。</div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={failureModalVisible} onOpenChange={(open) => !open && setFailureModalVisible(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-400" />
              建图失败
            </DialogTitle>
            <DialogDescription>地图保存流程没有完成。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <div className="text-sm font-medium text-red-100">保存失败</div>
              <div className="mt-2 text-sm text-muted-foreground">地图名称：<strong>{pendingMapName}</strong></div>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="mb-2 text-sm font-medium text-foreground">失败原因</div>
              <div className="text-sm text-red-300">{failureMessage}</div>
            </div>
            <div className="text-sm text-muted-foreground">
              <div className="mb-2">建议操作：</div>
              <ul className="list-disc space-y-1 pl-5">
                <li>检查后端服务是否正常运行</li>
                <li>确认磁盘空间是否充足</li>
                <li>查看后端日志了解详细错误信息</li>
                <li>点击“重新建图”重试</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFailureModalVisible(false)}>关闭</Button>
            <Button
              type="button"
              onClick={() => {
                setFailureModalVisible(false);
                void startMapping();
              }}
            >
              重新建图
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={successModalVisible} onOpenChange={(open) => !open && setSuccessModalVisible(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              建图成功
            </DialogTitle>
            <DialogDescription>地图已经成功保存。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="text-sm font-medium text-emerald-100">地图已成功保存</div>
              <div className="mt-2 text-sm text-muted-foreground">地图名称：<strong>{pendingMapName}</strong></div>
            </div>

            <div className="space-y-3">
              <Button
                type="button"
                className="w-full"
                onClick={async () => {
                  try {
                    const mapData = await apiService.loadMap(pendingMapName);
                    if (!mapData) {
                      throw new Error('地图数据为空');
                    }
                    await apiService.setCurrentMap(mapData);
                    setNotice('地图已应用');
                    setSuccessModalVisible(false);
                    navigate('/navigation');
                  } catch (error) {
                    console.error('应用地图失败:', error);
                    setNotice('应用地图失败');
                  }
                }}
              >
                应用地图并开始导航
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => {
                setSuccessModalVisible(false);
                navigate('/maps');
              }}>
                进入地图管理
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => setSuccessModalVisible(false)}>
                继续建图
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
