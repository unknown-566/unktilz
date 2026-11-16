import { useEffect, useId, useRef, useState } from 'react';
import { Panel, Segmented, Toggle } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { RollingNumber } from '../../../components/bits/RollingNumber';
import { useAutosave } from '../../../lib/saved';
import { useQueue } from '../../../queue/store';
import { formatBytes } from '../../../queue/download';
import { t } from '../../../lib/i18n-core';
import {
  baseName,
  canRecordMic,
  canRecordScreen,
  displayConstraints,
  extOf,
  finish,
  micConstraints,
  nativeMp4,
  pickMime,
  videoBitrate,
  type AudioFormat,
  type Quality,
  type VideoFormat,
  type What,
} from './record';

type Settings = { what: What; mic: boolean; sound: boolean; quality: Quality; fps: '30' | '60'; countdown: boolean; format: VideoFormat; audioFormat: AudioFormat };
const DEFAULTS: Settings = { what: 'screen', mic: true, sound: true, quality: '1080', fps: '30', countdown: true, format: 'mp4', audioFormat: 'mp3' };

type Phase = 'idle' | 'asking' | 'countdown' | 'recording' | 'paused' | 'done';

/** Everything that lives while recording (kept out of React state: it isn't drawn). */
type Session = {
  streams: MediaStream[];
  ctx: AudioContext | null;
  analyser: AnalyserNode | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  mime: string;
  startedAt: number;
  pausedAt: number;
  pausedFor: number;
  settings: Settings;
  at: Date;
  timer: number;
};

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
};

function errorText(e: unknown) {
  const name = (e as DOMException)?.name;
  if (name === 'NotAllowedError') return t('Recording wasn’t allowed. Pick a screen, window or tab in the browser’s window and press Share; for the microphone, allow it in the address bar.');
  if (name === 'NotFoundError') return t('No microphone was found. Plug one in, or switch the microphone off.');
  if (name === 'NotReadableError') return t('The microphone or screen is used by another app, or the system blocks it.');
  return e instanceof Error ? e.message : String(e);
}

export default function ScreenRecorder() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  useAutosave('screen-recorder', s, (v) => setS({ ...DEFAULTS, ...v }));
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((old) => ({ ...old, [k]: v }));

  const screenOk = canRecordScreen();
  const micOk = canRecordMic();
  const what: What = screenOk ? s.what : 'mic';

  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ url: string; video: boolean; ms: number; size: number; name: string } | null>(null);
  const [hasMic, setHasMic] = useState(false);

  const session = useRef<Session | null>(null);
  const live = useRef<HTMLVideoElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const liveStream = useRef<MediaStream | null>(null);

  const timeNow = (x: Session) => (x.pausedAt ? x.pausedAt : performance.now()) - x.startedAt - x.pausedFor;

  /** Ends everything that was opened: the shared screen, the microphone, the sound mixer. */
  const release = (x: Session) => {
    clearInterval(x.timer);
    x.streams.forEach((st) => st.getTracks().forEach((tr) => tr.stop()));
    void x.ctx?.close().catch(() => {});
    liveStream.current = null;
  };

  const sendToQueue = (x: Session, blob: Blob, ms: number) => {
    const want = x.settings.what === 'mic' ? x.settings.audioFormat : x.settings.format;
    const name = baseName(x.settings.what, x.at);
    const label = `${name}.${x.settings.what === 'mic' ? (want === 'mp3' ? 'mp3' : extOf(x.mime)) : want === 'mp4' ? 'mp4' : extOf(x.mime)}`;
    useQueue.getState().addTask({ slug: 'screen-recorder', name: 'Screen recorder', category: 'video', file: label }, async (signal, onProgress) => {
      onProgress(0.02);
      return [await finish(blob, x.mime, x.settings.what, want, name, signal, onProgress)];
    });
    setResult({ url: URL.createObjectURL(blob), video: x.settings.what === 'screen', ms, size: blob.size, name: label });
  };

  const stop = () => {
    const x = session.current;
    if (!x) return;
    if (x.recorder && x.recorder.state !== 'inactive') x.recorder.stop();
    else {
      release(x);
      session.current = null;
      setPhase('idle');
    }
  };

  const begin = (x: Session, out: MediaStream) => {
    const rec = new MediaRecorder(out, {
      mimeType: x.mime || undefined,
      videoBitsPerSecond: x.settings.what === 'screen' ? videoBitrate(x.settings.quality, Number(x.settings.fps)) : undefined,
      audioBitsPerSecond: 160_000,
    });
    x.mime = rec.mimeType || x.mime;
    x.recorder = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size) {
        x.chunks.push(e.data);
        setBytes((b) => b + e.data.size);
      }
    };
    rec.onstop = () => {
      const ms = timeNow(x);
      release(x);
      session.current = null;
      const blob = new Blob(x.chunks, { type: x.mime.split(';')[0] });
      if (blob.size) sendToQueue(x, blob, ms);
      setPhase(blob.size ? 'done' : 'idle');
    };
    x.startedAt = performance.now();
    rec.start(1000);
    x.timer = window.setInterval(() => setElapsed(timeNow(x)), 250);
    setPhase('recording');
  };

  const start = async () => {
    setError('');
    setElapsed(0);
    setBytes(0);
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setPhase('asking');
    const settings = { ...s, what };
    const x: Session = { streams: [], ctx: null, analyser: null, recorder: null, chunks: [], mime: '', startedAt: 0, pausedAt: 0, pausedFor: 0, settings, at: new Date(), timer: 0 };
    session.current = x;
    try {
      let screen: MediaStream | null = null;
      if (what === 'screen') {
        screen = await navigator.mediaDevices.getDisplayMedia(displayConstraints(settings.quality, Number(settings.fps), settings.sound));
        x.streams.push(screen);
      }
      let mic: MediaStream | null = null;
      if (what === 'mic' || settings.mic) {
        mic = await navigator.mediaDevices.getUserMedia(micConstraints);
        x.streams.push(mic);
      }
      // The sounds go through one mixer, so the file has one sound track (and the meter can listen).
      const sounds = [screen, mic].filter((st): st is MediaStream => !!st && st.getAudioTracks().length > 0);
      const out = new MediaStream();
      screen?.getVideoTracks().forEach((tr) => out.addTrack(tr));
      if (sounds.length) {
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        for (const st of sounds) ctx.createMediaStreamSource(st).connect(dest);
        if (mic) {
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          ctx.createMediaStreamSource(mic).connect(analyser);
          x.analyser = analyser;
        }
        x.ctx = ctx;
        dest.stream.getAudioTracks().forEach((tr) => out.addTrack(tr));
      }
      setHasMic(!!mic);
      x.mime = pickMime(what, settings.format);
      // "Stop sharing" in the browser's bar ends the recording too.
      screen?.getVideoTracks()[0]?.addEventListener('ended', () => session.current === x && stop());
      if (screen) liveStream.current = screen;

      if (settings.countdown) {
        setPhase('countdown');
        for (let n = 3; n > 0; n--) {
          setCount(n);
          await new Promise((r) => setTimeout(r, 1000));
          if (session.current !== x) return;
        }
      }
      begin(x, out);
    } catch (e) {
      release(x);
      session.current = null;
      setPhase('idle');
      setError(errorText(e));
    }
  };

  const pause = () => {
    const x = session.current;
    if (!x?.recorder) return;
    if (x.recorder.state === 'recording') {
      x.recorder.pause();
      x.pausedAt = performance.now();
      setPhase('paused');
    } else if (x.recorder.state === 'paused') {
      x.pausedFor += performance.now() - x.pausedAt;
      x.pausedAt = 0;
      x.recorder.resume();
      setPhase('recording');
    }
  };

  // The live picture of what is recorded.
  useEffect(() => {
    if (live.current && liveStream.current && live.current.srcObject !== liveStream.current) live.current.srcObject = liveStream.current;
  }, [phase]);

  // The microphone meter, drawn straight into a CSS variable (no re-render 60 times a second).
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'countdown') return;
    const x = session.current;
    if (!x?.analyser) return;
    const data = new Uint8Array(x.analyser.fftSize);
    let raf = 0;
    const tick = () => {
      x.analyser!.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
      meter.current?.style.setProperty('--lvl', level.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Leaving the page while recording: what was recorded still goes to the queue.
  useEffect(
    () => () => {
      const x = session.current;
      if (x?.recorder && x.recorder.state !== 'inactive') x.recorder.stop();
      else if (x) release(x);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const busy = phase === 'asking' || phase === 'countdown' || phase === 'recording' || phase === 'paused';
  const recording = phase === 'recording' || phase === 'paused';
  const mp4Converts = what === 'screen' && s.format === 'mp4' && !nativeMp4();

  if (!micOk)
    return (
      <Panel title={t('recording')}>
        <p className="error-text">{t('This browser can’t record. Try a current Chrome, Edge or Firefox.')}</p>
      </Panel>
    );

  return (
    <>
      <section className={`panel rec-stage${recording ? ' on' : ''}${phase === 'paused' ? ' paused' : ''}`} aria-label={t('Recording')}>
        <div className="rec-view">
          {what === 'screen' && (busy || phase === 'idle') && <video ref={live} className="rec-live" autoPlay muted playsInline hidden={!recording && phase !== 'countdown'} />}
          {phase === 'done' && result &&
            (result.video ? <video className="rec-live" src={result.url} controls playsInline /> : <audio className="rec-audio" src={result.url} controls />)}
          {(phase === 'idle' || phase === 'asking') && (
            <div className="rec-empty">
              <span className="rec-big-dot" aria-hidden="true" />
              <p className="note">{what === 'screen' ? t('Press Record, then pick a screen, a window or a browser tab.') : t('Press Record and allow the microphone.')}</p>
            </div>
          )}
          {what === 'mic' && recording && (
            <div className="rec-empty">
              <span className="rec-big-dot live" aria-hidden="true" />
            </div>
          )}
          {phase === 'countdown' && (
            <div className="rec-count" aria-live="assertive">
              <span key={count}>{count}</span>
            </div>
          )}
        </div>

        <div className="rec-bar">
          <span className="rec-badge mono" aria-hidden={!recording}>
            <span className="rec-dot" />
            {phase === 'paused' ? t('PAUSED') : 'REC' /* i18n-ignore */}
          </span>
          <span className="rec-time mono" aria-label={t('Recorded time')}>
            <RollingNumber value={clock(phase === 'done' && result ? result.ms : elapsed)} />
          </span>
          {(recording || phase === 'done') && <span className="muted mono rec-size">{formatBytes(phase === 'done' && result ? result.size : bytes)}</span>}
          {hasMic && recording && (
            <div className="rec-meter" ref={meter} title={t('Microphone')} aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
              <span className="rec-meter-bar">
                <span />
              </span>
            </div>
          )}
          <span className="rec-actions">
            {!busy && (
              <button type="button" className="btn btn-primary rec-go" onClick={() => void start()}>
                <span className="rec-dot" aria-hidden="true" />
                {phase === 'done' ? t('Record again') : t('Record')}
              </button>
            )}
            {phase === 'asking' && <span className="muted">{t('Waiting for the browser…')}</span>}
            {phase === 'countdown' && (
              <button type="button" className="btn" onClick={stop}>
                {t('cancel')}
              </button>
            )}
            {recording && (
              <>
                <button type="button" className="btn" onClick={pause}>
                  {phase === 'paused' ? t('Go on') : t('Pause')}
                </button>
                <button type="button" className="btn btn-primary" onClick={stop}>
                  <span className="rec-square" aria-hidden="true" />
                  {t('Stop')}
                </button>
              </>
            )}
          </span>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {phase === 'done' && result && (
          <p className="note" role="status">
            {t('Sent to the queue as {name}. You’ll find it there to download.', { name: result.name })}
          </p>
        )}
        {recording && <p className="note">{t('You can switch to other windows and tabs; keep this tab open. Closing it ends the recording, but what was recorded still goes to the queue.')}</p>}
      </section>

      <Panel title={t('Settings')}>
        <fieldset className="rec-settings" disabled={busy}>
          <div className="opt-row">
            <span className="opt-label" id="rec-what">
              {t('Record')}
            </span>
            <Segmented
              labelledBy="rec-what"
              value={what}
              onChange={(v) => set('what', v)}
              options={screenOk ? [{ value: 'screen', label: t('screen') }, { value: 'mic', label: t('microphone only') }] : [{ value: 'mic', label: t('microphone only') }]}
            />
          </div>
          {what === 'screen' && (
            <>
              <Switch label={t('Microphone')} checked={s.mic} onChange={(v) => set('mic', v)} />
              <Switch
                label={t('Sound of the computer or tab')}
                checked={s.sound}
                onChange={(v) => set('sound', v)}
                help={t('In Chrome and Edge, tick "Share audio" (or "Also share tab audio") in the browser’s window. A tab always has its sound; the whole screen has it on Windows; a single window has none.')}
              />
              <div className="opt-row">
                <span className="opt-label" id="rec-q">
                  {t('Quality')}
                </span>
                <Segmented
                  labelledBy="rec-q"
                  value={s.quality}
                  onChange={(v) => set('quality', v)}
                  options={[
                    { value: '720', label: '720p' },
                    { value: '1080', label: '1080p' },
                    { value: 'source', label: t('like the screen') },
                  ]}
                />
              </div>
              <div className="opt-row">
                <span className="opt-label" id="rec-fps">
                  {t('Frames per second')}
                </span>
                <Segmented
                  labelledBy="rec-fps"
                  value={s.fps}
                  onChange={(v) => set('fps', v)}
                  options={[
                    { value: '30', label: '30' },
                    { value: '60', label: '60' },
                  ]}
                />
              </div>
              <div className="opt-row">
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="opt-label" id="rec-f">
                    {t('Save as')}
                  </span>
                  <Help label={t('Save as')} text={t('MP4 plays everywhere (phones, Discord, editors). WebM is smaller and fine for the web. Chrome and Edge record MP4 straight away; Firefox records WebM, and turning it into MP4 takes a while after the recording.')} />
                </span>
                <Segmented
                  labelledBy="rec-f"
                  value={s.format}
                  onChange={(v) => set('format', v)}
                  options={[
                    { value: 'mp4', label: 'MP4' },
                    { value: 'webm', label: 'WebM' },
                  ]}
                />
              </div>
              {mp4Converts && <p className="note">{t('This browser records WebM, so the MP4 is made after the recording (it takes a while for long ones).')}</p>}
            </>
          )}
          {what === 'mic' && (
            <div className="opt-row">
              <span className="opt-label" id="rec-af">
                {t('Save as')}
              </span>
              <Segmented
                labelledBy="rec-af"
                value={s.audioFormat}
                onChange={(v) => set('audioFormat', v)}
                options={[
                  { value: 'mp3', label: 'MP3' },
                  { value: 'original', label: t('as recorded (Opus)') },
                ]}
              />
            </div>
          )}
          <Switch label={t('Count down 3 seconds first')} checked={s.countdown} onChange={(v) => set('countdown', v)} />
        </fieldset>
        <p className="note">{t('Everything is recorded on your computer and nothing is uploaded. The browser shows that you are recording while it runs.')}</p>
      </Panel>
    </>
  );
}

function Switch({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  const id = useId();
  return (
    <div className="opt-row">
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <span className="opt-label" id={id}>
          {label}
        </span>
        {help && <Help label={label} text={help} />}
      </span>
      <Toggle labelledBy={id} checked={checked} onChange={onChange} />
    </div>
  );
}
