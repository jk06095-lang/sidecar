import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // LSEG Workspace Desktop App — local proxy to bypass CORS
        '/lseg-api': {
          target: 'http://localhost:9060',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/lseg-api/, ''),
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.warn('[Vite Proxy] LSEG connection failed:', err.message);
            });
          },
        },
        // Vercel Serverless Proxy — local dev forwarding
        '/api/proxy': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.warn('[Vite Proxy] API Proxy connection failed:', err.message);
            });
          },
        },
      },
    },
  };
});
