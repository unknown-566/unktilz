import { computeValue } from '../../../lib/compute';
import { ffmpegRun } from '../../../lib/ffmpeg';
import { isHeic, isTiff } from '../../../workers/tasks/imageCodecs';
import { drawFrame, type PhotoFrame, type Settings, type StickerAnim } from './compose';

export type VideoSource = { name: string; url: string; duration: number; w: number; h: number; converted: boolean };

const once = (el: EventTarget, ok: string, fail = 'error', ms = 8000) =>
  new Promise<void>((resolve, reject) => {
    const done = (f: () => void) => () => {
      el.removeEventListener(ok, good);
      el.removeEventListener(fail, bad);
      clearTimeout(t);
      f();
    };
    const good = done(resolve);
    const bad = done(() => reject(new Error(fail)));
    const t = setTimeout(done(() => reject(new Error('timeout'))), ms);
    el.addEventListener(ok, good);
    el.addEventListener(fail, bad);
  });

function newVideo(url: string) {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  return v;
}

/** Moves the video to `t` and waits until that frame can be drawn. */
async function seek(v: HTMLVideoElement, t: number) {
  const target = Math.max(0, Math.min(t, v.duration - 0.001));
  if (Math.abs(v.currentTime - target) < 0.0005 && v.readyState >= 2) return;
  const p = once(v, 'seeked');
  v.currentTime = target;
  await p;
}

/** Whether the browser can really show frames of this video (metadata alone isn't enough for e.g. HEVC). */
async function probe(url: string) {
  const v = newVideo(url);
  try {
    await once(v, 'loadeddata', 'error', 6000);
    if (!v.videoWidth || !Number.isFinite(v.duration)) throw new Error('no picture');
    await seek(v, Math.min(0.1, v.duration / 2));
    return { duration: v.duration, w: v.videoWidth, h: v.videoHeight };
  } finally {
    v.removeAttribute('src');
    v.load();
  }
}

/**
 * Opens a video for the GIF maker. Videos the browser can't play (iPhone HEVC, AVI, some MKV) are
 * first turned into a small MP4 with ffmpeg.
 */
export async function openVideo(file: File, onStatus: (text: string) => void): Promise<VideoSource> {
  const url = URL.createObjectURL(file);
  try {
    return { name: file.name, url, ...(await probe(url)), converted: false };
  } catch {
    URL.revokeObjectURL(url);
  }
  onStatus('This browser can’t play this video, so it’s being converted first…');
  const ext = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? 'bin';
  const [mp4] = await ffmpegRun(
    [{ name: `src.${ext}`, data: new Uint8Array(await file.arrayBuffer()) }],
    ['-i', `src.${ext}`, '-an', '-vf', 'scale=trunc(min(iw\\,1280)/2)*2:-2', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'proxy.mp4'],
    ['proxy.mp4'],
    { onProgress: (p) => onStatus(`Converting the video so it can be shown… ${Math.round(p * 100)} %`) },
  );
  const proxy = URL.createObjectURL(new Blob([mp4 as BlobPart], { type: 'video/mp4' }));
  try {
    return { name: file.name, url: proxy, ...(await probe(proxy)), converted: true };
  } catch {
    URL.revokeObjectURL(proxy);
    throw new Error(`${file.name} couldn’t be read as a video.`);
  }
}

/** Small pictures along the clip for the timeline. */
export async function videoThumbs(src: VideoSource, count: number, height: number): Promise<string[]> {
  const v = newVideo(src.url);
  await once(v, 'loadeddata');
  const w = Math.max(1, Math.round((height * src.w) / src.h));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    await seek(v, ((i + 0.5) / count) * src.duration);
    const bmp = await createImageBitmap(v, { resizeWidth: w, resizeHeight: height, resizeQuality: 'medium' });
    const c = new OffscreenCanvas(w, height);
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    bmp.close();
    out.push(URL.createObjectURL(await c.convertToBlob({ type: 'image/jpeg', quality: 0.7 })));
  }
  v.removeAttribute('src');
  v.load();
  return out;
}

/**
 * Takes the frames at `times` from the video, at `w`×`h` (the whole picture, sized so the cropped
 * part comes out at the GIF's width). Stops early when `cancelled()` turns true.
 */
export async function videoFrames(
  src: VideoSource,
  times: number[],
  w: number,
  h: number,
  onProgress: (p: number) => void,
  cancelled: () => boolean,
  /** Gets each frame as soon as it's read; the caller then owns it (it isn't closed on cancel). */
  onFrame?: (time: number, frame: ImageBitmap) => void,
): Promise<ImageBitmap[] | null> {
  const v = newVideo(src.url);
  await once(v, 'loadeddata');
  const out: ImageBitmap[] = [];
  try {
    for (let i = 0; i < times.length; i++) {
      if (cancelled()) {
        if (!onFrame) out.forEach((b) => b.close());
        return null;
      }
      await seek(v, times[i]);
      const frame = await createImageBitmap(v, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
      out.push(frame);
      onFrame?.(times[i], frame);
      onProgress((i + 1) / times.length);
    }
    return out;
  } finally {
    v.removeAttribute('src');
    v.load();
  }
}

/** A photo as a bitmap, at most `max` pixels on its long side. Reads HEIC and TIFF too. */
export async function loadPhoto(file: File, max = 1600): Promise<ImageBitmap> {
  const blob = isHeic(file) || isTiff(file) ? (await computeValue('image-preview', { file, max })).blob : file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    throw new Error(`${file.name} couldn’t be read as a picture.`);
  }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (k >= 1) return bmp;
  const small = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: 'high' });
  bmp.close();
  return small;
}

/** One output frame: a video frame index, or photos with a fade. */
export type FrameRef = number | PhotoFrame;

export function picsFor(ref: FrameRef, video: ImageBitmap[] | null, photos: ImageBitmap[]) {
  if (typeof ref === 'number') return video?.[ref] ? { a: video[ref] } : null;
  const a = photos[ref.a];
  return a ? { a, b: photos[ref.b], mix: ref.mix } : null;
}

const LOOP: Record<Settings['loop'], string> = { forever: '0', once: '-1', '3': '2' };

/** Draws every frame and turns them into a GIF with a palette made for this GIF. */
export async function makeGif(
  refs: FrameRef[],
  video: ImageBitmap[] | null,
  photos: ImageBitmap[],
  s: Settings,
  W: number,
  H: number,
  onProgress: (p: number) => void,
  stickers: Map<string, StickerAnim>,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const duration = refs.length / s.fps;
  // Frames go to ffmpeg as one file of raw RGB: reading pixels takes a few ms a frame, while
  // encoding PNGs took a third of a second each.
  const frameBytes = W * H * 3;
  const raw = new Uint8Array(frameBytes * refs.length);
  for (let i = 0; i < refs.length; i++) {
    const pics = picsFor(refs[i], video, photos);
    if (!pics) throw new Error('A frame is missing. Wait until the frames are ready and try again.');
    drawFrame(ctx, W, H, s, pics, i / s.fps, duration, stickers);
    const rgba = ctx.getImageData(0, 0, W, H).data;
    for (let p = 0, q = i * frameBytes; p < rgba.length; p += 4, q += 3) {
      raw[q] = rgba[p];
      raw[q + 1] = rgba[p + 1];
      raw[q + 2] = rgba[p + 2];
    }
    onProgress(((i + 1) / refs.length) * 0.3);
    // Let the page breathe now and then (progress, the preview).
    if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));
  }
  const vf = `split[a][b];[a]palettegen=max_colors=${s.colors}:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`;
  const input = ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-framerate', String(s.fps), '-i', 'frames.rgb'];
  const [gif] = await ffmpegRun([{ name: 'frames.rgb', data: raw }], [...input, '-vf', vf, '-loop', LOOP[s.loop], 'out.gif'], ['out.gif'], {
    onProgress: (p) => onProgress(0.3 + p * 0.7),
  });
  return new Blob([gif as BlobPart], { type: 'image/gif' });
}
