import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { fmtNum, t } from '../../../lib/i18n-core';

const GAP = 0.1;
const round = (tt: number) => Math.round(tt * 10) / 10;

/**
 * When a layer shows, as a bar over the whole GIF with two handles (drag the middle to move both).
 * `null` means from the very start / until the very end, so it keeps fitting when the GIF gets longer.
 */
export function ShowRange({
  duration,
  from,
  to,
  onChange,
  now,
}: {
  duration: number;
  from: number | null;
  to: number | null;
  onChange: (from: number | null, to: number | null) => void;
  /** Where the preview is playing, in seconds: shown as a thin line on the bar. */
  now?: () => number;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<{ what: 'from' | 'to' | 'both'; x0: number; a0: number; b0: number } | null>(null);
  const head = useRef<HTMLDivElement>(null);
  // Moved directly (not through React) ten times a second, so the rest doesn't redraw.
  useEffect(() => {
    if (!now || duration <= 0) return;
    const id = window.setInterval(() => {
      if (head.current) head.current.style.left = `${Math.min(100, (now() / duration) * 100)}%`;
    }, 100);
    return () => clearInterval(id);
  }, [now, duration]);

  if (duration <= 0) return <p className="note">{t('Add a video or photos first.')}</p>;

  const a = Math.min(from ?? 0, duration - GAP);
  const b = Math.max(Math.min(to ?? duration, duration), a + GAP);
  const pct = (tt: number) => `${(tt / duration) * 100}%`;

  const set = (na: number, nb: number, what: 'from' | 'to' | 'both') => {
    if (what === 'both') {
      const len = nb - na;
      na = Math.max(0, Math.min(duration - len, na));
      nb = na + len;
    } else if (what === 'from') na = Math.max(0, Math.min(nb - GAP, na));
    else nb = Math.min(duration, Math.max(na + GAP, nb));
    na = round(na);
    nb = round(nb);
    // At the very ends it means "from the start" / "until the end", whatever the length.
    onChange(na <= 0.05 ? null : na, nb >= duration - 0.05 ? null : nb);
  };

  const down = (what: 'from' | 'to' | 'both') => (ev: PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    try {
      (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    } catch {
      /* synthetic pointers can't be captured */
    }
    drag.current = { what, x0: ev.clientX, a0: a, b0: b };
  };
  const move = (ev: PointerEvent) => {
    const d = drag.current;
    const el = bar.current;
    if (!d || !el) return;
    const dt = ((ev.clientX - d.x0) / el.clientWidth) * duration;
    set(d.what === 'to' ? d.a0 : d.a0 + dt, d.what === 'from' ? d.b0 : d.b0 + dt, d.what);
  };
  const up = () => (drag.current = null);
  // A click on the bar moves the nearer handle there.
  const jump = (ev: PointerEvent) => {
    const el = bar.current;
    if (!el || drag.current) return;
    const tt = ((ev.clientX - el.getBoundingClientRect().left) / el.clientWidth) * duration;
    if (Math.abs(tt - a) < Math.abs(tt - b)) set(tt, b, 'from');
    else set(a, tt, 'to');
  };
  const keys = (what: 'from' | 'to') => (e: KeyboardEvent) => {
    const step = (e.shiftKey ? 1 : GAP) * (e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0);
    if (!step) return;
    e.preventDefault();
    if (what === 'from') set(a + step, b, 'from');
    else set(a, b + step, 'to');
  };
  const whole = from === null && to === null;

  return (
    <div className="gm-show">
      <div ref={bar} className="gm-show-bar" onPointerDown={jump} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {now && <div ref={head} className="gm-show-now" aria-hidden="true" />}
        <div className="gm-show-fill" style={{ left: pct(a), width: pct(b - a) }} onPointerDown={down('both')} title={t('Drag to move when it shows')} />
        {[
          ['from', a, t('Shows from')],
          ['to', b, t('Shows until')],
        ].map(([what, at, label]) => (
          <div
            key={what as string}
            className="gm-show-handle"
            style={{ left: pct(at as number) }}
            onPointerDown={down(what as 'from' | 'to')}
            onKeyDown={keys(what as 'from' | 'to')}
            role="slider"
            tabIndex={0}
            aria-label={label as string}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={at as number}
            aria-valuetext={t('{s} seconds', { s: fmtNum(at as number, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}
          />
        ))}
      </div>
      <div className="gm-show-times mono">
        <span>0 s</span>
        <span className={whole ? 'muted' : ''}>
          {whole ? t('the whole GIF') : `${a.toFixed(1)} s → ${b.toFixed(1)} s`}
          {!whole && (
            <button type="button" className="btn btn-sm gm-show-reset" onClick={() => onChange(null, null)}>
              {t('whole GIF')}
            </button>
          )}
        </span>
        <span>{duration.toFixed(1)} s</span>
      </div>
    </div>
  );
}
