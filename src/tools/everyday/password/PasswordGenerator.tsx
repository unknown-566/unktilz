import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { CopyButton, Panel, Segmented, Stat, TabPanel, Tabs, Toggle } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { useDecrypt } from '../../../lib/motion';
import { useAutosave } from '../../../lib/saved';
import { fmtNum, plural, t } from '../../../lib/i18n-core';
import { SPEEDS, analyze, charBits, charPassword, crackSeconds, level, pin, pinBits, wordBits, wordPassword, type Piece, type SetName } from './gen';

type Mode = 'chars' | 'words' | 'pin';
type Settings = {
  mode: Mode;
  length: number;
  sets: SetName[];
  noLookAlike: boolean;
  words: number;
  separator: string;
  capitalize: boolean;
  number: boolean;
  pinLength: number;
};
const DEFAULTS: Settings = { mode: 'chars', length: 20, sets: ['lower', 'upper', 'digits', 'symbols'], noLookAlike: false, words: 5, separator: '-', capitalize: true, number: false, pinLength: 6 };

const SET_LABELS: Record<SetName, string> = {
  lower: t('small letters (a–z)'),
  upper: t('capital letters (A–Z)'),
  digits: t('digits (0–9)'),
  symbols: t('symbols (!@#…)'),
};

const SEPARATORS = ['-', ' ', '.', '_', ''] as const; // i18n-ignore

function make(s: Settings) {
  if (s.mode === 'words') return wordPassword({ count: s.words, separator: s.separator, capitalize: s.capitalize, number: s.number });
  if (s.mode === 'pin') return pin(s.pinLength);
  return charPassword({ length: s.length, sets: s.sets, noLookAlike: s.noLookAlike });
}

function bitsOf(s: Settings) {
  if (s.mode === 'words') return wordBits({ count: s.words, separator: s.separator, capitalize: s.capitalize, number: s.number });
  if (s.mode === 'pin') return pinBits(s.pinLength);
  return charBits({ length: s.length, sets: s.sets, noLookAlike: s.noLookAlike });
}

const LEVELS = () => [t('password|very weak'), t('password|weak'), t('password|okay'), t('password|strong'), t('password|very strong')];

/** How long finding it would take, in words people use. */
export function howLong(seconds: number) {
  const min = 60;
  const hour = 3600;
  const day = 86400;
  const year = 365.25 * day;
  if (seconds < 1) return t('at once');
  if (seconds < min) return plural(Math.round(seconds), ['{n} second', '{n} seconds'], ['{n} sekunda', '{n} sekundy', '{n} sekund']);
  if (seconds < hour) return plural(Math.round(seconds / min), ['{n} minute', '{n} minutes'], ['{n} minuta', '{n} minuty', '{n} minut']);
  if (seconds < day) return plural(Math.round(seconds / hour), ['{n} hour', '{n} hours'], ['{n} hodina', '{n} hodiny', '{n} hodin']);
  if (seconds < 31 * day) return plural(Math.round(seconds / day), ['{n} day', '{n} days'], ['{n} den', '{n} dny', '{n} dní']);
  if (seconds < year) return plural(Math.round(seconds / (30.44 * day)), ['{n} month', '{n} months'], ['{n} měsíc', '{n} měsíce', '{n} měsíců']);
  const y = seconds / year;
  if (y < 1000) return plural(Math.round(y), ['{n} year', '{n} years'], ['{n} rok', '{n} roky', '{n} let']);
  if (y < 1e6) return t('{n} thousand years', { n: fmtNum(Math.round(y / 1e3)) });
  if (y < 1e9) return plural(Math.round(y / 1e6), ['{n} million years', '{n} million years'], ['{n} milion let', '{n} miliony let', '{n} milionů let']);
  if (y < 1.38e10) return plural(Math.round(y / 1e9), ['{n} billion years', '{n} billion years'], ['{n} miliarda let', '{n} miliardy let', '{n} miliard let']);
  return t('longer than the universe has existed');
}

/** Five bars that fill up and change color with the strength. */
function Meter({ bits }: { bits: number }) {
  const lv = level(bits);
  return (
    <div className="pw-meter" data-level={lv}>
      <div className="pw-bars" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= lv ? 'on' : ''} style={{ transitionDelay: `${i * 40}ms` }} />
        ))}
      </div>
      <span className="pw-level" role="status">
        {LEVELS()[lv]}
      </span>
    </div>
  );
}

function Strength({ bits }: { bits: number }) {
  return (
    <>
      <Meter bits={bits} />
      <div className="stats">
        <Stat label={t('bits of randomness')} value={fmtNum(Math.round(bits))} />
        <Stat label={t('guessing on a website (10 a second)')} value={howLong(crackSeconds(bits, SPEEDS.online))} />
        <Stat label={t('stolen database, fast computer')} value={howLong(crackSeconds(bits, SPEEDS.offline))} />
      </div>
    </>
  );
}

/** The password with digits and symbols in their own colors, so it's easier to read out. */
function Colored({ text }: { text: string }) {
  return (
    <>
      {[...text].map((c, i) => (
        <span key={i} className={/\d/.test(c) ? 'pw-d' : /[a-z]/i.test(c) ? undefined : 'pw-s'}>
          {c === ' ' ? ' ' : c}
        </span>
      ))}
    </>
  );
}

function Range({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="opt-row">
      <span className="opt-label" id={id}>
        {label}
      </span>
      <div className="range">
        <input type="range" aria-labelledby={id} min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <output className="mono">{value}</output>
      </div>
    </div>
  );
}

function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={`opt-row${disabled ? ' pw-locked' : ''}`}>
      <span className="opt-label" id={id}>
        {label}
      </span>
      <Toggle labelledBy={id} checked={checked} onChange={(v) => !disabled && onChange(v)} />
    </div>
  );
}

function Maker() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const ready = useAutosave('password-generator', s, (v) => setS({ ...DEFAULTS, ...v }));
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((old) => ({ ...old, [k]: v }));

  const [password, setPassword] = useState('');
  const [earlier, setEarlier] = useState<string[]>([]);
  /** The scramble only plays for the button; dragging a slider just shows the new password. */
  const [animate, setAnimate] = useState(false);

  // A new one whenever the settings change.
  useEffect(() => {
    if (!ready) return;
    setAnimate(false);
    setPassword(make(s));
  }, [s, ready]);

  const again = useCallback(() => {
    if (password) setEarlier((e) => [password, ...e.filter((x) => x !== password)].slice(0, 6));
    setAnimate(true);
    setPassword(make(s));
  }, [s, password]);

  const shown = useDecrypt(password, animate);
  const bits = useMemo(() => bitsOf(s), [s]);

  const toggleSet = (name: SetName, on: boolean) => set('sets', on ? (['lower', 'upper', 'digits', 'symbols'] as SetName[]).filter((x) => x === name || s.sets.includes(x)) : s.sets.filter((x) => x !== name));

  return (
    <>
      <section className="panel pw-hero" aria-label={t('Password')}>
        <div className="pw-out mono" aria-live="polite" aria-label={password}>
          <span aria-hidden="true">
            <Colored text={shown} />
          </span>
        </div>
        <div className="inline">
          <button type="button" className="btn btn-primary pw-again" onClick={again}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
            </svg>
            {t('New password')}
          </button>
          <CopyButton text={password} small={false} />
        </div>
        <Strength bits={bits} />
      </section>

      <Panel title={t('Settings')}>
        <div className="opt-row">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="opt-label" id="pw-mode">
              {t('Kind')}
            </span>
            <Help
              label={t('Kind of password')}
              text={t('Characters: the strongest for its length, good in a password manager. Words: a few random words, easy to remember and type, and still strong. PIN: digits only, for phones and cards.')}
            />
          </span>
          <Segmented
            labelledBy="pw-mode"
            value={s.mode}
            onChange={(v) => set('mode', v)}
            options={[
              { value: 'chars', label: t('characters') },
              { value: 'words', label: t('words') },
              { value: 'pin', label: 'PIN' }, // i18n-ignore
            ]}
          />
        </div>

        {s.mode === 'chars' && (
          <>
            <Range label={t('Length')} value={s.length} min={6} max={64} onChange={(v) => set('length', v)} />
            {(Object.keys(SET_LABELS) as SetName[]).map((name) => (
              <Switch key={name} label={SET_LABELS[name]} checked={s.sets.includes(name)} disabled={s.sets.length === 1 && s.sets[0] === name} onChange={(v) => toggleSet(name, v)} />
            ))}
            <Switch label={t('Leave out look-alikes (I l 1 O 0 o)')} checked={s.noLookAlike} onChange={(v) => set('noLookAlike', v)} />
          </>
        )}

        {s.mode === 'words' && (
          <>
            <Range label={t('Words')} value={s.words} min={3} max={10} onChange={(v) => set('words', v)} />
            <div className="opt-row">
              <span className="opt-label" id="pw-sep">
                {t('Between the words')}
              </span>
              <Segmented
                labelledBy="pw-sep"
                value={s.separator}
                onChange={(v) => set('separator', v)}
                options={SEPARATORS.map((x) => ({ value: x, label: x === ' ' ? t('space') : x === '' ? t('nothing') : x }))}
              />
            </div>
            <Switch label={t('Capital first letters')} checked={s.capitalize} onChange={(v) => set('capitalize', v)} />
            <Switch label={t('Add a digit')} checked={s.number} onChange={(v) => set('number', v)} />
            <p className="note">{t('The words come from the EFF list of 7,776 words that are easy to tell apart. Each one adds about 13 bits, so five words are already very hard to guess.')}</p>
          </>
        )}

        {s.mode === 'pin' && (
          <>
            <Range label={t('Digits')} value={s.pinLength} min={4} max={12} onChange={(v) => set('pinLength', v)} />
            <p className="note">{t('A PIN is only safe where wrong tries are limited, like a phone or a bank card.')}</p>
          </>
        )}
      </Panel>

      {earlier.length > 0 && (
        <Panel title={t('earlier ones')}>
          <ul className="pw-earlier">
            {earlier.map((p) => (
              <li key={p}>
                <span className="mono">
                  <Colored text={p} />
                </span>
                <CopyButton text={p} />
              </li>
            ))}
          </ul>
          <p className="note">{t('Only here until you leave the page. Passwords are made on your computer and are never saved or sent.')}</p>
        </Panel>
      )}
    </>
  );
}

const PIECE_LABELS: Record<Piece['kind'], string> = {
  common: t('a very common password'),
  word: t('a word'),
  year: t('a year'),
  run: t('a row of letters or keys'),
  repeat: t('the same character again'),
  char: '',
};

function Checker() {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const { bits, pieces } = useMemo(() => analyze(pw.slice(0, 128)), [pw]);
  const found = pieces.filter((p) => p.kind !== 'char');

  const tips: string[] = [];
  if (pw) {
    if (found.some((p) => p.kind === 'common')) tips.push(t('It is (or has in it) one of the most used passwords: those are tried first.'));
    if (found.some((p) => p.kind === 'word')) tips.push(t('Words are guessed whole, even with 4 for A or 0 for O. Several random words are fine; one word with a few changes is not.'));
    if (found.some((p) => p.kind === 'year' || p.kind === 'run' || p.kind === 'repeat')) tips.push(t('Years, rows like abc or qwerty and repeated characters add almost nothing.'));
    if (pw.length < 12) tips.push(t('Make it longer: length helps more than anything else.'));
  }

  return (
    <>
      <Panel title={t('Check a password')}>
        <div className="field">
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <label htmlFor="pw-check" className="field-label">
              {t('Your password')}
            </label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="opt-label" id="pw-show" style={{ fontSize: 13 }}>
                {t('show')}
              </span>
              <Toggle labelledBy="pw-show" checked={show} onChange={setShow} />
            </span>
          </span>
          <input
            id="pw-check"
            className="input mono"
            type={show ? 'text' : 'password'}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder={t('type or paste it here')}
          />
        </div>
        {pw && show && found.length > 0 && (
          <p className="pw-pieces mono" aria-label={t('What a guesser sees')}>
            {pieces.map((p, i) =>
              p.kind === 'char' ? (
                <span key={i}>{p.text}</span>
              ) : (
                <mark key={i} className={`pw-piece ${p.kind}`} title={PIECE_LABELS[p.kind]}>
                  {p.text}
                </mark>
              ),
            )}
          </p>
        )}
        {pw && found.length > 0 && (
          <ul className="pw-found">
            {found.map((p, i) => (
              <li key={i}>
                <span className={`pw-dot ${p.kind}`} aria-hidden="true" />
                {PIECE_LABELS[p.kind]}
                {show && <span className="mono muted"> {p.text}</span>}
              </li>
            ))}
          </ul>
        )}
        <Strength bits={bits} />
        {tips.length > 0 && (
          <ul className="pw-tips">
            {tips.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        <p className="note">{t('The check runs on your computer: the password is not sent anywhere or saved. It guesses like a real attacker would (common passwords and words first), so it is stricter than most "strength" bars.')}</p>
      </Panel>
    </>
  );
}

export default function PasswordGenerator() {
  const [tab, setTab] = useState<'make' | 'check'>('make');
  return (
    <>
      <Tabs
        idPrefix="pw"
        label={t('Password')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'make', label: t('Make one') },
          { id: 'check', label: t('Check one') },
        ]}
      />
      <TabPanel idPrefix="pw" id={tab}>
        {tab === 'make' ? <Maker /> : <Checker />}
      </TabPanel>
    </>
  );
}
