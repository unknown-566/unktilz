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
// Block states: { shapes: [[name, values, default index]…], blocks: { id: shape index } }; blocks with
// the same states and defaults share one shape. The default comes from the block's default state
// id: the last state changes fastest, booleans go true, false.
{
  const shapes = [];
  const index = new Map();
  const byBlock = {};
  for (const b of blocks) {
    if (!b.states?.length) continue;
    const props = b.states.map((s) => ({ name: s.name, values: s.type === 'bool' ? ['true', 'false'] : s.values.map(String) }));
    let rest = b.defaultState - b.minStateId;
    const defaults = new Array(props.length);
    for (let i = props.length - 1; i >= 0; i--) {
      defaults[i] = rest % props[i].values.length;
      rest = Math.floor(rest / props[i].values.length);
    }
    const shape = props.map((p, i) => [p.name, p.values, defaults[i]]);
    const key = JSON.stringify(shape);
    if (!index.has(key)) {
      index.set(key, shapes.length);
      shapes.push(shape);
    }
    byBlock[b.name] = index.get(key);
  }
  writeFileSync(join(out, 'blockStates.json'), JSON.stringify({ shapes, blocks: byBlock }));
  console.log(`blockStates.json: ${Object.keys(byBlock).length} blocks, ${shapes.length} shapes`);
}
// Everything /summon takes (not the player or fishing bobber): [id, name, alive (1) or not (0)]
const NOT_SUMMONABLE = new Set(['player', 'fishing_bobber']);
write(
  'entities.json',
  entities.filter((e) => !NOT_SUMMONABLE.has(e.name)).map((e) => [e.name, e.displayName, MOB_TYPES.has(e.type) ? 1 : 0]),
);
writeFileSync(join(out, 'VERSION'), `${VERSION}\n`);
