/**
 * ApiService — HTTP adapter for backend FastAPI.
 *
 * All communication goes through the FastAPI backend (REST + SSE).
 * Components call the same methods — zero changes needed.
 */
import type { MapData, Pose, NavigationGoal } from '@/types';

// Normalize any map-like object to frontend MapData format.
// Handles both ROS OccupancyGrid format and backend flat format.
function normalizeMapData(raw: any): MapData {
  const info = raw.info || {};
  const rosOrigin = info.origin?.position || {};
  const rosOri = info.origin?.orientation || {};
  return {
    id: raw.id || raw.name || 'unknown',
    name: raw.name || raw.id || 'unknown',
    createdAt: raw.createdAt || (raw.created_at ? new Date(raw.created_at * 1000).toISOString() : new Date().toISOString()),
    thumbnail: raw.thumbnail || '',
    width: raw.width || info.width || 0,
    height: raw.height || info.height || 0,
    resolution: raw.resolution || info.resolution || 0.05,
    origin: raw.origin && typeof raw.origin === 'object' && 'x' in raw.origin
      ? raw.origin
      : {
          x: raw.origin_x ?? rosOrigin.x ?? 0,
          y: raw.origin_y ?? rosOrigin.y ?? 0,
          orientation: raw.origin_orientation ?? (rosOri.z
            ? Math.atan2(2 * ((rosOri.w || 1) * (rosOri.z || 0)), 1 - 2 * ((rosOri.z || 0) ** 2))
            : 0),
        },
    data: raw.data || info.data || [],
    localOnly: raw.localOnly,
  };
}

import { getBaseUrl } from '@/config';

// Backend base URL — supports both standalone and Stardust Desktop embedded modes.
const API_BASE = getBaseUrl();

class ApiService {
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  // Cache latest state for late-subscribing components
  private _latestRoomPatrolState: any = null;
  private topicCallbacks: Map<string, Set<(data: any) => void>> = new Map();
  private eventSource: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

  // ------ Connection (SSE to backend) ------

  connect(_url?: string): Promise<void> {
    return new Promise((resolve) => {
      this.connectSSE();
      // Resolve immediately — SSE connection is async
      resolve();
    });
  }

  private _lastNavStatus = 'idle';

  private connectSSE() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const es = new EventSource(`${API_BASE}/api/state`);

    es.onopen = () => {
      this._connected = true;
      this.emit('connection', { connected: true });
    };

    es.onmessage = (event) => {
      try {
        const state = JSON.parse(event.data);

        // Emit full state for MetaLauncher etc.
        this.emit('state', state);

        // Dispatch pose to topic subscribers (Meta get_pose → /loc_high_freq format)
        if (state.pose && state.pose.success) {
          const poseData = state.pose;
          // Convert Meta pose to Odometry-like format for existing components
          const odomMsg = {
            pose: {
              pose: {
                position: poseData.position || { x: 0, y: 0, z: 0 },
                orientation: poseData.quaternion || { x: 0, y: 0, z: 0, w: 1 },
              },
            },
          };
          const callbacks = this.topicCallbacks.get('/loc_high_freq');
          if (callbacks) {
            callbacks.forEach((cb) => cb(odomMsg));
          }
        }

        // Dispatch navigation events — only emit on state CHANGE
        if (state.nav_status && state.nav_status !== this._lastNavStatus) {
          const prev = this._lastNavStatus;
          this._lastNavStatus = state.nav_status;

          this.emit('navigation-status', {
            status: state.nav_status,
            text: state.nav_status,
          });

          // Emit result only on transition to terminal state
          if ((state.nav_status === 'succeeded' || state.nav_status === 'failed') && prev !== state.nav_status) {
            const result = state.nav_feedback?.result || {};
            this.emit('navigation-result', {
              success: state.nav_status === 'succeeded',
              resultData: result,
              errorMessage: result.result_text || result.message || '',
              failReason: state.nav_fail_reason || null,
            });
          }
        }
        // Emit feedback while navigating
        if (state.nav_status === 'navigating' && state.nav_feedback && !state.nav_feedback.result) {
          this.emit('navigation-feedback', state.nav_feedback);
        }

        // Dispatch patrol state
        if (state.patrol) {
          this.emit('patrol-state', state.patrol);
        }

        // Dispatch dock status from meta.astribot_dock via SSE.
        if (state.dock_status) {
          this.emit('dock-status', state.dock_status);
        }

        // Dispatch room patrol state
        if (state.room_patrol) {
          state.room_patrol.nav_fail_reason = state.nav_fail_reason || null;
          this._latestRoomPatrolState = state.room_patrol;
          this.emit('room-patrol-state', state.room_patrol);
        }
      } catch (e) {
        console.error('[ROS-HTTP] SSE parse error:', e);
      }
    };

    es.onerror = () => {
      console.warn('[ROS-HTTP] SSE connection lost, reconnecting...');
      this._connected = false;
      this.emit('connection', { connected: false });
      this.emit('error', new Error('SSE connection lost'));
      es.close();
      this.eventSource = null;
      this.attemptReconnect();
    };

    this.eventSource = es;
  }

  disconnect() {
    this.clearReconnectTimer();
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this._connected = false;
  }

  private attemptReconnect() {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.connectSSE();
    }, 3000);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  get isConnected(): boolean {
    return this._connected;
  }

  // Heavy topics polled via REST instead of SSE (too large for SSE)
  private static HEAVY_TOPICS = new Set(['/scan', '/visualizer/mincoPath']);
  private pollingTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  // ------ Topic Subscribe ------

  subscribeTopic<T>(
    topicName: string,
    _messageType: string,
    callback: (message: T) => void
  ): () => void {
    if (!this.topicCallbacks.has(topicName)) {
      this.topicCallbacks.set(topicName, new Set());
    }
    this.topicCallbacks.get(topicName)!.add(callback as any);

    // Heavy topics: start polling via REST
    if (ApiService.HEAVY_TOPICS.has(topicName) && !this.pollingTimers.has(topicName)) {
      const timer = setInterval(async () => {
        if (!this._connected) return;
        try {
          const result = await this._get(`/api/ros/topic${topicName}`);
          if (result.success && result.data) {
            const cbs = this.topicCallbacks.get(topicName);
            if (cbs) cbs.forEach((cb) => cb(result.data));
          }
        } catch { /* ignore polling errors */ }
      }, 2000); // Poll every 2s for heavy data
      this.pollingTimers.set(topicName, timer);
    }

    return () => {
      const cbs = this.topicCallbacks.get(topicName);
      if (cbs) {
        cbs.delete(callback as any);
        // Stop polling if no more subscribers
        if (cbs.size === 0 && this.pollingTimers.has(topicName)) {
          clearInterval(this.pollingTimers.get(topicName)!);
          this.pollingTimers.delete(topicName);
        }
      }
    };
  }

  // ------ Topic Publish (via REST) ------

  publishMessage<T>(topicName: string, messageType: string, message: T) {
    this._post('/api/ros/publish', {
      topic_name: topicName,
      msg_type: messageType,
      message,
    }).catch((e) => console.error('[ROS-HTTP] publish failed:', e));
  }

  // ------ Service Call (via REST) ------

  async callService<TRequest, TResponse>(
    serviceName: string,
    serviceType: string,
    request: TRequest
  ): Promise<TResponse> {
    const result = await this._post('/api/ros/service', {
      service_name: serviceName,
      service_type: serviceType,
      request,
    });
    return result as TResponse;
  }

  // ------ Navigation ------

  sendNavigationGoal(goal: NavigationGoal): void {
    this._lastNavStatus = 'navigating';
    this._post('/api/navigation/go', {
      x: goal.pose.x,
      y: goal.pose.y,
      theta: goal.pose.theta,
      config: goal.actionConfig ? {
        use_default_config: goal.actionConfig.use_default_config ?? true,
        safe_dist: goal.actionConfig.safe_dist ?? 0.35,
        v_max: goal.actionConfig.v_max ?? 0.5,
        w_max: goal.actionConfig.w_max ?? 1.0,
        a_max: goal.actionConfig.a_max ?? 1.0,
        dw_max: goal.actionConfig.dw_max ?? 2.0,
        is_holonomic: goal.actionConfig.is_holonomic ?? false,
        jps_safe_dis_margin: goal.actionConfig.jps_safe_dis_margin ?? 0.3,
        goal_tolerance: goal.actionConfig.goal_tolerance ?? 0.02,
      } : null,
      tasks: goal.tasks?.length ? goal.tasks : null,
    }).then((resp: any) => {
      // 后端拒收（如 meta 未激活）时以 HTTP 200 + success:false 返回，
      // 需要在这里显式转化成 navigation-result 告知 UI，不然用户看不到失败。
      if (resp && resp.success === false) {
        this._lastNavStatus = 'idle';
        this.emit('navigation-result', {
          success: false,
          errorMessage: resp.message || '导航请求被拒绝',
        });
      }
    }).catch((e) => {
      console.error('[ROS-HTTP] navigate failed:', e);
      this._lastNavStatus = 'idle';
      this.emit('navigation-result', {
        success: false,
        errorMessage: `${e}`,
      });
    });
  }

  cancelNavigation() {
    this._post('/api/navigation/cancel', {}).catch(console.error);
  }

  async getNavigationPath(): Promise<Array<{ x: number; y: number; yaw?: number }>> {
    return this._get('/api/navigation/path');
  }

  /** Fetch the JPS fallback path. Empty when MINCO is healthy. */
  async getNavigationJpsPath(): Promise<Array<{ x: number; y: number; yaw?: number }>> {
    try {
      const r: any = await this._get('/api/navigation/jps-path');
      return Array.isArray(r) ? r : [];
    } catch {
      return [];
    }
  }

  /** Fetch a live ESDF snapshot. `max_dist` is the distance at which cells are
   *  clamped to 100 (farthest). Returns null when unavailable. */
  async getEsdfSnapshot(maxDist: number = 2.0): Promise<{
    resolution: number;
    width: number;
    height: number;
    origin_x: number;
    origin_y: number;
    data: number[];
    stamp_ns: number;
  } | null> {
    try {
      const r: any = await this._get(`/api/navigation/esdf?max_dist=${maxDist}`);
      if (!r || !r.success || !r.data) return null;
      return r.data;
    } catch {
      return null;
    }
  }

  /** Fetch combined MPC + planner debug state. Prefer SSE `nav_debug` when
   *  possible; this endpoint exists for on-demand refresh. */
  async getNavigationDebug(): Promise<{
    mpc?: any;
    planner?: any;
  } | null> {
    try {
      const r: any = await this._get('/api/navigation/debug');
      if (!r || !r.success) return null;
      return { mpc: r.mpc, planner: r.planner };
    } catch {
      return null;
    }
  }

  sendLocalNavigationGoal(pose: Pose): void {
    this._post('/api/navigation/local-go', {
      x: pose.x,
      y: pose.y,
      theta: pose.theta,
    }).catch(console.error);
  }

  // ------ Patrol (multi-waypoint) ------

  async startPatrol(waypoints: import('@/types').Waypoint[], startIndex: number = 0): Promise<{ success: boolean; message: string }> {
    return this._post('/api/patrol/start', {
      waypoints: waypoints.map(w => ({
        pose: w.pose,
        tasks: w.tasks || [],
        navigationMode: w.navigationMode || 'obstacle_avoidance',
        actionConfig: w.actionConfig || { use_default_config: true },
      })),
      start_index: startIndex,
    });
  }

  async stopPatrol(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/patrol/stop', {});
  }

  async getPatrolStatus(): Promise<any> {
    return this._get('/api/patrol/status');
  }

  async updatePatrolWaypoints(waypoints: import('@/types').Waypoint[]): Promise<{ success: boolean; message: string }> {
    return this._post('/api/patrol/waypoints', {
      waypoints: waypoints.map(w => ({
        pose: w.pose,
        tasks: w.tasks || [],
        navigationMode: w.navigationMode || 'obstacle_avoidance',
        actionConfig: w.actionConfig || { use_default_config: true },
      })),
    });
  }

  // ------ Room Config (点位录制) ------

  async getRoomConfig(): Promise<any> {
    return this._get('/api/room-config');
  }

  async saveRoomConfig(config: any): Promise<{ success: boolean; message: string }> {
    return this._post('/api/room-config', { config });
  }

  async addRoom(roomId: string, roomName: string): Promise<{ success: boolean; message: string }> {
    return this._post('/api/room-config/rooms', { room_id: roomId, room_name: roomName });
  }

  async deleteRoom(roomId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/api/room-config/rooms/${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }

  async recordRoomWaypoint(roomId: string, waypointType: string): Promise<any> {
    return this._post(`/api/room-config/rooms/${encodeURIComponent(roomId)}/record`, {
      waypoint_type: waypointType,
    });
  }

  async recordStartPosition(): Promise<any> {
    return this._post('/api/room-config/record-start', {});
  }

  async addRoomWaypoint(roomId: string, waypointId: string, name: string, type: string = 'custom'): Promise<{ success: boolean; message: string }> {
    return this._post(`/api/room-config/rooms/${roomId}/waypoints`, { waypoint_id: waypointId, name, type });
  }

  async deleteRoomWaypoint(roomId: string, waypointId: string): Promise<{ success: boolean; message: string }> {
    return this._post(`/api/room-config/rooms/${roomId}/waypoints/${waypointId}/delete`, {});
  }

  async renameRoomWaypoint(roomId: string, waypointId: string, name: string): Promise<{ success: boolean; message: string }> {
    return this._post(`/api/room-config/rooms/${roomId}/waypoints/${waypointId}/rename`, { name });
  }

  // ------ Room Patrol (巡房任务) ------

  async startRoomPatrol(taskConfig?: any): Promise<{ success: boolean; message: string }> {
    return this._post('/api/room-patrol/start', { task_config: taskConfig || null });
  }

  async stopRoomPatrol(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/room-patrol/stop', {});
  }

  async pauseRoomPatrol(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/room-patrol/pause', {});
  }

  async resumeRoomPatrol(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/room-patrol/resume', {});
  }

  async advanceRoomPatrolStep(targetStepIndex: number = -1): Promise<{ success: boolean; message: string }> {
    return this._post('/api/room-patrol/advance', { target_step_index: targetStepIndex });
  }

  async skipRoomPatrolStep(stepIndex: number): Promise<{ success: boolean; message: string }> {
    return this._post('/api/room-patrol/skip-step', { step_index: stepIndex });
  }

  async getRoomPatrolStatus(): Promise<any> {
    return this._get('/api/room-patrol/status');
  }

  async getTaskConfig(): Promise<any> {
    return this._get('/api/room-patrol/task-config');
  }

  async saveTaskConfig(config: any): Promise<{ success: boolean; message: string }> {
    return this._post('/api/room-patrol/task-config', { config });
  }

  // ------ Alerts (告警) ------

  async acknowledgeFall(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/fall/ack', {});
  }

  async acknowledgeStuck(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/stuck/ack', {});
  }

  async getAlerts(filter?: { status?: string; date?: string; patrol_id?: string }): Promise<any[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.date) params.set('date', filter.date);
    if (filter?.patrol_id) params.set('patrol_id', filter.patrol_id);
    const query = params.toString() ? `?${params}` : '';
    return this._get(`/api/alerts${query}`);
  }

  async confirmAlert(date: string, alertId: string): Promise<{ success: boolean; message: string }> {
    return this._post(`/api/alerts/${date}/${alertId}/confirm`, {});
  }

  async closeAlert(date: string, alertId: string): Promise<{ success: boolean; message: string }> {
    return this._post(`/api/alerts/${date}/${alertId}/close`, {});
  }

  // ------ Patrol Records (巡房记录) ------

  async getPatrolRecords(): Promise<any[]> {
    return this._get('/api/patrol-records');
  }

  async getPatrolRecord(date: string, recordId: string): Promise<any> {
    return this._get(`/api/patrol-records/${date}/${recordId}`);
  }

  async deletePatrolRecords(records: { id: string; date: string }[]): Promise<{ success: boolean; deleted: number; failed: number }> {
    return this._post('/api/patrol-records/delete', { records });
  }

  // ------ Task Presets (任务预设) ------

  async getTaskPresets(): Promise<{ presets: any[] }> {
    return this._get('/api/task-presets');
  }

  async saveTaskPreset(preset: any): Promise<{ success: boolean; message: string; preset_id?: string }> {
    return this._post('/api/task-presets', { preset });
  }

  async deleteTaskPreset(presetId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/api/task-presets/${encodeURIComponent(presetId)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async duplicateTaskPreset(presetId: string, newName: string): Promise<{ success: boolean; message: string; preset?: any }> {
    return this._post(`/api/task-presets/${encodeURIComponent(presetId)}/duplicate`, { new_name: newName });
  }

  async setDefaultPreset(presetId: string): Promise<{ success: boolean; message: string }> {
    return this._post(`/api/task-presets/${encodeURIComponent(presetId)}/default`, {});
  }

  // ------ Meta 服务管理 ------

  async startMeta(): Promise<{ success: boolean; results?: Record<string, string>; message?: string }> {
    return this._post('/api/meta/start', {});
  }

  async connectMeta(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/meta/connect', {});
  }

  async activateMeta(): Promise<{ success: boolean; results: Record<string, string> }> {
    return this._post('/api/meta/activate', {});
  }

  async deactivateMeta(): Promise<{ success: boolean; results: Record<string, string> }> {
    return this._post('/api/meta/deactivate', {});
  }

  async metaControl(service: string, action: 'start' | 'stop'): Promise<{ success: boolean; state?: string; message?: string }> {
    return this._post('/api/meta/control', { service, action });
  }

  async getMetaStatus(refresh: boolean = false): Promise<{ meta_connected: boolean; loc_state: string; nav_state: string; lidar_state: string; fall_state: string }> {
    const qs = refresh ? '?refresh=true' : '';
    return this._get(`/api/meta/status${qs}`);
  }

  async getMetaServicesConfig(): Promise<{ services: Array<{ name: string; startup: boolean; display_name?: string; config: Record<string, any> }> }> {
    return this._get('/api/meta/services-config');
  }

  async updateMetaServicesConfig(services: Array<{ name: string; startup: boolean; display_name?: string; config: Record<string, any> }>): Promise<{ success: boolean; message?: string }> {
    return this._post('/api/meta/services-config', { services });
  }

  // ------ Custom Step Types (自定义步骤类型) ------

  async getCustomStepTypes(): Promise<{ custom_step_types: any[] }> {
    return this._get('/api/custom-step-types');
  }

  async saveCustomStepType(definition: any): Promise<{ success: boolean; message: string }> {
    return this._post('/api/custom-step-types', { definition });
  }

  async deleteCustomStepType(stepId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/api/custom-step-types/${encodeURIComponent(stepId)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ------ Localization Service ------

  async startJoystick(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/joystick/start', {});
  }

  async stopJoystick(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/joystick/stop', {});
  }

  async sendVelocity(linearX: number, angularZ: number): Promise<{ success: boolean; message: string }> {
    return this._post('/api/chassis/velocity', { linear_x: linearX, angular_z: angularZ });
  }

  async startMapping(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/localization/start-mapping', {});
  }

  async startLocalization(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/localization/start', {});
  }

  async startLocalizationAuto(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/localization/start-auto', {});
  }

  async startObstacleAvoidance(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/localization/start-obstacle-avoidance', {});
  }

  async stopLocalization(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/localization/stop', {});
  }

  async shutdownLocalization(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/localization/shutdown', {});
  }

  async stopMapping(): Promise<{ success: boolean; message: string }> {
    return this._post('/api/localization/stop-mapping', {});
  }

  subscribeLocalizationStatus(callback: (status: any) => void): () => void {
    return this.subscribeTopic<any>(
      '/localization/status',
      'std_msgs/msg/String',
      callback
    );
  }

  // ------ Map Management ------

  async setCurrentMap(mapData: MapData): Promise<void> {
    const result = await this._post('/api/maps/apply', { map_name: mapData.name });
    if (!result.success) {
      throw new Error(result.message || 'Failed to apply map');
    }
  }

  async getCurrentMapName(): Promise<string | null> {
    try {
      const result = await this._get('/api/maps/current');
      if (result.success && (result.map_name || result.message)) {
        return result.map_name || result.message;
      }
      return null;
    } catch {
      return null;
    }
  }

  async applyMap(mapName: string): Promise<{ success: boolean; message: string }> {
    return this._post('/api/maps/apply', { map_name: mapName });
  }

  async getMapList(): Promise<string[]> {
    try {
      const result = await this._get('/api/maps');
      return result.maps || [];
    } catch {
      return [];
    }
  }

  async getAllMapMetadata(): Promise<any[]> {
    try {
      const result = await this._get('/api/maps');
      const maps = result.maps || [];
      return maps.map((m: any) => normalizeMapData(m));
    } catch {
      return [];
    }
  }

  async loadMap(mapName: string): Promise<MapData | null> {
    try {
      const result = await this._get(`/api/maps/${encodeURIComponent(mapName)}`);
      if (result.success) {
        // Backend returns flat format: {name, resolution, width, height, origin, data}
        return normalizeMapData({ ...result, id: mapName, name: mapName });
      }
      return null;
    } catch {
      return null;
    }
  }

  async saveMap(mapData: MapData): Promise<{ success: boolean; message: string }> {
    return this._post('/api/maps/save', {
      map_name: mapData.name,
      map_data: {
        map_name: mapData.name,
        map_data: {
          info: {
            width: mapData.width,
            height: mapData.height,
            resolution: mapData.resolution,
            origin: {
              position: { x: mapData.origin.x, y: mapData.origin.y, z: 0 },
              orientation: { x: 0, y: 0, z: 0, w: 1 },
            },
          },
          data: mapData.data,
        },
        created_at: Date.now(),
        thumbnail: mapData.thumbnail || '',
      },
    });
  }

  async deleteMap(mapId: string): Promise<{ success: boolean; message: string }> {
    return this._post('/api/maps/delete', { map_name: mapId });
  }

  subscribeMap(callback: (mapData: any) => void): () => void {
    return this.subscribeTopic<any>('/map', 'nav_msgs/msg/OccupancyGrid', (raw) => {
      callback(normalizeMapData({ ...raw, id: 'realtime', name: 'realtime' }));
    });
  }

  // ------ Chassis Control ------

  async setChassisControlType(controlType: string): Promise<string> {
    const result = await this._post('/api/chassis/control-type', {
      control_type: controlType,
    });
    this.emit('chassis-control-type-changed', { controlType });
    return result.response || controlType;
  }

  async getChassisControlType(): Promise<'twist' | 'joy' | null> {
    try {
      const result = await this._get('/api/chassis/control-type');
      if (result.response?.includes('twist')) return 'twist';
      if (result.response?.includes('joy')) return 'joy';
      return null;
    } catch {
      return null;
    }
  }

  // ------ Initial Pose ------

  setInitialPose(pose: Pose) {
    this._post('/api/chassis/initial-pose', {
      x: pose.x,
      y: pose.y,
      theta: pose.theta,
    }).catch(console.error);
  }

  // ------ Dock ------

  sendDockGoal(forceRetry: boolean = false) {
    this._post('/api/dock/dock', { force_retry: forceRetry })
      .then(() => this.emit('dock-status-update', { status: 'docking' }))
      .catch((e) => this.emit('dock-result', { success: false, message: `${e}` }));
  }

  sendUndockGoal(savePosition: boolean = true) {
    this._post('/api/dock/undock', { save_position: savePosition })
      .then(() => this.emit('undock-status-update', { status: 'undocking' }))
      .catch((e) => this.emit('undock-result', { success: false, message: `${e}` }));
  }

  cancelDock() {
    this._post('/api/dock/cancel', {}).catch(console.error);
  }

  // ------ Event System ------

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    // Replay latest cached state for late-subscribing components
    if (event === 'room-patrol-state' && this._latestRoomPatrolState) {
      callback(this._latestRoomPatrolState);
    }
  }

  off(event: string, callback: (data: any) => void) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  public emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  // ------ 素材管理 ------

  async listAssets(category: string): Promise<any> {
    return this._get(`/api/assets/${encodeURIComponent(category)}/list`);
  }

  async uploadAssetPair(category: string, hdf5File?: File, mp3File?: File): Promise<any> {
    const formData = new FormData();
    if (hdf5File) formData.append('hdf5_file', hdf5File);
    if (mp3File) formData.append('mp3_file', mp3File);
    const res = await fetch(`${API_BASE}/api/assets/${encodeURIComponent(category)}/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }

  async deleteAssetPair(category: string, pairIndex: number): Promise<any> {
    return this._post(`/api/assets/${encodeURIComponent(category)}/delete`, { pair_index: pairIndex });
  }

  async previewAudio(category: string, pairIndex: number): Promise<any> {
    return this._post('/api/assets/preview-audio', { category, pair_index: pairIndex });
  }

  async stopAudio(): Promise<any> {
    return this._post('/api/assets/stop-audio', {});
  }

  async previewAction(category: string, pairIndex: number): Promise<any> {
    return this._post('/api/assets/preview-action', { category, pair_index: pairIndex });
  }

  async stopAction(): Promise<any> {
    return this._post('/api/assets/stop-action', {});
  }

  async getReplayStatus(): Promise<any> {
    return this._get('/api/assets/replay-status');
  }

  async listTrajectories(): Promise<{ success: boolean; trajectories: string[] }> {
    return this._get('/api/assets/trajectories');
  }

  // ------ HTTP helpers ------

  private async _post(path: string, body: any): Promise<any> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }

  private async _get(path: string): Promise<any> {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }
}

export const apiService = new ApiService();
