import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Panel, Segmented, TextField, Toggle } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { SavedPanel } from '../../../components/SavedPanel';
import { savedWhen, useAutosave, useSaved } from '../../../lib/saved';
import { useQueue } from '../../../queue/store';
import { formatBytes } from '../../../queue/download';
import { DEFAULT_OPTIONS, checkExtra, fitQuality, heightsOf, isWebUrl, type DlFormat, type DlInfo, type DlOptions, type Phase, type Quality } from './args';
import { NoServerError, download, getInfo, getStatus, install, liveDownloads, subscribeLive, updateYtdlp, type Status } from './api';

/** Playlists longer than this start with nothing picked. */
const BIG_PLAYLIST = 50;
/** Items shown in the list at most. */
const SHOW_ITEMS = 2000;

type HistoryItem = { url: string; title: string; size: number; mode: DlOptions['mode'] };

const PHASE: Record<Phase, string> = {
  starting: 'starting',
  downloading: 'downloading',
  merging: 'joining video and sound',
  converting: 'converting',
  embedding: 'adding cover / subtitles',
  finishing: 'cutting sponsors',
};

const time = (s?: number) => {
  if (!s && s !== 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

const formatLabel = (f: DlFormat) =>
  [
    f.id,
    f.height ? `${f.height}p${f.fps && f.fps > 30 ? f.fps : ''}` : 'audio',
    f.ext,
    f.vcodec && f.vcodec !== 'none' ? f.vcodec.split('.')[0] : '',
    f.acodec && f.acodec !== 'none' ? f.acodec.split('.')[0] : '',
    f.size ? formatBytes(f.size) : f.tbr ? `${Math.round(f.tbr)} kbps` : '',
  ]
    .filter(Boolean)
    .join(' · ');

/** Installing / updating yt-dlp, aria2c and ffmpeg. */
function Setup({ status, refresh }: { status: Status; refresh: () => void }) {
  const v = status.versions;
  const missing = !v.ytdlp || !v.aria2c || !v.ffmpeg;
  const inst = status.install;
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // While installing, follow its progress.
  useEffect(() => {
    if (!inst.running) return;
    const t = setInterval(refresh, 700);
    return () => clearInterval(t);
  }, [inst.running, refresh]);

  if (missing || inst.running || inst.error)
    return (
      <Panel title="programs">
        <p className="note">
          The downloader uses three free programs on your computer: <b>yt-dlp</b> (finds the video on the page), <b>aria2c</b> (downloads it in 16 parts at once) and{' '}
          <b>ffmpeg</b> (joins video and sound). They come from their official GitHub pages (about 110 MB) into the site's <span className="mono">bin</span> folder.
        </p>
        {inst.running ? (
          <>
            <p className="note mono">
              Installing {inst.step}… {Math.round(inst.progress * 100)} %
            </p>
            <div className="dl-bar">
              <span style={{ width: `${Math.round(inst.progress * 100)}%` }} />
            </div>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={status.platform !== 'win32'}
            onClick={() => {
              void install().then(refresh, (e: Error) => setMsg(e.message));
            }}
          >
            Install yt-dlp, aria2c and ffmpeg
          </button>
        )}
        {status.platform !== 'win32' && <p className="note">Installing works on Windows. Elsewhere install yt-dlp, aria2c and ffmpeg yourself (they're used from PATH).</p>}
        {(inst.error || msg) && <p className="error-text">{inst.error || msg}</p>}
      </Panel>
    );

  return (
    <p className="note mono dl-versions">
      yt-dlp {v.ytdlp} · aria2c {v.aria2c} · ffmpeg {v.ffmpeg?.slice(0, 14)}{' '}
      <button
        type="button"
        className="link-btn"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMsg('');
          updateYtdlp()
            .then(
              (r) => setMsg(r.output),
              (e: Error) => setMsg(e.message),
            )
            .finally(() => {
              setBusy(false);
              refresh();
            });
        }}
      >
        {busy ? 'updating…' : 'update yt-dlp'}
      </button>
      <Help label="update yt-dlp" text="Sites like YouTube change often and old yt-dlp versions stop working. If a download fails, update it first." />
      {msg && <span className="dl-update-msg">{msg}</span>}
    </p>
  );
}

/**
 * The subtitles a video has, to pick: the ones people made, the site's automatic one in the spoken
 * language, and (in a list) its machine translations. Picked ones go into the video file.
 */
function SubtitlePicker({ info, value, onChange }: { info: DlInfo; value: string; onChange: (subs: string, autoSubs: boolean) => void }) {
  const picked = value.split(/[\s,]+/).filter(Boolean);
  const made = new Set(info.subtitles.map((s) => s.code));
  const spoken = info.autoCaptions.filter((s) => s.code.endsWith('-orig'));
  const others = info.autoCaptions.filter((s) => !s.code.endsWith('-orig') && !made.has(s.code));
  const known = new Set([...made, ...info.autoCaptions.map((s) => s.code)]);
  // Automatic ones are only fetched when asked for.
  const update = (codes: string[]) => onChange(codes.join(','), codes.some((c) => !made.has(c)));
  const toggle = (code: string) => update(picked.includes(code) ? picked.filter((c) => c !== code) : [...picked, code]);
  const chip = (code: string, label: string, title: string) => (
    <button key={code} type="button" className="chip dl-sub" aria-pressed={picked.includes(code)} onClick={() => toggle(code)} title={title}>
      {label}
    </button>
  );
  const pickedOthers = others.filter((s) => picked.includes(s.code));
  return (
    <div className="dl-subs">
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <span className="opt-label">Subtitles</span>
        <Help label="subtitles" text="Pick the languages you want; below, choose whether they go into the video or come as .srt / .vtt files. Automatic ones are made by the site from the speech (or machine-translated), so they can have mistakes." />
      </span>
      {!info.subtitles.length && !info.autoCaptions.length ? (
        <p className="note">This video has no subtitles.</p>
      ) : (
        <>
          {info.subtitles.length + spoken.length + pickedOthers.length > 0 && (
            <div className="chips-row" role="group" aria-label="Subtitles this video has">
              {info.subtitles.map((s) => chip(s.code, s.name, `${s.code} · made by people`))}
              {spoken.map((s) => chip(s.code, `${s.name.replace(/\s*\(original\)$/i, '')} · automatic`, `${s.code} · made automatically from the speech`))}
              {pickedOthers.map((s) => chip(s.code, `${s.name} · translated`, `${s.code} · machine-translated`))}
            </div>
          )}
          {others.length > 0 && (
            <select className="select" value="" onChange={(e) => e.target.value && toggle(e.target.value)} aria-label="Add automatic subtitles in another language">
              <option value="">
                {spoken.length ? `+ automatic, translated to… (${others.length} languages)` : `+ automatic subtitles… (${others.length} languages)`}
              </option>
              {others.map((s) => (
                <option key={s.code} value={s.code}>
                  {picked.includes(s.code) ? '✓ ' : ''}
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          )}
        </>
      )}
      {picked.some((c) => !known.has(c)) && (
        <div className="chips-row" role="group" aria-label="Picked languages this video doesn't have">
          {picked.filter((c) => !known.has(c)).map((c) => chip(c, `${c} · not on this video`, 'Click to remove'))}
        </div>
      )}
    </div>
  );
}

export default function Downloader() {
  const [status, setStatus] = useState<Status | null>(null);
  const [noServer, setNoServer] = useState('');
  const refresh = useMemo(
    () => () =>
      void getStatus().then(
        (s) => {
          setStatus(s);
          setNoServer('');
        },
        (e: Error) => setNoServer(e instanceof NoServerError ? e.message : e.message),
      ),
    [],
  );
  useEffect(refresh, [refresh]);

  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<DlInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [o, setO] = useState<DlOptions>(DEFAULT_OPTIONS);
  useAutosave<DlOptions>('downloader', { ...o, format: '' }, (d) => setO({ ...DEFAULT_OPTIONS, ...d, format: '' }));
  const set = (patch: Partial<DlOptions>) => setO((p) => ({ ...p, ...patch }));
  const history = useSaved<HistoryItem>('downloader-history');
  const live = useSyncExternalStore(subscribeLive, liveDownloads);

  const ready = !!status && !!status.versions.ytdlp && !!status.versions.ffmpeg && !status.install.running;
  const extra = checkExtra(o.extra);
  // A single video offers only the heights it really has; the saved choice becomes the nearest one it has.
  const heights = info && !info.playlist ? heightsOf(info.formats) : [];
  const quality = fitQuality(o.quality, heights);
  const qualities: Quality[] = heights.length ? ['best', ...heights.map((h) => `${h}` as Quality)] : ['best', '2160', '1440', '1080', '720', '480', '360'];

  const lookUp = async (link = url) => {
    const u = link.trim();
    if (!isWebUrl(u)) {
      setError('Paste a web address (starting with http:// or https://).');
      return;
    }
    setUrl(u);
    setLoading(true);
    setError('');
    setInfo(null);
    set({ format: '' });
    try {
      const i = await getInfo(u);
      setInfo(i);
      // A short playlist is picked whole; from a big one (a whole channel) you pick, so nothing huge starts by mistake.
      setPicked(new Set(i.entries.length <= BIG_PLAYLIST ? i.entries.map((_, n) => n) : []));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const paste = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) {
        setUrl(t);
        if (isWebUrl(t)) void lookUp(t);
      }
    } catch {
      setError('The browser didn’t allow reading the clipboard: paste with Ctrl+V instead.');
    }
  };

  /** Each download (or each picked playlist item) becomes its own job in the queue. */
  const start = () => {
    if (!info || 'error' in extra) return;
    const opts = { ...o, quality };
    const items = info.playlist ? info.entries.map((e, n) => ({ e, n })).filter(({ n }) => picked.has(n)) : [null];
    for (const it of items) {
      const title = it ? it.e.title : info.title;
      useQueue.getState().addTask({ slug: 'downloader', name: 'Downloader', category: 'video', file: title }, async (signal, onProgress) => {
        const files = await download(info.url, opts, title, it ? it.n + 1 : undefined, signal, onProgress);
        const size = files.reduce((n, f) => n + f.blob.size, 0);
        // Remembered in the history (the last 50).
        const list = history.items;
        void history.save(title, { url: it?.e.url || info.url, title, size, mode: opts.mode });
        for (const old of list.slice(49)) void history.remove(old.id);
        return files;
      });
    }
  };

  if (noServer)
    return (
      <Panel title="downloader">
        <p className="note">{noServer}</p>
      </Panel>
    );
  if (!status) return <p className="note">Checking the downloader…</p>;

  const videoFormats = info?.formats.filter((f) => f.vcodec && f.vcodec !== 'none') ?? [];
  const audioFormats = info?.formats.filter((f) => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none') ?? [];
  const [fv, fa] = o.format.includes('+') ? o.format.split('+') : o.mode === 'audio' ? ['', o.format] : [o.format, ''];
  const pickFormat = (v: string, a: string) => set({ format: v && a ? `${v}+${a}` : v || a });
  const count = info?.playlist ? picked.size : 1;

  return (
    <div className="dl">
      <Setup status={status} refresh={refresh} />

      <Panel title="link">
        <form
          className="dl-link"
          onSubmit={(e) => {
            e.preventDefault();
            void lookUp();
          }}
        >
          <TextField label="Video, song or playlist address" value={url} onChange={setUrl} placeholder="https://www.youtube.com/watch?v=…" mono autoFocus />
          <button type="button" className="btn" onClick={paste} disabled={!ready}>
            Paste
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ready || loading || !url.trim()}>
            {loading ? 'Reading…' : 'Get info'}
          </button>
        </form>
        <p className="note">
          Works with YouTube, SoundCloud, Twitch, X, Reddit, TikTok, Bandcamp and{' '}
          <a href="https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md" target="_blank" rel="noopener noreferrer">
            1800+ other sites
          </a>
          . Not Spotify or Netflix (their music and films are locked with DRM). Download only what you may: your own videos, free-licence ones, or for personal use where
          that's allowed.
        </p>
        {error && <p className="error-text">{error}</p>}
      </Panel>

      {info && (
        <Panel title={info.playlist ? `playlist · ${info.entries.length} items` : 'video'}>
          <div className="dl-card">
            {info.thumbnail && <img className="dl-thumb" src={info.thumbnail} alt="" referrerPolicy="no-referrer" />}
            <div className="dl-card-text">
              <b>{info.title}</b>
              <span className="note mono">{[info.uploader, info.duration ? time(info.duration) : '', info.site].filter(Boolean).join(' · ')}</span>
              {info.license && <span className="note">{info.license}</span>}
            </div>
          </div>
          {info.playlist && (
            <>
              <div className="inline">
                <button type="button" className="btn btn-sm" onClick={() => setPicked(new Set(info.entries.map((_, n) => n)))}>
                  all
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setPicked(new Set())}>
                  none
                </button>
                <span className="note">{picked.size} picked</span>
              </div>
              <ul className="dl-items">
                {info.entries.slice(0, SHOW_ITEMS).map((e, n) => (
                  <li key={`${e.id}-${n}`}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={picked.has(n)}
                        onChange={(ev) =>
                          setPicked((p) => {
                            const next = new Set(p);
                            if (ev.target.checked) next.add(n);
                            else next.delete(n);
                            return next;
                          })
                        }
                      />
                      <span>
                        {n + 1}. {e.title}
                      </span>
                      {e.duration ? <span className="note mono">{time(e.duration)}</span> : null}
                    </label>
                  </li>
                ))}
              </ul>
              {info.entries.length > SHOW_ITEMS && <p className="note">Showing the first {SHOW_ITEMS}; “all” picks all {info.entries.length}.</p>}
              {info.entries.length > BIG_PLAYLIST && picked.size === 0 && <p className="note">A long list: pick what you want (or “all”).</p>}
            </>
          )}
        </Panel>
      )}

      <Panel title="what to download">
        <div className="opt-row">
          <span className="opt-label" id="dl-mode">
            Get
          </span>
          <Segmented
            labelledBy="dl-mode"
            value={o.mode}
            onChange={(mode) => set({ mode, format: '' })}
            options={[
              { value: 'video', label: 'video' },
              { value: 'audio', label: 'audio only' },
            ]}
          />
        </div>
        {o.mode === 'video' ? (
          <>
            <div className="opt-row">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className="opt-label" id="dl-q">
                  Quality
                </span>
                <Help label="quality" text="The best the site has up to this height. If it doesn't have that much, you get the best there is." />
              </span>
              <Segmented
                labelledBy="dl-q"
                value={quality}
                onChange={(q) => set({ quality: q })}
                options={qualities.map((q) => ({ value: q, label: q === 'best' ? 'best' : `${q}p` }))}
              />
            </div>
            <div className="opt-row">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className="opt-label" id="dl-c">
                  Format
                </span>
                <Help
                  label="format"
                  text="MP4 plays everywhere (phones, Discord, Windows); on YouTube that means up to 1080p. MKV and WebM keep the best quality (4K, HDR) as the site has it, but don't play everywhere."
                />
              </span>
              <Segmented
                labelledBy="dl-c"
                value={o.container}
                onChange={(container) => set({ container })}
                options={[
                  { value: 'mp4', label: 'mp4' },
                  { value: 'mkv', label: 'mkv' },
                  { value: 'webm', label: 'webm' },
                ]}
              />
            </div>
            {info && !info.playlist ? (
              <SubtitlePicker info={info} value={o.subs} onChange={(subs, autoSubs) => set({ subs, autoSubs })} />
            ) : (
              <>
                <div className="fields">
                  <TextField
                    label="Subtitles"
                    value={o.subs}
                    onChange={(subs) => set({ subs })}
                    placeholder="e.g. en,cs (empty = none)"
                    mono
                    help="Language codes, separated by commas. Press “Get info” on a video to pick from the subtitles it has."
                  />
                </div>
                {o.subs.trim() && (
                  <div className="opt-row">
                    <span className="opt-label" id="dl-auto">
                      Also automatic subtitles
                    </span>
                    <Toggle labelledBy="dl-auto" checked={o.autoSubs} onChange={(autoSubs) => set({ autoSubs })} />
                  </div>
                )}
              </>
            )}
            {o.subs.trim() && (
              <>
                <div className="opt-row">
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="opt-label" id="dl-subs-mode">
                      Subtitles go
                    </span>
                    <Help label="subtitles go" text="In the video: the player can turn them on. As files: separate .srt / .vtt files next to the video (for editors, or players that want a file). Both: in the video and as files." />
                  </span>
                  <Segmented
                    labelledBy="dl-subs-mode"
                    value={o.subsMode}
                    onChange={(subsMode) => set({ subsMode })}
                    options={[
                      { value: 'embed', label: 'in the video' },
                      { value: 'file', label: 'as files' },
                      { value: 'both', label: 'both' },
                    ]}
                  />
                </div>
                {o.subsMode !== 'embed' && (
                  <div className="opt-row">
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <span className="opt-label" id="dl-subs-fmt">
                        Subtitle files
                      </span>
                      <Help label="subtitle files" text="SRT works almost everywhere (players, video editors). VTT is the web's format and keeps a little more styling." />
                    </span>
                    <Segmented
                      labelledBy="dl-subs-fmt"
                      value={o.subsFormat}
                      onChange={(subsFormat) => set({ subsFormat })}
                      options={[
                        { value: 'srt', label: '.srt' },
                        { value: 'vtt', label: '.vtt' },
                      ]}
                    />
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div className="opt-row">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className="opt-label" id="dl-a">
                  Format
                </span>
                <Help label="audio format" text="MP3 plays everywhere. M4A and Opus are smaller for the same quality. Original keeps the site's own file without converting." />
              </span>
              <Segmented
                labelledBy="dl-a"
                value={o.audioFormat}
                onChange={(audioFormat) => set({ audioFormat })}
                options={[
                  { value: 'mp3', label: 'mp3' },
                  { value: 'm4a', label: 'm4a' },
                  { value: 'opus', label: 'opus' },
                  { value: 'best', label: 'original' },
                ]}
              />
            </div>
            <div className="opt-row">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className="opt-label" id="dl-meta">
                  Cover and tags
                </span>
                <Help label="cover and tags" text="Puts the thumbnail in as cover art, and the title, artist and album into the file, so music players show them." />
              </span>
              <Toggle labelledBy="dl-meta" checked={o.embedMeta} onChange={(embedMeta) => set({ embedMeta })} />
            </div>
          </>
        )}
        <div className="opt-row">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="opt-label" id="dl-sb">
              Cut out sponsors
            </span>
            <Help label="SponsorBlock" text="Removes the sponsored parts of YouTube videos, using SponsorBlock's community-marked segments." />
          </span>
          <Toggle labelledBy="dl-sb" checked={o.sponsorBlock} onChange={(sponsorBlock) => set({ sponsorBlock })} />
        </div>

        <details className="dl-advanced">
          <summary>Advanced: exact format, extra yt-dlp options</summary>
          {info && !info.playlist && (
            <div className="fields">
              {o.mode === 'video' && (
                <div className="field grow">
                  <label htmlFor="dl-fv">Video stream</label>
                  <select id="dl-fv" className="select" value={fv} onChange={(e) => pickFormat(e.target.value, fa)}>
                    <option value="">from the settings above</option>
                    {videoFormats.map((f) => (
                      <option key={f.id} value={f.id}>
                        {formatLabel(f)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field grow">
                <label htmlFor="dl-fa">Sound stream</label>
                <select id="dl-fa" className="select" value={fa} onChange={(e) => pickFormat(o.mode === 'video' ? fv : '', e.target.value)}>
                  <option value="">{o.mode === 'video' && fv ? 'none (only if the video stream has sound)' : 'from the settings above'}</option>
                  {audioFormats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {formatLabel(f)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="fields">
            <TextField
              label="Extra yt-dlp options"
              value={o.extra}
              onChange={(v) => set({ extra: v })}
              placeholder="e.g. --cookies-from-browser firefox --limit-rate 5M"
              mono
              help="Anything from yt-dlp's option list, added to the command. Options that would run other programs or write outside the download (like --exec or -o) aren't allowed."
            />
          </div>
          {'error' in extra && <p className="error-text">{extra.error}</p>}
          <SavedPanel<DlOptions>
            slug="downloader-templates"
            title="my templates"
            help="Saves these download settings (and extra options) under a name, like Seal's command templates."
            suggestName={() => (o.mode === 'audio' ? `Audio ${o.audioFormat}` : `Video ${o.quality} ${o.container}`)}
            getData={() => ({ ...o, format: '' })}
            onLoad={(d) => setO({ ...DEFAULT_OPTIONS, ...d, format: '' })}
            describe={(i) =>
              [i.data.mode === 'audio' ? `audio ${i.data.audioFormat}` : `video ${i.data.quality} ${i.data.container}`, i.data.extra].filter(Boolean).join(' · ')
            }
          />
        </details>

        <button type="button" className="btn btn-primary" disabled={!info || !ready || 'error' in extra || count === 0} onClick={start}>
          {info?.playlist ? `Download ${count} item${count === 1 ? '' : 's'}` : 'Download'}
        </button>
        {!info && <p className="note">Get the info of a link first.</p>}
      </Panel>

      {live.length > 0 && (
        <Panel title="downloading">
          <ul className="dl-live">
            {live.map((j) => (
              <li key={j.id}>
                <b>{j.title}</b>
                <div className="dl-bar">
                  <span style={{ width: `${Math.round(j.progress * 100)}%` }} />
                </div>
                <span className="note mono">
                  {Math.round(j.progress * 100)} % · {PHASE[j.phase]}
                  {j.phase === 'downloading' && j.parts > 1 ? ` ${j.part === 1 ? 'video' : 'sound'}` : ''}
                  {j.phase === 'downloading' && j.speed ? ` · ${formatBytes(j.speed)}/s` : ''}
                  {j.phase === 'downloading' && j.connections ? ` · ${j.connections} connections` : ''}
                  {j.phase === 'downloading' && j.eta ? ` · ${time(j.eta)} left` : ''}
                </span>
                {j.fallback && <span className="note">aria2c couldn't download this one, so yt-dlp does it by itself (one connection, slower).</span>}
              </li>
            ))}
          </ul>
          <p className="note">The finished files wait in the queue on the left. Stop a download with its ×.</p>
        </Panel>
      )}

      <Panel title="history">
        {history.items.length === 0 ? (
          <p className="note">Nothing downloaded yet.</p>
        ) : (
          <ul className="dl-history">
            {history.items.map((h) => (
              <li key={h.id}>
                <span className="dl-history-title">{h.data.title}</span>
                <span className="note mono">
                  {h.data.mode} · {formatBytes(h.data.size)} · {savedWhen(h.savedAt)}
                </span>
                <button type="button" className="btn btn-sm" disabled={!ready} onClick={() => void lookUp(h.data.url)}>
                  again
                </button>
                <button type="button" className="btn btn-sm" aria-label={`Remove ${h.data.title} from the history`} onClick={() => void history.remove(h.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
