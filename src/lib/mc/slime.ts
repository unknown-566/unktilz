// Java Edition slime chunk check: java.util.Random seeded from the world seed and chunk coordinates.
const MULT = 0x5deece66dn;
const ADD = 0xbn;
const MASK = (1n << 48n) - 1n;

export function parseSeed(input: string): bigint | null {
  const s = input.trim();
  if (!s) return null;
  if (/^-?\d+$/.test(s)) return BigInt.asIntN(64, BigInt(s));
  // Text seeds use String.hashCode(), like the game does.
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return BigInt(h);
}

export function isSlimeChunk(seed: bigint, x: number, z: number): boolean {
  // Mirrors the int overflow of the Java expression exactly.
  const a = BigInt(Math.imul(Math.imul(x, x), 0x4c1906));
  const b = BigInt(Math.imul(x, 0x5ac0db));
  const c = BigInt(Math.imul(z, z)) * 0x4307a7n;
  const d = BigInt(Math.imul(z, 0x5f24f));
  const s = BigInt.asIntN(64, seed + a + b + c + d) ^ 0x3ad8025fn;

  let r = (s ^ MULT) & MASK;
  for (;;) {
    r = (r * MULT + ADD) & MASK;
    const bits = Number(r >> 17n);
    const val = bits % 10;
    if (bits - val + 9 <= 0x7fffffff) return val === 0;
  }
}
