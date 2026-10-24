import { useRef, useState } from 'react';
import { Help } from '../../../components/Help';
import { Segmented } from '../../../components/ui';
import { useSaved } from '../../../lib/saved';
import { defaultMob, type MobSpec } from '../../../lib/mc/entity';
import { kindOf, slotsOf, statesOf, type BlockData, type SignSide } from '../../../lib/mc/blocks';
import { DYE_COLORS, EFFECTS, ENTITIES, ENTITY_BY_ID, ITEMS, label } from '../give/data';
import { Combo } from '../give/Pickers';
import { MiniToolbar } from '../MiniToolbar';
import { ClickHoverBar } from '../tellraw/ClickHoverBar';
import { StackPicker } from '../summon/ExtrasEditor';
import { t } from '../../../lib/i18n-core';

const MOB_OPTIONS = ENTITIES.filter((e) => e.alive).map((e) => ({ id: e.id, name: e.name }));
const DISCS = ITEMS.filter((i) => i.id.startsWith('music_disc_')).map((i) => ({ id: i.id, name: i.name }));

/** The block's states as lists; "default" leaves a state to the game. */
export function StatesEditor({ block, states, onChange }: { block: string; states: Record<string, string>; onChange: (s: Record<string, string>) => void }) {
  const defs = statesOf(block);
  if (!defs.length) return null;
  return (
    <div className="field">
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <span className="field-label">{t('Block states')}</span>
        <Help label={t('Block states')} text={t('How the block is placed: which way it faces, top or bottom half, lit, age… Only what you pick goes into the command; the rest is what the game gives it.')} />
      </span>
      <div className="fields">
        {defs.map((d) => (
          <label key={d.name} className="field">
            <span className="field-label mono">{d.name}</span>
            <select
              className="select"
              value={states[d.name] ?? ''}
              onChange={(e) => {
                const next = { ...states };
                if (e.target.value === '') delete next[d.name];
                else next[d.name] = e.target.value;
                onChange(next);
              }}
            >
              {/* The game data gives signs and banners a default rotation of 8 where the game uses 0, so that one shows no value. */}
              <option value="">{d.name === 'rotation' ? t('default') : t('default ({value})', { value: d.def })}</option>
              {d.values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

type Key = `front${0 | 1 | 2 | 3}` | `back${0 | 1 | 2 | 3}` | 'name';

function Num({ id, label: text, value, onChange, placeholder, help }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string; help?: string }) {
  return (
    <div className="field">
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <label htmlFor={id} className="field-label">
          {text}
        </label>
        {help && <Help label={text} text={help} />}
      </span>
      <input id={id} className="input mono" type="number" min={0} step="any" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** What the block holds, for the kinds of blocks that hold something (see src/lib/mc/blocks.ts). */
export function BlockDataEditor({ block, data, onChange }: { block: string; data: BlockData; onChange: (p: Partial<BlockData>) => void }) {
  const kind = kindOf(block);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const savedMobs = useSaved<MobSpec>('summon-generator');

  // ---- MiniMessage fields: the toolbars edit whichever one was focused last ----
  const fields = useRef(new Map<Key, HTMLInputElement>());
  const [active, setActive] = useState<Key>('front0');
  const valueOf = (k: Key) => (k === 'name' ? data.name : data[k.startsWith('front') ? 'front' : 'back'].lines[Number(k.slice(-1))]);
  const setValue = (k: Key, v: string) => {
    if (k === 'name') return onChange({ name: v });
    const s = k.startsWith('front') ? 'front' : 'back';
    const lines = [...data[s].lines] as SignSide['lines'];
    lines[Number(k.slice(-1))] = v;
    onChange({ [s]: { ...data[s], lines } });
  };
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
    const at = el?.selectionEnd ?? value.length;
    setValue(active, value.slice(0, at) + text + value.slice(at));
  };
  const reg = (k: Key) => (el: HTMLInputElement | null) => {
    if (el) fields.current.set(k, el);
    else fields.current.delete(k);
  };

  const nameField = (help: string) => (
    <div className="field">
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <label htmlFor="sb-name" className="field-label">
          {t('Name')}
        </label>
        <Help label={t('Name')} text={help} />
      </span>
      <input id="sb-name" ref={reg('name')} className="input mono" value={data.name} placeholder={t('e.g. <gold>Treasure')} onFocus={() => setActive('name')} onChange={(e) => onChange({ name: e.target.value })} spellCheck={false} />
    </div>
  );

  if (!kind) return null;

  if (kind === 'sign') {
    const s = data[side];
    const setSideP = (p: Partial<SignSide>) => onChange({ [side]: { ...s, ...p } });
    return (
      <>
        <div className="opt-row">
          <span className="opt-label" id="sb-side">
            {t('Side')}
          </span>
          <Segmented
            labelledBy="sb-side"
            value={side}
            onChange={setSide}
            options={[
              { value: 'front', label: t('front') },
              { value: 'back', label: t('back') },
            ]}
          />
        </div>
        <MiniToolbar onWrap={wrap} onInsert={insert} placeholders={[]} hint={t('Click into a line, then pick a color or style.')} />
        <ClickHoverBar onWrap={wrap} onInsert={insert} chat={false} sign />
        {s.lines.map((line, i) => {
          const k = `${side}${i}` as Key;
          return (
            <input
              key={k}
              ref={reg(k)}
              className="input mono"
              aria-label={t('Line {n}', { n: i + 1 })}
              value={line}
              placeholder={t('Line {n}', { n: i + 1 })}
              onFocus={() => setActive(k)}
              onChange={(e) => setValue(k, e.target.value)}
              spellCheck={false}
            />
          );
        })}
        <div className="field">
          <span className="field-label">{t('Text color')}</span>
          <div className="give-dyes">
            {DYE_COLORS.map(([n, hex]) => (
              <button
                key={n}
                type="button"
                className="give-dye"
                style={{ background: hex }}
                aria-pressed={(s.color || 'black') === n}
                aria-label={label(n)}
                title={label(n)}
                onClick={() => setSideP({ color: n === 'black' ? '' : n })}
              />
            ))}
          </div>
        </div>
        <div className="check-grid">
          <label className="check">
            <input type="checkbox" checked={s.glow} onChange={(e) => setSideP({ glow: e.target.checked })} />
            {t('Glowing text')}
          </label>
          <label className="check" title={t('Players can\'t edit it any more (like honeycomb).')}>
            <input type="checkbox" checked={data.waxed} onChange={(e) => onChange({ waxed: e.target.checked })} />
            {t('Waxed')}
          </label>
        </div>
      </>
    );
  }

  if (kind === 'container') {
    const max = slotsOf(block);
    return (
      <>
        <div className="field">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="field-label">{t('Items inside')}</span>
            <Help label={t('Items inside')} text={t('In slot order, from the top left. Pick plain items or ones from “my items” in the give generator.')} />
          </span>
          {data.items.map((st, i) => (
            <div key={i} className="sm-item-row">
              <StackPicker label={t('Slot {n}', { n: i + 1 })} value={st} onChange={(v) => onChange({ items: data.items.map((x, j) => (j === i ? (v ?? { item: '', count: 1 }) : x)) })} />
              <button type="button" className="btn btn-sm" aria-label={t('Remove slot {n}', { n: i + 1 })} onClick={() => onChange({ items: data.items.filter((_, j) => j !== i) })}>
                ×
              </button>
            </div>
          ))}
          {data.items.length < max && (
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ items: [...data.items, { item: '', count: 1 }] })}>
              {t('+ add item')}
            </button>
          )}
        </div>
        <div className="fields">
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <label htmlFor="sb-loot" className="field-label">
                {t('Or a loot table')}
              </label>
              <Help
                label={t('Or a loot table')}
                text={t('Filled at random the first time it\'s opened, like a dungeon chest (e.g. minecraft:chests/end_city_treasure). Used instead of the items above.')}
              />
            </span>
            <input id="sb-loot" className="input mono" value={data.lootTable} placeholder="minecraft:chests/simple_dungeon" spellCheck={false} onChange={(e) => onChange({ lootTable: e.target.value })} /* i18n-ignore */ />
          </div>
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <label htmlFor="sb-lock" className="field-label">
                {t('Lock (key name)')}
              </label>
              <Help label={t('Lock (key name)')} text={t('Opens only for a player holding an item renamed to exactly this (in an anvil).')} />
            </span>
            <input id="sb-lock" className="input mono" value={data.lock} placeholder={t('e.g. Secret key')} spellCheck={false} onChange={(e) => onChange({ lock: e.target.value })} />
          </div>
        </div>
        <MiniToolbar onWrap={wrap} onInsert={insert} placeholders={[]} hint={t('Click into the name, then pick a color or style.')} />
        {nameField(t('The title shown when it\'s opened. Leave empty for the normal one.'))}
      </>
    );
  }

  if (kind === 'spawner') {
    const mob = data.mob;
    return (
      <>
        <div className="fields">
          <div className="field">
            <span className="field-label">{t('Spawns')}</span>
            <Combo label={t('Spawns')} options={MOB_OPTIONS} value={mob?.entity} onPick={(id) => onChange({ mob: defaultMob(id) })} placeholder={t('search mobs…')} allowCustom />
          </div>
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <span className="field-label">{t('Or one of my entities')}</span>
              <Help label={t('Or one of my entities')} text={t('An entity saved in the summon generator, with its name, gear, effects and riders.')} />
            </span>
            <select
              className="select"
              aria-label={t('Or one of my entities')}
              value=""
              disabled={!savedMobs.items.length}
              title={savedMobs.items.length ? undefined : t('Save an entity in the summon generator first to use it here')}
              onChange={(e) => {
                const it = savedMobs.items.find((x) => x.id === e.target.value);
                if (it) onChange({ mob: it.data });
              }}
            >
              <option value="">{t('my entities…')}</option>
              {savedMobs.items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {mob && <p className="note">{t('Spawns: {mob}', { mob: ENTITY_BY_ID.get(mob.entity)?.name ?? mob.entity })}</p>}
        <div className="fields">
          <Num id="sb-delay" label={t('First spawn after (seconds)')} value={data.delay} placeholder="1" onChange={(delay) => onChange({ delay })} />
          <Num id="sb-min" label={t('Then every (seconds), at least')} value={data.minDelay} placeholder="10" onChange={(minDelay) => onChange({ minDelay })} />
          <Num id="sb-max" label={t('…at most')} value={data.maxDelay} placeholder="40" onChange={(maxDelay) => onChange({ maxDelay })} />
          <Num id="sb-count" label={t('How many at once')} value={data.count} placeholder="4" onChange={(count) => onChange({ count })} />
          <Num id="sb-range" label={t('Spawn area (blocks)')} value={data.range} placeholder="4" onChange={(range) => onChange({ range })} help={t('How far from the spawner they appear.')} />
          <Num id="sb-near" label={t('Stops at (mobs nearby)')} value={data.maxNearby} placeholder="6" onChange={(maxNearby) => onChange({ maxNearby })} />
          <Num id="sb-player" label={t('Works when a player is within (blocks)')} value={data.playerRange} placeholder="16" onChange={(playerRange) => onChange({ playerRange })} />
        </div>
      </>
    );
  }

  if (kind === 'command') {
    return (
      <>
        <div className="field">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <label htmlFor="sb-cmd" className="field-label">
              {t('Command')}
            </label>
            <Help label={t('Command')} text={t('What the command block runs. Facing and “conditional” are block states above; a chain or repeating block is another block (chain_command_block, repeating_command_block).')} />
          </span>
          <textarea id="sb-cmd" className="input mono sm-textarea" rows={2} value={data.command} placeholder="say Hello" spellCheck={false} onChange={(e) => onChange({ command: e.target.value })} /* i18n-ignore */ />
        </div>
        <label className="check">
          <input type="checkbox" checked={data.auto} onChange={(e) => onChange({ auto: e.target.checked })} />
          {t('Always active (no redstone needed)')}
        </label>
        <MiniToolbar onWrap={wrap} onInsert={insert} placeholders={[]} hint={t('Click into the name, then pick a color or style.')} />
        {nameField(t('Shown instead of @ when its command writes in chat (say, tell…).'))}
      </>
    );
  }

  if (kind === 'head')
    return (
      <div className="field">
        <label htmlFor="sb-head" className="field-label">
          {t('Player')}
        </label>
        <input id="sb-head" className="input mono" value={data.head} placeholder="Notch" spellCheck={false} onChange={(e) => onChange({ head: e.target.value })} /* i18n-ignore */ />
        <span className="note">{t('The head shows this player\'s skin.')}</span>
      </div>
    );

  if (kind === 'beacon')
    return (
      <div className="fields">
        {(['primary', 'secondary'] as const).map((k) => (
          <label key={k} className="field">
            <span className="field-label">{k === 'primary' ? t('Main effect') : t('Second effect')}</span>
            <select className="select" value={data[k]} onChange={(e) => onChange({ [k]: e.target.value })}>
              <option value="">{t('none')}</option>
              {EFFECTS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <p className="note sm-wide">{t('It only gives effects on a full pyramid of iron, gold, emerald, diamond or netherite blocks.')}</p>
      </div>
    );

  if (kind === 'jukebox')
    return (
      <div className="field">
        <span className="field-label">{t('Music disc')}</span>
        <Combo label={t('Music disc')} options={DISCS} value={data.stack?.item} onPick={(id) => onChange({ stack: { item: id, count: 1 } })} placeholder={t('search discs…')} allowCustom />
      </div>
    );

  // lectern
  return (
    <>
      <div className="field">
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <span className="field-label">{t('Book')}</span>
          <Help label={t('Book')} text={t('Write the book in the give generator (written book) and save it to “my items”, then pick it here.')} />
        </span>
        <StackPicker label={t('Book')} value={data.stack} onChange={(stack) => onChange({ stack })} max={1} />
      </div>
      <Num id="sb-page" label={t('Open at page')} value={data.page} placeholder="1" onChange={(page) => onChange({ page })} />
    </>
  );
}
