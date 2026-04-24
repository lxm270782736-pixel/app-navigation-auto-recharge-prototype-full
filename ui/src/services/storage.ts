import type { MapData } from '@/types';
import { getBaseUrl } from '@/config';

const MAP_STORAGE_KEY = 'astribot_maps';
const MAP_DATA_KEY_PREFIX = 'astribot_map_data_'; // 单独存储地图数据
const THUMBNAIL_MAX_SIZE = 200; // 缩略图最大尺寸
const THUMBNAIL_QUALITY = 0.6; // 缩略图质量 (0.0 - 1.0)

const API_BASE_URL = `${getBaseUrl()}/api`;

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

  // 从本地缓存加载所有地图（包含完整数据）- 用于地图管理界面
  getAllMapsFromLocalCache(): MapData[] {
    const metadataList = this.getAllMapMetadata();
    console.log(`[本地缓存] 找到 ${metadataList.length} 个地图`);

    return metadataList.map((metadata) => {
      const data = this.getMapDataFromLocalStorage(metadata.id);
      return {
        ...metadata,
        data: data || [], // 如果数据丢失，使用空数组
      };
    });
  }

  // 保存地图到本地缓存（直接保存，不经过服务器）
  saveMapToLocalCache(map: MapData): void {
    this.saveMapToLocalStorage(map);
    console.log(`[本地缓存] 地图 ${map.name} 已保存`);
  }

  // 从本地缓存删除地图
  deleteMapFromLocalCache(mapId: string): void {
    this.deleteMapFromLocalStorage(mapId);
    console.log(`[本地缓存] 地图 ${mapId} 已删除`);
  }

  // 清空本地缓存（用于强制刷新）
  clearLocalCache(): void {
    const metadataList = this.getAllMapMetadata();
    metadataList.forEach((metadata) => {
      const dataKey = MAP_DATA_KEY_PREFIX + metadata.id;
      localStorage.removeItem(dataKey);
    });
    localStorage.removeItem(MAP_STORAGE_KEY);
    console.log('[本地缓存] 已清空所有地图缓存');
  }

  // 检查本地缓存是否为空
  isLocalCacheEmpty(): boolean {
    const metadataList = this.getAllMapMetadata();
    return metadataList.length === 0;
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

  // 规范化地图名称（移除特殊字符，只保留字母、数字、下划线、连字符）
  sanitizeMapName(name: string): string {
    if (!name || typeof name !== 'string') {
      return 'untitled_map';
    }

    // 移除所有非字母、数字、下划线、连字符的字符
    let sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');

    // 移除开头和结尾的下划线和连字符
    sanitized = sanitized.replace(/^[_-]+|[_-]+$/g, '');

    // 如果清理后为空，使用默认名称
    if (!sanitized) {
      sanitized = 'untitled_map';
    }

    // 限制长度为最多64个字符
    if (sanitized.length > 64) {
      sanitized = sanitized.substring(0, 64);
    }

    return sanitized;
  }

  // 生成默认地图名称
  async generateDefaultMapName(): Promise<string> {
    try {
      // 获取本地缓存的地图
      const localMaps = this.getAllMapsFromLocalCache();

      // 尝试从后端获取地图列表
      let backendMaps: MapData[] = [];
      try {
        const { apiService } = await import('./api');
        backendMaps = await apiService.getAllMapMetadata();
      } catch (error) {
        console.warn('无法从后端获取地图列表，仅使用本地缓存:', error);
      }

      // 合并本地和后端的地图列表
      const allMapNames = new Set<string>([
        ...localMaps.map(m => m.name),
        ...backendMaps.map(m => m.name),
      ]);

      // 找出所有 untitled_map_ 开头的地图名称
      const unnamedMapNumbers: number[] = [];
      allMapNames.forEach(name => {
        if (name.startsWith('untitled_map_')) {
          const match = name.match(/untitled_map_(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num)) {
              unnamedMapNumbers.push(num);
            }
          }
        }
      });

      // 找到最大的数字，然后+1
      const maxNumber = unnamedMapNumbers.length > 0 ? Math.max(...unnamedMapNumbers) : 0;
      return `untitled_map_${maxNumber + 1}`;
    } catch (error) {
      console.error('生成默认地图名称失败:', error);
      // 失败时使用时间戳作为后备方案
      return `untitled_map_${Date.now()}`;
    }
  }
}

export const mapStorageService = new MapStorageService();
