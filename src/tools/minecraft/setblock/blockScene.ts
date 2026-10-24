import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  EdgesGeometry,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PerspectiveCamera,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import type { BlockView, Box } from './blockView';
import { playerModel } from './playerModel';

/** A block face with a darker rim, repeated once per block so the blocks can be counted. */
function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#ffffff';
  g.fillRect(1, 1, 14, 14);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = NearestFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * A box of w × h × d blocks with its corner at 0, 0, 0: texture coordinates count blocks (so the
 * grid texture repeats per block) and each side is shaded like in game (top light, bottom dark).
 */
function boxGeometry(w: number, h: number, d: number) {
  // [corner, edge u, edge v, size u, size v, shade]
  const faces: [number[], number[], number[], number, number, number][] = [
    // Corners go round counter-clockwise seen from outside (u × v points out).
    [[0, h, d], [w, 0, 0], [0, 0, -d], w, d, 1], // top
    [[0, 0, 0], [w, 0, 0], [0, 0, d], w, d, 0.5], // bottom
    [[0, 0, d], [w, 0, 0], [0, h, 0], w, h, 0.8], // south
    [[w, 0, 0], [-w, 0, 0], [0, h, 0], w, h, 0.8], // north
    [[w, 0, d], [0, 0, -d], [0, h, 0], d, h, 0.65], // east
    [[0, 0, 0], [0, 0, d], [0, h, 0], d, h, 0.65], // west
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  faces.forEach(([o, u, v, su, sv, shade], i) => {
    const corner = (a: number, b: number) => [o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b];
    pos.push(...corner(0, 0), ...corner(1, 0), ...corner(1, 1), ...corner(0, 1));
    uv.push(0, 0, su, 0, su, sv, 0, sv);
    for (let k = 0; k < 4; k++) col.push(shade, shade, shade);
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  return g;
}

const size = (b: Box) => [b.max[0] - b.min[0] + 1, b.max[1] - b.min[1] + 1, b.max[2] - b.min[2] + 1] as const;

export const DEFAULT_VIEW = { theta: 0.65, phi: 1.0 };

/** The block or area in 3D, with you in it (for ~ and ^), drawn only when something changes. */
export class BlockScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(35, 1, 0.1, 5000);
  private group = new Group();
  private tex = gridTexture();
  private raf = 0;
  private target = new Vector3();
  private reach = 4;
  private accent = '#b6f24a';
  private line = '#555555';
  private view: BlockView | null = null;
  theta = DEFAULT_VIEW.theta;
  phi = DEFAULT_VIEW.phi;
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

  setColors(accent: string, line: string) {
    this.accent = accent || this.accent;
    this.line = line || this.line;
    if (this.view) this.setView(this.view);
  }

  setView(view: BlockView | null) {
    this.view = view;
    this.clear();
    if (!view) return this.render();
    const [w, h, d] = size(view.area);
    const at = new Vector3(...view.area.min);
    const color = new Color(view.look === 'clear' ? '#ff5c5c' : view.color || this.accent);

    // The area: solid, see-through or only walls, depending on how it's filled.
    const see = view.look !== 'solid' || view.glassy;
    const opacity = view.look === 'clear' ? 0.16 : view.look === 'partial' ? 0.45 : view.look === 'hollow' || view.look === 'outline' ? 0.42 : view.glassy ? 0.35 : 1;
    const mat = new MeshBasicMaterial({ map: this.tex, vertexColors: true, color, transparent: see, opacity, depthWrite: !see });
    const box = new Mesh(boxGeometry(w, h, d), mat);
    box.position.copy(at);
    box.renderOrder = see ? 2 : 0;
    this.group.add(box);
    this.group.add(this.edges(view.area, view.look === 'clear' ? '#ff5c5c' : this.accent, false, 0.002));

    // Inside a hollow or outline fill: the part that becomes air, or stays as it was.
    if ((view.look === 'hollow' || view.look === 'outline') && w > 2 && h > 2 && d > 2) {
      const inner: Box = { min: [view.area.min[0] + 1, view.area.min[1] + 1, view.area.min[2] + 1], max: [view.area.max[0] - 1, view.area.max[1] - 1, view.area.max[2] - 1] };
      this.group.add(this.edges(inner, view.look === 'hollow' ? '#ff5c5c' : this.line, true, 0));
    }

    // How long each side is, in the middle of the three edges facing the starting view.
    if (view.area.min.some((n, i) => n !== view.area.max[i])) {
      const [x0, y0, z0] = view.area.min;
      const [x1, y1, z1] = view.area.max.map((n) => n + 1);
      this.group.add(
        this.label(String(w), new Vector3((x0 + x1) / 2, y0, z1 + 0.15)),
        this.label(String(h), new Vector3(x1 + 0.15, (y0 + y1) / 2, z1 + 0.15)),
        this.label(String(d), new Vector3(x1 + 0.15, y0, (z0 + z1) / 2)),
      );
    }

    // A split fill: each piece's outline, in turns of two colors.
    view.pieces.forEach((p, i) => this.group.add(this.edges(p, i % 2 ? '#ffb020' : '#5eead4', false, 0.02)));

    // You: standing in the block at ~ ~ ~, looking south (+z) for ^.
    let lo = [...view.area.min];
    let hi = view.area.max.map((n) => n + 1);
    if (view.frame !== 'abs') {
      this.group.add(playerModel());
      if (view.frame === 'local') {
        const eye = 1.62;
        const arrow = new LineSegments(
          new BufferGeometry().setFromPoints([new Vector3(0.5, eye, 0.8), new Vector3(0.5, eye, 3), new Vector3(0.5, eye, 3), new Vector3(0.3, eye, 2.6), new Vector3(0.5, eye, 3), new Vector3(0.7, eye, 2.6)]),
          new LineBasicMaterial({ color: this.accent }),
        );
        this.group.add(arrow);
      }
      lo = lo.map((n) => Math.min(n, 0));
      hi = hi.map((n, i) => Math.max(n, i === 1 ? 2 : 1));
    }

    // The ground: around you, or under the area for exact coordinates.
    const span = Math.max(hi[0] - lo[0], hi[2] - lo[2], 8) + 6;
    const cells = Math.min(200, Math.ceil(span));
    const grid = new GridHelper(cells, cells, this.line, this.line);
    (grid.material as Material).transparent = true;
    (grid.material as Material).opacity = 0.35;
    const floor = view.frame === 'abs' ? view.area.min[1] : 0;
    // Grid lines on whole blocks: the middle sits on a whole number, or a half for an odd count.
    const odd = (cells % 2) / 2;
    grid.position.set(Math.round((lo[0] + hi[0]) / 2 - odd) + odd, floor - 0.001, Math.round((lo[2] + hi[2]) / 2 - odd) + odd);
    this.group.add(grid);

    this.target.set((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
    this.reach = Math.max(1.5, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
    this.render();
  }

  /** A number that always faces you and keeps its size on screen. */
  private label(text: string, at: Vector3) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.font = 'bold 40px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    g.strokeText(text, 64, 34);
    g.fillStyle = '#ffffff';
    g.fillText(text, 64, 34);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    const s = new Sprite(new SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
    s.scale.set(0.16, 0.08, 1);
    s.position.copy(at);
    s.renderOrder = 10;
    return s;
  }

  private edges(b: Box, color: string, dashed: boolean, grow: number) {
    const [w, h, d] = size(b);
    const g = new EdgesGeometry(new BoxGeometry(w + grow * 2, h + grow * 2, d + grow * 2));
    const m = dashed ? new LineDashedMaterial({ color, dashSize: 0.3, gapSize: 0.2 }) : new LineBasicMaterial({ color });
    const l = new LineSegments(g, m);
    if (dashed) l.computeLineDistances();
    l.position.set(b.min[0] + w / 2, b.min[1] + h / 2, b.min[2] + d / 2);
    l.renderOrder = 3;
    return l;
  }

  orbit(dTheta: number, dPhi: number) {
    this.theta += dTheta;
    this.phi = Math.min(Math.PI - 0.05, Math.max(0.05, this.phi + dPhi));
    this.render();
  }

  zoom(factor: number) {
    this.zoomBy = Math.min(8, Math.max(0.25, this.zoomBy * factor));
    this.render();
  }

  reset() {
    this.theta = DEFAULT_VIEW.theta;
    this.phi = DEFAULT_VIEW.phi;
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
    const radius = (this.reach * 1.1) / Math.sin(narrow) / this.zoomBy;
    const sp = Math.sin(this.phi);
    this.camera.position.set(this.target.x + radius * sp * Math.sin(this.theta), this.target.y + radius * Math.cos(this.phi), this.target.z + radius * sp * Math.cos(this.theta));
    this.camera.near = radius / 100;
    this.camera.far = radius * 6;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  }

  private clear() {
    const gone = (mat: Material) => {
      // Label and player textures are made per view; the block grid texture is kept.
      const map = (mat as MeshBasicMaterial).map;
      if (map && map !== this.tex) map.dispose();
      mat.dispose();
    };
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.traverse((x) => {
        const m = x as Mesh;
        m.geometry?.dispose();
        const mat = m.material as Material | Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(gone);
        else if (mat) gone(mat);
      });
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.clear();
    this.tex.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
