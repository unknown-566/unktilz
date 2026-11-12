import { useEffect, useRef, useState } from 'react';
import { Panel, Segmented, Toggle } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { DropZone } from '../../../components/DropZone';
import { GoLink } from '../../../components/Transition';
import { Workbench } from '../../../components/Workbench';
import { ShinyText } from '../../../components/bits/ShinyText';
import { computeValue } from '../../../lib/compute';
import { fmtNum, plural, t } from '../../../lib/i18n-core';
import { spotlight, useTweened } from '../../../lib/motion';
import { useAutosave } from '../../../lib/saved';
import { formatBytes } from '../../../queue/download';
import { useQueue } from '../../../queue/store';
import { filesFromDrop, isFileDrag, usePendingFiles } from '../../../queue/dragFiles';
import { MAX_SIDE, resultSize, type Fit, type ImageFormat, type ImagePayload, type Resize } from '../../../workers/tasks/image';
import { IMAGE_ACCEPTS } from '../formats';
import { isImage, loadPicture, Thumb, type Picture } from '../shared';

/** The picture shown on the page is at most this big; the resize itself uses the full picture. */
const SHOWN = 2048;

type Item = Picture & { id: number };
type Format = 'keep' | 'png' | 'jpeg' | 'webp' | 'avif';
type Settings = {
  mode: 'percent' | 'pixels';
  percent: number;
  w: number;
  h: number;
  /** Width and height follow the picture's shape. */
  lock: boolean;
  /** When not locked and both sides are set. */
  fit: Fit;
  noEnlarge: boolean;
  format: Format;
  quality: number;
  /** The preset last picked (shown as picked until a size is typed). */
  preset: string | null;
};

const DEFAULTS: Settings = { mode: 'percent', percent: 50, w: 1280, h: 720, lock: true, fit: 'cover', noEnlarge: true, format: 'keep', quality: 85, preset: null };

const PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'fhd', label: 'Full HD', w: 1920, h: 1080 }, // i18n-ignore
  { id: 'hd', label: 'HD', w: 1280, h: 720 }, // i18n-ignore
  { id: '4k', label: '4K', w: 3840, h: 2160 },
  { id: 'ig-square', label: t('Instagram post'), w: 1080, h: 1080 },
  { id: 'ig-portrait', label: t('Instagram portrait'), w: 1080, h: 1350 },
  { id: 'story', label: t('Story / Reel'), w: 1080, h: 1920 },
  { id: 'yt', label: t('YouTube thumbnail'), w: 1280, h: 720 },
  { id: 'x-header', label: t('X / Twitter header'), w: 1500, h: 500 },
  { id: 'icon', label: t('Icon'), w: 512, h: 512 },
];

const QUICK = [25, 50, 75, 200];

let nextId = 1;

const extOf = (f: File) => (/\.([^.]+)$/.exec(f.name)?.[1] ?? '').toUpperCase();

/** Saved settings, with anything missing or not making sense (older versions) back to the default. */
function restore(v: Partial<Settings> | null | undefined): Settings {
  const o = { ...DEFAULTS, ...(v ?? {}) };
  const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : d);
  return {
    mode: o.mode === 'pixels' ? 'pixels' : 'percent',
    percent: num(o.percent, 5, 400, DEFAULTS.percent),
    w: num(o.w, 0, MAX_SIDE, DEFAULTS.w),
    h: num(o.h, 0, MAX_SIDE, DEFAULTS.h),
    lock: typeof o.lock === 'boolean' ? o.lock : DEFAULTS.lock,
    fit: o.fit === 'contain' || o.fit === 'stretch' ? o.fit : 'cover',
    noEnlarge: typeof o.noEnlarge === 'boolean' ? o.noEnlarge : DEFAULTS.noEnlarge,
    format: (['keep', 'png', 'jpeg', 'webp', 'avif'] as const).includes(o.format) ? o.format : 'keep',
    quality: num(o.quality, 40, 100, DEFAULTS.quality),
    preset: PRESETS.some((p) => p.id === o.preset) ? o.preset : null,
  };
}

/** What the settings ask for, for one picture. */
function resizeFor(s: Settings): Resize {
  if (s.mode === 'percent') return { mode: 'percent', percent: s.percent, noEnlarge: s.noEnlarge };
  return { mode: 'pixels', width: s.w, height: s.h, fit: s.lock ? 'contain' : s.fit, noEnlarge: s.noEnlarge };
}

function payloadFor(it: Item, s: Settings): ImagePayload {
  return { file: it.file, format: s.format as ImageFormat, quality: s.quality, resize: resizeFor(s) };
}

type Preview = { url: string; bytes: number; for: string };

export default function ResizeImage() {
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState('');
  const [over, setOver] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useAutosave<Settings>('resize-image', s, (v) => setS(restore(v)));
  const set = (patch: Partial<Settings>) => {
    setSent('');
    setS((old) => ({ ...old, ...patch }));
  };

  usePendingFiles('resize-image', (f) => void add(f));

  const item = items[active] as Item | undefined;

  // Free the small copies when the tool closes.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((it) => it.bitmap.close()), []);

  const add = async (files: File[]) => {
    const pics = files.filter(isImage);
    setError(pics.length < files.length ? t('Only pictures can be resized; the other files were left out.') : '');
    if (!pics.length) return;
    setLoading(true);
    const loaded: Item[] = [];
    for (const f of pics) {
      try {
        loaded.push({ id: nextId++, ...(await loadPicture(f, SHOWN)) });
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setLoading(false);
    setItems((list) => {
      if (loaded.length && !list.length) setActive(0);
      return [...list, ...loaded];
    });
  };

  // Pasting a picture (Ctrl+V) adds it too.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter(isImage);
      if (files.length) void add(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // The real result for the picture being edited, a moment after the last change.
  const key = item ? JSON.stringify([item.id, resizeFor(s), s.format, s.format === 'png' || s.format === 'keep' ? 0 : s.quality]) : '';
  useEffect(() => {
    if (!item) return;
    let alive = true;
    setBusy(true);
    const timer = window.setTimeout(() => {
      computeValue('image', payloadFor(item, s)).then(
        ([out]) => {
          if (!alive) return;
          setPreview((old) => {
            if (old) URL.revokeObjectURL(old.url);
            return { url: URL.createObjectURL(out.blob), bytes: out.blob.size, for: key };
          });
          setPreviewError('');
          setBusy(false);
        },
        (e: Error) => {
          if (!alive) return;
          setPreviewError(e.message);
          setBusy(false);
        },
      );
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // `key` holds everything the result depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => setPreview((old) => (old && URL.revokeObjectURL(old.url), null)), []);

  const remove = (i: number) => {
    items[i]?.bitmap.close();
    setItems((list) => list.filter((_, j) => j !== i));
    setActive((a) => Math.max(0, a > i || a === items.length - 1 ? a - 1 : a));
    setSent('');
  };

  const send = (list: Item[]) => {
    for (const it of list) {
      const payload = payloadFor(it, s);
      useQueue.getState().addTask(
        { slug: 'resize-image', name: 'Resize image' /* i18n-ignore: the queue shows the tool's name */, category: 'image', file: it.file.name },
        (_signal, onProgress) => computeValue('image', payload, onProgress),
      );
    }
    setSent(list.length === 1 ? t('Sent to the queue: {name}', { name: list[0].file.name }) : plural(list.length, ['{n} picture sent to the queue', '{n} pictures sent to the queue'], ['{n} obrázek poslán do fronty', '{n} obrázky poslány do fronty', '{n} obrázků posláno do fronty']));
  };

  /** The picture's shape, for the lock. */
  const ratio = item ? item.W / item.H : 16 / 9;
  const typed = (side: 'w' | 'h', v: number) => {
    const n = Math.max(0, Math.min(MAX_SIDE, Math.round(v) || 0));
    if (!s.lock || !n) return set({ [side]: n, preset: null });
    set(side === 'w' ? { w: n, h: Math.max(1, Math.round(n / ratio)), preset: null } : { h: n, w: Math.max(1, Math.round(n * ratio)), preset: null });
  };
  const toggleLock = () => (s.lock ? set({ lock: false }) : set({ lock: true, h: Math.max(1, Math.round(s.w / ratio)), preset: null }));
  const pickPreset = (p: (typeof PRESETS)[number]) => set({ mode: 'pixels', w: p.w, h: p.h, lock: false, fit: 'cover', preset: p.id });

  const size = item ? resultSize(item.W, item.H, resizeFor(s)) : { w: 0, h: 0, capped: false, kept: false };
  const fresh = preview && preview.for === key;
  const bytes = fresh ? preview.bytes : 0;
  const shownW = useTweened(size.w);
  const shownH = useTweened(size.h);
  const shownBytes = useTweened(bytes);
  const change = item && fresh ? bytes / item.file.size - 1 : 0;

  const drop = (
    <input
      ref={picker}
      type="file"
      multiple
      accept={IMAGE_ACCEPTS.join(',')}
      hidden
      onChange={(e) => {
        void add([...(e.target.files ?? [])]);
        e.target.value = '';
      }}
    />
  );

  if (!item)
    return (
      <DropZone
        title={loading ? t('loading…') : t('Drop images here')}
        button={t('Choose files')}
        accept={IMAGE_ACCEPTS}
        multiple
        note={t('or paste a picture (Ctrl+V)')}
        error={error}
        onFiles={(f) => void add(f)}
        claimPending={false}
      />
    );

  const lossy = s.format === 'jpeg' || s.format === 'webp' || s.format === 'avif';
  const keepsLossy = s.format === 'keep' && /^(JPE?G|JFIF|WEBP|AVIF|HEIC|HEIF)$/.test(extOf(item.file));

  const settings = (
    <Panel title={t('size')}>
      <div className="field">
        <span className="field-label">{t('Presets')}</span>
        <div className="rs-presets" onPointerMove={spotlight}>
          {PRESETS.map((p) => {
            const k = 22 / Math.max(p.w, p.h);
            return (
              <button key={p.id} type="button" className="card rs-preset" aria-pressed={s.preset === p.id && s.mode === 'pixels'} onClick={() => pickPreset(p)}>
                <span className="card-glow" aria-hidden="true" />
                <span className="rs-frame" aria-hidden="true">
                  <span style={{ width: Math.max(6, p.w * k), height: Math.max(6, p.h * k) }} />
                </span>
                <span className="rs-preset-text">
                  <span className="rs-preset-name">{p.label}</span>
                  <span className="rs-preset-size mono">
                    {p.w} × {p.h}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <span className="field-label">{t('Resize by')}</span>
        <Segmented
          label={t('Resize by')}
          value={s.mode}
          onChange={(mode) => set({ mode, preset: null })}
          options={[
            { value: 'percent', label: t('percent') },
            { value: 'pixels', label: t('pixels') },
          ]}
        />
      </div>

      {s.mode === 'percent' ? (
        <div className="field">
          <label className="range">
            <span className="mono muted">{t('Scale')}</span>
            <input type="range" min={5} max={400} step={5} value={s.percent} onChange={(e) => set({ percent: Number(e.target.value) })} />
            <output className="mono">{s.percent} %</output>
          </label>
          <div className="rs-quick">
            {QUICK.map((q) => (
              <button key={q} type="button" className="chip" aria-pressed={s.percent === q} onClick={() => set({ percent: q })}>
                {q} %
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="field">
          <div className="rs-wh">
            <label className="crop-xy">
              <span className="mono muted">{t('width')}</span>
              <input className="input mono" type="number" min={0} max={MAX_SIDE} value={s.w || ''} placeholder={t('auto')} onChange={(e) => typed('w', Number(e.target.value))} />
            </label>
            <button
              type="button"
              className={`rs-lock${s.lock ? ' on' : ''}`}
              aria-pressed={s.lock}
              title={s.lock ? t('Keep the picture’s shape: on') : t('Keep the picture’s shape: off')}
              aria-label={t('Keep the picture’s shape')}
              onClick={toggleLock}
            >
              <LockIcon on={s.lock} />
            </button>
            <label className="crop-xy">
              <span className="mono muted">{t('height')}</span>
              <input className="input mono" type="number" min={0} max={MAX_SIDE} value={s.h || ''} placeholder={t('auto')} onChange={(e) => typed('h', Number(e.target.value))} />
            </label>
            <span className="mono muted rs-px">px</span>
          </div>
          {!s.lock && s.w > 0 && s.h > 0 && (
            <>
              <span className="field-label" style={{ display: 'flex', alignItems: 'center' }}>
                {t('When the shape differs')}
                <Help
                  label={t('When the shape differs')}
                  text={t('Fit inside: the whole picture, as big as fits in the box (one side may be shorter). Fill and crop: exactly this size, the edges that stick out are cut off evenly. Stretch: exactly this size, the picture is squeezed to fit.')}
                />
              </span>
              <Segmented
                label={t('When the shape differs')}
                value={s.fit}
                onChange={(fit) => set({ fit })}
                options={[
                  { value: 'contain', label: t('fit inside') },
                  { value: 'cover', label: t('fill and crop') },
                  { value: 'stretch', label: t('stretch') },
                ]}
              />
            </>
          )}
          {s.lock && <p className="note">{t('Leave one side empty, or keep the lock on: the picture keeps its shape. With several pictures, each one fits into the box.')}</p>}
        </div>
      )}

      <div className="opt-row">
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <span className="opt-label" id="rs-noenl">
            {t('Don’t enlarge')}
          </span>
          <Help label={t('Don’t enlarge')} text={t('Pictures smaller than the size you ask for stay as they are. Enlarging can’t add detail, it only makes the picture blurry and the file bigger.')} />
        </span>
        <Toggle labelledBy="rs-noenl" checked={s.noEnlarge} onChange={(noEnlarge) => set({ noEnlarge })} />
      </div>

      <div className="field">
        <span className="field-label">{t('Save as')}</span>
        <Segmented
          label={t('Save as')}
          value={s.format}
          onChange={(format) => set({ format })}
          options={[
            { value: 'keep', label: t('same format') },
            { value: 'png', label: 'png' },
            { value: 'jpeg', label: 'jpg' },
            { value: 'webp', label: 'webp' },
            { value: 'avif', label: 'avif' },
          ]}
        />
        {(lossy || keepsLossy) && (
          <label className="range">
            <span className="mono muted" style={{ display: 'flex', alignItems: 'center' }}>
              {t('Quality')}
            </span>
            <input type="range" min={40} max={100} value={s.quality} onChange={(e) => set({ quality: Number(e.target.value) })} />
            <output className="mono">{s.quality}</output>
          </label>
        )}
        {(lossy || keepsLossy) && <p className="note">{t('80–90 looks the same as the original and makes the file much smaller. Below 60 you start to see blocks.')}</p>}
      </div>

      <div className="rs-result" aria-live="polite">
        <span className="rs-result-size mono">
          → {fmtNum(shownW)} × {fmtNum(shownH)} px
          {fresh && <span className="muted"> · {formatBytes(shownBytes)}</span>}
        </span>
        {fresh && change <= -0.01 && (
          <span className="rs-badge rs-save">
            <ShinyText>{t('{n} % smaller', { n: fmtNum(Math.round(-change * 100)) })}</ShinyText>
          </span>
        )}
        {fresh && change >= 0.01 && <span className="rs-badge rs-more">{t('{n} % bigger', { n: fmtNum(Math.round(change * 100)) })}</span>}
      </div>
      {fresh && change >= 0.01 && <p className="note">{t('The file comes out bigger than the original. Try a lower quality, or save as WebP or JPG (PNG is big for photos).')}</p>}
      {size.capped && <p className="note">{t('Made smaller to stay under the biggest size a browser can handle ({max} px a side, about 100 megapixels).', { max: fmtNum(MAX_SIDE) })}</p>}
      {size.kept && <p className="note">{t('The picture is smaller than that, so it isn’t enlarged (see “Don’t enlarge”).')}</p>}

      <div className="inline">
        <button type="button" className="btn btn-primary" onClick={() => send([item])}>
          {t('Resize')}
        </button>
        {items.length > 1 && (
          <button type="button" className="btn" onClick={() => send(items)}>
            {t('Resize all ({n})', { n: items.length })}
          </button>
        )}
      </div>
      {sent && (
        <p className="cr-ok" role="status">
          {sent}
        </p>
      )}
    </Panel>
  );

  return (
    <Workbench preview={settings}>
      <Panel
        // i18n-ignore: a file name, its size and type
        title={`${item.file.name} · ${fmtNum(item.W)} × ${fmtNum(item.H)} px · ${formatBytes(item.file.size)}${extOf(item.file) ? ` · ${extOf(item.file)}` : ''}`}
        actions={
          <span className="inline">
            <button
              type="button"
              className="btn btn-sm"
              title={t('Hold to see the original')}
              onPointerDown={() => setComparing(true)}
              onPointerUp={() => setComparing(false)}
              onPointerLeave={() => setComparing(false)}
              onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setComparing(true)}
              onKeyUp={() => setComparing(false)}
              onBlur={() => setComparing(false)}
            >
              {t('hold: original')}
            </button>
            <button type="button" className="btn btn-sm mono" onClick={() => picker.current?.click()}>
              {t('+ add pictures')}
            </button>
          </span>
        }
      >
        <div
          className={`img-preview rs-stage${over ? ' over' : ''}`}
          aria-busy={busy}
          onDragEnter={(e) => isFileDrag(e) && e.preventDefault()}
          onDragOver={(e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            setOver(false);
            filesFromDrop(e).then((f) => void add(f), (err: Error) => setError(err.message));
          }}
        >
          {comparing || !preview ? (
            <BitmapView bitmap={item.bitmap} label={t('Original {name}', { name: item.file.name })} />
          ) : (
            <img className="rs-pic" src={preview.url} alt={t('Preview of the result for {name}', { name: item.file.name })} draggable={false} />
          )}
          {previewError && <span className="img-preview-error">{previewError}</span>}
          {busy && <span className="img-preview-busy mono">{t('updating…')}</span>}
          {comparing && <span className="rs-tag mono">{t('original')}</span>}
        </div>
        <p className="note">{t('The preview is the real result, shrunk to fit here. Hold “original” to compare.')}</p>
        {/\.gif$/i.test(item.file.name) && (
          <p className="note">
            {t('Only the first frame of a GIF is kept.')} <GoLink to="/t/gif-maker">{t('For moving GIFs, use GIF maker.')}</GoLink>
          </p>
        )}
        {drop}
        {error && <p className="error-text">{error}</p>}
      </Panel>

      {items.length > 1 && (
        <Panel title={plural(items.length, ['{n} picture', '{n} pictures'], ['{n} obrázek', '{n} obrázky', '{n} obrázků'])}>
          <div className="crop-strip">
            {items.map((it, i) => (
              <span key={it.id} className="crop-thumb-wrap">
                <button type="button" className="crop-thumb" aria-pressed={i === active} title={`${it.file.name} · ${it.W} × ${it.H} px` /* i18n-ignore */} onClick={() => setActive(i)}>
                  <Thumb bitmap={it.bitmap} />
                </button>
                <button type="button" className="chip-x" aria-label={t('Remove {name}', { name: it.file.name })} onClick={() => remove(i)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        </Panel>
      )}
    </Workbench>
  );
}

/** The original picture (from its small copy), fitted into the stage. */
function BitmapView({ bitmap, label }: { bitmap: ImageBitmap; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    ref.current?.getContext('2d')!.drawImage(bitmap, 0, 0);
  }, [bitmap]);
  return <canvas ref={ref} className="rs-pic" width={bitmap.width} height={bitmap.height} role="img" aria-label={label} />;
}

function LockIcon({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {on ? (
        <>
          <path d="M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 0 10h-2" />
          <path d="M8 12h8" />
        </>
      ) : (
        <>
          <path d="M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 0 10h-2" />
        </>
      )}
    </svg>
  );
}
