import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@astribot/ui';
import { ListOrdered, Workflow } from 'lucide-react';
import { TaskConfig } from '@/types';
import { TaskConfigPanel } from './TaskConfigPanel';

interface TaskConfigurationModalProps {
  visible: boolean;
  tasks: TaskConfig[];
  onSave: (tasks: TaskConfig[]) => void;
  onCancel: () => void;
}

export const TaskConfigurationModal: React.FC<TaskConfigurationModalProps> = ({
  visible,
  tasks: initialTasks,
  onSave,
  onCancel,
}) => {
  const [tasks, setTasks] = useState<TaskConfig[]>(initialTasks);
  const [viewMode, setViewMode] = useState<'list' | 'flow'>('list');

  useEffect(() => {
    setTasks(initialTasks);
  }, [visible, initialTasks]);

  const handleSave = () => {
    onSave(tasks);
  };

  const handleCancel = () => {
    setTasks(initialTasks);
    onCancel();
  };

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-h-[calc(100vh-4rem)] overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>附加任务配置</DialogTitle>
          <DialogDescription>
            配置机器人到达目标点后需要执行的任务。当前优先保留列表编辑器，流程图编辑器待模板化后再恢复。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            支持多种任务类型，任务将按顺序执行。
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={viewMode === 'list' ? 'default' : 'outline'}
              onClick={() => setViewMode('list')}
            >
              <ListOrdered className="mr-2 h-4 w-4" />
              列表模式
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled
              onClick={() => setViewMode('flow')}
            >
              <Workflow className="mr-2 h-4 w-4" />
              流程图模式
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/70 bg-muted/10 p-4">
          {viewMode === 'list' ? (
            <TaskConfigPanel value={tasks} onChange={setTasks} />
          ) : (
            <div className="flex min-h-64 items-center justify-center">
              <Badge variant="secondary">流程图模式待迁移到模板组件后恢复</Badge>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button type="button" onClick={handleSave}>
            保存并返回
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
