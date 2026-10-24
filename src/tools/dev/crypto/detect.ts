// Guesses what a pasted text is, so decoding is one click. Only cheap pattern checks; a guess that
// decodes to readable text comes first.
import { t } from '../../../lib/i18n-core';
import { fromB64, utf8OrNull } from './bytes';
import { getMethod, runChain, newStep } from './methods';
import { pwKind } from './passwords';

export type Guess =
  | { kind: 'step'; method: string; label: string; preview?: string }
  | { kind: 'hash'; label: string }
  | { kind: 'info'; label: string; preview?: string }
  | { kind: 'password'; label: string }
  | { kind: 'encrypted'; label: string };

const HASH_LENGTHS: Record<number, string> = {
  8: 'CRC32 / Adler-32',
  16: 'CRC64 / xxHash64',
  32: 'MD5',
  40: 'SHA-1 / RIPEMD-160',
  56: 'SHA-224 / SHA3-224',
  64: 'SHA-256 / SHA3-256 / BLAKE3',
  96: 'SHA-384',
  128: 'SHA-512 / SHA3-512 / BLAKE2b',
};

const readable = (b: Uint8Array) => {
  const s = utf8OrNull(b);
  if (s === null || !s.length) return null;
  // Mostly letters, digits, spaces and punctuation, few control characters.
  const bad = [...s].filter((c) => /[\0-\x08\x0e-\x1f\x7f]/.test(c)).length;
  return bad / s.length < 0.02 ? s : null;
};

function tryStep(method: string, input: string): string | null {
  const r = runChain(new TextEncoder().encode(input), [newStep(method)], true);
  if (r.error) return null;
  const s = readable(r.out);
  return s;
}

export function detect(raw: string): Guess[] {
  const s = raw.trim();
  if (s.length < 2) return [];
  const out: Guess[] = [];
  const step = (method: string, preview: string | null) => {
    const m = getMethod(method);
    if (m) out.push({ kind: 'step', method, label: m.name, preview: preview?.slice(0, 60) });
  };

  const pw = pwKind(s);
  if (pw) return [{ kind: 'password', label: t('{name} password hash', { name: pw === 'bcrypt' ? 'bcrypt' : pw.startsWith('argon2') ? 'Argon2' : pw.startsWith('pbkdf2') ? 'PBKDF2' : 'scrypt' }) }];
  if (/^U2FsdGVkX1/.test(s)) return [{ kind: 'encrypted', label: t('OpenSSL encrypted data') }];
  if (/^VU5LV/.test(s)) return [{ kind: 'encrypted', label: t('Encrypted here (unktilz)') }];
  if (/^eyJ[\w-]+\.eyJ[\w-]+\.[\w-]*$/.test(s)) {
    return [{ kind: 'info', label: t('JWT token: header and data are Base64, the end is its signature'), preview: s.split('.').slice(0, 2).map((part) => tryStep('base64', part) ?? '').join('  ') }];
  }

  const compact = s.replace(/\s+/g, '');
  if (/^[01\s]+$/.test(s) && compact.length >= 8) step('binary', tryStep('binary', s));
  if (/^[.\-\s/|•·–—_]+$/.test(s) && /[.\-]/.test(s)) step('morse', tryStep('morse', s));
  if (/^(0x)?[0-9a-f\s:]+$/i.test(s) && compact.replace(/:/g, '').length % 2 === 0) {
    const text = tryStep('hex', s);
    if (text) step('hex', text);
    const len = compact.replace(/^0x/i, '').length;
    if (!/[\s:]/.test(s) && HASH_LENGTHS[len]) out.push({ kind: 'hash', label: t('a hash ({names}): it can’t be decoded, only compared', { names: HASH_LENGTHS[len] }) });
    if (!text && !HASH_LENGTHS[len]) step('hex', null);
  }
  if (/^[0-9]{1,3}([\s,]+[0-9]{1,3})+$/.test(s) && !/^[01\s]+$/.test(s)) step('decimal', tryStep('decimal', s));
  if (/^([0-9]{1,2}(-[0-9]{1,2})*\s*)+$/.test(s) && /-/.test(s)) step('a1z26', tryStep('a1z26', s));
  if (/^[ABab\s/]+$/.test(s) && compact.replace(/\//g, '').length % 5 === 0) step('bacon', tryStep('bacon', s));
  if (/%[0-9a-f]{2}/i.test(s)) step('url', tryStep('url', s));
  if (/&(#x?[0-9a-f]+|[a-z]+);/i.test(s)) step('html', tryStep('html', s));
  if (/\\u[0-9a-f]{4}|\\u\{[0-9a-f]+\}|\\x[0-9a-f]{2}|U\+[0-9a-f]{4}/i.test(s)) step('unicode', tryStep('unicode', s));
  if (/xn--/i.test(s)) step('punycode', tryStep('punycode', s));
  if (/^<~[\s\S]*~>$/.test(s)) step('base85', tryStep('base85', s));
  if (/=[0-9A-F]{2}/.test(s) && /^[\x20-\x7e\r\n\t]+$/.test(s) && !/%[0-9a-f]{2}/i.test(s)) step('qp', tryStep('qp', s));
  if (/^[A-Z2-7]+=*$/.test(compact) && compact.length % 8 === 0) step('base32', tryStep('base32', s));
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact) && compact.length >= 4 && !/^[0-9]+$/.test(compact)) {
    let text: string | null = null;
    try {
      text = readable(fromB64(compact));
    } catch {
      /* not Base64 */
    }
    // Plain words also match the Base64 letters: only offer it when it decodes to something.
    if (text || (compact.length % 4 === 0 && !out.length)) step('base64', text);
  }
  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(compact) && compact.length >= 6) {
    const text = tryStep('base58', s);
    if (text) step('base58', text);
  }

  // Only letters and spaces, nothing else fits: maybe a letter cipher.
  if (!out.length && /^[\p{L}\s.,!?'-]+$/u.test(s) && /[a-z]{3}/i.test(s)) step('caesar', null);

  // Readable results first, then the rest; each method once.
  const seen = new Set<string>();
  return out
    .filter((g) => {
      const key = g.kind === 'step' ? g.method : g.label;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((x, y) => Number(!!(y.kind === 'step' && y.preview)) - Number(!!(x.kind === 'step' && x.preview)));
}
