// Encodings: the same bytes written another way (nothing secret). Each one is bytes → text and
// back; decoding is forgiving about spaces, line breaks and letter case where the format allows.
import { t } from '../../../lib/i18n-core';
import { fromB64, fromHex, toB64, toHex, utf8 } from './bytes';

const bad = (what: string, why?: string) => new Error(why ? t('That isn’t valid {what}: {why}', { what, why }) : t('That isn’t valid {what}.', { what }));

// ---- Base64 ----
export function base64Encode(b: Uint8Array, urlSafe = false) {
  const s = toB64(b);
  return urlSafe ? s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : s;
}
export const base64Decode = fromB64;

// ---- Base32 (RFC 4648) ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const B32HEX = '0123456789ABCDEFGHIJKLMNOPQRSTUV';

export function base32Encode(b: Uint8Array, hex = false, pad = true) {
  const abc = hex ? B32HEX : B32;
  let out = '';
  let bits = 0;
  let value = 0;
  for (const x of b) {
    value = (value << 8) | x;
    bits += 8;
    while (bits >= 5) {
      out += abc[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += abc[(value << (5 - bits)) & 31];
  if (pad) while (out.length % 8) out += '=';
  return out;
}

export function base32Decode(s: string, hex = false) {
  const abc = hex ? B32HEX : B32;
  const clean = s.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const i = abc.indexOf(ch);
    if (i < 0) throw bad('Base32', t('“{ch}” isn’t one of its letters.', { ch }));
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

// ---- Base58 (Bitcoin alphabet) ----
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(b: Uint8Array) {
  const digits: number[] = [];
  for (const x of b) {
    let carry = x;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (let i = 0; i < b.length && b[i] === 0; i++) out += '1';
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

export function base58Decode(s: string) {
  const clean = s.replace(/\s+/g, '');
  const bytes: number[] = [];
  for (const ch of clean) {
    const v = B58.indexOf(ch);
    if (v < 0) throw bad('Base58', t('“{ch}” isn’t one of its letters.', { ch }));
    let carry = v;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 255;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  let zeros = 0;
  while (zeros < clean.length && clean[zeros] === '1') zeros++;
  return new Uint8Array([...new Array(zeros).fill(0), ...bytes.reverse()]);
}

// ---- Ascii85 (Adobe) and Z85 ----
const Z85 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';

export function base85Encode(b: Uint8Array, z85 = false, wrap = false) {
  const char = (d: number) => (z85 ? Z85[d] : String.fromCharCode(d + 33));
  let out = '';
  for (let i = 0; i < b.length; i += 4) {
    const n = Math.min(4, b.length - i);
    const v = (((b[i] << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0);
    if (!z85 && n === 4 && v === 0) {
      out += 'z';
      continue;
    }
    const group = [0, 0, 0, 0, 0];
    let x = v;
    for (let k = 4; k >= 0; k--) {
      group[k] = x % 85;
      x = Math.floor(x / 85);
    }
    out += group.slice(0, n + 1).map(char).join('');
  }
  return !z85 && wrap ? `<~${out}~>` : out;
}

export function base85Decode(s: string, z85 = false) {
  let clean = s.replace(/\s+/g, '');
  if (!z85) clean = clean.replace(/^<~/, '').replace(/~>$/, '');
  const what = z85 ? 'Z85' : 'Ascii85';
  const out: number[] = [];
  let group: number[] = [];
  const flush = (n: number) => {
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const d of group) v = v * 85 + d;
    if (v > 0xffffffff) throw bad(what, t('a group is too big.'));
    out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
    if (n < 4) out.length -= 4 - n;
    group = [];
  };
  for (const ch of clean) {
    if (!z85 && ch === 'z' && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    const d = z85 ? Z85.indexOf(ch) : ch.charCodeAt(0) - 33;
    if (d < 0 || d > 84) throw bad(what, t('“{ch}” isn’t one of its letters.', { ch }));
    group.push(d);
    if (group.length === 5) flush(4);
  }
  if (group.length === 1) throw bad(what, t('it ends in the middle of a group.'));
  if (group.length) flush(group.length - 1);
  return new Uint8Array(out);
}

// ---- Base45 (RFC 9285, used in EU health certificates) ----
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

export function base45Encode(b: Uint8Array) {
  let out = '';
  for (let i = 0; i < b.length; i += 2) {
    if (i + 1 < b.length) {
      const n = b[i] * 256 + b[i + 1];
      out += B45[n % 45] + B45[Math.floor(n / 45) % 45] + B45[Math.floor(n / 2025)];
    } else out += B45[b[i] % 45] + B45[Math.floor(b[i] / 45)];
  }
  return out;
}

export function base45Decode(s: string) {
  const clean = s.replace(/[\r\n]+/g, '').toUpperCase();
  const d = [...clean].map((ch) => {
    const i = B45.indexOf(ch);
    if (i < 0) throw bad('Base45', t('“{ch}” isn’t one of its letters.', { ch }));
    return i;
  });
  if (d.length % 3 === 1) throw bad('Base45', t('it ends in the middle of a group.'));
  const out: number[] = [];
  for (let i = 0; i < d.length; i += 3) {
    if (i + 2 < d.length) {
      const n = d[i] + d[i + 1] * 45 + d[i + 2] * 2025;
      if (n > 0xffff) throw bad('Base45', t('a group is too big.'));
      out.push(n >> 8, n & 255);
    } else {
      const n = d[i] + d[i + 1] * 45;
      if (n > 0xff) throw bad('Base45', t('a group is too big.'));
      out.push(n);
    }
  }
  return new Uint8Array(out);
}

// ---- hex, binary, octal, decimal ----
export function hexEncode(b: Uint8Array, sep = '', upper = false) {
  const h = toHex(b);
  const s = (h.match(/../g) ?? []).join(sep);
  return upper ? s.toUpperCase() : s;
}
export const hexDecode = (s: string) => fromHex(s);

const radix = { 2: 8, 8: 3, 10: 3 } as const;

export function numbersEncode(b: Uint8Array, base: 2 | 8 | 10, sep = ' ') {
  return [...b].map((x) => (base === 10 ? String(x) : x.toString(base).padStart(radix[base], '0'))).join(sep);
}

export function numbersDecode(s: string, base: 2 | 8 | 10) {
  const what = base === 2 ? t('binary') : base === 8 ? t('octal') : t('decimal numbers');
  if (base === 2) {
    const clean = s.replace(/[\s,;:|-]+/g, '');
    if (!/^[01]*$/.test(clean)) throw bad(what, t('only 0 and 1 are allowed.'));
    // Groups separated by spaces may be shorter than 8 digits (leading zeros left out).
    const groups = /\s/.test(s.trim()) ? s.trim().split(/[\s,;:|-]+/) : clean.match(/.{1,8}/g) ?? [];
    if (!/\s/.test(s.trim()) && clean.length % 8) throw bad(what, t('the number of digits isn’t a multiple of 8.'));
    return new Uint8Array(groups.map((g) => {
      if (g.length > 8) throw bad(what, t('a group has more than 8 digits.'));
      return parseInt(g, 2);
    }));
  }
  const parts = s.trim() ? s.trim().split(/[^0-9]+/).filter(Boolean) : [];
  if (/[^0-9\s,;:|-]/.test(s)) throw bad(what, t('only digits and spaces are allowed.'));
  return new Uint8Array(parts.map((p) => {
    const v = parseInt(p, base);
    if (Number.isNaN(v) || v > 255 || (base === 8 && /[89]/.test(p))) throw bad(what, t('“{n}” isn’t a byte (0–255).', { n: p }));
    return v;
  }));
}

// ---- URL (percent) encoding ----
const UNRESERVED = /[A-Za-z0-9\-_.~]/;
const URI_KEEP = /[A-Za-z0-9\-_.~:/?#[\]@!$&'()*+,;=%]/;

export function urlEncode(b: Uint8Array, mode: 'component' | 'uri' | 'form' = 'component') {
  let out = '';
  for (const x of b) {
    const ch = String.fromCharCode(x);
    if (x < 128 && (mode === 'uri' ? URI_KEEP : UNRESERVED).test(ch)) out += ch;
    else if (mode === 'form' && x === 32) out += '+';
    else out += `%${x.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

export function urlDecode(s: string, plusIsSpace = false) {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '%' && /^[0-9a-f]{2}$/i.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (ch === '+' && plusIsSpace) out.push(32);
    else {
      // A whole character (an emoji is two UTF-16 units).
      const cp = s.codePointAt(i)!;
      const c = String.fromCodePoint(cp);
      out.push(...utf8(c));
      i += c.length - 1;
    }
  }
  return new Uint8Array(out);
}

// ---- HTML entities ----
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: String.fromCharCode(0xa0), copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', euro: '€', pound: '£', yen: '¥', cent: '¢',
  sect: '§', deg: '°', plusmn: '±', times: '×', divide: '÷', middot: '·', bull: '•', para: '¶', iexcl: '¡', iquest: '¿', shy: String.fromCharCode(0xad),
  micro: 'µ', frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
  aacute: 'á', Aacute: 'Á', eacute: 'é', Eacute: 'É', iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú',
  yacute: 'ý', Yacute: 'Ý', ecaron: 'ě', Ecaron: 'Ě', scaron: 'š', Scaron: 'Š', ccaron: 'č', Ccaron: 'Č', rcaron: 'ř', Rcaron: 'Ř',
  zcaron: 'ž', Zcaron: 'Ž', dcaron: 'ď', Dcaron: 'Ď', tcaron: 'ť', Tcaron: 'Ť', ncaron: 'ň', Ncaron: 'Ň', uring: 'ů', Uring: 'Ů',
  auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', szlig: 'ß', agrave: 'à', egrave: 'è', ccedil: 'ç', ntilde: 'ñ',
};
const SPECIAL: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function htmlEncode(s: string, all = false) {
  let out = '';
  for (const ch of s) {
    if (SPECIAL[ch]) out += SPECIAL[ch];
    else if (all && ch.codePointAt(0)! > 126) out += `&#x${ch.codePointAt(0)!.toString(16).toUpperCase()};`;
    else out += ch;
  }
  return out;
}

export function htmlDecode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (m, body: string) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[body] ?? m;
  });
}

// ---- Unicode escapes ----
export type EscapeStyle = 'js' | 'es6' | 'uplus';

export function unicodeEscape(s: string, all = false, style: EscapeStyle = 'js') {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (!all && cp >= 32 && cp < 127 && ch !== '\\') {
      out += ch;
      continue;
    }
    if (style === 'es6') out += `\\u{${cp.toString(16).toUpperCase()}}`;
    else if (style === 'uplus') out += `U+${cp.toString(16).toUpperCase().padStart(4, '0')} `;
    else for (let i = 0; i < ch.length; i++) out += `\\u${ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return style === 'uplus' ? out.replace(/ $/, '') : out;
}

const SIMPLE: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0', '\\': '\\', "'": "'", '"': '"', '/': '/' };

export function unicodeUnescape(s: string) {
  return s
    .replace(/U\+([0-9a-f]{4,6}) ?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\U([0-9a-f]{8})|\\x([0-9a-f]{2})|\\(.)/gi, (m, a?: string, b?: string, c?: string, d?: string, e?: string) => {
      if (a || c) {
        const cp = parseInt((a || c)!, 16);
        return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      }
      if (b || d) return String.fromCharCode(parseInt((b || d)!, 16));
      return SIMPLE[e!] ?? m;
    });
}

// ---- quoted-printable (e-mail) ----
export function qpEncode(b: Uint8Array) {
  const lines: string[] = [];
  let line = '';
  const push = (piece: string) => {
    if (line.length + piece.length > 75) {
      lines.push(`${line}=`);
      line = '';
    }
    line += piece;
  };
  for (let i = 0; i < b.length; i++) {
    const x = b[i];
    if (x === 10 || (x === 13 && b[i + 1] === 10)) {
      if (x === 13) i++;
      // A space or tab right before a line break would get lost.
      line = line.replace(/[ \t]$/, (m) => `=${m.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
      lines.push(line);
      line = '';
      continue;
    }
    const literal = (x >= 33 && x <= 126 && x !== 61) || x === 32 || x === 9;
    push(literal ? String.fromCharCode(x) : `=${x.toString(16).toUpperCase().padStart(2, '0')}`);
  }
  line = line.replace(/[ \t]$/, (m) => `=${m.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  lines.push(line);
  return lines.join('\n');
}

export function qpDecode(s: string) {
  const joined = s.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const ch = joined[i];
    if (ch === '=' && /^[0-9a-f]{2}$/i.test(joined.slice(i + 1, i + 3))) {
      out.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(...utf8(ch));
  }
  return new Uint8Array(out);
}

// ---- Punycode (RFC 3492), for domain names like háček.cz ----
const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700, INITIAL_BIAS = 72, INITIAL_N = 128;

function adapt(delta: number, points: number, first: boolean) {
  let d = first ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / points);
  let k = 0;
  while (d > ((BASE - TMIN) * TMAX) >> 1) {
    d = Math.floor(d / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * d) / (d + SKEW));
}
const digit = (d: number) => String.fromCharCode(d + 22 + 75 * Number(d < 26));

export function punyEncodeLabel(input: string) {
  const cps = Array.from(input).map((c) => c.codePointAt(0)!);
  let out = cps.filter((c) => c < 128).map((c) => String.fromCharCode(c)).join('');
  const basic = out.length;
  let h = basic;
  if (basic) out += '-';
  let n = INITIAL_N, delta = 0, bias = INITIAL_BIAS;
  while (h < cps.length) {
    const m = Math.min(...cps.filter((c) => c >= n));
    delta += (m - n) * (h + 1);
    n = m;
    for (const c of cps) {
      if (c < n) delta++;
      if (c === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const tt = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
          if (q < tt) break;
          out += digit(tt + ((q - tt) % (BASE - tt)));
          q = Math.floor((q - tt) / (BASE - tt));
        }
        out += digit(q);
        bias = adapt(delta, h + 1, h === basic);
        delta = 0;
        h++;
      }
    }
    delta++;
    n++;
  }
  return out;
}

export function punyDecodeLabel(input: string) {
  const out: number[] = [];
  const b = input.lastIndexOf('-');
  for (let j = 0; j < Math.max(b, 0); j++) out.push(input.charCodeAt(j));
  let n = INITIAL_N, bias = INITIAL_BIAS, i = 0;
  for (let at = b > 0 ? b + 1 : 0; at < input.length; ) {
    const oldi = i;
    for (let w = 1, k = BASE; ; k += BASE) {
      if (at >= input.length) throw bad('Punycode');
      const c = input.charCodeAt(at++);
      const d = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : BASE;
      if (d >= BASE) throw bad('Punycode');
      i += d * w;
      const tt = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (d < tt) break;
      w *= BASE - tt;
    }
    bias = adapt(i - oldi, out.length + 1, oldi === 0);
    n += Math.floor(i / (out.length + 1));
    i %= out.length + 1;
    if (n > 0x10ffff) throw bad('Punycode');
    out.splice(i++, 0, n);
  }
  return String.fromCodePoint(...out);
}

/** Each part of a domain (or each word) with letters beyond ASCII becomes xn--…; the rest stays. */
export const punyEncode = (s: string) =>
  s.replace(/[^\s.]+/g, (label) => (/[^\0-\x7f]/.test(label) ? `xn--${punyEncodeLabel(label)}` : label));
export const punyDecode = (s: string) => s.replace(/xn--([^\s.]+)/gi, (_, body: string) => punyDecodeLabel(body));

// ---- Morse code ----
const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...',
  ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', _: '..--.-', '"': '.-..-.', $: '...-..-', '@': '.--.-.',
};
const FROM_MORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');

export function morseEncode(s: string, czechCh = false) {
  return s
    .split('\n')
    .map((line) =>
      line
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => {
          const up = plain(word).toUpperCase();
          const codes: string[] = [];
          for (let i = 0; i < up.length; i++) {
            if (czechCh && up[i] === 'C' && up[i + 1] === 'H') {
              codes.push('----');
              i++;
              continue;
            }
            const code = MORSE[up[i]];
            if (!code) throw new Error(t('Morse code has no sign for “{ch}”.', { ch: up[i] }));
            codes.push(code);
          }
          return codes.join(' ');
        })
        .join(' / '),
    )
    .join('\n');
}

export function morseDecode(s: string, czechCh = false) {
  const norm = s.replace(/[•·∙]/g, '.').replace(/[–—−_]/g, '-');
  if (/[^.\-\s/|]/.test(norm)) throw bad(t('Morse code'), t('only dots, dashes, spaces and / are allowed.'));
  return norm
    .split('\n')
    .map((line) =>
      line
        .trim()
        .split(/\s*[/|]\s*|\s{3,}/)
        .filter(Boolean)
        .map((word) =>
          word
            .split(/\s+/)
            .map((code) => {
              if (czechCh && code === '----') return 'CH';
              const ch = FROM_MORSE[code];
              if (!ch) throw bad(t('Morse code'), t('“{code}” isn’t a letter.', { code }));
              return ch;
            })
            .join(''),
        )
        .join(' '),
    )
    .join('\n');
}
