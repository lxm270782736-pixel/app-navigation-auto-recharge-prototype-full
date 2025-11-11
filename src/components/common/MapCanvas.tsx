import React, { useRef, useEffect } from 'react';
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

  // 绘制地图
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置画布大小
    canvas.width = mapData.width;
    canvas.height = mapData.height;

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
      ctx.lineWidth = 2;
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
      drawRobot(ctx, robotPos.x, robotPos.y, robotPose.theta, '#52c41a');
    }

    // 绘制目标位置
    if (goalPose) {
      const goalPos = worldToMap(goalPose.x, goalPose.y, mapData);
      drawRobot(ctx, goalPos.x, goalPos.y, goalPose.theta, '#ff4d4f');
    }
  }, [mapData, robotPose, goalPose, path]);

  // 处理点击事件
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onMapClick) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // 转换为世界坐标
    const worldPos = mapToWorld(x, y, mapData);
    onMapClick(worldPos.x, worldPos.y);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className={className}
      style={{ cursor: onMapClick ? 'crosshair' : 'default' }}
    />
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
  color: string
) {
  const size = 15;

  // 绘制圆形
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();

  // 绘制方向箭头
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x + Math.cos(theta) * size,
    y - Math.sin(theta) * size // 注意Y轴方向
  );
  ctx.stroke();
}
