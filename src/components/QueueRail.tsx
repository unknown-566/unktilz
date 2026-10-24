import { useEffect, useMemo, useRef, useState, type DragEvent, type FocusEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { statusText, useQueue, type Job } from '../queue/store';
import { downloadJob } from '../queue/download';
import { copyPicture, endOutputDrag, fitsAccept, forgetOutputs, isPictureJob, jobFiles, prepareOutputs, sendToTool, startOutputDrag } from '../queue/dragFiles';
import { CategoryIcon, CopyIcon, DownloadIcon, LayersIcon } from './icons';
import { GoLink, useLaunch } from './Transition';
import { getTool, tools } from '../registry';
import { t } from '../lib/i18n-core';

const pct = (j: Job) => `${Math.round((j.status === 'done' ? 1 : j.progress) * 100)}%`;

/** Tools that take every file this job made (by extension); the same kind of tool first. */
function toolsFor(job: Job) {
  const names = job.outputs?.map((o) => o.name) ?? [];
  if (!names.length) return [];
  const fit = tools.filter((tt) => tt.accepts?.length && names.every((n) => fitsAccept(n, tt.accepts!)));
  return [...fit.filter((tt) => tt.category === job.category), ...fit.filter((tt) => tt.category !== job.category)];
}

/** "Open in…": the tools that take this result; picking one opens it with the result already in. */
function OpenIn({ job, onError, onMenu }: { job: Job; onError: (msg: string) => void; onMenu: (open: boolean) => void }) {
  const [open, setOpenState] = useState(false);
  // The rail stays open while the menu is (it sits outside the rail).
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onMenu(v);
  };
  const [at, setAt] = useState({ left: 0, top: 0 });
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const launch = useLaunch();
  const list = useMemo(() => (open ? toolsFor(job) : []), [open, job]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onMenu(false), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => !box.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const go = async (e: MouseEvent, slug: string) => {
    setOpen(false);
    try {
      sendToTool(slug, await jobFiles(job.id));
      launch(e, slug);
    } catch (err) {
      onError((err as Error).message);
    }
  };
  return (
    <div className="open-in" ref={box}>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('Open {file} result in another tool', { file: job.file })}
        title={t('Open in…')}
        onClick={(e) => {
          // The menu floats over the page next to the button (the rail cuts off what sticks out).
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ left: r.right + 6, top: Math.max(8, Math.min(r.top, window.innerHeight - 340)) });
          setOpen(!open);
        }}
      >
        ↗
      </button>
      {open &&
        createPortal(
          <div ref={menu} className="open-in-menu" role="menu" aria-label={t('Open in…')} style={at} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
            <span className="open-in-head mono">{t('open in…')}</span>
            {list.length ? (
              list.map((tt) => (
                <button key={tt.slug} type="button" role="menuitem" onClick={(e) => void go(e, tt.slug)}>
                  <CategoryIcon category={tt.category} />
                  <span>{tt.name}</span>
                </button>
              ))
            ) : (
              <span className="open-in-none">{t('No other tool takes this file.')}</span>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

function JobItem({ job, open, onMenu }: { job: Job; open: boolean; onMenu: (open: boolean) => void }) {
  const remove = useQueue((s) => s.remove);
  const [err, setErr] = useState('');
  const status = statusText(job.status);
  // The tool's name in the language shown now (the job keeps the one it was made with).
  const name = getTool(job.slug)?.name ?? job.name;
  const download = () => downloadJob(job).catch((e: Error) => setErr(e.message));
  const label = `${name}, ${job.file}, ${status}${job.status === 'running' ? ` ${pct(job)}` : ''}`;
  const done = job.status === 'done';
  // A finished result can be dragged into another tool (or out of the browser).
  const drag = done
    ? { draggable: true, onDragStart: (e: DragEvent) => startOutputDrag(e, job), onDragEnd: endOutputDrag, onMouseEnter: () => void prepareOutputs(job) }
    : {};
  // A finished picture shows in its tile; dragging it is what other apps (Discord…) take as a file.
  const picture = isPictureJob(job);
  const [thumb, setThumb] = useState<string>();
  useEffect(() => {
    if (!picture) return;
    let alive = true;
    void prepareOutputs(job).then((u) => alive && setThumb(u?.[0]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picture, job.id]);
  // Apps like the Discord app take no drags from a web page, but they all take a pasted picture.
  const [copied, setCopied] = useState(false);
  const copy = () => {
    setErr('');
    copyPicture(job).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      },
      (e: Error) => setErr(e.message),
    );
  };

  return (
    <li className={`job${done ? ' can-drag' : ''}`} {...drag}>
      {done ? (
        <button
          type="button"
          className="job-tile"
          data-status={job.status}
          title={t('{name}: click to download, or drag it into another tool', { name })}
          aria-label={t('Download {file} result', { file: job.file })}
          onClick={download}
          tabIndex={-1}
        >
          {thumb ? <img className="job-thumb" src={thumb} alt={job.outputs?.[0]?.name ?? ''} /> : <CategoryIcon category={job.category} />}
          <span className="track">
            <span className="bar" style={{ width: '100%', display: 'block' }} />
          </span>
        </button>
      ) : (
        <div className="job-tile" data-status={job.status} title={name} role="img" aria-label={label}>
          <CategoryIcon category={job.category} />
          <span className="track">
            <span className="bar" style={{ width: job.status === 'queued' ? 0 : pct(job), display: 'block' }} />
          </span>
        </div>
      )}
      {open && (
        <>
          <div className="job-info">
            <div className="job-row">
              <GoLink to={`/t/${job.slug}`} className="job-name" draggable={false}>
                {name}
              </GoLink>
              <span className="job-status" data-status={job.status}>
                {status}
              </span>
            </div>
            <div className="job-row">
              <div className="job-progress">
                <div className="bar" style={{ width: job.status === 'queued' ? 0 : pct(job) }} />
              </div>
              <span className="job-pct">{job.status === 'queued' ? '0%' : pct(job)}</span>
            </div>
            <span className="job-file" data-status={err || job.error ? 'error' : copied ? 'ok' : undefined} title={job.error ?? job.file}>
              {err || job.error || (copied ? t('copied: paste it with Ctrl+V') : job.file)}
            </span>
          </div>
          <div className="job-actions">
            {picture && (
              <button type="button" className="icon-btn" aria-label={t('Copy the picture {file}', { file: job.file })} title={t('Copy the picture (then Ctrl+V in Discord or a chat)')} onClick={copy}>
                <CopyIcon />
              </button>
            )}
            {done && <OpenIn job={job} onError={setErr} onMenu={onMenu} />}
            {done && (
              <button type="button" className="icon-btn" aria-label={t('Download {file} result', { file: job.file })} onClick={download}>
                <DownloadIcon />
              </button>
            )}
            <button type="button" className="icon-btn" aria-label={t('Remove {file} from queue', { file: job.file })} onClick={() => remove(job.id)}>
              &times;
            </button>
          </div>
        </>
      )}
    </li>
  );
}

export function QueueRail() {
  const jobs = useQueue((s) => s.jobs);
  const clearDone = useQueue((s) => s.clearDone);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [menu, setMenu] = useState(false);

  const open = hover || focus || pinned || menu;
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;
  const ids = jobs.map((j) => j.id).join(',');
  // Drop the ready-made drag URLs of jobs that left the queue.
  useEffect(() => forgetOutputs(ids.split(',')), [ids]);

  const onBlur = (e: FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
  };

  return (
    <div className="rail-slot">
      <aside
        className={`rail${open ? ' open' : ''}${open && !pinned ? ' floating' : ''}`}
        aria-label={t('Process queue')}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        // A dragged result closes the floating panel, so it doesn't cover where the file goes.
        onDragStart={() => setHover(false)}
        onFocus={(e) => {
          // Only keyboard focus opens the rail; a mouse click already counts as hover.
          if (e.target.matches(':focus-visible')) setFocus(true);
        }}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setFocus(false);
            setPinned(false);
            (document.activeElement as HTMLElement | null)?.blur();
          }
        }}
      >
        <div className="rail-head">
          <button
            type="button"
            className="rail-btn"
            onClick={() => setPinned(!pinned)}
            aria-pressed={pinned}
            aria-expanded={open}
            aria-label={pinned ? t('Unpin queue panel') : t('Pin queue panel open')}
          >
            <LayersIcon />
          </button>
          {open && (
            <div className="rail-label">
              <span className="mono" style={{ fontSize: 13 }}>
                {t('queue · {n} active', { n: active })}
              </span>
              <button type="button" className="rail-ghost" onClick={clearDone}>
                {t('clear done')}
              </button>
            </div>
          )}
        </div>

        <ul className="rail-jobs">
          {jobs.map((j) => (
            <JobItem key={j.id} job={j} open={open} onMenu={setMenu} />
          ))}
          {open && jobs.length === 0 && <li className="rail-empty">{t('Queue is empty.')}</li>}
        </ul>
        {open && jobs.some((j) => j.status === 'done') && <p className="rail-tip">{t('Drag a finished file into another tool, or use ↗ to open it there. Pictures for Discord or a chat: copy them and paste with Ctrl+V.')}</p>}
      </aside>
    </div>
  );
}
