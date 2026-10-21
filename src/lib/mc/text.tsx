// i18n-ignore-file: Minecraft chat colour and format names: they stay as the game names them (see src/i18n/cs/app.ts).
import type { CSSProperties } from 'react';

export const MC_COLORS = [
  { code: '0', name: 'black', label: 'Black', hex: '#000000' },
  { code: '1', name: 'dark_blue', label: 'Dark Blue', hex: '#0000AA' },
  { code: '2', name: 'dark_green', label: 'Dark Green', hex: '#00AA00' },
  { code: '3', name: 'dark_aqua', label: 'Dark Aqua', hex: '#00AAAA' },
  { code: '4', name: 'dark_red', label: 'Dark Red', hex: '#AA0000' },
  { code: '5', name: 'dark_purple', label: 'Dark Purple', hex: '#AA00AA' },
  { code: '6', name: 'gold', label: 'Gold', hex: '#FFAA00' },
  { code: '7', name: 'gray', label: 'Gray', hex: '#AAAAAA' },
  { code: '8', name: 'dark_gray', label: 'Dark Gray', hex: '#555555' },
  { code: '9', name: 'blue', label: 'Blue', hex: '#5555FF' },
  { code: 'a', name: 'green', label: 'Green', hex: '#55FF55' },
  { code: 'b', name: 'aqua', label: 'Aqua', hex: '#55FFFF' },
  { code: 'c', name: 'red', label: 'Red', hex: '#FF5555' },
  { code: 'd', name: 'light_purple', label: 'Light Purple', hex: '#FF55FF' },
  { code: 'e', name: 'yellow', label: 'Yellow', hex: '#FFFF55' },
  { code: 'f', name: 'white', label: 'White', hex: '#FFFFFF' },
] as const;

export const MC_FORMATS = [
  { code: 'k', name: 'obfuscated', label: 'Obfuscated', key: 'obf' },
  { code: 'l', name: 'bold', label: 'Bold', key: 'bold' },
  { code: 'm', name: 'strikethrough', label: 'Strikethrough', key: 'strike' },
  { code: 'n', name: 'underlined', label: 'Underline', key: 'underline' },
  { code: 'o', name: 'italic', label: 'Italic', key: 'italic' },
] as const;

type FormatKey = (typeof MC_FORMATS)[number]['key'];

export type Style = { color?: string } & Partial<Record<FormatKey, boolean>>;
export type Seg = Style & { text: string };

const colorByCode = new Map<string, string>(MC_COLORS.map((c) => [c.code, c.hex]));
const formatByCode = new Map<string, FormatKey>(MC_FORMATS.map((f) => [f.code, f.key]));

/**
 * Parses legacy formatting: §a / &a, &#RRGGBB and §x§R§R§G§G§B§B hex.
 * As in the game, a color code clears bold/italic/etc.
 */
function scanLegacy(input: string, prefixes: string): { segs: Seg[]; style: Style } {
  const segs: Seg[] = [];
  let style: Style = {};
  let buf = '';
  const flush = () => {
    if (buf) segs.push({ ...style, text: buf });
    buf = '';
  };
  const isPrefix = (ch: string) => prefixes.includes(ch);

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (!isPrefix(ch) || i + 1 >= input.length) {
      buf += ch;
      continue;
    }
    const next = input[i + 1].toLowerCase();
    // &#RRGGBB
    if (next === '#' && /^[0-9a-f]{6}$/i.test(input.slice(i + 2, i + 8))) {
      flush();
      style = { color: `#${input.slice(i + 2, i + 8).toUpperCase()}` };
      i += 7;
      continue;
    }
    // §x§R§R§G§G§B§B
    if (next === 'x') {
      const m = input.slice(i + 2, i + 14).match(/^(?:[§&][0-9a-f]){6}$/i);
      if (m) {
        flush();
        style = { color: `#${m[0].replace(/[§&]/g, '').toUpperCase()}` };
        i += 13;
        continue;
      }
    }
    if (colorByCode.has(next)) {
      flush();
      style = { color: colorByCode.get(next) };
      i++;
    } else if (formatByCode.has(next)) {
      flush();
      style = { ...style, [formatByCode.get(next)!]: true };
      i++;
    } else if (next === 'r') {
      flush();
      style = {};
      i++;
    } else buf += ch;
  }
  flush();
  return { segs, style };
}

export const parseLegacy = (input: string, prefixes = '§&'): Seg[] => scanLegacy(input, prefixes).segs;

/** The formatting in effect at the end of `input`, i.e. what new text typed there would look like. */
export const styleAtEnd = (input: string, prefixes = '§&'): Style => scanLegacy(input, prefixes).style;

/** Legacy codes that recreate a style from scratch: color first (it clears formats), then formats. */
export function styleCodes(style: Style, prefix = '&'): string {
  const named = style.color ? MC_COLORS.find((c) => c.hex === style.color) : undefined;
  let out = style.color ? (named ? `${prefix}${named.code}` : `${prefix}#${style.color.slice(1)}`) : '';
  for (const f of MC_FORMATS) if (style[f.key]) out += `${prefix}${f.code}`;
  return out;
}

export function segStyle(s: Style, defaultColor = '#AAAAAA', shadow = true): CSSProperties {
  const color = s.color ?? defaultColor;
  const deco = [s.underline && 'underline', s.strike && 'line-through'].filter(Boolean).join(' ');
  // The game's shadow is the text color at 25% brightness, offset by one pixel.
  const rgb = parseInt(color.slice(1), 16);
  const sh = `#${(((rgb >> 2) & 0x3f3f3f) >>> 0).toString(16).padStart(6, '0')}`;
  return {
    color,
    fontWeight: s.bold ? 700 : undefined,
    fontStyle: s.italic ? 'italic' : undefined,
    textDecoration: deco || undefined,
    textShadow: shadow ? `2px 2px 0 ${sh}` : undefined,
  };
}

export function McText({ text, prefixes, defaultColor }: { text: string; prefixes?: string; defaultColor?: string }) {
  return (
    <>
      {parseLegacy(text, prefixes).map((s, i) => (
        <span key={i} style={segStyle(s, defaultColor)} className={s.obf ? 'mc-obf' : undefined}>
          {s.text}
        </span>
      ))}
    </>
  );
}

const sameStyle = (a: Style, b: Style) => a.color === b.color && MC_FORMATS.every((f) => !!a[f.key] === !!b[f.key]);

const mmColor = (hex?: string) => {
  if (!hex) return '';
  const named = MC_COLORS.find((c) => c.hex === hex.toUpperCase());
  return named ? named.name : hex.toLowerCase();
};

/** Legacy codes → MiniMessage tags. */
export function legacyToMiniMessage(input: string): string {
  const segs = parseLegacy(input);
  let out = '';
  let prev: Style = {};
  for (const s of segs) {
    if (!sameStyle(prev, s)) {
      // MiniMessage tags nest, so dropping a format (or the color) needs a reset first.
      const reset = out !== '' && (MC_FORMATS.some((f) => prev[f.key] && !s[f.key]) || (!!prev.color && !s.color));
      const base: Style = reset ? {} : prev;
      if (reset) out += '<reset>';
      if (s.color && s.color !== base.color) out += `<${mmColor(s.color)}>`;
      for (const f of MC_FORMATS) if (s[f.key] && !base[f.key]) out += `<${f.name}>`;
      prev = s;
    }
    out += s.text.replace(/</g, '\\<');
  }
  return out;
}

const TAG_ALIASES: Record<string, string> = {
  b: 'bold',
  i: 'italic',
  em: 'italic',
  u: 'underlined',
  st: 'strikethrough',
  obf: 'obfuscated',
  dark_grey: 'dark_gray',
  grey: 'gray',
};

/** MiniMessage tags → legacy codes with the given prefix. Unknown tags are dropped. */
export function miniMessageToLegacy(input: string, prefix = '&'): string {
  const stack: Style[] = [{}];
  const cur = () => stack[stack.length - 1];
  let out = '';
  let emitted: Style | null = null;

  const emit = (s: Style) => {
    if (emitted && sameStyle(emitted, s)) return;
    const named = s.color ? MC_COLORS.find((c) => c.hex === s.color) : undefined;
    if (s.color) out += named ? `${prefix}${named.code}` : `${prefix}#${s.color.slice(1)}`;
    else if (emitted) out += `${prefix}r`;
    for (const f of MC_FORMATS) if (s[f.key]) out += `${prefix}${f.code}`;
    emitted = s;
  };

  const re = /\\<|<(\/?)([a-z_#:0-9]+)>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  const text = (t: string) => {
    if (!t) return;
    emit(cur());
    out += t;
  };
  while ((m = re.exec(input))) {
    text(input.slice(last, m.index));
    last = re.lastIndex;
    if (m[0] === '\\<') {
      text('<');
      continue;
    }
    const closing = m[1] === '/';
    let tag = m[2].toLowerCase();
    tag = TAG_ALIASES[tag] ?? tag;
    if (tag.startsWith('color:') || tag.startsWith('c:') || tag.startsWith('colour:')) tag = tag.split(':')[1];
    tag = TAG_ALIASES[tag] ?? tag;
    if (tag === 'reset') {
      stack.length = 1;
      continue;
    }
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const named = MC_COLORS.find((c) => c.name === tag);
    const fmt = MC_FORMATS.find((f) => f.name === tag);
    if (named) stack.push({ ...cur(), color: named.hex });
    else if (/^#[0-9a-f]{6}$/.test(tag)) stack.push({ ...cur(), color: tag.toUpperCase() });
    else if (fmt) stack.push({ ...cur(), [fmt.key]: true });
  }
  text(input.slice(last));
  return out;
}
