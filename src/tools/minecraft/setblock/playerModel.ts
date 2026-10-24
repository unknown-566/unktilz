import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, NearestFilter, SRGBColorSpace } from 'three';
import { FACES, PARTS, SKIN, faceFrame, faceRect, type FaceId, type PartId } from '../../../lib/mc/skinLayout';

// A player with Steve's look (hair, beard, teal shirt, blue trousers), drawn here as pixel art on a
// 64×64 skin laid out like the game's, so the body has the game's proportions.
const C = {
  hair: '#3d2817',
  skin: '#c69c76',
  shade: '#a9785a',
  white: '#ffffff',
  eye: '#4840a8',
  beard: '#6b4129',
  shirt: '#1fa3a6',
  shirtDark: '#178487',
  pants: '#3b3fa3',
  shoes: '#5c5c5c',
};

function drawFace(g: CanvasRenderingContext2D, part: PartId, face: FaceId) {
  const r = faceRect(part, 'base', face, 'classic');
  const px = (x: number, y: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(r.x + x, r.y + y, 1, 1);
  };
  const rows = (from: number, to: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(r.x, r.y + from, r.w, Math.min(r.h, to) - from);
  };
  if (part === 'head') {
    rows(0, r.h, C.skin);
    if (face === 'top') return rows(0, r.h, C.hair);
    if (face === 'bottom') return;
    if (face === 'back') return rows(0, 7, C.hair);
    if (face === 'right' || face === 'left') return rows(0, 3, C.hair);
    // The face.
    rows(0, 2, C.hair);
    px(0, 2, C.hair);
    px(7, 2, C.hair);
    px(1, 4, C.white);
    px(2, 4, C.eye);
    px(5, 4, C.eye);
    px(6, 4, C.white);
    px(3, 5, C.shade);
    px(4, 5, C.shade);
    for (let x = 2; x <= 5; x++) px(x, 6, C.beard);
    px(3, 7, C.beard);
    px(4, 7, C.beard);
    return;
  }
  if (part === 'body') {
    rows(0, r.h, C.shirt);
    if (face === 'front') {
      px(3, 0, C.skin);
      px(4, 0, C.skin);
    }
    if (face !== 'top' && face !== 'bottom') rows(r.h - 1, r.h, C.shirtDark);
    return;
  }
  if (part === 'rightArm' || part === 'leftArm') {
    if (face === 'top') return rows(0, r.h, C.shirt);
    if (face === 'bottom') return rows(0, r.h, C.skin);
    rows(0, 4, C.shirt);
    return rows(4, r.h, C.skin);
  }
  // Legs.
  if (face === 'top') return rows(0, r.h, C.pants);
  if (face === 'bottom') return rows(0, r.h, C.shoes);
  rows(0, 10, C.pants);
  rows(10, r.h, C.shoes);
}

function skinTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = SKIN;
  const g = c.getContext('2d')!;
  for (const part of PARTS) for (const face of FACES) drawFace(g, part, face);
  const t = new CanvasTexture(c);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.colorSpace = SRGBColorSpace;
  return t;
}

const SHADE: Record<FaceId, number> = { top: 1, bottom: 0.55, front: 0.9, back: 0.75, right: 0.7, left: 0.8 };

/**
 * The player standing in the block at 0, 0, 0 (1.8 blocks tall), looking south (+z), the way the
 * game counts ~ and ^ from the feet.
 */
export function playerModel() {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let n = 0;
  for (const part of PARTS) {
    for (const face of FACES) {
      const { origin: o, u, v } = faceFrame(part, 'base', face, 'classic');
      const r = faceRect(part, 'base', face, 'classic');
      const corners = [
        [o[0], o[1], o[2]],
        [o[0] + u[0], o[1] + u[1], o[2] + u[2]],
        [o[0] + u[0] + v[0], o[1] + u[1] + v[1], o[2] + u[2] + v[2]],
        [o[0] + v[0], o[1] + v[1], o[2] + v[2]],
      ];
      for (const c of corners) pos.push(...c);
      const [u0, u1, v0, v1] = [r.x / SKIN, (r.x + r.w) / SKIN, 1 - r.y / SKIN, 1 - (r.y + r.h) / SKIN];
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      for (let k = 0; k < 4; k++) col.push(SHADE[face], SHADE[face], SHADE[face]);
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      n += 4;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  const mesh = new Mesh(g, new MeshBasicMaterial({ map: skinTexture(), vertexColors: true, side: DoubleSide }));
  const player = new Group();
  player.add(mesh);
  // Skin pixels to blocks: 32 pixels tall is 1.8 blocks.
  player.scale.setScalar(1.8 / 32);
  player.position.set(0.5, 0, 0.5);
  return player;
}
