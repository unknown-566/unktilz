/**
 * A mob as SNBT entity data, for spawn eggs now (and spawners / /summon later).
 *
 * Formats by version (checked against the Minecraft Wiki):
 * - attributes: `Attributes:[{Name,Base}]` in 1.20.5 – 1.20.6, `attributes:[{id,base}]` from 1.21
 *   (24w21a); the generic./player. prefixes go away in 1.21.2;
 * - equipment: `ArmorItems` [feet, legs, chest, head], `HandItems` [main, off] and `body_armor_item`
 *   (with `ArmorDropChances`, `HandDropChances`, `body_armor_drop_chance`) until 1.21.4; one
 *   `equipment` map and one `drop_chances` map from 1.21.5;
 * - `CustomName` is a JSON string until 1.21.4 and an SNBT text component from 1.21.5;
 * - `active_effects` and item stacks `{id, count, components}` are the same throughout.
 */
import { atLeast, attributeId, itemComponents, q, textValue, type Effect, type GiveVersion, type ItemSpec } from './give';

export type EquipSlot = 'head' | 'chest' | 'legs' | 'feet' | 'mainhand' | 'offhand' | 'body';
export const EQUIP_SLOTS: EquipSlot[] = ['head', 'chest', 'legs', 'feet', 'mainhand', 'offhand', 'body'];

/** One worn or held item: a plain item (maybe with the enchant shine) or a whole saved item. */
export type Equip = {
  item: string;
  glint: boolean;
  /** Chance to drop on death, 0..1; -1 leaves the game's default (8.5 %). */
  drop: number;
  /** A full item from "my items"; when set it's used instead of `item`/`glint`. */
  spec?: ItemSpec;
  /** Name of that saved item, for the editor. */
  label?: string;
};

export type MobSpec = {
  entity: string;
  /** MiniMessage. */
  name: string;
  nameVisible: boolean;
  /** Empty = the mob's normal value. */
  maxHealth: string;
  speed: string;
  attack: string;
  scale: string;
  /** Any other attribute, as a base value. */
  attributes: { type: string; base: string }[];
  equipment: Partial<Record<EquipSlot, Equip>>;
  effects: Effect[];
  noAI: boolean;
  silent: boolean;
  invulnerable: boolean;
  glowing: boolean;
  noGravity: boolean;
  persistent: boolean;
  pickUp: boolean;
  leftHanded: boolean;
  baby: boolean;
};

export const defaultMob = (entity = 'zombie'): MobSpec => ({
  entity,
  name: '',
  nameVisible: false,
  maxHealth: '',
  speed: '',
  attack: '',
  scale: '',
  attributes: [],
  equipment: {},
  effects: [],
  noAI: false,
  silent: false,
  invulnerable: false,
  glowing: false,
  noGravity: false,
  persistent: false,
  pickUp: false,
  leftHanded: false,
  baby: false,
});

/** Mobs whose baby form is a flag; every other mob with a baby form grows up from a negative Age. */
const IS_BABY = new Set(['zombie', 'husk', 'drowned', 'zombie_villager', 'zombified_piglin', 'piglin', 'zoglin']);
export const babyIsPermanent = (entity: string) => IS_BABY.has(entity.replace(/^minecraft:/, ''));

const num = (s: string) => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

/** 100 % becomes 2.0: anything above 1 drops without the random durability loss. */
const dropValue = (d: number) => `${d >= 1 ? 2 : Math.max(0, Math.round(d * 1000) / 1000)}f`;

/** An item stack in NBT: `{id, count, components}`, with the components the give generator builds. */
export function itemStackNbt(e: Equip, v: GiveVersion) {
  const id = (e.spec ? e.spec.item : e.item).trim();
  const parts = e.spec ? itemComponents(e.spec, v).parts : e.glint ? ['enchantment_glint_override=true'] : [];
  const comps = parts.map((p) => {
    const i = p.indexOf('=');
    return `${p.slice(0, i)}:${p.slice(i + 1)}`;
  });
  const count = e.spec ? Math.max(1, Math.min(99, Math.round(e.spec.count) || 1)) : 1;
  return `{id:${q(id)},count:${count}${comps.length ? `,components:{${comps.join(',')}}` : ''}}`;
}

export function entityNbt(m: MobSpec, v: GiveVersion): string {
  const id = m.entity.replace(/^minecraft:/, '').trim() || 'pig';
  const f: string[] = [`id:${q(`minecraft:${id}`)}`];

  if (m.name.trim()) {
    f.push(`CustomName:${textValue(m.name, v)}`);
    if (m.nameVisible) f.push('CustomNameVisible:1b');
  }
  const flags: [boolean, string][] = [
    [m.noAI, 'NoAI'],
    [m.silent, 'Silent'],
    [m.invulnerable, 'Invulnerable'],
    [m.glowing, 'Glowing'],
    [m.noGravity, 'NoGravity'],
    [m.persistent, 'PersistenceRequired'],
    [m.pickUp, 'CanPickUpLoot'],
    [m.leftHanded, 'LeftHanded'],
  ];
  for (const [on, key] of flags) if (on) f.push(`${key}:1b`);
  if (m.baby) f.push(babyIsPermanent(id) ? 'IsBaby:1b' : 'Age:-24000');

  // Attributes: the four common ones first, then anything else.
  const attrs: { type: string; base: number }[] = [];
  for (const [type, value] of [
    ['max_health', m.maxHealth],
    ['movement_speed', m.speed],
    ['attack_damage', m.attack],
    ['scale', m.scale],
  ] as const) {
    const n = num(value);
    if (n !== null) attrs.push({ type, base: n });
  }
  for (const a of m.attributes) {
    const n = num(a.base);
    if (a.type && n !== null && !attrs.some((x) => x.type === a.type)) attrs.push({ type: a.type, base: n });
  }
  if (attrs.length) {
    const list = attrs.map((a) =>
      atLeast(v, '1.21') ? `{id:${q(attributeId(a.type, v))},base:${a.base}d}` : `{Name:${q(attributeId(a.type, v))},Base:${a.base}d}`,
    );
    f.push(`${atLeast(v, '1.21') ? 'attributes' : 'Attributes'}:[${list.join(',')}]`);
  }
  // Without this a mob with more max health would still start at its old health.
  const health = num(m.maxHealth);
  if (health !== null) f.push(`Health:${health}f`);

  if (m.effects.length)
    f.push(
      `active_effects:[${m.effects
        .map((e) => `{id:${q(e.id)},amplifier:${Math.max(0, Math.min(255, e.level - 1))}b,duration:${e.seconds < 0 ? -1 : Math.round(e.seconds * 20)}${e.particles ? '' : ',show_particles:0b'}}`)
        .join(',')}]`,
    );

  // Equipment.
  const worn = EQUIP_SLOTS.filter((s) => {
    const e = m.equipment[s];
    return !!e && !!(e.spec ? e.spec.item : e.item).trim();
  });
  if (worn.length) {
    const eq = (s: EquipSlot) => (worn.includes(s) ? itemStackNbt(m.equipment[s]!, v) : '{}');
    const drop = (s: EquipSlot) => {
      const e = m.equipment[s];
      return e && worn.includes(s) && e.drop >= 0 ? dropValue(e.drop) : '0.085f';
    };
    const hasDrop = (slots: EquipSlot[]) => slots.some((s) => worn.includes(s) && m.equipment[s]!.drop >= 0);
    if (atLeast(v, '1.21.5')) {
      f.push(`equipment:{${worn.map((s) => `${s}:${eq(s)}`).join(',')}}`);
      const set = worn.filter((s) => m.equipment[s]!.drop >= 0);
      if (set.length) f.push(`drop_chances:{${set.map((s) => `${s}:${dropValue(m.equipment[s]!.drop)}`).join(',')}}`);
    } else {
      const armor: EquipSlot[] = ['feet', 'legs', 'chest', 'head'];
      const hands: EquipSlot[] = ['mainhand', 'offhand'];
      if (armor.some((s) => worn.includes(s))) f.push(`ArmorItems:[${armor.map(eq).join(',')}]`);
      if (hands.some((s) => worn.includes(s))) f.push(`HandItems:[${hands.map(eq).join(',')}]`);
      if (worn.includes('body')) f.push(`body_armor_item:${eq('body')}`);
      if (hasDrop(armor)) f.push(`ArmorDropChances:[${armor.map(drop).join(',')}]`);
      if (hasDrop(hands)) f.push(`HandDropChances:[${hands.map(drop).join(',')}]`);
      if (hasDrop(['body'])) f.push(`body_armor_drop_chance:${drop('body')}`);
    }
  }
  return `{${f.join(',')}}`;
}
