import { defineConfig, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';
import { downloader } from './scripts/downloader-server';

// GIF links (src/lib/upload.ts) are made by uploading to catbox.moe / litterbox. Their APIs don't
// accept uploads from web pages with upload progress (no CORS preflight), so the site's own server
// passes them on.
const pass = (target: string, path: string): ProxyOptions => ({
  target,
  changeOrigin: true,
  rewrite: () => path,
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
};

/**
 * Files in /assets/ have their content's hash in the name, so a file there never changes: the browser
 * may keep it for good (ffmpeg's 32 MB, pdf.js, three.js…) instead of asking the server every time.
 * index.html stays no-cache, so a new version shows up right away.
 */
const cacheAssets = (): Plugin => ({
  name: 'cache-hashed-assets',
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if ((req as { url?: string }).url?.startsWith('/assets/')) {
        const setHeader = res.setHeader.bind(res);
        // The static file server sets its own no-cache later; keep ours.
        res.setHeader = ((name: string, value: string | number | readonly string[]) =>
          name.toLowerCase() === 'cache-control' ? res : setHeader(name, value)) as typeof res.setHeader;
        setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), cacheAssets(), downloader()],
  // bin/ holds the downloader's programs (written while they install): nothing there is site code.
  server: { proxy, watch: { ignored: ['**/bin/**', '**/dist/**'] } },
  preview: { proxy },
  // The version the site shows and compares with GitHub when checking for updates.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // ffmpeg.wasm spawns its own worker from inside the package; pre-bundling breaks that URL.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
});
