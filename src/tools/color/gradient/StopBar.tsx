import { useRef } from 'react';
import { colorAt, gradientValue, MAX_STOPS, stop, stopColor, type Grad, type Stop } from '../../../lib/gradient';
import { t } from '../../../lib/i18n-core';

const clampPos = (n: number) => Math.min(100, Math.max(0, Math.round(n * 10) / 10));

/**
 * The gradient as a strip with a handle under it for each color. Drag a handle to move it, click the
 * strip to add a color there; with a handle focused, arrows move it (Shift: by 10) and Delete removes it.
 */
export function StopBar({ grad, selected, onSelect, onStops }: { grad: Grad; selected: number; onSelect: (id: number) => void; onStops: (stops: Stop[]) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const flat: Grad = { ...grad, kind: 'linear', angle: 90 };

  const posAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return clampPos(((clientX - r.left) / r.width) * 100);
  };
  const move = (id: number, pos: number) => onStops(grad.stops.map((s) => (s.id === id ? { ...s, pos: clampPos(pos) } : s)));
  const remove = (id: number) => {
    if (grad.stops.length <= 2) return;
    const rest = grad.stops.filter((s) => s.id !== id);
    onStops(rest);
    onSelect(rest[0].id);
  };

  return (
    <div className="gr-stops">
      <div
        ref={bar}
        className="gr-bar"
        title={grad.stops.length < MAX_STOPS ? t('Click to add a color here') : undefined}
        onPointerDown={(e) => {
          if (e.button !== 0 || grad.stops.length >= MAX_STOPS) return;
          const pos = posAt(e.clientX);
          const c = colorAt(grad, pos);
          const s = stop(c.color, pos, Math.round(c.alpha * 100) / 100);
          onStops([...grad.stops, s]);
          onSelect(s.id);
        }}
      >
        <span style={{ backgroundImage: gradientValue(flat) }} />
      </div>
      <div className="gr-handles">
        {grad.stops.map((s) => (
          <button
            key={s.id}
            type="button"
            className="gr-handle"
            aria-pressed={s.id === selected}
            aria-label={t('Color {hex} at {pos} %', { hex: stopColor(s), pos: s.pos })}
            style={{ left: `${s.pos}%` }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = s.id;
              onSelect(s.id);
            }}
            onPointerMove={(e) => drag.current === s.id && move(s.id, posAt(e.clientX))}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onFocus={() => onSelect(s.id)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 1;
              if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') move(s.id, s.pos - step);
              else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') move(s.id, s.pos + step);
              else if (e.key === 'Delete' || e.key === 'Backspace') remove(s.id);
              else return;
              e.preventDefault();
            }}
          >
            <span style={{ background: stopColor(s) }} />
          </button>
        ))}
      </div>
    </div>
  );
}
