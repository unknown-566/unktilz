import { useEffect, useRef } from 'react';
import { useTheme } from '../../../lib/theme';
import { BlockScene } from './blockScene';
import type { BlockView } from './blockView';
import { t } from '../../../lib/i18n-core';

/** The block or area in 3D around you: drag to turn it, the buttons zoom. */
export default function Block3D({ view, height = 260 }: { view: BlockView | null; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BlockScene | null>(null);
  const [theme] = useTheme();

  useEffect(() => {
    const s = new BlockScene(host.current!);
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
    scene.current?.setView(view);
  }, [view]);

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

  const legend = !view
    ? t('Can\'t be drawn: the corners are given in different ways (exact, ~ and ^ mixed).')
    : [
        view.frame === 'abs' ? t('Exact coordinates: drawn on its own, without you.') : view.frame === 'local' ? t('^ turns with you: drawn as if you look along the arrow.') : t('You stand in the middle; ~ counts from your feet.'),
        view.look === 'clear' && t('Red: everything here becomes air.'),
        view.look === 'hollow' && t('Hollow: walls of the block, the dashed inside becomes air.'),
        view.look === 'outline' && t('Shell only: the dashed inside stays as it is.'),
        view.look === 'partial' && t('See-through: only some blocks here get replaced.'),
        view.pieces.length > 1 && t('Colored outlines: the {n} fill commands it\'s split into.', { n: view.pieces.length }),
      ]
        .filter(Boolean)
        .join(' ');

  return (
    <div className="sb-3d-wrap">
      <div className="shape3d" style={{ height }}>
        <div
          ref={host}
          className="shape3d-view"
          role="img"
          aria-label={t('3D view of the block or area. Drag to turn it.')}
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
      <p className="note">{legend}</p>
    </div>
  );
}
