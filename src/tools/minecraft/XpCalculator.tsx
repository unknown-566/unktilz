import { useState } from 'react';
import { NumberField, Panel, Stat, num } from '../../components/ui';

/** Total points needed to reach `level` from 0 (Java 1.8+). */
export function pointsForLevel(level: number) {
  const l = Math.max(0, level);
  if (l <= 16) return l * l + 6 * l;
  if (l <= 31) return 2.5 * l * l - 40.5 * l + 360;
  return 4.5 * l * l - 162.5 * l + 2220;
}

/** Points to go from `level` to `level + 1`. */
export function pointsToNext(level: number) {
  if (level <= 15) return 2 * level + 7;
  if (level <= 30) return 5 * level - 38;
  return 9 * level - 158;
}

export function levelForPoints(points: number) {
  let level = 0;
  while (pointsForLevel(level + 1) <= points) level++;
  const into = points - pointsForLevel(level);
  return { level, into, next: pointsToNext(level) };
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export default function XpCalculator() {
  const [from, setFrom] = useState('0');
  const [to, setTo] = useState('30');
  const [points, setPoints] = useState('1395');

  const a = Math.max(0, Math.min(21863, Math.floor(num(from))));
  const b = Math.max(0, Math.min(21863, Math.floor(num(to))));
  const cost = pointsForLevel(Math.max(a, b)) - pointsForLevel(Math.min(a, b));
  const p = Math.max(0, Math.min(2 ** 31 - 1, Math.floor(num(points))));
  const lv = levelForPoints(p);

  return (
    <>
      <Panel title="levels → points">
        <div className="fields">
          <NumberField label="From level" value={from} onChange={setFrom} min={0} />
          <NumberField label="To level" value={to} onChange={setTo} min={0} />
        </div>
        <div className="stats" aria-live="polite">
          <Stat label="points needed" value={fmt(cost)} />
          <Stat label={`total at level ${Math.max(a, b)}`} value={fmt(pointsForLevel(Math.max(a, b)))} />
          <Stat label="bottles o’ enchanting" value={`~${fmt(cost / 7)}`} />
        </div>
      </Panel>

      <Panel title="points → level">
        <div className="fields">
          <NumberField label="Experience points" value={points} onChange={setPoints} min={0} />
        </div>
        <div className="stats" aria-live="polite">
          <Stat label="level" value={lv.level} />
          <Stat label="into next level" value={`${fmt(lv.into)} / ${fmt(lv.next)}`} />
          <Stat label="bar" value={`${Math.floor((lv.into / lv.next) * 100)}%`} />
        </div>
        <p className="note">Bottles drop 3–11 points each (7 on average). Dying keeps 7 × your level in orbs, at most 100 points.</p>
      </Panel>
    </>
  );
}
