import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Peaks } from '../../../lib/audio/peaks';
import { fmtTime, type CutMode } from './cutArgs';
import { t } from '../../../lib/i18n-core';

type Props = {
  peaks: Peaks;
  start: number;
  end: number;
  onSelect: (start: number, end: number) => void;
  /** A click without dragging: move the playhead there. */
  onSeek: (time: number) => void;
  /** Where the playhead is now (read every frame while playing). */
  now: () => number;
  playing: boolean;
  mode?: CutMode;
  fadeIn?: number;
  fadeOut?: number;
  height?: number;
};

type View = { from: number; span: number };
type Drag = { kind: 'start' | 'end' } | { kind: 'new'; anchor: number; x0: number; moved: boolean } | null;

const RULER = 18;
const GRAB = 7;
const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/**
 * A sound's wave with a picked part: drag its edges, or drag across the wave for a new part; a
 * click moves the playhead. Ctrl + wheel zooms where the mouse is, Shift + wheel moves sideways.
 */
export function Waveform({ peaks, start, end, onSelect, onSeek, now, playing, mode = 'keep', fadeIn = 0, fadeOut = 0, height = 160 }: Props) {
  const dur = peaks.duration;
  const minSpan = Math.min(dur, Math.max(0.05, 200 / peaks.rate));
  const [view, setView] = useState<View>({ from: 0, span: dur });
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<'edge' | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);

  // A new sound starts fully zoomed out.
  useEffect(() => setView({ from: 0, span: dur }), [peaks, dur]);

  const clampView = useCallback((v: View): View => {
    const span = Math.min(dur, Math.max(minSpan, v.span));
    return { span, from: Math.min(Math.max(0, v.from), dur - span) };
  }, [dur, minSpan]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const xOf = (time: number) => ((time - view.from) / view.span) * width;

  // ---- drawing ----
  useEffect(() => {
    const c = canvas.current;
    if (!c || !width) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const css = getComputedStyle(c);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const x = (time: number) => ((time - view.from) / view.span) * width;
    const waveTop = RULER + 4;
    const mid = waveTop + (height - waveTop) / 2;
    const amp = ((height - waveTop) / 2 - 2) / Math.max(peaks.top, 0.02);

    // The picked part.
    const sx = x(start);
    const ex = x(end);
    ctx.fillStyle = v(mode === 'keep' ? '--accent' : '--danger');
    ctx.globalAlpha = 0.13;
    ctx.fillRect(sx, waveTop, ex - sx, height - waveTop);
    ctx.globalAlpha = 1;

    // Fades, in the result's own time, so the wave shows how they will sound.
    const length = mode === 'keep' ? end - start : dur - (end - start);
    const gain = (time: number) => {
      let rt: number;
      if (mode === 'keep') {
        if (time < start || time > end) return 1;
        rt = time - start;
      } else {
        if (time > start && time < end) return 1;
        rt = time <= start ? time : time - (end - start);
      }
      let g = 1;
      if (fadeIn > 0) g = Math.min(g, rt / fadeIn);
      if (fadeOut > 0) g = Math.min(g, (length - rt) / fadeOut);
      return Math.max(0, g);
    };

    // The wave, one column per pixel, in two colors: what stays and what goes.
    const kept: number[] = [];
    const gone: number[] = [];
    for (let px = 0; px < width; px++) {
      const t0 = view.from + (px / width) * view.span;
      const t1 = view.from + ((px + 1) / width) * view.span;
      if (t0 >= dur) break;
      let i0 = Math.floor(t0 * peaks.rate);
      let i1 = Math.floor(t1 * peaks.rate);
      if (i1 <= i0) i1 = i0 + 1;
      i0 = Math.min(i0, peaks.min.length - 1);
      i1 = Math.min(i1, peaks.min.length);
      let lo = 0;
      let hi = 0;
      for (let i = i0; i < i1; i++) {
        if (peaks.min[i] < lo) lo = peaks.min[i];
        if (peaks.max[i] > hi) hi = peaks.max[i];
      }
      const tm = (t0 + t1) / 2;
      const g = gain(tm);
      const inside = tm >= start && tm <= end;
      (inside === (mode === 'keep') ? kept : gone).push(px, mid - hi * g * amp, Math.max(1, (hi - lo) * g * amp));
    }
    const bars = (list: number[], color: string, alpha: number) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (let i = 0; i < list.length; i += 3) ctx.rect(list[i], list[i + 1], 1, list[i + 2]);
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    bars(gone, v('--muted'), 0.45);
    bars(kept, v('--accent-text'), 1);

    // Centre line and the ruler.
    ctx.fillStyle = v('--line');
    ctx.fillRect(0, mid, width, 1);
    ctx.fillRect(0, RULER, width, 1);
    const step = STEPS.find((s) => (s / view.span) * width >= 80) ?? 3600;
    const digits = step < 0.1 ? 2 : step < 1 ? 1 : 0;
    ctx.font = `10px ${v('--mono')}`;
    ctx.textBaseline = 'top';
    for (let tm = Math.ceil(view.from / step) * step; tm <= view.from + view.span; tm += step) {
      const px = Math.round(x(tm));
      ctx.fillStyle = v('--line');
      ctx.fillRect(px, RULER - 5, 1, 5);
      ctx.fillStyle = v('--muted');
      ctx.fillText(fmtTime(tm, digits), px + 3, 3);
    }

    // The edges of the part, with a tab to grab.
    ctx.fillStyle = v('--fg');
    for (const ex2 of [sx, ex]) {
      if (ex2 < -GRAB || ex2 > width + GRAB) continue;
      ctx.fillRect(Math.round(ex2) - 1, waveTop, 2, height - waveTop);
      ctx.fillRect(Math.round(ex2) - 4, waveTop, 8, 12);
    }
  }, [peaks, dur, view, width, height, start, end, mode, fadeIn, fadeOut]);

  // ---- the playhead, moved every frame while playing (no re-render) ----
  const placeHead = useCallback(() => {
    const el = head.current;
    if (!el || !width) return;
    const px = ((now() - view.from) / view.span) * width;
    el.style.transform = `translateX(${px}px)`;
    el.style.display = px < 0 || px > width ? 'none' : '';
  }, [now, view, width]);

  useEffect(() => {
    placeHead();
    if (!playing) return;
    let id = 0;
    const tick = () => {
      placeHead();
      // Zoomed in: the view follows the playhead.
      const tm = now();
      if (view.span < dur && (tm > view.from + view.span || tm < view.from)) setView((cur) => clampView({ from: tm - cur.span * 0.05, span: cur.span }));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, placeHead, now, view, dur, clampView]);

  // ---- mouse ----
  const timeAt = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    return Math.min(dur, Math.max(0, view.from + ((clientX - r.left) / r.width) * view.span));
  };
  const edgeAt = (clientX: number): 'start' | 'end' | null => {
    const r = box.current!.getBoundingClientRect();
    const px = clientX - r.left;
    const ds = Math.abs(px - xOf(start));
    const de = Math.abs(px - xOf(end));
    if (Math.min(ds, de) > GRAB) return null;
    return ds < de || (ds === de && px < xOf(start)) ? 'start' : 'end';
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const edge = edgeAt(e.clientX);
    drag.current = edge ? { kind: edge } : { kind: 'new', anchor: timeAt(e.clientX), x0: e.clientX, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      setHover(edgeAt(e.clientX) ? 'edge' : null);
      return;
    }
    const tm = timeAt(e.clientX);
    if (d.kind === 'new') {
      if (!d.moved && Math.abs(e.clientX - d.x0) < 4) return;
      d.moved = true;
      onSelect(Math.min(d.anchor, tm), Math.max(d.anchor, tm));
      return;
    }
    // Dragging one edge past the other swaps which one is held.
    const other = d.kind === 'start' ? end : start;
    if ((d.kind === 'start' && tm > other) || (d.kind === 'end' && tm < other)) drag.current = { kind: d.kind === 'start' ? 'end' : 'start' };
    onSelect(Math.min(tm, other), Math.max(tm, other));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'new' && !d.moved) {
      onSeek(timeAt(e.clientX));
      // The playhead moves now, even when nothing else re-renders.
      requestAnimationFrame(placeHead);
    }
  };

  // Wheel: needs a non-passive listener to keep the page from scrolling while zooming.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const r = el.getBoundingClientRect();
      const at = (e.clientX - r.left) / r.width;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setView((v) => {
          const span = Math.min(dur, Math.max(minSpan, v.span * Math.exp(e.deltaY * 0.0025)));
          return clampView({ from: v.from + at * v.span - at * span, span });
        });
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const delta = e.shiftKey ? e.deltaY || e.deltaX : e.deltaX;
        setView((v) => clampView({ from: v.from + (delta / r.width) * v.span, span: v.span }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [dur, minSpan, clampView]);

  const zoom = (k: number) => setView((v) => clampView({ from: v.from + (v.span - v.span * k) / 2, span: v.span * k }));
  const zoomed = view.span < dur - 1e-6;

  return (
    <div className="wf">
      <div
        ref={box}
        className="wf-box"
        style={{ height, cursor: hover ? 'ew-resize' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => onSelect(0, dur)}
      >
        <canvas ref={canvas} style={{ width: '100%', height }} aria-label={t('Sound wave from {a} to {b}', { a: fmtTime(start), b: fmtTime(end) })} role="img" />
        <div ref={head} className="wf-head" />
      </div>
      <div className="wf-zoom">
        <button type="button" className="btn btn-sm mono" onClick={() => zoom(0.5)} disabled={view.span <= minSpan + 1e-6} title={t('Zoom in (Ctrl + wheel)')} aria-label={t('Zoom in')}>
          +
        </button>
        <button type="button" className="btn btn-sm mono" onClick={() => zoom(2)} disabled={!zoomed} title={t('Zoom out')} aria-label={t('Zoom out')}>
          −
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setView({ from: 0, span: dur })} disabled={!zoomed}>
          {t('whole')}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={end - start < 0.01}
          onClick={() => {
            const pad = (end - start) * 0.08;
            setView(clampView({ from: start - pad, span: end - start + 2 * pad }));
          }}
        >
          {t('zoom to the part')}
        </button>
        {zoomed && (
          <input
            className="wf-scroll"
            type="range"
            min={0}
            max={dur - view.span}
            step="any"
            value={view.from}
            aria-label={t('Move sideways')}
            onChange={(e) => setView((v) => clampView({ from: Number(e.target.value), span: v.span }))}
          />
        )}
      </div>
    </div>
  );
}
