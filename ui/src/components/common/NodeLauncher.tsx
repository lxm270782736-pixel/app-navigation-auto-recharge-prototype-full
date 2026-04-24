import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button as UIButton,
  Card as UICard,
  CardContent,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from '@astribot/ui';
import { CheckCircle2, LoaderCircle, RefreshCw, Rocket, TriangleAlert, XCircle, Zap } from 'lucide-react';
import { apiService } from '@/services/api';
import { MESSAGE_TYPES } from '@/config/messageTypes';
import { useRobot } from '@/contexts/RobotContext';
import { ConnectionStatus } from '@/types';

interface NodeStatus {
  name: string;
  displayName: string;
  status: 'pending' | 'launching' | 'success' | 'failed';
  message?: string;
  running?: boolean;
}

const initialNodes: NodeStatus[] = [
  { name: 'slam', displayName: 'SLAM节点', status: 'pending', running: false },
  { name: 'navigation', displayName: '导航节点', status: 'pending', running: false },
];

export const NodeLauncher: React.FC = () => {
  const { connectionStatus } = useRobot();
  const [isLaunching, setIsLaunching] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [nodes, setNodes] = useState<NodeStatus[]>(initialNodes);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      return;
    }

    const unsubscribeSlam = apiService.subscribeTopic<{ data: boolean }>(
      '/slam/status',
      MESSAGE_TYPES.BOOL,
      (msg) => {
        setNodes((prevNodes) =>
          prevNodes.map((node) =>
            node.name === 'slam' ? { ...node, running: msg.data } : node
          )
        );
      }
    );

    const unsubscribeNav = apiService.subscribeTopic<{ data: boolean }>(
      '/navigation/status',
      MESSAGE_TYPES.BOOL,
      (msg) => {
        setNodes((prevNodes) =>
          prevNodes.map((node) =>
            node.name === 'navigation' ? { ...node, running: msg.data } : node
          )
        );
      }
    );

    return () => {
      unsubscribeSlam();
      unsubscribeNav();
    };
  }, [connectionStatus]);

  const updateNodeStatus = (name: string, status: NodeStatus['status'], message?: string) => {
    setNodes((prevNodes) =>
      prevNodes.map((node) =>
        node.name === name ? { ...node, status, message } : node
      )
    );
  };

  const launchSingleNode = async (nodeName: string) => {
    updateNodeStatus(nodeName, 'launching');

    try {
      const serviceMap: Record<string, string> = {
        slam: '/system/start_slam_node',
        navigation: '/system/start_navigation_node',
      };

      const result = await apiService.callService<{}, { success: boolean; message: string }>(
        serviceMap[nodeName],
        MESSAGE_TYPES.TRIGGER,
        {}
      );

      if (result.success) {
        updateNodeStatus(nodeName, 'success', result.message || `${nodeName}节点启动成功`);
      } else {
        updateNodeStatus(nodeName, 'failed', result.message || `${nodeName}节点启动失败`);
      }
    } catch (error) {
      updateNodeStatus(nodeName, 'failed', '服务调用失败：' + (error as Error).message);
    }
  };

  const launchAllNodes = async () => {
    if (connectionStatus !== ConnectionStatus.CONNECTED) {
      setNotice({ tone: 'error', text: 'ROS未连接，请先确保后端已连接' });
      return;
    }

    setIsLaunching(true);
    setShowDetail(true);
    setNodes((prevNodes) => prevNodes.map((node) => ({ ...node, status: 'pending' as const })));

    try {
      updateNodeStatus('slam', 'launching');
      try {
        const slamResult = await apiService.callService<{}, { success: boolean; message: string }>(
          '/system/start_slam_node',
          MESSAGE_TYPES.TRIGGER,
          {}
        );
        updateNodeStatus('slam', slamResult.success ? 'success' : 'failed', slamResult.message || (slamResult.success ? 'SLAM节点启动成功' : 'SLAM节点启动失败'));
      } catch (error) {
        updateNodeStatus('slam', 'failed', '服务调用失败：' + (error as Error).message);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      updateNodeStatus('navigation', 'launching');
      try {
        const navResult = await apiService.callService<{}, { success: boolean; message: string }>(
          '/system/start_navigation_node',
          MESSAGE_TYPES.TRIGGER,
          {}
        );
        updateNodeStatus('navigation', navResult.success ? 'success' : 'failed', navResult.message || (navResult.success ? '导航节点启动成功' : '导航节点启动失败'));
      } catch (error) {
        updateNodeStatus('navigation', 'failed', '服务调用失败：' + (error as Error).message);
      }
    } finally {
      setIsLaunching(false);
    }
  };

  const getStatusMeta = (status: NodeStatus['status']) => {
    switch (status) {
      case 'launching':
        return { label: '启动中', tone: 'bg-sky-500/15 text-sky-300', icon: LoaderCircle };
      case 'success':
        return { label: '已启动', tone: 'bg-emerald-500/15 text-emerald-300', icon: CheckCircle2 };
      case 'failed':
        return { label: '失败', tone: 'bg-destructive/15 text-destructive', icon: XCircle };
      default:
        return { label: '待启动', tone: 'bg-muted text-muted-foreground', icon: Zap };
    }
  };

  const overallProgress = useMemo(() => {
    const successCount = nodes.filter((n) => n.status === 'success').length;
    return Math.round((successCount / nodes.length) * 100);
  }, [nodes]);

  const allSuccess = nodes.every((n) => n.status === 'success');
  const hasFailure = nodes.some((n) => n.status === 'failed');

  return (
    <>
      <UICard className="border-0 bg-gradient-to-br from-sky-600 to-violet-700 text-white shadow-md">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              <span className="text-base font-medium">系统节点控制</span>
            </div>
            {overallProgress > 0 && (
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-sky-700">
                {overallProgress}%
              </span>
            )}
          </div>

          {overallProgress > 0 && (
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${overallProgress}%` }} />
            </div>
          )}

          <UIButton
            type="button"
            variant="secondary"
            className="h-11 w-full justify-center bg-white font-medium text-sky-700 hover:bg-white/90"
            onClick={launchAllNodes}
            disabled={isLaunching || connectionStatus !== ConnectionStatus.CONNECTED}
          >
            <Rocket className="mr-2 h-4 w-4" />
            {isLaunching ? '启动中...' : '一键启动所有节点'}
          </UIButton>

          {connectionStatus !== ConnectionStatus.CONNECTED && (
            <div className="text-center text-xs text-white/80">请先连接后端服务</div>
          )}

          {notice && (
            <div className={cn(
              'rounded-md border px-3 py-2 text-xs',
              notice.tone === 'success' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-red-300/30 bg-red-300/10 text-red-100'
            )}>
              {notice.text}
            </div>
          )}

          {connectionStatus === ConnectionStatus.CONNECTED && (
            <div className="rounded-md bg-white/10 px-3 py-2 text-xs text-white/90">
              {nodes.map((node) => (
                <div key={node.name} className="flex items-center gap-2 py-0.5">
                  <span className={cn('inline-block h-2 w-2 rounded-full', node.running ? 'bg-emerald-300' : 'bg-white/40')} />
                  <span>{node.displayName}: {node.running ? '运行中' : '已停止'}</span>
                </div>
              ))}
            </div>
          )}

          {overallProgress > 0 && (
            <button
              type="button"
              className="text-xs text-white underline underline-offset-2"
              onClick={() => setShowDetail(true)}
            >
              查看详细状态 →
            </button>
          )}
        </CardContent>
      </UICard>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-sky-500" />
              节点启动状态
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${overallProgress}%` }} />
            </div>

            <div className="space-y-3">
              {nodes.map((node) => {
                const meta = getStatusMeta(node.status);
                const Icon = meta.icon;
                return (
                  <div key={node.name} className="rounded-lg border border-border/70 bg-card/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className={cn('h-4 w-4', node.status === 'launching' && 'animate-spin')} />
                          <span className="text-sm font-medium text-foreground">{node.displayName}</span>
                        </div>
                        {node.message && (
                          <div className={cn('mt-2 text-xs', node.status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
                            {node.message}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={meta.tone}>{meta.label}</Badge>
                        {node.status === 'failed' && (
                          <UIButton
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => launchSingleNode(node.name)}
                            disabled={isLaunching}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            重试
                          </UIButton>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {isLaunching && (
              <div className="flex items-center justify-center gap-2 text-sm text-sky-300">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                正在依次启动节点，请稍候...
              </div>
            )}

            {!isLaunching && allSuccess && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                <CheckCircle2 className="mr-2 inline h-4 w-4" />
                所有节点启动成功，系统已就绪
              </div>
            )}

            {!isLaunching && hasFailure && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <TriangleAlert className="mr-2 inline h-4 w-4" />
                部分节点启动失败，请检查 ROS 系统状态
              </div>
            )}
          </div>

          <DialogFooter>
            <UIButton type="button" onClick={() => setShowDetail(false)}>关闭</UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
