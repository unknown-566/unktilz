import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { wavePeaks, type Peaks } from '../../../lib/audio/peaks';
import { Waveform } from './Waveform';
import { t } from '../../../lib/i18n-core';

/**
 * A small wave to pick the part of a sound to use (the resource pack's own sounds), with a button
 * that plays the part. Shows nothing when the browser can't read the file; the fields still work.
 */
export function TrimWave({ file, start, end, onSelect, height = 110 }: { file: File; start: number; end: number | null; onSelect: (start: number, end: number) => void; height?: number }) {
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [playing, setPlaying] = useState(false);
  const audio = useMemo(() => new Audio(), []);
  const stopAt = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setPeaks(null);
    const url = URL.createObjectURL(file);
    audio.src = url;
    void wavePeaks(file).then((p) => alive && setPeaks(p));
    return () => {
      alive = false;
      audio.pause();
      URL.revokeObjectURL(url);
    };
  }, [file, audio]);

  useEffect(() => {
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    // Stops at the end of the part (timeupdate also runs in a hidden tab).
    const check = () => {
      if (stopAt.current !== null && audio.currentTime >= stopAt.current) {
        audio.pause();
        stopAt.current = null;
      }
    };
    audio.addEventListener('play', on);
    audio.addEventListener('pause', off);
    audio.addEventListener('ended', off);
    audio.addEventListener('timeupdate', check);
    let id = 0;
    const tick = () => {
      check();
      id = requestAnimationFrame(tick);
    };
    if (playing) id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      audio.removeEventListener('play', on);
      audio.removeEventListener('pause', off);
      audio.removeEventListener('ended', off);
      audio.removeEventListener('timeupdate', check);
    };
  }, [audio, playing]);

  const now = useCallback(() => audio.currentTime || 0, [audio]);
  if (!peaks) return null;
  const to = end ?? peaks.duration;

  return (
    <div className="trim-wave">
      <Waveform
        peaks={peaks}
        start={Math.min(start, to)}
        end={to}
        onSelect={onSelect}
        onSeek={(tm) => {
          stopAt.current = null;
          audio.currentTime = tm;
        }}
        now={now}
        playing={playing}
        height={height}
      />
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => {
          if (!audio.paused) return audio.pause();
          stopAt.current = to;
          audio.currentTime = Math.min(start, to);
          void audio.play().catch(() => {});
        }}
      >
        {playing ? `❚❚ ${t('pause')}` : `▶ ${t('play the part')}`}
      </button>
    </div>
  );
}
