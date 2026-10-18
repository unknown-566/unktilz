import { useRef, type PointerEvent } from 'react';
import { MAX_SECONDS } from './compose';

const MIN = 0.2;
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** The clip's thumbnails with two handles: where the GIF starts and ends. Drag the middle to move both. */
export function Timeline({ duration, start, end, thumbs, onChange }: { duration: number; start: number; end: number; thumbs: string[]; onChange: (start: number, end: number) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<{ what: 'start' | 'end' | 'both'; x0: number; s0: number; e0: number } | null>(null);
  const pct = (t: number) => `${(t / duration) * 100}%`;

  const set = (s: number, e: number, what: 'start' | 'end' | 'both') => {
    const len = Math.min(MAX_SECONDS, duration);
    if (what === 'both') {
      const d = e - s;
      s = Math.max(0, Math.min(duration - d, s));
      e = s + d;
    } else if (what === 'start') {
      s = Math.max(0, Math.min(e - MIN, s));
      if (e - s > len) e = s + len;
    } else {
      e = Math.min(duration, Math.max(s + MIN, e));
      if (e - s > len) s = e - len;
    }
    onChange(Math.round(s * 100) / 100, Math.round(e * 100) / 100);
  };

  const down = (what: 'start' | 'end' | 'both') => (ev: PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    try {
      (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    } catch {
      /* synthetic pointers can't be captured */
    }
    drag.current = { what, x0: ev.clientX, s0: start, e0: end };
  };
  const move = (ev: PointerEvent) => {
    const d = drag.current;
    const el = bar.current;
    if (!d || !el) return;
    const dt = ((ev.clientX - d.x0) / el.clientWidth) * duration;
    set(d.what === 'end' ? d.s0 : d.s0 + dt, d.what === 'start' ? d.e0 : d.e0 + dt, d.what);
  };
  const up = () => (drag.current = null);
  // A click on the strip moves the nearer handle there.
  const jump = (ev: PointerEvent) => {
    const el = bar.current;
    if (!el || drag.current) return;
    const t = ((ev.clientX - el.getBoundingClientRect().left) / el.clientWidth) * duration;
    if (Math.abs(t - start) < Math.abs(t - end)) set(t, end, 'start');
    else set(start, t, 'end');
  };

  return (
    <div className="gm-timeline">
      <div ref={bar} className="gm-strip" onPointerDown={jump} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="gm-thumbs" aria-hidden="true">
          {thumbs.map((t, i) => (
            <img key={i} src={t} alt="" draggable={false} />
          ))}
        </div>
        <div className="gm-shade" style={{ left: 0, width: pct(start) }} />
        <div className="gm-shade" style={{ left: pct(end), right: 0 }} />
        <div className="gm-range" style={{ left: pct(start), width: pct(end - start) }} onPointerDown={down('both')} title="Drag to move the whole clip" />
        <div
          className="gm-handle"
          style={{ left: pct(start) }}
          onPointerDown={down('start')}
          role="slider"
          tabIndex={0}
          aria-label="Start"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={start}
          aria-valuetext={fmt(start)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 1 : 0.1;
            if (e.key === 'ArrowLeft') set(start - step, end, 'start');
            else if (e.key === 'ArrowRight') set(start + step, end, 'start');
            else return;
            e.preventDefault();
          }}
        />
        <div
          className="gm-handle"
          style={{ left: pct(end) }}
          onPointerDown={down('end')}
          role="slider"
          tabIndex={0}
          aria-label="End"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={end}
          aria-valuetext={fmt(end)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 1 : 0.1;
            if (e.key === 'ArrowLeft') set(start, end - step, 'end');
            else if (e.key === 'ArrowRight') set(start, end + step, 'end');
            else return;
            e.preventDefault();
          }}
        />
      </div>
      <div className="gm-times mono">
        <label>
          start
          <input className="input mono gm-time" type="number" min={0} max={duration} step={0.1} value={start} onChange={(e) => set(Number(e.target.value) || 0, end, 'start')} />
        </label>
        <span className="muted">
          {(end - start).toFixed(1)} s of {fmt(duration)}
          {duration > MAX_SECONDS && ` · max ${MAX_SECONDS} s`}
        </span>
        <label>
          end
          <input className="input mono gm-time" type="number" min={0} max={duration} step={0.1} value={end} onChange={(e) => set(start, Number(e.target.value) || 0, 'end')} />
        </label>
      </div>
    </div>
  );
}
