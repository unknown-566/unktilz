import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DropZone } from '../../../components/DropZone';
import { Workbench } from '../../../components/Workbench';
import { Panel, Segmented } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { filesFromDrop, isFileDrag, usePendingFiles } from '../../../queue/dragFiles';
import { formatBytes, saveBlob } from '../../../queue/download';
import { ffmpegRun } from '../../../lib/ffmpeg';
import { openAudio, type OpenedAudio } from '../../../lib/audio/peaks';
import { parseTime } from '../../../lib/timecode';
import { AUDIO_MIME, LOSSLESS, type AudioFormat } from '../audioArgs';
import { CUTTER_ACCEPTS as ACCEPT, cutCommand, cutName, fmtTime, formatFor, resultLength, type CutMode } from './cutArgs';
import { Waveform } from './Waveform';
import { t, fmtNum } from '../../../lib/i18n-core';

const FORMATS: AudioFormat[] = ['mp3', 'ogg', 'opus', 'm4a', 'wav', 'flac'];

type Result = { blob: Blob; url: string; name: string };

export default function AudioCutter() {
  const [file, setFile] = useState<File | null>(null);
  const [audioData, setAudioData] = useState<OpenedAudio | null>(null);
  /** null = not loading; a number = ffmpeg is making a playable copy (0…1). */
  const [loading, setLoading] = useState<boolean | number>(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);

  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [mode, setMode] = useState<CutMode>('keep');
  const [fadeIn, setFadeIn] = useState('0');
  const [fadeOut, setFadeOut] = useState('0');
  const [format, setFormat] = useState<'same' | AudioFormat>('same');
  const [bitrate, setBitrate] = useState('192');
  const [loop, setLoop] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [cutError, setCutError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const abort = useRef<AbortController | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // ---- playing ----
  const audio = useMemo(() => new Audio(), []);
  /** What the current playback does: stop at a time, jump over the cut-out part, or go round. */
  const plan = useRef<{ stop: number | null; skip: [number, number] | null; loopFrom: number | null }>({ stop: null, skip: null, loopFrom: null });
  const now = useCallback(() => audio.currentTime || 0, [audio]);
  const [head, setHead] = useState(0);

  useEffect(() => {
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      setHead(audio.currentTime);
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onPause);
    return () => {
      audio.pause();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onPause);
    };
  }, [audio]);

  // The play plan is checked every frame, and on timeupdate too (frames stop in a hidden tab).
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const check = () => {
      const p = plan.current;
      const tm = audio.currentTime;
      if (p.skip && tm >= p.skip[0] && tm < p.skip[1]) audio.currentTime = p.skip[1];
      if (p.stop !== null && tm >= p.stop) {
        if (p.loopFrom !== null) audio.currentTime = p.loopFrom;
        else {
          audio.pause();
          audio.currentTime = p.stop;
        }
      }
    };
    const tick = () => {
      check();
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    audio.addEventListener('timeupdate', check);
    return () => {
      cancelAnimationFrame(id);
      audio.removeEventListener('timeupdate', check);
    };
  }, [playing, audio]);

  const playFrom = (from: number, p: typeof plan.current) => {
    plan.current = p;
    audio.currentTime = from;
    void audio.play().catch(() => {});
  };
  const seek = (tm: number) => {
    audio.currentTime = tm;
    setHead(tm);
    // A seek during "play the part" ends that plan.
    plan.current = { stop: null, skip: null, loopFrom: null };
  };

  const dur = audioData?.peaks.duration ?? 0;

  const togglePlay = () => {
    if (!audio.paused) return audio.pause();
    const from = audio.currentTime >= dur - 0.05 ? 0 : audio.currentTime;
    playFrom(from, { stop: null, skip: null, loopFrom: null });
  };
  /** Keep: just the part (round and round with "loop"). Cut out: a bit before and after, jumping over it. */
  const playPart = () => {
    if (mode === 'keep') playFrom(start, { stop: end, skip: null, loopFrom: loop ? start : null });
    else playFrom(Math.max(0, start - 2), { stop: Math.min(dur, end + 2), skip: [start, end], loopFrom: null });
  };

  // Space plays and pauses (unless typing or on a button, where it means something else).
  useEffect(() => {
    if (!audioData) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, button, [contenteditable="true"], [role="switch"]')) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- opening a file ----
  const playUrl = useRef('');
  // The result's URL is let go by the effect below when it's replaced.
  const forgetResult = () => setResult(null);

  const open = async (files: File[]) => {
    const f = files.find((x) => ACCEPT.some((a) => x.name.toLowerCase().endsWith(a))) ?? files[0];
    if (!f) return;
    abort.current?.abort();
    audio.pause();
    setError('');
    setCutError('');
    setLoading(true);
    try {
      const ctl = new AbortController();
      abort.current = ctl;
      const data = await openAudio(f, (p) => setLoading(p), ctl.signal);
      if (ctl.signal.aborted) return;
      if (playUrl.current) URL.revokeObjectURL(playUrl.current);
      playUrl.current = URL.createObjectURL(data.play);
      audio.src = playUrl.current;
      plan.current = { stop: null, skip: null, loopFrom: null };
      forgetResult();
      setFile(f);
      setAudioData(data);
      setStart(0);
      setEnd(data.peaks.duration);
      setHead(0);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  usePendingFiles('audio-cutter', (f) => void open(f));

  useEffect(
    () => () => {
      abort.current?.abort();
      if (playUrl.current) URL.revokeObjectURL(playUrl.current);
    },
    [],
  );
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result]);

  // ---- cutting ----
  const outFormat: AudioFormat = format === 'same' ? (file ? formatFor(file.name) : 'mp3') : format;
  const num = (s: string) => Math.max(0, Number(s.replace(',', '.')) || 0);
  const length = resultLength({ start, end, duration: dur, mode });

  const cut = async () => {
    if (!file || !audioData) return;
    setCutError('');
    const ctl = new AbortController();
    abort.current = ctl;
    const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'bin').toLowerCase();
    const input = `in.${ext}`;
    const output = `out.${outFormat}`;
    try {
      const args = cutCommand({ start, end, duration: dur, mode, fadeIn: num(fadeIn), fadeOut: num(fadeOut), format: outFormat, bitrate }, input, output);
      setBusy(0);
      const [data] = await ffmpegRun([{ name: input, data: new Uint8Array(await file.arrayBuffer()) }], args, [output], { signal: ctl.signal, onProgress: setBusy });
      const blob = new Blob([data as BlobPart], { type: AUDIO_MIME[outFormat] });
      forgetResult();
      setResult({ blob, url: URL.createObjectURL(blob), name: cutName(file.name, outFormat) });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setCutError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const fileInput = (
    <input
      ref={picker}
      type="file"
      accept={ACCEPT.join(',')}
      hidden
      onChange={(e) => {
        void open([...(e.target.files ?? [])]);
        e.target.value = '';
      }}
    />
  );

  if (!file || !audioData)
    return (
      <DropZone
        title={loading === false ? t('Drop a sound or video here') : typeof loading === 'number' ? t('Making a copy this browser can play… {p} %', { p: fmtNum(Math.round(loading * 100)) }) : t('loading…')}
        button={t('Choose a file')}
        accept={ACCEPT}
        error={error}
        onFiles={(f) => void open(f)}
        claimPending={false}
      />
    );

  const side = (
    <Panel title={t('cut')}>
      <div className="field">
        <span className="field-label" style={{ display: 'flex', alignItems: 'center' }}>
          {t('What to do with the part')}
          <Help label={t('What to do with the part')} text={t('Keep it: only the picked part is left. Cut it out: the picked part goes and what was before and after it is joined.')} />
        </span>
        <Segmented
          label={t('What to do with the part')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'keep', label: t('keep it') },
            { value: 'remove', label: t('cut it out') },
          ]}
        />
      </div>

      <dl className="ac-sum mono">
        <dt>{t('Part')}</dt>
        <dd>
          {fmtTime(start)} – {fmtTime(end)}
        </dd>
        <dt>{t('Result')}</dt>
        <dd>
          {fmtTime(Math.max(0, length))} <span className="muted">/ {fmtTime(dur)}</span>
        </dd>
      </dl>

      <div className="ac-fades">
        <label className="ac-num">
          <span>{t('Fade in')}</span>
          <input className="input mono" type="number" min={0} step={0.1} value={fadeIn} onChange={(e) => setFadeIn(e.target.value)} />
          <span className="muted mono">s</span>
        </label>
        <label className="ac-num">
          <span>{t('Fade out')}</span>
          <input className="input mono" type="number" min={0} step={0.1} value={fadeOut} onChange={(e) => setFadeOut(e.target.value)} />
          <span className="muted mono">s</span>
        </label>
        <Help label={t('Fade in')} text={t('Seconds from silence to full volume at the start of the result, and back to silence at its end. The wave shows it. 0 = none.')} />
      </div>

      <div className="field">
        <span className="field-label">{t('Save as')}</span>
        <Segmented
          label={t('Save as')}
          compact
          value={format}
          onChange={setFormat}
          options={[{ value: 'same' as const, label: t('same ({f})', { f: file ? formatFor(file.name) : 'mp3' }) }, ...FORMATS.map((f) => ({ value: f, label: f }))]}
        />
      </div>
      {!LOSSLESS.has(outFormat) && (
        <div className="field">
          <span className="field-label" style={{ display: 'flex', alignItems: 'center' }}>
            {t('Bitrate')}
            <span className="muted mono ac-unit">kbps</span>
            <Help label={t('Bitrate')} text={t('How much data is used per second of sound. Higher sounds better but makes bigger files. 192 is good for music; 128 is plenty for speech.')} />
          </span>
          <Segmented label={t('Bitrate')} compact value={bitrate} onChange={setBitrate} options={['128', '192', '256', '320'].map((v) => ({ value: v, label: v }))} />
        </div>
      )}

      <div className="inline">
        <button type="button" className="btn btn-primary" onClick={() => void cut()} disabled={busy !== null || end - start < 0.01}>
          {busy !== null ? t('Cutting… {p} %', { p: fmtNum(Math.round(busy * 100)) }) : t('Cut')}
        </button>
        {busy !== null && (
          <button type="button" className="btn" onClick={() => abort.current?.abort()}>
            {t('cancel')}
          </button>
        )}
      </div>
      {busy === 0 && <p className="note">{t('The first time, the converter (about 30 MB) is downloaded.')}</p>}
      {cutError && (
        <p className="error-text" role="alert">
          {cutError}
        </p>
      )}

      {result && (
        <div className="ac-result">
          <audio controls src={result.url} />
          <p className="mono">
            {result.name} <span className="muted">· {formatBytes(result.blob.size)}</span>
          </p>
          <button type="button" className="btn btn-primary" onClick={() => saveBlob(result.blob, result.name)}>
            {t('Download')}
          </button>
        </div>
      )}
    </Panel>
  );

  return (
    <Workbench preview={side}>
      <Panel
        // i18n-ignore: a file name and its length
        title={`${file.name} · ${fmtTime(dur)}`}
        actions={
          <button type="button" className="btn btn-sm mono" onClick={() => picker.current?.click()}>
            {t('other file')}
          </button>
        }
      >
        <div
          className={`ac-drop${over ? ' over' : ''}`}
          onDragEnter={(e) => isFileDrag(e) && e.preventDefault()}
          onDragOver={(e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            setOver(false);
            filesFromDrop(e).then((f) => void open(f), (err: Error) => setError(err.message));
          }}
        >
          <Waveform
            peaks={audioData.peaks}
            start={start}
            end={end}
            onSelect={(a, b) => {
              setStart(a);
              setEnd(b);
            }}
            onSeek={seek}
            now={now}
            playing={playing}
            mode={mode}
            fadeIn={num(fadeIn)}
            fadeOut={num(fadeOut)}
            height={180}
          />
        </div>

        <div className="ac-transport">
          <button type="button" className="btn btn-primary ac-play" onClick={togglePlay} title={t('Play / pause (space)')}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button type="button" className="btn" onClick={playPart} disabled={end - start < 0.01}>
            {mode === 'keep' ? t('play the part') : t('listen to the cut')}
          </button>
          {mode === 'keep' && (
            <label className="ac-check">
              <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
              <span>{t('loop')}</span>
            </label>
          )}
          <span className="ac-now mono" aria-live="off">
            <HeadTime now={now} playing={playing} head={head} />
          </span>
        </div>

        <div className="ac-times">
          <TimeField label={t('from')} value={start} max={dur} onCommit={(v) => (v <= end ? setStart(v) : (setStart(end), setEnd(v)))} />
          <button type="button" className="btn btn-sm" onClick={() => { const h = now(); if (h <= end) setStart(h); else { setStart(end); setEnd(h); } }} title={t('The part starts where the playhead is')}>
            {t('start here')}
          </button>
          <TimeField label={t('to')} value={end} max={dur} onCommit={(v) => (v >= start ? setEnd(v) : (setEnd(start), setStart(v)))} />
          <button type="button" className="btn btn-sm" onClick={() => { const h = now(); if (h >= start) setEnd(h); else { setEnd(start); setStart(h); } }} title={t('The part ends where the playhead is')}>
            {t('end here')}
          </button>
          <span className="muted mono">{t('{s} long', { s: fmtTime(end - start) })}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setStart(0);
              setEnd(dur);
            }}
          >
            {t('everything')}
          </button>
        </div>

        <p className="note">
          {t('Drag across the wave to pick a part, or drag its edges. A click moves the playhead; double-click picks everything. Ctrl + wheel zooms, Shift + wheel moves sideways; space plays and pauses.')}
        </p>
        {audioData.converted && <p className="note">{t('This browser can’t play this file itself, so you hear a copy; the cut is made from the original.')}</p>}
        {error && <p className="error-text">{error}</p>}
        {fileInput}
      </Panel>
    </Workbench>
  );
}

/** The playhead's time, updated every frame while playing. */
function HeadTime({ now, playing, head }: { now: () => number; playing: boolean; head: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.textContent = fmtTime(playing ? now() : head);
    if (!playing) return;
    let id = 0;
    const tick = () => {
      if (ref.current) ref.current.textContent = fmtTime(now());
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [now, playing, head]);
  return <span ref={ref} />;
}

/** A time typed as 83, 1:23 or 1:23.45; taken on Enter or when leaving the field. */
function TimeField({ label, value, max, onCommit }: { label: string; value: number; max: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(fmtTime(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmtTime(value));
  }, [value]);
  const commit = () => {
    try {
      const v = parseTime(text, label);
      if (v === null) throw new Error();
      setBad(false);
      onCommit(Math.min(max, v));
      setText(fmtTime(Math.min(max, v)));
    } catch {
      setBad(true);
    }
  };
  return (
    <label className="ac-time">
      <span>{label}</span>
      <input
        className="input mono"
        value={text}
        aria-invalid={bad || undefined}
        title={bad ? t('Use seconds (90) or minutes:seconds (1:30).') : undefined}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
}
