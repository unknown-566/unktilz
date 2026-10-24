import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Panel, Segmented, TextField, Toggle } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { SavedPanel } from '../../../components/SavedPanel';
import { savedWhen, useAutosave, useSaved } from '../../../lib/saved';
import { useQueue } from '../../../queue/store';
import { formatBytes } from '../../../queue/download';
import { AUDIO_FORMATS, BITRATES, CONTAINERS, DEFAULT_OPTIONS, canEmbedSubs, checkExtra, isLossless, fitQuality, heightsOf, isWebUrl, type DlFormat, type DlInfo, type DlOptions, type Phase, type Quality } from './args';
import { HISTORY, runDownload, type DlTask, type HistoryItem } from './task';
import { NoServerError, getInfo, getStatus, install, liveDownloads, subscribeLive, serverText, updateYtdlp, type Status } from './api';
import { plural, t, tn, tx } from '../../../lib/i18n';

/** Playlists longer than this start with nothing picked. */
const BIG_PLAYLIST = 50;
/** Items shown in the list at most. */
const SHOW_ITEMS = 2000;


const PHASE: Record<Phase, string> = {
  starting: tx('starting'),
  downloading: tx('downloading'),
  merging: tx('joining video and sound'),
  converting: tx('converting'),
  embedding: tx('adding cover / subtitles'),
  finishing: tx('cutting sponsors'),
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
    const timer = setInterval(refresh, 700);
    return () => clearInterval(timer);
  }, [inst.running, refresh]);

  if (missing || inst.running || inst.error)
    return (
      <Panel title={t('programs')}>
        <p className="note">
          {tn('The downloader uses three free programs on your computer: {ytdlp} (finds the video on the page), {aria} (downloads it in 16 parts at once) and {ffmpeg} (joins video and sound). They come from their official GitHub pages (about 110 MB) into the site’s {bin} folder.', {
            ytdlp: <b>yt-dlp</b>,
            aria: <b>aria2c</b>,
            ffmpeg: <b>ffmpeg</b>,
            bin: <span className="mono">bin</span>,
          })}
        </p>
        {inst.running ? (
          <>
            <p className="note mono">
              {t('Installing {step}… {n} %', { step: inst.step ?? '', n: Math.round(inst.progress * 100) })}
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
            {t('Install yt-dlp, aria2c and ffmpeg')}
          </button>
        )}
        {status.platform !== 'win32' && <p className="note">{t('Installing works on Windows. Elsewhere install yt-dlp, aria2c and ffmpeg yourself (they\'re used from PATH).')}</p>}
        {(inst.error || msg) && <p className="error-text">{inst.error ? serverText(inst.error) : msg}</p>}
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
        {busy ? t('updating…') : t('update yt-dlp')}
      </button>
      <Help label={t('update yt-dlp')} text={t('Sites like YouTube change often and old yt-dlp versions stop working. If a download fails, update it first.')} />
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
        <span className="opt-label">{t('Subtitles')}</span>
        <Help label={t('subtitles')} text={t('Pick the languages you want; below, choose whether they go into the video or come as .srt / .vtt files. Automatic ones are made by the site from the speech (or machine-translated), so they can have mistakes.')} />
      </span>
      {!info.subtitles.length && !info.autoCaptions.length ? (
        <p className="note">{t('This video has no subtitles.')}</p>
      ) : (
        <>
          {info.subtitles.length + spoken.length + pickedOthers.length > 0 && (
            <div className="chips-row" role="group" aria-label={t('Subtitles this video has')}>
              {info.subtitles.map((s) => chip(s.code, s.name, t('{code} · made by people', { code: s.code })))}
              {spoken.map((s) => chip(s.code, t('{name} · automatic', { name: s.name.replace(/\s*\(original\)$/i, '') }), t('{code} · made automatically from the speech', { code: s.code })))}
              {pickedOthers.map((s) => chip(s.code, t('{name} · translated', { name: s.name }), t('{code} · machine-translated', { code: s.code })))}
            </div>
          )}
          {others.length > 0 && (
            <select className="select" value="" onChange={(e) => e.target.value && toggle(e.target.value)} aria-label={t('Add automatic subtitles in another language')}>
              <option value="">
                {spoken.length ? t('+ automatic, translated to… ({length} languages)', { length: others.length }) : t('+ automatic subtitles… ({length} languages)', { length: others.length })}
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
        <div className="chips-row" role="group" aria-label={t('Picked languages this video doesn\'t have')}>
          {picked.filter((c) => !known.has(c)).map((c) => chip(c, t('{code} · not on this video', { code: c }), t('Click to remove')))}
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
  const history = useSaved<HistoryItem>(HISTORY);
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
      setError(t('Paste a web address (starting with http:// or https://).'));
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
      const tt = (await navigator.clipboard.readText()).trim();
      if (tt) {
        setUrl(tt);
        if (isWebUrl(tt)) void lookUp(tt);
      }
    } catch {
      setError(t('The browser didn’t allow reading the clipboard: paste with Ctrl+V instead.'));
    }
  };

  /** Each download (or each picked playlist item) becomes its own job in the queue. */
  const start = () => {
    if (!info || 'error' in extra) return;
    const opts = { ...o, quality };
    const items = info.playlist ? info.entries.map((e, n) => ({ e, n })).filter(({ n }) => picked.has(n)) : [null];
    for (const it of items) {
      const title = it ? it.e.title : info.title;
      // Saved with the job, so the download carries on after a reload (see src/queue/resume.ts).
      const data: DlTask = { url: info.url, options: opts, title, item: it ? it.n + 1 : undefined, link: it?.e.url || info.url };
      useQueue
        .getState()
        .addTask(
          { slug: 'downloader', name: 'Downloader' /* i18n-ignore: the queue shows the tool's name */, category: 'video', file: title },
          (signal, onProgress, keep) => runDownload(data, signal, onProgress, keep),
          undefined,
          { kind: 'downloader', data },
        );
    }
  };

  if (noServer)
    return (
      <Panel title={t('downloader')}>
        <p className="note">{noServer}</p>
      </Panel>
    );
  if (!status) return <p className="note">{t('Checking the downloader…')}</p>;

  const videoFormats = info?.formats.filter((f) => f.vcodec && f.vcodec !== 'none') ?? [];
  const audioFormats = info?.formats.filter((f) => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none') ?? [];
  const [fv, fa] = o.format.includes('+') ? o.format.split('+') : o.mode === 'audio' ? ['', o.format] : [o.format, ''];
  const pickFormat = (v: string, a: string) => set({ format: v && a ? `${v}+${a}` : v || a });
  const count = info?.playlist ? picked.size : 1;

  return (
    <div className="dl">
      <Setup status={status} refresh={refresh} />

      <Panel title={t('link')}>
        <form
          className="dl-link"
          onSubmit={(e) => {
            e.preventDefault();
            void lookUp();
          }}
        >
          <TextField label={t('Video, song or playlist address')} value={url} onChange={setUrl} placeholder="https://www.youtube.com/watch?v=…" mono autoFocus />
          <button type="button" className="btn" onClick={paste} disabled={!ready}>
            {t('Paste')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ready || loading || !url.trim()}>
            {loading ? t('Reading…') : t('Get info')}
          </button>
        </form>
        <p className="note">
          {tn('Works with YouTube, SoundCloud, Twitch, X, Reddit, TikTok, Bandcamp and {sites}. Not Spotify or Netflix (their music and films are locked with DRM). Download only what you may: your own videos, free-licence ones, or for personal use where that’s allowed.', {
            sites: (
              <a href="https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md" target="_blank" rel="noopener noreferrer">
                {t('1800+ other sites')}
              </a>
            ),
          })}
        </p>
        {error && <p className="error-text">{error}</p>}
      </Panel>

      {info && (
        <Panel title={info.playlist ? t('playlist · {length} items', { length: info.entries.length }) : t('video')}>
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
                  {t('all')}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setPicked(new Set())}>
                  {t('pick|none')}
                </button>
                <span className="note">{t('{n} picked', { n: picked.size })}</span>
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
              {info.entries.length > SHOW_ITEMS && <p className="note">{t('Showing the first {shown}; “all” picks all {count}.', { shown: SHOW_ITEMS, count: info.entries.length })}</p>}
              {info.entries.length > BIG_PLAYLIST && picked.size === 0 && <p className="note">{t('A long list: pick what you want (or “all”).')}</p>}
            </>
          )}
        </Panel>
      )}

      <Panel title={t('what to download')}>
        <div className="opt-row">
          <span className="opt-label" id="dl-mode">
            {t('Get')}
          </span>
          <Segmented
            labelledBy="dl-mode"
            value={o.mode}
            onChange={(mode) => set({ mode, format: '' })}
            options={[
              { value: 'video', label: t('video') },
              { value: 'audio', label: t('audio only') },
            ]}
          />
        </div>
        {o.mode === 'video' ? (
          <>
            <div className="opt-row">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className="opt-label" id="dl-q">
                  {t('Quality')}
                </span>
                <Help label={t('quality')} text={t('The best the site has up to this height. If it doesn\'t have that much, you get the best there is.')} />
              </span>
              <Segmented
                labelledBy="dl-q"
                value={quality}
                onChange={(q) => set({ quality: q })}
                options={qualities.map((q) => ({ value: q, label: q === 'best' ? t('best') : `${q}p` }))}
              />
            </div>
            <div className="opt-row">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className="opt-label" id="dl-c">
                  {t('Format')}
                </span>
                <Help
                  label={t('format')}
                  text={t('MP4 plays everywhere (phones, Discord, Windows); on YouTube that means up to 1080p. MKV and WebM keep the best quality (4K, HDR) as the site has it, but don\'t play everywhere. MOV is for Apple devices and video editors (Premiere, Final Cut), AVI for old players and TVs; neither can hold subtitles, so they come as files.')}
                />
              </span>
              <Segmented
                labelledBy="dl-c"
                value={o.container}
                onChange={(container) => set({ container })}
                options={CONTAINERS.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div className="opt-row">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className="opt-label" id="dl-nosound">
                  {t('Without sound')}
                </span>
                <Help label={t('without sound')} text={t('Only the picture, e.g. as background footage for editing. Sites that only have picture and sound together keep the sound.')} />
              </span>
              <Toggle labelledBy="dl-nosound" checked={o.noSound} onChange={(noSound) => set({ noSound })} />
            </div>
            {info && !info.playlist ? (
              <SubtitlePicker info={info} value={o.subs} onChange={(subs, autoSubs) => set({ subs, autoSubs })} />
            ) : (
              <>
                <div className="fields">
                  <TextField
                    label={t('Subtitles')}
                    value={o.subs}
                    onChange={(subs) => set({ subs })}
                    placeholder={t('e.g. en,cs (empty = none)')}
                    mono
                    help={t('Language codes, separated by commas. Press “Get info” on a video to pick from the subtitles it has.')}
                  />
                </div>
                {o.subs.trim() && (
                  <div className="opt-row">
                    <span className="opt-label" id="dl-auto">
                      {t('Also automatic subtitles')}
                    </span>
                    <Toggle labelledBy="dl-auto" checked={o.autoSubs} onChange={(autoSubs) => set({ autoSubs })} />
                  </div>
                )}
              </>
            )}
            {o.subs.trim() && (
              <>
                {canEmbedSubs(o.container) ? (
                  <div className="opt-row">
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <span className="opt-label" id="dl-subs-mode">
                        {t('Subtitles go')}
                      </span>
                      <Help label={t('subtitles go')} text={t('In the video: the player can turn them on. As files: separate .srt / .vtt files next to the video (for editors, or players that want a file). Both: in the video and as files.')} />
                    </span>
                    <Segmented
                      labelledBy="dl-subs-mode"
                      value={o.subsMode}
                      onChange={(subsMode) => set({ subsMode })}
                      options={[
                        { value: 'embed', label: t('in the video') },
                        { value: 'file', label: t('as files') },
                        { value: 'both', label: t('both') },
                      ]}
                    />
                  </div>
                ) : (
                  <p className="note">{t('{format} can’t hold subtitles, so they come as files next to the video.', { format: o.container.toUpperCase() })}</p>
                )}
                {(o.subsMode !== 'embed' || !canEmbedSubs(o.container)) && (
                  <div className="opt-row">
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <span className="opt-label" id="dl-subs-fmt">
                        {t('Subtitle files')}
                      </span>
                      <Help label={t('subtitle files')} text={t('SRT works almost everywhere (players, video editors). VTT is the web\'s format and keeps a little more styling.')} />
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
                  {t('Format')}
                </span>
                <Help
                  label={t('audio format')}
                  text={t('MP3 plays everywhere. M4A (AAC) and Opus are smaller for the same quality; OGG is the open Vorbis format some games use. WAV and FLAC are lossless: big files, for editing or burning a CD (they can’t be better than what the site has). Original keeps the site\'s own file without converting.')}
                />
              </span>
              <Segmented
                labelledBy="dl-a"
                value={o.audioFormat}
                onChange={(audioFormat) => set({ audioFormat })}
                options={AUDIO_FORMATS.map((f) => ({ value: f, label: f === 'best' ? t('original') : f }))}
              />
            </div>
            {!isLossless(o.audioFormat) && (
              <div className="opt-row">
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="opt-label" id="dl-br">
                    {t('Sound quality')}
                  </span>
                  <Help label={t('sound quality')} text={t('Best picks the top variable quality (about 245 kbit/s for MP3). A fixed bitrate makes the size predictable: 320 is the most MP3 can do, 128 is half the size and still fine for speech. YouTube’s own sound is about 130–160 kbit/s, so more than that only makes the file bigger.')} />
                </span>
                <Segmented
                  labelledBy="dl-br"
                  value={o.audioBitrate}
                  onChange={(audioBitrate) => set({ audioBitrate })}
                  options={BITRATES.map((b) => ({ value: b, label: b === 'best' ? t('best') : `${b}k` }))}
                />
              </div>
            )}
            <div className="opt-row">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className="opt-label" id="dl-meta">
                  {t('Cover and tags')}
                </span>
                <Help label={t('cover and tags')} text={t('Puts the thumbnail in as cover art, and the title, artist and album into the file, so music players show them.')} />
              </span>
              <Toggle labelledBy="dl-meta" checked={o.embedMeta} onChange={(embedMeta) => set({ embedMeta })} />
            </div>
          </>
        )}
        <div className="opt-row">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="opt-label" id="dl-sb">
              {t('Cut out sponsors')}
            </span>
            <Help label={t('SponsorBlock')} text={t('Removes the sponsored parts of YouTube videos, using SponsorBlock\'s community-marked segments.')} />
          </span>
          <Toggle labelledBy="dl-sb" checked={o.sponsorBlock} onChange={(sponsorBlock) => set({ sponsorBlock })} />
        </div>

        <details className="dl-advanced">
          <summary>{t('Advanced: exact format, extra yt-dlp options')}</summary>
          {info && !info.playlist && (
            <div className="fields">
              {o.mode === 'video' && (
                <div className="field grow">
                  <label htmlFor="dl-fv">{t('Video stream')}</label>
                  <select id="dl-fv" className="select" value={fv} onChange={(e) => pickFormat(e.target.value, fa)}>
                    <option value="">{t('from the settings above')}</option>
                    {videoFormats.map((f) => (
                      <option key={f.id} value={f.id}>
                        {formatLabel(f)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field grow">
                <label htmlFor="dl-fa">{t('Sound stream')}</label>
                <select id="dl-fa" className="select" value={fa} onChange={(e) => pickFormat(o.mode === 'video' ? fv : '', e.target.value)}>
                  <option value="">{o.mode === 'video' && fv ? t('none (only if the video stream has sound)') : t('from the settings above')}</option>
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
              label={t('Extra yt-dlp options')}
              value={o.extra}
              onChange={(v) => set({ extra: v })}
              placeholder={t('e.g. --cookies-from-browser firefox --limit-rate 5M')}
              mono
              help={t('Anything from yt-dlp\'s option list, added to the command. Options that would run other programs or write outside the download (like --exec or -o) aren\'t allowed.')}
            />
          </div>
          {'error' in extra && <p className="error-text">{extra.error}</p>}
          <SavedPanel<DlOptions>
            slug="downloader-templates"
            title={t('my templates')}
            help={t('Saves these download settings (and extra options) under a name, like Seal\'s command templates.')}
            suggestName={() => (o.mode === 'audio' ? `Audio ${o.audioFormat}` : `Video ${o.quality} ${o.container}`)}
            getData={() => ({ ...o, format: '' })}
            onLoad={(d) => setO({ ...DEFAULT_OPTIONS, ...d, format: '' })}
            describe={(i) =>
              [i.data.mode === 'audio' ? t('audio {format}', { format: i.data.audioFormat }) : t('video {quality} {container}', { quality: i.data.quality, container: i.data.container }), i.data.extra].filter(Boolean).join(' · ')
            }
          />
        </details>

        <button type="button" className="btn btn-primary" disabled={!info || !ready || 'error' in extra || count === 0} onClick={start}>
          {info?.playlist ? plural(count, ['Download {n} item', 'Download {n} items'], ['Stáhnout {n} položku', 'Stáhnout {n} položky', 'Stáhnout {n} položek']) : t('Download')}
        </button>
        {!info && <p className="note">{t('Get the info of a link first.')}</p>}
      </Panel>

      {live.length > 0 && (
        <Panel title={t('downloading')}>
          <ul className="dl-live">
            {live.map((j) => (
              <li key={j.id}>
                <b>{j.title}</b>
                <div className="dl-bar">
                  <span style={{ width: `${Math.round(j.progress * 100)}%` }} />
                </div>
                <span className="note mono">
                  {Math.round(j.progress * 100)} % · {t(PHASE[j.phase])}
                  {j.phase === 'downloading' && j.parts > 1 ? ` ${j.part === 1 ? t('video|the video') : t('video|the sound')}` : ''}
                  {j.phase === 'downloading' && j.speed ? ` · ${formatBytes(j.speed)}/s` : ''}
                  {j.phase === 'downloading' && j.connections ? ` · ${plural(j.connections, ['{n} connection', '{n} connections'], ['{n} spojení', '{n} spojení', '{n} spojení'])}` : ''}
                  {j.phase === 'downloading' && j.eta ? ` · ${t('{time} left', { time: time(j.eta) })}` : ''}
                </span>
                {j.fallback && <span className="note">{t('aria2c couldn\'t download this one, so yt-dlp does it by itself (one connection, slower).')}</span>}
              </li>
            ))}
          </ul>
          <p className="note">{t('The finished files wait in the queue on the left. Stop a download with its ×.')}</p>
        </Panel>
      )}

      <Panel title={t('history')}>
        {history.items.length === 0 ? (
          <p className="note">{t('Nothing downloaded yet.')}</p>
        ) : (
          <ul className="dl-history">
            {history.items.map((h) => (
              <li key={h.id}>
                <span className="dl-history-title">{h.data.title}</span>
                <span className="note mono">
                  {h.data.mode === 'audio' ? t('audio') : t('video')} · {formatBytes(h.data.size)} · {savedWhen(h.savedAt)}
                </span>
                <button type="button" className="btn btn-sm" disabled={!ready} onClick={() => void lookUp(h.data.url)}>
                  {t('again')}
                </button>
                <button type="button" className="btn btn-sm" aria-label={t('Remove {title} from the history', { title: h.data.title })} onClick={() => void history.remove(h.id)}>
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
