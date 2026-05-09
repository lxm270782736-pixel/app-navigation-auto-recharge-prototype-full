import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { StandaloneNavigationApp } from './App';
import './standalone.css';

// Standalone defaults to dark theme (matches the host shell's default).
document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <StandaloneNavigationApp />
    </BrowserRouter>
  </StrictMode>
);
