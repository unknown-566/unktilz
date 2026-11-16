import { useEffect, useMemo, useRef, useState } from 'react';
import { Help } from '../../../components/Help';
import { Panel, Segmented } from '../../../components/ui';
import { formatBytes } from '../../../queue/download';
import { fmtNum, getLang, plural, t } from '../../../lib/i18n-core';
import { LYRICS_LANGUAGES, LYRICS_MODELS, findWords, forWhisper, plain, stopLyrics, type LyricsQuality, type Word } from './lyrics';
import type { Stereo } from './separate';

type Props = {
  vocals: Stereo;
  words: Word[] | null;
  /** Indexes of the words that are switched off. */
  off: Set<number>;
  onWords: (words: Word[] | null) => void;
  onOff: (off: Set<number>) => void;
  onPlay: (seconds: number) => void;
  now: () => number;
  playing: boolean;
};

type Progress = { text: string; part: number | null; left?: string };

/** The song's words (found by the speech model in the vocals): click one to switch it off. */
export function LyricsPanel({ vocals, words, off, onWords, onOff, onPlay, now, playing }: Props) {
  const [quality, setQuality] = useState<LyricsQuality>('fast');
  const [language, setLanguage] = useState<string>('auto');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [everywhere, setEverywhere] = useState('');
  const busy = progress !== null;

  const names = useMemo(() => {
    const dn = new Intl.DisplayNames([getLang()], { type: 'language' });
    return LYRICS_LANGUAGES.map((code) => ({ code, name: code === 'auto' ? t('guess it') : (dn.of(code) ?? code) }));
  }, []);

  const find = async () => {
    setError('');
    setInfo('');
    setProgress({ text: t('Getting the vocals ready…'), part: null });
    try {
      const audio = await forWhisper(vocals);
      const r = await findWords(audio, quality, language, (e) => {
        if (e.type === 'download') setProgress({ text: t('Downloading the speech model…'), part: e.loaded / e.total });
        else if (e.type === 'status') setProgress({ text: e.text, part: null });
        else {
          const left = e.done > 0 ? ((e.total - e.done) * e.ms) / e.done / 1000 : null;
          setProgress({
            text: e.backend === 'webgpu' ? t('Listening to the words (graphics card)…') : t('Listening to the words (processor, this takes a while)…'),
            part: e.done / e.total,
            left: left === null || e.done === e.total ? undefined : left < 60 ? t('about {n} s left', { n: fmtNum(Math.max(1, Math.round(left))) }) : t('about {n} min left', { n: fmtNum(Math.ceil(left / 60)) }),
          });
        }
      });
      onOff(new Set());
      onWords(r.words);
      setInfo(
        r.words.length
          ? plural(r.words.length, ['{n} word found in {s} s.', '{n} words found in {s} s.'], ['Nalezeno {n} slovo za {s} s.', 'Nalezena {n} slova za {s} s.', 'Nalezeno {n} slov za {s} s.'], { s: fmtNum(Math.round(r.ms / 1000)) })
          : t('No words were found. Is there singing in this song? Try picking its language.'),
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  // The word being sung lights up while it plays.
  const [current, setCurrent] = useState(-1);
  useEffect(() => {
    if (!words?.length) return;
    const at = () => {
      const tm = now();
      let i = -1;
      for (let k = 0; k < words.length; k++) {
        if (words[k].start > tm) break;
        if (words[k].end >= tm) i = k;
      }
      setCurrent(i);
    };
    at();
    if (!playing) return;
    const id = window.setInterval(at, 80);
    return () => clearInterval(id);
  }, [words, playing, now]);

  const toggle = (i: number) => {
    const next = new Set(off);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    onOff(next);
  };

  /** Every place a word (or several, separated by spaces or commas) is sung. */
  const wanted = everywhere
    .split(/[\s,]+/)
    .map(plain)
    .filter(Boolean);
  const hits = words && wanted.length ? words.map((w, i) => (wanted.includes(plain(w.text)) ? i : -1)).filter((i) => i >= 0) : [];
  const allOff = hits.length > 0 && hits.every((i) => off.has(i));
  const setHits = (on: boolean) => {
    const next = new Set(off);
    for (const i of hits) {
      if (on) next.add(i);
      else next.delete(i);
    }
    onOff(next);
  };

  const list = useRef<HTMLParagraphElement>(null);

  return (
    <Panel
      title={t('words')}
      actions={
        words && off.size > 0 ? (
          <button type="button" className="btn btn-sm" onClick={() => onOff(new Set())}>
            {t('switch all words back on')}
          </button>
        ) : undefined
      }
    >
      <div className="vr-lyrics-setup">
        <label className="field">
          <span className="field-label" style={{ display: 'flex', alignItems: 'center' }}>
            {t('Language of the song')}
            <Help label={t('Language of the song')} text={t('Picking the language gives better words than letting the model guess, mainly for songs that aren’t in English.')} />
          </span>
          <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy}>
            {names.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label" style={{ display: 'flex', alignItems: 'center' }}>
            {t('Speech model')}
            <Help
              label={t('Speech model')}
              text={t('Quick is good for clear singing in English. Better understands more (other languages, fast or unclear singing) but downloads much more and takes longer. The sizes are for a graphics card; a processor gets smaller files.')}
            />
          </span>
          <Segmented
            label={t('Speech model')}
            value={quality}
            onChange={setQuality}
            options={[
              { value: 'fast', label: t('quick ({size})', { size: formatBytes(LYRICS_MODELS.fast.size) }) },
              { value: 'better', label: t('better ({size})', { size: formatBytes(LYRICS_MODELS.better.size) }) },
            ]}
          />
        </div>
      </div>
      <div className="inline">
        <button type="button" className="btn btn-primary" onClick={() => void find()} disabled={busy}>
          {busy ? t('Working…') : words ? t('Find the words again') : t('Find the words')}
        </button>
        {busy && (
          <button type="button" className="btn" onClick={stopLyrics}>
            {t('stop')}
          </button>
        )}
      </div>
      {progress && (
        <div className="vr-progress" role="status">
          <div className="vr-bar" aria-hidden="true">
            <span className={progress.part === null ? 'wait' : ''} style={progress.part === null ? undefined : { transform: `scaleX(${progress.part})` }} />
          </div>
          <p className="note">
            {progress.text}
            {progress.part !== null && <span className="mono"> {fmtNum(Math.round(progress.part * 100))} %</span>}
            {progress.left && <span className="muted"> · {progress.left}</span>}
          </p>
        </div>
      )}
      {!busy && !words && <p className="note">{t('A second AI model listens to the vocals and writes down each word with its time. It runs on your computer and is downloaded once. Sung words are harder than spoken ones, so expect some mistakes.')}</p>}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {info && !busy && <p className="note">{info}</p>}

      {words && words.length > 0 && (
        <>
          <div className="vr-everywhere">
            <label className="field grow">
              <span className="field-label">{t('Switch a word off everywhere')}</span>
              <input className="input" value={everywhere} spellCheck={false} autoComplete="off" placeholder={t('type a word (or several)')} onChange={(e) => setEverywhere(e.target.value)} />
            </label>
            <button type="button" className="btn" disabled={hits.length === 0} onClick={() => setHits(!allOff)}>
              {hits.length === 0
                ? wanted.length
                  ? t('not in the song')
                  : t('switch off')
                : allOff
                  ? plural(hits.length, ['switch {n} place back on', 'switch {n} places back on'], ['zapnout zpět {n} místo', 'zapnout zpět {n} místa', 'zapnout zpět {n} míst'])
                  : plural(hits.length, ['switch off in {n} place', 'switch off in {n} places'], ['vypnout na {n} místě', 'vypnout na {n} místech', 'vypnout na {n} místech'])}
            </button>
          </div>
          <p className="vr-words" ref={list}>
            {words.map((w, i) => (
              <button
                key={i}
                type="button"
                className={`vr-word${off.has(i) ? ' off' : ''}${i === current ? ' now' : ''}${hits.includes(i) ? ' hit' : ''}`}
                aria-pressed={off.has(i)}
                title={t('Click: switch off or on · Alt + click: play from here')}
                onClick={(e) => (e.altKey ? onPlay(Math.max(0, w.start - 0.4)) : toggle(i))}
              >
                {w.text}
              </button>
            ))}
          </p>
          <p className="note">{t('Click a word to switch it off: only the vocals go silent there, the music plays on. Alt + click plays from that word. If a word is cut too early or too late, drag over that spot on the vocals wave above instead.')}</p>
        </>
      )}
    </Panel>
  );
}
