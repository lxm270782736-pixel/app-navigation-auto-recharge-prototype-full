import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Shared deps provided by the host app via import map — do NOT bundle these.
// At runtime, these resolve to the host's instances (same React, same stores).
const SHARED_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@astribot/stores',
  '@astribot/ui',
];

const isMock = process.env.VITE_MOCK === 'true';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: [
      // Path alias: @ → ./src (always active)
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // In mock mode, redirect use-app imports to the mock version.
      // App.tsx imports `./use-app` → resolves to mocks/use-app.mock.ts
      // IMPORTANT: Use regex, NOT path.resolve() — path-based alias fails
      // silently due to Vite resolution differences.
      ...(isMock
        ? [
            {
              find: /.*\/use-app$/,
              replacement: path.resolve(__dirname, 'src/mocks/use-app.mock.ts'),
            },
          ]
        : []),
    ],
  },

  base: isMock ? './' : '/',

  server: {
    port: 3500,
    host: true,
  },

  build: isMock
    ? {
        // Mock review build — standalone SPA, no externals
        outDir: 'dist-mock',
        emptyOutDir: true,
        rollupOptions: {
          input: path.resolve(__dirname, 'index.mock.html'),
        },
      }
    : {
        // Production build — ES module library, shared deps external
        lib: {
          entry: 'src/App.tsx',
          formats: ['es'],
          fileName: 'component',
        },
        rollupOptions: {
          external: SHARED_EXTERNALS,
        },
        outDir: 'dist',
        emptyOutDir: true,
      },
});
