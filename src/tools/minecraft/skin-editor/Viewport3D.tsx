import { useEffect, useRef, type RefObject } from 'react';
import type { Layer, PartId } from '../../../lib/mc/skinLayout';
import { getPx } from '../../../lib/mc/skinOps';
import { useDoc, type SkinDoc } from './doc';
import { Stroke, capture, pickColor, type Settings } from './paint';
import { SkinScene, type Hit, type ViewName } from './scene';

type Props = {
  doc: SkinDoc;
  /** Main view paints; the small one only turns and switches docs on click. */
  interactive: boolean;
  settings?: RefObject<Settings>;
  layer: Layer;
  showOverlay: boolean;
  hidden: Set<PartId>;
  highlight: PartId[];
  /** Shows the line where mirrored painting flips sides. */
  mirror?: boolean;
  /** Pixel hovered in the 2D view, shown here too. */
  hoverPx?: [number, number] | null;
  onHover?: (px: [number, number] | null) => void;
  onPick?: (hex: string) => void;
  onMessage?: (msg: string) => void;
  onActivate?: () => void;
  /** Bump `n` to move the camera to a preset. */
  view?: { name: ViewName; n: number };
  label: string;
};

/** A dark frame shows up on light pixels, a white one on everything else. */
const darkCursor = (doc: SkinDoc, x: number, y: number) => {
  const [r, g, b, a] = getPx(doc.pixels, x, y);
  return a > 0 && 0.299 * r + 0.587 * g + 0.114 * b > 150;
};

export function Viewport3D(p: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SkinScene | null>(null);
  const props = useRef(p);
  props.current = p;
  const version = useDoc(p.doc);

  useEffect(() => {
    const s = new SkinScene(host.current!);
    scene.current = s;
    const ro = new ResizeObserver(() => s.render());
    ro.observe(host.current!);
    return () => {
      ro.disconnect();
      s.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.setSkin(p.doc.pixels, p.doc.model);
  }, [p.doc, version]);

  useEffect(() => {
    scene.current?.setDisplay(p.layer, p.showOverlay, p.hidden);
  }, [p.layer, p.showOverlay, p.hidden]);

  useEffect(() => {
    scene.current?.setHighlight(p.highlight);
  }, [p.highlight, p.doc.model]);

  useEffect(() => {
    if (p.view) scene.current?.view(p.view.name);
  }, [p.view]);

  useEffect(() => {
    scene.current?.setMirror(!!p.mirror);
  }, [p.mirror]);

  // A pixel hovered in the 2D view gets the same frame here, if it's on the shell being shown.
  useEffect(() => {
    const s = scene.current;
    if (!s || !p.interactive) return;
    if (!p.hoverPx) s.setCursor(null);
    else s.setCursorAt(p.doc.model, p.hoverPx[0], p.hoverPx[1], p.settings?.current.size ?? 1, darkCursor(p.doc, p.hoverPx[0], p.hoverPx[1]));
  }, [p.hoverPx, p.doc, p.interactive, p.settings]);

  useEffect(() => {
    const el = host.current!;
    let mode: 'none' | 'orbit' | 'paint' = 'none';
    let stroke: Stroke | null = null;
    let moved = 0;
    let last = { x: 0, y: 0 };
    const pick = (e: PointerEvent, how: 'paint' | 'look') => scene.current?.pick(e.clientX, e.clientY, how, props.current.doc.pixels) ?? null;
    const showCursor = (hit: Hit | null) => {
      const { doc, settings, onHover, interactive } = props.current;
      if (!interactive) return;
      scene.current?.setCursor(hit, settings?.current.size ?? 1, hit ? darkCursor(doc, hit.x, hit.y) : false);
      onHover?.(hit ? [hit.x, hit.y] : null);
    };

    const down = (e: PointerEvent) => {
      if (mode !== 'none') return;
      capture(el, e);
      moved = 0;
      last = { x: e.clientX, y: e.clientY };
      const { interactive, settings, onPick, doc } = props.current;
      const s = settings?.current;
      if (interactive && s && e.button === 0) {
        if (e.altKey || s.tool === 'picker') {
          const hit = pick(e, 'look');
          const hex = hit && pickColor(doc, hit.x, hit.y);
          if (hex) onPick?.(hex);
          mode = 'none';
          return;
        }
        if (s.tool !== 'select') {
          const hit = pick(e, 'paint');
          if (hit) {
            stroke = new Stroke(doc, s, { invert: e.shiftKey });
            stroke.at(hit.x, hit.y, 'same-face');
            mode = 'paint';
            return;
          }
        }
      }
      mode = 'orbit';
    };

    const move = (e: PointerEvent) => {
      const s = scene.current;
      if (!s) return;
      if (mode === 'orbit') {
        moved += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
        s.orbit(-(e.clientX - last.x) * 0.01, -(e.clientY - last.y) * 0.01);
        last = { x: e.clientX, y: e.clientY };
        return;
      }
      const hit = pick(e, 'paint');
      if (mode === 'paint' && hit) stroke?.at(hit.x, hit.y, 'same-face');
      showCursor(hit);
    };

    const up = () => {
      if (mode === 'paint' && stroke) {
        const msg = stroke.end();
        if (msg) props.current.onMessage?.(msg);
        stroke = null;
      }
      if (mode === 'orbit' && moved < 4 && !props.current.interactive) props.current.onActivate?.();
      mode = 'none';
    };

    const leave = () => {
      if (mode === 'none') showCursor(null);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      scene.current?.zoom(Math.exp(e.deltaY * 0.001));
    };
    const menu = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', menu);
    return () => {
      stroke?.cancel();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', menu);
    };
  }, []);

  return (
    <div
      ref={host}
      className={`sk-3d${p.interactive ? '' : ' sk-3d-mini'}`}
      role="img"
      aria-label={p.label}
      title={p.interactive ? undefined : 'Click to edit this skin'}
    />
  );
}
