import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { RunEvent } from '../registry/types';
import { abortError, channel } from './channel';

// ffmpeg.wasm runs in its own worker; the ~30 MB core is fetched on first use only.
let instance: Promise<FFmpeg> | null = null;

async function load(): Promise<FFmpeg> {
  const [{ FFmpeg }, { toBlobURL }, core, wasm] = await Promise.all([
    import('@ffmpeg/ffmpeg'),
    import('@ffmpeg/util'),
    import('@ffmpeg/core?url'),
    import('@ffmpeg/core/wasm?url'),
  ]);
  const ff = new FFmpeg();
  await ff.load({
    coreURL: await toBlobURL(core.default, 'text/javascript'),
    wasmURL: await toBlobURL(wasm.default, 'application/wasm'),
  });
  return ff;
}

function get() {
  instance ??= load().catch((e) => {
    instance = null;
    throw e;
  });
  return instance;
}

function reset(ff: FFmpeg) {
  try {
    ff.terminate();
  } catch {
    /* already gone */
  }
  instance = null;
}

const ext = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'bin').toLowerCase();

type Args = (input: string, output: string) => string[];

/**
 * One way of making the output. `accept` looks at ffmpeg's log (input stream info etc.) and can
 * turn a run that worked into a failure, so the next attempt is tried instead.
 */
export type Attempt = { args: Args; accept?: (log: string[]) => boolean };

/** The codecs of the input's streams, read from ffmpeg's log ("Stream #0:0: Video: h264 …"). */
export function streamCodecs(log: string[]) {
  const video: string[] = [];
  const audio: string[] = [];
  for (const l of log) {
    const m = l.match(/Stream #0:\d+.*?: (Video|Audio): ([a-z0-9_]+)/);
    if (m) (m[1] === 'Video' ? video : audio).push(m[2]);
  }
  return { video, audio };
}

/**
 * Runs ffmpeg on one input file and yields progress, then the output. `args` receives the
 * virtual input and output file names. With several attempts, each is tried in order until one
 * works (e.g. a quick stream copy first, then a full re-encode).
 */
export function ffmpegJob(file: File, outName: string, args: Args | Attempt[], mime: string, signal: AbortSignal): AsyncIterable<RunEvent> {
  const ch = channel<RunEvent>();
  const attempts: Attempt[] = typeof args === 'function' ? [{ args }] : args;

  void (async () => {
    // Loading the core counts as the first 5 %.
    ch.push({ type: 'progress', value: 0.01 });
    const ff = await get();
    if (signal.aborted) throw abortError();

    const input = `in.${ext(file.name)}`;
    const output = `out.${ext(outName)}`;
    let log: string[] = [];
    const onLog = ({ message }: { message: string }) => {
      log.push(message);
      if (log.length > 400) log.shift();
    };
    const onProgress = ({ progress }: { progress: number }) => {
      if (progress > 0 && progress <= 1) ch.push({ type: 'progress', value: 0.05 + progress * 0.93 });
    };
    const onAbort = () => {
      reset(ff);
      ch.fail(abortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    ff.on('log', onLog);
    ff.on('progress', onProgress);
    try {
      ch.push({ type: 'progress', value: 0.05 });
      await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()));
      for (let a = 0; ; a++) {
        log = [];
        let code: number;
        try {
          code = await ff.exec(['-hide_banner', ...attempts[a].args(input, output)]);
        } catch (e) {
          // The wasm crashed (e.g. "memory access out of bounds"): this instance is unusable now,
          // so the next job loads a fresh one.
          reset(ff);
          throw new Error(`ffmpeg crashed (${String(e).replace(/^RuntimeError: /, '')}). The file may be too big or use something this browser version of ffmpeg can't handle.`);
        }
        if (signal.aborted) return;
        if (code === 0 && (attempts[a].accept?.(log) ?? true)) break;
        await ff.deleteFile(output).catch(() => {});
        if (a < attempts.length - 1) {
          ch.push({ type: 'progress', value: 0.05 });
          continue;
        }
        const reason = log.filter((l) => /error|invalid|unsupported|not found|no such|does not contain|matches no streams/i.test(l)).pop();
        throw new Error(reason ? `ffmpeg: ${reason.trim()}` : `ffmpeg exited with code ${code}.`);
      }
      const data = (await ff.readFile(output)) as Uint8Array;
      ch.push({ type: 'result', name: outName, blob: new Blob([data as BlobPart], { type: mime }) });
      ch.close();
    } finally {
      signal.removeEventListener('abort', onAbort);
      if (!signal.aborted) {
        ff.off('log', onLog);
        ff.off('progress', onProgress);
        await ff.deleteFile(input).catch(() => {});
        await ff.deleteFile(output).catch(() => {});
      }
    }
  })().catch((e) => ch.fail(e));

  return ch;
}
