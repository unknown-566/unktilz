import { clampRgb, fromHex, oklabToRgb, oklchToRgb, inGamut, parseColor, rgbToOklab, rgbToOklch, toHex, type RGB } from './color';
import { t } from './i18n-core';

export type GradKind = 'linear' | 'radial' | 'conic';
export type Blend = 'srgb' | 'oklab' | 'oklch';
/** One color of the gradient; `pos` is 0–100 %, `alpha` 0–1. `id` is only for the editor. */
export type Stop = { id: number; color: RGB; alpha: number; pos: number };
export type Grad = { kind: GradKind; angle: number; shape: 'circle' | 'ellipse'; cx: number; cy: number; blend: Blend; stops: Stop[] };

let nextId = 1;
export const stop = (color: RGB, pos: number, alpha = 1): Stop => ({ id: nextId++, color, alpha, pos });

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const sorted = (stops: Stop[]) => [...stops].sort((a, b) => a.pos - b.pos);

/** A stop's color for CSS: #rrggbb, or #rrggbbaa when it is see-through. */
export function stopColor(s: { color: RGB; alpha: number }) {
  const hex = toHex(s.color).toLowerCase();
  return s.alpha >= 1 ? hex : hex + Math.round(clamp(s.alpha, 0, 1) * 255).toString(16).padStart(2, '0');
}

// ---- blending (the way browsers do it) ----

function mixIn(a: Stop, b: Stop, t: number, blend: Blend): { color: RGB; alpha: number } {
  const alpha = a.alpha + (b.alpha - a.alpha) * t;
  if (blend === 'srgb') {
    const c = { r: a.color.r + (b.color.r - a.color.r) * t, g: a.color.g + (b.color.g - a.color.g) * t, b: a.color.b + (b.color.b - a.color.b) * t };
    return { color: c, alpha };
  }
  if (blend === 'oklab') {
    const p = rgbToOklab(a.color);
    const q = rgbToOklab(b.color);
    return { color: clampRgb(oklabToRgb([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t])), alpha };
  }
  // OKLCH, the shorter way round the hue wheel; a gray takes the other color's hue (as CSS does).
  const [l1, c1, h1raw] = rgbToOklch(a.color);
  const [l2, c2, h2raw] = rgbToOklch(b.color);
  const h1 = c1 < 0.002 ? h2raw : h1raw;
  const h2 = c2 < 0.002 ? h1 : h2raw;
  let dh = h2 - h1;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return { color: gamutMap(l1 + (l2 - l1) * t, c1 + (c2 - c1) * t, h1 + dh * t), alpha };
}

/** An OKLCH color brought into sRGB by lowering its chroma (keeps lightness and hue, like CSS). */
function gamutMap(l: number, c: number, h: number): RGB {
  let rgb = oklchToRgb(l, c, h);
  if (inGamut(rgb)) return rgb;
  let lo = 0;
  let hi = c;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb(l, mid, h))) lo = mid;
    else hi = mid;
  }
  rgb = oklchToRgb(l, lo, h);
  return clampRgb(rgb);
}

/** The color at a place on the gradient (0–100 %). */
export function colorAt(g: Grad, pos: number): { color: RGB; alpha: number } {
  const s = sorted(g.stops);
  if (pos <= s[0].pos) return { color: s[0].color, alpha: s[0].alpha };
  const last = s[s.length - 1];
  if (pos >= last.pos) return { color: last.color, alpha: last.alpha };
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i];
    const b = s[i + 1];
    if (pos >= a.pos && pos <= b.pos) return mixIn(a, b, b.pos === a.pos ? 0 : (pos - a.pos) / (b.pos - a.pos), g.blend);
  }
  return { color: last.color, alpha: last.alpha };
}

/** OKLab / OKLCH gradients as plain sRGB stops with steps in between (for old browsers, SVG and the PNG). */
export function expandStops(g: Grad, steps = 12): { color: RGB; alpha: number; pos: number }[] {
  const s = sorted(g.stops);
  if (g.blend === 'srgb') return s.map(({ color, alpha, pos }) => ({ color, alpha, pos }));
  const out: { color: RGB; alpha: number; pos: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    out.push({ color: s[i].color, alpha: s[i].alpha, pos: s[i].pos });
    const b = s[i + 1];
    if (!b || b.pos === s[i].pos) continue;
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      out.push({ ...mixIn(s[i], b, t, g.blend), pos: round(s[i].pos + (b.pos - s[i].pos) * t, 2) });
    }
  }
  return out;
}

// ---- writing it out ----

const stopList = (list: { color: RGB; alpha: number; pos: number }[]) => list.map((s) => `${stopColor(s)} ${round(s.pos, 2)}%`).join(', ');

function head(g: Grad, withBlend: boolean) {
  const blend = withBlend && g.blend !== 'srgb' ? ` in ${g.blend}` : '';
  const at = `at ${round(g.cx)}% ${round(g.cy)}%`;
  if (g.kind === 'linear') return `${round(g.angle)}deg${blend}`;
  if (g.kind === 'radial') return `${g.shape} ${at}${blend}`;
  return `from ${round(g.angle)}deg ${at}${blend}`;
}

/** The CSS gradient value. `plain` gives the sRGB-only form with the in-between steps (works in every browser). */
export function gradientValue(g: Grad, plain = false) {
  const list = plain ? expandStops(g) : sorted(g.stops);
  return `${g.kind}-gradient(${head(g, !plain)}, ${stopList(list)})`;
}

/** CSS to paste: with an OKLab / OKLCH blend, a plain line first for browsers that don't know it. */
export function gradientCss(g: Grad) {
  const main = `background: ${gradientValue(g)};`;
  return g.blend === 'srgb' ? main : `background: ${gradientValue(g, true)};\n${main}`;
}

/** A Tailwind class (arbitrary value; spaces become _). */
export const tailwindClass = (g: Grad) => `bg-[${gradientValue(g).replace(/, /g, ',').replace(/ /g, '_')}]`;

/** The gradient as an SVG picture (linear and radial only; SVG has no conic gradients). */
export function gradientSvg(g: Grad, w = 800, h = 500): string | null {
  if (g.kind === 'conic') return null;
  const stops = expandStops(g)
    .map((s) => `    <stop offset="${round(s.pos, 2)}%" stop-color="${toHex(s.color).toLowerCase()}"${s.alpha < 1 ? ` stop-opacity="${round(s.alpha, 3)}"` : ''}/>`)
    .join('\n');
  let def: string;
  if (g.kind === 'linear') {
    const { x1, y1, x2, y2 } = linearLine(g.angle, w, h);
    def = `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}">\n${stops}\n  </linearGradient>`;
  } else {
    const { x, y, rx, ry } = radialSize(g, w, h);
    const tr = rx === ry ? '' : ` gradientTransform="translate(${round(x)} ${round(y)}) scale(${round(rx / ry, 4)} 1) translate(${round(-x)} ${round(-y)})"`;
    def = `<radialGradient id="g" gradientUnits="userSpaceOnUse" cx="${round(x)}" cy="${round(y)}" r="${round(ry)}"${tr}>\n${stops}\n  </radialGradient>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n  ${def}\n  <rect width="100%" height="100%" fill="url(#g)"/>\n</svg>\n`;
}

/** Where a CSS linear gradient runs in a w×h box: 0deg goes up, angles turn clockwise. */
function linearLine(angle: number, w: number, h: number) {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  return { x1: w / 2 - (dx * len) / 2, y1: h / 2 - (dy * len) / 2, x2: w / 2 + (dx * len) / 2, y2: h / 2 + (dy * len) / 2 };
}

/** A CSS radial gradient's size (the default, farthest-corner) in a w×h box. */
function radialSize(g: Grad, w: number, h: number) {
  const x = (g.cx / 100) * w;
  const y = (g.cy / 100) * h;
  const fx = Math.max(x, w - x);
  const fy = Math.max(y, h - y);
  if (g.shape === 'circle') {
    const r = Math.hypot(fx, fy);
    return { x, y, rx: r, ry: r };
  }
  // An ellipse through the farthest corner, with the farthest-side proportions.
  return { x, y, rx: Math.max(1e-3, fx * Math.SQRT2), ry: Math.max(1e-3, fy * Math.SQRT2) };
}

/** Draws the gradient on a canvas, the same as the browser draws the CSS. */
export function drawGradient(ctx: CanvasRenderingContext2D, w: number, h: number, g: Grad) {
  const stops = expandStops(g, 24);
  let grad: CanvasGradient;
  ctx.save();
  if (g.kind === 'linear') {
    const { x1, y1, x2, y2 } = linearLine(g.angle, w, h);
    grad = ctx.createLinearGradient(x1, y1, x2, y2);
  } else if (g.kind === 'radial') {
    const { x, y, rx, ry } = radialSize(g, w, h);
    ctx.translate(x, y);
    ctx.scale(rx / ry, 1);
    grad = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
  } else {
    grad = ctx.createConicGradient(((g.angle - 90) * Math.PI) / 180, (g.cx / 100) * w, (g.cy / 100) * h);
  }
  for (const s of stops) {
    const [r, gg, b] = [s.color.r, s.color.g, s.color.b].map((v) => Math.round(clamp(v, 0, 1) * 255));
    grad.addColorStop(clamp(s.pos / 100, 0, 1), `rgba(${r}, ${gg}, ${b}, ${clamp(s.alpha, 0, 1)})`);
  }
  ctx.fillStyle = grad;
  if (g.kind === 'radial') {
    const { x, y, rx, ry } = radialSize(g, w, h);
    ctx.fillRect(-x * (ry / rx), -y, w * (ry / rx), h);
  } else ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** The gradient as a PNG file. */
export function gradientPng(g: Grad, w: number, h: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  drawGradient(c.getContext('2d')!, w, h, g);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));
}

// ---- the short code in the address: l_90_c_50_50_srgb_ff0000-0_0000ffcc-100 (only characters that stay as they are in a URL) ----

export function encodeGrad(g: Grad) {
  const stops = sorted(g.stops).map((s) => `${stopColor(s).slice(1)}-${round(s.pos, 2)}`).join('_');
  return [g.kind[0], round(g.angle), g.shape[0], round(g.cx), round(g.cy), g.blend, stops].join('_');
}

export function decodeGrad(code: string): Grad | null {
  const p = code.split('_');
  if (p.length < 8) return null;
  const kind = ({ l: 'linear', r: 'radial', c: 'conic' } as const)[p[0] as 'l'];
  const shape = ({ c: 'circle', e: 'ellipse' } as const)[p[2] as 'c'];
  const blend = (['srgb', 'oklab', 'oklch'] as const).find((b) => b === p[5]);
  const [angle, cx, cy] = [p[1], p[3], p[4]].map(Number);
  if (!kind || !shape || !blend || ![angle, cx, cy].every(Number.isFinite)) return null;
  const stops: Stop[] = [];
  for (const part of p.slice(6)) {
    const m = /^([0-9a-f]{6})([0-9a-f]{2})?-([\d.]+)$/i.exec(part);
    if (!m) return null;
    stops.push(stop(fromHex(m[1])!, clamp(Number(m[3]), 0, 100), m[2] ? parseInt(m[2], 16) / 255 : 1));
  }
  if (stops.length < 2 || stops.length > MAX_STOPS) return null;
  return { kind, angle: ((angle % 360) + 360) % 360, shape, cx: clamp(cx, 0, 100), cy: clamp(cy, 0, 100), blend, stops };
}

export const MAX_STOPS = 16;

// ---- ready-made ones ----

const make = (kind: GradKind, angle: number, hexes: string[], blend: Blend = 'oklab'): Grad => ({
  kind,
  angle,
  shape: 'circle',
  cx: 50,
  cy: 50,
  blend,
  stops: hexes.map((h, i) => stop(fromHex(h)!, round((i / (hexes.length - 1)) * 100))),
});

/** Ready gradients. */
export const PRESETS: { name: string; make: () => Grad }[] = [
  { name: t('Sunset'), make: () => make('linear', 135, ['#ff7e5f', '#feb47b']) },
  { name: t('Ocean'), make: () => make('linear', 160, ['#2193b0', '#6dd5ed']) },
  { name: t('Forest'), make: () => make('linear', 180, ['#134e5e', '#71b280']) },
  { name: t('Peach'), make: () => make('linear', 90, ['#ffecd2', '#fcb69f']) },
  { name: t('Aurora'), make: () => make('linear', 120, ['#00c9a7', '#845ec2', '#d65db1'], 'oklch') },
  { name: t('Fire'), make: () => make('linear', 0, ['#f12711', '#f5af19']) },
  { name: t('Candy'), make: () => make('linear', 45, ['#fbc2eb', '#a6c1ee']) },
  { name: t('Night'), make: () => make('linear', 180, ['#0f2027', '#203a43', '#2c5364']) },
  { name: t('Lime'), make: () => make('linear', 135, ['#d4fc79', '#96e6a1']) },
  { name: t('Steel'), make: () => make('linear', 90, ['#bdc3c7', '#2c3e50']) },
  { name: t('Rainbow'), make: () => make('conic', 0, ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'], 'srgb') },
  { name: t('Glow'), make: () => ({ ...make('radial', 0, ['#fff1a8', '#ff8a5c', '#3a1c71']), shape: 'ellipse' }) },
];

/** A random, pleasant gradient: 2 or 3 colors with hues apart, not too dark or too grey. */
export function randomGradient(): Grad {
  const n = Math.random() < 0.6 ? 2 : 3;
  const h0 = Math.random() * 360;
  const step = 40 + Math.random() * 100;
  const stops = Array.from({ length: n }, (_, i) => stop(gamutMap(0.62 + Math.random() * 0.2, 0.11 + Math.random() * 0.08, h0 + i * step), round((i / (n - 1)) * 100)));
  return { kind: 'linear', angle: Math.round((Math.random() * 360) / 15) * 15, shape: 'circle', cx: 50, cy: 50, blend: 'oklab', stops };
}

/** Colors from pasted text (hex codes, rgb(), names…, one per line or separated by commas / spaces), spread evenly. */
export function stopsFromText(text: string): Stop[] {
  const hexes = text.match(/#?\b[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi);
  const parts = hexes && hexes.length >= 2 ? hexes : text.split(/[\n;]+|,(?![^(]*\))/);
  const colors = parts.map((p) => parseColor(p.trim())).filter((c): c is RGB => !!c).slice(0, MAX_STOPS);
  if (colors.length < 2) return [];
  return colors.map((c, i) => stop(c, round((i / (colors.length - 1)) * 100)));
}
