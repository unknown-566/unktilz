import { useEffect, useMemo, useState } from 'react';
import { strFromU8 } from 'fflate';
import { Panel, Segmented } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { SearchIcon } from '../../../components/icons';
import { assetFile, assetIndex } from '../../../lib/mc/pack/assets';
import type { PackDoc } from '../../../lib/mc/pack/pack';
import type { Vanilla } from '../../../lib/mc/pack/vanilla';
import { fmtNum, getLang, plural, t } from '../../../lib/i18n-core';

const SHOWN = 50;

/** The game's texts in one language: English is in the game file, the others come from Mojang. */
async function loadLang(vanilla: Vanilla, code: string): Promise<Record<string, string>> {
  const bytes = code === 'en_us' ? vanilla.files['lang/en_us.json'] : await assetFile(vanilla.id, `minecraft/lang/${code}.json`);
  if (!bytes) throw new Error(t('This version has no texts in {code}.', { code }));
  return JSON.parse(strFromU8(bytes)) as Record<string, string>;
}

/** Rename items and blocks, change menu texts, and the splash lines on the title screen. */
export function TextsPanel({ doc, vanilla, onChange }: { doc: PackDoc; vanilla: Vanilla; onChange: (p: Partial<PackDoc>) => void }) {
  const [code, setCode] = useState(getLang() === 'cs' ? 'cs_cz' : 'en_us');
  const [codes, setCodes] = useState<string[]>(['en_us', 'cs_cz']);
  const [game, setGame] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    assetIndex(vanilla.id).then(
      (idx) => setCodes(['en_us', ...Object.keys(idx).map((p) => p.match(/^minecraft\/lang\/([a-z0-9_]+)\.json$/)?.[1]).filter((c): c is string => !!c && c !== 'en_us').sort()]),
      () => {},
    );
  }, [vanilla.id]);

  useEffect(() => {
    let alive = true;
    setGame(null);
    setError('');
    loadLang(vanilla, code).then(
      (l) => alive && setGame(l),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [vanilla, code]);

  const mine = doc.lang[code] ?? {};
  const setText = (key: string, value: string) => {
    const keys = { ...mine };
    if (value === '' || value === game?.[key]) delete keys[key];
    else keys[key] = value;
    const lang = { ...doc.lang, [code]: keys };
    if (!Object.keys(keys).length) delete lang[code];
    onChange({ lang });
  };

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = useMemo(() => {
    if (!game || (!words.length && !onlyMine)) return [];
    const keys = onlyMine ? Object.keys(mine) : Object.keys(game);
    return keys.filter((k) => words.every((w) => k.toLowerCase().includes(w) || (game[k] ?? '').toLowerCase().includes(w) || (mine[k] ?? '').toLowerCase().includes(w)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, query, onlyMine, mine]);

  const splashes = doc.splashes;
  const gameSplashes = useMemo(() => {
    const b = vanilla.files['texts/splashes.txt'];
    return b ? strFromU8(b).split(/\r?\n/).filter((l) => l.trim()) : [];
  }, [vanilla]);
  const sample = splashes?.lines.find((l) => l.trim()) ?? gameSplashes[0] ?? '';
  const changed = Object.values(doc.lang).reduce((n, k) => n + Object.keys(k).length, 0);

  return (
    <>
      <Panel
        title={t('texts')}
        actions={
          <span className="muted mono" style={{ fontSize: 13 }}>
            {plural(changed, ['{n} changed', '{n} changed'], ['{n} změněný', '{n} změněné', '{n} změněných'])}
          </span>
        }
      >
        <p className="note">{t('Change any text of the game: item and block names, buttons, messages. Only what you change goes into the pack; the rest stays as in the game.')}</p>
        <div className="rp-browse-bar">
          <label className="rp-search">
            <SearchIcon />
            <input className="input" type="search" placeholder={t('Search, e.g. Diamond Sword, Singleplayer, creeper')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('Search texts')} />
          </label>
          <select className="select" value={code} onChange={(e) => setCode(e.target.value)} aria-label={t('Language')}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c === 'en_us' ? 'English (en_us)' : c === 'cs_cz' ? 'Čeština (cs_cz)' /* i18n-ignore */ : c}
              </option>
            ))}
          </select>
          <label className="rp-only">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            <span>{t('Only changed')}</span>
          </label>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {!game && !error && <p className="note">{t('Loading the game’s texts…')}</p>}
        {game && !words.length && !onlyMine && <p className="note">{t('Type what you want to change: the text as it shows in the game, or its key.')}</p>}
        {game && matches.length > 0 && (
          <div className="rp-texts">
            {matches.slice(0, SHOWN).map((k) => (
              <label key={k} className={`rp-text-row${mine[k] !== undefined ? ' changed' : ''}`}>
                <span className="rp-text-key mono">{k}</span>
                <span className="rp-text-game">{game[k] ?? <i className="muted">{t('(not in this version)')}</i>}</span>
                <input className="input" value={mine[k] ?? ''} placeholder={game[k] ?? ''} onChange={(e) => setText(k, e.target.value)} aria-label={t('Your text for {key}', { key: k })} />
              </label>
            ))}
          </div>
        )}
        {game && matches.length > SHOWN && <p className="note">{t('{n} more, search to narrow them down.', { n: fmtNum(matches.length - SHOWN) })}</p>}
        {game && (words.length > 0 || onlyMine) && !matches.length && <p className="note">{t('Nothing found.')}</p>}
      </Panel>

      <Panel title={t('splash texts')}>
        <div className="rp-splash-wrap">
          <span className="rp-splash-logo" aria-hidden="true">
            {'MINECRAFT' /* i18n-ignore */}
            <span className="rp-splash">{sample}</span>
          </span>
        </div>
        <p className="note">{t('The yellow lines that bounce next to the logo on the title screen; one is picked at random each time. One per line.')}</p>
        <div className="opt-row">
          <span className="opt-label" id="rp-splash-mode">
            {t('Your lines')}
          </span>
          <Segmented
            labelledBy="rp-splash-mode"
            value={splashes?.mode ?? 'add'}
            onChange={(mode) => onChange({ splashes: { mode, lines: splashes?.lines ?? [] } })}
            options={[
              { value: 'add', label: t('added to the game’s ({n})', { n: fmtNum(gameSplashes.length) }) },
              { value: 'replace', label: t('instead of the game’s') },
            ]}
          />
          <Help label={t('Your lines')} text={t('“Added” keeps the game’s lines and puts yours among them. “Instead” shows only yours.')} />
        </div>
        <textarea
          className="textarea rp-splash-lines"
          value={splashes?.lines.join('\n') ?? ''}
          placeholder={t('e.g. Made by me!')}
          onChange={(e) => {
            const lines = e.target.value.split('\n');
            onChange({ splashes: lines.some((l) => l.trim()) || splashes?.mode === 'replace' ? { mode: splashes?.mode ?? 'add', lines } : null });
          }}
          aria-label={t('Your splash lines, one per line')}
        />
      </Panel>
    </>
  );
}
