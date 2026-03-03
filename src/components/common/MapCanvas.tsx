import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { MapData, Pose, PathPoint, LaserScan } from '@/types';
import { rosService } from '@/services/ros';
import { ROS2_MESSAGE_TYPES } from '@/config/ros2MessageTypes';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';

// ========== 坐标转换工具函数（模块级别，供 SVG 组件使用） ==========

/** 世界坐标（米）→ 地图像素坐标（翻转 Y 轴，浮点精度供 SVG 渲染） */
function worldToMap(x: number, y: number, mapData: MapData): { x: number; y: number } {
  const mapX = (x - mapData.origin.x) / mapData.resolution;
  const mapY = (y - mapData.origin.y) / mapData.resolution;
  const flippedY = mapData.height - 1 - mapY;
  return { x: mapX, y: flippedY };
}

/** 地图像素坐标 → 世界坐标（米） */
function mapToWorld(x: number, y: number, mapData: MapData): { x: number; y: number } {
  const originalY = mapData.height - 1 - y;
  return {
    x: x * mapData.resolution + mapData.origin.x,
    y: originalY * mapData.resolution + mapData.origin.y,
  };
}

/** 检测鼠标是否点击在路径点上 */
function getClickedWaypointIndex(
  canvasX: number,
  canvasY: number,
  waypoints: Pose[],
  mapData: MapData,
  scale: number
): number {
  // 命中半径 = 视觉半径 + 容差，均为屏幕像素除以 scale 转换为地图像素
  const hitRadius = 19 / scale;
  for (let i = waypoints.length - 1; i >= 0; i--) {
    const pos = worldToMap(waypoints[i].x, waypoints[i].y, mapData);
    const d = Math.sqrt((canvasX - pos.x) ** 2 + (canvasY - pos.y) ** 2);
    if (d <= hitRadius) return i;
  }
  return -1;
}

// ==========================================================================
//  SVG 覆盖层组件
//  所有矢量图形均使用 SVG 渲染，Canvas 仅用于占据栅格位图。
//  scale 参数用于保持元素在屏幕上恒定大小（不随缩放变化）。
// ==========================================================================

/** 机器人标记 - 绿色圆形 + 朝向箭头 */
const RobotMarker: React.FC<{
  x: number; y: number; theta: number; scale: number;
}> = React.memo(({ x, y, theta, scale }) => {
  const s = 18 / scale;
  const deg = -(theta * 180) / Math.PI;
  return (
    <g transform={`translate(${x}, ${y}) rotate(${deg})`}>
      <circle r={s * 1.3} fill="#52c41a" opacity={0.15} />
      <circle r={s} fill="#52c41a" stroke="#fff" strokeWidth={s * 0.15} />
      <polygon
        points={`${s * 1.25},0 ${-s * 0.4},${-s * 0.55} ${-s * 0.15},0 ${-s * 0.4},${s * 0.55}`}
        fill="#fff" opacity={0.95}
      />
    </g>
  );
});

/** 目标点标记 - 红色旗帜 + 朝向指示 */
const GoalMarker: React.FC<{
  x: number; y: number; theta: number; scale: number;
}> = React.memo(({ x, y, theta, scale }) => {
  const s = 16 / scale;
  const deg = -(theta * 180) / Math.PI;
  const poleH = s * 3;
  const flagW = s * 1.8;
  const flagH = s * 1.4;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={s * 1.5} fill="#ff4d4f" opacity={0.15} />
      <line x1={0} y1={0} x2={0} y2={-poleH} stroke="#fff" strokeWidth={s * 0.2} strokeLinecap="round" />
      <g transform={`translate(0, ${-poleH + flagH * 0.5}) rotate(${deg})`}>
        <polygon
          points={`0,${-flagH / 2} ${flagW},${-flagH / 4} ${flagW},${flagH / 4} 0,${flagH / 2}`}
          fill="#ff4d4f" stroke="#fff" strokeWidth={s * 0.1}
        />
      </g>
      <circle r={s * 0.7} fill="#ff4d4f" stroke="#fff" strokeWidth={s * 0.15} />
      <g transform={`rotate(${deg})`}>
        <polygon
          points={`${s * 0.5},0 ${-s * 0.2},${-s * 0.3} ${-s * 0.2},${s * 0.3}`}
          fill="#fff" opacity={0.9}
        />
      </g>
    </g>
  );
});

/** 栅格覆盖层 */
const GridOverlay: React.FC<{
  mapData: MapData; gridSize: number; scale: number;
}> = React.memo(({ mapData, gridSize, scale }) => {
  const lines = useMemo(() => {
    const result: JSX.Element[] = [];
    const spacing = gridSize / mapData.resolution;
    const origin = worldToMap(0, 0, mapData);
    let k = 0;
    for (let x = origin.x; x < mapData.width; x += spacing)
      result.push(<line key={k++} x1={x} y1={0} x2={x} y2={mapData.height} />);
    for (let x = origin.x - spacing; x >= 0; x -= spacing)
      result.push(<line key={k++} x1={x} y1={0} x2={x} y2={mapData.height} />);
    for (let y = origin.y; y < mapData.height; y += spacing)
      result.push(<line key={k++} x1={0} y1={y} x2={mapData.width} y2={y} />);
    for (let y = origin.y - spacing; y >= 0; y -= spacing)
      result.push(<line key={k++} x1={0} y1={y} x2={mapData.width} y2={y} />);
    return result;
  }, [mapData, gridSize]);
  return <g stroke="rgba(100,100,100,0.3)" strokeWidth={1 / scale}>{lines}</g>;
});

/** 坐标系覆盖层 - X 红 / Y 绿，1 米长 */
const CoordinateSystemOverlay: React.FC<{
  mapData: MapData; scale: number;
}> = React.memo(({ mapData, scale }) => {
  const origin = worldToMap(0, 0, mapData);
  if (origin.x < 0 || origin.x >= mapData.width || origin.y < 0 || origin.y >= mapData.height) return null;

  const xEnd = worldToMap(1.0, 0, mapData);
  const yEnd = worldToMap(0, 1.0, mapData);
  const sw = 3 / scale;
  const hl = 10 / scale;
  const fs = 16 / scale;

  const arrowHead = (from: { x: number; y: number }, to: { x: number; y: number }, color: string) => {
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    return (
      <polygon
        points={`${to.x},${to.y} ${to.x - hl * Math.cos(a - Math.PI / 6)},${to.y - hl * Math.sin(a - Math.PI / 6)} ${to.x - hl * Math.cos(a + Math.PI / 6)},${to.y - hl * Math.sin(a + Math.PI / 6)}`}
        fill={color}
      />
    );
  };

  return (
    <g>
      <line x1={origin.x} y1={origin.y} x2={xEnd.x} y2={xEnd.y} stroke="#ff0000" strokeWidth={sw} />
      {arrowHead(origin, xEnd, '#ff0000')}
      <text x={xEnd.x + 10 / scale} y={xEnd.y + 5 / scale} fill="#ff0000" fontSize={fs} fontWeight="bold">X</text>
      <line x1={origin.x} y1={origin.y} x2={yEnd.x} y2={yEnd.y} stroke="#00ff00" strokeWidth={sw} />
      {arrowHead(origin, yEnd, '#00ff00')}
      <text x={yEnd.x + 10 / scale} y={yEnd.y - 5 / scale} fill="#00ff00" fontSize={fs} fontWeight="bold">Y</text>
    </g>
  );
});

/** 导航路径覆盖层 - 青色发光线 */
const NavigationPathOverlay: React.FC<{
  path: PathPoint[]; mapData: MapData; scale: number;
}> = React.memo(({ path, mapData, scale }) => {
  const pointsStr = useMemo(
    () => path.map(p => { const m = worldToMap(p.x, p.y, mapData); return `${m.x},${m.y}`; }).join(' '),
    [path, mapData],
  );
  return (
    <g>
      <polyline points={pointsStr} fill="none" stroke="rgba(0,210,255,0.25)"
        strokeWidth={8 / scale} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pointsStr} fill="none" stroke="#00d4ff"
        strokeWidth={2.5 / scale} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
});

/** 机器人轨迹覆盖层 - 绿色半透明线 + 采样点 */
const RobotTrailOverlay: React.FC<{
  trail: Array<{ x: number; y: number }>; mapData: MapData; scale: number;
}> = React.memo(({ trail, mapData, scale }) => {
  const mapped = useMemo(() => trail.map(p => worldToMap(p.x, p.y, mapData)), [trail, mapData]);
  const pointsStr = useMemo(() => mapped.map(p => `${p.x},${p.y}`).join(' '), [mapped]);
  const dotR = 2 / scale;
  return (
    <g>
      <polyline points={pointsStr} fill="none" stroke="rgba(82,196,26,0.5)" strokeWidth={2 / scale} />
      {mapped.filter((_, i) => i % 10 === 0).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={dotR} fill="rgba(82,196,26,0.3)" />
      ))}
    </g>
  );
});

/** 雷达扫描覆盖层 */
const LaserScanOverlay: React.FC<{
  laserScan: LaserScan; robotPose: Pose; mapData: MapData; scale: number;
}> = React.memo(({ laserScan, robotPose, mapData, scale }) => {
  const points = useMemo(() => {
    const result: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < laserScan.ranges.length; i++) {
      const range = laserScan.ranges[i];
      if (!isFinite(range) || range < laserScan.range_min || range > laserScan.range_max) continue;
      const angle = laserScan.angle_min + i * laserScan.angle_increment;
      const wx = robotPose.x + range * Math.cos(robotPose.theta + angle);
      const wy = robotPose.y + range * Math.sin(robotPose.theta + angle);
      result.push(worldToMap(wx, wy, mapData));
    }
    return result;
  }, [laserScan, robotPose, mapData]);
  const r = 2 / scale;
  return (
    <g fill="rgba(255,0,0,0.6)">
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={r} />)}
    </g>
  );
});

/** 初始位姿标记 - 紫色准星 + 朝向 */
const InitialPoseMarker: React.FC<{
  pose: Pose; mapData: MapData; scale: number;
}> = React.memo(({ pose, mapData, scale }) => {
  const pos = worldToMap(pose.x, pose.y, mapData);
  const s = 16 / scale;
  const deg = -(pose.theta * 180) / Math.PI;
  const cr = s * 1.3;
  const ll = s * 0.8;
  const gap = s * 0.3;
  const sw = s * 0.2;
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      <circle r={s * 1.8} fill="#722ed1" opacity={0.15} />
      <circle r={cr} fill="none" stroke="#722ed1" strokeWidth={sw} />
      <line x1={0} y1={-gap} x2={0} y2={-(cr + ll)} stroke="#722ed1" strokeWidth={sw} strokeLinecap="round" />
      <line x1={0} y1={gap} x2={0} y2={cr + ll} stroke="#722ed1" strokeWidth={sw} strokeLinecap="round" />
      <line x1={-gap} y1={0} x2={-(cr + ll)} y2={0} stroke="#722ed1" strokeWidth={sw} strokeLinecap="round" />
      <line x1={gap} y1={0} x2={cr + ll} y2={0} stroke="#722ed1" strokeWidth={sw} strokeLinecap="round" />
      <circle r={s} fill="#722ed1" stroke="#fff" strokeWidth={s * 0.15} />
      <g transform={`rotate(${deg})`}>
        <polygon points={`${s * 0.5},0 ${-s * 0.25},${-s * 0.35} ${-s * 0.25},${s * 0.35}`} fill="#fff" opacity={0.95} />
      </g>
    </g>
  );
});

/** 路径点标记 - 带序号的圆形 */
const WaypointMarker: React.FC<{
  pose: Pose; index: number; mapData: MapData; scale: number;
  isCurrent: boolean; isCompleted: boolean; isSelected: boolean; isHovered: boolean;
}> = React.memo(({ pose, index, mapData, scale, isCurrent, isCompleted, isSelected, isHovered }) => {
  const pos = worldToMap(pose.x, pose.y, mapData);
  let s = isCompleted ? 14 : isCurrent ? 16 : 14;
  if (isSelected || isHovered) s *= 1.2;
  s /= scale;
  const color = isCompleted ? '#999' : isCurrent ? '#52c41a' : '#1890ff';
  const deg = -(pose.theta * 180) / Math.PI;
  const fs = Math.max(s * 1.2, 12 / scale);
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      {(isCurrent || isSelected || isHovered) && <circle r={s * 1.4} fill={color} opacity={0.2} />}
      <circle r={s} fill={color} stroke={isSelected ? '#faad14' : '#fff'} strokeWidth={s * 0.15} />
      <text x={0} y={0} fill="#fff" fontSize={fs} fontWeight="bold" textAnchor="middle" dominantBaseline="central">
        {index + 1}
      </text>
      {isCurrent && (
        <g transform={`rotate(${deg})`}>
          <line x1={0} y1={0} x2={s * 1.5} y2={0} stroke="#fff" strokeWidth={s * 0.15} strokeLinecap="round" />
          <polygon points={`${s * 1.5},0 ${s * 1.1},${-s * 0.3} ${s * 1.1},${s * 0.3}`} fill="#fff" />
        </g>
      )}
    </g>
  );
});

/** 路径点之间的连线 */
const WaypointPathOverlay: React.FC<{
  waypoints: Pose[]; mapData: MapData; currentIndex: number; scale: number;
}> = React.memo(({ waypoints, mapData, currentIndex, scale }) => {
  if (waypoints.length < 2) return null;
  return (
    <g opacity={0.6}>
      {waypoints.slice(0, -1).map((wp, i) => {
        const s = worldToMap(wp.x, wp.y, mapData);
        const e = worldToMap(waypoints[i + 1].x, waypoints[i + 1].y, mapData);
        return (
          <line key={i} x1={s.x} y1={s.y} x2={e.x} y2={e.y}
            stroke={i < currentIndex ? '#999' : '#1890ff'}
            strokeWidth={2 / scale} strokeDasharray={`${5 / scale} ${5 / scale}`}
          />
        );
      })}
    </g>
  );
});

/** 方向设置指示线（拖拽设置目标朝向） */
const DirectionLineOverlay: React.FC<{
  start: { x: number; y: number }; end: { x: number; y: number }; scale: number;
}> = React.memo(({ start, end, scale }) => {
  const a = Math.atan2(end.y - start.y, end.x - start.x);
  const al = 15 / scale;
  return (
    <g>
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y}
        stroke="rgba(255,77,79,0.8)" strokeWidth={3 / scale}
        strokeDasharray={`${10 / scale} ${5 / scale}`}
      />
      <polygon
        points={`${end.x},${end.y} ${end.x - al * Math.cos(a - Math.PI / 6)},${end.y - al * Math.sin(a - Math.PI / 6)} ${end.x - al * Math.cos(a + Math.PI / 6)},${end.y - al * Math.sin(a + Math.PI / 6)}`}
        fill="rgba(255,77,79,0.8)"
      />
      <circle cx={start.x} cy={start.y} r={5 / scale} fill="rgba(255,77,79,0.8)" />
    </g>
  );
});

/** 画笔预览圆（地图编辑器模式） */
const BrushPreviewOverlay: React.FC<{
  x: number; y: number; brushSize: number; scale: number;
}> = React.memo(({ x, y, brushSize, scale }) => {
  const r = Math.floor(brushSize / 2); // 画笔半径为地图像素
  const cs = 5 / scale;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="rgba(24,144,255,0.15)"
        stroke="rgba(24,144,255,0.8)" strokeWidth={2 / scale}
        strokeDasharray={`${5 / scale} ${5 / scale}`}
      />
      <line x1={x - cs} y1={y} x2={x + cs} y2={y} stroke="rgba(24,144,255,0.6)" strokeWidth={1 / scale} />
      <line x1={x} y1={y - cs} x2={x} y2={y + cs} stroke="rgba(24,144,255,0.6)" strokeWidth={1 / scale} />
    </g>
  );
});

// ==========================================================================
//  MapCanvas 主组件
// ==========================================================================

interface MapCanvasProps {
  mapData: MapData;
  robotPose?: Pose;
  goalPose?: Pose;
  initialPose?: Pose;
  path?: PathPoint[];
  onMapClick?: (x: number, y: number, theta?: number) => void;
  className?: string;
  showRobotTrail?: boolean;
  showCoordinateSystem?: boolean;
  showOperationHints?: boolean;
  showRobotPose?: boolean;
  disableDirectionSetting?: boolean;
  brushSize?: number;
  laserScan?: LaserScan | null;
  showLaserScan?: boolean;
  showGrid?: boolean;
  gridSize?: number;
  waypoints?: Pose[];
  currentWaypointIndex?: number;
  completedWaypoints?: number[];
  selectedWaypointIndex?: number;
  onWaypointClick?: (index: number) => void;
  onWaypointDrag?: (index: number, newPose: Pose) => void;
  onWaypointDelete?: (index: number) => void;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  mapData,
  robotPose: externalRobotPose,
  goalPose,
  initialPose,
  path,
  onMapClick,
  className,
  showRobotTrail = true,
  showCoordinateSystem = false,
  showOperationHints = true,
  showRobotPose = false,
  disableDirectionSetting = false,
  brushSize = 0,
  laserScan = null,
  showLaserScan = false,
  showGrid = false,
  gridSize = 1.0,
  waypoints = [],
  currentWaypointIndex = -1,
  completedWaypoints = [],
  selectedWaypointIndex = -1,
  onWaypointClick,
  onWaypointDrag,
  onWaypointDelete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { connectionStatus } = useROS();

  // 缩放和平移状态
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [minScale, setMinScale] = useState(0.1);
  const [maxScale] = useState(10);
  const [fitToViewScale, setFitToViewScale] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);

  // 方向设置状态
  const [isSettingDirection, setIsSettingDirection] = useState(false);
  const [directionStart, setDirectionStart] = useState<{ x: number; y: number } | null>(null);
  const [directionEnd, setDirectionEnd] = useState<{ x: number; y: number } | null>(null);

  // 连续编辑状态（用于地图编辑模式）
  const [isContinuousEditing, setIsContinuousEditing] = useState(false);

  // 路径点交互状态
  const [draggingWaypointIndex, setDraggingWaypointIndex] = useState(-1);
  const [hoveredWaypointIndex, setHoveredWaypointIndex] = useState(-1);

  // 画笔预览位置（画布坐标）
  const [brushPreviewPos, setBrushPreviewPos] = useState<{ x: number; y: number } | null>(null);

  // 机器人轨迹
  const [robotTrail, setRobotTrail] = useState<Array<{ x: number; y: number }>>([]);

  // 内部订阅的机器人位姿（当 showRobotPose 为 true 时自动订阅）
  const [internalRobotPose, setInternalRobotPose] = useState<Pose | null>(null);

  // 使用内部订阅的位姿或外部传入的位姿
  const robotPose = showRobotPose ? internalRobotPose : externalRobotPose;

  // ========== 坐标转换辅助函数 ==========

  const getMousePosition = (event: MouseEvent | React.MouseEvent): { x: number; y: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const containerToCanvas = (containerX: number, containerY: number): { x: number; y: number } => {
    return { x: (containerX - offset.x) / scale, y: (containerY - offset.y) / scale };
  };

  // ========== 订阅和数据处理 ==========

  // 订阅机器人位姿（当 showRobotPose 为 true 时）
  useEffect(() => {
    if (!showRobotPose || connectionStatus !== ConnectionStatus.CONNECTED) return;
    const unsubscribe = rosService.subscribeTopic<any>(
      '/loc_high_freq',
      ROS2_MESSAGE_TYPES.ODOMETRY,
      (poseMsg) => {
        const position = poseMsg.pose.pose.position;
        const orientation = poseMsg.pose.pose.orientation;
        const theta = Math.atan2(
          2.0 * (orientation.w * orientation.z + orientation.x * orientation.y),
          1.0 - 2.0 * (orientation.y * orientation.y + orientation.z * orientation.z)
        );
        setInternalRobotPose({ x: position.x, y: position.y, theta });
      }
    );
    return () => { unsubscribe(); };
  }, [showRobotPose, connectionStatus]);

  // 更新机器人轨迹
  useEffect(() => {
    if (!robotPose || !showRobotTrail) return;
    setRobotTrail((prev) => {
      const np = { x: robotPose.x, y: robotPose.y };
      if (prev.length === 0) return [np];
      const last = prev[prev.length - 1];
      const dist = Math.sqrt((np.x - last.x) ** 2 + (np.y - last.y) ** 2);
      if (dist > 0.1) return [...prev, np].slice(-500);
      return prev;
    });
  }, [robotPose, showRobotTrail]);

  // 计算适配视图的缩放比例
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !mapData) return;

    const updateFitScale = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      if (containerWidth === 0 || containerHeight === 0) return;

      const fitScale = Math.min(containerWidth / mapData.width, containerHeight / mapData.height);
      setFitToViewScale(fitScale);
      setMinScale(fitScale * 0.5);

      if (!isInitialized) {
        setScale(fitScale);
        setOffset({
          x: (containerWidth - mapData.width * fitScale) / 2,
          y: (containerHeight - mapData.height * fitScale) / 2,
        });
        setIsInitialized(true);
      }
    };

    updateFitScale();
    const resizeObserver = new ResizeObserver(() => updateFitScale());
    resizeObserver.observe(container);
    return () => { resizeObserver.disconnect(); };
  }, [mapData, isInitialized]);

  // ========== Canvas: 仅绘制占据栅格位图 ==========
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = mapData.width * dpr;
    canvas.height = mapData.height * dpr;
    canvas.style.width = `${mapData.width}px`;
    canvas.style.height = `${mapData.height}px`;

    const imageData = ctx.createImageData(mapData.width * dpr, mapData.height * dpr);
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const value = mapData.data[y * mapData.width + x];
        const c = value === -1 ? 128 : value === 0 ? 255 : 0;
        const flippedY = mapData.height - 1 - y;
        for (let dy = 0; dy < dpr; dy++) {
          for (let dx = 0; dx < dpr; dx++) {
            const idx = ((flippedY * dpr + dy) * mapData.width * dpr + (x * dpr + dx)) * 4;
            imageData.data[idx] = c;
            imageData.data[idx + 1] = c;
            imageData.data[idx + 2] = c;
            imageData.data[idx + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, [mapData]);

  // ========== 鼠标交互 ==========

  // 处理鼠标滚轮缩放
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const mousePos = getMousePosition(event);
      if (!mousePos) return;

      const delta = -event.deltaY;
      const scaleFactor = delta > 0 ? 1.15 : 1 / 1.15;
      const newScale = Math.max(minScale, Math.min(maxScale, scale * scaleFactor));

      const scaleRatio = newScale / scale;
      const newOffsetX = mousePos.x - (mousePos.x - offset.x) * scaleRatio;
      const newOffsetY = mousePos.y - (mousePos.y - offset.y) * scaleRatio;

      setScale(newScale);
      setOffset({ x: newOffsetX, y: newOffsetY });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => { container.removeEventListener('wheel', handleWheel); };
  }, [scale, offset, minScale, maxScale]);

  // 处理鼠标按下
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const mousePos = getMousePosition(event);
    if (!mousePos) return;
    const canvasPos = containerToCanvas(mousePos.x, mousePos.y);

    // 中键拖动
    if (event.button === 1) {
      event.preventDefault();
      setIsDragging(true);
      setDragStart({ x: event.clientX - offset.x, y: event.clientY - offset.y });
      return;
    }

    // 右键或 ctrl/cmd + 左键拖动
    if (event.button === 2 || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      setIsDragging(true);
      setDragStart({ x: event.clientX - offset.x, y: event.clientY - offset.y });
      return;
    }

    // 左键操作
    if (event.button === 0) {
      // 检查是否点击了路径点
      if (waypoints && waypoints.length > 0) {
        const clickedIndex = getClickedWaypointIndex(canvasPos.x, canvasPos.y, waypoints, mapData, scale);
        if (clickedIndex >= 0) {
          event.preventDefault();
          setDraggingWaypointIndex(clickedIndex);
          if (onWaypointClick) onWaypointClick(clickedIndex);
          return;
        }
      }

      if (onMapClick) {
        if (disableDirectionSetting) {
          const worldPos = mapToWorld(canvasPos.x, canvasPos.y, mapData);
          onMapClick(worldPos.x, worldPos.y);
          setIsContinuousEditing(true);
        } else {
          setIsSettingDirection(true);
          setDirectionStart({ x: canvasPos.x, y: canvasPos.y });
          setDirectionEnd({ x: canvasPos.x, y: canvasPos.y });
        }
      }
    }
  };

  // 处理鼠标移动
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const mousePos = getMousePosition(event);
    if (!mousePos) return;
    const canvasPos = containerToCanvas(mousePos.x, mousePos.y);

    // 拖动路径点
    if (draggingWaypointIndex >= 0 && onWaypointDrag) {
      const worldPos = mapToWorld(canvasPos.x, canvasPos.y, mapData);
      onWaypointDrag(draggingWaypointIndex, {
        x: worldPos.x,
        y: worldPos.y,
        theta: waypoints[draggingWaypointIndex].theta,
      });
      return;
    }

    // 更新画笔预览位置
    if (disableDirectionSetting && brushSize > 0) {
      setBrushPreviewPos({ x: canvasPos.x, y: canvasPos.y });
    }

    // 检测悬停的路径点
    if (waypoints && waypoints.length > 0 && !isDragging && !isSettingDirection) {
      const hoveredIndex = getClickedWaypointIndex(canvasPos.x, canvasPos.y, waypoints, mapData, scale);
      setHoveredWaypointIndex(hoveredIndex);
    }

    if (isDragging) {
      setOffset({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y });
    } else if (isContinuousEditing && onMapClick && disableDirectionSetting) {
      const worldPos = mapToWorld(canvasPos.x, canvasPos.y, mapData);
      onMapClick(worldPos.x, worldPos.y);
    } else if (isSettingDirection && directionStart) {
      setDirectionEnd({ x: canvasPos.x, y: canvasPos.y });
    }
  };

  // 处理鼠标松开
  const handleMouseUp = () => {
    if (draggingWaypointIndex >= 0) {
      setDraggingWaypointIndex(-1);
      return;
    }

    if (isContinuousEditing) {
      setIsContinuousEditing(false);
    } else if (isSettingDirection && directionStart && directionEnd && onMapClick) {
      const dx = directionEnd.x - directionStart.x;
      const dy = directionEnd.y - directionStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const worldPos = mapToWorld(directionStart.x, directionStart.y, mapData);

      if (distance > 5) {
        const theta = Math.atan2(-dy, dx);
        onMapClick(worldPos.x, worldPos.y, theta);
      } else {
        onMapClick(worldPos.x, worldPos.y, 0);
      }

      setIsSettingDirection(false);
      setDirectionStart(null);
      setDirectionEnd(null);
    }

    setIsDragging(false);
  };

  const handleClick = (_event: React.MouseEvent<HTMLCanvasElement>) => {
    return;
  };

  // 处理右键菜单（删除路径点）
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!waypoints || waypoints.length === 0 || !onWaypointDelete) return;

    const mousePos = getMousePosition(event);
    if (!mousePos) return;
    const canvasPos = containerToCanvas(mousePos.x, mousePos.y);
    const clickedIndex = getClickedWaypointIndex(canvasPos.x, canvasPos.y, waypoints, mapData, scale);
    if (clickedIndex >= 0) onWaypointDelete(clickedIndex);
  };

  // ========== 视图控制 ==========

  const resetView = () => {
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const fitScale = Math.min(containerWidth / mapData.width, containerHeight / mapData.height);
    setScale(fitScale);
    setOffset({
      x: (containerWidth - mapData.width * fitScale) / 2,
      y: (containerHeight - mapData.height * fitScale) / 2,
    });
  };

  const centerToRobot = () => {
    if (!robotPose) return;
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const robotMapPos = worldToMap(robotPose.x, robotPose.y, mapData);
    setOffset({
      x: containerWidth / 2 - robotMapPos.x * scale,
      y: containerHeight / 2 - robotMapPos.y * scale,
    });
  };

  const clearRobotTrail = () => { setRobotTrail([]); };

  // ========== SVG 覆盖层数据预计算 ==========

  const robotMapPos = useMemo(
    () => robotPose ? worldToMap(robotPose.x, robotPose.y, mapData) : null,
    [robotPose, mapData],
  );
  const goalMapPos = useMemo(
    () => goalPose ? worldToMap(goalPose.x, goalPose.y, mapData) : null,
    [goalPose, mapData],
  );

  // ========== 渲染 ==========

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* 工具栏 */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 10,
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '8px',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ fontSize: '12px', marginBottom: '4px' }}>
          缩放: {fitToViewScale > 0 ? ((scale / fitToViewScale) * 100).toFixed(0) : 100}%
        </div>
        <div style={{ marginBottom: '8px' }}>
          <button
            onClick={() => setScale(Math.min(maxScale, scale * 1.2))}
            style={{ padding: '4px 8px', marginRight: '4px', cursor: 'pointer', border: '1px solid #d9d9d9', borderRadius: '2px', background: 'white' }}
          >+</button>
          <button
            onClick={() => setScale(Math.max(minScale, scale / 1.2))}
            style={{ padding: '4px 8px', marginRight: '4px', cursor: 'pointer', border: '1px solid #d9d9d9', borderRadius: '2px', background: 'white' }}
          >-</button>
          <button
            onClick={resetView}
            style={{ padding: '4px 8px', cursor: 'pointer', border: '1px solid #d9d9d9', borderRadius: '2px', background: 'white' }}
          >适配</button>
        </div>
        {robotPose && (
          <>
            <button
              onClick={centerToRobot}
              style={{
                padding: '4px 8px', marginBottom: '4px', cursor: 'pointer',
                border: '1px solid #52c41a', borderRadius: '2px', background: 'white',
                color: '#52c41a', width: '100%', fontSize: '12px',
              }}
            >居中机器人</button>
            {showRobotTrail && robotTrail.length > 0 && (
              <button
                onClick={clearRobotTrail}
                style={{
                  padding: '4px 8px', cursor: 'pointer',
                  border: '1px solid #ff4d4f', borderRadius: '2px', background: 'white',
                  color: '#ff4d4f', width: '100%', fontSize: '12px',
                }}
              >清除轨迹</button>
            )}
          </>
        )}
      </div>

      {/* 地图容器 */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); setBrushPreviewPos(null); }}
        onContextMenu={handleContextMenu}
        style={{
          width: '100%', height: '100%', overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'default',
          position: 'relative',
        }}
        className={className}
      >
        {/* Canvas 层：仅占据栅格位图 */}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            cursor: draggingWaypointIndex >= 0 ? 'grabbing'
                  : hoveredWaypointIndex >= 0 ? 'grab'
                  : onMapClick ? 'crosshair' : 'default',
            border: '2px solid #000',
            boxSizing: 'border-box',
          }}
        />

        {/* SVG 覆盖层：所有矢量图形 */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: mapData.width,
            height: mapData.height,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          {/* 栅格 */}
          {showGrid && <GridOverlay mapData={mapData} gridSize={gridSize} scale={scale} />}

          {/* 坐标系 */}
          {showCoordinateSystem && <CoordinateSystemOverlay mapData={mapData} scale={scale} />}

          {/* 导航路径（规划路径） */}
          {path && path.length > 0 && (
            <NavigationPathOverlay path={path} mapData={mapData} scale={scale} />
          )}

          {/* 机器人轨迹 */}
          {showRobotTrail && robotTrail.length > 1 && (
            <RobotTrailOverlay trail={robotTrail} mapData={mapData} scale={scale} />
          )}

          {/* 雷达扫描 */}
          {showLaserScan && laserScan && robotPose && (
            <LaserScanOverlay laserScan={laserScan} robotPose={robotPose} mapData={mapData} scale={scale} />
          )}

          {/* 初始位姿（重定位标记） */}
          {initialPose && <InitialPoseMarker pose={initialPose} mapData={mapData} scale={scale} />}

          {/* 路径点连线 + 路径点标记 */}
          {waypoints && waypoints.length > 0 && (
            <>
              <WaypointPathOverlay waypoints={waypoints} mapData={mapData} currentIndex={currentWaypointIndex} scale={scale} />
              {waypoints.map((wp, i) => (
                <WaypointMarker
                  key={i}
                  pose={wp}
                  index={i}
                  mapData={mapData}
                  scale={scale}
                  isCurrent={i === currentWaypointIndex}
                  isCompleted={completedWaypoints.includes(i)}
                  isSelected={i === selectedWaypointIndex}
                  isHovered={i === hoveredWaypointIndex}
                />
              ))}
            </>
          )}

          {/* 方向设置指示线 */}
          {isSettingDirection && directionStart && directionEnd && (
            <DirectionLineOverlay start={directionStart} end={directionEnd} scale={scale} />
          )}

          {/* 画笔预览 */}
          {brushPreviewPos && brushSize > 0 && disableDirectionSetting && (
            <BrushPreviewOverlay x={brushPreviewPos.x} y={brushPreviewPos.y} brushSize={brushSize} scale={scale} />
          )}

          {/* 目标点 */}
          {goalPose && goalMapPos && (
            <GoalMarker x={goalMapPos.x} y={goalMapPos.y} theta={goalPose.theta} scale={scale} />
          )}

          {/* 机器人 */}
          {robotPose && robotMapPos && (
            <RobotMarker x={robotMapPos.x} y={robotMapPos.y} theta={robotPose.theta} scale={scale} />
          )}
        </svg>
      </div>

      {/* 机器人位姿显示 */}
      {showRobotPose && robotPose && (
        <div
          style={{
            position: 'absolute',
            top: '80px',
            left: '10px',
            background: 'rgba(255, 255, 255, 0.95)',
            padding: '12px 16px',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 10,
            fontSize: '12px',
            minWidth: '180px',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>机器人位姿</div>
          <div style={{ lineHeight: '1.6' }}>
            <div>X: {robotPose.x.toFixed(2)} m</div>
            <div>Y: {robotPose.y.toFixed(2)} m</div>
            <div>θ: {((robotPose.theta * 180) / Math.PI).toFixed(1)}°</div>
          </div>
        </div>
      )}

      {/* 操作提示 */}
      {showOperationHints && (
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            zIndex: 10,
          }}
        >
          <div>滚轮：缩放</div>
          <div>中键拖动：平移</div>
          <div>左键点击并拖动：设置位置和方向</div>
        </div>
      )}
    </div>
  );
};
