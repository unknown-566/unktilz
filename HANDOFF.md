# unktilz — handoff for Claude Code

This folder holds the approved design mockups for **unktilz**, a web toolbox (Minecraft utilities, dev tools, file converters, everyday helpers). Build the real site from them.

`design/Main.dc.html` (home) and `design/Tool.dc.html` (tool page) are exports from a design canvas. They use a canvas-only runtime (`support.js`, `<x-dc>`, `<sc-for>`, `{{holes}}`), so **do not ship them** — read them as the source of truth for layout, copy, colors, spacing and behavior, and re-implement in the real stack.

## Stack (decided)

- Vite + React + TypeScript, static build (no backend).
- All processing runs **in the browser**: ffmpeg.wasm for audio/video, canvas/OffscreenCanvas for images, pdf-lib for PDFs, a WASM/ONNX model for background removal. Heavy work runs in Web Workers.
- Routing: one route per tool, `/t/<slug>` (e.g. `/t/ogg-to-mp3`). Home at `/`.

## Design tokens (from the mockups)

| Token | Dark | Light |
|---|---|---|
| bg | `#0b0d10` | `#f6f7f3` |
| surface | `#12161b` | `#ffffff` |
| line | `#242a32` | `#dcdfd4` |
| fg | `#e8ebef` | `#11140f` |
| muted | `#9aa4b0` | `#586053` |
| accent (fills) | `#b6f24a` | `#b6f24a` |
| accent text | `#b6f24a` | `#3b7000` |

Text on accent fills is `#0b0d10`. Fonts: **Geist** (UI) and **Geist Mono** (labels, badges, meta). Radii 6/8/10/12/14 px. Touch targets ≥ 44 px. Dark is default; theme toggle in header, persisted.

## Architecture: tool registry

Every tool is one file that registers itself; pages, search, categories and the queue are generated from the registry. Adding a tool must never require touching the home page.

```ts
type Tool = {
  slug: string;              // 'ogg-to-mp3'
  name: string;              // 'OGG to MP3'
  category: 'minecraft' | 'dev' | 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'calc';
  meta: string;              // badge text, e.g. '.ogg ⇄ .mp3'
  keywords?: string[];
  accepts?: string[];        // file extensions for file tools
  reverse?: string;          // slug of the opposite direction (powers the swap button)
  options?: OptionSchema[];  // rendered into the "// options" panel
  run?: (input: File[] | string, opts) => AsyncIterable<Progress | Result>; // runs in a worker
  component?: React.LazyExoticComponent<any>; // for interactive tools (regex tester, calculators)
};
```

The full catalog (105 tools in 8 categories) is the `catalog` array in `design/Main.dc.html` — port it into registry entries. Ship ~20 first (mostly Minecraft + a few converters); unbuilt tools should not be listed.

## Pages and behavior

**Home** — header (logo, All tools, Request a tool, theme toggle); hero with `// N tools · M categories`, headline "Every tool you keep searching for.", search box; category chips with counts; tools grouped by category as compact tiles (name + mono meta). Search filters live. The only typing animation on the site: the search placeholder cycles example queries ("server status", "ogg to mp3", …) and stops when the user types. Ctrl/Cmd+K focuses search.

**Tool page** — breadcrumb `tools / <category> / <slug>`; title; **swap button** next to the title when `reverse` exists (arrows rotate 180°, title runs a short scramble-decode effect, URL switches to the reverse slug); drop zone + "Choose files"; options panel; related tools. Choosing files adds jobs to the queue.

**Queue rail (global, every page)** — 72 px rail on the left; one 44 px tile per job with a category icon and a 3 px progress bar. Hover expands it to 320 px over the content (no layout shift) showing name, status (running / queued / done), progress %, file name, remove ×. Pin button keeps it open (keyboard/touch). "clear done", "+ Add process" picker. One global store (e.g. Zustand) persisted to IndexedDB; jobs execute sequentially in a worker pool and survive page navigation.

**Tile → tool transition** — 16×10 grid of blocks (`#0b0d10`, cells where `(c*7 + r*13) % 11 === 0` are accent). On click, blocks scale in radiating from the clicked cell (delay = distance × 22 ms, 300 ms each); route changes when fully covered; then blocks scale out in the same wave from the same cell, with a centered mono label `› unktilz/<slug>` and blinking block cursor. ~1.1 s total. Implement with the View Transitions API or a top-level overlay that survives the route change. Disabled under `prefers-reduced-motion`.

**Motion rules** — keep it restrained: hover lift on tiles (−2 px), press scale 0.97, chip color fades, smooth progress bars, theme fade. No slide-up/fade-in of page content; no other typing animations.

## Copy rules

Don't brand it as a converter, and don't use privacy taglines like "processed on this device · nothing is uploaded". Placeholders in brackets (e.g. `[YEAR]`) are for the owner to fill.

## Accessibility

Real `<button>`/`<a>`/`<input>` + `<label>`, `aria-label` on icon buttons, `aria-pressed` on chips, 4.5:1 text contrast, everything reachable by keyboard.
