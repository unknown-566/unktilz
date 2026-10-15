import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Opts, Tool } from '../registry';
import { formatBytes } from '../queue/download';
import { Panel } from './ui';

const HEIGHT = 340;
/** Wait this long after the last change before making a new preview. */
const DEBOUNCE = 250;
/** Pictures the page can show as they are (for "hold to compare"). */
const SHOWABLE = /\.(png|jpe?g|jfif|webp|gif|bmp|avif|ico|svg)$/i;

type Result = { url: string; w: number; h: number; bytes: number; note?: string; showBytes?: boolean };

const loadSize = (url: string) =>
  new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('The preview couldn’t be shown.'));
    img.src = url;
  });

/** The real result for one picked file with the current options, made again whenever they change. */
function useResult(tool: Tool, file: File | undefined, opts: Opts) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = JSON.stringify(opts);
  useEffect(() => {
    if (!file || !tool.preview) return;
    let alive = true;
    let url = '';
    setBusy(true);
    const t = window.setTimeout(async () => {
      try {
        const r = await tool.preview!(file, JSON.parse(key) as Opts);
        if (!alive) return;
        url = URL.createObjectURL(r.blob);
        const size = await loadSize(url);
        if (!alive) return;
        // From here the result owns the URL (the updater runs later, so it gets its own copy).
        const own = url;
        url = '';
        setResult((old) => {
          if (old && old.url !== own) URL.revokeObjectURL(old.url);
          return { url: own, ...size, bytes: r.blob.size, note: r.note, showBytes: r.bytes };
        });
        setError('');
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setBusy(false);
      }
    }, DEBOUNCE);
    return () => {
      alive = false;
      clearTimeout(t);
      if (url) URL.revokeObjectURL(url);
    };
  }, [tool, file, key]);
  // The last result's URL is freed when the preview goes away.
  useEffect(() => () => setResult((old) => (old && URL.revokeObjectURL(old.url), null)), [tool, file]);
  return { result, busy, error };
}

/** An object URL of the original, for comparing (only pictures the page can show). */
function useOriginal(file: File | undefined) {
  const [original, setOriginal] = useState<{ url: string; w: number; h: number } | null>(null);
  useEffect(() => {
    setOriginal(null);
    if (!file || !SHOWABLE.test(file.name)) return;
    let alive = true;
    const url = URL.createObjectURL(file);
    loadSize(url)
      .then((size) => alive && setOriginal({ url, ...size }))
      .catch(() => {});
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  return original;
}

/** What the picked file will look like with the options as they are now. */
export function ResultPreview({ tool, files, opts }: { tool: Tool; files: File[]; opts: Opts }) {
  const [index, setIndex] = useState(0);
  const i = Math.min(index, files.length - 1);
  const file = files[i];
  const { result, busy, error } = useResult(tool, file, opts);
  const original = useOriginal(file);
  const [actual, setActual] = useState(false);
  const [comparing, setComparing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const shown = comparing && original ? original : result && !error ? { url: result.url, w: result.w, h: result.h } : null;
  let img = null;
  if (shown) {
    // "fit" scales the picture to the box (up too, so a shrunk picture shows how much detail it
    // lost); "100 %" shows its real pixels.
    const k = actual ? 1 : Math.min((width - 24) / shown.w, (HEIGHT - 24) / shown.h);
    img = (
      <img
        className={`img-preview-pic${actual ? ' actual' : ''}${k > 2 ? ' pixelated' : ''}`}
        src={shown.url}
        alt={comparing ? `Original ${file.name}` : `Preview of the result for ${file.name}`}
        style={{ width: Math.max(1, shown.w * k), height: Math.max(1, shown.h * k) }}
        draggable={false}
      />
    );
  }

  const info = result && `${result.note ? `${result.note} · ` : ''}${result.w} × ${result.h} px${result.showBytes ? ` · ${formatBytes(result.bytes)} (was ${formatBytes(file.size)})` : ''}`;

  return (
    <Panel
      title="preview"
      actions={
        <span className="inline">
          {original && (
            <button
              type="button"
              className="btn btn-sm"
              title="Hold to see the original"
              onPointerDown={() => setComparing(true)}
              onPointerUp={() => setComparing(false)}
              onPointerLeave={() => setComparing(false)}
              onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setComparing(true)}
              onKeyUp={() => setComparing(false)}
              onBlur={() => setComparing(false)}
            >
              hold: original
            </button>
          )}
          <button type="button" className="btn btn-sm" aria-pressed={actual} title="Show the real pixels instead of fitting the picture in" onClick={() => setActual(!actual)}>
            100 %
          </button>
          {files.length > 1 && (
            <>
              <button type="button" className="icon-btn" aria-label="Previous file" disabled={i === 0} onClick={() => setIndex(i - 1)}>
                ‹
              </button>
              <span className="mono muted" style={{ fontSize: 12 }}>
                {i + 1} / {files.length}
              </span>
              <button type="button" className="icon-btn" aria-label="Next file" disabled={i === files.length - 1} onClick={() => setIndex(i + 1)}>
                ›
              </button>
            </>
          )}
        </span>
      }
    >
      <div ref={box} className={`img-preview${actual ? ' scroll' : ''}`} style={{ height: HEIGHT }} aria-busy={busy}>
        {img}
        {!result && !error && <span className="muted mono">making preview…</span>}
        {error && <span className="img-preview-error">{error}</span>}
        {busy && result && <span className="img-preview-busy mono">updating…</span>}
      </div>
      <p className="note mono">
        {file?.name}
        {info && ` → ${info}`}
        {comparing && ' (showing the original)'}
      </p>
    </Panel>
  );
}
