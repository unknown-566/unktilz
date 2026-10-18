/**
 * Everything that decides what a GIF frame looks like. The preview and the export both draw with
 * drawFrame(), so what you see is what you get. The timing and layout helpers are plain functions
 * (tested in Node); the drawing needs a canvas.
 */

export type Crop = 'original' | '1:1' | '16:9' | '9:16' | '4:5';
export type Filter = 'none' | 'gray' | 'sepia' | 'contrast';
export type TextStyle = 'meme' | 'subtitle' | 'neon' | 'bubble' | 'plain';
export type LayerAnim = 'none' | 'type' | 'pop' | 'fade' | 'blink' | 'spin' | 'wiggle' | 'pulse' | 'float';

type LayerBase = {
  id: string;
  /** Centre, 0..1 of the GIF's width / height. */
  x: number;
  y: number;
  /** Height as a share of the GIF's height (text: one line). */
  size: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** 0..1 */
  opacity: number;
  /** Mirrored left ↔ right. */
  flip: boolean;
  anim: LayerAnim;
  /** Seconds into the GIF; null = from the start / to the end. */
  from: number | null;
  to: number | null;
};
export type TextLayer = LayerBase & { kind: 'text'; text: string; style: TextStyle; font: string; color: string };
/** A Google Noto animated emoji (by code point), or one of "my stickers" (by id). */
export type StickerRef = { type: 'noto'; code: string } | { type: 'mine'; id: string };
export type StickerLayer = LayerBase & { kind: 'sticker'; sticker: StickerRef; name: string };
export type Layer = TextLayer | StickerLayer;

export type Settings = {
  mode: 'video' | 'photos';
  start: number;
  end: number;
  photoSeconds: number;
  transition: 'none' | 'fade';
  fit: 'cover' | 'contain';
  background: string;
  crop: Crop;
  /** Where the crop sits, 0..1 (0.5 = middle). */
  panX: number;
  panY: number;
  speed: number;
  reverse: boolean;
  boomerang: boolean;
  filter: Filter;
  width: number;
  fps: number;
  loop: 'forever' | 'once' | '3';
  colors: number;
  /** Bottom first: later layers are drawn on top. */
  layers: Layer[];
};

export const defaultSettings = (): Settings => ({
  mode: 'video',
  start: 0,
  end: 3,
  photoSeconds: 0.6,
  transition: 'none',
  fit: 'cover',
  background: '#000000',
  crop: 'original',
  panX: 0.5,
  panY: 0.5,
  speed: 1,
  reverse: false,
  boomerang: false,
  filter: 'none',
  width: 480,
  fps: 15,
  loop: 'forever',
  colors: 256,
  layers: [],
});

/** A layer saved by an older version (texts only, no rotation…) brought up to date. */
export function fixLayer(l: Partial<Layer> & Record<string, unknown>): Layer {
  const base = { rotation: 0, opacity: 1, flip: false, anim: 'none' as LayerAnim, from: null, to: null, x: 0.5, y: 0.5, size: 0.12, id: String(l.id ?? Math.random()) };
  if (l.kind === 'sticker') return { ...base, ...(l as StickerLayer) };
  return { ...base, text: '', style: 'meme', font: FONTS[0].value, color: '#ffffff', ...(l as Partial<TextLayer>), kind: 'text' } as TextLayer;
}

export const stickerKey = (r: StickerRef) => (r.type === 'noto' ? `noto:${r.code}` : `mine:${r.id}`);

/** Longest clip and most frames a GIF may have (memory and file size stay sane). */
export const MAX_SECONDS = 30;
export const MAX_FRAMES = 300;
/** The frames go to ffmpeg as raw RGB, which has to fit in its memory. */
const MAX_RAW_BYTES = 250e6;
/** Most frames a GIF of this size may have. */
export const frameLimit = (w: number, h: number) => Math.max(10, Math.min(MAX_FRAMES, Math.floor(MAX_RAW_BYTES / (w * h * 3))));

const RATIO: Record<Exclude<Crop, 'original'>, number> = { '1:1': 1, '16:9': 16 / 9, '9:16': 9 / 16, '4:5': 4 / 5 };

/** The part of a w×h picture the crop keeps. */
export function cropRect(w: number, h: number, crop: Crop, panX = 0.5, panY = 0.5) {
  if (crop === 'original') return { x: 0, y: 0, w, h };
  const r = RATIO[crop];
  let cw = w;
  let ch = w / r;
  if (ch > h) {
    ch = h;
    cw = h * r;
  }
  return { x: (w - cw) * clamp01(panX), y: (h - ch) * clamp01(panY), w: cw, h: ch };
}

/** Output size: the chosen width (never more than the source has), height from the shape, both even. */
export function outputSize(srcW: number, srcH: number, s: Pick<Settings, 'crop' | 'width'>) {
  const c = cropRect(srcW, srcH, s.crop);
  const w = Math.max(2, Math.round(Math.min(s.width, c.w) / 2) * 2);
  const h = Math.max(2, Math.round((w * c.h) / c.w / 2) * 2);
  return { w, h };
}

/** How many video frames to take from a clip of `seconds` (one per output frame before speed). */
export const videoFrameCount = (seconds: number, fps: number, speed: number) => Math.max(1, Math.round(seconds * fps * speed));

/** Times (seconds from the clip's start) of the frames to take from the video. */
export function videoFrameTimes(start: number, end: number, fps: number, speed: number) {
  const n = videoFrameCount(end - start, fps, speed);
  return Array.from({ length: n }, (_, k) => start + k / (fps * speed));
}

/** Playing order of `n` frames: forwards, backwards, or there and back (no frame twice in a row). */
export function frameOrder(n: number, reverse: boolean, boomerang: boolean): number[] {
  const fwd = Array.from({ length: n }, (_, i) => i);
  const base = reverse ? fwd.reverse() : fwd;
  if (!boomerang || n < 3) return base;
  return [...base, ...base.slice(1, -1).reverse()];
}

/** One output frame of a photo slideshow: photo `a`, and photo `b` mixed in by `mix` during a fade. */
export type PhotoFrame = { a: number; b: number; mix: number };

/** Frames for a slideshow of `count` photos, each `seconds` long (divided by speed), with fades. */
export function photoFrames(count: number, seconds: number, fps: number, speed: number, transition: Settings['transition']): PhotoFrame[] {
  if (!count) return [];
  const per = Math.max(1, Math.round((seconds / speed) * fps));
  const fade = transition === 'fade' && count > 1 ? Math.min(per - 1, Math.max(2, Math.round(fps * 0.3))) : 0;
  const out: PhotoFrame[] = [];
  for (let p = 0; p < count; p++) {
    for (let i = 0; i < per; i++) {
      const into = i - (per - fade);
      // The fade at the end of the last photo goes into the first one, so the loop is smooth.
      out.push(fade && into >= 0 ? { a: p, b: (p + 1) % count, mix: (into + 1) / (fade + 1) } : { a: p, b: p, mix: 0 });
    }
  }
  return out;
}

// ---------- layer animation ----------

export type LayerState = { chars: number; scale: number; rotate: number; dy: number; alpha: number };

/** Turns per second for the looping animations; fitted so they loop exactly with the GIF. */
const RATE: Partial<Record<LayerAnim, number>> = { spin: 0.5, wiggle: 2, pulse: 1.5, float: 0.8 };

/**
 * How a layer looks at second `t` of a GIF that's `duration` long: hidden (null), or how much of a
 * text is typed, extra scale, rotation (degrees), up/down shift (share of the GIF's height), fade.
 */
export function layerState(layer: Layer, t: number, duration: number): LayerState | null {
  const from = layer.from ?? 0;
  const to = layer.to ?? duration;
  if (t < from - 1e-6 || t > to + 1e-6) return null;
  const local = t - from;
  const st: LayerState = { chars: Infinity, scale: 1, rotate: 0, dy: 0, alpha: 1 };
  const span = Math.max(0.1, to - from);
  // Whole turns over the time the layer shows, so the GIF loops without a jump.
  const phase = () => {
    const turns = Math.max(1, Math.round(span * (RATE[layer.anim] ?? 1)));
    return (local / span) * turns * 2 * Math.PI;
  };
  switch (layer.anim) {
    case 'blink':
      return Math.floor(local * 2) % 2 === 0 ? st : null;
    case 'type': {
      if (layer.kind !== 'text') return st;
      // About 12 letters a second, but never longer than a second and a half for the whole text.
      const total = Math.min(1.5, layer.text.length / 12);
      st.chars = total ? Math.ceil((local / total) * layer.text.length) : Infinity;
      return st;
    }
    case 'pop': {
      const p = Math.min(1, local / 0.3);
      // Ease out with a small overshoot.
      const c = 1.7;
      st.scale = Math.max(0.01, p >= 1 ? 1 : 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2);
      return st;
    }
    case 'fade':
      st.alpha = Math.min(1, local / 0.5);
      return st;
    case 'spin':
      st.rotate = (phase() * 180) / Math.PI;
      return st;
    case 'wiggle':
      st.rotate = Math.sin(phase()) * 12;
      return st;
    case 'pulse':
      st.scale = 1 + 0.1 * Math.sin(phase());
      return st;
    case 'float':
      st.dy = Math.sin(phase()) * 0.03;
      return st;
    default:
      return st;
  }
}

// ---------- animated stickers ----------

/** A decoded sticker: its frames and when each one ends (seconds), looping. */
export type StickerAnim = { frames: Pic[]; ends: number[]; w: number; h: number };

/** Which frame of a looping sticker shows at second `t`. */
export function stickerFrame(ends: number[], t: number) {
  const total = ends[ends.length - 1] ?? 0;
  if (ends.length < 2 || total <= 0) return 0;
  const local = ((t % total) + total) % total;
  let lo = 0;
  let hi = ends.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (local < ends[mid]) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// ---------- boxes, picking, snapping ----------

/** A layer's frame on the GIF in canvas pixels: centre, size before turning, and its turn. */
export type LayerBox = { id: string; cx: number; cy: number; w: number; h: number; rotation: number };

/** Whether point (px, py) is inside a turned box. */
export function inBox(b: LayerBox, px: number, py: number, pad = 0) {
  const a = (-b.rotation * Math.PI) / 180;
  const dx = px - b.cx;
  const dy = py - b.cy;
  const x = dx * Math.cos(a) - dy * Math.sin(a);
  const y = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(x) <= b.w / 2 + pad && Math.abs(y) <= b.h / 2 + pad;
}

/** The topmost layer under a point (boxes bottom first, like the layers). */
export const pickLayer = (boxes: LayerBox[], px: number, py: number) => [...boxes].reverse().find((b) => inBox(b, px, py))?.id ?? null;

/** Pulls a centre onto the GIF's middle lines when it's within `reach` pixels. */
export function snapCenter(cx: number, cy: number, W: number, H: number, reach: number) {
  const sx = Math.abs(cx - W / 2) <= reach;
  const sy = Math.abs(cy - H / 2) <= reach;
  return { cx: sx ? W / 2 : cx, cy: sy ? H / 2 : cy, guideX: sx, guideY: sy };
}

/** Turning snaps to the nearest 15° with Shift, and onto 0/90/180/270 when close anyway. */
export function snapAngle(deg: number, step15: boolean) {
  const norm = ((((deg + 180) % 360) + 360) % 360) - 180;
  if (step15) return Math.round(norm / 15) * 15;
  const right = Math.round(norm / 90) * 90;
  return Math.abs(norm - right) < 4 ? right : Math.round(norm * 10) / 10;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ---------- drawing ----------

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Pic = CanvasImageSource & { width: number; height: number };

const FILTER: Record<Filter, string> = { none: 'none', gray: 'grayscale(1)', sepia: 'sepia(0.85)', contrast: 'contrast(1.35) saturate(1.25)' };

export const FONTS = [
  { value: 'Impact, "Arial Black", sans-serif', label: 'Impact' },
  { value: '"Arial Black", Arial, sans-serif', label: 'Arial Black' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: '"Comic Sans MS", "Comic Sans", cursive', label: 'Comic Sans' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Courier New", monospace', label: 'Courier' },
];

/** Draws one picture into the frame: cropped (video), or covering / fitting in (photos). */
function drawPicture(ctx: Ctx, pic: Pic, W: number, H: number, s: Settings, alpha = 1) {
  ctx.globalAlpha = alpha;
  if (s.mode === 'video' || s.fit === 'cover') {
    const c = s.mode === 'video' ? cropRect(pic.width, pic.height, s.crop, s.panX, s.panY) : coverRect(pic.width, pic.height, W / H);
    ctx.drawImage(pic, c.x, c.y, c.w, c.h, 0, 0, W, H);
  } else {
    const k = Math.min(W / pic.width, H / pic.height);
    const w = pic.width * k;
    const h = pic.height * k;
    ctx.drawImage(pic, (W - w) / 2, (H - h) / 2, w, h);
  }
  ctx.globalAlpha = 1;
}

/** The middle part of a picture with the frame's shape. */
function coverRect(w: number, h: number, ratio: number) {
  let cw = w;
  let ch = w / ratio;
  if (ch > h) {
    ch = h;
    cw = h * ratio;
  }
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
}

/** Text measured for drawing: the lines, their widths, and the box around them. */
function textLayout(ctx: Ctx, l: TextLayer, H: number) {
  const lines = (l.style === 'meme' ? l.text.toUpperCase() : l.text).split('\n');
  const px = Math.max(6, l.size * H);
  const lineH = px * 1.15;
  ctx.font = `${l.style === 'subtitle' ? 600 : 700} ${px}px ${l.font}`;
  const widths = lines.map((line) => ctx.measureText(line).width);
  const bw = Math.max(...widths, px * 0.5);
  const bh = lineH * lines.length;
  const pad = px * 0.35;
  return { lines, widths, px, lineH, bw, bh, pad, w: bw + pad * 2, h: bh + pad * 2 };
}

/** Size of a sticker on a GIF H pixels high (square until its picture has loaded). */
const stickerSize = (l: StickerLayer, H: number, anim?: StickerAnim) => {
  const h = Math.max(4, l.size * H);
  return { w: anim ? (h * anim.w) / anim.h : h, h };
};

/** Every layer's frame (unanimated), for picking and the handles. */
export function layerBoxes(ctx: Ctx, W: number, H: number, layers: Layer[], stickers: Map<string, StickerAnim>): LayerBox[] {
  ctx.save();
  const out = layers.map((l) => {
    const { w, h } = l.kind === 'text' ? textLayout(ctx, l, H) : stickerSize(l, H, stickers.get(stickerKey(l.sticker)));
    return { id: l.id, cx: l.x * W, cy: l.y * H, w, h, rotation: l.rotation };
  });
  ctx.restore();
  return out;
}

/** Draws a whole frame: the picture(s), the filter, then the layers as they are at second `t`. */
export function drawFrame(
  ctx: Ctx,
  W: number,
  H: number,
  s: Settings,
  pics: { a: Pic; b?: Pic; mix?: number },
  t: number,
  duration: number,
  stickers: Map<string, StickerAnim> = new Map(),
) {
  ctx.save();
  ctx.fillStyle = s.background;
  ctx.fillRect(0, 0, W, H);
  ctx.filter = FILTER[s.filter];
  ctx.imageSmoothingQuality = 'high';
  drawPicture(ctx, pics.a, W, H, s);
  if (pics.b && pics.mix) drawPicture(ctx, pics.b, W, H, s, pics.mix);
  ctx.filter = 'none';
  ctx.restore();
  for (const layer of s.layers) {
    const st = layerState(layer, t, duration);
    if (!st || (layer.kind === 'text' && !layer.text)) continue;
    ctx.save();
    ctx.translate(layer.x * W, (layer.y + st.dy) * H);
    ctx.rotate(((layer.rotation + st.rotate) * Math.PI) / 180);
    ctx.scale(st.scale * (layer.flip ? -1 : 1), st.scale);
    ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity * st.alpha));
    if (layer.kind === 'text') drawText(ctx, H, layer, st.chars);
    else {
      const anim = stickers.get(stickerKey(layer.sticker));
      if (anim) {
        const { w, h } = stickerSize(layer, H, anim);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(anim.frames[stickerFrame(anim.ends, t - (layer.from ?? 0))], -w / 2, -h / 2, w, h);
      }
    }
    ctx.restore();
  }
}

/** Draws a text around (0, 0); the caller has moved, turned and scaled the canvas. */
function drawText(ctx: Ctx, H: number, l: TextLayer, chars: number) {
  const { lines, widths, px, lineH, bw, bh, pad } = textLayout(ctx, l, H);
  // Typing shows the first `chars` letters, line by line; the box keeps its full size.
  let left = chars;
  const shown = lines.map((line) => {
    const part = line.slice(0, Math.max(0, left));
    left -= line.length + 1;
    return part;
  });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (l.style === 'subtitle') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, -bw / 2 - pad, -bh / 2 - pad * 0.5, bw + pad * 2, bh + pad, px * 0.2);
  } else if (l.style === 'bubble') {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, -bw / 2 - pad, -bh / 2 - pad * 0.6, bw + pad * 2, bh + pad * 1.2, px * 0.6);
  }
  const alpha = ctx.globalAlpha;
  shown.forEach((line, i) => {
    if (!line) return;
    const y = -bh / 2 + lineH * (i + 0.5);
    // Typed lines start where the full line would, so the text doesn't slide while it types.
    const x = line.length < lines[i].length ? -widths[i] / 2 + ctx.measureText(line).width / 2 : 0;
    if (l.style === 'meme') {
      ctx.lineJoin = 'round';
      ctx.lineWidth = px * 0.09;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(line, x, y);
    } else if (l.style === 'neon') {
      ctx.shadowColor = l.color;
      ctx.shadowBlur = px * 0.5;
      ctx.fillStyle = l.color;
      ctx.fillText(line, x, y);
      ctx.shadowBlur = px * 0.15;
    }
    ctx.fillStyle = l.style === 'bubble' && l.color.toLowerCase() === '#ffffff' ? '#111111' : l.style === 'neon' ? '#ffffff' : l.color;
    if (l.style === 'neon') ctx.globalAlpha = alpha * 0.85;
    ctx.fillText(line, x, y);
    ctx.globalAlpha = alpha;
  });
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** A rough size guess before making the GIF (GIF compression varies a lot with the picture). */
export function estimateBytes(w: number, h: number, frames: number, colors: number) {
  return Math.round(w * h * frames * 0.12 * (0.55 + 0.45 * Math.log2(colors) / 8));
}
