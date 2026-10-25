import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import type { Dir, Element, Model, V3 } from '../../../lib/mc/pack/models';
import { hexToRgba, type Area, type Img } from '../../../lib/mc/pack/pixels';

/** A texture for the 3D view: its pixels and which part (the shown frame) to use. */
export type TexSource = (path: string) => { img: Img; area: Area } | null;

/** How the game shades each side (sky light from above). */
const SHADE: Record<Dir, number> = { up: 1, down: 0.5, north: 0.8, south: 0.8, east: 0.6, west: 0.6 };

/** The face's corners in model units, top-left, top-right, bottom-right, bottom-left as the texture is seen. */
function corners(dir: Dir, f: V3, t: V3): V3[] {
  const [x1, y1, z1] = f;
  const [x2, y2, z2] = t;
  switch (dir) {
    case 'north':
      return [[x2, y2, z1], [x1, y2, z1], [x1, y1, z1], [x2, y1, z1]];
    case 'south':
      return [[x1, y2, z2], [x2, y2, z2], [x2, y1, z2], [x1, y1, z2]];
    case 'west':
      return [[x1, y2, z1], [x1, y2, z2], [x1, y1, z2], [x1, y1, z1]];
    case 'east':
      return [[x2, y2, z2], [x2, y2, z1], [x2, y1, z1], [x2, y1, z2]];
    case 'up':
      return [[x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]];
    case 'down':
      return [[x1, y1, z2], [x2, y1, z2], [x2, y1, z1], [x1, y1, z1]];
  }
}

/** Turns a point the way the element's rotation says (degrees round an axis through `origin`). */
function rotate(p: V3, r: NonNullable<Element['rotation']>): V3 {
  const a = (r.angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const [ox, oy, oz] = r.origin;
  let [x, y, z] = [p[0] - ox, p[1] - oy, p[2] - oz];
  // Rescale stretches the two turned axes so the face still spans the whole block.
  const k = r.rescale ? 1 / Math.cos(Math.abs(a) > Math.PI / 4 ? Math.PI / 2 - Math.abs(a) : a) : 1;
  if (r.axis === 'x') [y, z] = [y * c - z * s, y * s + z * c];
  else if (r.axis === 'y') [x, z] = [x * c + z * s, -x * s + z * c];
  else [x, y] = [x * c - y * s, x * s + y * c];
  if (r.rescale) {
    if (r.axis !== 'x') x *= k;
    if (r.axis !== 'y') y *= k;
    if (r.axis !== 'z') z *= k;
  }
  return [x + ox, y + oy, z + oz];
}

type Batch = { pos: number[]; uv: number[]; col: number[]; idx: number[] };

/** The block or item in 3D: drag to turn it; drawn only when something changes. */
export class ModelScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.01, 100);
  private group = new Group();
  private raf = 0;
  private start = { theta: 0.65, phi: 1.05 };
  theta = 0.65;
  phi = 1.05;
  zoomBy = 1;

  constructor(private host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    host.appendChild(this.canvas);
    this.scene.add(this.group);
  }

  /** Shows a model; `keepView` keeps how it's turned (when only its pixels changed). */
  setModel(model: Model | null, tex: TexSource, tintOf: (path: string) => string | undefined, keepView = false) {
    this.clear();
    if (!keepView) {
      this.start = model?.kind === 'generated' ? { theta: 0.45, phi: 1.35 } : { theta: 0.65, phi: 1.05 };
      this.theta = this.start.theta;
      this.phi = this.start.phi;
    }
    if (model) {
      const batches = new Map<string, Batch>();
      const batch = (key: string) => {
        let b = batches.get(key);
        if (!b) batches.set(key, (b = { pos: [], uv: [], col: [], idx: [] }));
        return b;
      };
      const quad = (b: Batch, pts: V3[], uvs: [number, number][], color: [number, number, number]) => {
        const base = b.pos.length / 3;
        for (let i = 0; i < 4; i++) {
          b.pos.push(pts[i][0], pts[i][1], pts[i][2]);
          b.uv.push(uvs[i][0], uvs[i][1]);
          b.col.push(...color);
        }
        // Counter-clockwise seen from outside: top-left, bottom-left, bottom-right, top-right.
        b.idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
      };
      const toScene = (p: V3): V3 => [p[0] / 16 - 0.5, p[1] / 16 - 0.5, p[2] / 16 - 0.5];

      if (model.kind === 'elements') {
        for (const e of model.elements) {
          for (const [dir, face] of Object.entries(e.faces) as [Dir, NonNullable<Element['faces'][Dir]>][]) {
            if (!tex(face.texture)) continue;
            let pts = corners(dir, e.from, e.to);
            if (e.rotation) pts = pts.map((p) => rotate(p, e.rotation!));
            const [u1, v1, u2, v2] = face.uv;
            const uvList: [number, number][] = [
              [u1 / 16, 1 - v1 / 16],
              [u2 / 16, 1 - v1 / 16],
              [u2 / 16, 1 - v2 / 16],
              [u1 / 16, 1 - v2 / 16],
            ];
            const k = face.rotation / 90;
            const uvs = [0, 1, 2, 3].map((i) => uvList[(i - k + 4) % 4]);
            const shade = e.shade ? SHADE[dir] : 1;
            const tint = face.tint ? tintOf(face.texture) : undefined;
            const [r, g, bl] = tint ? hexToRgba(tint).map((c) => c / 255) : [1, 1, 1];
            quad(batch(face.texture), pts.map(toScene), uvs, [r * shade, g * shade, bl * shade]);
          }
        }
      } else {
        // A flat item one pixel thick: the picture on front and back, and the pixel edges as sides.
        model.layers.forEach((path, layer) => {
          const src = tex(path);
          if (!src) return;
          const { img, area } = src;
          const W = area.w;
          const H = area.h;
          const z = 0.5 / 16 + layer * 0.001;
          const b = batch(path);
          quad(b, [[-0.5, 0.5, z], [0.5, 0.5, z], [0.5, -0.5, z], [-0.5, -0.5, z]], [[0, 1], [1, 1], [1, 0], [0, 0]], [1, 1, 1]);
          quad(b, [[0.5, 0.5, -z], [-0.5, 0.5, -z], [-0.5, -0.5, -z], [0.5, -0.5, -z]], [[1, 1], [0, 1], [0, 0], [1, 0]], [1, 1, 1]);
          const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && img.data[((area.y + y) * img.w + area.x + x) * 4 + 3] > 0;
          for (let py = 0; py < H; py++)
            for (let px = 0; px < W; px++) {
              if (!solid(px, py)) continue;
              const x0 = px / W - 0.5;
              const x1 = (px + 1) / W - 0.5;
              const y0 = 0.5 - py / H;
              const y1 = 0.5 - (py + 1) / H;
              const c: [number, number][] = Array(4).fill([(px + 0.5) / W, 1 - (py + 0.5) / H]);
              if (!solid(px - 1, py)) quad(b, [[x0, y0, -z], [x0, y0, z], [x0, y1, z], [x0, y1, -z]], c, [0.6, 0.6, 0.6]);
              if (!solid(px + 1, py)) quad(b, [[x1, y0, z], [x1, y0, -z], [x1, y1, -z], [x1, y1, z]], c, [0.6, 0.6, 0.6]);
              if (!solid(px, py - 1)) quad(b, [[x0, y0, -z], [x1, y0, -z], [x1, y0, z], [x0, y0, z]], c, [1, 1, 1]);
              if (!solid(px, py + 1)) quad(b, [[x0, y1, z], [x1, y1, z], [x1, y1, -z], [x0, y1, -z]], c, [0.5, 0.5, 0.5]);
            }
        });
      }

      for (const [path, b] of batches) {
        const src = tex(path);
        if (!src || !b.idx.length) continue;
        const { texture, translucent } = this.texture(src.img, src.area);
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3));
        g.setAttribute('uv', new BufferAttribute(new Float32Array(b.uv), 2));
        g.setAttribute('color', new BufferAttribute(new Float32Array(b.col), 3));
        g.setIndex(b.idx);
        const mat = new MeshBasicMaterial({ map: texture, vertexColors: true, transparent: translucent, alphaTest: translucent ? 0.02 : 0.5, depthWrite: !translucent });
        const mesh = new Mesh(g, mat);
        if (translucent) mesh.renderOrder = 1;
        this.group.add(mesh);
      }
    }
    this.render();
  }

  /** One frame of a texture as a three.js texture; see-through pixels in between make it translucent. */
  private texture(img: Img, area: Area) {
    const c = document.createElement('canvas');
    c.width = area.w;
    c.height = area.h;
    const part = new ImageData(area.w, area.h);
    let translucent = false;
    for (let y = 0; y < area.h; y++) {
      const row = img.data.subarray(((area.y + y) * img.w + area.x) * 4, ((area.y + y) * img.w + area.x + area.w) * 4);
      part.data.set(row, y * area.w * 4);
      if (!translucent) for (let i = 3; i < row.length; i += 4) if (row[i] > 0 && row[i] < 255) translucent = true;
    }
    c.getContext('2d')!.putImageData(part, 0, 0);
    const t = new CanvasTexture(c);
    t.magFilter = NearestFilter;
    t.minFilter = NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = SRGBColorSpace;
    return { texture: t, translucent };
  }

  orbit(dTheta: number, dPhi: number) {
    this.theta += dTheta;
    this.phi = Math.min(Math.PI - 0.05, Math.max(0.05, this.phi + dPhi));
    this.render();
  }

  zoom(factor: number) {
    this.zoomBy = Math.min(6, Math.max(0.4, this.zoomBy * factor));
    this.render();
  }

  reset() {
    this.theta = this.start.theta;
    this.phi = this.start.phi;
    this.zoomBy = 1;
    this.render();
  }

  render() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private draw() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    const s = this.renderer.getSize(new Vector2());
    if (s.x !== w || s.y !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
    }
    const half = (this.camera.fov * Math.PI) / 360;
    const narrow = this.camera.aspect < 1 ? Math.atan(Math.tan(half) * this.camera.aspect) : half;
    const radius = (0.9 / Math.sin(narrow)) / this.zoomBy;
    const sp = Math.sin(this.phi);
    this.camera.position.set(radius * sp * Math.sin(this.theta), radius * Math.cos(this.phi), radius * sp * Math.cos(this.theta));
    this.camera.near = radius / 50;
    this.camera.far = radius * 4;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(new Vector3(0, 0, 0));
    this.renderer.render(this.scene, this.camera);
  }

  private clear() {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      const m = o as Mesh;
      m.geometry?.dispose();
      const mat = m.material as Material & { map?: { dispose: () => void } };
      mat?.map?.dispose();
      mat?.dispose();
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
