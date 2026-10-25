import { useEffect, useRef, useState } from 'react';
import { Panel } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { formatBytes } from '../../../queue/download';
import { cachedVersions, downloadVersion, forgetVersion, getCached, listVersions, readJar, type Vanilla, type VersionInfo } from '../../../lib/mc/pack/vanilla';
import { fmtNum, t } from '../../../lib/i18n-core';

type Busy = { what: string; progress: number } | null;

/**
 * Which Minecraft version the pack is made for: its textures are downloaded from Mojang once (or read
 * from the player's own game file) and kept in the browser.
 */
export function GamePanel({ vanilla, wanted, onLoaded }: { vanilla: Vanilla | null; wanted: string; onLoaded: (v: Vanilla) => void }) {
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [listError, setListError] = useState(false);
  const [cached, setCached] = useState<Awaited<ReturnType<typeof cachedVersions>>>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const jarInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const refreshCached = () => cachedVersions().then(setCached);
  useEffect(() => {
    refreshCached();
    listVersions().then(
      (v) => {
        setVersions(v);
        setPick((p) => p || v[0]?.id || '');
      },
      () => setListError(true),
    );
    return () => abort.current?.abort();
  }, []);
  // Offline: the downloaded versions are the choices.
  useEffect(() => {
    if (!pick && listError && cached[0]) setPick(cached[0].id);
  }, [listError, cached, pick]);
  useEffect(() => {
    if (wanted) setPick(wanted);
  }, [wanted]);

  const finish = (v: Vanilla) => {
    setBusy(null);
    setOpen(false);
    refreshCached();
    onLoaded(v);
  };
  const fail = (e: unknown) => {
    setBusy(null);
    if ((e as Error)?.name === 'AbortError') return;
    setError(e instanceof Error && !/^\d+$/.test(e.message) ? e.message : t('The download didn’t work. Check your internet connection, or load the game file from your computer.'));
  };

  const use = async (id: string) => {
    setError('');
    const have = await getCached(id);
    if (have) return finish(have);
    const info = versions?.find((v) => v.id === id);
    if (!info) return setError(t('Version {v} isn’t downloaded and the version list from Mojang isn’t available (offline?).', { v: id }));
    abort.current = new AbortController();
    setBusy({ what: t('Downloading Minecraft {v}…', { v: id }), progress: 0 });
    downloadVersion(info, (p) => setBusy((b) => b && { ...b, progress: p }), abort.current.signal).then(finish, fail);
  };

  const fromJar = (file: File) => {
    setError('');
    setBusy({ what: t('Reading {name}…', { name: file.name }), progress: 0 });
    readJar(file, (p) => setBusy((b) => b && { ...b, progress: p })).then(finish, fail);
  };

  const remove = async (id: string) => {
    await forgetVersion(id);
    refreshCached();
  };

  const isCached = (id: string) => cached.some((c) => c.id === id);
  const options = versions ?? cached.map((c) => ({ id: c.id, url: '' }));
  const showChooser = !vanilla || open;

  return (
    <Panel
      title={t('game')}
      actions={
        vanilla && !busy ? (
          <button type="button" className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? t('close') : t('change version')}
          </button>
        ) : undefined
      }
    >
      {vanilla && (
        <p className="rp-game-line">
          <b>{t('Minecraft {v}', { v: vanilla.id })}</b>
          <span className="muted">
            {' · '}
            {vanilla.source === 'mojang' ? t('downloaded from Mojang') : t('from your game file')}
            {' · '}
            {t('pack format {f}', { f: vanilla.format[1] ? `${vanilla.format[0]}.${vanilla.format[1]}` : String(vanilla.format[0]) })}
          </span>
        </p>
      )}
      {!vanilla && !busy && <p className="note">{t('Pick the Minecraft version your pack is for. Its textures are downloaded from Mojang once (about 40 MB, of which 6 MB is kept in this browser), or read from the game on your computer.')}</p>}

      {busy ? (
        <div className="rp-busy" role="status">
          <span>{busy.what}</span>
          <div className="rp-progress" aria-hidden="true">
            <div className="bar" style={{ width: `${Math.round(busy.progress * 100)}%` }} />
          </div>
          <span className="mono muted">{fmtNum(Math.round(busy.progress * 100))} %</span>
          {abort.current && busy.progress < 0.85 && (
            <button type="button" className="btn btn-sm" onClick={() => abort.current?.abort()}>
              {t('cancel')}
            </button>
          )}
        </div>
      ) : (
        showChooser && (
          <>
            <div className="rp-version-row">
              <label className="field-label" htmlFor="rp-version">
                {t('Version')}
              </label>
              <select id="rp-version" className="select" value={pick} onChange={(e) => setPick(e.target.value)} disabled={!options.length}>
                {!options.length && <option value="">{t('loading…')}</option>}
                {options.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id}
                    {isCached(v.id) ? ` · ${t('downloaded')}` : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-primary" disabled={!pick} onClick={() => use(pick)}>
                {isCached(pick) ? t('Use') : t('Download')}
              </button>
              <span className="muted">{t('or')}</span>
              <button type="button" className="btn" onClick={() => jarInput.current?.click()}>
                {t('Load my game file (.jar)')}
              </button>
              <Help
                label={t('Load my game file (.jar)')}
                text={t('Works offline. In the Minecraft launcher the game is in %appdata%\\.minecraft\\versions\\<version>\\<version>.jar (press Win+R and paste %appdata%\\.minecraft). Start that version once in the launcher so the file is there.')}
              />
              <input
                ref={jarInput}
                type="file"
                accept=".jar"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) fromJar(f);
                }}
              />
            </div>
            {listError && <p className="note">{t('Mojang’s version list isn’t available (offline?). Downloaded versions and your own game file still work.')}</p>}
            {cached.length > 0 && (
              <div className="rp-cached">
                <span className="muted">{t('In this browser:')}</span>
                {cached.map((c) => (
                  <span key={c.id} className="rp-chip">
                    <span className="mono">{c.id}</span>
                    <span className="muted">{formatBytes(c.bytes)}</span>
                    <button type="button" className="rp-x" aria-label={t('Delete the downloaded files of {v}', { v: c.id })} title={t('Delete the downloaded files of {v}', { v: c.id })} onClick={() => remove(c.id)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        )
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </Panel>
  );
}
