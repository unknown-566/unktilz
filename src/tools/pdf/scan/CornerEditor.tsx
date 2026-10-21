import { useRef, useState } from 'react';
import { t, tx } from '../../../lib/i18n-core';

export type Pt = [number, number];
const WHOLE: Pt[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const NAMES = [tx('top left'), tx('top right'), tx('bottom right'), tx('bottom left')];

/**
 * The photo with the sheet's four corners on it. Drag a corner (or use the arrow keys on a focused
 * corner) to put it on the paper's corner; everything outside is cut away.
 */
export function CornerEditor({ src, w, h, quad, onChange }: { src: string; w: number; h: number; quad: Pt[] | null; onChange: (q: Pt[]) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const q = quad ?? WHOLE;

  const at = (e: { clientX: number; clientY: number }): Pt => {
    const r = box.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const move = (i: number, p: Pt) => onChange(q.map((c, j) => (j === i ? p : c)));

  return (
    // As wide as there's room for, but never taller than 60 % of the window.
    <div className="sc-editor" style={{ aspectRatio: `${w} / ${h}`, width: `min(100%, ${((60 * w) / h).toFixed(2)}vh)` }} ref={box}>
      <img src={src} alt={t('The photo')} draggable={false} />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {/* Everything outside the sheet is dimmed. */}
        <path className="sc-shade" fillRule="evenodd" d={`M0 0H1V1H0Z M${q.map((c) => c.join(' ')).join(' L')} Z`} />
        <polygon className="sc-line" points={q.map((c) => c.join(',')).join(' ')} />
      </svg>
      {q.map(([x, y], i) => (
        <button
          key={i}
          type="button"
          className={`sc-handle${dragging === i ? ' on' : ''}`}
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          aria-label={t('Corner {corner}: drag it onto the paper’s corner, or move it with the arrow keys', { corner: t(NAMES[i]) })}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            setDragging(i);
          }}
          onPointerMove={(e) => dragging === i && move(i, at(e))}
          onPointerUp={() => setDragging(null)}
          onPointerCancel={() => setDragging(null)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.02 : 0.004;
            const d: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            const v = d[e.key];
            if (!v) return;
            e.preventDefault();
            move(i, [Math.min(1, Math.max(0, x + v[0])), Math.min(1, Math.max(0, y + v[1]))]);
          }}
        />
      ))}
    </div>
  );
}
