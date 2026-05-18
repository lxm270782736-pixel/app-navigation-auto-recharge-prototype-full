import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Button as UIButton, Switch, cn } from '@astribot/ui';
import type { MapData, Pose, PathPoint, LaserScan } from '@/types';
import { RobotShapeType } from '@/types';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';
import { settingsService } from '@/services/settings';

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

/** 机器人标记 - 按设置里的机器人碰撞形状绘制（圆形或多边形），尺寸
 *  跟随地图比例尺（resolution）按真实米显示；朝向用白色箭头指示。*/
const RobotMarker: React.FC<{
  x: number; y: number; theta: number; scale: number; resolution: number;
}> = React.memo(({ x, y, theta, scale, resolution }) => {
  const shape = useMemo(() => settingsService.getRobotShape(), []);
  const deg = -(theta * 180) / Math.PI;

  // 描边下限，防止缩很小时消失
  const minStroke = 1.5 / scale;

  // 朝向箭头：按包围圆的半径派生一个比例基准
  const baseRadius = (() => {
    if (shape.type === RobotShapeType.CIRCLE) return (shape.radius ?? 0.3);
    if (shape.type === RobotShapeType.POLYGON && shape.vertices && shape.vertices.length) {
      let r = 0;
      for (const v of shape.vertices) {
        const d = Math.hypot(v.x, v.y);
        if (d > r) r = d;
      }
      return r || 0.3;
    }
    return 0.3;
  })();
  const s = baseRadius / resolution; // 主尺寸 (map px)
  const strokeW = Math.max(s * 0.08, minStroke);

  // 形状本体
  let body: React.ReactNode;
  if (shape.type === RobotShapeType.POLYGON && shape.vertices && shape.vertices.length >= 3) {
    // 顶点在机器人本体坐标系（米，x 朝前，y 朝左）。rotate(deg) 已把本体
    // 坐标系对齐到地图方向；这里只需把米换到 map px，并反转 y（SVG y 向下）。
    const pts = shape.vertices
      .map((v) => `${v.x / resolution},${-v.y / resolution}`)
      .join(' ');
    body = (
      <>
        <polygon points={pts} fill="#52c41a" opacity={0.15} transform="scale(1.15)" />
        <polygon points={pts} fill="#52c41a" stroke="#fff" strokeWidth={strokeW} />
      </>
    );
  } else {
    const r = baseRadius / resolution;
    body = (
      <>
        <circle r={r * 1.3} fill="#52c41a" opacity={0.15} />
        <circle r={r} fill="#52c41a" stroke="#fff" strokeWidth={strokeW} />
      </>
    );
  }

  return (
    <g transform={`translate(${x}, ${y}) rotate(${deg})`}>
      {body}
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
  pose: Pose; index: number; label?: string; customColor?: string; mapData: MapData; scale: number;
  isCurrent: boolean; isCompleted: boolean; isSelected: boolean; isHovered: boolean;
}> = React.memo(({ pose, index, label, customColor, mapData, scale, isCurrent, isCompleted, isSelected, isHovered }) => {
  const pos = worldToMap(pose.x, pose.y, mapData);
  let s = isCompleted ? 14 : isCurrent ? 16 : 14;
  if (isSelected || isHovered) s *= 1.2;
  s /= scale;
  const baseColor = customColor || '#1890ff';
  const color = isCompleted ? '#999' : isCurrent ? '#52c41a' : baseColor;
  const deg = -(pose.theta * 180) / Math.PI;
  const fs = Math.max(s * 1.2, 12 / scale);
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      {(isCurrent || isSelected || isHovered) && <circle r={s * 1.4} fill={color} opacity={0.2} />}
      <circle r={s} fill={color} stroke={isSelected ? '#faad14' : '#fff'} strokeWidth={s * 0.15} />
      <text x={0} y={0} fill="#fff" fontSize={fs} fontWeight="bold" textAnchor="middle" dominantBaseline="central">
        {label ?? String(index + 1)}
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
  /** Optional ESDF grid overlay. Same shape as MapData; values 0-100 = distance
   *  bins (low = near obstacle, high = far), -1 = unknown. Rendered as a
   *  semi-transparent heatmap above the occupancy grid when present. */
  esdfData?: MapData | null;
  /** Opacity of the ESDF overlay, 0..1. Default 0.55. */
  esdfOpacity?: number;
  /** Optional MPC predicted horizon; drawn as a distinct polyline. */
  horizonPath?: PathPoint[];
  /** Optional JPS fallback corridor; drawn as a dashed amber polyline so it's
   *  visually distinct from the optimised MINCO path. */
  jpsPath?: PathPoint[];
  waypoints?: Pose[];
  currentWaypointIndex?: number;
  completedWaypoints?: number[];
  selectedWaypointIndex?: number;
  onWaypointClick?: (index: number) => void;
  onWaypointDrag?: (index: number, newPose: Pose) => void;
  onWaypointDragEnd?: (index: number, newPose: Pose) => void;
  onWaypointDelete?: (index: number) => void;
  waypointLabels?: string[];
  waypointColors?: string[];
  /** Show the built-in layer toggle panel (top-right). Default true.
   *  Set false if the host screen renders its own layers panel. */
  showLayerPanel?: boolean;
  /** Force specific layer toggles to appear in the panel even if no data
   *  is currently provided (so the user can turn them on to trigger
   *  on-demand polling via onLayerVisibilityChange). */
  availableLayers?: Array<'esdf' | 'horizon' | 'laserScan' | 'jps'>;
  /** Controlled layer visibility. If provided, MapCanvas does NOT keep
   *  internal state; the parent owns truth. Pair with onLayerVisibilityChange.
   *  If omitted, MapCanvas uses sensible defaults derived from data presence. */
  layerVisibility?: Partial<LayerVisibility>;
  /** Notifies the parent when a layer toggle is flipped. Receives the FULL
   *  next visibility map so a controlled parent can do `setVisibility(next)`
   *  without merging. The string overload is kept for back-compat. */
  onLayerVisibilityChange?: (next: LayerVisibility) => void;
  /** @deprecated use onLayerVisibilityChange */
  onLayerChange?: (key: keyof LayerVisibility, visible: boolean) => void;
}

export type LayerVisibility = {
  coordinateSystem: boolean;
  grid: boolean;
  robotPose: boolean;
  robotTrail: boolean;
  path: boolean;
  goalPose: boolean;
  initialPose: boolean;
  laserScan: boolean;
  waypoints: boolean;
  esdf: boolean;
  horizon: boolean;
  jps: boolean;
};

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
  esdfData = null,
  esdfOpacity = 0.55,
  horizonPath,
  jpsPath,
  waypoints = [],
  currentWaypointIndex = -1,
  completedWaypoints = [],
  selectedWaypointIndex = -1,
  onWaypointClick,
  onWaypointDrag,
  onWaypointDragEnd,
  onWaypointDelete,
  waypointLabels,
  waypointColors,
  showLayerPanel = true,
  availableLayers,
  layerVisibility: controlledVisibility,
  onLayerVisibilityChange,
  onLayerChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const esdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { connectionStatus } = useRobot();

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

  // ===== 图层可见性:受控 + 非受控 =====
  //
  // 受控模式(父传 `layerVisibility`):MapCanvas 无内部 state,父掌握真相。
  //   切换开关只通过 onLayerVisibilityChange 回传,父自行 setState 后回流。
  //
  // 非受控模式(父未传 `layerVisibility`):MapCanvas 只记录用户显式覆盖
  //   (sparse Partial),没有被用户碰过的图层走默认值(默认按数据存在性)。
  //   避免用 "prop 初始化的 useState" 导致的 stale state。
  const [uncontrolledOverrides, setUncontrolledOverrides] = useState<Partial<LayerVisibility>>({});

  // 默认可见性 — 只要数据/prop 在,默认就显示。
  // 这样不关心内置面板的宿主(只通过 props 传数据/条件数据)能"零配置"得到渲染;
  // 关心图层开关的宿主可传 `layerVisibility` 受控或让用户用面板切换。
  const defaultVisibility: LayerVisibility = {
    coordinateSystem: showCoordinateSystem,
    grid: showGrid,
    robotPose: true,
    robotTrail: showRobotTrail,
    path: true,
    goalPose: true,
    initialPose: true,
    laserScan: showLaserScan,
    waypoints: true,
    esdf: true,
    horizon: true,
    jps: true,
  };

  // 当前生效可见性
  const effectiveVisibility: LayerVisibility = controlledVisibility
    ? { ...defaultVisibility, ...controlledVisibility }
    : { ...defaultVisibility, ...uncontrolledOverrides };

  const toggleLayer = (key: keyof LayerVisibility) => {
    const next: LayerVisibility = {
      ...effectiveVisibility,
      [key]: !effectiveVisibility[key],
    };
    if (!controlledVisibility) {
      setUncontrolledOverrides((prev) => ({ ...prev, [key]: next[key] }));
    }
    onLayerVisibilityChange?.(next);
    onLayerChange?.(key, next[key]);
  };

  // 渲染门控:既要 prop 允许(有数据/启用显示),也要当前可见性打开
  const layerOn = {
    coordinateSystem: showCoordinateSystem && effectiveVisibility.coordinateSystem,
    grid: showGrid && effectiveVisibility.grid,
    robotPose: effectiveVisibility.robotPose,
    robotTrail: showRobotTrail && effectiveVisibility.robotTrail,
    path: effectiveVisibility.path,
    goalPose: effectiveVisibility.goalPose,
    initialPose: effectiveVisibility.initialPose,
    laserScan: showLaserScan && effectiveVisibility.laserScan,
    waypoints: effectiveVisibility.waypoints,
    esdf: effectiveVisibility.esdf,
    horizon: effectiveVisibility.horizon,
    jps: effectiveVisibility.jps,
  };

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
    const unsubscribe = apiService.subscribeTopic<any>(
      '/loc_high_freq',
      MESSAGE_TYPES.ODOMETRY,
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

  // ========== ESDF overlay ==========
  // Paints the ESDF grid into a secondary canvas with a blue→yellow→red heatmap.
  // Cell values: -1 = unknown (fully transparent), 0..100 = distance bucket
  // where 0 ≈ at obstacle (red) and 100 ≈ far (blue). The canvas is CSS-sized
  // in map-pixels so the parent transform applied to the occupancy canvas also
  // aligns this overlay. If the ESDF grid has a different resolution/origin
  // from the base map, we translate+scale this canvas in world space relative
  // to the base map's origin.
  useEffect(() => {
    const canvas = esdfCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    if (!esdfData || !esdfData.data || esdfData.data.length === 0) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = esdfData.width * dpr;
    canvas.height = esdfData.height * dpr;
    canvas.style.width = `${esdfData.width}px`;
    canvas.style.height = `${esdfData.height}px`;

    const img = ctx.createImageData(esdfData.width * dpr, esdfData.height * dpr);
    for (let y = 0; y < esdfData.height; y++) {
      for (let x = 0; x < esdfData.width; x++) {
        const v = esdfData.data[y * esdfData.width + x];
        const flippedY = esdfData.height - 1 - y;
        let r = 0, g = 0, b = 0, a = 0;
        if (v === -1) {
          a = 0;
        } else {
          // 0 → red (near), 50 → yellow, 100 → blue (far).
          const t = Math.max(0, Math.min(100, v)) / 100;
          if (t < 0.5) {
            const k = t / 0.5;
            r = 230;
            g = Math.round(60 + k * 180);
            b = Math.round(60 * (1 - k));
          } else {
            const k = (t - 0.5) / 0.5;
            r = Math.round(230 * (1 - k));
            g = Math.round(240 * (1 - k) + 150 * k);
            b = Math.round(60 + k * 195);
          }
          a = 255;
        }
        for (let dy = 0; dy < dpr; dy++) {
          for (let dx = 0; dx < dpr; dx++) {
            const idx = ((flippedY * dpr + dy) * esdfData.width * dpr + (x * dpr + dx)) * 4;
            img.data[idx] = r;
            img.data[idx + 1] = g;
            img.data[idx + 2] = b;
            img.data[idx + 3] = a;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [esdfData]);

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

  // 点位拖拽时，在 window 上监听 mousemove/mouseup，确保鼠标移出容器也能继续拖动
  useEffect(() => {
    if (draggingWaypointIndex < 0) return;

    const handleWindowMouseMove = (event: MouseEvent) => {
      if (!containerRef.current || !onWaypointDrag) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const canvasX = (mouseX - offset.x) / scale;
      const canvasY = (mouseY - offset.y) / scale;
      const worldPos = mapToWorld(canvasX, canvasY, mapData);
      onWaypointDrag(draggingWaypointIndex, {
        x: worldPos.x,
        y: worldPos.y,
        theta: waypoints[draggingWaypointIndex].theta,
      });
    };

    const handleWindowMouseUp = () => {
      if (onWaypointDragEnd) {
        onWaypointDragEnd(draggingWaypointIndex, waypoints[draggingWaypointIndex]);
      }
      setDraggingWaypointIndex(-1);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [draggingWaypointIndex, offset, scale, mapData, waypoints, onWaypointDrag, onWaypointDragEnd]);

  // 处理鼠标按下
  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
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
      if (onWaypointDragEnd) {
        onWaypointDragEnd(draggingWaypointIndex, waypoints[draggingWaypointIndex]);
      }
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
    <div className="relative h-full w-full">
      {/* 工具栏 */}
      <div className="absolute left-2.5 top-2.5 z-10 rounded-md border border-border/70 bg-card/90 p-2 shadow-sm backdrop-blur">
        <div className="mb-1 text-xs">
          缩放: {fitToViewScale > 0 ? ((scale / fitToViewScale) * 100).toFixed(0) : 100}%
        </div>
        <div className="mb-2 flex gap-1">
          <UIButton
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setScale(Math.min(maxScale, scale * 1.2))}
            className="h-7 px-2"
          >
            +
          </UIButton>
          <UIButton
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setScale(Math.max(minScale, scale / 1.2))}
            className="h-7 px-2"
          >
            -
          </UIButton>
          <UIButton
            type="button"
            variant="outline"
            size="sm"
            onClick={resetView}
            className="h-7 px-2"
          >
            适配
          </UIButton>
        </div>
        {robotPose && (
          <>
            <UIButton
              type="button"
              variant="outline"
              size="sm"
              onClick={centerToRobot}
              className="mb-1 h-7 w-full border-emerald-500 text-xs text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
            >
              居中机器人
            </UIButton>
            {showRobotTrail && robotTrail.length > 0 && (
              <UIButton
                type="button"
                variant="outline"
                size="sm"
                onClick={clearRobotTrail}
                className="h-7 w-full border-destructive text-xs text-destructive hover:bg-destructive/10"
              >
                清除轨迹
              </UIButton>
            )}
          </>
        )}
      </div>

      {/* 图层开关面板 */}
      {showLayerPanel && (() => {
        const forced = new Set(availableLayers ?? []);
        const items: Array<{ key: keyof LayerVisibility; label: string; available: boolean }> = [
          { key: 'coordinateSystem', label: '坐标系', available: showCoordinateSystem },
          { key: 'grid', label: '栅格', available: showGrid },
          { key: 'robotPose', label: '机器人', available: Boolean(robotPose) },
          { key: 'robotTrail', label: '轨迹', available: showRobotTrail && Boolean(robotPose) },
          { key: 'path', label: '规划路径', available: Boolean(path && path.length > 0) },
          { key: 'goalPose', label: '目标点', available: Boolean(goalPose) },
          { key: 'initialPose', label: '初始位姿', available: Boolean(initialPose) },
          { key: 'laserScan', label: '激光扫描', available: forced.has('laserScan') || (showLaserScan && Boolean(laserScan)) },
          { key: 'waypoints', label: '路径点', available: Boolean(waypoints && waypoints.length > 0) },
          { key: 'esdf', label: 'ESDF 距离场', available: forced.has('esdf') || Boolean(esdfData && esdfData.data && esdfData.data.length > 0) },
          { key: 'horizon', label: 'MPC 预测', available: forced.has('horizon') || Boolean(horizonPath && horizonPath.length > 1) },
          { key: 'jps', label: 'JPS 路径', available: forced.has('jps') || Boolean(jpsPath && jpsPath.length > 1) },
        ];
        const visible = items.filter((it) => it.available);
        if (visible.length === 0) return null;
        return (
          <div className="absolute right-2.5 top-2.5 z-10 w-40 rounded-md border border-border/70 bg-card/90 p-3 shadow-sm backdrop-blur">
            <div className="mb-2 text-xs font-medium text-foreground">图层</div>
            <div className="space-y-2">
              {visible.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">{label}</span>
                  <Switch
                    checked={effectiveVisibility[key]}
                    onCheckedChange={() => toggleLayer(key)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 地图容器 */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { if (draggingWaypointIndex < 0) { handleMouseUp(); setBrushPreviewPos(null); } }}
        onContextMenu={handleContextMenu}
        className={cn(
          'relative h-full w-full overflow-visible',
          isDragging ? 'cursor-grabbing' : 'cursor-default',
          className
        )}
      >
        {/* Canvas 层：仅占据栅格位图 */}
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          className={cn(
            'box-border border-2 border-black',
            draggingWaypointIndex >= 0
              ? 'cursor-grabbing'
              : hoveredWaypointIndex >= 0
                ? 'cursor-grab'
                : onMapClick
                  ? 'cursor-crosshair'
                  : 'cursor-default'
          )}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        />

        {/* ESDF 叠加层：半透明距离场热力图，坐标对齐到底图 */}
        {layerOn.esdf && esdfData && esdfData.data && esdfData.data.length > 0 && (() => {
          // ESDF 底图的左下角 (origin_x, origin_y) 对应的底图像素坐标。
          const originMapPx = worldToMap(esdfData.origin.x, esdfData.origin.y, mapData);
          const resRatio = esdfData.resolution / mapData.resolution;
          // 底图左上角是 y=0，ESDF 图层在底图里从左下角铺开，翻转后的 top 即是
          // originMapPx.y 对应的像素 - ESDF 高度（因为 worldToMap 已翻转）。
          const esdfTop = originMapPx.y - esdfData.height * resRatio;
          const esdfLeft = originMapPx.x;
          return (
            <canvas
              ref={esdfCanvasRef}
              className="pointer-events-none absolute left-0 top-0"
              style={{
                opacity: esdfOpacity,
                transform: `translate(${offset.x + esdfLeft * scale}px, ${offset.y + esdfTop * scale}px) scale(${scale * resRatio})`,
                transformOrigin: '0 0',
              }}
            />
          );
        })()}

        {/* SVG 覆盖层：所有矢量图形 */}
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          style={{
            width: mapData.width,
            height: mapData.height,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {/* 栅格 */}
          {layerOn.grid && <GridOverlay mapData={mapData} gridSize={gridSize} scale={scale} />}

          {/* 坐标系 */}
          {layerOn.coordinateSystem && <CoordinateSystemOverlay mapData={mapData} scale={scale} />}

          {/* 导航路径（规划路径） */}
          {layerOn.path && path && path.length > 0 && (
            <NavigationPathOverlay path={path} mapData={mapData} scale={scale} />
          )}

          {/* JPS 备胎路径 — MINCO 硬失败时 MPC 实际在跟的粗糙折线，琥珀色虚线区别于 MINCO */}
          {layerOn.jps && jpsPath && jpsPath.length > 1 && (
            <polyline
              points={jpsPath.map(p => {
                const m = worldToMap(p.x, p.y, mapData);
                return `${m.x},${m.y}`;
              }).join(' ')}
              fill="none"
              stroke="#ffb020"
              strokeWidth={2.5 / scale}
              strokeDasharray={`${8 / scale},${5 / scale}`}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* MPC 预测 horizon */}
          {layerOn.horizon && horizonPath && horizonPath.length > 1 && (
            <polyline
              points={horizonPath.map(p => {
                const m = worldToMap(p.x, p.y, mapData);
                return `${m.x},${m.y}`;
              }).join(' ')}
              fill="none"
              stroke="#ff5cf5"
              strokeWidth={2 / scale}
              strokeDasharray={`${6 / scale},${4 / scale}`}
              strokeLinecap="round"
            />
          )}

          {/* 机器人轨迹 */}
          {layerOn.robotTrail && robotTrail.length > 1 && (
            <RobotTrailOverlay trail={robotTrail} mapData={mapData} scale={scale} />
          )}

          {/* 雷达扫描 */}
          {layerOn.laserScan && laserScan && robotPose && (
            <LaserScanOverlay laserScan={laserScan} robotPose={robotPose} mapData={mapData} scale={scale} />
          )}

          {/* 初始位姿（重定位标记） */}
          {layerOn.initialPose && initialPose && <InitialPoseMarker pose={initialPose} mapData={mapData} scale={scale} />}

          {/* 路径点连线 + 路径点标记 */}
          {layerOn.waypoints && waypoints && waypoints.length > 0 && (
            <>
              <WaypointPathOverlay waypoints={waypoints} mapData={mapData} currentIndex={currentWaypointIndex} scale={scale} />
              {waypoints.map((wp, i) => (
                <WaypointMarker
                  key={i}
                  pose={wp}
                  index={i}
                  label={waypointLabels?.[i]}
                  customColor={waypointColors?.[i]}
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
          {layerOn.goalPose && goalPose && goalMapPos && (
            <GoalMarker x={goalMapPos.x} y={goalMapPos.y} theta={goalPose.theta} scale={scale} />
          )}

          {/* 机器人 */}
          {layerOn.robotPose && robotPose && robotMapPos && (
            <RobotMarker x={robotMapPos.x} y={robotMapPos.y} theta={robotPose.theta} scale={scale} resolution={mapData.resolution} />
          )}
        </svg>
      </div>

      {/* 机器人位姿显示 */}
      {showRobotPose && robotPose && (
        <div className="absolute left-2.5 top-20 z-10 min-w-[180px] rounded-md border border-border/70 bg-card/95 px-4 py-3 text-xs shadow-md">
          <div className="mb-2 text-[13px] font-bold">机器人位姿</div>
          <div className="leading-relaxed">
            <div>X: {robotPose.x.toFixed(2)} m</div>
            <div>Y: {robotPose.y.toFixed(2)} m</div>
            <div>θ: {((robotPose.theta * 180) / Math.PI).toFixed(1)}°</div>
          </div>
        </div>
      )}

      {/* 操作提示 */}
      {showOperationHints && (
        <div className="absolute bottom-2.5 left-2.5 z-10 rounded-md bg-black/70 px-3 py-2 text-xs text-white">
          <div>滚轮：缩放</div>
          <div>中键拖动：平移</div>
          <div>左键点击并拖动：设置位置和方向</div>
        </div>
      )}
    </div>
  );
};
