import { Fragment, useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { acceptsFile, defaultOpts, type Opts, type Tool } from '../registry';
import type { OptionSchema } from '../registry/types';
import { useQueue, type Job } from '../queue/store';
import { useStaging } from '../queue/staging';
import { getOutputs } from '../queue/blobs';
import { downloadJob, formatBytes } from '../queue/download';
import { Panel, Segmented, Toggle } from './ui';
import { DownloadIcon, UploadIcon } from './icons';
import { Help } from './Help';
import { ResultPreview } from './ResultPreview';
import { prefersReducedMotion } from '../lib/theme';
import { useLocation } from 'react-router-dom';

function OptionControl({ opt, value, set }: { opt: OptionSchema; value: Opts[string]; set: (v: Opts[string]) => void }) {
  const id = useId();
  let control;
  switch (opt.type) {
    case 'choice':
      control = <Segmented labelledBy={id} value={String(value)} options={opt.choices} onChange={set} />;
      break;
    case 'toggle':
      control = <Toggle labelledBy={id} checked={Boolean(value)} onChange={set} />;
      break;
    case 'range':
      control = (
        <div className="range">
          <input type="range" aria-labelledby={id} min={opt.min} max={opt.max} step={opt.step ?? 1} value={Number(value)} onChange={(e) => set(Number(e.target.value))} />
          <output>
            {String(value)}
            {opt.unit}
          </output>
        </div>
      );
      break;
    case 'text':
      control = (
        <input
          className={`input input-text${opt.mono ? ' mono' : ''}`}
          aria-labelledby={id}
          value={String(value)}
          placeholder={opt.placeholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => set(e.target.value)}
        />
      );
      break;
    case 'number':
      control = (
        <div className="range">
          <input
            className="input input-num"
            type="number"
            inputMode="numeric"
            aria-labelledby={id}
            min={opt.min}
            max={opt.max}
            value={Number(value)}
            onChange={(e) => set(e.target.value === '' ? 0 : Number(e.target.value))}
          />
          {opt.unit && <span className="mono muted">{opt.unit}</span>}
        </div>
      );
      break;
  }
  return (
    <div className="opt-row">
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        <span className="opt-label" id={id}>
          {opt.label}
          {opt.hint && <span className="hint">{opt.hint}</span>}
        </span>
        {opt.help && <Help label={opt.label} text={opt.help} />}
      </span>
      {control}
    </div>
  );
}

export function OptionsPanel({ tool, opts, setOpts }: { tool: Tool; opts: Opts; setOpts: (o: Opts) => void }) {
  const visible = (tool.options ?? []).filter((o) => !o.when || o.when(opts));
  if (!visible.length) return null;
  return (
    <Panel title="options">
      {visible.map((opt, i) => (
        <Fragment key={opt.key}>
          {i > 0 && <hr className="divider" />}
          <OptionControl opt={opt} value={opts[opt.key]} set={(v) => setOpts({ ...opts, [opt.key]: v })} />
        </Fragment>
      ))}
    </Panel>
  );
}

function Thumb({ job }: { job: Job }) {
  const [url, setUrl] = useState<string>();
  const isImage = job.outputs?.[0]?.type.startsWith('image/');
  useEffect(() => {
    if (!isImage) return;
    let u: string | undefined;
    let alive = true;
    getOutputs(job.id).then((o) => {
      if (!alive || !o?.[0]) return;
      u = URL.createObjectURL(o[0].blob);
      setUrl(u);
    });
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [job.id, isImage]);
  return url ? <img className="result-thumb" src={url} alt="" /> : null;
}

function ResultRow({ job }: { job: Job }) {
  const remove = useQueue((s) => s.remove);
  const [err, setErr] = useState('');
  const pct = Math.round((job.status === 'done' ? 1 : job.progress) * 100);
  const size = job.outputs?.reduce((n, o) => n + o.size, 0);
  const outName = job.outputs?.length === 1 ? job.outputs[0].name : job.outputs ? `${job.outputs.length} files` : job.file;
  return (
    <li className="result">
      {job.status === 'done' && <Thumb job={job} />}
      <div className="result-body">
        <div className="job-row">
          <span className="job-name" style={{ textDecoration: 'none' }} title={outName}>
            {job.status === 'done' ? outName : job.file}
          </span>
          <span className="job-status" data-status={job.status}>
            {job.status === 'error' ? 'failed' : job.status}
            {job.status === 'running' && ` ${pct}%`}
          </span>
        </div>
        {job.status === 'done' || job.status === 'error' ? (
          <span className="job-file" data-status={job.status === 'error' || err ? 'error' : undefined}>
            {err || job.error || `${size !== undefined ? formatBytes(size) : ''} · from ${job.file}`}
          </span>
        ) : (
          <div className="job-progress">
            <div className="bar" style={{ width: `${job.status === 'queued' ? 0 : pct}%` }} />
          </div>
        )}
      </div>
      {job.status === 'done' && (
        <button type="button" className="btn btn-sm" onClick={() => downloadJob(job).catch((e: Error) => setErr(e.message))}>
          <DownloadIcon size={16} />
          download
        </button>
      )}
      <button type="button" className="icon-btn" aria-label={`Remove ${job.file}`} onClick={() => remove(job.id)}>
        &times;
      </button>
    </li>
  );
}

function StagedList({ tool, files, set }: { tool: Tool; files: File[]; set: (f: File[]) => void }) {
  const move = (i: number, d: number) => {
    const next = [...files];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };
  return (
    <Panel title={`files · ${files.length}`} actions={<button type="button" className="rail-ghost" onClick={() => set([])}>clear</button>}>
      <ul className="results">
        {files.map((f, i) => (
          <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="result">
            {tool.batch && <span className="mono muted" style={{ fontSize: 12, minWidth: 18 }}>{i + 1}</span>}
            <div className="result-body">
              <span className="job-name" style={{ textDecoration: 'none' }} title={f.name}>
                {f.name}
              </span>
              <span className="job-file">{formatBytes(f.size)}</span>
            </div>
            {tool.batch && files.length > 1 && (
              <>
                <button type="button" className="icon-btn" aria-label={`Move ${f.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="icon-btn" aria-label={`Move ${f.name} down`} disabled={i === files.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
              </>
            )}
            <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => set(files.filter((_, j) => j !== i))}>
              &times;
            </button>
          </li>
        ))}
      </ul>
      {tool.batch && files.length > 1 && <p className="note">Files are combined in this order.</p>}
    </Panel>
  );
}

export function FileTool({ tool }: { tool: Tool }) {
  const add = useQueue((s) => s.add);
  const allJobs = useQueue((s) => s.jobs);
  const jobs = allJobs.filter((j) => j.slug === tool.slug);
  const staged = useStaging((s) => s.files[tool.slug]) ?? [];
  const stage = useStaging((s) => s.add);
  const setStaged = useStaging((s) => s.set);
  const clearStaged = useStaging((s) => s.clear);
  const location = useLocation();
  // An old address (e.g. /t/ogg-to-mp3) arrives here with the options it stood for.
  const [opts, setOpts] = useState<Opts>(() => ({ ...defaultOpts(tool), ...(location.state as { opts?: Opts } | null)?.opts }));
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const prevTool = useRef(tool);
  const resultsRef = useRef<HTMLDivElement>(null);

  // On swap, keep the choices both directions share (e.g. bitrate) and any picked files the other direction takes.
  useEffect(() => {
    setOpts((prev) => {
      const next = defaultOpts(tool);
      for (const k of Object.keys(next)) if (k in prev) next[k] = prev[k];
      return next;
    });
    setError('');
    const prev = prevTool.current;
    prevTool.current = tool;
    if (prev === tool) return;
    const { files, set, clear } = useStaging.getState();
    const carried = (files[prev.slug] ?? []).filter((f) => acceptsFile(tool, f));
    clear(prev.slug);
    if (carried.length) set(tool.slug, [...(files[tool.slug] ?? []), ...carried]);
  }, [tool]);

  const take = (list: FileList | File[] | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    const ok = files.filter((f) => acceptsFile(tool, f));
    const skipped = files.length - ok.length;
    setError(skipped ? `${skipped} file${skipped > 1 ? 's' : ''} skipped: ${tool.name} takes ${tool.accepts?.join(' ')}.` : '');
    if (ok.length) stage(tool.slug, ok);
  };

  const run = () => {
    if (!staged.length) return;
    add(tool, staged, opts);
    clearStaged(tool.slug);
    setError('');
    // Show the progress of what was just started. Smooth scrolling can be skipped by the browser
    // (reduced motion, background tab), so jump there if it hasn't arrived shortly after.
    setTimeout(() => {
      const el = resultsRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        if (r.top > window.innerHeight || r.bottom < 0) el.scrollIntoView({ block: 'nearest' });
      }, 600);
    }, 60);
  };

  const runLabel = !staged.length
    ? 'Run'
    : tool.batch
      ? `Run · ${staged.length} file${staged.length > 1 ? 's' : ''} → 1 result`
      : `Run · ${staged.length} file${staged.length > 1 ? 's' : ''}`;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files);
  };

  const exts = tool.accepts ?? [];
  const what = exts.length <= 2 ? `${exts.join(' / ')} files` : tool.category === 'image' ? 'images' : 'files';

  return (
    <>
      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={onDrop}
      >
        <span className="accent">
          <UploadIcon />
        </span>
        <div className="drop-title">{staged.length ? `Drop more ${what} here` : `Drop ${what} here`}</div>
        <button type="button" className={staged.length ? 'btn' : 'btn btn-primary'} onClick={() => input.current?.click()}>
          {staged.length ? 'Add files' : 'Choose files'}
        </button>
        <div className="drop-sub">
          {exts.join(' ')}
          {tool.batch ? ' · all files become one job' : ''}
        </div>
        {error && (
          <p className="drop-error" role="alert">
            {error}
          </p>
        )}
        <input
          ref={input}
          type="file"
          hidden
          multiple
          accept={exts.join(',')}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {staged.length > 0 && <StagedList tool={tool} files={staged} set={(f) => setStaged(tool.slug, f)} />}

      {tool.preview && staged.length > 0 && <ResultPreview tool={tool} files={staged} opts={opts} />}

      <OptionsPanel tool={tool} opts={opts} setOpts={setOpts} />

      {/* Once files are picked, Run stays on screen while you go through the options. */}
      <div className={`run-bar${staged.length ? ' sticky' : ''}`}>
        <button type="button" className="btn btn-primary" onClick={run} disabled={!staged.length}>
          {runLabel}
        </button>
        {!staged.length && <span className="note">Pick files first, then set the options.</span>}
      </div>

      {jobs.length > 0 && (
        <div ref={resultsRef} style={{ scrollMarginTop: 16 }}>
        <Panel title="your files">
          <ul className="results" aria-live="polite">
            {jobs.map((j) => (
              <ResultRow key={j.id} job={j} />
            ))}
          </ul>
        </Panel>
        </div>
      )}
    </>
  );
}
