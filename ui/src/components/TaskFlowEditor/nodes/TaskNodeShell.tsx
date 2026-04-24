import React from 'react';
import { Button as UIButton, Card as UICard, CardContent, Input, cn } from '@astribot/ui';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface TaskNodeShellProps {
  icon: React.ReactNode;
  iconClassName: string;
  toneClassName: string;
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  onLabelChange?: (value: string) => void;
  children?: React.ReactNode;
  collapsedSummary?: React.ReactNode;
  minWidthClassName?: string;
}

export const TaskNodeShell: React.FC<TaskNodeShellProps> = ({
  icon,
  iconClassName,
  toneClassName,
  label,
  collapsed,
  onToggle,
  onLabelChange,
  children,
  collapsedSummary,
  minWidthClassName = 'min-w-[180px]',
}) => {
  return (
    <UICard
      className={cn('border-2 shadow-sm', minWidthClassName, toneClassName)}
    >
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <div className={cn('shrink-0', iconClassName)}>{icon}</div>
          {onLabelChange ? (
            <Input
              value={label}
              onChange={(e) => onLabelChange(e.target.value)}
              className="h-8 border-0 bg-transparent px-0 font-semibold shadow-none focus-visible:ring-0"
            />
          ) : (
            <div className="flex-1 text-sm font-semibold text-foreground">{label}</div>
          )}
          <UIButton type="button" variant="ghost" size="icon" onClick={onToggle} className="h-7 w-7">
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </UIButton>
        </div>

        {!collapsed ? children : (
          <div className={cn('text-[11px] text-muted-foreground')}>
            {collapsedSummary}
          </div>
        )}
      </CardContent>
    </UICard>
  );
};
