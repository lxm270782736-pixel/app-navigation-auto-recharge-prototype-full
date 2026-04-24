import React from 'react';
import {
  Badge,
  Card as UICard,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  cn,
} from '@astribot/ui';
import { AlertCircle, CheckCircle2, Clock3, LoaderCircle, XCircle } from 'lucide-react';
import { TaskExecutionState, TaskStatus } from '@/types';

interface TaskMonitorProps {
  tasks: TaskExecutionState[];
  compact?: boolean;
}

const getStatusMeta = (status: TaskStatus) => {
  switch (status) {
    case TaskStatus.PENDING:
      return { text: '等待中', tone: 'bg-muted text-muted-foreground', icon: Clock3 };
    case TaskStatus.RUNNING:
      return { text: '执行中', tone: 'bg-sky-500/15 text-sky-300', icon: LoaderCircle };
    case TaskStatus.COMPLETED:
      return { text: '已完成', tone: 'bg-emerald-500/15 text-emerald-300', icon: CheckCircle2 };
    case TaskStatus.FAILED:
      return { text: '失败', tone: 'bg-destructive/15 text-destructive', icon: XCircle };
    case TaskStatus.CANCELLED:
      return { text: '已取消', tone: 'bg-amber-500/15 text-amber-300', icon: AlertCircle };
    case TaskStatus.RETRYING:
      return { text: '重试中', tone: 'bg-amber-500/15 text-amber-300', icon: LoaderCircle };
    default:
      return { text: status, tone: 'bg-muted text-muted-foreground', icon: Clock3 };
  }
};

const calculateOverallProgress = (tasks: TaskExecutionState[]) => {
  if (tasks.length === 0) return 0;
  const completedTasks = tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
  return Math.round((completedTasks / tasks.length) * 100);
};

export const TaskMonitor: React.FC<TaskMonitorProps> = ({ tasks, compact = false }) => {
  if (tasks.length === 0) {
    return null;
  }

  const progress = calculateOverallProgress(tasks);
  const hasFailed = tasks.some((t) => t.status === TaskStatus.FAILED);

  if (compact) {
    return (
      <UICard className="border-border/70 bg-card/90">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">任务执行状态</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="mb-2 text-xs text-muted-foreground">总体进度</div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="space-y-2">
            {tasks.map((task, index) => {
              const status = getStatusMeta(task.status);
              const Icon = status.icon;
              return (
                <div key={task.taskId} className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2">
                  <Icon className={cn('h-4 w-4', task.status === TaskStatus.RUNNING && 'animate-spin')} />
                  <span className="flex-1 text-xs text-foreground">
                    {index + 1}. {task.message || task.taskId}
                  </span>
                  <Badge className={status.tone}>{status.text}</Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </UICard>
    );
  }

  return (
    <UICard className="border-border/70 bg-card/90">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">任务执行监控</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-2 text-sm font-semibold text-foreground">总体进度</div>
          <Progress value={progress} className="h-2" />
          <div className="mt-2 text-xs text-muted-foreground">
            已完成 {tasks.filter((t) => t.status === TaskStatus.COMPLETED).length} / {tasks.length} 个任务
            {hasFailed ? '，存在失败项' : ''}
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold text-foreground">任务详情</div>
          {tasks.map((task, index) => {
            const status = getStatusMeta(task.status);
            const Icon = status.icon;
            return (
              <div key={task.taskId} className="rounded-lg border border-border/70 bg-background/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      任务 {index + 1}: {task.taskId}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className={cn('h-4 w-4', task.status === TaskStatus.RUNNING && 'animate-spin')} />
                      <Badge className={status.tone}>{status.text}</Badge>
                      {task.message && <span>{task.message}</span>}
                    </div>
                  </div>
                </div>

                {task.status === TaskStatus.RUNNING && task.progress !== undefined && (
                  <div className="mt-3">
                    <Progress value={Math.round(task.progress)} className="h-2" />
                  </div>
                )}

                {task.startTime && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    开始时间: {new Date(task.startTime).toLocaleTimeString('zh-CN')}
                    {task.endTime && (
                      <> | 耗时: {((task.endTime - task.startTime) / 1000).toFixed(1)} 秒</>
                    )}
                  </div>
                )}

                {task.error && (
                  <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    错误: {task.error}
                  </div>
                )}

                {task.result && (
                  <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    结果: {JSON.stringify(task.result)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </UICard>
  );
};

export const TaskStatusBadge: React.FC<{ task: TaskExecutionState }> = ({ task }) => {
  const status = getStatusMeta(task.status);
  return <Badge className={status.tone}>{task.message || task.taskId}</Badge>;
};
