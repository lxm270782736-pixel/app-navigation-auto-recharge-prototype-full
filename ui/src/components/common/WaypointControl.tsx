import React from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn } from '@astribot/ui';
import { ChevronDown, ChevronUp, Flag, ListOrdered, MapPinned, Route, Settings2, Trash2 } from 'lucide-react';
import type { Waypoint } from '@/types';

interface WaypointControlProps {
  waypointMode: boolean;
  onModeChange: (mode: boolean) => void;
  waypoints: Waypoint[];
  currentWaypointIndex: number;
  completedWaypoints: number[];
  selectedWaypointIndex?: number;
  onEditWaypoint: (index: number) => void;
  onDeleteWaypoint: (index: number) => void;
  onClearWaypoints: () => void;
  onMoveWaypoint: (fromIndex: number, toIndex: number) => void;
  onUpdateWaypointPose?: (index: number, x: number, y: number, theta: number) => void;
  isNavigating: boolean;
}

interface WaypointItemProps {
  waypoint: Waypoint;
  index: number;
  count: number;
  isCurrent: boolean;
  isCompleted: boolean;
  isSelected: boolean;
  isNavigating: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
}

const WaypointItem: React.FC<WaypointItemProps> = ({
  waypoint,
  index,
  count,
  isCurrent,
  isCompleted,
  isSelected,
  isNavigating,
  onEdit,
  onDelete,
  onMove,
}) => {
  const hasTask = waypoint.tasks && waypoint.tasks.length > 0;
  const navMode = waypoint.navigationMode || 'obstacle_avoidance';

  return (
    <div>
      <div
        className={cn(
          'flex items-start gap-3 border-b border-border/60 px-3 py-3 last:border-b-0',
          isCurrent && 'bg-emerald-500/10',
          isCompleted && 'bg-muted/20',
          isSelected && !isCurrent && 'border-l-4 border-l-amber-400 bg-amber-500/10 pl-2'
        )}
      >
        {!isNavigating && (
          <div className="flex shrink-0 flex-col">
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5" title="上移" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5" title="下移" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white',
            isCompleted ? 'bg-muted-foreground' : isCurrent ? 'bg-emerald-500' : 'bg-primary'
          )}
        >
          {index + 1}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="truncate font-mono text-xs text-foreground">
            ({waypoint.pose.x.toFixed(2)}, {waypoint.pose.y.toFixed(2)}, {((waypoint.pose.theta * 180) / Math.PI).toFixed(0)}°)
          </div>

          <div className="flex flex-wrap gap-1.5">
            {hasTask && (
              <Badge variant="secondary" className="gap-1">
                <ListOrdered className="h-3 w-3" />
                {waypoint.tasks!.length} 个任务
              </Badge>
            )}
            <Badge variant="secondary" className="gap-1">
              <Route className="h-3 w-3" />
              {navMode === 'obstacle_avoidance' ? '避障' : '局部'}
            </Badge>
            {isCurrent && <Badge className="bg-emerald-500/15 text-emerald-200">进行中</Badge>}
            {isCompleted && <Badge variant="secondary">已完成</Badge>}
          </div>
        </div>

        {!isNavigating && (
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-red-300" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export const WaypointControl: React.FC<WaypointControlProps> = ({
  waypointMode,
  onModeChange: _onModeChange,
  waypoints,
  currentWaypointIndex,
  completedWaypoints,
  selectedWaypointIndex = -1,
  onEditWaypoint,
  onDeleteWaypoint,
  onClearWaypoints,
  onMoveWaypoint,
  isNavigating,
}) => {
  const progress = waypoints.length > 0
    ? Math.round((completedWaypoints.length / waypoints.length) * 100)
    : 0;

  return (
    <Card className="border-border/70 bg-card/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">路径点管理</CardTitle>
          </div>
          <Badge variant="secondary">{waypoints.length} 个路径点</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {waypointMode && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-foreground">路径点列表</div>
              {waypoints.length > 0 && !isNavigating && (
                <Button type="button" variant="outline" size="sm" onClick={onClearWaypoints}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  清空
                </Button>
              )}
            </div>

            {waypoints.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                <MapPinned className="mx-auto mb-3 h-8 w-8 text-muted-foreground/70" />
                点击地图添加路径点。
              </div>
            ) : (
              <>
                {isNavigating && (currentWaypointIndex >= 0 || completedWaypoints.length > 0) && (
                  <div className="space-y-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-sky-100">巡航进度</span>
                      <span className="text-sky-100">
                        {currentWaypointIndex >= 0 ? currentWaypointIndex + 1 : completedWaypoints.length} / {waypoints.length}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary/80">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="max-h-64 overflow-y-auto rounded-lg border border-border/70 bg-muted/10">
                  {waypoints.map((waypoint, index) => (
                    <WaypointItem
                      key={index}
                      waypoint={waypoint}
                      index={index}
                      count={waypoints.length}
                      isCurrent={index === currentWaypointIndex}
                      isCompleted={completedWaypoints.includes(index)}
                      isSelected={index === selectedWaypointIndex}
                      isNavigating={isNavigating}
                      onEdit={() => onEditWaypoint(index)}
                      onDelete={() => onDeleteWaypoint(index)}
                      onMove={onMoveWaypoint}
                    />
                  ))}
                </div>
              </>
            )}

            {!isNavigating && (
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                <div className="mb-1 flex items-center gap-2">
                  <Flag className="h-3.5 w-3.5" />
                  点击地图添加路径点。
                </div>
                <div>巡航将按序号依次导航到每个路径点。</div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
