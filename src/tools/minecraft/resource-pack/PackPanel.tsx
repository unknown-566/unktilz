import { useRef, useState } from 'react';
import { Panel, TextField } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { MiniToolbar } from '../MiniToolbar';
import { CropBox } from '../../image/crop/CropBox';
import { startBox, type Rect } from '../../image/crop/geometry';
import { bitmapPixels, decodeImage, encodePng } from '../../../lib/mc/pack/pixels';
import { KNOWN_FORMATS, compareFormats, type Vanilla } from '../../../lib/mc/pack/vanilla';
import type { PackDoc } from '../../../lib/mc/pack/pack';
import { pngUrl } from './thumbs';
import { t } from '../../../lib/i18n-core';

const ICON = 128;
const SHOWN = 1024;

/** The pack's name, description (with colors), icon and which versions it's for. */
export function PackPanel({ doc, vanilla, onChange, iconFromTexture }: { doc: PackDoc; vanilla: Vanilla | null; onChange: (p: Partial<PackDoc>) => void; iconFromTexture: (() => Promise<Uint8Array>) | null }) {
  const desc = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [crop, setCrop] = useState<{ bitmap: ImageBitmap; rect: Rect } | null>(null);
  const [error, setError] = useState('');

  const edit = (fn: (v: string, s: number, e: number) => { next: string; s: number; e: number }) => {
    const el = desc.current;
    const v = doc.description;
    const r = fn(v, el?.selectionStart ?? v.length, el?.selectionEnd ?? v.length);
    onChange({ description: r.next });
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(r.s, r.e);
    }, 0);
  };
  const wrap = (open: string, close: string) => edit((v, s, e) => ({ next: v.slice(0, s) + open + v.slice(s, e) + close + v.slice(e), s: s + open.length, e: e + open.length }));
  const insert = (text: string) => edit((v, s, e) => ({ next: v.slice(0, s) + text + v.slice(e), s: s + text.length, e: s + text.length }));

  const pickIcon = async (f: File) => {
    setError('');
    try {
      const full = await createImageBitmap(f);
      const k = Math.min(1, SHOWN / Math.max(full.width, full.height));
      const bitmap = k < 1 ? await createImageBitmap(full, { resizeWidth: Math.round(full.width * k), resizeHeight: Math.round(full.height * k), resizeQuality: 'high' }) : full;
      if (bitmap !== full) full.close();
      // Square pictures need no cropping.
      if (bitmap.width === bitmap.height) return applyIcon(bitmap, { x: 0, y: 0, w: bitmap.width, h: bitmap.height });
      setCrop({ bitmap, rect: startBox(1, bitmap.width, bitmap.height) });
    } catch {
      setError(t('That picture can’t be opened. Use a PNG, JPG, WebP or GIF.'));
    }
  };

  const applyIcon = (bitmap: ImageBitmap, r: Rect) => {
    // Small pixel art stays sharp; anything bigger is scaled smoothly.
    const sharp = r.w <= ICON;
    const img = bitmapPixels(bitmap, ICON, ICON, !sharp, { x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) });
    onChange({ icon: encodePng(img) });
    bitmap.close();
    setCrop(null);
  };

  const older = vanilla
    ? Object.entries(KNOWN_FORMATS)
        .filter(([, f]) => compareFormats(f, vanilla.format) < 0)
        .map(([id]) => id)
        .reverse()
    : [];

  return (
    <Panel title={t('pack')}>
      <div className="rp-pack-top">
        <div className="rp-icon-box">
          <button type="button" className="rp-icon" onClick={() => file.current?.click()} title={t('Choose a picture for the icon')}>
            {doc.icon ? <img src={pngUrl(doc.icon)} alt={t('Pack icon')} /> : <span className="muted">{t('icon')}</span>}
          </button>
          <div className="rp-icon-actions">
            <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>
              {t('choose picture')}
            </button>
            {iconFromTexture && (
              <button type="button" className="btn btn-sm" onClick={() => iconFromTexture().then((icon) => onChange({ icon }), () => {})} title={t('Use the texture that is open in the editor, made bigger')}>
                {t('use open texture')}
              </button>
            )}
            {doc.icon && (
              <button type="button" className="btn btn-sm" onClick={() => onChange({ icon: null })}>
                {t('remove')}
              </button>
            )}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) pickIcon(f);
            }}
          />
        </div>
        <TextField label={t('Name')} value={doc.name} onChange={(name) => onChange({ name })} help={t('Shown in the game’s list of resource packs and used as the file name.')} />
      </div>
      {error && <p className="error-text">{error}</p>}

      {crop && (
        <div className="rp-icon-crop">
          <p className="note">{t('Drag the square to pick the part of the picture for the icon.')}</p>
          <div className="crop-wrap">
            <CropBox bitmap={crop.bitmap} orient={{ rotate: 0, mirror: false }} W={crop.bitmap.width} H={crop.bitmap.height} rect={crop.rect} ratio={1} circle={false} onChange={(rect) => setCrop((c) => c && { ...c, rect })} />
          </div>
          <div className="opt-row">
            <button type="button" className="btn btn-primary" onClick={() => applyIcon(crop.bitmap, crop.rect)}>
              {t('Use as icon')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                crop.bitmap.close();
                setCrop(null);
              }}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <label htmlFor="rp-desc" className="field-label">
            {t('Description')}
          </label>
          <Help label={t('Description')} text={t('Two short lines fit under the name in the game. Select words and pick a color or style.')} />
        </span>
        <MiniToolbar basic onWrap={wrap} onInsert={insert} placeholders={[]} />
        <textarea id="rp-desc" ref={desc} className="textarea mono rp-desc" rows={2} value={doc.description} onChange={(e) => onChange({ description: e.target.value })} spellCheck={false} />
      </div>

      {vanilla && (
        <div className="opt-row">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <label htmlFor="rp-min" className="opt-label">
              {t('Also works in')}
            </label>
            <Help
              label={t('Also works in')}
              text={t('The game marks a pack made for another version as “incompatible” but uses it anyway. Pick the oldest version it should be marked as fine for. Textures that version doesn’t have are simply not used there.')}
            />
          </span>
          <select id="rp-min" className="select" value={older.includes(doc.minVersion) ? doc.minVersion : ''} onChange={(e) => onChange({ minVersion: e.target.value })}>
            <option value="">{t('only {v}', { v: vanilla.id })}</option>
            {older.map((id) => (
              <option key={id} value={id}>
                {t('{v} and newer', { v: id })}
              </option>
            ))}
          </select>
        </div>
      )}
    </Panel>
  );
}

/** A texture made bigger for the icon (sharp pixels). */
export async function textureIcon(png: Uint8Array): Promise<Uint8Array> {
  const img = await decodeImage(png);
  // One frame of an animation (the top square).
  const side = Math.min(img.w, img.h);
  const c = new OffscreenCanvas(img.w, img.h);
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
  return encodePng(bitmapPixels(c, ICON, ICON, false, { x: 0, y: 0, w: side, h: side }));
}
