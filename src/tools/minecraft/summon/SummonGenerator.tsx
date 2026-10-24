import { useEffect, useMemo, useRef, useState } from 'react';
import { SavedPanel, UndoBar } from '../../../components/SavedPanel';
import { useAutosave } from '../../../lib/saved';
import { MiniText, plainText } from '../../../lib/mc/minimessage';
import { Help } from '../../../components/Help';
import { CopyButton, Panel, TabPanel, Tabs, type TabDef } from '../../../components/ui';
import { Workbench } from '../../../components/Workbench';
import { GIVE_VERSIONS, type GiveVersion } from '../../../lib/mc/give';
import { EQUIP_SLOTS, buildSummon, defaultMob, isAlive, type MobSpec } from '../../../lib/mc/entity';
import { groupsFor, type ExtraField } from '../../../lib/mc/entityExtras';
import { MiniToolbar } from '../MiniToolbar';
import { ENTITIES, ENTITY_BY_ID, label } from '../give/data';
import { MobEditor } from '../give/MobEditor';
import { Combo } from '../give/Pickers';
import { ExtrasEditor } from './ExtrasEditor';
import { plural, t } from '../../../lib/i18n-core';

type Tab = 'entity' | 'place' | 'special' | 'riders';
type Pos = [string, string, string];
type Draft = { root: MobSpec; pos: Pos; version: GiveVersion };

const ENTITY_OPTIONS = ENTITIES.map((e) => ({ id: e.id, name: e.name }));
const HERE: Pos = ['~', '~', '~'];
const entityName = (id: string) => ENTITY_BY_ID.get(id.replace(/^minecraft:/, ''))?.name ?? label(id.replace(/^minecraft:/, ''));

/** Fills in anything an older saved entity doesn't have yet (riders too). */
const fix = (m: Partial<MobSpec>): MobSpec => ({ ...defaultMob(), ...m, passengers: m.passengers?.map(fix) });
/** The entity at a rider path: [] is the bottom one, [0, 1] the 2nd rider of its 1st rider. */
const at = (m: MobSpec, path: number[]): MobSpec => path.reduce<MobSpec>((cur, i) => cur.passengers?.[i] ?? cur, m);
const updateAt = (m: MobSpec, path: number[], fn: (x: MobSpec) => MobSpec): MobSpec => {
  if (!path.length) return fn(m);
  const [i, ...rest] = path;
  return { ...m, passengers: (m.passengers ?? []).map((p, j) => (j === i ? updateAt(p, rest, fn) : p)) };
};
/** The longest part of a path that still points at an entity. */
const validPath = (m: MobSpec, path: number[]) => {
  const out: number[] = [];
  let cur = m;
  for (const i of path) {
    const next = cur.passengers?.[i];
    if (!next) break;
    out.push(i);
    cur = next;
  }
  return out;
};
const count = (m: MobSpec): number => 1 + (m.passengers ?? []).reduce((n, p) => n + count(p), 0);

/** Ready-made starting points. */
const PRESETS: { label: string; make: () => { root: MobSpec; pos?: Pos } }[] = [
  {
    label: t('Boss zombie'),
    make: () => ({
      root: {
        ...defaultMob('zombie'),
        name: '<red><bold>Boss',
        nameVisible: true,
        maxHealth: '100',
        speed: '0.3',
        attack: '10',
        scale: '1.5',
        persistent: true,
        equipment: {
          head: { item: 'netherite_helmet', glint: true, drop: 0 },
          chest: { item: 'netherite_chestplate', glint: true, drop: 0 },
          mainhand: { item: 'netherite_sword', glint: true, drop: 1 },
        },
        effects: [{ id: 'fire_resistance', level: 1, seconds: -1, particles: false, icon: true }],
      },
    }),
  },
  {
    label: t('Spider jockey'),
    make: () => ({ root: { ...defaultMob('spider'), passengers: [{ ...defaultMob('skeleton'), equipment: { mainhand: { item: 'bow', glint: false, drop: -1 } } }] } }),
  },
  { label: t('Charged creeper'), make: () => ({ root: { ...defaultMob('creeper'), extra: { powered: true } } }) },
  {
    label: t('Shop villager'),
    make: () => ({
      root: {
        ...defaultMob('villager'),
        name: '<green>Shop',
        nameVisible: true,
        noAI: true,
        invulnerable: true,
        persistent: true,
        silent: true,
        extra: { profession: 'toolsmith', level: '5' },
        trades: [
          { buy: { item: 'emerald', count: 5 }, sell: { item: 'diamond_pickaxe', count: 1 }, maxUses: '', xp: false },
          { buy: { item: 'emerald', count: 1 }, sell: { item: 'bread', count: 16 }, maxUses: '', xp: false },
        ],
      },
    }),
  },
  {
    label: t('Hologram'),
    make: () => ({ root: { ...defaultMob('armor_stand'), name: '<gold><bold>Welcome!', nameVisible: true, noGravity: true, invulnerable: true, extra: { invisible: true, marker: true } } }),
  },
  {
    label: t('Floating text'),
    make: () => ({ root: { ...defaultMob('text_display'), extra: { text: '<gold><bold>Welcome!</bold>\n<gray>Have fun', billboard: 'center' } }, pos: ['~', '~2', '~'] }), // i18n-ignore: an example text
  },
  { label: t('TNT rocket'), make: () => ({ root: { ...defaultMob('tnt'), motion: ['0', '1.5', '0'], extra: { fuse: '3' } } }) },
];

function NumBox({ label: text, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="give-inline-label">
      {text}
      <input className="input mono sm-num" type="number" step="any" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Label({ text, help, htmlFor }: { text: string; help?: string; htmlFor?: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center' }}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="field-label">
          {text}
        </label>
      ) : (
        <span className="field-label">{text}</span>
      )}
      {help && <Help label={text} text={help} />}
    </span>
  );
}

/** One entity in the preview, with its riders drawn above it like in game. */
function EntityCard({ m, path, current, onPick }: { m: MobSpec; path: number[]; current: number[]; onPick: (p: number[]) => void }) {
  const riders = m.passengers ?? [];
  const on = path.join() === current.join();
  const alive = isAlive(m.entity);
  const worn = EQUIP_SLOTS.filter((s) => m.equipment[s]?.item || m.equipment[s]?.spec).length;
  const facts = [
    alive && m.maxHealth.trim() && t('{hp} health', { hp: m.maxHealth }),
    alive && worn > 0 && plural(worn, ['{n} item worn or held', '{n} items worn or held'], ['{n} item na sobě nebo v ruce', '{n} itemy na sobě nebo v ruce', '{n} itemů na sobě nebo v ruce']),
    alive && m.effects.length > 0 && plural(m.effects.length, ['{n} effect', '{n} effects'], ['{n} efekt', '{n} efekty', '{n} efektů']),
    (m.trades?.length ?? 0) > 0 && plural(m.trades!.length, ['{n} trade', '{n} trades'], ['{n} obchod', '{n} obchody', '{n} obchodů']),
    m.extra?.powered === true && t('charged'),
  ].filter(Boolean);
  const text = typeof m.extra?.text === 'string' && m.entity === 'text_display' ? m.extra.text : '';
  return (
    <div className="sm-node">
      {riders.length > 0 && (
        <div className="sm-riders">
          {riders.map((r, i) => (
            <EntityCard key={i} m={r} path={[...path, i]} current={current} onPick={onPick} />
          ))}
        </div>
      )}
      <button type="button" className={`sm-card${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onPick(path)} title={t('Edit this one')}>
        {m.name.trim() && (
          <span className="sm-plate">
            <MiniText text={m.name} defaultColor="#FFFFFF" />
          </span>
        )}
        {text.trim() && (
          <span className="sm-plate sm-text">
            <MiniText text={text} defaultColor="#FFFFFF" />
          </span>
        )}
        <span className="sm-kind">{entityName(m.entity)}</span>
        {facts.length > 0 && <span className="sm-facts">{facts.join(' · ')}</span>}
      </button>
    </div>
  );
}

export default function SummonGenerator() {
  const [root, setRootRaw] = useState<MobSpec>(() => defaultMob('zombie'));
  const [pos, setPos] = useState<Pos>(HERE);
  const [version, setVersion] = useState<GiveVersion>('26.1');
  const [path, setPathRaw] = useState<number[]>([]);
  const [tab, setTab] = useState<Tab>('entity');
  const [undo, setUndo] = useState<{ text: string; prev: { root: MobSpec; pos: Pos } } | null>(null);

  const draft = useMemo<Draft>(() => ({ root, pos, version }), [root, pos, version]);
  useAutosave<Draft>('summon-generator', draft, (d) => {
    setRootRaw(fix(d.root));
    setPos(d.pos ?? HERE);
    setVersion(d.version ?? '26.1');
  });

  const cur = at(root, path);
  const setPath = (p: number[]) => setPathRaw(validPath(root, p));
  const setCur = (p: Partial<MobSpec>) => setRootRaw((r) => updateAt(r, validPath(r, path), (m) => ({ ...m, ...p })));
  // Picking another entity keeps what fits; the special settings belong to the old one.
  const onMob = (p: Partial<MobSpec>) => setCur(p.entity !== undefined && p.entity !== cur.entity ? { ...p, extra: {}, stack: undefined, trades: undefined, pose: undefined, items: undefined } : p);

  const isBlank = (r: MobSpec) => JSON.stringify(r) === JSON.stringify(defaultMob('zombie'));
  const replaceWith = (next: { root: MobSpec; pos?: Pos }, text: string) => {
    if (!isBlank(root)) setUndo({ text, prev: { root, pos } });
    setRootRaw(next.root);
    setPos(next.pos ?? HERE);
    setPathRaw([]);
  };

  const groups = groupsFor(cur.entity);
  const hasSpecial = groups.length > 0;
  const riders = cur.passengers ?? [];
  const tabs: TabDef<Tab>[] = [
    { id: 'entity', label: t('Entity') },
    { id: 'place', label: t('Position & motion'), dot: !!(cur.rotation?.some((r) => r.trim()) || cur.motion?.some((r) => r.trim()) || cur.tags?.some((tg) => tg.trim()) || cur.fire?.trim() || cur.visualFire) },
    ...(hasSpecial ? [{ id: 'special' as Tab, label: t('Special'), dot: Object.values(cur.extra ?? {}).some((v) => v !== '' && v !== false) || !!cur.trades?.length || !!cur.stack }] : []),
    { id: 'riders', label: riders.length ? t('Riders ({n})', { n: riders.length }) : t('Riders') },
  ];
  useEffect(() => {
    if (tab === 'special' && !hasSpecial) setTab('entity');
  }, [tab, hasSpecial]);

  const result = useMemo(() => buildSummon(root, pos, version), [root, pos, version]);
  const len = result.command.length;

  // ---- MiniMessage fields: the toolbar edits whichever one was focused last ----
  const fields = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement>());
  const [active, setActive] = useState('name');
  const valueOf = (key: string) => (key === 'name' ? cur.name : typeof cur.extra?.[key] === 'string' ? (cur.extra[key] as string) : '');
  const setValue = (key: string, v: string) => (key === 'name' ? setCur({ name: v }) : setCur({ extra: { ...cur.extra, [key]: v } }));
  const edit = (change: (value: string, start: number, end: number) => { next: string; selStart: number; selEnd: number }) => {
    const el = fields.current.get(active);
    const value = valueOf(active);
    let start = el?.selectionStart ?? value.length;
    let end = el?.selectionEnd ?? value.length;
    if (start === end) [start, end] = [0, value.length];
    const r = change(value, start, end);
    setValue(active, r.next);
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(r.selStart, r.selEnd);
    }, 0);
  };
  const wrap = (open: string, close: string) =>
    edit((v, s, e) => ({ next: v.slice(0, s) + open + v.slice(s, e) + close + v.slice(e), selStart: s + open.length, selEnd: e + open.length }));
  const insert = (text: string) => {
    const el = fields.current.get(active);
    const value = valueOf(active);
    const pos2 = el?.selectionEnd ?? value.length;
    setValue(active, value.slice(0, pos2) + text + value.slice(pos2));
  };
  const reg = (key: string) => (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el) fields.current.set(key, el);
    else fields.current.delete(key);
  };

  // ---- tabs ----
  const entityTab = (
    <MobEditor
      mob={cur}
      onChange={onMob}
      options={ENTITY_OPTIONS}
      pickLabel={t('Entity')}
      pickHelp={t('Mobs, but also armor stands, TNT, boats, arrows, text displays and the like. You can type an id that isn\'t in the list too.')}
      nameInput={
        <>
          <MiniToolbar onWrap={wrap} onInsert={insert} placeholders={[]} hint={t('Click into the name, then pick a color or style.')} />
          <div className="field">
            <Label htmlFor="sm-name" text={t('Name')} help={t('The name above its head. Leave empty for no name.')} />
            <input id="sm-name" ref={reg('name')} className="input mono" value={cur.name} placeholder={t('e.g. <red>Boss')} onFocus={() => setActive('name')} onChange={(e) => setCur({ name: e.target.value })} spellCheck={false} />
          </div>
        </>
      }
    />
  );

  const vec = (v: string[] | undefined, n: number) => v ?? Array<string>(n).fill('');
  const placeTab = (
    <>
      {path.length === 0 ? (
        <div className="field">
          <Label
            text={t('Position')}
            help={t('~ is where the command runs (you, or the command block) and ~2 is 2 blocks further. ^ ^ ^3 is 3 blocks in front of where you look. A plain number is an exact coordinate.')}
          />
          <div className="inline">
            {(['X', 'Y', 'Z'] as const).map((axis, i) => (
              <label key={axis} className="give-inline-label">
                {axis}
                <input
                  className="input mono sm-num"
                  value={pos[i]}
                  placeholder="~"
                  spellCheck={false}
                  onChange={(e) => setPos(pos.map((p, j) => (j === i ? e.target.value : p)) as Pos)}
                />
              </label>
            ))}
          </div>
          <div className="seg">
            <button type="button" className="btn btn-sm" onClick={() => setPos(['~', '~', '~'])}>
              {t('where I stand')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPos(['~', '~3', '~'])}>
              {t('3 blocks up')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPos(['^', '^', '^3'])}>
              {t('3 blocks in front of me')}
            </button>
          </div>
        </div>
      ) : (
        <p className="note">{t('Riders sit on the one below them, so only the bottom entity has a position.')}</p>
      )}
      <div className="field">
        <Label text={t('Facing')} help={t('Yaw turns it: 0 faces south, 90 west, 180 north, -90 east. Pitch tilts its head: -90 up, 90 down.')} />
        <div className="inline">
          <NumBox label={t('yaw')} value={vec(cur.rotation, 2)[0]} placeholder="0" onChange={(v) => setCur({ rotation: [v, vec(cur.rotation, 2)[1]] })} />
          <NumBox label={t('pitch')} value={vec(cur.rotation, 2)[1]} placeholder="0" onChange={(v) => setCur({ rotation: [vec(cur.rotation, 2)[0], v] })} />
        </div>
      </div>
      <div className="field">
        <Label text={t('Starting push (motion)')} help={t('Speed in blocks per tick along x, y (up) and z. 1 is fast, 0.3 a gentle push. Good for launching TNT or arrows.')} />
        <div className="inline">
          {(['x', 'y', 'z'] as const).map((axis, i) => (
            <NumBox
              key={axis}
              label={axis}
              value={vec(cur.motion, 3)[i]}
              placeholder="0"
              onChange={(v) => setCur({ motion: vec(cur.motion, 3).map((m, j) => (j === i ? v : m)) as [string, string, string] })}
            />
          ))}
        </div>
      </div>
      <div className="fields">
        <div className="field">
          <Label htmlFor="sm-fire" text={t('Burns for (seconds)')} help={t('It spawns on fire. Mobs that don\'t burn (like blazes) ignore it.')} />
          <input id="sm-fire" className="input mono" type="number" min={0} step="any" placeholder="0" value={cur.fire ?? ''} onChange={(e) => setCur({ fire: e.target.value })} />
        </div>
        <div className="field">
          <Label htmlFor="sm-tags" text={t('Tags')} help={t('Labels for commands to find it later, like @e[tag=boss]. Separate them with spaces.')} />
          <input
            id="sm-tags"
            className="input mono"
            value={(cur.tags ?? []).join(' ')}
            placeholder="boss arena1" // i18n-ignore
            spellCheck={false}
            onChange={(e) => setCur({ tags: e.target.value.split(/[\s,]+/) })}
          />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={!!cur.visualFire} onChange={(e) => setCur({ visualFire: e.target.checked })} />
        {t('looks on fire, but doesn\'t burn')}
      </label>
    </>
  );

  const textInput = (f: ExtraField) => (
    <>
      <MiniToolbar onWrap={wrap} onInsert={insert} placeholders={[]} hint={t('Click into the text, then pick a color or style.')} />
      <Label htmlFor={`sm-x-${f.key}`} text={f.label} help={f.help} />
      <textarea
        id={`sm-x-${f.key}`}
        ref={reg(f.key)}
        className="input mono sm-textarea"
        rows={3}
        value={valueOf(f.key)}
        placeholder={t('e.g. <gold>Welcome!')}
        onFocus={() => setActive(f.key)}
        onChange={(e) => setCur({ extra: { ...cur.extra, [f.key]: e.target.value } })}
        spellCheck={false}
      />
    </>
  );
  const specialTab = <ExtrasEditor mob={cur} onChange={setCur} textInput={textInput} />;

  const ridersTab = (
    <>
      <p className="note">{t('Riders sit on top of {entity}. A rider can carry riders of its own, so you can stack a whole tower.', { entity: entityName(cur.entity) })}</p>
      {riders.length > 0 && (
        <ul className="give-list">
          {riders.map((r, i) => (
            <li key={i}>
              <span className="give-list-name">
                {entityName(r.entity)}
                {r.name.trim() ? ` “${plainText(r.name).trim()}”` : ''}
                {(r.passengers?.length ?? 0) > 0 && <span className="note">{plural(count(r) - 1, ['+{n} on top', '+{n} on top'], ['+{n} navrchu', '+{n} navrchu', '+{n} navrchu'])}</span>}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => setPath([...path, i])}>
                {t('edit')}
              </button>
              <button type="button" className="btn btn-sm" aria-label={t('Remove rider {name}', { name: entityName(r.entity) })} onClick={() => setCur({ passengers: riders.filter((_, j) => j !== i) })}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="field">
        <Label text={t('Add a rider')} />
        <Combo
          label={t('Add a rider')}
          options={ENTITY_OPTIONS}
          onPick={(id) => {
            setCur({ passengers: [...riders, defaultMob(id)] });
            // The new rider isn't in `root` yet, so the path can't be checked against it here.
            setPathRaw([...path, riders.length]);
            setTab('entity');
          }}
          placeholder={t('search entities…')}
          allowCustom
          clearOnPick
        />
        <span className="note">{t('Adding one opens it for editing; the chain at the top takes you back down.')}</span>
      </div>
    </>
  );

  // The chain from the bottom entity to the one being edited.
  const chain = path.map((_, i) => path.slice(0, i + 1));
  const breadcrumb =
    count(root) > 1 ? (
      <nav className="sm-chain" aria-label={t('Which entity you edit')}>
        <span className="give-inline-label">{t('editing:')}</span>
        {[[] as number[], ...chain].map((p, i) => (
          <span key={i} className="inline">
            {i > 0 && <span aria-hidden="true">›</span>}
            <button type="button" className="btn btn-sm" aria-current={p.length === path.length ? 'true' : undefined} onClick={() => setPath(p)}>
              {entityName(at(root, p).entity)}
            </button>
          </span>
        ))}
      </nav>
    ) : null;

  const preview = (
    <Panel title={t('preview')}>
      <div className="sm-tree">
        <EntityCard m={root} path={[]} current={path} onPick={(p) => setPath(p)} />
      </div>
      <p className="note">{count(root) > 1 ? t('Riders are drawn above what they ride. Click one to edit it.') : t('Add riders on the Riders tab to stack entities.')}</p>
    </Panel>
  );

  const ok = len <= 256;
  const output = (
    <Panel
      title={t('command')}
      actions={
        <span className="inline">
          <CopyButton text={result.command} label={t('copy')} />
          <CopyButton text={result.command.slice(1)} label={t('copy for command block')} />
        </span>
      }
    >
      <pre className="give-cmd mono">{result.command}</pre>
      <p className={`note mono ${ok ? '' : 'give-warn'}`}>
        {t('{n} / 256 characters', { n: len })} · {ok ? t('fits in chat') : t('too long for chat: paste it into a command block instead')}
      </p>
      {result.notes.map((n) => (
        <p key={n} className="note give-warn">
          {n}
        </p>
      ))}
      <div className="field">
        <label htmlFor="sm-ver">{t('Minecraft version')}</label>
        <select id="sm-ver" className="select" value={version} onChange={(e) => setVersion(e.target.value as GiveVersion)}>
          {GIVE_VERSIONS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <span className="note">{t('Gear, names and a few other fields are written differently before 1.21.5. Older than 1.20.5 isn’t supported.')}</span>
      </div>
      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => replaceWith({ root: defaultMob('zombie') }, t('Started over'))}>
        {t('start over')}
      </button>
    </Panel>
  );

  return (
    <Workbench preview={preview} output={output}>
      <section className="panel" aria-label={t('Presets')}>
        <div className="opt-row">
          <h2 className="panel-title">{t('// start from')}</h2>
        </div>
        <div className="seg">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn btn-sm" onClick={() => replaceWith(p.make(), t('Loaded the “{preset}” preset', { preset: p.label }))}>
              {p.label}
            </button>
          ))}
        </div>
        {undo && (
          <UndoBar
            text={undo.text}
            onUndo={() => {
              setRootRaw(undo.prev.root);
              setPos(undo.prev.pos);
              setPathRaw([]);
            }}
            onClose={() => setUndo(null)}
          />
        )}
      </section>
      <section className="panel give-editor" aria-label={t('Entity editor')}>
        {breadcrumb}
        <Tabs tabs={tabs} value={tab} onChange={setTab} label={t('Entity settings')} idPrefix="summon" />
        <TabPanel idPrefix="summon" id={tab}>
          {tab === 'entity' && entityTab}
          {tab === 'place' && placeTab}
          {tab === 'special' && specialTab}
          {tab === 'riders' && ridersTab}
        </TabPanel>
      </section>
      <SavedPanel<MobSpec>
        slug="summon-generator"
        title={t('my entities')}
        help={t('Keep entities you made (with their riders) and load them again later. Saved in this browser; Backup (bottom of the page) copies them to another computer.')}
        suggestName={() => plainText(root.name).trim() || entityName(root.entity)}
        getData={() => root}
        onLoad={(d) => {
          setRootRaw(fix(d));
          setPathRaw([]);
        }}
        describe={(i) => `${entityName(i.data.entity)}${count(i.data) > 1 ? ` · ${plural(count(i.data) - 1, ['{n} rider', '{n} riders'], ['{n} jezdec', '{n} jezdci', '{n} jezdců'])}` : ''}`}
        emptyText={t('No saved entities yet. Build one and press save.')}
      />
    </Workbench>
  );
}
