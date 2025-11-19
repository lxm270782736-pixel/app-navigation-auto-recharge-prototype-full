# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Astribot Navigation UI is a React + TypeScript web interface for ROS robot SLAM mapping and autonomous navigation. It communicates with ROS backend via WebSocket (rosbridge) and supports both simulation and real robot modes.

## Common Commands

### Development
```bash
npm run dev          # Start dev server on port 3000
npm run build        # TypeScript compile + Vite build to dist/
npm run preview      # Preview production build on port 4173
npm run lint         # ESLint check
```

### Quick Start Scripts
```bash
./start-sim.sh       # Simulation mode: mock ROS Bridge (9090) + HTTP API (8080) + frontend (4173)
./start-real.sh      # Real robot mode: requires actual ROS environment
```

### Testing
The project uses a Python mock server (`mock_rosbridge.py`) for development and testing without real ROS hardware.

## Architecture Overview

### Three-Layer Architecture

```
UI Components (Dashboard/MapManager/MapEditor/Navigation/Mapping)
           ↓
    ROSContext (connection management via useROS hook)
           ↓
    rosService (src/services/ros.ts - ROS communication layer)
           ↓
    ROSLIB (WebSocket to rosbridge_server on port 9090)
           ↓
    ROS Backend (SLAM, move_base, AMCL, hardware drivers)
```

### Key Service Layers

**ROS Communication (src/services/ros.ts)**
- Singleton service handling all ROS interactions
- Event-based architecture using listeners Map
- Methods: `connect()`, `subscribeTopic()`, `publishMessage()`, `callService()`, `sendNavigationGoal()`
- Auto-reconnect with 3-second delay on connection loss
- Events: 'connection', 'error', 'navigation-result', 'navigation-feedback', 'navigation-status'

**Map Storage (src/services/storage.ts)**
- Server-side map storage via HTTP API (port 8080)
- Fallback to localStorage when server unavailable
- Endpoints: GET/POST/DELETE `/api/maps`
- Map data includes: id, name, thumbnail (base64), dimensions, resolution, origin, occupancy grid

**Context Management (src/contexts/ROSContext.tsx)**
- Provides `useROS()` hook for components
- Manages connection state: DISCONNECTED/CONNECTING/CONNECTED/ERROR
- Auto-connects on mount if `autoConnect={true}`

### Navigation System

**Goal Structure**
```typescript
NavigationGoal {
  pose: { x, y, theta },
  tasks: TaskConfig[],           // Extensible task system (15+ types)
  actionConfig: {                // Optional navigation parameters
    use_default_config: boolean,
    safe_dist, v_max, w_max, a_max, dw_max,
    is_holonomic, deaccelaration_dist, deaccelaration_ratio
  }
}
```

**Action Protocol**
- Uses ROS Action pattern (`/move_chassis_to_server`)
- Sends: goal with pose + tasks + config
- Receives: status updates (PENDING→ACTIVE→SUCCEEDED/ABORTED/PREEMPTED), feedback (distance, progress, ETA), result (success + message)
- See NAVIGATION_EVENTS.md for detailed event handling

**Navigation Result Analysis**
Success requires TWO conditions:
1. `actionlib` status === 3 (SUCCEEDED)
2. `result.result.success !== false` (附加任务成功)

This dual-check handles cases where robot reaches goal (actionlib succeeds) but attached task fails.

### Extensible Task System

Located in `src/types/task.ts` - highly modular design supporting 15+ task types:

**Task Categories**
- Basic: WAIT, PHOTO, TRAJECTORY
- Perception: SCAN, INSPECT
- Interaction: SOUND, DISPLAY, SIGNAL
- Manipulation: PICKUP, PLACE, CHARGE
- Composite: SEQUENCE, PARALLEL, CONDITIONAL, LOOP
- Custom: CUSTOM (via ROS service)

**Task Configuration UI**
- **Modal-based editing**: Separate configuration interface from navigation panel
- **Dual mode support**: List mode (drag-drop reordering) + Flow mode (visual programming)
- **Visual Flow Editor** (src/components/TaskFlowEditor/):
  - React Flow-based Scratch-like visual programming interface
  - Drag-and-drop task nodes from palette
  - Connect nodes to define execution flow
  - Support for parallel execution and conditional branching
  - Real-time parameter editing in node cards
  - See VISUAL_TASK_FLOW_EDITOR.md for detailed usage

**Adding New Tasks**
1. Add to `TaskType` enum in src/types/task.ts
2. Define `NewTaskParams` interface and add to `TaskParams` union
3. Add UI controls in src/components/common/TaskConfigPanel.tsx
4. Create visual node in src/components/TaskFlowEditor/nodes/ (optional)
5. Implement execution in mock_rosbridge.py `execute_tasks()`
6. Implement in real ROS action server

See TASK_SYSTEM.md for architectural details and TASK_USAGE_GUIDE.md for examples.

### Map Rendering Engine

**MapCanvas Component (src/components/common/MapCanvas.tsx)**
- Canvas-based rendering (not DOM) for performance
- Renders: occupancy grid (gray=unknown, white=free, black=occupied), coordinate frame (red=X, green=Y), robot pose with direction arrow, goal marker, trajectory trail (max 500 points)
- Interactions: scroll to zoom, middle-click or Ctrl+left-click to pan
- Coordinate transforms: world coords ↔ pixel coords via resolution and origin
- Used by: Navigation, Mapping, MapEditor components

**Map Editor Features**
- Tools: free area (white), obstacle (black), eraser (gray/unknown)
- Brush size: 1-20px with gradient preview
- History: undo/redo (Ctrl+Z/Y), max 50 steps
- Real-time save to server with thumbnail generation

## Important Implementation Details

### Coordinate System
- ROS uses world coordinates (meters) with configurable origin
- Canvas uses pixel coordinates (0,0 at top-left)
- Transform: `pixel = (world - origin) / resolution`
- Map origin can be negative (e.g., origin at center means negative coords in top-left)

### Trajectory Sampling
- Only add point if distance moved > 0.1m
- Keep last 500 points max
- Prevents memory bloat during long navigation

### Connection Management
- Auto-reconnect after 3 seconds on close
- Clear reconnect timer on manual disconnect
- Emit 'connection' event with {connected: boolean}

### Map Compression
Maps are stored with GZIP compression in saved_maps/ directory to reduce file size.

## Development Workflow

### Path Aliases
```typescript
import { rosService } from '@/services/ros';  // @ = ./src
```

### Component Communication
- Use `useROS()` hook to access ROS connection
- Use `rosService` directly for ROS operations
- Subscribe to rosService events for real-time updates

### Type Safety
- All ROS message types defined in src/types/
- Use generic types for subscribe/publish: `subscribeTopic<MapData>(...)`
- Validate task configs with `validateTaskConfig()`

## Testing with Mock Server

The `mock_rosbridge.py` implements:
- WebSocket server on port 9090 (rosbridge protocol)
- HTTP API on port 8080 (map storage)
- Simulated navigation with linear interpolation (20 steps)
- Task execution simulation (wait, photo, trajectory)
- Action status/feedback/result lifecycle

**Key Differences from Real ROS:**
- Direct line navigation (no obstacle avoidance)
- Constant speed (0.5 m/s default)
- Always succeeds (no collision detection)
- Minimum 3-second duration regardless of distance

## Important Files

### Core Services
- `src/services/ros.ts` - Core ROS communication service
- `src/services/storage.ts` - Map storage service (HTTP API + localStorage fallback)
- `src/contexts/ROSContext.tsx` - React context provider

### Task System
- `src/types/task.ts` - Extensible task system types (400+ lines)
- `src/components/common/TaskConfigPanel.tsx` - List-based task configuration
- `src/components/common/TaskConfigurationModal.tsx` - Modal with dual-mode support
- `src/components/TaskFlowEditor/` - Visual flow editor components:
  - `index.tsx` - Main editor component
  - `TaskPalette.tsx` - Drag-and-drop task palette
  - `nodes/` - Custom task node components (10+ types)
  - `utils/converter.ts` - Flow ↔ Tasks conversion logic

### Map System
- `src/components/common/MapCanvas.tsx` - Map rendering engine
- `src/components/MapEditor/` - Interactive map editor
- `src/components/MapManager/` - Map list and management

### Navigation
- `src/components/common/NavigationControl.tsx` - Navigation UI with task configuration
- `src/components/Navigation/` - Navigation page

### Mock Server
- `mock_rosbridge.py` - Development mock server (WebSocket + HTTP)

## Documentation References

### Core Documentation
- **CLAUDE.md** - This file, project overview and guidelines
- **README.md** - Project setup and quick start

### Task System
- **TASK_SYSTEM.md** - Extensible task architecture design
- **VISUAL_TASK_FLOW_EDITOR.md** - Visual flow editor usage guide
- **VISUAL_TASK_EDITOR_RESEARCH.md** - Technology selection research
- **TASK_USAGE_GUIDE.md** - Task system usage examples
- **TASK_QUICKSTART.md** - 5-minute quick start

### Map System
- **MAP_STORAGE_ARCHITECTURE.md** - Map storage architecture analysis and ROS Service migration plan

### Navigation System
- **NAVIGATION_EVENTS.md** - Navigation result/feedback/status handling
- **MOCK_NAVIGATION.md** - Mock server navigation implementation
- **ROS_INTEGRATION.md** - Real ROS backend integration

### Development
- **STARTUP_SCRIPTS.md** - Detailed script explanations

## Code Style Notes

- Chinese comments and UI text throughout (this is a Chinese project)
- File structure: components organize by feature (Dashboard, Navigation, etc.)
- Service layer is singleton pattern (rosService instance)
- Event emitters use Map<string, Set<callback>> for listener management
- Error handling via try-catch with antd message notifications
