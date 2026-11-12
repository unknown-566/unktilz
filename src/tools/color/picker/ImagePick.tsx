import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DropZone } from '../../../components/DropZone';
import { Segmented } from '../../../components/ui';
import { from255, toHex, type RGB } from '../../../lib/color';
import { t } from '../../../lib/i18n-core';

export const PICK_IMAGE_ACCEPTS = ['.png', '.jpg', '.jpeg', '.jfif', '.webp', '.gif', '.bmp', '.avif', '.ico', '.svg'];

/** Pixels around the pointer shown in the magnifier (odd, so one is in the middle). */
const LOUPE = 11;
const CELL = 11;

type Loaded = { full: HTMLCanvasElement; w: number; h: number };

/** A picture to take colors from: a magnifier follows the pointer, a click takes the color. */
export function ImagePick({ file, onFile, onPick }: { file: File | null; onFile: (f: File) => void; onPick: (c: RGB) => void }) {
  const [img, setImg] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [sample, setSample] = useState<'1' | '3' | '5'>('1');
  const [hover, setHover] = useState<{ x: number; y: number; px: number; py: number; color: RGB } | null>(null);
  const [width, setWidth] = useState(0);
  const view = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);

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
        full.getContext('2d', { willReadFrequently: true })!.drawImage(bmp, 0, 0);
        bmp.close();
        setImg({ full, w: full.width, h: full.height });
      },
      () => alive && setError(t('That picture can’t be opened. Use a PNG, JPG, WebP or GIF.')),
    );
    return () => {
      alive = false;
    };
  }, [file]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [img]);

  // The picture fitted to the column (at most 520 px tall); small ones (textures) are enlarged with sharp pixels.
  const scale = img && width ? Math.min(width / img.w, 520 / img.h, img.w < 200 ? 16 : 4) : 1;
  const dw = img ? Math.max(1, Math.round(img.w * scale)) : 0;
  const dh = img ? Math.max(1, Math.round(img.h * scale)) : 0;

  useEffect(() => {
    const c = view.current;
    if (!c || !img) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(dw * dpr);
    c.height = Math.round(dh * dpr);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(img.full, 0, 0, c.width, c.height);
  }, [img, dw, dh, scale]);

  const read = (px: number, py: number) => {
    const n = Number(sample);
    const r = (n - 1) / 2;
    const d = img!.full.getContext('2d', { willReadFrequently: true })!.getImageData(px - r, py - r, n, n).data;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let count = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      sr += d[i];
      sg += d[i + 1];
      sb += d[i + 2];
      count++;
    }
    return count ? from255(Math.round(sr / count), Math.round(sg / count), Math.round(sb / count)) : from255(0, 0, 0);
  };

  const at = (e: React.PointerEvent) => {
    const r = view.current!.getBoundingClientRect();
    const px = Math.min(img!.w - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * img!.w)));
    const py = Math.min(img!.h - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * img!.h)));
    return { x: e.clientX - r.left, y: e.clientY - r.top, px, py };
  };

  // The magnifier: the pixels around the pointer, big, with a grid and the sampled ones marked.
  useEffect(() => {
    const c = loupe.current;
    if (!c || !img || !hover) return;
    const size = LOUPE * CELL;
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    const half = (LOUPE - 1) / 2;
    ctx.drawImage(img.full, hover.px - half, hover.py - half, LOUPE, LOUPE, 0, 0, size, size);
    ctx.strokeStyle = 'rgba(128,128,128,0.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i < LOUPE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL + 0.5, 0);
      ctx.lineTo(i * CELL + 0.5, size);
      ctx.moveTo(0, i * CELL + 0.5);
      ctx.lineTo(size, i * CELL + 0.5);
      ctx.stroke();
    }
    const n = Number(sample);
    const o = (half - (n - 1) / 2) * CELL;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.strokeRect(o + 1, o + 1, n * CELL - 2, n * CELL - 2);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(o - 1, o - 1, n * CELL + 2, n * CELL + 2);
  }, [img, hover, sample]);

  if (!file || error)
    return (
      <DropZone
        title={t('Drop a picture here')}
        button={t('Choose a picture')}
        accept={PICK_IMAGE_ACCEPTS}
        note={t('or paste one (Ctrl+V)')}
        error={error}
        onFiles={(f) => f[0] && onFile(f[0])}
        claimPending={false}
      />
    );

  if (!img) return <p className="note">{t('loading…')}</p>;

  // The magnifier sits beside the pointer, on the side with room.
  const ls = LOUPE * CELL;
  const lx = hover ? (hover.x + 24 + ls > dw ? hover.x - 24 - ls : hover.x + 24) : 0;
  const ly = hover ? Math.min(Math.max(0, hover.y - ls / 2), Math.max(0, dh - ls - 24)) : 0;

  return (
    <div className="cp-image">
      <div className="opt-row">
        <span className="opt-label" id="cp-sample">
          {t('Take')}
        </span>
        <Segmented
          labelledBy="cp-sample"
          compact
          value={sample}
          onChange={setSample}
          options={[
            { value: '1', label: t('1 pixel') },
            { value: '3', label: t('average 3×3') },
            { value: '5', label: t('average 5×5') },
          ]}
        />
        <button type="button" className="btn btn-sm" onClick={() => picker.current?.click()}>
          {t('other picture')}
        </button>
      </div>
      <div ref={box} className="cp-image-box">
        <div className="cp-image-wrap" style={{ width: dw, height: dh }}>
          <canvas
            ref={view}
            style={{ width: dw, height: dh }}
            onPointerMove={(e) => {
              const p = at(e);
              setHover({ ...p, color: read(p.px, p.py) });
            }}
            onPointerLeave={() => setHover(null)}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const p = at(e);
              onPick(read(p.px, p.py));
            }}
          />
          {hover && (
            <div className="cp-loupe" style={{ left: lx, top: ly }}>
              <canvas ref={loupe} />
              <span className="mono" style={{ background: toHex(hover.color) }}>
                <span className="cp-loupe-hex">{toHex(hover.color)}</span>
              </span>
            </div>
          )}
        </div>
      </div>
      <p className="note">
        {t('Move over the picture to see the pixels up close; click to take the color.')} <span className="mono muted">{`${img.w} × ${img.h} px` /* i18n-ignore */}</span>
      </p>
      <input
        ref={picker}
        type="file"
        accept={PICK_IMAGE_ACCEPTS.join(',')}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </div>
  );
}
