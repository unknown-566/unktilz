import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  EdgesGeometry,
  FrontSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PerspectiveCamera,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { FACES, LAYERS, PARTS, SKIN, box3d, faceFrame, faceRect, texelAt, type FaceId, type Layer, type Model, type PartId, type Vec3 } from '../../../lib/mc/skinLayout';
import type { Pixels } from '../../../lib/mc/skinOps';

/** A little light from the front and above, baked into the faces so the shape reads without lights. */
const FACE_LIGHT: Record<FaceId, number> = { top: 1, front: 1, bottom: 0.68, back: 0.82, right: 0.88, left: 0.88 };

export type Hit = { x: number; y: number; part: PartId; layer: Layer; face: FaceId; col: number; row: number };

type PartMesh = { part: PartId; layer: Layer; mesh: Mesh };

export const VIEWS = {
  front: { theta: 0, phi: Math.PI / 2 },
  back: { theta: Math.PI, phi: Math.PI / 2 },
  right: { theta: -Math.PI / 2, phi: Math.PI / 2 },
  left: { theta: Math.PI / 2, phi: Math.PI / 2 },
  angle: { theta: 0.6, phi: 1.22 },
} as const;
export type ViewName = keyof typeof VIEWS;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

function partGeometry(part: PartId, layer: Layer, model: Model) {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  FACES.forEach((face, f) => {
    const { origin: o, u, v } = faceFrame(part, layer, face, model);
    const r = faceRect(part, layer, face, model);
    const corners = [o, add(o, u), add(add(o, u), v), add(o, v)];
    const tex = [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x + r.w, r.y + r.h],
      [r.x, r.y + r.h],
    ];
    for (let i = 0; i < 4; i++) {
      pos.push(...corners[i]);
      uv.push(tex[i][0] / SKIN, 1 - tex[i][1] / SKIN);
      const k = FACE_LIGHT[face];
      col.push(k, k, k);
    }
    // Two triangles per face, counter-clockwise from outside.
    const b = f * 4;
    idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  return g;
}

/**
 * The player model in its own WebGL canvas, drawn only when something changes. The skin texture is a
 * 64×64 canvas sampled without smoothing, so pixels stay crisp; picking turns a screen point into the
 * skin pixel under it.
 */
export class SkinScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(32, 1, 1, 400);
  private tex: CanvasTexture;
  private texCtx: CanvasRenderingContext2D;
  private baseMat: MeshBasicMaterial;
  private overMat: MeshBasicMaterial;
  private group = new Group();
  private meshes: PartMesh[] = [];
  private model: Model | null = null;
  private cursor: LineLoop;
  private outlines = new Group();
  private ray = new Raycaster();
  private raf = 0;
  private target = new Vector3(0, 16, 0);
  theta: number = VIEWS.angle.theta;
  phi: number = VIEWS.angle.phi;
  radius = 64;

  private paintLayer: Layer = 'base';
  private showOverlay = true;
  private hidden = new Set<PartId>();

  constructor(private host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.canvas = this.renderer.domElement;
    host.appendChild(this.canvas);

    const c = document.createElement('canvas');
    c.width = c.height = SKIN;
    this.texCtx = c.getContext('2d')!;
    this.tex = new CanvasTexture(c);
    this.tex.magFilter = NearestFilter;
    this.tex.minFilter = NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = SRGBColorSpace;

    this.baseMat = new MeshBasicMaterial({ map: this.tex, vertexColors: true, side: FrontSide });
    // The outer layer has see-through pixels and is visible from inside too (like a hat brim).
    this.overMat = new MeshBasicMaterial({ map: this.tex, vertexColors: true, side: DoubleSide, transparent: true, alphaTest: 0.02 });
    this.scene.add(this.group, this.outlines);

    const cg = new BufferGeometry();
    cg.setAttribute('position', new BufferAttribute(new Float32Array(12), 3));
    this.cursor = new LineLoop(cg, new LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
    this.cursor.renderOrder = 10;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
  }

  setSkin(pixels: Pixels, model: Model) {
    if (model !== this.model) this.build(model);
    // putImageData needs its own buffer, so copy the working pixels.
    this.texCtx.putImageData(new ImageData(new Uint8ClampedArray(pixels), SKIN, SKIN), 0, 0);
    this.tex.needsUpdate = true;
    this.render();
  }

  private build(model: Model) {
    this.model = model;
    for (const m of this.meshes) m.mesh.geometry.dispose();
    this.group.clear();
    this.meshes = [];
    for (const part of PARTS)
      for (const layer of LAYERS) {
        const mesh = new Mesh(partGeometry(part, layer, model), layer === 'base' ? this.baseMat : this.overMat);
        mesh.renderOrder = layer === 'base' ? 0 : 1;
        this.group.add(mesh);
        this.meshes.push({ part, layer, mesh });
      }
    this.applyVisibility();
  }

  /** Which shell is painted, whether the outer layer shows, and which parts are hidden. */
  setDisplay(paintLayer: Layer, showOverlay: boolean, hidden: Set<PartId>) {
    this.paintLayer = paintLayer;
    this.showOverlay = showOverlay;
    this.hidden = hidden;
    this.applyVisibility();
    this.render();
  }

  private applyVisibility() {
    for (const m of this.meshes) m.mesh.visible = !this.hidden.has(m.part) && (m.layer === 'base' || this.showOverlay || this.paintLayer === 'overlay');
    // While painting the base layer the outer layer fades so you can see what you paint under it.
    const fade = this.paintLayer === 'base' && this.showOverlay;
    this.overMat.opacity = fade ? 0.35 : 1;
    this.overMat.depthWrite = !fade;
  }

  /** Outlines these parts (e.g. the ones about to be copied). */
  setHighlight(parts: PartId[]) {
    for (const o of this.outlines.children) (o as LineSegments).geometry.dispose();
    this.outlines.clear();
    for (const part of parts) {
      const { min, max } = box3d(part, 'overlay', this.model ?? 'classic');
      const size = [max[0] - min[0] + 0.3, max[1] - min[1] + 0.3, max[2] - min[2] + 0.3];
      const e = new LineSegments(new EdgesGeometry(new BoxGeometry(size[0], size[1], size[2])), new LineBasicMaterial({ color: 0xb6f24a, depthTest: false }));
      e.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      e.renderOrder = 9;
      this.outlines.add(e);
    }
    this.render();
  }

  /** Frames the brush square around a hit on its face; null hides it. */
  setCursor(hit: Hit | null, size = 1, dark = false) {
    if (!hit || !this.model) {
      if (this.cursor.visible) {
        this.cursor.visible = false;
        this.render();
      }
      return;
    }
    const { origin: o, u, v } = faceFrame(hit.part, hit.layer, hit.face, this.model);
    const r = faceRect(hit.part, hit.layer, hit.face, this.model);
    const off = Math.floor((size - 1) / 2);
    const c0 = Math.max(0, hit.col - off);
    const r0 = Math.max(0, hit.row - off);
    const c1 = Math.min(r.w, hit.col - off + size);
    const r1 = Math.min(r.h, hit.row - off + size);
    // Lift it off the surface a touch along the outward normal (v × u).
    const n = new Vector3(...v).cross(new Vector3(...u)).normalize().multiplyScalar(0.03);
    const pt = (cc: number, rr: number) => add(add(add(o, scale(u, cc / r.w)), scale(v, rr / r.h)), [n.x, n.y, n.z]);
    const pts = [pt(c0, r0), pt(c1, r0), pt(c1, r1), pt(c0, r1)];
    const attr = this.cursor.geometry.getAttribute('position') as BufferAttribute;
    pts.forEach((p, i) => attr.setXYZ(i, p[0], p[1], p[2]));
    attr.needsUpdate = true;
    (this.cursor.material as LineBasicMaterial).color.set(dark ? 0x0b0d10 : 0xffffff);
    this.cursor.visible = true;
    this.render();
  }

  /** Same frame for a texture pixel (hovered in the 2D view). */
  setCursorAt(model: Model, x: number, y: number, size: number, dark: boolean) {
    const t = texelAt(model, x, y);
    if (!t) return this.setCursor(null);
    const { part, layer, face } = t.region;
    this.setCursor({ x, y, part, layer, face, col: t.col, row: t.row }, size, dark);
  }

  /**
   * The skin pixel under a screen point. `mode: 'paint'` only looks at the shell being painted (and
   * counts see-through outer pixels, so you can paint new ones); 'look' finds what you actually see.
   */
  pick(clientX: number, clientY: number, mode: 'paint' | 'look', pixels: Pixels): Hit | null {
    if (!this.model || !this.sync()) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const targets = this.meshes.filter((m) => m.mesh.visible && (mode === 'look' || m.layer === this.paintLayer));
    const hits = this.ray.intersectObjects(
      targets.map((t) => t.mesh),
      false,
    );
    for (const h of hits) {
      const pm = targets.find((t) => t.mesh === h.object)!;
      const face = FACES[Math.floor(h.faceIndex! / 2)];
      const { origin: o, u, v } = faceFrame(pm.part, pm.layer, face, this.model);
      const r = faceRect(pm.part, pm.layer, face, this.model);
      const d = new Vector3().subVectors(h.point, new Vector3(...o));
      const uu = new Vector3(...u);
      const vv = new Vector3(...v);
      const col = Math.min(r.w - 1, Math.max(0, Math.floor((d.dot(uu) / uu.lengthSq()) * r.w)));
      const row = Math.min(r.h - 1, Math.max(0, Math.floor((d.dot(vv) / vv.lengthSq()) * r.h)));
      const x = r.x + col;
      const y = r.y + row;
      if (mode === 'look' && pm.layer === 'overlay' && (pixels[(y * SKIN + x) * 4 + 3] === 0 || this.overMat.opacity < 1)) continue;
      return { x, y, part: pm.part, layer: pm.layer, face, col, row };
    }
    return null;
  }

  orbit(dTheta: number, dPhi: number) {
    this.theta += dTheta;
    this.phi = Math.min(Math.PI - 0.12, Math.max(0.12, this.phi + dPhi));
    this.render();
  }

  zoom(factor: number) {
    this.radius = Math.min(120, Math.max(22, this.radius * factor));
    this.render();
  }

  view(name: ViewName) {
    this.theta = VIEWS[name].theta;
    this.phi = VIEWS[name].phi;
    this.radius = 64;
    this.render();
  }

  /** Draws on the next frame; many calls in one frame draw once. */
  render() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  /** Size and camera as they are right now (picking can't wait for the next frame). */
  private sync() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return false;
    const size = this.renderer.getSize(new Vector2());
    if (size.x !== w || size.y !== h) {
      // The canvas is stretched by CSS, so only its drawing buffer follows the box.
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    const s = Math.sin(this.phi);
    this.camera.position.set(this.target.x + this.radius * s * Math.sin(this.theta), this.target.y + this.radius * Math.cos(this.phi), this.target.z + this.radius * s * Math.cos(this.theta));
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    return true;
  }

  private draw() {
    if (this.sync()) this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const m of this.meshes) m.mesh.geometry.dispose();
    for (const o of this.outlines.children) (o as LineSegments).geometry.dispose();
    this.cursor.geometry.dispose();
    this.baseMat.dispose();
    this.overMat.dispose();
    this.tex.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
