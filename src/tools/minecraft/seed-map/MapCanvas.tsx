import { useEffect, useRef } from 'react';
import { SREGION, STRUCTURES, TILE, scaleFor, worldKey, type SeedMapEngine, type World } from '../../../lib/mc/seedmap';
import type { TileResult } from '../../../workers/seedmap.worker';

export type View = { x: number; z: number; bpp: number };
export type Pick = { x: number; z: number; biome: number | null; structure?: number };
export type Command = { n: number } & ({ kind: 'goto'; x: number; z: number; bpp?: number } | { kind: 'zoom'; factor: number });

type Props = {
  engine: SeedMapEngine;
  world: World;
  /** cubiomes structure type per STRUCTURES index (from the worker's meta). */
  structureIds: number[] | null;
  enabled: boolean[];
  initial: View;
  command?: Command;
  selected: Pick | null;
  onView: (v: View) => void;
  onHover: (p: Pick | null) => void;
  onSelect: (p: Pick | null) => void;
  onBiomesInView: (ids: number[]) => void;
};

export const MIN_BPP = 1 / 8;
export const MAX_BPP = 256;
const clampBpp = (b: number) => Math.min(MAX_BPP, Math.max(MIN_BPP, b));

type Tile = TileResult | 'loading';
type Marker = { sx: number; sy: number; i: number; x: number; z: number };

/**
 * The map itself: biome tiles from the workers drawn onto a canvas, structure markers on top.
 * Everything that changes per frame lives in refs; React only hears about settled changes.
 */
export function MapCanvas(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const props = useRef(p);
  props.current = p;
  const view = useRef<View>({ ...p.initial });
  const tiles = useRef(new Map<string, Tile>());
  const structs = useRef(new Map<string, { x: number; z: number }[] | 'loading'>());
  const markers = useRef<Marker[]>([]);
  const raf = useRef(0);
  const key = worldKey(p.world);
  const keyRef = useRef(key);

  const draw = () => {
    raf.current = 0;
    const c = cv.current;
    const host = box.current;
    if (!c || !host) return;
    const W = host.clientWidth;
    const H = host.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b0d10';
    g.fillRect(0, 0, W, H);

    const { x, z, bpp } = view.current;
    const left = x - (W / 2) * bpp;
    const top = z - (H / 2) * bpp;
    const sx = (bx: number) => (bx - left) / bpp;
    const sy = (bz: number) => (bz - top) / bpp;

    const s = scaleFor(bpp);
    const T = TILE * s;
    const tx0 = Math.floor(left / T);
    const tz0 = Math.floor(top / T);
    const tx1 = Math.floor((left + W * bpp) / T);
    const tz1 = Math.floor((top + H * bpp) / T);
    for (let tz = tz0; tz <= tz1; tz++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const X0 = Math.floor(sx(tx * T));
        const Y0 = Math.floor(sy(tz * T));
        const X1 = Math.floor(sx((tx + 1) * T));
        const Y1 = Math.floor(sy((tz + 1) * T));
        const t = tiles.current.get(`${s}:${tx}:${tz}`);
        if (t && t !== 'loading') {
          g.drawImage(t.bitmap, X0, Y0, X1 - X0, Y1 - Y0);
          continue;
        }
        if (!t) request(s, tx, tz);
        // Until it arrives, stretch a coarser tile that's already here.
        for (let s2 = s * 4; s2 <= 256; s2 *= 4) {
          const T2 = TILE * s2;
          const ux = Math.floor((tx * T) / T2);
          const uz = Math.floor((tz * T) / T2);
          const t2 = tiles.current.get(`${s2}:${ux}:${uz}`);
          if (!t2 || t2 === 'loading') continue;
          const k = T / s2;
          g.drawImage(t2.bitmap, (tx * T - ux * T2) / s2, (tz * T - uz * T2) / s2, k, k, X0, Y0, X1 - X0, Y1 - Y0);
          break;
        }
      }

    // Chunk grid when zoomed right in.
    if (bpp <= 0.5) {
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      for (let gx = Math.ceil(left / 16) * 16; gx < left + W * bpp; gx += 16) {
        const X = Math.round(sx(gx)) + 0.5;
        g.moveTo(X, 0);
        g.lineTo(X, H);
      }
      for (let gz = Math.ceil(top / 16) * 16; gz < top + H * bpp; gz += 16) {
        const Y = Math.round(sy(gz)) + 0.5;
        g.moveTo(0, Y);
        g.lineTo(W, Y);
      }
      g.stroke();
    }

    // Structures.
    const { enabled, structureIds, selected } = props.current;
    const shown = STRUCTURES.map((st, i) => enabled[i] && bpp <= st.maxBpp && !!structureIds && structureIds[i] >= 0);
    const list: Marker[] = [];
    if (shown.some(Boolean)) {
      const rx0 = Math.floor(left / SREGION);
      const rz0 = Math.floor(top / SREGION);
      const rx1 = Math.floor((left + W * bpp) / SREGION);
      const rz1 = Math.floor((top + H * bpp) / SREGION);
      for (let rz = rz0; rz <= rz1; rz++)
        for (let rx = rx0; rx <= rx1; rx++) {
          const missing: number[] = [];
          shown.forEach((on, i) => {
            if (!on) return;
            const got = structs.current.get(`${rx}:${rz}:${i}`);
            if (!got) missing.push(i);
            else if (got !== 'loading') for (const pos of got) list.push({ sx: sx(pos.x), sy: sy(pos.z), i, x: pos.x, z: pos.z });
          });
          if (missing.length) requestStructures(rx, rz, missing);
        }
    }
    const r = 10;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const m of list) {
      if (m.sx < -r || m.sy < -r || m.sx > W + r || m.sy > H + r) continue;
      const st = STRUCTURES[m.i];
      g.beginPath();
      g.arc(m.sx, m.sy, r, 0, Math.PI * 2);
      g.fillStyle = st.color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#0b0d10';
      g.stroke();
      g.fillStyle = '#0b0d10';
      g.font = `700 ${st.short.length > 1 ? 8 : 10}px ui-monospace, monospace`;
      g.fillText(st.short, m.sx, m.sy + 0.5);
    }
    markers.current = list;

    if (selected) {
      const X = sx(selected.x);
      const Y = sy(selected.z);
      g.lineWidth = 2.5;
      g.strokeStyle = '#ffffff';
      g.beginPath();
      if (selected.structure !== undefined) g.arc(X, Y, r + 4, 0, Math.PI * 2);
      else {
        g.moveTo(X - 8, Y);
        g.lineTo(X + 8, Y);
        g.moveTo(X, Y - 8);
        g.lineTo(X, Y + 8);
      }
      g.stroke();
    }
  };

  const redraw = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(draw);
    // Browsers pause animation frames in hidden windows; still draw so the map is ready.
    setTimeout(() => {
      if (raf.current) {
        cancelAnimationFrame(raf.current);
        draw();
      }
    }, 150);
  };

  // Is a block rectangle still (nearly) on screen? Used to drop jobs that scrolled away.
  const near = (x0: number, z0: number, size: number) => {
    const host = box.current;
    if (!host) return null;
    const { x, z, bpp } = view.current;
    const hw = (host.clientWidth / 2) * bpp + size;
    const hh = (host.clientHeight / 2) * bpp + size;
    const cx = x0 + size / 2;
    const cz = z0 + size / 2;
    if (Math.abs(cx - x) > hw || Math.abs(cz - z) > hh) return null;
    return Math.hypot(cx - x, cz - z) / bpp;
  };

  const request = (s: number, tx: number, tz: number) => {
    const k = `${s}:${tx}:${tz}`;
    const wk = keyRef.current;
    tiles.current.set(k, 'loading');
    const T = TILE * s;
    props.current.engine
      .tile(props.current.world, s, tx, tz, () => (keyRef.current !== wk || scaleFor(view.current.bpp) !== s ? null : near(tx * T, tz * T, T)))
      .then((t) => {
        if (keyRef.current !== wk) return t.bitmap.close();
        tiles.current.set(k, t);
        trim();
        redraw();
        biomesSoon();
      })
      .catch(() => {
        if (tiles.current.get(k) === 'loading') tiles.current.delete(k);
      });
  };

  const requestStructures = (rx: number, rz: number, idx: number[]) => {
    const wk = keyRef.current;
    const ids = props.current.structureIds!;
    for (const i of idx) structs.current.set(`${rx}:${rz}:${i}`, 'loading');
    props.current.engine
      // Structures go after the biomes on screen, so they get a small penalty.
      .structures(props.current.world, idx.map((i) => ids[i]), rx, rz, () => {
        if (keyRef.current !== wk) return null;
        const d = near(rx * SREGION, rz * SREGION, SREGION);
        return d === null ? null : d + 400;
      })
      .then((res) => {
        if (keyRef.current !== wk) return;
        idx.forEach((i, j) => structs.current.set(`${rx}:${rz}:${i}`, res[j]));
        redraw();
      })
      .catch(() => {
        for (const i of idx) if (structs.current.get(`${rx}:${rz}:${i}`) === 'loading') structs.current.delete(`${rx}:${rz}:${i}`);
      });
  };

  // Keep at most ~400 tiles; drop the ones furthest from the view first.
  const trim = () => {
    const m = tiles.current;
    if (m.size <= 400) return;
    const { x, z } = view.current;
    const ranked = [...m.entries()]
      .filter(([, t]) => t !== 'loading')
      .map(([k, t]) => {
        const [s, tx, tz] = k.split(':').map(Number);
        const T = TILE * s;
        return { k, t, d: Math.hypot(tx * T + T / 2 - x, tz * T + T / 2 - z) / T };
      })
      .sort((a, b) => b.d - a.d);
    for (const r of ranked.slice(0, m.size - 300)) {
      (r.t as TileResult).bitmap.close();
      m.delete(r.k);
    }
  };

  // Which biomes are on screen, for the legend. Throttled; only counts tiles that are loaded.
  const biomeTimer = useRef(0);
  const biomesSoon = () => {
    if (biomeTimer.current) return;
    biomeTimer.current = window.setTimeout(() => {
      biomeTimer.current = 0;
      const host = box.current;
      if (!host) return;
      const { x, z, bpp } = view.current;
      const s = scaleFor(bpp);
      const left = x - (host.clientWidth / 2) * bpp;
      const top = z - (host.clientHeight / 2) * bpp;
      const right = left + host.clientWidth * bpp;
      const bottom = top + host.clientHeight * bpp;
      const seen = new Uint32Array(256);
      const T = TILE * s;
      for (let tz = Math.floor(top / T); tz <= Math.floor(bottom / T); tz++)
        for (let tx = Math.floor(left / T); tx <= Math.floor(right / T); tx++) {
          const t = tiles.current.get(`${s}:${tx}:${tz}`);
          if (!t || t === 'loading') continue;
          const lx0 = Math.max(0, Math.floor((left - tx * T) / s));
          const lz0 = Math.max(0, Math.floor((top - tz * T) / s));
          const lx1 = Math.min(TILE, Math.ceil((right - tx * T) / s));
          const lz1 = Math.min(TILE, Math.ceil((bottom - tz * T) / s));
          for (let lz = lz0; lz < lz1; lz++) for (let lx = lx0; lx < lx1; lx++) seen[t.ids[lz * TILE + lx]]++;
        }
      const ids = [...seen.keys()].filter((i) => seen[i] > 0).sort((a, b) => seen[b] - seen[a]);
      props.current.onBiomesInView(ids);
    }, 250);
  };

  /** Block position and biome under a point on the canvas. */
  const pickAt = (px: number, py: number): Pick => {
    const host = box.current!;
    const { x, z, bpp } = view.current;
    const bx = Math.floor(x + (px - host.clientWidth / 2) * bpp);
    const bz = Math.floor(z + (py - host.clientHeight / 2) * bpp);
    let biome: number | null = null;
    for (let s = scaleFor(bpp); s <= 256 && biome === null; s *= 4) {
      const T = TILE * s;
      const tx = Math.floor(bx / T);
      const tz = Math.floor(bz / T);
      const t = tiles.current.get(`${s}:${tx}:${tz}`);
      if (t && t !== 'loading') biome = t.ids[Math.floor((bz - tz * T) / s) * TILE + Math.floor((bx - tx * T) / s)];
    }
    return { x: bx, z: bz, biome };
  };

  const settleTimer = useRef(0);
  const changed = () => {
    redraw();
    biomesSoon();
    clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => props.current.onView({ ...view.current }), 120);
  };

  // New world: forget everything.
  useEffect(() => {
    keyRef.current = key;
    for (const t of tiles.current.values()) if (t !== 'loading') t.bitmap.close();
    tiles.current.clear();
    structs.current.clear();
    props.current.engine.clear();
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(redraw, [p.enabled, p.structureIds, p.selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = p.command;
    if (!c) return;
    if (c.kind === 'goto') view.current = { x: c.x, z: c.z, bpp: clampBpp(c.bpp ?? view.current.bpp) };
    else view.current = { ...view.current, bpp: clampBpp(view.current.bpp * c.factor) };
    changed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.command]);

  useEffect(() => {
    const host = box.current!;
    const c = cv.current!;
    const ro = new ResizeObserver(() => changed());
    ro.observe(host);

    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch: { d: number; mx: number; my: number } | null = null;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const zoomAt = (px: number, py: number, factor: number) => {
      const v = view.current;
      const nb = clampBpp(v.bpp * factor);
      const wx = v.x + (px - host.clientWidth / 2) * v.bpp;
      const wz = v.z + (py - host.clientHeight / 2) * v.bpp;
      view.current = { x: wx - (px - host.clientWidth / 2) * nb, z: wz - (py - host.clientHeight / 2) * nb, bpp: nb };
      changed();
    };

    const down = (e: PointerEvent) => {
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* already gone */
      }
      pts.set(e.pointerId, local(e));
      moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      }
    };
    const move = (e: PointerEvent) => {
      const at = local(e);
      const prev = pts.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') props.current.onHover(pickAt(at.x, at.y));
        return;
      }
      pts.set(e.pointerId, at);
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const v = view.current;
        view.current = { ...v, x: v.x - (mx - pinch.mx) * v.bpp, z: v.z - (my - pinch.my) * v.bpp };
        if (d > 0 && pinch.d > 0) zoomAt(mx, my, pinch.d / d);
        pinch = { d, mx, my };
        moved += 10;
        return;
      }
      if (pts.size !== 1) return;
      const dx = at.x - prev.x;
      const dy = at.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      const v = view.current;
      view.current = { ...v, x: v.x - dx * v.bpp, z: v.z - dy * v.bpp };
      changed();
      if (e.pointerType === 'mouse') props.current.onHover(pickAt(at.x, at.y));
    };
    const up = (e: PointerEvent) => {
      const at = local(e);
      const wasTap = pts.size === 1 && moved < 6;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!wasTap) return;
      // A tap picks the nearest structure marker, or else the spot itself.
      let best: Marker | null = null;
      let bd = 16;
      for (const m of markers.current) {
        const d = Math.hypot(m.sx - at.x, m.sy - at.y);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      const pick = pickAt(at.x, at.y);
      props.current.onSelect(best ? { x: best.x, z: best.z, biome: pickAt(best.sx, best.sy).biome, structure: best.i } : pick);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const at = local(e);
      zoomAt(at.x, at.y, Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
    };
    const leave = () => props.current.onHover(null);

    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', leave);
    c.addEventListener('wheel', wheel, { passive: false });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
      clearTimeout(settleTimer.current);
      clearTimeout(biomeTimer.current);
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('pointerleave', leave);
      c.removeEventListener('wheel', wheel);
      for (const t of tiles.current.values()) if (t !== 'loading') t.bitmap.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={box} className="sm-map">
      <canvas ref={cv} role="img" aria-label="Biome map. Drag to move, scroll or pinch to zoom, click for coordinates." />
    </div>
  );
}
