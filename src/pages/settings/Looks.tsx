import { useEffect, useState, type CSSProperties } from 'react';
import { CopyButton } from '../../components/ui';
import { contrast, fromHex, toHex, wcag } from '../../lib/color';
import { MAIN_VARS, MORE_VARS, cssColor, derive, themeVars } from '../../lib/customTheme';
import {
  FONT_IDS,
  FONT_STACKS,
  MAX_CUSTOM,
  TEXT_SIZES,
  THEME_IDS,
  deleteCustomTheme,
  newThemeId,
  parseThemeCode,
  saveCustomTheme,
  setFont,
  setTextSize,
  setTheme,
  themeCode,
  themeName,
  useCustomThemes,
  useLook,
  useTheme,
  type CustomTheme,
  type FontId,
  type Theme,
  type ThemeChoice,
  type ThemeVar,
} from '../../lib/theme';
import { fmtNum, t } from '../../lib/i18n-core';

/** A small page in a theme's colors; [data-theme] gives it that theme whatever the site uses, `vars` an own theme's colors. */
function Swatch({ theme, vars }: { theme: Theme; vars?: Record<string, string> }) {
  return (
    <span className="theme-swatch" data-theme={theme} style={vars as CSSProperties | undefined} aria-hidden="true">
      <span className="ts-panel">
        <span className="ts-text">{'Aa' /* i18n-ignore */}</span>
        <span className="ts-line" />
        <span className="ts-accent" />
      </span>
    </span>
  );
}

const VAR_LABEL: Record<string, () => string> = {
  '--bg': () => t('Background'),
  '--surface': () => t('Panels'),
  '--fg': () => t('Text'),
  '--accent': () => t('Accent'),
  '--line': () => t('Lines'),
  '--muted': () => t('Muted text'),
  '--accent-text': () => t('Accent text and links'),
  '--on-accent': () => t('Text on the accent'),
  '--danger': () => t('Errors'),
  '--warn': () => t('Warnings'),
  '--info': () => t('Info'),
};

const hexOf = (v: string) => toHex(cssColor(v) ?? { r: 0, g: 0, b: 0 });

/** One color: the browser's color picker and a hex field. */
function ColorRow({ k, value, onChange, auto, onAuto }: { k: ThemeVar; value: string; onChange: (hex: string) => void; auto?: boolean; onAuto?: () => void }) {
  const hex = hexOf(value);
  const [text, setText] = useState(hex);
  useEffect(() => setText(hex), [hex]);
  const label = VAR_LABEL[k]();
  return (
    <div className="ct-row">
      <input type="color" value={hex.toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={label} />
      <span className="ct-label">{label}</span>
      <input
        className="input mono ct-hex"
        value={text}
        spellCheck={false}
        aria-label={t('{name} as hex', { name: label })}
        onChange={(e) => {
          setText(e.target.value);
          const c = fromHex(e.target.value);
          if (c) onChange(toHex(c));
        }}
        onBlur={() => setText(hex)}
      />
      {onAuto &&
        (auto ? (
          <span className="muted ct-auto">{t('auto')}</span>
        ) : (
          <button type="button" className="btn btn-sm" onClick={onAuto} title={t('Work it out from the main colors again')}>
            {t('back to auto')}
          </button>
        ))}
    </div>
  );
}

function Check({ fg, bg, label, min = 4.5 }: { fg: string; bg: string; label: string; min?: number }) {
  const a = cssColor(fg);
  const b = cssColor(bg);
  if (!a || !b) return null;
  const r = contrast(a, b);
  const w = wcag(r);
  const ok = min === 3 ? w.aaLarge : w.aa;
  return (
    <div className="ct-check">
      <span className="ct-check-sample" style={{ background: bg, color: fg }}>
        {'Aa' /* i18n-ignore */}
      </span>
      <span>{label}</span>
      <span className="mono">{`${fmtNum(Math.floor(r * 100) / 100, { maximumFractionDigits: 2 })}:1`}</span>
      <span className={`cp-badge${ok ? ' ok' : ''}`}>{ok ? (w.aaa && min !== 3 ? t('very good') : t('readable')) : t('hard to read')}</span>
    </div>
  );
}

function ThemeEditor({ theme }: { theme: CustomTheme }) {
  const v = theme.vars;
  const fixed = theme.fixed ?? [];
  const setMain = (k: ThemeVar, hex: string) => saveCustomTheme(derive({ ...theme, vars: { ...v, [k]: hex } }));
  const setMore = (k: ThemeVar, hex: string) => saveCustomTheme(derive({ ...theme, vars: { ...v, [k]: hex }, fixed: [...fixed.filter((x) => x !== k), k] }));
  const unfix = (k: ThemeVar) => saveCustomTheme(derive({ ...theme, fixed: fixed.filter((x) => x !== k) }));
  const anyFixed = MORE_VARS.some((k) => fixed.includes(k));
  const [sure, setSure] = useState(false);

  return (
    <div className="ct-editor">
      <div className="ct-head">
        <label className="ct-name">
          <span className="field-label">{t('Name')}</span>
          <input className="input" value={theme.name} maxLength={40} onChange={(e) => saveCustomTheme({ ...theme, name: e.target.value })} />
        </label>
        <label className="ct-name">
          <span className="field-label">{t('Take the colors of')}</span>
          <select
            className="input"
            value=""
            onChange={(e) => {
              const from = e.target.value as Theme;
              if (from) saveCustomTheme({ ...theme, ...themeVars(from), fixed: [] });
            }}
          >
            <option value="">{t('pick a theme…')}</option>
            {THEME_IDS.map((id) => (
              <option key={id} value={id}>
                {themeName(id)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ct-cols">
        <div>
          <p className="field-label">{t('Main colors')}</p>
          {MAIN_VARS.map((k) => (
            <ColorRow key={k} k={k} value={v[k]} onChange={(hex) => setMain(k, hex)} />
          ))}
          <details className="ct-more" open={anyFixed || undefined}>
            <summary>{t('More colors')}</summary>
            <p className="note">{t('These follow the main colors by themselves. Set one here to keep it as you want it.')}</p>
            {MORE_VARS.map((k) => (
              <ColorRow key={k} k={k} value={v[k]} onChange={(hex) => setMore(k, hex)} auto={!fixed.includes(k)} onAuto={() => unfix(k)} />
            ))}
          </details>
        </div>
        <div>
          <p className="field-label">{t('How well it reads')}</p>
          <Check fg={v['--fg']} bg={v['--bg']} label={t('Text on the background')} />
          <Check fg={v['--fg']} bg={v['--surface']} label={t('Text on panels')} />
          <Check fg={v['--muted']} bg={v['--surface']} label={t('Muted text on panels')} />
          <Check fg={v['--accent-text']} bg={v['--bg']} label={t('Accent text on the background')} />
          <Check fg={v['--on-accent']} bg={v['--accent']} label={t('Text on accent buttons')} />
          <p className="note">{t('Changes show on the whole site at once and are saved by themselves.')}</p>
        </div>
      </div>

      <div className="ct-actions">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            const copy = { ...theme, id: newThemeId(), name: t('{name} (copy)', { name: theme.name }).slice(0, 40) };
            saveCustomTheme(copy);
            setTheme(`custom:${copy.id}`);
          }}
        >
          {t('duplicate')}
        </button>
        <CopyButton text={themeCode(theme)} label={t('copy theme code')} />
        {/* Asked on the page, not with confirm(): some browsers and embedded views block those dialogs (they answer "no" at once). */}
        {sure ? (
          <span className="ct-sure" role="group" aria-label={t('Delete the theme “{name}”?', { name: theme.name })}>
            <span>{t('Delete the theme “{name}”?', { name: theme.name })}</span>
            <button type="button" className="btn btn-sm ct-delete-yes" onClick={() => deleteCustomTheme(theme.id)} autoFocus>
              {t('yes, delete')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setSure(false)}>
              {t('keep it')}
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-sm ct-delete" onClick={() => setSure(true)}>
            {t('delete')}
          </button>
        )}
      </div>
    </div>
  );
}

export function ThemeSection() {
  const [now, picked] = useTheme();
  const customs = useCustomThemes();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const choices: (Theme | 'system')[] = ['system', ...THEME_IDS];
  const editing = customs.find((x) => `custom:${x.id}` === picked);
  const full = customs.length >= MAX_CUSTOM;

  const add = (theme: CustomTheme) => {
    saveCustomTheme(theme);
    setTheme(`custom:${theme.id}`);
  };
  const makeNew = () => {
    const from = editing ? { base: editing.base, vars: editing.vars, fixed: editing.fixed } : themeVars(now as Theme);
    let n = customs.length + 1;
    while (customs.some((x) => x.name === t('My theme {n}', { n }))) n++;
    add({ id: newThemeId(), name: t('My theme {n}', { n }), ...from });
  };
  const card = (id: ThemeChoice, body: React.ReactNode, name: string) => (
    <button key={id} type="button" role="radio" aria-checked={picked === id} className="theme-card" onClick={() => setTheme(id)}>
      {body}
      <span className="theme-name">{name}</span>
    </button>
  );

  return (
    <section className="panel" aria-labelledby="set-theme">
      <h2 id="set-theme" className="panel-title">
        {t('// theme')}
      </h2>
      <div className="theme-grid" role="radiogroup" aria-labelledby="set-theme">
        {choices.map((id) =>
          card(
            id,
            id === 'system' ? (
              <span className="theme-split">
                <Swatch theme="dark" />
                <Swatch theme="light" />
              </span>
            ) : (
              <Swatch theme={id} />
            ),
            themeName(id),
          ),
        )}
        {customs.map((c) => card(`custom:${c.id}`, <Swatch theme={c.base} vars={c.vars} />, c.name))}
        <button type="button" className="theme-card theme-card-new" onClick={makeNew} disabled={full} title={full ? t('You have {n} own themes, the most there can be.', { n: MAX_CUSTOM }) : undefined}>
          <span className="theme-new-plus" aria-hidden="true">
            +
          </span>
          <span className="theme-name">{t('new theme')}</span>
        </button>
      </div>
      {picked === 'system' && <p className="note">{t('Dark or light, the same as your computer.')}</p>}
      {!editing && <p className="note">{t('“New theme” starts from the theme you have now; then change its colors.')}</p>}

      {editing && <ThemeEditor key={editing.id} theme={editing} />}

      <form
        className="ct-import"
        onSubmit={(e) => {
          e.preventDefault();
          const theme = parseThemeCode(code);
          if (!theme) return setCodeError(t('That isn’t a theme code. It starts with unktilz-theme:'));
          if (full) return setCodeError(t('You have {n} own themes, the most there can be.', { n: MAX_CUSTOM }));
          setCodeError('');
          setCode('');
          add(theme);
        }}
      >
        <input
          className="input mono"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setCodeError('');
          }}
          placeholder={t('Paste a theme code someone shared')}
          aria-label={t('Theme code')}
          aria-invalid={codeError ? true : undefined}
        />
        <button type="submit" className="btn btn-sm" disabled={!code.trim()}>
          {t('add theme')}
        </button>
        {codeError && <p className="note ct-error">{codeError}</p>}
      </form>
    </section>
  );
}

const FONT_LABEL: Record<FontId, () => string> = {
  theme: () => t('as the theme'),
  geist: () => 'Geist' /* i18n-ignore */,
  system: () => t('system'),
  mono: () => t('monospace'),
  serif: () => t('serif'),
};

export function LookSection() {
  const { font, size } = useLook();
  return (
    <section className="panel" aria-labelledby="set-font">
      <h2 id="set-font" className="panel-title">
        {t('// font')}
      </h2>
      <p className="field-label" id="set-font-face">
        {t('Font')}
      </p>
      <div className="seg" role="group" aria-labelledby="set-font-face">
        {FONT_IDS.map((f) => (
          <button key={f} type="button" aria-pressed={font === f} onClick={() => setFont(f)} style={f === 'theme' ? undefined : { fontFamily: FONT_STACKS[f] }}>
            {FONT_LABEL[f]()}
          </button>
        ))}
      </div>
      <p className="field-label" id="set-font-size">
        {t('Size')}
      </p>
      <div className="seg" role="group" aria-labelledby="set-font-size">
        {TEXT_SIZES.map((s) => (
          <button key={s} type="button" aria-pressed={size === s} onClick={() => setTextSize(s)}>
            {`${s} %`}
          </button>
        ))}
      </div>
      <p className="note">{t('The size changes every text on the site; pictures, previews and tools keep their size. Codes and numbers keep their monospace font.')}</p>
    </section>
  );
}
