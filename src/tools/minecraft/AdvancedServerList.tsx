import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { SavedPanel } from '../../components/SavedPanel';
import { useAutosave } from '../../lib/saved';
import { CopyButton, Panel, Segmented, TabPanel, Tabs } from '../../components/ui';
import { Workbench } from '../../components/Workbench';
import { Help } from '../../components/Help';
import { saveBlob } from '../../queue/download';
import { MiniText, lintMiniMessage, stripFormatting, textWidthPx } from '../../lib/mc/minimessage';
import { MOTD_WIDTH, charWidth } from '../../lib/mc/textWidth';
import { MiniToolbar } from './MiniToolbar';
import { t, tn } from '../../lib/i18n';

// Profile format: https://asl.andre601.ch/profiles/

type Motd = { l1: string; l2: string; c1: boolean; c2: boolean };
type FieldKey = 'l1' | 'l2' | 'hover' | 'text';
type Tab = 'text' | 'count' | 'icon' | 'who';
type CountMode = 'real' | 'numbers' | 'hidden' | 'text';
type HoverMode = 'players' | 'custom' | 'none';
type FaviconMode = 'none' | 'head' | 'player' | 'file' | 'random' | 'url';
type Audience = 'everyone' | 'maintenance' | 'new' | 'returning' | 'whitelist' | 'old' | 'player' | 'date' | 'after' | 'custom';

const PLACEHOLDERS = [
  { value: '${player name}', label: t('player name'), sample: (p: string) => p },
  { value: '${server playersOnline}', label: t('players online'), sample: () => '12' },
  { value: '${server playersMax}', label: t('max players'), sample: () => '100' },
  { value: '${server host}', label: t('address they typed'), sample: () => 'play.example.net' },
  { value: '${date current}', label: t('today’s date'), sample: () => new Date().toLocaleDateString('en-GB') },
];

// Protocol numbers of the first release of each version.
const VERSIONS = [
  ['1.21', 767],
  ['1.20.5', 766],
  ['1.20', 763],
  ['1.19', 759],
  ['1.18', 757],
  ['1.17', 755],
  ['1.16', 735],
  ['1.13', 393],
  ['1.12', 335],
  ['1.8', 47],
] as const;

const AUDIENCES: { id: Audience; title: string; detail: string; priority: number; file: string }[] = [
  { id: 'everyone', title: t('Everyone'), detail: t('Your main look. Every server should have one of these.'), priority: 0, file: 'default' },
  { id: 'maintenance', title: t('During maintenance'), detail: t('Needs the Maintenance plugin. Shows while maintenance mode is on.'), priority: 20, file: 'maintenance' },
  { id: 'new', title: t('Players who never joined before'), detail: t('A welcome for newcomers. Paper servers only.'), priority: 10, file: 'new-players' },
  { id: 'returning', title: t('Players who joined before'), detail: t('A “welcome back” for regulars. Paper servers only.'), priority: 10, file: 'returning-players' },
  { id: 'whitelist', title: t('Players not on the whitelist'), detail: t('Shows while the whitelist is on to people who can’t join. Paper only.'), priority: 15, file: 'not-whitelisted' },
  { id: 'old', title: t('Players on an old Minecraft version'), detail: t('Tell them to update, or that your server needs a newer version.'), priority: 5, file: 'old-versions' },
  { id: 'player', title: t('One specific player'), detail: t('A personal message for one name.'), priority: 10, file: 'player' },
  { id: 'date', title: t('On one day'), detail: t('For an event, a birthday or a holiday.'), priority: 10, file: 'event' },
  { id: 'after', title: t('After a date'), detail: t('Starts showing the day after the date you pick.'), priority: 10, file: 'after-date' },
  { id: 'custom', title: t('Custom rule'), detail: t('Write the condition yourself.'), priority: 10, file: 'custom' },
];

/** YAML single-quoted string: only the quote itself needs escaping. */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const isInt = (s: string) => /^-?\d+$/.test(s.trim());
const toAslDate = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');
const FANCY = /<(gradient|rainbow|pride|transition|#[0-9a-f]{6}|color:#|c:#|shadow|head|font)/i;

function Label({ id, children, help }: { id?: string; children: ReactNode; help: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center' }}>
      <label className="field-label" htmlFor={id}>
        {children}
      </label>
      <Help label={typeof children === 'string' ? children : t('this option')} text={help} />
    </span>
  );
}

function Ping({ crossed }: { crossed: boolean }) {
  return crossed ? (
    <svg width="20" height="16" viewBox="0 0 20 16" aria-label={t('Outdated server icon')} role="img">
      <path d="M3 3l14 10M17 3L3 13" stroke="#ff5555" strokeWidth="2.5" />
    </svg>
  ) : (
    <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={i * 4} y={12 - i * 3} width="3" height={4 + i * 3} fill="#55ff55" />
      ))}
    </svg>
  );
}

function Warnings({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <ul className="warn-list" role="status">
      {list.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
  );
}

function WidthMeter({ px }: { px: number }) {
  const over = px > MOTD_WIDTH;
  return (
    <span className="width-meter" data-over={over || undefined} title={t('Estimated width in the Minecraft font, with sample values for live values')}>
      <span className="width-bar">
        <span style={{ width: `${Math.min(100, (px / MOTD_WIDTH) * 100)}%` }} />
      </span>
      <span className="mono">
        {px} / {MOTD_WIDTH}px
      </span>
    </span>
  );
}

/** Radio-card group for choices that need a sentence of explanation each. */
function Choices<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; title: string; detail?: string }[];
}) {
  const name = useId();
  return (
    <div className="choices" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.id} className="choice" data-on={o.id === value || undefined}>
          <input type="radio" name={name} checked={o.id === value} onChange={() => onChange(o.id)} />
          <span>
            <span className="choice-title">{o.title}</span>
            {o.detail && <span className="choice-detail">{o.detail}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export default function AdvancedServerList() {
  const [motds, setMotds] = useState<Motd[]>([
    { l1: '<gradient:#b6f24a:#5eead4><bold>My Server</bold></gradient>', l2: '<gray>Hi <aqua>${player name}</aqua>, come play!', c1: true, c2: true },
  ]);
  const [cur, setCur] = useState(0);
  const [countMode, setCountMode] = useState<CountMode>('real');
  const [onlineFixed, setOnlineFixed] = useState(false);
  const [onlineAmount, setOnlineAmount] = useState('50');
  const [maxMode, setMaxMode] = useState<'real' | 'fixed' | 'plus'>('real');
  const [maxAmount, setMaxAmount] = useState('100');
  const [countText, setCountText] = useState('<yellow>Maintenance');
  const [hoverMode, setHoverMode] = useState<HoverMode>('players');
  const [hover, setHover] = useState('<gold>Welcome!\n<gray>Discord: <aqua>discord.gg/example');
  const [favMode, setFavMode] = useState<FaviconMode>('none');
  const [favValue, setFavValue] = useState('');
  const [audience, setAudience] = useState<Audience>('everyone');
  const [version, setVersion] = useState<string>('1.21');
  const [playerName, setPlayerName] = useState('Steve');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customCond, setCustomCond] = useState('');
  const [priority, setPriority] = useState('0');
  const [fileName, setFileName] = useState('default');
  const [fileTouched, setFileTouched] = useState(false);
  const [previewName, setPreviewName] = useState('Steve');
  const [active, setActive] = useState<FieldKey>('l1');
  const [tab, setTab] = useState<Tab>('text');
  const [showHover, setShowHover] = useState(false);

  // Everything that makes up the profile, for autosave and the saved list.
  const draft = useMemo(
    () => ({ motds, countMode, onlineFixed, onlineAmount, maxMode, maxAmount, countText, hoverMode, hover, favMode, favValue, audience, version, playerName, date, customCond, priority, fileName, fileTouched, previewName }),
    [motds, countMode, onlineFixed, onlineAmount, maxMode, maxAmount, countText, hoverMode, hover, favMode, favValue, audience, version, playerName, date, customCond, priority, fileName, fileTouched, previewName],
  );
  type Draft = typeof draft;
  const restore = (d: Partial<Draft>) => {
    if (d.motds?.length) setMotds(d.motds);
    setCur(0);
    if (d.countMode) setCountMode(d.countMode);
    if (d.onlineFixed !== undefined) setOnlineFixed(d.onlineFixed);
    if (d.onlineAmount !== undefined) setOnlineAmount(d.onlineAmount);
    if (d.maxMode) setMaxMode(d.maxMode);
    if (d.maxAmount !== undefined) setMaxAmount(d.maxAmount);
    if (d.countText !== undefined) setCountText(d.countText);
    if (d.hoverMode) setHoverMode(d.hoverMode);
    if (d.hover !== undefined) setHover(d.hover);
    if (d.favMode) setFavMode(d.favMode);
    if (d.favValue !== undefined) setFavValue(d.favValue);
    if (d.audience) setAudience(d.audience);
    if (d.version) setVersion(d.version);
    if (d.playerName !== undefined) setPlayerName(d.playerName);
    if (d.date) setDate(d.date);
    if (d.customCond !== undefined) setCustomCond(d.customCond);
    if (d.priority !== undefined) setPriority(d.priority);
    if (d.fileName !== undefined) setFileName(d.fileName);
    if (d.fileTouched !== undefined) setFileTouched(d.fileTouched);
    if (d.previewName !== undefined) setPreviewName(d.previewName);
  };
  useAutosave<Partial<Draft>>('advanced-server-list', draft, restore);

  const refs = {
    l1: useRef<HTMLInputElement>(null),
    l2: useRef<HTMLInputElement>(null),
    hover: useRef<HTMLTextAreaElement>(null),
    text: useRef<HTMLInputElement>(null),
  };
  const motd = motds[Math.min(cur, motds.length - 1)];
  const setMotd = (patch: Partial<Motd>) => setMotds((m) => m.map((x, i) => (i === cur ? { ...x, ...patch } : x)));
  const fields: Record<FieldKey, [string, (v: string) => void]> = {
    l1: [motd.l1, (v) => setMotd({ l1: v })],
    l2: [motd.l2, (v) => setMotd({ l2: v })],
    hover: [hover, setHover],
    text: [countText, setCountText],
  };

  const activeKey = () => (Object.keys(refs) as FieldKey[]).find((k) => refs[k].current === document.activeElement) ?? active;

  /**
   * Applies a tag like a text editor would: to the selection, or with nothing selected to the
   * whole line (for the hover box, the line the cursor is on).
   */
  const wrap = (open: string, close: string) => {
    const key = activeKey();
    const el = refs[key].current;
    const [value, set] = fields[key];
    let start = el?.selectionStart ?? value.length;
    let end = el?.selectionEnd ?? value.length;
    if (start === end) {
      if (key === 'hover') {
        start = value.lastIndexOf('\n', start - 1) + 1;
        const nl = value.indexOf('\n', end);
        end = nl < 0 ? value.length : nl;
      } else {
        start = 0;
        end = value.length;
      }
    }
    set(value.slice(0, start) + open + value.slice(start, end) + close + value.slice(end));
    setTimeout(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + open.length, end + open.length);
    }, 0);
  };

  /** Live values and heads go in at the cursor, without replacing anything. */
  const insert = (text: string) => {
    const key = activeKey();
    const el = refs[key].current;
    const [value, set] = fields[key];
    const at = el?.selectionEnd ?? value.length;
    set(value.slice(0, at) + text + value.slice(at));
    setTimeout(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(at + text.length, at + text.length);
    }, 0);
  };

  const sample = (s: string) =>
    s.replace(/\$\{([^}]+)\}/g, (m) => PLACEHOLDERS.find((p) => p.value === m)?.sample(previewName || 'Steve') ?? m);

  // ---------- who sees it ----------
  const aud = AUDIENCES.find((a) => a.id === audience)!;
  const protocol = VERSIONS.find(([v]) => v === version)?.[1] ?? 767;
  const condition = {
    everyone: '',
    maintenance: '${maintenance maintenanceEnabled}',
    new: '!${player hasPlayedBefore}',
    returning: '${player hasPlayedBefore}',
    whitelist: '${server whitelistEnabled} and !${player isWhitelisted}',
    old: `\${player protocol} < ${protocol}`,
    player: `\${player name} == "${playerName.trim().replace(/"/g, '')}"`,
    date: `\${date isExact ${toAslDate(date)}}`,
    after: `\${date isAfter ${toAslDate(date)}}`,
    custom: customCond,
  }[audience];

  const pickAudience = (id: Audience) => {
    const a = AUDIENCES.find((x) => x.id === id)!;
    if (id === 'custom') setCustomCond(condition);
    setAudience(id);
    setPriority(String(a.priority));
    if (!fileTouched) setFileName(id === 'player' ? `player-${playerName.trim() || 'name'}` : a.file);
  };

  // ---------- YAML ----------
  const lineOut = (s: string, centered: boolean) => (centered ? `<center>${s}` : s);
  const filled = motds.filter((m) => m.l1 || m.l2);
  const hoverLines = hover.split('\n').filter((l) => l.trim() !== '');
  const y: string[] = [`priority: ${isInt(priority) ? Number(priority) : 0}`];
  if (condition.trim()) y.push(`condition: ${q(condition.trim())}`);
  if (filled[0]) y.push('motd:', `  - ${q(lineOut(filled[0].l1, filled[0].c1))}`, `  - ${q(lineOut(filled[0].l2, filled[0].c2))}`);
  const favicon = favMode === 'head' ? '${player uuid}' : favMode === 'random' ? 'random' : favMode === 'none' ? '' : favValue.trim();
  if (favicon) y.push(`favicon: ${q(favicon)}`);
  const pc: string[] = [];
  if (countMode === 'hidden') pc.push('  hidePlayers: true');
  if (countMode === 'text' && countText.trim()) pc.push(`  text: ${q(countText)}`);
  if (countMode === 'numbers') {
    if (onlineFixed && onlineAmount.trim()) pc.push('  onlinePlayers:', '    enabled: true', `    amount: ${isInt(onlineAmount) ? onlineAmount.trim() : q(onlineAmount.trim())}`);
    if (maxMode !== 'real' && maxAmount.trim())
      pc.push(`  ${maxMode === 'plus' ? 'extraPlayers' : 'maxPlayers'}:`, '    enabled: true', `    amount: ${isInt(maxAmount) ? maxAmount.trim() : q(maxAmount.trim())}`);
  }
  if (countMode !== 'hidden') {
    if (hoverMode === 'none') pc.push('  hidePlayersHover: true');
    else if (hoverMode === 'custom' && hoverLines.length) pc.push('  hover:', ...hoverLines.map((l) => `    - ${q(l)}`));
  }
  if (pc.length) y.push('playerCount:', ...pc);
  if (filled.length > 1) {
    y.push('# One of these MOTDs is picked at random every time the list refreshes.', 'profiles:');
    for (const m of filled) y.push('  - motd:', `      - ${q(lineOut(m.l1, m.c1))}`, `      - ${q(lineOut(m.l2, m.c2))}`);
  }
  const yaml = `${y.join('\n')}\n`;
  const file = `${fileName.trim().replace(/\.ya?ml$/i, '').replace(/[^\w.-]+/g, '-') || 'profile'}.yml`;

  // ---------- preview ----------
  const num = (s: string, d: number) => (isInt(sample(s)) ? Number(sample(s)) : d);
  const shownOnline = countMode === 'numbers' && onlineFixed ? num(onlineAmount, 12) : 12;
  const shownMax = countMode === 'numbers' && maxMode === 'fixed' ? num(maxAmount, 100) : countMode === 'numbers' && maxMode === 'plus' ? shownOnline + num(maxAmount, 1) : 100;
  const hoverOpen = (showHover || tab === 'count') && countMode !== 'hidden' && hoverMode !== 'none';
  const hoverShown = hoverMode === 'custom' && hoverLines.length ? hoverLines : [previewName || 'Steve', 'Alex', 'Notch'];
  const favPreview =
    favMode === 'head'
      ? `https://mc-heads.net/avatar/${encodeURIComponent(previewName || 'Steve')}/64`
      : favMode === 'player' && favValue.trim()
        ? `https://mc-heads.net/avatar/${encodeURIComponent(favValue.trim())}/64`
        : favMode === 'url' && /^https:\/\//.test(favValue.trim())
          ? favValue.trim()
          : '';

  const previewLine = (s: string, centered: boolean) => (
    <div style={{ textAlign: centered ? 'center' : 'left', minHeight: '1.45em' }}>
      <MiniText text={sample(s)} />
    </div>
  );

  const preview = (
    <Panel
      title={t('preview')}
      actions={
        motds.length > 1 ? (
          <Segmented label={t('MOTD to preview')} value={String(cur)} onChange={(v) => setCur(Number(v))} compact options={motds.map((_, i) => ({ value: String(i), label: `${i + 1}` }))} />
        ) : undefined
      }
    >
      <div
        className="mc-preview"
        style={{ display: 'flex', gap: 14, alignItems: 'flex-start', position: 'relative', paddingBottom: hoverOpen ? 14 + hoverShown.length * 22 : undefined }}
      >
        <div style={{ flex: 'none', width: 64, height: 64, borderRadius: 4, background: '#3b3b3b', display: 'grid', placeItems: 'center', color: '#777', overflow: 'hidden' }}>
          {favPreview ? (
            <img src={favPreview} width={64} height={64} alt={t('Server icon')} style={{ imageRendering: 'pixelated' }} />
          ) : (
            <span style={{ fontSize: 11 }}>{favMode === 'file' || favMode === 'random' ? '.png' : '?'}</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#fff', textShadow: '2px 2px 0 #3f3f3f' }}>{t('Minecraft Server')}</span>
            <span
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default', position: 'relative' }}
              onMouseEnter={() => setShowHover(true)}
              onMouseLeave={() => setShowHover(false)}
            >
              {countMode === 'text' && countText.trim() ? (
                <MiniText text={sample(countText)} />
              ) : countMode === 'hidden' ? (
                <span>???</span>
              ) : (
                <span>
                  {shownOnline}
                  <span style={{ color: '#555' }}>/</span>
                  {shownMax}
                </span>
              )}
              <Ping crossed={countMode === 'text' && !!countText.trim()} />
              {hoverOpen && (
                <div className="mc-tooltip">
                  {hoverShown.map((l, i) => (
                    <div key={i}>
                      <MiniText text={sample(l)} defaultColor="#FFFFFF" />
                    </div>
                  ))}
                </div>
              )}
            </span>
          </div>
          {previewLine(motd.l1, motd.c1)}
          {previewLine(motd.l2, motd.c2)}
        </div>
      </div>
      <div className="inline" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="note" style={{ flex: '1 1 200px' }}>
          {motds.length > 1 ? `${t('MOTD {n} of {length}, picked at random in the game.', { n: cur + 1, length: motds.length })} ` : ''}
          {t('Hover the player count to see its hover text.')}
        </p>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="asl-preview-name" className="mono muted" style={{ fontSize: 12 }}>
            {t('preview as')}
          </label>
          <input id="asl-preview-name" className="input mono" style={{ width: 120, minHeight: 36 }} value={previewName} onChange={(e) => setPreviewName(e.target.value)} />
          <Help label={t('preview as')} text={t('Live values like the player name are filled in with this name here. In the game everyone sees their own name.')} />
        </span>
      </div>
    </Panel>
  );

  const output = (
    <Panel
      title={file}
      actions={
        <div className="seg">
          <CopyButton text={yaml} />
          <button type="button" className="btn btn-sm mono" onClick={() => saveBlob(new Blob([yaml], { type: 'text/yaml' }), file)}>
            {t('download')}
          </button>
        </div>
      }
    >
      <ol className="steps">
        <li>
          {tn('Install {plugin} on your Paper, Velocity or BungeeCord server.', {
            plugin: (
              <a href="https://modrinth.com/plugin/advancedserverlist" target="_blank" rel="noreferrer">
                AdvancedServerList
              </a>
            ),
          })}
        </li>
        <li>
          {tn('Download this file and put it in {folder}', { folder: <span className="mono">plugins/AdvancedServerList/profiles/</span> })}
        </li>
        <li>
          {tn('Run {command} and refresh your server list.', { command: <span className="mono">/asl reload</span> })}
        </li>
      </ol>
      {audience !== 'everyone' && (
        <p className="note">{t('This profile only shows to “{audience}”. Keep a default.yml for everyone else.', { audience: aud.title.toLowerCase() })}</p>
      )}
      <details>
        <summary className="mono muted" style={{ cursor: 'pointer', minHeight: 36, display: 'flex', alignItems: 'center' }}>
          {t('show the file')}
        </summary>
        <div className="inline" style={{ alignItems: 'center', margin: '8px 0' }}>
          <label htmlFor="asl-file" className="mono muted" style={{ fontSize: 12 }}>
            {t('file name')}
          </label>
          <input
            id="asl-file"
            className="input mono"
            style={{ width: 180, minHeight: 36 }}
            value={fileName}
            onChange={(e) => {
              setFileName(e.target.value);
              setFileTouched(true);
            }}
            spellCheck={false}
          />
        </div>
        <pre className="code" style={{ whiteSpace: 'pre', wordBreak: 'normal', overflowX: 'auto' }}>
          {yaml}
        </pre>
      </details>
    </Panel>
  );

  const lineEditor = (key: 'l1' | 'l2', label: string, help: string) => {
    const value = motd[key];
    const centered = key === 'l1' ? motd.c1 : motd.c2;
    const width = textWidthPx(sample(value), charWidth);
    const warnings = lintMiniMessage(value).map((l) => l.message);
    if (width > MOTD_WIDTH) warnings.push(t('Too wide for the server list by about {px} px: the end wraps onto the next line or gets cut off.', { px: width - MOTD_WIDTH }));
    return (
      <div className="field">
        <Label id={`asl-${key}`} help={help}>
          {label}
        </Label>
        <input
          id={`asl-${key}`}
          ref={refs[key]}
          className="input mono"
          value={value}
          placeholder={key === 'l1' ? t('First line, e.g. My Server') : t('Second line, e.g. Survival · 1.21')}
          onFocus={() => setActive(key)}
          onChange={(e) => fields[key][1](e.target.value)}
          spellCheck={false}
        />
        <div className="line-tools">
          <Segmented
            label={t('{label} alignment', { label })}
            value={centered ? 'center' : 'left'}
            onChange={(v) => setMotd(key === 'l1' ? { c1: v === 'center' } : { c2: v === 'center' })}
            compact
            options={[
              { value: 'left', label: t('left') },
              { value: 'center', label: t('center') },
            ]}
          />
          <button type="button" className="btn btn-sm" onClick={() => fields[key][1](stripFormatting(value))} disabled={stripFormatting(value) === value}>
            {t('clear formatting')}
          </button>
          <WidthMeter px={width} />
        </div>
        <Warnings list={warnings} />
      </div>
    );
  };

  const basicWarnings = (s: string) => [
    ...lintMiniMessage(s).map((l) => l.message),
    ...(FANCY.test(s) ? [t('Gradients, hex colors, shadows and heads don’t work here. The game shows the nearest basic color instead.')] : []),
  ];

  const P = 'asl';

  return (
    <Workbench preview={preview} output={output}>
      <section className="panel" aria-label={t('Profile settings')}>
        <p className="note">{t('A profile is how your server looks in the multiplayer list. Change it here, watch the preview, then download the file.')}</p>
        <Tabs
          idPrefix={P}
          label={t('Profile settings')}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'text', label: motds.length > 1 ? t('text · {length}', { length: motds.length }) : t('text') },
            { id: 'count', label: t('player count'), dot: countMode !== 'real' || hoverMode !== 'players' },
            { id: 'icon', label: t('icon'), dot: favMode !== 'none' },
            { id: 'who', label: t('who sees it'), dot: audience !== 'everyone' },
          ]}
        />

        {tab === 'text' && (
          <TabPanel idPrefix={P} id="text">
            <MiniToolbar
              onWrap={wrap}
              onInsert={insert}
              placeholders={PLACEHOLDERS}
              hint={t('Click in a line, then pick a color or style. Select some words first to change only those.')}
            />
            {motds.length > 1 && (
              <p className="note mono" style={{ color: 'var(--fg)' }}>
                {t('editing MOTD {n} of {length}', { n: cur + 1, length: motds.length })}
              </p>
            )}
            {lineEditor('l1', t('Line 1'), t('The first line under your server’s name in the multiplayer list.'))}
            {lineEditor('l2', t('Line 2'), t('The second line. The server list shows only two lines.'))}
            <div className="inline" style={{ alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setMotds((m) => [...m, { l1: '', l2: '', c1: motd.c1, c2: motd.c2 }]);
                  setCur(motds.length);
                }}
              >
                {t('+ add another MOTD')}
              </button>
              {motds.length > 1 && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setMotds((m) => m.filter((_, i) => i !== cur));
                    setCur(Math.max(0, cur - 1));
                  }}
                >
                  {t('remove MOTD {n}', { n: cur + 1 })}
                </button>
              )}
              <Help label={t('more MOTDs')} text={t('Add several MOTDs and the plugin shows a random one every time someone refreshes the server list.')} />
            </div>
          </TabPanel>
        )}

        {tab === 'count' && (
          <TabPanel idPrefix={P} id="count">
            <div className="field">
              <span className="field-label">{t('What shows instead of “12/100”')}</span>
              <Choices
                label={t('Player count')}
                value={countMode}
                onChange={setCountMode}
                options={[
                  { id: 'real', title: t('The real player count'), detail: t('Normal. Nothing changes.') },
                  { id: 'numbers', title: t('Different numbers'), detail: t('Show your own online or max number, or always look almost full.') },
                  { id: 'hidden', title: t('Hide it'), detail: t('Shows ??? and no hover.') },
                  { id: 'text', title: t('Your own text'), detail: t('E.g. “Maintenance”. The game then shows the server as outdated.') },
                ]}
              />
            </div>

            {countMode === 'numbers' && (
              <div className="sub-box">
                <div className="opt-row">
                  <span className="opt-label" id="asl-online">
                    {t('Online players')}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Segmented
                      labelledBy="asl-online"
                      value={onlineFixed ? 'fixed' : 'real'}
                      onChange={(v) => setOnlineFixed(v === 'fixed')}
                      compact
                      options={[
                        { value: 'real', label: t('real') },
                        { value: 'fixed', label: t('fixed number') },
                      ]}
                    />
                    {onlineFixed && <input className="input mono input-num" aria-label={t('Online players to show')} inputMode="numeric" value={onlineAmount} onChange={(e) => setOnlineAmount(e.target.value)} />}
                  </span>
                </div>
                <div className="opt-row">
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="opt-label" id="asl-max">
                      {t('Max players')}
                    </span>
                    <Help label={t('max players')} text={t('Only changes what the list shows, not how many can really join. “Online + N” makes the server always look almost full, like 12/13.')} />
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Segmented
                      labelledBy="asl-max"
                      value={maxMode}
                      onChange={setMaxMode}
                      compact
                      options={[
                        { value: 'real', label: t('real') },
                        { value: 'fixed', label: t('fixed number') },
                        { value: 'plus', label: t('online + N') },
                      ]}
                    />
                    {maxMode !== 'real' && (
                      <input
                        className="input mono input-num"
                        aria-label={maxMode === 'plus' ? t('Slots above the online count') : t('Max players to show')}
                        inputMode="numeric"
                        value={maxAmount}
                        onChange={(e) => setMaxAmount(e.target.value)}
                      />
                    )}
                  </span>
                </div>
              </div>
            )}

            {countMode === 'text' && (
              <div className="sub-box">
                <MiniToolbar basic onWrap={wrap} onInsert={insert} placeholders={PLACEHOLDERS} />
                <input
                  ref={refs.text}
                  className="input mono"
                  aria-label={t('Text instead of the player count')}
                  value={countText}
                  onFocus={() => setActive('text')}
                  onChange={(e) => setCountText(e.target.value)}
                  spellCheck={false}
                />
                <Warnings list={basicWarnings(countText)} />
                <p className="note">{t('Side effect: players see a red crossed-out signal icon, as if your server ran another version. The plugin can’t avoid this.')}</p>
              </div>
            )}

            <hr className="divider" />

            {countMode === 'hidden' ? (
              <p className="note">{t('With the player count hidden there’s no hover box either.')}</p>
            ) : (
              <div className="field">
                <span className="field-label">{t('What shows when someone hovers it')}</span>
                <Choices
                  label={t('Hover')}
                  value={hoverMode}
                  onChange={setHoverMode}
                  options={[
                    { id: 'players', title: t('The list of online players'), detail: t('Normal. Nothing changes.') },
                    { id: 'custom', title: t('Your own lines'), detail: t('E.g. your Discord, website or rules.') },
                    { id: 'none', title: t('Nothing'), detail: t('Hovering shows no box at all.') },
                  ]}
                />
                {hoverMode === 'custom' && (
                  <div className="sub-box">
                    <MiniToolbar basic onWrap={wrap} onInsert={insert} placeholders={PLACEHOLDERS} hint={t('One line in the box per line here.')} />
                    <textarea
                      ref={refs.hover}
                      className="textarea mono"
                      aria-label={t('Hover lines')}
                      style={{ minHeight: 90 }}
                      value={hover}
                      onFocus={() => setActive('hover')}
                      onChange={(e) => setHover(e.target.value)}
                      spellCheck={false}
                    />
                    <Warnings list={basicWarnings(hover)} />
                  </div>
                )}
              </div>
            )}
          </TabPanel>
        )}

        {tab === 'icon' && (
          <TabPanel idPrefix={P} id="icon">
            <Choices
              label={t('Server icon')}
              value={favMode}
              onChange={setFavMode}
              options={[
                { id: 'none', title: t('Keep the server’s own icon'), detail: t('The server-icon.png you already have, or none.') },
                { id: 'head', title: t('The head of whoever is looking'), detail: t('Every player sees their own head. New players see a default head.') },
                { id: 'player', title: t('The head of one player'), detail: t('E.g. the owner.') },
                { id: 'file', title: t('An image file'), detail: t('A 64×64 .png in plugins/AdvancedServerList/favicons/.') },
                { id: 'random', title: t('A random image'), detail: t('Picks one of the .png files in the favicons folder each time.') },
                { id: 'url', title: t('An image from a link'), detail: t('Any https:// link to a .png.') },
              ]}
            />
            {(favMode === 'player' || favMode === 'file' || favMode === 'url') && (
              <input
                className="input mono"
                aria-label={favMode === 'player' ? t('Player name') : favMode === 'file' ? t('File name') : t('Image link')}
                placeholder={favMode === 'player' ? t('Notch') : favMode === 'file' ? t('halloween.png') : 'https://example.net/icon.png'}
                value={favValue}
                onChange={(e) => setFavValue(e.target.value)}
                spellCheck={false}
              />
            )}
          </TabPanel>
        )}

        {tab === 'who' && (
          <TabPanel idPrefix={P} id="who">
            <p className="note">
              {t('Most servers need only the “Everyone” profile. For something special, like maintenance, make a second file: it gets a higher priority and shows instead of the main one while its rule is true.')}
            </p>
            <Choices label={t('Who sees this profile')} value={audience} onChange={pickAudience} options={AUDIENCES} />
            {audience === 'old' && (
              <div className="sub-box opt-row">
                <label className="opt-label" htmlFor="asl-ver">
                  {t('Older than')}
                </label>
                <select id="asl-ver" className="select mono" value={version} onChange={(e) => setVersion(e.target.value)}>
                  {VERSIONS.map(([v]) => (
                    <option key={v} value={v}>
                      Minecraft {v}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {audience === 'player' && (
              <div className="sub-box opt-row">
                <label className="opt-label" htmlFor="asl-pname">
                  {t('Player name')}
                </label>
                <input
                  id="asl-pname"
                  className="input mono"
                  value={playerName}
                  onChange={(e) => {
                    setPlayerName(e.target.value);
                    if (!fileTouched) setFileName(`player-${e.target.value.trim() || 'name'}`);
                  }}
                  spellCheck={false}
                />
              </div>
            )}
            {(audience === 'date' || audience === 'after') && (
              <div className="sub-box opt-row">
                <label className="opt-label" htmlFor="asl-date">
                  {t('Date')}
                </label>
                <input id="asl-date" type="date" className="input mono" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
            <details open={audience === 'custom'}>
              <summary className="mono muted" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
                {t('advanced: rule and priority')}
              </summary>
              <div className="fields" style={{ marginTop: 8 }}>
                <div className="field">
                  <Label id="asl-priority" help={t('Higher numbers are checked first. The first profile whose rule is true is shown.')}>
                    {t('Priority')}
                  </Label>
                  <input id="asl-priority" className="input mono input-num" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <Label
                  id="asl-cond"
                  help={t('Empty means always. Compare with == != < > <= >=, combine with and / or, negate with !. Text needs quotes: ${player name} == "Steve".')}
                >
                  {t('Rule (condition)')}
                </Label>
                <input
                  id="asl-cond"
                  className="input mono"
                  value={condition}
                  placeholder={t('empty = always')}
                  onChange={(e) => {
                    setAudience('custom');
                    setCustomCond(e.target.value);
                  }}
                  spellCheck={false}
                />
              </div>
            </details>
          </TabPanel>
        )}
      </section>
      <SavedPanel<Partial<Draft>>
        slug="advanced-server-list"
        title={t('my profiles')}
        help={t('Keep profiles (a normal one, maintenance, an event…) and come back to edit them. Saved in this browser.')}
        suggestName={() => fileName}
        getData={() => draft}
        onLoad={restore}
        describe={(i) => `${i.data.fileName ?? 'profile'}.yml · ${i.data.motds?.length ?? 1} MOTD${(i.data.motds?.length ?? 1) > 1 ? 's' : ''} · ${i.data.audience ?? 'everyone'}`}
        emptyText={t('No saved profiles yet.')}
      />
    </Workbench>
  );
}
