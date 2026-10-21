import itemsRaw from '../../../lib/mc/data/items.json';
import enchantsRaw from '../../../lib/mc/data/enchantments.json';
import effectsRaw from '../../../lib/mc/data/effects.json';
import attributesRaw from '../../../lib/mc/data/attributes.json';
import blocksRaw from '../../../lib/mc/data/blocks.json';
import mobsRaw from '../../../lib/mc/data/mobs.json';
import { t } from '../../../lib/i18n-core';

export type ItemInfo = { id: string; name: string; stack: number; durability: number; cats: string[] };
export type EnchInfo = { id: string; name: string; max: number; cat: string; curse: boolean; exclude: string[] };

export const ITEMS: ItemInfo[] = (itemsRaw as [string, string, number, number, string[]][]).map(([id, name, stack, durability, cats]) => ({ id, name, stack, durability, cats }));
export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const ENCHANTS: EnchInfo[] = (enchantsRaw as [string, string, number, string, number, string[]][])
  .map(([id, name, max, cat, curse, exclude]) => ({ id, name, max, cat, curse: !!curse, exclude }))
  .sort((a, b) => a.name.localeCompare(b.name));
export const ENCH_BY_ID = new Map(ENCHANTS.map((e) => [e.id, e]));
export const EFFECTS = (effectsRaw as [string, string, number][]).map(([id, name, good]) => ({ id, name, good: !!good })).sort((a, b) => a.name.localeCompare(b.name));
export const EFFECT_BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));
export const BLOCKS = (blocksRaw as [string, string][]).map(([id, name]) => ({ id, name }));
export const BLOCK_BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));
/** Mobs a spawn egg (or later a spawner) can make; `baby`: has a baby form. */
export const MOBS = (mobsRaw as [string, string, number][]).map(([id, name, baby]) => ({ id, name, baby: !!baby })).sort((a, b) => a.name.localeCompare(b.name));
export const MOB_BY_ID = new Map(MOBS.map((m) => [m.id, m]));

const titleCase = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const ATTRIBUTES = (attributesRaw as [string, number, number, number][])
  .map(([id, min, max, def]) => ({ id, label: titleCase(id), min, max, def }))
  .sort((a, b) => a.label.localeCompare(b.label));

/** Whether an enchantment normally goes on this item (books take anything). */
export function enchantFits(item: string, ench: string) {
  if (item === 'enchanted_book' || item === 'book') return true;
  const i = ITEM_BY_ID.get(item);
  const e = ENCH_BY_ID.get(ench);
  return !!i && !!e && i.cats.includes(e.cat);
}

export const SLOTS = [
  { value: 'any', label: t('slot|any slot') },
  { value: 'mainhand', label: t('slot|main hand') },
  { value: 'offhand', label: t('slot|off hand') },
  { value: 'hand', label: t('slot|either hand') },
  { value: 'head', label: t('slot|head') },
  { value: 'chest', label: t('slot|chest') },
  { value: 'legs', label: t('slot|legs') },
  { value: 'feet', label: t('slot|feet') },
  { value: 'armor', label: t('slot|any armor slot') },
  { value: 'body', label: t('slot|body (animal armor)') },
];
// The game's own words in the tooltip preview (English, like the game): not translated.
// i18n-ignore
export const SLOT_HEADING: Record<string, string> = {
  any: 'When equipped:', // i18n-ignore
  mainhand: 'When in Main Hand:', // i18n-ignore
  offhand: 'When in Off Hand:', // i18n-ignore
  hand: 'When in Hand:', // i18n-ignore
  head: 'When on Head:', // i18n-ignore
  chest: 'When on Body:', // i18n-ignore
  legs: 'When on Legs:', // i18n-ignore
  feet: 'When on Feet:', // i18n-ignore
  armor: 'When worn:', // i18n-ignore
  body: 'When worn:', // i18n-ignore
};

export const POTIONS = [
  'water', 'mundane', 'thick', 'awkward', 'night_vision', 'long_night_vision', 'invisibility', 'long_invisibility', 'leaping', 'long_leaping', 'strong_leaping',
  'fire_resistance', 'long_fire_resistance', 'swiftness', 'long_swiftness', 'strong_swiftness', 'slowness', 'long_slowness', 'strong_slowness', 'turtle_master',
  'long_turtle_master', 'strong_turtle_master', 'water_breathing', 'long_water_breathing', 'healing', 'strong_healing', 'harming', 'strong_harming', 'poison',
  'long_poison', 'strong_poison', 'regeneration', 'long_regeneration', 'strong_regeneration', 'strength', 'long_strength', 'strong_strength', 'weakness',
  'long_weakness', 'luck', 'slow_falling', 'long_slow_falling', 'wind_charged', 'weaving', 'oozing', 'infested',
].map((id) => ({ id, label: titleCase(id.replace(/^(long|strong)_(.*)$/, '$2 ($1)')) }));

export const TRIM_PATTERNS = ['sentry', 'dune', 'coast', 'wild', 'ward', 'eye', 'vex', 'tide', 'snout', 'rib', 'spire', 'wayfinder', 'shaper', 'silence', 'raiser', 'host', 'flow', 'bolt'];
/** Trim materials and the color their tooltip line uses. */
export const TRIM_MATERIALS: { id: string; color: string }[] = [
  { id: 'quartz', color: '#E3D4C4' },
  { id: 'iron', color: '#ECECEC' },
  { id: 'netherite', color: '#625859' },
  { id: 'redstone', color: '#971607' },
  { id: 'copper', color: '#B4684D' },
  { id: 'gold', color: '#DEB12D' },
  { id: 'emerald', color: '#11A036' },
  { id: 'diamond', color: '#6EECD2' },
  { id: 'lapis', color: '#416E97' },
  { id: 'amethyst', color: '#9A5CC6' },
  { id: 'resin', color: '#FC7812' },
];

export const FIREWORK_SHAPES = [
  { value: 'small_ball', label: t('firework|small ball') },
  { value: 'large_ball', label: t('firework|large ball') },
  { value: 'star', label: t('firework|star') },
  { value: 'creeper', label: t('firework|creeper') },
  { value: 'burst', label: t('firework|burst') },
] as const;

/** The 16 dye colors, as fireworks use them. */
export const DYE_COLORS = [
  ['white', '#F9FFFE'], ['orange', '#F9801D'], ['magenta', '#C74EBD'], ['light_blue', '#3AB3DA'], ['yellow', '#FED83D'], ['lime', '#80C71F'],
  ['pink', '#F38BAA'], ['gray', '#474F52'], ['light_gray', '#9D9D97'], ['cyan', '#169C9C'], ['purple', '#8932B8'], ['blue', '#3C44AA'],
  ['brown', '#835432'], ['green', '#5E7C16'], ['red', '#B02E26'], ['black', '#1D1D21'],
] as const;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const roman = (n: number) => ROMAN[n] ?? String(n);
export const label = titleCase;
