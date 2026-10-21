import { useEffect, useRef, useState, type RefObject } from 'react';
import { SKIN, allRegions, texelAt, type Layer, type PartId, type Rect } from '../../../lib/mc/skinLayout';
import type { Clip } from '../../../lib/mc/skinOps';
import { useDoc, type SkinDoc } from './doc';
import { Stroke, capture, pickColor, type Settings } from './paint';
import { t } from '../../../lib/i18n-core';

export type Float = Clip & { x: number; y: number };

type Props = {
  doc: SkinDoc;
  settings: RefObject<Settings>;
  hoverPx: [number, number] | null;
  onHover: (px: [number, number] | null) => void;
  selection: Rect | null;
  onSelection: (r: Rect | null) => void;
  float: Float | null;
  onFloatMove: (x: number, y: number) => void;
  onFloatDrop: () => void;
  highlight: { part: PartId; layer: Layer }[];
  /** Marks the middle of the head and body, where mirrored painting flips sides. */
  mirror: boolean;
  onPick: (hex: string) => void;
  onMessage: (msg: string) => void;
};

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The flat 64×64 texture, zoomed. Paints with the same tools as the 3D view and does selections. */
export function TextureView(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const props = useRef(p);
  props.current = p;
  const version = useDoc(p.doc);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const ro = new ResizeObserver(() => setWidth(box.current?.clientWidth ?? 0));
    ro.observe(box.current!);
    return () => ro.disconnect();
  }, []);

  const zoom = Math.max(3, Math.min(10, Math.floor((width || box.current?.clientWidth || 320) / SKIN)));

  // Draw.
  useEffect(() => {
    const c = cv.current!;
    const z = zoom;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = SKIN * z * dpr;
    c.height = SKIN * z * dpr;
    c.style.width = `${SKIN * z}px`;
    c.style.height = `${SKIN * z}px`;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const { doc, selection, float, hoverPx, highlight, settings } = p;
    const model = doc.model;

    // Checkerboard shows see-through pixels; unused parts of the texture are hatched darker.
    for (let y = 0; y < SKIN; y++)
      for (let x = 0; x < SKIN; x++) {
        const used = !!texelAt(model, x, y);
        ctx.fillStyle = used ? ((x + y) % 2 ? '#2a2f37' : '#353b45') : '#14171c';
        ctx.fillRect(x * z, y * z, z, z);
      }
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = SKIN;
    tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(doc.pixels), SKIN, SKIN), 0, 0);
    ctx.drawImage(tmp, 0, 0, SKIN * z, SKIN * z);

    if (z >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < SKIN; i++) {
        ctx.moveTo(i * z + 0.5, 0);
        ctx.lineTo(i * z + 0.5, SKIN * z);
        ctx.moveTo(0, i * z + 0.5);
        ctx.lineTo(SKIN * z, i * z + 0.5);
      }
      ctx.stroke();
    }

    // Face outlines, so it's clear which pixels belong together.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    for (const r of allRegions(model)) ctx.strokeRect(r.rect.x * z + 0.5, r.rect.y * z + 0.5, r.rect.w * z - 1, r.rect.h * z - 1);

    const accent = css('--accent') || '#b6f24a';
    if (highlight.length) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      for (const r of allRegions(model))
        if (highlight.some((h) => h.part === r.part && h.layer === r.layer)) ctx.strokeRect(r.rect.x * z + 1, r.rect.y * z + 1, r.rect.w * z - 2, r.rect.h * z - 2);
    }

    if (p.mirror) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      for (const r of allRegions(model)) {
        if ((r.part !== 'head' && r.part !== 'body') || r.face === 'right' || r.face === 'left') continue;
        const x = (r.rect.x + r.rect.w / 2) * z;
        ctx.moveTo(x, r.rect.y * z);
        ctx.lineTo(x, (r.rect.y + r.rect.h) * z);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The pasted pixels are already in the doc as a live preview; just frame them.
    if (float) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(float.x * z, float.y * z, float.w * z, float.h * z);
    }
    if (selection) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(selection.x * z + 0.75, selection.y * z + 0.75, selection.w * z - 1.5, selection.h * z - 1.5);
    }
    ctx.setLineDash([]);
    if (hoverPx && !float) {
      const size = settings.current.tool === 'select' ? 1 : settings.current.size;
      const off = Math.floor((size - 1) / 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect((hoverPx[0] - off) * z + 0.75, (hoverPx[1] - off) * z + 0.75, size * z - 1.5, size * z - 1.5);
    }
  });

  // Pointer handling.
  useEffect(() => {
    const c = cv.current!;
    let stroke: Stroke | null = null;
    let sel: { x: number; y: number } | null = null;
    let drag: { dx: number; dy: number } | null = null;

    const pos = (e: PointerEvent): [number, number] => {
      const r = c.getBoundingClientRect();
      return [Math.floor(((e.clientX - r.left) / r.width) * SKIN), Math.floor(((e.clientY - r.top) / r.height) * SKIN)];
    };
    const clamp = (v: number) => Math.max(0, Math.min(SKIN - 1, v));
    const rectOf = (a: { x: number; y: number }, x: number, y: number): Rect => {
      const x0 = Math.min(a.x, clamp(x));
      const y0 = Math.min(a.y, clamp(y));
      return { x: x0, y: y0, w: Math.abs(clamp(x) - a.x) + 1, h: Math.abs(clamp(y) - a.y) + 1 };
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const [x, y] = pos(e);
      const { doc, settings, float, onPick, onSelection, onFloatDrop } = props.current;
      const s = settings.current;
      capture(c, e);
      if (float) {
        if (x >= float.x && y >= float.y && x < float.x + float.w && y < float.y + float.h) {
          drag = { dx: x - float.x, dy: y - float.y };
          return;
        }
        onFloatDrop();
        if (s.tool !== 'select') return;
      }
      if (e.altKey || s.tool === 'picker') {
        const hex = pickColor(doc, x, y);
        if (hex) onPick(hex);
        return;
      }
      if (s.tool === 'select') {
        sel = { x: clamp(x), y: clamp(y) };
        onSelection(rectOf(sel, x, y));
        return;
      }
      stroke = new Stroke(doc, s, { invert: e.shiftKey });
      stroke.at(x, y, 'always');
    };

    const move = (e: PointerEvent) => {
      const [x, y] = pos(e);
      const inside = x >= 0 && y >= 0 && x < SKIN && y < SKIN;
      props.current.onHover(inside ? [x, y] : null);
      if (drag) props.current.onFloatMove(x - drag.dx, y - drag.dy);
      else if (sel) props.current.onSelection(rectOf(sel, x, y));
      else if (stroke && inside) stroke.at(x, y, 'always');
    };

    const up = () => {
      if (stroke) {
        const msg = stroke.end();
        if (msg) props.current.onMessage(msg);
      }
      stroke = null;
      sel = null;
      drag = null;
    };

    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    const leave = () => props.current.onHover(null);
    c.addEventListener('pointerleave', leave);
    return () => {
      stroke?.cancel();
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('pointerleave', leave);
    };
  }, []);

  void version;
  return (
    <div ref={box} className="sk-2d">
      <canvas ref={cv} aria-label={t('Skin texture, 64 by 64 pixels')} role="img" />
    </div>
  );
}
