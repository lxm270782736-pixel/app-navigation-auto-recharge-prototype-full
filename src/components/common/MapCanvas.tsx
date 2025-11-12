import React, { useRef, useEffect, useState } from 'react';
import type { MapData, Pose, PathPoint } from '@/types';

interface MapCanvasProps {
  mapData: MapData;
  robotPose?: Pose;
  goalPose?: Pose;
  path?: PathPoint[];
  onMapClick?: (x: number, y: number, theta?: number) => void;
  className?: string;
  showRobotTrail?: boolean; // 是否显示机器人轨迹
  showCoordinateSystem?: boolean; // 是否显示坐标系
  showOperationHints?: boolean; // 是否显示操作提示
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  mapData,
  robotPose,
  goalPose,
  path,
  onMapClick,
  className,
  showRobotTrail = true,
  showCoordinateSystem = true,
  showOperationHints = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // 机器人轨迹
  const [robotTrail, setRobotTrail] = useState<Array<{ x: number; y: number }>>([]);

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

    // 缩放画布以匹配设备像素比
    ctx.scale(dpr, dpr);

    // 启用图像平滑和高质量渲染
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 清空画布
    ctx.clearRect(0, 0, mapData.width, mapData.height);

    // 绘制地图数据
    const imageData = ctx.createImageData(mapData.width, mapData.height);

    for (let i = 0; i < mapData.data.length; i++) {
      const value = mapData.data[i];
      const index = i * 4;

      if (value === -1) {
        // 未知区域 - 灰色
        imageData.data[index] = 128;
        imageData.data[index + 1] = 128;
        imageData.data[index + 2] = 128;
      } else if (value === 0) {
        // 空闲区域 - 白色
        imageData.data[index] = 255;
        imageData.data[index + 1] = 255;
        imageData.data[index + 2] = 255;
      } else {
        // 占据区域 - 黑色
        imageData.data[index] = 0;
        imageData.data[index + 1] = 0;
        imageData.data[index + 2] = 0;
      }
      imageData.data[index + 3] = 255; // Alpha
    }

    ctx.putImageData(imageData, 0, 0);

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

    // 绘制机器人位置
    if (robotPose) {
      const robotPos = worldToMap(robotPose.x, robotPose.y, mapData);
      console.log('[MapCanvas] 机器人位置:', {
        world: { x: robotPose.x, y: robotPose.y, theta: robotPose.theta },
        map: { x: robotPos.x, y: robotPos.y },
        mapSize: { width: mapData.width, height: mapData.height }
      });
      drawRobot(ctx, robotPos.x, robotPos.y, robotPose.theta, '#52c41a', '机器人', mapData);
    }

    // 绘制目标位置
    if (goalPose) {
      const goalPos = worldToMap(goalPose.x, goalPose.y, mapData);
      drawGoal(ctx, goalPos.x, goalPos.y, goalPose.theta, mapData);
    }

    // 绘制方向设置指示线
    if (isSettingDirection && directionStart && directionEnd) {
      drawDirectionLine(ctx, directionStart.x, directionStart.y, directionEnd.x, directionEnd.y);
    }
  }, [mapData, robotPose, goalPose, path, robotTrail, showRobotTrail, showCoordinateSystem, isSettingDirection, directionStart, directionEnd]);

  // 处理鼠标滚轮缩放
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // 计算缩放因子（更平滑的缩放）
    const delta = -event.deltaY;
    const scaleFactor = delta > 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.max(minScale, Math.min(maxScale, scale * scaleFactor));

    // 计算缩放后的偏移，使缩放中心在鼠标位置
    const scaleRatio = newScale / scale;
    const newOffsetX = mouseX - (mouseX - offset.x) * scaleRatio;
    const newOffsetY = mouseY - (mouseY - offset.y) * scaleRatio;

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  // 处理鼠标按下（开始拖动或设置方向）
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // 转换为画布坐标
    const canvasX = (mouseX - offset.x) / scale;
    const canvasY = (mouseY - offset.y) / scale;

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

    // 左键开始设置方向
    if (event.button === 0 && onMapClick) {
      setIsSettingDirection(true);
      setDirectionStart({ x: canvasX, y: canvasY });
      setDirectionEnd({ x: canvasX, y: canvasY });
    }
  };

  // 处理鼠标移动
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    if (isDragging) {
      setOffset({
        x: event.clientX - dragStart.x,
        y: event.clientY - dragStart.y,
      });
    } else if (isSettingDirection && directionStart) {
      // 更新方向终点
      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const canvasX = (mouseX - offset.x) / scale;
      const canvasY = (mouseY - offset.y) / scale;

      setDirectionEnd({ x: canvasX, y: canvasY });
    }
  };

  // 处理鼠标松开（结束拖动或完成方向设置）
  const handleMouseUp = () => {
    if (isSettingDirection && directionStart && directionEnd && onMapClick) {
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
  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
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
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
            cursor: onMapClick ? 'crosshair' : 'default',
          }}
        />
      </div>

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
          <div>🖱️ Ctrl+拖动 或 中键拖动：平移</div>
          <div>🖱️ 左键点击并拖动：设置位置和方向</div>
          {robotPose && (
            <>
              <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '4px' }}>
                <div>🤖 机器人位置:</div>
                <div style={{ fontSize: '11px', opacity: 0.9 }}>
                  X: {robotPose.x.toFixed(2)}m, Y: {robotPose.y.toFixed(2)}m, theta: {((robotPose.theta * 180) / Math.PI).toFixed(1)}°
                </div>

              </div>
              {showRobotTrail && robotTrail.length > 0 && (
                <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
                  轨迹点数: {robotTrail.length}
                </div>
              )}
            </>
          )}
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

  // 翻转Y轴（地图坐标系和图像坐标系Y轴相反）
  return {
    x: mapX,
    y: mapY,
  };
}

// 地图像素坐标转世界坐标
function mapToWorld(
  x: number,
  y: number,
  mapData: MapData
): { x: number; y: number } {
  // 翻转Y轴
  const mapY =  y;

  return {
    x: x * mapData.resolution + mapData.origin.x,
    y: mapY * mapData.resolution + mapData.origin.y,
  };
}

// 绘制坐标系
function drawCoordinateSystem(ctx: CanvasRenderingContext2D, mapData: MapData) {
  // 获取原点在地图像素坐标系中的位置
  const origin = worldToMap(0, 0, mapData);

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

  // // 绘制原点标记
  // ctx.fillStyle = '#0000ff';
  // ctx.beginPath();
  // ctx.arc(origin.x, origin.y, 5, 0, Math.PI * 2);
  // ctx.fill();

  // // 原点标签（显示世界坐标原点）
  // ctx.fillStyle = '#0000ff';
  // ctx.font = 'bold 14px Arial';
  // ctx.fillText('O (0, 0)', origin.x + 10, origin.y - 10);

  // // 显示地图原点信息（左上角）
  // ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  // ctx.fillRect(5, 5, 250, 80);

  // ctx.fillStyle = '#ffffff';
  // ctx.font = '12px monospace';
  // ctx.fillText(`地图原点: (${mapData.origin.x.toFixed(2)}, ${mapData.origin.y.toFixed(2)})`, 10, 25);
  // ctx.fillText(`分辨率: ${mapData.resolution.toFixed(3)} m/px`, 10, 45);
  // ctx.fillText(`地图尺寸: ${mapData.width} × ${mapData.height} px`, 10, 65);

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
  label: string,
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

// 颜色加亮辅助函数
function lightenColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
  const B = Math.min(255, (num & 0x0000ff) + amt);
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}
