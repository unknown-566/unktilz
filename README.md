# unktilz

A web toolbox: Minecraft utilities, dev tools, file converters and everyday helpers. Vite + React + TypeScript, static build, everything runs in the browser.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # typecheck + production build into dist/
npm run preview   # serve dist/ locally
```

`design/` holds the original mockups and `HANDOFF.md` the spec. They are reference only and are not part of the build.

## Deploying

`dist/` is a static site, but routes like `/t/ogg-to-mp3` need an SPA fallback: every unknown path should serve `index.html`.

- Netlify: add `/* /index.html 200` to `public/_redirects`
- Vercel: a rewrite of `/(.*)` to `/index.html`
- GitHub Pages: copy `dist/index.html` to `dist/404.html` after building

The ffmpeg core (`ffmpeg-core-*.wasm`, about 32 MB, about 10 MB gzipped) only downloads the first time someone runs an audio or video job. It uses the single-threaded core, so no COOP/COEP headers are needed.

## Adding a tool

Make one `*.tool.ts` file anywhere under `src/tools/` that default-exports `defineTool({...})`. The registry picks it up through `import.meta.glob`. The home page, search, category chips, related links and the queue's “Add process” picker are all generated from it.

- **File tools** set `accepts`, `options` and `run`. `run(files, opts, { signal })` returns an async iterable of `{ type: 'progress', value }` and `{ type: 'result', name, blob }`. Heavy work goes to a worker: `ffmpegJob()` in `src/lib/ffmpeg.ts` (ffmpeg.wasm has its own worker), or `compute()` in `src/lib/compute.ts`, which sends a task to `src/workers/compute.worker.ts` (tasks live in `src/workers/tasks/`). Set `batch: true` when all the chosen files should become one job (merges). Set `reverse` to the opposite tool's slug to get the swap button.
- **Interactive tools** set `component: lazy(() => import('./MyTool'))`. Use the pieces in `src/components/ui.tsx` (Panel, Segmented, Toggle, Output, Stat…) so the tool matches the rest.

Option types are `choice` (segmented buttons), `range`, `number` and `toggle`. Any option can take `when: (opts) => boolean` to hide itself.

## How the queue works

- `src/queue/store.ts` is a Zustand store persisted to IndexedDB. Job metadata is written on every change. Input and output files go into their own IndexedDB store once (`src/queue/blobs.ts`).
- `src/queue/runner.ts` runs one job at a time in the order they were added, on whatever page is open. A job that was running when the tab closed starts over on the next load.
- Removing a running job aborts it: the ffmpeg instance or compute worker is terminated and a fresh one is made for the next job.

## Placeholders for the owner

- `[CONTACT EMAIL]` and `[REPO URL]` on the Request a tool page (`src/pages/Request.tsx`)

## Third-party services

Some Minecraft tools call public APIs straight from the browser: server status uses `api.mcsrvstat.us`, profile lookups use `playerdb.co`, and skin and head images come from `mc-heads.net`. Everything else works offline once loaded.
