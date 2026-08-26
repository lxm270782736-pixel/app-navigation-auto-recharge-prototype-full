/**
 * Navigation App embedded entry point.
 *
 * The default export is loaded by the host shell from `/ui/dist/component.js`,
 * so it must behave like an isolated component rather than taking over the
 * browser history. Standalone bootstrapping lives in `main.tsx`.
 */
import { MemoryRouter, Routes, Route, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { RobotProvider } from '@/contexts/RobotContext';
import { Dashboard } from '@/components/Dashboard';
import { RechargeMockPanel } from '@/components/common/RechargeMockPanel';
import { RechargeRuntimeDialogs } from '@/components/Settings/RechargeRuntimeDialogs';
import './app.css';

export function getStandaloneBasename() {
  if (typeof window === 'undefined') return '/';
  const pathname = window.location.pathname;
  if (pathname === '/') return '/';
  const base = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname.replace(/\/[^/]*$/, '');
  return base || '/';
}

const MapManager = lazy(() => import('@/components/MapManager').then((module) => ({ default: module.MapManager })));
const MapEditor = lazy(() => import('@/components/MapEditor').then((module) => ({ default: module.MapEditor })));
const Mapping = lazy(() => import('@/components/Mapping').then((module) => ({ default: module.Mapping })));
const Navigation = lazy(() => import('@/components/Navigation').then((module) => ({ default: module.Navigation })));
const Settings = lazy(() => import('@/components/Settings').then((module) => ({ default: module.Settings })));
const RoomPatrol = lazy(() => import('@/components/RoomPatrol').then((module) => ({ default: module.RoomPatrol })));
const AssetManager = lazy(() => import('@/components/AssetManager').then((module) => ({ default: module.AssetManager })));

export type AppComponentProps = {
  appId: string;
  onExit: () => void;
};

const fullScreenRoutes = ['/map-editor', '/mapping', '/navigation', '/room-patrol', '/asset-manager'];

type NavigationRoutesProps = {
  chromeClassName?: string;
};

export function NavigationRoutes({ chromeClassName = 'app-shell' }: NavigationRoutesProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isFullScreen = fullScreenRoutes.some(route => location.pathname.startsWith(route));

  function openRechargeSettings(mock?: string) {
    const params = new URLSearchParams({ tab: 'recharge', mockPanel: '1' });
    if (mock) params.set('mock', mock);
    if (searchParams.get('setup') === 'missing') params.set('setup', 'missing');
    if (searchParams.get('map') === 'missing') params.set('map', 'missing');
    navigate('/settings?' + params.toString());
  }

  return (
    <div className={isFullScreen ? 'app-shell app-shell--fullscreen' : chromeClassName}>
      <Suspense fallback={<div className="app-loading">正在加载导航应用...</div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/maps" element={<MapManager />} />
          <Route path="/map-editor/:mapId" element={<MapEditor />} />
          <Route path="/mapping" element={<Mapping />} />
          <Route path="/navigation" element={<Navigation />} />
          <Route path="/room-patrol" element={<RoomPatrol />} />
          <Route path="/asset-manager" element={<AssetManager />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Suspense>
      <RechargeRuntimeDialogs />
      <RechargeMockPanel onOpenRecharge={openRechargeSettings} />
    </div>
  );
}

function NavigationAppProviders({ children }: { children: ReactNode }) {
  return (
    <RobotProvider autoConnect={true}>
      {children}
    </RobotProvider>
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
