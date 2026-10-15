import { gzipSync } from 'fflate';

// Minimal NBT writer (big-endian, Java Edition). Enough for structure files and litematics.

export type Tag =
  | { t: 'byte'; v: number }
  | { t: 'short'; v: number }
  | { t: 'int'; v: number }
  | { t: 'long'; v: bigint }
  | { t: 'string'; v: string }
  | { t: 'list'; of: TagType; v: Tag[] }
  | { t: 'compound'; v: Record<string, Tag> }
  | { t: 'intArray'; v: ArrayLike<number> }
  /** Long array given as 32-bit words, low word first per long (see packBits). */
  | { t: 'longArray'; words: Uint32Array };

type TagType = Tag['t'];

const ID: Record<TagType, number> = { byte: 1, short: 2, int: 3, long: 4, string: 8, list: 9, compound: 10, intArray: 11, longArray: 12 };

export const nbt = {
  byte: (v: number): Tag => ({ t: 'byte', v }),
  short: (v: number): Tag => ({ t: 'short', v }),
  int: (v: number): Tag => ({ t: 'int', v }),
  long: (v: number | bigint): Tag => ({ t: 'long', v: BigInt(v) }),
  str: (v: string): Tag => ({ t: 'string', v }),
  list: (of: TagType, v: Tag[]): Tag => ({ t: 'list', of, v }),
  compound: (v: Record<string, Tag>): Tag => ({ t: 'compound', v }),
  ints: (v: ArrayLike<number>): Tag => ({ t: 'intArray', v }),
  /** A list of ints, e.g. a structure block position [x, y, z]. */
  intList: (...v: number[]): Tag => ({ t: 'list', of: 'int', v: v.map((n) => ({ t: 'int', v: n }) as Tag) }),
  longWords: (words: Uint32Array): Tag => ({ t: 'longArray', words }),
};

class Writer {
  buf = new Uint8Array(1 << 16);
  view = new DataView(this.buf.buffer);
  pos = 0;
  private enc = new TextEncoder();

  private need(n: number) {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  u8(v: number) {
    this.need(1);
    this.view.setInt8(this.pos, v);
    this.pos += 1;
  }
  i16(v: number) {
    this.need(2);
    this.view.setInt16(this.pos, v);
    this.pos += 2;
  }
  i32(v: number) {
    this.need(4);
    this.view.setInt32(this.pos, v);
    this.pos += 4;
  }
  u32(v: number) {
    this.need(4);
    this.view.setUint32(this.pos, v >>> 0);
    this.pos += 4;
  }
  i64(v: bigint) {
    this.need(8);
    this.view.setBigInt64(this.pos, BigInt.asIntN(64, v));
    this.pos += 8;
  }
  str(s: string) {
    const b = this.enc.encode(s);
    this.need(2 + b.length);
    this.view.setUint16(this.pos, b.length);
    this.buf.set(b, this.pos + 2);
    this.pos += 2 + b.length;
  }
}

function payload(w: Writer, tag: Tag) {
  switch (tag.t) {
    case 'byte':
      return w.u8(tag.v);
    case 'short':
      return w.i16(tag.v);
    case 'int':
      return w.i32(tag.v);
    case 'long':
      return w.i64(tag.v);
    case 'string':
      return w.str(tag.v);
    case 'list':
      // An empty list is still typed; readers accept any type for an empty list.
      w.u8(ID[tag.of]);
      w.i32(tag.v.length);
      for (const item of tag.v) payload(w, item);
      return;
    case 'compound':
      for (const [name, child] of Object.entries(tag.v)) {
        w.u8(ID[child.t]);
        w.str(name);
        payload(w, child);
      }
      return w.u8(0);
    case 'intArray':
      w.i32(tag.v.length);
      for (let i = 0; i < tag.v.length; i++) w.i32(tag.v[i]);
      return;
    case 'longArray': {
      const n = tag.words.length >> 1;
      w.i32(n);
      // Each long is written high word first (big-endian).
      for (let i = 0; i < n; i++) {
        w.u32(tag.words[i * 2 + 1]);
        w.u32(tag.words[i * 2]);
      }
      return;
    }
  }
}

/** Serialises a root compound (unnamed, as the game writes files) and gzips it. */
export function writeNbtFile(root: Record<string, Tag>): Uint8Array {
  const w = new Writer();
  w.u8(ID.compound);
  w.str('');
  payload(w, { t: 'compound', v: root });
  return gzipSync(w.buf.subarray(0, w.pos));
}

/**
 * Packs values of `bits` bits each into a long array the way Litematica does: entries are laid end to
 * end and may straddle two longs. Returned as 32-bit words, low word first per long.
 */
export function packBits(values: ArrayLike<number>, bits: number): Uint32Array {
  const longs = Math.ceil((values.length * bits) / 64);
  const words = new Uint32Array(longs * 2);
  const mask = (1 << bits) - 1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] & mask;
    if (!v) continue;
    const p = i * bits;
    const word = p >>> 5;
    const bit = p & 31;
    words[word] |= v << bit;
    if (bit + bits > 32) words[word + 1] |= v >>> (32 - bit);
  }
  return words;
}
