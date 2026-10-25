import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { MiniText } from '../../../lib/mc/minimessage';
import { decodePng, multiplyImg, type Area, type Img } from '../../../lib/mc/pack/pixels';
import { tintOf } from '../../../lib/mc/pack/catalog';
import { previewModel, type Model } from '../../../lib/mc/pack/models';
import type { PackDoc } from '../../../lib/mc/pack/pack';
import type { Vanilla } from '../../../lib/mc/pack/vanilla';
import { useLive, type LiveAnim, type LiveTexture } from './live';
import { pngUrl } from './thumbs';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { t } from '../../../lib/i18n-core';

const Model3D = lazy(() => import('./Model3D'));

function draw(c: HTMLCanvasElement, img: Img, area: Area, size: number, tiles: number) {
  const k = size / Math.max(area.w, area.h) / tiles;
  const w = Math.round(area.w * k * tiles);
  const h = Math.round(area.h * k * tiles);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, w, h);
  const tmp = new OffscreenCanvas(area.w, area.h);
  const part = new ImageData(area.w, area.h);
  for (let y = 0; y < area.h; y++) part.data.set(img.data.subarray((area.y + y) * img.w * 4, ((area.y + y) * img.w + area.w) * 4), y * area.w * 4);
  tmp.getContext('2d')!.putImageData(part, 0, 0);
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) g.drawImage(tmp, (tx * w) / tiles, (ty * h) / tiles, w / tiles, h / tiles);
}

/** Draws one frame of a texture, `tiles` × `tiles` times, at `size` px. */
function TextureCanvas({ img, area, size, tiles = 1, label, version }: { img: Img; area: Area; size: number; tiles?: number; label: string; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) draw(ref.current, img, area, size, tiles);
    // The editor paints into the same pixels, so `version` says when to draw again.
  }, [img, version, area.x, area.y, area.w, area.h, size, tiles]);
  return <canvas ref={ref} className="rp-preview-canvas" aria-label={label} />;
}

/** Plays an animation the way the game does: each frame for its ticks (1/20 s), blended if smooth. */
function PlayingCanvas({ img, anim, size, tiles = 1, label }: { img: Img; anim: LiveAnim; size: number; tiles?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const total = anim.order.reduce((n, f) => n + f.ticks, 0);
    const start = performance.now();
    const blend: Img = { w: img.w, h: anim.fh, data: new Uint8ClampedArray(img.w * anim.fh * 4) };
    const tick = () => {
      const c = ref.current;
      if (c && total) {
        let at = ((performance.now() - start) / 50) % total;
        let i = 0;
        while (at >= anim.order[i].ticks) at -= anim.order[i++].ticks;
        const cur = anim.order[i].index;
        const area = { x: 0, y: cur * anim.fh, w: img.w, h: anim.fh };
        if (anim.interpolate) {
          const next = anim.order[(i + 1) % anim.order.length].index;
          const k = at / anim.order[i].ticks;
          const a = cur * anim.fh * img.w * 4;
          const b = next * anim.fh * img.w * 4;
          for (let p = 0; p < blend.data.length; p++) blend.data[p] = img.data[a + p] * (1 - k) + img.data[b + p] * k;
          draw(c, blend, { x: 0, y: 0, w: img.w, h: anim.fh }, size, tiles);
        } else draw(c, img, area, size, tiles);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [img, anim, size, tiles]);
  return <canvas ref={ref} className="rp-preview-canvas" aria-label={label} />;
}

/** The pack as it shows in the game's list of resource packs. */
export function PackCard({ doc }: { doc: PackDoc }) {
  return (
    <div className="rp-card" aria-label={t('How the pack shows in the game')}>
      <span className="rp-card-icon">{doc.icon ? <img src={pngUrl(doc.icon)} alt="" /> : <span aria-hidden="true">?</span>}</span>
      <span className="rp-card-text">
        <span className="rp-card-name">{doc.name || t('My pack')}</span>
        <span className="rp-card-desc">
          <MiniText text={doc.description} defaultColor="#AAAAAA" />
        </span>
      </span>
    </div>
  );
}

const decoded = new WeakMap<Uint8Array, Img | null>();
const decodeOnce = (b: Uint8Array) => {
  if (!decoded.has(b)) decoded.set(b, decodePng(b));
  return decoded.get(b)!;
};

/** Right column: the open texture (as painted, playing, tiled, in 3D, and the original) and the pack card. */
export function Preview({ live, doc, vanilla, active, title }: { live: LiveTexture; doc: PackDoc; vanilla: Vanilla | null; active: string | null; title: string }) {
  const s = useLive(live);
  const [play, setPlay] = useState(true);
  const state = s && s.path === active ? s : null;
  const tint = active ? tintOf(active) : undefined;
  const img = state && tint ? multiplyImg(state.img, tint) : state?.img;
  const orig = state?.orig && tint ? multiplyImg(state.orig, tint) : state?.orig;
  const origArea = orig && state ? { x: 0, y: Math.min(state.area.y * (orig.w / state.area.w), orig.h - orig.w), w: orig.w, h: Math.min(orig.h, orig.w * (state.area.h / state.area.w)) } : null;
  const isBlock = !!active?.startsWith('textures/block/');
  const isItem = !!active?.startsWith('item:');

  // The block or item model the texture is on (custom items: a flat item of their own texture).
  const model: Model | null = useMemo(() => {
    if (!active || !vanilla) return null;
    if (isItem) return { kind: 'generated', layers: [active] };
    try {
      return previewModel(vanilla.files, active);
    } catch {
      return null;
    }
  }, [active, vanilla, isItem]);

  // Textures for the 3D view: the one being painted live, the others from the pack or the game.
  const texRef = useRef(state);
  texRef.current = state;
  const tex = useMemo(
    () => (path: string) => {
      const st = texRef.current;
      if (st && path === st.path) return { img: st.img, area: st.area };
      const bytes = doc.textures[path]?.png ?? vanilla?.files[path];
      const im = bytes ? decodeOnce(bytes) : null;
      if (!im) return null;
      const fh = im.h > im.w && im.h % im.w === 0 ? im.w : im.h;
      return { img: im, area: { x: 0, y: 0, w: im.w, h: fh } };
    },
    [doc.textures, vanilla],
  );

  return (
    <div className="rp-preview">
      <h2 className="panel-title">{t('// preview')}</h2>
      {state && img ? (
        <>
          <p className="rp-preview-name">
            <b>{title}</b>
            {tint && <span className="muted"> · {t('colored like in a plains biome')}</span>}
          </p>
          <div className="rp-preview-row">
            <figure>
              {state.anim && play ? (
                <PlayingCanvas img={img} anim={state.anim} size={160} label={t('Your texture')} />
              ) : (
                <TextureCanvas img={img} area={state.area} size={160} label={t('Your texture')} version={state.version} />
              )}
              <figcaption>
                {t('yours')}
                {state.anim && (
                  <button type="button" className="link-btn rp-play" onClick={() => setPlay((p) => !p)}>
                    {play ? t('pause') : t('play')}
                  </button>
                )}
              </figcaption>
            </figure>
            {orig && origArea && (
              <figure>
                <TextureCanvas img={orig} area={origArea} size={72} label={t('The game’s texture')} version={0} />
                <figcaption>{t('original')}</figcaption>
              </figure>
            )}
          </div>
          {model && (
            <figure>
              <ErrorBoundary resetKey={active!} fallback={() => <div className="rp-3d-wait muted">{t('The 3D view isn’t available for this one.')}</div>}>
                <Suspense fallback={<div className="rp-3d-wait muted">{t('loading…')}</div>}>
                  <Model3D model={model} modelKey={active!} tex={tex} tintOf={tintOf} version={state.version} />
                </Suspense>
              </ErrorBoundary>
              <figcaption>{model.kind === 'generated' ? t('as an item, drag to turn it') : t('on its block, drag to turn it')}</figcaption>
            </figure>
          )}
          {isBlock && (
            <figure>
              {state.anim && play ? (
                <PlayingCanvas img={img} anim={state.anim} size={240} tiles={3} label={t('Placed next to each other')} />
              ) : (
                <TextureCanvas img={img} area={state.area} size={240} tiles={3} label={t('Placed next to each other')} version={state.version} />
              )}
              <figcaption>{t('placed next to each other')}</figcaption>
            </figure>
          )}
        </>
      ) : (
        <p className="note">{t('Open a texture to see it here.')}</p>
      )}
      <h2 className="panel-title">{t('// in the game’s pack list')}</h2>
      <PackCard doc={doc} />
    </div>
  );
}

