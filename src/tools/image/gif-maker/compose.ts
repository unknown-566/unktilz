/**
 * Everything that decides what a GIF frame looks like. The preview and the export both draw with
 * drawFrame(), so what you see is what you get. The timing and layout helpers are plain functions
 * (tested in Node); the drawing needs a canvas.
 */

export type Crop = 'original' | '1:1' | '16:9' | '9:16' | '4:5';
export type Filter = 'none' | 'gray' | 'sepia' | 'contrast';
export type TextStyle = 'meme' | 'subtitle' | 'neon' | 'bubble' | 'plain';
export type TextAnim = 'none' | 'type' | 'pop' | 'blink';

export type TextLayer = {
  id: string;
  text: string;
  style: TextStyle;
  font: string;
  /** Text height as a share of the GIF's height. */
  size: number;
  color: string;
  /** Centre, 0..1 of the GIF's width / height. */
  x: number;
  y: number;
  anim: TextAnim;
  /** Seconds into the GIF; null = from the start / to the end. */
  from: number | null;
  to: number | null;
};

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
  layers: TextLayer[];
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

/** Whether a text shows at second `t`, and how far into its animation it is. */
export function textState(layer: TextLayer, t: number, duration: number) {
  const from = layer.from ?? 0;
  const to = layer.to ?? duration;
  if (t < from - 1e-6 || t > to + 1e-6) return null;
  const local = t - from;
  if (layer.anim === 'blink') return Math.floor(local * 2) % 2 === 0 ? { chars: Infinity, scale: 1 } : null;
  if (layer.anim === 'type') {
    // About 12 letters a second, but never longer than a second and a half for the whole text.
    const total = Math.min(1.5, layer.text.length / 12);
    return { chars: total ? Math.ceil((local / total) * layer.text.length) : Infinity, scale: 1 };
  }
  if (layer.anim === 'pop') {
    const p = Math.min(1, local / 0.3);
    // Ease out with a small overshoot.
    const c = 1.7;
    const scale = p >= 1 ? 1 : 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
    return { chars: Infinity, scale: Math.max(0.01, scale) };
  }
  return { chars: Infinity, scale: 1 };
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

/** Where each text ended up, for dragging it on the preview. */
export type TextBox = { id: string; x: number; y: number; w: number; h: number };

/**
 * Draws a whole frame: the picture(s), the filter, then the texts as they are at second `t`.
 * Returns the texts' boxes in canvas pixels.
 */
export function drawFrame(ctx: Ctx, W: number, H: number, s: Settings, pics: { a: Pic; b?: Pic; mix?: number }, t: number, duration: number): TextBox[] {
  ctx.save();
  ctx.fillStyle = s.background;
  ctx.fillRect(0, 0, W, H);
  ctx.filter = FILTER[s.filter];
  ctx.imageSmoothingQuality = 'high';
  drawPicture(ctx, pics.a, W, H, s);
  if (pics.b && pics.mix) drawPicture(ctx, pics.b, W, H, s, pics.mix);
  ctx.filter = 'none';
  ctx.restore();
  const boxes: TextBox[] = [];
  for (const layer of s.layers) {
    const st = textState(layer, t, duration);
    if (!st || !layer.text) continue;
    const box = drawText(ctx, W, H, layer, st.chars, st.scale);
    if (box) boxes.push({ id: layer.id, ...box });
  }
  return boxes;
}

function drawText(ctx: Ctx, W: number, H: number, l: TextLayer, chars: number, scale: number) {
  const full = l.style === 'meme' ? l.text.toUpperCase() : l.text;
  const lines = full.split('\n');
  // Typing shows the first `chars` letters, line by line; the box keeps its full size.
  let left = chars;
  const shown = lines.map((line) => {
    const part = line.slice(0, Math.max(0, left));
    left -= line.length + 1;
    return part;
  });
  const px = Math.max(6, l.size * H);
  const lineH = px * 1.15;
  ctx.save();
  ctx.font = `${l.style === 'subtitle' ? 600 : 700} ${px}px ${l.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const widths = lines.map((line) => ctx.measureText(line).width);
  const bw = Math.max(...widths, px * 0.5);
  const bh = lineH * lines.length;
  const cx = l.x * W;
  const cy = l.y * H;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  const pad = px * 0.35;
  if (l.style === 'subtitle') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, -bw / 2 - pad, -bh / 2 - pad * 0.5, bw + pad * 2, bh + pad, px * 0.2);
  } else if (l.style === 'bubble') {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, -bw / 2 - pad, -bh / 2 - pad * 0.6, bw + pad * 2, bh + pad * 1.2, px * 0.6);
  }
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
    if (l.style === 'neon') ctx.globalAlpha = 0.85;
    ctx.fillText(line, x, y);
    ctx.globalAlpha = 1;
  });
  ctx.restore();
  return { x: cx - (bw / 2 + pad) * scale, y: cy - (bh / 2 + pad) * scale, w: (bw + pad * 2) * scale, h: (bh + pad * 2) * scale };
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
