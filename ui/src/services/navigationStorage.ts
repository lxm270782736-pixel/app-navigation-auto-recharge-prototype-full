import type { TaskConfig, NavigationActionConfig, Pose } from '@/types';

// Navigation config persistence — disabled (no longer using separate config server)

export interface NavigationConfig {
  navigationType: 'single' | 'waypoint';
  navigationMode?: 'obstacle_avoidance' | 'local_navigation';
  goalPose?: Pose | null;
  tasks?: TaskConfig[];
  actionConfig?: NavigationActionConfig;
  waypoints?: Array<{
    pose: Pose;
    tasks: TaskConfig[];
    navigationMode: 'obstacle_avoidance' | 'local_navigation';
    actionConfig: NavigationActionConfig;
  }>;
  currentWaypointIndex?: number;
  timestamp: number;
}

class NavigationStorageService {
  async saveNavigationConfig(_config: NavigationConfig): Promise<void> {
    // No-op
  }

  async loadNavigationConfig(): Promise<NavigationConfig | null> {
    return null;
  }

  async clearNavigationConfig(): Promise<void> {
    // No-op
  }

  async hasNavigationConfig(): Promise<boolean> {
    return false;
  }
}

export const navigationStorageService = new NavigationStorageService();
