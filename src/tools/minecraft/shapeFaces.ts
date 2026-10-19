/**
 * The faces of a block shape, for the 3D view. Only faces that can be seen are made: a face between
 * two blocks of the same layer is skipped. Faces between layers depend on what's shown, so they're
 * split: `sides` has every face of a layer that's never covered, `cap` the top faces covered by the
 * layer above (only shown for the layer being built, when the layers above are see-through).
 */

/** The blocks of each layer (bottom first), each w × l cells as from `layerGrid`. */
export type Layers = { w: number; l: number; grids: boolean[][] };

export type Quads = {
  /** 4 corners × xyz per face, centred on the shape. */
  pos: Float32Array;
  /** Brightness per corner (top faces brightest), for simple shading without lights. */
  shade: Float32Array;
  count: number;
};

type Face = { corners: [number, number, number][]; dx: number; dy: number; dz: number; shade: number };

/** Corners counter-clockwise seen from outside, so the face points the right way. */
const FACES: Face[] = [
  { dx: 1, dy: 0, dz: 0, shade: 0.8, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { dx: -1, dy: 0, dz: 0, shade: 0.8, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dx: 0, dy: 1, dz: 0, shade: 1, corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { dx: 0, dy: -1, dz: 0, shade: 0.55, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dx: 0, dy: 0, dz: 1, shade: 0.68, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dx: 0, dy: 0, dz: -1, shade: 0.68, corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
const TOP = FACES[2];

export const faceCorners = FACES.map((f) => ({ normal: [f.dx, f.dy, f.dz] as const, corners: f.corners }));

/** The faces of layer `y`: `sides` (always shown) or `cap` (its covered tops). */
export function layerQuads({ w, l, grids }: Layers, y: number, kind: 'sides' | 'cap'): Quads {
  const h = grids.length;
  const has = (x: number, z: number, yy: number) => x >= 0 && z >= 0 && x < w && z < l && yy >= 0 && yy < h && grids[yy][z * w + x];
  const faces: [Face, number, number][] = [];
  const grid = grids[y];
  for (let z = 0; z < l; z++) {
    for (let x = 0; x < w; x++) {
      if (!grid[z * w + x]) continue;
      if (kind === 'cap') {
        if (has(x, z, y + 1)) faces.push([TOP, x, z]);
        continue;
      }
      for (const f of FACES) if (!has(x + f.dx, z + f.dz, y + f.dy)) faces.push([f, x, z]);
    }
  }
  const pos = new Float32Array(faces.length * 12);
  const shade = new Float32Array(faces.length * 4);
  // Centred on the shape so it turns around its middle.
  const ox = -w / 2;
  const oy = -h / 2;
  const oz = -l / 2;
  faces.forEach(([f, x, z], i) => {
    f.corners.forEach(([cx, cy, cz], k) => {
      pos.set([x + cx + ox, y + cy + oy, z + cz + oz], i * 12 + k * 3);
      shade[i * 4 + k] = f.shade;
    });
  });
  return { pos, shade, count: faces.length };
}
