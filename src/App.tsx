import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ROSProvider } from '@/contexts/ROSContext';
import { Dashboard } from '@/components/Dashboard';
import { MapManager } from '@/components/MapManager';
import { Mapping } from '@/components/Mapping';
import { Navigation } from '@/components/Navigation';
import './App.css';

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <ROSProvider autoConnect={true} rosUrl="ws://localhost:9090">
        <BrowserRouter>
          <div className="app-container">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/maps" element={<MapManager />} />
              <Route path="/mapping" element={<Mapping />} />
              <Route path="/navigation/:mapId" element={<Navigation />} />
            </Routes>
          </div>
        </BrowserRouter>
      </ROSProvider>
    </ConfigProvider>
  );
}

export default App;
