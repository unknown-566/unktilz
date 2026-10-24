/**
 * What some entities have of their own (a creeper's fuse, a villager's job, an armor stand's pose…),
 * as data: which entities, which fields, and how the values become NBT. The summon generator draws
 * its "special" tab from this; checked against the Minecraft Wiki entity format pages.
 */
import { atLeast, q, type GiveVersion, type ItemSpec } from './give';
import type { MobSpec } from './entity';
import { isAlive } from './alive';
import { t } from '../i18n-core';

/** Field values; numbers are kept as typed (empty = the game's default). */
export type Values = Record<string, string | boolean>;
/** An item with a count: a plain item or one of "my items". */
export type Stack = { item: string; count: number; spec?: ItemSpec; label?: string };
export type Trade = { buy: Stack; buyB?: Stack; sell: Stack; maxUses: string; xp: boolean };
export const POSE_PARTS = ['Head', 'Body', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg'] as const;
export type PosePart = (typeof POSE_PARTS)[number];
/** Degrees around x, y, z. */
export type Pose = Partial<Record<PosePart, [string, string, string]>>;

type Opt = { id: string; label: string };
/** `only`: the field shows for these entities of its group only. */
type Base = { key: string; label: string; help?: string; since?: GiveVersion; only?: string[] };
export type ExtraField =
  | (Base & { type: 'bool' })
  | (Base & { type: 'number'; placeholder?: string; min?: number; max?: number })
  | (Base & { type: 'select'; options: Opt[] })
  /** Plain text (a team name, a command…). */
  | (Base & { type: 'text'; placeholder?: string })
  /** Three numbers kept as "x,y,z" (empty parts = the default). */
  | (Base & { type: 'vec3'; placeholder?: string })
  /** A player by name or UUID; the UUID goes in `key`, the name in `key + 'Name'`. */
  | (Base & { type: 'player' })
  /** '' or a #rrggbb color. */
  | (Base & { type: 'color' })
  /** A brewable potion id (the summon page has the list). */
  | (Base & { type: 'potion' })
  /** Status effects (MobSpec.effects). */
  | (Base & { type: 'effects' })
  /** What a container holds (MobSpec.items), up to `max` stacks. */
  | (Base & { type: 'items'; max: number })
  /** One of the 16 dye colors, kept as its number. */
  | (Base & { type: 'dye' })
  /** A block id, maybe with states: oak_stairs[facing=east]. */
  | (Base & { type: 'block'; placeholder?: string })
  /** MiniMessage text. */
  | (Base & { type: 'mini' })
  /** Background: '' (the game's), 'none' or a #rrggbb color; its opacity in % goes in `opacity`. */
  | (Base & { type: 'background' })
  /** The entity's item (kept in MobSpec.stack). */
  | (Base & { type: 'stack' });

export type Ctx = { v: GiveVersion; notes: string[]; stack: (s: Stack) => string; text: (mini: string) => string };
export type ExtraGroup = {
  id: string;
  entities: string[];
  /** Instead of a list: which entities (e.g. every mob). */
  match?: (entity: string) => boolean;
  fields: ExtraField[];
  /** Villager trades (MobSpec.trades). */
  trades?: boolean;
  /** Armor stand pose (MobSpec.pose). */
  pose?: boolean;
  nbt: (x: Values, m: MobSpec, c: Ctx) => string[];
};

const opts = (ids: string[], labels?: string[]): Opt[] => ids.map((id, i) => ({ id, label: labels?.[i] ?? id.replace(/_/g, ' ') }));
const num = (x: Values, key: string) => {
  const s = x[key];
  if (typeof s !== 'string' || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const on = (x: Values, key: string) => x[key] === true;
const str = (x: Values, key: string) => (typeof x[key] === 'string' ? (x[key] as string).trim() : '');
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const ticks = (seconds: number) => Math.round(seconds * 20);
const ns = (id: string) => q(id.includes(':') ? id : `minecraft:${id}`);

/** `oak_stairs[facing=east,half=top]` → `{Name:"minecraft:oak_stairs",Properties:{facing:"east",half:"top"}}`. */
export function blockState(input: string) {
  // The search box turns spaces into _, so "[facing=east, half=top]" may come as ",_half".
  const m = /^([^[\]]+)(?:\[([^\]]*)\])?$/.exec(input.trim().replace(/\s+/g, '').replace(/([[,=])_+/g, '$1'));
  if (!m) return `{Name:${ns('stone')}}`;
  const props = (m[2] ?? '')
    .split(',')
    .map((p) => p.split('='))
    .filter((p) => p.length === 2 && p[0] && p[1]);
  return `{Name:${ns(m[1])}${props.length ? `,Properties:{${props.map(([k, val]) => `${k}:${q(val)}`).join(',')}}` : ''}}`;
}

const VARIANT3 = opts(['temperate', 'warm', 'cold'], [t('variant|temperate'), t('variant|warm'), t('variant|cold')]);
const HORSES = ['horse', 'donkey', 'mule', 'skeleton_horse', 'zombie_horse', 'camel', 'camel_husk'];
/** Who takes a saddle: in an equipment slot from 1.21.5, before that `SaddleItem` or `Saddle`. */
export const SADDLED = new Set([...HORSES, 'pig', 'strider', 'nautilus', 'zombie_nautilus']);
const MINECARTS = ['minecart', 'chest_minecart', 'furnace_minecart', 'hopper_minecart', 'tnt_minecart', 'spawner_minecart', 'command_block_minecart'];
const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak', 'poplar'];
/** What can hold items: chest boats and minecarts with a chest or hopper. */
const CONTAINERS = [...WOODS.map((w) => w + '_chest_boat'), 'bamboo_chest_raft', 'chest_minecart', 'hopper_minecart'];

/** "x,y,z" as numbers; empty parts become `fallback`. Null when all three are empty. */
const vec = (x: Values, key: string, fallback = 0): [number, number, number] | null => {
  const parts = str(x, key).split(',');
  if (parts.every((p) => p.trim() === '')) return null;
  return [0, 1, 2].map((i) => {
    const n = Number(parts[i]);
    return parts[i]?.trim() && Number.isFinite(n) ? n : fallback;
  }) as [number, number, number];
};
const f4 = (n: number) => `${Math.round(n * 10000) / 10000}f`;
const hexInt = (hex: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : null);

/** Turning by x, then y, then z degrees, as the quaternion displays use (x, y, z, w). */
export function quaternion(dx: number, dy: number, dz: number): [number, number, number, number] {
  const half = (d: number) => (d * Math.PI) / 360;
  const mul = (a: number[], b: number[]) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
  const qx = [Math.sin(half(dx)), 0, 0, Math.cos(half(dx))];
  const qy = [0, Math.sin(half(dy)), 0, Math.cos(half(dy))];
  const qz = [0, 0, Math.sin(half(dz)), Math.cos(half(dz))];
  return mul(qz, mul(qy, qx)) as [number, number, number, number];
}

const display = (x: Values, m: MobSpec, c: Ctx) => {
  const parts: string[] = [];
  const b = str(x, 'billboard');
  if (b) parts.push(`billboard:${q(b)}`);
  const s = num(x, 'scale');
  const rot = vec(x, 'rotation');
  const move = vec(x, 'translation');
  if ((s !== null && s !== 1) || rot || move) {
    const sc = f4(s ?? 1);
    const qr = rot ? quaternion(...rot) : [0, 0, 0, 1];
    parts.push(
      `transformation:{left_rotation:[${qr.map(f4).join(',')}],right_rotation:[0f,0f,0f,1f],translation:[${(move ?? [0, 0, 0]).map(f4).join(',')}],scale:[${sc},${sc},${sc}]}`,
    );
  }
  const lb = num(x, 'lightBlock');
  const ls = num(x, 'lightSky');
  if (lb !== null || ls !== null) parts.push(`brightness:{block:${clamp(Math.round(lb ?? 15), 0, 15)},sky:${clamp(Math.round(ls ?? lb ?? 15), 0, 15)}}`);
  const glow = hexInt(str(x, 'glow'));
  if (glow !== null) {
    parts.push(`glow_color_override:${glow}`);
    if (!m.glowing) c.notes.push(t('The glow color only shows when “Glowing” is on (Entity tab).'));
  }
  const sr = num(x, 'shadowSize');
  if (sr !== null) parts.push(`shadow_radius:${Math.max(0, sr)}f`);
  const ss = num(x, 'shadowStrength');
  if (ss !== null) parts.push(`shadow_strength:${Math.max(0, ss)}f`);
  const vr = num(x, 'viewRange');
  if (vr !== null) parts.push(`view_range:${Math.max(0, vr)}f`);
  const sm = num(x, 'smooth');
  if (sm !== null) parts.push(`teleport_duration:${clamp(Math.round(sm), 0, 59)}`, `interpolation_duration:${Math.max(0, Math.round(sm))}`);
  return parts;
};

const DISPLAY_FIELDS: ExtraField[] = [
  {
    key: 'billboard',
    type: 'select',
    label: t('Turns to face you'),
    help: t('Fixed stays as summoned. Center always faces the player, vertical turns only left and right (like a sign on a pole).'),
    options: opts(['', 'center', 'vertical', 'horizontal'], [t('no (fixed)'), t('always (center)'), t('left and right (vertical)'), t('up and down (horizontal)')]),
  },
  { key: 'scale', type: 'number', label: t('Size'), placeholder: '1', help: t('1 is normal, 2 twice as big.') },
  { key: 'rotation', type: 'vec3', label: t('Turned (degrees x, y, z)'), placeholder: '0', help: t('Tilts and turns it around its own middle: x forward, y around, z sideways. 45 0 0 tips it forward by 45°.') },
  { key: 'translation', type: 'vec3', label: t('Moved (blocks x, y, z)'), placeholder: '0', help: t('Shifts what you see without moving the entity, e.g. -0.5 0 -0.5 to center a block display on its block.') },
  { key: 'lightBlock', type: 'number', label: t('Light from blocks'), placeholder: t('as there'), min: 0, max: 15, help: t('0–15. Set both lights to 15 and it always looks fully lit, even in the dark.') },
  { key: 'lightSky', type: 'number', label: t('Light from the sky'), placeholder: t('as there'), min: 0, max: 15 },
  { key: 'glow', type: 'color', label: t('Glow color'), help: t('The outline color when it glows (turn on Glowing on the Entity tab).') },
  { key: 'shadowSize', type: 'number', label: t('Shadow size'), placeholder: '0', min: 0, help: t('The round shadow under it, in blocks. 0 is none.') },
  { key: 'shadowStrength', type: 'number', label: t('Shadow darkness'), placeholder: '1', min: 0 },
  { key: 'viewRange', type: 'number', label: t('Seen from'), placeholder: '1', min: 0, help: t('How far away it still shows: 1 is about 64 blocks, 2 about 128.') },
  { key: 'smooth', type: 'number', label: t('Smooth movement (ticks)'), placeholder: '0', min: 0, help: t('When a command moves or changes it later, it glides there over this many ticks (20 = 1 second) instead of jumping.') },
];

export const EXTRA_GROUPS: ExtraGroup[] = [
  {
    id: 'creeper',
    entities: ['creeper'],
    fields: [
      { key: 'powered', type: 'bool', label: t('Charged'), help: t('Like after a lightning strike: a bigger explosion and a blue glow.') },
      { key: 'ignited', type: 'bool', label: t('Lit: explodes right away'), help: t('As if lit with flint and steel.') },
      { key: 'radius', type: 'number', label: t('Explosion size'), placeholder: '3', min: 0, max: 127, help: t('3 is normal. Charged creepers double it.') },
      { key: 'fuse', type: 'number', label: t('Fuse (seconds)'), placeholder: '1.5', min: 0, help: t('How long it hisses before it explodes.') },
    ],
    nbt: (x) => {
      const p: string[] = [];
      if (on(x, 'powered')) p.push('powered:1b');
      if (on(x, 'ignited')) p.push('ignited:1b');
      const r = num(x, 'radius');
      if (r !== null) p.push(`ExplosionRadius:${clamp(Math.round(r), 0, 127)}b`);
      const f = num(x, 'fuse');
      if (f !== null) p.push(`Fuse:${clamp(ticks(f), 0, 32767)}s`);
      return p;
    },
  },
  {
    id: 'villager',
    entities: ['villager', 'zombie_villager'],
    fields: [
      {
        key: 'profession',
        type: 'select',
        label: t('Job'),
        options: opts(
          ['', 'armorer', 'butcher', 'cartographer', 'cleric', 'farmer', 'fisherman', 'fletcher', 'leatherworker', 'librarian', 'mason', 'nitwit', 'shepherd', 'toolsmith', 'weaponsmith'],
          [t('none (random)'), t('job|armorer'), t('job|butcher'), t('job|cartographer'), t('job|cleric'), t('job|farmer'), t('job|fisherman'), t('job|fletcher'), t('job|leatherworker'), t('job|librarian'), t('job|mason'), t('job|nitwit'), t('job|shepherd'), t('job|toolsmith'), t('job|weaponsmith')],
        ),
      },
      { key: 'type', type: 'select', label: t('From biome'), help: t('Only changes its clothes.'), options: opts(['', 'plains', 'desert', 'jungle', 'savanna', 'snow', 'swamp', 'taiga'], [t('plains (default)'), t('biome|plains'), t('biome|desert'), t('biome|jungle'), t('biome|savanna'), t('biome|snow'), t('biome|swamp'), t('biome|taiga')]) },
      {
        key: 'level',
        type: 'select',
        label: t('Level'),
        help: t('The badge on its belt. At level 1 a villager without a workstation forgets its job (and your trades) unless it has No AI; level 2 or higher keeps it.'),
        options: opts(['', '2', '3', '4', '5'], [t('1 · novice'), t('2 · apprentice'), t('3 · journeyman'), t('4 · expert'), t('5 · master')]),
      },
    ],
    nbt: (x) => {
      const prof = str(x, 'profession');
      const type = str(x, 'type');
      const level = str(x, 'level');
      if (!prof && !type && !level) return [];
      return [`VillagerData:{profession:${ns(prof || 'none')},type:${ns(type || 'plains')},level:${level || 1}}`];
    },
  },
  {
    id: 'trades',
    entities: ['villager', 'wandering_trader'],
    fields: [],
    trades: true,
    nbt: (_x, m, c) => {
      const list = (m.trades ?? []).filter((tr) => tr.buy.item.trim() || tr.buy.spec);
      if (!list.length) return [];
      const recipes = list.map((tr) => {
        const uses = Number(tr.maxUses);
        const max = tr.maxUses.trim() && Number.isFinite(uses) ? clamp(Math.round(uses), 1, 2147483647) : 2147483647;
        const b = tr.buyB && (tr.buyB.item.trim() || tr.buyB.spec) ? `,buyB:${c.stack(tr.buyB)}` : '';
        return `{buy:${c.stack(tr.buy)}${b},sell:${c.stack(tr.sell)},maxUses:${max},rewardExp:${tr.xp ? '1b' : '0b'}}`;
      });
      return [`Offers:{Recipes:[${recipes.join(',')}]}`];
    },
  },
  {
    id: 'armor_stand',
    entities: ['armor_stand'],
    fields: [
      { key: 'arms', type: 'bool', label: t('Arms') },
      { key: 'small', type: 'bool', label: t('Small') },
      { key: 'invisible', type: 'bool', label: t('Invisible'), help: t('Only what it wears and holds shows.') },
      { key: 'noBase', type: 'bool', label: t('No base plate') },
      { key: 'marker', type: 'bool', label: t('Marker'), help: t('No hitbox: it can\'t be hit or moved. Good for holograms with a name.') },
      { key: 'locked', type: 'bool', label: t('Locked'), help: t('Players can\'t take its items or put any on.') },
    ],
    pose: true,
    nbt: (x, m) => {
      const p: string[] = [];
      const flags: [string, string][] = [
        ['arms', 'ShowArms'],
        ['small', 'Small'],
        ['invisible', 'Invisible'],
        ['noBase', 'NoBasePlate'],
        ['marker', 'Marker'],
      ];
      for (const [k, tag] of flags) if (on(x, k)) p.push(`${tag}:1b`);
      if (on(x, 'locked')) p.push('DisabledSlots:4144959');
      const pose = POSE_PARTS.flatMap((part) => {
        const a = m.pose?.[part];
        if (!a || a.every((d) => d.trim() === '')) return [];
        return [`${part}:[${a.map((d) => `${Number(d) || 0}f`).join(',')}]`];
      });
      if (pose.length) p.push(`Pose:{${pose.join(',')}}`);
      return p;
    },
  },
  {
    id: 'sheep',
    entities: ['sheep'],
    fields: [
      { key: 'color', type: 'dye', label: t('Wool color') },
      { key: 'sheared', type: 'bool', label: t('Sheared') },
    ],
    nbt: (x) => [...(str(x, 'color') ? [`Color:${str(x, 'color')}b`] : []), ...(on(x, 'sheared') ? ['Sheared:1b'] : [])],
  },
  {
    id: 'wolf',
    entities: ['wolf'],
    fields: [
      { key: 'variant', type: 'select', label: t('Breed'), options: opts(['', 'ashen', 'black', 'chestnut', 'rusty', 'snowy', 'spotted', 'striped', 'woods'], [t('pale (default)')]) },
      { key: 'sound', type: 'select', label: t('Voice'), since: '1.21.5', options: opts(['', 'angry', 'big', 'cute', 'grumpy', 'puglin', 'sad'], [t('classic (default)')]) },
    ],
    nbt: (x) => [...(str(x, 'variant') ? [`variant:${ns(str(x, 'variant'))}`] : []), ...(str(x, 'sound') ? [`sound_variant:${ns(str(x, 'sound'))}`] : [])],
  },
  {
    id: 'cat',
    entities: ['cat'],
    fields: [
      {
        key: 'variant',
        type: 'select',
        label: t('Breed'),
        options: opts(['', 'tabby', 'black', 'red', 'siamese', 'british_shorthair', 'calico', 'persian', 'ragdoll', 'white', 'jellie', 'all_black'], [t('random')]),
      },
    ],
    nbt: (x) => (str(x, 'variant') ? [`variant:${ns(str(x, 'variant'))}`] : []),
  },
  {
    id: 'horse',
    entities: ['horse'],
    fields: [
      { key: 'color', type: 'select', label: t('Coat'), options: opts(['', '0', '1', '2', '3', '4', '5', '6'], [t('random'), t('white'), t('creamy'), t('chestnut'), t('brown'), t('black'), t('gray'), t('dark brown')]) },
      { key: 'markings', type: 'select', label: t('Markings'), options: opts(['', '1', '2', '3', '4'], [t('none'), t('white stockings and blaze'), t('white patches'), t('white dots'), t('black dots')]) },
    ],
    nbt: (x) => {
      if (!str(x, 'color') && !str(x, 'markings')) return [];
      return [`Variant:${(Number(str(x, 'color')) || 0) | ((Number(str(x, 'markings')) || 0) << 8)}`];
    },
  },
  {
    id: 'tame',
    entities: [...HORSES, 'llama', 'trader_llama'],
    fields: [
      { key: 'tame', type: 'bool', label: t('Tamed'), help: t('Can be ridden (with a saddle) without taming it first.') },
      { key: 'chest', type: 'bool', label: t('Carries a chest'), help: t('Donkeys, mules and llamas only.') },
    ],
    nbt: (x, m) => [...(on(x, 'tame') ? ['Tame:1b'] : []), ...(on(x, 'chest') && ['donkey', 'mule', 'llama', 'trader_llama'].includes(m.entity) ? ['ChestedHorse:1b'] : [])],
  },
  {
    id: 'saddle',
    entities: [...SADDLED],
    fields: [{ key: 'saddle', type: 'bool', label: t('Saddled') }],
    // From 1.21.5 the saddle sits in the equipment (entity.ts puts it there).
    nbt: (x, m, c) => {
      if (!on(x, 'saddle') || atLeast(c.v, '1.21.5')) return [];
      return ['pig', 'strider'].includes(m.entity) ? ['Saddle:1b'] : [`SaddleItem:{id:${ns('saddle')},count:1}`];
    },
  },
  {
    id: 'slime',
    entities: ['slime', 'magma_cube'],
    fields: [{ key: 'size', type: 'number', label: t('Size'), placeholder: t('random'), min: 1, max: 127, help: t('1 is the smallest, 4 the biggest that spawns naturally. Bigger works too.') }],
    nbt: (x) => {
      const s = num(x, 'size');
      return s === null ? [] : [`Size:${clamp(Math.round(s), 1, 127) - 1}`];
    },
  },
  {
    id: 'axolotl',
    entities: ['axolotl'],
    fields: [{ key: 'variant', type: 'select', label: t('Color'), options: opts(['', '1', '2', '3', '4'], [t('pink (lucy)'), t('brown (wild)'), t('gold'), t('cyan'), t('blue (rare)')]) }],
    nbt: (x) => (str(x, 'variant') ? [`Variant:${str(x, 'variant')}`] : []),
  },
  {
    id: 'parrot',
    entities: ['parrot'],
    fields: [{ key: 'variant', type: 'select', label: t('Color'), options: opts(['', '1', '2', '3', '4'], [t('red'), t('blue'), t('green'), t('cyan'), t('gray')]) }],
    nbt: (x) => (str(x, 'variant') ? [`Variant:${str(x, 'variant')}`] : []),
  },
  {
    id: 'rabbit',
    entities: ['rabbit'],
    fields: [
      {
        key: 'type',
        type: 'select',
        label: t('Fur'),
        options: opts(['', '0', '1', '2', '3', '4', '5', '99'], [t('random'), t('brown'), t('white'), t('black'), t('black and white'), t('gold'), t('salt and pepper'), t('the Killer Bunny')]),
      },
    ],
    nbt: (x) => (str(x, 'type') ? [`RabbitType:${str(x, 'type')}`] : []),
  },
  {
    id: 'fox',
    entities: ['fox'],
    fields: [{ key: 'type', type: 'select', label: t('Fur'), options: opts(['', 'snow'], [t('red'), t('snow (white)')]) }],
    nbt: (x) => (str(x, 'type') ? [`Type:${q(str(x, 'type'))}`] : []),
  },
  {
    id: 'mooshroom',
    entities: ['mooshroom'],
    fields: [{ key: 'type', type: 'select', label: t('Color'), options: opts(['', 'brown'], [t('red'), t('brown')]) }],
    nbt: (x) => (str(x, 'type') ? [`Type:${q(str(x, 'type'))}`] : []),
  },
  {
    id: 'frog',
    entities: ['frog'],
    fields: [{ key: 'variant', type: 'select', label: t('Color'), options: [{ id: '', label: t('random') }, ...VARIANT3] }],
    nbt: (x) => (str(x, 'variant') ? [`variant:${ns(str(x, 'variant'))}`] : []),
  },
  {
    id: 'farm',
    entities: ['pig', 'cow', 'chicken'],
    fields: [{ key: 'variant', type: 'select', label: t('Climate look'), since: '1.21.5', options: [{ id: '', label: t('from the biome') }, ...VARIANT3] }],
    nbt: (x) => (str(x, 'variant') ? [`variant:${ns(str(x, 'variant'))}`] : []),
  },
  {
    id: 'llama',
    entities: ['llama', 'trader_llama'],
    fields: [{ key: 'variant', type: 'select', label: t('Color'), options: opts(['', '1', '2', '3'], [t('creamy'), t('white'), t('brown'), t('gray')]) }],
    nbt: (x) => (str(x, 'variant') ? [`Variant:${str(x, 'variant')}`] : []),
  },
  {
    id: 'goat',
    entities: ['goat'],
    fields: [{ key: 'screaming', type: 'bool', label: t('Screaming goat') }],
    nbt: (x) => (on(x, 'screaming') ? ['IsScreamingGoat:1b'] : []),
  },
  {
    id: 'tnt',
    entities: ['tnt'],
    fields: [
      { key: 'fuse', type: 'number', label: t('Fuse (seconds)'), placeholder: '4', min: 0, help: t('0 explodes at once.') },
      { key: 'power', type: 'number', label: t('Explosion strength'), placeholder: '4', min: 0, max: 128, since: '1.21.2', help: t('4 is normal TNT, up to 128.') },
    ],
    nbt: (x) => {
      const p: string[] = [];
      const f = num(x, 'fuse');
      if (f !== null) p.push(`fuse:${clamp(ticks(f), 0, 32767)}s`);
      const pw = num(x, 'power');
      if (pw !== null) p.push(`explosion_power:${clamp(pw, 0, 128)}f`);
      return p;
    },
  },
  {
    id: 'falling_block',
    entities: ['falling_block'],
    fields: [
      { key: 'block', type: 'block', label: t('Block'), placeholder: 'sand', help: t('Any block. Add states in brackets: oak_stairs[facing=east].') }, // i18n-ignore: a block id
      { key: 'noDrop', type: 'bool', label: t('No item when it breaks'), help: t('If it can\'t land, it vanishes instead of dropping as an item.') },
      { key: 'hurts', type: 'bool', label: t('Hurts what it lands on'), help: t('Like an anvil: 2 damage per block fallen, at most 40.') },
    ],
    nbt: (x) => {
      const p = [`BlockState:${blockState(str(x, 'block') || 'sand')}`];
      if (on(x, 'noDrop')) p.push('DropItem:0b');
      if (on(x, 'hurts')) p.push('HurtEntities:1b', 'FallHurtAmount:2f', 'FallHurtMax:40');
      return p;
    },
  },
  {
    id: 'item',
    entities: ['item'],
    fields: [
      { key: 'stack', type: 'stack', label: t('Item') },
      { key: 'forever', type: 'bool', label: t('Never despawns'), help: t('Normally it vanishes after 5 minutes.') },
      { key: 'noPickup', type: 'bool', label: t('Can\'t be picked up') },
      { key: 'delay', type: 'number', label: t('Pickup delay (seconds)'), placeholder: '0', min: 0 },
    ],
    nbt: (x, m, c) => {
      const p: string[] = [];
      if (m.stack && (m.stack.item.trim() || m.stack.spec)) p.push(`Item:${c.stack(m.stack)}`);
      else c.notes.push(t('An item entity without an item vanishes at once: pick an item on the Special tab.'));
      if (on(x, 'forever')) p.push('Age:-32768s');
      const d = num(x, 'delay');
      if (on(x, 'noPickup')) p.push('PickupDelay:32767s');
      else if (d !== null) p.push(`PickupDelay:${clamp(ticks(d), 0, 32766)}s`);
      return p;
    },
  },
  {
    id: 'experience_orb',
    entities: ['experience_orb'],
    fields: [{ key: 'value', type: 'number', label: t('XP points'), placeholder: '1', min: 1, max: 32767 }],
    nbt: (x) => {
      const n = num(x, 'value');
      return n === null ? [] : [`Value:${clamp(Math.round(n), 1, 32767)}s`];
    },
  },
  {
    id: 'end_crystal',
    entities: ['end_crystal'],
    fields: [{ key: 'noBase', type: 'bool', label: t('No bedrock base') }],
    nbt: (x) => (on(x, 'noBase') ? ['ShowBottom:0b'] : []),
  },
  {
    id: 'text_display',
    entities: ['text_display'],
    fields: [
      { key: 'text', type: 'mini', label: t('Text'), help: t('With colors like the name. Press Enter for a new line.') },
      { key: 'align', type: 'select', label: t('Alignment'), options: opts(['', 'left', 'right'], [t('center'), t('left'), t('right')]) },
      { key: 'background', type: 'background', label: t('Background') },
      { key: 'textOpacity', type: 'number', label: t('Text opacity %'), placeholder: '100', min: 0, max: 100, help: t('100 is solid. Very faint text (below about 10 %) isn’t drawn at all.') },
      { key: 'width', type: 'number', label: t('Line width'), placeholder: '200', min: 1, help: t('Longer lines wrap at this width (in pixels of the game font).') },
      { key: 'shadow', type: 'bool', label: t('Text shadow') },
      { key: 'through', type: 'bool', label: t('Seen through walls') },
      { key: 'chatBackground', type: 'bool', label: t('Background like chat'), help: t('Uses the chat’s background, which each player sets in their own options.') },
    ],
    nbt: (x, m, c) => {
      const p: string[] = [];
      const text = typeof x.text === 'string' ? x.text : '';
      if (text.trim()) p.push(`text:${c.text(text)}`);
      else c.notes.push(t('The text display has no text yet, so it shows nothing.'));
      if (str(x, 'align')) p.push(`alignment:${q(str(x, 'align'))}`);
      const bg = str(x, 'background');
      if (bg === 'none') p.push('background:0');
      else if (/^#[0-9a-f]{6}$/i.test(bg)) {
        const alpha = clamp(Math.round(((num(x, 'opacity') ?? 100) / 100) * 255), 0, 255);
        p.push(`background:${((alpha << 24) | parseInt(bg.slice(1), 16)) | 0}`);
      }
      const op = num(x, 'textOpacity');
      if (op !== null && op < 100) {
        // A signed byte; the game skips drawing text from 4 to 26.
        const a = clamp(Math.round((op / 100) * 255), 0, 255);
        p.push(`text_opacity:${(a > 127 ? a - 256 : a)}b`);
      }
      if (on(x, 'shadow')) p.push('shadow:1b');
      if (on(x, 'through')) p.push('see_through:1b');
      if (on(x, 'chatBackground')) p.push('default_background:1b');
      const w = num(x, 'width');
      if (w !== null) p.push(`line_width:${Math.max(1, Math.round(w))}`);
      return [...p, ...display(x, m, c)];
    },
  },
  {
    id: 'block_display',
    entities: ['block_display'],
    fields: [{ key: 'block', type: 'block', label: t('Block'), placeholder: 'grass_block', help: t('Any block. Add states in brackets: oak_stairs[facing=east].') }, ...DISPLAY_FIELDS], // i18n-ignore: a block id
    nbt: (x, m, c) => [`block_state:${blockState(str(x, 'block') || 'grass_block')}`, ...display(x, m, c)],
  },
  {
    id: 'item_display',
    entities: ['item_display'],
    fields: [
      { key: 'stack', type: 'stack', label: t('Item') },
      {
        key: 'itemMode',
        type: 'select',
        label: t('Shown as'),
        help: t('How the item is drawn: like on the ground, in a hand, on the head, in an item frame or in the inventory.'),
        options: opts(
          ['', 'ground', 'fixed', 'gui', 'head', 'thirdperson_righthand', 'thirdperson_lefthand', 'firstperson_righthand', 'firstperson_lefthand'],
          [t('as it is (none)'), t('on the ground'), t('in an item frame'), t('in the inventory'), t('on the head'), t('in the right hand'), t('in the left hand'), t('in your right hand (first person)'), t('in your left hand (first person)')],
        ),
      },
      ...DISPLAY_FIELDS,
    ],
    nbt: (x, m, c) => [
      ...(m.stack && (m.stack.item.trim() || m.stack.spec) ? [`item:${c.stack(m.stack)}`] : []),
      ...(str(x, 'itemMode') ? [`item_display:${q(str(x, 'itemMode'))}`] : []),
      ...display(x, m, c),
    ],
  },
  {
    id: 'interaction',
    entities: ['interaction'],
    fields: [
      { key: 'width', type: 'number', label: t('Width'), placeholder: '1', min: 0 },
      { key: 'height', type: 'number', label: t('Height'), placeholder: '1', min: 0 },
      { key: 'response', type: 'bool', label: t('Swings your hand'), help: t('Clicking it swings the player’s arm, as if they hit something.') },
    ],
    nbt: (x) => {
      const w = num(x, 'width');
      const h = num(x, 'height');
      return [...(w !== null ? [`width:${w}f`] : []), ...(h !== null ? [`height:${h}f`] : []), ...(on(x, 'response') ? ['response:1b'] : [])];
    },
  },

  // ---- every mob ----
  {
    id: 'mob',
    entities: [],
    match: (e) => isAlive(e) && e !== 'armor_stand',
    fields: [
      { key: 'noDrops', type: 'bool', label: t('Drops nothing'), help: t('No items or XP from its loot when killed (what it wears still drops by its own chance).') },
      { key: 'loot', type: 'text', label: t('Loot table'), placeholder: 'minecraft:entities/zombie', help: t('What it drops when killed, from another mob or a datapack, e.g. minecraft:entities/wither_skeleton. Empty is its own.') }, // i18n-ignore: an id or a command
      { key: 'team', type: 'text', label: t('Team'), placeholder: 'red', help: t('Joins this team when it spawns (make the team first with /team add). Team mates don\'t hurt each other and share the name color.') }, // i18n-ignore: an id or a command
      { key: 'leash', type: 'vec3', label: t('On a lead, tied to a fence at (x, y, z)'), help: t('Exact block coordinates of a fence post; the lead appears when it spawns.') },
      { key: 'absorption', type: 'number', label: t('Extra golden hearts'), placeholder: '0', min: 0, help: t('Absorption in half hearts, on top of its health (like from a golden apple).') },
    ],
    nbt: (x, _m, c) => {
      const p: string[] = [];
      const loot = str(x, 'loot');
      if (on(x, 'noDrops')) p.push(`DeathLootTable:${q('minecraft:empty')}`);
      else if (loot) p.push(`DeathLootTable:${ns(loot)}`);
      if (str(x, 'team')) p.push(`Team:${q(str(x, 'team'))}`);
      const l = vec(x, 'leash', NaN);
      if (l) {
        if (l.some((n) => !Number.isFinite(n))) c.notes.push(t('The fence for the lead needs exact numbers for x, y and z (no ~).'));
        else p.push(`leash:[I;${l.map((n) => Math.floor(n)).join(',')}]`);
      }
      const ab = num(x, 'absorption');
      if (ab !== null && ab > 0) p.push(`AbsorptionAmount:${ab}f`);
      return p;
    },
  },
  {
    id: 'owner',
    entities: ['wolf', 'cat', 'parrot', 'fox', 'nautilus', 'zombie_nautilus', ...HORSES, 'llama', 'trader_llama'],
    fields: [
      {
        key: 'owner',
        type: 'player',
        label: t('Tamed by'),
        help: t('A player name or UUID. It follows and defends that player like a pet they tamed (a fox trusts them). Leave empty for a wild one.'),
      },
      { key: 'sitting', type: 'bool', label: t('Sitting'), only: ['wolf', 'cat', 'parrot', 'fox', 'nautilus', 'zombie_nautilus'] },
      { key: 'collar', type: 'dye', label: t('Collar color'), help: t('Only shows on a tamed wolf or cat.'), only: ['wolf', 'cat'] },
    ],
    nbt: (x, m) => {
      const p: string[] = [];
      const uuid = str(x, 'owner');
      if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(uuid)) {
        const h = uuid.replace(/-/g, '');
        const ints = `[I;${[0, 8, 16, 24].map((i) => parseInt(h.slice(i, i + 8), 16) | 0).join(',')}]`;
        p.push(m.entity === 'fox' ? `Trusted:[${ints}]` : `Owner:${ints}`);
        // Horses and llamas also need to be marked tame (unless the tamed switch already did).
        if ([...HORSES, 'llama', 'trader_llama'].includes(m.entity) && !on(x, 'tame')) p.push('Tame:1b');
      }
      if (on(x, 'sitting')) p.push('Sitting:1b');
      if (str(x, 'collar') && ['wolf', 'cat'].includes(m.entity)) p.push(`CollarColor:${str(x, 'collar')}b`);
      return p;
    },
  },
  {
    id: 'zombification',
    entities: ['piglin', 'piglin_brute', 'hoglin'],
    fields: [{ key: 'immune', type: 'bool', label: t('Stays as it is in the Overworld'), help: t('Normally it turns into a zombie version after 15 seconds outside the Nether.') }],
    nbt: (x) => (on(x, 'immune') ? ['IsImmuneToZombification:1b'] : []),
  },
  {
    id: 'ghast',
    entities: ['ghast', 'fireball'],
    fields: [{ key: 'power', type: 'number', label: t('Fireball explosion'), placeholder: '1', min: 0, max: 127, help: t('1 is a normal ghast fireball; 4 is like TNT.') }],
    nbt: (x) => {
      const n = num(x, 'power');
      return n === null ? [] : [`ExplosionPower:${clamp(Math.round(n), 0, 127)}b`];
    },
  },

  // ---- objects ----
  {
    id: 'item_frame',
    entities: ['item_frame', 'glow_item_frame'],
    fields: [
      { key: 'stack', type: 'stack', label: t('Item in it') },
      {
        key: 'facing',
        type: 'select',
        label: t('Hangs on'),
        help: t('Which way it faces. Summon it on the block in front of a wall, or it drops at once.'),
        options: opts(['', '2', '4', '5', '1', '0'], [t('a wall, facing south'), t('a wall, facing north'), t('a wall, facing west'), t('a wall, facing east'), t('the floor (faces up)'), t('the ceiling (faces down)')]),
      },
      { key: 'turn', type: 'select', label: t('Item turned'), options: opts(['', '1', '2', '3', '4', '5', '6', '7'], ['0°', '45°', '90°', '135°', '180°', '225°', '270°', '315°']) },
      { key: 'drop', type: 'number', label: t('Drop chance %'), placeholder: '100', min: 0, max: 100, help: t('The chance the item drops when the frame is broken or the item is knocked out.') },
      { key: 'invisible', type: 'bool', label: t('Invisible frame'), help: t('Only the item shows.') },
      { key: 'fixed', type: 'bool', label: t('Fixed'), help: t('Can\'t be broken, turned or emptied by players, and stays without a wall.') },
    ],
    nbt: (x, m, c) => {
      const p: string[] = [];
      if (m.stack && (m.stack.item.trim() || m.stack.spec)) p.push(`Item:${c.stack(m.stack)}`);
      p.push(`Facing:${str(x, 'facing') || '3'}b`);
      if (str(x, 'turn')) p.push(`ItemRotation:${str(x, 'turn')}b`);
      const d = num(x, 'drop');
      if (d !== null) p.push(`ItemDropChance:${clamp(d, 0, 100) / 100}f`);
      if (on(x, 'invisible')) p.push('Invisible:1b');
      if (on(x, 'fixed')) p.push('Fixed:1b');
      return p;
    },
  },
  {
    id: 'firework',
    entities: ['firework_rocket'],
    fields: [
      { key: 'stack', type: 'stack', label: t('Firework'), help: t('Make the firework (colors, shape, flight) in the give generator and save it to “my items”, then pick it here. A plain rocket has no explosion.') },
      { key: 'life', type: 'number', label: t('Explodes after (seconds)'), placeholder: t('from the rocket'), min: 0, help: t('0 explodes at once, right where it\'s summoned.') },
      { key: 'angled', type: 'bool', label: t('Flies the way it\'s pushed'), help: t('Like from a crossbow: it follows its starting push (Position & motion tab) instead of rising straight up.') },
    ],
    nbt: (x, m, c) => {
      const p: string[] = [];
      if (m.stack && (m.stack.item.trim() || m.stack.spec)) p.push(`FireworksItem:${c.stack(m.stack)}`);
      const l = num(x, 'life');
      if (l !== null) p.push(`LifeTime:${Math.max(0, ticks(l))}`);
      if (on(x, 'angled')) p.push('ShotAtAngle:1b');
      return p;
    },
  },
  {
    id: 'thrown_potion',
    entities: ['splash_potion', 'lingering_potion'],
    fields: [
      { key: 'potion', type: 'potion', label: t('Potion') },
      { key: 'stack', type: 'stack', label: t('Or one of my potions'), help: t('A potion made in the give generator (with your own effects); it replaces the potion above.') },
    ],
    nbt: (x, m, c) => {
      if (m.stack && (m.stack.item.trim() || m.stack.spec)) return [`Item:${c.stack(m.stack)}`];
      const pot = str(x, 'potion');
      if (!pot) {
        c.notes.push(t('Pick a potion on the Special tab, or the thrown bottle does nothing.'));
        return [];
      }
      return [`Item:{id:${ns(m.entity)},count:1,components:{potion_contents:{potion:${ns(pot)}}}}`];
    },
  },
  {
    id: 'effect_cloud',
    entities: ['area_effect_cloud'],
    fields: [
      { key: 'potion', type: 'potion', label: t('Potion') },
      { key: 'effects', type: 'effects', label: t('Its own effects') },
      { key: 'radius', type: 'number', label: t('Radius (blocks)'), placeholder: '3', min: 0 },
      { key: 'duration', type: 'number', label: t('Lasts (seconds)'), placeholder: '30', min: 0 },
      { key: 'shrink', type: 'number', label: t('Shrinks per second (blocks)'), placeholder: '0', help: t('How much smaller it gets every second; 0 keeps its size. A negative number makes it grow.') },
      { key: 'wait', type: 'number', label: t('Starts after (seconds)'), placeholder: '0.5', min: 0 },
      { key: 'color', type: 'color', label: t('Color'), help: t('Empty takes the color of its effects.') },
    ],
    nbt: (x, m) => {
      const p: string[] = [];
      const pc: string[] = [];
      if (str(x, 'potion')) pc.push(`potion:${ns(str(x, 'potion'))}`);
      if (m.effects.length)
        pc.push(
          `custom_effects:[${m.effects
            .map((e) => `{id:${ns(e.id)},amplifier:${clamp(e.level - 1, 0, 255)}b,duration:${e.seconds < 0 ? -1 : ticks(e.seconds)}${e.particles ? '' : ',show_particles:0b'}}`)
            .join(',')}]`,
        );
      const col = hexInt(str(x, 'color'));
      if (col !== null) pc.push(`custom_color:${col}`);
      if (pc.length) p.push(`potion_contents:{${pc.join(',')}}`);
      const r = num(x, 'radius');
      if (r !== null) p.push(`Radius:${Math.max(0, r)}f`);
      const d = num(x, 'duration');
      if (d !== null) p.push(`Duration:${Math.max(0, ticks(d))}`);
      const s = num(x, 'shrink');
      if (s !== null && s !== 0) p.push(`RadiusPerTick:${f4(-s / 20)}`);
      const w = num(x, 'wait');
      if (w !== null) p.push(`WaitTime:${Math.max(0, ticks(w))}`);
      return p;
    },
  },
  {
    id: 'minecart',
    entities: MINECARTS,
    fields: [
      { key: 'shown', type: 'block', label: t('Block shown inside'), placeholder: t('its own'), help: t('Any block, only for the look (a minecart with a diamond block…). Add states in brackets.') },
      { key: 'offset', type: 'number', label: t('Block height (pixels)'), placeholder: '6', help: t('How high the block sits in the cart, 16 pixels per block.') },
      { key: 'command', type: 'text', label: t('Command'), placeholder: 'say Hello', only: ['command_block_minecart'], help: t('Runs every time it rolls over a powered activator rail. Without the leading /.') }, // i18n-ignore: an id or a command
    ],
    nbt: (x, m, c) => {
      const p: string[] = [];
      if (str(x, 'shown')) {
        p.push(`DisplayState:${blockState(str(x, 'shown'))}`);
        if (!atLeast(c.v, '1.21.5')) p.push('CustomDisplayTile:1b');
      }
      const o = num(x, 'offset');
      if (o !== null) p.push(`DisplayOffset:${Math.round(o)}`);
      if (m.entity === 'command_block_minecart' && str(x, 'command')) p.push(`Command:${q(str(x, 'command').replace(/^\//, ''))}`);
      return p;
    },
  },
  {
    id: 'container',
    entities: CONTAINERS,
    fields: [
      { key: 'items', type: 'items', label: t('Items inside'), max: 27 },
      { key: 'lootTable', type: 'text', label: t('Or a loot table'), placeholder: 'minecraft:chests/simple_dungeon', help: t('Filled at random the first time it\'s opened, like a dungeon chest (e.g. minecraft:chests/end_city_treasure). Used instead of the items above.') }, // i18n-ignore: an id or a command
    ],
    nbt: (x, m, c) => {
      const lt = str(x, 'lootTable');
      if (lt) return [`LootTable:${ns(lt)}`];
      const max = m.entity === 'hopper_minecart' ? 5 : 27;
      const items = (m.items ?? []).filter((s) => s.item.trim() || s.spec).slice(0, max);
      if (!items.length) return [];
      return [`Items:[${items.map((s, i) => `{Slot:${i}b,${c.stack(s).slice(1)}`).join(',')}]`];
    },
  },
  {
    id: 'arrow',
    entities: ['arrow', 'spectral_arrow', 'trident'],
    fields: [
      { key: 'stack', type: 'stack', label: t('Item'), help: t('A tipped arrow or an enchanted trident from “my items”; it\'s also what you pick up.'), only: ['arrow', 'trident'] },
      { key: 'damage', type: 'number', label: t('Damage'), placeholder: '2', min: 0, help: t('Multiplied by its speed: 2 is a normal arrow (about 6 damage from a full bow shot).') },
      { key: 'pierce', type: 'number', label: t('Goes through (mobs)'), placeholder: '0', min: 0, max: 127 },
      {
        key: 'pickup',
        type: 'select',
        label: t('Can be picked up'),
        options: opts(['', '1', '2'], [t('no'), t('yes'), t('only in creative')]),
      },
      { key: 'crit', type: 'bool', label: t('Critical hit'), help: t('More damage and a trail of sparks.') },
    ],
    nbt: (x, m, c) => {
      const p: string[] = [];
      if (m.stack && (m.stack.item.trim() || m.stack.spec) && m.entity !== 'spectral_arrow') p.push(`item:${c.stack(m.stack)}`);
      const d = num(x, 'damage');
      if (d !== null) p.push(`damage:${Math.max(0, d)}d`);
      const pr = num(x, 'pierce');
      if (pr !== null) p.push(`PierceLevel:${clamp(Math.round(pr), 0, 127)}b`);
      if (str(x, 'pickup')) p.push(`pickup:${str(x, 'pickup')}b`);
      if (on(x, 'crit')) p.push('crit:1b');
      return p;
    },
  },
];

// The text display's billboard and size come from DISPLAY_FIELDS too.
EXTRA_GROUPS.find((g) => g.id === 'text_display')!.fields.push(...DISPLAY_FIELDS);

const clean = (id: string) => id.replace(/^minecraft:/, '').trim();
export const groupsFor = (entity: string) => {
  const id = clean(entity);
  return EXTRA_GROUPS.filter((g) => g.entities.includes(id) || g.match?.(id));
};
/** The fields that show for an entity (some only for a few entities of their group). */
export const fieldsFor = (entity: string) => {
  const id = clean(entity);
  return groupsFor(id).flatMap((g) => g.fields.filter((f) => !f.only || f.only.includes(id)));
};

/** The entity's own NBT parts; fields that need a newer version are left out with a note. */
export function extrasNbt(m: MobSpec, c: Ctx): string[] {
  const x: Values = { ...(m.extra ?? {}) };
  const groups = groupsFor(m.entity);
  for (const g of groups)
    for (const f of g.fields)
      if (f.since && !atLeast(c.v, f.since) && x[f.key] !== undefined && x[f.key] !== '' && x[f.key] !== false) {
        c.notes.push(t('“{field}” needs Minecraft {v} or newer, so it was left out.', { field: f.label, v: f.since }));
        delete x[f.key];
      }
  return groups.flatMap((g) => g.nbt(x, m, c));
}
