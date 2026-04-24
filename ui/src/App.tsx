/**
 * Navigation App embedded entry point.
 *
 * The default export is loaded by the host shell from `/ui/dist/component.js`,
 * so it must behave like an isolated component rather than taking over the
 * browser history. Standalone bootstrapping lives in `main.tsx`.
 */
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactNode } from 'react';
import { RobotProvider } from '@/contexts/RobotContext';
import { Dashboard } from '@/components/Dashboard';
import { MapManager } from '@/components/MapManager';
import { MapEditor } from '@/components/MapEditor';
import { Mapping } from '@/components/Mapping';
import { Navigation } from '@/components/Navigation';
import { Settings } from '@/components/Settings';
import { RoomPatrol } from '@/components/RoomPatrol';
import './app.css';

export type AppComponentProps = {
  appId: string;
  onExit: () => void;
};

const fullScreenRoutes = ['/map-editor', '/mapping', '/navigation', '/settings', '/room-patrol'];

type NavigationRoutesProps = {
  chromeClassName?: string;
};

export function NavigationRoutes({ chromeClassName = 'app-shell' }: NavigationRoutesProps) {
  const location = useLocation();
  const isFullScreen = fullScreenRoutes.some(route => location.pathname.startsWith(route));

  return (
    <div className={isFullScreen ? 'app-shell app-shell--fullscreen' : chromeClassName}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/maps" element={<MapManager />} />
        <Route path="/map-editor/:mapId" element={<MapEditor />} />
        <Route path="/mapping" element={<Mapping />} />
        <Route path="/navigation" element={<Navigation />} />
        <Route path="/room-patrol" element={<RoomPatrol />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}

function NavigationAppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider locale={zhCN}>
      <RobotProvider autoConnect={true}>
        {children}
      </RobotProvider>
    </ConfigProvider>
  );
}

export default function NavigationApp({ appId: _appId, onExit: _onExit }: AppComponentProps) {
  return (
    <NavigationAppProviders>
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <NavigationRoutes />
      </MemoryRouter>
    </NavigationAppProviders>
  );
}

export function StandaloneNavigationApp() {
  return (
    <NavigationAppProviders>
      <NavigationRoutes chromeClassName="app-shell app-shell--standalone" />
    </NavigationAppProviders>
  );
}
