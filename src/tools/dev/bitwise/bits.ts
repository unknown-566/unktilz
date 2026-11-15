// i18n-ignore-file: error codes, not texts
// Bitwise maths on BigInt, so 64-bit values stay exact. Values are kept as unsigned bit patterns of
// the chosen width; "signed" only changes how the pattern is read (two's complement).

export type Width = 8 | 16 | 32 | 64;
export type Op = 'and' | 'or' | 'xor' | 'not' | 'nand' | 'nor' | 'shl' | 'sar' | 'shr' | 'rol' | 'ror';

export const SHIFTS: Op[] = ['shl', 'sar', 'shr', 'rol', 'ror'];
export const isShift = (op: Op) => SHIFTS.includes(op);

export const SYMBOL: Record<Op, string> = {
  and: '&',
  or: '|',
  xor: '^',
  not: '~',
  nand: '~&',
  nor: '~|',
  shl: '<<',
  sar: '>>',
  shr: '>>>',
  rol: 'rol',
  ror: 'ror',
};

export type Parsed = { ok: true; value: bigint; wrapped: boolean } | { ok: false; error: 'empty' | 'invalid' };

/**
 * Reads a number typed as decimal, 0x hex, 0b binary or 0o octal (a leading - and _ or spaces
 * between digits are fine). The result is the bit pattern in `width` bits; `wrapped` says it
 * didn't fit and was cut to that width.
 */
export function parse(text: string, width: Width, signed: boolean): Parsed {
  const s = text.trim().replace(/[\s_']/g, '').toLowerCase();
  if (!s) return { ok: false, error: 'empty' };
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  let v: bigint;
  try {
    if (/^0x[0-9a-f]+$/.test(body) || /^0b[01]+$/.test(body) || /^0o[0-7]+$/.test(body) || /^\d+$/.test(body)) v = BigInt(body);
    else return { ok: false, error: 'invalid' };
  } catch {
    return { ok: false, error: 'invalid' };
  }
  if (neg) v = -v;
  const w = BigInt(width);
  const min = signed ? -(1n << (w - 1n)) : neg ? -(1n << (w - 1n)) : 0n;
  const max = signed ? (1n << (w - 1n)) - 1n : (1n << w) - 1n;
  return { ok: true, value: BigInt.asUintN(width, v), wrapped: v < min || v > max };
}

export function apply(op: Op, a: bigint, b: bigint, width: Width): { value: bigint; lost: number } {
  const u = (x: bigint) => BigInt.asUintN(width, x);
  const w = BigInt(width);
  const n = BigInt(Math.max(0, Math.min(width, Number(b))));
  switch (op) {
    case 'and':
      return { value: a & b, lost: 0 };
    case 'or':
      return { value: a | b, lost: 0 };
    case 'xor':
      return { value: a ^ b, lost: 0 };
    case 'not':
      return { value: u(~a), lost: 0 };
    case 'nand':
      return { value: u(~(a & b)), lost: 0 };
    case 'nor':
      return { value: u(~(a | b)), lost: 0 };
    case 'shl':
      // Bits pushed off the left are gone: count the ones among them.
      return { value: u(a << n), lost: popcount(n === 0n ? 0n : a >> (w - n)) };
    case 'sar':
      return { value: u(BigInt.asIntN(width, a) >> n), lost: popcount(a & ((1n << n) - 1n)) };
    case 'shr':
      return { value: a >> n, lost: popcount(a & ((1n << n) - 1n)) };
    case 'rol': {
      const k = n % w;
      return { value: k === 0n ? a : u((a << k) | (a >> (w - k))), lost: 0 };
    }
    case 'ror': {
      const k = n % w;
      return { value: k === 0n ? a : u((a >> k) | (a << (w - k))), lost: 0 };
    }
  }
}

export function popcount(x: bigint) {
  let n = 0;
  for (let v = x; v > 0n; v >>= 1n) if (v & 1n) n++;
  return n;
}

/** Bits from the highest (left) to bit 0 (right). */
export const bitsOf = (v: bigint, width: Width) => Array.from({ length: width }, (_, i) => Number((v >> BigInt(width - 1 - i)) & 1n));

export const flip = (v: bigint, bit: number) => v ^ (1n << BigInt(bit));

/** The pattern written out: signed or unsigned decimal, and padded hex, binary and octal. */
export function formats(v: bigint, width: Width) {
  const hex = v.toString(16).toUpperCase().padStart(width / 4, '0');
  const bin = v.toString(2).padStart(width, '0');
  return {
    unsigned: v.toString(),
    signed: BigInt.asIntN(width, v).toString(),
    hex: `0x${hex}`,
    bin: `0b${bin}`,
    binGrouped: bin.replace(/(.{4})(?=.)/g, '$1 '),
    oct: `0o${v.toString(8)}`,
  };
}

/** Thousands separators for a decimal string (any length; BigInt can't use toLocaleString everywhere). */
export function group(dec: string, sep: string) {
  const neg = dec.startsWith('-');
  const d = neg ? dec.slice(1) : dec;
  return (neg ? '−' : '') + d.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** A number typed in the expression, with where it is (to write a flipped bit back in place). */
export type Operand = { text: string; start: number; end: number; parsed: Parsed };

export type Expr =
  | { ok: true; a: Operand; op: Op | null; b: Operand | null }
  | { ok: false; error: 'empty' | 'number' | 'operator' | 'missing' | 'extra'; at: number };

const WORDS: Record<string, Op> = { and: 'and', or: 'or', xor: 'xor', nand: 'nand', nor: 'nor', not: 'not', shl: 'shl', sar: 'sar', shr: 'shr', rol: 'rol', ror: 'ror' };
// Longest first, so ">>>" isn't read as ">>" and ">".
const SYMBOLS: [string, Op][] = [
  ['>>>', 'shr'],
  ['<<', 'shl'],
  ['>>', 'sar'],
  ['~&', 'nand'],
  ['~|', 'nor'],
  ['&', 'and'],
  ['|', 'or'],
  ['^', 'xor'],
];
const NUM = /^-?(0x[0-9a-f_']+|0b[01_']+|0o[0-7_']+|\d[\d_']*)/i;

/**
 * Reads one expression: a number ("42"), NOT of a number ("~42", "not 42") or two numbers with an
 * operator between them ("0xFF & 0x0F", "1 << 3", "5 rol 2"). On a mistake, `at` is where it is.
 */
export function parseExpr(text: string, width: Width, signed: boolean): Expr {
  let i = 0;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const num = (): Operand | null => {
    ws();
    const m = NUM.exec(text.slice(i));
    if (!m) return null;
    const start = i;
    i += m[0].length;
    return { text: m[0], start, end: i, parsed: parse(m[0], width, signed) };
  };
  const op = (): Op | null => {
    ws();
    const rest = text.slice(i);
    for (const [sym, o] of SYMBOLS)
      if (rest.startsWith(sym)) {
        i += sym.length;
        return o;
      }
    const w = /^[a-z]+/i.exec(rest);
    if (w && WORDS[w[0].toLowerCase()]) {
      i += w[0].length;
      return WORDS[w[0].toLowerCase()];
    }
    return null;
  };

  ws();
  if (i >= text.length) return { ok: false, error: 'empty', at: 0 };
  // Leading NOT: "~42" or "not 42".
  let not = false;
  if (text[i] === '~') {
    i++;
    not = true;
  } else if (/^not\b/i.test(text.slice(i))) {
    i += 3;
    not = true;
  }
  const a = num();
  if (!a) return { ok: false, error: 'number', at: i };
  if (not) {
    ws();
    return i < text.length ? { ok: false, error: 'extra', at: i } : { ok: true, a, op: 'not', b: null };
  }
  ws();
  if (i >= text.length) return { ok: true, a, op: null, b: null };
  const at = i;
  const o = op();
  if (!o || o === 'not') return { ok: false, error: 'operator', at };
  ws();
  if (i >= text.length) return { ok: false, error: 'missing', at: i };
  const b = num();
  if (!b) return { ok: false, error: 'number', at: i };
  ws();
  if (i < text.length) return { ok: false, error: 'extra', at: i };
  return { ok: true, a, op: o, b };
}

/** The operand written in the same base it was typed in. */
export function rewrite(was: string, v: bigint, width: Width, signed: boolean) {
  const f = formats(v, width);
  const w = was.toLowerCase().replace(/^-/, '');
  if (w.startsWith('0x')) return `0x${v.toString(16).toUpperCase()}`;
  if (w.startsWith('0b')) return `0b${v.toString(2)}`;
  if (w.startsWith('0o')) return f.oct;
  return signed ? f.signed : f.unsigned;
}
