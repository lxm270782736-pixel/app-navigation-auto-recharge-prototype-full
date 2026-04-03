/**
 * Standard app hook — connects SSE for real-time state and provides API caller.
 *
 * Usage:
 *   const { appState, callApi, baseUrl } = useApp(appId);
 *   // appState: reactive state from SSE (updates every 0.5s)
 *   // callApi: typed fetch wrapper — callApi('POST', '/api/navigation/go', { x, y, theta })
 *   // baseUrl: app's HTTP base URL (e.g., http://192.168.0.11:17659)
 *
 * In mock mode, Vite alias swaps this file for mocks/use-app.mock.ts.
 */
import { useEffect, useMemo } from 'react';
import { useAppStore } from '@astribot/stores';

export interface AppState {
  connected: boolean;
  robot_pose: { x: number; y: number; theta: number };
  velocity: { linear: number; angular: number };
  battery_level: number;
  current_map_name: string;
  localization_status: string;
  nav_status: string;
  [key: string]: unknown;
}

export function useApp(appId: string) {
  useEffect(() => {
    useAppStore.getState().connectAppSSE(appId);
    return () => {
      useAppStore.getState().disconnectAppSSE(appId);
    };
  }, [appId]);

  const appState = useAppStore((s) => s.appStates[appId] ?? {}) as AppState;
  const baseUrl = useMemo(
    () => useAppStore.getState().getAppBaseUrl(appId),
    [appId]
  );

  const callApi = useMemo(
    () =>
      <T = unknown>(
        method: string,
        path: string,
        body?: unknown
      ): Promise<T> =>
        useAppStore.getState().callAppApi<T>(appId, method, path, body),
    [appId]
  );

  return { appState, callApi, baseUrl };
}
