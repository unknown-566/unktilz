import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GoLink } from '../../../components/Transition';
import { Workbench } from '../../../components/Workbench';
import { DropZone } from '../../../components/DropZone';
import { Output, Panel, Segmented, useCopy } from '../../../components/ui';
import { nearestName, textOn, toHex } from '../../../lib/color';
import { extractPalette, orderPalette, paletteGpl, palettePng, paletteText, samplePixels, type PaletteFormat, type PaletteOrder } from '../../../lib/palette';
import { useAutosave } from '../../../lib/saved';
import { saveBlob, swapExt } from '../../../queue/download';
import { PICK_IMAGE_ACCEPTS } from '../picker/ImagePick';
import { fmtNum, t } from '../../../lib/i18n-core';

const COUNTS = ['3', '5', '6', '8', '10', '12'] as const;
type Count = (typeof COUNTS)[number];
type Saved = { count: Count; order: PaletteOrder; format: PaletteFormat };

type Loaded = { full: HTMLCanvasElement; w: number; h: number; sample: ReturnType<typeof samplePixels> };

const isImage = (f: File) => f.type.startsWith('image/') || PICK_IMAGE_ACCEPTS.some((a) => f.name.toLowerCase().endsWith(a));
const pct = (share: number) => `${fmtNum(share * 100, { maximumFractionDigits: share < 0.1 ? 1 : 0 })} %`;

export default function ImagePalette() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [count, setCount] = useState<Count>('6');
  const [order, setOrder] = useState<PaletteOrder>('share');
  const [format, setFormat] = useState<PaletteFormat>('hex');
  const [hot, setHot] = useState(-1);
  const picker = useRef<HTMLInputElement>(null);

  useAutosave<Saved>('image-palette', { count, order, format }, (v) => {
    if (COUNTS.includes(v.count)) setCount(v.count);
    if (['share', 'light', 'hue'].includes(v.order)) setOrder(v.order);
    if (['hex', 'css', 'json', 'tailwind'].includes(v.format)) setFormat(v.format);
  });

  useEffect(() => {
    if (!file) return;
    let alive = true;
    setError('');
    createImageBitmap(file).then(
      (bmp) => {
        if (!alive) return bmp.close();
        const full = document.createElement('canvas');
        full.width = bmp.width;
        full.height = bmp.height;
        full.getContext('2d')!.drawImage(bmp, 0, 0);
        bmp.close();
        setImg({ full, w: full.width, h: full.height, sample: samplePixels(full, full.width, full.height) });
      },
      () => {
        if (!alive) return;
        setImg(null);
        setError(t('That picture can’t be opened. Use a PNG, JPG, WebP or GIF.'));
      },
    );
    return () => {
      alive = false;
    };
  }, [file]);

  // Pasting a picture anywhere on the page opens it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find(isImage);
      if (!f) return;
      e.preventDefault();
      setFile(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const found = useMemo(() => (img ? extractPalette(img.sample.data, img.sample.w, Number(count)) : []), [img, count]);
  const palette = useMemo(() => orderPalette(found, order), [found, order]);
  const colors = palette.map((p) => p.color);
  const baseName = file?.name.replace(/\.[^./]+$/, '') || 'palette';

  const side = (
    <Panel title={t('palette')}>
      {!img ? (
        <p className="note">{t('The colors of your picture show up here.')}</p>
      ) : !palette.length ? (
        <p className="note">{t('The picture is fully transparent, so it has no colors.')}</p>
      ) : (
        <>
          <div className="ip-bar" aria-hidden="true">
            {palette.map((p, i) => (
              <span key={i} style={{ background: toHex(p.color), flexGrow: p.share }} />
            ))}
          </div>
          <ul className="ip-list">
            {palette.map((p, i) => (
              <PaletteRow key={`${toHex(p.color)}-${i}`} share={p.share} hex={toHex(p.color)} on={toHex(textOn(p.color))} name={nearestName(p.color).item.name} hot={hot === i} onHot={(v) => setHot(v ? i : -1)} />
            ))}
          </ul>
          {palette.length < Number(count) && <p className="note">{t('The picture has only {n} clearly different colors.', { n: palette.length })}</p>}
        </>
      )}
    </Panel>
  );

  const output = palette.length ? (
    <Panel title={t('export')}>
      <Segmented
        label={t('Format')}
        compact
        value={format}
        onChange={setFormat}
        options={[
          { value: 'hex', label: 'HEX' },
          { value: 'css', label: 'CSS' },
          { value: 'json', label: 'JSON' },
          { value: 'tailwind', label: 'Tailwind' },
        ]}
      />
      <Output label={t('Code')} value={paletteText(colors, format)} multiline />
      <div className="ip-actions">
        <button type="button" className="btn" onClick={() => void palettePng(colors, textOn).then((b) => saveBlob(b, `${baseName}-palette.png`))}>
          {t('download PNG')}
        </button>
        <button type="button" className="btn" title={t('A palette for GIMP, Inkscape and Krita')} onClick={() => saveBlob(new Blob([paletteGpl(colors, baseName)], { type: 'text/plain' }), swapExt(`${baseName}-palette`, 'gpl'))}>
          {t('download .gpl')}
        </button>
      </div>
    </Panel>
  ) : undefined;

  return (
    <Workbench preview={side} output={output}>
      <Panel title={t('picture')}>
        {!img || error ? (
          <DropZone title={t('Drop a picture here')} button={t('Choose a picture')} accept={PICK_IMAGE_ACCEPTS} note={t('or paste one (Ctrl+V)')} error={error} onFiles={(f) => f[0] && setFile(f[0])} />
        ) : (
          <div className="ip-main">
            <div className="opt-row">
              <span className="opt-label" id="ip-count">
                {t('Colors')}
              </span>
              <Segmented labelledBy="ip-count" compact value={count} onChange={setCount} options={COUNTS.map((c) => ({ value: c, label: c }))} />
            </div>
            <div className="opt-row">
              <span className="opt-label" id="ip-order">
                {t('Order')}
              </span>
              <Segmented
                labelledBy="ip-order"
                compact
                value={order}
                onChange={setOrder}
                options={[
                  { value: 'share', label: t('most used first') },
                  { value: 'light', label: t('light to dark') },
                  { value: 'hue', label: t('by hue') },
                ]}
              />
            </div>
            <Picture img={img} palette={palette} hot={hot} onHot={setHot} />
            <p className="note">
              {t('The dots show where each color is in the picture.')}{' '}
              <button type="button" className="link-btn" onClick={() => picker.current?.click()}>
                {t('other picture')}
              </button>
            </p>
            <input
              ref={picker}
              type="file"
              accept={PICK_IMAGE_ACCEPTS.join(',')}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) setFile(f);
              }}
            />
          </div>
        )}
      </Panel>
    </Workbench>
  );
}

/** One color of the palette: click copies the hex; a link opens it in the Color picker. */
function PaletteRow({ hex, on, name, share, hot, onHot }: { hex: string; on: string; name: string; share: number; hot: boolean; onHot: (v: boolean) => void }) {
  const { copied, copy } = useCopy();
  return (
    <li className={`ip-row${hot ? ' hot' : ''}`} onMouseEnter={() => onHot(true)} onMouseLeave={() => onHot(false)}>
      <button type="button" className="ip-sw" style={{ background: hex, color: on }} title={t('Copy {hex}', { hex })} onClick={() => void copy(hex)} onFocus={() => onHot(true)} onBlur={() => onHot(false)}>
        <span className="mono">{copied ? t('copied') : hex}</span>
      </button>
      <span className="ip-info">
        <span className="ip-name">{name}</span>
        <span className="mono muted">{pct(share)}</span>
      </span>
      <GoLink className="btn btn-sm" to={`/t/color-picker?c=${hex.slice(1).toLowerCase()}`} title={t('Open this color in the Color picker')}>
        {t('open')}
      </GoLink>
    </li>
  );
}

/** The picture fitted to the column, with a dot on a pixel of each palette color. */
function Picture({ img, palette, hot, onHot }: { img: Loaded; palette: ReturnType<typeof orderPalette>; hot: number; onHot: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scale = width ? Math.min(width / img.w, 520 / img.h, img.w < 200 ? 8 : 4) : 1;
  const dw = Math.max(1, Math.round(img.w * scale));
  const dh = Math.max(1, Math.round(img.h * scale));

  useEffect(() => {
    const c = view.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(dw * dpr);
    c.height = Math.round(dh * dpr);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(img.full, 0, 0, c.width, c.height);
  }, [img, dw, dh, scale]);

  return (
    <div ref={box} className="cp-image-box">
      <div className="cp-image-wrap ip-wrap" style={{ width: dw, height: dh }}>
        <canvas ref={view} style={{ width: dw, height: dh }} />
        {palette.map((p, i) => (
          <span
            key={i}
            className={`ip-dot${hot === i ? ' hot' : ''}`}
            style={{ left: ((p.at.x + 0.5) / img.sample.w) * dw, top: ((p.at.y + 0.5) / img.sample.h) * dh, background: toHex(p.color) }}
            title={toHex(p.color)}
            onMouseEnter={() => onHot(i)}
            onMouseLeave={() => onHot(-1)}
          />
        ))}
      </div>
    </div>
  );
}
