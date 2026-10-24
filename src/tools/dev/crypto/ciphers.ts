// Classic ciphers (puzzles, school, CTF): none of them keeps anything secret today. They change the
// letters A–Z and keep the case; letters with accents, digits and everything else stay as they are,
// unless a cipher says otherwise (Playfair, Polybius, Bacon and A1Z26 work on plain letters only).
import { t } from '../../../lib/i18n-core';
import { fromHex, utf8 } from './bytes';

const A = 65;
const a = 97;
const mod = (n: number, m: number) => ((n % m) + m) % m;
const isUpper = (c: number) => c >= A && c <= A + 25;
const isLower = (c: number) => c >= a && c <= a + 25;

/** Runs fn on each letter A–Z / a–z as 0–25 (with its position among the letters), keeping its case. */
function mapLetters(s: string, fn: (x: number, i: number) => number) {
  let i = 0;
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (ch.length === 1 && isUpper(c)) out += String.fromCharCode(A + mod(fn(c - A, i++), 26));
    else if (ch.length === 1 && isLower(c)) out += String.fromCharCode(a + mod(fn(c - a, i++), 26));
    else out += ch;
  }
  return out;
}

const plainLetters = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();

/** The letters of a key as 0–25; accents are dropped, anything else ignored. */
function keyShifts(key: string) {
  const k = [...plainLetters(key)].filter((c) => isUpper(c.charCodeAt(0))).map((c) => c.charCodeAt(0) - A);
  if (!k.length) throw new Error(t('The key needs at least one letter.'));
  return k;
}

export const caesar = (s: string, shift: number) => mapLetters(s, (x) => x + shift);

export const atbash = (s: string) => mapLetters(s, (x) => 25 - x);

export function rot47(s: string) {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += ch.length === 1 && c >= 33 && c <= 126 ? String.fromCharCode(33 + ((c - 33 + 47) % 94)) : ch;
  }
  return out;
}

/** ROT13 for letters and ROT5 for digits. */
export const rot18 = (s: string) => caesar(s, 13).replace(/[0-9]/g, (d) => String((Number(d) + 5) % 10));

const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : Math.abs(x));
const inverse = (x: number) => {
  for (let i = 1; i < 26; i++) if ((x * i) % 26 === 1) return i;
  return 0;
};

export function affine(s: string, ka: number, kb: number, decode: boolean) {
  if (gcd(mod(ka, 26), 26) !== 1) throw new Error(t('“a” must have no common divisor with 26: use 1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23 or 25.'));
  const inv = inverse(mod(ka, 26));
  return mapLetters(s, (x) => (decode ? inv * (x - kb) : ka * x + kb));
}

export function vigenere(s: string, key: string, decode: boolean) {
  const k = keyShifts(key);
  return mapLetters(s, (x, i) => x + (decode ? -k[i % k.length] : k[i % k.length]));
}

/** Beaufort: letter = key − letter. Doing it twice gives the text back. */
export function beaufort(s: string, key: string) {
  const k = keyShifts(key);
  return mapLetters(s, (x, i) => k[i % k.length] - x);
}

/** Autokey: the key, then the message itself. */
export function autokey(s: string, key: string, decode: boolean) {
  const stream = keyShifts(key);
  return mapLetters(s, (x, i) => {
    const y = decode ? mod(x - stream[i], 26) : mod(x + stream[i], 26);
    stream.push(decode ? y : x);
    return y;
  });
}

/** A key of all 26 letters is the alphabet itself; a shorter keyword starts the alphabet (ZEBRA → ZEBRACDFG…). */
export function substitutionAlphabet(key: string) {
  const letters = [...plainLetters(key)].filter((c) => isUpper(c.charCodeAt(0)));
  if (!letters.length) throw new Error(t('The key needs at least one letter.'));
  const seen: string[] = [];
  for (const c of [...letters, ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']) if (!seen.includes(c)) seen.push(c);
  return seen.join('');
}

export function substitution(s: string, key: string, decode: boolean) {
  const abc = substitutionAlphabet(key);
  return mapLetters(s, (x) => (decode ? abc.indexOf(String.fromCharCode(A + x)) : abc.charCodeAt(x) - A));
}

// ---- Playfair (5×5, J counts as I) ----
function square(key: string) {
  const out: string[] = [];
  for (const c of [...plainLetters(key).replace(/J/g, 'I'), ...'ABCDEFGHIKLMNOPQRSTUVWXYZ']) if (isUpper(c.charCodeAt(0)) && !out.includes(c)) out.push(c);
  return out;
}

export function playfair(s: string, key: string, decode: boolean) {
  const sq = square(key);
  const pos = (c: string) => sq.indexOf(c);
  const text = plainLetters(s).replace(/J/g, 'I').replace(/[^A-Z]/g, '');
  const pairs: [string, string][] = [];
  if (decode) {
    if (text.length % 2) throw new Error(t('Playfair text has an even number of letters.'));
    for (let i = 0; i < text.length; i += 2) pairs.push([text[i], text[i + 1]]);
  } else {
    for (let i = 0; i < text.length; ) {
      const x = text[i];
      let y = text[i + 1];
      if (y === undefined || y === x) {
        y = x === 'X' ? 'Q' : 'X';
        i += 1;
      } else i += 2;
      pairs.push([x, y]);
    }
  }
  const d = decode ? 4 : 1;
  return pairs
    .map(([x, y]) => {
      const p = pos(x), q = pos(y);
      const [r1, c1, r2, c2] = [Math.floor(p / 5), p % 5, Math.floor(q / 5), q % 5];
      if (r1 === r2) return sq[r1 * 5 + ((c1 + d) % 5)] + sq[r2 * 5 + ((c2 + d) % 5)];
      if (c1 === c2) return sq[((r1 + d) % 5) * 5 + c1] + sq[((r2 + d) % 5) * 5 + c2];
      return sq[r1 * 5 + c2] + sq[r2 * 5 + c1];
    })
    .join('');
}

// ---- letters → numbers / symbols, one word per group ----
const words = (s: string) => plainLetters(s).split(/\s+/).filter(Boolean);
const wordGroups = (s: string, sep: RegExp) => s.trim().split(sep).filter((w) => w.trim());

/** Polybius square: A = 11, B = 12 … (J counts as I). */
export function polybius(s: string, decode: boolean) {
  const sq = square('');
  if (!decode)
    return words(s)
      .map((w) => [...w.replace(/J/g, 'I')].filter((c) => sq.includes(c)).map((c) => `${Math.floor(sq.indexOf(c) / 5) + 1}${(sq.indexOf(c) % 5) + 1}`).join(' '))
      .filter(Boolean)
      .join(' / ');
  return wordGroups(s, /\s*\/\s*/)
    .map((w) => {
      const digits = w.replace(/\s+/g, '');
      if (!/^[1-5]*$/.test(digits) || digits.length % 2) throw new Error(t('Polybius code is pairs of digits 1–5, like 23 15 31 31 34.'));
      return (digits.match(/../g) ?? []).map((p) => sq[(Number(p[0]) - 1) * 5 + Number(p[1]) - 1]).join('');
    })
    .join(' ');
}

/** Bacon's cipher (the 26-letter version): A = AAAAA, B = AAAAB … */
export function bacon(s: string, decode: boolean) {
  if (!decode)
    return words(s)
      .map((w) => [...w].filter((c) => isUpper(c.charCodeAt(0))).map((c) => (c.charCodeAt(0) - A).toString(2).padStart(5, '0').replace(/0/g, 'A').replace(/1/g, 'B')).join(' '))
      .filter(Boolean)
      .join(' / ');
  return wordGroups(s, /\s*\/\s*/)
    .map((w) => {
      const ab = w.replace(/\s+/g, '').toUpperCase();
      if (!/^[AB]*$/.test(ab) || ab.length % 5) throw new Error(t('Bacon code is groups of five A and B, like AABBA.'));
      return (ab.match(/.{5}/g) ?? [])
        .map((g) => {
          const n = parseInt(g.replace(/A/g, '0').replace(/B/g, '1'), 2);
          if (n > 25) throw new Error(t('“{group}” isn’t a letter in Bacon code.', { group: g }));
          return String.fromCharCode(A + n);
        })
        .join('');
    })
    .join(' ');
}

/** A1Z26: A = 1 … Z = 26, letters joined with -, words with a space. */
export function a1z26(s: string, decode: boolean) {
  if (!decode)
    return words(s)
      .map((w) => [...w].filter((c) => isUpper(c.charCodeAt(0))).map((c) => c.charCodeAt(0) - A + 1).join('-'))
      .filter(Boolean)
      .join(' ');
  return wordGroups(s, /\s+/)
    .map((w) =>
      w
        .split(/[-,.]+/)
        .filter(Boolean)
        .map((n) => {
          const v = Number(n);
          if (!Number.isInteger(v) || v < 1 || v > 26) throw new Error(t('“{n}” isn’t a letter number (1–26).', { n }));
          return String.fromCharCode(A + v - 1);
        })
        .join(''),
    )
    .join(' ');
}

// ---- transpositions (every character moves, nothing changes) ----
function railPattern(n: number, rails: number) {
  const cycle = 2 * (rails - 1);
  return Array.from({ length: n }, (_, i) => {
    const p = i % cycle;
    return p < rails ? p : cycle - p;
  });
}

export function railFence(s: string, rails: number, decode: boolean) {
  const chars = Array.from(s);
  if (rails < 2 || rails >= chars.length) return s;
  const rail = railPattern(chars.length, rails);
  const order = chars.map((_, i) => i).sort((x, y) => rail[x] - rail[y] || x - y);
  const out = new Array<string>(chars.length);
  if (decode) order.forEach((from, i) => (out[from] = chars[i]));
  else order.forEach((from, i) => (out[i] = chars[from]));
  return out.join('');
}

export function columnar(s: string, key: string, decode: boolean) {
  const k = [...plainLetters(key)].filter((c) => /[A-Z0-9]/.test(c));
  if (k.length < 2) throw new Error(t('The key needs at least two letters.'));
  const chars = Array.from(s);
  const cols = k.length;
  const rows = Math.ceil(chars.length / cols);
  // Columns are read in the key's alphabetical order (equal letters left to right).
  const order = k.map((c, i) => [c, i] as const).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1])).map(([, i]) => i);
  const colLen = (c: number) => rows - (c >= chars.length % cols && chars.length % cols ? 1 : 0);
  const out = new Array<string>(chars.length);
  let at = 0;
  for (const c of order) {
    for (let r = 0; r < colLen(c); r++) {
      const idx = r * cols + c;
      if (decode) out[idx] = chars[at++];
      else out[at++] = chars[idx];
    }
  }
  return out.join('');
}

export const reverseText = (s: string) => Array.from(s).reverse().join('');

// ---- XOR ----
export type XorKeyType = 'text' | 'hex' | 'number';

export function xorKey(key: string, type: XorKeyType) {
  let k: Uint8Array;
  if (type === 'hex') k = fromHex(key, t('hex key'));
  else if (type === 'number') {
    const nums = key.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error(t('Key numbers go from 0 to 255, like 42 or 1, 2, 3.'));
    k = new Uint8Array(nums);
  } else k = utf8(key);
  if (!k.length) throw new Error(t('XOR needs a key.'));
  return k;
}

/** Every byte XOR the key's byte (the key repeats). Doing it twice gives the data back. */
export function xor(b: Uint8Array, key: Uint8Array) {
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b[i] ^ key[i % key.length];
  return out;
}
