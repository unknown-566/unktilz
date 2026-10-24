// Real encryption (@noble/ciphers, keys from passwords through hash-wasm). Runs in the crypto worker.
//
// unktilz format, version 1 (all numbers big-endian):
//   "UNKT" · 1 · cipher (1 AES-256-GCM, 2 XChaCha20-Poly1305) · kdf (1 Argon2id, 2 PBKDF2-SHA256)
//   · Argon2id: passes u32, memory KiB u32, lanes u8 | PBKDF2: rounds u32
//   · salt (16) · nonce (12 or 24) · ciphertext with its 16-byte tag
// Everything before the ciphertext is checked too (it's the AAD), so a changed header fails like a
// wrong password. Only the password is needed to decrypt.
//
// OpenSSL: the same bytes as `openssl enc -aes-256-cbc -pbkdf2 -iter N -salt` ("Salted__", 8-byte
// salt, key and IV from PBKDF2-HMAC-SHA256).
import { cbc, ctr, ecb, gcm } from '@noble/ciphers/aes.js';
import { chacha20, chacha20poly1305, xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { salsa20, xsalsa20 } from '@noble/ciphers/salsa.js';
import { argon2id, createSHA256, pbkdf2 } from 'hash-wasm';
import { t } from '../../../lib/i18n-core';
import { concat, random, readU32be, u32be, utf8 } from './bytes';

const MAGIC = utf8('UNKT');
const SALTED = utf8('Salted__');

export type PwCipher = 'aes-256-gcm' | 'xchacha20-poly1305';
export type Kdf = { type: 'argon2id'; passes: number; memory: number; lanes: number } | { type: 'pbkdf2'; iterations: number };

export const DEFAULT_ARGON: Kdf = { type: 'argon2id', passes: 3, memory: 65536, lanes: 1 };
export const DEFAULT_PBKDF2: Kdf = { type: 'pbkdf2', iterations: 600_000 };

const wrong = () => new Error(t('Wrong password, or the data is damaged.'));

async function deriveKey(password: string, salt: Uint8Array, kdf: Kdf, length = 32): Promise<Uint8Array> {
  if (!password) throw new Error(t('Type a password.'));
  if (kdf.type === 'argon2id')
    return argon2id({ password, salt, iterations: kdf.passes, memorySize: kdf.memory, parallelism: kdf.lanes, hashLength: length, outputType: 'binary' });
  return pbkdf2({ password, salt, iterations: kdf.iterations, hashLength: length, hashFunction: createSHA256(), outputType: 'binary' });
}

export async function encryptWithPassword(data: Uint8Array, password: string, cipher: PwCipher, kdf: Kdf): Promise<Uint8Array> {
  const salt = random(16);
  const nonce = random(cipher === 'aes-256-gcm' ? 12 : 24);
  const params =
    kdf.type === 'argon2id' ? concat(u32be(kdf.passes), u32be(kdf.memory), new Uint8Array([kdf.lanes])) : u32be(kdf.iterations);
  const header = concat(MAGIC, new Uint8Array([1, cipher === 'aes-256-gcm' ? 1 : 2, kdf.type === 'argon2id' ? 1 : 2]), params, salt, nonce);
  const key = await deriveKey(password, salt, kdf);
  const box = cipher === 'aes-256-gcm' ? gcm(key, nonce, header) : xchacha20poly1305(key, nonce, header);
  return concat(header, box.encrypt(data));
}

export const isUnktilz = (b: Uint8Array) => b.length > 4 && MAGIC.every((x, i) => b[i] === x);
export const isOpenSsl = (b: Uint8Array) => b.length > 8 && SALTED.every((x, i) => b[i] === x);

/** What a file made by encryptWithPassword says about itself (for the page to show). */
export function describeUnktilz(b: Uint8Array): { cipher: PwCipher; kdf: Kdf } | null {
  if (!isUnktilz(b) || b[4] !== 1) return null;
  const cipher: PwCipher = b[5] === 1 ? 'aes-256-gcm' : 'xchacha20-poly1305';
  const kdf: Kdf = b[6] === 1 ? { type: 'argon2id', passes: readU32be(b, 7), memory: readU32be(b, 11), lanes: b[15] } : { type: 'pbkdf2', iterations: readU32be(b, 7) };
  return { cipher, kdf };
}

export async function decryptWithPassword(b: Uint8Array, password: string): Promise<Uint8Array> {
  if (isOpenSsl(b)) return openSslDecrypt(b, password, 10_000);
  const info = describeUnktilz(b);
  if (!info) throw new Error(t('This wasn’t encrypted here (it doesn’t start with the unktilz or OpenSSL header).'));
  // Stay sane with a damaged or hostile header: Argon2 memory up to 4 GiB, rounds up to 100 million.
  if (info.kdf.type === 'argon2id' && (info.kdf.memory > 4 * 1024 * 1024 || info.kdf.passes > 1000 || info.kdf.lanes < 1)) throw wrong();
  if (info.kdf.type === 'pbkdf2' && info.kdf.iterations > 100_000_000) throw wrong();
  const at = info.kdf.type === 'argon2id' ? 16 : 11;
  const salt = b.subarray(at, at + 16);
  const nlen = info.cipher === 'aes-256-gcm' ? 12 : 24;
  const nonce = b.subarray(at + 16, at + 16 + nlen);
  const header = b.subarray(0, at + 16 + nlen);
  const body = b.subarray(at + 16 + nlen);
  if (body.length < 16) throw wrong();
  const key = await deriveKey(password, salt, info.kdf);
  try {
    return (info.cipher === 'aes-256-gcm' ? gcm(key, nonce, header) : xchacha20poly1305(key, nonce, header)).decrypt(body);
  } catch {
    throw wrong();
  }
}

// ---- OpenSSL enc -aes-256-cbc -pbkdf2 ----
async function openSslKey(password: string, salt: Uint8Array, iterations: number) {
  const kiv = await deriveKey(password, salt, { type: 'pbkdf2', iterations }, 48);
  return { key: kiv.subarray(0, 32), iv: kiv.subarray(32, 48) };
}

export async function openSslEncrypt(data: Uint8Array, password: string, iterations: number) {
  const salt = random(8);
  const { key, iv } = await openSslKey(password, salt, iterations);
  return concat(SALTED, salt, cbc(key, iv).encrypt(data));
}

export async function openSslDecrypt(b: Uint8Array, password: string, iterations: number) {
  if (!isOpenSsl(b)) throw new Error(t('OpenSSL data starts with “Salted__” (U2FsdGVkX1 in Base64).'));
  const { key, iv } = await openSslKey(password, b.subarray(8, 16), iterations);
  try {
    return cbc(key, iv).decrypt(b.subarray(16));
  } catch {
    throw wrong();
  }
}

// ---- your own key ----
export type RawAlgo =
  | 'aes-gcm' | 'aes-cbc' | 'aes-ctr' | 'aes-ecb' | 'chacha20-poly1305' | 'xchacha20-poly1305' | 'chacha20' | 'salsa20' | 'xsalsa20' | 'rc4';

type RawInfo = { name: string; keys: number[]; nonce: number; old?: boolean };

export const RAW_INFO: Record<RawAlgo, RawInfo> = {
  'aes-gcm': { name: 'AES-GCM', keys: [16, 24, 32], nonce: 12 },
  'aes-cbc': { name: 'AES-CBC (PKCS#7)', keys: [16, 24, 32], nonce: 16 },
  'aes-ctr': { name: 'AES-CTR', keys: [16, 24, 32], nonce: 16 },
  'aes-ecb': { name: 'AES-ECB (PKCS#7)', keys: [16, 24, 32], nonce: 0, old: true },
  'chacha20-poly1305': { name: 'ChaCha20-Poly1305', keys: [32], nonce: 12 },
  'xchacha20-poly1305': { name: 'XChaCha20-Poly1305', keys: [32], nonce: 24 },
  chacha20: { name: 'ChaCha20', keys: [32], nonce: 12 },
  salsa20: { name: 'Salsa20', keys: [32], nonce: 8 },
  xsalsa20: { name: 'XSalsa20', keys: [32], nonce: 24 },
  rc4: { name: 'RC4', keys: [], nonce: 0, old: true },
};

function rc4(key: Uint8Array, data: Uint8Array) {
  const s = new Uint8Array(256).map((_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = new Uint8Array(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[n] = data[n] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

export function rawCipher(algo: RawAlgo, key: Uint8Array, nonce: Uint8Array, data: Uint8Array, decrypt: boolean): Uint8Array {
  const info = RAW_INFO[algo];
  if (algo === 'rc4') {
    if (key.length < 1 || key.length > 256) throw new Error(t('An RC4 key is 1 to 256 bytes.'));
  } else if (!info.keys.includes(key.length))
    throw new Error(t('{name} needs a key of {sizes} bytes, this one has {n}.', { name: info.name, sizes: info.keys.join(' / '), n: key.length }));
  if (info.nonce && nonce.length !== info.nonce)
    throw new Error(t('{name} needs an IV / nonce of {size} bytes, this one has {n}.', { name: info.name, size: info.nonce, n: nonce.length }));
  try {
    switch (algo) {
      case 'aes-gcm': return decrypt ? gcm(key, nonce).decrypt(data) : gcm(key, nonce).encrypt(data);
      case 'aes-cbc': return decrypt ? cbc(key, nonce).decrypt(data) : cbc(key, nonce).encrypt(data);
      case 'aes-ctr': return ctr(key, nonce).encrypt(data);
      case 'aes-ecb': return decrypt ? ecb(key).decrypt(data) : ecb(key).encrypt(data);
      case 'chacha20-poly1305': return decrypt ? chacha20poly1305(key, nonce).decrypt(data) : chacha20poly1305(key, nonce).encrypt(data);
      case 'xchacha20-poly1305': return decrypt ? xchacha20poly1305(key, nonce).decrypt(data) : xchacha20poly1305(key, nonce).encrypt(data);
      case 'chacha20': return chacha20(key, nonce, data);
      case 'salsa20': return salsa20(key, nonce, data);
      case 'xsalsa20': return xsalsa20(key, nonce, data);
      case 'rc4': return rc4(key, data);
    }
  } catch (e) {
    if (decrypt) throw new Error(t('Wrong key or IV, or the data is damaged.'));
    throw e;
  }
}
