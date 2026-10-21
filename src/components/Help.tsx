import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../lib/i18n-core';

/**
 * A small "?" that shows an explanation while hovered or focused (a tap shows it on touch).
 * The box is portalled to <body> and kept inside the viewport, so panels never clip it.
 */
export function Help({ text, label }: { text: string; label: string }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, visible: false });

  // Measure after the box renders, then place it above the "?" (or below when there's no room).
  useLayoutEffect(() => {
    if (!open || !btn.current || !tip.current) return;
    const b = btn.current.getBoundingClientRect();
    const tt = tip.current.getBoundingClientRect();
    const gap = 8;
    const left = Math.min(window.innerWidth - tt.width - gap, Math.max(gap, b.left + b.width / 2 - tt.width / 2));
    const above = b.top - tt.height - gap;
    setPos({ left, top: above >= gap ? above : b.bottom + gap, visible: true });
  }, [open, text]);

  // A fixed box would float away from its "?" when the page scrolls, so close it instead.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const show = () => {
    setPos((p) => ({ ...p, visible: false }));
    setOpen(true);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="help"
        aria-label={t('What is {label}?', { label })}
        aria-describedby={id}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        // Inside a <label> a click would also focus the field; on touch, a tap opens and tapping elsewhere closes.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!open) show();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        ?
      </button>
      <span id={id} className="sr-only">
        {text}
      </span>
      {open &&
        createPortal(
          <div ref={tip} className="tooltip" aria-hidden="true" style={{ left: pos.left, top: pos.top, visibility: pos.visible ? 'visible' : 'hidden' }}>
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
