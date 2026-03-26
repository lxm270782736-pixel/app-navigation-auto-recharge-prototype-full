/**
 * 系统设置服务
 * 管理机器人配置、碰撞形状等系统级设置
 */

import { RobotShapeType, RobotShapeConfig } from '@/types';

const STORAGE_KEY = 'astribot_settings';

// 默认机器人碰撞形状配置（圆形，半径0.3m）
const DEFAULT_ROBOT_SHAPE: RobotShapeConfig = {
  type: RobotShapeType.CIRCLE,
  radius: 0.3
};

// 系统设置接口
export interface SystemSettings {
  robotShape: RobotShapeConfig;
  // 可扩展其他系统设置
}

// 默认设置
const DEFAULT_SETTINGS: SystemSettings = {
  robotShape: DEFAULT_ROBOT_SHAPE
};

class SettingsService {
  private settings: SystemSettings;

  constructor() {
    this.settings = this.loadSettings();
  }

  /**
   * 从 localStorage 加载设置
   */
  private loadSettings(): SystemSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.warn('[SettingsService] 加载设置失败，使用默认设置:', error);
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * 保存设置到 localStorage
   */
  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('[SettingsService] 保存设置失败:', error);
    }
  }

  /**
   * 获取机器人碰撞形状配置
   */
  getRobotShape(): RobotShapeConfig {
    return { ...this.settings.robotShape };
  }

  /**
   * 设置机器人碰撞形状配置
   */
  setRobotShape(shape: RobotShapeConfig): void {
    this.settings.robotShape = { ...shape };
    this.saveSettings();
    console.log('[SettingsService] 机器人碰撞形状已更新:', shape);
  }

  /**
   * 获取所有设置
   */
  getAllSettings(): SystemSettings {
    return { ...this.settings };
  }

  /**
   * 重置为默认设置
   */
  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
    console.log('[SettingsService] 设置已重置为默认值');
  }

  /**
   * 检查点是否在机器人碰撞形状内
   * @param robotPose 机器人位姿 (x, y, theta)
   * @param point 要检查的点 (x, y)
   * @returns 点是否在碰撞形状内
   */
  isPointInRobotShape(
    robotPose: { x: number; y: number; theta: number },
    point: { x: number; y: number }
  ): boolean {
    const shape = this.settings.robotShape;

    if (shape.type === RobotShapeType.CIRCLE) {
      // 圆形：计算点到机器人中心的距离
      const radius = shape.radius || 0.3;
      const dx = point.x - robotPose.x;
      const dy = point.y - robotPose.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance <= radius;
    } else if (shape.type === RobotShapeType.POLYGON && shape.vertices) {
      // 多边形：将顶点根据机器人朝向旋转，然后检查点是否在多边形内
      const cos = Math.cos(robotPose.theta);
      const sin = Math.sin(robotPose.theta);

      // 将多边形顶点转换到世界坐标系
      const worldVertices = shape.vertices.map(v => ({
        x: robotPose.x + v.x * cos - v.y * sin,
        y: robotPose.y + v.x * sin + v.y * cos
      }));

      return this.isPointInPolygon(point, worldVertices);
    }

    return false;
  }

  /**
   * 获取机器人碰撞形状的世界坐标顶点
   * @param robotPose 机器人位姿
   * @returns 顶点数组（圆形返回近似多边形）
   */
  getRobotShapeVertices(
    robotPose: { x: number; y: number; theta: number }
  ): { x: number; y: number }[] {
    const shape = this.settings.robotShape;

    if (shape.type === RobotShapeType.CIRCLE) {
      // 圆形：生成近似多边形（16个顶点）
      const radius = shape.radius || 0.3;
      const vertices: { x: number; y: number }[] = [];
      const segments = 16;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        vertices.push({
          x: robotPose.x + radius * Math.cos(angle),
          y: robotPose.y + radius * Math.sin(angle)
        });
      }
      return vertices;
    } else if (shape.type === RobotShapeType.POLYGON && shape.vertices) {
      // 多边形：旋转顶点到世界坐标系
      const cos = Math.cos(robotPose.theta);
      const sin = Math.sin(robotPose.theta);
      return shape.vertices.map(v => ({
        x: robotPose.x + v.x * cos - v.y * sin,
        y: robotPose.y + v.x * sin + v.y * cos
      }));
    }

    return [];
  }

  /**
   * 射线法判断点是否在多边形内
   */
  private isPointInPolygon(
    point: { x: number; y: number },
    polygon: { x: number; y: number }[]
  ): boolean {
    if (polygon.length < 3) return false;

    let inside = false;
    const { x, y } = point;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }
}

// 导出单例
export const settingsService = new SettingsService();
