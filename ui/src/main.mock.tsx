/**
 * Mock review entrypoint — renders NavigationApp with mocked ROS backend.
 *
 * Built with: VITE_MOCK=true vite build
 * Served at:  http://app_review.astribot.com/{app_id}
 *
 * Vite resolves `./use-app` → `./mocks/use-app.mock.ts` via alias,
 * so App.tsx gets mock callApi() and appState without any code changes.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 9999 }}>
      <span
        style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 4,
          background: 'rgba(234, 179, 8, 0.1)',
          color: '#ca8a04',
        }}
      >
        Mock Mode
      </span>
    </div>
    <App appId="mock-preview" onExit={() => window.close()} />
  </StrictMode>
);
