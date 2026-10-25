import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
// The resource pack maker's sounds, other languages and the menu panorama are Minecraft's asset
// objects (resources.download.minecraft.net/<2 hex>/<sha1>), which send no CORS headers. The page
// checks each file's SHA-1, so only Mojang's own files are accepted.
const minecraftAssets: ProxyOptions = {
  target: 'https://resources.download.minecraft.net',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/mc-assets/, ''),
  configure: (p) =>
    p.on('proxyReq', (req) => {
      req.removeHeader('origin');
      req.removeHeader('referer');
      req.removeHeader('cookie');
    }),
};

const proxy: Record<string, ProxyOptions> = {
  '/upload/catbox': pass('https://catbox.moe', '/user/api.php'),
  '/upload/litterbox': pass('https://litterbox.catbox.moe', '/resources/internals/api.php'),
  '^/mc-assets/[0-9a-f]{2}/[0-9a-f]{40}$': minecraftAssets,
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

/**
 * Images to PDF's text recognition (src/tools/pdf/scan/ocr.ts) reads its language files from
 * /ocr/<code>.traineddata.gz: Tesseract asks for them by name in one folder, so they can't take
 * hashed asset names. They come from the @tesseract.js-data packages, served in development and
 * copied into the build.
 */
const OCR_LANGS = ['eng', 'ces', 'slk', 'deu', 'pol', 'spa', 'fra'];
const ocrFile = (code: string) => fileURLToPath(new URL(`./node_modules/@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`, import.meta.url));
const ocrData = (): Plugin => ({
  name: 'ocr-language-files',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = (req as { url?: string }).url?.match(/^\/ocr\/([a-z]+)\.traineddata\.gz$/);
      if (!m || !OCR_LANGS.includes(m[1])) return next();
      res.setHeader('Content-Type', 'application/octet-stream');
      res.end(readFileSync(ocrFile(m[1])));
    });
  },
  generateBundle() {
    for (const code of OCR_LANGS) this.emitFile({ type: 'asset', fileName: `ocr/${code}.traineddata.gz`, source: readFileSync(ocrFile(code)) });
  },
});

export default defineConfig({
  plugins: [react(), cacheAssets(), downloader(), ocrData()],
  // bin/ holds the downloader's programs (written while they install): nothing there is site code.
  server: { proxy, watch: { ignored: ['**/bin/**', '**/dist/**'] } },
  preview: { proxy },
  // The version the site shows and compares with GitHub when checking for updates.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // ffmpeg.wasm spawns its own worker from inside the package; pre-bundling breaks that URL.
  // (onnxruntime-web finds its .wasm next to itself the same way.)
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', 'onnxruntime-web'] },
  worker: { format: 'es' },
});
