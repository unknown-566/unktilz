import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

// GIF links (src/lib/upload.ts) are made by uploading to catbox.moe, litterbox or imgur. catbox and
// litterbox don't accept uploads from web pages with upload progress (no CORS preflight), and imgur
// turns away requests from localhost pages, so the site's own server passes them on.
const pass = (target: string, path: string | ((p: string) => string)): ProxyOptions => ({
  target,
  changeOrigin: true,
  rewrite: typeof path === 'string' ? () => path : path,
  configure: (p) =>
    p.on('proxyReq', (req) => {
      req.removeHeader('origin');
      req.removeHeader('referer');
      req.removeHeader('cookie');
    }),
});
const proxy: Record<string, ProxyOptions> = {
  '/upload/catbox': pass('https://catbox.moe', '/user/api.php'),
  '/upload/litterbox': pass('https://litterbox.catbox.moe', '/resources/internals/api.php'),
  // /upload/imgur → /3/image (upload), /upload/imgur/<deletehash> → /3/image/<deletehash> (delete)
  '/upload/imgur': pass('https://api.imgur.com', (p) => p.replace(/^\/upload\/imgur/, '/3/image')),
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  // The version the site shows and compares with GitHub when checking for updates.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // ffmpeg.wasm spawns its own worker from inside the package; pre-bundling breaks that URL.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
});
