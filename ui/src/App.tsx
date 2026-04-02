/**
 * Navigation App — standard App component entry point.
 *
 * Follows the standard AppComponentProps interface required by app-shell.
 * Connection is managed internally via RobotProvider + useApp() hook.
 */
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { RobotProvider } from '@/contexts/RobotContext';
import { Dashboard } from '@/components/Dashboard';
import { MapManager } from '@/components/MapManager';
import { MapEditor } from '@/components/MapEditor';
import { Mapping } from '@/components/Mapping';
import { Navigation } from '@/components/Navigation';
import { Settings } from '@/components/Settings';
import { RoomPatrol } from '@/components/RoomPatrol';
import './app.css';

// ---- Standard App Interface ----

export type AppComponentProps = {
  appId: string;
  onExit: () => void;
};

// 需要全屏显示的路由（不需要 app-container 背景和padding）
const fullScreenRoutes = ['/map-editor', '/mapping', '/navigation', '/settings', '/room-patrol'];

function AppContent() {
  const location = useLocation();

  // 检查当前路由是否需要全屏显示
  const isFullScreen = fullScreenRoutes.some(route => location.pathname.startsWith(route));

  return (
    <div className={isFullScreen ? '' : 'app-container'}>
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

export default function NavigationApp({ appId: _appId, onExit: _onExit }: AppComponentProps) {
  return (
    <ConfigProvider locale={zhCN}>
      <RobotProvider autoConnect={true}>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AppContent />
        </BrowserRouter>
      </RobotProvider>
    </ConfigProvider>
  );
}
