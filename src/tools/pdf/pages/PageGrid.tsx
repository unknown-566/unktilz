import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { GridItem } from './model';
import { useWantWhenVisible, type Thumbs } from './thumbs';
import { t } from '../../../lib/i18n-core';

type Props = {
  items: GridItem[];
  thumbs: Thumbs;
  selected: Set<string>;
  onSelect: (keys: Set<string>) => void;
  /** Pages can be dragged to a new place (Organize). `to` = the position they land before. */
  onMove?: (keys: string[], to: number) => void;
  /** Buttons on a page (shown when the mouse is over it). */
  actions?: (item: GridItem, i: number) => ReactNode;
  /** The text under a page. */
  caption: (item: GridItem, i: number) => ReactNode;
  /** Something after a page in the row (Split's scissors). */
  after?: (item: GridItem, i: number) => ReactNode;
  /** A colour for the page's frame (Split's parts). */
  tone?: (item: GridItem, i: number) => string | undefined;
};

/** One page: its picture (asked for when it scrolls into view), turned as it will be. */
function Card({ item, thumbs, ...p }: { item: GridItem; thumbs: Thumbs; i: number; selected: boolean; drop: 'before' | 'after' | null; tone?: string; actions?: ReactNode; caption: ReactNode; dragging: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const thumb = item.blank ? undefined : thumbs.get(item.src, item.index);
  const want = useCallback(() => thumbs.want(item.src, item.index), [thumbs, item.src, item.index]);
  useWantWhenVisible(ref, want, !item.blank && !thumb);
  const [w, h] = item.blank ?? (thumb ? [thumb.w, thumb.h] : [595, 842]);
  const turned = item.rotate % 180 !== 0;
  // The page's shape as it will be (a sideways turn swaps its sides), as big as fits the square.
  const shown = turned ? h / w : w / h;
  // The picture is drawn upright and turned in the middle of that shape.
  const img = turned ? { width: `${(w / h) * 100}%`, height: `${(h / w) * 100}%` } : { width: '100%', height: '100%' };
  return (
    <div
      ref={ref}
      className={`pg-card${p.selected ? ' selected' : ''}${p.drop ? ` drop-${p.drop}` : ''}${p.dragging ? ' dragging' : ''}`}
      data-grid-i={p.i}
      style={p.tone ? { borderColor: p.tone, boxShadow: `inset 0 0 0 1px ${p.tone}` } : undefined}
      aria-selected={p.selected}
      role="option"
    >
      <div className="pg-thumb">
        <div className={`pg-paper${item.blank ? ' blank' : ''}`} style={{ aspectRatio: String(shown), ...(shown >= 1 ? { width: '100%' } : { height: '100%' }) }}>
          {thumb?.url && <img src={thumb.url} alt="" draggable={false} style={{ ...img, transform: `translate(-50%, -50%) rotate(${item.rotate}deg)` }} />}
          {!thumb && !item.blank && <span className="pg-wait" aria-hidden="true" />}
        </div>
        {p.actions && <div className="pg-actions">{p.actions}</div>}
      </div>
      <div className="pg-caption">{p.caption}</div>
    </div>
  );
}

/**
 * Pages as a grid of pictures. Click picks a page (Ctrl adds or removes one, Shift picks a run);
 * with `onMove`, dragging moves the picked pages (or the one under the mouse).
 */
export function PageGrid({ items, thumbs, selected, onSelect, onMove, actions, caption, after, tone }: Props) {
  const anchor = useRef<number | null>(null);
  const [drag, setDrag] = useState<{ keys: string[]; x: number; y: number; to: number | null } | null>(null);
  /** The press under way (a ref: the button can come up before React shows the drag). */
  const press = useRef<{ i: number; x: number; y: number; id: number; keys: string[] | null } | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const click = (i: number, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    const key = items[i].key;
    if (e.shiftKey && anchor.current !== null) {
      const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)];
      const next = new Set(e.ctrlKey || e.metaKey ? selected : []);
      for (let j = a; j <= b; j++) next.add(items[j].key);
      onSelect(next);
      return;
    }
    anchor.current = i;
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onSelect(next);
    } else onSelect(selected.size === 1 && selected.has(key) ? new Set() : new Set([key]));
  };

  /** Where pages dropped at (x, y) land: before the page under the mouse, or after it (its right half). */
  const dropAt = (x: number, y: number): number | null => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-grid-i]');
    if (!el || !grid.current?.contains(el)) return null;
    const i = Number(el.dataset.gridI);
    const r = el.getBoundingClientRect();
    return x > r.left + r.width / 2 ? i + 1 : i;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, a')) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-grid-i]');
    if (!el) {
      onSelect(new Set());
      return;
    }
    // (No text gets selected while dragging.)
    e.preventDefault();
    press.current = { i: Number(el.dataset.gridI), x: e.clientX, y: e.clientY, id: e.pointerId, keys: null };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    if (!(e.buttons & 1)) {
      press.current = null;
      setDrag(null);
      return;
    }
    if (!onMove) return;
    if (!p.keys && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
    if (!p.keys) {
      const key = items[p.i].key;
      // Dragging a picked page moves all the picked ones; any other page moves alone.
      p.keys = selected.has(key) ? items.filter((it) => selected.has(it.key)).map((it) => it.key) : [key];
      try {
        grid.current?.setPointerCapture(e.pointerId);
      } catch {
        /* not an active pointer */
      }
    }
    setDrag({ keys: p.keys, x: e.clientX, y: e.clientY, to: dropAt(e.clientX, e.clientY) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    setDrag(null);
    if (!p) return;
    if (!p.keys) click(p.i, e);
    else {
      const to = dropAt(e.clientX, e.clientY);
      if (to !== null) onMove?.(p.keys, to);
    }
  };

  // While dragging near the top or bottom of the window, the page scrolls.
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    const tick = () => {
      const edge = 70;
      const dy = drag.y < edge ? -(edge - drag.y) / 3 : drag.y > window.innerHeight - edge ? (drag.y - (window.innerHeight - edge)) / 3 : 0;
      if (dy) window.scrollBy(0, dy);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drag]);

  const moving = new Set(drag?.keys ?? []);
  const first = drag ? items.find((it) => it.key === drag.keys[0]) : undefined;
  const firstThumb = first && !first.blank ? thumbs.get(first.src, first.index) : undefined;
  return (
    <>
      <div
        ref={grid}
        className={`pg-grid${drag ? ' is-dragging' : ''}`}
        role="listbox"
        aria-multiselectable="true"
        aria-label={t('Pages')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null;
          setDrag(null);
        }}
      >
        {items.map((it, i) => (
          <div key={it.key} className="pg-slot">
            <Card
              item={it}
              thumbs={thumbs}
              i={i}
              selected={selected.has(it.key)}
              dragging={moving.has(it.key)}
              drop={drag?.to === i ? 'before' : drag?.to === i + 1 && i === items.length - 1 ? 'after' : null}
              tone={tone?.(it, i)}
              actions={actions?.(it, i)}
              caption={caption(it, i)}
            />
            {after?.(it, i)}
          </div>
        ))}
      </div>
      {drag && (
        <div className="pg-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }} aria-hidden="true">
          {firstThumb?.url ? <img src={firstThumb.url} alt="" /> : <span className="pg-ghost-blank" />}
          {drag.keys.length > 1 && <b>{drag.keys.length}</b>}
        </div>
      )}
    </>
  );
}
