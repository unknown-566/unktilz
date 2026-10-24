// Small byte helpers shared by the encodings, ciphers and encryption. No React, so the worker and
// the tests use them too.
import { t } from '../../../lib/i18n-core';

const enc = new TextEncoder();

export const utf8 = (s: string) => enc.encode(s);

/** The bytes as text, or null when they aren't valid UTF-8. */
export function utf8OrNull(b: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return null;
  }
}

/** The bytes as text, for steps that need text: fails with a clear message otherwise. */
export function needText(b: Uint8Array): string {
  const s = utf8OrNull(b);
  if (s === null) throw new Error(t('This step works on text, but its input is binary data. Put an encoding (Base64, hex…) before it.'));
  return s;
}

export function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

export function random(n: number) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function toHex(b: Uint8Array) {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

/** Hex to bytes; spaces, colons, commas and 0x prefixes are allowed. */
export function fromHex(s: string, what = t('hex')): Uint8Array {
  const clean = s.replace(/0x/gi, '').replace(/[\s:,;-]/g, '');
  if (!/^[0-9a-f]*$/i.test(clean)) throw new Error(t('That isn’t valid {what}: only 0–9 and a–f are allowed.', { what }));
  if (clean.length % 2) throw new Error(t('That isn’t valid {what}: it needs an even number of digits.', { what }));
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toB64(b: Uint8Array) {
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Base64 to bytes: takes the URL-safe alphabet, missing padding, line breaks and a data: URL prefix. */
export function fromB64(s: string): Uint8Array {
  let clean = s.replace(/^data:[^,]*,/, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*=*$/.test(clean) || clean.length % 4 === 1) throw new Error(t('That isn’t valid Base64.'));
  clean = clean.replace(/=+$/, '');
  clean += '='.repeat((4 - (clean.length % 4)) % 4);
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const u32be = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
export const readU32be = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
