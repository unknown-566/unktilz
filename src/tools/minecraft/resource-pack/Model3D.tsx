import { useEffect, useRef, type PointerEvent } from 'react';
import type { Model } from '../../../lib/mc/pack/models';
import { ModelScene, type TexSource } from './modelScene';
import { t } from '../../../lib/i18n-core';

/**
 * The open texture on its block or item in 3D (three.js loads with this). `version` changes when the
 * pixels do; `modelKey` when it's another model, which resets the view.
 */
export default function Model3D({ model, modelKey, tex, tintOf, version, height = 200 }: { model: Model | null; modelKey: string; tex: TexSource; tintOf: (path: string) => string | undefined; version: number; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ModelScene | null>(null);
  const lastKey = useRef('');

  useEffect(() => {
    const s = new ModelScene(host.current!);
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
    scene.current?.setModel(model, tex, tintOf, lastKey.current === modelKey);
    lastKey.current = modelKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, modelKey, version, tex]);

  const drag = useRef<{ x: number; y: number } | null>(null);
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    scene.current?.orbit(-(e.clientX - d.x) * 0.01, -(e.clientY - d.y) * 0.01);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const up = () => {
    drag.current = null;
  };

  return (
    <div className="shape3d rp-3d" style={{ height }}>
      <div ref={host} className="shape3d-view" role="img" aria-label={t('3D view. Drag to turn it.')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
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
