import type { TaskConfig, NavigationActionConfig, Pose } from '@/types';

// HTTP API 基础URL - 使用独立的导航配置服务（端口8081）
const API_BASE_URL = 'http://localhost:8081';
const NAV_CONFIG_ENDPOINT = `${API_BASE_URL}/api/navigation-config`;

// 导航配置接口
export interface NavigationConfig {
  // 导航类型：'single' 为单点导航，'waypoint' 为多点导航
  navigationType: 'single' | 'waypoint';

  // 单点导航配置
  navigationMode?: 'obstacle_avoidance' | 'local_navigation';
  goalPose?: Pose | null;
  tasks?: TaskConfig[];
  actionConfig?: NavigationActionConfig;

  // 多点导航配置
  waypoints?: Array<{
    pose: Pose;
    tasks: TaskConfig[];
    navigationMode: 'obstacle_avoidance' | 'local_navigation';
    actionConfig: NavigationActionConfig;
  }>;
  currentWaypointIndex?: number; // 当前路径点索引（多点导航时使用）

  timestamp: number; // 保存时间戳
}

// 导航配置存储服务
class NavigationStorageService {
  /**
   * 保存导航配置到文件系统（通过HTTP API）
   */
  async saveNavigationConfig(config: NavigationConfig): Promise<void> {
    try {
      console.log('[Navigation Storage] 正在保存导航配置到服务器:', config);

      const response = await fetch(NAV_CONFIG_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('[Navigation Storage] 导航配置已保存到服务器:', result);
    } catch (error) {
      console.error('[Navigation Storage] 保存配置失败:', error);
      throw error;
    }
  }

  /**
   * 从文件系统加载导航配置（通过HTTP API）
   */
  async loadNavigationConfig(): Promise<NavigationConfig | null> {
    try {
      console.log('[Navigation Storage] 正在从服务器加载导航配置...');

      const response = await fetch(NAV_CONFIG_ENDPOINT, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // 如果配置不存在（404），直接返回null
      if (response.status === 404) {
        console.log('[Navigation Storage] 未找到保存的导航配置');
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        const config = result.data as NavigationConfig;
        console.log('[Navigation Storage] 导航配置已从服务器加载:', config);
        return config;
      } else {
        console.log('[Navigation Storage] 服务器返回空配置');
        return null;
      }
    } catch (error) {
      console.error('[Navigation Storage] 加载配置失败:', error);
      return null;
    }
  }

  /**
   * 清除保存的导航配置（通过HTTP API）
   */
  async clearNavigationConfig(): Promise<void> {
    try {
      console.log('[Navigation Storage] 正在删除服务器上的导航配置...');

      const response = await fetch(NAV_CONFIG_ENDPOINT, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        console.log('[Navigation Storage] 导航配置已从服务器删除');
      } else if (response.status === 404) {
        console.log('[Navigation Storage] 配置不存在');
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('[Navigation Storage] 删除配置失败:', error);
    }
  }

  /**
   * 检查是否存在保存的配置
   */
  async hasNavigationConfig(): Promise<boolean> {
    try {
      const response = await fetch(NAV_CONFIG_ENDPOINT, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return response.status === 200;
    } catch (error) {
      console.warn('[Navigation Storage] 检查配置失败:', error);
      return false;
    }
  }
}

export const navigationStorageService = new NavigationStorageService();
