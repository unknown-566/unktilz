// i18n-ignore-file: character sets and patterns
import { WORDS } from './words';

/** A whole number in [0, n) from the browser's secure random source, without bias. */
export function randomInt(n: number) {
  if (n <= 1) return 0;
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

export const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?~',
} as const;
export type SetName = keyof typeof SETS;

/** Characters that are easy to mix up when a password is read or typed by hand. */
const LOOK_ALIKE = /[Il1O0o]/g;

export type CharOptions = { length: number; sets: SetName[]; noLookAlike: boolean };

const setChars = (name: SetName, noLookAlike: boolean) => (noLookAlike ? SETS[name].replace(LOOK_ALIKE, '') : SETS[name]);

/** A random password that has at least one character of every chosen set. */
export function charPassword({ length, sets, noLookAlike }: CharOptions) {
  const groups = sets.map((s) => setChars(s, noLookAlike)).filter(Boolean);
  if (!groups.length) return '';
  const pool = groups.join('');
  // Draw until every set is in it: every such password is equally likely.
  for (;;) {
    let out = '';
    for (let i = 0; i < length; i++) out += pool[randomInt(pool.length)];
    if (length < groups.length || groups.every((g) => [...out].some((c) => g.includes(c)))) return out;
  }
}

const log2Big = (n: bigint) => {
  if (n <= 0n) return 0;
  const s = n.toString(2);
  // The first 50 bits are plenty for the fraction.
  const head = Number(BigInt('0b' + s.slice(0, 50)));
  return Math.log2(head) + (s.length - Math.min(50, s.length));
};

/** How many bits of randomness a character password has: exactly how many passwords it could be. */
export function charBits({ length, sets, noLookAlike }: CharOptions) {
  const sizes = sets.map((s) => setChars(s, noLookAlike).length).filter(Boolean);
  if (!sizes.length) return 0;
  if (length < sizes.length) return length * Math.log2(sizes.reduce((a, b) => a + b, 0));
  // Inclusion and exclusion: passwords from the whole pool minus those missing a set.
  let count = 0n;
  const k = sizes.length;
  for (let mask = 0; mask < 1 << k; mask++) {
    let size = 0;
    let bits = 0;
    for (let i = 0; i < k; i++)
      if (mask & (1 << i)) {
        size += sizes[i];
        bits++;
      }
    const term = BigInt(size) ** BigInt(length);
    count += (k - bits) % 2 ? -term : term;
  }
  return log2Big(count);
}

export type WordOptions = { count: number; separator: string; capitalize: boolean; number: boolean };

/** A passphrase of random words from the EFF list. */
export function wordPassword({ count, separator, capitalize, number }: WordOptions) {
  const words = Array.from({ length: count }, () => WORDS[randomInt(WORDS.length)]);
  const cased = capitalize ? words.map((w) => w[0].toUpperCase() + w.slice(1)) : words;
  if (number) {
    const i = randomInt(count);
    cased[i] += String(randomInt(10));
  }
  return cased.join(separator);
}

export const wordBits = ({ count, number }: WordOptions) => count * Math.log2(WORDS.length) + (number ? Math.log2(10 * count) : 0);

export const pin = (length: number) => Array.from({ length }, () => randomInt(10)).join('');
export const pinBits = (length: number) => length * Math.log2(10);

// ---------------------------------------------------------------------------------------------
// How strong a typed password is. Like zxcvbn, but small: the password is split into the cheapest
// pieces an attacker would guess (common passwords, words, years, runs like "abc" or "qwerty",
// repeated letters, and otherwise single characters), and the guesses of the pieces add up.

/** The most used passwords from public leak lists, most used first. */
const COMMON = (
  '123456 password 123456789 12345678 12345 qwerty 1234567 111111 1234567890 123123 abc123 1234 password1 iloveyou 1q2w3e4r 000000 qwerty123 zaq12wsx dragon sunshine princess letmein 654321 monkey 27653 1qaz2wsx 123321 qwertyuiop superman asdfghjkl ' +
  'football baseball welcome admin login master hello freedom whatever qazwsx trustno1 starwars shadow michael jordan23 harley hunter ranger buster soccer killer pepper ginger charlie robert thomas daniel andrew joshua jessica ashley jennifer ' +
  'computer internet secret summer winter spring autumn flower cookie chocolate pokemon minecraft batman pass passw0rd p@ssw0rd p@ssword admin123 root toor test test123 guest default changeme nothing access hottie lovely loveme flower ' +
  'heslo heslo123 ahoj ahoj123 slunicko kocicka pepicek martin tomas petr jana lucie veronika sparta slavia banik praha brno ostrava matrix mustang maverick corvette yankees dolphin tigger cheese purple orange yellow ' +
  'asdf asdfgh zxcvbn zxcvbnm qwer 147258369 159753 987654321 11111111 00000000 121212 112233 696969 aaaaaa abcdef abcd1234 a1b2c3 q1w2e3r4 1q2w3e qweasd'
).split(' ');
const COMMON_RANK = new Map(COMMON.map((w, i) => [w, i + 1]));
const WORD_SET = new Set(WORDS);

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'qwertzuiop', 'yxcvbnm', '1234567890', 'abcdefghijklmnopqrstuvwxyz'];

const LEET: Record<string, string> = { '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't' };
const unleet = (s: string) => [...s].map((c) => LEET[c] ?? c).join('');

export type Piece = { kind: 'common' | 'word' | 'year' | 'run' | 'repeat' | 'char'; text: string; bits: number };

/** The size of the alphabet the password seems to come from. */
function poolSize(pw: string) {
  let n = 0;
  if (/[a-z]/.test(pw)) n += 26;
  if (/[A-Z]/.test(pw)) n += 26;
  if (/\d/.test(pw)) n += 10;
  if (/[!-/:-@[-`{-~ ]/.test(pw)) n += 33;
  if (/[^\x20-\x7e]/.test(pw)) n += 100;
  return Math.max(n, 10);
}

/** Is `s` (3+ characters) a run along a keyboard row or the alphabet, either way? */
function isRun(s: string) {
  const l = s.toLowerCase();
  const back = [...l].reverse().join('');
  return ROWS.some((r) => r.includes(l) || r.includes(back));
}

/** The pieces a guesser would try for each part of `pw`, and their bits added up. */
export function analyze(pw: string): { bits: number; pieces: Piece[] } {
  if (!pw) return { bits: 0, pieces: [] };
  const n = pw.length;
  const charBits = Math.log2(poolSize(pw));
  // best[i]: the cheapest way to guess the first i characters.
  const best: { bits: number; piece: Piece | null; from: number }[] = [{ bits: 0, piece: null, from: 0 }];
  for (let end = 1; end <= n; end++) {
    let pick = { bits: best[end - 1].bits + charBits, piece: { kind: 'char', text: pw[end - 1], bits: charBits } as Piece, from: end - 1 };
    const take = (from: number, piece: Piece) => {
      const bits = best[from].bits + piece.bits;
      if (bits < pick.bits) pick = { bits, piece, from };
    };
    for (let start = Math.max(0, end - 30); start <= end - 2; start++) {
      const text = pw.slice(start, end);
      const lower = text.toLowerCase();
      const caps = text !== lower ? (text === lower[0].toUpperCase() + lower.slice(1) ? 1 : 2) : 0;
      const plain = unleet(lower);
      const leet = plain !== lower ? 1 : 0;
      const rank = COMMON_RANK.get(lower) ?? COMMON_RANK.get(plain);
      if (rank) take(start, { kind: 'common', text, bits: Math.log2(rank + 1) + caps + leet });
      if (text.length >= 3 && WORD_SET.has(plain)) take(start, { kind: 'word', text, bits: Math.log2(WORDS.length) + caps + leet });
      if (/^(19|20)\d\d$/.test(text)) take(start, { kind: 'year', text, bits: Math.log2(150) });
      if (text.length >= 3 && isRun(text)) take(start, { kind: 'run', text, bits: Math.log2(26 * 2 * text.length) + caps });
      if (text.length >= 3 && /^(.)\1+$/.test(text)) take(start, { kind: 'repeat', text, bits: charBits + Math.log2(text.length) });
    }
    best[end] = pick;
  }
  const pieces: Piece[] = [];
  for (let i = n; i > 0; i = best[i].from) pieces.unshift(best[i].piece!);
  // Joining the pieces also has to be guessed: a little for each piece after the first.
  const bits = best[n].bits + Math.max(0, pieces.length - 1) * 0.5;
  return { bits, pieces };
}

/** 0 very weak … 4 very strong. */
export const level = (bits: number) => (bits < 28 ? 0 : bits < 36 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4);

/** Guesses per second: someone trying on a website, and someone with a stolen database and a fast computer. */
export const SPEEDS = { online: 10, offline: 1e10 } as const;

/** Seconds to find it on average (half of all guesses). */
export const crackSeconds = (bits: number, perSecond: number) => Math.pow(2, bits - 1) / perSecond;
