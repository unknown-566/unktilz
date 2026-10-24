import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Segmented } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { DropZone } from '../../../components/DropZone';
import { Workbench } from '../../../components/Workbench';
import { computeValue } from '../../../lib/compute';
import { fmtNum, plural, t } from '../../../lib/i18n-core';
import { useAutosave } from '../../../lib/saved';
import { useQueue } from '../../../queue/store';
import { filesFromDrop, isFileDrag, usePendingFiles } from '../../../queue/dragFiles';
import type { ImageFormat, ImagePayload } from '../../../workers/tasks/image';
import { isHeic, isTiff } from '../../../workers/tasks/imageCodecs';
import { IMAGE_ACCEPTS } from '../formats';
import { CropBox } from './CropBox';
import {
  fitRatio, fromRelative, mirrorBoxH, mirrorBoxV, outputSize, ratioOf, rounded, startBox, step, toRelative, turnBox, turnedSize,
  type Orientation, type RatioId, type Rect,
} from './geometry';

/** The picture shown while cropping is at most this big; the crop itself uses the full picture. */
const SHOWN = 2048;

type Item = {
  id: number;
  file: File;
  /** Full size, upright (before our turning). */
  W: number;
  H: number;
  bitmap: ImageBitmap;
  orient: Orientation;
  /** In pixels of the full picture as turned. */
  rect: Rect;
};

type Format = 'keep' | 'png' | 'jpeg' | 'webp' | 'avif';
type Settings = {
  ratio: RatioId;
  swapped: boolean;
  custom: { w: number; h: number };
  circle: boolean;
  exact: boolean;
  size: { w: number; h: number };
  format: Format;
  quality: number;
  same: boolean;
};

const DEFAULTS: Settings = { ratio: 'free', swapped: false, custom: { w: 3, h: 2 }, circle: false, exact: false, size: { w: 1080, h: 1080 }, format: 'keep', quality: 90, same: false };

const RATIOS: { id: RatioId; label: string }[] = [
  { id: 'free', label: t('free') },
  { id: 'original', label: t('original') },
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
  { id: '3:2', label: '3:2' },
  { id: '16:9', label: '16:9' },
  { id: '21:9', label: '21:9' },
  { id: '4:5', label: '4:5' },
  { id: 'a4', label: 'A4' },
  { id: 'custom', label: t('own') },
];

let nextId = 1;

async function load(file: File): Promise<Item> {
  let W: number, H: number, bitmap: ImageBitmap;
  try {
    if (isHeic(file) || isTiff(file)) {
      // The page can't read these; the worker makes a small PNG and tells the real size.
      const p = await computeValue('image-preview', { file, max: SHOWN });
      W = p.width;
      H = p.height;
      bitmap = await createImageBitmap(p.blob);
    } else {
      const big = await createImageBitmap(file, { imageOrientation: 'from-image' });
      W = big.width;
      H = big.height;
      const k = Math.min(1, SHOWN / Math.max(W, H));
      bitmap = k < 1 ? await createImageBitmap(big, { resizeWidth: Math.round(W * k), resizeHeight: Math.round(H * k), resizeQuality: 'high' }) : big;
      if (bitmap !== big) big.close();
    }
  } catch {
    throw new Error(t('{name} couldn’t be read as a picture.', { name: file.name }));
  }
  return { id: nextId++, file, W, H, bitmap, orient: { rotate: 0, mirror: false }, rect: { x: 0, y: 0, w: W, h: H } };
}

const isImage = (f: File) => f.type.startsWith('image/') || IMAGE_ACCEPTS.some((ext) => f.name.toLowerCase().endsWith(ext));

export default function CropImage() {
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState('');
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useAutosave<Settings>('crop-image', s, (v) => setS({ ...DEFAULTS, ...v, custom: { ...DEFAULTS.custom, ...v.custom }, size: { ...DEFAULTS.size, ...v.size } }));
  const set = (patch: Partial<Settings>) => setS((old) => ({ ...old, ...patch }));

  usePendingFiles('crop-image', (f) => void add(f));

  const item = items[active] as Item | undefined;
  const dims = (it: Item) => turnedSize(it.W, it.H, it.orient);
  const ratioFor = useCallback((it: Item) => ratioOf(s.ratio, s.swapped, dims(it).w, dims(it).h, s.custom), [s.ratio, s.swapped, s.custom]);

  // A new ratio reshapes every box around its middle.
  useEffect(() => {
    setItems((list) => list.map((it) => ({ ...it, rect: fitRatio(it.rect, ratioFor(it), dims(it).w, dims(it).h) })));
  }, [ratioFor]);

  // Free the small copies when the tool closes.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((it) => it.bitmap.close()), []);

  const add = async (files: File[]) => {
    const pics = files.filter(isImage);
    setError(pics.length < files.length ? t('Only pictures can be cropped; the other files were left out.') : '');
    if (!pics.length) return;
    setLoading(true);
    const loaded: Item[] = [];
    for (const f of pics) {
      try {
        const it = await load(f);
        const d = dims(it);
        loaded.push({ ...it, rect: startBox(ratioOf(s.ratio, s.swapped, d.w, d.h, s.custom), d.w, d.h) });
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setLoading(false);
    setItems((list) => {
      // With "same crop for all", new pictures get the box of the one being edited.
      const from = s.same ? list[active] : undefined;
      const fresh = from
        ? loaded.map((it) => ({ ...it, rect: fromRelative(toRelative(from.rect, dims(from).w, dims(from).h), dims(it).w, dims(it).h, ratioFor(it)) }))
        : loaded;
      if (loaded.length && !list.length) setActive(0);
      return [...list, ...fresh];
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

  /** Changes the box of the picture being edited (and of every picture, with "same crop for all"). */
  const setRect = (r: Rect) => {
    setSent('');
    setItems((list) => {
      const cur = list[active];
      if (!cur) return list;
      const rel = toRelative(r, dims(cur).w, dims(cur).h);
      return list.map((it, i) => (i === active ? { ...it, rect: r } : s.same ? { ...it, rect: fromRelative(rel, dims(it).w, dims(it).h, ratioFor(it)) } : it));
    });
  };

  const turn = (action: 'cw' | 'ccw' | 'h' | 'v') => {
    setSent('');
    setItems((list) =>
      list.map((it, i) => {
        if (i !== active && !s.same) return it;
        const { w, h } = dims(it);
        const rect = action === 'cw' ? turnBox(it.rect, w, h, 1) : action === 'ccw' ? turnBox(it.rect, w, h, -1) : action === 'h' ? mirrorBoxH(it.rect, w) : mirrorBoxV(it.rect, h);
        const next = { ...it, orient: step(it.orient, action), rect };
        // "Original" follows the picture's new shape.
        return s.ratio === 'original' ? { ...next, rect: fitRatio(next.rect, ratioOf('original', s.swapped, dims(next).w, dims(next).h, s.custom), dims(next).w, dims(next).h) } : next;
      }),
    );
  };

  const remove = (i: number) => {
    items[i]?.bitmap.close();
    setItems((list) => list.filter((_, j) => j !== i));
    setActive((a) => Math.max(0, a > i || a === items.length - 1 ? a - 1 : a));
  };

  const exactSize = s.exact ? s.size : null;
  const outFor = (it: Item) => outputSize(rounded(it.rect, dims(it).w, dims(it).h), exactSize);

  const send = (list: Item[]) => {
    for (const it of list) {
      const d = dims(it);
      const crop = rounded(it.rect, d.w, d.h);
      const out = outFor(it);
      const payload: ImagePayload = {
        file: it.file,
        format: s.format as ImageFormat,
        quality: s.quality,
        rotate: it.orient.rotate,
        flip: it.orient.mirror ? 'h' : 'none',
        crop,
        circle: s.circle,
        resize: out.w !== crop.w || out.h !== crop.h ? { mode: 'pixels', width: out.w, height: out.h, keepAspect: false } : undefined,
      };
      useQueue.getState().addTask(
        { slug: 'crop-image', name: 'Crop image' /* i18n-ignore: the queue shows the tool's name */, category: 'image', file: it.file.name },
        (_signal, onProgress) => computeValue('image', payload, onProgress),
      );
    }
    setSent(list.length === 1 ? t('Sent to the queue: {name}', { name: list[0].file.name }) : plural(list.length, ['{n} picture sent to the queue', '{n} pictures sent to the queue'], ['{n} obrázek poslán do fronty', '{n} obrázky poslány do fronty', '{n} obrázků posláno do fronty']));
  };

  const ratio = item ? ratioFor(item) : null;
  const d = item ? dims(item) : { w: 0, h: 0 };
  const r = item ? rounded(item.rect, d.w, d.h) : { x: 0, y: 0, w: 0, h: 0 };
  const out = item ? outFor(item) : { w: 0, h: 0 };

  /** Typing a number: the box moves or resizes; with a ratio, the other side follows. */
  const typed = (key: 'x' | 'y' | 'w' | 'h', v: number) => {
    if (!item || !Number.isFinite(v)) return;
    const next = { ...item.rect, [key]: v };
    if (ratio && key === 'w') next.h = v / ratio;
    if (ratio && key === 'h') next.w = v * ratio;
    if ((key === 'w' || key === 'h') && ratio) {
      // Shrink to fit when the typed size is bigger than the picture.
      const k = Math.min(1, d.w / next.w, d.h / next.h);
      next.w *= k;
      next.h *= k;
    }
    setRect({ ...next, x: Math.max(0, Math.min(d.w - Math.min(next.w, d.w), next.x)), y: Math.max(0, Math.min(d.h - Math.min(next.h, d.h), next.y)), w: Math.min(next.w, d.w), h: Math.min(next.h, d.h) });
  };
  const typedSize = (key: 'w' | 'h', v: number) => {
    const n = Math.max(0, Math.min(16384, Math.round(v) || 0));
    if (!ratio || !n) return set({ size: { ...s.size, [key]: n } });
    set({ size: key === 'w' ? { w: n, h: Math.max(1, Math.round(n / ratio)) } : { w: Math.max(1, Math.round(n * ratio)), h: n } });
  };

  // The "+ add pictures" button's file picker (the drop zone is gone once a picture is open).
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

  const settings = (
    <Panel title={t('crop')}>
      <div className="field">
        <span className="field-label">{t('Aspect ratio')}</span>
        <div className="crop-ratios">
          {RATIOS.map((x) => (
            <button key={x.id} type="button" className="chip" aria-pressed={s.ratio === x.id} onClick={() => set({ ratio: x.id })}>
              {x.label}
            </button>
          ))}
          <button
            type="button"
            className="chip"
            aria-pressed={s.swapped}
            disabled={s.ratio === 'free' || s.ratio === '1:1'}
            title={t('Turn the ratio (standing ⇄ lying)')}
            onClick={() => set({ swapped: !s.swapped })}
          >
            ⇄
          </button>
        </div>
        {s.ratio === 'custom' && (
          <div className="inline">
            <input className="input mono crop-num" type="number" min={1} aria-label={t('Ratio width')} value={s.custom.w} onChange={(e) => set({ custom: { ...s.custom, w: Math.max(0, Number(e.target.value)) } })} />
            <span className="mono">:</span>
            <input className="input mono crop-num" type="number" min={1} aria-label={t('Ratio height')} value={s.custom.h} onChange={(e) => set({ custom: { ...s.custom, h: Math.max(0, Number(e.target.value)) } })} />
          </div>
        )}
      </div>

      <div className="field">
        <span className="field-label" style={{ display: 'flex', alignItems: 'center' }}>
          {t('Crop area (px)')}
          <Help label={t('Crop area (px)')} text={t('Where the crop starts (X from the left, Y from the top) and how big it is, in pixels of the full picture. Double-click the picture to take all of it.')} />
        </span>
        <div className="crop-xywh">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <label key={k} className="crop-xy">
              <span className="mono muted">{k === 'w' ? t('width') : k === 'h' ? t('height') : k.toUpperCase()}</span>
              <input className="input mono" type="number" min={0} value={r[k]} onChange={(e) => typed(k, Number(e.target.value))} />
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">{t('Turn and mirror')}</span>
        <div className="inline crop-turns">
          <button type="button" className="btn btn-sm" onClick={() => turn('ccw')} title={t('Turn left')}>
            ↺ {t('turn|left')}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => turn('cw')} title={t('Turn right')}>
            ↻ {t('turn|right')}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => turn('h')} title={t('Mirror left–right')}>
            ⇆ {t('mirror')}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => turn('v')} title={t('Flip upside down')}>
            ⇅ {t('flip')}
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field-label">{t('Shape')}</span>
        <Segmented
          label={t('Shape')}
          value={s.circle ? 'circle' : 'rect'}
          onChange={(v) => set(v === 'circle' ? { circle: true, format: s.format === 'keep' || s.format === 'jpeg' ? 'png' : s.format } : { circle: false })}
          options={[
            { value: 'rect', label: t('rectangle') },
            { value: 'circle', label: t('circle') },
          ]}
        />
        {s.circle && (s.format === 'jpeg' || s.format === 'keep') && <p className="note">{t('JPG can’t be see-through, so the corners will be white. Pick PNG or WebP for see-through corners.')}</p>}
      </div>

      <div className="field">
        <span className="field-label">{t('Size of the result')}</span>
        <Segmented
          label={t('Size of the result')}
          value={s.exact ? 'exact' : 'box'}
          onChange={(v) => {
            if (v === 'exact' && ratio) set({ exact: true, size: { w: s.size.w, h: Math.max(1, Math.round(s.size.w / ratio)) } });
            else set({ exact: v === 'exact' });
          }}
          options={[
            { value: 'box', label: t('as cropped') },
            { value: 'exact', label: t('exact size') },
          ]}
        />
        {s.exact && (
          <div className="inline">
            <input className="input mono crop-num" type="number" min={0} aria-label={t('Width (px)')} value={s.size.w} onChange={(e) => typedSize('w', Number(e.target.value))} />
            <span className="mono">×</span>
            <input className="input mono crop-num" type="number" min={0} aria-label={t('Height (px)')} value={s.size.h} onChange={(e) => typedSize('h', Number(e.target.value))} />
            <span className="mono muted">px</span>
          </div>
        )}
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
        {s.format !== 'png' && s.format !== 'keep' && (
          <label className="range">
            <span className="mono muted">{t('Quality')}</span>
            <input type="range" min={40} max={100} value={s.quality} onChange={(e) => set({ quality: Number(e.target.value) })} />
            <output className="mono">{s.quality}</output>
          </label>
        )}
      </div>

      <p className="crop-size mono">
        {t('Result: {w} × {h} px', { w: fmtNum(out.w), h: fmtNum(out.h) })}
        {s.exact && (Math.abs(out.w / out.h - r.w / r.h) > 0.01 ? <span className="muted"> · {t('stretched to fit')}</span> : null)}
      </p>
      <div className="inline">
        <button type="button" className="btn btn-primary" onClick={() => send([item])}>
          {t('Crop')}
        </button>
        {items.length > 1 && (
          <button type="button" className="btn" onClick={() => send(items)}>
            {t('Crop all ({n})', { n: items.length })}
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
        // i18n-ignore: a file name and its size
        title={`${item.file.name} · ${fmtNum(d.w)} × ${fmtNum(d.h)} px`}
        actions={
          <button type="button" className="btn btn-sm mono" onClick={() => picker.current?.click()}>
            {t('+ add pictures')}
          </button>
        }
      >
        <div
          className={`crop-wrap${over ? ' over' : ''}`}
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
          <CropBox bitmap={item.bitmap} orient={item.orient} W={d.w} H={d.h} rect={item.rect} ratio={ratio} circle={s.circle} onChange={setRect} />
        </div>
        <p className="note">{t('Drag the box to move it and its corners or edges to resize it; drag outside it to draw a new one. Double-click takes the whole picture.')}</p>
        {drop}
        {error && <p className="error-text">{error}</p>}
      </Panel>

      {items.length > 1 && (
        <Panel title={plural(items.length, ['{n} picture', '{n} pictures'], ['{n} obrázek', '{n} obrázky', '{n} obrázků'])}>
          <div className="crop-strip">
            {items.map((it, i) => (
              <span key={it.id} className="crop-thumb-wrap">
                <button type="button" className="crop-thumb" aria-pressed={i === active} title={it.file.name} onClick={() => setActive(i)}>
                  <Thumb bitmap={it.bitmap} />
                </button>
                <button type="button" className="chip-x" aria-label={t('Remove {name}', { name: it.file.name })} onClick={() => remove(i)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <label className="crop-same">
            <input
              type="checkbox"
              checked={s.same}
              onChange={(e) => {
                set({ same: e.target.checked });
                if (!e.target.checked) return;
                // Everything takes the box and turning of the picture being edited.
                const rel = toRelative(item.rect, d.w, d.h);
                setItems((list) =>
                  list.map((it, i) => {
                    if (i === active) return it;
                    const next = { ...it, orient: item.orient };
                    const nd = dims(next);
                    return { ...next, rect: fromRelative(rel, nd.w, nd.h, ratioFor(next)) };
                  }),
                );
              }}
            />
            <span>{t('Same crop for all pictures')}</span>
            <Help label={t('Same crop for all pictures')} text={t('The box (and turning) of the picture you edit goes to all of them, at the same place relative to each picture’s size. Handy for screenshots.')} />
          </label>
        </Panel>
      )}
    </Workbench>
  );
}

function Thumb({ bitmap }: { bitmap: ImageBitmap }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useMemo(() => {
    const k = 72 / Math.max(bitmap.width, bitmap.height);
    return { w: Math.max(1, Math.round(bitmap.width * k)), h: Math.max(1, Math.round(bitmap.height * k)) };
  }, [bitmap]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.getContext('2d')!.drawImage(bitmap, 0, 0, size.w, size.h);
  }, [bitmap, size]);
  return <canvas ref={ref} width={size.w} height={size.h} />;
}
