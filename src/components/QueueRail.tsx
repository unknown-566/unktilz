import { useState, type FocusEvent } from 'react';
import { useQueue, type Job } from '../queue/store';
import { downloadJob } from '../queue/download';
import { CategoryIcon, DownloadIcon, LayersIcon } from './icons';
import { GoLink } from './Transition';

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
              <GoLink to={`/t/${job.slug}`} className="job-name">
                {job.name}
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
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);

  const open = hover || focus || pinned;
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;

  const onBlur = (e: FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
  };

  return (
    <div className="rail-slot">
      <aside
        className={`rail${open ? ' open' : ''}${open && !pinned ? ' floating' : ''}`}
        aria-label="Process queue"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
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

      </aside>
    </div>
  );
}
