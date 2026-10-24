/**
 * An entity as SNBT data, for spawn eggs and /summon.
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
import { SADDLED, extrasNbt, type Pose, type Stack, type Trade, type Values } from './entityExtras';
import { isAlive } from './alive';
export { isAlive };
import { t } from '../i18n-core';

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

  // Used by /summon only; spawn eggs leave them out.
  /** Yaw, pitch in degrees. */
  rotation?: [string, string];
  /** Blocks per tick along x, y, z. */
  motion?: [string, string, string];
  tags?: string[];
  /** Seconds it burns. */
  fire?: string;
  /** Looks on fire without burning. */
  visualFire?: boolean;
  /** The entity's own fields (see entityExtras.ts). */
  extra?: Values;
  /** The item of an item entity or item display. */
  stack?: Stack;
  trades?: Trade[];
  pose?: Pose;
  /** What a chest boat or minecart holds. */
  items?: Stack[];
  /** An animal baby that never grows up. */
  babyForever?: boolean;
  /** Entities riding this one. */
  passengers?: MobSpec[];
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
export function itemStackNbt(e: Equip, v: GiveVersion, count?: number) {
  const id = (e.spec ? e.spec.item : e.item).trim();
  const parts = e.spec ? itemComponents(e.spec, v).parts : e.glint ? ['enchantment_glint_override=true'] : [];
  const comps = parts.map((p) => {
    const i = p.indexOf('=');
    return `${p.slice(0, i)}:${p.slice(i + 1)}`;
  });
  const n = Math.max(1, Math.min(99, Math.round(count ?? (e.spec ? e.spec.count : 1)) || 1));
  return `{id:${q(id)},count:${n}${comps.length ? `,components:{${comps.join(',')}}` : ''}}`;
}

export type NbtOptions = {
  /** Collects warnings (fields the version can't do, missing items…). */
  notes?: string[];
  /** /summon names the entity outside the NBT, so its own data leaves the id out. */
  withId?: boolean;
};

const coord = (s: string) => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : 0;
};

export function entityNbt(m: MobSpec, v: GiveVersion, o: NbtOptions = {}): string {
  const id = m.entity.replace(/^minecraft:/, '').trim() || 'pig';
  const alive = isAlive(id);
  const notes = o.notes ?? [];
  const f: string[] = o.withId === false ? [] : [`id:${q(`minecraft:${id}`)}`];

  if (m.name.trim()) {
    f.push(`CustomName:${textValue(m.name, v)}`);
    if (m.nameVisible) f.push('CustomNameVisible:1b');
  }
  // [on, tag, mobs only]
  const flags: [boolean, string, boolean][] = [
    [m.noAI, 'NoAI', true],
    [m.silent, 'Silent', false],
    [m.invulnerable, 'Invulnerable', false],
    [m.glowing, 'Glowing', false],
    [m.noGravity, 'NoGravity', false],
    [m.persistent, 'PersistenceRequired', true],
    [m.pickUp, 'CanPickUpLoot', true],
    [m.leftHanded, 'LeftHanded', true],
  ];
  for (const [on, key, mobOnly] of flags) if (on && (alive || !mobOnly)) f.push(`${key}:1b`);

  if (alive) {
    if (m.baby) f.push(babyIsPermanent(id) ? 'IsBaby:1b' : 'Age:-24000');
    if (m.baby && m.babyForever && !babyIsPermanent(id)) f.push('AgeLocked:1b');

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

    // Equipment. From 1.21.5 a saddle is one more slot.
    const worn = EQUIP_SLOTS.filter((s) => {
      const e = m.equipment[s];
      return !!e && !!(e.spec ? e.spec.item : e.item).trim();
    });
    const saddle = m.extra?.saddle === true && SADDLED.has(id) && atLeast(v, '1.21.5');
    if (worn.length || saddle) {
      const eq = (s: EquipSlot) => (worn.includes(s) ? itemStackNbt(m.equipment[s]!, v) : '{}');
      const drop = (s: EquipSlot) => {
        const e = m.equipment[s];
        return e && worn.includes(s) && e.drop >= 0 ? dropValue(e.drop) : '0.085f';
      };
      const hasDrop = (slots: EquipSlot[]) => slots.some((s) => worn.includes(s) && m.equipment[s]!.drop >= 0);
      if (atLeast(v, '1.21.5')) {
        const slots = worn.map((s) => `${s}:${eq(s)}`);
        if (saddle) slots.push(`saddle:{id:${q('minecraft:saddle')},count:1}`);
        f.push(`equipment:{${slots.join(',')}}`);
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
  }

  // ---- what /summon adds (none of it is set on spawn eggs) ----
  if (m.rotation && m.rotation.some((r) => r.trim() !== '')) f.push(`Rotation:[${coord(m.rotation[0])}f,${coord(m.rotation[1])}f]`);
  if (m.motion && m.motion.some((r) => r.trim() !== '')) f.push(`Motion:[${m.motion.map((x) => `${coord(x)}d`).join(',')}]`);
  const tags = (m.tags ?? []).map((tg) => tg.trim()).filter(Boolean);
  if (tags.length) f.push(`Tags:[${tags.map(q).join(',')}]`);
  const fire = num(m.fire ?? '');
  if (fire !== null && fire > 0) f.push(`Fire:${Math.min(32767, Math.round(fire * 20))}s`);
  if (m.visualFire) f.push('HasVisualFire:1b');
  f.push(...extrasNbt({ ...m, entity: id }, { v, notes, stack: (s) => itemStackNbt({ item: s.item, glint: false, drop: -1, spec: s.spec }, v, s.count), text: (mini) => textValue(mini, v) }));
  const riders = m.passengers ?? [];
  if (riders.length) f.push(`Passengers:[${riders.map((r) => entityNbt(r, v, { notes })).join(',')}]`);
  return `{${f.join(',')}}`;
}

/** Each coordinate: a number, ~ / ~2 (relative) or ^ / ^-1 (where you look). Empty is ~. */
export const COORD = /^([~^]-?(\d+\.?\d*|\.\d+)?|-?(\d+\.?\d*|\.\d+))$/;

export type SummonResult = { command: string; notes: string[] };

export function buildSummon(m: MobSpec, pos: [string, string, string], v: GiveVersion): SummonResult {
  const notes: string[] = [];
  const id = m.entity.replace(/^minecraft:/, '').trim() || 'pig';
  const xyz = pos.map((p) => p.trim().replace(/\s+/g, '') || '~');
  const bad = xyz.filter((p) => !COORD.test(p));
  if (bad.length) notes.push(t('“{pos}” isn’t a position. Use a number, ~ (where you are) or ^ (where you look), like ~ ~1 ~.', { pos: bad[0] }));
  const local = xyz.filter((p) => p.startsWith('^')).length;
  if (local && local < 3) notes.push(t('^ only works on all three coordinates at once (^ ^ ^2), not mixed with ~ or numbers.'));
  const nbt = entityNbt(m, v, { notes, withId: false });
  const at = xyz.join(' ');
  const command = nbt === '{}' ? `/summon ${id}${at === '~ ~ ~' ? '' : ` ${at}`}` : `/summon ${id} ${at} ${nbt}`;
  return { command, notes: [...new Set(notes)] };
}
