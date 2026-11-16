import { useEffect, useState, type ReactNode } from 'react';
import { NumberField, Panel, Stat, TabPanel, Tabs, Toggle, num } from '../../../components/ui';
import { RollingNumber } from '../../../components/bits/RollingNumber';
import { fmtNum, plural, t } from '../../../lib/i18n-core';
import { beep, onRing, pomo$, pomoLeft, setNotify, setSound, setTexts, sw$, swTime, timer$, timerLeft, useClock, type Phase } from './engine';

type Tab = 'timer' | 'stopwatch' | 'pomodoro';

const MIN = 60_000;
/** What this page puts in front of the tab's title ("04:59 · ", "⏰ · "). */
const PREFIX = /^((\d+:)?\d{2}:\d{2}|⏰) · /;

/** 1:05:09 / 05:09 */
function hms(ms: number, up = false) {
  const total = up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** "5" = 5 minutes, "5:30", "1:00:00", "90s", "1h 30m", "2 min". Milliseconds, or NaN. */
export function parseDuration(text: string) {
  const s = text.trim().toLowerCase().replace(',', '.');
  if (!s) return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s) * MIN;
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) {
    const parts = s.split(':').map(Number);
    if (parts.slice(1).some((x) => x > 59)) return NaN;
    return parts.reduce((a, b) => a * 60 + b, 0) * 1000;
  }
  const re = /(\d+(?:\.\d+)?)\s*(h|hod|hours?|m|min|minut[ay]?|minutes?|s|sec|seconds?|sekund[ay]?|s)\b/g; // i18n-ignore
  let ms = 0;
  let used = '';
  for (const m of s.matchAll(re)) {
    const unit = m[2][0];
    ms += Number(m[1]) * (unit === 'h' ? 3_600_000 : unit === 'm' ? MIN : 1000);
    used += m[0];
  }
  return used.replace(/\s/g, '').length === s.replace(/\s/g, '').length && ms > 0 ? ms : NaN;
}

/** Redraws a running clock about 10 times a second (the clock itself keeps the time). */
function useTicking(on: boolean, ms = 100) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [on, ms]);
}

/** The ring that empties as time runs out. */
function Ring({ part, phase, children, done }: { part: number; phase?: Phase | 'timer'; children: ReactNode; done?: boolean }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className={`ck-ring${done ? ' done' : ''}`} data-phase={phase}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="ck-track" />
        <circle cx="50" cy="50" r={r} className="ck-fill" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - Math.max(0, Math.min(1, part))) }} />
      </svg>
      <div className="ck-center">{children}</div>
    </div>
  );
}

function Big({ text }: { text: string }) {
  return (
    <span className="ck-big mono">
      <RollingNumber value={text} />
    </span>
  );
}

const PRESETS = [1, 3, 5, 10, 15, 25, 30, 45, 60];

function TimerTab() {
  const c = useClock();
  const running = c.timer.end !== null;
  useTicking(running, 200);
  const left = timerLeft(c);
  const [text, setText] = useState('');
  const typed = parseDuration(text);

  const set = (ms: number) => {
    timer$.set(ms);
    setText('');
  };

  return (
    <section className={`panel ck-stage${c.timer.done ? ' ringing' : ''}`} aria-label={t('Timer')}>
      <Ring part={c.timer.total ? left / c.timer.total : 0} phase="timer" done={c.timer.done}>
        <Big text={hms(left)} />
        <span className="muted ck-sub">{c.timer.done ? t('Time is up') : running ? t('running') : left < c.timer.total ? t('paused') : t('ready')}</span>
      </Ring>
      <div className="ck-buttons">
        {running ? (
          <button type="button" className="btn btn-primary ck-main" onClick={timer$.pause}>
            {t('Pause')}
          </button>
        ) : (
          <button type="button" className="btn btn-primary ck-main" onClick={timer$.start} disabled={c.timer.total <= 0}>
            {left < c.timer.total && left > 0 ? t('Go on') : t('clock|Start')}
          </button>
        )}
        <button type="button" className="btn" onClick={() => timer$.add(MIN)}>
          {'+1 min' /* i18n-ignore */}
        </button>
        <button type="button" className="btn" onClick={timer$.reset} disabled={!running && left === c.timer.total && !c.timer.done}>
          {t('clock|Reset')}
        </button>
      </div>
      <div className="en-items ck-presets" role="group" aria-label={t('Quick times')}>
        {PRESETS.map((m) => (
          <button key={m} type="button" className="en-item" aria-pressed={!running && c.timer.total === m * MIN} onClick={() => set(m * MIN)}>
            {`${m} min` /* i18n-ignore */}
          </button>
        ))}
      </div>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (Number.isFinite(typed)) set(typed);
        }}
      >
        <label className="field grow">
          <span className="field-label">{t('Own time')}</span>
          <input className="input mono" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('like 7, 1:30, 90s or 1h 15m')} spellCheck={false} autoComplete="off" />
        </label>
        <button type="submit" className="btn" disabled={!Number.isFinite(typed)}>
          {Number.isFinite(typed) ? t('Set {time}', { time: hms(typed) }) : t('Set')}
        </button>
      </form>
    </section>
  );
}

function StopwatchTab() {
  const c = useClock();
  const running = c.sw.start !== null;
  useTicking(running, 41);
  const now = swTime(c);
  const laps = c.sw.laps.map((at, i) => ({ at, len: at - (i ? c.sw.laps[i - 1] : 0) }));
  const best = laps.length > 1 ? Math.min(...laps.map((l) => l.len)) : -1;
  const worst = laps.length > 1 ? Math.max(...laps.map((l) => l.len)) : -1;
  const cs = (ms: number) => String(Math.floor((ms % 1000) / 10)).padStart(2, '0');

  return (
    <section className="panel ck-stage" aria-label={t('Stopwatch')}>
      <div className="ck-sw mono" role="timer">
        <Big text={hms(now, true)} />
        <span className="ck-cs">.{cs(now)}</span>
      </div>
      <div className="ck-buttons">
        <button type="button" className="btn btn-primary ck-main" onClick={running ? sw$.pause : sw$.start}>
          {running ? t('Pause') : now > 0 ? t('Go on') : t('clock|Start')}
        </button>
        <button type="button" className="btn" onClick={sw$.lap} disabled={!running}>
          {t('Lap')}
        </button>
        <button type="button" className="btn" onClick={sw$.reset} disabled={running || now === 0}>
          {t('clock|Reset')}
        </button>
      </div>
      {laps.length > 0 && (
        <ol className="ck-laps mono" reversed>
          {[...laps].reverse().map((l, i) => {
            const n = laps.length - i;
            return (
              <li key={n} className={l.len === best ? 'best' : l.len === worst ? 'worst' : undefined}>
                <span className="muted">{t('lap {n}', { n })}</span>
                <span>
                  {hms(l.len, true)}.{cs(l.len)}
                </span>
                <span className="muted">
                  {hms(l.at, true)}.{cs(l.at)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const PHASE_LABEL = (p: Phase) => (p === 'work' ? t('Focus') : p === 'short' ? t('Short break') : t('Long break'));

function PomodoroTab() {
  const c = useClock();
  const p = c.pomo;
  const running = p.end !== null;
  useTicking(running, 200);
  const left = pomoLeft(c);
  const total = p.settings[p.phase] * MIN;
  const inRound = p.works % p.settings.every;

  return (
    <>
      <section className={`panel ck-stage${p.done ? ' ringing' : ''}`} aria-label={t('Pomodoro')}>
        <Ring part={left / total} phase={p.phase} done={p.done}>
          <span className="ck-phase">{PHASE_LABEL(p.phase)}</span>
          <Big text={hms(left)} />
          <span className="ck-dots" aria-label={t('{n} of {m} in this round', { n: inRound, m: p.settings.every })}>
            {Array.from({ length: p.settings.every }, (_, i) => (
              <span key={i} className={i < inRound ? 'on' : i === inRound && p.phase === 'work' ? 'now' : undefined} />
            ))}
          </span>
        </Ring>
        <div className="ck-buttons">
          <button type="button" className="btn btn-primary ck-main" onClick={running ? pomo$.pause : pomo$.start}>
            {running ? t('Pause') : left < total ? t('Go on') : p.phase === 'work' ? t('Start focusing') : t('Start the break')}
          </button>
          <button type="button" className="btn" onClick={pomo$.skip}>
            {p.phase === 'work' ? t('Skip to the break') : t('Skip the break')}
          </button>
          <button type="button" className="btn" onClick={pomo$.reset}>
            {t('clock|Reset')}
          </button>
        </div>
        <div className="stats">
          <Stat label={t('focus blocks today')} value={fmtNum(p.today)} />
          <Stat label={t('focused today')} value={plural(p.today * p.settings.work, ['{n} min', '{n} min'], ['{n} min', '{n} min', '{n} min'])} />
        </div>
      </section>
      <Panel title={t('pomodoro settings')}>
        <div className="fields">
          <NumberField label={t('Focus (min)')} value={String(p.settings.work)} min={1} max={180} onChange={(v) => num(v) >= 1 && pomo$.settings({ work: Math.min(180, Math.round(num(v))) })} />
          <NumberField label={t('Short break (min)')} value={String(p.settings.short)} min={1} max={60} onChange={(v) => num(v) >= 1 && pomo$.settings({ short: Math.min(60, Math.round(num(v))) })} />
          <NumberField label={t('Long break (min)')} value={String(p.settings.long)} min={1} max={120} onChange={(v) => num(v) >= 1 && pomo$.settings({ long: Math.min(120, Math.round(num(v))) })} />
          <NumberField label={t('Long break after')} value={String(p.settings.every)} min={2} max={8} onChange={(v) => num(v) >= 2 && pomo$.settings({ every: Math.min(8, Math.round(num(v))) })} />
        </div>
        <div className="opt-row">
          <span className="opt-label" id="ck-auto">
            {t('Start the next part by itself')}
          </span>
          <Toggle labelledBy="ck-auto" checked={p.settings.auto} onChange={(v) => pomo$.settings({ auto: v })} />
        </div>
        <p className="note">{t('Pomodoro: focus for 25 minutes, then take a 5-minute break; after four focus blocks, take a longer one.')}</p>
      </Panel>
    </>
  );
}

export default function Clock() {
  const c = useClock();
  const [tab, setTab] = useState<Tab>(() => (c.pomo.end !== null ? 'pomodoro' : c.sw.start !== null || c.sw.acc > 0 ? 'stopwatch' : 'timer'));
  const [flash, setFlash] = useState(0);

  // The alarm texts in the page's language, and a flash of the page when it rings.
  useEffect(() => {
    setTexts({ timerDone: t('Time is up'), work: t('Time for a break'), rest: t('Back to work') });
    onRing(() => setFlash((n) => n + 1));
    return () => void onRing(null);
  }, []);

  // The time left in the tab's title while something runs.
  const running = c.timer.end !== null || c.pomo.end !== null;
  useTicking(running, 1000);
  useEffect(() => () => void (document.title = document.title.replace(PREFIX, '')), []);
  useEffect(() => {
    const base = document.title.replace(PREFIX, '');
    if (c.timer.end !== null) document.title = `${hms(timerLeft(c))} · ${base}`;
    else if (c.pomo.end !== null) document.title = `${hms(pomoLeft(c))} · ${base}`;
    else if (c.timer.done || c.pomo.done) document.title = `⏰ · ${base}`;
    else document.title = base;
  });

  // Space starts and pauses, R resets (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || el.closest('input, textarea, select, [contenteditable="true"]')) return;
      const s = c;
      if (e.key === ' ' && !el.closest('button')) {
        e.preventDefault();
        if (tab === 'timer') (s.timer.end !== null ? timer$.pause : timer$.start)();
        else if (tab === 'stopwatch') (s.sw.start !== null ? sw$.pause : sw$.start)();
        else (s.pomo.end !== null ? pomo$.pause : pomo$.start)();
      } else if (e.key === 'r' || e.key === 'R') {
        if (tab === 'timer') timer$.reset();
        else if (tab === 'stopwatch' && s.sw.start === null) sw$.reset();
        else if (tab === 'pomodoro') pomo$.reset();
      } else if ((e.key === 'l' || e.key === 'L') && tab === 'stopwatch' && s.sw.start !== null) sw$.lap();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, c]);

  const notifyOk = typeof Notification !== 'undefined';

  return (
    <div className={flash ? (flash % 2 ? 'ck-flash-a' : 'ck-flash-b') : undefined}>
      <Tabs
        idPrefix="ck"
        label={t('Clock')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'timer', label: t('Timer'), dot: c.timer.end !== null || c.timer.done },
          { id: 'stopwatch', label: t('Stopwatch'), dot: c.sw.start !== null },
          { id: 'pomodoro', label: t('Pomodoro'), dot: c.pomo.end !== null || c.pomo.done },
        ]}
      />
      <TabPanel idPrefix="ck" id={tab}>
        {tab === 'timer' ? <TimerTab /> : tab === 'stopwatch' ? <StopwatchTab /> : <PomodoroTab />}
        <Panel title={t('when time is up')}>
          <div className="opt-row">
            <span className="opt-label" id="ck-sound">
              {t('Play a sound')}
            </span>
            <span className="inline" style={{ alignItems: 'center' }}>
              <button type="button" className="btn btn-sm" onClick={() => beep(1)} disabled={!c.sound}>
                {t('try it')}
              </button>
              <Toggle labelledBy="ck-sound" checked={c.sound} onChange={setSound} />
            </span>
          </div>
          {notifyOk && (
            <div className="opt-row">
              <span className="opt-label" id="ck-notify">
                {t('Show a notification when this tab is hidden')}
              </span>
              <Toggle
                labelledBy="ck-notify"
                checked={c.notify && Notification.permission === 'granted'}
                onChange={(v) => {
                  if (!v) return setNotify(false);
                  void Notification.requestPermission().then((p) => setNotify(p === 'granted'));
                }}
              />
            </div>
          )}
          <p className="note">{t('The clocks keep running while you use other tools on this site, and the time left is in the tab’s title. Space starts and pauses, R resets, L adds a lap.')}</p>
        </Panel>
      </TabPanel>
    </div>
  );
}
