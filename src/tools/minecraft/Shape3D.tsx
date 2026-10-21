import { useEffect, useRef } from 'react';
import { useTheme } from '../../lib/theme';
import { ShapeScene } from './shapeScene';
import type { Layers } from './shapeFaces';
import { t } from '../../lib/i18n-core';

/** The shape in 3D: drag to turn it, the buttons zoom. The layer being built is highlighted. */
export default function Shape3D({ layers, layer, height }: { layers: Layers; layer: number; height: number }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ShapeScene | null>(null);
  const [theme] = useTheme();

  useEffect(() => {
    const s = new ShapeScene(host.current!);
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
    const css = getComputedStyle(document.documentElement);
    scene.current?.setColors(css.getPropertyValue('--accent').trim(), css.getPropertyValue('--muted').trim());
  }, [theme]);

  useEffect(() => {
    scene.current?.setShape(layers);
  }, [layers]);

  useEffect(() => {
    scene.current?.setLayer(layer);
  }, [layer, layers]);

  // Dragging turns the shape.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    scene.current?.orbit(-(e.clientX - d.x) * 0.01, -(e.clientY - d.y) * 0.01);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <div className="shape3d" style={{ height }}>
      <div
        ref={host}
        className="shape3d-view"
        role="img"
        aria-label={t('3D view, layer {n} of {length} highlighted. Drag to turn it.', { n: layer + 1, length: layers.grids.length })}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      <div className="shape3d-tools">
        <button type="button" className="btn btn-sm" aria-label={t('Zoom in')} title={t('Zoom in')} onClick={() => scene.current?.zoom(1.25)}>
          +
        </button>
        <button type="button" className="btn btn-sm" aria-label={t('Zoom out')} title={t('Zoom out')} onClick={() => scene.current?.zoom(0.8)}>
          −
        </button>
        <button type="button" className="btn btn-sm" title={t('Back to the starting view')} onClick={() => scene.current?.reset()}>
          {t('reset')}
        </button>
      </div>
    </div>
  );
}
