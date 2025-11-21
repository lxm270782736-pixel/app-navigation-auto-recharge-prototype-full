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

**Localization Mode Control (src/components/common/LocalizationManager.tsx)**
- UI component for switching robot operating modes: idle, mapping, localization, localization_auto, obstacle_avoidance
- Calls ROS services: `startMapping()`, `startLocalization()`, `startObstacleAvoidance()`, `stopAll()`
- Subscribes to `/localization_status` topic for mode feedback
- Used in Dashboard for centralized mode management

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
- See docs/NAVIGATION_EVENTS.md for detailed event handling

**Navigation Result Analysis (CRITICAL)**
Navigation success requires checking TWO separate conditions:
1. `actionlib` status === 3 (SUCCEEDED) - Robot physically reached goal position
2. `result.result.success !== false` - All attached tasks completed successfully

This dual-check pattern is essential because:
- Robot can reach goal position (condition 1 passes) but attached tasks may fail (condition 2 fails)
- Both must succeed for overall navigation success
- Example: Robot reaches waypoint but camera task fails → navigation should be marked as failed
- See docs/NAVIGATION_EVENTS.md for complete event handling details

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
  - See docs/VISUAL_TASK_FLOW_EDITOR.md for detailed usage

**Adding New Tasks**
1. Add to `TaskType` enum in src/types/task.ts
2. Define `NewTaskParams` interface and add to `TaskParams` union
3. Add UI controls in src/components/common/TaskConfigPanel.tsx
4. Create visual node in src/components/TaskFlowEditor/nodes/ (optional)
5. Implement execution in mock_rosbridge.py `execute_tasks()`
6. Implement in real ROS action server

See docs/TASK_SYSTEM.md for architectural details and docs/TASK_USAGE_GUIDE.md for examples.

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

### Coordinate System Transforms
- ROS uses world coordinates (meters) with configurable origin
- Canvas uses pixel coordinates (0,0 at top-left)
- Transform formula: `pixel = (world - origin) / resolution`
- Map origin can be negative (e.g., origin at center means negative coords in top-left quadrant)
- IMPORTANT: Always use MapCanvas's coordinate transform methods, don't implement transforms manually

### Trajectory Sampling Strategy
- Only add point if distance moved > 0.1m (prevents point clustering)
- Keep last 500 points max (FIFO queue)
- Prevents memory bloat during long navigation sessions
- Sampling logic in Navigation/index.tsx

### ROS Connection Management
- Auto-reconnect after 3 seconds on close (prevents reconnect storms)
- Clear reconnect timer on manual disconnect (avoids zombie timers)
- Emit 'connection' event with {connected: boolean}
- IMPORTANT: Always unsubscribe from topics in useEffect cleanup to prevent memory leaks

### Map Storage
- Server-side: saved_maps/ directory with GZIP compression
- Client fallback: localStorage (max 5-10MB typically)
- Automatic fallback chain: HTTP API → localStorage
- Thumbnail generation: max 200x200px for performance

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

## Key Entry Points

**Core Services**
- `src/services/ros.ts` - ROS communication singleton with event emitter pattern
- `src/services/storage.ts` - Map storage with HTTP + localStorage fallback
- `src/contexts/ROSContext.tsx` - Connection state management provider

**Task System Core**
- `src/types/task.ts` - 400+ lines defining 15+ extensible task types
- `src/components/TaskFlowEditor/utils/converter.ts` - Converts between visual flow and task configs

**Map Rendering**
- `src/components/common/MapCanvas.tsx` - Canvas-based map renderer with coordinate transforms

**Mock Development**
- `mock_rosbridge.py` - Simulates ROS Bridge (9090) + HTTP API (8080) for development

## Documentation References

**Essential Reading**
- **docs/NAVIGATION_EVENTS.md** - Critical: Navigation result/feedback/status event handling details
- **docs/TASK_SYSTEM.md** - Extensible task architecture design and adding new task types
- **docs/VISUAL_TASK_FLOW_EDITOR.md** - Visual flow editor (React Flow-based) usage guide
- **docs/ROS_INTEGRATION.md** - Real ROS backend integration and topic/service interfaces
- **docs/MAP_STORAGE_ARCHITECTURE.md** - Map storage architecture and ROS Service migration plan

**Additional Documentation**
- docs/STARTUP_SCRIPTS.md, docs/MOCK_NAVIGATION.md, docs/TASK_USAGE_GUIDE.md, docs/TASK_QUICKSTART.md, docs/VISUAL_TASK_EDITOR_RESEARCH.md

## Code Style Notes

- Chinese comments and UI text throughout (this is a Chinese project)
- File structure: components organize by feature (Dashboard, Navigation, etc.)
- Service layer is singleton pattern (rosService instance)
- Event emitters use Map<string, Set<callback>> for listener management
- Error handling via try-catch with antd message notifications
