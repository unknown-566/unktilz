import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Panel, Segmented } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { assetFile } from '../../../lib/mc/pack/assets';
import { PANORAMA_PATHS } from '../../../lib/mc/pack/panorama';
import { decodeImage, type Img } from '../../../lib/mc/pack/pixels';
import { computeValue } from '../../../lib/compute';
import type { PanoramaPayload } from '../../../workers/tasks/mcPanorama';
import type { PackDoc } from '../../../lib/mc/pack/pack';
import type { Vanilla } from '../../../lib/mc/pack/vanilla';
import { pngUrl } from './thumbs';
import { t, tx } from '../../../lib/i18n-core';

const PanoramaView = lazy(() => import('./PanoramaView'));
const FACE_NAMES = [tx('front'), tx('right'), tx('back'), tx('left'), tx('up'), tx('down')];

/** The title screen background: from one 360° photo or six pictures, with the game's as the start. */
export function PanoramaPanel({ doc, vanilla, onChange }: { doc: PackDoc; vanilla: Vanilla; onChange: (textures: PackDoc['textures']) => void }) {
  const [game, setGame] = useState<Uint8Array[] | null>(null);
  const [gameError, setGameError] = useState('');
  const [faces, setFaces] = useState<Img[] | null>(null);
  const [size, setSize] = useState('1024');
  /** Progress 0…1 while the pictures are made. */
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const wholeInput = useRef<HTMLInputElement>(null);
  const faceInput = useRef<HTMLInputElement>(null);
  const faceSlot = useRef(0);

  const own = PANORAMA_PATHS.map((p) => doc.textures[p]?.png);
  const hasOwn = own.some(Boolean);

  // The game's panorama is an asset object (the jar only has 1×1 stand-ins).
  useEffect(() => {
    let alive = true;
    Promise.all(PANORAMA_PATHS.map((p) => assetFile(vanilla.id, `minecraft/${p}`))).then(
      (list) => alive && setGame(list.every(Boolean) ? (list as Uint8Array[]) : null),
      (e: Error) => alive && setGameError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [vanilla.id]);

  // What the preview shows: each face yours, or else the game's.
  const shown = PANORAMA_PATHS.map((_, i) => own[i] ?? game?.[i]);
  const key = shown.map((b) => b?.length ?? 0).join(',');
  useEffect(() => {
    let alive = true;
    if (shown.some((b) => !b)) {
      setFaces(null);
      return;
    }
    Promise.all(shown.map((b) => decodeImage(b!))).then((list) => alive && setFaces(list), () => alive && setFaces(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, game]);

  const save = (pngs: (Uint8Array | null)[]) => {
    const textures = { ...doc.textures };
    pngs.forEach((png, i) => {
      if (png) textures[PANORAMA_PATHS[i]] = { png };
    });
    onChange(textures);
  };

  const run = async (payload: PanoramaPayload) => {
    setError('');
    setNote('');
    setBusy(0);
    try {
      const r = await computeValue('mc-panorama', payload, (p) => setBusy(p));
      if (payload.kind === 'whole' && Math.abs(r.ratio - 2) > 0.15) setNote(t('This picture is {r}:1, not 2:1, so it isn’t a full 360° photo; the result may look stretched.', { r: r.ratio.toFixed(2) }));
      save(r.pngs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const fromWhole = (file: File) => run({ kind: 'whole', file, size: Number(size) });

  /** Pictures for single sides; six at once go in order of their names (panorama_0 … panorama_5). */
  const fromFaces = (files: File[], start: number) => {
    const six = files.length === 6;
    const list = six ? [...files].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })) : files.slice(0, 6 - start);
    return run({ kind: 'faces', files: list, slots: list.map((_, i) => (six ? i : start + i)), size: Number(size) });
  };

  const reset = () => {
    const textures = { ...doc.textures };
    for (const p of PANORAMA_PATHS) delete textures[p];
    onChange(textures);
  };

  return (
    <Panel title={t('menu background')}>
      <p className="note">{t('The picture that turns slowly behind the title screen. Use one 360° photo (twice as wide as tall), or six square pictures, one for each side.')}</p>
      {faces ? (
        <ErrorBoundary resetKey={key} fallback={() => <p className="note">{t('The 3D view isn’t available for this one.')}</p>}>
          <Suspense fallback={<div className="rp-3d-wait muted">{t('loading…')}</div>}>
            <PanoramaView faces={faces} height={300} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <p className="note">{gameError || (hasOwn ? t('Add the missing sides to see it.') : t('Loading the game’s menu background…'))}</p>
      )}
      {gameError && hasOwn && <p className="note">{t('Sides you didn’t replace stay as in the game.')}</p>}

      <div className="opt-row">
        <span className="opt-label" id="rp-pano-size">
          {t('Size of each side')}
        </span>
        <Segmented labelledBy="rp-pano-size" compact value={size} onChange={setSize} options={['512', '1024', '2048'].map((v) => ({ value: v, label: v }))} />
        <Help label={t('Size of each side')} text={t('The game’s own is 1024 px. Bigger is sharper on large screens but makes the pack bigger.')} />
      </div>
      <div className="rp-item-actions">
        <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => wholeInput.current?.click()}>
          {busy !== null ? t('Converting… {p} %', { p: Math.round(busy * 100) }) : t('Choose a 360° photo')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => {
            faceSlot.current = 0;
            faceInput.current?.click();
          }}
        >
          {t('Choose 6 pictures')}
        </button>
        {hasOwn && (
          <button type="button" className="btn" onClick={reset} disabled={busy !== null}>
            {t('back to the game’s')}
          </button>
        )}
      </div>
      {note && <p className="note">{note}</p>}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <div className="rp-pano-faces">
        {PANORAMA_PATHS.map((p, i) => (
          <button
            key={p}
            type="button"
            className={`rp-pano-face${own[i] ? ' mine' : ''}`}
            disabled={busy !== null}
            title={t('Choose a picture for this side')}
            onClick={() => {
              faceSlot.current = i;
              faceInput.current?.click();
            }}
          >
            {shown[i] ? <img src={pngUrl(shown[i]!)} alt="" /> : <span className="muted">?</span>}
            <span>
              {i} · {t(FACE_NAMES[i])}
            </span>
          </button>
        ))}
      </div>
      <input
        ref={wholeInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) fromWhole(f);
        }}
      />
      <input
        ref={faceInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) fromFaces(files, faceSlot.current);
        }}
      />
    </Panel>
  );
}
