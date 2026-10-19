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

- **`start.bat`**: double-click to run the site; the browser opens by itself. If Node.js is missing it offers to install it (winget, Node.js LTS), and the first run installs the dependencies. Closing the black window stops the site. It runs the built site (`vite preview` on port 5173), which is much faster than the development server: `scripts/ensure-build.mjs` rebuilds `dist/` first only when it's missing, a source file is newer than the last build, or `package.json` has another version (so the first start after an update takes about half a minute). `start.bat dev` runs the development server instead.
- **`update.bat`**: double-click to update to the newest version from GitHub and start it. Works for a ZIP download (no Git needed) as well as a `git clone`. It replaces the site's own files (`src/`, `public/`, …) and leaves `node_modules` and any of your own extra files alone.

### Windows: folder paths with `&`

npm’s launcher scripts break when the folder path contains `&` (e.g. `Minecraft & games\unktilz-main`): you get “… is not recognized as an internal or external command” and “Cannot find module …\vite\bin\vite.js”. `start.bat` works around it by starting Vite with `node` directly; for `npm run …` commands, move the folder to a path without `&`.

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

`dist/` is a static site, but routes like `/t/audio-converter` need an SPA fallback: every unknown path should serve `index.html`.

- Netlify: add `/* /index.html 200` to `public/_redirects`
- Vercel: a rewrite of `/(.*)` to `/index.html`
- GitHub Pages: copy `dist/index.html` to `dist/404.html` after building

GIF links (the GIF maker's "Make a link") upload through the `/upload/catbox` and `/upload/litterbox` proxies in `vite.config.ts`, so they only work where Vite serves the site (`npm run dev`, `npm run preview`, start.bat). A static host needs the same two rewrites to `https://catbox.moe/user/api.php` and `https://litterbox.catbox.moe/resources/internals/api.php`, or the GIF maker says links aren't available.

Everything in `dist/assets/` has its content hash in the file name, so it can be cached for good: `vite preview` (and so start.bat) sends `Cache-Control: public, max-age=31536000, immutable` for `/assets/*` (the `cacheAssets` plugin in `vite.config.ts`), and `index.html` stays `no-cache` so a new version shows up right away. Do the same on a static host.

The site's fonts (Geist, Geist Mono) come from `@fontsource-variable` packages and ship with the site; nothing is loaded from Google Fonts except the GIF maker's online font list.

The ffmpeg core (`ffmpeg-core-*.wasm`, about 32 MB, about 10 MB gzipped) only downloads the first time someone runs an audio or video job. It uses the single-threaded core, so no COOP/COEP headers are needed.

Things that don't work in this ffmpeg.wasm build (0.12.10), and what's used instead:

- `libvpx-vp9` crashes ("memory access out of bounds"): WebM video uses VP8 (`libvpx`).
- `libopus` crashes on stereo: Opus uses ffmpeg's own encoder (`-c:a opus -strict -2 -ar 48000`).
- `loudnorm` needs `aformat=sample_fmts=fltp` right after it, a fixed sample format at the end of the chain and `-ar` (not an `aresample` filter), or the encoders fail.
- After any failed run the instance is unreliable, so `ffmpegJob` throws it away and the next attempt or job loads a fresh one.
- Its wasm memory only grows, so the instance is also thrown away 30 seconds after the last job (`hold`/`letGo` in `src/lib/ffmpeg.ts`); the next job loads it again from the browser cache in about a second.

Other file libraries, all loaded only when a job needs them: pdf.js (`pdfjs-dist`, Apache-2.0) draws PDF pages, pdf-lib (MIT) writes PDFs (only inside the compute worker, `src/workers/tasks/pdf.ts`, so it's downloaded once), libheif-js (LGPL-3.0) reads HEIC photos and utif2 (MIT) reads TIFF.

## Adding a tool

Make one `*.tool.ts` file anywhere under `src/tools/` that default-exports `defineTool({...})`. The registry picks it up through `import.meta.glob`. The home page, search, category chips and related links are all generated from it.

- **File tools** set `accepts`, `options` and `run`. `run(files, opts, { signal })` returns an async iterable of `{ type: 'progress', value }` and `{ type: 'result', name, blob }`. Heavy work goes to a worker: `ffmpegJob()` in `src/lib/ffmpeg.ts` (ffmpeg.wasm has its own worker), or `compute()` in `src/lib/compute.ts`, which sends a task to `src/workers/compute.worker.ts` (tasks live in `src/workers/tasks/`). Set `batch: true` when all the chosen files should become one job (merges). Set `reverse` to the opposite tool's slug to get the swap button. Set `added: 'YYYY-MM-DD'` on a new tool to give it a "new" tag for 5 days (`isNew` in `src/registry/types.ts`), and `beta: true` while it's still being tested. Both also feed the New / Beta filter chips on the home page (`?tag=new,beta`; a chip with no tools is hidden). When a tool is folded into another, add its old slug to `ALIASES` in `src/registry/index.ts` so old links still open the right tool.
- **Interactive tools** set `component: lazy(() => import('./MyTool'))`. Use the pieces in `src/components/ui.tsx` (Panel, Segmented, Toggle, Output, Stat…) so the tool matches the rest. Links to other pages of the site use `GoLink` from `src/components/Transition.tsx` (a react-router `Link` that opens the page through the block transition). 3D views use three.js, loaded lazily (see the shape generator's `Shape3D.tsx` / `shapeScene.ts`); call `forceContextLoss()` when disposing, browsers allow only a few WebGL contexts.

Option types are `choice` (segmented buttons), `range`, `number`, `text` and `toggle`. Any option can take `when: (opts) => boolean` to hide itself.

## How the queue works

- `src/queue/store.ts` is a Zustand store persisted to IndexedDB. Job metadata is written on every change. Input and output files go into their own IndexedDB store once (`src/queue/blobs.ts`).
- `src/queue/runner.ts` runs one job at a time in the order they were added, on whatever page is open. A job that was running when the tab closed starts over on the next load.
- Removing a running job aborts it: the ffmpeg instance or compute worker is terminated and a fresh one is made for the next job.
- **Tasks** are jobs a tool page makes from what it has in memory, which can't be saved to IndexedDB (the GIF maker's video frames and stickers). `useQueue.getState().addTask(info, run, release)` queues them; the work itself lives only in memory (`src/queue/tasks.ts`), runs in turn with the other jobs, and its outputs are stored like any job's. `release` runs when the task is over (done, failed or removed). A task can't survive the tab closing: on the next load it shows as failed.
- The GIF maker frees its frames, photos and stickers through `whenFree()` (`src/tools/image/gif-maker/hold.ts`), which waits while a GIF that uses them is queued or being made, even after leaving the page.

## Third-party services

Some Minecraft tools call public APIs straight from the browser: server status uses `api.mcsrvstat.us`, profile lookups use `playerdb.co`, skin and head images come from `mc-heads.net`, the skin editor loads skins from `textures.minecraft.net`, and the GIF maker loads animated emoji stickers from `fonts.gstatic.com` ([Noto Emoji Animation](https://googlefonts.github.io/noto-emoji-animation/) by Google, CC BY 4.0; the list of them is in `src/lib/noto-emoji.json`, refreshed with `node scripts/fetch-noto-emoji.mjs`). The GIF maker's fonts: ten come with the site from the `@fontsource/*` packages (Anton, Bebas Neue, Bangers, Luckiest Guy, Montserrat, Lobster, Pacifico, Caveat, Press Start 2P under the SIL Open Font License, Permanent Marker under Apache 2.0) and work offline; any other [Google Font](https://fonts.google.com) loads from `fonts.googleapis.com` when picked (the list is in `src/lib/google-fonts.json`, refreshed with `node scripts/fetch-google-fonts.mjs`). Its "Make a link" uploads the finished GIF to [catbox.moe](https://catbox.moe) (forever) or [litterbox](https://litterbox.catbox.moe) (1 hour to 3 days), through the site's own server (see Deploying). The video & audio downloader reads from the sites you give it, through yt-dlp on this computer (see below). Everything else works offline once loaded.

## Video & audio downloader (yt-dlp + aria2c)

The downloader tool works like the [Seal](https://github.com/junkfood02/Seal) app: it runs [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense) on this computer, with [aria2c](https://aria2.github.io/) (GPL-2.0) downloading in 16 connections at once and [ffmpeg](https://ffmpeg.org) (GPL build from [yt-dlp/FFmpeg-Builds](https://github.com/yt-dlp/FFmpeg-Builds)) joining video and sound and embedding covers and subtitles. Content behind DRM (Spotify, Netflix…) isn't supported by yt-dlp.

- **Server part:** `scripts/downloader-server.ts`, a Vite plugin in both the dev and the preview server (so it works with start.bat, not on a static host), under `/api/dl/`: `status`, `install`, `update` (`yt-dlp -U`), `info` (`yt-dlp -J --flat-playlist`), `start`, `job/:id` (progress), `job/:id/cancel` (kills yt-dlp, aria2c and ffmpeg with `taskkill /T`), `job/:id/file/:n` and `job/:id/forget`. Downloads go to `%TEMP%\unktilz-dl\<id>` and are deleted once the page has the files (leftovers on the next start). Node is passed to yt-dlp as its JavaScript runtime (`--js-runtimes node:…`), which YouTube needs.
- **Programs:** "Install" downloads them into `bin/` (git-ignored, left alone by update.bat): yt-dlp.exe checked against `SHA2-256SUMS`, ffmpeg (the `win64-gpl-shared` build, 91 MB) against `checksums.sha256`, and aria2 1.37.0, which publishes no checksums, against a hash pinned in the code. On other systems the programs are used from PATH. Vite doesn't watch `bin/`.
- **Safety:** the API only answers this site's own pages: the `Host` must be localhost, a cross-site `Origin` / `Sec-Fetch-Site` is refused, and every request needs the `X-Unktilz: 1` header (another website can't send it without a CORS preflight, which this server never allows). Arguments go to yt-dlp as a list, never through a shell, and only http(s) addresses are accepted. The "extra yt-dlp options" field refuses options that run programs or write outside the download folder (`--exec`, `-o`, `-P`, `--downloader-args`, `--use-postprocessor`, `--netrc-cmd`, `--cookies`, `--config-locations` … see `checkExtra` in `src/tools/video/downloader/args.ts`).
- **aria2c:** runs with `--disable-ipv6=true` (on connections with an IPv6 address but no IPv6 route it otherwise fails at once with socket error 10051, while yt-dlp falls back to IPv4). If it still exits with an error, the job deletes its half-done files and runs yt-dlp again without aria2c (`fallback` in the job state).
- **Subtitles:** picked from `info` (`subtitles` / `automatic_captions`). "In the video" is `--write-subs --embed-subs --compat-options no-keep-subs` (with `--write-subs`, yt-dlp otherwise keeps the files after embedding); "as files" / "both" add `--convert-subs srt|vtt`, and the files come back next to the video as more results of the job.
- **Page:** `src/tools/video/downloader/` (`Downloader.tsx`, `api.ts`, `args.ts` with the option → argument logic shared with the server). Each download is a queue task (`addTask`), so the finished file lands in the queue like any other result.

## Background remover (AI)

The background remover runs [BiRefNet_lite](https://github.com/ZhengPeng7/BiRefNet) (MIT) in the browser with [onnxruntime-web](https://onnxruntime.ai) (MIT) 1.30, in a worker (`src/workers/bgremove.worker.ts`): on the graphics card through WebGPU when the browser has it, otherwise on the processor (WASM, single-threaded since the site isn't cross-origin isolated). It uses the 512×512 export [`studioludens/birefnet-lite-512`](https://huggingface.co/studioludens/birefnet-lite-512) in fp16 (98 MB): the 1024×1024 exports run out of memory on WASM, and on some graphics cards (AMD Vega here) fail in onnxruntime's WebGPU shaders. The model downloads from Hugging Face the first time, pinned to a commit and checked against its SHA-256 (`src/tools/image/bg-remover/model.ts`), and stays in Cache Storage (`unktilz-models`). onnxruntime 1.30's WebGPU build needs its **asyncify** wasm; giving it the jsep `.wasm` (or only the `.wasm` without the matching `.mjs`) makes it hang while starting.

The mask is kept as layers (`src/tools/image/bg-remover/mask.ts`): the AI's, the colour picks' (tolerance, connected area by flood fill, feathered edge) and the erase / restore brush on top, so the sliders still work after painting. Brush undo stores only the 64×64 tiles a stroke touched.

## Seed map (cubiomes)

The seed map runs [xpple's fork](https://github.com/xpple/cubiomes) of [cubiomes](https://github.com/Cubitect/cubiomes) (MIT) compiled to WebAssembly. The built `src/workers/cubiomes.wasm` is committed, so `npm install` / `npm run build` don't need anything extra. To rebuild it (e.g. to move to a newer cubiomes commit for a new Minecraft version), install [Zig](https://ziglang.org) (`winget install zig.zig`), update `COMMIT` in `scripts/build-cubiomes.mjs` and run `npm run build:cubiomes`.

## Versions and updates

The version lives in `package.json` and every change is listed in `CHANGELOG.md` (newest first, `## [x.y.z] - YYYY-MM-DD`). The middle number goes up for new features, the last one for fixes. The site shows its version in the footer; the Changelog page (`/changelog`) has a "Check for updates" button that compares it with `package.json` on GitHub, and the header shows "update available" when there's a newer one (checked at most once a day). Updating is a double-click on `update.bat`; saved items stay because they live in the browser. After an update, a "What's new" popup (`src/components/WhatsNew.tsx`) shows the changelog entries since the version last seen in this browser (kept in `localStorage`), once.

Saved items and work in progress are kept in IndexedDB per address (always `localhost:5173` with `start.bat`). `/backup` downloads them as one JSON file and loads them on another computer.
