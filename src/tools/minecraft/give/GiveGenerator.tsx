import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SavedPanel, UndoBar } from '../../../components/SavedPanel';
import { useAutosave } from '../../../lib/saved';
import { plainText } from '../../../lib/mc/minimessage';
import { Help } from '../../../components/Help';
import { CopyButton, Panel, Segmented, TabPanel, Tabs, Toggle, type TabDef } from '../../../components/ui';
import { Workbench } from '../../../components/Workbench';
import { GIVE_VERSIONS, atLeast, buildGive, eggEntity, emptySpec, itemKinds, type Attr, type Explosion, type GiveVersion, type HideKey, type ItemSpec } from '../../../lib/mc/give';
import { defaultMob, type MobSpec } from '../../../lib/mc/entity';
import { MiniToolbar } from '../MiniToolbar';
import { ATTRIBUTES, BLOCKS, DYE_COLORS, ENCHANTS, FIREWORK_SHAPES, ITEMS, ITEM_BY_ID, MOB_BY_ID, POTIONS, SLOTS, TRIM_MATERIALS, TRIM_PATTERNS, enchantFits, label } from './data';
import { EffectList, MobEditor } from './MobEditor';
import { Combo, MultiPick } from './Pickers';
import { Tooltip } from './Tooltip';

type Tab = 'item' | 'text' | 'enchants' | 'attributes' | 'special' | 'spawns' | 'adventure';
/** Where the item in progress was kept before it moved to src/lib/saved.ts. */
const OLD_STORE = 'unktilz-give';
/** Since 1.20.5 enchantment levels in item components go from 1 to 255; the game rejects more. */
const MAX_LEVEL = 255;
const TARGETS = [
  { value: '@p', label: '@p · nearest player' },
  { value: '@s', label: '@s · yourself' },
  { value: '@a', label: '@a · every player' },
  { value: '@r', label: '@r · random player' },
  { value: 'name', label: 'a specific player…' },
];
const ITEM_OPTIONS = ITEMS.map((i) => ({ id: i.id, name: i.name }));
const BLOCK_OPTIONS = BLOCKS.map((b) => ({ id: b.id, name: b.name }));
const ENCH_OPTIONS = ENCHANTS.map((e) => ({ id: e.id, name: e.name }));

/** Ready-made starting points for people who don't know what's possible. */
const PRESETS: { label: string; make: () => ItemSpec }[] = [
  {
    label: 'OP sword',
    make: () => ({
      ...emptySpec(),
      item: 'netherite_sword',
      name: '<gold><bold>Excalibur',
      lore: ['<gray>Forged in the void.'],
      enchants: [
        { id: 'sharpness', level: 10 },
        { id: 'looting', level: 5 },
        { id: 'fire_aspect', level: 2 },
        { id: 'sweeping_edge', level: 3 },
      ],
      unbreakable: true,
      rarity: 'epic',
    }),
  },
  {
    label: 'Speed potion',
    make: () => ({ ...emptySpec(), item: 'potion', name: '<aqua>Zoom Juice', potionColor: '#55ffff', effects: [{ id: 'speed', level: 3, seconds: 300, particles: true, icon: true }] }),
  },
  { label: 'Player head', make: () => ({ ...emptySpec(), item: 'player_head', head: 'Notch' }) },
  {
    label: 'Firework',
    make: () => ({ ...emptySpec(), item: 'firework_rocket', count: 16, flight: 2, explosions: [{ shape: 'star', colors: ['#FED83D', '#F9801D'], fades: ['#B02E26'], trail: true, twinkle: true }] }),
  },
  {
    label: 'Signed book',
    make: () => ({ ...emptySpec(), item: 'written_book', bookTitle: 'Server rules', bookAuthor: 'Admin', bookPages: ['<bold>Welcome!</bold>\nBe nice and have fun.', '<red>No griefing.'] }),
  },
  {
    label: 'Boss zombie',
    make: () => ({
      ...emptySpec(),
      item: 'zombie_spawn_egg',
      name: '<dark_red>Boss Egg',
      mob: {
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
    label: 'Giant stick',
    make: () => ({ ...emptySpec(), item: 'stick', name: 'Growth Stick', attributes: [{ type: 'scale', slot: 'hand', amount: 1, op: 'add_multiplied_base' }] }),
  },
];

/** Fills in anything an older saved item doesn't have yet. */
const fix = (s: Partial<ItemSpec>): ItemSpec => ({ ...emptySpec(), ...s, hide: { ...emptySpec().hide, ...s.hide }, mob: s.mob && { ...defaultMob(), ...s.mob } });
/** A spawn egg's mob: what it's set to, or the egg's own mob. */
const mobOf = (s: ItemSpec): MobSpec => s.mob ?? defaultMob(eggEntity(s.item));
/** Whether the mob is just the egg's own, unchanged. */
const plainMob = (s: ItemSpec) => JSON.stringify(mobOf(s)) === JSON.stringify(defaultMob(eggEntity(s.item)));

type Draft = { spec: ItemSpec; version: GiveVersion };

function legacyDraft(): Draft | undefined {
  try {
    const s = JSON.parse(localStorage.getItem(OLD_STORE) ?? 'null');
    if (s?.spec) return { spec: s.spec, version: s.version ?? '26.1' };
  } catch {
    /* ignore */
  }
  return undefined;
}

function Row({ id, label: text, help, children }: { id: string; label: string; help?: string; children: ReactNode }) {
  return (
    <div className="opt-row">
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <span className="opt-label" id={id}>
          {text}
        </span>
        {help && <Help label={text} text={help} />}
      </span>
      {children}
    </div>
  );
}

const HIDE_LABELS: { key: HideKey; label: string }[] = [
  { key: 'enchantments', label: 'enchantments' },
  { key: 'attributes', label: 'attributes' },
  { key: 'unbreakable', label: 'unbreakable' },
  { key: 'adventure', label: 'can place / break' },
  { key: 'dye', label: 'dye color' },
  { key: 'trim', label: 'armor trim' },
  { key: 'other', label: 'potion / book / firework info' },
];

export default function GiveGenerator() {
  const [spec, setSpecRaw] = useState<ItemSpec>(emptySpec);
  const [version, setVersion] = useState<GiveVersion>('26.1');
  const [tab, setTab] = useState<Tab>('item');
  const [targetMode, setTargetMode] = useState('@p');
  const [undo, setUndo] = useState<{ text: string; prev: ItemSpec } | null>(null);
  const set = (p: Partial<ItemSpec>) => setSpecRaw((s) => ({ ...s, ...p }));
  /** Replaces the whole item (preset, saved item, start over) and keeps the target picker in step. */
  const setSpec = (next: ItemSpec) => {
    setSpecRaw(next);
    setTargetMode(TARGETS.some((t) => t.value === next.target) ? next.target : 'name');
  };
  const draft = useMemo<Draft>(() => ({ spec, version }), [spec, version]);
  useAutosave<Draft>(
    'give-generator',
    draft,
    (d) => {
      setSpec(fix(d.spec));
      setVersion(d.version);
    },
    legacyDraft,
  );
  const isBlank = (s: ItemSpec) => JSON.stringify({ ...s, target: '' }) === JSON.stringify({ ...emptySpec(), target: '' });
  /** Loads another item over the current one; anything you'd built can be brought back with undo. */
  const replaceWith = (next: ItemSpec, text: string) => {
    if (!isBlank(spec)) setUndo({ text, prev: spec });
    setSpec(next);
  };
  useEffect(() => {
    try {
      localStorage.removeItem(OLD_STORE);
    } catch {
      /* ignore */
    }
  }, []);

  /** Picking another egg swaps the mob too, unless you'd made that mob your own. */
  const pickItem = (id: string) => set(spec.mob && plainMob(spec) ? { item: id, mob: undefined } : { item: id });
  const setMob = (p: Partial<MobSpec>) => setSpecRaw((s) => ({ ...s, mob: { ...mobOf(s), ...p } }));
  const kinds = itemKinds(spec.item);
  const info = ITEM_BY_ID.get(spec.item);
  // One extra tab for whatever this item has of its own; leather armor gets color and trim.
  const special = [kinds.potion && 'Potion', kinds.dye && 'Color', kinds.trim && 'Trim', kinds.head && 'Head', kinds.book && 'Book', (kinds.firework || kinds.star) && 'Firework']
    .filter(Boolean)
    .join(' & ');
  const result = useMemo(() => buildGive(spec, version), [spec, version]);
  const len = result.command.length;

  const tabs: TabDef<Tab>[] = [
    { id: 'item', label: 'Item' },
    { id: 'text', label: 'Name & lore', dot: !!spec.name.trim() || spec.lore.some((l) => l.trim()) },
    { id: 'enchants', label: 'Enchants', dot: spec.enchants.length > 0 },
    { id: 'attributes', label: 'Attributes', dot: spec.attributes.length > 0 },
    ...(special ? [{ id: 'special' as Tab, label: special }] : []),
    ...(kinds.spawnEgg ? [{ id: 'spawns' as Tab, label: 'Spawns', dot: !plainMob(spec) }] : []),
    { id: 'adventure', label: 'Adventure', dot: spec.canBreak.length + spec.canPlaceOn.length > 0 },
  ];
  useEffect(() => {
    if ((tab === 'special' && !special) || (tab === 'spawns' && !kinds.spawnEgg)) setTab('item');
  }, [tab, special, kinds.spawnEgg]);

  // ---- MiniMessage fields: the toolbar edits whichever one was focused last ----
  const fields = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement>());
  const [active, setActive] = useState('name');
  const valueOf = (key: string) =>
    key === 'name' ? spec.name : key === 'mob' ? mobOf(spec).name : key.startsWith('lore:') ? spec.lore[+key.slice(5)] ?? '' : spec.bookPages[+key.slice(5)] ?? '';
  const setValue = (key: string, v: string) => {
    if (key === 'name') set({ name: v });
    else if (key === 'mob') setMob({ name: v });
    else if (key.startsWith('lore:')) set({ lore: spec.lore.map((l, i) => (i === +key.slice(5) ? v : l)) });
    else set({ bookPages: spec.bookPages.map((l, i) => (i === +key.slice(5) ? v : l)) });
  };
  const edit = (insert: (value: string, start: number, end: number) => { next: string; selStart: number; selEnd: number }) => {
    const el = fields.current.get(active);
    const value = valueOf(active);
    let start = el?.selectionStart ?? value.length;
    let end = el?.selectionEnd ?? value.length;
    if (start === end) [start, end] = [0, value.length];
    const r = insert(value, start, end);
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
  const reg = (key: string) => (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el) fields.current.set(key, el);
    else fields.current.delete(key);
  };

  // ---- tabs ----
  const itemTab = (
    <>
      <div className="field">
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <span className="field-label">Item</span>
          <Help label="Item" text="Type part of the name (English) or the id. You can also type any id that isn't in the list, e.g. one from a newer version or a mod." />
        </span>
        <Combo label="Item" options={ITEM_OPTIONS} value={spec.item} onPick={pickItem} placeholder="search items…" allowCustom />
      </div>
      <div className="fields">
        <div className="field">
          <label htmlFor="give-count">How many</label>
          <input id="give-count" className="input mono" type="number" min={1} max={99} value={spec.count} onChange={(e) => set({ count: Number(e.target.value) || 1 })} />
          {info && spec.count > info.stack && !spec.maxStack && <span className="note">This item stacks to {info.stack}; the rest are handed out as more stacks.</span>}
        </div>
        <div className="field">
          <label htmlFor="give-target">Who gets it</label>
          <select
            id="give-target"
            className="select"
            value={targetMode}
            onChange={(e) => {
              setTargetMode(e.target.value);
              if (e.target.value !== 'name') set({ target: e.target.value });
              else set({ target: '' });
            }}
          >
            {TARGETS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {targetMode === 'name' && <input className="input mono" aria-label="Player name" placeholder="Steve" value={spec.target} onChange={(e) => set({ target: e.target.value })} />}
        </div>
      </div>
      <hr className="divider" />
      <Row id="g-unb" label="Unbreakable" help="Never loses durability.">
        <Toggle labelledBy="g-unb" checked={spec.unbreakable} onChange={(v) => set({ unbreakable: v })} />
      </Row>
      <Row id="g-rar" label="Rarity" help="Changes the color of the item's name: white, yellow, aqua or pink. Enchanted items already show aqua.">
        <Segmented
          labelledBy="g-rar"
          value={spec.rarity || 'default'}
          onChange={(v) => set({ rarity: v === 'default' ? '' : (v as ItemSpec['rarity']) })}
          options={[
            { value: 'default', label: 'default' },
            { value: 'uncommon', label: 'uncommon' },
            { value: 'rare', label: 'rare' },
            { value: 'epic', label: 'epic' },
          ]}
        />
      </Row>
      <Row id="g-glint" label="Enchant shine" help="The purple glint. Force it on (even without enchantments) or off (even with them).">
        <Segmented
          labelledBy="g-glint"
          value={spec.glint || 'default'}
          onChange={(v) => set({ glint: v === 'default' ? '' : (v as 'on' | 'off') })}
          options={[
            { value: 'default', label: 'default' },
            { value: 'on', label: 'always' },
            { value: 'off', label: 'never' },
          ]}
        />
      </Row>
      <div className="fields">
        <NumField label="Damage (used up)" value={spec.damage} onChange={(v) => set({ damage: v })} placeholder={info?.durability ? `0 – ${info.durability}` : 'none'} help="How much durability is already used. 0 is brand new." />
        <NumField label="Max durability" value={spec.maxDamage} onChange={(v) => set({ maxDamage: v })} placeholder={info?.durability ? String(info.durability) : 'none'} help="Changes how many uses the item has." />
        <NumField label="Max stack size" value={spec.maxStack} onChange={(v) => set({ maxStack: v })} placeholder={info ? String(info.stack) : '64'} help="1 – 99. Lets e.g. potions or swords stack. Items with durability can't stack." />
        <NumField label="Custom model data" value={spec.modelData} onChange={(v) => set({ modelData: v })} placeholder="none" help="A number a resource pack can use to give this item its own texture." />
      </div>
      {atLeast(version, '1.21.2') && (
        <div className="field">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <label htmlFor="g-model" className="field-label">
              Looks like (item model)
            </label>
            <Help label="Item model" text="Makes the item look like another one, e.g. a stick that looks like a diamond sword. Also used by resource packs (namespace:name)." />
          </span>
          <input id="g-model" className="input mono" value={spec.itemModel} placeholder="e.g. minecraft:diamond_sword" onChange={(e) => set({ itemModel: e.target.value })} />
        </div>
      )}
      <hr className="divider" />
      <Row id="g-hideall" label="Hide the whole tooltip" help="Nothing shows when hovering the item, not even its name.">
        <Toggle labelledBy="g-hideall" checked={spec.hideTooltip} onChange={(v) => set({ hideTooltip: v })} />
      </Row>
      {!spec.hideTooltip && (
        <div className="field">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="field-label">Hide from the tooltip</span>
            <Help label="Hide from the tooltip" text="The item still has these, they just aren't listed when hovering it." />
          </span>
          <div className="check-grid">
            {HIDE_LABELS.map((h) => (
              <label key={h.key} className="check">
                <input type="checkbox" checked={spec.hide[h.key]} onChange={(e) => set({ hide: { ...spec.hide, [h.key]: e.target.checked } })} />
                {h.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const textTab = (
    <>
      <MiniToolbar onWrap={wrap} onInsert={insert} placeholders={[]} hint="Click into the name or a lore line, then pick a color or style. Select some words first to change only those." />
      <div className="field">
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <label htmlFor="g-name" className="field-label">
            Name
          </label>
          <Help label="Name" text="Leave empty to keep the normal name. Supports the formatting above (MiniMessage tags like <red> or <gradient:…>)." />
        </span>
        <input id="g-name" ref={reg('name')} className="input mono" value={spec.name} placeholder="e.g. <gold>Lucky Pickaxe" onFocus={() => setActive('name')} onChange={(e) => set({ name: e.target.value })} spellCheck={false} />
      </div>
      <Row id="g-nk" label="Name type" help="Custom name: like renaming in an anvil (players can rename it again). Item name: the item's own name, can't be changed in an anvil and is never italic.">
        <Segmented
          labelledBy="g-nk"
          value={spec.nameKind}
          onChange={(v) => set({ nameKind: v })}
          options={[
            { value: 'custom', label: 'custom name' },
            { value: 'item', label: 'item name' },
          ]}
        />
      </Row>
      {spec.nameKind === 'custom' && (
        <Row id="g-ni" label="Italic name" help="Renamed items are italic in game unless told otherwise. Off gives a normal-looking name.">
          <Toggle labelledBy="g-ni" checked={spec.nameItalic} onChange={(v) => set({ nameItalic: v })} />
        </Row>
      )}
      <hr className="divider" />
      <div className="field">
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <span className="field-label">Lore (description lines)</span>
          <Help label="Lore" text="Extra lines under the name. Default color is purple, italic." />
        </span>
        {spec.lore.map((l, i) => (
          <div key={i} className="inline">
            <input
              ref={reg(`lore:${i}`)}
              className="input mono"
              aria-label={`Lore line ${i + 1}`}
              value={l}
              onFocus={() => setActive(`lore:${i}`)}
              onChange={(e) => set({ lore: spec.lore.map((x, j) => (j === i ? e.target.value : x)) })}
              spellCheck={false}
            />
            <button type="button" className="btn btn-sm" aria-label={`Remove line ${i + 1}`} onClick={() => set({ lore: spec.lore.filter((_, j) => j !== i) })}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ lore: [...spec.lore, ''] })}>
          + add line
        </button>
      </div>
      {spec.lore.length > 0 && (
        <Row id="g-li" label="Italic lore">
          <Toggle labelledBy="g-li" checked={spec.loreItalic} onChange={(v) => set({ loreItalic: v })} />
        </Row>
      )}
    </>
  );

  const fits = ENCHANTS.filter((e) => enchantFits(spec.item, e.id));
  const enchTab = (
    <>
      <div className="field">
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <span className="field-label">Add an enchantment</span>
          <Help label="Enchantments" text="Any enchantment at any level from 1 to 255 (the most the game accepts since 1.20.5), even ones that normally can’t go on this item (marked with !). On an enchanted book they’re stored for the anvil." />
        </span>
        <Combo label="Add an enchantment" options={ENCH_OPTIONS} onPick={(id) => !spec.enchants.some((e) => e.id === id) && set({ enchants: [...spec.enchants, { id, level: ENCHANTS.find((e) => e.id === id)?.max ?? 1 }] })} placeholder="search enchantments…" allowCustom clearOnPick />
        <div className="seg">
          <button type="button" className="btn btn-sm" disabled={!fits.length} onClick={() => set({ enchants: fits.filter((e) => !e.curse).map((e) => ({ id: e.id, level: e.max })) })}>
            all that fit · normal max
          </button>
          <button type="button" className="btn btn-sm" disabled={!fits.length} onClick={() => set({ enchants: fits.filter((e) => !e.curse).map((e) => ({ id: e.id, level: MAX_LEVEL })) })}>
            all that fit · {MAX_LEVEL}
          </button>
          <button type="button" className="btn btn-sm" disabled={!spec.enchants.length} onClick={() => set({ enchants: spec.enchants.map((e) => ({ ...e, level: MAX_LEVEL })) })}>
            set all to {MAX_LEVEL}
          </button>
          <button type="button" className="btn btn-sm" disabled={!spec.enchants.length} onClick={() => set({ enchants: [] })}>
            clear
          </button>
        </div>
      </div>
      {spec.enchants.length === 0 ? (
        <p className="note">No enchantments yet. Tip: “Enchant shine → always” on the Item tab adds the glint without any.</p>
      ) : (
        <ul className="give-list">
          {spec.enchants.map((e, i) => {
            const en = ENCHANTS.find((x) => x.id === e.id);
            const ok = enchantFits(spec.item, e.id);
            return (
              <li key={e.id}>
                <span className="give-list-name">
                  {en?.name ?? e.id}
                  {!ok && (
                    <span className="warn-tag" title="Doesn't normally go on this item; it still works through the command.">
                      !
                    </span>
                  )}
                </span>
                <input
                  className="input mono give-num"
                  type="number"
                  min={1}
                  max={255}
                  aria-label={`${en?.name ?? e.id} level`}
                  value={e.level}
                  onChange={(ev) => set({ enchants: spec.enchants.map((x, j) => (j === i ? { ...x, level: Math.max(1, Math.min(255, Number(ev.target.value) || 1)) } : x)) })}
                />
                <span className="seg compact give-lvl" role="group" aria-label={`${en?.name ?? e.id} quick level`}>
                  {[...new Set([en?.max ?? 1, MAX_LEVEL])].map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      aria-pressed={e.level === lv}
                      title={lv === MAX_LEVEL ? 'The highest level the game accepts' : 'The highest level you can normally get'}
                      onClick={() => set({ enchants: spec.enchants.map((x, j) => (j === i ? { ...x, level: lv } : x)) })}
                    >
                      {lv}
                    </button>
                  ))}
                </span>
                <button type="button" className="btn btn-sm" aria-label={`Remove ${en?.name ?? e.id}`} onClick={() => set({ enchants: spec.enchants.filter((_, j) => j !== i) })}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  const setAttr = (i: number, p: Partial<Attr>) => set({ attributes: spec.attributes.map((a, j) => (j === i ? { ...a, ...p } : a)) });
  const attrTab = (
    <>
      <p className="note">
        Attributes change stats while the item is held or worn: damage, speed, health, size… Adding any replaces the item’s normal ones (e.g. a sword’s attack damage), so add those back if you want them.
      </p>
      {spec.attributes.map((a, i) => (
        <div key={i} className="give-attr">
          <select className="select" aria-label="Attribute" value={a.type} onChange={(e) => setAttr(i, { type: e.target.value })}>
            {ATTRIBUTES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Slot" value={a.slot} onChange={(e) => setAttr(i, { slot: e.target.value })}>
            {SLOTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <input className="input mono give-num" type="number" step="any" aria-label="Amount" value={a.amount} onChange={(e) => setAttr(i, { amount: Number(e.target.value) })} />
          <select className="select" aria-label="How it applies" value={a.op} onChange={(e) => setAttr(i, { op: e.target.value as Attr['op'] })}>
            <option value="add_value">+ amount</option>
            <option value="add_multiplied_base">+ amount × base</option>
            <option value="add_multiplied_total">× (1 + amount)</option>
          </select>
          <button type="button" className="btn btn-sm" aria-label="Remove attribute" onClick={() => set({ attributes: spec.attributes.filter((_, j) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ attributes: [...spec.attributes, { type: 'attack_damage', slot: 'mainhand', amount: 5, op: 'add_value' }] })}>
        + add attribute
      </button>
      <p className="note">“+ amount” adds the number. “× base” adds that share of the base value (1 = +100%). “× (1 + amount)” multiplies the final value.</p>
    </>
  );

  const specialTab = (
    <>
      {kinds.potion && <PotionEditor spec={spec} set={set} />}
      {kinds.dye && (
        <Row id="g-dye" label="Leather color">
          <span className="inline">
            <input type="color" className="give-color" aria-labelledby="g-dye" value={spec.dye || '#a06540'} onChange={(e) => set({ dye: e.target.value })} />
            {spec.dye && (
              <button type="button" className="btn btn-sm" onClick={() => set({ dye: '' })}>
                default
              </button>
            )}
          </span>
        </Row>
      )}
      {kinds.head && (
        <div className="field">
          <label htmlFor="g-head">Whose head</label>
          <div className="inline">
            <input id="g-head" className="input mono" value={spec.head} placeholder="player name, e.g. Notch" onChange={(e) => set({ head: e.target.value })} />
            {/^[A-Za-z0-9_]{1,16}$/.test(spec.head.trim()) && <img src={`https://mc-heads.net/head/${spec.head.trim()}/48`} width={48} height={48} alt="" style={{ imageRendering: 'pixelated' }} />}
          </div>
        </div>
      )}
      {kinds.trim && <TrimEditor spec={spec} set={set} />}
      {kinds.book && (
        <>
          <div className="fields">
            <div className="field">
              <label htmlFor="g-bt">Title</label>
              <input id="g-bt" className="input" maxLength={32} value={spec.bookTitle} placeholder="Book" onChange={(e) => set({ bookTitle: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="g-ba">Author</label>
              <input id="g-ba" className="input" value={spec.bookAuthor} placeholder="unktilz" onChange={(e) => set({ bookAuthor: e.target.value })} />
            </div>
          </div>
          <MiniToolbar onWrap={wrap} onInsert={insert} placeholders={[]} hint="Click into a page, then pick a color or style." />
          {spec.bookPages.map((p, i) => (
            <div key={i} className="field">
              <span className="opt-row">
                <span className="field-label">Page {i + 1}</span>
                {spec.bookPages.length > 1 && (
                  <button type="button" className="btn btn-sm" onClick={() => set({ bookPages: spec.bookPages.filter((_, j) => j !== i) })}>
                    remove
                  </button>
                )}
              </span>
              <textarea
                ref={reg(`page:${i}`)}
                className="textarea mono"
                aria-label={`Page ${i + 1}`}
                value={p}
                onFocus={() => setActive(`page:${i}`)}
                onChange={(e) => set({ bookPages: spec.bookPages.map((x, j) => (j === i ? e.target.value : x)) })}
              />
            </div>
          ))}
          <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ bookPages: [...spec.bookPages, ''] })}>
            + add page
          </button>
        </>
      )}
      {(kinds.firework || kinds.star) && <FireworkEditor spec={spec} set={set} star={kinds.star} />}
    </>
  );

  const mob = mobOf(spec);
  const spawnsTab = (
    <MobEditor
      mob={mob}
      onChange={setMob}
      nameInput={
        <>
          <MiniToolbar onWrap={wrap} onInsert={insert} placeholders={[]} hint="Click into the mob's name, then pick a color or style." />
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <label htmlFor="g-mobname" className="field-label">
                Mob name
              </label>
              <Help label="Mob name" text="The name above the mob's head. Leave empty for no name. The egg's own name is on the Name & lore tab." />
            </span>
            <input id="g-mobname" ref={reg('mob')} className="input mono" value={mob.name} placeholder="e.g. <red>Boss" onFocus={() => setActive('mob')} onChange={(e) => setMob({ name: e.target.value })} spellCheck={false} />
          </div>
        </>
      }
    />
  );

  const adventureTab = (
    <>
      <p className="note">For Adventure mode, where players can only place or break what an item allows.</p>
      <MultiPick label="Can be placed on" options={BLOCK_OPTIONS} values={spec.canPlaceOn} onChange={(v) => set({ canPlaceOn: v })} />
      <MultiPick label="Can break" options={BLOCK_OPTIONS} values={spec.canBreak} onChange={(v) => set({ canBreak: v })} />
    </>
  );

  const preview = (
    <Panel title="preview">
      <Tooltip spec={spec} version={version} />
      {kinds.spawnEgg && (
        <p className="note give-spawns">
          Spawns: {MOB_BY_ID.get(mob.entity)?.name ?? label(mob.entity)}
          {mob.name.trim() ? ` “${plainText(mob.name).trim()}”` : ''}
          {mob.maxHealth.trim() ? ` · ${mob.maxHealth} health` : ''}
        </p>
      )}
    </Panel>
  );

  const ok = len <= 256;
  const output = (
    <Panel
      title="command"
      actions={
        <span className="inline">
          <CopyButton text={result.command} label="copy" />
          <CopyButton text={result.command.slice(1)} label="copy for command block" />
        </span>
      }
    >
      <pre className="give-cmd mono">{result.command}</pre>
      <p className={`note mono ${ok ? '' : 'give-warn'}`}>
        {len} / 256 characters · {ok ? 'fits in chat' : 'too long for chat: paste it into a command block instead'}
      </p>
      {result.notes.map((n) => (
        <p key={n} className="note give-warn">
          {n}
        </p>
      ))}
      <div className="field">
        <label htmlFor="g-ver">Minecraft version</label>
        <select id="g-ver" className="select" value={version} onChange={(e) => setVersion(e.target.value as GiveVersion)}>
          {GIVE_VERSIONS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <span className="note">The command format changed in 1.20.5 and again in 1.21.5. Older than 1.20.5 isn’t supported.</span>
      </div>
      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => replaceWith({ ...emptySpec(), target: spec.target }, 'Started over')}>
        start over
      </button>
    </Panel>
  );

  return (
    <Workbench preview={preview} output={output}>
      <section className="panel" aria-label="Presets">
        <div className="opt-row">
          <h2 className="panel-title">// start from</h2>
        </div>
        <div className="seg">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn btn-sm" onClick={() => replaceWith({ ...p.make(), target: spec.target }, `Loaded the “${p.label}” preset`)}>
              {p.label}
            </button>
          ))}
        </div>
        {undo && <UndoBar text={undo.text} onUndo={() => setSpec(undo.prev)} onClose={() => setUndo(null)} />}
      </section>
      <section className="panel give-editor" aria-label="Item editor">
        <Tabs tabs={tabs} value={tab} onChange={setTab} label="Item settings" idPrefix="give" />
        <TabPanel idPrefix="give" id={tab}>
          {tab === 'item' && itemTab}
          {tab === 'text' && textTab}
          {tab === 'enchants' && enchTab}
          {tab === 'attributes' && attrTab}
          {tab === 'special' && specialTab}
          {tab === 'spawns' && spawnsTab}
          {tab === 'adventure' && adventureTab}
        </TabPanel>
      </section>
      <SavedPanel<ItemSpec>
        slug="give-generator"
        title="my items"
        help="Keep items you made and load them again later. Saved in this browser; Backup (bottom of the page) copies them to another computer."
        suggestName={() => plainText(spec.name).trim() || info?.name || spec.item}
        getData={() => spec}
        onLoad={(d) => setSpec(fix(d))}
        describe={(i) =>
          `${ITEM_BY_ID.get(i.data.item)?.name ?? i.data.item}${i.data.enchants?.length ? ` · ${i.data.enchants.length} enchant${i.data.enchants.length > 1 ? 's' : ''}` : ''}${
            i.data.mob && itemKinds(i.data.item).spawnEgg ? ` · spawns ${MOB_BY_ID.get(i.data.mob.entity)?.name ?? i.data.mob.entity}` : ''
          }`
        }
        emptyText="No saved items yet. Build one and press save."
      />
    </Workbench>
  );
}

function NumField({ label: text, value, onChange, placeholder, help }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; help?: string }) {
  const id = `g-${text.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <label htmlFor={id} className="field-label">
          {text}
        </label>
        {help && <Help label={text} text={help} />}
      </span>
      <input id={id} className="input mono" type="number" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

type EditorProps = { spec: ItemSpec; set: (p: Partial<ItemSpec>) => void };

function PotionEditor({ spec, set }: EditorProps) {
  return (
    <>
      <div className="fields">
        <div className="field">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <label htmlFor="g-pb" className="field-label">
              Potion type
            </label>
            <Help label="Potion type" text="A normal brewable potion. Leave on “none” and add your own effects below for anything else." />
          </span>
          <select id="g-pb" className="select" value={spec.potionBase} onChange={(e) => set({ potionBase: e.target.value })}>
            <option value="">none</option>
            {POTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="g-pc">Color</label>
          <span className="inline">
            <input id="g-pc" type="color" className="give-color" value={spec.potionColor || '#385dc6'} onChange={(e) => set({ potionColor: e.target.value })} />
            {spec.potionColor && (
              <button type="button" className="btn btn-sm" onClick={() => set({ potionColor: '' })}>
                from effects
              </button>
            )}
          </span>
        </div>
      </div>
      <span className="field-label">Custom effects</span>
      <EffectList effects={spec.effects} onChange={(effects) => set({ effects })} />
      <p className="note">Seconds −1 lasts forever. Level 1 is the normal strength (Speed I).</p>
    </>
  );
}

function TrimEditor({ spec, set }: EditorProps) {
  return (
    <div className="fields">
      <div className="field">
        <label htmlFor="g-tp">Trim pattern</label>
        <select id="g-tp" className="select" value={spec.trimPattern} onChange={(e) => set({ trimPattern: e.target.value })}>
          <option value="">no trim</option>
          {TRIM_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {label(p)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="g-tm">Material</label>
        <select id="g-tm" className="select" value={spec.trimMaterial} disabled={!spec.trimPattern} onChange={(e) => set({ trimMaterial: e.target.value })}>
          {TRIM_MATERIALS.map((m) => (
            <option key={m.id} value={m.id}>
              {label(m.id)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ColorList({ label: text, colors, onChange }: { label: string; colors: string[]; onChange: (c: string[]) => void }) {
  return (
    <div className="field">
      <span className="field-label">{text}</span>
      <div className="give-dyes">
        {DYE_COLORS.map(([name, hex]) => {
          const on = colors.includes(hex);
          return (
            <button
              key={name}
              type="button"
              className="give-dye"
              style={{ background: hex }}
              aria-pressed={on}
              aria-label={label(name)}
              title={label(name)}
              onClick={() => onChange(on ? colors.filter((c) => c !== hex) : [...colors, hex])}
            />
          );
        })}
      </div>
    </div>
  );
}

function FireworkEditor({ spec, set, star }: EditorProps & { star: boolean }) {
  const setExp = (i: number, p: Partial<Explosion>) => set({ explosions: spec.explosions.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const list = star ? spec.explosions.slice(0, 1) : spec.explosions;
  return (
    <>
      {!star && (
        <Row id="g-fl" label="Flight duration" help="How high it flies: 1, 2 or 3 like gunpowder in crafting. 0 explodes right away.">
          <Segmented labelledBy="g-fl" compact value={String(spec.flight)} onChange={(v) => set({ flight: Number(v) })} options={['0', '1', '2', '3'].map((v) => ({ value: v, label: v }))} />
        </Row>
      )}
      {list.map((e, i) => (
        <div key={i} className="give-box">
          <div className="opt-row">
            <span className="field-label">{star ? 'Explosion' : `Explosion ${i + 1}`}</span>
            <button type="button" className="btn btn-sm" onClick={() => set({ explosions: spec.explosions.filter((_, j) => j !== i) })}>
              remove
            </button>
          </div>
          <Segmented label="Shape" value={e.shape} onChange={(v) => setExp(i, { shape: v })} options={FIREWORK_SHAPES} />
          <ColorList label="Colors" colors={e.colors} onChange={(c) => setExp(i, { colors: c })} />
          <ColorList label="Fade to" colors={e.fades} onChange={(c) => setExp(i, { fades: c })} />
          <div className="inline">
            <label className="check">
              <input type="checkbox" checked={e.trail} onChange={(ev) => setExp(i, { trail: ev.target.checked })} />
              trail
            </label>
            <label className="check">
              <input type="checkbox" checked={e.twinkle} onChange={(ev) => setExp(i, { twinkle: ev.target.checked })} />
              twinkle
            </label>
          </div>
        </div>
      ))}
      {(!star || list.length === 0) && (
        <button
          type="button"
          className="btn btn-sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => set({ explosions: [...spec.explosions, { shape: 'large_ball', colors: ['#B02E26'], fades: [], trail: false, twinkle: false }] })}
        >
          + add explosion
        </button>
      )}
    </>
  );
}
