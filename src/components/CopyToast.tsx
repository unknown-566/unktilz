import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n-core';

type Toast = { id: number; x: number; y: number };

/**
 * A small "copied" bubble whenever something selected on the page is copied (Ctrl+C, the right-click
 * menu): it pops up over the selection and floats away. One page-wide listener, mounted in App.
 * Copy buttons say "copied" themselves, so they don't show it.
 */
export function CopyToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let timer = 0;
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    const onCopy = () => {
      const place = where(pointer.current);
      if (!place) return;
      clearTimeout(timer);
      setToast({ id: Date.now(), ...place });
      timer = window.setTimeout(() => setToast(null), 1100);
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('pointerdown', onMove, true);
    document.addEventListener('pointerup', onMove, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('pointerdown', onMove, true);
      document.removeEventListener('pointerup', onMove, true);
    };
  }, []);

  if (!toast) return null;
  return (
    <div key={toast.id} className="copy-toast" role="status" style={{ left: toast.x, top: toast.y }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      {t('copied')}
    </div>
  );
}

/** Where to show the bubble: over the selected text, or over the text box the selection is in. */
function where(pointer: { x: number; y: number }) {
  const el = document.activeElement;
  // In a text box the selection has no rectangle of its own; nothing selected there copies nothing.
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.selectionStart === el.selectionEnd) return null;
    const r = el.getBoundingClientRect();
    const inside = pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
    return clamp(inside ? pointer.x : r.left + Math.min(r.width / 2, 120), inside ? pointer.y - 14 : r.top);
  }
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0).getBoundingClientRect();
  if (!r.width && !r.height) return clamp(pointer.x, pointer.y - 14);
  return clamp(r.left + r.width / 2, r.top);
}

const clamp = (x: number, y: number) => ({ x: Math.max(60, Math.min(window.innerWidth - 60, x)), y: Math.max(44, y) });
