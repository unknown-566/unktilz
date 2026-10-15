import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Opts, Tool } from '../registry';
import { computeValue } from '../lib/compute';
import { isHeic, isTiff } from '../workers/tasks/imageCodecs';
import { Panel } from './ui';

const HEIGHT = 320;

type Shown = { url: string; w: number; h: number } | { error: string } | null;

/** An object URL the page can show for `file`, and the picture's real size. */
function usePicture(file: File | undefined) {
  const [shown, setShown] = useState<Shown>(null);
  useEffect(() => {
    if (!file) return setShown(null);
    let alive = true;
    let url = '';
    setShown(null);
    const done = (s: Shown) => {
      if (alive) setShown(s);
      else if (s && 'url' in s) URL.revokeObjectURL(s.url);
    };
    if (isHeic(file) || isTiff(file)) {
      // The page can't show these, so the worker draws a small copy.
      computeValue('image-preview', { file, max: 1200 })
        .then((r) => {
          url = URL.createObjectURL(r.blob);
          done({ url, w: r.width, h: r.height });
        })
        .catch((e: Error) => done({ error: e.message }));
    } else {
      url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => done({ url, w: img.naturalWidth || 512, h: img.naturalHeight || 512 });
      img.onerror = () => done({ error: `This browser can't show ${file.name}.` });
      img.src = url;
    }
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);
  return shown;
}

/** The picked picture as it will come out (turned, mirrored), with the output size. */
export function ImagePreview({ tool, files, opts }: { tool: Tool; files: File[]; opts: Opts }) {
  const [index, setIndex] = useState(0);
  const i = Math.min(index, files.length - 1);
  const file = files[i];
  const shown = usePicture(file);
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

  const transform = tool.preview?.transform?.(opts) ?? '';
  const sideways = /rotate\((90|270)deg\)/.test(transform);
  let img = null;
  let sizeText = '';
  if (shown && 'url' in shown) {
    // Fit the picture as it looks after turning, then size the element before the turn.
    const [vw, vh] = sideways ? [shown.h, shown.w] : [shown.w, shown.h];
    const k = Math.min((width - 24) / vw, (HEIGHT - 24) / vh, 1);
    img = <img className="img-preview-pic" src={shown.url} alt={`Preview of ${file.name}`} style={{ width: shown.w * k, height: shown.h * k, transform }} />;
    const out = tool.preview?.size?.(shown.w, shown.h, opts, file) ?? { w: shown.w, h: shown.h };
    sizeText = out.w === shown.w && out.h === shown.h ? `${shown.w} × ${shown.h} px` : `${shown.w} × ${shown.h} → ${out.w} × ${out.h} px`;
  }

  return (
    <Panel
      title="preview"
      actions={
        files.length > 1 && (
          <span className="inline">
            <button type="button" className="icon-btn" aria-label="Previous picture" disabled={i === 0} onClick={() => setIndex(i - 1)}>
              ‹
            </button>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {i + 1} / {files.length}
            </span>
            <button type="button" className="icon-btn" aria-label="Next picture" disabled={i === files.length - 1} onClick={() => setIndex(i + 1)}>
              ›
            </button>
          </span>
        )
      }
    >
      <div ref={box} className="img-preview" style={{ height: HEIGHT }}>
        {img}
        {!shown && <span className="muted mono">loading…</span>}
        {shown && 'error' in shown && <span className="muted">{shown.error}</span>}
      </div>
      <p className="note mono">
        {file?.name}
        {sizeText && ` · ${sizeText}`}
      </p>
    </Panel>
  );
}
