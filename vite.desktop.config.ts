import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  build: {
    outDir: 'dist-desktop',
    emptyOutDir: true,
    // Build from the real index.html entry expected by Tauri.
    rollupOptions: { input: 'index.html' },
  },
});
