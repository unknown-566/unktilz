import type { CSSProperties, ReactNode } from 'react';
import { MC_COLORS, MC_FORMATS, segStyle, type Style } from './text';

// MiniMessage renderer for previews. Covers the standard tags
// (https://docs.papermc.io/adventure/minimessage/format/): colors, hex, decorations and their
// negation, reset, gradient / transition / rainbow / pride, shadow, font, newline, keybind,
// translatable, click / hover / insert, selector, score, nbt, sprite and head.
// Unknown tags stay visible as text, which is what MiniMessage itself does.

type Tag = { type: 'tag'; name: string; args: string[]; children: Node[]; raw: string };
type Node = { type: 'text'; text: string } | Tag;

const ALIASES: Record<string, string> = {
  b: 'bold',
  i: 'italic',
  em: 'italic',
  u: 'underlined',
  st: 'strikethrough',
  obf: 'obfuscated',
  c: 'color',
  colour: 'color',
  grey: 'gray',
  dark_grey: 'dark_gray',
  tr: 'lang',
  translate: 'lang',
  tr_or: 'lang_or',
  translate_or: 'lang_or',
  sel: 'selector',
  data: 'nbt',
  br: 'newline',
  insertion: 'insert',
};

const FORMAT_KEY = Object.fromEntries(MC_FORMATS.map((f) => [f.name, f.key])) as Record<string, (typeof MC_FORMATS)[number]['key']>;

/** Tags with no closing tag: they stand for content themselves. */
const SELF_CLOSING = new Set(['newline', 'key', 'lang', 'lang_or', 'selector', 'score', 'nbt', 'sprite', 'head']);
const WRAPPERS = new Set(['color', 'gradient', 'transition', 'rainbow', 'pride', 'shadow', 'font', 'click', 'hover', 'insert', 'center']);

export const PRIDE_FLAGS: Record<string, string[]> = {
  pride: ['#E50000', '#FF8D00', '#FFEE00', '#028121', '#004CFF', '#770088'],
  progress: ['#FFFFFF', '#FFAFC7', '#73D7EE', '#613915', '#000000', '#E50000', '#FF8D00', '#FFEE00', '#028121', '#004CFF', '#770088'],
  trans: ['#5BCFFB', '#F5ABB9', '#FFFFFF', '#F5ABB9', '#5BCFFB'],
  bi: ['#D60270', '#9B4F96', '#0038A8'],
  pan: ['#FF1C8D', '#FFD700', '#1AB3FF'],
  nb: ['#FCF431', '#FCFCFC', '#9D59D2', '#282828'],
  lesbian: ['#D62800', '#FF9B56', '#FFFFFF', '#D462A6', '#A40062'],
  ace: ['#000000', '#A4A4A4', '#FFFFFF', '#810081'],
  agender: ['#000000', '#BABABA', '#FFFFFF', '#BAF484', '#FFFFFF', '#BABABA', '#000000'],
  demisexual: ['#000000', '#FFFFFF', '#6E0071', '#D3D3D3'],
  genderqueer: ['#B57FDD', '#FFFFFF', '#49821E'],
  genderfluid: ['#FE76A2', '#FFFFFF', '#BF12D7', '#000000', '#303CBE'],
  intersex: ['#FFD800', '#7902AA', '#FFD800'],
  aro: ['#3BA740', '#A8D47A', '#FFFFFF', '#ABABAB', '#000000'],
  baker: ['#CD66FF', '#FF6599', '#FE0000', '#FE9900', '#FFFF01', '#009900', '#0099CB', '#350099', '#990099'],
  philly: ['#000000', '#784F17', '#FE0000', '#FD8C00', '#FFE500', '#119F0B', '#0644B3', '#C22EDC'],
  queer: ['#000000', '#9AD9EB', '#00A3E8', '#B5E51D', '#FFFFFF', '#FFC90D', '#FC6667', '#FEAEC9', '#000000'],
  gay: ['#078E70', '#26CEAA', '#98E8C1', '#FFFFFF', '#7BADE2', '#5049CB', '#3D1A78'],
  bigender: ['#C479A0', '#ECA6CB', '#D5C7E8', '#FFFFFF', '#D5C7E8', '#9AC7E8', '#6C83CF'],
  demigender: ['#7F7F7F', '#C3C3C3', '#FBFF74', '#FFFFFF', '#FBFF74', '#C3C3C3', '#7F7F7F'],
};

function colorOf(arg: string | undefined): string | undefined {
  if (!arg) return undefined;
  const a = ALIASES[arg.toLowerCase()] ?? arg.toLowerCase();
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(a)) return a.slice(0, 7).toUpperCase();
  return MC_COLORS.find((c) => c.name === a)?.hex;
}

const known = (name: string) =>
  name === 'reset' || name in FORMAT_KEY || SELF_CLOSING.has(name) || WRAPPERS.has(name) || !!colorOf(name);

/** Splits "a:'b:c':d" into ["a", "b:c", "d"], honouring quotes. */
function splitArgs(body: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === '\\' && body[i + 1] === quote) {
        cur += quote;
        i++;
      } else if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === ':') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

type Token =
  | { type: 'text'; text: string }
  | { type: 'tag'; raw: string; name: string; args: string[]; closing: boolean; selfClose: boolean; negated: boolean; valid: boolean };

/** Splits MiniMessage into text and tags. `valid` is false for things MiniMessage would print as text. */
function scan(input: string): Token[] {
  const out: Token[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === '\\' && (input[i + 1] === '<' || input[i + 1] === '\\')) {
      text += input[i + 1];
      i += 2;
      continue;
    }
    if (ch !== '<') {
      text += ch;
      i++;
      continue;
    }
    // Find the closing ">" while skipping quoted arguments.
    let j = i + 1;
    let quote: string | null = null;
    for (; j < input.length; j++) {
      const c = input[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === "'" || c === '"') quote = c;
      else if (c === '>' || c === '<') break;
    }
    if (input[j] !== '>') {
      text += ch;
      i++;
      continue;
    }
    const raw = input.slice(i, j + 1);
    let inner = input.slice(i + 1, j);
    const closing = inner.startsWith('/');
    if (closing) inner = inner.slice(1);
    const selfClose = inner.endsWith('/');
    if (selfClose) inner = inner.slice(0, -1);
    const [rawName, ...args] = splitArgs(inner);
    const negated = rawName.startsWith('!');
    const lower = (negated ? rawName.slice(1) : rawName).toLowerCase();
    const name = ALIASES[lower] ?? lower;
    i = j + 1;
    flush();
    out.push({ type: 'tag', raw, name, args, closing, selfClose, negated, valid: /^[#a-z0-9_.\-]+$/.test(name) && known(name) });
  }
  flush();
  return out;
}

function parse(input: string): Node[] {
  const root: Node[] = [];
  const stack: Tag[] = [];
  const here = () => (stack.length ? stack[stack.length - 1].children : root);
  const pushText = (text: string) => {
    if (!text) return;
    const list = here();
    const last = list[list.length - 1];
    if (last?.type === 'text') last.text += text;
    else list.push({ type: 'text', text });
  };
  for (const t of scan(input)) {
    if (t.type === 'text' || !t.valid) {
      pushText(t.type === 'text' ? t.text : t.raw);
      continue;
    }
    if (t.name === 'reset') {
      stack.length = 0;
      continue;
    }
    if (t.closing) {
      const at = stack.map((s) => s.name).lastIndexOf(t.name);
      if (at >= 0) stack.length = at;
      continue;
    }
    const node: Tag = { type: 'tag', name: t.name, args: t.negated ? ['false', ...t.args] : t.args, children: [], raw: t.raw };
    here().push(node);
    if (!SELF_CLOSING.has(t.name) && !t.selfClose) stack.push(node);
  }
  return root;
}

export type MStyle = Style & { shadow?: string | null; font?: string; title?: string };
type Ch = { ch: string; style: MStyle; img?: string };

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
const mix = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => ((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t;
  return `#${hex2(ch(16))}${hex2(ch(8))}${hex2(ch(0))}`.toUpperCase();
};
const hsv = (h: number) => {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const q = 1 - f;
  const [r, g, b] = [
    [1, f, 0],
    [q, 1, 0],
    [0, 1, f],
    [0, q, 1],
    [f, 0, 1],
    [1, 0, q],
  ][((i % 6) + 6) % 6];
  return `#${hex2(r * 255)}${hex2(g * 255)}${hex2(b * 255)}`.toUpperCase();
};
/** Color at position t (0..1) along a list of stops. */
const along = (stops: string[], t: number) => {
  if (stops.length === 1) return stops[0];
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[k], stops[k + 1], x - k);
};

/** Splits "color...:phase" arguments into color stops and an optional numeric phase. */
function stopsAndPhase(args: string[]): { stops: string[]; phase: number } {
  const last = args[args.length - 1];
  const hasPhase = last !== undefined && /^-?\d*\.?\d+$/.test(last);
  const stops = (hasPhase ? args.slice(0, -1) : args).map(colorOf).filter(Boolean) as string[];
  return { stops, phase: hasPhase ? Number(last) : 0 };
}

const KEY_NAMES: Record<string, string> = {
  'key.jump': 'Space',
  'key.sneak': 'Left Shift',
  'key.sprint': 'Left Control',
  'key.inventory': 'E',
  'key.drop': 'Q',
  'key.chat': 'T',
  'key.command': '/',
  'key.attack': 'Left Button',
  'key.use': 'Right Button',
  'key.pickItem': 'Middle Button',
  'key.forward': 'W',
  'key.back': 'S',
  'key.left': 'A',
  'key.right': 'D',
  'key.swapOffhand': 'F',
  'key.playerlist': 'Tab',
};
const prettyKey = (k: string) =>
  (k.split('.').pop() ?? k)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

function recolor(out: Ch[], start: number, color: (i: number, len: number) => string) {
  const len = out.length - start;
  for (let i = 0; i < len; i++) out[start + i] = { ...out[start + i], style: { ...out[start + i].style, color: color(i, len) } };
}

function walk(nodes: Node[], style: MStyle, out: Ch[]) {
  const put = (s: string, st: MStyle = style) => {
    for (const ch of s) out.push({ ch, style: st });
  };
  for (const n of nodes) {
    if (n.type === 'text') {
      put(n.text);
      continue;
    }
    const a = n.args;
    const start = out.length;
    switch (n.name) {
      case 'newline':
        out.push({ ch: '\n', style });
        break;
      case 'key':
        put(KEY_NAMES[a[0]] ?? prettyKey(a[0] ?? 'key'));
        break;
      case 'lang':
      case 'lang_or':
        // Real text comes from the player's language file; show the fallback or a readable key.
        put(n.name === 'lang_or' && a[1] ? a[1] : prettyKey(a[0] ?? ''));
        break;
      case 'selector':
        put(a[0] ?? '@p');
        break;
      case 'score':
        put('0');
        break;
      case 'nbt':
        put(`[${a[2] ?? 'nbt'}]`);
        break;
      case 'sprite':
        put('▣');
        break;
      case 'head': {
        const who = a[0] ?? 'Steve';
        out.push({ ch: '■', style, img: /^[0-9a-f-]{32,36}$|^[A-Za-z0-9_]{1,16}$/i.test(who) ? `https://mc-heads.net/avatar/${encodeURIComponent(who)}/16` : undefined });
        break;
      }
      case 'color':
        walk(n.children, { ...style, color: colorOf(a[0]) ?? style.color }, out);
        break;
      case 'shadow': {
        const off = a[0] === 'false' || /^#[0-9a-f]{6}00$/i.test(a[0] ?? '');
        const c = colorOf(a[0]);
        const alpha = a[1] !== undefined ? Number(a[1]) : /^#[0-9a-f]{8}$/i.test(a[0] ?? '') ? parseInt(a[0].slice(7), 16) / 255 : 0.25;
        walk(n.children, { ...style, shadow: off || !c ? null : `${c}${hex2(alpha * 255)}` }, out);
        break;
      }
      case 'font':
        walk(n.children, { ...style, font: (a.length > 1 ? a.join(':') : a[0] ?? '').toLowerCase() }, out);
        break;
      case 'click':
        walk(n.children, { ...style, title: `click: ${a[0] ?? ''} ${a.slice(1).join(':')}`.trim() }, out);
        break;
      case 'hover':
        walk(n.children, { ...style, title: `hover: ${a.slice(1).join(':').replace(/<[^>]*>/g, '')}` }, out);
        break;
      case 'insert':
        walk(n.children, { ...style, title: `shift-click inserts: ${a.join(':')}` }, out);
        break;
      case 'center':
        walk(n.children, style, out);
        break;
      case 'gradient': {
        walk(n.children, style, out);
        const { stops, phase } = stopsAndPhase(a);
        const colors = stops.length >= 2 ? stops : stops.length === 1 ? [stops[0], '#FFFFFF'] : ['#FFFFFF', '#000000'];
        recolor(out, start, (i, len) => {
          let t = len <= 1 ? 0 : i / (len - 1);
          if (phase) t = (((t + phase) % 1) + 1) % 1;
          return along(colors, t);
        });
        break;
      }
      case 'transition': {
        walk(n.children, style, out);
        const { stops, phase } = stopsAndPhase(a);
        const colors = stops.length ? stops : ['#FFFFFF', '#000000'];
        const c = along(colors, phase < 0 ? 1 + phase : phase);
        recolor(out, start, () => c);
        break;
      }
      case 'rainbow': {
        walk(n.children, style, out);
        const arg = a[0] ?? '';
        const reverse = arg.startsWith('!');
        const phase = Number(arg.replace('!', '')) || 0;
        recolor(out, start, (i, len) => {
          let h = (i / Math.max(1, len) + phase / 10) % 1;
          if (reverse) h = 1 - h;
          return hsv(h);
        });
        break;
      }
      case 'pride': {
        walk(n.children, style, out);
        const flag = a.find((x) => PRIDE_FLAGS[x.toLowerCase()]) ?? 'pride';
        const colors = PRIDE_FLAGS[flag.toLowerCase()];
        recolor(out, start, (i, len) => along(colors, len <= 1 ? 0 : i / (len - 1)));
        break;
      }
      default:
        if (n.name in FORMAT_KEY) walk(n.children, { ...style, [FORMAT_KEY[n.name]]: a[0] !== 'false' }, out);
        else walk(n.children, { ...style, color: colorOf(n.name) ?? style.color }, out);
    }
  }
}

const same = (a: MStyle, b: MStyle) =>
  a.color === b.color && a.shadow === b.shadow && a.font === b.font && a.title === b.title && MC_FORMATS.every((f) => !!a[f.key] === !!b[f.key]);

function styleFor(s: MStyle, defaultColor: string): CSSProperties {
  const css = segStyle(s, defaultColor, s.shadow !== null);
  if (s.shadow) css.textShadow = `2px 2px 0 ${s.shadow}`;
  if (s.font?.endsWith('uniform')) css.fontFamily = 'var(--sans)';
  else if (s.font?.endsWith('alt') || s.font?.endsWith('illageralt')) {
    css.fontFamily = 'serif';
    css.fontStyle = 'italic';
  }
  if (s.title) {
    css.textDecorationStyle = 'dotted';
    css.cursor = 'help';
  }
  return css;
}

export function MiniText({ text, defaultColor = '#AAAAAA' }: { text: string; defaultColor?: string }) {
  const chars: Ch[] = [];
  walk(parse(text), {}, chars);
  const parts: ReactNode[] = [];
  let buf = '';
  let cur: MStyle | null = null;
  const flush = () => {
    if (buf && cur) {
      parts.push(
        <span key={parts.length} style={styleFor(cur, defaultColor)} className={cur.obf ? 'mc-obf' : undefined} title={cur.title}>
          {buf}
        </span>,
      );
    }
    buf = '';
  };
  for (const c of chars) {
    if (c.ch === '\n' || c.img) {
      flush();
      parts.push(
        c.img ? (
          <img key={parts.length} src={c.img} alt="" width={16} height={16} style={{ imageRendering: 'pixelated', verticalAlign: '-3px', margin: '0 1px' }} />
        ) : (
          <br key={parts.length} />
        ),
      );
      cur = null;
      continue;
    }
    if (!cur || !same(cur, c.style)) {
      flush();
      cur = c.style;
    }
    buf += c.ch;
  }
  flush();
  return <>{parts}</>;
}

/** The visible text of a MiniMessage string, without tags. */
export function plainText(text: string) {
  const chars: Ch[] = [];
  walk(parse(text), {}, chars);
  return chars.map((c) => c.ch).join('');
}

const TAG_NAMES = [
  ...MC_COLORS.map((c) => c.name),
  ...MC_FORMATS.map((f) => f.name),
  ...Object.keys(ALIASES),
  ...SELF_CLOSING,
  ...WRAPPERS,
  'reset',
];

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export type Lint = { raw: string; message: string };

/**
 * Problems a beginner would not spot: tags MiniMessage doesn't know (they show up as text)
 * and closing tags with nothing to close. Unclosed tags are fine in MiniMessage, so they aren't flagged.
 */
export function lintMiniMessage(input: string): Lint[] {
  const out: Lint[] = [];
  const open: string[] = [];
  for (const t of scan(input)) {
    if (t.type === 'text') continue;
    if (!t.valid) {
      // "<3" or "<- back" are just text, not attempts at a tag.
      if (!/^<\/?[a-z]/i.test(t.raw)) continue;
      const guess = TAG_NAMES.map((n) => [n, distance(t.name, n)] as const).sort((a, b) => a[1] - b[1])[0];
      const hint = guess && guess[1] <= 2 ? ` Did you mean <${t.closing ? '/' : ''}${guess[0]}>?` : '';
      out.push({ raw: t.raw, message: `${t.raw} isn’t a MiniMessage tag, so it shows up as text.${hint}` });
      continue;
    }
    if (t.name === 'reset') open.length = 0;
    else if (t.closing) {
      const at = open.lastIndexOf(t.name);
      if (at < 0) out.push({ raw: t.raw, message: `${t.raw} closes a tag that was never opened, so it does nothing.` });
      else open.length = at;
    } else if (!SELF_CLOSING.has(t.name) && !t.selfClose) open.push(t.name);
  }
  return out;
}

/** Removes formatting tags but keeps the text, placeholders, alignment and content tags (head, key…). */
export function stripFormatting(input: string): string {
  return scan(input)
    .map((t) => {
      if (t.type === 'text') return t.text.replace(/</g, '\\<');
      if (!t.valid || t.name === 'center' || SELF_CLOSING.has(t.name)) return t.raw;
      return '';
    })
    .join('');
}

/** Width of the visible text in Minecraft font pixels. */
export function textWidthPx(input: string, charWidth: (ch: string, bold: boolean) => number): number {
  const chars: Ch[] = [];
  walk(parse(input), {}, chars);
  return chars.reduce((w, c) => w + (c.img ? 9 : c.ch === '\n' ? 0 : charWidth(c.ch, !!c.style.bold)), 0);
}
