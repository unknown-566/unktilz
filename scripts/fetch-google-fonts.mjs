// Downloads the list of Google Fonts and writes a trimmed copy to src/lib/google-fonts.json for the
// GIF maker's font picker. The fonts themselves are loaded from fonts.googleapis.com when picked.
// The output is committed; run this only to pick up new fonts:
//   node scripts/fetch-google-fonts.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const res = await fetch('https://fonts.google.com/metadata/fonts');
if (!res.ok) throw new Error(`HTTP ${res.status}`);
// The answer may start with an anti-JSON-hijacking prefix.
const data = JSON.parse((await res.text()).replace(/^\)\]\}'\s*/, ''));

const CATEGORIES = ['Sans Serif', 'Serif', 'Display', 'Handwriting', 'Monospace'];

// [family, category index, upright weights as hundreds ("47" = 400 and 700), 1 if it has Czech letters (latin-ext)],
// most used first. Fonts without Latin letters are left out: they can't write most texts.
const list = data.familyMetadataList
  .filter((f) => f.subsets.includes('latin'))
  .sort((a, b) => a.popularity - b.popularity)
  .map((f) => {
    const weights = Object.keys(f.fonts)
      .filter((v) => /^[1-9]00$/.test(v))
      .map((v) => Number(v) / 100)
      .sort((a, b) => a - b)
      .join('');
    return [f.family, Math.max(0, CATEGORIES.indexOf(f.category)), weights || '4', f.subsets.includes('latin-ext') ? 1 : 0];
  });

writeFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'google-fonts.json'), JSON.stringify({ categories: CATEGORIES, fonts: list }));
console.log(`google-fonts.json: ${list.length} fonts`);
