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

    // 构建 goal message
    const goalMessageData: any = {
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
      use_default_config: goal.actionConfig?.use_default_config ?? true,
    };

    // 如果不使用默认配置，添加自定义参数
    if (goal.actionConfig && !goal.actionConfig.use_default_config) {
      if (goal.actionConfig.safe_dist !== undefined) {
        goalMessageData.safe_dist = goal.actionConfig.safe_dist;
      }
      if (goal.actionConfig.v_max !== undefined) {
        goalMessageData.v_max = goal.actionConfig.v_max;
      }
      if (goal.actionConfig.w_max !== undefined) {
        goalMessageData.w_max = goal.actionConfig.w_max;
      }
      if (goal.actionConfig.a_max !== undefined) {
        goalMessageData.a_max = goal.actionConfig.a_max;
      }
      if (goal.actionConfig.dw_max !== undefined) {
        goalMessageData.dw_max = goal.actionConfig.dw_max;
      }
      if (goal.actionConfig.is_holonomic !== undefined) {
        goalMessageData.is_holonomic = goal.actionConfig.is_holonomic;
      }
      if (goal.actionConfig.deaccelaration_dist !== undefined) {
        goalMessageData.deaccelaration_dist = goal.actionConfig.deaccelaration_dist;
      }
      if (goal.actionConfig.deaccelaration_ratio !== undefined) {
        goalMessageData.deaccelaration_ratio = goal.actionConfig.deaccelaration_ratio;
      }
    }

    const goalMessage = new ROSLIB.Goal({
      actionClient,
      goalMessage: goalMessageData, 
    });

    return new Promise((resolve, _reject) => {
      // 处理导航结果
      goalMessage.on('result', (result: any) => {
        console.log('[ROS] Navigation result received:', {
          status: result.status,
          result: result.result,
        });

        // 检查导航是否成功
        // 1. actionlib 状态码检查 (3 = SUCCEEDED, 4 = ABORTED, 5 = PREEMPTED)
        const actionStatus = result.status?.status;
        const actionSucceeded = actionStatus === 3;
        const actionAborted = actionStatus === 4;
        const actionPreempted = actionStatus === 5;

        // 2. result.result 中的实际结果检查
        const resultData = result.result || {};
        const resultSuccess = resultData == true; // 如果明确为 false，则失败
        const errorMessage = resultData.error_message || resultData.message;

        // 3. 综合判断
        const success = resultSuccess;

        // 构建详细的结果信息
        const resultInfo = {
          success,
          actionStatus,
          actionSucceeded,
          actionAborted,
          actionPreempted,
          resultData,
          errorMessage,
          statusText: this.getActionStatusText(actionStatus),
        };

        console.log('[ROS] Navigation result analysis:', resultInfo);

        // 发送导航结果事件
        this.emit('navigation-result', resultInfo);

        resolve();
      });

      // 处理导航反馈（进度信息）
      goalMessage.on('feedback', (feedback: any) => {
        console.log('[ROS] Navigation feedback:', feedback);

        // 提取有用的反馈信息
        const feedbackData = {
          distance_to_goal: feedback.distance_to_goal,
          current_pose: feedback.current_pose,
          current_task: feedback.current_task,
          progress: feedback.progress,
          eta: feedback.eta,
          raw: feedback,
        };

        this.emit('navigation-feedback', feedbackData);
      });

      // 处理导航状态更新
      goalMessage.on('status', (status: any) => {
        console.log('[ROS] Navigation status:', status);

        // 发送状态事件
        this.emit('navigation-status', {
          status: status.status,
          text: this.getActionStatusText(status.status),
        });
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

  // 获取 Action 状态文本
  private getActionStatusText(status: number): string {
    // actionlib 状态码
    // http://docs.ros.org/en/api/actionlib_msgs/html/msg/GoalStatus.html
    const statusMap: { [key: number]: string } = {
      0: 'PENDING',      // 等待处理
      1: 'ACTIVE',       // 正在执行
      2: 'PREEMPTED',    // 被抢占（取消）
      3: 'SUCCEEDED',    // 成功
      4: 'ABORTED',      // 中止（失败）
      5: 'REJECTED',     // 被拒绝
      6: 'PREEMPTING',   // 正在抢占
      7: 'RECALLING',    // 正在撤回
      8: 'RECALLED',     // 已撤回
      9: 'LOST',         // 丢失
    };
    return statusMap[status] || `UNKNOWN(${status})`;
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
