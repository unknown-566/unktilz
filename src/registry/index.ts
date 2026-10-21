import type { Category, Opts, Tool } from './types';
import { getLang, t } from '../lib/i18n-core';

export type { Category, Opts, Tool } from './types';
export { isNew, NEW_DAYS } from './types';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'minecraft', label: 'Minecraft' },
  { id: 'dev', label: t('Dev') },
  { id: 'image', label: t('Image') },
  { id: 'audio', label: t('Audio') },
  { id: 'video', label: t('Video') },
  { id: 'pdf', label: 'PDF' },
  { id: 'text', label: t('Text') },
  { id: 'calc', label: t('Calc & generators') },
];

export const categoryLabel = (id: Category) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

// Every *.tool.ts file default-exports one tool. Dropping a new file in src/tools registers it.
const modules = import.meta.glob<{ default: Tool }>('../tools/**/*.tool.ts', { eager: true });

const catIndex = (c: Category) => CATEGORIES.findIndex((x) => x.id === c);

export const tools: Tool[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => catIndex(a.category) - catIndex(b.category) || a.order - b.order || a.name.localeCompare(b.name));

const bySlug = new Map<string, Tool>();
for (const tt of tools) {
  if (bySlug.has(tt.slug)) console.error(`[registry] duplicate tool slug "${tt.slug}"`);
  bySlug.set(tt.slug, tt);
}

export const getTool = (slug: string | undefined) => (slug ? bySlug.get(slug) : undefined);

/**
 * Old addresses of tools that were folded into a bigger one: they open the new tool with these
 * options picked, so bookmarks and links keep working.
 */
export const ALIASES: Record<string, { to: string; opts: Opts }> = {
  'ogg-to-mp3': { to: 'audio-converter', opts: { format: 'mp3' } },
  'mp3-to-ogg': { to: 'audio-converter', opts: { format: 'ogg' } },
  'video-to-gif': { to: 'video-converter', opts: { format: 'gif' } },
};

export const fileTools = tools.filter((tt) => tt.run);

/** Categories that have at least one tool, in display order, with their tools. */
export const groups = CATEGORIES.map((c) => ({ ...c, tools: tools.filter((tt) => tt.category === c.id) })).filter(
  (g) => g.tools.length > 0,
);

/**
 * What search looks in: the name, meta and category in the language shown, the slug and the English
 * keywords, and in Czech also the Czech keywords (dictionary entry "keywords:<slug>").
 */
const haystack = (tool: Tool) =>
  [
    tool.name,
    tool.meta,
    tool.slug.replace(/-/g, ' '),
    categoryLabel(tool.category),
    ...(tool.keywords ?? []),
    // i18n-ignore
    getLang() === 'cs' ? t(`keywords:${tool.slug}`) : '',
  ]
    .join(' ')
    .toLowerCase();

export function matches(tt: Tool, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const h = haystack(tt);
  return q.split(/\s+/).every((word) => h.includes(word));
}

export function related(tool: Tool, n = 3): Tool[] {
  const out: Tool[] = [];
  const add = (tt: Tool | undefined) => {
    if (tt && tt.slug !== tool.slug && !out.includes(tt) && out.length < n) out.push(tt);
  };
  add(getTool(tool.reverse));
  const same = tools.filter((tt) => tt.category === tool.category);
  const i = same.indexOf(tool);
  // Neighbours in catalog order first, so related tools feel related.
  for (let d = 1; d < same.length; d++) {
    add(same[i + d]);
    add(same[i - d]);
  }
  for (const tt of tools) add(tt.run && tool.run ? tt : undefined);
  for (const tt of tools) add(tt);
  return out;
}

export function defaultOpts(tool: Tool): Opts {
  const o: Opts = {};
  for (const opt of tool.options ?? []) o[opt.key] = opt.default;
  return o;
}

export function acceptsFile(tool: Tool, file: File) {
  if (!tool.accepts?.length) return true;
  const name = file.name.toLowerCase();
  return tool.accepts.some((ext) => name.endsWith(ext));
}
