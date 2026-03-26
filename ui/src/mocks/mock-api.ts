/**
 * Mock API layer — isolates all mock data and fake REST endpoints.
 *
 * This file is ONLY used by the mock review build (main.mock.tsx).
 * Production app code (App.tsx, use-app.ts) never imports this.
 *
 * Mock → Real API Mapping:
 *   POST /api/localization/start-mapping  →  start SLAM mapping
 *   POST /api/navigation/go              →  send navigation goal
 *   GET  /api/maps                       →  list saved maps
 *   GET  /api/state                      →  SSE state (auto-handled by use-app.ts)
 */

// ---- Mock Data ----

let mockState = {
  connected: true,
  robot_pose: { x: 1.5, y: 2.3, theta: 0.5 },
  velocity: { linear: 0.0, angular: 0.0 },
  battery_level: 85,
  current_map_name: 'Office Floor 1',
  localization_status: 'localization_auto',
  nav_status: 'idle',
};

const mockMaps = [
  { name: 'Office Floor 1', created_at: '2024-03-20T10:00:00Z' },
  { name: 'Warehouse', created_at: '2024-03-21T14:30:00Z' },
  { name: 'Lab Room', created_at: '2024-03-22T09:15:00Z' },
];

// ---- Mock Handlers (keyed by "METHOD /path") ----

export const mockHandlers: Record<
  string,
  (body?: unknown) => Promise<unknown>
> = {
  // Localization
  'POST /api/localization/start-mapping': async () => {
    await delay(200);
    mockState.localization_status = 'mapping';
    return { success: true, message: 'Mapping mode started' };
  },
  'POST /api/localization/stop-mapping': async () => {
    await delay(200);
    mockState.localization_status = 'idle';
    return { success: true, message: 'Mapping stopped' };
  },
  'POST /api/localization/start': async () => {
    await delay(200);
    mockState.localization_status = 'localization_manual';
    return { success: true, message: 'Localization started (manual)' };
  },
  'POST /api/localization/start-auto': async () => {
    await delay(200);
    mockState.localization_status = 'localization_auto';
    return { success: true, message: 'Localization started (auto)' };
  },
  'POST /api/localization/stop': async () => {
    await delay(200);
    mockState.localization_status = 'idle';
    return { success: true, message: 'Localization stopped' };
  },

  // Maps
  'GET /api/maps': async () => {
    await delay(150);
    return { success: true, maps: mockMaps };
  },
  'GET /api/maps/current': async () => {
    await delay(100);
    return { success: true, message: mockState.current_map_name };
  },
  'POST /api/maps/apply': async (body) => {
    await delay(200);
    const { map_name } = body as { map_name: string };
    mockState.current_map_name = map_name;
    return { success: true, message: `Applied map: ${map_name}` };
  },
  'POST /api/maps/save': async () => {
    await delay(300);
    return { success: true, message: 'Map saved' };
  },
  'POST /api/maps/delete': async () => {
    await delay(200);
    return { success: true, message: 'Map deleted' };
  },

  // Navigation
  'POST /api/navigation/go': async (body) => {
    const { x, y } = body as { x: number; y: number; theta: number };
    await delay(200);
    mockState.nav_status = 'navigating';
    // Simulate navigation completion after 3s
    setTimeout(() => {
      mockState.nav_status = 'succeeded';
      mockState.robot_pose = { x, y, theta: 0 };
    }, 3000);
    return { success: true, message: 'Navigation goal sent' };
  },
  'POST /api/navigation/cancel': async () => {
    await delay(100);
    mockState.nav_status = 'idle';
    return { success: true, message: 'Navigation cancelled' };
  },

  // Chassis
  'POST /api/chassis/velocity': async (body) => {
    const { linear_x, angular_z } = body as { linear_x: number; angular_z: number };
    mockState.velocity = { linear: linear_x, angular: angular_z };
    return { success: true, message: 'Velocity sent' };
  },
  'POST /api/chassis/initial-pose': async (body) => {
    const { x, y, theta } = body as { x: number; y: number; theta: number };
    await delay(100);
    mockState.robot_pose = { x, y, theta };
    return { success: true, message: 'Initial pose set' };
  },

  // Joystick
  'POST /api/joystick/start': async () => {
    await delay(100);
    return { success: true, message: 'Joystick started' };
  },
  'POST /api/joystick/stop': async () => {
    await delay(100);
    return { success: true, message: 'Joystick stopped' };
  },
};

// ---- Mock State (mimics SSE /api/state) ----

export function mockGetState(): Record<string, unknown> {
  // Simulate slight pose drift
  mockState.robot_pose.x += (Math.random() - 0.5) * 0.01;
  mockState.robot_pose.y += (Math.random() - 0.5) * 0.01;
  return { ...mockState };
}

// ---- Helpers ----

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
