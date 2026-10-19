import type { Category, Opts, Tool } from './types';

export type { Category, Opts, Tool } from './types';
export { isNew, NEW_DAYS } from './types';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'minecraft', label: 'Minecraft' },
  { id: 'dev', label: 'Dev' },
  { id: 'image', label: 'Image' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'pdf', label: 'PDF' },
  { id: 'text', label: 'Text' },
  { id: 'calc', label: 'Calc & generators' },
];

export const categoryLabel = (id: Category) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

// Every *.tool.ts file default-exports one tool. Dropping a new file in src/tools registers it.
const modules = import.meta.glob<{ default: Tool }>('../tools/**/*.tool.ts', { eager: true });

const catIndex = (c: Category) => CATEGORIES.findIndex((x) => x.id === c);

export const tools: Tool[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => catIndex(a.category) - catIndex(b.category) || a.order - b.order || a.name.localeCompare(b.name));

const bySlug = new Map<string, Tool>();
for (const t of tools) {
  if (bySlug.has(t.slug)) console.error(`[registry] duplicate tool slug "${t.slug}"`);
  bySlug.set(t.slug, t);
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

export const fileTools = tools.filter((t) => t.run);

/** Categories that have at least one tool, in display order, with their tools. */
export const groups = CATEGORIES.map((c) => ({ ...c, tools: tools.filter((t) => t.category === c.id) })).filter(
  (g) => g.tools.length > 0,
);

const haystack = (t: Tool) =>
  [t.name, t.meta, t.slug.replace(/-/g, ' '), categoryLabel(t.category), ...(t.keywords ?? [])].join(' ').toLowerCase();

export function matches(t: Tool, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const h = haystack(t);
  return q.split(/\s+/).every((word) => h.includes(word));
}

export function related(tool: Tool, n = 3): Tool[] {
  const out: Tool[] = [];
  const add = (t: Tool | undefined) => {
    if (t && t.slug !== tool.slug && !out.includes(t) && out.length < n) out.push(t);
  };
  add(getTool(tool.reverse));
  const same = tools.filter((t) => t.category === tool.category);
  const i = same.indexOf(tool);
  // Neighbours in catalog order first, so related tools feel related.
  for (let d = 1; d < same.length; d++) {
    add(same[i + d]);
    add(same[i - d]);
  }
  for (const t of tools) add(t.run && tool.run ? t : undefined);
  for (const t of tools) add(t);
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
