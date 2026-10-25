import { useEffect, useMemo, useRef, useState } from 'react';
import { strFromU8 } from 'fflate';
import { Panel } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { SearchIcon } from '../../../components/icons';
import { assetFile } from '../../../lib/mc/pack/assets';
import { isMusic, type PackDoc, type SoundEntry } from '../../../lib/mc/pack/pack';
import { toMinecraftOgg } from '../../../lib/mc/pack/sound';
import type { Vanilla } from '../../../lib/mc/pack/vanilla';
import { fmtNum, plural, t } from '../../../lib/i18n-core';

type RawSound = string | { name: string; type?: string };
type Events = Record<string, { sounds?: RawSound[]; subtitle?: string }>;
const SHOWN = 60;

/** One shared player, so starting a sound stops the one before. */
const player = typeof Audio !== 'undefined' ? new Audio() : null;
let playingUrl = '';
function play(bytes: Uint8Array) {
  if (!player) return;
  if (playingUrl) URL.revokeObjectURL(playingUrl);
  playingUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/ogg' }));
  player.src = playingUrl;
  player.play().catch(() => {});
}

/** The game's sound files of an event ("mob/creeper/say1" → its asset path), following links to other events. */
function filesOf(events: Events, event: string, depth = 0): string[] {
  const out: string[] = [];
  for (const s of events[event]?.sounds ?? []) {
    const name = typeof s === 'string' ? s : s.name;
    if (typeof s !== 'string' && s.type === 'event') {
      if (depth < 4) out.push(...filesOf(events, name.replace(/^minecraft:/, ''), depth + 1));
    } else out.push(`minecraft/sounds/${name.replace(/^minecraft:/, '')}.ogg`);
  }
  return out;
}

type Pending = { file: File; duration: number | null; start: string; end: string; volume: number };

/** Change what an event sounds like: pick it, hear the original, put in your own sound(s). */
export function SoundsPanel({ doc, vanilla, onChange }: { doc: PackDoc; vanilla: Vanilla; onChange: (sounds: PackDoc['sounds']) => void }) {
  const [events, setEvents] = useState<Events | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setError('');
    assetFile(vanilla.id, 'minecraft/sounds.json').then(
      (b) => alive && setEvents(b ? (JSON.parse(strFromU8(b)) as Events) : {}),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [vanilla.id]);

  // English subtitles ("Creeper hisses") to search by, from the game's language file.
  const english = useMemo(() => {
    try {
      return JSON.parse(strFromU8(vanilla.files['lang/en_us.json'])) as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  }, [vanilla]);

  const names = useMemo(() => Object.keys(events ?? {}).sort(), [events]);
  const groups = useMemo(() => [...new Set(names.map((n) => n.split('.')[0]))].sort(), [names]);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const label = (e: string) => {
    const s = events?.[e]?.subtitle;
    return s ? (english[s] ?? '') : '';
  };
  const matches = names.filter((n) => (!group || n.startsWith(`${group}.`)) && (!onlyMine || doc.sounds[n]) && words.every((w) => n.includes(w) || label(n).toLowerCase().includes(w)));

  const playEvent = async (event: string) => {
    const list = filesOf(events ?? {}, event);
    if (!list.length) return;
    try {
      const b = await assetFile(vanilla.id, list[Math.floor(Math.random() * list.length)]);
      if (b) play(b);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const setEntry = (event: string, entry: SoundEntry | null) => {
    const next = { ...doc.sounds };
    if (entry && entry.files.length) next[event] = entry;
    else delete next[event];
    onChange(next);
  };

  const pick = (f: File) => {
    const p: Pending = { file: f, duration: null, start: '0', end: '', volume: 100 };
    setPending(p);
    // The length, for the "until" field.
    const a = new Audio();
    const url = URL.createObjectURL(f);
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      const d = Number.isFinite(a.duration) ? a.duration : null;
      setPending((cur) => (cur?.file === f ? { ...cur, duration: d, end: d ? String(Math.round(d * 10) / 10) : '' } : cur));
      URL.revokeObjectURL(url);
    };
    a.onerror = () => URL.revokeObjectURL(url);
    a.src = url;
  };

  const add = async () => {
    if (!pending || !open) return;
    setBusy(0);
    setError('');
    try {
      const start = Math.max(0, Number(pending.start.replace(',', '.')) || 0);
      const endN = Number(pending.end.replace(',', '.'));
      const ogg = await toMinecraftOgg(pending.file, { start, end: pending.end.trim() && endN > start ? endN : null, volume: pending.volume, mono: !isMusic(open) }, (p) => setBusy(p));
      const cur = doc.sounds[open];
      const id = String((cur?.files.reduce((m, f) => Math.max(m, Number(f.id) || 0), 0) ?? 0) + 1);
      setEntry(open, { subtitle: events?.[open]?.subtitle, files: [...(cur?.files ?? []), { id, name: pending.file.name, ogg }] });
      setPending(null);
      play(ogg);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const mine = open ? doc.sounds[open] : undefined;
  const changed = Object.keys(doc.sounds).length;

  return (
    <Panel
      title={t('sounds')}
      actions={
        <span className="muted mono" style={{ fontSize: 13 }}>
          {plural(changed, ['{n} changed', '{n} changed'], ['{n} změněný', '{n} změněné', '{n} změněných'])}
        </span>
      }
    >
      <p className="note">{t('Pick a sound of the game (a creeper hissing, a door, the music…) and put in your own instead: any audio file, cut and made quieter or louder. Several of your own sounds for one event play at random.')}</p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!events && !error && <p className="note">{t('Loading the list of the game’s sounds…')}</p>}

      {events && (
        <>
          <div className="rp-browse-bar">
            <label className="rp-search">
              <SearchIcon />
              <input className="input" type="search" placeholder={t('Search sounds, e.g. creeper, door, hurt, music')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('Search sounds')} />
            </label>
            <select className="select" value={group} onChange={(e) => setGroup(e.target.value)} aria-label={t('Kind of sound')}>
              <option value="">{t('all kinds')}</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <label className="rp-only">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              <span>{t('Only changed')}</span>
            </label>
          </div>
          <div className="rp-list" role="list">
            {matches.slice(0, SHOWN).map((n) => (
              <div key={n} role="listitem" className={`rp-list-row${open === n ? ' active' : ''}`}>
                <button type="button" className="rp-play-btn" onClick={() => playEvent(n)} aria-label={t('Play the game’s sound')} title={t('Play the game’s sound')}>
                  ▶
                </button>
                <button type="button" className="rp-list-main" onClick={() => setOpen(n)}>
                  <span className="mono">{n}</span>
                  {label(n) && <span className="muted">{label(n)}</span>}
                </button>
                {doc.sounds[n] && <span className="pill">{plural(doc.sounds[n].files.length, ['{n} own', '{n} own'], ['{n} vlastní', '{n} vlastní', '{n} vlastních'])}</span>}
              </div>
            ))}
          </div>
          {matches.length > SHOWN && <p className="note">{t('{n} more, search to narrow them down.', { n: fmtNum(matches.length - SHOWN) })}</p>}
          {!matches.length && <p className="note">{t('Nothing found.')}</p>}
        </>
      )}

      {open && events && (
        <div className="rp-item-edit" aria-label={open}>
          <div className="rp-editor-head">
            <b className="mono">{open}</b>
            {label(open) && <span className="muted">{label(open)}</span>}
            <span className="muted">{isMusic(open) ? t('music: stereo, streamed') : t('in the world: mono')}</span>
          </div>
          <div className="rp-item-actions">
            {filesOf(events, open).map((f, i) => (
              <button
                key={f + i}
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  assetFile(vanilla.id, f).then(
                    (b) => b && play(b),
                    (e: Error) => setError(e.message),
                  )
                }
                title={f.replace('minecraft/sounds/', '')}
              >
                ▶ {t('original {n}', { n: i + 1 })}
              </button>
            ))}
          </div>
          {mine && (
            <div className="rp-item-actions">
              {mine.files.map((f) => (
                <span key={f.id} className="rp-chip">
                  <button type="button" className="link-btn" onClick={() => play(f.ogg)}>
                    ▶ {f.name}
                  </button>
                  <span className="muted">{(f.ogg.length / 1024).toFixed(0)} KB</span>
                  <button type="button" className="rp-x" aria-label={t('Remove {name}', { name: f.name })} onClick={() => setEntry(open, { ...mine, files: mine.files.filter((x) => x.id !== f.id) })}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {!pending ? (
            <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}>
              {mine ? t('Add another sound') : t('Use my own sound')}
            </button>
          ) : (
            <div className="rp-sound-opts">
              <span className="mono">{pending.file.name}</span>
              <label className="rp-frames">
                <span>{t('from')}</span>
                <input className="input mono rp-ticks" inputMode="decimal" value={pending.start} onChange={(e) => setPending({ ...pending, start: e.target.value })} />
                <span>{t('to')}</span>
                <input className="input mono rp-ticks" inputMode="decimal" value={pending.end} placeholder={t('end')} onChange={(e) => setPending({ ...pending, end: e.target.value })} />
                <span className="muted">{t('seconds')}</span>
                {pending.duration !== null && <span className="muted">({t('{s} s long', { s: fmtNum(Math.round(pending.duration * 10) / 10) })})</span>}
              </label>
              <div className="range">
                <span className="opt-label">{t('Volume')}</span>
                <input type="range" min={10} max={300} step={10} value={pending.volume} aria-label={t('Volume')} onChange={(e) => setPending({ ...pending, volume: Number(e.target.value) })} />
                <output>{fmtNum(pending.volume)} %</output>
                <Help label={t('Volume')} text={t('100 % keeps it as it is. Game sounds are fairly quiet; a loud song may need 50 %.')} />
              </div>
              <div className="opt-row">
                <button type="button" className="btn btn-primary" onClick={add} disabled={busy !== null}>
                  {busy !== null ? t('Converting… {p} %', { p: fmtNum(Math.round(busy * 100)) }) : t('Convert and use')}
                </button>
                <button type="button" className="btn" onClick={() => setPending(null)} disabled={busy !== null}>
                  {t('cancel')}
                </button>
              </div>
              {busy !== null && busy === 0 && <p className="note">{t('The first time, the converter (about 30 MB) is downloaded.')}</p>}
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="audio/*,video/*,.ogg,.mp3,.wav,.m4a,.flac,.opus"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) pick(f);
            }}
          />
        </div>
      )}
    </Panel>
  );
}

