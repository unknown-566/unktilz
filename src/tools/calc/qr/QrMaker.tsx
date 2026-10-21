import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { CopyButton, Panel, Segmented, TabPanel, Tabs } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { Workbench } from '../../../components/Workbench';
import { SavedPanel } from '../../../components/SavedPanel';
import { useAutosave } from '../../../lib/saved';
import { saveBlob } from '../../../queue/download';
import { EMPTY, KINDS, coordsFrom, payloadOf, type Content, type Kind } from './payloads';
import { renderSvg, type DotShape, type EyeBall, type EyeFrame, type Fill, type FrameKind, type Logo, type Matrix, type QrStyle } from './render';
import { PALETTES, type Palette } from './palettes';
import { QR_FONTS, fontCss } from './fonts';
import { checkScan, contrast, luminance, toBlob, toCanvas, type ScanResult } from './raster';
import { fmtNum, t } from '../../../lib/i18n-core';

type Ecl = 'L' | 'M' | 'Q' | 'H';
type Format = 'png' | 'svg' | 'jpeg' | 'webp';
type StoredLogo = Logo & { name: string };
type State = { content: Content; style: QrStyle; ecl: Ecl; logo: StoredLogo | null; format: Format; px: number };
type Look = { style: QrStyle; ecl: Ecl; logo: StoredLogo | null };

const DEFAULT_STYLE: QrStyle = {
  dots: 'square',
  dotSize: 0.9,
  eyeFrame: 'square',
  eyeBall: 'square',
  fg: { type: 'solid', colors: ['#000000'], angle: 45 },
  bg: { type: 'solid', colors: ['#ffffff'], angle: 90 },
  transparent: false,
  eyeColors: false,
  eyeFrameColor: '#000000',
  eyeBallColor: '#000000',
  margin: 4,
  logoSize: 0.22,
  logoClear: true,
  logoPlate: true,
  frame: 'none',
  frameText: t('SCAN ME'),
  frameColor: '#000000',
  frameTextColor: '#ffffff',
  frameFont: 'Geist',
};
const DEFAULTS: State = { content: EMPTY, style: DEFAULT_STYLE, ecl: 'M', logo: null, format: 'png', px: 1024 };

/** What was saved by an older version, filled up with today's defaults. */
function restore(v: Partial<State>): State {
  const content = { ...EMPTY, ...v.content } as Content;
  const saved = (v.content ?? {}) as Record<string, object>;
  const parts = content as unknown as Record<string, object>;
  for (const k of KINDS) parts[k.id] = { ...(EMPTY[k.id] as object), ...saved[k.id] };
  return { ...DEFAULTS, ...v, content, style: { ...DEFAULT_STYLE, ...v.style } };
}

/** The most bytes one code holds at each error-correction level (version 40). */
const MAX_BYTES: Record<Ecl, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };

function encode(text: string, ecl: Ecl): { matrix: Matrix; version: number } | { error: string } {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: ecl });
    return { matrix: { size: qr.modules.size, get: (r, c) => !!qr.modules.get(r, c) }, version: qr.version };
  } catch {
    return { error: t('That\'s more than one QR code holds at error correction {ecl} (about {v2} letters). Make it shorter or pick a lower level.', { ecl, v2: MAX_BYTES[ecl] }) };
  }
}

/** A small code for the option pictures. */
const SAMPLE = (() => {
  const r = encode('unktilz', 'L');
  return 'matrix' in r ? r.matrix : { size: 21, get: () => false };
})();
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const ICON_STYLE: QrStyle = { ...DEFAULT_STYLE, margin: 1, fg: { type: 'solid', colors: ['#1b1b1f'], angle: 0 } };
const icon = (patch: Partial<QrStyle>, id: string) => svgUrl(renderSvg(SAMPLE, { ...ICON_STYLE, ...patch }, { id }).svg);

const DOTS: { value: DotShape; label: string }[] = [
  { value: 'square', label: t('square') },
  { value: 'rounded', label: t('rounded') },
  { value: 'dots', label: t('dots') },
  { value: 'small', label: t('small') },
  { value: 'diamond', label: t('diamond') },
  { value: 'star', label: t('star') },
  { value: 'heart', label: t('heart') },
  { value: 'vlines', label: t('lines ↕') },
  { value: 'hlines', label: t('lines ↔') },
  { value: 'smooth', label: t('smooth') },
  { value: 'fluid', label: t('fluid') },
];
const EYE_FRAMES: { value: EyeFrame; label: string }[] = [
  { value: 'square', label: t('square') },
  { value: 'rounded', label: t('rounded') },
  { value: 'extra', label: t('round') },
  { value: 'circle', label: t('circle') },
  { value: 'leaf', label: t('leaf') },
  { value: 'dotted', label: t('dotted') },
];
const EYE_BALLS: { value: EyeBall; label: string }[] = [
  { value: 'square', label: t('square') },
  { value: 'rounded', label: t('rounded') },
  { value: 'circle', label: t('circle') },
  { value: 'diamond', label: t('diamond') },
  { value: 'leaf', label: t('leaf') },
  { value: 'star', label: t('star') },
];
const FRAMES: { value: FrameKind; label: string }[] = [
  { value: 'none', label: t('none') },
  { value: 'box', label: t('box') },
  { value: 'rounded', label: t('rounded') },
  { value: 'top', label: t('text on top') },
  { value: 'banner', label: t('banner') },
  { value: 'bubble', label: t('bubble') },
];
const JOINED: DotShape[] = ['square', 'smooth', 'fluid'];
const ECL_HELP = t(
  'How much of the code can be covered or damaged and still read. L 7 %, M 15 %, Q 25 %, H 30 %. Higher levels make the code denser; with a logo in the middle use H.',
);

/** One option row: label (with help) and its control. */
function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="opt-row" role="group" aria-labelledby={id}>
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        <span className="opt-label" id={id}>
          {label}
        </span>
        {help && <Help label={label} text={help} />}
      </span>
      {children}
    </div>
  );
}

/** A text box (one line, a date, or several lines with `area`). */
function Field({ label, value, onChange, type = 'text', placeholder, mono, area, help }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; mono?: boolean; area?: boolean; help?: string }) {
  const id = useId();
  return (
    <div className="field grow">
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        {help && <Help label={label} text={help} />}
      </span>
      {area ? (
        <textarea id={id} className={`textarea qr-area${mono ? ' mono' : ''}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className={`input${mono ? ' mono' : ''}`} type={type} value={value} placeholder={placeholder} spellCheck={false} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function Slider({ value, min, max, step, onChange, show }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; show: string }) {
  return (
    <div className="range">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{show}</output>
    </div>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <input type="color" className="give-color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Buttons with a picture of each choice. */
function Picker<T extends string>({ label, options, value, onChange, pic }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; pic: (v: T) => string }) {
  return (
    <div className="qr-picks" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="qr-pick" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          <img src={pic(o.value)} alt="" />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Solid colour or a gradient of 2–3 colours. */
function FillEditor({ label, fill, onChange, extra }: { label: string; fill: Fill; onChange: (f: Fill) => void; extra?: ReactNode }) {
  const setColor = (i: number, c: string) => onChange({ ...fill, colors: fill.colors.map((x, j) => (j === i ? c : x)) });
  const setType = (type: Fill['type']) => {
    const colors = type === 'solid' ? fill.colors.slice(0, 1) : fill.colors.length >= 2 ? fill.colors : [fill.colors[0] ?? '#000000', luminance(fill.colors[0] ?? '#000') > 0.5 ? '#dfe7ff' : '#3b5bdb'];
    onChange({ ...fill, type, colors });
  };
  return (
    <>
      <Row label={label}>
        <span className="inline">
          <Segmented
            label={t('{label} fill', { label })}
            compact
            value={fill.type}
            options={[
              { value: 'solid', label: t('colour') },
              { value: 'linear', label: t('gradient') },
              { value: 'radial', label: t('radial') },
            ]}
            onChange={setType}
          />
          {extra}
        </span>
      </Row>
      <div className="qr-colors">
        {fill.colors.map((c, i) => (
          <span key={i} className="qr-color">
            <Color label={t('{label} colour {n}', { label, n: i + 1 })} value={c} onChange={(v) => setColor(i, v)} />
            {fill.type !== 'solid' && fill.colors.length > 2 && (
              <button type="button" className="btn btn-sm" aria-label={t('Remove colour {n}', { n: i + 1 })} onClick={() => onChange({ ...fill, colors: fill.colors.filter((_, j) => j !== i) })}>
                ×
              </button>
            )}
          </span>
        ))}
        {fill.type !== 'solid' && fill.colors.length < 3 && (
          <button type="button" className="btn btn-sm" onClick={() => onChange({ ...fill, colors: [...fill.colors, fill.colors[fill.colors.length - 1]] })}>
            {t('+ colour')}
          </button>
        )}
      </div>
      {fill.type === 'linear' && (
        <Row label={t('Direction')}>
          <Slider value={fill.angle} min={0} max={360} step={5} onChange={(angle) => onChange({ ...fill, angle })} show={`${fill.angle}°`} />
        </Row>
      )}
    </>
  );
}

/** A picture file as a PNG data URL at most 512 px (so it can go inside the SVG and be saved). */
async function readLogo(file: File): Promise<StoredLogo> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const nw = img.naturalWidth || 512;
    const nh = img.naturalHeight || 512;
    const k = Math.min(1, 512 / Math.max(nw, nh));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(nw * k));
    c.height = Math.max(1, Math.round(nh * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return { url: c.toDataURL('image/png'), w: c.width, h: c.height, name: file.name };
  } catch {
    throw new Error(t('That picture couldn’t be opened.'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The colours a fill uses (all stops of a gradient). */
const colorsOf = (f: Fill) => (f.type === 'solid' ? f.colors.slice(0, 1) : f.colors);

function warnings(s: QrStyle, ecl: Ecl, logo: boolean) {
  const out: string[] = [];
  const bgs = s.transparent ? ['#ffffff'] : colorsOf(s.bg);
  const fgs = [...colorsOf(s.fg), ...(s.eyeColors ? [s.eyeFrameColor, s.eyeBallColor] : [])];
  let low = Infinity;
  for (const a of fgs) for (const b of bgs) low = Math.min(low, contrast(a, b));
  const dark = (cs: string[]) => cs.reduce((sum, c) => sum + luminance(c), 0) / cs.length;
  if (dark(fgs) > dark(bgs)) out.push(t('Light dots on a dark background: most phones read it, some older scanners don’t.'));
  if (low < 3) out.push(t('Low contrast ({ratio} : 1). Make the dots darker or the background lighter; 4 : 1 or more is safe.', { ratio: fmtNum(low, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }));
  if (s.transparent) out.push(t('See-through background: put it on something light, or the code may not read.'));
  if (logo && ecl !== 'H') out.push(t('With a logo, error correction H keeps the code readable.'));
  if (s.margin < 2) out.push(t('Scanners want empty room around the code: at least 2 (4 is best).'));
  return out;
}

export default function QrMaker() {
  const [s, setS] = useState<State>(DEFAULTS);
  useAutosave<State>('qr-code', s, (v) => setS(restore(v)));
  const [tab, setTab] = useState<'dots' | 'eyes' | 'colors' | 'logo' | 'frame'>('dots');
  const [logoError, setLogoError] = useState('');
  const [mapLink, setMapLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const st = s.style;

  const setStyle = (p: Partial<QrStyle>) => setS((o) => ({ ...o, style: { ...o.style, ...p } }));
  const edit = <K extends Kind>(k: K, p: Partial<Content[K]>) => setS((o) => ({ ...o, content: { ...o.content, [k]: { ...o.content[k], ...p } } }));
  const c = s.content;

  const payload = useMemo(() => payloadOf(c), [c]);
  const text = 'text' in payload ? payload.text : null;
  const code = useMemo(() => encode(text ?? 'https://example.com', s.ecl), [text, s.ecl]);

  // The caption's font, written into the SVG.
  const caption = st.frame !== 'none' && st.frameText.trim() !== '';
  const [font, setFont] = useState<{ family: string; css: string } | null>(null);
  useEffect(() => {
    if (!caption || font?.family === st.frameFont) return;
    let alive = true;
    fontCss(st.frameFont)
      .then((css) => alive && setFont({ family: st.frameFont, css }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [caption, st.frameFont, font?.family]);
  const css = font?.family === st.frameFont ? font.css : undefined;

  const drawn = useMemo(() => ('matrix' in code ? renderSvg(code.matrix, st, { logo: s.logo ?? undefined, fontCss: css }) : null), [code, st, s.logo, css]);
  const url = useMemo(() => (drawn ? URL.createObjectURL(new Blob([drawn.svg], { type: 'image/svg+xml' })) : ''), [drawn]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  // Read the result back like a phone would, a moment after the last change.
  const key = drawn && text ? drawn.svg + text : '';
  const [scan, setScan] = useState<{ key: string; r: ScanResult } | null>(null);
  useEffect(() => {
    if (!key || !drawn || !text || !('matrix' in code)) return;
    const timer = setTimeout(async () => {
      const px = Math.min(1600, Math.round(drawn.w * 10));
      const big = renderSvg(code.matrix, st, { px, logo: s.logo ?? undefined, fontCss: css, id: 'check' });
      try {
        setScan({ key, r: await checkScan(big.svg, px, Math.round((px * big.h) / big.w), text, big.w) });
      } catch {
        setScan({ key, r: { ok: false } });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [key, drawn, text, code, st, s.logo, css]);
  const scanNow = scan?.key === key ? scan.r : null;
  const warn = warnings(st, s.ecl, !!s.logo);

  // ---- export ----
  const ext = s.format === 'jpeg' ? 'jpg' : s.format;
  const fileName = `qr-${c.kind}.${ext}`;
  async function makeFile(format: Format): Promise<Blob> {
    if (!('matrix' in code)) throw new Error(code.error);
    const out = renderSvg(code.matrix, st, { px: s.px, logo: s.logo ?? undefined, fontCss: css, id: 'qr' });
    if (format === 'svg') return new Blob([out.svg], { type: 'image/svg+xml' });
    const canvas = await toCanvas(out.svg, s.px, Math.round((s.px * out.h) / out.w), format === 'jpeg');
    return toBlob(canvas, `image/${format}`, format === 'png' ? undefined : 0.92);
  }
  const download = async () => {
    setBusy(true);
    try {
      saveBlob(await makeFile(s.format), fileName);
    } finally {
      setBusy(false);
    }
  };
  const copyImage = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': makeFile('png') })]);
      setCopied(t('Copied: paste it anywhere.'));
    } catch {
      setCopied(t('Copying pictures isn’t allowed here; download it instead.'));
    }
    setTimeout(() => setCopied(''), 2500);
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoError('');
    try {
      const logo = await readLogo(file);
      setS((o) => ({ ...o, logo, ecl: 'H' }));
    } catch (e) {
      setLogoError((e as Error).message);
    }
  };

  const applyPalette = (p: Palette) => {
    const { name: _, ...rest } = p;
    setStyle(rest);
  };

  // Option pictures follow the current colours where that helps.
  const dotPics = useMemo(() => Object.fromEntries(DOTS.map((d) => [d.value, icon({ dots: d.value, dotSize: st.dotSize }, `d-${d.value}`)])), [st.dotSize]);
  const framePics = useMemo(() => Object.fromEntries(EYE_FRAMES.map((d) => [d.value, icon({ eyeFrame: d.value, eyeColors: true, eyeFrameColor: '#3b5bdb', eyeBallColor: '#1b1b1f' }, `f-${d.value}`)])), []);
  const ballPics = useMemo(() => Object.fromEntries(EYE_BALLS.map((d) => [d.value, icon({ eyeBall: d.value, eyeColors: true, eyeFrameColor: '#1b1b1f', eyeBallColor: '#3b5bdb' }, `b-${d.value}`)])), []);
  const boxPics = useMemo(() => Object.fromEntries(FRAMES.map((d) => [d.value, icon({ frame: d.value, frameText: '', frameColor: '#3b5bdb' }, `x-${d.value}`)])), []);
  const palPics = useMemo(() => Object.fromEntries(PALETTES.map((p) => [p.name, icon({ ...p, dots: st.dots, eyeFrame: st.eyeFrame, eyeBall: st.eyeBall }, `p-${p.name}`)])), [st.dots, st.eyeFrame, st.eyeBall]);

  const form = (() => {
    switch (c.kind) {
      case 'link':
        return <Field label={t('Address')} value={c.link.url} onChange={(url) => edit('link', { url })} placeholder={t('example.com/page')} mono />;
      case 'text':
        return <Field label={t('Text')} area value={c.text.text} onChange={(text) => edit('text', { text })} placeholder={t('Anything: a note, a code, a poem…')} />;
      case 'wifi':
        return (
          <>
            <Field label={t('Network name (SSID)')} value={c.wifi.ssid} onChange={(ssid) => edit('wifi', { ssid })} />
            <Row label={t('Security')}>
              <Segmented
                label={t('Security')}
                compact
                value={c.wifi.security}
                options={[
                  { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
                  { value: 'WEP', label: t('WEP') },
                  { value: 'nopass', label: t('no password') },
                ]}
                onChange={(security) => edit('wifi', { security })}
              />
            </Row>
            {c.wifi.security !== 'nopass' && <Field label={t('Password')} value={c.wifi.password} onChange={(password) => edit('wifi', { password })} mono />}
            <Row label={t('Hidden network')} help={t('Turn on if the network doesn\'t show up in the list of networks, so the phone looks for it by name.')}>
              <input type="checkbox" className="qr-check" checked={c.wifi.hidden} onChange={(e) => edit('wifi', { hidden: e.target.checked })} />
            </Row>
            <p className="note">{t('Phones join the network when they scan it: no typing the password.')}</p>
          </>
        );
      case 'contact': {
        const k = c.contact;
        const f = (key: keyof typeof k, label: string, extra?: { placeholder?: string; area?: boolean; type?: string }) => (
          <Field label={label} value={k[key]} onChange={(v) => edit('contact', { [key]: v } as Partial<Content['contact']>)} {...extra} />
        );
        return (
          <>
            <div className="inline">
              {f('first', t('First name'))}
              {f('last', t('Last name'))}
            </div>
            <div className="inline">
              {f('mobile', t('Mobile'), { placeholder: '+420 777 123 456', type: 'tel' })}
              {f('work', t('Work phone'), { type: 'tel' })}
            </div>
            <div className="inline">
              {f('email', t('E-mail'), { type: 'email' })}
              {f('web', t('Website'))}
            </div>
            <div className="inline">
              {f('org', t('Company'))}
              {f('title', t('Job title'))}
            </div>
            {f('street', t('Street'))}
            <div className="inline">
              {f('city', t('City'))}
              {f('zip', t('Postcode'))}
            </div>
            <div className="inline">
              {f('region', t('Region'))}
              {f('country', t('Country'))}
            </div>
            {f('note', t('Note'), { area: true })}
            <p className="note">{t('Scanning it offers to save the contact (vCard).')}</p>
          </>
        );
      }
      case 'email':
        return (
          <>
            <Field label={t('To')} type="email" value={c.email.to} onChange={(to) => edit('email', { to })} placeholder={t('someone@example.com')} />
            <Field label={t('Subject')} value={c.email.subject} onChange={(subject) => edit('email', { subject })} />
            <Field label={t('Message')} area value={c.email.body} onChange={(body) => edit('email', { body })} />
          </>
        );
      case 'sms':
        return (
          <>
            <Field label={t('Phone number')} type="tel" value={c.sms.number} onChange={(number) => edit('sms', { number })} placeholder="+420 777 123 456" />
            <Field label={t('Message')} area value={c.sms.message} onChange={(message) => edit('sms', { message })} />
          </>
        );
      case 'phone':
        return <Field label={t('Phone number')} type="tel" value={c.phone.number} onChange={(number) => edit('phone', { number })} placeholder="+420 777 123 456" />;
      case 'whatsapp':
        return (
          <>
            <Field label={t('Phone number')} type="tel" value={c.whatsapp.number} onChange={(number) => edit('whatsapp', { number })} placeholder="+420 777 123 456" help={t('With the country code (420 for Czechia), as WhatsApp wants it.')} />
            <Field label={t('Message')} area value={c.whatsapp.message} onChange={(message) => edit('whatsapp', { message })} placeholder={t('Typed in for them, ready to send')} />
          </>
        );
      case 'location': {
        const found = mapLink ? coordsFrom(mapLink) : null;
        return (
          <>
            <Field
              label={t('Map link or coordinates')}
              value={mapLink}
              placeholder={t('Paste a Google Maps, Mapy.cz or OpenStreetMap link')}
              mono
              onChange={(v) => {
                setMapLink(v);
                const p = coordsFrom(v);
                if (p) edit('location', { lat: String(p.lat), lng: String(p.lng) });
              }}
            />
            {mapLink && !found && <p className="note">{t('No coordinates in that link. Type them below (right-click the place on the map to copy them).')}</p>}
            <div className="inline">
              <Field label={t('Latitude')} value={c.location.lat} onChange={(lat) => edit('location', { lat })} placeholder="50.0875" mono />
              <Field label={t('Longitude')} value={c.location.lng} onChange={(lng) => edit('location', { lng })} placeholder="14.4214" mono />
            </div>
            <Row label={t('Opens as')} help={t('A map link opens on every phone. geo: asks the phone which map app to use, but iPhones don\'t all understand it.')}>
              <Segmented
                label={t('Opens as')}
                compact
                value={c.location.as}
                options={[
                  { value: 'maps', label: t('map link') },
                  { value: 'geo', label: t('geo:') },
                ]}
                onChange={(as) => edit('location', { as })}
              />
            </Row>
          </>
        );
      }
      case 'event':
        return (
          <>
            <Field label={t('Name')} value={c.event.title} onChange={(title) => edit('event', { title })} />
            <Field label={t('Place')} value={c.event.place} onChange={(place) => edit('event', { place })} />
            <Row label={t('All day')}>
              <input type="checkbox" className="qr-check" checked={c.event.allDay} onChange={(e) => edit('event', { allDay: e.target.checked, start: c.event.start.slice(0, 10), end: c.event.end.slice(0, 10) })} />
            </Row>
            <div className="inline">
              <Field label={t('Starts')} type={c.event.allDay ? 'date' : 'datetime-local'} value={c.event.allDay ? c.event.start.slice(0, 10) : c.event.start} onChange={(start) => edit('event', { start })} />
              <Field label={t('Ends')} type={c.event.allDay ? 'date' : 'datetime-local'} value={c.event.allDay ? c.event.end.slice(0, 10) : c.event.end} onChange={(end) => edit('event', { end })} />
            </div>
            <Field label={t('Notes')} area value={c.event.notes} onChange={(notes) => edit('event', { notes })} />
            <p className="note">{t('Scanning it offers to add the event to the calendar, at the time you typed (the phone\'s own time zone).')}</p>
          </>
        );
      case 'payment': {
        const p = c.payment;
        const epc = p.scheme === 'epc';
        return (
          <>
            <Row label={t('Kind')} help={t('QR Platba is what Czech bank apps read (in CZK). EPC (the European “GiroCode”) is for euro SEPA payments, read by many bank apps in Germany, Austria, the Netherlands, Finland, Belgium and others.')}>
              <Segmented
                label={t('Payment kind')}
                compact
                value={p.scheme}
                options={[
                  { value: 'spayd', label: t('QR Platba (CZK)') },
                  { value: 'epc', label: t('EPC / SEPA (EUR)') },
                ]}
                onChange={(scheme) => edit('payment', { scheme })}
              />
            </Row>
            <Field
              label={epc ? t('IBAN') : t('Account')}
              value={p.account}
              onChange={(account) => edit('payment', { account })}
              placeholder={epc ? 'DE89 3704 0044 0532 0130 00' : t('19-2000145399/0800 or CZ65…')}
              mono
              help={epc ? undefined : t('Number/bank code (with the prefix before the dash, if it has one), or an IBAN. It is turned into an IBAN and checked.')}
            />
            <div className="inline">
              <Field label={t('Amount ({currency})', { currency: epc ? 'EUR' : 'CZK' })} value={p.amount} onChange={(amount) => edit('payment', { amount })} placeholder="250.00" mono />
              {epc ? <Field label={t('BIC (optional)')} value={p.bic} onChange={(bic) => edit('payment', { bic })} mono /> : <Field label={t('Variable symbol')} value={p.vs} onChange={(vs) => edit('payment', { vs })} mono />}
            </div>
            <Field label={epc ? t('Recipient name') : t('Recipient name (optional)')} value={p.name} onChange={(name) => edit('payment', { name })} />
            <Field label={t('Message for the recipient')} value={p.message} onChange={(message) => edit('payment', { message })} />
            <p className="note">{t('The bank app fills in the payment; you still check and confirm it there.')}</p>
          </>
        );
      }
      case 'crypto':
        return (
          <>
            <Row label={t('Coin')}>
              <Segmented
                label={t('Coin')}
                compact
                value={c.crypto.coin}
                options={[
                  { value: 'bitcoin', label: t('Bitcoin') },
                  { value: 'ethereum', label: t('Ethereum') },
                  { value: 'litecoin', label: t('Litecoin') },
                ]}
                onChange={(coin) => edit('crypto', { coin })}
              />
            </Row>
            <Field label={t('Wallet address')} value={c.crypto.address} onChange={(address) => edit('crypto', { address })} mono />
            <div className="inline">
              <Field label={t('Amount (optional)')} value={c.crypto.amount} onChange={(amount) => edit('crypto', { amount })} placeholder="0.001" mono />
              {c.crypto.coin !== 'ethereum' && <Field label={t('Label (optional)')} value={c.crypto.label} onChange={(label) => edit('crypto', { label })} />}
            </div>
          </>
        );
    }
  })();

  const bytes = text ? new TextEncoder().encode(text).length : 0;
  const preview = (
    <div className="qr-preview">
      <div className={`qr-stage${st.transparent ? ' checker' : ''}`}>
        {url && <img src={url} alt={t('QR code preview')} style={{ aspectRatio: drawn ? `${drawn.w} / ${drawn.h}` : undefined, opacity: text ? 1 : 0.35 }} />}
      </div>
      {!text && <p className="note qr-example">{'error' in payload ? payload.error : t('An example. Fill in the content on the left and your code appears here.')}</p>}
      {text && 'error' in code && <p className="error-text">{code.error}</p>}
      {text && 'matrix' in code && (
        <p className={`qr-status${scanNow ? (scanNow.ok ? ' ok' : ' bad') : ''}`} aria-live="polite">
          {!scanNow
            ? t('checking that it scans…')
            : scanNow.ok
              ? scanNow.inverted
                ? t('✓ scans (with light and dark swapped)')
                : t('✓ scans: a phone reads it right')
              : scanNow.wrong
                ? t('⚠ reads, but not what you typed')
                : t('⚠ may not scan: try more contrast, plainer dots, a smaller logo or a higher error correction')}
        </p>
      )}
      {text && warn.length > 0 && (
        <ul className="warn-list">
          {warn.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );

  const output = (
    <section className="panel" aria-label={t('Save the QR code')}>
      <Row label={t('Format')}>
        <Segmented
          label={t('Format')}
          compact
          value={s.format}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'svg', label: 'SVG' },
            { value: 'jpeg', label: 'JPG' },
            { value: 'webp', label: 'WebP' },
          ]}
          onChange={(format) => setS((o) => ({ ...o, format }))}
        />
      </Row>
      {s.format !== 'svg' && (
        <Row label={t('Size')} help={t('Width of the picture in pixels. 1024 is plenty for screens and small prints; 2048–4096 for posters. SVG is sharp at any size.')}>
          <Segmented
            label={t('Size')}
            compact
            value={String(s.px)}
            options={['256', '512', '1024', '2048', '4096'].map((v) => ({ value: v, label: v }))}
            onChange={(v) => setS((o) => ({ ...o, px: Number(v) }))}
          />
        </Row>
      )}
      <div className="inline">
        <button type="button" className="btn btn-primary" disabled={!text || !('matrix' in code) || busy} onClick={download}>
          {busy ? t('making…') : t('download {fileName}', { fileName })}
        </button>
        <button type="button" className="btn" disabled={!text || !('matrix' in code)} onClick={copyImage}>
          {t('copy picture')}
        </button>
      </div>
      {copied && (
        <p className="note" aria-live="polite">
          {copied}
        </p>
      )}
    </section>
  );

  return (
    <Workbench preview={preview} output={output}>
      <Panel title={t('content')}>
        <div className="chips" role="group" aria-label={t('What the code holds')}>
          {KINDS.map((k) => (
            <button key={k.id} type="button" className="chip" aria-pressed={c.kind === k.id} onClick={() => setS((o) => ({ ...o, content: { ...o.content, kind: k.id } }))}>
              {k.label}
            </button>
          ))}
        </div>
        <div className="qr-form">{form}</div>
        {'error' in payload && <p className="error-text">{payload.error}</p>}
        {text && (
          <>
            <div className="field">
              <span className="opt-row">
                <span className="field-label">{t('What\'s in the code')}</span>
                <CopyButton text={text} />
              </span>
              <pre className="qr-payload">{text}</pre>
            </div>
            {'matrix' in code && (
              <p className="note">
                {t('version {v} · {n} × {n} squares · {bytes} bytes ({pct} % of the most a code holds at {ecl})', {
                  v: code.version,
                  n: code.matrix.size,
                  bytes,
                  pct: Math.max(1, Math.round((bytes / MAX_BYTES[s.ecl]) * 100)),
                  ecl: s.ecl,
                })}
              </p>
            )}
          </>
        )}
      </Panel>

      <Panel
        title={t('look')}
        actions={
          <button type="button" className="btn btn-sm" onClick={() => setS((o) => ({ ...o, style: DEFAULT_STYLE, logo: null, ecl: 'M' }))}>
            {t('reset look')}
          </button>
        }
      >
        <Tabs
          idPrefix="qr"
          label={t('Look')}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'dots', label: t('dots') },
            { id: 'eyes', label: t('corners') },
            { id: 'colors', label: t('colours') },
            { id: 'logo', label: t('logo'), dot: !!s.logo },
            { id: 'frame', label: t('frame'), dot: st.frame !== 'none' },
          ]}
        />
        {tab === 'dots' && (
          <TabPanel idPrefix="qr" id="dots">
            <Picker label={t('Dot shape')} options={DOTS} value={st.dots} onChange={(dots) => setStyle({ dots })} pic={(v) => dotPics[v]} />
            {!JOINED.includes(st.dots) && (
              <Row label={t('Dot size')}>
                <Slider value={st.dotSize} min={0.5} max={1} step={0.05} onChange={(dotSize) => setStyle({ dotSize })} show={`${Math.round(st.dotSize * 100)} %`} />
              </Row>
            )}
            <Row label={t('Error correction')} help={ECL_HELP}>
              <Segmented
                label={t('Error correction')}
                compact
                value={s.ecl}
                options={[
                  { value: 'L', label: 'L 7 %' },
                  { value: 'M', label: 'M 15 %' },
                  { value: 'Q', label: 'Q 25 %' },
                  { value: 'H', label: 'H 30 %' },
                ]}
                onChange={(ecl) => setS((o) => ({ ...o, ecl }))}
              />
            </Row>
            <Row label={t('Empty border')} help={t('The quiet zone around the code, in squares. Scanners find the code more easily with 4.')}>
              <Slider value={st.margin} min={0} max={8} step={1} onChange={(margin) => setStyle({ margin })} show={String(st.margin)} />
            </Row>
          </TabPanel>
        )}
        {tab === 'eyes' && (
          <TabPanel idPrefix="qr" id="eyes">
            <span className="opt-label">{t('Corner frame')}</span>
            <Picker label={t('Corner frame')} options={EYE_FRAMES} value={st.eyeFrame} onChange={(eyeFrame) => setStyle({ eyeFrame })} pic={(v) => framePics[v]} />
            <span className="opt-label">{t('Corner middle')}</span>
            <Picker label={t('Corner middle')} options={EYE_BALLS} value={st.eyeBall} onChange={(eyeBall) => setStyle({ eyeBall })} pic={(v) => ballPics[v]} />
          </TabPanel>
        )}
        {tab === 'colors' && (
          <TabPanel idPrefix="qr" id="colors">
            <div className="qr-picks" role="group" aria-label={t('Ready colours')}>
              {PALETTES.map((p) => (
                <button key={p.name} type="button" className="qr-pick" onClick={() => applyPalette(p)}>
                  <img src={palPics[p.name]} alt="" />
                  <span>{t(p.name)}</span>
                </button>
              ))}
            </div>
            <FillEditor label={t('Dots')} fill={st.fg} onChange={(fg) => setStyle({ fg })} />
            <FillEditor
              label={t('Background')}
              fill={st.bg}
              onChange={(bg) => setStyle({ bg })}
              extra={
                <label className="qr-inline-check">
                  <input type="checkbox" className="qr-check" checked={st.transparent} onChange={(e) => setStyle({ transparent: e.target.checked })} /> {t('see-through')}
                </label>
              }
            />
            <Row label={t('Own corner colours')}>
              <span className="inline">
                <input type="checkbox" className="qr-check" aria-label={t('Own corner colours')} checked={st.eyeColors} onChange={(e) => setStyle({ eyeColors: e.target.checked })} />
                {st.eyeColors && (
                  <>
                    <Color label={t('Corner frame colour')} value={st.eyeFrameColor} onChange={(eyeFrameColor) => setStyle({ eyeFrameColor })} />
                    <Color label={t('Corner middle colour')} value={st.eyeBallColor} onChange={(eyeBallColor) => setStyle({ eyeBallColor })} />
                  </>
                )}
              </span>
            </Row>
          </TabPanel>
        )}
        {tab === 'logo' && (
          <TabPanel idPrefix="qr" id="logo">
            <label
              className="qr-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void pickLogo(e.dataTransfer.files[0]);
              }}
            >
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pickLogo(e.target.files?.[0])} />
              {s.logo ? <img src={s.logo.url} alt="" /> : null}
              <span>{s.logo ? t('{name} · pick another', { name: s.logo.name }) : t('Drop a logo here or click to pick one (PNG, JPG, SVG, WebP)')}</span>
            </label>
            {logoError && <p className="error-text">{logoError}</p>}
            {s.logo && (
              <>
                <Row label={t('Size')}>
                  <Slider value={st.logoSize} min={0.1} max={0.3} step={0.01} onChange={(logoSize) => setStyle({ logoSize })} show={`${Math.round(st.logoSize * 100)} %`} />
                </Row>
                <Row label={t('Clear the dots under it')}>
                  <input type="checkbox" className="qr-check" checked={st.logoClear} onChange={(e) => setStyle({ logoClear: e.target.checked })} />
                </Row>
                <Row label={t('Plate behind it')}>
                  <input type="checkbox" className="qr-check" checked={st.logoPlate} onChange={(e) => setStyle({ logoPlate: e.target.checked })} />
                </Row>
                <button type="button" className="btn btn-sm" onClick={() => setS((o) => ({ ...o, logo: null }))}>
                  {t('remove logo')}
                </button>
              </>
            )}
            <p className="note">{t('The logo covers part of the code; error correction H (set when you add one) rebuilds what\'s under it. Keep it under about 25 %.')}</p>
          </TabPanel>
        )}
        {tab === 'frame' && (
          <TabPanel idPrefix="qr" id="frame">
            <Picker label={t('Frame')} options={FRAMES} value={st.frame} onChange={(frame) => setStyle({ frame })} pic={(v) => boxPics[v]} />
            {st.frame !== 'none' && (
              <>
                <Field label={t('Text')} value={st.frameText} onChange={(frameText) => setStyle({ frameText })} placeholder={t('SCAN ME')} />
                <Row label={t('Colours')}>
                  <span className="inline">
                    <Color label={t('Frame colour')} value={st.frameColor} onChange={(frameColor) => setStyle({ frameColor })} />
                    <Color label={t('Text colour')} value={st.frameTextColor} onChange={(frameTextColor) => setStyle({ frameTextColor })} />
                  </span>
                </Row>
                <Row label={t('Font')}>
                  <select className="select" value={st.frameFont} onChange={(e) => setStyle({ frameFont: e.target.value })}>
                    {QR_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </Row>
              </>
            )}
          </TabPanel>
        )}
      </Panel>

      <SavedPanel<Look>
        slug="qr-code"
        title={t('my qr looks')}
        help={t('Keeps the look (shapes, colours, logo, frame), not what\'s in the code, so you can use it again. Saved in this browser.')}
        suggestName={() => (st.frame !== 'none' && st.frameText.trim()) || `${st.dots} ${st.eyeFrame}`}
        getData={() => ({ style: st, ecl: s.ecl, logo: s.logo })}
        onLoad={(d) => setS((o) => ({ ...o, style: { ...DEFAULT_STYLE, ...d.style }, ecl: d.ecl ?? o.ecl, logo: d.logo ?? null }))}
        describe={(i) => `${i.data.style.dots} dots · ${i.data.style.eyeFrame} corners${i.data.logo ? ' · logo' : ''}${i.data.style.frame !== 'none' ? ' · frame' : ''}`}
      />
    </Workbench>
  );
}
