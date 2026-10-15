import { useEffect, useMemo, useRef, useState } from 'react';
import { NumberField, Panel, Segmented, Stat, num } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Help } from '../../components/Help';
import { Workbench } from '../../components/Workbench';

type Shape = 'circle' | 'sphere';
type Fill = 'thin' | 'thick' | 'filled';

/** Cells of one layer. For spheres, `layer` picks the horizontal slice. */
function layerGrid(w: number, h: number, fill: Fill, sphere?: { d: number; layer: number }) {
  const inside = (x: number, z: number, y?: number) => {
    const px = (x + 0.5 - w / 2) / (w / 2);
    const pz = (z + 0.5 - h / 2) / (h / 2);
    if (y === undefined) return px * px + pz * pz <= 1;
    const py = (y + 0.5 - sphere!.d / 2) / (sphere!.d / 2);
    return px * px + pz * pz + py * py <= 1;
  };
  const y = sphere?.layer;
  const cells: boolean[] = new Array(w * h).fill(false);
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, z, y)) continue;
      if (fill === 'filled') {
        cells[z * w + x] = true;
        continue;
      }
      const out = (dx: number, dz: number, dy = 0) => {
        const nx = x + dx;
        const nz = z + dz;
        const ny = y === undefined ? undefined : y + dy;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) return true;
        if (ny !== undefined && (ny < 0 || ny >= sphere!.d)) return true;
        return !inside(nx, nz, ny);
      };
      let edge = out(1, 0) || out(-1, 0) || out(0, 1) || out(0, -1);
      if (fill === 'thick') edge ||= out(1, 1) || out(-1, 1) || out(1, -1) || out(-1, -1);
      // A hollow sphere also needs the cells whose neighbour above or below is outside.
      if (y !== undefined) edge ||= out(0, 0, 1) || out(0, 0, -1);
      cells[z * w + x] = edge;
    }
  }
  return cells;
}

export default function CircleGenerator() {
  const [shape, setShape] = useState<Shape>('circle');
  const [fill, setFill] = useState<Fill>('thin');
  const [width, setWidth] = useState('21');
  const [height, setHeight] = useState('21');
  const [layer, setLayer] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(560);
  const [theme] = useTheme();

  // Spheres are capped lower: the whole-sphere count checks every layer.
  const w = Math.max(1, Math.min(shape === 'sphere' ? 128 : 256, Math.round(num(width, 21))));
  const h = shape === 'sphere' ? w : Math.max(1, Math.min(256, Math.round(num(height, 21))));
  const layerIdx = Math.min(layer, w - 1);

  const cells = useMemo(
    () => layerGrid(w, h, fill, shape === 'sphere' ? { d: w, layer: layerIdx } : undefined),
    [w, h, fill, shape, layerIdx],
  );
  const total = useMemo(() => {
    if (shape === 'circle') return cells.filter(Boolean).length;
    let n = 0;
    for (let y = 0; y < w; y++) n += layerGrid(w, w, fill, { d: w, layer: y }).filter(Boolean).length;
    return n;
  }, [cells, shape, w, fill]);

  // The guide fills its column and stays short enough to fit on screen next to the controls.
  useEffect(() => {
    const el = box.current;
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
    const avail = box.current?.clientWidth || boxW;
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
  }, [cells, w, h, theme, boxW]);

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

  const guide = (
    <Panel title="guide">
      <div className="stats">
        <Stat label={shape === 'sphere' ? 'this layer' : 'blocks'} value={cells.filter(Boolean).length} />
        {shape === 'sphere' && <Stat label="whole sphere" value={total} />}
        <Stat label="size" value={`${w} × ${h}`} />
      </div>
      <div ref={box} style={{ overflowX: 'auto' }}>
        <canvas ref={canvas} role="img" aria-label={`${shape} guide, ${w} by ${h} blocks`} style={{ display: 'block', borderRadius: 6 }} />
      </div>
    </Panel>
  );

  return (
    <Workbench preview={guide}>
      <section className="panel" aria-label="Shape">
        <div className="opt-row">
          <span className="opt-label" id="shape">
            Shape
          </span>
          <Segmented
            labelledBy="shape"
            value={shape}
            onChange={(s) => {
              setShape(s);
              setLayer(0);
            }}
            options={[
              { value: 'circle', label: 'circle / oval' },
              { value: 'sphere', label: 'sphere' },
            ]}
          />
        </div>
        <hr className="divider" />
        <div className="opt-row">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="opt-label" id="fill">
              Fill
            </span>
            <Help label="fill" text="Thin: one block wide, blocks only touch at the corners on curves. Thick: no diagonal gaps, so walls are watertight and look solid. Filled: the whole disc or ball." />
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
          <NumberField label={shape === 'sphere' ? 'Diameter' : 'Width'} value={width} onChange={setWidth} min={1} max={256} />
          {shape === 'circle' && <NumberField label="Height" value={height} onChange={setHeight} min={1} max={256} />}
        </div>
        {shape === 'sphere' && (
          <div className="opt-row">
            <label className="opt-label" htmlFor="layer">
              Layer
              <span className="hint">
                {layerIdx + 1} of {w}
              </span>
            </label>
            <div className="range">
              <input id="layer" type="range" min={0} max={w - 1} value={layerIdx} onChange={(e) => setLayer(Number(e.target.value))} />
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
