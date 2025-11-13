import type { MapData } from '@/types';

const MAP_STORAGE_KEY = 'astribot_maps';
const MAP_DATA_KEY_PREFIX = 'astribot_map_data_'; // 单独存储地图数据
const THUMBNAIL_MAX_SIZE = 200; // 缩略图最大尺寸
const THUMBNAIL_QUALITY = 0.6; // 缩略图质量 (0.0 - 1.0)

// HTTP API 基础 URL
const API_BASE_URL = 'http://localhost:8080/api';

// 地图元数据（不包含大量的地图数据）
interface MapMetadata {
  id: string;
  name: string;
  createdAt: string;
  thumbnail: string;
  width: number;
  height: number;
  resolution: number;
  origin: {
    x: number;
    y: number;
    orientation: number;
  };
}

// 地图存储服务
class MapStorageService {
  private useServerStorage = true; // 是否使用服务器存储

  // 获取所有地图（仅元数据）
  async getAllMaps(): Promise<MapData[]> {
    // 优先尝试从服务器获取
    if (this.useServerStorage) {
      try {
        const response = await fetch(`${API_BASE_URL}/maps`);
        if (response.ok) {
          const maps = await response.json();
          console.log('从服务器加载地图:', maps.length);
          return maps;
        }
      } catch (error) {
        console.warn('从服务器加载地图失败，使用本地存储:', error);
        this.useServerStorage = false;
      }
    }

    // 降级到本地存储
    return this.getAllMapsFromLocalStorage();
  }

  // 从本地存储获取所有地图
  private getAllMapsFromLocalStorage(): MapData[] {
    const stored = localStorage.getItem(MAP_STORAGE_KEY);
    if (!stored) return [];

    try {
      const metadataList: MapMetadata[] = JSON.parse(stored);
      // 加载每个地图的完整数据
      return metadataList.map((metadata) => {
        const data = this.getMapDataFromLocalStorage(metadata.id);
        return {
          ...metadata,
          data: data || [],
        };
      });
    } catch (error) {
      console.error('Failed to parse maps from storage:', error);
      return [];
    }
  }

  // 获取所有地图元数据（不加载地图数据）
  getAllMapMetadata(): MapMetadata[] {
    const stored = localStorage.getItem(MAP_STORAGE_KEY);
    if (!stored) return [];

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to parse maps metadata from storage:', error);
      return [];
    }
  }

  // 获取单个地图的数据
  private getMapDataFromLocalStorage(mapId: string): number[] | null {
    const dataKey = MAP_DATA_KEY_PREFIX + mapId;
    const stored = localStorage.getItem(dataKey);
    if (!stored) return null;

    try {
      // 解压缩地图数据
      return this.decompressMapData(stored);
    } catch (error) {
      console.error('Failed to load map data:', error);
      return null;
    }
  }

  // 压缩地图数据 - 使用 Run-Length Encoding (RLE)
  private compressMapData(data: number[]): string {
    if (data.length === 0) return '';

    const compressed: number[] = [];
    let currentValue = data[0];
    let count = 1;

    for (let i = 1; i < data.length; i++) {
      if (data[i] === currentValue && count < 65535) {
        count++;
      } else {
        // 存储格式: [value_low, value_high, count_low, count_high]
        // 使用16位存储value和count
        const valueInt16 = currentValue & 0xFFFF;
        compressed.push(valueInt16 & 0xFF, (valueInt16 >> 8) & 0xFF);
        compressed.push(count & 0xFF, (count >> 8) & 0xFF);
        currentValue = data[i];
        count = 1;
      }
    }
    // 添加最后一组
    const valueInt16 = currentValue & 0xFFFF;
    compressed.push(valueInt16 & 0xFF, (valueInt16 >> 8) & 0xFF);
    compressed.push(count & 0xFF, (count >> 8) & 0xFF);

    // 转换为base64
    const uint8Array = new Uint8Array(compressed);
    let binaryString = '';
    const chunkSize = 8192; // 分块处理避免栈溢出
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binaryString);
  }

  // 解压缩地图数据
  private decompressMapData(compressed: string): number[] {
    if (!compressed) return [];

    try {
      // 从base64解码
      const binaryString = atob(compressed);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 解压缩
      const decompressed: number[] = [];
      for (let i = 0; i < bytes.length; i += 4) {
        // 读取16位value
        const valueLow = bytes[i];
        const valueHigh = bytes[i + 1];
        let value = valueLow | (valueHigh << 8);

        // 处理负数（如果最高位是1，说明是负数）
        if (value & 0x8000) {
          value = value | 0xFFFF0000; // 符号扩展
        }

        // 读取16位count
        const countLow = bytes[i + 2];
        const countHigh = bytes[i + 3];
        const count = countLow | (countHigh << 8);

        // 解压缩
        for (let j = 0; j < count; j++) {
          decompressed.push(value);
        }
      }

      return decompressed;
    } catch (error) {
      console.error('Decompression failed:', error);
      return [];
    }
  }

  // 保存地图
  async saveMap(map: MapData): Promise<void> {
    // 优先尝试保存到服务器
    if (this.useServerStorage) {
      try {
        const response = await fetch(`${API_BASE_URL}/maps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(map),
        });

        if (response.ok) {
          const result = await response.json();
          console.log('地图已保存到服务器:', result.message);
          return;
        }
      } catch (error) {
        console.warn('保存到服务器失败，使用本地存储:', error);
        this.useServerStorage = false;
      }
    }

    // 降级到本地存储
    this.saveMapToLocalStorage(map);
  }

  // 保存到本地存储
  private saveMapToLocalStorage(map: MapData): void {
    try {
      // 分离元数据和地图数据
      const metadata: MapMetadata = {
        id: map.id,
        name: map.name,
        createdAt: map.createdAt,
        thumbnail: map.thumbnail,
        width: map.width,
        height: map.height,
        resolution: map.resolution,
        origin: map.origin,
      };

      // 获取所有元数据
      const metadataList = this.getAllMapMetadata();
      const existingIndex = metadataList.findIndex((m) => m.id === map.id);

      if (existingIndex >= 0) {
        metadataList[existingIndex] = metadata;
      } else {
        metadataList.push(metadata);
      }

      // 压缩并保存地图数据
      const dataKey = MAP_DATA_KEY_PREFIX + map.id;
      const compressedData = this.compressMapData(map.data);
      localStorage.setItem(dataKey, compressedData);

      // 保存元数据列表
      localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(metadataList));

      console.log(`地图 ${map.name} 保存成功（本地存储）`);
      console.log(`原始数据大小: ${map.data.length * 4} bytes`);
      console.log(`压缩后大小: ${compressedData.length} bytes`);
      console.log(`压缩率: ${((1 - compressedData.length / (map.data.length * 4)) * 100).toFixed(2)}%`);
    } catch (error) {
      console.error('保存地图失败:', error);
      throw error;
    }
  }

  // 删除地图
  async deleteMap(mapId: string): Promise<void> {
    // 优先尝试从服务器删除
    if (this.useServerStorage) {
      try {
        const response = await fetch(`${API_BASE_URL}/maps/${mapId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          console.log('地图已从服务器删除:', mapId);
          return;
        }
      } catch (error) {
        console.warn('从服务器删除失败，使用本地存储:', error);
        this.useServerStorage = false;
      }
    }

    // 降级到本地存储
    this.deleteMapFromLocalStorage(mapId);
  }

  // 从本地存储删除
  private deleteMapFromLocalStorage(mapId: string): void {
    // 删除地图数据
    const dataKey = MAP_DATA_KEY_PREFIX + mapId;
    localStorage.removeItem(dataKey);

    // 删除元数据
    const metadataList = this.getAllMapMetadata();
    const filtered = metadataList.filter((m) => m.id !== mapId);
    localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(filtered));
  }

  // 获取单个地图
  async getMap(mapId: string): Promise<MapData | null> {
    // 优先尝试从服务器获取
    if (this.useServerStorage) {
      try {
        const response = await fetch(`${API_BASE_URL}/maps/${mapId}`);
        if (response.ok) {
          const map = await response.json();
          console.log('从服务器加载地图:', mapId);
          return map;
        }
      } catch (error) {
        console.warn('从服务器加载地图失败，使用本地存储:', error);
        this.useServerStorage = false;
      }
    }

    // 降级到本地存储
    return this.getMapFromLocalStorage(mapId);
  }

  // 从本地存储获取单个地图
  private getMapFromLocalStorage(mapId: string): MapData | null {
    const metadataList = this.getAllMapMetadata();
    const metadata = metadataList.find((m) => m.id === mapId);
    if (!metadata) return null;

    const data = this.getMapDataFromLocalStorage(mapId);
    if (!data) return null;

    return {
      ...metadata,
      data,
    };
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
    // 使用 JPEG 格式和压缩质量以减少文件大小
    return canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
  }

  // 生成默认地图名称
  async generateDefaultMapName(): Promise<string> {
    const maps = await this.getAllMaps();
    const unnamedMaps = maps.filter((m: MapData) => m.name.startsWith('未命名地图'));
    const numbers = unnamedMaps
      .map((m: MapData) => {
        const match = m.name.match(/未命名地图(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n: number) => !isNaN(n));

    const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
    return `未命名地图${maxNumber + 1}`;
  }
}

export const mapStorageService = new MapStorageService();
