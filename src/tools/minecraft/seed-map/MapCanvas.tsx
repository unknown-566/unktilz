import { useEffect, useRef } from 'react';
import { SREGION, STRUCTURES, STRUCTURE_ICONS, TILE, scaleFor, worldKey, type SeedMapEngine, type World } from '../../../lib/mc/seedmap';
import type { TileResult } from '../../../workers/seedmap.worker';
import { t } from '../../../lib/i18n-core';

export type View = { x: number; z: number; bpp: number };
/** A spot on the map; `sx`/`sy` is where it is on screen (for the hover label). */
export type Pick = { x: number; z: number; biome: number | null; structure?: number; spawn?: boolean; pin?: string; sx?: number; sy?: number };
export type Pin = { x: number; z: number; name: string };

const ICON_PATHS = new Map<number, Path2D>();
const iconPath = (i: number) => {
  let p = ICON_PATHS.get(i);
  if (!p) ICON_PATHS.set(i, (p = new Path2D(STRUCTURE_ICONS[STRUCTURES[i].key])));
  return p;
};
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
  /** World spawn, drawn as a red + that keeps its size at every zoom. */
  spawn: { x: number; z: number } | null;
  /** Saved places in this world, drawn as labelled pins. */
  pins: Pin[];
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
        const tt = tiles.current.get(`${s}:${tx}:${tz}`);
        if (tt && tt !== 'loading') {
          g.drawImage(tt.bitmap, X0, Y0, X1 - X0, Y1 - Y0);
          continue;
        }
        if (!tt) request(s, tx, tz);
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
    // Markers: a colored disc with the structure's icon, the same size at every zoom.
    const r = 11;
    const k = 15 / 24;
    for (const m of list) {
      if (m.sx < -r || m.sy < -r || m.sx > W + r || m.sy > H + r) continue;
      g.beginPath();
      g.arc(m.sx, m.sy, r, 0, Math.PI * 2);
      g.fillStyle = STRUCTURES[m.i].color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#0b0d10';
      g.stroke();
      g.save();
      g.translate(m.sx - 12 * k, m.sy - 12 * k);
      g.scale(k, k);
      g.lineWidth = 2.4;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.stroke(iconPath(m.i));
      g.restore();
    }
    markers.current = list;

    // Saved places: a white diamond and the name next to it.
    g.font = '600 12px system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (const pin of props.current.pins) {
      const X = sx(pin.x + 0.5);
      const Y = sy(pin.z + 0.5);
      if (X < -100 || Y < -20 || X > W + 20 || Y > H + 20) continue;
      g.beginPath();
      g.moveTo(X, Y - 8);
      g.lineTo(X + 7, Y);
      g.lineTo(X, Y + 8);
      g.lineTo(X - 7, Y);
      g.closePath();
      g.fillStyle = '#ffffff';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#0b0d10';
      g.stroke();
      g.lineWidth = 3;
      g.strokeText(pin.name, X + 11, Y);
      g.fillStyle = '#ffffff';
      g.fillText(pin.name, X + 11, Y);
    }

    const sp = props.current.spawn;
    if (sp) {
      const X = Math.round(sx(sp.x + 0.5)) + 0.5;
      const Y = Math.round(sy(sp.z + 0.5)) + 0.5;
      const arm = 9;
      g.lineCap = 'square';
      for (const [w, c] of [[6, '#0b0d10'], [3, '#ff3b30']] as const) {
        g.lineWidth = w;
        g.strokeStyle = c;
        g.beginPath();
        g.moveTo(X - arm, Y);
        g.lineTo(X + arm, Y);
        g.moveTo(X, Y - arm);
        g.lineTo(X, Y + arm);
        g.stroke();
      }
      g.lineCap = 'butt';
    }

    if (selected) {
      const X = sx(selected.x);
      const Y = sy(selected.z);
      g.lineWidth = 2.5;
      g.strokeStyle = '#ffffff';
      g.beginPath();
      if (selected.structure !== undefined || selected.spawn) g.arc(X, Y, r + 4, 0, Math.PI * 2);
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
      .then((tt) => {
        if (keyRef.current !== wk) return tt.bitmap.close();
        tiles.current.set(k, tt);
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
      .filter(([, tt]) => tt !== 'loading')
      .map(([k, tt]) => {
        const [s, tx, tz] = k.split(':').map(Number);
        const T = TILE * s;
        return { k, tt, d: Math.hypot(tx * T + T / 2 - x, tz * T + T / 2 - z) / T };
      })
      .sort((a, b) => b.d - a.d);
    for (const r of ranked.slice(0, m.size - 300)) {
      (r.tt as TileResult).bitmap.close();
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
          const tt = tiles.current.get(`${s}:${tx}:${tz}`);
          if (!tt || tt === 'loading') continue;
          const lx0 = Math.max(0, Math.floor((left - tx * T) / s));
          const lz0 = Math.max(0, Math.floor((top - tz * T) / s));
          const lx1 = Math.min(TILE, Math.ceil((right - tx * T) / s));
          const lz1 = Math.min(TILE, Math.ceil((bottom - tz * T) / s));
          for (let lz = lz0; lz < lz1; lz++) for (let lx = lx0; lx < lx1; lx++) seen[tt.ids[lz * TILE + lx]]++;
        }
      const ids = [...seen.keys()].filter((i) => seen[i] > 0).sort((a, b) => seen[b] - seen[a]);
      props.current.onBiomesInView(ids);
    }, 250);
  };

  /** Block position and biome under a point on the canvas. */
  /** The structure marker or spawn under a screen point, if any. */
  const hitAt = (px: number, py: number): Pick | null => {
    let best: Marker | null = null;
    let bd = 13;
    for (const m of markers.current) {
      const d = Math.hypot(m.sx - px, m.sy - py);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best) return { ...pickAt(best.sx, best.sy), x: best.x, z: best.z, structure: best.i, sx: best.sx, sy: best.sy };
    const host = box.current;
    if (host) {
      const { x, z, bpp } = view.current;
      for (const pin of props.current.pins) {
        const X = (pin.x + 0.5 - x) / bpp + host.clientWidth / 2;
        const Y = (pin.z + 0.5 - z) / bpp + host.clientHeight / 2;
        if (Math.hypot(X - px, Y - py) < 11) return { ...pickAt(X, Y), x: pin.x, z: pin.z, pin: pin.name, sx: X, sy: Y };
      }
    }
    const sp = props.current.spawn;
    if (sp && host) {
      const { x, z, bpp } = view.current;
      const X = (sp.x - x) / bpp + host.clientWidth / 2;
      const Y = (sp.z - z) / bpp + host.clientHeight / 2;
      if (Math.hypot(X - px, Y - py) < 11) return { ...pickAt(X, Y), x: sp.x, z: sp.z, spawn: true, sx: X, sy: Y };
    }
    return null;
  };

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
      const tt = tiles.current.get(`${s}:${tx}:${tz}`);
      if (tt && tt !== 'loading') biome = tt.ids[Math.floor((bz - tz * T) / s) * TILE + Math.floor((bx - tx * T) / s)];
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
    for (const tt of tiles.current.values()) if (tt !== 'loading') tt.bitmap.close();
    tiles.current.clear();
    structs.current.clear();
    props.current.engine.clear();
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(redraw, [p.enabled, p.structureIds, p.selected, p.spawn, p.pins]); // eslint-disable-line react-hooks/exhaustive-deps

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

    let drag: { x: number; y: number } | null = null;
    let moved = 0;
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
      if (e.button !== 0) return;
      drag = local(e);
      moved = 0;
    };
    const move = (e: PointerEvent) => {
      const at = local(e);
      const prev = drag;
      props.current.onHover(prev ? pickAt(at.x, at.y) : (hitAt(at.x, at.y) ?? { ...pickAt(at.x, at.y), sx: at.x, sy: at.y }));
      if (!prev) return;
      drag = at;
      const dx = at.x - prev.x;
      const dy = at.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      const v = view.current;
      view.current = { ...v, x: v.x - dx * v.bpp, z: v.z - dy * v.bpp };
      changed();
    };
    const up = (e: PointerEvent) => {
      const at = local(e);
      const wasClick = !!drag && moved < 6;
      drag = null;
      if (!wasClick) return;
      // A click picks the structure marker (or spawn) under it, or else the spot itself.
      props.current.onSelect(hitAt(at.x, at.y) ?? pickAt(at.x, at.y));
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
      for (const tt of tiles.current.values()) if (tt !== 'loading') tt.bitmap.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={box} className="sm-map">
      <canvas ref={cv} role="img" aria-label={t('Biome map. Drag to move, scroll to zoom, click for coordinates.')} />
    </div>
  );
}
