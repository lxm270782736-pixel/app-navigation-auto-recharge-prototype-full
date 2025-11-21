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

    // 添加任务配置（如果有）
    if (goal.tasks && goal.tasks.length > 0) {
      // 将任务配置序列化为 JSON 字符串发送给 ROS
      // ROS 端可以解析这个 JSON 来执行相应的任务
      goalMessageData.tasks = JSON.stringify(goal.tasks);
      console.log('[ROS] Sending tasks with navigation goal:', goal.tasks);
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

  // ========== 定位服务 (Localization Service) ==========

  // 启动遥控器
  async startJoystick(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.callService<{}, any>(
        '/joystick/start',
        'std_srvs/Trigger',
        {}
      );
      return {
        success: response.success || false,
        message: response.message || 'Joystick started',
      };
    } catch (error) {
      console.error('Failed to start joystick:', error);
      throw error;
    }
  }

  // 停止遥控器
  async stopJoystick(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.callService<{}, any>(
        '/joystick/stop',
        'std_srvs/Trigger',
        {}
      );
      return {
        success: response.success || false,
        message: response.message || 'Joystick stopped',
      };
    } catch (error) {
      console.error('Failed to stop joystick:', error);
      throw error;
    }
  }

  // 启动建图模式
  async startMapping(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.callService<{}, any>(
        '/localization/start_mapping',
        'std_srvs/Trigger',
        {}
      );
      return {
        success: response.success || false,
        message: response.message || 'Mapping mode started',
      };
    } catch (error) {
      console.error('Failed to start mapping:', error);
      throw error;
    }
  }

  // 启动定位模式（手动初始化）
  async startLocalization(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.callService<{}, any>(
        '/localization/start_localization',
        'std_srvs/Trigger',
        {}
      );
      return {
        success: response.success || false,
        message: response.message || 'Localization mode started (manual)',
      };
    } catch (error) {
      console.error('Failed to start localization:', error);
      throw error;
    }
  }

  // 启动定位模式（自动重定位）
  async startLocalizationAuto(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.callService<{}, any>(
        '/localization/start_localization_auto',
        'std_srvs/Trigger',
        {}
      );
      return {
        success: response.success || false,
        message: response.message || 'Localization mode started (auto)',
      };
    } catch (error) {
      console.error('Failed to start auto localization:', error);
      throw error;
    }
  }

  // 启动纯避障输出模式
  async startObstacleAvoidance(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.callService<{}, any>(
        '/localization/start_obstacle_avoidance',
        'std_srvs/Trigger',
        {}
      );
      return {
        success: response.success || false,
        message: response.message || 'Obstacle avoidance mode started',
      };
    } catch (error) {
      console.error('Failed to start obstacle avoidance:', error);
      throw error;
    }
  }

  // 停止当前模式
  async stopLocalization(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.callService<{}, any>(
        '/localization/stop',
        'std_srvs/Trigger',
        {}
      );
      return {
        success: response.success || false,
        message: response.message || 'Localization stopped',
      };
    } catch (error) {
      console.error('Failed to stop localization:', error);
      throw error;
    }
  }

  // 关闭定位服务
  async shutdownLocalization(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.callService<{}, any>(
        '/localization/shutdown',
        'std_srvs/Trigger',
        {}
      );
      return {
        success: response.success || false,
        message: response.message || 'Localization service shutdown',
      };
    } catch (error) {
      console.error('Failed to shutdown localization:', error);
      throw error;
    }
  }

  // 订阅定位状态
  subscribeLocalizationStatus(callback: (status: any) => void): () => void {
    return this.subscribeTopic<any>(
      '/localization/status',
      'std_msgs/String',
      callback
    );
  }

  // ========== 旧的建图服务 (兼容性保留) ==========

  // 结束建图 (旧接口,保持兼容)
  async stopMapping(): Promise<void> {
    // 调用新的停止服务
    await this.stopLocalization();
  }

  // 设置当前地图（将历史地图设置为当前实时地图）
  async setCurrentMap(mapData: MapData): Promise<void> {
    // 调用 ROS 定位服务应用地图
    const response = await this.callService<{ map_name: string }, { success: boolean; message: string }>(
      '/localization/apply_map',
      'localization_msgs/SetMapName',
      {
        map_name: mapData.name,
      }
    );

    if (!response.success) {
      throw new Error(response.message || '应用地图失败');
    }
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

  // 获取所有地图的元数据（用于地图管理界面）
  async getAllMapMetadata(): Promise<MapData[]> {
    try {
      const response = await this.callService<{}, { success: boolean; message: string; maps: any[] }>(
        '/localization/list_maps',
        'localization_msgs/ListMaps',
        {}
      );

      // 检查服务调用是否成功
      if (!response.success) {
        throw new Error(response.message || '获取地图列表失败');
      }

      // 转换 ROS 格式到前端格式
      // 注意：ROS ListMaps 服务返回的是 string[] 类型，每个元素只是地图名称（字符串）
      return (response.maps || [])
        .filter((mapName: any) => {
          // 过滤掉无效的地图名称
          if (!mapName || typeof mapName !== 'string') {
            console.warn('[ROS Service] 跳过无效地图名称:', mapName);
            return false;
          }
          return true;
        })
        .map((mapName: string) => {
          // mapName 是字符串类型（文件夹名称），不是对象
          return {
            id: mapName,
            name: mapName,
            createdAt: new Date().toISOString(), // list_maps 不返回时间戳，使用当前时间
            thumbnail: '', // list_maps 不返回缩略图
            width: 0, // list_maps 不返回详细信息，需要调用 load_map 获取
            height: 0,
            resolution: 0.05,
            origin: {
              x: 0,
              y: 0,
              orientation: 0,
            },
            data: [], // 元数据不包含完整数据
          };
        });
    } catch (error) {
      console.error('Failed to get map metadata from ROS:', error);
      throw error;
    }
  }

  // 删除地图（调用 ROS 服务）
  async deleteMapFromROS(mapId: string): Promise<void> {
    const response = await this.callService<{ map_name: string }, { success: boolean; message: string }>(
      '/localization/delete_map',
      'localization_msgs/DeleteMap',
      { map_name: mapId }
    );

    if (!response.success) {
      throw new Error(response.message || '删除地图失败');
    }
  }

  // 保存地图到 ROS（保存原生数据，不保存缩略图）
  async saveMapToROS(mapData: MapData): Promise<void> {
    // 构建 ROS 地图格式
    const rosMapData = {
      header: {
        frame_id: 'map',
      },
      info: {
        width: mapData.width,
        height: mapData.height,
        resolution: mapData.resolution,
        origin: {
          position: {
            x: mapData.origin.x,
            y: mapData.origin.y,
            z: 0,
          },
          orientation: {
            x: 0,
            y: 0,
            z: mapData.origin.orientation,
            w: 1,
          },
        },
      },
      data: mapData.data,
    };

    const response = await this.callService<any, { success: boolean; message: string }>(
      '/localization/save_map',
      'localization_msgs/SaveMap',
      {
        map_name: mapData.name,
        map_data: rosMapData,
      }
    );

    if (!response.success) {
      throw new Error(response.message || '保存地图失败');
    }
  }

  // 从 ROS 加载地图（包含完整数据）
  async loadMapFromROS(mapName: string): Promise<MapData> {
    // 验证地图名称
    if (!mapName || typeof mapName !== 'string' || mapName.trim() === '') {
      throw new Error('Map name cannot be empty');
    }

    const response = await this.callService<{ map_name: string }, { success: boolean; message: string; map_data: any }>(
      '/localization/load_map',
      'localization_msgs/LoadMap',
      { map_name: mapName }
    );

    if (!response.success || !response.map_data) {
      throw new Error(response.message || '加载地图失败');
    }

    // 从 ROS 格式转换为前端格式
    const rosMap = response.map_data;
    return {
      id: mapName,
      name: mapName,
      createdAt: new Date().toISOString(), // 创建时间需要从元数据获取
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
    // 处理 map_load_time - 如果是 ROS 时间戳对象，转换为字符串；如果是字符串，直接使用；否则使用默认值
    let mapName = '实时地图';
    if (rosMap.info.map_load_time) {
      if (typeof rosMap.info.map_load_time === 'string') {
        mapName = rosMap.info.map_load_time;
      } else if (typeof rosMap.info.map_load_time === 'object' && rosMap.info.map_load_time.secs !== undefined) {
        // ROS 时间戳对象，转换为可读的日期时间字符串
        const date = new Date(rosMap.info.map_load_time.secs * 1000);
        mapName = date.toLocaleString('zh-CN');
      }
    }

    return {
      id: Date.now().toString(),
      name: mapName,
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
