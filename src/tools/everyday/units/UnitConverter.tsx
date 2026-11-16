import { useEffect, useMemo, useState } from 'react';
import { CopyButton, Panel } from '../../../components/ui';
import { RollingNumber } from '../../../components/bits/RollingNumber';
import { useAutosave } from '../../../lib/saved';
import { fmtDate, fmtNum, getLang, t } from '../../../lib/i18n-core';
import { DEFAULT_PAIR, KINDS, STALE_MS, UNITS, cachedRates, convert, currencyUnits, fetchRates, parseAmount, type Kind, type Rates, type Unit } from './units';

type State = { kind: Kind; amount: string; pairs: Partial<Record<Kind, [string, string]>> };
const DEFAULT: State = { kind: 'length', amount: '1', pairs: {} };

/** Enough digits to be exact, none that are noise; tiny and huge numbers as 1.2 × 10⁻⁹. */
function show(n: number, kind: Kind) {
  if (!Number.isFinite(n)) return '—';
  if (kind === 'currency') return fmtNum(n, { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(n) < 1 && n !== 0 ? 4 : 2 });
  const a = Math.abs(n);
  if (a !== 0 && (a >= 1e15 || a < 1e-6)) {
    const [m, e] = n.toExponential(5).split('e');
    return `${fmtNum(Number(m), { maximumFractionDigits: 5 })} × 10^${Number(e)}`;
  }
  return fmtNum(n, { maximumSignificantDigits: 10 });
}

export default function UnitConverter() {
  const [s, setS] = useState<State>(DEFAULT);
  useAutosave('unit-converter', s, (v) => setS({ ...DEFAULT, ...v }));

  // ---- money: the last rates kept in this browser, fetched again when they are old ----
  const [rates, setRates] = useState<Rates | null>(() => cachedRates());
  const [rateState, setRateState] = useState<'idle' | 'loading' | 'error'>('idle');
  const loadRates = async () => {
    setRateState('loading');
    try {
      setRates(await fetchRates());
      setRateState('idle');
    } catch {
      setRateState('error');
    }
  };
  useEffect(() => {
    if (s.kind === 'currency' && (!rates || Date.now() - rates.fetched > STALE_MS) && rateState === 'idle') void loadRates();
  }, [s.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const names = useMemo(() => {
    const dn = new Intl.DisplayNames([getLang()], { type: 'currency' });
    return (code: string) => dn.of(code) ?? code;
  }, []);

  const units: Unit[] = s.kind === 'currency' ? (rates ? currencyUnits(rates, names) : []) : UNITS[s.kind];
  const pair = s.pairs[s.kind] ?? DEFAULT_PAIR[s.kind];
  const from = units.find((x) => x.id === pair[0]) ?? units[0];
  const to = units.find((x) => x.id === pair[1]) ?? units[1] ?? units[0];

  const amount = parseAmount(s.amount);
  const valid = Number.isFinite(amount);
  const result = valid && from && to ? convert(amount, from, to) : NaN;
  const resultText = valid ? show(result, s.kind) : '—';
  const one = from && to ? convert(1, from, to) : NaN;

  const setPair = (a: string, b: string) => setS((old) => ({ ...old, pairs: { ...old.pairs, [old.kind]: [a, b] } }));
  // Only the units swap; the amount stays (taking the rounded result back would drift).
  const swap = () => setPair(to.id, from.id);

  const option = (x: Unit) => (
    <option key={x.id + x.name} value={x.id}>
      {x.symbol} · {x.name}
    </option>
  );

  return (
    <>
      <section className="panel" aria-label={t('Converter')}>
        <div className="en-items" role="group" aria-label={t('What to convert')}>
          {KINDS.map((k) => (
            <button key={k.id} type="button" className="en-item" aria-pressed={s.kind === k.id} onClick={() => setS((old) => ({ ...old, kind: k.id }))}>
              {k.label}
            </button>
          ))}
        </div>

        {s.kind === 'currency' && !rates && (
          <p className={rateState === 'error' ? 'error-text' : 'note'} role="status">
            {rateState === 'error' ? t('The exchange rates couldn’t be loaded. Are you online?') : t('Loading today’s exchange rates…')}
          </p>
        )}

        {from && to && (
          <>
            <div className="uc-row">
              <label className="field uc-side">
                <span className="field-label">{t('units|From')}</span>
                <input className={`input mono uc-amount${valid || !s.amount ? '' : ' bad'}`} value={s.amount} inputMode="decimal" spellCheck={false} autoComplete="off" onChange={(e) => setS((old) => ({ ...old, amount: e.target.value }))} aria-invalid={!valid && !!s.amount} />
                <select className="select" value={from.id} onChange={(e) => setPair(e.target.value, to.id)} aria-label={t('From unit')}>
                  {units.map(option)}
                </select>
              </label>
              <button type="button" className="btn uc-swap" onClick={swap} aria-label={t('Swap units')} title={t('Swap units')}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7" />
                </svg>
              </button>
              <div className="field uc-side">
                <span className="field-label">{t('units|To')}</span>
                <output className="uc-result mono" aria-live="polite">
                  {/^[\d\s.,  −-]+$/.test(resultText) ? <RollingNumber value={resultText} /> : resultText}
                </output>
                <select className="select" value={to.id} onChange={(e) => setPair(from.id, e.target.value)} aria-label={t('To unit')}>
                  {units.map(option)}
                </select>
              </div>
            </div>
            <div className="uc-sum">
              <span className="mono">
                {valid ? show(amount, s.kind) : '—'} {from.symbol} = <strong>{resultText}</strong> {to.symbol}
              </span>
              <CopyButton text={valid ? resultText.replace(/[\s  ]/g, '') : ''} />
              {!from.to && !to.to && Number.isFinite(one) && from.id !== to.id && amount !== 1 && (
                <span className="muted mono uc-one">
                  1 {from.symbol} = {show(one, s.kind)} {to.symbol}
                </span>
              )}
            </div>
            {s.kind === 'currency' && rates && (
              <p className="note">
                {t('Reference rates of the European Central Bank from {date}, published once a working day. Banks and exchange offices add their margin.', { date: fmtDate(new Date(rates.date)) })}{' '}
                <button type="button" className="link-btn" onClick={() => void loadRates()} disabled={rateState === 'loading'}>
                  {rateState === 'loading' ? t('loading…') : t('refresh')}
                </button>
                {rateState === 'error' && <span className="error-text"> {t('Offline: these are the last rates this browser saw.')}</span>}
              </p>
            )}
            {s.kind === 'temperature' && <p className="note">{t('Water freezes at 0 °C (32 °F) and boils at 100 °C (212 °F). 0 K is the coldest anything can be.')}</p>}
          </>
        )}
      </section>

      {from && units.length > 2 && (
        <Panel title={t('in every unit')}>
          <ul className="uc-all">
            {units.map((x) => {
              const v = valid ? show(convert(amount, from, x), s.kind) : '—';
              return (
                <li key={x.id + x.name} className={x.id === to.id ? 'on' : x.id === from.id ? 'from' : undefined}>
                  <button type="button" className="uc-pick" onClick={() => x.id !== from.id && setPair(from.id, x.id)} title={t('Convert to this')}>
                    <span className="mono uc-val">{v}</span>
                    <span className="mono uc-sym">{x.symbol}</span>
                    <span className="muted uc-name">{x.name}</span>
                  </button>
                  <CopyButton text={valid ? v.replace(/[\s  ]/g, '') : ''} />
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </>
  );
}
