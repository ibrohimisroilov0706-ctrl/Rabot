// apps/client/vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: { target: 'es2020', outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
