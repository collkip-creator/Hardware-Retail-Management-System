import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  build: {
    outDir: 'dist-desktop',
    emptyOutDir: true,
    // Tauri loads dist/index.html by default. Name the desktop HTML entry
    // "index" even though the source file is desktop.html.
    rollupOptions: { input: { index: 'desktop.html' } },
  },
});
