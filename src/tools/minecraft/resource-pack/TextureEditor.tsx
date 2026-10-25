import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Panel, Segmented } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { ToolIcon } from '../skin-editor/Panels';
import {
  NO_ADJUST,
  adjustImg,
  bitmapPixels,
  blankImg,
  brush,
  cloneImg,
  decodeImage,
  encodePng,
  floodFill,
  getPx,
  hexToRgba,
  isNoAdjust,
  line,
  pasteArea,
  rgbaToHex,
  sameImg,
  scaleNearest,
  setPx,
  shadePx,
  usedColors,
  type Adjust,
  type Area,
  type Img,
} from '../../../lib/mc/pack/pixels';
import { afterDelete, afterDuplicate, afterSwap, hasAnim, parseMeta, playOrder, writeMeta, type Meta } from '../../../lib/mc/pack/anim';
import type { LiveTexture } from './live';
import { useTheme } from '../../../lib/theme';
import { fmtNum, t } from '../../../lib/i18n-core';

type Tool = 'pencil' | 'eraser' | 'fill' | 'shade' | 'picker';
const TOOLS: { id: Tool; label: string; key: string; help: string }[] = [
  { id: 'pencil', label: t('Pencil'), key: 'B', help: t('Paints pixels in the chosen color. Drag to draw.') },
  { id: 'eraser', label: t('Eraser'), key: 'E', help: t('Makes pixels see-through.') },
  { id: 'fill', label: t('Fill'), key: 'G', help: t('Fills a patch of one color (in the shown frame only).') },
  { id: 'shade', label: t('Shade'), key: 'S', help: t('Makes pixels a bit lighter or darker. Hold Shift for the opposite.') },
  { id: 'picker', label: t('Picker'), key: 'I', help: t('Click a pixel to use its color. You can also Alt + click with any tool.') },
];
const HISTORY = 100;

/** An animation's frames are squares under each other (as wide as the picture). */
function framesOf(img: Img, animated: boolean): { fh: number; count: number } {
  if (animated && img.h > img.w && img.h % img.w === 0) return { fh: img.w, count: img.h / img.w };
  return { fh: img.h, count: 1 };
}


/** Color sliders, shared by the editor and "change several at once". */
export function AdjustControls({ value, onChange }: { value: Adjust; onChange: (a: Adjust) => void }) {
  const row = (key: 'hue' | 'saturation' | 'brightness' | 'contrast', label: string, min: number, max: number, unit: string) => (
    <div className="opt-row" key={key}>
      <span className="opt-label">{label}</span>
      <div className="range">
        <input type="range" min={min} max={max} value={value[key]} aria-label={label} onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })} onDoubleClick={() => onChange({ ...value, [key]: 0 })} />
        <output>
          {value[key] > 0 ? '+' : ''}
          {fmtNum(value[key])}
          {unit}
        </output>
      </div>
    </div>
  );
  return (
    <div className="rp-adjust">
      {row('hue', t('Hue'), -180, 180, '°')}
      {row('saturation', t('Saturation'), -100, 100, ' %')}
      {row('brightness', t('Brightness'), -100, 100, ' %')}
      {row('contrast', t('Contrast'), -100, 100, ' %')}
      <div className="opt-row">
        <span className="opt-label">{t('Paint over with')}</span>
        <div className="range">
          <input type="color" className="give-color" aria-label={t('Color to paint over with')} value={value.tint.color} onChange={(e) => onChange({ ...value, tint: { ...value.tint, color: e.target.value } })} />
          <input type="range" min={0} max={100} value={value.tint.amount} aria-label={t('How much of the color')} onChange={(e) => onChange({ ...value, tint: { ...value.tint, amount: Number(e.target.value) } })} />
          <output>{fmtNum(value.tint.amount)} %</output>
        </div>
      </div>
      <div className="opt-row">
        <span className="opt-label">{t('Effects')}</span>
        <span className="seg">
          <button type="button" aria-pressed={value.grayscale} onClick={() => onChange({ ...value, grayscale: !value.grayscale })}>
            {t('black & white')}
          </button>
          <button type="button" aria-pressed={value.invert} onClick={() => onChange({ ...value, invert: !value.invert })}>
            {t('invert')}
          </button>
        </span>
      </div>
    </div>
  );
}

type Replace = { bitmap: ImageBitmap; scale: number; smooth: boolean; fit: 'stretch' | 'crop' };

/**
 * Edits one texture: paint pixel by pixel, put in a picture, or change its colors. Every finished
 * stroke goes into the pack at once (`onCommit`); a texture painted back to the original leaves it.
 */
export function TextureEditor({
  path,
  title,
  subtitle,
  origBytes,
  origMeta,
  entry,
  blank,
  live,
  onCommit,
}: {
  /** What's edited (a texture path, or a custom item's key); the preview matches it. */
  path: string;
  title: string;
  /** Shown next to the title instead of the path. */
  subtitle?: string;
  /** The game's own texture and .mcmeta, if there is one. */
  origBytes: Uint8Array | null;
  origMeta: string | null;
  /** The pack's version: picture and own .mcmeta (undefined = the game's). */
  entry: { png: Uint8Array | null; mcmeta?: string } | undefined;
  /** Size of an empty start when there's neither. */
  blank?: { w: number; h: number };
  live: LiveTexture;
  /** null = back to the game's own; mcmeta undefined = the game's own .mcmeta. */
  onCommit: (png: Uint8Array | null, mcmeta: string | undefined) => void;
}) {
  const [orig, setOrig] = useState<Img | null>(null);
  const cur = useRef<Img | null>(null);
  // The texture's own .mcmeta text (undefined: the game's is used).
  const meta = useRef<string | undefined>(entry?.mcmeta);
  const history = useRef<{ list: { img: Img; meta: string | undefined }[]; index: number }>({ list: [], index: 0 });
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState('#3c8527');
  const [alpha, setAlpha] = useState(255);
  const [size, setSize] = useState(1);
  const [shadeDir, setShadeDir] = useState<1 | -1>(-1);
  const [frame, setFrame] = useState(0);
  const [adjust, setAdjust] = useState<Adjust>(NO_ADJUST);
  const [replace, setReplace] = useState<Replace | null>(null);
  const [peek, setPeek] = useState(false);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [boxW, setBoxW] = useState(480);
  const [theme] = useTheme();
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const colorId = useId();
  const stroke = useRef<{ last: [number, number] | null; shaded: Set<number> } | null>(null);

  const metaText = () => (meta.current !== undefined ? meta.current : origMeta);
  const animated = hasAnim(metaText());

  // Load the original and the pack's version once (the parent remounts this for another texture).
  useEffect(() => {
    let alive = true;
    Promise.all([origBytes ? decodeImage(origBytes) : Promise.resolve(null), entry?.png ? decodeImage(entry.png) : Promise.resolve(null)]).then(
      ([o, mine]) => {
        if (!alive) return;
        const start = mine ?? o ?? (blank ? blankImg(blank.w, blank.h) : null);
        if (!start) return setError(t('This texture can’t be read.'));
        setOrig(o);
        cur.current = cloneImg(start);
        history.current = { list: [{ img: cloneImg(start), meta: meta.current }], index: 0 };
        setVersion((v) => v + 1);
      },
      () => alive && setError(t('This texture can’t be read.')),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver(() => setBoxW(box.current?.clientWidth ?? 480));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const img = cur.current;
  const { fh, count } = img ? framesOf(img, animated) : { fh: 16, count: 1 };
  const f = Math.min(frame, count - 1);
  const area: Area = { x: 0, y: f * fh, w: img?.w ?? 16, h: fh };
  const adjusting = !isNoAdjust(adjust);
  const shown = img && adjusting ? adjustImg(img, adjust) : img;
  const zoom = img ? Math.max(1, Math.min(32, Math.floor(Math.min(boxW, 560) / Math.max(img.w, fh)))) : 1;

  // Draw.
  useEffect(() => {
    const c = canvas.current;
    const src = peek && orig ? orig : shown;
    if (!c || !src) return;
    const a = peek && orig ? { x: 0, y: Math.min(area.y, orig.h - Math.min(fh, orig.h)), w: orig.w, h: Math.min(fh, orig.h) } : area;
    const z = peek && orig ? (zoom * area.w) / orig.w : zoom;
    const W = Math.round(a.w * z);
    const H = Math.round(a.h * z);
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    // Checkerboard for see-through pixels, in the theme's lightness.
    const cell = Math.max(4, Math.round(z / 2));
    const light = getComputedStyle(document.documentElement).colorScheme === 'light';
    const [c1, c2] = light ? ['#e4e4e4', '#cbcbcb'] : ['#3a3f47', '#2a2e35'];
    for (let y = 0; y < H; y += cell) for (let x = 0; x < W; x += cell) {
      g.fillStyle = ((x / cell + y / cell) & 1) === 0 ? c1 : c2;
      g.fillRect(x, y, cell, cell);
    }
    const tmp = new OffscreenCanvas(a.w, a.h);
    const part = new ImageData(a.w, a.h);
    for (let y = 0; y < a.h; y++) part.data.set(src.data.subarray(((a.y + y) * src.w) * 4, ((a.y + y) * src.w + a.w) * 4), y * a.w * 4);
    tmp.getContext('2d')!.putImageData(part, 0, 0);
    g.drawImage(tmp, 0, 0, W, H);
    if (z >= 8 && !peek) {
      g.strokeStyle = light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 1; x < a.w; x++) {
        g.moveTo(x * z + 0.5, 0);
        g.lineTo(x * z + 0.5, H);
      }
      for (let y = 1; y < a.h; y++) {
        g.moveTo(0, y * z + 0.5);
        g.lineTo(W, y * z + 0.5);
      }
      g.stroke();
    }
    if (hover && !peek && !adjusting) {
      const off = tool === 'fill' || tool === 'picker' ? 0 : Math.floor((size - 1) / 2);
      const s = tool === 'fill' || tool === 'picker' ? 1 : size;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.strokeRect((hover[0] - off) * z + 0.5, (hover[1] - area.y - off) * z + 0.5, s * z - 1, s * z - 1);
    }
    const plays = parseMeta(metaText()).anim;
    live.set(img && { path, img: shown!, orig, area, version, anim: plays && count > 1 ? { order: playOrder(plays, count), interpolate: plays.interpolate, fh } : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, zoom, f, hover, peek, adjust, tool, size, orig, theme]);

  /** Into the pack: nothing when it's the game's texture again, else the picture and its own .mcmeta. */
  const send = useCallback(() => {
    const c = cur.current!;
    onCommit(orig && meta.current === undefined && sameImg(c, orig) ? null : encodePng(c), meta.current);
  }, [onCommit, orig]);

  const commit = useCallback(() => {
    const c = cur.current;
    if (!c) return;
    const h = history.current;
    const last = h.list[h.index];
    if (last && sameImg(c, last.img) && last.meta === meta.current) return;
    h.list = h.list.slice(0, h.index + 1);
    h.list.push({ img: cloneImg(c), meta: meta.current });
    if (h.list.length > HISTORY) h.list.shift();
    h.index = h.list.length - 1;
    send();
    setVersion((v) => v + 1);
  }, [send]);

  const goto = useCallback(
    (step: number) => {
      const h = history.current;
      const i = h.index + step;
      if (i < 0 || i >= h.list.length) return;
      h.index = i;
      cur.current = cloneImg(h.list[i].img);
      meta.current = h.list[i].meta;
      send();
      setVersion((v) => v + 1);
    },
    [send],
  );

  // Shortcuts while the pointer is not in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        goto(e.shiftKey ? 1 : -1);
      } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault();
        goto(1);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tt = TOOLS.find((x) => x.key.toLowerCase() === k);
        if (tt) setTool(tt.id);
        else if (k === '[') setSize((s) => Math.max(1, s - 1));
        else if (k === ']') setSize((s) => Math.min(4, s + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goto]);

  const pxAt = (e: RPointerEvent<HTMLCanvasElement>): [number, number] | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * area.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * area.h);
    if (x < 0 || y < 0 || x >= area.w || y >= area.h) return null;
    return [x, y + area.y];
  };

  const paintAt = (x: number, y: number, shift: boolean) => {
    const c = cur.current!;
    const s = stroke.current!;
    if (tool === 'pencil' || tool === 'eraser') {
      const col = tool === 'eraser' ? ([0, 0, 0, 0] as const) : ([...hexToRgba(color).slice(0, 3), alpha] as [number, number, number, number]);
      for (const [px, py] of brush(area, x, y, size)) setPx(c, px, py, [col[0], col[1], col[2], col[3]]);
    } else if (tool === 'shade') {
      const dir = shift ? -shadeDir : shadeDir;
      for (const [px, py] of brush(area, x, y, size)) {
        const key = py * c.w + px;
        if (s.shaded.has(key)) continue;
        s.shaded.add(key);
        shadePx(c, px, py, dir * 0.12);
      }
    }
  };

  const pick = (x: number, y: number) => {
    const p = getPx(cur.current!, x, y);
    if (p[3] === 0) return;
    setColor(rgbaToHex(p));
    setAlpha(p[3]);
  };

  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!cur.current || adjusting || peek || e.button !== 0) return;
    const p = pxAt(e);
    if (!p) return;
    if (tool === 'picker' || e.altKey) {
      pick(p[0], p[1]);
      if (tool === 'picker') setTool('pencil');
      return;
    }
    if (tool === 'fill') {
      if (floodFill(cur.current, area, p[0], p[1], [...hexToRgba(color).slice(0, 3), alpha] as [number, number, number, number])) commit();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    stroke.current = { last: p, shaded: new Set() };
    paintAt(p[0], p[1], e.shiftKey);
    setVersion((v) => v + 1);
  };
  const moveTo = (e: RPointerEvent<HTMLCanvasElement>) => {
    const p = pxAt(e);
    setHover(p);
    const s = stroke.current;
    if (!s || !p || !s.last) return;
    for (const [x, y] of line(s.last[0], s.last[1], p[0], p[1]).slice(1)) paintAt(x, y, e.shiftKey);
    s.last = p;
    setVersion((v) => v + 1);
  };
  const up = () => {
    if (!stroke.current) return;
    stroke.current = null;
    commit();
  };

  const applyAdjust = () => {
    if (!cur.current) return;
    cur.current = adjustImg(cur.current, adjust);
    setAdjust(NO_ADJUST);
    commit();
  };

  const toOriginal = () => {
    if (!orig) return;
    cur.current = cloneImg(orig);
    meta.current = undefined;
    setAdjust(NO_ADJUST);
    commit();
  };

  // ---- animation frames ----
  const editMeta = (fn: (m: Meta) => Meta) => {
    const next = writeMeta(fn(parseMeta(metaText())));
    // The same as the game's own again: no .mcmeta of its own.
    meta.current = next === (origMeta ? writeMeta(parseMeta(origMeta)) : '') ? undefined : next;
  };
  const rows = (c: Img, y0: number, n: number) => c.data.slice(y0 * c.w * 4, (y0 + n) * c.w * 4);
  const withRows = (c: Img, h: number, parts: Uint8ClampedArray[]): Img => {
    const out = blankImg(c.w, h);
    let o = 0;
    for (const part of parts) {
      out.data.set(part, o);
      o += part.length;
    }
    return out;
  };
  /** One frame becomes two (a copy right after it); a still texture becomes an animation. */
  const duplicateFrame = () => {
    const c = cur.current;
    if (!c) return;
    const start = count > 1 ? f * fh : 0;
    cur.current = withRows(c, c.h + fh, [rows(c, 0, start + fh), rows(c, start, fh), rows(c, start + fh, c.h - start - fh)]);
    if (count > 1) editMeta((m) => ({ ...m, anim: m.anim && afterDuplicate(m.anim, f) }));
    else editMeta((m) => ({ ...m, anim: { frametime: 4, interpolate: false, frames: null } }));
    setFrame(count > 1 ? f + 1 : 1);
    commit();
  };
  const deleteFrame = () => {
    const c = cur.current;
    if (!c || count < 2) return;
    cur.current = withRows(c, c.h - fh, [rows(c, 0, f * fh), rows(c, (f + 1) * fh, c.h - (f + 1) * fh)]);
    editMeta((m) => ({ ...m, anim: count - 1 > 1 && m.anim ? afterDelete(m.anim, f) : null }));
    setFrame(Math.max(0, f - 1));
    commit();
  };
  const moveFrame = (by: -1 | 1) => {
    const c = cur.current;
    const to = f + by;
    if (!c || to < 0 || to >= count) return;
    const a = rows(c, f * fh, fh);
    const b = rows(c, to * fh, fh);
    const next = cloneImg(c);
    next.data.set(b, f * fh * c.w * 4);
    next.data.set(a, to * fh * c.w * 4);
    cur.current = next;
    editMeta((m) => ({ ...m, anim: m.anim && afterSwap(m.anim, f, to) }));
    setFrame(to);
    commit();
  };
  const setAnim = (p: Partial<NonNullable<Meta['anim']>>) => {
    editMeta((m) => ({ ...m, anim: m.anim && { ...m.anim, ...p } }));
    commit();
  };
  const anim = parseMeta(metaText()).anim;

  const clear = () => {
    const c = cur.current;
    if (!c) return;
    for (let y = area.y; y < area.y + area.h; y++) c.data.fill(0, y * c.w * 4, (y * c.w + c.w) * 4);
    commit();
  };

  // ---- a picture in place of the texture ----
  const base = orig ?? img;
  const baseFrame = base ? framesOf(base, animated) : { fh: 16, count: 1 };
  const openPicture = async (file: File) => {
    setError('');
    try {
      const bitmap = await createImageBitmap(file);
      const big = Math.max(bitmap.width, bitmap.height) > Math.max(base?.w ?? 16, baseFrame.fh) * 2;
      setReplace({ bitmap, scale: 1, smooth: big, fit: 'crop' });
    } catch {
      setError(t('That picture can’t be opened. Use a PNG, JPG, WebP or GIF.'));
    }
  };
  const replacement = (r: Replace): Img | null => {
    if (!base || !img) return null;
    const tw = base.w * r.scale;
    const th = baseFrame.fh * r.scale;
    const bw = r.bitmap.width;
    const bh = r.bitmap.height;
    let from = { x: 0, y: 0, w: bw, h: bh };
    if (r.fit === 'crop') {
      const k = Math.min(bw / tw, bh / th);
      from = { x: (bw - tw * k) / 2, y: (bh - th * k) / 2, w: tw * k, h: th * k };
    }
    return bitmapPixels(r.bitmap, tw, th, r.smooth, from);
  };
  const applyReplace = () => {
    if (!replace || !img || !base) return;
    const pic = replacement(replace);
    if (!pic) return;
    // The whole texture takes the new size (other frames scaled), then the picture goes in the shown frame.
    const W = base.w * replace.scale;
    const frameH = baseFrame.fh * replace.scale;
    const next = count > 1 ? scaleNearest(img, W, frameH * count) : scaleNearest(img, W, frameH);
    pasteArea(next, pic, 0, count > 1 ? f * frameH : 0);
    cur.current = next;
    replace.bitmap.close();
    setReplace(null);
    commit();
  };
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = preview.current;
    if (!c || !replace) return;
    const pic = replacement(replace);
    if (!pic) return;
    const z = Math.max(1, Math.floor(128 / Math.max(pic.w, pic.h)));
    c.width = pic.w * z;
    c.height = pic.h * z;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const tmp = new OffscreenCanvas(pic.w, pic.h);
    tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pic.data), pic.w, pic.h), 0, 0);
    g.drawImage(tmp, 0, 0, c.width, c.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replace]);

  const h = history.current;
  const used = img ? usedColors(img, area, 20) : [];
  const toolInfo = TOOLS.find((x) => x.id === tool)!;
  const changed = !!orig && !!img && (!sameImg(img, orig) || meta.current !== undefined);

  return (
    <Panel
      title={t('editor')}
      actions={
        <span className="rp-editor-actions">
          <button type="button" className="btn btn-sm" onClick={() => goto(-1)} disabled={h.index <= 0} title={t('Undo (Ctrl+Z)')}>
            {t('undo')}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => goto(1)} disabled={h.index >= h.list.length - 1} title={t('Redo (Ctrl+Y)')}>
            {t('redo')}
          </button>
        </span>
      }
    >
      <div className="rp-editor-head">
        <b>{title}</b>
        <span className="mono muted">{subtitle ?? path.replace(/^textures\//, '')}</span>
        {img && (
          <span className="mono muted">
            {img.w} × {fh} px{count > 1 ? ` · ${t('{n} frames', { n: count })}` : ''}
          </span>
        )}
        {changed && <span className="pill">{t('changed')}</span>}
      </div>
      {error && <p className="error-text">{error}</p>}

      <div className="rp-editor">
        <div className="rp-tools">
          <div className="sk-toolgrid rp-toolgrid" role="group" aria-label={t('Tool')}>
            {TOOLS.map((tt) => (
              <button key={tt.id} type="button" className="sk-tool" aria-pressed={tool === tt.id} title={`${tt.label} (${tt.key})`} onClick={() => setTool(tt.id)}>
                <ToolIcon tool={tt.id} />
                <span>{tt.label}</span>
              </button>
            ))}
          </div>
          <p className="note rp-toolhelp">
            <b>{toolInfo.label}</b> <kbd className="sk-kbd">{toolInfo.key}</kbd> {toolInfo.help}
          </p>
          {(tool === 'pencil' || tool === 'eraser' || tool === 'shade') && (
            <div className="opt-row">
              <span className="opt-label" id="rp-size">
                {t('Brush size')}
              </span>
              <Segmented labelledBy="rp-size" compact value={String(size)} onChange={(v) => setSize(Number(v))} options={['1', '2', '3', '4'].map((v) => ({ value: v, label: v }))} />
            </div>
          )}
          {tool === 'shade' && (
            <Segmented
              label={t('Shade')}
              value={shadeDir > 0 ? 'light' : 'dark'}
              onChange={(v) => setShadeDir(v === 'light' ? 1 : -1)}
              options={[
                { value: 'dark', label: t('darker') },
                { value: 'light', label: t('lighter') },
              ]}
            />
          )}
          <div className="field">
            <label htmlFor={colorId}>{t('Color')}</label>
            <div className="inline sk-color">
              <input id={colorId} type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              <span className="mono muted">{color}</span>
            </div>
          </div>
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <span className="field-label">{t('Opacity')}</span>
              <Help label={t('Opacity')} text={t('Less than 100 % paints see-through pixels, like glass or water. Most blocks need 100 %: the game draws them fully solid.')} />
            </span>
            <div className="range">
              <input type="range" min={0} max={255} value={alpha} aria-label={t('Opacity')} onChange={(e) => setAlpha(Number(e.target.value))} />
              <output>{fmtNum(Math.round((alpha / 255) * 100))} %</output>
            </div>
          </div>
          {used.length > 0 && (
            <div className="field">
              <span className="field-label">{t('In this texture')}</span>
              <div className="sk-swatches">
                {used.map((c) => (
                  <button key={c} type="button" className="sk-swatch" style={{ background: c }} aria-label={c} title={c} aria-pressed={c === color} onClick={() => setColor(c)} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rp-stage" ref={box}>
          <canvas
            ref={canvas}
            className={`rp-canvas${adjusting || peek ? ' locked' : ''}`}
            onPointerDown={down}
            onPointerMove={moveTo}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={() => setHover(null)}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={t('Texture, click or drag to paint')}
          />
          {count > 1 && anim && (
            <div className="rp-anim-bar" role="group" aria-label={t('Animation')}>
              <span className="rp-frames">
                <button type="button" className="btn btn-sm" onClick={() => setFrame((x) => (Math.min(x, count - 1) - 1 + count) % count)} aria-label={t('Previous frame')}>
                  ‹
                </button>
                <span className="mono">{t('frame {n} of {all}', { n: f + 1, all: count })}</span>
                <button type="button" className="btn btn-sm" onClick={() => setFrame((x) => (Math.min(x, count - 1) + 1) % count)} aria-label={t('Next frame')}>
                  ›
                </button>
              </span>
              <span className="rp-frames">
                <button type="button" className="btn btn-sm" onClick={() => moveFrame(-1)} disabled={f === 0} title={t('Move this frame one earlier')}>
                  ←
                </button>
                <button type="button" className="btn btn-sm" onClick={duplicateFrame} title={t('Put a copy of this frame right after it')}>
                  {t('duplicate')}
                </button>
                <button type="button" className="btn btn-sm" onClick={deleteFrame} title={t('Delete this frame')}>
                  {t('delete')}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => moveFrame(1)} disabled={f === count - 1} title={t('Move this frame one later')}>
                  →
                </button>
              </span>
              <label className="rp-frames">
                <span>{t('each frame')}</span>
                <input className="input mono rp-ticks" type="number" min={1} max={200} value={anim.frametime} onChange={(e) => setAnim({ frametime: Math.max(1, Math.min(200, Math.round(Number(e.target.value)) || 1)) })} />
                <span className="muted">{t('ticks ({s} s)', { s: fmtNum(anim.frametime / 20, { maximumFractionDigits: 2 }) })}</span>
              </label>
              <label className="rp-frames">
                <input type="checkbox" checked={anim.interpolate} onChange={(e) => setAnim({ interpolate: e.target.checked })} />
                <span>{t('smooth blend between frames')}</span>
              </label>
              {anim.frames && (
                <p className="note rp-anim-note">
                  {t('This animation plays its frames in its own order (from the game), so moving a frame keeps how it plays.')}{' '}
                  <button type="button" className="link-btn" onClick={() => setAnim({ frames: null })}>
                    {t('play them in order instead')}
                  </button>
                </p>
              )}
            </div>
          )}
          <div className="rp-stage-bar">
            {count === 1 && img && img.w === img.h && (
              <button type="button" className="btn btn-sm" onClick={duplicateFrame} title={t('Turn this texture into an animation of 2 frames, then change the second one')}>
                {t('animate')}
              </button>
            )}
            {orig && (
              <button
                type="button"
                className="btn btn-sm"
                onPointerDown={() => setPeek(true)}
                onPointerUp={() => setPeek(false)}
                onPointerLeave={() => setPeek(false)}
                onKeyDown={(e) => e.key === ' ' && setPeek(true)}
                onKeyUp={() => setPeek(false)}
                title={t('Hold to see the game’s own texture')}
              >
                {t('hold: original')}
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={clear}>
              {count > 1 ? t('clear frame') : t('clear')}
            </button>
            {orig && (
              <button type="button" className="btn btn-sm" onClick={toOriginal} disabled={!changed}>
                {t('back to original')}
              </button>
            )}
          </div>
          {adjusting && <p className="note">{t('Painting is paused while the color changes aren’t applied.')}</p>}
        </div>
      </div>

      <div className="rp-editor-more">
        <section className="rp-sub" aria-labelledby="rp-pic">
          <h3 id="rp-pic" className="rp-sub-title">
            {t('Your own picture')}
          </h3>
          {!replace ? (
            <>
              <p className="note">{t('Put any picture in place of this texture: it’s scaled to fit. A photo becomes pixel art.')}</p>
              <button type="button" className="btn" onClick={() => replaceInput.current?.click()}>
                {t('Choose picture')}
              </button>
            </>
          ) : (
            <div className="rp-replace">
              <canvas ref={preview} className="rp-replace-preview" aria-label={t('How it will look')} />
              <div className="rp-replace-opts">
                <div className="opt-row">
                  <span className="opt-label" id="rp-res">
                    {t('Resolution')}
                  </span>
                  <Segmented
                    labelledBy="rp-res"
                    compact
                    value={String(replace.scale)}
                    onChange={(v) => setReplace({ ...replace, scale: Number(v) })}
                    options={[1, 2, 4, 8].map((s) => ({ value: String(s), label: `${(base?.w ?? 16) * s}` }))}
                  />
                  <Help label={t('Resolution')} text={t('The game’s textures are 16 px. More pixels (HD) show more detail; the game scales every block to the same size anyway.')} />
                </div>
                <div className="opt-row">
                  <span className="opt-label" id="rp-smooth">
                    {t('Scaling')}
                  </span>
                  <Segmented
                    labelledBy="rp-smooth"
                    value={replace.smooth ? 'smooth' : 'sharp'}
                    onChange={(v) => setReplace({ ...replace, smooth: v === 'smooth' })}
                    options={[
                      { value: 'smooth', label: t('smooth (photos)') },
                      { value: 'sharp', label: t('sharp (pixel art)') },
                    ]}
                  />
                </div>
                <div className="opt-row">
                  <span className="opt-label" id="rp-fit">
                    {t('Shape')}
                  </span>
                  <Segmented
                    labelledBy="rp-fit"
                    value={replace.fit}
                    onChange={(v) => setReplace({ ...replace, fit: v })}
                    options={[
                      { value: 'crop', label: t('cut to fit') },
                      { value: 'stretch', label: t('stretch') },
                    ]}
                  />
                </div>
                <div className="opt-row">
                  <button type="button" className="btn btn-primary" onClick={applyReplace}>
                    {count > 1 ? t('Use in this frame') : t('Use picture')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      replace.bitmap.close();
                      setReplace(null);
                    }}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}
          <input
            ref={replaceInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) openPicture(file);
            }}
          />
        </section>

        <section className="rp-sub" aria-labelledby="rp-colors">
          <h3 id="rp-colors" className="rp-sub-title">
            {t('Colors')}
          </h3>
          <AdjustControls value={adjust} onChange={setAdjust} />
          <div className="opt-row">
            <button type="button" className="btn btn-primary" onClick={applyAdjust} disabled={!adjusting}>
              {t('Apply')}
            </button>
            <button type="button" className="btn" onClick={() => setAdjust(NO_ADJUST)} disabled={!adjusting}>
              {t('reset')}
            </button>
          </div>
        </section>
      </div>
    </Panel>
  );
}
