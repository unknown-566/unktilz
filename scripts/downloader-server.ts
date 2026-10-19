/**
 * The downloader's local server part: runs yt-dlp (with aria2c for many connections at once and
 * ffmpeg for joining video and sound) on this computer for the "Video & audio downloader" tool.
 * It lives in the site's own Vite server (start.bat), under /api/dl/; a static host doesn't have it.
 *
 * Only the site itself may use it: requests must come from a localhost page of this server and carry
 * the X-Unktilz header, so another website open in the browser can't make it download or run anything.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, copyFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Plugin } from 'vite';
import {
  DEFAULT_OPTIONS,
  PROGRESS_TEMPLATE,
  checkExtra,
  isNewPart,
  isWebUrl,
  optionArgs,
  overall,
  parseAria2,
  parseProgress,
  partsOf,
  phaseOf,
  trimInfo,
  type DlOptions,
  type Phase,
} from '../src/tools/video/downloader/args';

const WIN = process.platform === 'win32';
const exe = (name: string) => (WIN ? `${name}.exe` : name);

/** Where the programs come from (Windows). yt-dlp and ffmpeg are checked against their published checksums. */
const SOURCES = {
  ytdlp: {
    url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    sums: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS',
    sumName: 'yt-dlp.exe',
  },
  // aria2 publishes no checksums; this exact release is pinned to the hash it had when it was added.
  aria2: {
    url: 'https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip',
    sha256: '67d015301eef0b612191212d564c5bb0a14b5b9c4796b76454276a4d28d9b288',
  },
  ffmpeg: {
    url: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip',
    sums: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/checksums.sha256',
    sumName: 'ffmpeg-master-latest-win64-gpl-shared.zip',
  },
};

type Step = 'yt-dlp' | 'aria2c' | 'ffmpeg';
type InstallState = { running: boolean; step?: Step; progress: number; error?: string; done?: boolean };

type Job = {
  id: string;
  dir: string;
  proc: ChildProcess | null;
  status: 'running' | 'done' | 'error' | 'cancelled';
  phase: Phase;
  done: number;
  total: number;
  speed: number;
  eta: number;
  /** Which of several downloads (video + sound) this is, from 1, and how many there are. */
  part: number;
  parts: number;
  /** aria2c's open connections. */
  connections: number;
  error?: string;
  log: string[];
  started: number;
  finished?: number;
};

/** Leftover download folders older than this are removed. */
const KEEP_MS = 6 * 3600_000;

export function downloader(): Plugin {
  let root = process.cwd();
  const bin = () => join(root, 'bin');
  const work = join(tmpdir(), 'unktilz-dl');
  const jobs = new Map<string, Job>();
  let install: InstallState = { running: false, progress: 0 };
  let versions: Record<string, string | null> | null = null;

  /** A program from bin/, or from PATH when it isn't there (e.g. installed by hand, or not Windows). */
  const program = (name: string) => {
    const local = join(bin(), exe(name));
    return existsSync(local) ? local : name;
  };

  /** Runs a program to the end and returns its output. */
  const run = (cmd: string, args: string[], timeoutMs = 120_000) =>
    new Promise<{ code: number; out: string; err: string }>((resolve) => {
      let out = '';
      let err = '';
      let p: ChildProcess;
      try {
        p = spawn(cmd, args, { windowsHide: true });
      } catch (e) {
        resolve({ code: -1, out, err: String(e) });
        return;
      }
      const t = setTimeout(() => kill(p), timeoutMs);
      p.stdout?.on('data', (d) => (out += d));
      p.stderr?.on('data', (d) => (err += d));
      p.on('error', (e) => {
        clearTimeout(t);
        resolve({ code: -1, out, err: String(e) });
      });
      p.on('close', (code) => {
        clearTimeout(t);
        resolve({ code: code ?? -1, out, err });
      });
    });

  const version = async (name: string, args: string[]) => {
    const r = await run(program(name), args, 20_000);
    return r.code === 0 ? (r.out.split(/\r?\n/)[0] ?? '').trim() || 'ok' : null;
  };
  const getVersions = async (fresh = false) => {
    if (!versions || fresh)
      versions = {
        ytdlp: await version('yt-dlp', ['--version']),
        aria2c: (await version('aria2c', ['--version']))?.replace(/^aria2 version /, '') ?? null,
        ffmpeg: (await version('ffmpeg', ['-version']))?.replace(/^ffmpeg version (\S+).*/, '$1') ?? null,
      };
    return versions;
  };

  /** Stops a program and everything it started (yt-dlp starts aria2c and ffmpeg). */
  function kill(p: ChildProcess | null) {
    if (!p || p.exitCode !== null || !p.pid) return;
    if (WIN) spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true });
    else p.kill('SIGKILL');
  }

  // ---- installing the programs ----

  async function download(url: string, to: string, onProgress: (p: number) => void) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`Downloading ${url} failed (${res.status}).`);
    const total = Number(res.headers.get('content-length')) || 0;
    const hash = createHash('sha256');
    let got = 0;
    const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
    body.on('data', (c: Buffer) => {
      got += c.length;
      hash.update(c);
      if (total) onProgress(got / total);
    });
    await pipeline(body, createWriteStream(to));
    return hash.digest('hex');
  }

  async function expectedSum(sumsUrl: string, name: string) {
    const text = await (await fetch(sumsUrl, { redirect: 'follow' })).text();
    const line = text.split(/\r?\n/).find((l) => l.trim().endsWith(name));
    const sum = line?.trim().split(/\s+/)[0]?.toLowerCase();
    if (!sum || !/^[0-9a-f]{64}$/.test(sum)) throw new Error(`No checksum published for ${name}.`);
    return sum;
  }

  async function unzip(zip: string, into: string) {
    // tar in Windows 10+ reads zip files (update.bat uses it too).
    const tar = WIN ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    const r = await run(tar, ['-xf', zip, '-C', into], 300_000);
    if (r.code !== 0) throw new Error(`Unpacking failed: ${r.err.trim() || r.code}`);
  }

  /** Copies every file of `from` (one level) whose name passes `keep` into bin/. */
  const copyAll = (from: string, keep: (name: string) => boolean) => {
    for (const name of readdirSync(from)) if (keep(name)) copyFileSync(join(from, name), join(bin(), name));
  };

  async function doInstall() {
    const tmp = join(work, `install-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    mkdirSync(bin(), { recursive: true });
    const step = (s: Step) => (install = { ...install, step: s, progress: 0 });
    const prog = (p: number) => (install = { ...install, progress: p });
    try {
      step('yt-dlp');
      const ytSum = await expectedSum(SOURCES.ytdlp.sums, SOURCES.ytdlp.sumName);
      const yt = join(tmp, 'yt-dlp.exe');
      if ((await download(SOURCES.ytdlp.url, yt, prog)) !== ytSum) throw new Error("yt-dlp.exe doesn't match its published checksum.");
      copyFileSync(yt, join(bin(), 'yt-dlp.exe'));

      step('aria2c');
      const ar = join(tmp, 'aria2.zip');
      if ((await download(SOURCES.aria2.url, ar, prog)) !== SOURCES.aria2.sha256) throw new Error("aria2's download doesn't match the expected checksum.");
      await unzip(ar, tmp);
      const arDir = readdirSync(tmp).find((n) => n.startsWith('aria2-') && statSync(join(tmp, n)).isDirectory());
      if (!arDir) throw new Error('aria2c.exe was not in the download.');
      copyAll(join(tmp, arDir), (n) => n === 'aria2c.exe');

      step('ffmpeg');
      const ffSum = await expectedSum(SOURCES.ffmpeg.sums, SOURCES.ffmpeg.sumName);
      const ff = join(tmp, 'ffmpeg.zip');
      if ((await download(SOURCES.ffmpeg.url, ff, prog)) !== ffSum) throw new Error("ffmpeg's download doesn't match its published checksum.");
      await unzip(ff, tmp);
      const ffDir = readdirSync(tmp).find((n) => n.startsWith('ffmpeg-') && statSync(join(tmp, n)).isDirectory());
      if (!ffDir) throw new Error('ffmpeg was not in the download.');
      // ffmpeg and ffprobe with their libraries; ffplay isn't needed.
      copyAll(join(tmp, ffDir, 'bin'), (n) => /\.(dll)$/i.test(n) || n === 'ffmpeg.exe' || n === 'ffprobe.exe');

      await getVersions(true);
      install = { running: false, progress: 1, done: true };
    } catch (e) {
      install = { running: false, progress: 0, error: e instanceof Error ? e.message : String(e) };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  /**
   * YouTube needs a JavaScript runtime for some formats; Node runs this very server, so it's there.
   * Used for every yt-dlp run that reads a page.
   */
  const jsRuntime = ['--js-runtimes', `node:${process.execPath}`];

  // ---- downloads ----

  function startJob(url: string, o: DlOptions, item: string | undefined) {
    const extra = checkExtra(o.extra);
    if ('error' in extra) throw new Error(extra.error);
    const id = randomUUID();
    const dir = join(work, id);
    mkdirSync(dir, { recursive: true });
    const args = [
      '--newline',
      '--no-colors',
      '--progress',
      '--progress-template',
      PROGRESS_TEMPLATE,
      '--windows-filenames',
      '--no-mtime',
      '-P',
      dir,
      '-o',
      '%(title).150B [%(id)s].%(ext)s',
      '--ffmpeg-location',
      existsSync(join(bin(), exe('ffmpeg'))) ? bin() : 'ffmpeg',
      // aria2c downloads in 16 pieces at once; without it (not installed) yt-dlp downloads by itself.
      ...(existsSync(join(bin(), exe('aria2c')))
        ? ['--downloader', program('aria2c'), '--downloader-args', 'aria2c:-x 16 -s 16 -k 1M --summary-interval=1 --console-log-level=warn']
        : []),
      ...jsRuntime,
      ...(item ? ['--playlist-items', item] : ['--no-playlist']),
      ...optionArgs(o),
      ...extra.args,
      '--',
      url,
    ];
    const job: Job = { id, dir, proc: null, status: 'running', phase: 'starting', done: 0, total: 0, speed: 0, eta: 0, part: 0, parts: 1, connections: 0, log: [], started: Date.now() };
    jobs.set(id, job);
    const p = spawn(program('yt-dlp'), args, { cwd: dir, windowsHide: true });
    job.proc = p;
    const onLine = (line: string) => {
      if (!line.trim()) return;
      const pr = parseAria2(line) ?? parseProgress(line);
      if (pr) {
        Object.assign(job, pr, { phase: 'downloading' as Phase, part: Math.max(1, job.part) });
        return;
      }
      // aria2c's summary frame around the progress line.
      if (/^( \*\*\* Download Progress Summary|={10,}|-{10,}|FILE: )/.test(line)) return;
      const n = partsOf(line);
      if (n) job.parts = n;
      if (isNewPart(line)) {
        job.part++;
        Object.assign(job, { done: 0, total: 0, speed: 0, eta: 0 });
      }
      job.log.push(line);
      if (job.log.length > 200) job.log.shift();
      const ph = phaseOf(line);
      if (ph) job.phase = ph;
    };
    let buf = '';
    const read = (d: Buffer) => {
      buf += d.toString('utf8');
      const lines = buf.split(/\r?\n|\r/);
      buf = lines.pop() ?? '';
      lines.forEach(onLine);
    };
    p.stdout.on('data', read);
    p.stderr.on('data', read);
    p.on('error', (e) => {
      job.status = 'error';
      job.error = `yt-dlp couldn't start: ${e.message}`;
      job.finished = Date.now();
    });
    p.on('close', (code) => {
      if (buf) onLine(buf);
      job.proc = null;
      job.finished = Date.now();
      if (job.status === 'cancelled') return;
      if (code === 0 && files(job).length) job.status = 'done';
      else {
        job.status = 'error';
        job.error = job.log.filter((l) => /^ERROR:/.test(l)).pop()?.replace(/^ERROR:\s*/, '') || job.log.slice(-1)[0] || `yt-dlp stopped (code ${code}).`;
      }
    });
    return job;
  }

  /** The finished files of a job (not the half-done ones). */
  const files = (job: Job) =>
    existsSync(job.dir)
      ? readdirSync(job.dir).filter((n) => !/\.(part|ytdl|aria2|temp)$/i.test(n) && !/\.part-Frag\d+/.test(n) && statSync(join(job.dir, n)).isFile())
      : [];

  const forget = (job: Job) => {
    kill(job.proc);
    jobs.delete(job.id);
    // Give the killed programs a moment to let go of the files.
    setTimeout(() => rmSync(job.dir, { recursive: true, force: true }), 1500);
  };

  /**
   * Removes download folders nobody will ask for any more: those of finished jobs after a while, and
   * at start-up (`all`) everything left from an earlier run, whose jobs this server doesn't know.
   */
  function sweep(all = false) {
    if (!existsSync(work)) return;
    const now = Date.now();
    for (const name of readdirSync(work)) {
      if (jobs.has(name)) continue;
      const path = join(work, name);
      try {
        if (all || now - statSync(path).mtimeMs > KEEP_MS) rmSync(path, { recursive: true, force: true });
      } catch {
        /* in use */
      }
    }
    for (const j of jobs.values()) if (j.finished && now - j.finished > KEEP_MS) forget(j);
  }

  const stopAll = () => {
    for (const j of jobs.values()) kill(j.proc);
  };

  // ---- HTTP ----

  /** Only this site's own pages (on this computer) may call the API. */
  function allowed(req: IncomingMessage) {
    const host = req.headers.host ?? '';
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)) return false;
    if (req.headers['x-unktilz'] !== '1') return false;
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== host) return false;
      } catch {
        return false;
      }
    }
    const site = req.headers['sec-fetch-site'];
    return !site || site === 'same-origin' || site === 'none';
  }

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };

  const readJson = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      let s = '';
      req.on('data', (d) => {
        s += d;
        if (s.length > 100_000) reject(new Error('Too much data.'));
      });
      req.on('end', () => {
        try {
          resolve(s ? JSON.parse(s) : {});
        } catch {
          reject(new Error('Bad request.'));
        }
      });
      req.on('error', reject);
    });

  const jobView = (j: Job) => ({
    id: j.id,
    status: j.status,
    phase: j.phase,
    progress: j.status === 'done' ? 1 : j.phase === 'downloading' || j.phase === 'starting' ? overall(j.part, j.parts, j.done, j.total) : 0.96,
    done: j.done,
    total: j.total,
    speed: j.speed,
    eta: j.eta,
    part: j.part,
    parts: j.parts,
    connections: j.connections,
    error: j.error,
    files: j.status === 'done' ? files(j).map((name) => ({ name, size: statSync(join(j.dir, name)).size })) : [],
  });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname.replace(/\/+$/, '');
    const method = req.method ?? 'GET';
    if (!allowed(req)) return send(res, 403, { error: 'Not allowed.' });

    if (method === 'GET' && path === '/status') {
      return send(res, 200, { platform: process.platform, versions: await getVersions(url.searchParams.has('fresh')), install });
    }
    if (method === 'POST' && path === '/install') {
      if (!WIN) return send(res, 400, { error: 'Installing works on Windows. Elsewhere, install yt-dlp, aria2c and ffmpeg yourself.' });
      if (!install.running) {
        install = { running: true, progress: 0 };
        void doInstall();
      }
      return send(res, 202, { install });
    }
    if (method === 'POST' && path === '/update') {
      const r = await run(program('yt-dlp'), ['-U'], 180_000);
      await getVersions(true);
      return send(res, r.code === 0 ? 200 : 500, { output: (r.out + r.err).trim().split(/\r?\n/).slice(-3).join('\n'), versions });
    }
    if (method === 'POST' && path === '/info') {
      const body = await readJson(req);
      const link = String(body.url ?? '').trim();
      if (!isWebUrl(link)) return send(res, 400, { error: 'Paste a web address (starting with http:// or https://).' });
      const r = await run(program('yt-dlp'), ['-J', '--flat-playlist', '--no-warnings', ...jsRuntime, '--', link], 90_000);
      if (r.code !== 0) {
        const msg = r.err.split(/\r?\n/).filter((l) => /^ERROR:/.test(l)).pop()?.replace(/^ERROR:\s*/, '');
        return send(res, 422, { error: msg || "yt-dlp couldn't read that link." });
      }
      try {
        return send(res, 200, trimInfo(JSON.parse(r.out), link));
      } catch {
        return send(res, 500, { error: "yt-dlp's answer couldn't be read." });
      }
    }
    if (method === 'POST' && path === '/start') {
      sweep();
      const body = await readJson(req);
      const link = String(body.url ?? '').trim();
      if (!isWebUrl(link)) return send(res, 400, { error: 'Paste a web address (starting with http:// or https://).' });
      const item = body.item === undefined ? undefined : String(body.item);
      if (item !== undefined && !/^\d+$/.test(item)) return send(res, 400, { error: 'Bad playlist item.' });
      try {
        const job = startJob(link, { ...DEFAULT_OPTIONS, ...(body.options as Partial<DlOptions>) }, item);
        return send(res, 201, jobView(job));
      } catch (e) {
        return send(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
    }
    const m = path.match(/^\/job\/([0-9a-f-]{36})(?:\/(cancel|forget|file\/(\d+)))?$/);
    const job = m ? jobs.get(m[1]) : undefined;
    if (m && !job) return send(res, 404, { error: 'That download is gone (the site was restarted?).' });
    if (job && method === 'GET' && !m![2]) return send(res, 200, jobView(job));
    if (job && method === 'POST' && m![2] === 'cancel') {
      job.status = 'cancelled';
      kill(job.proc);
      return send(res, 200, jobView(job));
    }
    if (job && method === 'POST' && m![2] === 'forget') {
      forget(job);
      return send(res, 200, { ok: true });
    }
    if (job && method === 'GET' && m![3] !== undefined) {
      const name = files(job)[Number(m![3])];
      if (!name || job.status !== 'done') return send(res, 404, { error: 'No such file.' });
      const file = join(job.dir, name);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', String(statSync(file).size));
      res.setHeader('Cache-Control', 'no-store');
      createReadStream(file).pipe(res);
      return;
    }
    return send(res, 404, { error: 'Unknown request.' });
  }

  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    handle(req, res).catch((e) => (res.headersSent ? res.end() : send(res, 500, { error: e instanceof Error ? e.message : String(e) })));
    void next;
  };

  return {
    name: 'unktilz-downloader',
    configResolved(c) {
      root = c.root;
      sweep(true);
    },
    configureServer(server) {
      server.middlewares.use('/api/dl', middleware);
      // Closing the site (or Vite restarting) stops the downloads it started.
      server.httpServer?.once('close', stopAll);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/dl', middleware);
      server.httpServer?.once('close', stopAll);
    },
  };
}
