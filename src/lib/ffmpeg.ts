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

/**
 * Runs one ffmpeg command on one input file and yields progress, then the output.
 * `args` receives the virtual input and output file names.
 */
export function ffmpegJob(
  file: File,
  outName: string,
  args: (input: string, output: string) => string[],
  mime: string,
  signal: AbortSignal,
): AsyncIterable<RunEvent> {
  const ch = channel<RunEvent>();

  void (async () => {
    // Loading the core counts as the first 5 %.
    ch.push({ type: 'progress', value: 0.01 });
    const ff = await get();
    if (signal.aborted) throw abortError();

    const input = `in.${ext(file.name)}`;
    const output = `out.${ext(outName)}`;
    const log: string[] = [];
    const onLog = ({ message }: { message: string }) => {
      log.push(message);
      if (log.length > 30) log.shift();
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
      const code = await ff.exec(['-hide_banner', ...args(input, output)]);
      if (code !== 0) {
        const reason = log.filter((l) => /error|invalid|unsupported|not found/i.test(l)).pop();
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
