import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, Segmented, Toggle } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { Workbench } from '../../../components/Workbench';
import { computeValue } from '../../../lib/compute';
import { saveBlob } from '../../../queue/download';
import { isHeic, isTiff } from '../../../workers/tasks/imageCodecs';
import { findSubject, modelReady, releaseAi } from './ai';
import { MODEL } from './model';
import {
  StrokeRecorder,
  aiLayer,
  alphaAt,
  bbox,
  colorLayer,
  composite,
  emptyRect,
  growRect,
  newLayers,
  stamp,
  swapPatches,
  type AiSettings,
  type ColorSettings,
  type Layers,
  type Patch,
  type Pick,
  type Rect,
} from './mask';

/** Pictures are edited at most this big (long side). */
const MAX_SIDE = 4096;

type Img = { name: string; w: number; h: number; rgba: Uint8ClampedArray; bitmap: ImageBitmap };
type Tool = 'pick' | 'erase' | 'restore';
type Backdrop = 'checker' | 'white' | 'black' | 'green';
/** Everything the sliders and picks decide (undo puts it back). */
type Snapshot = { aiOn: boolean; ai: AiSettings; picks: Pick[]; color: ColorSettings };
type UndoEntry = { kind: 'state'; snap: Snapshot; at: number; field: string } | { kind: 'stroke'; patches: Patch[] };

const DEFAULT_SNAP: Snapshot = { aiOn: false, ai: { edge: 30, strength: 50 }, picks: [], color: { tolerance: 12, contiguous: true, feather: 1 } };
const BACKDROP: Record<Backdrop, string> = { checker: '', white: '#ffffff', black: '#000000', green: '#00b140' };

async function loadImage(file: File): Promise<Img> {
  const src = isHeic(file) || isTiff(file) ? (await computeValue('image-preview', { file, max: MAX_SIDE })).blob : file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(src, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`${file.name} couldn’t be read as a picture.`);
  }
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { name: file.name, w, h, rgba: g.getImageData(0, 0, w, h).data, bitmap: c.transferToImageBitmap() };
}

const mb = (n: number) => `${Math.round(n / 1e6)} MB`;

export default function BgRemover() {
  const [img, setImg] = useState<Img | null>(null);
  const [loadError, setLoadError] = useState('');
  const layers = useRef<Layers | null>(null);
  const [snap, setSnap] = useState<Snapshot>(DEFAULT_SNAP);
  const [prob, setProb] = useState<Float32Array | null>(null);
  const [aiState, setAiState] = useState<{ busy: boolean; text: string; error?: string; info?: string }>({ busy: false, text: '' });
  const [cached, setCached] = useState<boolean | null>(null);
  const [tool, setTool] = useState<Tool>('erase');
  const [brush, setBrush] = useState({ size: 40, hardness: 60 });
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [backdrop, setBackdrop] = useState<Backdrop>('checker');
  const [showRemoved, setShowRemoved] = useState(false);
  const [out, setOut] = useState({ format: 'png' as 'png' | 'webp' | 'jpg', fill: false, fillColor: '#ffffff', crop: false, pad: 16 });
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  const [redo, setRedo] = useState<UndoEntry[]>([]);
  const [, setVersion] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const view = useRef<ImageData | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    void modelReady().then(setCached);
    return () => releaseAi();
  }, []);

  // ---- drawing ----

  /** Repaints a region of the preview (or all of it) from the picture and the mask. */
  const paint = useCallback(
    (r?: Rect) => {
      const L = layers.current;
      const c = canvas.current;
      if (!img || !L || !c) return;
      if (!view.current || view.current.width !== img.w || view.current.height !== img.h) view.current = new ImageData(img.w, img.h);
      const d = view.current.data;
      const x0 = r ? Math.max(0, r.x0) : 0;
      const y0 = r ? Math.max(0, r.y0) : 0;
      const x1 = r ? Math.min(img.w - 1, r.x1) : img.w - 1;
      const y1 = r ? Math.min(img.h - 1, r.y1) : img.h - 1;
      const src = img.rgba;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * img.w + x;
          const a = alphaAt(L, i);
          const o = i * 4;
          if (showRemoved) {
            // The original, with what's removed tinted red.
            const t = (255 - a) / 255;
            d[o] = src[o] + (230 - src[o]) * t * 0.7;
            d[o + 1] = src[o + 1] * (1 - t * 0.7);
            d[o + 2] = src[o + 2] * (1 - t * 0.7);
            d[o + 3] = 255;
          } else {
            d[o] = src[o];
            d[o + 1] = src[o + 1];
            d[o + 2] = src[o + 2];
            d[o + 3] = a;
          }
        }
      c.getContext('2d')!.putImageData(view.current, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    },
    [img, showRemoved],
  );

  // The AI and colour layers follow their settings.
  useEffect(() => {
    const L = layers.current;
    if (!img || !L) return;
    L.ai = snap.aiOn && prob ? aiLayer(prob, MODEL.side, img.w, img.h, snap.ai) : null;
    paint();
    // (The "% removed" line reads the layers: show it again now that they changed.)
    setVersion((v) => v + 1);
  }, [img, prob, snap.aiOn, snap.ai, paint]);
  useEffect(() => {
    const L = layers.current;
    if (!img || !L) return;
    L.color = snap.picks.length ? colorLayer(img.rgba, img.w, img.h, snap.picks, snap.color) : null;
    paint();
    setVersion((v) => v + 1);
  }, [img, snap.picks, snap.color, paint]);

  // ---- opening a picture ----

  const open = async (file: File) => {
    setLoadError('');
    try {
      const im = await loadImage(file);
      img?.bitmap.close();
      layers.current = newLayers(im.w, im.h);
      view.current = null;
      setProb(null);
      setSnap(DEFAULT_SNAP);
      setUndo([]);
      setRedo([]);
      setFit(true);
      setAiState({ busy: false, text: '' });
      setImg(im);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) void open(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // ---- undo ----

  /** Changes the settings, as one undo step (quick changes of the same slider count as one). */
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const change = (patch: Partial<Snapshot>, field: string) => {
    const cur = snapRef.current;
    const last = undo[undo.length - 1];
    const now = Date.now();
    if (last?.kind === 'state' && last.field === field && now - last.at < 800) last.at = now;
    else setUndo((u) => [...u.slice(-99), { kind: 'state', snap: cur, at: now, field }]);
    setRedo([]);
    const next = { ...cur, ...patch };
    snapRef.current = next;
    setSnap(next);
  };
  const step = (from: UndoEntry[], to: (e: UndoEntry) => void, setFrom: (u: UndoEntry[]) => void) => {
    const e = from[from.length - 1];
    const L = layers.current;
    if (!e || !L) return;
    setFrom(from.slice(0, -1));
    if (e.kind === 'state') {
      to({ kind: 'state', snap, at: 0, field: '' });
      setSnap(e.snap);
    } else {
      to({ kind: 'stroke', patches: swapPatches(L, e.patches) });
      paint();
    }
  };
  const doUndo = () => step(undo, (e) => setRedo((r) => [...r, e]), setUndo);
  const doRedo = () => step(redo, (e) => setUndo((u) => [...u, e]), setRedo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!img || (e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        doRedo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (k === 'e') setTool('erase');
        else if (k === 'r') setTool('restore');
        else if (k === 'p') setTool('pick');
        else if (k === '[') setBrush((b) => ({ ...b, size: Math.max(2, Math.round(b.size / 1.2)) }));
        else if (k === ']') setBrush((b) => ({ ...b, size: Math.min(500, Math.round(b.size * 1.2)) }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- AI ----

  const runAi = async () => {
    if (!img) return;
    if (prob) return change({ aiOn: true }, 'aiOn');
    setAiState({ busy: true, text: cached ? 'Starting the AI…' : `Downloading the AI model (${mb(MODEL.size)}, only the first time)…` });
    try {
      const r = await findSubject(await createImageBitmap(img.bitmap), (e) =>
        setAiState((s) => ({ ...s, text: e.type === 'download' ? `Downloading the AI model… ${mb(e.loaded)} / ${mb(e.total)}` : e.text })),
      );
      setCached(true);
      setProb(r.prob);
      change({ aiOn: true }, 'aiOn');
      setAiState({ busy: false, text: '', info: `Done in ${(r.ms / 1000).toFixed(1)} s on the ${r.backend === 'webgpu' ? 'graphics card' : 'processor'}.` });
    } catch (e) {
      setAiState({ busy: false, text: '', error: e instanceof Error ? e.message : String(e) });
    }
  };

  // ---- pointer on the picture ----

  const toImage = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * img!.w) / r.width, y: ((e.clientY - r.top) * img!.h) / r.height };
  };
  const scale = () => (canvas.current ? canvas.current.getBoundingClientRect().width / (img?.w || 1) : 1);
  const stroke = useRef<{ rec: StrokeRecorder; last: { x: number; y: number }; dirty: Rect; raf: number } | null>(null);
  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const space = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement | null)?.closest?.('input, textarea, select, button')) {
        space.current = true;
        if (img) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [img]);

  const dab = (p: { x: number; y: number }) => {
    const s = stroke.current!;
    const L = layers.current!;
    // The brush size is in screen pixels, so it feels the same at any zoom.
    const radius = brush.size / 2 / scale();
    const dist = Math.hypot(p.x - s.last.x, p.y - s.last.y);
    const steps = Math.max(1, Math.ceil(dist / Math.max(1, radius * 0.25)));
    for (let i = 1; i <= steps; i++) {
      const q = { x: s.last.x + ((p.x - s.last.x) * i) / steps, y: s.last.y + ((p.y - s.last.y) * i) / steps };
      const r = stamp(L, q.x, q.y, radius, brush.hardness / 100, tool === 'erase', (rect) => s.rec.touch(rect));
      if (r) growRect(s.dirty, r);
    }
    s.last = p;
    if (!s.raf)
      s.raf = requestAnimationFrame(() => {
        if (!stroke.current) return;
        stroke.current.raf = 0;
        paint(stroke.current.dirty);
        stroke.current.dirty = emptyRect();
      });
  };

  /** Keeps getting the pointer while dragging outside the picture (never fatal if the browser refuses). */
  const capture = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* not an active pointer */
    }
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!img || !layers.current) return;
    const vp = viewport.current!;
    if (e.button === 1 || space.current) {
      e.preventDefault();
      pan.current = { x: e.clientX, y: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop };
      capture(e);
      return;
    }
    if (e.button !== 0) return;
    const p = toImage(e);
    if (tool === 'pick') {
      const x = Math.min(img.w - 1, Math.max(0, Math.floor(p.x)));
      const y = Math.min(img.h - 1, Math.max(0, Math.floor(p.y)));
      const o = (y * img.w + x) * 4;
      change({ picks: [...snap.picks, { x, y, r: img.rgba[o], g: img.rgba[o + 1], b: img.rgba[o + 2] }] }, `pick${snap.picks.length}`);
      return;
    }
    capture(e);
    stroke.current = { rec: new StrokeRecorder(layers.current), last: p, dirty: emptyRect(), raf: 0 };
    dab(p);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pan.current) {
      const vp = viewport.current!;
      vp.scrollLeft = pan.current.sl - (e.clientX - pan.current.x);
      vp.scrollTop = pan.current.st - (e.clientY - pan.current.y);
      return;
    }
    const r = canvas.current?.getBoundingClientRect();
    if (r) setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
    if (stroke.current) dab(toImage(e));
  };
  const onPointerUp = () => {
    pan.current = null;
    const s = stroke.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    paint(s.dirty);
    stroke.current = null;
    const patches = s.rec.patches;
    if (patches.length) {
      setUndo((u) => [...u.slice(-99), { kind: 'stroke', patches }]);
      setRedo([]);
    }
    setVersion((v) => v + 1);
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    // Ctrl + wheel: brush size (the page zoom is on the +/− buttons).
    e.preventDefault();
    setBrush((b) => ({ ...b, size: Math.min(500, Math.max(2, Math.round(b.size * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))) }));
  };
  // React's wheel listener is passive; Ctrl + wheel must not zoom the whole page.
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    const stop = (e: WheelEvent) => e.ctrlKey && e.preventDefault();
    vp.addEventListener('wheel', stop, { passive: false });
    return () => vp.removeEventListener('wheel', stop);
  }, [img]);

  // ---- output ----

  const [saving, setSaving] = useState(false);
  const download = async () => {
    const L = layers.current;
    if (!img || !L) return;
    setSaving(true);
    try {
      const fill = out.fill || out.format === 'jpg';
      const hex = out.fill ? out.fillColor : '#ffffff';
      const bg: [number, number, number] | undefined = fill ? [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] : undefined;
      const crop = out.crop ? bbox(L) : null;
      const res = composite(img.rgba, L, { background: bg, crop, pad: out.pad });
      const c = new OffscreenCanvas(res.w, res.h);
      c.getContext('2d')!.putImageData(new ImageData(res.data, res.w, res.h), 0, 0);
      const type = out.format === 'jpg' ? 'image/jpeg' : `image/${out.format}`;
      const blob = await c.convertToBlob({ type, quality: out.format === 'png' ? undefined : 0.92 });
      saveBlob(blob, `${img.name.replace(/\.[^./]+$/, '') || 'picture'}-no-bg.${out.format}`);
    } finally {
      setSaving(false);
    }
  };

  // ---- view ----

  const fitZoom = () => {
    const vp = viewport.current;
    if (!vp || !img) return 1;
    return Math.min(1, (vp.clientWidth - 2) / img.w, (Math.max(240, window.innerHeight - 260) - 2) / img.h);
  };
  useEffect(() => {
    if (!img || !fit) return;
    const apply = () => setZoom(fitZoom());
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [img, fit]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomBy = (k: number) => {
    setFit(false);
    setZoom((z) => Math.min(8, Math.max(0.05, z * k)));
  };

  const removedShare = (() => {
    const L = layers.current;
    if (!img || !L) return 0;
    let n = 0;
    const stepPx = Math.max(1, Math.floor((img.w * img.h) / 40000));
    let total = 0;
    for (let i = 0; i < img.w * img.h; i += stepPx, total++) if (alphaAt(L, i) < 128) n++;
    return n / total;
  })();

  const preview = (
    <Panel
      title={img ? `${img.w} × ${img.h}` : 'preview'}
      actions={
        img ? (
          <span className="inline">
            <button type="button" className="btn btn-sm" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out">
              −
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setFit(true)} title="Fit the whole picture">
              {Math.round(zoom * 100)} %
            </button>
            <button type="button" className="btn btn-sm" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in">
              +
            </button>
          </span>
        ) : undefined
      }
    >
      {img ? (
        <>
          <div
            ref={viewport}
            className={`bgr-viewport bgr-${backdrop}`}
            style={{ background: BACKDROP[backdrop] || undefined, maxHeight: 'calc(100dvh - 260px)' }}
            onWheel={onWheel}
          >
            <div className="bgr-stage" style={{ width: img.w * zoom, height: img.h * zoom }}>
              <canvas
                ref={(el) => {
                  canvas.current = el;
                  if (el && (el.width !== img.w || el.height !== img.h)) {
                    el.width = img.w;
                    el.height = img.h;
                    paint();
                  }
                }}
                className={`bgr-canvas bgr-tool-${tool}`}
                style={{ width: img.w * zoom, height: img.h * zoom }}
                role="img"
                aria-label="The picture with the background removed. Paint on it with the brush, or click the background with the colour picker."
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={() => setCursor(null)}
                onContextMenu={(e) => e.preventDefault()}
              />
              {cursor && tool !== 'pick' && (
                <span className="bgr-brush" style={{ left: cursor.x, top: cursor.y, width: brush.size, height: brush.size }} aria-hidden="true" />
              )}
            </div>
          </div>
          <div className="inline bgr-viewbar">
            <Segmented
              label="Background behind the picture"
              compact
              value={backdrop}
              onChange={setBackdrop}
              options={[
                { value: 'checker', label: 'checks' },
                { value: 'white', label: 'white' },
                { value: 'black', label: 'black' },
                { value: 'green', label: 'green' },
              ]}
            />
            <label className="check">
              <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
              <span>show removed in red</span>
            </label>
            <span className="note mono">{Math.round(removedShare * 100)} % removed</span>
          </div>
        </>
      ) : (
        <p className="note">Open a picture to start.</p>
      )}
    </Panel>
  );

  return (
    <Workbench preview={preview}>
      <Panel title="picture">
        <label
          className="bgr-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void open(f);
          }}
        >
          <input type="file" accept="image/*,.heic,.heif,.tif,.tiff" onChange={(e) => e.target.files?.[0] && void open(e.target.files[0])} hidden />
          <b>{img ? img.name : 'Drop a picture here, click to choose one, or paste it (Ctrl+V)'}</b>
          <span className="note">PNG, JPG, WebP, HEIC (iPhone), TIFF… Big pictures are edited at up to {MAX_SIDE} px.</span>
        </label>
        {loadError && <p className="error-text">{loadError}</p>}
      </Panel>

      {img && (
        <>
          <Panel title="1 · automatic (AI)">
            <p className="note">
              Finds the subject (people, animals, things) and removes the rest. Runs on your computer; the first time it downloads its model ({mb(MODEL.size)}).
            </p>
            {snap.aiOn ? (
              <>
                <div className="opt-row">
                  <label className="opt-label" htmlFor="bgr-edge">
                    Edge <span className="hint">{snap.ai.edge < 35 ? 'soft' : snap.ai.edge > 70 ? 'sharp' : 'medium'}</span>
                  </label>
                  <div className="range">
                    <input id="bgr-edge" type="range" min={0} max={100} value={snap.ai.edge} onChange={(e) => change({ ai: { ...snap.ai, edge: Number(e.target.value) } }, 'edge')} />
                  </div>
                  <Help label="edge" text="Soft keeps fine see-through edges like hair and fur. Sharp gives clean, hard edges for things like products, cars or logos." />
                </div>
                <div className="opt-row">
                  <label className="opt-label" htmlFor="bgr-str">
                    Strength <span className="hint">{snap.ai.strength} %</span>
                  </label>
                  <div className="range">
                    <input id="bgr-str" type="range" min={0} max={100} value={snap.ai.strength} onChange={(e) => change({ ai: { ...snap.ai, strength: Number(e.target.value) } }, 'strength')} />
                  </div>
                  <Help label="strength" text="Higher removes more of the parts the AI wasn't sure about; lower keeps more of them." />
                </div>
                <button type="button" className="btn btn-sm" onClick={() => change({ aiOn: false }, 'aiOn')}>
                  Undo the AI
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" disabled={aiState.busy} onClick={() => void runAi()}>
                {aiState.busy ? 'Working…' : 'Remove background (AI)'}
              </button>
            )}
            {aiState.busy && <p className="note mono">{aiState.text}</p>}
            {aiState.info && !aiState.busy && <p className="note">{aiState.info}</p>}
            {aiState.error && <p className="error-text">{aiState.error}</p>}
          </Panel>

          <Panel title="2 · by colour">
            <p className="note">
              Pick the <b>colour picker</b> tool below and click the background: that colour goes. Click again to add more shades.
            </p>
            <div className="opt-row">
              <label className="opt-label" htmlFor="bgr-tol">
                Tolerance <span className="hint">{snap.color.tolerance} %</span>
              </label>
              <div className="range">
                <input id="bgr-tol" type="range" min={0} max={60} value={snap.color.tolerance} onChange={(e) => change({ color: { ...snap.color, tolerance: Number(e.target.value) } }, 'tolerance')} />
              </div>
              <Help label="tolerance" text="How different a colour may be from the one you clicked and still be removed. Low = only that exact colour, high = similar shades too." />
            </div>
            <div className="opt-row">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className="opt-label" id="bgr-cont">
                  Only the connected area
                </span>
                <Help label="connected area" text="On: removes only the area touching where you clicked. Off: that colour everywhere in the picture (e.g. the sky showing through holes)." />
              </span>
              <Toggle labelledBy="bgr-cont" checked={snap.color.contiguous} onChange={(contiguous) => change({ color: { ...snap.color, contiguous } }, 'contiguous')} />
            </div>
            <div className="opt-row">
              <label className="opt-label" htmlFor="bgr-feather">
                Soften the edge <span className="hint">{snap.color.feather} px</span>
              </label>
              <div className="range">
                <input id="bgr-feather" type="range" min={0} max={10} value={snap.color.feather} onChange={(e) => change({ color: { ...snap.color, feather: Number(e.target.value) } }, 'feather')} />
              </div>
            </div>
            {snap.picks.length > 0 && (
              <div className="inline">
                {snap.picks.map((p, i) => (
                  <span key={i} className="bgr-swatch" style={{ background: `rgb(${p.r},${p.g},${p.b})` }} title={`rgb(${p.r}, ${p.g}, ${p.b})`} />
                ))}
                <button type="button" className="btn btn-sm" onClick={() => change({ picks: [] }, 'picks')}>
                  clear colours
                </button>
              </div>
            )}
          </Panel>

          <Panel title="3 · fix by hand">
            <div className="opt-row">
              <span className="opt-label" id="bgr-tool">
                Tool
              </span>
              <Segmented
                labelledBy="bgr-tool"
                value={tool}
                onChange={setTool}
                options={[
                  { value: 'erase', label: 'erase (E)' },
                  { value: 'restore', label: 'restore (R)' },
                  { value: 'pick', label: 'colour picker (P)' },
                ]}
              />
            </div>
            <div className="opt-row">
              <label className="opt-label" htmlFor="bgr-size">
                Brush size <span className="hint">{brush.size} px</span>
              </label>
              <div className="range">
                <input id="bgr-size" type="range" min={2} max={300} value={brush.size} onChange={(e) => setBrush({ ...brush, size: Number(e.target.value) })} />
              </div>
            </div>
            <div className="opt-row">
              <label className="opt-label" htmlFor="bgr-hard">
                Hardness <span className="hint">{brush.hardness} %</span>
              </label>
              <div className="range">
                <input id="bgr-hard" type="range" min={0} max={100} value={brush.hardness} onChange={(e) => setBrush({ ...brush, hardness: Number(e.target.value) })} />
              </div>
            </div>
            <div className="inline">
              <button type="button" className="btn btn-sm" disabled={!undo.length} onClick={doUndo}>
                undo (Ctrl+Z)
              </button>
              <button type="button" className="btn btn-sm" disabled={!redo.length} onClick={doRedo}>
                redo (Ctrl+Y)
              </button>
            </div>
            <p className="note">
              Erase removes what's left of the background, restore brings back parts of the subject. Ctrl + mouse wheel or [ ] changes the brush size; hold Space (or the middle
              button) and drag to move around a zoomed picture.
            </p>
          </Panel>

          <Panel title="download">
            <div className="opt-row">
              <span className="opt-label" id="bgr-fmt">
                Format
              </span>
              <Segmented
                labelledBy="bgr-fmt"
                value={out.format}
                onChange={(format) => setOut({ ...out, format })}
                options={[
                  { value: 'png', label: 'png' },
                  { value: 'webp', label: 'webp' },
                  { value: 'jpg', label: 'jpg' },
                ]}
              />
            </div>
            <div className="opt-row">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className="opt-label" id="bgr-fill">
                  Fill the background
                </span>
                <Help label="fill" text="Puts a solid colour behind the picture instead of leaving it see-through. JPG can't be see-through, so it's always filled (white unless you pick a colour)." />
              </span>
              <Toggle labelledBy="bgr-fill" checked={out.fill} onChange={(fill) => setOut({ ...out, fill })} />
              {out.fill && <input type="color" value={out.fillColor} onChange={(e) => setOut({ ...out, fillColor: e.target.value })} aria-label="Background colour" />}
            </div>
            <div className="opt-row">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className="opt-label" id="bgr-crop">
                  Crop to the subject
                </span>
                <Help label="crop" text="Cuts off the empty space around what's left, keeping a little margin." />
              </span>
              <Toggle labelledBy="bgr-crop" checked={out.crop} onChange={(crop) => setOut({ ...out, crop })} />
            </div>
            {out.crop && (
              <div className="opt-row">
                <label className="opt-label" htmlFor="bgr-pad">
                  Margin <span className="hint">{out.pad} px</span>
                </label>
                <div className="range">
                  <input id="bgr-pad" type="range" min={0} max={200} value={out.pad} onChange={(e) => setOut({ ...out, pad: Number(e.target.value) })} />
                </div>
              </div>
            )}
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void download()}>
              {saving ? 'Saving…' : `Download ${out.format.toUpperCase()}`}
            </button>
          </Panel>
        </>
      )}
    </Workbench>
  );
}
