/**
 * Shapes for the shape generator, as blocks. A shape fills a box of w × l blocks (rows are the
 * length) and, for 3D shapes, h layers counted from the bottom.
 */

export type Shape = 'circle' | 'polygon' | 'star' | 'heart' | 'sphere' | 'dome' | 'cylinder' | 'cone' | 'pyramid' | 'torus';
export type Fill = 'thin' | 'thick' | 'filled';

export type ShapeParams = {
  w: number;
  l: number;
  /** Layers (3D shapes except the torus, whose height is its tube). */
  h: number;
  /** Polygon: number of sides. */
  sides: number;
  /** Star: number of points, and how deep the cuts between them go (%). */
  points: number;
  depth: number;
  /** Torus: how thick the ring is, in blocks (also its height). */
  tube: number;
};

export const FLAT_SHAPES = ['circle', 'polygon', 'star', 'heart'] as const satisfies readonly Shape[];
export const SOLID_SHAPES = ['sphere', 'dome', 'cylinder', 'cone', 'pyramid', 'torus'] as const satisfies readonly Shape[];
export const is3d = (s: Shape) => (SOLID_SHAPES as readonly Shape[]).includes(s);

/** Biggest sizes: 3D shapes count every block of every layer. */
export const MAX_FLAT = 256;
export const MAX_SOLID = 128;

/** How many layers the shape has. */
export function layersOf(shape: Shape, p: ShapeParams) {
  if (!is3d(shape)) return 1;
  // A tube thicker than half the ring would fill the hole completely.
  if (shape === 'torus') return Math.max(1, Math.min(Math.round(p.tube), Math.floor(Math.min(p.w, p.l) / 2)));
  return p.h;
}

/**
 * Hollow shapes with a flat side on the ground (or the open ends of a tube) aren't closed off
 * there: the ground is the floor, and a tower has no lid.
 */
function openEnds(shape: Shape) {
  return { bottom: shape === 'dome' || shape === 'cone' || shape === 'pyramid' || shape === 'cylinder', top: shape === 'cylinder' };
}

type Pt = [number, number];

/** A polygon stretched so it touches all four sides of the -1…1 box. */
function fitToBox(pts: Pt[]): Pt[] {
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  return pts.map(([x, z]) => [((x - x0) / (x1 - x0)) * 2 - 1, ((z - z0) / (z1 - z0)) * 2 - 1]);
}

/** Whether a point is inside a polygon (ray casting; works for the star's dents too). */
function inPolygonOnce(pts: Pt[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The polygons here are mirror images left to right; testing both sides keeps the blocks exactly
 * symmetric (points right on an edge would otherwise fall on one side only).
 */
const inPolygon = (pts: Pt[], x: number, z: number) => inPolygonOnce(pts, x, z) || inPolygonOnce(pts, -x, z);

/** A regular polygon with a flat side at the bottom (z grows downwards, like the guide). */
export function polygonPoints(sides: number): Pt[] {
  const n = Math.max(3, Math.min(12, Math.round(sides)));
  const start = Math.PI / 2 - Math.PI / n;
  return fitToBox(Array.from({ length: n }, (_, k) => [Math.cos(start + (2 * Math.PI * k) / n), Math.sin(start + (2 * Math.PI * k) / n)] as Pt));
}

/** A star with one point straight up; `depth` % of the way in between the points. */
export function starPoints(points: number, depth: number): Pt[] {
  const n = Math.max(3, Math.min(12, Math.round(points)));
  const inner = 1 - Math.max(10, Math.min(90, depth)) / 100;
  return fitToBox(
    Array.from({ length: n * 2 }, (_, k) => {
      const a = -Math.PI / 2 + (Math.PI * k) / n;
      const r = k % 2 ? inner : 1;
      return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
    }),
  );
}

/** The heart curve (x² + y² − 1)³ ≤ x²y³, y pointing up; its box, measured once. */
const heartAt = (x: number, y: number) => (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0;
const HEART = (() => {
  let x1 = 0;
  let y0 = 0;
  let y1 = 0;
  for (let i = 0; i <= 600; i++) {
    for (let j = 0; j <= 600; j++) {
      const x = -1.5 + (3 * i) / 600;
      const y = -1.5 + (3 * j) / 600;
      if (!heartAt(x, y)) continue;
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { x1, y0, y1 };
})();

/** Whether the block at (x, z) on layer y (0 = bottom) is part of the shape. */
function insideTest(shape: Shape, p: ShapeParams): (x: number, z: number, y: number) => boolean {
  const { w, l } = p;
  const h = layersOf(shape, p);
  // The block's middle, -1…1 across the box.
  const nx = (x: number) => (x + 0.5 - w / 2) / (w / 2);
  const nz = (z: number) => (z + 0.5 - l / 2) / (l / 2);
  /** 0 at the bottom of the box, 1 at the top. */
  const up = (y: number) => (y + 0.5) / h;

  switch (shape) {
    case 'circle':
    case 'cylinder':
      return (x, z) => nx(x) ** 2 + nz(z) ** 2 <= 1;
    case 'polygon': {
      const pts = polygonPoints(p.sides);
      return (x, z) => inPolygon(pts, nx(x), nz(z));
    }
    case 'star': {
      const pts = starPoints(p.points, p.depth);
      return (x, z) => inPolygon(pts, nx(x), nz(z));
    }
    case 'heart':
      return (x, z) => heartAt(((nx(x) + 1) / 2) * 2 * HEART.x1 - HEART.x1, HEART.y1 - ((nz(z) + 1) / 2) * (HEART.y1 - HEART.y0));
    case 'sphere':
      return (x, z, y) => nx(x) ** 2 + nz(z) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2 <= 1;
    case 'dome':
      return (x, z, y) => nx(x) ** 2 + nz(z) ** 2 + up(y) ** 2 <= 1;
    case 'cone': {
      return (x, z, y) => {
        // Full width at the ground, narrowing to a point at the top.
        const r = 1 - y / h;
        return nx(x) ** 2 + nz(z) ** 2 <= r * r;
      };
    }
    case 'pyramid':
      return (x, z, y) => Math.max(Math.abs(nx(x)), Math.abs(nz(z))) <= 1 - y / h;
    case 'torus': {
      // The tube's radius as a share of the ring's (smaller) half-width.
      const tube = h / Math.min(w, l);
      const middle = 1 - tube;
      return (x, z, y) => {
        const d = Math.sqrt(nx(x) ** 2 + nz(z) ** 2);
        return ((d - middle) / tube) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2 <= 1;
      };
    }
  }
}

/** Every block of the shape, worked out once: a w × l × h grid of 0 / 1. */
export type Volume = { shape: Shape; w: number; l: number; h: number; cells: Uint8Array };

export function buildVolume(shape: Shape, p: ShapeParams): Volume {
  const h = layersOf(shape, p);
  const { w, l } = p;
  const inside = insideTest(shape, p);
  const cells = new Uint8Array(w * l * h);
  for (let y = 0; y < h; y++) for (let z = 0; z < l; z++) for (let x = 0; x < w; x++) cells[(y * l + z) * w + x] = inside(x, z, y) ? 1 : 0;
  return { shape, w, l, h, cells };
}

/** The blocks to place on one layer (0 = bottom), as w × l cells. */
export function layerGrid(v: Volume, fill: Fill, layer: number): boolean[] {
  const { w, l, h, cells } = v;
  const y = Math.max(0, Math.min(h - 1, layer));
  const open = openEnds(v.shape);
  const solid = is3d(v.shape);
  const at = (x: number, z: number, yy: number) => {
    if (x < 0 || z < 0 || x >= w || z >= l) return false;
    if (yy < 0) return open.bottom;
    if (yy >= h) return open.top;
    return cells[(yy * l + z) * w + x] === 1;
  };
  const out: boolean[] = new Array(w * l).fill(false);
  for (let z = 0; z < l; z++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, z, y)) continue;
      if (fill === 'filled') {
        out[z * w + x] = true;
        continue;
      }
      let edge = !at(x + 1, z, y) || !at(x - 1, z, y) || !at(x, z + 1, y) || !at(x, z - 1, y);
      if (fill === 'thick') edge ||= !at(x + 1, z + 1, y) || !at(x - 1, z + 1, y) || !at(x + 1, z - 1, y) || !at(x - 1, z - 1, y);
      // Hollow 3D shapes also need the blocks whose neighbour above or below is outside.
      if (solid) edge ||= !at(x, z, y + 1) || !at(x, z, y - 1);
      out[z * w + x] = edge;
    }
  }
  return out;
}

/** Blocks in the whole shape, every layer. */
export function wholeCount(v: Volume, fill: Fill) {
  let n = 0;
  for (let y = 0; y < v.h; y++) for (const c of layerGrid(v, fill, y)) if (c) n++;
  return n;
}
