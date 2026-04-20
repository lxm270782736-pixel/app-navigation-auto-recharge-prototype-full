/**
 * Vite config for library build — Stardust Desktop embedding.
 *
 * Produces a single JS bundle + CSS that the desktop shell can load.
 * Usage: cd ui && npx vite build --config vite.config.lib.ts
 */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const backendPort = parseInt(env.BACKEND_PORT ?? '17659');

  return {
    plugins: [react()],

    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, './src') },
      ],
    },

    define: {
      __BACKEND_PORT__: backendPort,
    },

    build: {
      outDir: 'dist-lib',
      emptyOutDir: true,
      lib: {
        entry: path.resolve(__dirname, 'src/App.tsx'),
        name: 'NavigationApp',
        formats: ['es'],
        fileName: () => 'navigation-app.js',
      },
      rollupOptions: {
        external: ['react', 'react-dom', 'react/jsx-runtime'],
        output: {
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
          },
        },
      },
    },
  };
});
