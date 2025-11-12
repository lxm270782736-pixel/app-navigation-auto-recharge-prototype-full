import React, { useRef, useEffect, useState } from 'react';
import type { MapData, Pose, PathPoint } from '@/types';

interface MapCanvasProps {
  mapData: MapData;
  robotPose?: Pose;
  goalPose?: Pose;
  path?: PathPoint[];
  onMapClick?: (x: number, y: number) => void;
  className?: string;
  showRobotTrail?: boolean; // 是否显示机器人轨迹
  showCoordinateSystem?: boolean; // 是否显示坐标系
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 缩放和平移状态
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [minScale, setMinScale] = useState(0.1);

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

  // 计算最小缩放比例，确保地图能完全显示
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !mapData) return;

    const updateMinScale = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      if (containerWidth === 0 || containerHeight === 0) return;

      // 计算缩放比例，确保地图能完全适配容器
      const scaleX = containerWidth / mapData.width;
      const scaleY = containerHeight / mapData.height;
      const fitScale = Math.min(scaleX, scaleY);

      // 设置最小缩放为能完全显示地图的比例，但不小于 0.1
      const calculatedMinScale = Math.max(0.1, fitScale * 0.9); // 留 10% 边距
      setMinScale(calculatedMinScale);

      // 如果当前缩放小于新的最小缩放，调整为适配大小
      if (scale < calculatedMinScale) {
        setScale(fitScale);
        // 居中显示
        setOffset({
          x: (containerWidth - mapData.width * fitScale) / 2,
          y: (containerHeight - mapData.height * fitScale) / 2,
        });
      }
    };

    // 初始计算
    updateMinScale();

    // 监听窗口大小变化
    const resizeObserver = new ResizeObserver(() => {
      updateMinScale();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [mapData]);

  // 绘制地图
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置画布大小
    canvas.width = mapData.width;
    canvas.height = mapData.height;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
      drawRobot(ctx, goalPos.x, goalPos.y, goalPose.theta, '#ff4d4f', '目标', mapData);
    }
  }, [mapData, robotPose, goalPose, path, robotTrail, showRobotTrail, showCoordinateSystem]);

  // 处理鼠标滚轮缩放
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // 计算缩放因子
    const delta = -event.deltaY;
    const scaleFactor = delta > 0 ? 1.1 : 0.9;
    const newScale = Math.max(minScale, Math.min(5, scale * scaleFactor));

    // 计算缩放后的偏移，使缩放中心在鼠标位置
    const scaleRatio = newScale / scale;
    const newOffsetX = mouseX - (mouseX - offset.x) * scaleRatio;
    const newOffsetY = mouseY - (mouseY - offset.y) * scaleRatio;

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  // 处理鼠标按下（开始拖动）
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
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
    }
  };

  // 处理鼠标移动
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      setOffset({
        x: event.clientX - dragStart.x,
        y: event.clientY - dragStart.y,
      });
    }
  };

  // 处理鼠标松开（结束拖动）
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 处理点击事件
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    // 拖动过程中不触发点击
    if (isDragging) return;

    // 只响应左键点击，且不能是ctrl/cmd修饰键
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;

    if (!onMapClick) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // 转换为画布坐标（考虑缩放和偏移）
    const canvasX = (mouseX - offset.x) / scale;
    const canvasY = (mouseY - offset.y) / scale;

    // 转换为世界坐标
    const worldPos = mapToWorld(canvasX, canvasY, mapData);
    onMapClick(worldPos.x, worldPos.y);
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
    <div style={{ position: 'relative' }}>
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
          缩放: {(scale * 100).toFixed(0)}%
        </div>
        <div style={{ marginBottom: '8px' }}>
          <button
            onClick={() => setScale(Math.min(5, scale * 1.2))}
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
            onClick={() => setScale(Math.max(minScale, scale * 0.8))}
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
            imageRendering: 'pixelated',
            cursor: onMapClick ? 'crosshair' : 'default',
          }}
        />
      </div>

      {/* 操作提示 */}
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
        <div>🖱️ 左键点击：设置位置</div>
        {robotPose && (
          <>
            <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '4px' }}>
              <div>🤖 机器人位置:</div>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>
                X: {robotPose.x.toFixed(2)}m, Y: {robotPose.y.toFixed(2)}m
              </div>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>
                方向: {((robotPose.theta * 180) / Math.PI).toFixed(1)}°
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

  // 绘制原点标记
  ctx.fillStyle = '#0000ff';
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 5, 0, Math.PI * 2);
  ctx.fill();

  // 原点标签（显示世界坐标原点）
  ctx.fillStyle = '#0000ff';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('O (0, 0)', origin.x + 10, origin.y - 10);

  // 显示地图原点信息（左上角）
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(5, 5, 250, 80);

  ctx.fillStyle = '#ffffff';
  ctx.font = '12px monospace';
  ctx.fillText(`地图原点: (${mapData.origin.x.toFixed(2)}, ${mapData.origin.y.toFixed(2)})`, 10, 25);
  ctx.fillText(`分辨率: ${mapData.resolution.toFixed(3)} m/px`, 10, 45);
  ctx.fillText(`地图尺寸: ${mapData.width} × ${mapData.height} px`, 10, 65);

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

// 绘制机器人/目标
function drawRobot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theta: number,
  color: string,
  label: string,
  mapData: MapData
) {
  // 计算0.3m对应的像素半径，最小值为5像素
  const robotRadiusMeters = 0.3; // 机器人半径（米）
  const radiusInPixels = robotRadiusMeters / mapData.resolution;
  const size = Math.max(5, radiusInPixels); // 确保最小像素值为5

  // 绘制外发光效果（为机器人添加）
  if (label === '机器人') {
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 绘制圆形
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();

  // 绘制边框
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.stroke();

  // 绘制方向箭头
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x + Math.cos(theta) * size,
    y - Math.sin(theta) * size // 注意Y轴方向
  );
  ctx.stroke();

  // 绘制箭头头部
  const arrowSize = 6;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(
    x + Math.cos(theta) * size,
    y - Math.sin(theta) * size
  );
  ctx.lineTo(
    x + Math.cos(theta) * size + Math.cos(theta + 2.5) * arrowSize,
    y - Math.sin(theta) * size - Math.sin(theta + 2.5) * arrowSize
  );
  ctx.lineTo(
    x + Math.cos(theta) * size + Math.cos(theta - 2.5) * arrowSize,
    y - Math.sin(theta) * size - Math.sin(theta - 2.5) * arrowSize
  );
  ctx.closePath();
  ctx.fill();

  // 绘制标签背景
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const textWidth = ctx.measureText(label).width;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(x - textWidth / 2 - 4, y + size + 3, textWidth + 8, 16);

  // 绘制标签文字
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, x, y + size + 5);
}
