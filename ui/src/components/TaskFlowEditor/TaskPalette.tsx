import React, { useMemo, useState } from 'react';
import {
  Card as UICard,
  CardContent,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from '@astribot/ui';
import { ChevronDown } from 'lucide-react';
import './TaskPalette.css';

const taskCategories = {
  basic: {
    label: '基础任务',
    tasks: [
      { type: 'waitTask', label: '等待停留', icon: '⏱️', tone: 'border-sky-500/50 bg-sky-500/10' },
      { type: 'photoTask', label: '拍照', icon: '📷', tone: 'border-emerald-500/50 bg-emerald-500/10' },
      { type: 'trajectoryTask', label: '执行轨迹', icon: '🔄', tone: 'border-primary/50 bg-primary/10' },
    ],
  },
  perception: {
    label: '感知任务',
    tasks: [
      { type: 'scanTask', label: '环境扫描', icon: '🔍', tone: 'border-cyan-500/50 bg-cyan-500/10' },
      { type: 'inspectTask', label: '目标检测', icon: '👁️', tone: 'border-rose-500/50 bg-rose-500/10' },
    ],
  },
  interaction: {
    label: '交互任务',
    tasks: [
      { type: 'soundTask', label: '播放声音', icon: '🔊', tone: 'border-orange-500/50 bg-orange-500/10' },
      { type: 'displayTask', label: '显示信息', icon: '📺', tone: 'border-amber-500/50 bg-amber-500/10' },
      { type: 'signalTask', label: '信号灯', icon: '💡', tone: 'border-yellow-500/50 bg-yellow-500/10' },
    ],
  },
  control: {
    label: '控制流',
    tasks: [
      { type: 'parallel', label: '并行执行', icon: '⚡', tone: 'border-destructive/50 bg-destructive/10' },
      { type: 'conditional', label: '条件分支', icon: '🔀', tone: 'border-orange-500/50 bg-orange-500/10' },
    ],
  },
} as const;

export const TaskPalette: React.FC = () => {
  const defaultOpen = useMemo(
    () => Object.keys(taskCategories).reduce<Record<string, boolean>>((acc, key) => {
      acc[key] = true;
      return acc;
    }, {}),
    []
  );
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(defaultOpen);

  const onDragStart = (event: React.DragEvent, taskType: string) => {
    event.dataTransfer.setData('application/reactflow', taskType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <UICard className="h-full w-[220px] overflow-auto border-border/70 bg-card/90">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">任务工具箱</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-3 pt-0">
        <div className="text-xs text-muted-foreground">拖拽任务到右侧画布</div>

        {Object.entries(taskCategories).map(([key, category]) => {
          const open = openSections[key] ?? true;
          return (
            <Collapsible
              key={key}
              open={open}
              onOpenChange={(value) => setOpenSections((prev) => ({ ...prev, [key]: value }))}
            >
              <div className="rounded-lg border border-border/70 bg-background/60">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-foreground">
                  <span>{category.label}</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="task-palette-items border-t border-border/60 px-2 pb-2 pt-1">
                    {category.tasks.map((task) => (
                      <div
                        key={task.type}
                        className={cn('palette-item rounded-md border', task.tone)}
                        draggable
                        onDragStart={(e) => onDragStart(e, task.type)}
                      >
                        <span className="palette-icon">{task.icon}</span>
                        <span className="palette-label">{task.label}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </CardContent>
    </UICard>
  );
};
