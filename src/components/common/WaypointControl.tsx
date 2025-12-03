import React from 'react';
import { Card, Button, List, Space, Tag, Radio, Progress, Empty } from 'antd';
import {
  DeleteOutlined,
  ClearOutlined,
  AimOutlined,
  EnvironmentOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

// 可排序的列表项组件
interface SortableWaypointItemProps {
  waypoint: Waypoint;
  index: number;
  isCurrent: boolean;
  isCompleted: boolean;
  isSelected: boolean;
  isNavigating: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUpdatePose?: (x: number, y: number, theta: number) => void;
}

const SortableWaypointItem: React.FC<SortableWaypointItemProps> = ({
  waypoint,
  index,
  isCurrent,
  isCompleted,
  isSelected,
  isNavigating,
  onEdit,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: index.toString() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasTask = waypoint.tasks && waypoint.tasks.length > 0;
  const navMode = waypoint.navigationMode || 'obstacle_avoidance';

  return (
    <div ref={setNodeRef} style={style}>
      <List.Item
        style={{
          padding: '8px 12px',
          background: isCurrent ? '#f6ffed' : isCompleted ? '#fafafa' : 'white',
          borderBottom: '1px solid #f0f0f0',
          cursor: isNavigating ? 'default' : 'move',
          // 选中的路径点添加橙色左边框高亮
          borderLeft: isSelected ? '4px solid #faad14' : '4px solid transparent',
          // 选中的路径点添加浅黄色背景
          ...(isSelected && !isCurrent && !isCompleted ? { background: '#fffbe6' } : {}),
        }}
        actions={[
          !isNavigating && (
            <Button
              key="edit"
              type="text"
              size="small"
              icon={<SettingOutlined />}
              onClick={onEdit}
              title="编辑"
            />
          ),
          !isNavigating && (
            <Button
              key="delete"
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={onDelete}
              title="删除"
            />
          ),
        ].filter(Boolean)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          {/* 拖拽手柄 */}
          {!isNavigating && (
            <div
              {...attributes}
              {...listeners}
              style={{
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
                color: '#999',
              }}
            >
              <HolderOutlined />
            </div>
          )}

          {/* 序号标记 */}
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: isCompleted ? '#999' : isCurrent ? '#52c41a' : '#1890ff',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
              flexShrink: 0,
            }}
          >
            {index + 1}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            {/* 坐标和方向 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                flex: 1,
                fontSize: '12px',
                color: '#262626',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                ({waypoint.pose.x.toFixed(2)}, {waypoint.pose.y.toFixed(2)}, {((waypoint.pose.theta * 180) / Math.PI).toFixed(0)}°)
              </div>
            </div>

            {/* 配置信息 + 状态标签 */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {hasTask && (
                <Tag
                  icon={<UnorderedListOutlined />}
                  color="blue"
                  style={{ margin: 0, fontSize: '10px' }}
                >
                  {waypoint.tasks!.length}个任务
                </Tag>
              )}
              <Tag
                icon={<ThunderboltOutlined />}
                color={navMode === 'obstacle_avoidance' ? 'green' : 'orange'}
                style={{ margin: 0, fontSize: '10px' }}
              >
                {navMode === 'obstacle_avoidance' ? '避障' : '局部'}
              </Tag>

              {/* 状态标签 - 显示在避障标签右边 */}
              {isCurrent && (
                <Tag color="processing" style={{ margin: 0, fontSize: '10px' }}>
                  进行中
                </Tag>
              )}
              {isCompleted && (
                <Tag color="default" style={{ margin: 0, fontSize: '10px' }}>
                  已完成
                </Tag>
              )}
            </div>
          </div>
        </div>
      </List.Item>
    </div>
  );
};

export const WaypointControl: React.FC<WaypointControlProps> = ({
  waypointMode,
  onModeChange,
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
  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 处理拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = parseInt(active.id as string);
      const newIndex = parseInt(over.id as string);
      onMoveWaypoint(oldIndex, newIndex);
    }
  };

  // 计算巡航进度
  const progress = waypoints.length > 0
    ? Math.round((completedWaypoints.length / waypoints.length) * 100)
    : 0;

  return (
    <Card
      title="导航模式"
      size="small"
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* 模式切换 */}
        <div>
          <div style={{ marginBottom: 8, fontSize: '13px', color: '#666' }}>
            选择导航模式
          </div>
          <Radio.Group
            value={waypointMode}
            onChange={(e) => onModeChange(e.target.value)}
            buttonStyle="solid"
            style={{ width: '100%' }}
            disabled={isNavigating}
          >
            <Radio.Button value={false} style={{ width: '50%', textAlign: 'center' }}>
              <AimOutlined /> 单点导航
            </Radio.Button>
            <Radio.Button value={true} style={{ width: '50%', textAlign: 'center' }}>
              <EnvironmentOutlined /> 多点巡航
            </Radio.Button>
          </Radio.Group>
        </div>

        {/* 多点模式信息 */}
        {waypointMode && (
          <>
            {/* 路径点列表 */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 500 }}>
                  路径点列表 ({waypoints.length})
                </span>
                {waypoints.length > 0 && !isNavigating && (
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<ClearOutlined />}
                    onClick={onClearWaypoints}
                  >
                    清空
                  </Button>
                )}
              </div>

              {waypoints.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="点击地图添加路径点"
                  style={{ margin: '16px 0' }}
                />
              ) : (
                <>
                  {/* 巡航进度（导航中显示） */}
                  {isNavigating && currentWaypointIndex >= 0 && (
                    <div
                      style={{
                        padding: '12px',
                        background: '#f0f9ff',
                        borderRadius: '4px',
                        marginBottom: 12,
                        border: '1px solid #91d5ff',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#1890ff' }}>
                          巡航进度
                        </span>
                        <span style={{ fontSize: '13px', color: '#666' }}>
                          {currentWaypointIndex + 1} / {waypoints.length}
                        </span>
                      </div>
                      <Progress
                        percent={progress}
                        status="active"
                        strokeColor={{
                          '0%': '#108ee9',
                          '100%': '#87d068',
                        }}
                        size="small"
                      />
                    </div>
                  )}

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={waypoints.map((_, index) => index.toString())}
                      strategy={verticalListSortingStrategy}
                      disabled={isNavigating}
                    >
                      <List
                        size="small"
                        dataSource={waypoints}
                        style={{
                          maxHeight: '240px',
                          overflowY: 'auto',
                          border: '1px solid #f0f0f0',
                          borderRadius: '4px',
                        }}
                        renderItem={(waypoint, index) => (
                          <SortableWaypointItem
                            key={index}
                            waypoint={waypoint}
                            index={index}
                            isCurrent={index === currentWaypointIndex}
                            isCompleted={completedWaypoints.includes(index)}
                            isSelected={index === selectedWaypointIndex}
                            isNavigating={isNavigating}
                            onEdit={() => onEditWaypoint(index)}
                            onDelete={() => onDeleteWaypoint(index)}
                          />
                        )}
                      />
                    </SortableContext>
                  </DndContext>
                </>
              )}
            </div>

            {/* 操作提示 */}
            {!isNavigating && (
              <div
                style={{
                  fontSize: '12px',
                  color: '#8c8c8c',
                  padding: '8px 12px',
                  background: '#fafafa',
                  borderRadius: '4px',
                  lineHeight: '1.6',
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  <EnvironmentOutlined style={{ marginRight: 4 }} />
                  点击地图添加路径点
                </div>
                <div>
                  巡航将按序号依次导航到每个路径点
                </div>
              </div>
            )}
          </>
        )}
      </Space>
    </Card>
  );
};
