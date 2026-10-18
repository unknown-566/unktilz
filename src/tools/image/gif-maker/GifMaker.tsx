import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from 'react';
import { Help } from '../../../components/Help';
import { SavedPanel } from '../../../components/SavedPanel';
import { Panel, Segmented, Toggle } from '../../../components/ui';
import { Workbench } from '../../../components/Workbench';
import { useAutosave } from '../../../lib/saved';
import { formatBytes, saveBlob } from '../../../queue/download';
import { IMAGE_ACCEPTS } from '../formats';
import { MAX_SECONDS, cropRect, frameLimit, defaultSettings, drawFrame, estimateBytes, frameOrder, outputSize, photoFrames, videoFrameTimes, type Crop, type Filter, type Settings, type TextBox } from './compose';
import { loadPhoto, makeGif, openVideo, picsFor, videoFrames, videoThumbs, type FrameRef, type VideoSource } from './frames';
import { TextLayers } from './TextLayers';
import { Timeline } from './Timeline';

const VIDEO_ACCEPTS = ['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.flv', '.wmv', '.3gp', '.ts', '.mts', '.mpg', '.mpeg', '.ogv', '.gif'];
/** GIFs bigger than this don't upload to Discord without Nitro, and load slowly everywhere. */
const BIG = 10 * 1024 * 1024;

type Photo = { id: string; name: string; bmp: ImageBitmap; thumb: string };
type Result = { url: string; blob: Blob; w: number; h: number; frames: number };

const opts = <T extends string>(list: [T, string][]) => list.map(([value, label]) => ({ value, label }));
const CROPS = opts<Crop>([['original', 'original'], ['1:1', '1:1'], ['16:9', '16:9'], ['9:16', '9:16'], ['4:5', '4:5']]);
const FILTERS = opts<Filter>([['none', 'none'], ['gray', 'black & white'], ['sepia', 'sepia'], ['contrast', 'punchy']]);
const SPEEDS = ['0.25', '0.5', '1', '1.5', '2', '4'];

/**
 * Frees an object URL a moment later: frames may still be read from the old video while the new one
 * takes over, and freeing it at once breaks those reads.
 */
const retire = (url: string) => setTimeout(() => URL.revokeObjectURL(url), 5000);

async function thumbOf(bmp: ImageBitmap) {
  const h = 56;
  const w = Math.max(1, Math.round((h * bmp.width) / bmp.height));
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  return URL.createObjectURL(await c.convertToBlob({ type: 'image/jpeg', quality: 0.75 }));
}

function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="opt-row">
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        <span className="opt-label">{label}</span>
        {help && <Help label={label} text={help} />}
      </span>
      {children}
    </div>
  );
}

export default function GifMaker() {
  const [s, setS] = useState<Settings>(defaultSettings);
  const set = (p: Partial<Settings>) => setS((o) => ({ ...o, ...p }));
  useAutosave<Settings>('gif-maker', s, (d) => setS({ ...defaultSettings(), ...d }));

  const [video, setVideo] = useState<VideoSource | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // ---- sources ----
  const takeVideo = async (file: File) => {
    setError('');
    setStatus('Opening the video…');
    try {
      const v = await openVideo(file, setStatus);
      setVideo((old) => {
        if (old) retire(old.url);
        return v;
      });
      // Keep a saved start/end if it fits this video, otherwise the first few seconds.
      setS((o) => ({ ...o, mode: 'video', ...(o.end <= v.duration && o.end > o.start ? {} : { start: 0, end: Math.round(Math.min(v.duration, 4) * 100) / 100 }) }));
      setStatus('');
      const t = await videoThumbs(v, 10, 48);
      setThumbs((old) => {
        old.forEach(retire);
        return t;
      });
    } catch (e) {
      setStatus('');
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const takePhotos = async (files: File[]) => {
    setError('');
    set({ mode: 'photos' });
    for (const f of files) {
      setStatus(`Loading ${f.name}…`);
      try {
        const bmp = await loadPhoto(f);
        const photo = { id: `${f.name}-${f.size}-${Math.random()}`, name: f.name, bmp, thumb: await thumbOf(bmp) };
        setPhotos((p) => [...p, photo]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setStatus('');
  };
  const take = (list: FileList | File[] | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    const isVideo = (f: File) => VIDEO_ACCEPTS.some((x) => f.name.toLowerCase().endsWith(x)) || f.type.startsWith('video/');
    if (s.mode === 'video') {
      const v = files.find(isVideo);
      if (v) void takeVideo(v);
      else setError('That isn’t a video. To make a GIF from pictures, switch to “from photos”.');
    } else {
      const pics = files.filter((f) => !isVideo(f) || /\.gif$/i.test(f.name));
      if (pics.length) void takePhotos(pics);
      else setError('Those aren’t pictures. To make a GIF from a video, switch to “from video”.');
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files);
  };

  // Free memory when leaving the page.
  const live = useRef({ video, thumbs, photos });
  live.current = { video, thumbs, photos };
  useEffect(
    () => () => {
      const { video: v, thumbs: t, photos: p } = live.current;
      if (v) URL.revokeObjectURL(v.url);
      t.forEach((u) => URL.revokeObjectURL(u));
      p.forEach((x) => {
        x.bmp.close();
        URL.revokeObjectURL(x.thumb);
      });
    },
    [],
  );

  // ---- frames ----
  const isVideo = s.mode === 'video';
  const start = video ? Math.min(s.start, video.duration) : s.start;
  const end = video ? Math.min(Math.max(s.end, start + 0.2), video.duration, start + MAX_SECONDS) : s.end;
  const src = isVideo ? (video ? { w: video.w, h: video.h } : null) : photos[0] ? { w: photos[0].bmp.width, h: photos[0].bmp.height } : null;
  const size = src ? outputSize(src.w, src.h, s) : null;

  const timesKey = `${start}|${end}|${s.fps}|${s.speed}`;
  const times = useMemo(() => (isVideo && video ? videoFrameTimes(start, end, s.fps, s.speed) : []), [isVideo, video, timesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Frames are kept at the size where the cropped part is as wide as the GIF.
  const cache = useMemo(() => {
    if (!video || !size) return null;
    const crop = cropRect(video.w, video.h, s.crop);
    const k = Math.min(1, size.w / crop.w);
    return { w: Math.max(2, Math.round(video.w * k)), h: Math.max(2, Math.round(video.h * k)) };
  }, [video, size?.w, s.crop]); // eslint-disable-line react-hooks/exhaustive-deps

  const [frames, setFrames] = useState<ImageBitmap[] | null>(null);
  const [framesDone, setFramesDone] = useState(0);
  const limit = size ? frameLimit(size.w, size.h) : 300;
  const tooMany = isVideo ? frameOrder(times.length, s.reverse, s.boomerang).length > limit : false;
  useEffect(() => {
    if (!video || !cache || !times.length || tooMany) return;
    let cancelled = false;
    setFramesDone(0);
    setFrames((old) => {
      old?.forEach((b) => b.close());
      return null;
    });
    const t = setTimeout(async () => {
      try {
        const f = await videoFrames(video, times, cache.w, cache.h, setFramesDone, () => cancelled);
        if (f && !cancelled) setFrames(f);
        else f?.forEach((b) => b.close());
      } catch (e) {
        if (!cancelled) setError(`Couldn’t read the video’s frames (${e instanceof Error ? e.message : e}).`);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [video, times, cache, tooMany]);

  const refs: FrameRef[] = useMemo(() => {
    if (isVideo) return frameOrder(times.length, s.reverse, s.boomerang);
    const base = photoFrames(photos.length, s.photoSeconds, s.fps, s.speed, s.transition);
    return frameOrder(base.length, s.reverse, s.boomerang).map((i) => base[i]);
  }, [isVideo, times.length, photos.length, s.photoSeconds, s.fps, s.speed, s.transition, s.reverse, s.boomerang]);
  const photoBmps = useMemo(() => photos.map((p) => p.bmp), [photos]);
  const duration = refs.length / s.fps;
  const tooManyPhotos = !isVideo && refs.length > limit;
  const ready = !status && !!size && refs.length > 0 && !tooMany && !tooManyPhotos && (isVideo ? !!frames && frames.length === times.length : photos.length > 0);

  // ---- preview ----
  const canvas = useRef<HTMLCanvasElement>(null);
  const boxes = useRef<TextBox[]>([]);
  const [playing, setPlaying] = useState(true);
  const state = useRef({ s, refs, frames, photoBmps, size, duration, playing });
  state.current = { s, refs, frames, photoBmps, size, duration, playing };
  const frameAt = useRef(0);
  // A timer at the GIF's own frame rate plays it like the real thing (and keeps drawing while
  // paused, so moving a text shows right away).
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const st = state.current;
      timer = window.setTimeout(tick, st.playing ? 1000 / st.s.fps : 50);
      const el = canvas.current;
      if (!el || !st.size || !st.refs.length) return;
      if (el.width !== st.size.w || el.height !== st.size.h) {
        el.width = st.size.w;
        el.height = st.size.h;
      }
      if (st.playing) frameAt.current = (frameAt.current + 1) % st.refs.length;
      const i = Math.min(frameAt.current, st.refs.length - 1);
      const pics = picsFor(st.refs[i], st.frames, st.photoBmps);
      const ctx = el.getContext('2d')!;
      if (!pics) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, el.width, el.height);
        return;
      }
      boxes.current = drawFrame(ctx, el.width, el.height, st.s, pics, i / st.s.fps, st.duration);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);

  // Drag a text to move it; drag the picture to move the crop.
  const drag = useRef<{ kind: 'text'; id: string; dx: number; dy: number } | { kind: 'pan'; x0: number; y0: number; px: number; py: number } | null>(null);
  const toCanvas = (e: PointerEvent) => {
    const el = canvas.current!;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * el.width, y: ((e.clientY - r.top) / r.height) * el.height };
  };
  const down = (e: PointerEvent) => {
    if (!size) return;
    const p = toCanvas(e);
    const hit = [...boxes.current].reverse().find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    if (hit) {
      const l = s.layers.find((x) => x.id === hit.id)!;
      setSelected(hit.id);
      drag.current = { kind: 'text', id: hit.id, dx: p.x - l.x * size.w, dy: p.y - l.y * size.h };
    } else if (isVideo && s.crop !== 'original') {
      drag.current = { kind: 'pan', x0: p.x, y0: p.y, px: s.panX, py: s.panY };
    } else return;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !size) return;
    const p = toCanvas(e);
    if (d.kind === 'text') {
      const x = Math.min(1, Math.max(0, (p.x - d.dx) / size.w));
      const y = Math.min(1, Math.max(0, (p.y - d.dy) / size.h));
      setS((o) => ({ ...o, layers: o.layers.map((l) => (l.id === d.id ? { ...l, x, y } : l)) }));
    } else if (video) {
      const c = cropRect(video.w, video.h, s.crop);
      // Dragging the picture right shows more of its left side.
      const fx = video.w - c.w > 1 ? ((p.x - d.x0) / size.w) * (c.w / (video.w - c.w)) : 0;
      const fy = video.h - c.h > 1 ? ((p.y - d.y0) / size.h) * (c.h / (video.h - c.h)) : 0;
      set({ panX: Math.min(1, Math.max(0, d.px - fx)), panY: Math.min(1, Math.max(0, d.py - fy)) });
    }
  };
  const up = () => (drag.current = null);

  // ---- export ----
  const [busy, setBusy] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result]);
  const create = async () => {
    if (!ready || !size) return;
    setError('');
    setBusy(0);
    try {
      const blob = await makeGif(refs, frames, photoBmps, s, size.w, size.h, setBusy);
      setResult({ url: URL.createObjectURL(blob), blob, w: size.w, h: size.h, frames: refs.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const baseName = (isVideo ? video?.name : photos[0]?.name)?.replace(/\.[^.]+$/, '') || 'animation';

  // ---- layout ----
  const source = (
    <section className="panel" aria-label="Source">
      <Segmented
        label="Make it from"
        value={s.mode}
        options={[
          { value: 'video', label: 'a video' },
          { value: 'photos', label: 'photos' },
        ]}
        onChange={(mode) => set({ mode })}
      />
      <div
        className={`drop gm-drop${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
        onDrop={onDrop}
      >
        <div className="drop-title">{isVideo ? (video ? 'Drop another video to swap it' : 'Drop a video here') : photos.length ? 'Drop more photos to add them' : 'Drop photos here'}</div>
        <button type="button" className={(isVideo ? video : photos.length) ? 'btn' : 'btn btn-primary'} onClick={() => fileInput.current?.click()}>
          {isVideo ? 'Choose a video' : 'Choose photos'}
        </button>
        <div className="drop-sub">{isVideo ? 'mp4 mov webm mkv avi gif …' : 'jpg png webp gif heic …'}</div>
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple={!isVideo}
          accept={(isVideo ? VIDEO_ACCEPTS : IMAGE_ACCEPTS).join(',')}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {status && <p className="note mono">{status}</p>}
      {error && (
        <p className="note give-warn" role="alert">
          {error}
        </p>
      )}
      {isVideo && video && (
        <>
          <p className="note mono">
            {video.name} · {video.w} × {video.h}
            {video.converted && ' · converted to be shown here'}
          </p>
          <Timeline duration={video.duration} start={start} end={end} thumbs={thumbs} onChange={(a, b) => set({ start: a, end: b })} />
        </>
      )}
      {!isVideo && photos.length > 0 && (
        <>
          <ul className="gm-photos">
            {photos.map((p, i) => (
              <li key={p.id}>
                <img src={p.thumb} alt="" />
                <span className="mono muted">{i + 1}</span>
                <button type="button" className="icon-btn" aria-label={`Move ${p.name} earlier`} disabled={i === 0} onClick={() => setPhotos((l) => swap(l, i, i - 1))}>
                  ↑
                </button>
                <button type="button" className="icon-btn" aria-label={`Move ${p.name} later`} disabled={i === photos.length - 1} onClick={() => setPhotos((l) => swap(l, i, i + 1))}>
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => {
                    p.bmp.close();
                    URL.revokeObjectURL(p.thumb);
                    setPhotos((l) => l.filter((x) => x.id !== p.id));
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <Row label="Each photo" help="How long each photo shows, before the speed setting.">
            <div className="range">
              <input type="range" aria-label="Seconds per photo" min={0.1} max={3} step={0.1} value={s.photoSeconds} onChange={(e) => set({ photoSeconds: Number(e.target.value) })} />
              <output>{s.photoSeconds.toFixed(1)} s</output>
            </div>
          </Row>
          <Row label="Between photos">
            <Segmented label="Between photos" compact value={s.transition} options={opts([['none', 'cut'], ['fade', 'fade']])} onChange={(transition) => set({ transition })} />
          </Row>
          <Row label="Fit" help="Fill: photos fill the GIF and edges of differently shaped photos are cut off. Whole photo: nothing is cut, with bars of the background color.">
            <span className="inline">
              <Segmented label="Fit" compact value={s.fit} options={opts([['cover', 'fill'], ['contain', 'whole photo']])} onChange={(fit) => set({ fit })} />
              {s.fit === 'contain' && <input type="color" className="give-color" aria-label="Background color" value={s.background} onChange={(e) => set({ background: e.target.value })} />}
            </span>
          </Row>
        </>
      )}
    </section>
  );

  const picture = (
    <Panel title="picture">
      <Segmented label="Shape" value={s.crop} options={CROPS} onChange={(crop) => set({ crop, panX: 0.5, panY: 0.5 })} />
      {isVideo && s.crop !== 'original' && <p className="note">Drag the preview to choose which part of the video is kept.</p>}
      <Segmented label="Speed" value={String(s.speed)} options={SPEEDS.map((v) => ({ value: v, label: `${v}×` }))} onChange={(v) => set({ speed: Number(v) })} />
      <Row label="Backwards">
        <Toggle label="Backwards" checked={s.reverse} onChange={(reverse) => set({ reverse })} />
      </Row>
      <Row label="Boomerang" help="Plays forwards, then backwards, over and over.">
        <Toggle label="Boomerang" checked={s.boomerang} onChange={(boomerang) => set({ boomerang })} />
      </Row>
      <Segmented label="Filter" value={s.filter} options={FILTERS} onChange={(filter) => set({ filter })} />
    </Panel>
  );

  const exportPanel = (
    <Panel title="gif settings">
      <Segmented label="Width (px)" value={String(s.width)} options={['240', '320', '480', '640'].map((v) => ({ value: v, label: v }))} onChange={(v) => set({ width: Number(v) })} />
      <Segmented label="Frames per second" value={String(s.fps)} options={['10', '15', '20', '25'].map((v) => ({ value: v, label: v }))} onChange={(v) => set({ fps: Number(v) })} />
      <Segmented label="Plays" value={s.loop} options={opts([['forever', 'forever'], ['once', 'once'], ['3', '3 times']])} onChange={(loop) => set({ loop })} />
      <Row label="Colors" help="A GIF can have at most 256 colors. Fewer colors make a smaller file but can look blotchy.">
        <Segmented label="Colors" compact value={String(s.colors)} options={['256', '128', '64', '32'].map((v) => ({ value: v, label: v }))} onChange={(v) => set({ colors: Number(v) })} />
      </Row>
    </Panel>
  );

  const preview = (
    <Panel
      title="preview"
      actions={
        <button type="button" className="btn btn-sm" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>
          {playing ? 'pause' : 'play'}
        </button>
      }
    >
      <div className="gm-stage">
        {size ? (
          <canvas ref={canvas} className="gm-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="GIF preview. Drag a text to move it." />
        ) : (
          <span className="muted">{isVideo ? 'Pick a video to start.' : 'Pick some photos to start.'}</span>
        )}
        {isVideo && video && !frames && !tooMany && <span className="gm-loading mono">preparing frames… {Math.round(framesDone * 100)} %</span>}
      </div>
      {size && (
        <p className="note mono">
          {size.w} × {size.h} · {s.fps} fps · {duration.toFixed(1)} s · {refs.length} frames · ≈ {formatBytes(estimateBytes(size.w, size.h, refs.length, s.colors))}
        </p>
      )}
      {(tooMany || tooManyPhotos) && (
        <p className="note give-warn">
          That’s more than {limit} frames for this size. Make it shorter, use fewer frames per second, a smaller width, or fewer photos.
        </p>
      )}
    </Panel>
  );

  const output = (
    <Panel title="gif">
      <button type="button" className="btn btn-primary" disabled={!ready || busy !== null} onClick={create}>
        {busy !== null ? `Making the GIF… ${Math.round(busy * 100)} %` : 'Make GIF'}
      </button>
      {result && (
        <>
          <img className="gm-result" src={result.url} alt="The finished GIF" />
          <p className={`note mono${result.blob.size > BIG ? ' give-warn' : ''}`}>
            {result.w} × {result.h} · {result.frames} frames · {formatBytes(result.blob.size)}
            {result.blob.size > BIG && ' · big: lower the width, fps or colors to make it smaller'}
          </p>
          <button type="button" className="btn" onClick={() => saveBlob(result.blob, `${baseName}.gif`)}>
            Download {baseName}.gif
          </button>
        </>
      )}
    </Panel>
  );

  return (
    <Workbench
      preview={preview}
      output={output}
    >
      {source}
      <Panel title="text & stickers">
        <TextLayers layers={s.layers} selected={selected} onSelect={setSelected} onChange={(layers) => set({ layers })} duration={duration} />
      </Panel>
      {picture}
      {exportPanel}
      <SavedPanel<Settings>
        slug="gif-maker"
        title="my gif styles"
        help="Keeps your texts, speed, shape and GIF settings (not the video or photos) so you can use them again. Saved in this browser."
        suggestName={() => s.layers[0]?.text.split('\n')[0] || 'My GIF style'}
        getData={() => s}
        onLoad={(d) => setS({ ...defaultSettings(), ...d, mode: s.mode })}
        describe={(i) => `${i.data.layers?.length ?? 0} text${i.data.layers?.length === 1 ? '' : 's'} · ${i.data.width} px · ${i.data.fps} fps`}
        emptyText="Nothing saved yet."
      />
    </Workbench>
  );
}

function swap<T>(list: T[], a: number, b: number) {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
