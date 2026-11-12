import { useDeferredValue, useMemo, useState } from 'react';
import { Panel, Stat, Toggle } from '../../components/ui';
import { Workbench } from '../../components/Workbench';
import { Help } from '../../components/Help';
import { fmtNum, getLang, t } from '../../lib/i18n-core';

/** Words per minute: silent reading and reading aloud. */
const READ_WPM = 230;
const SPEAK_WPM = 130;
const TOP = 10;

const seg = (granularity: 'grapheme' | 'word' | 'sentence') =>
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(getLang() === 'cs' ? 'cs' : 'en', { granularity }) : null;

/** The words in the text, as written. Letters with accents, digits and inner ' or - count as part of a word. */
function wordsOf(text: string): string[] {
  const s = seg('word');
  if (s) return [...s.segment(text)].filter((x) => x.isWordLike).map((x) => x.segment);
  return text.match(/[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu) ?? [];
}

/** Characters as people see them, so an emoji or a letter with a separate accent mark is one. */
function charsOf(text: string): string[] {
  const s = seg('grapheme');
  return s ? [...s.segment(text)].map((x) => x.segment) : [...text];
}

function sentenceCount(text: string) {
  const s = seg('sentence');
  const parts = s ? [...s.segment(text)].map((x) => x.segment) : text.split(/(?<=[.!?…])\s+/);
  return parts.filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
}

/** "45 s", "3 min 20 s", "1 h 5 min". */
function duration(words: number, wpm: number) {
  const sec = Math.round((words / wpm) * 60);
  if (sec < 60) return t('{s} s', { s: sec });
  const m = Math.floor(sec / 60);
  if (m < 60) return sec % 60 ? t('{m} min {s} s', { m, s: sec % 60 }) : t('{m} min', { m });
  return t('{h} h {m} min', { h: Math.floor(m / 60), m: m % 60 });
}

function analyse(text: string, short: boolean) {
  const words = wordsOf(text);
  const chars = charsOf(text);
  const counts = new Map<string, number>();
  for (const w of words) {
    const k = w.toLocaleLowerCase();
    if (!short && [...k].length < 3) continue;
    if (!/\p{L}/u.test(k)) continue; // numbers like 42 or 3.14
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP);
  return {
    words: words.length,
    chars: chars.length,
    noSpaces: chars.filter((c) => !/^\s+$/u.test(c)).length,
    sentences: sentenceCount(text),
    paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim()).length,
    lines: text.trim() ? text.split('\n').length : 0,
    unique: new Set(words.map((w) => w.toLocaleLowerCase())).size,
    top,
  };
}

export default function WordCounter() {
  const [text, setText] = useState('');
  const [short, setShort] = useState(false);
  // Long texts: the box stays quick, the numbers catch up a moment later.
  const deferred = useDeferredValue(text);
  const r = useMemo(() => analyse(deferred, short), [deferred, short]);

  const boxHeight = 'max(320px, calc(100dvh - 300px))';

  const stats = (
    <Panel title={t('counts')}>
      <div className="stats" role="status" aria-live="polite" aria-atomic="false">
        <Stat label={t('words')} value={fmtNum(r.words)} />
        <Stat label={t('characters')} value={fmtNum(r.chars)} />
        <Stat label={t('without spaces')} value={fmtNum(r.noSpaces)} />
        <Stat label={t('sentences')} value={fmtNum(r.sentences)} />
        <Stat label={t('paragraphs')} value={fmtNum(r.paragraphs)} />
        <Stat label={t('lines')} value={fmtNum(r.lines)} />
        <Stat label={t('reading time')} value={r.words ? duration(r.words, READ_WPM) : '–'} />
        <Stat label={t('speaking time')} value={r.words ? duration(r.words, SPEAK_WPM) : '–'} />
      </div>
      <p className="note" style={{ marginTop: 10 }}>
        {t('Reading at {read} words a minute, speaking at {speak}. {n} different words.', { read: READ_WPM, speak: SPEAK_WPM, n: fmtNum(r.unique) })}
      </p>
    </Panel>
  );

  const top = (
    <Panel
      title={t('most used words')}
      actions={
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="opt-label" id="wc-short">
            {t('Short words')}
          </span>
          <Help label={t('short words')} text={t('Also count words of one or two letters, like “a”, “of” or “to”. They are usually the most common, so they are left out by default. Numbers are never listed.')} />
          <Toggle labelledBy="wc-short" checked={short} onChange={setShort} />
        </span>
      }
    >
      {r.top.length ? (
        <ol className="wc-top">
          {r.top.map(([w, n]) => (
            <li key={w}>
              <span className="wc-word">{w}</span>
              <span className="wc-bar" style={{ '--w': `${(n / r.top[0][1]) * 100}%` } as React.CSSProperties} aria-hidden="true" />
              <span className="wc-n mono">
                {fmtNum(n)} <span className="muted">· {fmtNum(Math.round((n / r.words) * 1000) / 10)} %</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="note">{t('Type or paste some text to see its most used words.')}</p>
      )}
    </Panel>
  );

  return (
    <Workbench preview={stats} output={top}>
      <section className="panel" aria-label={t('Text')}>
        <div className="field">
          <div className="inline" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <label htmlFor="wc-in">{t('Your text')}</label>
            {text && (
              <button type="button" className="btn btn-sm mono" onClick={() => setText('')}>
                {t('clear')}
              </button>
            )}
          </div>
          <textarea
            id="wc-in"
            className="textarea"
            style={{ height: boxHeight, resize: 'none' }}
            value={text}
            placeholder={t('Type or paste text here…')}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </div>
      </section>
    </Workbench>
  );
}
