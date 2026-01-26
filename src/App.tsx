import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ROSProvider } from '@/contexts/ROSContext';
import { Dashboard } from '@/components/Dashboard';
import { MapManager } from '@/components/MapManager';
import { MapEditor } from '@/components/MapEditor';
import { Mapping } from '@/components/Mapping';
import { Navigation } from '@/components/Navigation';
import { Settings } from '@/components/Settings';
import './App.css';

// 需要全屏显示的路由（不需要 app-container 背景和padding）
const fullScreenRoutes = ['/map-editor', '/mapping', '/navigation', '/settings'];

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
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <ROSProvider autoConnect={true}>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AppContent />
        </BrowserRouter>
      </ROSProvider>
    </ConfigProvider>
  );
}

export default App;
