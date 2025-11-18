# Scratch式可视化任务编辑器 - 开源方案调研

## 🎯 需求分析

### 当前需求
1. **类似Scratch的拖拽积木式编程界面**
2. **支持逻辑操作**（条件、循环）
3. **支持并行执行**
4. **可视化任务流程**
5. **与现有任务系统集成**

### 目标效果
```
┌─────────────────────────────────────────┐
│  任务编辑器                              │
├─────────────────────────────────────────┤
│                                         │
│  🟦 开始                                │
│   └─→ 🟩 等待 5秒                      │
│        └─→ 🟨 拍照 3张                 │
│             ├─→ 🟧 扫描 3D             │
│             └─→ 🟪 播放声音           │  ← 并行
│                  └─→ 🟥 结束          │
│                                         │
└─────────────────────────────────────────┘
```

## 📦 开源方案推荐

### 方案1: React Flow ⭐⭐⭐⭐⭐ (强烈推荐)

**项目地址**: https://github.com/xyflow/xyflow
**官网**: https://reactflow.dev
**许可证**: MIT
**Stars**: 23k+
**最新更新**: 活跃维护中（2024）

#### 核心特性

✅ **完全开箱即用**
- 拖拽节点
- 缩放/平移
- 多选节点
- 连接节点
- 自定义节点类型

✅ **高度可定制**
- 自定义节点样式
- 自定义边（连接线）
- 自定义控制器
- 插件系统

✅ **性能优秀**
- 支持大规模节点（1000+）
- 虚拟渲染
- React 18+支持

✅ **完善的文档和示例**
- 详细API文档
- 丰富的示例代码
- 活跃的社区

#### 安装

```bash
npm install reactflow
# 或
npm install @xyflow/react
```

#### 基础使用示例

```tsx
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background
} from 'reactflow';
import 'reactflow/dist/style.css';

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'input',
    data: { label: '开始' },
    position: { x: 250, y: 5 },
  },
  {
    id: '2',
    data: { label: '等待 5秒' },
    position: { x: 100, y: 100 },
  },
  {
    id: '3',
    data: { label: '拍照 3张' },
    position: { x: 400, y: 100 },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e1-3', source: '1', target: '3', animated: true },
];

function TaskFlowEditor() {
  return (
    <div style={{ width: '100%', height: '600px' }}>
      <ReactFlow
        nodes={initialNodes}
        edges={initialEdges}
        fitView
      >
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}
```

#### 自定义任务节点

```tsx
import { Handle, Position } from 'reactflow';

// 等待任务节点
function WaitTaskNode({ data }) {
  return (
    <div className="task-node wait-task">
      <Handle type="target" position={Position.Top} />
      <div className="task-icon">⏱️</div>
      <div className="task-title">等待</div>
      <div className="task-params">{data.duration}秒</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// 拍照任务节点
function PhotoTaskNode({ data }) {
  return (
    <div className="task-node photo-task">
      <Handle type="target" position={Position.Top} />
      <div className="task-icon">📷</div>
      <div className="task-title">拍照</div>
      <div className="task-params">{data.count}张</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// 并行任务节点
function ParallelTaskNode({ data }) {
  return (
    <div className="task-node parallel-task">
      <Handle type="target" position={Position.Top} />
      <div className="task-icon">⚡</div>
      <div className="task-title">并行执行</div>
      <Handle type="source" position={Position.Bottom} id="a" />
      <Handle type="source" position={Position.Bottom} id="b" />
    </div>
  );
}

// 注册自定义节点
const nodeTypes = {
  waitTask: WaitTaskNode,
  photoTask: PhotoTaskNode,
  parallelTask: ParallelTaskNode,
};

<ReactFlow nodeTypes={nodeTypes} ... />
```

#### 优点

✅ **灵活性极高** - 可以完全自定义节点外观和行为
✅ **性能优秀** - 经过大量项目验证
✅ **社区活跃** - 问题响应快，更新频繁
✅ **文档完善** - 有详细的指南和示例
✅ **易于集成** - React生态，与现有项目完美融合
✅ **可视化直观** - 流程图式的表达，易于理解

#### 缺点

⚠️ **不是积木式** - 是节点连线式，不是Scratch的积木堆叠式
⚠️ **需要自行实现逻辑** - 条件、循环等需要自己设计节点

#### 适合场景

- ✅ 复杂任务流程编排
- ✅ 有分支和并行的工作流
- ✅ 需要可视化展示任务依赖关系
- ✅ 专业用户使用

---

### 方案2: Google Blockly + react-blockly ⭐⭐⭐⭐

**项目地址**: https://github.com/google/blockly
**React封装**: https://github.com/nbudin/react-blockly
**许可证**: Apache 2.0
**最新更新**: 活跃维护中

#### 核心特性

✅ **真正的Scratch风格**
- 积木块堆叠
- 拖拽组合
- 颜色编码
- 类型检查

✅ **强大的定制能力**
- 自定义积木块
- 自定义工具箱
- 自定义生成器

✅ **久经考验**
- Google维护
- Scratch的基础
- 教育领域广泛使用

#### 安装

```bash
npm install react-blockly blockly
```

#### 基础使用示例

```tsx
import { BlocklyWorkspace } from 'react-blockly';
import Blockly from 'blockly';

// 定义工具箱
const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: '基础任务',
      colour: '#5C81A6',
      contents: [
        { kind: 'block', type: 'task_wait' },
        { kind: 'block', type: 'task_photo' },
        { kind: 'block', type: 'task_trajectory' },
      ],
    },
    {
      kind: 'category',
      name: '控制',
      colour: '#FFAB19',
      contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'controls_repeat' },
      ],
    },
    {
      kind: 'category',
      name: '逻辑',
      colour: '#5CA65C',
      contents: [
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
      ],
    },
  ],
};

function TaskBlocklyEditor() {
  const [xml, setXml] = React.useState('');

  return (
    <BlocklyWorkspace
      toolboxConfiguration={toolbox}
      initialXml={xml}
      onXmlChange={setXml}
      workspaceConfiguration={{
        grid: {
          spacing: 20,
          length: 3,
          colour: '#ccc',
          snap: true,
        },
      }}
    />
  );
}
```

#### 自定义任务块

```javascript
// 定义等待任务块
Blockly.Blocks['task_wait'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("⏱️ 等待")
        .appendField(new Blockly.FieldNumber(5, 1, 60), "DURATION")
        .appendField("秒");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(230);
    this.setTooltip("等待指定时间");
  }
};

// 定义拍照任务块
Blockly.Blocks['task_photo'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("📷 拍照")
        .appendField(new Blockly.FieldNumber(1, 1, 10), "COUNT")
        .appendField("张");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(160);
  }
};

// 定义并行任务块
Blockly.Blocks['task_parallel'] = {
  init: function() {
    this.appendStatementInput("BRANCH1")
        .appendField("⚡ 并行执行分支1");
    this.appendStatementInput("BRANCH2")
        .appendField("分支2");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(65);
  }
};

// 代码生成器（转换为任务配置）
Blockly.JavaScript['task_wait'] = function(block) {
  const duration = block.getFieldValue('DURATION');
  return `{ type: 'wait', params: { duration: ${duration} } },\n`;
};
```

#### 优点

✅ **真正的Scratch风格** - 积木堆叠，直观易懂
✅ **内置逻辑控制** - if/else、循环等开箱即用
✅ **久经考验** - Google维护，稳定可靠
✅ **适合非技术用户** - 学习曲线平缓
✅ **类型安全** - 积木连接有类型检查

#### 缺点

⚠️ **学习曲线** - 自定义积木需要学习Blockly API
⚠️ **样式定制** - 外观定制相对复杂
⚠️ **React集成** - react-blockly维护不够活跃
⚠️ **文件体积** - 比较大（~500KB）

#### 适合场景

- ✅ 面向非技术用户
- ✅ 教育/培训场景
- ✅ 简单的顺序任务流程
- ✅ 需要真正的Scratch体验

---

### 方案3: Flume ⭐⭐⭐⭐

**项目地址**: https://github.com/chrisjpatty/flume
**官网**: https://flume.dev
**许可证**: MIT
**Stars**: 1.5k+

#### 核心特性

✅ **专注业务逻辑**
- 保证逻辑有效性
- 不会创建无效连接
- 内置验证

✅ **React优先**
- 完全为React设计
- TypeScript支持
- Hooks API

✅ **美观的UI**
- 现代化设计
- 平滑动画
- 可定制主题

#### 安装

```bash
npm install flume
```

#### 基础使用

```tsx
import { NodeEditor, FlumeConfig, Controls, Colors } from 'flume';

// 配置节点类型
const flumeConfig = new FlumeConfig()
  .addPortType({
    type: "task",
    name: "task",
    label: "任务",
    color: Colors.blue,
    controls: [
      Controls.text({
        name: "taskName",
        label: "任务名称"
      })
    ]
  })
  .addNodeType({
    type: "wait",
    label: "等待",
    description: "等待指定时间",
    inputs: ports => [ports.task()],
    outputs: ports => [ports.task()],
    initialWidth: 170,
  })
  .addNodeType({
    type: "photo",
    label: "拍照",
    inputs: ports => [ports.task()],
    outputs: ports => [ports.task()],
  });

function TaskFlumeEditor() {
  const [nodes, setNodes] = React.useState({});

  return (
    <NodeEditor
      portTypes={flumeConfig.portTypes}
      nodeTypes={flumeConfig.nodeTypes}
      nodes={nodes}
      onChange={setNodes}
    />
  );
}
```

#### 优点

✅ **专注业务逻辑** - 设计目标就是提取业务逻辑
✅ **保证有效性** - 不会创建无效的连接
✅ **React优先** - API设计友好
✅ **美观** - 现代化的UI设计

#### 缺点

⚠️ **相对小众** - 社区较小
⚠️ **文档较少** - 示例不够丰富
⚠️ **更新频率** - 不如React Flow频繁

#### 适合场景

- ✅ 需要保证逻辑正确性
- ✅ 中等复杂度的工作流
- ✅ 注重UI美观

---

### 方案4: Rete.js ⭐⭐⭐

**项目地址**: https://github.com/retejs/rete
**官网**: https://rete.js.org
**许可证**: MIT
**Stars**: 10k+

#### 核心特性

✅ **框架无关** - 支持React、Vue、Angular、Svelte
✅ **模块化设计** - 插件系统
✅ **数据流编程** - 类似UE蓝图

#### 缺点

⚠️ **学习曲线陡** - 概念较复杂
⚠️ **文档不够友好** - 需要花时间学习
⚠️ **样式较老** - UI不够现代化

---

## 🎯 方案对比

| 特性 | React Flow | Blockly | Flume | Rete.js |
|------|-----------|---------|-------|---------|
| Scratch风格 | ❌ 节点连线 | ✅ 积木堆叠 | ❌ 节点连线 | ❌ 节点连线 |
| 并行支持 | ✅ 优秀 | ✅ 可实现 | ✅ 优秀 | ✅ 优秀 |
| 条件逻辑 | ✅ 可实现 | ✅ 内置 | ✅ 可实现 | ✅ 可实现 |
| 循环控制 | ✅ 可实现 | ✅ 内置 | ✅ 可实现 | ✅ 可实现 |
| 易用性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 文档质量 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| 社区活跃度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| React集成 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 性能 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 定制性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 文件体积 | ~100KB | ~500KB | ~80KB | ~120KB |
| 学习曲线 | 平缓 | 中等 | 平缓 | 陡峭 |

## 💡 推荐方案

### 推荐1: React Flow (优先推荐)

**理由**:
1. ✅ **最活跃的社区** - 23k+ stars，频繁更新
2. ✅ **完善的文档** - 大量示例和教程
3. ✅ **性能优秀** - 经过大量项目验证
4. ✅ **灵活性最高** - 可以实现任何布局和逻辑
5. ✅ **React生态** - 与现有项目无缝集成

**适合你的项目因为**:
- 可以设计专业的任务流程图
- 支持复杂的并行和条件逻辑
- 可以可视化展示任务依赖关系
- 易于与现有TaskConfig系统集成

### 推荐2: Google Blockly (如果需要真正的Scratch风格)

**理由**:
1. ✅ **真正的Scratch风格** - 积木堆叠
2. ✅ **内置逻辑控制** - if/else、循环开箱即用
3. ✅ **适合非技术用户** - 学习曲线平缓

**适合你的项目如果**:
- 用户是非技术人员
- 需要真正的积木式编程体验
- 任务流程相对简单（顺序为主）

## 🚀 实施建议

### 方案A: 使用React Flow（推荐）

```bash
# 安装
npm install reactflow

# 项目结构
src/
  components/
    TaskFlowEditor/
      index.tsx              # 主编辑器组件
      nodes/                 # 自定义节点
        WaitTaskNode.tsx
        PhotoTaskNode.tsx
        ParallelNode.tsx
        ConditionalNode.tsx
      edges/                 # 自定义连线
      utils/                 # 工具函数
        flowToTasks.ts       # 流程图转任务配置
        tasksToFlow.ts       # 任务配置转流程图
```

### 实施步骤

#### 第1步: 创建基础编辑器

```tsx
// src/components/TaskFlowEditor/index.tsx
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap
} from 'reactflow';
import 'reactflow/dist/style.css';

export const TaskFlowEditor = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = (params: Connection) => {
    setEdges((eds) => addEdge(params, eds));
  };

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
    </div>
  );
};
```

#### 第2步: 创建任务节点

```tsx
// src/components/TaskFlowEditor/nodes/WaitTaskNode.tsx
import { Handle, Position } from 'reactflow';
import { Card, InputNumber } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';

export function WaitTaskNode({ data, id }) {
  const [duration, setDuration] = React.useState(data.duration || 5);

  return (
    <Card
      size="small"
      style={{
        minWidth: 180,
        backgroundColor: '#e3f2fd',
        border: '2px solid #1976d2'
      }}
    >
      <Handle type="target" position={Position.Top} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClockCircleOutlined style={{ fontSize: 20, color: '#1976d2' }} />
        <div>
          <div style={{ fontWeight: 'bold' }}>等待</div>
          <InputNumber
            size="small"
            min={1}
            max={60}
            value={duration}
            onChange={setDuration}
            addonAfter="秒"
          />
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </Card>
  );
}
```

#### 第3步: 创建并行节点

```tsx
// src/components/TaskFlowEditor/nodes/ParallelNode.tsx
export function ParallelNode({ data }) {
  return (
    <Card
      size="small"
      style={{
        minWidth: 200,
        backgroundColor: '#fff3e0',
        border: '2px solid #f57c00'
      }}
    >
      <Handle type="target" position={Position.Top} />

      <div style={{ textAlign: 'center' }}>
        <ThunderboltOutlined style={{ fontSize: 24, color: '#f57c00' }} />
        <div style={{ fontWeight: 'bold', marginTop: 4 }}>并行执行</div>
      </div>

      {/* 多个输出端口 */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="branch-1"
        style={{ left: '33%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="branch-2"
        style={{ left: '66%' }}
      />
    </Card>
  );
}
```

#### 第4步: 工具面板

```tsx
// 侧边工具面板
const TaskPalette = () => {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="task-palette">
      <h3>任务类型</h3>

      <div className="task-category">
        <h4>基础任务</h4>
        <div
          draggable
          onDragStart={(e) => onDragStart(e, 'wait')}
          className="palette-item"
        >
          ⏱️ 等待
        </div>
        <div
          draggable
          onDragStart={(e) => onDragStart(e, 'photo')}
          className="palette-item"
        >
          📷 拍照
        </div>
      </div>

      <div className="task-category">
        <h4>控制流</h4>
        <div
          draggable
          onDragStart={(e) => onDragStart(e, 'parallel')}
          className="palette-item"
        >
          ⚡ 并行
        </div>
        <div
          draggable
          onDragStart((e) => onDragStart(e, 'conditional')}
          className="palette-item"
        >
          🔀 条件
        </div>
      </div>
    </div>
  );
};
```

#### 第5步: 转换逻辑

```typescript
// src/components/TaskFlowEditor/utils/flowToTasks.ts

/**
 * 将React Flow图转换为TaskConfig数组
 */
export function flowToTasks(nodes: Node[], edges: Edge[]): TaskConfig[] {
  // 找到起始节点
  const startNode = nodes.find(n => n.type === 'start');
  if (!startNode) return [];

  const tasks: TaskConfig[] = [];
  const visited = new Set<string>();

  // 深度优先遍历
  function traverse(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // 转换节点为任务配置
    const task = nodeToTask(node);
    if (task) {
      tasks.push(task);
    }

    // 查找子节点
    const childEdges = edges.filter(e => e.source === nodeId);

    // 如果是并行节点，创建并行任务
    if (node.type === 'parallel') {
      const parallelTasks: TaskConfig[] = [];
      childEdges.forEach(edge => {
        const childTasks = traverseBranch(edge.target);
        parallelTasks.push(...childTasks);
      });

      tasks.push({
        type: TaskType.PARALLEL,
        params: { tasks: parallelTasks, waitForAll: true }
      });
    } else {
      // 顺序执行
      childEdges.forEach(edge => traverse(edge.target));
    }
  }

  traverse(startNode.id);
  return tasks;
}

function nodeToTask(node: Node): TaskConfig | null {
  switch (node.type) {
    case 'wait':
      return {
        type: TaskType.WAIT,
        params: { duration: node.data.duration }
      };
    case 'photo':
      return {
        type: TaskType.PHOTO,
        params: {
          count: node.data.count,
          cameraId: node.data.cameraId
        }
      };
    // ... 其他类型
    default:
      return null;
  }
}
```

## 📚 参考资源

### React Flow
- 官方文档: https://reactflow.dev/learn
- GitHub: https://github.com/xyflow/xyflow
- 示例: https://reactflow.dev/examples
- 入门教程: https://reactflow.dev/learn/getting-started

### Google Blockly
- 官方文档: https://developers.google.com/blockly
- GitHub: https://github.com/google/blockly
- React封装: https://github.com/nbudin/react-blockly
- 自定义块: https://developers.google.com/blockly/guides/create-custom-blocks

### Flume
- 官网: https://flume.dev
- GitHub: https://github.com/chrisjpatty/flume
- 文档: https://flume.dev/docs

## 🎯 总结

### 最佳选择: React Flow

**理由**:
1. 最活跃的社区和最好的文档
2. 性能优秀，支持大规模流程图
3. 完全可定制，可以设计符合需求的UI
4. 易于与现有系统集成
5. 支持拖拽、并行、条件等所有需求

### 实施建议

1. **第一阶段**: 基础编辑器
   - 实现任务节点拖拽
   - 节点连接
   - 基本的保存/加载

2. **第二阶段**: 高级功能
   - 并行节点
   - 条件节点
   - 循环节点
   - 参数编辑

3. **第三阶段**: 完善体验
   - 自动布局
   - 任务验证
   - 预览执行
   - 导入导出

### 开发时间估计

- 基础编辑器: 3-5天
- 全部节点类型: 5-7天
- 转换逻辑: 2-3天
- 优化完善: 3-5天

**总计**: 约2-3周

---

希望这个调研对你有帮助！React Flow是最推荐的方案，可以快速实现一个专业的可视化任务编辑器。🚀
