/*
 * ClickSpark: adapted from React Bits by David Haz (https://reactbits.dev),
 * MIT + Commons Clause license (see THIRD_PARTY_NOTICES.md).
 *
 * Changed for this site: one layer for the whole page instead of a wrapper, only the "line" shape,
 * the theme's accent color, and sparks only on things you can click (links, buttons, cards, palette
 * rows), so clicking text or a tool's own canvas stays quiet. Nothing with reduced motion.
 */
import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

const COUNT = 7;
const SIZE = 9;
const RADIUS = 18;
const WIDTH = 1.6;
const DURATION = 420;
const RANDOMNESS = 0.25;
const MAX_BURSTS = 12;
/** What gets sparks. Text fields, sliders and canvases don't. */
const CLICKABLE = 'a[href], button:not(:disabled), [role="option"], [role="button"], summary';

type Spark = { angle: number; reach: number; scale: number; life: number };
type Burst = { x: number; y: number; start: number; sparks: Spark[]; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; ratio: number; left: number; top: number; color: string };

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function ClickSpark() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const bursts: Burst[] = [];
    let raf = 0;

    const remove = (b: Burst) => {
      b.canvas.remove();
      const i = bursts.indexOf(b);
      if (i >= 0) bursts.splice(i, 1);
    };

    const frame = (now: number) => {
      raf = 0;
      for (const b of [...bursts]) {
        const elapsed = now - b.start;
        const ctx = b.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, b.canvas.width, b.canvas.height);
        ctx.setTransform(b.ratio, 0, 0, b.ratio, -b.left * b.ratio, -b.top * b.ratio);
        ctx.strokeStyle = b.color;
        ctx.lineCap = 'round';
        let alive = false;
        for (const s of b.sparks) {
          const p = elapsed / (DURATION * s.life);
          if (p >= 1) continue;
          alive = true;
          const distance = RADIUS * s.reach * easeOut(p);
          const length = SIZE * s.scale * Math.pow(1 - p, 1.6);
          const cos = Math.cos(s.angle);
          const sin = Math.sin(s.angle);
          ctx.globalAlpha = 1 - smoothstep(0.55, 1, p);
          ctx.lineWidth = WIDTH * s.scale;
          ctx.beginPath();
          ctx.moveTo(b.x + cos * distance, b.y + sin * distance);
          ctx.lineTo(b.x + cos * (distance + Math.max(0.01, length)), b.y + sin * (distance + Math.max(0.01, length)));
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (!alive) remove(b);
      }
      if (bursts.length) raf = requestAnimationFrame(frame);
    };

    const spawn = (x: number, y: number) => {
      const color = getComputedStyle(document.documentElement).getPropertyValue('--accent-text').trim() || '#d4ff3f';
      const step = (Math.PI * 2) / COUNT;
      const offset = Math.random() * step;
      const sparks: Spark[] = Array.from({ length: COUNT }, (_, i) => ({
        angle: offset + step * i + (Math.random() - 0.5) * RANDOMNESS * step * 0.9,
        reach: 1 + (Math.random() - 0.5) * 0.7 * RANDOMNESS,
        scale: 1 + (Math.random() - 0.5) * 0.8 * RANDOMNESS,
        life: 1 + (Math.random() - 0.5) * 0.5 * RANDOMNESS,
      }));
      // Each burst draws on a small canvas around the click, not one canvas the size of the screen.
      const reach = RADIUS * 1.2 + SIZE * 1.2 + WIDTH * 2 + 6;
      const left = Math.max(x - reach, 0);
      const top = Math.max(y - reach, 0);
      const right = Math.min(x + reach, window.innerWidth);
      const bottom = Math.min(y + reach, window.innerHeight);
      if (right - left < 1 || bottom - top < 1) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil((right - left) * ratio);
      canvas.height = Math.ceil((bottom - top) * ratio);
      Object.assign(canvas.style, { position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      layer.appendChild(canvas);
      bursts.push({ x, y, start: performance.now(), sparks, canvas, ctx, ratio, left, top, color });
      while (bursts.length > MAX_BURSTS) remove(bursts[0]);
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || prefersReducedMotion()) return;
      if (!(e.target instanceof Element) || !e.target.closest(CLICKABLE)) return;
      spawn(e.clientX, e.clientY);
    };
    // Capture, so a click that opens a dialog or changes the page still sparks.
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDown, true);
      for (const b of [...bursts]) remove(b);
    };
  }, []);

  return <div ref={layerRef} className="click-spark" aria-hidden="true" />;
}
