import { useRef, useState, type FocusEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { acceptsFile, fileTools, type Tool } from '../registry';
import { useQueue, type Job } from '../queue/store';
import { downloadJob } from '../queue/download';
import { useStaging } from '../queue/staging';
import { useLaunch } from './Transition';
import { CategoryIcon, DownloadIcon, LayersIcon } from './icons';

const pct = (j: Job) => `${Math.round((j.status === 'done' ? 1 : j.progress) * 100)}%`;

function JobItem({ job, open }: { job: Job; open: boolean }) {
  const remove = useQueue((s) => s.remove);
  const [err, setErr] = useState('');
  const status = job.status === 'error' ? 'failed' : job.status;
  const download = () => downloadJob(job).catch((e: Error) => setErr(e.message));
  const label = `${job.name}, ${job.file}, ${status}${job.status === 'running' ? ` ${pct(job)}` : ''}`;

  return (
    <li className="job">
      {job.status === 'done' ? (
        <button type="button" className="job-tile" data-status={job.status} title={`${job.name}: download`} aria-label={`Download ${job.file} result`} onClick={download} tabIndex={-1}>
          <CategoryIcon category={job.category} />
          <span className="track">
            <span className="bar" style={{ width: '100%', display: 'block' }} />
          </span>
        </button>
      ) : (
        <div className="job-tile" data-status={job.status} title={job.name} role="img" aria-label={label}>
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
              <Link to={`/t/${job.slug}`} className="job-name">
                {job.name}
              </Link>
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
            <span className="job-file" data-status={err || job.error ? 'error' : undefined} title={job.error ?? job.file}>
              {err || job.error || job.file}
            </span>
          </div>
          <div className="job-actions">
            {job.status === 'done' && (
              <button type="button" className="icon-btn" aria-label={`Download ${job.file} result`} onClick={download}>
                <DownloadIcon />
              </button>
            )}
            <button type="button" className="icon-btn" aria-label={`Remove ${job.file} from queue`} onClick={() => remove(job.id)}>
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
  const stage = useStaging((s) => s.add);
  const launch = useLaunch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [picking, setPicking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pickFor = useRef<Tool | null>(null);

  const open = hover || focus || pinned || picking;
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;

  const choose = (tool: Tool) => {
    pickFor.current = tool;
    const input = fileInput.current!;
    input.accept = tool.accepts?.join(',') ?? '';
    input.multiple = true;
    input.value = '';
    input.click();
  };

  const onFiles = (list: FileList | null) => {
    const tool = pickFor.current;
    if (!tool || !list?.length) return;
    // Files wait on the tool page so options can be set before Run.
    stage(tool.slug, [...list].filter((f) => acceptsFile(tool, f)));
    setPicking(false);
    setHover(false);
    if (pathname === `/t/${tool.slug}`) navigate(pathname, { replace: true });
    else launch(null, tool.slug);
  };

  const onBlur = (e: FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
  };

  return (
    <div className="rail-slot">
      <aside
        className={`rail${open ? ' open' : ''}${open && !pinned ? ' floating' : ''}`}
        aria-label="Process queue"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => {
          setHover(false);
          if (!pinned) setPicking(false);
        }}
        onFocus={(e) => {
          // Only keyboard focus opens the rail; a mouse click already counts as hover.
          if (e.target.matches(':focus-visible')) setFocus(true);
        }}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setPicking(false);
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
            aria-label={pinned ? 'Unpin queue panel' : 'Pin queue panel open'}
          >
            <LayersIcon />
          </button>
          {open && (
            <div className="rail-label">
              <span className="mono" style={{ fontSize: 13 }}>
                queue · {active} active
              </span>
              <button type="button" className="rail-ghost" onClick={clearDone}>
                clear done
              </button>
            </div>
          )}
        </div>

        <ul className="rail-jobs">
          {jobs.map((j) => (
            <JobItem key={j.id} job={j} open={open} />
          ))}
          {open && jobs.length === 0 && <li className="rail-empty">Queue is empty.</li>}
        </ul>

        {picking && open && (
          <div className="picker" role="group" aria-label="Pick a process">
            {fileTools.map((t) => (
              <button key={t.slug} type="button" onClick={() => choose(t)}>
                <span>{t.name}</span>
                <span className="badge">{t.accepts?.slice(0, 2).join(' ')}</span>
              </button>
            ))}
          </div>
        )}

        <div className="rail-foot">
          <button type="button" className="add-btn" onClick={() => setPicking(!picking)} aria-label="Add process" aria-expanded={picking}>
            +
          </button>
          {open && <span className="add-label">Add process</span>}
        </div>
        <input ref={fileInput} type="file" hidden onChange={(e) => onFiles(e.target.files)} aria-hidden="true" tabIndex={-1} />
      </aside>
    </div>
  );
}
