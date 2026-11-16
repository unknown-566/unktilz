import { t } from '../../../lib/i18n-core';

export type Kind = 'length' | 'weight' | 'temperature' | 'area' | 'volume' | 'speed' | 'time' | 'currency';

/** A unit: how many of the kind's base unit one of it is (temperatures use to/from instead). */
export type Unit = { id: string; symbol: string; name: string; factor: number; to?: (v: number) => number; from?: (v: number) => number };

export const KINDS: { id: Kind; label: string }[] = [
  { id: 'length', label: t('length') },
  { id: 'weight', label: t('weight') },
  { id: 'temperature', label: t('temperature') },
  { id: 'area', label: t('area') },
  { id: 'volume', label: t('volume') },
  { id: 'speed', label: t('speed') },
  { id: 'time', label: t('time') },
  { id: 'currency', label: t('money') },
];

const u = (id: string, symbol: string, name: string, factor: number): Unit => ({ id, symbol, name, factor });

export const UNITS: Record<Exclude<Kind, 'currency'>, Unit[]> = {
  length: [
    u('mm', 'mm', t('millimetre'), 0.001),
    u('cm', 'cm', t('centimetre'), 0.01),
    u('m', 'm', t('metre'), 1),
    u('km', 'km', t('kilometre'), 1000),
    u('in', 'in', t('inch'), 0.0254),
    u('ft', 'ft', t('foot'), 0.3048),
    u('yd', 'yd', t('yard'), 0.9144),
    u('mi', 'mi', t('mile'), 1609.344),
    u('nmi', 'nmi', t('nautical mile'), 1852),
  ],
  weight: [
    u('mg', 'mg', t('milligram'), 1e-6),
    u('g', 'g', t('gram'), 0.001),
    u('dag', 'dag', t('decagram'), 0.01),
    u('kg', 'kg', t('kilogram'), 1),
    u('t', 't', t('tonne'), 1000),
    u('oz', 'oz', t('ounce'), 0.028349523125),
    u('lb', 'lb', t('pound'), 0.45359237),
    u('st', 'st', t('stone'), 6.35029318),
  ],
  temperature: [
    { id: 'c', symbol: '°C', name: t('Celsius'), factor: 1, to: (v) => v, from: (v) => v },
    { id: 'f', symbol: '°F', name: t('Fahrenheit'), factor: 1, to: (v) => ((v - 32) * 5) / 9, from: (v) => (v * 9) / 5 + 32 },
    { id: 'k', symbol: 'K', name: t('Kelvin'), factor: 1, to: (v) => v - 273.15, from: (v) => v + 273.15 },
  ],
  area: [
    u('mm2', 'mm²', t('square millimetre'), 1e-6),
    u('cm2', 'cm²', t('square centimetre'), 1e-4),
    u('m2', 'm²', t('square metre'), 1),
    u('a', 'a', t('are'), 100),
    u('ha', 'ha', t('hectare'), 1e4),
    u('km2', 'km²', t('square kilometre'), 1e6),
    u('in2', 'in²', t('square inch'), 0.00064516),
    u('ft2', 'ft²', t('square foot'), 0.09290304),
    u('ac', 'ac', t('acre'), 4046.8564224),
    u('mi2', 'mi²', t('square mile'), 2589988.110336),
  ],
  volume: [
    u('ml', 'ml', t('millilitre'), 0.001),
    u('dl', 'dl', t('decilitre'), 0.1),
    u('l', 'l', t('litre'), 1),
    u('m3', 'm³', t('cubic metre'), 1000),
    u('tsp', 'tsp', t('teaspoon (US)'), 0.00492892159375),
    u('tbsp', 'tbsp', t('tablespoon (US)'), 0.01478676478125),
    u('floz', 'fl oz', t('fluid ounce (US)'), 0.0295735295625),
    u('cup', 'cup', t('cup (US)'), 0.2365882365),
    u('pt', 'pt', t('pint (US)'), 0.473176473),
    u('ptuk', 'pt', t('pint (UK)'), 0.56826125),
    u('gal', 'gal', t('gallon (US)'), 3.785411784),
    u('galuk', 'gal', t('gallon (UK)'), 4.54609),
  ],
  speed: [
    u('ms', 'm/s', t('metres a second'), 1),
    u('kmh', 'km/h', t('kilometres an hour'), 1 / 3.6),
    u('mph', 'mph', t('miles an hour'), 0.44704),
    u('kn', 'kn', t('knot'), 1852 / 3600),
    u('fts', 'ft/s', t('feet a second'), 0.3048),
  ],
  time: [
    u('ms', 'ms', t('millisecond'), 0.001),
    u('s', 's', t('second'), 1),
    u('min', 'min', t('minute'), 60),
    u('h', 'h', t('hour'), 3600),
    u('d', 'd', t('day'), 86400),
    u('wk', 'wk', t('week'), 604800),
    u('mo', 'mo', t('month (average)'), 30.436875 * 86400),
    u('yr', 'yr', t('year'), 365.2425 * 86400),
  ],
};

/** What each kind starts with. */
export const DEFAULT_PAIR: Record<Kind, [string, string]> = {
  length: ['km', 'mi'],
  weight: ['kg', 'lb'],
  temperature: ['c', 'f'],
  area: ['m2', 'ft2'],
  volume: ['l', 'gal'],
  speed: ['kmh', 'mph'],
  time: ['h', 'min'],
  currency: ['EUR', 'CZK'],
};

/** `value` in unit `a` → unit `b`. */
export function convert(value: number, a: Unit, b: Unit) {
  const base = a.to ? a.to(value) : value * a.factor;
  return b.from ? b.from(base) : base / b.factor;
}

/** A number typed the way people write it: "1 234,5" and "1,234.5" both work. */
export function parseAmount(s: string) {
  let x = s.replace(/[\s _']/g, '');
  if (!x) return NaN;
  // Both separators: the last one is the decimal point.
  if (x.includes(',') && x.includes('.')) x = x.lastIndexOf(',') > x.lastIndexOf('.') ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  else if (x.includes(',')) x = /^-?\d{1,3}(,\d{3})+$/.test(x) ? x.replace(/,/g, '') : x.replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(x) ? Number(x) : NaN;
}

// ---- money ----

export type Rates = { date: string; base: 'EUR'; rates: Record<string, number>; fetched: number };
const KEY = 'unktilz-rates';

export function cachedRates(): Rates | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Rates | null;
    return r?.rates ? r : null;
  } catch {
    return null;
  }
}

/** Euro foreign exchange reference rates of the European Central Bank (via frankfurter.dev, no key). */
export async function fetchRates(signal?: AbortSignal): Promise<Rates> {
  const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR', { signal }); // i18n-ignore
  if (!res.ok) throw new Error(`HTTP ${res.status}`); // i18n-ignore
  const d = (await res.json()) as { date: string; rates: Record<string, number> };
  const r: Rates = { date: d.date, base: 'EUR', rates: { EUR: 1, ...d.rates }, fetched: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* private mode: just not kept */
  }
  return r;
}

/** Rates are published once a working day (around 16:00 CET): a few hours old is still fresh. */
export const STALE_MS = 6 * 3600 * 1000;

export function currencyUnits(rates: Rates, names: (code: string) => string): Unit[] {
  return Object.keys(rates.rates)
    .sort((a, b) => (a === 'EUR' ? -1 : b === 'EUR' ? 1 : a.localeCompare(b)))
    .map((code) => ({ id: code, symbol: code, name: names(code), factor: 1 / rates.rates[code] }));
}
