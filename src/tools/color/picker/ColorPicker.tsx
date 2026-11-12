import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Workbench } from '../../../components/Workbench';
import { Panel, Tabs, TabPanel } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { fromHex, hsvToRgb, parseColor, rgbToHsv, toHex, type RGB } from '../../../lib/color';
import { MC_COLORS } from '../../../lib/mc/text';
import { useAutosave } from '../../../lib/saved';
import { Channels, HueStrip, SvSquare } from './Pickers';
import { ImagePick, PICK_IMAGE_ACCEPTS } from './ImagePick';
import { BigSwatch, ContrastCard, MinecraftCard, Notations, RelativesCard, Strip, VisionCard } from './Cards';
import { t } from '../../../lib/i18n-core';

/** The color, and the hue and saturation it was picked with (grays and black have none of their own). */
type State = { rgb: RGB; h: number; s: number };
type Saved = { color: string; recent: string[] };

const START = '#3B82F6';
const MAX_RECENT = 16;

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }
}

const isImage = (f: File) => f.type.startsWith('image/') || PICK_IMAGE_ACCEPTS.some((a) => f.name.toLowerCase().endsWith(a));

export default function ColorPicker() {
  const [params, setParams] = useSearchParams();
  const fromUrl = fromHex(params.get('c') ?? '');
  const [state, setState] = useState<State>(() => withHsv(fromUrl ?? fromHex(START)!, { h: 0, s: 0 }));
  const [recent, setRecent] = useState<string[]>([]);
  const [tab, setTab] = useState<'picker' | 'image'>('picker');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const color = state.rgb;
  const hex = toHex(color);

  const set = (rgb: RGB) => setState((cur) => withHsv(rgb, cur));

  // The last color comes back on the next visit (a link with ?c= wins).
  useAutosave<Saved>('color-picker', { color: hex, recent }, (v) => {
    const c = fromHex(v.color ?? '');
    if (c && !fromUrl) set(c);
    if (Array.isArray(v.recent)) setRecent(v.recent.filter((x) => fromHex(x)).slice(0, MAX_RECENT));
  });

  // The color in the address, so a link opens it (replaced, not a new history step each time).
  useEffect(() => {
    const timer = setTimeout(() => {
      const want = hex.slice(1).toLowerCase();
      if (params.get('c') !== want) setParams((p) => ({ ...Object.fromEntries(p), c: want }), { replace: true });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex]);

  // A color that stays a moment goes to "recent".
  useEffect(() => {
    const timer = setTimeout(() => setRecent((r) => [hex, ...r.filter((x) => x !== hex)].slice(0, MAX_RECENT)), 1200);
    return () => clearTimeout(timer);
  }, [hex]);

  // Pasting: a picture opens it to pick from; text that is a color takes it (not while typing in a field).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const img = [...(e.clipboardData?.files ?? [])].find(isImage);
      if (img) {
        e.preventDefault();
        setImageFile(img);
        setTab('image');
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, [contenteditable="true"]')) return;
      const c = parseColor(e.clipboardData?.getData('text') ?? '', MC_COLORS);
      if (c) set(c);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const [hsvH, hsvS, hsvV] = [state.h, state.s, rgbToHsv(color)[2]];
  const canDrop = typeof window !== 'undefined' && !!window.EyeDropper;

  const side = (
    <Panel title={t('this color')}>
      <BigSwatch color={color} />
      <Notations color={color} />
    </Panel>
  );

  return (
    <Workbench preview={side}>
      <Panel title={t('pick a color')}>
        <div className="cp-top">
          <ColorField color={color} onColor={set} />
          {canDrop && (
            <button
              type="button"
              className="btn"
              title={t('Take a color from anywhere on the screen')}
              onClick={() =>
                void new window.EyeDropper!()
                  .open()
                  .then((r) => {
                    const c = fromHex(r.sRGBHex) ?? parseColor(r.sRGBHex);
                    if (c) set(c);
                  })
                  .catch(() => {})
              }
            >
              {t('eyedropper')}
            </button>
          )}
          <Help label={t('Color')} text={t('Type or paste any color: #3b82f6, 3b82f6, rgb(59 130 246), hsl(…), oklch(…), a name like tomato, a number like 3900150 (Minecraft), or &9. Pasting anywhere on the page works too, also a picture.')} />
        </div>

        <Tabs
          idPrefix="cp"
          label={t('How to pick')}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'picker', label: t('picker') },
            { id: 'image', label: t('from a picture') },
          ]}
        />
        {tab === 'picker' ? (
          <TabPanel idPrefix="cp" id="picker">
            <div className="cp-picker">
              <SvSquare h={hsvH} s={hsvS} v={hsvV} onChange={(s, v) => setState((cur) => ({ rgb: hsvToRgb(cur.h, s, v), h: cur.h, s }))} />
              <HueStrip h={hsvH} onChange={(h) => setState((cur) => ({ rgb: hsvToRgb(h, cur.s, rgbToHsv(cur.rgb)[2]), h, s: cur.s }))} />
              <Channels color={color} hue={state.h} onChange={set} />
            </div>
          </TabPanel>
        ) : (
          <TabPanel idPrefix="cp" id="image">
            <ImagePick file={imageFile} onFile={setImageFile} onPick={set} />
          </TabPanel>
        )}

        {recent.length > 1 && (
          <div className="cp-recent">
            <span className="field-label">{t('Recent')}</span>
            <Strip colors={recent.map((x) => fromHex(x)!)} onPick={set} current={hex} />
          </div>
        )}
      </Panel>

      <ContrastCard color={color} />
      <RelativesCard color={color} onPick={set} />
      <VisionCard color={color} />
      <MinecraftCard color={color} onPick={set} />
    </Workbench>
  );
}


/** A new color keeps the old hue / saturation when it has none of its own (gray, black). */
function withHsv(rgb: RGB, prev: { h: number; s: number }): State {
  const [h, s, v] = rgbToHsv(rgb);
  return { rgb, h: s > 0 && v > 0 ? h : prev.h, s: v > 0 ? s : prev.s };
}

/** The text field: takes any color as soon as it reads as one; shows the hex again when you leave it. */
function ColorField({ color, onColor }: { color: RGB; onColor: (c: RGB) => void }) {
  const hex = toHex(color);
  const [text, setText] = useState(hex);
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(hex);
  }, [hex]);
  return (
    <span className="cp-field">
      <span className="cp-field-sw" style={{ background: hex }} />
      <input
        className="input mono"
        value={text}
        spellCheck={false}
        aria-label={t('Color')}
        aria-invalid={bad || undefined}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          setBad(false);
          setText(hex);
        }}
        onChange={(e) => {
          setText(e.target.value);
          const c = parseColor(e.target.value, MC_COLORS);
          setBad(!c && e.target.value.trim() !== '');
          if (c) onColor(c);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {bad && <span className="cp-field-bad">{t('not a color yet')}</span>}
    </span>
  );
}
