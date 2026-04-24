/**
 * Runtime configuration for Stardust Desktop integration.
 *
 * Two modes:
 *   1. Standalone — accessed directly at http://host:port/
 *   2. Embedded   — loaded inside Stardust Desktop via iframe/web-component,
 *                   baseUrl injected by the desktop shell.
 *
 * The desktop shell sets `window.__STARDUST_BASE_URL__` before loading the app.
 */

declare global {
  interface Window {
    __STARDUST_BASE_URL__?: string;
  }
}

/**
 * Returns the API base URL.
 * - In embedded mode: uses the injected base URL from Stardust Desktop.
 * - In standalone mode: falls back to same-origin or explicit backend port.
 */
export function getBaseUrl(): string {
  // Embedded mode: desktop shell injects base URL
  if (window.__STARDUST_BASE_URL__) {
    return window.__STARDUST_BASE_URL__.replace(/\/+$/, '');
  }

  // Standalone mode: use backend port from build-time define
  const port = typeof __BACKEND_PORT__ !== 'undefined' ? __BACKEND_PORT__ : 17659;
  if (window.location.port === String(port)) {
    return '';  // same origin
  }
  return `http://${window.location.hostname}:${port}`;
}
