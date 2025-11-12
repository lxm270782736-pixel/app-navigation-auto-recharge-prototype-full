import ROSLIB from 'roslib';
import type { MapData, Pose, NavigationGoal } from '@/types';

class ROSService {
  private ros: ROSLIB.Ros | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  // 连接到ROS Bridge
  connect(url: string = 'ws://localhost:9090'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ros = new ROSLIB.Ros({ url });

      this.ros.on('connection', () => {
        console.log('Connected to ROS Bridge');
        this.clearReconnectTimer();
        this.emit('connection', { connected: true });
        resolve();
      });

      this.ros.on('error', (error: Error) => {
        console.error('ROS connection error:', error);
        this.emit('error', error);
        reject(error);
      });

      this.ros.on('close', () => {
        console.log('Connection to ROS Bridge closed');
        this.emit('connection', { connected: false });
        this.attemptReconnect(url);
      });
    });
  }

  // 断开连接
  disconnect() {
    this.clearReconnectTimer();
    if (this.ros) {
      this.ros.close();
      this.ros = null;
    }
  }

  // 自动重连
  private attemptReconnect(url: string) {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect(url).catch(() => {
        // 继续尝试重连
      });
    }, 3000);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // 订阅话题
  subscribeTopic<T>(
    topicName: string,
    messageType: string,
    callback: (message: T) => void
  ): () => void {
    if (!this.ros) {
      throw new Error('Not connected to ROS');
    }

    const topic = new ROSLIB.Topic({
      ros: this.ros,
      name: topicName,
      messageType,
    });

    topic.subscribe(callback);

    // 返回取消订阅函数
    return () => {
      topic.unsubscribe();
    };
  }

  // 发布消息
  publishMessage<T>(topicName: string, messageType: string, message: T) {
    if (!this.ros) {
      throw new Error('Not connected to ROS');
    }

    const topic = new ROSLIB.Topic({
      ros: this.ros,
      name: topicName,
      messageType,
    });

    topic.publish(message as any);
  }

  // 调用服务
  async callService<TRequest, TResponse>(
    serviceName: string,
    serviceType: string,
    request: TRequest
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ros) {
        reject(new Error('Not connected to ROS'));
        return;
      }

      const service = new ROSLIB.Service({
        ros: this.ros,
        name: serviceName,
        serviceType,
      });

      service.callService(
        request as any,
        (response: any) => {
          resolve(response as TResponse);
        },
        (error: Error) => {
          reject(error);
        }
      );
    });
  }

  // 发送导航目标
  async sendNavigationGoal(goal: NavigationGoal): Promise<void> {
    if (!this.ros) {
      throw new Error('Not connected to ROS');
    }

    const actionClient = new ROSLIB.ActionClient({
      ros: this.ros,
      serverName: '/move_chassis_to_server',
      actionName: 'astribot_msgs/MoveChassisToAction',
    });

    const goalMessage = new ROSLIB.Goal({
      actionClient,
      goalMessage: {
        target_pose: {
          header: {
            frame_id: 'map',
          },
          pose: {
            position: {
              x: goal.pose.x,
              y: goal.pose.y,
              z: 0,
            },
            orientation: {
              x: 0,
              y: 0,
              z: Math.sin(goal.pose.theta / 2),
              w: Math.cos(goal.pose.theta / 2),
            },
          },
        },
        use_default_config: true,
      },
    });

    return new Promise((resolve, _reject) => {
      goalMessage.on('result', (result: any) => {
        console.log('Navigation result received:', result);
        // 发送导航结果事件
        this.emit('navigation-result', {
          success: result.status?.status === 3, // SUCCEEDED = 3 in actionlib
          result,
        });
        resolve();
      });

      goalMessage.on('feedback', (feedback: any) => {
        console.log('Navigation feedback:', feedback);
        this.emit('navigation-feedback', feedback);
      });

      goalMessage.on('status', (status: any) => {
        console.log('Navigation status:', status);
      });

      goalMessage.send();
    });
  }

  // 取消导航
  cancelNavigation() {
    if (!this.ros) return;

    const actionClient = new ROSLIB.ActionClient({
      ros: this.ros,
      serverName: '/move_chassis_to_server',
      actionName: 'astribot_msgs/MoveChassisToAction',
    });

    actionClient.cancel();
  }

  // 开始建图
  async startMapping(): Promise<void> {
    return this.callService('/start_mapping', 'std_srvs/Trigger', {});
  }

  // 结束建图
  async stopMapping(): Promise<void> {
    return this.callService('/stop_mapping', 'std_srvs/Trigger', {});
  }

  // 保存地图
  async saveMap(mapName: string): Promise<void> {
    return this.callService('/save_map', 'nav_msgs/SaveMap', {
      map_name: mapName,
    });
  }

  // 加载地图
  async loadMap(mapName: string): Promise<MapData> {
    const response = await this.callService<{ map_name: string }, any>(
      '/load_map',
      'nav_msgs/LoadMap',
      { map_name: mapName }
    );

    return this.convertROSMapToMapData(response.map);
  }

  // 获取地图列表
  async getMapList(): Promise<string[]> {
    const response = await this.callService<{}, { maps: string[] }>(
      '/get_map_list',
      'astribot_msgs/GetMapList',
      {}
    );

    return response.maps;
  }

  // 设置初始位姿
  setInitialPose(pose: Pose) {
    this.publishMessage('/initialpose', 'geometry_msgs/PoseWithCovarianceStamped', {
      header: {
        frame_id: 'map',
      },
      pose: {
        pose: {
          position: { x: pose.x, y: pose.y, z: 0 },
          orientation: {
            x: 0,
            y: 0,
            z: Math.sin(pose.theta / 2),
            w: Math.cos(pose.theta / 2),
          },
        },
        covariance: new Array(36).fill(0),
      },
    });
  }

  // 订阅实时地图数据
  subscribeMap(callback: (mapData: MapData) => void): () => void {
    return this.subscribeTopic<any>(
      '/map',
      'nav_msgs/OccupancyGrid',
      (rosMap) => {
        const mapData = this.convertROSMapToMapData(rosMap);
        callback(mapData);
      }
    );
  }

  // 转换ROS地图数据到内部格式
  private convertROSMapToMapData(rosMap: any): MapData {
    return {
      id: Date.now().toString(),
      name: rosMap.info.map_load_time || 'Unknown',
      createdAt: new Date().toISOString(),
      thumbnail: '',
      width: rosMap.info.width,
      height: rosMap.info.height,
      resolution: rosMap.info.resolution,
      origin: {
        x: rosMap.info.origin.position.x,
        y: rosMap.info.origin.position.y,
        orientation: rosMap.info.origin.orientation.z,
      },
      data: rosMap.data,
    };
  }

  // 事件系统
  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data: any) => void) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }
}

export const rosService = new ROSService();
