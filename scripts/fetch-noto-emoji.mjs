// Downloads the list of Noto Animated Emoji (Google, artwork CC BY 4.0) and writes a trimmed copy
// to src/lib/noto-emoji.json for the GIF maker's sticker picker. The pictures themselves are loaded
// from fonts.gstatic.com when used. The output is committed; run this only to pick up new emoji:
//   node scripts/fetch-noto-emoji.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const res = await fetch('https://googlefonts.github.io/noto-emoji-animation/data/api.json');
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();

const CATEGORIES = ['Smileys and emotions', 'People', 'Animals and nature', 'Food and drink', 'Travel and places', 'Activities and events', 'Objects', 'Symbols', 'Flags'];
const name = (tag) => tag.replace(/^:|:$/g, '').replace(/-/g, ' ');

// [codepoint, name, category index, more names…], most used first (the list comes sorted that way).
const list = data.icons
  .slice()
  .sort((a, b) => b.popularity - a.popularity)
  .map((i) => [i.codepoint, name(i.tags[0] ?? i.name), Math.max(0, CATEGORIES.indexOf(i.categories[0])), ...i.tags.slice(1).map(name)]);

writeFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'noto-emoji.json'), JSON.stringify({ categories: CATEGORIES, emoji: list }));
console.log(`noto-emoji.json: ${list.length} emoji`);
