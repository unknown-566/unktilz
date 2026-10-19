import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { NumberField, Panel, Segmented, Stat, num } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Help } from '../../components/Help';
import { Workbench } from '../../components/Workbench';
import { FLAT_SHAPES, MAX_FLAT, MAX_SOLID, SOLID_SHAPES, buildVolume, is3d, layerGrid, type Fill, type Shape } from './circleShapes';
import type { Layers } from './shapeFaces';

// three.js only loads once a 3D shape is shown.
const Shape3D = lazy(() => import('./Shape3D'));

type View = '3d' | 'layer';
const VIEW_KEY = 'unktilz-shape-view';
const savedView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'layer' ? 'layer' : '3d';
  } catch {
    return '3d';
  }
};

const LABEL: Record<Shape, string> = {
  circle: 'circle / oval',
  polygon: 'polygon',
  star: 'star',
  heart: 'heart',
  sphere: 'sphere',
  dome: 'dome',
  cylinder: 'cylinder',
  cone: 'cone',
  pyramid: 'pyramid',
  torus: 'torus (donut)',
};

const clampInt = (s: string, fallback: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(num(s, fallback))));

export default function CircleGenerator() {
  const [shape, setShape] = useState<Shape>('circle');
  const [fill, setFill] = useState<Fill>('thin');
  const [width, setWidth] = useState('21');
  const [length, setLength] = useState('21');
  const [height, setHeight] = useState('21');
  const [sides, setSides] = useState('6');
  const [points, setPoints] = useState('5');
  const [depth, setDepth] = useState(50);
  const [tube, setTube] = useState('5');
  const [layer, setLayer] = useState(0);
  const [view, setView] = useState<View>(savedView);
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(560);
  const [theme] = useTheme();

  const solid = is3d(shape);
  // 3D shapes are capped lower: the whole-shape count checks every layer.
  const max = solid ? MAX_SOLID : MAX_FLAT;
  const w = clampInt(width, 21, 1, max);
  const h = clampInt(length, 21, 1, max);
  const tall = clampInt(height, 21, 1, MAX_SOLID);
  const nSides = clampInt(sides, 6, 3, 12);
  const nPoints = clampInt(points, 5, 3, 12);
  const tubeW = clampInt(tube, 5, 1, MAX_SOLID);
  const volume = useMemo(
    () => buildVolume(shape, { w, l: h, h: tall, sides: nSides, points: nPoints, depth, tube: tubeW }),
    [shape, w, h, tall, nSides, nPoints, depth, tubeW],
  );
  const layers = volume.h;
  const layerIdx = Math.min(layer, layers - 1);

  // The blocks of every layer, bottom first (one layer for flat shapes).
  const grids = useMemo(() => Array.from({ length: layers }, (_, y) => layerGrid(volume, fill, y)), [volume, fill, layers]);
  const shapeLayers = useMemo<Layers>(() => ({ w, l: h, grids }), [grids]); // eslint-disable-line react-hooks/exhaustive-deps
  const cells = grids[layerIdx];
  const below = layerIdx > 0 ? grids[layerIdx - 1] : null;
  const total = useMemo(() => grids.reduce((n, g) => n + g.filter(Boolean).length, 0), [grids]);
  const show3d = solid && view === '3d';

  // The mouse wheel over the guide moves through the layers (up = higher), instead of scrolling the page.
  const wheel = useRef({ layers, acc: 0 });
  wheel.current.layers = layers;
  useEffect(() => {
    const el = area.current;
    if (!el || !solid) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = wheel.current;
      // Touchpads send many small steps: one layer per ~60 px of scrolling.
      st.acc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      const steps = Math.trunc(st.acc / 60) || (Math.abs(e.deltaY) >= 50 ? Math.sign(e.deltaY) : 0);
      if (!steps) return;
      st.acc = 0;
      setLayer((l) => Math.max(0, Math.min(st.layers - 1, Math.min(l, st.layers - 1) - steps)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [solid]);

  // The guide fills its column and stays short enough to fit on screen next to the controls.
  // (Measured on the area around it, which stays visible while the 3D view is shown.)
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim();
    const line = css.getPropertyValue('--line').trim();
    const bg = css.getPropertyValue('--bg').trim();
    const fg = css.getPropertyValue('--muted').trim();
    const avail = boxW;
    const room = Math.max(200, Math.min(avail, window.innerHeight - 300));
    const cell = Math.max(2, Math.floor(room / Math.max(w, h)));
    const dpr = window.devicePixelRatio || 1;
    c.width = w * cell * dpr;
    c.height = h * cell * dpr;
    c.style.width = `${w * cell}px`;
    c.style.height = `${h * cell}px`;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w * cell, h * cell);
    for (let z = 0; z < h; z++)
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = cells[z * w + x] ? accent : bg;
        ctx.fillRect(x * cell, z * cell, cell, cell);
      }
    // The layer below, faintly, to see what this one sits on.
    if (below) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = accent;
      for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if (below[z * w + x] && !cells[z * w + x]) ctx.fillRect(x * cell, z * cell, cell, cell);
      ctx.globalAlpha = 1;
    }
    if (cell >= 5) {
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        ctx.moveTo(x * cell + 0.5, 0);
        ctx.lineTo(x * cell + 0.5, h * cell);
      }
      for (let z = 0; z <= h; z++) {
        ctx.moveTo(0, z * cell + 0.5);
        ctx.lineTo(w * cell, z * cell + 0.5);
      }
      ctx.stroke();
    }
    // Center guides help count from the middle.
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo((w * cell) / 2, 0);
    ctx.lineTo((w * cell) / 2, h * cell);
    ctx.moveTo(0, (h * cell) / 2);
    ctx.lineTo(w * cell, (h * cell) / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [cells, below, w, h, theme, boxW, show3d]);

  const rowRuns = useMemo(() => {
    // Blocks per row from the top, e.g. "7" or "2 · 3 · 2" for hollow rows.
    const out: string[] = [];
    for (let z = 0; z < h; z++) {
      const runs: number[] = [];
      let run = 0;
      for (let x = 0; x <= w; x++) {
        if (x < w && cells[z * w + x]) run++;
        else if (run) {
          runs.push(run);
          run = 0;
        }
      }
      out.push(runs.join(' · ') || '0');
    }
    return out;
  }, [cells, w, h]);

  const pick = (s: Shape) => {
    setShape(s);
    setLayer(0);
    // A height that suits the shape: a round dome and a classic step pyramid are half as tall as wide.
    if (is3d(s)) setHeight(String(s === 'dome' || s === 'pyramid' ? Math.ceil(w / 2) : w));
  };

  const room3d = Math.max(260, Math.min(boxW, (typeof window !== 'undefined' ? window.innerHeight : 800) - 300));
  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* only a convenience */
    }
  };

  const guide = (
    <Panel
      title="guide"
      actions={
        solid ? (
          <Segmented
            label="View"
            compact
            value={view}
            onChange={pickView}
            options={[
              { value: '3d', label: '3D' },
              { value: 'layer', label: 'layer' },
            ]}
          />
        ) : undefined
      }
    >
      <div className="stats">
        <Stat label={solid ? 'this layer' : 'blocks'} value={cells.filter(Boolean).length} />
        {solid && <Stat label="whole shape" value={total} />}
        <Stat label="size" value={solid ? `${w} × ${h} × ${layers}` : `${w} × ${h}`} />
      </div>
      <div ref={area}>
        <div ref={box} style={{ overflowX: 'auto', display: show3d ? 'none' : undefined }}>
          <canvas ref={canvas} role="img" aria-label={`${LABEL[shape]} guide${solid ? `, layer ${layerIdx + 1} of ${layers}` : ''}, ${w} by ${h} blocks`} style={{ display: 'block', borderRadius: 6 }} />
        </div>
        {show3d && (
          <Suspense fallback={<div style={{ height: room3d }} />}>
            <Shape3D layers={shapeLayers} layer={layerIdx} height={room3d} />
          </Suspense>
        )}
        {solid && <p className="note">Scroll over the guide to move through the layers ({layerIdx + 1} of {layers}).</p>}
      </div>
    </Panel>
  );

  return (
    <Workbench preview={guide}>
      <section className="panel" aria-label="Shape">
        <div className="opt-row">
          <span className="opt-label" id="shape-flat">
            Flat
          </span>
          <Segmented labelledBy="shape-flat" value={shape} onChange={pick} options={FLAT_SHAPES.map((s) => ({ value: s, label: LABEL[s] }))} />
        </div>
        <div className="opt-row">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="opt-label" id="shape-3d">
              3D
            </span>
            <Help label="3D shapes" text="Built layer by layer: scroll over the guide (or use the Layer slider) to see which blocks go on each layer. Layer 1 is the bottom." />
          </span>
          <Segmented labelledBy="shape-3d" value={shape} onChange={pick} options={SOLID_SHAPES.map((s) => ({ value: s, label: LABEL[s] }))} />
        </div>
        <hr className="divider" />
        <div className="opt-row">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="opt-label" id="fill">
              Fill
            </span>
            <Help
              label="fill"
              text="Thin: one block wide, blocks only touch at the corners on curves. Thick: no diagonal gaps, so walls are watertight and look solid. Filled: the whole shape, solid. Hollow domes, cones and pyramids have no floor, and a hollow cylinder is an open tube (no lid, no floor)."
            />
          </span>
          <Segmented
            labelledBy="fill"
            value={fill}
            onChange={setFill}
            options={[
              { value: 'thin', label: 'thin' },
              { value: 'thick', label: 'thick' },
              { value: 'filled', label: 'filled' },
            ]}
          />
        </div>
        <hr className="divider" />
        <div className="fields">
          <NumberField label={shape === 'torus' ? 'Outer width' : 'Width'} value={width} onChange={setWidth} min={1} max={max} />
          <NumberField label={shape === 'torus' ? 'Outer length' : 'Length'} value={length} onChange={setLength} min={1} max={max} />
          {solid && shape !== 'torus' && (
            <NumberField
              label="Height"
              value={height}
              onChange={setHeight}
              min={1}
              max={MAX_SOLID}
              help={shape === 'sphere' ? 'Width, length and height the same make a ball; different ones an egg or a lens.' : undefined}
            />
          )}
          {shape === 'torus' && (
            <NumberField label="Tube thickness" value={tube} onChange={setTube} min={1} max={Math.max(1, Math.floor(Math.min(w, h) / 2))} help="How thick the ring is, in blocks. It's also how tall the donut is." />
          )}
          {shape === 'polygon' && <NumberField label="Sides" value={sides} onChange={setSides} min={3} max={12} help="3 = triangle, 4 = square, 5 = pentagon, 6 = hexagon, 8 = octagon." />}
          {shape === 'star' && <NumberField label="Points" value={points} onChange={setPoints} min={3} max={12} />}
        </div>
        {shape === 'star' && (
          <div className="opt-row">
            <label className="opt-label" htmlFor="depth">
              Point depth
              <span className="hint">{depth} %</span>
            </label>
            <div className="range">
              <input id="depth" type="range" min={10} max={90} step={5} value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
            </div>
          </div>
        )}
        {solid && (
          <div className="opt-row">
            <label className="opt-label" htmlFor="layer">
              Layer
              <span className="hint">
                {layerIdx + 1} of {layers}, from the bottom
              </span>
            </label>
            <div className="range">
              <input id="layer" type="range" min={0} max={layers - 1} value={layerIdx} onChange={(e) => setLayer(Number(e.target.value))} />
            </div>
          </div>
        )}
      </section>

      <Panel title="blocks per row">
        <pre className="code" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {rowRuns.map((r, i) => `${String(i + 1).padStart(3)}  ${r}`).join('\n')}
        </pre>
      </Panel>
    </Workbench>
  );
}
