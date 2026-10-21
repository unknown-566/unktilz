import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** A page's small picture and the page's size in points (with the PDF's own turn applied). */
export type Thumb = { url: string; w: number; h: number };

/** Long side of a page picture, in pixels (sharp on a 2× screen at the grid's size). */
const SIDE = 300;

/**
 * Draws page pictures for the page grids, one at a time and only for the pages someone asked for,
 * newest request first: the pages on screen come first and a 500-page PDF opens at once.
 */
export class Thumbs {
  private docs: PDFDocumentProxy[] = [];
  private done = new Map<string, Thumb>();
  private wanted: string[] = [];
  private running = false;
  private version = 0;
  private listeners = new Set<() => void>();
  private gone = false;

  setDocs(docs: PDFDocumentProxy[]) {
    this.docs = docs;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  snapshot = () => this.version;

  get(src: number, index: number) {
    return this.done.get(`${src}:${index}`);
  }

  /** Asks for a page's picture (again moves it to the front of the line). */
  want(src: number, index: number) {
    const key = `${src}:${index}`;
    if (this.done.has(key)) return;
    this.wanted = [key, ...this.wanted.filter((k) => k !== key)];
    void this.run();
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.wanted.length && !this.gone) {
        const key = this.wanted.shift()!;
        if (this.done.has(key)) continue;
        const [src, index] = key.split(':').map(Number);
        const doc = this.docs[src];
        if (!doc) continue;
        try {
          const page = await doc.getPage(index + 1);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: SIDE / Math.max(base.width, base.height) });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: ctx, viewport, intent: 'print' }).promise;
          page.cleanup();
          const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
          if (this.gone || !blob) return;
          this.done.set(key, { url: URL.createObjectURL(blob), w: base.width, h: base.height });
        } catch {
          // A broken page shows without a picture.
          this.done.set(key, { url: '', w: 595, h: 842 });
        }
        this.version++;
        this.listeners.forEach((fn) => fn());
      }
    } finally {
      this.running = false;
    }
  }

  /** In use again (React may stop and start a page's effects without leaving it). */
  open() {
    this.gone = false;
  }

  dispose() {
    this.gone = true;
    for (const t of this.done.values()) if (t.url) URL.revokeObjectURL(t.url);
    this.done.clear();
  }
}

/** One store for the life of a tool page. */
export function useThumbs() {
  const [store] = useState(() => new Thumbs());
  useEffect(() => {
    store.open();
    return () => store.dispose();
  }, [store]);
  useSyncExternalStore(store.subscribe, store.snapshot);
  return store;
}

/** Asks for the page's picture once its card scrolls into view. */
export function useWantWhenVisible(ref: RefObject<HTMLElement | null>, want: () => void, enabled: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) want();
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, want, enabled]);
}
