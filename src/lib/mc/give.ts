/**
 * /give commands for Java Edition 1.20.5 and newer (item components).
 *
 * Two families:
 * - 1.20.5 – 1.21.4: text is a JSON string inside SNBT (custom_name='{"text":"…"}'), components
 *   that can be hidden carry show_in_tooltip:false, enchantments are {levels:{…}}.
 * - 1.21.5 and newer: text is SNBT (custom_name={text:"…"}), hiding goes through tooltip_display,
 *   two-field components use their short form (enchantments={sharpness:5}).
 * Smaller steps inside the first family: attribute modifiers use uuid+name in 1.20.5–1.20.6 and
 * id from 1.21; attribute names lose their generic./player. prefix in 1.21.2; custom_model_data
 * becomes an object in 1.21.4; item_model exists from 1.21.2.
 */
import { MC_COLORS } from './text';
import { miniSegments, type MiniSeg } from './minimessage';
import { entityNbt, type MobSpec } from './entity';
import { t } from '../i18n-core';

export type GiveVersion = '26.1' | '1.21.5' | '1.21.4' | '1.21.2' | '1.21' | '1.20.5';

export const GIVE_VERSIONS: { id: GiveVersion; label: string }[] = [
  { id: '26.1', label: '26.1 – 26.3' },
  { id: '1.21.5', label: '1.21.5 – 1.21.11' },
  { id: '1.21.4', label: '1.21.4' },
  { id: '1.21.2', label: '1.21.2 – 1.21.3' },
  { id: '1.21', label: '1.21 – 1.21.1' },
  { id: '1.20.5', label: '1.20.5 – 1.20.6' },
];

const ORDER: Record<GiveVersion, number> = { '26.1': 2601, '1.21.5': 2105, '1.21.4': 2104, '1.21.2': 2102, '1.21': 2100, '1.20.5': 2005 };
export const atLeast = (v: GiveVersion, min: GiveVersion) => ORDER[v] >= ORDER[min];

export type Ench = { id: string; level: number };
export type AttrOp = 'add_value' | 'add_multiplied_base' | 'add_multiplied_total';
export type Attr = { type: string; slot: string; amount: number; op: AttrOp };
export type Effect = { id: string; level: number; seconds: number; particles: boolean; icon: boolean };
export type FireworkShape = 'small_ball' | 'large_ball' | 'star' | 'creeper' | 'burst';
export type Explosion = { shape: FireworkShape; colors: string[]; fades: string[]; trail: boolean; twinkle: boolean };
export type HideKey = 'enchantments' | 'attributes' | 'unbreakable' | 'adventure' | 'dye' | 'trim' | 'other';

export type ItemSpec = {
  item: string;
  count: number;
  target: string;
  /** MiniMessage. */
  name: string;
  /** item_name can't be renamed in an anvil and isn't italic; custom_name is what anvils set. */
  nameKind: 'custom' | 'item';
  nameItalic: boolean;
  /** MiniMessage, one entry per line. */
  lore: string[];
  loreItalic: boolean;
  enchants: Ench[];
  unbreakable: boolean;
  damage: string;
  maxDamage: string;
  rarity: '' | 'common' | 'uncommon' | 'rare' | 'epic';
  glint: '' | 'on' | 'off';
  maxStack: string;
  modelData: string;
  itemModel: string;
  hideTooltip: boolean;
  hide: Record<HideKey, boolean>;
  attributes: Attr[];
  potionBase: string;
  potionColor: string;
  effects: Effect[];
  dye: string;
  head: string;
  trimPattern: string;
  trimMaterial: string;
  bookTitle: string;
  bookAuthor: string;
  /** MiniMessage, one entry per page. */
  bookPages: string[];
  flight: number;
  explosions: Explosion[];
  canPlaceOn: string[];
  canBreak: string[];
  /** Spawn eggs: what comes out. Missing on items saved before spawn eggs were editable. */
  mob?: MobSpec;
};

export const emptySpec = (): ItemSpec => ({
  item: 'diamond_sword',
  count: 1,
  target: '@p',
  name: '',
  nameKind: 'custom',
  nameItalic: false,
  lore: [],
  loreItalic: true,
  enchants: [],
  unbreakable: false,
  damage: '',
  maxDamage: '',
  rarity: '',
  glint: '',
  maxStack: '',
  modelData: '',
  itemModel: '',
  hideTooltip: false,
  hide: { enchantments: false, attributes: false, unbreakable: false, adventure: false, dye: false, trim: false, other: false },
  attributes: [],
  potionBase: '',
  potionColor: '',
  effects: [],
  dye: '',
  head: '',
  trimPattern: '',
  trimMaterial: 'diamond',
  bookTitle: '',
  bookAuthor: '',
  bookPages: [''],
  flight: 1,
  explosions: [],
  canPlaceOn: [],
  canBreak: [],
});

// ---------- what kind of item ----------

const ARMOR = /_(helmet|chestplate|leggings|boots)$/;
export const itemKinds = (id: string) => {
  const i = id.replace(/^minecraft:/, '');
  return {
    potion: /^(potion|splash_potion|lingering_potion|tipped_arrow)$/.test(i),
    dye: /^leather_(helmet|chestplate|leggings|boots|horse_armor)$/.test(i) || i === 'wolf_armor',
    head: i === 'player_head',
    trim: ARMOR.test(i),
    book: i === 'written_book',
    firework: i === 'firework_rocket',
    star: i === 'firework_star',
    storedEnchants: i === 'enchanted_book',
    spawnEgg: i.endsWith('_spawn_egg'),
  };
};

/** The mob a spawn egg normally makes: zombie_spawn_egg → zombie. */
export const eggEntity = (id: string) => id.replace(/^minecraft:/, '').replace(/_spawn_egg$/, '');

// ---------- SNBT and text ----------

/** A double-quoted SNBT string. */
export const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
/** A single-quoted SNBT string, for JSON text in 1.20.5 – 1.21.4 (keeps the JSON's double quotes readable). */
const sq = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const NAMED = new Map<string, string>(MC_COLORS.map((c) => [c.hex.toUpperCase(), c.name]));
const colorName = (hex: string) => NAMED.get(hex.toUpperCase()) ?? hex.toLowerCase();
export const hexToInt = (hex: string) => parseInt(hex.replace('#', ''), 16) || 0;

type Comp = Record<string, string | number | boolean | Comp[] | Record<string, string>>;

function segToComp(s: MiniSeg, v: GiveVersion): Comp {
  const c: Comp = s.keybind ? { keybind: s.keybind } : { text: s.text };
  const st = s.style;
  if (st.color) c.color = colorName(st.color);
  if (st.bold !== undefined) c.bold = st.bold;
  if (st.italic !== undefined) c.italic = st.italic;
  if (st.underline !== undefined) c.underlined = st.underline;
  if (st.strike !== undefined) c.strikethrough = st.strike;
  if (st.obf !== undefined) c.obfuscated = st.obf;
  if (st.font) c.font = st.font.includes(':') ? st.font : `minecraft:${st.font}`;
  if (st.shadow !== undefined && atLeast(v, '1.21.4')) {
    // shadow_color is ARGB; MiniMessage gives #RRGGBBAA.
    if (st.shadow === null) c.shadow_color = 0;
    else {
      const rgb = parseInt(st.shadow.slice(1, 7), 16);
      const a = st.shadow.length > 7 ? parseInt(st.shadow.slice(7, 9), 16) : 255;
      c.shadow_color = ((a << 24) | rgb) | 0;
    }
  }
  return c;
}

/**
 * A text component for MiniMessage input. `base` styles the whole thing (e.g. italic:false for
 * names) and is put on a parent so the parts inherit it.
 */
export function textComponent(mini: string, v: GiveVersion, base: Comp = {}): Comp {
  // <head:…> sprites aren't supported in item text here, so they're left out.
  const segs = miniSegments(mini).filter((s) => !s.head && (s.text || s.keybind));
  const parts = segs.map((s) => segToComp(s, v));
  // Text (or keybind) first for readability; the part's own style still wins over the base.
  if (parts.length === 1) {
    const p = parts[0];
    return { ...('text' in p ? { text: p.text } : { keybind: p.keybind }), ...base, ...p };
  }
  return { text: '', ...base, extra: parts };
}

/** SNBT form of a text component (1.21.5+). Plain unstyled text becomes just a string. */
export function snbtText(c: Comp): string {
  const keys = Object.keys(c);
  if (keys.length === 1 && keys[0] === 'text') return q(String(c.text));
  return snbt(c);
}

function snbt(v: unknown): string {
  if (typeof v === 'string') return q(v);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `[${v.map(snbt).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .map((k) => `${k}:${snbt(o[k])}`)
    .join(',')}}`;
}

/** JSON text inside a single-quoted SNBT string (1.20.5 – 1.21.4). */
const jsonText = (c: Comp) => sq(JSON.stringify(c));

/** MiniMessage as a text value the version understands: SNBT from 1.21.5, a JSON string before. */
export function textValue(mini: string, v: GiveVersion, base: Comp = {}) {
  const c = textComponent(mini, v, base);
  return atLeast(v, '1.21.5') ? snbtText(c) : jsonText(c);
}

// ---------- attributes ----------

const PLAYER_ATTRS = new Set(['block_interaction_range', 'entity_interaction_range', 'block_break_speed', 'mining_efficiency', 'sneaking_speed', 'submerged_mining_speed', 'sweeping_damage_ratio']);

/** Attribute id as the version wants it: generic./player./zombie. prefixes until 1.21.2. */
export function attributeId(type: string, v: GiveVersion) {
  const t = type.replace(/^minecraft:/, '');
  if (atLeast(v, '1.21.2')) return t;
  if (PLAYER_ATTRS.has(t)) return `player.${t}`;
  if (t === 'spawn_reinforcements') return `zombie.${t}`;
  return `generic.${t}`;
}

/** A UUID as four ints, stable per modifier so the command doesn't change on every keypress. */
function uuidInts(seed: number) {
  let h = 0x9e3779b9 ^ seed;
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return h | 0;
  };
  return `[I;${next()},${next()},${next()},${next()}]`;
}

const num = (s: string) => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

// ---------- the command ----------

export type GiveResult = { command: string; components: string[]; notes: string[] };

/**
 * The item's components as `key=value` (the /give form; an item stack in NBT uses the same values
 * as `key:value`). Shared by /give and by items a mob wears.
 */
export function itemComponents(spec: ItemSpec, v: GiveVersion): { parts: string[]; notes: string[] } {
  const modern = atLeast(v, '1.21.5');
  const kinds = itemKinds(spec.item);
  const parts: string[] = [];
  const notes: string[] = [];
  const hidden: string[] = [];
  /** Old versions: `, show_in_tooltip:false` inside the component when hidden. */
  const show = (key: HideKey) => (!modern && spec.hide[key] && !spec.hideTooltip ? ',show_in_tooltip:false' : '');
  const text = (mini: string, base: Comp) => {
    const c = textComponent(mini, v, base);
    return modern ? snbtText(c) : jsonText(c);
  };

  // Name and lore.
  if (spec.name.trim()) {
    if (spec.nameKind === 'item') parts.push(`item_name=${text(spec.name, {})}`);
    else parts.push(`custom_name=${text(spec.name, spec.nameItalic ? {} : { italic: false })}`);
  }
  const lore = spec.lore.filter((l) => l.trim() !== '');
  if (lore.length) {
    const base: Comp = spec.loreItalic ? {} : { italic: false };
    parts.push(`lore=[${lore.map((l) => text(l, base)).join(',')}]`);
  }

  // Enchantments (books store them instead of having them).
  const ench = spec.enchants.filter((e) => e.id && e.level > 0);
  if (ench.length) {
    const key = kinds.storedEnchants ? 'stored_enchantments' : 'enchantments';
    const map = `{${ench.map((e) => `${e.id.replace(/^minecraft:/, '')}:${Math.min(255, Math.round(e.level))}`).join(',')}}`;
    parts.push(modern ? `${key}=${map}` : `${key}={levels:${map}${show('enchantments')}}`);
    if (modern && spec.hide.enchantments) hidden.push(key);
  }

  if (spec.unbreakable) {
    parts.push(modern ? 'unbreakable={}' : `unbreakable={${show('unbreakable').slice(1)}}`);
    if (modern && spec.hide.unbreakable) hidden.push('unbreakable');
  }
  const damage = num(spec.damage);
  if (damage !== null) parts.push(`damage=${Math.max(0, Math.round(damage))}`);
  const maxDamage = num(spec.maxDamage);
  const maxStack = num(spec.maxStack);
  if (maxDamage !== null && maxStack !== null && maxStack > 1) notes.push(t('An item can’t have both a max stack size above 1 and durability; the game rejects the command.'));
  if (maxDamage !== null) parts.push(`max_damage=${Math.max(1, Math.round(maxDamage))}`);
  if (maxStack !== null) parts.push(`max_stack_size=${Math.min(99, Math.max(1, Math.round(maxStack)))}`);
  if (spec.rarity) parts.push(`rarity=${q(spec.rarity)}`);
  if (spec.glint) parts.push(`enchantment_glint_override=${spec.glint === 'on'}`);
  const model = num(spec.modelData);
  if (model !== null) parts.push(atLeast(v, '1.21.4') ? `custom_model_data={floats:[${model}f]}` : `custom_model_data=${Math.round(model)}`);
  if (spec.itemModel.trim()) {
    if (atLeast(v, '1.21.2')) parts.push(`item_model=${q(spec.itemModel.trim())}`);
    else notes.push(t('item_model only exists from 1.21.2; it was left out.'));
  }

  // Attribute modifiers.
  const attrs = spec.attributes.filter((a) => a.type && Number.isFinite(a.amount));
  if (attrs.length || (spec.hide.attributes && !modern && !spec.hideTooltip)) {
    const mods = attrs.map((a, i) => {
      const common = `type:${q(attributeId(a.type, v))},slot:${q(a.slot)},amount:${a.amount},operation:${q(a.op)}`;
      if (!atLeast(v, '1.21')) return `{${common},uuid:${uuidInts(i + 1)},name:"unktilz"}`;
      return `{${common},id:${q(`unktilz:modifier_${i + 1}`)}}`;
    });
    if (modern) {
      parts.push(`attribute_modifiers=[${mods.join(',')}]`);
    } else {
      parts.push(`attribute_modifiers={modifiers:[${mods.join(',')}]${show('attributes')}}`);
      if (!attrs.length) notes.push(t('In this version hiding the default attributes (like a sword’s attack damage) replaces them with none, so the item does 1 damage. From 1.21.5 they can be hidden without removing them.'));
    }
  }
  if (modern && spec.hide.attributes) hidden.push('attribute_modifiers');

  // Kind-specific parts.
  if (kinds.potion && (spec.potionBase || spec.potionColor || spec.effects.length)) {
    const fields: string[] = [];
    if (spec.potionBase) fields.push(`potion:${q(spec.potionBase)}`);
    if (spec.potionColor) fields.push(`custom_color:${hexToInt(spec.potionColor)}`);
    if (spec.effects.length)
      fields.push(
        `custom_effects:[${spec.effects
          .map(
            (e) =>
              `{id:${q(e.id)},amplifier:${Math.max(0, Math.min(255, e.level - 1))}b,duration:${e.seconds < 0 ? -1 : Math.round(e.seconds * 20)}${e.particles ? '' : ',show_particles:false'}${e.icon ? '' : ',show_icon:false'}}`,
          )
          .join(',')}]`,
      );
    parts.push(`potion_contents={${fields.join(',')}}`);
    if (spec.hide.other) hidden.push('potion_contents');
  }
  if (kinds.dye && spec.dye) {
    parts.push(modern ? `dyed_color=${hexToInt(spec.dye)}` : `dyed_color={rgb:${hexToInt(spec.dye)}${show('dye')}}`);
    if (modern && spec.hide.dye) hidden.push('dyed_color');
  }
  if (kinds.head && spec.head.trim()) parts.push(`profile=${q(spec.head.trim())}`);
  if (kinds.trim && spec.trimPattern) {
    parts.push(`trim={pattern:${q(spec.trimPattern)},material:${q(spec.trimMaterial)}${show('trim')}}`);
    if (modern && spec.hide.trim) hidden.push('trim');
  }
  if (kinds.book) {
    const pages = spec.bookPages.filter((p) => p.trim() !== '');
    const title = spec.bookTitle.trim() || 'Book';
    const author = spec.bookAuthor.trim() || 'unktilz';
    parts.push(`written_book_content={title:${q(title)},author:${q(author)},pages:[${pages.map((p) => text(p, {})).join(',')}]}`);
    if (spec.hide.other) hidden.push('written_book_content');
  }
  if ((kinds.firework || kinds.star) && spec.explosions.length) {
    const exp = (e: Explosion) => {
      const f = [`shape:${q(e.shape)}`];
      if (e.colors.length) f.push(`colors:[I;${e.colors.map(hexToInt).join(',')}]`);
      if (e.fades.length) f.push(`fade_colors:[I;${e.fades.map(hexToInt).join(',')}]`);
      if (e.trail) f.push('has_trail:true');
      if (e.twinkle) f.push('has_twinkle:true');
      return `{${f.join(',')}}`;
    };
    if (kinds.firework) {
      parts.push(`fireworks={flight_duration:${Math.max(0, Math.min(3, Math.round(spec.flight)))}b,explosions:[${spec.explosions.map(exp).join(',')}]}`);
      if (spec.hide.other) hidden.push('fireworks');
    } else {
      parts.push(`firework_explosion=${exp(spec.explosions[0])}`);
      if (spec.hide.other) hidden.push('firework_explosion');
    }
  } else if (kinds.firework && spec.flight !== 1) {
    parts.push(`fireworks={flight_duration:${Math.max(0, Math.min(3, Math.round(spec.flight)))}b}`);
  }

  // Adventure mode.
  const blocks = (list: string[]) => (list.length === 1 ? q(list[0]) : `[${list.map(q).join(',')}]`);
  for (const [key, list] of [
    ['can_place_on', spec.canPlaceOn],
    ['can_break', spec.canBreak],
  ] as const) {
    if (!list.length) continue;
    if (modern) {
      parts.push(`${key}={blocks:${blocks(list)}}`);
      if (spec.hide.adventure) hidden.push(key);
    } else parts.push(`${key}={predicates:[{blocks:${blocks(list)}}]${show('adventure')}}`);
  }

  // What a spawn egg spawns.
  // Left out when it would only repeat the egg's own mob.
  if (kinds.spawnEgg && spec.mob) {
    const data = entityNbt(spec.mob, v);
    if (data !== `{id:${q(`minecraft:${eggEntity(spec.item)}`)}}`) parts.push(`entity_data=${data}`);
  }

  // Hiding.
  if (spec.hideTooltip) parts.push(modern ? 'tooltip_display={hide_tooltip:true}' : 'hide_tooltip={}');
  else if (modern && hidden.length) parts.push(`tooltip_display={hidden_components:[${[...new Set(hidden)].map(q).join(',')}]}`);
  else if (!modern && spec.hide.other) parts.push('hide_additional_tooltip={}');
  return { parts, notes };
}

export function buildGive(spec: ItemSpec, v: GiveVersion): GiveResult {
  const { parts, notes } = itemComponents(spec, v);
  const id = spec.item.trim() || 'stone';
  const count = Math.max(1, Math.min(99, Math.round(spec.count) || 1));
  const target = spec.target.trim() || '@p';
  const command = `/give ${target} ${id}${parts.length ? `[${parts.join(',')}]` : ''}${count > 1 ? ` ${count}` : ''}`;
  return { command, components: parts, notes };
}
