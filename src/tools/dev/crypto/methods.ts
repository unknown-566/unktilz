// The steps of the "Encode & ciphers" chain: each one turns bytes into bytes, one way and back.
// Text steps read their input as UTF-8 and write UTF-8.
import { t } from '../../../lib/i18n-core';
import { needText, utf8 } from './bytes';
import * as C from './codecs';
import * as K from './ciphers';

export type OptValue = string | number | boolean;
export type Opts = Record<string, OptValue>;

export type OptDef =
  | { key: string; label: string; type: 'number'; default: number; min?: number; max?: number; help?: string }
  | { key: string; label: string; type: 'text'; default: string; placeholder?: string; help?: string; secret?: boolean }
  | { key: string; label: string; type: 'select'; default: string; choices: { value: string; label: string }[]; help?: string }
  | { key: string; label: string; type: 'toggle'; default: boolean; help?: string; only?: 'encode' };

export type Group = 'encoding' | 'cipher';

export type Method = {
  id: string;
  group: Group;
  name: string;
  help: string;
  opts?: OptDef[];
  encode: (b: Uint8Array, o: Opts) => Uint8Array;
  decode: (b: Uint8Array, o: Opts) => Uint8Array;
  /** Encoding and decoding do the same thing (ROT13, XOR…). */
  same?: boolean;
};

// Helpers to write the steps short.
const text = (fn: (s: string, o: Opts) => string) => (b: Uint8Array, o: Opts) => utf8(fn(needText(b), o));
const toText = (fn: (b: Uint8Array, o: Opts) => string) => (b: Uint8Array, o: Opts) => utf8(fn(b, o));
const fromText = (fn: (s: string, o: Opts) => Uint8Array) => (b: Uint8Array, o: Opts) => fn(needText(b), o);
const str = (o: Opts, k: string) => String(o[k] ?? '');
const n = (o: Opts, k: string) => Number(o[k] ?? 0);

const sep = (label: string, def: string): OptDef => ({
  key: 'sep',
  label,
  type: 'select',
  default: def,
  choices: [
    { value: ' ', label: t('space') },
    { value: '', label: t('nothing') },
    { value: ',', label: ',' },
    { value: '\n', label: t('new line') },
  ],
});
const keyOpt = (def: string, help?: string): OptDef => ({ key: 'key', label: t('crypto|Key'), type: 'text', default: def, help });

export const METHODS: Method[] = [
  // ---- encodings ----
  {
    id: 'base64',
    group: 'encoding',
    name: 'Base64',
    help: t('Any data as letters, digits, + and /. Used in e-mails, data: URLs, JSON and tokens. Decoding takes both alphabets, missing = and line breaks.'),
    opts: [{ key: 'url', label: t('URL-safe'), type: 'toggle', default: false, only: 'encode', help: t('Uses - and _ instead of + and /, and drops the = padding, so the result can go straight into URLs and file names.') }],
    encode: toText((b, o) => C.base64Encode(b, !!o.url)),
    decode: fromText((s) => C.base64Decode(s)),
  },
  {
    id: 'base32',
    group: 'encoding',
    name: 'Base32',
    help: t('Capital letters and digits 2–7, easy to read out and type. Used for 2FA (TOTP) secrets.'),
    opts: [
      // i18n-ignore
      { key: 'hex', label: t('Alphabet'), type: 'select', default: 'rfc', choices: [{ value: 'rfc', label: 'A–Z 2–7' }, { value: 'hex', label: '0–9 A–V (base32hex)' }] },
      { key: 'pad', label: t('= padding'), type: 'toggle', default: true, only: 'encode' },
    ],
    encode: toText((b, o) => C.base32Encode(b, o.hex === 'hex', !!o.pad)),
    decode: fromText((s, o) => C.base32Decode(s, o.hex === 'hex')),
  },
  {
    id: 'base58',
    group: 'encoding',
    name: 'Base58',
    help: t('Like Base64 without the letters that look alike (0, O, I, l) and without + and /. Bitcoin addresses and IPFS use it.'),
    encode: toText((b) => C.base58Encode(b)),
    decode: fromText((s) => C.base58Decode(s)),
  },
  {
    id: 'base85',
    group: 'encoding',
    name: 'Base85',
    help: t('Shorter than Base64 (5 characters for 4 bytes). Ascii85 is used in PDF and PostScript, Z85 in ZeroMQ.'),
    opts: [
      { key: 'variant', label: t('Kind'), type: 'select', default: 'ascii85', choices: [{ value: 'ascii85', label: 'Ascii85' }, { value: 'z85', label: 'Z85' }] },
      { key: 'wrap', label: t('<~ ~> around'), type: 'toggle', default: false, only: 'encode' },
    ],
    encode: toText((b, o) => C.base85Encode(b, o.variant === 'z85', !!o.wrap)),
    decode: fromText((s, o) => C.base85Decode(s, o.variant === 'z85')),
  },
  {
    id: 'base45',
    group: 'encoding',
    name: 'Base45',
    help: t('Made for QR codes (their alphanumeric mode). The EU COVID certificates used it.'),
    encode: toText((b) => C.base45Encode(b)),
    decode: fromText((s) => C.base45Decode(s)),
  },
  {
    id: 'hex',
    group: 'encoding',
    name: t('Hex'),
    help: t('Each byte as two digits 0–9 a–f. Decoding ignores spaces, colons and 0x.'),
    opts: [
      { key: 'sep', label: t('Between bytes'), type: 'select', default: '', choices: [{ value: '', label: t('nothing') }, { value: ' ', label: t('space') }, { value: ':', label: ':' }] },
      { key: 'upper', label: t('Capital letters'), type: 'toggle', default: false, only: 'encode' },
    ],
    encode: toText((b, o) => C.hexEncode(b, str(o, 'sep'), !!o.upper)),
    decode: fromText((s) => C.hexDecode(s)),
  },
  {
    id: 'binary',
    group: 'encoding',
    name: t('Binary'),
    help: t('Each byte as eight 0s and 1s.'),
    opts: [sep(t('Between bytes'), ' ')],
    encode: toText((b, o) => C.numbersEncode(b, 2, str(o, 'sep'))),
    decode: fromText((s) => C.numbersDecode(s, 2)),
  },
  {
    id: 'octal',
    group: 'encoding',
    name: t('Octal'),
    help: t('Each byte as a number in base 8 (000–377).'),
    opts: [sep(t('Between bytes'), ' ')],
    encode: toText((b, o) => C.numbersEncode(b, 8, str(o, 'sep') || ' ')),
    decode: fromText((s) => C.numbersDecode(s, 8)),
  },
  {
    id: 'decimal',
    group: 'encoding',
    name: t('Decimal'),
    help: t('Each byte as a number 0–255, like 72 105.'),
    opts: [sep(t('Between bytes'), ' ')],
    encode: toText((b, o) => C.numbersEncode(b, 10, str(o, 'sep') || ' ')),
    decode: fromText((s) => C.numbersDecode(s, 10)),
  },
  {
    id: 'url',
    group: 'encoding',
    name: t('URL encoding'),
    help: t('Letters that can’t be in a web address become %XX (a space is %20, “č” is %C4%8D).'),
    opts: [
      {
        key: 'mode',
        label: t('What to keep'),
        type: 'select',
        default: 'component',
        choices: [
          { value: 'component', label: t('one value (encodeURIComponent)') },
          { value: 'uri', label: t('whole address (encodeURI)') },
          { value: 'form', label: t('form (space as +)') },
        ],
      },
    ],
    encode: toText((b, o) => C.urlEncode(b, str(o, 'mode') as 'component')),
    decode: fromText((s, o) => C.urlDecode(s, o.mode === 'form')),
  },
  {
    id: 'html',
    group: 'encoding',
    name: t('HTML entities'),
    help: t('& < > " and \' become &amp; &lt; … so text shows in a web page as it is. Decoding knows names like &nbsp; &copy; &scaron; and numbers like &#269;.'),
    opts: [{ key: 'all', label: t('Also every non-ASCII letter'), type: 'toggle', default: false, only: 'encode' }],
    encode: text((s, o) => C.htmlEncode(s, !!o.all)),
    decode: text((s) => C.htmlDecode(s)),
  },
  {
    id: 'unicode',
    group: 'encoding',
    name: t('Unicode escapes'),
    help: t('Letters as their code, like in JavaScript, JSON, Java or Python strings. Decoding also knows \\n, \\t, \\x41 and U+0041.'),
    opts: [
      {
        key: 'style',
        label: t('Style'),
        type: 'select',
        default: 'js',
        // i18n-ignore
        choices: [{ value: 'js', label: 'JS / JSON (\\u010D)' }, { value: 'es6', label: 'ES6 (\\u{10D})' }, { value: 'uplus', label: 'U+010D' }],
      },
      { key: 'all', label: t('Every letter, ASCII too'), type: 'toggle', default: false, only: 'encode' },
    ],
    encode: text((s, o) => C.unicodeEscape(s, !!o.all, str(o, 'style') as C.EscapeStyle)),
    decode: text((s) => C.unicodeUnescape(s)),
  },
  {
    id: 'qp',
    group: 'encoding',
    name: 'Quoted-printable',
    help: t('The e-mail encoding: plain letters stay, the rest become =XX, lines are at most 76 characters.'),
    encode: toText((b) => C.qpEncode(b)),
    decode: fromText((s) => C.qpDecode(s)),
  },
  {
    id: 'punycode',
    group: 'encoding',
    name: 'Punycode',
    help: t('Domain names with accents in plain ASCII: háček.cz is xn--hek-ela4t.cz.'),
    encode: text((s) => C.punyEncode(s)),
    decode: text((s) => C.punyDecode(s)),
  },
  {
    id: 'morse',
    group: 'encoding',
    name: t('Morse code'),
    help: t('Letters as dots and dashes, a space between letters and / between words. Accents are dropped (Morse code has none).'),
    opts: [{ key: 'ch', label: t('CH as one letter (----)'), type: 'toggle', default: false, help: t('Czech Morse code has CH as its own letter.') }],
    encode: text((s, o) => C.morseEncode(s, !!o.ch)),
    decode: text((s, o) => C.morseDecode(s, !!o.ch)),
  },

  // ---- classic ciphers ----
  {
    id: 'caesar',
    group: 'cipher',
    name: t('Caesar'),
    help: t('Moves every letter by the same number of places (3: A → D). Only 25 possible keys, so “Every shift” below cracks it at once.'),
    opts: [{ key: 'shift', label: t('Shift'), type: 'number', default: 3, min: -25, max: 25 }],
    encode: text((s, o) => K.caesar(s, n(o, 'shift'))),
    decode: text((s, o) => K.caesar(s, -n(o, 'shift'))),
  },
  { id: 'rot13', group: 'cipher', name: 'ROT13', help: t('Caesar with a shift of 13: doing it twice gives the text back.'), same: true, encode: text((s) => K.caesar(s, 13)), decode: text((s) => K.caesar(s, 13)) },
  { id: 'rot47', group: 'cipher', name: 'ROT47', help: t('Like ROT13, but over all visible ASCII characters (digits and symbols too).'), same: true, encode: text(K.rot47), decode: text(K.rot47) },
  { id: 'rot18', group: 'cipher', name: 'ROT18', help: t('ROT13 for letters and ROT5 for digits.'), same: true, encode: text(K.rot18), decode: text(K.rot18) },
  { id: 'atbash', group: 'cipher', name: 'Atbash', help: t('The alphabet backwards: A ↔ Z, B ↔ Y …'), same: true, encode: text(K.atbash), decode: text(K.atbash) },
  {
    id: 'affine',
    group: 'cipher',
    name: t('Affine'),
    help: t('Each letter x becomes a·x + b (mod 26). Caesar is a = 1.'),
    opts: [
      { key: 'a', label: 'a', type: 'number', default: 5, min: 1, max: 25 },
      { key: 'b', label: 'b', type: 'number', default: 8, min: 0, max: 25 },
    ],
    encode: text((s, o) => K.affine(s, n(o, 'a'), n(o, 'b'), false)),
    decode: text((s, o) => K.affine(s, n(o, 'a'), n(o, 'b'), true)),
  },
  {
    id: 'vigenere',
    group: 'cipher',
    name: 'Vigenère',
    help: t('Caesar with a different shift for each letter, taken from the key (LEMON: +11, +4, +12…).'),
    opts: [keyOpt('LEMON')],
    encode: text((s, o) => K.vigenere(s, str(o, 'key'), false)),
    decode: text((s, o) => K.vigenere(s, str(o, 'key'), true)),
  },
  {
    id: 'beaufort',
    group: 'cipher',
    name: 'Beaufort',
    help: t('Vigenère turned around (key − letter): the same step locks and unlocks.'),
    opts: [keyOpt('FORTIFICATION')],
    same: true,
    encode: text((s, o) => K.beaufort(s, str(o, 'key'))),
    decode: text((s, o) => K.beaufort(s, str(o, 'key'))),
  },
  {
    id: 'autokey',
    group: 'cipher',
    name: 'Autokey',
    help: t('Vigenère where the key goes on with the message itself, so it doesn’t repeat.'),
    opts: [keyOpt('QUEENLY')],
    encode: text((s, o) => K.autokey(s, str(o, 'key'), false)),
    decode: text((s, o) => K.autokey(s, str(o, 'key'), true)),
  },
  {
    id: 'substitution',
    group: 'cipher',
    name: t('Substitution'),
    help: t('Every letter is swapped for another from a mixed alphabet. Write all 26 letters, or a keyword that starts the alphabet (ZEBRA → ZEBRACDFGHIJ…).'),
    opts: [keyOpt('ZEBRA')],
    encode: text((s, o) => K.substitution(s, str(o, 'key'), false)),
    decode: text((s, o) => K.substitution(s, str(o, 'key'), true)),
  },
  {
    id: 'playfair',
    group: 'cipher',
    name: 'Playfair',
    help: t('Pairs of letters in a 5×5 square made from the key (J counts as I). Keeps only the letters, in capitals; X fills double letters and an odd end.'),
    opts: [keyOpt('PLAYFAIR EXAMPLE')],
    encode: text((s, o) => K.playfair(s, str(o, 'key'), false)),
    decode: text((s, o) => K.playfair(s, str(o, 'key'), true)),
  },
  { id: 'polybius', group: 'cipher', name: t('Polybius square'), help: t('Each letter as its row and column in a 5×5 square: A = 11, B = 12 … (J counts as I).'), encode: text((s) => K.polybius(s, false)), decode: text((s) => K.polybius(s, true)) },
  { id: 'bacon', group: 'cipher', name: t('Bacon'), help: t('Each letter as five A and B: A = AAAAA, B = AAAAB …'), encode: text((s) => K.bacon(s, false)), decode: text((s) => K.bacon(s, true)) },
  { id: 'a1z26', group: 'cipher', name: 'A1Z26', help: t('Letters as their number in the alphabet: A = 1 … Z = 26.'), encode: text((s) => K.a1z26(s, false)), decode: text((s) => K.a1z26(s, true)) },
  {
    id: 'railfence',
    group: 'cipher',
    name: t('Rail fence'),
    help: t('Writes the text in a zigzag over a number of rows and reads it row by row. Letters only move.'),
    opts: [{ key: 'rails', label: t('Rows'), type: 'number', default: 3, min: 2, max: 50 }],
    encode: text((s, o) => K.railFence(s, n(o, 'rails'), false)),
    decode: text((s, o) => K.railFence(s, n(o, 'rails'), true)),
  },
  {
    id: 'columnar',
    group: 'cipher',
    name: t('Columnar transposition'),
    help: t('Writes the text in rows under the key and reads the columns in the key’s alphabetical order. Letters only move.'),
    opts: [keyOpt('ZEBRAS')],
    encode: text((s, o) => K.columnar(s, str(o, 'key'), false)),
    decode: text((s, o) => K.columnar(s, str(o, 'key'), true)),
  },
  {
    id: 'xor',
    group: 'cipher',
    name: 'XOR',
    help: t('Every byte XOR the key (the key repeats). The same step locks and unlocks. Often followed by Base64 or hex, since the result is usually not readable text.'),
    opts: [
      keyOpt('key'),
      {
        key: 'keyType',
        label: t('Key is'),
        type: 'select',
        default: 'text',
        choices: [{ value: 'text', label: t('text') }, { value: 'hex', label: t('hex') }, { value: 'number', label: t('numbers 0–255') }],
      },
    ],
    same: true,
    encode: (b, o) => K.xor(b, K.xorKey(str(o, 'key'), str(o, 'keyType') as K.XorKeyType)),
    decode: (b, o) => K.xor(b, K.xorKey(str(o, 'key'), str(o, 'keyType') as K.XorKeyType)),
  },
  { id: 'reverse', group: 'cipher', name: t('Reverse'), help: t('The text backwards.'), same: true, encode: text(K.reverseText), decode: text(K.reverseText) },
];

const byId = new Map(METHODS.map((m) => [m.id, m]));
export const getMethod = (id: string) => byId.get(id);

export const defaultsOf = (m: Method): Opts => Object.fromEntries((m.opts ?? []).map((o) => [o.key, o.default]));

export type Step = { method: string; opts: Opts };
export const newStep = (method: string): Step => ({ method, opts: defaultsOf(getMethod(method)!) });

export type StepError = { step: number; message: string };

/**
 * Runs the steps in order (encode) or backwards with each step undone (decode). Stops at the first
 * step that fails and says which one.
 */
export function runChain(input: Uint8Array, steps: Step[], decode: boolean): { out: Uint8Array; error?: StepError } {
  let data = input;
  const order = decode ? steps.map((_, i) => steps.length - 1 - i) : steps.map((_, i) => i);
  for (const i of order) {
    const m = getMethod(steps[i].method);
    if (!m) continue;
    const opts = { ...defaultsOf(m), ...steps[i].opts };
    try {
      data = decode ? m.decode(data, opts) : m.encode(data, opts);
    } catch (e) {
      return { out: data, error: { step: i, message: e instanceof Error ? e.message : String(e) } };
    }
  }
  return { out: data };
}
