import type { MapData } from '@/types';

const MAP_STORAGE_KEY = 'astribot_maps';
const THUMBNAIL_MAX_SIZE = 200; // 缩略图最大尺寸

// 地图存储服务
class MapStorageService {
  // 获取所有地图
  getAllMaps(): MapData[] {
    const stored = localStorage.getItem(MAP_STORAGE_KEY);
    if (!stored) return [];

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to parse maps from storage:', error);
      return [];
    }
  }

  // 保存地图
  saveMap(map: MapData): void {
    const maps = this.getAllMaps();
    const existingIndex = maps.findIndex((m) => m.id === map.id);

    if (existingIndex >= 0) {
      maps[existingIndex] = map;
    } else {
      maps.push(map);
    }

    localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(maps));
  }

  // 删除地图
  deleteMap(mapId: string): void {
    const maps = this.getAllMaps();
    const filtered = maps.filter((m) => m.id !== mapId);
    localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(filtered));
  }

  // 获取单个地图
  getMap(mapId: string): MapData | null {
    const maps = this.getAllMaps();
    return maps.find((m) => m.id === mapId) || null;
  }

  // 生成地图缩略图
  generateThumbnail(
    mapData: number[],
    width: number,
    height: number
  ): string {
    const canvas = document.createElement('canvas');
    const scale = Math.min(THUMBNAIL_MAX_SIZE / width, THUMBNAIL_MAX_SIZE / height);

    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const imageData = ctx.createImageData(canvas.width, canvas.height);

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const srcX = Math.floor(x / scale);
        const srcY = Math.floor(y / scale);
        const srcIndex = srcY * width + srcX;
        const value = mapData[srcIndex];

        const dstIndex = (y * canvas.width + x) * 4;

        if (value === -1) {
          // 未知区域 - 灰色
          imageData.data[dstIndex] = 128;
          imageData.data[dstIndex + 1] = 128;
          imageData.data[dstIndex + 2] = 128;
        } else if (value === 0) {
          // 空闲区域 - 白色
          imageData.data[dstIndex] = 255;
          imageData.data[dstIndex + 1] = 255;
          imageData.data[dstIndex + 2] = 255;
        } else {
          // 占据区域 - 黑色
          imageData.data[dstIndex] = 0;
          imageData.data[dstIndex + 1] = 0;
          imageData.data[dstIndex + 2] = 0;
        }
        imageData.data[dstIndex + 3] = 255; // Alpha
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  // 生成默认地图名称
  generateDefaultMapName(): string {
    const maps = this.getAllMaps();
    const unnamedMaps = maps.filter((m) => m.name.startsWith('未命名地图'));
    const numbers = unnamedMaps
      .map((m) => {
        const match = m.name.match(/未命名地图(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));

    const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
    return `未命名地图${maxNumber + 1}`;
  }
}

export const mapStorageService = new MapStorageService();
