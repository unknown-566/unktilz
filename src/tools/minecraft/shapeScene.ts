import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { layerQuads, type Layers, type Quads } from './shapeFaces';

/** A block face: light middle with a darker rim, so single blocks can be told apart. */
function blockTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b4b4b4';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#ffffff';
  g.fillRect(1, 1, 14, 14);
  const t = new CanvasTexture(c);
  t.magFilter = NearestFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.colorSpace = SRGBColorSpace;
  return t;
}

function geometry(q: Quads) {
  const g = new BufferGeometry();
  const uv = new Float32Array(q.count * 8);
  const col = new Float32Array(q.count * 12);
  const idx = new Uint32Array(q.count * 6);
  for (let i = 0; i < q.count; i++) {
    uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
    for (let k = 0; k < 4; k++) col.fill(q.shade[i * 4 + k], (i * 4 + k) * 3, (i * 4 + k) * 3 + 3);
    const b = i * 4;
    idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
  }
  g.setAttribute('position', new BufferAttribute(q.pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  return g;
}

export const DEFAULT_VIEW = { theta: 0.75, phi: 0.95 };

/**
 * A block shape in its own WebGL canvas, drawn only when something changes. Each layer is its own
 * mesh, so moving to another layer only swaps materials: layers below are solid and dimmed, the
 * current one is bright, the ones above are see-through.
 */
export class ShapeScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(35, 1, 0.1, 2000);
  private group = new Group();
  private tex = blockTexture();
  private below = new MeshBasicMaterial({ map: this.tex, vertexColors: true });
  private current = new MeshBasicMaterial({ map: this.tex, vertexColors: true });
  private above = new MeshBasicMaterial({ map: this.tex, vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false });
  private meshes: Mesh[] = [];
  private cap: Mesh | null = null;
  private layers: Layers | null = null;
  private layer = 0;
  private raf = 0;
  /** Half the shape's diagonal: a ball around it, for fitting it into the view. */
  private reach = 18;
  theta: number = DEFAULT_VIEW.theta;
  phi: number = DEFAULT_VIEW.phi;
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

  /** The blocks of every layer; rebuilds the meshes. */
  setShape(layers: Layers) {
    this.clearMeshes();
    this.layers = layers;
    this.reach = Math.hypot(layers.w, layers.l, layers.grids.length) / 2;
    layers.grids.forEach((_, y) => {
      const m = new Mesh(geometry(layerQuads(layers, y, 'sides')), this.below);
      this.meshes.push(m);
      this.group.add(m);
    });
    this.setLayer(Math.min(this.layer, layers.grids.length - 1), true);
  }

  /** Which layer is being built: it's highlighted, and the ones above it turn see-through. */
  setLayer(y: number, force = false) {
    if (!this.layers || (y === this.layer && !force)) return;
    this.layer = y;
    this.meshes.forEach((m, i) => {
      m.material = i < y ? this.below : i === y ? this.current : this.above;
      // See-through layers draw after the solid ones, bottom up.
      m.renderOrder = i > y ? i : 0;
    });
    if (this.cap) {
      this.group.remove(this.cap);
      this.cap.geometry.dispose();
      this.cap = null;
    }
    // The current layer's tops that the layer above covers: shown, since that layer is see-through.
    const q = layerQuads(this.layers, y, 'cap');
    if (q.count) {
      this.cap = new Mesh(geometry(q), this.current);
      this.group.add(this.cap);
    }
    this.render();
  }

  /** Colours from the site's theme: the accent for the current layer, a dimmed one below. */
  setColors(accent: string, dim: string) {
    this.current.color = new Color(accent);
    this.above.color = new Color(accent);
    this.below.color = new Color(dim);
    this.render();
  }

  orbit(dTheta: number, dPhi: number) {
    this.theta += dTheta;
    this.phi = Math.min(Math.PI - 0.05, Math.max(0.05, this.phi + dPhi));
    this.render();
  }

  zoom(factor: number) {
    this.zoomBy = Math.min(4, Math.max(0.25, this.zoomBy * factor));
    this.render();
  }

  reset() {
    this.theta = DEFAULT_VIEW.theta;
    this.phi = DEFAULT_VIEW.phi;
    this.zoomBy = 1;
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

  private draw() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    const size = this.renderer.getSize(new Vector2());
    if (size.x !== w || size.y !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
    }
    // Just far enough that the whole shape fits (in the narrower direction of the view).
    const half = (this.camera.fov * Math.PI) / 360;
    const narrow = this.camera.aspect < 1 ? Math.atan(Math.tan(half) * this.camera.aspect) : half;
    const radius = (this.reach * 1.05) / Math.sin(narrow) / this.zoomBy;
    const s = Math.sin(this.phi);
    this.camera.position.set(radius * s * Math.sin(this.theta), radius * Math.cos(this.phi), radius * s * Math.cos(this.theta));
    this.camera.near = radius / 50;
    this.camera.far = radius * 4;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(new Vector3(0, 0, 0));
    this.renderer.render(this.scene, this.camera);
  }

  private clearMeshes() {
    for (const m of this.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.meshes = [];
    if (this.cap) {
      this.group.remove(this.cap);
      this.cap.geometry.dispose();
      this.cap = null;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.clearMeshes();
    this.below.dispose();
    this.current.dispose();
    this.above.dispose();
    this.tex.dispose();
    this.renderer.dispose();
    // Browsers only allow a few WebGL contexts at once: give this one back now, not at garbage collection.
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
