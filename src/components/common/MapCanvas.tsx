import React, { useRef, useEffect, useState } from 'react';
import type { MapData, Pose, PathPoint, LaserScan } from '@/types';
import { rosService } from '@/services/ros';
import { useROS } from '@/contexts/ROSContext';
import { ConnectionStatus } from '@/types';

interface MapCanvasProps {
  mapData: MapData;
  robotPose?: Pose;
  goalPose?: Pose;
  initialPose?: Pose; // 初始化位姿（重定位时设置的位置）
  path?: PathPoint[];
  onMapClick?: (x: number, y: number, theta?: number) => void;
  className?: string;
  showRobotTrail?: boolean; // 是否显示机器人轨迹
  showCoordinateSystem?: boolean; // 是否显示坐标系
  showOperationHints?: boolean; // 是否显示操作提示
  showRobotPose?: boolean; // 是否显示机器人位姿信息（自动订阅）
  disableDirectionSetting?: boolean; // 禁用方向设置模式（用于地图编辑时连续编辑）
  brushSize?: number; // 画笔大小（用于显示预览圆圈）
  laserScan?: LaserScan | null; // 雷达扫描数据
  showLaserScan?: boolean; // 是否显示雷达点
  showGrid?: boolean; // 是否显示栅格
  gridSize?: number; // 栅格大小（米），默认1.0
  waypoints?: Pose[]; // 路径点列表（多目标点导航）
  currentWaypointIndex?: number; // 当前正在导航的路径点索引
  completedWaypoints?: number[]; // 已完成的路径点索引列表
  selectedWaypointIndex?: number; // 选中的路径点索引
  onWaypointClick?: (index: number) => void; // 点击路径点回调
  onWaypointDrag?: (index: number, newPose: Pose) => void; // 拖动路径点回调
  onWaypointDelete?: (index: number) => void; // 删除路径点回调
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
  const [fitToViewScale, setFitToViewScale] = useState(1); // 适配视图的缩放比例
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

  // 内部订阅的机器人位姿（当showRobotPose为true时自动订阅）
  const [internalRobotPose, setInternalRobotPose] = useState<Pose | null>(null);

  // 使用内部订阅的位姿或外部传入的位姿
  const robotPose = showRobotPose ? internalRobotPose : externalRobotPose;

  // ========== 坐标转换辅助函数 ==========
  // 这些函数确保在浏览器缩放时也能正确处理坐标

  /**
   * 获取鼠标相对于容器的坐标
   * getBoundingClientRect() 自动处理浏览器缩放
   */
  const getMousePosition = (event: MouseEvent | React.MouseEvent): { x: number; y: number } | null => {
    const container = containerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  /**
   * 将容器坐标转换为画布坐标（地图像素坐标）
   */
  const containerToCanvas = (containerX: number, containerY: number): { x: number; y: number } => {
    return {
      x: (containerX - offset.x) / scale,
      y: (containerY - offset.y) / scale,
    };
  };

  // ========== 订阅和数据处理 ==========

  // 订阅机器人位姿（当showRobotPose为true时）
  useEffect(() => {
    if (!showRobotPose || connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    const unsubscribe = rosService.subscribeTopic<any>(
      '/loc_high_freq',
      'nav_msgs/Odometry',
      (poseMsg) => {
        const position = poseMsg.pose.pose.position;
        const orientation = poseMsg.pose.pose.orientation;

        const theta = Math.atan2(
          2.0 * (orientation.w * orientation.z + orientation.x * orientation.y),
          1.0 - 2.0 * (orientation.y * orientation.y + orientation.z * orientation.z)
        );

        setInternalRobotPose({
          x: position.x,
          y: position.y,
          theta,
        });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [showRobotPose, connectionStatus]);

  // 更新机器人轨迹
  useEffect(() => {
    if (!robotPose || !showRobotTrail) return;

    setRobotTrail((prevTrail) => {
      const newPoint = { x: robotPose.x, y: robotPose.y };

      // 如果是第一个点，直接添加
      if (prevTrail.length === 0) {
        return [newPoint];
      }

      // 计算与上一个点的距离
      const lastPoint = prevTrail[prevTrail.length - 1];
      const distance = Math.sqrt(
        Math.pow(newPoint.x - lastPoint.x, 2) + Math.pow(newPoint.y - lastPoint.y, 2)
      );

      // 只有当移动距离大于阈值时才添加新点（避免轨迹过密）
      if (distance > 0.1) {
        const newTrail = [...prevTrail, newPoint];
        // 限制轨迹点数量，保留最近的 500 个点
        return newTrail.slice(-500);
      }

      return prevTrail;
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

      // 计算缩放比例，确保地图能完全适配容器
      const scaleX = containerWidth / mapData.width;
      const scaleY = containerHeight / mapData.height;
      const fitScale = Math.min(scaleX, scaleY);

      // 保存适配比例
      setFitToViewScale(fitScale);

      // 设置最小缩放为适配比例的50%，最大为10倍
      const calculatedMinScale = fitScale * 0.5;
      setMinScale(calculatedMinScale);

      // 初始化时，设置为适配比例（100%）
      if (!isInitialized) {
        setScale(fitScale);
        // 居中显示
        setOffset({
          x: (containerWidth - mapData.width * fitScale) / 2,
          y: (containerHeight - mapData.height * fitScale) / 2,
        });
        setIsInitialized(true);
      }
    };

    // 初始计算
    updateFitScale();

    // 监听窗口大小变化
    const resizeObserver = new ResizeObserver(() => {
      updateFitScale();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [mapData, isInitialized]);

  // 绘制地图
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });
    if (!ctx) return;

    // 获取设备像素比，用于高清显示
    const dpr = window.devicePixelRatio || 1;

    // 设置画布实际像素大小（考虑设备像素比）
    canvas.width = mapData.width * dpr;
    canvas.height = mapData.height * dpr;

    // 设置画布CSS显示大小
    canvas.style.width = `${mapData.width}px`;
    canvas.style.height = `${mapData.height}px`;

    // 启用图像平滑和高质量渲染
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制地图数据（沿横向对称翻转）
    // 创建放大后的imageData以匹配高DPI显示
    const imageData = ctx.createImageData(mapData.width * dpr, mapData.height * dpr);

    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        // 原始数据索引（行优先）
        const srcIndex = y * mapData.width + x;
        const value = mapData.data[srcIndex];

        // 确定像素颜色
        let r, g, b;
        if (value === -1) {
          // 未知区域 - 灰色
          r = g = b = 128;
        } else if (value === 0) {
          // 空闲区域 - 白色
          r = g = b = 255;
        } else {
          // 占据区域 - 黑色
          r = g = b = 0;
        }

        // 翻转Y轴坐标
        const flippedY = mapData.height - 1 - y;

        // 在高DPI下，每个逻辑像素对应 dpr x dpr 个物理像素
        for (let dy = 0; dy < dpr; dy++) {
          for (let dx = 0; dx < dpr; dx++) {
            const physicalX = x * dpr + dx;
            const physicalY = flippedY * dpr + dy;
            const pixelIndex = (physicalY * mapData.width * dpr + physicalX) * 4;

            imageData.data[pixelIndex] = r;
            imageData.data[pixelIndex + 1] = g;
            imageData.data[pixelIndex + 2] = b;
            imageData.data[pixelIndex + 3] = 255; // Alpha
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // 在绘制完栅格地图后，设置缩放以便后续矢量图形使用逻辑坐标
    ctx.scale(dpr, dpr);

    // 绘制栅格
    if (showGrid) {
      drawGrid(ctx, mapData, gridSize);
    }

    // 绘制坐标系
    if (showCoordinateSystem) {
      drawCoordinateSystem(ctx, mapData);
    }

    // 绘制路径
    if (path && path.length > 0) {
      ctx.strokeStyle = '#1890ff';
      ctx.lineWidth = 3;
      ctx.beginPath();

      const firstPoint = worldToMap(path[0].x, path[0].y, mapData);
      ctx.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < path.length; i++) {
        const point = worldToMap(path[i].x, path[i].y, mapData);
        ctx.lineTo(point.x, point.y);
      }

      ctx.stroke();
    }

    // 绘制机器人轨迹
    if (showRobotTrail && robotTrail.length > 1) {
      ctx.strokeStyle = 'rgba(82, 196, 26, 0.5)'; // 半透明绿色
      ctx.lineWidth = 2;
      ctx.beginPath();

      const firstTrailPoint = worldToMap(robotTrail[0].x, robotTrail[0].y, mapData);
      ctx.moveTo(firstTrailPoint.x, firstTrailPoint.y);

      for (let i = 1; i < robotTrail.length; i++) {
        const point = worldToMap(robotTrail[i].x, robotTrail[i].y, mapData);
        ctx.lineTo(point.x, point.y);
      }

      ctx.stroke();

      // 绘制轨迹点（每10个点绘制一个小圆点）
      ctx.fillStyle = 'rgba(82, 196, 26, 0.3)';
      for (let i = 0; i < robotTrail.length; i += 10) {
        const point = worldToMap(robotTrail[i].x, robotTrail[i].y, mapData);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 绘制雷达扫描点
    if (showLaserScan && laserScan && robotPose) {
      drawLaserScan(ctx, laserScan, robotPose, mapData);
    }

    // 绘制机器人位置
    if (robotPose) {
      const robotPos = worldToMap(robotPose.x, robotPose.y, mapData);
      // console.log('[MapCanvas] 机器人位置:', {
      //   world: { x: robotPose.x, y: robotPose.y, theta: robotPose.theta },
      //   map: { x: robotPos.x, y: robotPos.y },
      //   mapSize: { width: mapData.width, height: mapData.height }
      // });
      drawRobot(ctx, robotPos.x, robotPos.y, robotPose.theta, '#52c41a', '机器人', mapData);
    }

    // 绘制初始位姿（在目标位置之前绘制，避免遮挡）
    if (initialPose) {
      const initialPos = worldToMap(initialPose.x, initialPose.y, mapData);
      drawInitialPose(ctx, initialPos.x, initialPos.y, initialPose.theta, mapData);
    }

    // 绘制目标位置
    if (goalPose) {
      const goalPos = worldToMap(goalPose.x, goalPose.y, mapData);
      drawGoal(ctx, goalPos.x, goalPos.y, goalPose.theta, mapData);
    }

    // 绘制路径点（多目标点模式）
    if (waypoints && waypoints.length > 0) {
      // 先绘制路径连线
      drawWaypointPath(ctx, waypoints, mapData, currentWaypointIndex);

      // 再绘制路径点标记
      waypoints.forEach((waypoint, index) => {
        const waypointPos = worldToMap(waypoint.x, waypoint.y, mapData);
        const isCurrent = index === currentWaypointIndex;
        const isCompleted = completedWaypoints.includes(index);
        const isSelected = index === selectedWaypointIndex;
        const isHovered = index === hoveredWaypointIndex;

        drawWaypoint(
          ctx,
          waypointPos.x,
          waypointPos.y,
          waypoint.theta,
          index,
          mapData,
          isCurrent,
          isCompleted,
          isSelected,
          isHovered
        );
      });
    }

    // 绘制方向设置指示线
    if (isSettingDirection && directionStart && directionEnd) {
      drawDirectionLine(ctx, directionStart.x, directionStart.y, directionEnd.x, directionEnd.y);
    }

    // 绘制画笔预览圆圈
    if (brushPreviewPos && brushSize > 0 && disableDirectionSetting) {
      drawBrushPreview(ctx, brushPreviewPos.x, brushPreviewPos.y, brushSize);
    }
  }, [mapData, robotPose, goalPose, initialPose, path, robotTrail, showRobotTrail, showCoordinateSystem, isSettingDirection, directionStart, directionEnd, brushPreviewPos, brushSize, disableDirectionSetting, laserScan, showLaserScan, waypoints, currentWaypointIndex, completedWaypoints, selectedWaypointIndex, hoveredWaypointIndex]);

  // 处理鼠标滚轮缩放
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const mousePos = getMousePosition(event);
      if (!mousePos) return;

      // 计算缩放因子（更平滑的缩放）
      const delta = -event.deltaY;
      const scaleFactor = delta > 0 ? 1.15 : 1 / 1.15;
      const newScale = Math.max(minScale, Math.min(maxScale, scale * scaleFactor));

      // 计算缩放后的偏移，使缩放中心在鼠标位置
      const scaleRatio = newScale / scale;
      const newOffsetX = mousePos.x - (mousePos.x - offset.x) * scaleRatio;
      const newOffsetY = mousePos.y - (mousePos.y - offset.y) * scaleRatio;

      setScale(newScale);
      setOffset({ x: newOffsetX, y: newOffsetY });
    };

    // 使用原生事件监听器，设置 passive: false 来允许 preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [scale, offset, minScale, maxScale]);

  // 处理鼠标按下（开始拖动或设置方向）
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const mousePos = getMousePosition(event);
    if (!mousePos) return;

    // 转换为画布坐标
    const canvasPos = containerToCanvas(mousePos.x, mousePos.y);

    // 中键拖动
    if (event.button === 1) {
      event.preventDefault();
      setIsDragging(true);
      setDragStart({ x: event.clientX - offset.x, y: event.clientY - offset.y });
      return;
    }

    // 右键或ctrl/cmd+左键拖动
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
        const clickedIndex = getClickedWaypointIndex(canvasPos.x, canvasPos.y, waypoints, mapData);
        if (clickedIndex >= 0) {
          // 点击了路径点
          event.preventDefault();
          setDraggingWaypointIndex(clickedIndex);

          // 通知父组件路径点被选中
          if (onWaypointClick) {
            onWaypointClick(clickedIndex);
          }
          return;
        }
      }

      // 没有点击路径点，执行原有逻辑
      if (onMapClick) {
        if (disableDirectionSetting) {
          // 连续编辑模式：立即调用onMapClick并开始跟踪
          const worldPos = mapToWorld(canvasPos.x, canvasPos.y, mapData);
          onMapClick(worldPos.x, worldPos.y);
          setIsContinuousEditing(true);
        } else {
          // 方向设置模式：记录起点和终点
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
        theta: waypoints[draggingWaypointIndex].theta, // 保持原有角度
      });
      return;
    }

    // 更新画笔预览位置（当处于编辑模式时）
    if (disableDirectionSetting && brushSize > 0) {
      setBrushPreviewPos({ x: canvasPos.x, y: canvasPos.y });
    }

    // 检测悬停的路径点（用于鼠标样式变化）
    if (waypoints && waypoints.length > 0 && !isDragging && !isSettingDirection) {
      const hoveredIndex = getClickedWaypointIndex(canvasPos.x, canvasPos.y, waypoints, mapData);
      setHoveredWaypointIndex(hoveredIndex);
    }

    if (isDragging) {
      setOffset({
        x: event.clientX - dragStart.x,
        y: event.clientY - dragStart.y,
      });
    } else if (isContinuousEditing && onMapClick && disableDirectionSetting) {
      // 连续编辑模式：持续调用onMapClick
      const worldPos = mapToWorld(canvasPos.x, canvasPos.y, mapData);
      onMapClick(worldPos.x, worldPos.y);
    } else if (isSettingDirection && directionStart) {
      // 更新方向终点
      setDirectionEnd({ x: canvasPos.x, y: canvasPos.y });
    }
  };

  // 处理鼠标松开（结束拖动或完成方向设置）
  const handleMouseUp = () => {
    // 结束路径点拖动
    if (draggingWaypointIndex >= 0) {
      setDraggingWaypointIndex(-1);
      return;
    }

    if (isContinuousEditing) {
      // 结束连续编辑
      setIsContinuousEditing(false);
    } else if (isSettingDirection && directionStart && directionEnd && onMapClick) {
      // 计算方向角度
      const dx = directionEnd.x - directionStart.x;
      const dy = directionEnd.y - directionStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 转换为世界坐标
      const worldPos = mapToWorld(directionStart.x, directionStart.y, mapData);

      // 如果拖拽距离足够长，计算方向角度
      if (distance > 5) { // 至少拖拽5像素才计算方向
        // 注意：屏幕坐标Y轴向下，世界坐标Y轴向上
        const theta = Math.atan2(-dy, dx);
        onMapClick(worldPos.x, worldPos.y, theta);
      } else {
        // 拖拽距离太短，使用默认角度0
        onMapClick(worldPos.x, worldPos.y, 0);
      }

      // 重置方向设置状态
      setIsSettingDirection(false);
      setDirectionStart(null);
      setDirectionEnd(null);
    }

    setIsDragging(false);
  };

  // 处理点击事件（现在主要由handleMouseUp处理，这里保留作为后备）
  const handleClick = (_event: React.MouseEvent<HTMLCanvasElement>) => {
    // 如果已经在handleMouseUp中处理了，这里就不再处理
    return;
  };

  // 处理右键菜单
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();

    // 如果没有路径点或没有删除回调，直接返回
    if (!waypoints || waypoints.length === 0 || !onWaypointDelete) {
      return;
    }

    const mousePos = getMousePosition(event);
    if (!mousePos) return;

    const canvasPos = containerToCanvas(mousePos.x, mousePos.y);

    // 检查是否右键点击了路径点
    const clickedIndex = getClickedWaypointIndex(canvasPos.x, canvasPos.y, waypoints, mapData);
    if (clickedIndex >= 0) {
      // 右键点击了路径点，触发删除
      onWaypointDelete(clickedIndex);
    }
  };

  // 重置视图 - 自适应地图大小
  const resetView = () => {
    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // 计算适配比例
    const scaleX = containerWidth / mapData.width;
    const scaleY = containerHeight / mapData.height;
    const fitScale = Math.min(scaleX, scaleY);

    setScale(fitScale);
    // 居中显示
    setOffset({
      x: (containerWidth - mapData.width * fitScale) / 2,
      y: (containerHeight - mapData.height * fitScale) / 2,
    });
  };

  // 居中到机器人位置
  const centerToRobot = () => {
    if (!robotPose) return;

    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // 将机器人位置转换为地图像素坐标
    const robotMapPos = worldToMap(robotPose.x, robotPose.y, mapData);

    // 计算偏移，使机器人位于容器中心
    setOffset({
      x: containerWidth / 2 - robotMapPos.x * scale,
      y: containerHeight / 2 - robotMapPos.y * scale,
    });
  };

  // 清除机器人轨迹
  const clearRobotTrail = () => {
    setRobotTrail([]);
  };

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
            style={{
              padding: '4px 8px',
              marginRight: '4px',
              cursor: 'pointer',
              border: '1px solid #d9d9d9',
              borderRadius: '2px',
              background: 'white',
            }}
          >
            +
          </button>
          <button
            onClick={() => setScale(Math.max(minScale, scale / 1.2))}
            style={{
              padding: '4px 8px',
              marginRight: '4px',
              cursor: 'pointer',
              border: '1px solid #d9d9d9',
              borderRadius: '2px',
              background: 'white',
            }}
          >
            -
          </button>
          <button
            onClick={resetView}
            style={{
              padding: '4px 8px',
              cursor: 'pointer',
              border: '1px solid #d9d9d9',
              borderRadius: '2px',
              background: 'white',
            }}
          >
            适配
          </button>
        </div>
        {robotPose && (
          <>
            <button
              onClick={centerToRobot}
              style={{
                padding: '4px 8px',
                marginBottom: '4px',
                cursor: 'pointer',
                border: '1px solid #52c41a',
                borderRadius: '2px',
                background: 'white',
                color: '#52c41a',
                width: '100%',
                fontSize: '12px',
              }}
            >
              🤖 居中机器人
            </button>
            {showRobotTrail && robotTrail.length > 0 && (
              <button
                onClick={clearRobotTrail}
                style={{
                  padding: '4px 8px',
                  cursor: 'pointer',
                  border: '1px solid #ff4d4f',
                  borderRadius: '2px',
                  background: 'white',
                  color: '#ff4d4f',
                  width: '100%',
                  fontSize: '12px',
                }}
              >
                清除轨迹
              </button>
            )}
          </>
        )}
      </div>

      {/* 地图容器 */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          setBrushPreviewPos(null); // 清除画笔预览
        }}
        onContextMenu={handleContextMenu}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'default',
          position: 'relative',
        }}
        className={className}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            cursor: draggingWaypointIndex >= 0 ? 'grabbing'
                  : hoveredWaypointIndex >= 0 ? 'grab'
                  : onMapClick ? 'crosshair'
                  : 'default',
            border: '2px solid #000',
            boxSizing: 'border-box',
          }}
        />
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
          <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>🤖 机器人位姿</div>
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
          <div>🖱️ 滚轮：缩放</div>
          <div>🖱️ 中键拖动：平移</div>
          <div>🖱️ 左键点击并拖动：设置位置和方向</div>
        </div>
      )}
    </div>
  );
};

// 世界坐标转地图像素坐标
function worldToMap(
  x: number,
  y: number,
  mapData: MapData
): { x: number; y: number } {
  const mapX = Math.floor((x - mapData.origin.x) / mapData.resolution);
  const mapY = Math.floor((y - mapData.origin.y) / mapData.resolution);

  // 翻转Y轴（因为地图显示已经上下翻转）
  const flippedY = mapData.height - 1 - mapY;

  return {
    x: mapX,
    y: flippedY,
  };
}

// 地图像素坐标转世界坐标
function mapToWorld(
  x: number,
  y: number,
  mapData: MapData
): { x: number; y: number } {
  // 反向翻转Y轴（因为地图显示已经上下翻转）
  const originalY = mapData.height - 1 - y;

  return {
    x: x * mapData.resolution + mapData.origin.x,
    y: originalY * mapData.resolution + mapData.origin.y,
  };
}

// 检测鼠标是否点击在路径点上
function getClickedWaypointIndex(
  canvasX: number,
  canvasY: number,
  waypoints: Pose[],
  mapData: MapData
): number {
  // 计算路径点的像素大小（与drawWaypoint保持一致）
  const waypointSize = Math.max(4, 0.2 / mapData.resolution);

  // 从后往前遍历（后绘制的在上层，优先检测）
  for (let i = waypoints.length - 1; i >= 0; i--) {
    const waypointPos = worldToMap(waypoints[i].x, waypoints[i].y, mapData);
    const dx = canvasX - waypointPos.x;
    const dy = canvasY - waypointPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 扩大点击区域，提升用户体验
    if (distance <= waypointSize + 5) {
      return i;
    }
  }

  return -1; // 没有点击到任何路径点
}

// 绘制栅格
function drawGrid(ctx: CanvasRenderingContext2D, mapData: MapData, gridSize: number) {
  ctx.save();

  // 栅格样式：半透明浅灰色
  ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
  ctx.lineWidth = 1;

  // 计算栅格在像素坐标中的间距
  const gridSpacingPixels = gridSize / mapData.resolution;

  // 找到地图原点在像素坐标系中的位置
  const origin = worldToMap(0, 0, mapData);

  // 绘制垂直线（沿X轴方向）
  // 从原点向右绘制
  for (let x = origin.x; x < mapData.width; x += gridSpacingPixels) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, mapData.height);
    ctx.stroke();
  }
  // 从原点向左绘制
  for (let x = origin.x - gridSpacingPixels; x >= 0; x -= gridSpacingPixels) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, mapData.height);
    ctx.stroke();
  }

  // 绘制水平线（沿Y轴方向）
  // 从原点向下绘制
  for (let y = origin.y; y < mapData.height; y += gridSpacingPixels) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(mapData.width, y);
    ctx.stroke();
  }
  // 从原点向上绘制
  for (let y = origin.y - gridSpacingPixels; y >= 0; y -= gridSpacingPixels) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(mapData.width, y);
    ctx.stroke();
  }

  ctx.restore();
}

// 绘制坐标系
function drawCoordinateSystem(ctx: CanvasRenderingContext2D, mapData: MapData) {
  // 获取原点在地图像素坐标系中的位置
  const origin = worldToMap(0, 0, mapData);

  // 检查原点是否在地图可见范围内
  const isOriginVisible = origin.x >= 0 && origin.x < mapData.width &&
                          origin.y >= 0 && origin.y < mapData.height;

  // 如果原点不在可见范围内，不绘制坐标系
  if (!isOriginVisible) {
    console.log('[MapCanvas] 坐标原点不在地图可见范围内，跳过绘制');
    return;
  }

  // 坐标轴长度（单位：米）
  const axisLength = 1.0; // 1米

  // X轴终点
  const xAxisEnd = worldToMap(axisLength, 0, mapData);
  // Y轴终点
  const yAxisEnd = worldToMap(0, axisLength, mapData);

  // 绘制X轴（红色）
  ctx.save();
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(xAxisEnd.x, xAxisEnd.y);
  ctx.stroke();

  // X轴箭头
  drawArrowHead(ctx, origin.x, origin.y, xAxisEnd.x, xAxisEnd.y, '#ff0000');

  // X轴标签
  ctx.fillStyle = '#ff0000';
  ctx.font = 'bold 16px Arial';
  ctx.fillText('X', xAxisEnd.x + 10, xAxisEnd.y + 5);

  // 绘制Y轴（绿色）
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(yAxisEnd.x, yAxisEnd.y);
  ctx.stroke();

  // Y轴箭头
  drawArrowHead(ctx, origin.x, origin.y, yAxisEnd.x, yAxisEnd.y, '#00ff00');

  // Y轴标签
  ctx.fillStyle = '#00ff00';
  ctx.font = 'bold 16px Arial';
  ctx.fillText('Y', yAxisEnd.x + 10, yAxisEnd.y - 5);

  ctx.restore();
}

// 绘制箭头头部
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string
) {
  const headLength = 10;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

// 绘制方向指示线
function drawDirectionLine(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number
) {
  ctx.save();

  // 绘制虚线
  ctx.strokeStyle = 'rgba(255, 77, 79, 0.8)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 5]);
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // 绘制箭头
  const angle = Math.atan2(endY - startY, endX - startX);
  const arrowLength = 15;
  const arrowAngle = Math.PI / 6;

  ctx.fillStyle = 'rgba(255, 77, 79, 0.8)';
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - arrowLength * Math.cos(angle - arrowAngle),
    endY - arrowLength * Math.sin(angle - arrowAngle)
  );
  ctx.lineTo(
    endX - arrowLength * Math.cos(angle + arrowAngle),
    endY - arrowLength * Math.sin(angle + arrowAngle)
  );
  ctx.closePath();
  ctx.fill();

  // 绘制起始点
  ctx.fillStyle = 'rgba(255, 77, 79, 0.8)';
  ctx.beginPath();
  ctx.arc(startX, startY, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// 绘制机器人（矢量效果优化 - 高清抗锯齿）
function drawRobot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theta: number,
  color: string,
  _label: string,
  mapData: MapData
) {
  ctx.save();

  // 启用最佳抗锯齿设置
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 计算0.3m对应的像素半径，最小值为20像素以确保清晰
  const robotRadiusMeters = 0.15;
  const radiusInPixels = robotRadiusMeters / mapData.resolution;
  const size = Math.max(3, radiusInPixels);

  // 使用半像素偏移以获得更清晰的线条
  const centerX = Math.round(x) + 0.5;
  const centerY = Math.round(y) + 0.5;

  // 绘制外发光效果
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // 绘制渐变圆形主体
  const gradient = ctx.createRadialGradient(
    centerX - size / 3,
    centerY - size / 3,
    0,
    centerX,
    centerY,
    size
  );
  gradient.addColorStop(0, lightenColor(color, 30));
  gradient.addColorStop(1, color);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
  ctx.fill();

  // 绘制边框（更细的线条）
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 绘制方向箭头（实心三角形）
  const arrowLength = size * 0.75;
  const arrowWidth = size * 0.45;

  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 2;
  ctx.beginPath();
  // 箭头尖端
  ctx.moveTo(
    centerX + Math.cos(theta) * arrowLength,
    centerY - Math.sin(theta) * arrowLength
  );
  // 箭头左侧
  ctx.lineTo(
    centerX + Math.cos(theta + Math.PI * 2 / 3) * arrowWidth,
    centerY - Math.sin(theta + Math.PI * 2 / 3) * arrowWidth
  );
  // 箭头右侧
  ctx.lineTo(
    centerX + Math.cos(theta - Math.PI * 2 / 3) * arrowWidth,
    centerY - Math.sin(theta - Math.PI * 2 / 3) * arrowWidth
  );
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // 绘制标签背景（圆角矩形）
  // ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
  // ctx.textAlign = 'center';
  // ctx.textBaseline = 'top';
  // const textMetrics = ctx.measureText(label);
  // const textWidth = textMetrics.width;
  // const padding = 8;
  // const labelY = centerY + size + 6;

  // ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  // ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  // ctx.shadowBlur = 4;
  // ctx.beginPath();
  // ctx.roundRect(
  //   centerX - textWidth / 2 - padding / 2,
  //   labelY,
  //   textWidth + padding,
  //   22,
  //   5
  // );
  // ctx.fill();
  // ctx.shadowBlur = 0;

  // 绘制标签文字（使用系统字体获得更好的渲染）
  // ctx.fillStyle = '#ffffff';
  // ctx.fillText(label, centerX, labelY + 4);

  ctx.restore();
}

// 绘制路径点（带序号的圆形标记）
function drawWaypoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theta: number,
  index: number,
  mapData: MapData,
  isCurrent: boolean,
  isCompleted: boolean,
  isSelected: boolean = false,
  isHovered: boolean = false
) {
  ctx.save();

  // 启用抗锯齿
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 根据状态确定颜色和大小
  let color: string;
  let size: number;

  if (isCompleted) {
    color = '#999999'; // 灰色 - 已完成
    size = Math.max(4, 0.2 / mapData.resolution);
  } else if (isCurrent) {
    color = '#52c41a'; // 绿色 - 当前目标
    size = Math.max(5, 0.25 / mapData.resolution);
  } else {
    color = '#1890ff'; // 蓝色 - 待导航
    size = Math.max(4, 0.2 / mapData.resolution);
  }

  // 选中或悬停时放大
  if (isSelected || isHovered) {
    size = size * 1.2;
  }

  const centerX = Math.round(x) + 0.5;
  const centerY = Math.round(y) + 0.5;

  // 绘制外发光效果（当前目标点或选中/悬停）
  if (isCurrent || isSelected || isHovered) {
    ctx.shadowColor = color;
    ctx.shadowBlur = isSelected ? 20 : 15;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size + (isSelected ? 8 : 6), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // 绘制圆形背景
  ctx.fillStyle = color;
  ctx.strokeStyle = isSelected ? '#faad14' : '#ffffff'; // 选中时用橙色边框
  ctx.lineWidth = isSelected ? 3 : 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 绘制序号文字
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.max(size * 1.2, 12)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), centerX, centerY);

  // 如果是当前目标，绘制方向指示箭头
  if (isCurrent) {
    const arrowLength = size * 1.5;
    const arrowAngle = -theta; // Canvas Y轴向下，需要取反

    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 箭头主线
    const endX = centerX + Math.cos(arrowAngle) * arrowLength;
    const endY = centerY + Math.sin(arrowAngle) * arrowLength;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // 箭头头部
    const headSize = size * 0.5;
    const angle1 = arrowAngle + Math.PI * 0.75;
    const angle2 = arrowAngle - Math.PI * 0.75;

    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX + Math.cos(angle1) * headSize, endY + Math.sin(angle1) * headSize);
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX + Math.cos(angle2) * headSize, endY + Math.sin(angle2) * headSize);
    ctx.stroke();
  }

  ctx.restore();
}

// 绘制路径点之间的连线
function drawWaypointPath(
  ctx: CanvasRenderingContext2D,
  waypoints: Pose[],
  mapData: MapData,
  currentIndex: number
) {
  if (waypoints.length < 2) return;

  ctx.save();
  ctx.strokeStyle = '#1890ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.globalAlpha = 0.6;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const start = worldToMap(waypoints[i].x, waypoints[i].y, mapData);
    const end = worldToMap(waypoints[i + 1].x, waypoints[i + 1].y, mapData);

    // 已完成的路径段用灰色
    if (i < currentIndex) {
      ctx.strokeStyle = '#999999';
    } else {
      ctx.strokeStyle = '#1890ff';
    }

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  ctx.restore();
}

// 绘制目标点（矢量效果优化 - 高清抗锯齿旗帜）
function drawGoal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theta: number,
  mapData: MapData
) {
  ctx.save();

  // 启用最佳抗锯齿设置
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const color = '#ff4d4f';
  const size = Math.max(3, 0.15 / mapData.resolution);

  // 使用半像素偏移以获得更清晰的线条
  const centerX = Math.round(x) + 0.5;
  const centerY = Math.round(y) + 0.5;

  // 绘制外发光效果
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size + 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // 绘制旗帜杆
  const poleHeight = size * 2.5;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX, centerY - poleHeight);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 绘制旗帜（考虑方向）
  const flagWidth = size * 1.4;
  const flagHeight = size * 1.1;

  ctx.save();
  ctx.translate(centerX, centerY - poleHeight + flagHeight / 2);
  ctx.rotate(-theta);

  // 旗帜渐变
  const flagGradient = ctx.createLinearGradient(0, 0, flagWidth, 0);
  flagGradient.addColorStop(0, '#ff4d4f');
  flagGradient.addColorStop(1, '#ff7875');

  ctx.fillStyle = flagGradient;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(0, -flagHeight / 2);
  ctx.lineTo(flagWidth, -flagHeight / 4);
  ctx.lineTo(flagWidth, flagHeight / 4);
  ctx.lineTo(0, flagHeight / 2);
  ctx.closePath();
  ctx.fill();

  // 旗帜边框
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 0;
  ctx.stroke();

  ctx.restore();

  // 绘制底部圆形基座（渐变）
  const baseGradient = ctx.createRadialGradient(
    centerX - size / 3,
    centerY - size / 3,
    0,
    centerX,
    centerY,
    size
  );
  baseGradient.addColorStop(0, '#ff7875');
  baseGradient.addColorStop(1, '#ff4d4f');

  ctx.fillStyle = baseGradient;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
  ctx.fill();

  // 基座边框
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
  ctx.stroke();

  // 绘制方向箭头（在基座上）
  const arrowSize = size * 0.7;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 2;
  ctx.beginPath();
  // 箭头尖端
  ctx.moveTo(
    centerX + Math.cos(theta) * arrowSize,
    centerY - Math.sin(theta) * arrowSize
  );
  // 箭头左边（120度角）
  ctx.lineTo(
    centerX + Math.cos(theta + Math.PI * 2 / 3) * arrowSize * 0.6,
    centerY - Math.sin(theta + Math.PI * 2 / 3) * arrowSize * 0.6
  );
  // 箭头右边（120度角）
  ctx.lineTo(
    centerX + Math.cos(theta - Math.PI * 2 / 3) * arrowSize * 0.6,
    centerY - Math.sin(theta - Math.PI * 2 / 3) * arrowSize * 0.6
  );
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // // 绘制标签
  // const label = '目标';
  // ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
  // ctx.textAlign = 'center';
  // ctx.textBaseline = 'top';
  // const textMetrics = ctx.measureText(label);
  // const textWidth = textMetrics.width;
  // const padding = 8;
  // const labelY = centerY + size + 6;

  // ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  // ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  // ctx.shadowBlur = 4;
  // ctx.beginPath();
  // ctx.roundRect(
  //   centerX - textWidth / 2 - padding / 2,
  //   labelY,
  //   textWidth + padding,
  //   22,
  //   5
  // );
  // ctx.fill();
  // ctx.shadowBlur = 0;

  // ctx.fillStyle = '#ffffff';
  // ctx.fillText(label, centerX, labelY + 4);

  ctx.restore();
}

// 绘制初始位姿（重定位标记）
function drawInitialPose(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theta: number,
  mapData: MapData
) {
  ctx.save();

  // 启用最佳抗锯齿设置
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const color = '#722ed1'; // 紫色
  const size = Math.max(3, 0.15 / mapData.resolution);

  // 使用半像素偏移以获得更清晰的线条
  const centerX = Math.round(x) + 0.5;
  const centerY = Math.round(y) + 0.5;

  // 绘制外发光效果
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size + 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // 绘制十字准星外圈
  const crossRadius = size * 1.3;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(centerX, centerY, crossRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 绘制十字准星线条（四条线）
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const lineLength = size * 0.8;
  const innerGap = size * 0.3;

  // 上
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - innerGap);
  ctx.lineTo(centerX, centerY - crossRadius - lineLength);
  ctx.stroke();

  // 下
  ctx.beginPath();
  ctx.moveTo(centerX, centerY + innerGap);
  ctx.lineTo(centerX, centerY + crossRadius + lineLength);
  ctx.stroke();

  // 左
  ctx.beginPath();
  ctx.moveTo(centerX - innerGap, centerY);
  ctx.lineTo(centerX - crossRadius - lineLength, centerY);
  ctx.stroke();

  // 右
  ctx.beginPath();
  ctx.moveTo(centerX + innerGap, centerY);
  ctx.lineTo(centerX + crossRadius + lineLength, centerY);
  ctx.stroke();

  // 绘制中心圆（渐变）
  const centerGradient = ctx.createRadialGradient(
    centerX - size / 3,
    centerY - size / 3,
    0,
    centerX,
    centerY,
    size
  );
  centerGradient.addColorStop(0, '#d3adf7'); // 浅紫色
  centerGradient.addColorStop(1, color);

  ctx.fillStyle = centerGradient;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
  ctx.fill();

  // 中心圆边框
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
  ctx.stroke();

  // 绘制方向箭头（实心三角形）
  const arrowSize = size * 0.7;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 2;
  ctx.beginPath();
  // 箭头尖端
  ctx.moveTo(
    centerX + Math.cos(theta) * arrowSize,
    centerY - Math.sin(theta) * arrowSize
  );
  // 箭头左侧
  ctx.lineTo(
    centerX + Math.cos(theta + Math.PI * 2 / 3) * arrowSize * 0.6,
    centerY - Math.sin(theta + Math.PI * 2 / 3) * arrowSize * 0.6
  );
  // 箭头右侧
  ctx.lineTo(
    centerX + Math.cos(theta - Math.PI * 2 / 3) * arrowSize * 0.6,
    centerY - Math.sin(theta - Math.PI * 2 / 3) * arrowSize * 0.6
  );
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

// 绘制画笔预览圆圈
function drawBrushPreview(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  brushSize: number
) {
  ctx.save();

  const radius = Math.floor(brushSize / 2);

  // 绘制外圈（渐变）
  const gradient = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius);
  gradient.addColorStop(0, 'rgba(24, 144, 255, 0.3)');
  gradient.addColorStop(0.7, 'rgba(24, 144, 255, 0.2)');
  gradient.addColorStop(1, 'rgba(24, 144, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // 绘制边框
  ctx.strokeStyle = 'rgba(24, 144, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 绘制中心十字
  ctx.strokeStyle = 'rgba(24, 144, 255, 0.6)';
  ctx.lineWidth = 1;
  const crossSize = 5;
  ctx.beginPath();
  ctx.moveTo(x - crossSize, y);
  ctx.lineTo(x + crossSize, y);
  ctx.moveTo(x, y - crossSize);
  ctx.lineTo(x, y + crossSize);
  ctx.stroke();

  ctx.restore();
}

// 颜色加亮辅助函数
function lightenColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
  const B = Math.min(255, (num & 0x0000ff) + amt);
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

// 绘制雷达扫描点
function drawLaserScan(
  ctx: CanvasRenderingContext2D,
  laserScan: LaserScan,
  robotPose: Pose,
  mapData: MapData
) {
  ctx.save();

  // 雷达点颜色：半透明红色
  ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';

  // 遍历所有雷达点
  for (let i = 0; i < laserScan.ranges.length; i++) {
    const range = laserScan.ranges[i];

    // 过滤无效点（NaN、Inf、超出范围）
    if (!isFinite(range) || range < laserScan.range_min || range > laserScan.range_max) {
      continue;
    }

    // 计算当前点的角度（相对于雷达坐标系）
    const angle = laserScan.angle_min + i * laserScan.angle_increment;

    // 将雷达点从雷达坐标系转换到世界坐标系
    // 假设雷达安装在机器人中心，朝向与机器人朝向一致
    const worldX = robotPose.x + range * Math.cos(robotPose.theta + angle);
    const worldY = robotPose.y + range * Math.sin(robotPose.theta + angle);

    // 转换为地图像素坐标
    const mapPos = worldToMap(worldX, worldY, mapData);

    // 绘制雷达点（小圆点）
    ctx.beginPath();
    ctx.arc(mapPos.x, mapPos.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
