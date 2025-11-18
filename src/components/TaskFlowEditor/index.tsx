import React, { useCallback } from 'react';
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
import { Button, Space, message } from 'antd';
import { SaveOutlined, UndoOutlined } from '@ant-design/icons';
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
    },
    [setNodes]
  );

  const handleSave = () => {
    try {
      const convertedTasks = flowToTasks(nodes, edges);
      onChange(convertedTasks);
      message.success(`已保存 ${convertedTasks.length} 个任务`);
    } catch (error) {
      message.error('保存失败: ' + (error as Error).message);
    }
  };

  const handleReset = () => {
    const initialFlow = tasksToFlow(tasks);
    setNodes(initialFlow.nodes);
    setEdges(initialFlow.edges);
    message.info('已重置到初始状态');
  };

  return (
    <div style={{ width: '100%', height: '600px', display: 'flex', gap: 12 }}>
      {/* 左侧任务选择面板 */}
      <TaskPalette />

      {/* 右侧流程编辑区域 */}
      <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 4, position: 'relative' }}>
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
        >
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
            style={{ backgroundColor: '#f0f0f0' }}
          />
          <Background gap={12} size={1} />

          {/* 顶部工具栏 */}
          <Panel position="top-right">
            <Space>
              <Button icon={<UndoOutlined />} onClick={handleReset} size="small">
                重置
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                size="small"
              >
                保存流程
              </Button>
            </Space>
          </Panel>
        </ReactFlow>
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
