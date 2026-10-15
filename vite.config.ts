import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],
  // The version the site shows and compares with GitHub when checking for updates.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // ffmpeg.wasm spawns its own worker from inside the package; pre-bundling breaks that URL.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
});
