// Turns a phone photo of a sheet of paper into a clean "scan":
// find the sheet, undo the perspective, flatten uneven lighting, then tone it.

export type ScanLook = 'color' | 'gray' | 'bw';
type Pt = [number, number];

const MAX_SOURCE = 4000; // px, long side the photo is worked at
const MAX_OUTPUT = 2600; // px, long side of the finished page (~300 dpi A4)
const DETECT = 640; // px, long side used to find the sheet

/** Otsu threshold of an 8-bit histogram. */
function otsu(hist: Uint32Array, total: number) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

const area = (q: Pt[]) => {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = q[i];
    const [x2, y2] = q[(i + 1) % 4];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};

/** Orders four points as top-left, top-right, bottom-right, bottom-left. */
function order(pts: Pt[]): Pt[] {
  const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
  const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
  const sorted = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  // atan2 order starts at the left going clockwise (y points down); rotate so the top-left comes first.
  let start = 0;
  for (let i = 1; i < 4; i++) if (sorted[i][0] + sorted[i][1] < sorted[start][0] + sorted[start][1]) start = i;
  return [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]);
}

/**
 * Finds the sheet as the largest bright region and returns its corners in detection-image pixels,
 * or null when no believable sheet is found (then the whole photo is used).
 */
function findSheet(gray: Uint8ClampedArray, w: number, h: number): Pt[] | null {
  // Box blur so text and paper texture don't split the sheet up.
  const blur = new Uint8ClampedArray(w * h);
  const r = 3;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy += 2)
        for (let dx = -r; dx <= r; dx += 2) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          s += gray[yy * w + xx];
          n++;
        }
      blur[y * w + x] = s / n;
    }

  /** The sheet as the largest region brighter than `t`, or null. */
  const at = (t: number): Pt[] | null => {
    // Largest connected bright component.
    const label = new Int32Array(w * h);
    const stack = new Int32Array(w * h);
    let bestId = 0;
    let bestSize = 0;
    let id = 0;
    for (let i = 0; i < w * h; i++) {
      if (label[i] || blur[i] <= t) continue;
      id++;
      let size = 0;
      let sp = 0;
      stack[sp++] = i;
      label[i] = id;
      while (sp) {
        const p = stack[--sp];
        size++;
        const x = p % w;
        const y = (p - x) / w;
        const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of nb)
          if (q >= 0 && !label[q] && blur[q] > t) {
            label[q] = id;
            stack[sp++] = q;
          }
      }
      if (size > bestSize) {
        bestSize = size;
        bestId = id;
      }
    }
    if (bestSize < w * h * 0.15) return null;

    // Extreme points along the diagonals and along the axes; keep whichever quad is bigger.
    // Diagonals suit a sheet held roughly straight, axes suit one turned around 45°.
    let tl: Pt = [0, 0],
      tr: Pt = [0, 0],
      br: Pt = [0, 0],
      bl: Pt = [0, 0];
    let l: Pt = [0, 0],
      rt: Pt = [0, 0],
      tp: Pt = [0, 0],
      bt: Pt = [0, 0];
    let s1 = Infinity,
      s2 = -Infinity,
      d1 = -Infinity,
      d2 = Infinity;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (label[y * w + x] !== bestId) continue;
        if (x + y < s1) ((s1 = x + y), (tl = [x, y]));
        if (x + y > s2) ((s2 = x + y), (br = [x, y]));
        if (x - y > d1) ((d1 = x - y), (tr = [x, y]));
        if (x - y < d2) ((d2 = x - y), (bl = [x, y]));
        if (x < minX) ((minX = x), (l = [x, y]));
        if (x > maxX) ((maxX = x), (rt = [x, y]));
        if (y < minY) ((minY = y), (tp = [x, y]));
        if (y > maxY) ((maxY = y), (bt = [x, y]));
      }
    const diag: Pt[] = [tl, tr, br, bl];
    const axis = order([tp, rt, bt, l]);
    const quad = area(axis) > area(diag) * 1.05 ? axis : diag;

    const a = area(quad);
    // Sheet fills almost the whole photo: cropping would only shave the edges.
    if (a > w * h * 0.94 || a < w * h * 0.15) return null;
    // The region should mostly fill its quad (a sheet, not a blob). Dense text leaves holes, hence the slack.
    if (bestSize < a * 0.65) return null;
    if (!sharpEdges(gray, w, h, quad)) return null;
    return quad;
  };

  // Otsu splits the photo in two. When the surface is light too (a pale table, a beige wall), the
  // bright half is paper and surface together: a second split among the bright pixels alone
  // separates the even brighter paper. The stricter one is tried first.
  const hist = new Uint32Array(256);
  for (const v of blur) hist[v]++;
  const t1 = otsu(hist, w * h);
  const bright = hist.map((n, v) => (v > t1 ? n : 0));
  const t2 = otsu(
    bright,
    bright.reduce((n, v) => n + v, 0),
  );
  return (t2 > t1 + 8 ? at(t2) : null) ?? at(t1);
}

/**
 * A real sheet edge is a sharp step in brightness; a shadow falling across the paper is a soft ramp.
 * Each side of the quad that isn't on the photo border must show a clear step, or the crop is rejected.
 */
function sharpEdges(gray: Uint8ClampedArray, w: number, h: number, quad: Pt[]) {
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4;
  const cy = quad.reduce((s, p) => s + p[1], 0) / 4;
  const at = (x: number, y: number) => gray[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  const off = Math.max(4, Math.round(Math.max(w, h) / 120));
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = quad[e];
    const [bx, by] = quad[(e + 1) % 4];
    // A side running along one photo border has nothing outside it to compare with.
    const alongBorder = (ax <= 2 && bx <= 2) || (ay <= 2 && by <= 2) || (ax >= w - 3 && bx >= w - 3) || (ay >= h - 3 && by >= h - 3);
    if (alongBorder) continue;
    // Normal pointing out of the sheet.
    let nx = by - ay;
    let ny = -(bx - ax);
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    if ((mx + nx - cx) ** 2 + (my + ny - cy) ** 2 < (mx - cx) ** 2 + (my - cy) ** 2) {
      nx = -nx;
      ny = -ny;
    }
    const steps: number[] = [];
    for (let i = 1; i < 40; i++) {
      const t = 0.1 + (i / 40) * 0.8;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const inside = at(x - nx * off, y - ny * off);
      const outside = at(x + nx * off, y + ny * off);
      const further = at(x - nx * off * 3, y - ny * off * 3);
      // The jump across the edge must be much bigger than the drift just inside it.
      steps.push(Math.abs(inside - outside) - Math.abs(further - inside));
    }
    steps.sort((p, q) => p - q);
    if (steps[steps.length >> 1] < 18) return false;
  }
  return true;
}

/** Projective map from the unit square to a quad (Heckbert): (u, v) → source pixel. */
function squareToQuad([p0, p1, p2, p3]: Pt[]) {
  const [x0, y0] = p0,
    [x1, y1] = p1,
    [x2, y2] = p2,
    [x3, y3] = p3;
  const dx1 = x1 - x2,
    dx2 = x3 - x2,
    dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2,
    dy2 = y3 - y2,
    dy3 = y0 - y1 + y2 - y3;
  let g = 0,
    h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = x1 - x0 + g * x1,
    b = x3 - x0 + h * x3,
    c = x0;
  const d = y1 - y0 + g * y1,
    e = y3 - y0 + h * y3,
    f = y0;
  return (u: number, v: number): Pt => {
    const z = g * u + h * v + 1;
    return [(a * u + b * v + c) / z, (d * u + e * v + f) / z];
  };
}

function warp(src: ImageData, quad: Pt[], W: number, H: number, report: (p: number) => void) {
  const map = squareToQuad(quad);
  const out = new Uint8ClampedArray(W * H * 4);
  const sw = src.width;
  const sh = src.height;
  const s = src.data;
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      let [fx, fy] = map((x + 0.5) / W, v);
      fx = Math.min(sw - 1.001, Math.max(0, fx - 0.5));
      fy = Math.min(sh - 1.001, Math.max(0, fy - 0.5));
      const ix = fx | 0;
      const iy = fy | 0;
      const ax = fx - ix;
      const ay = fy - iy;
      const i00 = (iy * sw + ix) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * ax;
        const bot = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * ax;
        out[o + c] = top + (bot - top) * ay;
      }
      out[o + 3] = 255;
    }
    if (y % 64 === 0) report(y / H);
  }
  return out;
}

/**
 * Estimates the paper's own brightness per area (max-pool so text drops out, then blur)
 * and divides it out. That removes shadows and turns grey-lit paper white.
 */
function flatten(px: Uint8ClampedArray, W: number, H: number) {
  const B = Math.max(16, Math.round(Math.max(W, H) / 48));
  const mw = Math.ceil(W / B);
  const mh = Math.ceil(H / B);
  const maps = [0, 1, 2].map(() => new Float32Array(mw * mh));
  for (let by = 0; by < mh; by++)
    for (let bx = 0; bx < mw; bx++) {
      // 95th-percentile-ish: the max of a coarse sample, so single hot pixels don't win.
      const vals: number[][] = [[], [], []];
      for (let y = by * B; y < Math.min(H, (by + 1) * B); y += 2)
        for (let x = bx * B; x < Math.min(W, (bx + 1) * B); x += 2) {
          const i = (y * W + x) * 4;
          vals[0].push(px[i]);
          vals[1].push(px[i + 1]);
          vals[2].push(px[i + 2]);
        }
      for (let c = 0; c < 3; c++) {
        const v = vals[c].sort((a, b) => a - b);
        maps[c][by * mw + bx] = v[Math.floor((v.length - 1) * 0.95)] ?? 255;
      }
    }
  // Dilate once so blocks that are mostly text borrow paper from their neighbours, then blur twice.
  const pass = (m: Float32Array, fn: (vals: number[]) => number) => {
    const o = new Float32Array(m.length);
    for (let y = 0; y < mh; y++)
      for (let x = 0; x < mw; x++) {
        const vals: number[] = [];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < mw && yy < mh) vals.push(m[yy * mw + xx]);
          }
        o[y * mw + x] = fn(vals);
      }
    return o;
  };
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const bg = maps.map((m) =>
    pass(
      pass(
        pass(m, (v) => Math.max(...v)),
        mean,
      ),
      mean,
    ),
  );

  for (let y = 0; y < H; y++) {
    const fy = Math.min(mh - 1, Math.max(0, (y + 0.5) / B - 0.5));
    const y0 = fy | 0;
    const y1 = Math.min(mh - 1, y0 + 1);
    const ay = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(mw - 1, Math.max(0, (x + 0.5) / B - 0.5));
      const x0 = fx | 0;
      const x1 = Math.min(mw - 1, x0 + 1);
      const ax = fx - x0;
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const m = bg[c];
        const top = m[y0 * mw + x0] + (m[y0 * mw + x1] - m[y0 * mw + x0]) * ax;
        const bot = m[y1 * mw + x0] + (m[y1 * mw + x1] - m[y1 * mw + x0]) * ax;
        const paper = Math.max(40, top + (bot - top) * ay);
        px[i + c] = (px[i + c] / paper) * 255;
      }
    }
  }
}

function tone(px: Uint8ClampedArray, look: ScanLook) {
  // After flattening paper sits near 255; a gamma curve deepens ink without greying the paper.
  const curve = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const n = Math.min(1, Math.max(0, (v / 255 - 0.04) / 0.9));
    curve[v] = Math.pow(n, 1.6) * 255;
  }
  for (let i = 0; i < px.length; i += 4) {
    if (look === 'color') {
      px[i] = curve[px[i]];
      px[i + 1] = curve[px[i + 1]];
      px[i + 2] = curve[px[i + 2]];
      continue;
    }
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    let v: number;
    if (look === 'gray') v = curve[lum | 0];
    else {
      // Soft threshold keeps letter edges smooth instead of jagged.
      const n = Math.min(1, Math.max(0, (lum / 255 - 0.6) / 0.22));
      v = n * n * (3 - 2 * n) * 255;
    }
    px[i] = px[i + 1] = px[i + 2] = v;
  }
}

type Source = ImageBitmap | OffscreenCanvas;

/** The photo turned clockwise by `deg` (0, 90, 180, 270). */
export function turn(src: Source, deg: number): Source {
  const d = ((deg % 360) + 360) % 360;
  if (!d) return src;
  const side = d % 180 !== 0;
  const c = new OffscreenCanvas(side ? src.height : src.width, side ? src.width : src.height);
  const g = c.getContext('2d')!;
  g.translate(c.width / 2, c.height / 2);
  g.rotate((d * Math.PI) / 180);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

/**
 * The sheet's corners in the photo as fractions of its width and height (top-left, top-right,
 * bottom-right, bottom-left), or null when no believable sheet is found.
 */
export function detectSheet(src: Source): Pt[] | null {
  const dk = DETECT / Math.max(src.width, src.height);
  const dw = Math.max(1, Math.round(src.width * dk));
  const dh = Math.max(1, Math.round(src.height * dk));
  const det = new OffscreenCanvas(dw, dh);
  const dctx = det.getContext('2d', { willReadFrequently: true })!;
  dctx.drawImage(src, 0, 0, dw, dh);
  const d = dctx.getImageData(0, 0, dw, dh).data;
  // White paper is bright in all three colours; a light wooden table or a beige wall is about as
  // bright but has little blue. So the darkest colour of each pixel tells paper from those, and
  // plain brightness is the fallback (paper on a grey or coloured surface).
  const whiteness = new Uint8ClampedArray(dw * dh);
  const gray = new Uint8ClampedArray(dw * dh);
  for (let i = 0; i < gray.length; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    whiteness[i] = Math.min(r, g, b);
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const found = findSheet(whiteness, dw, dh) ?? findSheet(gray, dw, dh);
  if (!found) return null;
  // Pulled in a hair so no table shows at the edges.
  const cx = found.reduce((s, p) => s + p[0], 0) / 4;
  const cy = found.reduce((s, p) => s + p[1], 0) / 4;
  return found.map(([x, y]) => [(cx + (x - cx) * 0.985) / dw, (cy + (y - cy) * 0.985) / dh] as Pt);
}

const lumOf = (px: Uint8ClampedArray, i: number) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];

/**
 * Makes the paper pure white: everything nearly white becomes white, and tiny dark specks on their
 * own (dust, paper grain, sensor noise) are wiped. Dots of real text are bigger than these.
 */
export function cleanPaper(px: Uint8ClampedArray, W: number, H: number) {
  for (let i = 0; i < px.length; i += 4) {
    // (Only greyish white: light colours like yellow highlighter stay.)
    if (lumOf(px, i) >= 236 && Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) < 28) px[i] = px[i + 1] = px[i + 2] = 255;
  }
  const dark = (p: number) => lumOf(px, p * 4) < 170;
  const maxSpeck = Math.max(2, Math.round(((W * H) / 4.8e6) * 6));
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const blob: number[] = [];
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || !dark(start)) continue;
    // Flood the whole dark spot (each pixel is visited once overall); only its first pixels are kept.
    blob.length = 0;
    let size = 0;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    while (sp) {
      const p = stack[--sp];
      if (++size <= maxSpeck) blob.push(p);
      const x = p % W;
      if (x > 0 && !seen[p - 1] && dark(p - 1)) ((seen[p - 1] = 1), (stack[sp++] = p - 1));
      if (x < W - 1 && !seen[p + 1] && dark(p + 1)) ((seen[p + 1] = 1), (stack[sp++] = p + 1));
      if (p >= W && !seen[p - W] && dark(p - W)) ((seen[p - W] = 1), (stack[sp++] = p - W));
      if (p + W < W * H && !seen[p + W] && dark(p + W)) ((seen[p + W] = 1), (stack[sp++] = p + W));
    }
    if (size <= maxSpeck) for (const p of blob) px[p * 4] = px[p * 4 + 1] = px[p * 4 + 2] = 255;
  }
}

/**
 * Wipes to white everything that isn't paper-white and touches the picture's edge: what's left of
 * the table, a clipboard, a hand or the paper's shadow when the sheet wasn't (fully) found. It works
 * in small blocks, grown by one, so the speckled leftovers of a textured surface join up with it.
 * Writing doesn't reach the edge (the paper's margin is wider than a block), so it stays. What's
 * paper is read from `ref` (a black and white copy, where paper is exactly white) and wiped in both.
 */
export function wipeSurroundings(px: Uint8ClampedArray, W: number, H: number, ref = px) {
  const B = Math.max(2, Math.round(Math.max(W, H) / 450));
  const bw = Math.ceil(W / B);
  const bh = Math.ceil(H / B);
  // A block is "not paper" if anything in it isn't white (after cleanPaper the paper is exactly white).
  const ink = new Uint8Array(bw * bh);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (lumOf(ref, (y * W + x) * 4) < 250) ink[Math.floor(y / B) * bw + Math.floor(x / B)] = 1;
  const grown = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      if (!ink[y * bw + x]) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < bw && yy < bh) grown[yy * bw + xx] = 1;
        }
    }
  const out = new Uint8Array(bw * bh);
  const stack = new Int32Array(bw * bh);
  let sp = 0;
  const push = (p: number) => {
    if (grown[p] && !out[p]) {
      out[p] = 1;
      stack[sp++] = p;
    }
  };
  for (let x = 0; x < bw; x++) push(x), push((bh - 1) * bw + x);
  for (let y = 0; y < bh; y++) push(y * bw), push(y * bw + bw - 1);
  while (sp) {
    const p = stack[--sp];
    const x = p % bw;
    if (x > 0) push(p - 1);
    if (x < bw - 1) push(p + 1);
    if (p >= bw) push(p - bw);
    if (p + bw < bw * bh) push(p + bw);
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (out[Math.floor(y / B) * bw + Math.floor(x / B)]) {
        const i = (y * W + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = 255;
        ref[i] = ref[i + 1] = ref[i + 2] = 255;
      }
}

/**
 * The rectangle around what's on the sheet (text, drawings, pictures), with a little room around
 * it, or null for an empty sheet. A thin band at the edges is ignored: that's where the paper's
 * edge and its shadow can still show.
 */
export function contentBox(px: Uint8ClampedArray, W: number, H: number): { x: number; y: number; w: number; h: number } | null {
  const bx = Math.round(W * 0.02);
  const by = Math.round(H * 0.02);
  const rows = new Uint32Array(H);
  const cols = new Uint32Array(W);
  for (let y = by; y < H - by; y++)
    for (let x = bx; x < W - bx; x++)
      if (lumOf(px, (y * W + x) * 4) < 200) {
        rows[y]++;
        cols[x]++;
      }
  // A row or column counts once a few of its pixels are ink (a lone leftover speck doesn't).
  const minRow = Math.max(2, Math.round(W * 0.002));
  const minCol = Math.max(2, Math.round(H * 0.002));
  let y0 = rows.findIndex((n) => n >= minRow);
  if (y0 < 0) return null;
  let y1 = H - 1 - [...rows].reverse().findIndex((n) => n >= minRow);
  let x0 = cols.findIndex((n) => n >= minCol);
  let x1 = W - 1 - [...cols].reverse().findIndex((n) => n >= minCol);
  if (x0 < 0) return null;
  const pad = Math.round(Math.max(W, H) * 0.01);
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad);
  y1 = Math.min(H - 1, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * How much the lines of text are turned, in degrees (positive: rising to the right), or 0 when
 * there's no clear text to tell by. The page is tried turned by small angles; at the right one the
 * text lines lie flat, so counting ink per row gives the sharpest peaks. Only the top and bottom
 * edges of dark strokes count, so big dark areas (a clipboard, the table) don't sway it.
 */
export function textSkew(px: Uint8ClampedArray, W: number, H: number): number {
  const s = Math.max(1, Math.round(W / 900));
  const w = Math.floor(W / s);
  const h = Math.floor(H / s);
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dark[y * w + x] = lumOf(px, (y * s * W + x * s) * 4) < 150 ? 1 : 0;
  const xs: number[] = [];
  const ys: number[] = [];
  const k = 2;
  for (let y = k; y < h - k; y++)
    for (let x = 0; x < w; x++) if (dark[y * w + x] && (!dark[(y - k) * w + x] || !dark[(y + k) * w + x])) xs.push(x), ys.push(y);
  if (xs.length < 400) return 0;
  const bins = new Float64Array(h + w + 2);
  const score = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    bins.fill(0);
    for (let i = 0; i < xs.length; i++) bins[Math.round(ys[i] * cos + xs[i] * sin) + w] += 1;
    let sum = 0;
    for (let i = 0; i < bins.length; i++) sum += bins[i] * bins[i];
    return sum;
  };
  let best = 0;
  let bestScore = -1;
  const tried: number[] = [];
  for (let d = -8; d <= 8.001; d += 0.25) {
    const v = score(d);
    tried.push(v);
    if (v > bestScore) (bestScore = v), (best = d);
  }
  for (let d = best - 0.25; d <= best + 0.25; d += 0.05) {
    const v = score(d);
    if (v > bestScore) (bestScore = v), (best = d);
  }
  // Without real lines of text no angle stands out: leave it as it is.
  const sorted = [...tried].sort((p, q) => p - q);
  if (bestScore < sorted[sorted.length >> 1] * 1.15) return 0;
  return Math.abs(best) < 0.1 ? 0 : Math.round(best * 100) / 100;
}

/** The page turned by `deg` (clockwise on screen) around its middle, with white where nothing was. */
function rotatePage(px: Uint8ClampedArray, W: number, H: number, deg: number) {
  const src = new OffscreenCanvas(W, H);
  src.getContext('2d')!.putImageData(new ImageData(px, W, H), 0, 0);
  const out = new OffscreenCanvas(W, H);
  const g = out.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  g.translate(W / 2, H / 2);
  g.rotate((deg * Math.PI) / 180);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, -W / 2, -H / 2);
  return g.getImageData(0, 0, W, H).data;
}

export type ScannedPage ={ blob: Blob; width: number; height: number; sheet?: { w: number; h: number; x: number; y: number } };

/**
 * A photo of paper as a clean scan: the sheet inside `quad` (fractions of the photo, null = the whole
 * photo) straightened, flattened, toned and with pure white paper. With `content`, only what's on
 * the sheet comes back, with where it was (`sheet`).
 */
export async function scanPage(photo: Source, look: ScanLook, quad: Pt[] | null, content: boolean, report: (p: number) => void): Promise<ScannedPage> {
  // Work copy of the photo, capped so 48 MP photos don't exhaust memory.
  const k = Math.min(1, MAX_SOURCE / Math.max(photo.width, photo.height));
  const sw = Math.round(photo.width * k);
  const sh = Math.round(photo.height * k);
  const src = new OffscreenCanvas(sw, sh);
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(photo, 0, 0, sw, sh);
  report(0.15);

  // Corners dragged across each other still make a sheet.
  const q: Pt[] = quad
    ? order(quad.map(([x, y]) => [Math.min(1, Math.max(0, x)) * sw, Math.min(1, Math.max(0, y)) * sh] as Pt))
    : [
        [0, 0],
        [sw, 0],
        [sw, sh],
        [0, sh],
      ];
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let W = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  let H = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const ok = Math.min(1, MAX_OUTPUT / Math.max(W, H));
  W = Math.max(1, Math.round(W * ok));
  H = Math.max(1, Math.round(H * ok));

  let px = warp(sctx.getImageData(0, 0, sw, sh), q, W, H, (p) => report(0.15 + p * 0.55));
  report(0.72);
  flatten(px, W, H);
  report(0.88);
  // Where the text is and how it lies is read from a black and white copy, whatever the look: in grey
  // and colour the paper isn't exactly white (a shadow, a fold), which would throw off the levelling,
  // let the wiping of the surroundings run over the paper into the writing and widen the content's box.
  let bw = px;
  if (look !== 'bw') bw = px.slice();
  tone(bw, 'bw');
  if (look !== 'bw') tone(px, look);
  // Text that still runs uphill or downhill (a sheet whose edges weren't all in the photo, a bent page) is turned level.
  const skew = textSkew(bw, W, H);
  if (skew) {
    px = rotatePage(px, W, H, skew);
    bw = look === 'bw' ? px : rotatePage(bw, W, H, skew);
  }
  cleanPaper(px, W, H);
  if (bw !== px) cleanPaper(bw, W, H);
  if (content) wipeSurroundings(px, W, H, bw);
  report(0.95);

  const full = new OffscreenCanvas(W, H);
  full.getContext('2d')!.putImageData(new ImageData(px, W, H), 0, 0);
  const quality = look === 'bw' ? 0.8 : 0.85;
  const box = content ? contentBox(bw, W, H) : null;
  if (!box) {
    report(1);
    return { blob: await full.convertToBlob({ type: 'image/jpeg', quality }), width: W, height: H, ...(content ? { sheet: { w: W, h: H, x: 0, y: 0 } } : {}) };
  }
  const cut = new OffscreenCanvas(box.w, box.h);
  cut.getContext('2d')!.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  report(1);
  return { blob: await cut.convertToBlob({ type: 'image/jpeg', quality }), width: box.w, height: box.h, sheet: { w: W, h: H, x: box.x, y: box.y } };
}
