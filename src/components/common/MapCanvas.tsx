import React, { useRef, useEffect, useState } from 'react';
import type { MapData, Pose, PathPoint } from '@/types';

interface MapCanvasProps {
  mapData: MapData;
  robotPose?: Pose;
  goalPose?: Pose;
  path?: PathPoint[];
  onMapClick?: (x: number, y: number) => void;
  className?: string;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  mapData,
  robotPose,
  goalPose,
  path,
  onMapClick,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 缩放和平移状态
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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

    // 绘制机器人位置
    if (robotPose) {
      const robotPos = worldToMap(robotPose.x, robotPose.y, mapData);
      drawRobot(ctx, robotPos.x, robotPos.y, robotPose.theta, '#52c41a', '机器人');
    }

    // 绘制目标位置
    if (goalPose) {
      const goalPos = worldToMap(goalPose.x, goalPose.y, mapData);
      drawRobot(ctx, goalPos.x, goalPos.y, goalPose.theta, '#ff4d4f', '目标');
    }
  }, [mapData, robotPose, goalPose, path]);

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
    const newScale = Math.max(0.5, Math.min(5, scale * scaleFactor));

    // 计算缩放后的偏移，使缩放中心在鼠标位置
    const scaleRatio = newScale / scale;
    const newOffsetX = mouseX - (mouseX - offset.x) * scaleRatio;
    const newOffsetY = mouseY - (mouseY - offset.y) * scaleRatio;

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  // 处理鼠标按下（开始拖动）
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    // 右键或中键拖动
    if (event.button === 1 || event.button === 2 || event.ctrlKey || event.metaKey) {
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

    // 右键或ctrl+点击不触发
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

  // 重置视图
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* 工具栏 */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
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
          onClick={() => setScale(Math.max(0.5, scale * 0.8))}
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
          重置
        </button>
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
          cursor: isDragging ? 'grabbing' : onMapClick ? 'crosshair' : 'grab',
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
    y: mapData.height - mapY,
  };
}

// 地图像素坐标转世界坐标
function mapToWorld(
  x: number,
  y: number,
  mapData: MapData
): { x: number; y: number } {
  // 翻转Y轴
  const mapY = mapData.height - y;

  return {
    x: x * mapData.resolution + mapData.origin.x,
    y: mapY * mapData.resolution + mapData.origin.y,
  };
}

// 绘制机器人/目标
function drawRobot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theta: number,
  color: string,
  label: string
) {
  const size = 20;

  // 绘制圆形
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();

  // 绘制边框
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.stroke();

  // 绘制方向箭头
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x + Math.cos(theta) * size,
    y - Math.sin(theta) * size // 注意Y轴方向
  );
  ctx.stroke();

  // 绘制标签
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x, y + size + 5);
}
