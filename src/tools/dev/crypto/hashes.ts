// Hashes and checksums (hash-wasm, every algorithm loads its small WebAssembly when first used).
// Runs in the crypto worker; the list itself (names, groups) is shared with the page.
import {
  createAdler32, createBLAKE2b, createBLAKE2s, createBLAKE3, createCRC32, createCRC64, createHMAC, createKeccak, createMD4, createMD5,
  createRIPEMD160, createSHA1, createSHA224, createSHA256, createSHA3, createSHA384, createSHA512, createSM3, createWhirlpool,
  createXXHash128, createXXHash3, createXXHash32, createXXHash64, type IHasher,
} from 'hash-wasm';
import { HASH_INFO, type HashId } from './hashList';

const MAKERS: Record<HashId, () => Promise<IHasher>> = {
  md5: createMD5,
  sha1: createSHA1,
  sha224: createSHA224,
  sha256: createSHA256,
  sha384: createSHA384,
  sha512: createSHA512,
  'sha3-224': () => createSHA3(224),
  'sha3-256': () => createSHA3(256),
  'sha3-384': () => createSHA3(384),
  'sha3-512': () => createSHA3(512),
  'keccak-256': () => createKeccak(256),
  'keccak-512': () => createKeccak(512),
  blake2b: () => createBLAKE2b(512),
  'blake2b-256': () => createBLAKE2b(256),
  blake2s: () => createBLAKE2s(256),
  blake3: () => createBLAKE3(256),
  ripemd160: createRIPEMD160,
  whirlpool: createWhirlpool,
  sm3: createSM3,
  md4: createMD4,
  crc32: () => createCRC32(),
  crc32c: () => createCRC32(0x82f63b78),
  crc64: () => createCRC64(),
  adler32: createAdler32,
  xxh32: () => createXXHash32(),
  xxh64: () => createXXHash64(),
  xxh3: () => createXXHash3(),
  xxh128: () => createXXHash128(),
};

export type HashJob = { data: Uint8Array | Blob; algos: HashId[]; hmacKey?: Uint8Array };

/**
 * All the picked hashes of the data in one read: a file goes through in pieces, so even a big one
 * doesn't have to fit in memory twice.
 */
export async function hashAll({ data, algos, hmacKey }: HashJob, report?: (p: number) => void): Promise<Partial<Record<HashId, Uint8Array>>> {
  const hashers = await Promise.all(
    algos.map(async (id) => {
      const h = hmacKey && HASH_INFO[id].hmac ? await createHMAC(MAKERS[id](), hmacKey) : await MAKERS[id]();
      h.init();
      return [id, h] as const;
    }),
  );
  const feed = (chunk: Uint8Array) => {
    for (const [, h] of hashers) h.update(chunk);
  };
  if (data instanceof Uint8Array) feed(data);
  else {
    const reader = data.stream().getReader();
    let done = 0;
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      feed(r.value);
      done += r.value.length;
      report?.(data.size ? done / data.size : 1);
    }
  }
  return Object.fromEntries(hashers.map(([id, h]) => [id, h.digest('binary')]));
}
