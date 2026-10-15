# unktilz

A web toolbox: Minecraft utilities, dev tools, file converters and everyday helpers. Vite + React + TypeScript, static build, everything runs in the browser. Made for desktop browsers.

## Getting started

1. Install [Node.js](https://nodejs.org) (the LTS version; 18 or newer).
2. Get the code: `git clone https://github.com/unknown-566/unktilz.git`, or on GitHub click **Code → Download ZIP** and unzip it.
3. Open a terminal in the project folder and run:

```bash
npm install       # once, downloads the dependencies
npm run dev       # http://localhost:5173
npm run build     # typecheck + production build into dist/
npm run preview   # serve dist/ locally
```

### Windows without the terminal

- **`start.bat`**: double-click to run the site; the browser opens by itself. The first run installs the dependencies. Closing the black window stops the site.
- **`update.bat`**: double-click to update to the newest version from GitHub and start it. Works for a ZIP download (no Git needed) as well as a `git clone`. It replaces the site's own files (`src/`, `public/`, …) and leaves `node_modules` and any of your own extra files alone.

### Windows: “running scripts is disabled on this system”

PowerShell blocks `npm` by default, because there `npm` is a script (`npm.ps1`). Any one of these fixes it:

- Type `npm.cmd` instead of `npm`, e.g. `npm.cmd install` and `npm.cmd run dev`.
- Use **Command Prompt** (cmd) instead of PowerShell; plain `npm` works there.
- Allow local scripts for your user account once (then plain `npm` works in PowerShell too):

  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```

  This changes a Windows security setting for your account only: your own scripts run, downloaded ones must be signed.

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

Some Minecraft tools call public APIs straight from the browser: server status uses `api.mcsrvstat.us`, profile lookups use `playerdb.co`, skin and head images come from `mc-heads.net`, and the skin editor loads skins from `textures.minecraft.net`. Everything else works offline once loaded.

## Seed map (cubiomes)

The seed map runs [xpple's fork](https://github.com/xpple/cubiomes) of [cubiomes](https://github.com/Cubitect/cubiomes) (MIT) compiled to WebAssembly. The built `src/workers/cubiomes.wasm` is committed, so `npm install` / `npm run build` don't need anything extra. To rebuild it (e.g. to move to a newer cubiomes commit for a new Minecraft version), install [Zig](https://ziglang.org) (`winget install zig.zig`), update `COMMIT` in `scripts/build-cubiomes.mjs` and run `npm run build:cubiomes`.
