/**
 * Draws a QR code's modules as a styled SVG: dot shapes, eye shapes, solid or gradient colours, a logo
 * in the middle and a frame with a caption. Everything is measured in modules (one square of the
 * code); the caller sets the size in pixels.
 */

export type DotShape = 'square' | 'rounded' | 'dots' | 'small' | 'diamond' | 'star' | 'heart' | 'vlines' | 'hlines' | 'smooth' | 'fluid';
export type EyeFrame = 'square' | 'rounded' | 'extra' | 'circle' | 'leaf' | 'dotted';
export type EyeBall = 'square' | 'rounded' | 'circle' | 'diamond' | 'leaf' | 'star';
export type FrameKind = 'none' | 'box' | 'rounded' | 'top' | 'banner' | 'bubble';

export type Fill = { type: 'solid' | 'linear' | 'radial'; colors: string[]; angle: number };

export type QrStyle = {
  dots: DotShape;
  /** How much of its square a dot fills (0.5–1), for the shapes that aren't joined up. */
  dotSize: number;
  eyeFrame: EyeFrame;
  eyeBall: EyeBall;
  fg: Fill;
  bg: Fill;
  transparent: boolean;
  /** The eyes in their own colours instead of the dots' fill. */
  eyeColors: boolean;
  eyeFrameColor: string;
  eyeBallColor: string;
  /** Empty border around the code, in modules (scanners want about 4). */
  margin: number;
  /** The logo's side as a share of the code (0.1–0.3). */
  logoSize: number;
  /** Leave the dots under the logo out. */
  logoClear: boolean;
  /** A plate in the background colour behind the logo. */
  logoPlate: boolean;
  frame: FrameKind;
  frameText: string;
  frameColor: string;
  frameTextColor: string;
  frameFont: string;
};

export type Matrix = { size: number; get: (row: number, col: number) => boolean };
export type Logo = { url: string; w: number; h: number };

const f = (n: number) => String(Math.round(n * 1000) / 1000);

/** A rectangle with its own radius at each corner (top-left, top-right, bottom-right, bottom-left), clockwise. */
function rr(x: number, y: number, w: number, h: number, [a, b, c, d]: number[]) {
  const arc = (r: number, ex: number, ey: number) => (r ? `A${f(r)},${f(r)} 0 0 1 ${f(ex)},${f(ey)}` : '');
  return (
    `M${f(x + a)},${f(y)}H${f(x + w - b)}${arc(b, x + w, y + b)}V${f(y + h - c)}${arc(c, x + w - c, y + h)}` +
    `H${f(x + d)}${arc(d, x, y + h - d)}V${f(y + a)}${arc(a, x + a, y)}Z`
  );
}
/** The same, anticlockwise: cut out of a shape drawn clockwise. */
function rrHole(x: number, y: number, w: number, h: number, [a, b, c, d]: number[]) {
  const arc = (r: number, ex: number, ey: number) => (r ? `A${f(r)},${f(r)} 0 0 0 ${f(ex)},${f(ey)}` : '');
  return (
    `M${f(x + a)},${f(y)}${arc(a, x, y + a)}V${f(y + h - d)}${arc(d, x + d, y + h)}H${f(x + w - c)}` +
    `${arc(c, x + w, y + h - c)}V${f(y + b)}${arc(b, x + w - b, y)}Z`
  );
}
const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)},${f(cy)}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`;
const circleHole = (cx: number, cy: number, r: number) => `M${f(cx - r)},${f(cy)}a${f(r)},${f(r)} 0 1,1 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,1 ${f(-2 * r)},0Z`;
const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${f(x)},${f(y)}`).join('L')}Z`;
const diamond = (cx: number, cy: number, r: number) => poly([[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]]);
function star(cx: number, cy: number, r: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r * 0.5 : r;
    pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
  }
  return poly(pts);
}
function heart(cx: number, cy: number, s: number) {
  // A heart s wide, its middle at (cx, cy).
  const x = cx - s / 2;
  const y = cy - s * 0.42;
  const p = (dx: number, dy: number) => `${f(x + dx * s)},${f(y + dy * s)}`;
  return `M${p(0.5, 0.25)}C${p(0.5, 0.05)} ${p(0.2, -0.05)} ${p(0.05, 0.12)}C${p(-0.1, 0.32)} ${p(0.1, 0.6)} ${p(0.5, 0.9)}C${p(0.9, 0.6)} ${p(1.1, 0.32)} ${p(0.95, 0.12)}C${p(0.8, -0.05)} ${p(0.5, 0.05)} ${p(0.5, 0.25)}Z`;
}

/** Whether (row, col) is inside one of the three 7×7 eyes. */
export const inEye = (n: number, r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

/** The modules left out for the logo (whole modules, the same on every side). */
export function logoHole(n: number, logo: Logo | undefined, s: Pick<QrStyle, 'logoSize' | 'logoClear'>) {
  if (!logo || !s.logoClear) return null;
  const side = s.logoSize * n;
  const bw = logo.w >= logo.h ? side : (side * logo.w) / logo.h;
  const bh = logo.h >= logo.w ? side : (side * logo.h) / logo.w;
  // A QR code is always an odd number of modules wide, so the middle is half a module off the grid:
  // out to whole modules, with at least half a module of room.
  const hx = Math.ceil(bw / 2) + 0.5;
  const hy = Math.ceil(bh / 2) + 0.5;
  return { x0: n / 2 - hx, x1: n / 2 + hx, y0: n / 2 - hy, y1: n / 2 + hy, bw, bh };
}

function dotsPath(m: Matrix, s: QrStyle, ox: number, oy: number, hole: ReturnType<typeof logoHole>) {
  const n = m.size;
  const on = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < n && c < n && !inEye(n, r, c) && !(hole && c >= hole.x0 && c + 1 <= hole.x1 && r >= hole.y0 && r + 1 <= hole.y1) && m.get(r, c);
  const k = Math.min(1, Math.max(0.4, s.dotSize));
  const o = (1 - k) / 2;
  const out: string[] = [];
  if (s.dots === 'vlines' || s.dots === 'hlines') {
    const v = s.dots === 'vlines';
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++) {
        const r = v ? b : a;
        const c = v ? a : b;
        if (!on(r, c)) continue;
        let len = 1;
        while (b + len < n && (v ? on(r + len, c) : on(r, c + len))) len++;
        const x = ox + c;
        const y = oy + r;
        out.push(v ? rr(x + o, y + o, k, len - 2 * o, [k / 2, k / 2, k / 2, k / 2]) : rr(x + o, y + o, len - 2 * o, k, [k / 2, k / 2, k / 2, k / 2]));
        b += len - 1;
      }
    return out.join('');
  }
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const x = ox + c;
      const y = oy + r;
      const dark = on(r, c);
      if (s.dots === 'smooth' || s.dots === 'fluid') {
        const up = on(r - 1, c);
        const down = on(r + 1, c);
        const left = on(r, c - 1);
        const right = on(r, c + 1);
        if (dark) {
          // A corner is round when nothing joins it on either side.
          const R = 0.5;
          out.push(rr(x, y, 1, 1, [!up && !left ? R : 0, !up && !right ? R : 0, !down && !right ? R : 0, !down && !left ? R : 0]));
        } else if (s.dots === 'fluid') {
          // In an empty square between two joined dots, a curved fill makes them flow into each other.
          const R = 0.5;
          const fillet = (cx: number, cy: number, sx: number, sy: number) =>
            `M${f(cx)},${f(cy)}H${f(cx + sx * R)}A${R},${R} 0 0 ${sx * sy > 0 ? 0 : 1} ${f(cx)},${f(cy + sy * R)}Z`;
          if (up && left && on(r - 1, c - 1)) out.push(fillet(x, y, 1, 1));
          if (up && right && on(r - 1, c + 1)) out.push(fillet(x + 1, y, -1, 1));
          if (down && right && on(r + 1, c + 1)) out.push(fillet(x + 1, y + 1, -1, -1));
          if (down && left && on(r + 1, c - 1)) out.push(fillet(x, y + 1, 1, -1));
        }
        continue;
      }
      if (!dark) continue;
      const cx = x + 0.5;
      const cy = y + 0.5;
      switch (s.dots) {
        case 'square':
          out.push(`M${x},${y}h1v1h-1Z`);
          break;
        case 'rounded':
          out.push(rr(x + o, y + o, k, k, [k * 0.3, k * 0.3, k * 0.3, k * 0.3]));
          break;
        case 'dots':
          out.push(circle(cx, cy, k / 2));
          break;
        case 'small': {
          const q = k * 0.72;
          out.push(rr(cx - q / 2, cy - q / 2, q, q, [0, 0, 0, 0]));
          break;
        }
        case 'diamond':
          out.push(diamond(cx, cy, (k / 2) * 1.12));
          break;
        case 'star':
          out.push(star(cx, cy, (k / 2) * 1.18));
          break;
        case 'heart':
          out.push(heart(cx, cy + 0.04, k * 1.05));
          break;
      }
    }
  return out.join('');
}

/** Corner radii for a leaf: two opposite corners round, mirrored so the three eyes match. */
const leaf = (eye: number, r: number) => (eye === 0 ? [r, 0, r, 0] : [0, r, 0, r]);

function eyeParts(s: QrStyle, eye: number, x: number, y: number) {
  let frame = '';
  let evenodd = true;
  switch (s.eyeFrame) {
    case 'square':
      frame = rr(x, y, 7, 7, [0, 0, 0, 0]) + rrHole(x + 1, y + 1, 5, 5, [0, 0, 0, 0]);
      break;
    case 'rounded':
      frame = rr(x, y, 7, 7, [1.6, 1.6, 1.6, 1.6]) + rrHole(x + 1, y + 1, 5, 5, [0.9, 0.9, 0.9, 0.9]);
      break;
    case 'extra':
      frame = rr(x, y, 7, 7, [2.8, 2.8, 2.8, 2.8]) + rrHole(x + 1, y + 1, 5, 5, [1.9, 1.9, 1.9, 1.9]);
      break;
    case 'circle':
      frame = circle(x + 3.5, y + 3.5, 3.5) + circleHole(x + 3.5, y + 3.5, 2.5);
      break;
    case 'leaf':
      frame = rr(x, y, 7, 7, leaf(eye, 3)) + rrHole(x + 1, y + 1, 5, 5, leaf(eye, 2));
      break;
    case 'dotted': {
      evenodd = false;
      const parts: string[] = [];
      for (let i = 0; i < 7; i++)
        for (let j = 0; j < 7; j++) if (i === 0 || j === 0 || i === 6 || j === 6) parts.push(circle(x + j + 0.5, y + i + 0.5, 0.45));
      frame = parts.join('');
      break;
    }
  }
  const bx = x + 2;
  const by = y + 2;
  let ball = '';
  switch (s.eyeBall) {
    case 'square':
      ball = rr(bx, by, 3, 3, [0, 0, 0, 0]);
      break;
    case 'rounded':
      ball = rr(bx, by, 3, 3, [0.9, 0.9, 0.9, 0.9]);
      break;
    case 'circle':
      ball = circle(bx + 1.5, by + 1.5, 1.5);
      break;
    case 'diamond':
      ball = diamond(bx + 1.5, by + 1.5, 2.05);
      break;
    case 'leaf':
      ball = rr(bx, by, 3, 3, leaf(eye, 1.4));
      break;
    case 'star':
      ball = star(bx + 1.5, by + 1.62, 2.3);
      break;
  }
  return { frame, ball, evenodd };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The gradient (or plain colour) for a box: `id` names the gradient in <defs>. */
function paint(fill: Fill, id: string, x: number, y: number, w: number, h: number) {
  const colors = fill.colors.length ? fill.colors : ['#000'];
  if (fill.type === 'solid' || colors.length < 2) return { ref: colors[0], def: '' };
  const stops = colors.map((c, i) => `<stop offset="${f(i / (colors.length - 1))}" stop-color="${esc(c)}"/>`).join('');
  if (fill.type === 'radial')
    return { ref: `url(#${id})`, def: `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" r="${f(Math.hypot(w, h) / 2)}">${stops}</radialGradient>` };
  const a = (fill.angle * Math.PI) / 180;
  const dx = (Math.cos(a) * w) / 2;
  const dy = (Math.sin(a) * h) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return {
    ref: `url(#${id})`,
    def: `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(cx - dx)}" y1="${f(cy - dy)}" x2="${f(cx + dx)}" y2="${f(cy + dy)}">${stops}</linearGradient>`,
  };
}

export const FONT_WEIGHT: Record<string, number> = { Geist: 700, Montserrat: 700, Caveat: 700 };

/**
 * The whole picture as SVG text. `px` is its width in pixels (height follows); `fontCss` is the
 * @font-face of the caption's font, put inside so the font works wherever the SVG goes.
 */
export function renderSvg(m: Matrix, s: QrStyle, opts: { px?: number; logo?: Logo; fontCss?: string; id?: string } = {}) {
  const n = m.size;
  const id = opts.id ?? 'qr';
  const q = n + 2 * s.margin;
  const caption = s.frame !== 'none' && s.frameText.trim() ? s.frameText.trim() : '';
  const framed = s.frame !== 'none';
  // Frame sizes, in modules.
  const border = framed && (s.frame === 'box' || s.frame === 'rounded' || s.frame === 'top') ? Math.max(1, q * 0.04) : 0;
  const strip = framed ? Math.max(4, q * 0.17) : 0;
  const gap = s.frame === 'banner' || s.frame === 'bubble' ? q * 0.03 + (s.frame === 'bubble' ? q * 0.04 : 0) : 0;
  const W = q + 2 * border;
  const H = q + 2 * border + strip + gap;
  const qx = border;
  const qy = border + (s.frame === 'top' ? strip : 0);
  const ox = qx + s.margin;
  const oy = qy + s.margin;

  const defs: string[] = [];
  const body: string[] = [];
  const fg = paint(s.fg, `${id}-fg`, ox, oy, n, n);
  const bg = paint(s.bg, `${id}-bg`, 0, 0, W, H);
  defs.push(fg.def, bg.def);
  const plain = s.transparent ? 'none' : bg.ref;
  const solidBg = s.transparent ? '#ffffff' : s.bg.colors[0] ?? '#ffffff';

  // ---- frame behind the code ----
  const fc = esc(s.frameColor);
  if (s.frame === 'box' || s.frame === 'top' || s.frame === 'rounded') {
    const R = s.frame === 'rounded' ? q * 0.08 : 0;
    body.push(`<path fill="${fc}" d="${rr(0, 0, W, H, [R, R, R, R])}"/>`);
    const Ri = s.frame === 'rounded' ? Math.max(0, R - border) : 0;
    if (plain !== 'none') body.push(`<path fill="${plain}" d="${rr(qx, qy, q, q, [Ri, Ri, Ri, Ri])}"/>`);
  } else {
    if (plain !== 'none') body.push(`<rect fill="${plain}" x="0" y="0" width="${f(W)}" height="${f(H)}"/>`);
  }

  // ---- the code ----
  const hole = logoHole(n, opts.logo, s);
  const dots = dotsPath(m, s, ox, oy, hole);
  body.push(`<path fill="${fg.ref}" d="${dots}"/>`);
  const eyes = [
    [0, ox, oy],
    [1, ox + n - 7, oy],
    [2, ox, oy + n - 7],
  ] as const;
  const frameFill = s.eyeColors ? esc(s.eyeFrameColor) : fg.ref;
  const ballFill = s.eyeColors ? esc(s.eyeBallColor) : fg.ref;
  const parts = eyes.map(([e, x, y]) => eyeParts(s, e, x, y));
  body.push(`<path fill="${frameFill}"${parts[0].evenodd ? ' fill-rule="evenodd"' : ''} d="${parts.map((p) => p.frame).join('')}"/>`);
  body.push(`<path fill="${ballFill}" d="${parts.map((p) => p.ball).join('')}"/>`);

  // ---- logo ----
  if (opts.logo) {
    const side = s.logoSize * n;
    const bw = opts.logo.w >= opts.logo.h ? side : (side * opts.logo.w) / opts.logo.h;
    const bh = opts.logo.h >= opts.logo.w ? side : (side * opts.logo.h) / opts.logo.w;
    const cx = ox + n / 2;
    const cy = oy + n / 2;
    if (s.logoPlate) {
      const pw = hole ? hole.x1 - hole.x0 : bw + 1;
      const ph = hole ? hole.y1 - hole.y0 : bh + 1;
      const R = Math.min(pw, ph) * 0.18;
      body.push(`<path fill="${esc(solidBg)}" d="${rr(cx - pw / 2, cy - ph / 2, pw, ph, [R, R, R, R])}"/>`);
    }
    body.push(`<image href="${esc(opts.logo.url)}" x="${f(cx - bw / 2)}" y="${f(cy - bh / 2)}" width="${f(bw)}" height="${f(bh)}" preserveAspectRatio="xMidYMid meet"/>`);
  }

  // ---- caption ----
  if (framed) {
    // The caption's box: the frame's band above or below the code, or the banner under it.
    let sx = 0;
    let sw = W;
    let sy = s.frame === 'top' ? 0 : q + border;
    let sh = strip + border;
    if (s.frame === 'banner' || s.frame === 'bubble') {
      sw = q * 0.84;
      sx = (W - sw) / 2;
      sy = q + gap;
      sh = strip;
      const R = sh / 2;
      if (s.frame === 'bubble') {
        const t = q * 0.05;
        body.push(`<path fill="${fc}" d="${poly([[W / 2 - t, sy + 0.5], [W / 2, sy - t * 0.9], [W / 2 + t, sy + 0.5]])}"/>`);
      }
      body.push(`<path fill="${fc}" d="${rr(sx, sy, sw, sh, [R, R, R, R])}"/>`);
    }
    if (caption) {
      const size = strip * 0.52;
      const font = s.frameFont;
      // Rough width, so a long caption is squeezed to fit instead of running off.
      const wide = /Press Start/.test(font) ? 1 : /Bebas|Anton/.test(font) ? 0.45 : 0.62;
      const room = sw * 0.86;
      const fit = caption.length * size * wide > room ? ` textLength="${f(room)}" lengthAdjust="spacingAndGlyphs"` : '';
      body.push(
        `<text x="${f(sx + sw / 2)}" y="${f(sy + sh / 2)}" fill="${esc(s.frameTextColor)}" font-family="${esc(`'${font}', sans-serif`)}" font-weight="${FONT_WEIGHT[font] ?? 400}" font-size="${f(size)}" text-anchor="middle" dominant-baseline="central"${fit}>${esc(caption)}</text>`,
      );
    }
  }

  const px = opts.px;
  const size = px ? ` width="${px}" height="${Math.round((px * H) / W)}"` : '';
  const style = opts.fontCss && caption ? `<style>${opts.fontCss}</style>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}"${size}><defs>${style}${defs.join('')}</defs>${body.join('')}</svg>`;
  return { svg, w: W, h: H };
}
