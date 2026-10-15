// Downloads item, enchantment, effect, attribute and block lists from minecraft-data
// (MIT, github.com/PrismarineJS/minecraft-data) and writes trimmed copies to src/lib/mc/data/.
// The output is committed; run this only to move to a newer Minecraft version:
//   node scripts/fetch-mc-data.mjs [version]     (default below)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = process.argv[2] ?? '26.1';
const base = `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/${VERSION}`;
const out = join(import.meta.dirname, '..', 'src', 'lib', 'mc', 'data');
mkdirSync(out, { recursive: true });

const get = async (name) => {
  const res = await fetch(`${base}/${name}.json`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
};

// "JumpBoost" → "jump_boost"; the data names effects in CamelCase, commands use snake_case ids.
const snake = (s) => s.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
const EFFECT_ID = { BadLuck: 'unluck' };

const [items, enchantments, effects, attributes, blocks, entities] = await Promise.all(['items', 'enchantments', 'effects', 'attributes', 'blocks', 'entities'].map(get));

const write = (file, data) => {
  writeFileSync(join(out, file), JSON.stringify(data));
  console.log(`${file}: ${data.length}`);
};

// [id, name, stack size, durability or 0, enchant categories]
write(
  'items.json',
  items.map((i) => [i.name, i.displayName, i.stackSize, i.maxDurability ?? 0, i.enchantCategories ?? []]),
);
// [id, name, max level, category, curse, exclusive with]
write(
  'enchantments.json',
  enchantments.map((e) => [e.name, e.displayName, e.maxLevel, e.category, e.curse ? 1 : 0, e.exclude ?? []]),
);
// [id, name, good/bad]
write(
  'effects.json',
  effects.map((e) => [EFFECT_ID[e.name] ?? snake(e.name), e.displayName, e.type === 'good' ? 1 : 0]),
);
// [id, min, max, default]
write(
  'attributes.json',
  attributes.map((a) => [a.resource.replace('minecraft:', ''), a.min, a.max, a.default]),
);
// [id, name]
write(
  'blocks.json',
  blocks.map((b) => [b.name, b.displayName]),
);
// Mobs (anything alive that can be summoned, plus armor stands): [id, name, has a baby form]
const MOB_TYPES = new Set(['mob', 'animal', 'hostile', 'passive', 'ambient', 'water_creature', 'living']);
write(
  'mobs.json',
  entities.filter((e) => MOB_TYPES.has(e.type)).map((e) => [e.name, e.displayName, e.metadataKeys?.includes('baby') ? 1 : 0]),
);
writeFileSync(join(out, 'VERSION'), `${VERSION}\n`);
