/**
 * Adapted from React Bits (https://reactbits.dev) by David Haz, MIT + Commons Clause
 * (see THIRD_PARTY_NOTICES.md): the "Counter" component.
 *
 * Changed for this site: no animation library. Each digit is a column of every possible digit that
 * slides to the new one with a CSS transition; every character has a fixed slot (monospace /
 * tabular figures), so a changing number never moves anything next to it. Columns are matched from
 * the right, so the ones digit stays the ones digit when the number gets longer. The real value is
 * the aria-label; the columns are hidden from screen readers. Reduced motion: no slide.
 */
import { memo } from 'react';

const DEC = '0123456789';
/** Digits for hex (both cases look the same in the strip). */
export const HEX_DIGITS = '0123456789ABCDEF';

type Props = {
  /** The number as it should read, already formatted ("1,234.5", "0xFF"…). */
  value: string;
  /** Characters that roll; anything else (separators, signs, letters) stays put. */
  digits?: string;
  className?: string;
};

export const RollingNumber = memo(function RollingNumber({ value, digits = DEC, className = '' }: Props) {
  const chars = [...value];
  const set = digits.toUpperCase();
  return (
    <span className={`roll${className ? ` ${className}` : ''}`} role="text" aria-label={value}>
      {chars.map((c, i) => {
        // Keyed from the right: the last character keeps its column when the number grows.
        const key = chars.length - i;
        const d = set.indexOf(c.toUpperCase());
        if (d < 0)
          return (
            <span key={`c${key}`} className="roll-ch" aria-hidden="true">
              {c}
            </span>
          );
        return (
          <span key={`d${key}`} className="roll-col" aria-hidden="true">
            <span className="roll-strip" style={{ '--d': d } as React.CSSProperties}>
              {[...set].map((x) => (
                <span key={x}>{c === c.toLowerCase() ? x.toLowerCase() : x}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
});
