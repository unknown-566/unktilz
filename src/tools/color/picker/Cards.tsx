import { useMemo, useState } from 'react';
import { CopyButton, Panel, Segmented, useCopy } from '../../../components/ui';
import { Help } from '../../../components/Help';
import {
  contrast,
  fromHex,
  harmony,
  nearest,
  nearestName,
  notations,
  shades,
  simulate,
  textOn,
  tints,
  toDecimal,
  toHex,
  wcag,
  type HarmonyKind,
  type RGB,
  type Vision,
} from '../../../lib/color';
import { MC_COLORS, McText } from '../../../lib/mc/text';
import { baseById, buildPalette } from '../../../lib/mc/mapColors';
import { fmtNum, t, tx } from '../../../lib/i18n-core';

const WHITE: RGB = { r: 1, g: 1, b: 1 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };
const ratioText = (r: number) => `${fmtNum(Math.floor(r * 100) / 100, { maximumFractionDigits: 2 })}:1`;

/** A row of colors: a click takes one, a double-click copies its hex. */
export function Strip({ colors, onPick, current }: { colors: RGB[]; onPick: (c: RGB) => void; current?: string }) {
  const { copied, copy } = useCopy();
  const [last, setLast] = useState('');
  return (
    <div className="cp-strip">
      {colors.map((c, i) => {
        const hex = toHex(c);
        return (
          <button
            key={`${hex}-${i}`}
            type="button"
            className="cp-chip"
            aria-pressed={hex === current}
            style={{ background: hex, color: toHex(textOn(c)) }}
            title={t('{hex}: click to use it, double-click to copy', { hex })}
            onClick={() => onPick(c)}
            onDoubleClick={() => {
              setLast(hex);
              void copy(hex);
            }}
          >
            <span className="mono">{copied && last === hex ? t('copied') : hex}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The big sample on the right: the color, black and white text on it, and its nearest name. */
export function BigSwatch({ color }: { color: RGB }) {
  const hex = toHex(color);
  const name = nearestName(color);
  return (
    <div className="cp-big" style={{ background: hex }}>
      <span style={{ color: '#fff' }}>
        <b>Aa</b>
        <small className="mono">{ratioText(contrast(color, WHITE))}</small>
      </span>
      <span style={{ color: '#000', textAlign: 'right' }}>
        <b>Aa</b>
        <small className="mono">{ratioText(contrast(color, BLACK))}</small>
      </span>
      <p className="cp-name" style={{ color: toHex(textOn(color)) }}>
        {name.distance < 0.001 ? name.item.name : t('close to {name}', { name: name.item.name })}
      </p>
    </div>
  );
}

/** Every notation, each with a copy button. */
export function Notations({ color }: { color: RGB }) {
  return (
    <dl className="cp-notes">
      {notations(color).map((n) => (
        <div key={n.id} className="cp-note">
          <dt className="muted">{n.id === 'decimal' ? t('Decimal number') : n.id === 'float' ? t('RGB 0–1') : n.label}</dt>
          <dd className="mono">{n.value}</dd>
          <CopyButton text={n.value} />
        </div>
      ))}
    </dl>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`cp-badge${ok ? ' ok' : ''}`} title={ok ? t('passes') : t('fails')}>
      {ok ? '✓' : '✕'} {label}
    </span>
  );
}

function ContrastRow({ fg, bg, label }: { fg: RGB; bg: RGB; label: string }) {
  const r = contrast(fg, bg);
  const w = wcag(r);
  return (
    <div className="cp-contrast-row">
      <div className="cp-contrast-sample" style={{ background: toHex(bg), color: toHex(fg) }}>
        <b>Aa</b> <span>{t('Sample text')}</span>
      </div>
      <div className="cp-contrast-info">
        <span className="mono cp-ratio">{ratioText(r)}</span>
        <span className="muted">{label}</span>
        <span className="cp-badges">
          <Badge ok={w.aa} label="AA" />
          <Badge ok={w.aaa} label="AAA" />
          <Badge ok={w.aaLarge} label={t('AA large')} />
          <Badge ok={w.aaaLarge} label={t('AAA large')} />
        </span>
      </div>
    </div>
  );
}

export function ContrastCard({ color }: { color: RGB }) {
  const [bgText, setBgText] = useState('#1E1E1E');
  const bg = fromHex(bgText) ?? BLACK;
  return (
    <Panel
      title={t('contrast')}
      actions={<Help label={t('contrast')} text={t('How well text in this color reads (WCAG 2). Normal text needs 4.5:1 (AA) or 7:1 (AAA); large text (24 px, or 19 px bold) needs 3:1 or 4.5:1.')} />}
    >
      <ContrastRow fg={color} bg={WHITE} label={t('on white')} />
      <ContrastRow fg={color} bg={BLACK} label={t('on black')} />
      <ContrastRow fg={color} bg={bg} label={t('on your background')} />
      <label className="cp-bg-pick">
        <span>{t('Your background')}</span>
        <input type="color" value={toHex(bg).toLowerCase()} onChange={(e) => setBgText(e.target.value.toUpperCase())} aria-label={t('Your background')} />
        <span className="mono">{toHex(bg)}</span>
      </label>
    </Panel>
  );
}

const HARMONIES: { value: HarmonyKind; label: string }[] = [
  { value: 'complement', label: tx('complementary') },
  { value: 'triad', label: tx('triad') },
  { value: 'analogous', label: tx('analogous') },
  { value: 'split', label: tx('split') },
  { value: 'square', label: tx('tetrad') },
];

export function RelativesCard({ color, onPick }: { color: RGB; onPick: (c: RGB) => void }) {
  const [kind, setKind] = useState<HarmonyKind>('complement');
  const hex = toHex(color);
  return (
    <Panel title={t('related colors')}>
      <div className="opt-row">
        <span className="opt-label" id="cp-harmony">
          {t('Harmony')}
        </span>
        <Segmented labelledBy="cp-harmony" compact value={kind} onChange={setKind} options={HARMONIES.map((h) => ({ value: h.value, label: t(h.label) }))} />
        <Help label={t('Harmony')} text={t('Colors that go well together, picked by turning around the color wheel: the opposite one, three or four evenly spaced, or the neighbors.')} />
      </div>
      <Strip colors={harmony(color, kind)} onPick={onPick} current={hex} />
      <span className="field-label">{t('Lighter (mixed with white)')}</span>
      <Strip colors={tints(color)} onPick={onPick} current={hex} />
      <span className="field-label">{t('Darker (mixed with black)')}</span>
      <Strip colors={shades(color)} onPick={onPick} current={hex} />
    </Panel>
  );
}

const VISIONS: { id: Vision; label: string; note: string }[] = [
  { id: 'protanopia', label: tx('Protanopia'), note: tx('no red cones, about 1 % of men') },
  { id: 'deuteranopia', label: tx('Deuteranopia'), note: tx('no green cones, the most common, about 1 % of men') },
  { id: 'tritanopia', label: tx('Tritanopia'), note: tx('no blue cones, rare') },
  { id: 'achromatopsia', label: tx('Achromatopsia'), note: tx('no colors at all, very rare') },
];

export function VisionCard({ color }: { color: RGB }) {
  return (
    <Panel title={t('color blindness')}>
      <p className="note">{t('How people with color blindness see this color (left: as it is, right: as they see it).')}</p>
      <div className="cp-visions">
        {VISIONS.map((v) => {
          const s = simulate(color, v.id);
          return (
            <div key={v.id} className="cp-vision">
              <div className="cp-vision-pair">
                <span style={{ background: toHex(color) }} />
                <span style={{ background: toHex(s) }} />
              </div>
              <b>{t(v.label)}</b>
              <span className="muted">{t(v.note)}</span>
              <span className="mono">{toHex(s)}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

const SHADE_NAMES = [tx('a step lower'), tx('flat'), tx('a step higher')];

export function MinecraftCard({ color, onPick }: { color: RGB; onPick: (c: RGB) => void }) {
  const hex = toHex(color);
  const text = nearest(color, MC_COLORS, (c) => fromHex(c.hex)!);
  const flat = useMemo(() => buildPalette(false), []);
  const stairs = useMemo(() => buildPalette(true), []);
  const map = (list: typeof flat) => {
    const n = nearest(color, list, (p) => ({ r: p.r / 255, g: p.g / 255, b: p.b / 255 }));
    return { ...n.item, block: baseById.get(n.item.base)?.block ?? '?', rgb: { r: n.item.r / 255, g: n.item.g / 255, b: n.item.b / 255 } };
  };
  const mf = map(flat);
  const ms = map(stairs);
  const exact = text.distance < 0.001;
  return (
    <Panel title="Minecraft">
      <div className="cp-mc-row">
        <button type="button" className="cp-mc-sw" style={{ background: text.item.hex }} onClick={() => onPick(fromHex(text.item.hex)!)} title={t('Use this color')} />
        <div className="cp-mc-info">
          <b>{exact ? t('Text color') : t('Nearest text color')}</b>
          <span className="cp-mc-text">
            <McText text={`&${text.item.code}${text.item.label}`} />
          </span>
          <span className="cp-mc-codes">
            <code>&amp;{text.item.code}</code>
            <code>§{text.item.code}</code>
            <code>&lt;{text.item.name}&gt;</code>
            <CopyButton text={`&${text.item.code}`} label="&" />
            <CopyButton text={`<${text.item.name}>`} label="<…>" />
          </span>
        </div>
      </div>
      <div className="cp-mc-row">
        <span className="cp-mc-sw" style={{ background: hex }} />
        <div className="cp-mc-info">
          <b>{t('Exact color (1.16+)')}</b>
          <span className="cp-mc-codes">
            <code>&lt;{hex}&gt;</code>
            <code>&amp;{hex}</code>
            <CopyButton text={`<${hex}>`} label="<#…>" />
            <CopyButton text={`&${hex}`} label="&#…" />
          </span>
          <span className="muted">{t('MiniMessage, and the &# form many server plugins take.')}</span>
        </div>
      </div>
      <div className="cp-mc-row">
        <span className="cp-mc-sw" style={{ background: hex }} />
        <div className="cp-mc-info">
          <b>{t('Number for dyed leather, potions and fireworks')}</b>
          <span className="cp-mc-codes">
            <code>{toDecimal(color)}</code>
            <CopyButton text={String(toDecimal(color))} />
          </span>
          <span className="muted">{t('Used by dyed_color, potion_contents custom_color and firework colors.')}</span>
        </div>
      </div>
      <div className="cp-mc-row">
        <button type="button" className="cp-mc-sw" style={{ background: toHex(mf.rgb) }} onClick={() => onPick(mf.rgb)} title={t('Use this color')} />
        <div className="cp-mc-info">
          <b>{t('Map art block (flat)')}</b>
          <span>
            {mf.block} <span className="mono muted">{toHex(mf.rgb)}</span>
          </span>
        </div>
      </div>
      <div className="cp-mc-row">
        <button type="button" className="cp-mc-sw" style={{ background: toHex(ms.rgb) }} onClick={() => onPick(ms.rgb)} title={t('Use this color')} />
        <div className="cp-mc-info">
          <b>{t('Map art block (staircase)')}</b>
          <span>
            {ms.block} · {t(SHADE_NAMES[ms.shade])} <span className="mono muted">{toHex(ms.rgb)}</span>
          </span>
        </div>
      </div>
    </Panel>
  );
}
