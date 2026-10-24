// The hashes the Hashes tab offers: names and groups only, so the page doesn't load the WebAssembly.
import { t } from '../../../lib/i18n-core';

export type HashId =
  | 'md5' | 'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512'
  | 'sha3-224' | 'sha3-256' | 'sha3-384' | 'sha3-512' | 'keccak-256' | 'keccak-512'
  | 'blake2b' | 'blake2b-256' | 'blake2s' | 'blake3' | 'ripemd160' | 'whirlpool' | 'sm3' | 'md4'
  | 'crc32' | 'crc32c' | 'crc64' | 'adler32' | 'xxh32' | 'xxh64' | 'xxh3' | 'xxh128';

export type HashGroup = 'common' | 'sha3' | 'more' | 'checksum';

type Info = { name: string; group: HashGroup; /** Broken: fine for checksums, not for security. */ weak?: boolean; hmac: boolean };

export const HASH_INFO: Record<HashId, Info> = {
  md5: { name: 'MD5', group: 'common', weak: true, hmac: true },
  sha1: { name: 'SHA-1', group: 'common', weak: true, hmac: true },
  sha224: { name: 'SHA-224', group: 'common', hmac: true },
  sha256: { name: 'SHA-256', group: 'common', hmac: true },
  sha384: { name: 'SHA-384', group: 'common', hmac: true },
  sha512: { name: 'SHA-512', group: 'common', hmac: true },
  'sha3-224': { name: 'SHA3-224', group: 'sha3', hmac: true },
  'sha3-256': { name: 'SHA3-256', group: 'sha3', hmac: true },
  'sha3-384': { name: 'SHA3-384', group: 'sha3', hmac: true },
  'sha3-512': { name: 'SHA3-512', group: 'sha3', hmac: true },
  'keccak-256': { name: 'Keccak-256', group: 'sha3', hmac: true },
  'keccak-512': { name: 'Keccak-512', group: 'sha3', hmac: true },
  blake2b: { name: 'BLAKE2b-512', group: 'more', hmac: true },
  'blake2b-256': { name: 'BLAKE2b-256', group: 'more', hmac: true },
  blake2s: { name: 'BLAKE2s-256', group: 'more', hmac: true },
  blake3: { name: 'BLAKE3', group: 'more', hmac: true },
  ripemd160: { name: 'RIPEMD-160', group: 'more', hmac: true },
  whirlpool: { name: 'Whirlpool', group: 'more', hmac: true },
  sm3: { name: 'SM3', group: 'more', hmac: true },
  md4: { name: 'MD4', group: 'more', weak: true, hmac: true },
  crc32: { name: 'CRC32', group: 'checksum', hmac: false },
  crc32c: { name: 'CRC32C', group: 'checksum', hmac: false },
  crc64: { name: 'CRC64', group: 'checksum', hmac: false },
  adler32: { name: 'Adler-32', group: 'checksum', hmac: false },
  xxh32: { name: 'xxHash32', group: 'checksum', hmac: false },
  xxh64: { name: 'xxHash64', group: 'checksum', hmac: false },
  xxh3: { name: 'XXH3-64', group: 'checksum', hmac: false },
  xxh128: { name: 'XXH3-128', group: 'checksum', hmac: false },
};

export const HASH_IDS = Object.keys(HASH_INFO) as HashId[];

export const HASH_GROUPS: { id: HashGroup; label: string }[] = [
  { id: 'common', label: t('MD5 and SHA-2') },
  { id: 'sha3', label: 'SHA-3' },
  { id: 'more', label: t('Other hashes') },
  { id: 'checksum', label: t('Checksums (not for security)') },
];

/** Picked when the tab opens for the first time. */
export const DEFAULT_HASHES: HashId[] = ['md5', 'sha1', 'sha256', 'sha512', 'sha3-256', 'blake3', 'crc32'];
