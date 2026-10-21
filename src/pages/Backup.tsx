import { useEffect, useRef, useState } from 'react';
import { GoLink } from '../components/Transition';
import { allSaved, mergeSaved, type SavedItem } from '../lib/saved';
import { saveBlob } from '../queue/download';
import { loadSaved as loadSkinEditor, save as saveSkinEditor } from '../tools/minecraft/skin-editor/load';
import { getTool } from '../registry';
import { plural, t } from '../lib/i18n-core';

type Backup = {
  format: 'unktilz-backup';
  created: string;
  saved: [string, unknown][];
  skinEditor?: unknown;
  local: Record<string, string>;
};

// JSON has no byte arrays (skins are stored as pixels), so they travel as base64.
const toB64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const replacer = (_k: string, v: unknown) =>
  v instanceof Uint8Array || v instanceof Uint8ClampedArray ? { __bytes: toB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)), clamped: v instanceof Uint8ClampedArray } : v;
const reviver = (_k: string, v: unknown) => {
  if (v && typeof v === 'object' && '__bytes' in v) {
    const b = fromB64((v as { __bytes: string }).__bytes);
    return (v as { clamped?: boolean }).clamped ? new Uint8ClampedArray(b) : b;
  }
  return v;
};

/** localStorage keys this site uses (theme, seed map structure toggles…). */
const localKeys = () => Object.keys(localStorage).filter((k) => k.startsWith('unktilz-'));

export default function Backup() {
  const [summary, setSummary] = useState<{ label: string; count: number }[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const rows = (await allSaved())
      .filter(([k]) => String(k).startsWith('list:'))
      .map(([k, v]) => {
        const slug = String(k).slice(5);
        const base = slug.split(':')[0];
        const label = `${getTool(base)?.name ?? base}${slug.includes(':') ? ` · ${slug.split(':')[1]}` : ''}`;
        return { label, count: (v as SavedItem[]).length };
      })
      .filter((r) => r.count > 0);
    setSummary(rows);
  };
  useEffect(() => {
    document.title = t('Backup · unktilz');
    refresh();
  }, []);

  const download = async () => {
    setBusy(true);
    try {
      const local: Record<string, string> = {};
      for (const k of localKeys()) local[k] = localStorage.getItem(k) ?? '';
      const backup: Backup = { format: 'unktilz-backup', created: new Date().toISOString(), saved: await allSaved(), skinEditor: await loadSkinEditor(), local };
      saveBlob(new Blob([JSON.stringify(backup, replacer)], { type: 'application/json' }), `unktilz-backup-${new Date().toISOString().slice(0, 10)}.json`);
      setStatus(t('Backup downloaded.'));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const data = JSON.parse(await f.text(), reviver) as Backup;
      if (data.format !== 'unktilz-backup') throw new Error();
      let n = await mergeSaved(data.saved ?? []);
      if (data.skinEditor && !(await loadSkinEditor())) {
        await saveSkinEditor(data.skinEditor as Parameters<typeof saveSkinEditor>[0]);
        n++;
      }
      for (const [k, v] of Object.entries(data.local ?? {}))
        if (k.startsWith('unktilz-') && localStorage.getItem(k) === null) {
          localStorage.setItem(k, v);
          n++;
        }
      setStatus(
        n
          ? plural(n, ['Restored {n} thing from the backup. Nothing you already had was removed.', 'Restored {n} things from the backup. Nothing you already had was removed.'], ['Ze zálohy je obnovená {n} věc. Nic z toho, co už jste měli, se nesmazalo.', 'Ze zálohy jsou obnovené {n} věci. Nic z toho, co už jste měli, se nesmazalo.', 'Ze zálohy je obnoveno {n} věcí. Nic z toho, co už jste měli, se nesmazalo.'])
          : t('Everything in that backup was already here.'),
      );
      refresh();
    } catch {
      setStatus(t('That file isn’t an unktilz backup.'));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  return (
    <div className="wrap tool-wrap">
      <nav aria-label={t('Breadcrumb')} className="crumbs">
        <GoLink to="/">{t('tools')}</GoLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{t('backup')}</span>
      </nav>
      <div className="tool-head">
        <div className="title-row">
          <h1>{t('Backup')}</h1>
        </div>
        <p className="tool-desc">
          {t('Everything you save in the tools lives in this browser. Download a backup to keep it safe or to move it to another computer, then load it there.')}
        </p>
      </div>
      <section className="panel" aria-label={t('Backup')}>
        <div className="seg">
          <button type="button" className="btn btn-primary" onClick={download} disabled={busy}>
            {t('Download backup')}
          </button>
          <button type="button" className="btn" onClick={() => file.current?.click()} disabled={busy}>
            {t('Load a backup…')}
          </button>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => restore(e.target.files?.[0])} />
        </div>
        {status && (
          <p className="note" role="status" style={{ color: 'var(--fg)' }}>
            {status}
          </p>
        )}
        <p className="note">{t('Loading a backup adds what’s in it: saved items are merged, and work in progress is only filled in where you have none.')}</p>
      </section>
      <section className="panel" aria-label={t('What\'s saved')}>
        <h2 className="panel-title">{t('// saved in this browser')}</h2>
        {summary.length === 0 ? (
          <p className="note">{t('Nothing saved yet.')}</p>
        ) : (
          <ul className="backup-list">
            {summary.map((r) => (
              <li key={r.label}>
                <span>{r.label}</span>
                <span className="mono muted">{r.count}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="note">{t('Saved data belongs to the address in the address bar (e.g. localhost:5173). start.bat always uses 5173, so it stays the same after updates.')}</p>
      </section>
    </div>
  );
}
