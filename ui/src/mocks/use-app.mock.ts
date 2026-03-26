/**
 * Mock version of use-app.ts — drop-in replacement for review builds.
 *
 * Vite alias in mock mode resolves `./use-app` → this file.
 * App.tsx doesn't know or care — it imports useApp() the same way.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { mockHandlers, mockGetState } from './mock-api';
import type { AppState } from '../use-app';

export function useApp(_appId: string) {
  const [appState, setAppState] = useState<AppState>(
    mockGetState() as AppState
  );
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);

  // Poll mock state (mimics SSE)
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setAppState({ ...mockGetState() } as AppState);
    }, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const callApi = useCallback(
    async <T = unknown>(
      method: string,
      path: string,
      body?: unknown
    ): Promise<T> => {
      const key = `${method} ${path}`;
      const handler = mockHandlers[key];
      if (!handler) {
        throw new Error(`[mock] No handler for ${key}`);
      }
      return handler(body) as Promise<T>;
    },
    []
  );

  return { appState, callApi, baseUrl: '' };
}
