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

/**
 * The wasm memory only ever grows: after a big job (a long video, a GIF's raw frames) the instance
 * keeps hundreds of MB. So once nothing has used it for a while it's thrown away; the next job loads
 * it again (from the browser's cache, about a second).
 */
const IDLE_MS = 30_000;
let jobs = 0;
let idle: ReturnType<typeof setTimeout> | undefined;
function hold() {
  jobs++;
  clearTimeout(idle);
}
function letGo() {
  jobs = Math.max(0, jobs - 1);
  if (jobs) return;
  clearTimeout(idle);
  idle = setTimeout(() => {
    const was = instance;
    if (jobs || !was) return;
    instance = null;
    was.then((ff) => ff.terminate()).catch(() => {});
  }, IDLE_MS);
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
    let ff: FFmpeg | null = null;
    const onAbort = () => {
      if (ff) reset(ff);
      ch.fail(abortError());
    };
    /** A ready instance with the input written and our listeners on. */
    const open = async () => {
      const next = await get();
      if (signal.aborted) throw abortError();
      next.on('log', onLog);
      next.on('progress', onProgress);
      // Read again each time: writing hands the buffer over to ffmpeg's worker.
      await next.writeFile(input, new Uint8Array(await file.arrayBuffer()));
      return next;
    };
    /**
     * After ffmpeg fails, the wasm instance isn't reliable any more (the next run can crash with
     * "memory access out of bounds"), so it's thrown away and a fresh one is used from then on.
     */
    const discard = (f: FFmpeg) => {
      f.off('log', onLog);
      f.off('progress', onProgress);
      reset(f);
      ff = null;
    };

    signal.addEventListener('abort', onAbort, { once: true });
    hold();
    try {
      ff = await open();
      ch.push({ type: 'progress', value: 0.05 });
      for (let a = 0; ; a++) {
        ff ??= await open();
        log = [];
        let code: number;
        try {
          code = await ff.exec(['-hide_banner', ...attempts[a].args(input, output)]);
        } catch (e) {
          // The wasm crashed: this instance is unusable now.
          discard(ff);
          throw new Error(`ffmpeg crashed (${String(e).replace(/^RuntimeError: /, '')}). The file may be too big or use something this browser version of ffmpeg can't handle.`);
        }
        if (signal.aborted) return;
        if (code === 0 && (attempts[a].accept?.(log) ?? true)) break;
        const failedLog = log;
        if (code !== 0) discard(ff);
        else await ff.deleteFile(output).catch(() => {});
        if (a < attempts.length - 1) {
          ch.push({ type: 'progress', value: 0.05 });
          continue;
        }
        const reason = failedLog.filter((l) => /error|invalid|unsupported|not found|no such|does not contain|matches no streams/i.test(l)).pop();
        throw new Error(reason ? `ffmpeg: ${reason.trim()}` : `ffmpeg exited with code ${code}.`);
      }
      const data = (await ff.readFile(output)) as Uint8Array;
      ch.push({ type: 'result', name: outName, blob: new Blob([data as BlobPart], { type: mime }) });
      ch.close();
    } finally {
      signal.removeEventListener('abort', onAbort);
      const f = ff as FFmpeg | null;
      if (!signal.aborted && f) {
        f.off('log', onLog);
        f.off('progress', onProgress);
        await f.deleteFile(input).catch(() => {});
        await f.deleteFile(output).catch(() => {});
      }
      letGo();
    }
  })().catch((e) => ch.fail(e));

  return ch;
}

/**
 * Runs ffmpeg on several files (e.g. a folder of PNG frames) and returns the named outputs.
 * For tools that drive ffmpeg themselves; ffmpegJob is the simpler path for one file in, one out.
 */
export async function ffmpegRun(
  inputs: { name: string; data: Uint8Array }[],
  args: string[],
  outputs: string[],
  opts: { signal?: AbortSignal; onProgress?: (p: number) => void } = {},
): Promise<Uint8Array[]> {
  hold();
  try {
    return await runOnce(inputs, args, outputs, opts);
  } finally {
    letGo();
  }
}

async function runOnce(
  inputs: { name: string; data: Uint8Array }[],
  args: string[],
  outputs: string[],
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (p: number) => void },
): Promise<Uint8Array[]> {
  const ff = await get();
  if (signal?.aborted) throw abortError();
  const log: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    log.push(message);
    if (log.length > 200) log.shift();
  };
  const onProg = ({ progress }: { progress: number }) => progress > 0 && progress <= 1 && onProgress?.(progress);
  const onAbort = () => reset(ff);
  signal?.addEventListener('abort', onAbort, { once: true });
  ff.on('log', onLog);
  ff.on('progress', onProg);
  let failed = false;
  try {
    for (const f of inputs) await ff.writeFile(f.name, f.data);
    let code: number;
    try {
      code = await ff.exec(['-hide_banner', ...args]);
    } catch (e) {
      failed = true;
      throw new Error(`ffmpeg crashed (${String(e).replace(/^RuntimeError: /, '')}).`);
    }
    if (signal?.aborted) throw abortError();
    if (code !== 0) {
      failed = true;
      const reason = log.filter((l) => /error|invalid|unsupported|not found|no such/i.test(l)).pop();
      throw new Error(reason ? `ffmpeg: ${reason.trim()}` : `ffmpeg exited with code ${code}.`);
    }
    return (await Promise.all(outputs.map((o) => ff.readFile(o)))) as Uint8Array[];
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (!signal?.aborted) {
      ff.off('log', onLog);
      ff.off('progress', onProg);
      // After a failed run the instance isn't reliable any more; the next run loads a fresh one.
      if (failed) reset(ff);
      else for (const name of [...inputs.map((f) => f.name), ...outputs]) await ff.deleteFile(name).catch(() => {});
    }
  }
}
