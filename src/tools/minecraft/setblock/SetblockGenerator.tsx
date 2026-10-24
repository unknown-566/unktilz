import { Suspense, lazy, useMemo, useState } from 'react';
import { SavedPanel, UndoBar } from '../../../components/SavedPanel';
import { useAutosave } from '../../../lib/saved';
import { MiniText } from '../../../lib/mc/minimessage';
import { Help } from '../../../components/Help';
import { CopyButton, Panel, Segmented } from '../../../components/ui';
import { Workbench } from '../../../components/Workbench';
import { GIVE_VERSIONS, type GiveVersion } from '../../../lib/mc/give';
import { defaultMob } from '../../../lib/mc/entity';
import { buildBlock, emptyBlock, emptyData, emptySide, kindOf, slotsOf, statesOf, type BlockSpec, type How, type Pos } from '../../../lib/mc/blocks';
import { BLOCKS, ITEM_BY_ID, label } from '../give/data';
import { Combo } from '../give/Pickers';
import { BlockDataEditor, StatesEditor } from './BlockDataEditor';
import { blockView } from './blockView';
import { fmtNum, t } from '../../../lib/i18n-core';

type Draft = { spec: BlockSpec; version: GiveVersion };

// three.js only loads when the tool is open.
const Block3D = lazy(() => import('./Block3D'));

const BLOCK_OPTIONS = BLOCKS.map((b) => ({ id: b.id, name: b.name }));
const BLOCK_NAME = new Map(BLOCKS.map((b) => [b.id, b.name]));
const blockName = (id: string) => BLOCK_NAME.get(id.replace(/^minecraft:/, '')) ?? label(id.replace(/^minecraft:/, ''));
/** The most commands listed on the page (a huge fill can make hundreds; "copy all" has every one). */
const SHOW_COMMANDS = 50;

/** Fills in anything an older saved block doesn't have yet. */
const fix = (s: Partial<BlockSpec>): BlockSpec => {
  const e = emptyBlock();
  const d = { ...e.data, ...s.data };
  return { ...e, ...s, data: { ...d, front: { ...emptySide(), ...d.front }, back: { ...emptySide(), ...d.back } } };
};

const PRESETS: { label: string; make: () => BlockSpec }[] = [
  {
    label: t('Chest full of diamonds'),
    make: () => ({ ...emptyBlock(), block: 'chest', data: { ...emptyData(), name: '<aqua>Treasure', items: Array.from({ length: 27 }, () => ({ item: 'diamond', count: 64 })) } }), // i18n-ignore: example text
  },
  {
    label: t('Sign with a clickable line'),
    make: () => ({
      ...emptyBlock(),
      block: 'oak_sign',
      data: {
        ...emptyData(),
        front: { lines: ['<dark_blue><bold>Welcome!', '', "<click:run_command:'/tp @s 0 100 0'><green>[Click]", '<gray>to go to spawn'], color: '', glow: false }, // i18n-ignore: example text
        waxed: true,
      },
    }),
  },
  { label: t('Zombie spawner'), make: () => ({ ...emptyBlock(), block: 'spawner', data: { ...emptyData(), mob: defaultMob('zombie'), minDelay: '5', maxDelay: '10', count: '2' } }) },
  {
    label: t('Repeating command block'),
    make: () => ({ ...emptyBlock(), block: 'repeating_command_block', states: { facing: 'up' }, data: { ...emptyData(), command: 'effect give @a minecraft:night_vision 15 0 true', auto: true } }), // i18n-ignore: a command
  },
  { label: t('Hollow glass box'), make: () => ({ ...emptyBlock(), mode: 'fill', block: 'glass', pos: ['~-4', '~-1', '~-4'], to: ['~4', '~5', '~4'], how: 'hollow' }) },
  { label: t('Clear the area'), make: () => ({ ...emptyBlock(), mode: 'fill', block: 'air', pos: ['~-10', '~', '~-10'], to: ['~10', '~10', '~10'] }) },
  { label: t('Replace dirt with grass'), make: () => ({ ...emptyBlock(), mode: 'fill', block: 'grass_block', pos: ['~-8', '~-3', '~-8'], to: ['~8', '~', '~8'], filter: 'dirt' }) },
];

function PosInput({ value, onChange, label: text }: { value: Pos; onChange: (p: Pos) => void; label: string }) {
  return (
    <div className="inline">
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <label key={axis} className="give-inline-label">
          {axis}
          <input
            className="input mono sm-num"
            aria-label={`${text} ${axis}`}
            value={value[i]}
            placeholder="~"
            spellCheck={false}
            onChange={(e) => onChange(value.map((p, j) => (j === i ? e.target.value : p)) as Pos)}
          />
        </label>
      ))}
    </div>
  );
}

/** A sign as the game draws it: dark text on wood, centered. */
function SignPreview({ spec }: { spec: BlockSpec }) {
  const side = spec.data.front;
  const color: Record<string, string> = { white: '#FFFFFF', orange: '#FF681F', magenta: '#FF00FF', light_blue: '#9AC0CD', yellow: '#FFFF00', lime: '#BFFF00', pink: '#FF69B4', gray: '#808080', light_gray: '#D3D3D3', cyan: '#00FFFF', purple: '#A020F0', blue: '#0000FF', brown: '#8B4513', green: '#00FF00', red: '#FF0000', black: '#000000' };
  const c = color[side.color || 'black'] ?? '#000000';
  return (
    <div className={`sb-sign${side.glow ? ' glow' : ''}`} style={{ color: c }}>
      {side.lines.map((l, i) => (
        <div key={i} className="sb-sign-line">
          {l ? <MiniText text={l} defaultColor={c} /> : ' '}
        </div>
      ))}
    </div>
  );
}

function ChestPreview({ spec }: { spec: BlockSpec }) {
  const slots = slotsOf(spec.block);
  const cols = slots === 5 ? 5 : slots === 9 ? 3 : 9;
  return (
    <div className="sb-grid" style={{ gridTemplateColumns: `repeat(${cols}, 34px)` }}>
      {Array.from({ length: slots }, (_, i) => {
        const s = spec.data.items[i];
        const id = s?.spec ? s.spec.item : s?.item;
        const name = id ? (ITEM_BY_ID.get(id)?.name ?? id) : '';
        return (
          <span key={i} className="sb-slot" title={name ? `${name} × ${s!.count}` : undefined}>
            {name && <span className="sb-slot-id">{name.slice(0, 3)}</span>}
            {name && s!.count > 1 && <span className="sb-slot-n">{s!.count}</span>}
          </span>
        );
      })}
    </div>
  );
}

export default function SetblockGenerator() {
  const [spec, setSpec] = useState<BlockSpec>(emptyBlock);
  const [version, setVersion] = useState<GiveVersion>('26.1');
  const [undo, setUndo] = useState<{ text: string; prev: BlockSpec } | null>(null);
  const set = (p: Partial<BlockSpec>) => setSpec((s) => ({ ...s, ...p }));
  const setData = (p: Partial<BlockSpec['data']>) => setSpec((s) => ({ ...s, data: { ...s.data, ...p } }));
  const draft = useMemo<Draft>(() => ({ spec, version }), [spec, version]);
  useAutosave<Draft>('setblock-generator', draft, (d) => {
    setSpec(fix(d.spec));
    setVersion(d.version ?? '26.1');
  });
  const replaceWith = (next: BlockSpec, text: string) => {
    if (JSON.stringify(spec) !== JSON.stringify(emptyBlock())) setUndo({ text, prev: spec });
    setSpec(next);
  };

  const result = useMemo(() => buildBlock(spec, version), [spec, version]);
  const view = useMemo(() => blockView(spec, result.commands), [spec, result.commands]);
  const fill = spec.mode === 'fill';
  const kind = kindOf(spec.block);
  const hows: { value: How; label: string }[] = [
    { value: 'replace', label: t('replace') },
    { value: 'destroy', label: t('break (drops)') },
    { value: 'keep', label: t('only into air') },
    ...(fill
      ? [
          { value: 'hollow' as How, label: t('hollow box') },
          { value: 'outline' as How, label: t('only the shell') },
        ]
      : []),
    { value: 'strict', label: t('no updates') },
  ];

  const preview = (
    <Panel title={t('preview')}>
      <Suspense fallback={<div className="shape3d" style={{ height: 260 }} />}>
        <Block3D view={view} />
      </Suspense>
      <div className="sb-summary">
        <b>{blockName(spec.block)}</b>
        {Object.keys(spec.states).length > 0 && <span className="note mono">{Object.entries(spec.states).map(([k, v]) => `${k}=${v}`).join(', ')}</span>}
        {fill &&
          (result.dims ? (
            <span className="note">
              {t('{x} × {y} × {z} = {n} blocks', { x: result.dims[0], y: result.dims[1], z: result.dims[2], n: fmtNum(result.volume ?? 0) })}
            </span>
          ) : (
            <span className="note">{t('size unknown (^ or mixed corners)')}</span>
          ))}
      </div>
      {kind === 'sign' && <SignPreview spec={spec} />}
      {kind === 'container' && <ChestPreview spec={spec} />}
    </Panel>
  );

  const shown = result.commands.slice(0, SHOW_COMMANDS);
  const output = (
    <Panel
      title={result.commands.length > 1 ? t('commands ({n})', { n: result.commands.length }) : t('command')}
      actions={
        <span className="inline">
          <CopyButton text={result.commands.join('\n')} label={result.commands.length > 1 ? t('copy all') : t('copy')} />
          <CopyButton text={result.commands.map((c) => c.slice(1)).join('\n')} label={t('copy for command block')} />
        </span>
      }
    >
      {shown.map((c, i) => (
        <div key={i} className="tr-cmd">
          <pre className="give-cmd mono">{c}</pre>
          <p className={`note mono ${c.length <= 256 ? '' : 'give-warn'}`}>
            {t('{n} / 256 characters', { n: c.length })} · {c.length <= 256 ? t('fits in chat') : t('too long for chat: paste it into a command block instead')}
          </p>
        </div>
      ))}
      {result.commands.length > SHOW_COMMANDS && <p className="note">{t('…and {n} more (all of them are in “copy all”).', { n: result.commands.length - SHOW_COMMANDS })}</p>}
      {result.notes.map((n) => (
        <p key={n} className="note give-warn">
          {n}
        </p>
      ))}
      <div className="field">
        <label htmlFor="sb-ver">{t('Minecraft version')}</label>
        <select id="sb-ver" className="select" value={version} onChange={(e) => setVersion(e.target.value as GiveVersion)}>
          {GIVE_VERSIONS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <span className="note">{t('Sign text and names are written differently before 1.21.5; “no updates” and a filter with another mode need 1.21.5.')}</span>
      </div>
      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => replaceWith({ ...emptyBlock(), mode: spec.mode }, t('Started over'))}>
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
        {undo && <UndoBar text={undo.text} onUndo={() => setSpec(undo.prev)} onClose={() => setUndo(null)} />}
      </section>

      <section className="panel" aria-label={t('Block editor')}>
        <div className="opt-row">
          <span className="opt-label" id="sb-mode">
            {t('Place')}
          </span>
          <Segmented
            labelledBy="sb-mode"
            value={spec.mode}
            onChange={(mode) => set({ mode, how: mode === 'setblock' && (spec.how === 'hollow' || spec.how === 'outline') ? 'replace' : spec.how })}
            options={[
              { value: 'setblock', label: t('one block (/setblock)') },
              { value: 'fill', label: t('an area (/fill)') },
            ]}
          />
        </div>
        <div className="field">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="field-label">{t('Block')}</span>
            <Help label={t('Block')} text={t('Type part of the name (English) or the id. Air empties the place.')} />
          </span>
          <Combo
            label={t('Block')}
            options={BLOCK_OPTIONS}
            value={spec.block}
            onPick={(id) => {
              // States and contents belong to the old block; keep what still fits.
              const names = new Set(statesOf(id).map((s) => s.name));
              set({ block: id, states: Object.fromEntries(Object.entries(spec.states).filter(([k]) => names.has(k))) });
            }}
            placeholder={t('search blocks…')}
            allowCustom
          />
        </div>
        <StatesEditor block={spec.block} states={spec.states} onChange={(states) => set({ states })} />

        <hr className="divider" />
        <div className="field">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="field-label">{fill ? t('From corner') : t('Position')}</span>
            <Help label={t('Position')} text={t('~ is where the command runs (you, or the command block) and ~2 is 2 blocks further. ^ ^ ^3 is 3 blocks in front of where you look. A plain number is an exact coordinate.')} />
          </span>
          <PosInput label={fill ? t('From corner') : t('Position')} value={spec.pos} onChange={(pos) => set({ pos })} />
        </div>
        {fill && (
          <>
            <div className="field">
              <span className="field-label">{t('To corner')}</span>
              <PosInput label={t('To corner')} value={spec.to} onChange={(to) => set({ to })} />
            </div>
            <div className="seg">
              <button type="button" className="btn btn-sm" onClick={() => set({ pos: ['~-2', '~', '~-2'], to: ['~2', '~4', '~2'] })}>
                {t('5×5 around me')}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => set({ pos: ['~-5', '~-1', '~-5'], to: ['~5', '~-1', '~5'] })}>
                {t('floor under me (11×11)')}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => set({ pos: ['~-16', '~', '~-16'], to: ['~15', '~31', '~15'] })}>
                {t('32×32×32 around me')}
              </button>
            </div>
          </>
        )}
        {!fill && (
          <div className="seg">
            <button type="button" className="btn btn-sm" onClick={() => set({ pos: ['~', '~', '~'] })}>
              {t('where I stand')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => set({ pos: ['~', '~-1', '~'] })}>
              {t('under me')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => set({ pos: ['^', '^', '^2'] })}>
              {t('2 blocks in front of me')}
            </button>
          </div>
        )}

        <div className="opt-row">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="opt-label" id="sb-how">
              {t('What is there')}
            </span>
            <Help
              label={t('What is there')}
              text={t('Replace: whatever is there goes, without drops. Break: like mining it, with drops. Only into air: keeps every other block. Hollow box: walls of the block, air inside. Only the shell: walls, inside left as it is. No updates: sand doesn\'t fall, water doesn\'t flow, redstone doesn\'t react.')}
            />
          </span>
          <Segmented labelledBy="sb-how" compact value={spec.how} onChange={(how) => set({ how })} options={hows} />
        </div>
        {fill && (
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <label htmlFor="sb-filter" className="field-label">
                {t('Only replace')}
              </label>
              <Help label={t('Only replace')} text={t('Leave empty to fill everything. A block (dirt) or a group of blocks with # (#minecraft:logs, #minecraft:leaves): only those are replaced.')} />
            </span>
            <input id="sb-filter" className="input mono" value={spec.filter} placeholder={t('e.g. dirt or #minecraft:logs')} spellCheck={false} onChange={(e) => set({ filter: e.target.value })} />
          </div>
        )}

        {kind && (
          <>
            <hr className="divider" />
            <span className="field-label">{t('What it holds')}</span>
            <BlockDataEditor block={spec.block} data={spec.data} onChange={setData} />
          </>
        )}
      </section>

      <SavedPanel<BlockSpec>
        slug="setblock-generator"
        title={t('my blocks')}
        help={t('Keep blocks you made (a chest with loot, a sign…) and load them again later. Saved in this browser; Backup (bottom of the page) copies them to another computer.')}
        suggestName={() => blockName(spec.block)}
        getData={() => spec}
        onLoad={(d) => setSpec(fix(d))}
        describe={(i) => `${blockName(i.data.block)} · ${i.data.mode === 'fill' ? '/fill' : '/setblock'}`}
        emptyText={t('No saved blocks yet. Make one and press save.')}
      />
    </Workbench>
  );
}
