import { useRef, useState } from 'react';
import { Segmented, Toggle, useCopy } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { HEX_DIGITS, RollingNumber } from '../../../components/bits/RollingNumber';
import { getLang, plural, t } from '../../../lib/i18n-core';
import { useFlash } from '../../../lib/motion';
import { useAutosave } from '../../../lib/saved';
import { apply, bitsOf, flip, formats, group, isShift, parseExpr, rewrite, SYMBOL, type Op, type Operand, type Width } from './bits';

type Settings = { expr: string; width: Width; signed: boolean };
const DEFAULTS: Settings = { expr: '0b1011 << 2', width: 8, signed: false };
const WIDTHS: Width[] = [8, 16, 32, 64];

/** Operator buttons under the box: what they insert and what they do. */
const OPS: { op: Op; sym: string; name: string; help: string }[] = [
  { op: 'and', sym: '&', name: 'AND', help: t('1 only where both have a 1. Used to keep some bits and clear the rest (a mask).') },
  { op: 'or', sym: '|', name: 'OR', help: t('1 where either has a 1. Used to turn bits on.') },
  { op: 'xor', sym: '^', name: 'XOR', help: t('1 where they differ. Used to flip bits; doing it twice gives the number back.') },
  { op: 'not', sym: '~', name: 'NOT', help: t('Flips every bit of one number.') },
  { op: 'shl', sym: '<<', name: t('shift left'), help: t('Moves every bit left; zeros come in on the right. Each step doubles the number, until bits fall off the left.') },
  { op: 'sar', sym: '>>', name: t('shift right'), help: t('Moves every bit right and copies the sign bit in on the left, so negative numbers stay negative. Each step halves the number, rounding down.') },
  { op: 'shr', sym: '>>>', name: t('zero-fill right'), help: t('Moves every bit right; zeros come in on the left. For positive numbers the same as >>.') },
  { op: 'rol', sym: 'rol', name: t('rotate left'), help: t('Like a left shift, but the bits that fall off the left come back in on the right. Nothing is lost.') },
  { op: 'ror', sym: 'ror', name: t('rotate right'), help: t('Like a right shift, but the bits that fall off the right come back in on the left. Nothing is lost.') },
];

// i18n-ignore
const EXAMPLES = ['0b1011 << 2', '0xFF & 0x3C', '0b1010 ^ 0b0110', '~0', '-16 >> 2', '0x80000001 rol 4'];

function restore(v: Partial<Settings> | null | undefined): Settings {
  const o = { ...DEFAULTS, ...(v ?? {}) };
  return {
    expr: typeof o.expr === 'string' ? o.expr : DEFAULTS.expr,
    width: WIDTHS.includes(o.width) ? o.width : DEFAULTS.width,
    signed: typeof o.signed === 'boolean' ? o.signed : DEFAULTS.signed,
  };
}

export default function Bitwise() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  useAutosave<Settings>('bitwise', s, (v) => setS(restore(v)));
  const set = (patch: Partial<Settings>) => setS((old) => ({ ...old, ...patch }));
  const box = useRef<HTMLInputElement>(null);
  const sep = getLang() === 'cs' ? ' ' : ',';

  const e = parseExpr(s.expr, s.width, s.signed);
  const op = e.ok ? e.op : null;
  const shift = op !== null && isShift(op);
  const a = e.ok && e.a.parsed.ok ? e.a.parsed.value : null;
  const bOk = e.ok && e.b?.parsed.ok ? e.b.parsed.value : null;
  const amount = shift && bOk !== null ? Math.min(s.width, Number(bOk)) : 0;
  const ready = a !== null && (op === null || op === 'not' || bOk !== null);
  const out = ready ? (op === null ? { value: a!, lost: 0 } : apply(op, a!, shift ? BigInt(amount) : (bOk ?? 0n), s.width)) : null;

  /** An operator button: swaps the operator in the box, or adds it after the first number. */
  const pickOp = (o: Op) => {
    const sym = OPS.find((x) => x.op === o)!.sym;
    const first = e.ok ? e.a.text : s.expr.trim() || '0';
    const second = e.ok && e.b ? e.b.text : isShift(o) ? '1' : '0xF';
    const next = o === 'not' ? `~${first}` : `${first} ${sym} ${second}`;
    set({ expr: next });
    // The cursor goes to the end, ready to change the second number.
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(next.length, next.length);
    });
  };

  /** Clicking a bit of a number: that number is rewritten in the box, in the base it was typed in. */
  const flipIn = (which: Operand, bit: number) => {
    if (!which.parsed.ok) return;
    const text = rewrite(which.text, flip(which.parsed.value, bit), s.width, s.signed);
    set({ expr: s.expr.slice(0, which.start) + text + s.expr.slice(which.end) });
  };

  const badNumber = e.ok && (!e.a.parsed.ok || (e.b && !e.b.parsed.ok));
  const errorText = !e.ok && e.error !== 'empty' ? ERRORS[e.error]() : badNumber ? ERRORS.number() : '';
  const errorAt = !e.ok ? e.at : -1;
  const wrapped = e.ok && ((e.a.parsed.ok && e.a.parsed.wrapped) || (!shift && e.b?.parsed.ok && e.b.parsed.wrapped));

  return (
    <div className="bw">
      <section className="panel bw-input" aria-label={t('Expression')}>
        <div className="bw-head">
          <label htmlFor="bw-expr" className="field-label">
            {t('Expression')}
          </label>
          <div className="bw-settings">
            <Segmented label={t('Width')} compact value={String(s.width)} onChange={(w) => set({ width: Number(w) as Width })} options={WIDTHS.map((w) => ({ value: String(w), label: t('{n} bit', { n: w }) }))} />
            <span className="bw-signed">
              <span className="opt-label" id="bw-s">
                {t('Signed')}
              </span>
              <Help label={t('Signed')} text={t('Reads the highest bit as the sign (two’s complement), like int in most languages: 8 bits then go from −128 to 127 instead of 0 to 255. The bits stay the same, only how they’re read changes.')} />
              <Toggle labelledBy="bw-s" checked={s.signed} onChange={(signed) => set({ signed })} />
            </span>
          </div>
        </div>
        <div className="bw-field">
          <input
            id="bw-expr"
            ref={box}
            className="input mono bw-box"
            value={s.expr}
            spellCheck={false}
            autoComplete="off"
            onChange={(ev) => set({ expr: ev.target.value })}
            placeholder="0xFF & 0x0F" // i18n-ignore
            aria-invalid={!!errorText}
            aria-describedby="bw-hint"
          />
          {errorAt >= 0 && errorText && (
            // A mark under the place of the mistake (the box is monospace, so it lines up).
            <span className="bw-caret mono" aria-hidden="true">
              {' '.repeat(errorAt)}^
            </span>
          )}
        </div>
        <p id="bw-hint" className={errorText ? 'error-text' : 'note'}>
          {errorText || t('Numbers in decimal, 0x hex, 0b binary or 0o octal, with one operator between them.')}
        </p>

        <div className="bw-ops" role="group" aria-label={t('Operators')}>
          {OPS.map((x) => (
            <button key={x.op} type="button" className="bw-op" aria-pressed={op === x.op} title={x.help} onClick={() => pickOp(x.op)}>
              <span className="bw-sym mono">{x.sym}</span>
              <span className="bw-name">{x.name}</span>
            </button>
          ))}
        </div>
        <div className="bw-examples">
          <span className="muted">{t('Try:')}</span>
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="bw-example mono" onClick={() => set({ expr: x })}>
              {x}
            </button>
          ))}
        </div>
      </section>

      <section className="panel bw-sum" aria-label={t('Calculation')}>
        {e.ok && a !== null ? (
          <>
            <div className="bw-grid">
              <span />
              <span className="bw-th">{s.signed ? t('decimal (signed)') : t('decimal')}</span>
              <Ruler width={s.width} />
              <span className="bw-th">hex</span>

              <Row sign={op === 'not' ? '~' : ''} value={a} width={s.width} signed={s.signed} sep={sep} onFlip={(i) => flipIn(e.a, i)} />
              {e.b && op !== null && op !== 'not' && shift && (
                <>
                  <span className="bw-sign mono">{SYMBOL[op]}</span>
                  <span className="bw-dec mono bw-plain">{amount}</span>
                  <span className="bw-shiftby muted">{plural(amount, ['by {n} bit', 'by {n} bits'], ['o {n} bit', 'o {n} bity', 'o {n} bitů'])}</span>
                  <span />
                </>
              )}
              {e.b && op !== null && op !== 'not' && !shift && bOk !== null && <Row sign={SYMBOL[op]} value={bOk} width={s.width} signed={s.signed} sep={sep} onFlip={(i) => flipIn(e.b!, i)} />}
              {op !== null && out && (
                <>
                  <span className="bw-line" aria-hidden="true" />
                  <ResultRow value={out.value} width={s.width} signed={s.signed} sep={sep} />
                </>
              )}
            </div>

            {out && <Extra value={out.value} width={s.width} signed={s.signed} sep={sep} />}
            {out && out.lost > 0 && (
              <p className="note">
                {plural(out.lost, ['{n} one-bit was pushed out and is lost.', '{n} one-bits were pushed out and are lost.'], ['{n} jednička byla vysunuta a je ztracená.', '{n} jedničky byly vysunuty a jsou ztracené.', '{n} jedniček bylo vysunuto a jsou ztracené.'])}
              </p>
            )}
            {wrapped && <p className="note">{t('A number doesn’t fit in {w} bits, so only its lowest {w} bits are used.', { w: s.width })}</p>}
            <p className="note">{t('Click a bit of a number to flip it (the box changes too). Click a value to copy it.')}</p>
          </>
        ) : (
          <p className="note">{t('Type an expression above, like 0xFF & 0x0F or 5 << 2.')}</p>
        )}
      </section>
    </div>
  );
}

const ERRORS = {
  number: () => t('A number is expected here. Use digits, or 0x… for hex, 0b… for binary, 0o… for octal.'),
  operator: () => t('An operator is expected here: & | ^ << >> >>> rol ror (or and, or, xor…).'),
  missing: () => t('A second number is missing after the operator.'),
  extra: () => t('There’s something extra at the end. One operator at a time.'),
};

/** Bit numbers over the binary column, at the start of every byte. */
function Ruler({ width }: { width: Width }) {
  return (
    <span className="bw-bits bw-ruler mono" aria-hidden="true">
      {Array.from({ length: width }, (_, i) => {
        const index = width - 1 - i;
        return (
          <span key={i} className={`bw-d${i % 4 === 0 && i ? ' nib' : ''}`}>
            {index % 8 === 7 || index === 0 ? <span className="bw-ix">{index}</span> : null}
          </span>
        );
      })}
    </span>
  );
}

function Bits({ value, width, onFlip }: { value: bigint; width: Width; onFlip?: (bit: number) => void }) {
  return (
    <span className="bw-bits mono" role={onFlip ? 'group' : undefined} aria-label={onFlip ? t('Bits') : undefined}>
      {bitsOf(value, width).map((bit, i) => {
        const index = width - 1 - i;
        // Keyed by the bit's value, so a change mounts a new face and plays the flip.
        const face = (
          <span key={bit} className={`bw-face${bit ? ' on' : ''}`}>
            {bit}
          </span>
        );
        const cls = `bw-d${i % 4 === 0 && i ? ' nib' : ''}`;
        return onFlip ? (
          <button key={i} type="button" className={`${cls} bw-flip`} aria-pressed={!!bit} aria-label={t('Bit {i}', { i: index })} title={t('Bit {i}', { i: index })} onClick={() => onFlip(index)}>
            {face}
          </button>
        ) : (
          <span key={i} className={cls}>
            {face}
          </span>
        );
      })}
    </span>
  );
}

/** A value that copies itself when clicked; "copied" floats over it, so nothing moves. */
function Copyable({ text, className = '', children }: { text: string; className?: string; children: React.ReactNode }) {
  const { copied, copy } = useCopy();
  return (
    <button type="button" className={`bw-copy ${className}`} title={t('Click to copy')} onClick={() => copy(text)}>
      {children}
      <span className={`bw-copied${copied ? ' on' : ''}`} aria-live="polite">
        {copied ? t('copied') : ''}
      </span>
    </button>
  );
}

function Row({ sign, value, width, signed, sep, onFlip }: { sign: string; value: bigint; width: Width; signed: boolean; sep: string; onFlip: (bit: number) => void }) {
  const f = formats(value, width);
  const dec = signed ? f.signed : f.unsigned;
  return (
    <>
      <span className="bw-sign mono">{sign}</span>
      <Copyable text={dec} className="bw-dec mono">
        {group(dec, sep)}
      </Copyable>
      <Bits value={value} width={width} onFlip={onFlip} />
      <Copyable text={f.hex} className="bw-hex mono">
        {f.hex}
      </Copyable>
    </>
  );
}

function ResultRow({ value, width, signed, sep }: { value: bigint; width: Width; signed: boolean; sep: string }) {
  const f = formats(value, width);
  const dec = signed ? f.signed : f.unsigned;
  const flash = useFlash(value);
  return (
    <>
      <span className="bw-sign mono bw-eq">=</span>
      <Copyable text={dec} className={`bw-dec mono bw-res ${flash}`}>
        <RollingNumber value={group(dec, sep)} />
      </Copyable>
      <span className="bw-res-bits">
        <Bits value={value} width={width} />
      </span>
      <Copyable text={f.hex} className={`bw-hex mono bw-res ${flash}`}>
        <RollingNumber value={f.hex} digits={HEX_DIGITS} />
      </Copyable>
    </>
  );
}

/** The result in the other forms. */
function Extra({ value, width, signed, sep }: { value: bigint; width: Width; signed: boolean; sep: string }) {
  const f = formats(value, width);
  const dec = signed ? f.signed : f.unsigned;
  const other = signed ? f.unsigned : f.signed;
  const items: { label: string; copy: string; shown: string }[] = [
    { label: t('base|binary'), copy: f.bin, shown: f.bin },
    { label: t('base|octal'), copy: f.oct, shown: f.oct },
  ];
  if (other !== dec) items.push({ label: signed ? t('unsigned') : t('as signed'), copy: other, shown: group(other, sep) });
  return (
    <div className="bw-extra">
      {items.map((x) => (
        <span key={x.label} className="bw-extra-item">
          <span className="muted">{x.label}</span>
          <Copyable text={x.copy} className="mono">
            {x.shown}
          </Copyable>
        </span>
      ))}
    </div>
  );
}
