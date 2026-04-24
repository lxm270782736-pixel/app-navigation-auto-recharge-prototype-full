import React, { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './TaskFlowEditor.css';
import { Button as UIButton, cn } from '@astribot/ui';
import { RotateCcw, Save, Trash2 } from 'lucide-react';
import { TaskConfig } from '@/types';
import { flowToTasks, tasksToFlow } from './utils/converter';
import { WaitTaskNode } from './nodes/WaitTaskNode';
import { PhotoTaskNode } from './nodes/PhotoTaskNode';
import { TrajectoryTaskNode } from './nodes/TrajectoryTaskNode';
import { ScanTaskNode } from './nodes/ScanTaskNode';
import { InspectTaskNode } from './nodes/InspectTaskNode';
import { SoundTaskNode } from './nodes/SoundTaskNode';
import { DisplayTaskNode } from './nodes/DisplayTaskNode';
import { SignalTaskNode } from './nodes/SignalTaskNode';
import { ParallelNode } from './nodes/ParallelNode';
import { ConditionalNode } from './nodes/ConditionalNode';
import { TaskPalette } from './TaskPalette';

interface TaskFlowEditorProps {
  tasks: TaskConfig[];
  onChange: (tasks: TaskConfig[]) => void;
}

const nodeTypes = {
  waitTask: WaitTaskNode,
  photoTask: PhotoTaskNode,
  trajectoryTask: TrajectoryTaskNode,
  scanTask: ScanTaskNode,
  inspectTask: InspectTaskNode,
  soundTask: SoundTaskNode,
  displayTask: DisplayTaskNode,
  signalTask: SignalTaskNode,
  parallel: ParallelNode,
  conditional: ConditionalNode,
};

export const TaskFlowEditor: React.FC<TaskFlowEditorProps> = ({ tasks, onChange }) => {
  const initialFlow = tasksToFlow(tasks);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);

  // 监听键盘事件删除选中的节点和连接
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // 删除选中的节点
        setNodes((nds) => nds.filter((node) => !node.selected));

        // 删除选中的边
        setEdges((eds) => eds.filter((edge) => !edge.selected));

        const hasSelectedItems = nodes.some(n => n.selected) || edges.some(e => e.selected);
        if (hasSelectedItems) {
          setNotice({ tone: 'success', text: '已删除选中项' });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [nodes, edges, setNodes, setEdges]);

  // 删除选中项的处理函数
  const handleDelete = useCallback(() => {
    const selectedNodes = nodes.filter((node) => node.selected);
    const selectedEdges = edges.filter((edge) => edge.selected);

    if (selectedNodes.length === 0 && selectedEdges.length === 0) {
      setNotice({ tone: 'info', text: '请先选中要删除的节点或连接线' });
      return;
    }

    // 删除选中的节点和边
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));

    setNotice({ tone: 'success', text: `已删除 ${selectedNodes.length} 个节点和 ${selectedEdges.length} 条连接线` });
  }, [nodes, edges, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const taskType = event.dataTransfer.getData('application/reactflow');
      if (!taskType) return;

      const position = {
        x: event.clientX - 250,
        y: event.clientY - 100,
      };

      const newNode: Node = {
        id: `${taskType}-${Date.now()}`,
        type: taskType,
        position,
        data: getDefaultNodeData(taskType),
      };

      setNodes((nds) => nds.concat(newNode));

      // 检查是否存在 start→end 的直接连接,如果存在则删除
      setEdges((eds) => eds.filter((edge) => !(edge.source === 'start' && edge.target === 'end')));
    },
    [setNodes, setEdges]
  );

  const handleSave = () => {
    try {
      const convertedTasks = flowToTasks(nodes, edges);
      onChange(convertedTasks);
      setNotice({ tone: 'success', text: `已保存 ${convertedTasks.length} 个任务` });
    } catch (error) {
      setNotice({ tone: 'error', text: '保存失败: ' + (error as Error).message });
    }
  };

  const handleReset = () => {
    const initialFlow = tasksToFlow(tasks);
    setNodes(initialFlow.nodes);
    setEdges(initialFlow.edges);
    setNotice({ tone: 'info', text: '已重置到初始状态' });
  };

  return (
    <div className="flex h-[600px] w-full gap-3">
      {/* 左侧任务选择面板 */}
      <TaskPalette />

      {/* 右侧流程编辑区域 */}
      <div className="relative flex-1 overflow-hidden rounded-lg border border-border/70 bg-card/80">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
          deleteKeyCode={['Delete', 'Backspace']}
          multiSelectionKeyCode="Shift"
          selectNodesOnDrag={false}
        >
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
            className="bg-muted/50"
          />
          <Background gap={12} size={1} />

          {/* 顶部工具栏 */}
          <Panel position="top-right">
            <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/95 p-2 shadow-sm">
              <UIButton
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除选中
              </UIButton>
              <UIButton type="button" variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                重置
              </UIButton>
              <UIButton type="button" size="sm" onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />
                保存流程
              </UIButton>
            </div>
          </Panel>
        </ReactFlow>
        {notice && (
          <div
            className={cn(
              'absolute bottom-4 left-4 z-20 rounded-lg border px-3 py-2 text-sm shadow-sm',
              notice.tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
              notice.tone === 'error' && 'border-destructive/40 bg-destructive/10 text-destructive',
              notice.tone === 'info' && 'border-sky-500/30 bg-sky-500/10 text-sky-200'
            )}
          >
            {notice.text}
          </div>
        )}
      </div>
    </div>
  );
};

// 获取默认节点数据
function getDefaultNodeData(taskType: string): any {
  switch (taskType) {
    case 'waitTask':
      return { duration: 5, label: '等待' };
    case 'photoTask':
      return { count: 1, resolution: '1920x1080', label: '拍照' };
    case 'trajectoryTask':
      return { trajectoryId: 'trajectory_1', label: '执行轨迹' };
    case 'scanTask':
      return { scanType: '3d', duration: 5, label: '扫描' };
    case 'inspectTask':
      return { targetType: 'person', confidenceThreshold: 0.7, label: '检测' };
    case 'soundTask':
      return { text: '', volume: 70, label: '播放声音' };
    case 'displayTask':
      return { message: '', duration: 5, label: '显示信息' };
    case 'signalTask':
      return { pattern: 'blink', color: 'green', duration: 3, label: '信号灯' };
    case 'parallel':
      return { label: '并行执行' };
    case 'conditional':
      return { condition: '', label: '条件分支' };
    default:
      return { label: '任务' };
  }
}
