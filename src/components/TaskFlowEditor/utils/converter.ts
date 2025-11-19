import { Node, Edge } from 'reactflow';
import { TaskConfig, TaskType } from '@/types';

/**
 * 将TaskConfig数组转换为React Flow的节点和边
 */
export function tasksToFlow(tasks: TaskConfig[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 总是创建起始节点
  nodes.push({
    id: 'start',
    type: 'input',
    position: { x: 250, y: 50 },
    data: { label: '🚀 开始' },
  });

  if (tasks.length === 0) {
    // 即使没有任务,也创建结束节点
    nodes.push({
      id: 'end',
      type: 'output',
      position: { x: 250, y: 200 },
      data: { label: '✅ 结束' },
    });

    edges.push({
      id: 'edge-start-end',
      source: 'start',
      target: 'end',
      animated: true,
      style: { strokeDasharray: '5 5', stroke: '#d9d9d9' }, // 虚线样式
    });

    return { nodes, edges };
  }

  let yOffset = 150;
  let previousId = 'start';

  tasks.forEach((task, index) => {
    const nodeId = `task-${index}`;
    const nodeType = getNodeTypeFromTask(task.type);

    // 创建任务节点
    nodes.push({
      id: nodeId,
      type: nodeType,
      position: { x: 250, y: yOffset },
      data: {
        ...task.params,
        label: task.name || getTaskTypeName(task.type),
      },
    });

    // 创建连接边
    edges.push({
      id: `edge-${previousId}-${nodeId}`,
      source: previousId,
      target: nodeId,
      animated: true,
    });

    previousId = nodeId;
    yOffset += 180;
  });

  // 创建结束节点
  nodes.push({
    id: 'end',
    type: 'output',
    position: { x: 250, y: yOffset },
    data: { label: '✅ 结束' },
  });

  edges.push({
    id: `edge-${previousId}-end`,
    source: previousId,
    target: 'end',
    animated: true,
  });

  return { nodes, edges };
}

/**
 * 将React Flow的节点和边转换为TaskConfig数组
 */
export function flowToTasks(nodes: Node[], edges: Edge[]): TaskConfig[] {
  const tasks: TaskConfig[] = [];

  // 找到起始节点
  const startNode = nodes.find((n) => n.type === 'input' || n.id === 'start');
  if (!startNode) {
    // 如果没有起始节点,尝试收集所有非起始/结束节点
    console.warn('未找到起始节点,将收集所有任务节点');
    nodes.forEach((node) => {
      if (node.type !== 'input' && node.type !== 'output') {
        const task = nodeToTask(node);
        if (task) {
          tasks.push(task);
        }
      }
    });
    return tasks;
  }

  // 从起始节点开始深度优先遍历
  const visited = new Set<string>();

  function traverse(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // 跳过起始和结束节点
    if (node.type === 'input' || node.type === 'output') {
      // 继续遍历子节点
      const childEdges = edges.filter((e) => e.source === nodeId);
      childEdges.forEach((edge) => traverse(edge.target));
      return;
    }

    // 将节点转换为任务配置
    const task = nodeToTask(node);
    if (task) {
      tasks.push(task);
    }

    // 查找子节点
    const childEdges = edges.filter((e) => e.source === nodeId);

    // 如果是并行节点
    if (node.type === 'parallel') {
      const parallelTasks: TaskConfig[] = [];
      childEdges.forEach((edge) => {
        const branchTasks = getBranchTasks(edge.target, nodes, edges, visited);
        parallelTasks.push(...branchTasks);
      });

      if (parallelTasks.length > 0) {
        tasks.push({
          type: TaskType.PARALLEL,
          name: '并行执行',
          params: {
            tasks: parallelTasks,
            waitForAll: true,
          },
        });
      }
    }
    // 如果是条件节点
    else if (node.type === 'conditional') {
      const trueBranch = childEdges.find((e) => e.sourceHandle === 'true');
      const falseBranch = childEdges.find((e) => e.sourceHandle === 'false');

      const trueTasks = trueBranch ? getBranchTasks(trueBranch.target, nodes, edges, visited) : [];
      const falseTasks = falseBranch ? getBranchTasks(falseBranch.target, nodes, edges, visited) : [];

      tasks.push({
        type: TaskType.CONDITIONAL,
        name: '条件分支',
        params: {
          condition: node.data.condition || '',
          trueBranch: trueTasks,
          falseBranch: falseTasks,
        } as any, // Use any to bypass strict type checking for conditional params
      });
    }
    // 普通顺序节点
    else {
      childEdges.forEach((edge) => traverse(edge.target));
    }
  }

  traverse(startNode.id);
  return tasks;
}

/**
 * 获取分支中的所有任务
 */
function getBranchTasks(
  startNodeId: string,
  nodes: Node[],
  edges: Edge[],
  visited: Set<string>
): TaskConfig[] {
  const branchTasks: TaskConfig[] = [];
  const branchVisited = new Set<string>();

  function traverseBranch(nodeId: string) {
    if (branchVisited.has(nodeId) || visited.has(nodeId)) return;
    branchVisited.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.type === 'input' || node.type === 'output') return;

    const task = nodeToTask(node);
    if (task) {
      branchTasks.push(task);
    }

    const childEdges = edges.filter((e) => e.source === nodeId);
    childEdges.forEach((edge) => traverseBranch(edge.target));
  }

  traverseBranch(startNodeId);
  return branchTasks;
}

/**
 * 将节点转换为任务配置
 */
function nodeToTask(node: Node): TaskConfig | null {
  const taskType = getTaskTypeFromNode(node.type || '');
  if (!taskType) return null;

  const params = { ...node.data };
  delete params.label;

  return {
    type: taskType,
    name: node.data.label || '',
    params,
  };
}

/**
 * 从任务类型获取节点类型
 */
function getNodeTypeFromTask(taskType: TaskType): string {
  const mapping: Record<string, string> = {
    [TaskType.WAIT]: 'waitTask',
    [TaskType.PHOTO]: 'photoTask',
    [TaskType.TRAJECTORY]: 'trajectoryTask',
    [TaskType.SCAN]: 'scanTask',
    [TaskType.INSPECT]: 'inspectTask',
    [TaskType.SOUND]: 'soundTask',
    [TaskType.DISPLAY]: 'displayTask',
    [TaskType.SIGNAL]: 'signalTask',
    [TaskType.PARALLEL]: 'parallel',
    [TaskType.CONDITIONAL]: 'conditional',
  };
  return mapping[taskType] || 'waitTask';
}

/**
 * 从节点类型获取任务类型
 */
function getTaskTypeFromNode(nodeType: string): TaskType | null {
  const mapping: Record<string, TaskType> = {
    waitTask: TaskType.WAIT,
    photoTask: TaskType.PHOTO,
    trajectoryTask: TaskType.TRAJECTORY,
    scanTask: TaskType.SCAN,
    inspectTask: TaskType.INSPECT,
    soundTask: TaskType.SOUND,
    displayTask: TaskType.DISPLAY,
    signalTask: TaskType.SIGNAL,
    parallel: TaskType.PARALLEL,
    conditional: TaskType.CONDITIONAL,
  };
  return mapping[nodeType] || null;
}

/**
 * 获取任务类型名称
 */
function getTaskTypeName(type: TaskType): string {
  const names: Record<string, string> = {
    [TaskType.WAIT]: '等待',
    [TaskType.PHOTO]: '拍照',
    [TaskType.TRAJECTORY]: '执行轨迹',
    [TaskType.SCAN]: '环境扫描',
    [TaskType.INSPECT]: '目标检测',
    [TaskType.SOUND]: '播放声音',
    [TaskType.DISPLAY]: '显示信息',
    [TaskType.SIGNAL]: '信号灯',
    [TaskType.PARALLEL]: '并行执行',
    [TaskType.CONDITIONAL]: '条件分支',
  };
  return names[type] || type;
}
