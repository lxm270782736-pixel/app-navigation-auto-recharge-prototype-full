/**
 * ROS2 Action Client - 通过 rosbridge_suite 原生 action 协议
 *
 * 使用 rosbridge 的 send_action_goal / cancel_action_goal 操作，
 * 而不是手动调用 /_action/send_goal 等 service（那些 service type 在 rosbridge 中无法正确导入）。
 *
 * rosbridge action 协议：
 * - 发送: { op: "send_action_goal", action, action_type, args, feedback }
 * - 反馈: { op: "action_feedback", action, id, values }
 * - 结果: { op: "action_result", action, id, values, result, status }
 * - 取消: { op: "cancel_action_goal", action, id }
 */

import ROSLIB from 'roslib';

// ROS2 Action 状态码
export enum ActionStatus {
  UNKNOWN = 0,
  ACCEPTED = 1,
  EXECUTING = 2,
  CANCELING = 3,
  SUCCEEDED = 4,
  CANCELED = 5,
  ABORTED = 6,
}

export function getActionStatusText(status: number): string {
  const statusMap: { [key: number]: string } = {
    [ActionStatus.UNKNOWN]: 'UNKNOWN',
    [ActionStatus.ACCEPTED]: 'ACCEPTED',
    [ActionStatus.EXECUTING]: 'EXECUTING',
    [ActionStatus.CANCELING]: 'CANCELING',
    [ActionStatus.SUCCEEDED]: 'SUCCEEDED',
    [ActionStatus.CANCELED]: 'CANCELED',
    [ActionStatus.ABORTED]: 'ABORTED',
  };
  return statusMap[status] || `UNKNOWN(${status})`;
}

// ========== 通用 ROS2 Action Client ==========

export interface ROS2ActionConfig {
  ros: ROSLIB.Ros;
  serverName: string;          // e.g. '/dock'
  actionType: string;          // e.g. 'astribot_nav_msgs/action/Dock'
}

export interface ROS2ActionCallbacks {
  onStatus?: (status: number, text: string) => void;
  onFeedback?: (feedback: any) => void;
  onResult?: (result: any, succeeded: boolean) => void;
  onError?: (error: any) => void;
}

export interface ROS2ActionHandle {
  id: string;
  cancel: () => void;
  cleanup: () => void;
}

/**
 * 发送 ROS2 Action Goal (通过 rosbridge 原生 action 协议)
 *
 * 用法：
 *   const handle = sendROS2ActionGoal(
 *     { ros, serverName: '/dock', actionType: 'astribot_nav_msgs/action/Dock' },
 *     { force_retry: false },
 *     { onFeedback, onResult, onStatus }
 *   );
 *   // 取消: handle.cancel();
 *   // 清理: handle.cleanup();
 */
export function sendROS2ActionGoal(
  config: ROS2ActionConfig,
  goal: any,
  callbacks: ROS2ActionCallbacks = {}
): ROS2ActionHandle {
  const { ros, serverName, actionType } = config;
  const id = `action:${serverName}:${Date.now()}`;

  // 获取底层 WebSocket 以监听 action 响应
  // roslibjs 不原生处理 action_feedback / action_result op，需要直接监听 WebSocket
  const socket: WebSocket | null = (ros as any).socket;
  if (!socket) {
    throw new Error('WebSocket not available');
  }

  const messageHandler = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
      if (msg.id !== id) return;

      if (msg.op === 'action_feedback') {
        console.log(`[ROS2Action] ${serverName} feedback:`, msg.values);
        callbacks.onFeedback?.(msg.values);
      } else if (msg.op === 'action_result') {
        const succeeded = msg.result === true;
        const status = msg.status ?? (succeeded ? ActionStatus.SUCCEEDED : ActionStatus.ABORTED);
        console.log(`[ROS2Action] ${serverName} result:`, msg.values, 'succeeded:', succeeded, 'status:', status);
        callbacks.onStatus?.(status, getActionStatusText(status));
        callbacks.onResult?.(msg.values, succeeded);
        cleanup();
      }
    } catch {
      // ignore parse errors from non-JSON messages
    }
  };

  socket.addEventListener('message', messageHandler);

  const cleanup = () => {
    socket.removeEventListener('message', messageHandler);
  };

  const cancel = () => {
    // rosbridge cancel_action_goal 协议
    const cancelMsg = {
      op: 'cancel_action_goal',
      id,
      action: serverName,
    };
    console.log(`[ROS2Action] ${serverName} cancel:`, cancelMsg);
    (ros as any).callOnConnection(cancelMsg);
  };

  // 发送 action goal (rosbridge send_action_goal 协议)
  // 注意: goal 数据放在 args 字段
  const sendMsg = {
    op: 'send_action_goal',
    id,
    action: serverName,
    action_type: actionType,
    args: goal,
    feedback: true,
  };
  console.log(`[ROS2Action] ${serverName} send_goal:`, sendMsg);
  (ros as any).callOnConnection(sendMsg);

  return { id, cancel, cleanup };
}
