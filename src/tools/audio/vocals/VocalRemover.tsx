import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DropZone } from '../../../components/DropZone';
import { Help } from '../../../components/Help';
import { Panel, Segmented, Toggle } from '../../../components/ui';
import { usePendingFiles } from '../../../queue/dragFiles';
import { formatBytes } from '../../../queue/download';
import { useQueue } from '../../../queue/store';
import { ffmpegRun } from '../../../lib/ffmpeg';
import { fmtNum, t } from '../../../lib/i18n-core';
import { fmtTime } from '../cutter/cutArgs';
import { MODEL } from './model';
import { MUTE_FADE, RATE, mixDown, modelReady, readSong, releaseAi, splitQuick, splitWithAi, stopSplit, toWav, type Backend, type Mute, type Stems, type Stereo } from './separate';
import { StemWave } from './StemWave';
import { LyricsPanel } from './LyricsPanel';
import { releaseLyrics, stopLyrics, wordMute, type Word } from './lyrics';

export const VOCALS_ACCEPTS = ['.mp3', '.wav', '.ogg', '.oga', '.opus', '.flac', '.m4a', '.aac', '.weba', '.mp4', '.m4v', '.mov', '.webm', '.mkv'];

type Method = 'ai' | 'quick';
type Progress = { text: string; part: number | null; left?: string };
/** What the two switches are set to; the quick buttons are these three. */
type Preset = 'music' | 'vocals' | 'both';

const buffer = (ctx: AudioContext, s: Stereo) => {
  const b = ctx.createBuffer(2, s.left.length, RATE);
  b.copyToChannel(s.left as Float32Array<ArrayBuffer>, 0);
  b.copyToChannel(s.right as Float32Array<ArrayBuffer>, 1);
  return b;
};

/** Mutes in order, with the ones that touch joined into one. */
function tidy(mutes: Mute[]) {
  const out: Mute[] = [];
  for (const m of [...mutes].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && m.start <= last.end) last.end = Math.max(last.end, m.end);
    else out.push({ ...m });
  }
  return out;
}

export default function VocalRemover() {
  const [file, setFile] = useState<File | null>(null);
  const [song, setSong] = useState<Stereo | null>(null);
  const [loading, setLoading] = useState<boolean | number>(false);
  const [error, setError] = useState('');

  const [method, setMethod] = useState<Method>('ai');
  const [hasModel, setHasModel] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [splitError, setSplitError] = useState('');
  const [stems, setStems] = useState<Stems | null>(null);
  const [info, setInfo] = useState('');

  const [musicOn, setMusicOn] = useState(true);
  const [vocalsOn, setVocalsOn] = useState(false);
  const [musicVol, setMusicVol] = useState(100);
  const [vocalsVol, setVocalsVol] = useState(100);
  const [mutes, setMutes] = useState<Mute[]>([]);
  /** The song's words (once the speech model found them) and which of them are switched off. */
  const [words, setWords] = useState<Word[] | null>(null);
  const [offWords, setOffWords] = useState<Set<number>>(new Set());
  /** Everything that silences the vocals: the dragged stretches and the switched-off words. */
  const allMutes = useMemo(() => tidy([...mutes, ...(words ? [...offWords].filter((i) => words[i]).map((i) => wordMute(words[i])) : [])]), [mutes, words, offWords]);

  const [format, setFormat] = useState<'mp3' | 'wav'>('mp3');
  /** The file name that was just sent to the queue (for the note under the button). */
  const [sent, setSent] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => void modelReady().then(setHasModel), []);

  const duration = song ? song.left.length / RATE : 0;
  const musicGain = musicOn ? musicVol / 100 : 0;
  const vocalsGain = vocalsOn ? vocalsVol / 100 : 0;

  // ---------- playing: both stems at once, each through its own volume ----------
  const audio = useRef<{
    ctx: AudioContext;
    music: AudioBuffer;
    vocals: AudioBuffer;
    musicGain: GainNode;
    vocalsGain: GainNode;
    muteGain: GainNode;
    sources: AudioBufferSourceNode[];
  } | null>(null);
  /** Where playback started (in the song) and when (on the audio clock). */
  const clock = useRef({ offset: 0, startedAt: 0 });
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const mutesRef = useRef<Mute[]>([]);
  mutesRef.current = allMutes;

  const now = useCallback(() => {
    const a = audio.current;
    return a && playingRef.current ? clock.current.offset + a.ctx.currentTime - clock.current.startedAt : clock.current.offset;
  }, []);

  /** The singing goes silent inside every mute from here on (called when playback starts or the mutes change). */
  const scheduleMutes = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    const g = a.muteGain.gain;
    const t0 = a.ctx.currentTime;
    const pos = now();
    g.cancelScheduledValues(t0);
    const inside = mutesRef.current.some((m) => pos >= m.start && pos < m.end);
    g.setValueAtTime(inside ? 0 : 1, t0);
    if (!playingRef.current) return;
    for (const m of mutesRef.current) {
      if (m.end <= pos) continue;
      const start = t0 + (m.start - pos);
      const end = t0 + (m.end - pos);
      if (m.start > pos) {
        g.setValueAtTime(1, Math.max(t0, start - MUTE_FADE));
        g.linearRampToValueAtTime(0, start);
      }
      g.setValueAtTime(0, end);
      g.linearRampToValueAtTime(1, end + MUTE_FADE);
    }
  }, [now]);

  const stopSources = () => {
    const a = audio.current;
    if (!a) return;
    for (const s of a.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* not started */
      }
      s.disconnect();
    }
    a.sources = [];
  };

  const pause = useCallback(() => {
    if (!playingRef.current) return;
    clock.current.offset = Math.min(duration, now());
    playingRef.current = false;
    stopSources();
    setPlaying(false);
  }, [duration, now]);

  const play = useCallback(
    (from: number) => {
      const a = audio.current;
      if (!a) return;
      stopSources();
      void a.ctx.resume();
      const start = from >= duration - 0.05 ? 0 : Math.max(0, from);
      clock.current = { offset: start, startedAt: a.ctx.currentTime };
      playingRef.current = true;
      a.sources = [a.music, a.vocals].map((buf, i) => {
        const s = a.ctx.createBufferSource();
        s.buffer = buf;
        s.connect(i === 0 ? a.musicGain : a.muteGain);
        s.start(0, start);
        return s;
      });
      a.sources[0].onended = () => {
        playingRef.current = false;
        clock.current.offset = 0;
        a.sources = [];
        setPlaying(false);
      };
      scheduleMutes();
      setPlaying(true);
    },
    [duration, scheduleMutes],
  );

  const seek = (seconds: number) => {
    if (playingRef.current) play(seconds);
    else {
      clock.current.offset = seconds;
      setTick((n) => n + 1);
    }
  };
  // A paused seek has nothing else to redraw the playheads.
  const [, setTick] = useState(0);

  // The stems become two sounds the browser can play.
  useEffect(() => {
    if (!stems) return;
    const ctx = new AudioContext({ sampleRate: RATE });
    const musicNode = ctx.createGain();
    const vocalsNode = ctx.createGain();
    const muteNode = ctx.createGain();
    musicNode.connect(ctx.destination);
    muteNode.connect(vocalsNode);
    vocalsNode.connect(ctx.destination);
    audio.current = { ctx, music: buffer(ctx, stems.music), vocals: buffer(ctx, stems.vocals), musicGain: musicNode, vocalsGain: vocalsNode, muteGain: muteNode, sources: [] };
    clock.current = { offset: 0, startedAt: 0 };
    return () => {
      playingRef.current = false;
      stopSources();
      setPlaying(false);
      audio.current = null;
      void ctx.close();
    };
  }, [stems]);

  // The switches and volumes work while it plays.
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    a.musicGain.gain.setTargetAtTime(musicGain, a.ctx.currentTime, 0.015);
    a.vocalsGain.gain.setTargetAtTime(vocalsGain, a.ctx.currentTime, 0.015);
  }, [musicGain, vocalsGain, stems]);
  useEffect(scheduleMutes, [allMutes, scheduleMutes]);

  // Space plays and pauses (unless typing or on a button).
  useEffect(() => {
    if (!stems) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, button, [contenteditable="true"], [role="switch"]')) return;
      e.preventDefault();
      if (playingRef.current) pause();
      else play(now());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stems, pause, play, now]);

  // ---------- opening ----------
  const open = async (files: File[]) => {
    const f = files.find((x) => VOCALS_ACCEPTS.some((a) => x.name.toLowerCase().endsWith(a))) ?? files[0];
    if (!f) return;
    abort.current?.abort();
    stopSplit();
    setError('');
    setSplitError('');
    setLoading(true);
    try {
      const ctl = new AbortController();
      abort.current = ctl;
      const s = await readSong(f, (p) => setLoading(p), ctl.signal);
      if (ctl.signal.aborted) return;
      setStems(null);
      setSent('');
      setMutes([]);
      setWords(null);
      setOffWords(new Set());
      stopLyrics();
      setInfo('');
      setProgress(null);
      setFile(f);
      setSong(s);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  usePendingFiles('vocal-remover', (f) => void open(f));
  useEffect(
    () => () => {
      abort.current?.abort();
      releaseAi();
      releaseLyrics();
    },
    [],
  );

  // ---------- splitting ----------
  const split = async () => {
    if (!song) return;
    setSplitError('');
    setSent('');
    setWords(null);
    setOffWords(new Set());
    stopLyrics();
    if (method === 'quick') {
      setStems(splitQuick(song));
      setInfo(t('Done without AI. The middle of the sound was taken out: listen whether it worked for this song.'));
      return;
    }
    setProgress({ text: t('Starting…'), part: null });
    try {
      const r = await splitWithAi(song, (e) => {
        if (e.type === 'download') setProgress({ text: t('Downloading the AI model…'), part: e.loaded / e.total });
        else if (e.type === 'status') setProgress({ text: e.text, part: null });
        else {
          // How long the rest takes, from how long the pieces so far took.
          const left = e.done > 0 ? ((e.total - e.done) * e.ms) / e.done / 1000 : null;
          setProgress({
            text: place(e.backend),
            part: e.done / e.total,
            left: left === null || e.done === e.total ? undefined : left < 60 ? t('about {n} s left', { n: fmtNum(Math.max(1, Math.round(left))) }) : t('about {n} min left', { n: fmtNum(Math.ceil(left / 60)) }),
          });
        }
      });
      setHasModel(true);
      setStems({ music: r.music, vocals: r.vocals });
      const s = fmtNum(Math.round(r.ms / 1000));
      setInfo(r.backend === 'webgpu' ? t('Done in {s} s on the graphics card.', { s }) : t('Done in {s} s on the processor.', { s }));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setSplitError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  // ---------- the switches ----------
  const preset: Preset | null = musicOn && !vocalsOn ? 'music' : !musicOn && vocalsOn ? 'vocals' : musicOn && vocalsOn ? 'both' : null;
  const usePreset = (p: Preset) => {
    setMusicOn(p !== 'vocals');
    setVocalsOn(p !== 'music');
  };
  const addMute = (start: number, end: number) => setMutes((old) => tidy([...old, { start, end }]));

  // ---------- saving what is heard ----------
  const base = (file?.name ?? 'song').replace(/\.[^./]+$/, '') || 'song';
  const saveName = `${base}-${preset === 'music' ? 'instrumental' : preset === 'vocals' ? 'vocals' : 'mix'}.${format}`; // i18n-ignore
  /** Sends what is heard now to the queue: it is mixed and made into the file there, and waits for download. */
  const save = () => {
    if (!stems) return;
    // The task keeps what was set when the button was pressed, whatever changes on the page later.
    const job = { stems, musicGain, vocalsGain, mutes: allMutes.map((m) => ({ ...m })), format, name: saveName };
    useQueue.getState().addTask({ slug: 'vocal-remover', name: 'Vocal remover', category: 'audio', file: job.name }, async (signal, onProgress) => {
      onProgress(0.05);
      // A moment for the queue to show the job before the heavy part.
      await new Promise((r) => setTimeout(r, 30));
      const wav = toWav(mixDown(job.stems, job.musicGain, job.vocalsGain, job.mutes));
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
      if (job.format === 'wav') return [{ name: job.name, blob: wav }];
      onProgress(0.2);
      const [mp3] = await ffmpegRun([{ name: 'in.wav', data: new Uint8Array(await wav.arrayBuffer()) }], ['-i', 'in.wav', '-c:a', 'libmp3lame', '-b:a', '256k', 'out.mp3'], ['out.mp3'], { signal, onProgress: (p) => onProgress(0.2 + p * 0.8) });
      return [{ name: job.name, blob: new Blob([mp3 as BlobPart], { type: 'audio/mpeg' }) }];
    });
    setSent(job.name);
  };
  // The note is about the last thing sent; it goes once something changes.
  useEffect(() => setSent(''), [musicGain, vocalsGain, allMutes, format]);

  if (!file || !song)
    return (
      <DropZone
        title={loading === false ? t('Drop a song or a video here') : typeof loading === 'number' ? t('Reading the sound… {p} %', { p: fmtNum(Math.round(loading * 100)) }) : t('loading…')}
        button={t('Choose a file')}
        accept={VOCALS_ACCEPTS}
        error={error}
        onFiles={(f) => void open(f)}
        claimPending={false}
      />
    );

  const busy = progress !== null;
  const silent = musicGain === 0 && vocalsGain === 0;

  return (
    <div className="vr">
      <Panel
        title={t('song')}
        actions={
          <button type="button" className="btn btn-sm" onClick={() => { pause(); stopSplit(); stopLyrics(); setFile(null); setSong(null); setStems(null); }} disabled={busy}>
            {t('another song')}
          </button>
        }
      >
        <p className="vr-file mono">
          {file.name} <span className="muted">· {fmtTime(duration, 0)} · {formatBytes(file.size)}</span>
        </p>
        <div className="opt-row">
          <span className="opt-label" style={{ display: 'flex', alignItems: 'center' }}>
            {t('How to split it')}
            <Help
              label={t('How to split it')}
              text={t('AI: a model listens to the song and separates the singing from the music. Best result; takes a while. Quick: takes out what sounds the same in both ears, which is usually the singer. Instant, but it also loses bass and drums, and does nothing on mono songs.')}
            />
          </span>
          <Segmented
            label={t('How to split it')}
            value={method}
            onChange={setMethod}
            options={[
              { value: 'ai', label: t('AI (best)') },
              { value: 'quick', label: t('quick, no AI') },
            ]}
          />
        </div>
        <div className="inline">
          <button type="button" className="btn btn-primary" onClick={() => void split()} disabled={busy}>
            {busy ? t('Working…') : stems ? t('Split again') : t('Split music and vocals')}
          </button>
          {busy && (
            <button type="button" className="btn" onClick={stopSplit}>
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
        {!busy && !stems && method === 'ai' && (
          <p className="note">
            {hasModel
              ? t('Everything happens on your computer: the song isn’t sent anywhere.')
              : t('Everything happens on your computer: the song isn’t sent anywhere. The first time, the AI model ({size}) is downloaded and kept in the browser.', { size: formatBytes(MODEL.size) })}
          </p>
        )}
        {splitError && (
          <p className="error-text" role="alert">
            {splitError}
          </p>
        )}
        {info && !busy && <p className="note">{info}</p>}
      </Panel>

      {stems && (
        <Panel
          title={t('listen')}
          actions={
            <Segmented
              label={t('What plays')}
              compact
              value={preset ?? ('' as Preset)}
              onChange={usePreset}
              options={[
                { value: 'music', label: t('music only') },
                { value: 'vocals', label: t('vocals only') },
                { value: 'both', label: t('both') },
              ]}
            />
          }
        >
          <div className="vr-transport">
            <button type="button" className="btn btn-primary vr-play" onClick={() => (playing ? pause() : play(now()))} aria-label={playing ? t('Pause') : t('Play')}>
              {playing ? '❚❚' : '▶'}
            </button>
            <Time now={now} playing={playing} duration={duration} />
            {silent && <span className="note">{t('Both are off: nothing plays.')}</span>}
          </div>

          <div className="vr-stem" data-stem="music">
            <div className="vr-stem-head">
              <Toggle label={t('Music')} checked={musicOn} onChange={setMusicOn} />
              <span className="vr-stem-name">{t('Music')}</span>
              <Volume label={t('Music volume')} value={musicVol} onChange={setMusicVol} disabled={!musicOn} />
            </div>
            <StemWave label={t('Music')} sound={stems.music} duration={duration} now={now} playing={playing} off={!musicOn} onSeek={seek} />
          </div>

          <div className="vr-stem" data-stem="vocals">
            <div className="vr-stem-head">
              <Toggle label={t('Vocals')} checked={vocalsOn} onChange={setVocalsOn} />
              <span className="vr-stem-name">{t('Vocals')}</span>
              <Volume label={t('Vocals volume')} value={vocalsVol} onChange={setVocalsVol} disabled={!vocalsOn} />
            </div>
            <StemWave label={t('Vocals')} sound={stems.vocals} duration={duration} now={now} playing={playing} off={!vocalsOn} onSeek={seek} mutes={allMutes} onMute={addMute} />
          </div>

          <p className="note">{t('Click a wave to jump there. Drag across the vocals to switch off just that part (a word, a line): the music under it keeps playing. Space plays and pauses.')}</p>

          {mutes.length > 0 && (
            <div className="vr-mutes">
              <span className="field-label">{t('Switched-off parts of the vocals')}</span>
              <ul>
                {mutes.map((m, i) => (
                  <li key={`${m.start}-${m.end}`}>
                    <button type="button" className="vr-mute-play mono" title={t('Play from just before it')} onClick={() => play(Math.max(0, m.start - 1.5))}>
                      {fmtTime(m.start, 1)} – {fmtTime(m.end, 1)}
                    </button>
                    <button type="button" className="vr-mute-x" aria-label={t('Switch {from} – {to} back on', { from: fmtTime(m.start, 1), to: fmtTime(m.end, 1) })} title={t('Switch back on')} onClick={() => setMutes((old) => old.filter((_, k) => k !== i))}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="link-btn" onClick={() => setMutes([])}>
                {t('switch all back on')}
              </button>
            </div>
          )}
        </Panel>
      )}

      {stems && <LyricsPanel vocals={stems.vocals} words={words} off={offWords} onWords={setWords} onOff={setOffWords} onPlay={play} now={now} playing={playing} />}

      {stems && (
        <Panel title={t('save')}>
          <div className="opt-row">
            <span className="opt-label" style={{ display: 'flex', alignItems: 'center' }}>
              {t('Save as')}
              <Help label={t('Save as')} text={t('MP3 is small and plays everywhere. WAV keeps the sound exactly and is about ten times bigger; pick it if you’ll edit the result further.')} />
            </span>
            <Segmented
              label={t('Save as')}
              compact
              value={format}
              onChange={setFormat}
              options={[
                { value: 'mp3', label: 'mp3' }, // i18n-ignore
                { value: 'wav', label: 'wav' }, // i18n-ignore
              ]}
            />
          </div>
          <p className="note">
            {t('Saves exactly what you hear now:')}{' '}
            <b>{preset === 'music' ? t('the music without vocals') : preset === 'vocals' ? t('the vocals without music') : silent ? t('nothing (both are off)') : t('music and vocals together')}</b>
            {allMutes.length > 0 && vocalsGain > 0 && <> · {t('with the switched-off parts silent')}</>}
          </p>
          <div className="inline">
            <button type="button" className="btn btn-primary" onClick={save} disabled={silent}>
              {t('Save to the queue')}
            </button>
          </div>
          {sent && (
            <p className="note" role="status">
              {t('Sent to the queue: {name}', { name: sent })}
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

const place = (b: Backend) => (b === 'webgpu' ? t('Splitting the song (graphics card)…') : t('Splitting the song (processor, this takes a few minutes)…'));

function Volume({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <label className="vr-vol">
      <input type="range" min={0} max={150} step={5} value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="mono num">{fmtNum(value)} %</span>
    </label>
  );
}

/** The time under the play button; it counts by itself while playing. */
function Time({ now, playing, duration }: { now: () => number; playing: boolean; duration: number }) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setN((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [playing]);
  return (
    <span className="mono num vr-time">
      {fmtTime(Math.min(duration, now()), 1)} <span className="muted">/ {fmtTime(duration, 1)}</span>
    </span>
  );
}
