import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { MC_COLORS, MC_FORMATS, legacyToMiniMessage } from '../text';
import { buildGive, emptySpec, textComponent, type Comp, type GiveVersion, type ItemSpec } from '../give';
import { TWEAKS, tweakFiles } from './tweaks';
import { pngSize } from './pixels';
import { KNOWN_FORMATS, type Format, type Vanilla } from './vanilla';
import { t } from '../../i18n-core';

/**
 * A resource pack being made. Only what the player changed or added is in here; the game's own
 * files come from the loaded version (src/lib/mc/pack/vanilla.ts) and never go into the pack.
 */
export type TextureEntry = {
  png: Uint8Array;
  /** The texture's own .mcmeta (animation…), as JSON text; none = the game's own one, if any. */
  mcmeta?: string;
};
export type PackDoc = {
  name: string;
  /** MiniMessage, shown under the name in the game's pack list. */
  description: string;
  /** The version the pack is made with (its textures are the ones shown). */
  version: string;
  /** Oldest version it should also work in ('' = only `version`). */
  minVersion: string;
  icon: Uint8Array | null;
  /** Paths below assets/minecraft/, e.g. "textures/block/stone.png". */
  textures: Record<string, TextureEntry>;
  /** Other files from an opened pack (paths from the pack's root), written back as they were. */
  extra: Record<string, Uint8Array>;
  /** Other top-level parts of an opened pack's pack.mcmeta (language, overlays, filter…). */
  mcmetaRest: Record<string, unknown>;
  /** Picked one-click changes (src/lib/mc/pack/tweaks.ts). */
  tweaks: string[];
  /** New items for /give, with their own texture. */
  items: CustomItem[];
  /** The pack's own namespace for those items and sounds ('' = from the pack's name). */
  namespace: string;
  /** Sound events played with the player's own sounds instead (event → its new sounds). */
  sounds: Record<string, SoundEntry>;
  /** Changed game texts: language code ("en_us", "cs_cz") → key → text. */
  lang: Record<string, Record<string, string>>;
  /** The yellow lines on the title screen: added to the game's or instead of them. */
  splashes: { mode: 'add' | 'replace'; lines: string[] } | null;
};

/** The game picks one of `files` at random each time the event plays. */
export type SoundEntry = {
  files: { id: string; name: string; ogg: Uint8Array }[];
  /** The game's subtitle key, kept so subtitles still show. */
  subtitle?: string;
};

/**
 * An item of its own: `/give @p diamond_sword[item_model="ns:ruby_sword"]` shows its texture
 * (1.21.2+); older versions find it by custom_model_data on the base item.
 */
export type CustomItem = {
  /** a–z, 0–9 and _ only: the file name and the second half of the item_model id. */
  id: string;
  /** Shown in the game (MiniMessage). */
  name: string;
  /** The item it's made from, e.g. "diamond_sword". */
  base: string;
  /** Held like a tool or sword, or like a flat item. */
  style: 'handheld' | 'generated';
  png: Uint8Array | null;
  mcmeta?: string;
  /** custom_model_data for versions before 1.21.2. */
  cmd: number;
};

export const emptyPack = (version = ''): PackDoc => ({
  name: t('My pack'),
  description: t('<gray>Made with unktilz'),
  version,
  minVersion: '',
  icon: null,
  textures: {},
  extra: {},
  mcmetaRest: {},
  tweaks: [],
  items: [],
  namespace: '',
  sounds: {},
  lang: {},
  splashes: null,
});

/** Music plays streamed and in stereo; everything else comes from a place in the world (mono). */
export const isMusic = (event: string) => /^(music|music_disc)\./.test(event);
/** Where a custom sound file goes, below assets/<namespace>/sounds/ (without .ogg). */
export const soundFile = (event: string, id: string) => `custom/${event}/${id}`;

export const changedCount = (d: PackDoc) => Object.keys(d.textures).length;

/** The namespace for the pack's own items: what was set, or one made from the pack's name. */
export function packNamespace(d: PackDoc) {
  const ns = (d.namespace || slugName(d.name)).replace(/[^a-z0-9_.-]/g, '_');
  return ns === 'minecraft' || ns === 'realms' ? `${ns}_pack` : ns || 'pack';
}

/** The version of /give and text formats that fits a pack format. */
export function giveVersionOf(f: Format): GiveVersion {
  if (f[0] >= 84) return '26.1';
  if (f[0] >= 55) return '1.21.5';
  if (f[0] >= 46) return '1.21.4';
  if (f[0] >= 42) return '1.21.2';
  if (f[0] >= 34) return '1.21';
  return '1.20.5';
}

/** item_model works from 1.21.2 (format 42); item definitions in items/ from 1.21.4 (46). */
export const ITEM_MODEL_FORMAT = 42;
const ITEMS_FOLDER_FORMAT = 46;
/** A file and folder friendly name: "My Pack!" → "my_pack". */
export const slugName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'pack';

/** The format range a pack covers: from `minVersion` (if known) up to the loaded version. */
export function formatRange(doc: PackDoc, vanilla: Pick<Vanilla, 'format'>): { min: Format; max: Format } {
  const max = vanilla.format;
  const min = (doc.minVersion && KNOWN_FORMATS[doc.minVersion]) || max;
  return { min: min[0] > max[0] ? max : min, max };
}

/**
 * pack.mcmeta (minecraft.wiki, Pack.mcmeta): from format 65 (1.21.9) `min_format` and `max_format`
 * are required; a pack that also covers older formats needs `pack_format` and `supported_formats`
 * too, with the same major versions. Packs for old versions only keep the old fields.
 */
export function packMcmeta(doc: PackDoc, vanilla: Pick<Vanilla, 'format'>): string {
  const { min, max } = formatRange(doc, vanilla);
  const desc = textComponent(doc.description, giveVersionOf(min));
  const keys = Object.keys(desc);
  const description: Comp | string = keys.length === 1 && keys[0] === 'text' ? String(desc.text) : desc;
  const pack: Record<string, unknown> = { description };
  if (min[0] < 65) {
    pack.pack_format = min[0];
    if (min[0] !== max[0]) pack.supported_formats = [min[0], max[0]];
  }
  if (max[0] >= 65) {
    pack.min_format = [min[0], min[1]];
    // A single number: any minor version of that major one.
    pack.max_format = max[0];
  }
  return JSON.stringify({ ...doc.mcmetaRest, pack }, null, 2) + '\n';
}

/**
 * The .mcmeta to write next to a changed texture: its own one, or else the game's (an animation or
 * how it's blurred when far away belongs to the texture, and the game reads it from the same pack).
 * A game animation is dropped when the new picture has a single frame.
 */
export function textureMcmeta(path: string, entry: TextureEntry, vanilla: Pick<Vanilla, 'files'> | null): string | null {
  if (entry.mcmeta !== undefined) return entry.mcmeta || null;
  const own = vanilla?.files[`${path}.mcmeta`];
  if (!own) return null;
  try {
    const meta = JSON.parse(strFromU8(own)) as Record<string, unknown>;
    const size = pngSize(entry.png);
    if (meta.animation && size && size.h <= size.w) delete meta.animation;
    return Object.keys(meta).length ? JSON.stringify(meta, null, 2) + '\n' : null;
  } catch {
    return null;
  }
}

const json = (v: unknown) => strToU8(JSON.stringify(v, null, 2) + '\n');

/** The base item's model for versions before 1.21.2, with an override per custom item on it. */
function baseModelWithOverrides(base: string, items: CustomItem[], ns: string, vanilla: Pick<Vanilla, 'files'>): Uint8Array {
  let model: Record<string, unknown> = {};
  try {
    const own = vanilla.files[`models/item/${base}.json`];
    if (own) model = JSON.parse(strFromU8(own)) as Record<string, unknown>;
  } catch {
    model = {};
  }
  // Newer versions have no item model for blocks (or the file is missing): a plain one does the job.
  if (!model.parent && !model.textures)
    model = vanilla.files[`textures/item/${base}.png`] ? { parent: 'minecraft:item/generated', textures: { layer0: `minecraft:item/${base}` } } : { parent: `minecraft:block/${base}` };
  const had = Array.isArray(model.overrides) ? (model.overrides as unknown[]) : [];
  // The game uses the last override that fits, so ours go after the game's, smallest number first.
  model.overrides = [...had, ...[...items].sort((a, b) => a.cmd - b.cmd).map((it) => ({ predicate: { custom_model_data: it.cmd }, model: `${ns}:item/${it.id}` }))];
  return json(model);
}

/** Notes the pack maker keeps in the pack, so opening it again gives back its items and tweaks. */
const OWN_NOTES = 'unktilz.json';

/** Every file of the pack, by its path inside the zip. */
export function packFiles(doc: PackDoc, vanilla: Pick<Vanilla, 'format' | 'files'>): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = { ...doc.extra };
  const { min, max } = formatRange(doc, vanilla);
  files['pack.mcmeta'] = strToU8(packMcmeta(doc, vanilla));
  if (doc.icon) files['pack.png'] = doc.icon;

  // One-click tweaks first, so a texture the player changed by hand wins over them.
  const tweaked = tweakFiles(doc.tweaks ?? [], (p) => vanilla.files[p]);
  for (const [path, data] of Object.entries(tweaked)) {
    files[`assets/minecraft/${path}`] = data;
    const meta = path.endsWith('.png') ? textureMcmeta(path, { png: data }, vanilla) : null;
    if (meta) files[`assets/minecraft/${path}.mcmeta`] = strToU8(meta);
  }

  for (const [path, entry] of Object.entries(doc.textures)) {
    files[`assets/minecraft/${path}`] = entry.png;
    const meta = textureMcmeta(path, entry, vanilla);
    const metaPath = `assets/minecraft/${path}.mcmeta`;
    if (meta) files[metaPath] = strToU8(meta);
    else delete files[metaPath];
  }

  const items = (doc.items ?? []).filter((it) => it.png);
  if (items.length) {
    const ns = packNamespace(doc);
    for (const it of items) {
      files[`assets/${ns}/textures/item/${it.id}.png`] = it.png!;
      if (it.mcmeta) files[`assets/${ns}/textures/item/${it.id}.png.mcmeta`] = strToU8(it.mcmeta);
      // 1.21.2–1.21.3 read item_model as this model; 1.21.4+ through the item definition below.
      files[`assets/${ns}/models/item/${it.id}.json`] = json({ parent: it.style === 'handheld' ? 'minecraft:item/handheld' : 'minecraft:item/generated', textures: { layer0: `${ns}:item/${it.id}` } });
      if (max[0] >= ITEMS_FOLDER_FORMAT) files[`assets/${ns}/items/${it.id}.json`] = json({ model: { type: 'minecraft:model', model: `${ns}:item/${it.id}` } });
    }
    if (min[0] < ITEM_MODEL_FORMAT) {
      const byBase = new Map<string, CustomItem[]>();
      for (const it of items) byBase.set(it.base, [...(byBase.get(it.base) ?? []), it]);
      for (const [base, list] of byBase) files[`assets/minecraft/models/item/${base}.json`] = baseModelWithOverrides(base, list, ns, vanilla);
    }
  }

  // Sounds: the files in the pack's namespace, and sounds.json pointing the events at them.
  const sounds = Object.entries(doc.sounds ?? {}).filter(([, e]) => e.files.length);
  if (sounds.length) {
    const ns = packNamespace(doc);
    let soundsJson: Record<string, unknown> = {};
    try {
      // An opened pack's own sounds.json keeps its other events.
      const had = files['assets/minecraft/sounds.json'];
      if (had) soundsJson = JSON.parse(strFromU8(had)) as Record<string, unknown>;
    } catch {
      soundsJson = {};
    }
    for (const [event, entry] of sounds) {
      const music = isMusic(event);
      soundsJson[event] = {
        replace: true,
        ...(entry.subtitle ? { subtitle: entry.subtitle } : {}),
        sounds: entry.files.map((f) => {
          files[`assets/${ns}/sounds/${soundFile(event, f.id)}.ogg`] = f.ogg;
          const name = `${ns}:${soundFile(event, f.id)}`;
          return music ? { name, stream: true } : name;
        }),
      };
    }
    files['assets/minecraft/sounds.json'] = json(soundsJson);
  }

  // Texts: only the changed keys; the game takes the rest from its own language file.
  for (const [code, keys] of Object.entries(doc.lang ?? {})) {
    if (!Object.keys(keys).length) continue;
    let merged: Record<string, string> = {};
    try {
      const had = files[`assets/minecraft/lang/${code}.json`];
      if (had) merged = JSON.parse(strFromU8(had)) as Record<string, string>;
    } catch {
      merged = {};
    }
    files[`assets/minecraft/lang/${code}.json`] = json({ ...merged, ...keys });
  }

  if (doc.splashes) {
    const own = doc.splashes.lines.map((l) => l.trim()).filter(Boolean);
    const game = doc.splashes.mode === 'add' && vanilla.files['texts/splashes.txt'] ? strFromU8(vanilla.files['texts/splashes.txt']).replace(/\s+$/, '') : '';
    files['assets/minecraft/texts/splashes.txt'] = strToU8([game, ...own].filter(Boolean).join('\n') + '\n');
  }

  if (items.length || doc.tweaks?.length || sounds.length || doc.splashes)
    files[OWN_NOTES] = json({
      made_with: 'unktilz',
      namespace: packNamespace(doc),
      tweaks: doc.tweaks ?? [],
      textures: Object.keys(doc.textures),
      sounds: Object.fromEntries(sounds.map(([event, e]) => [event, e.files.map(({ id, name }) => ({ id, name }))])),
      splashes: doc.splashes,
      items: items.map(({ id, name, base, style, cmd }) => ({ id, name, base, style, cmd })),
    });
  return files;
}

/** The /give commands for a custom item: item_model (1.21.2+) and custom_model_data (older), as the pack covers them. */
export function giveCommands(doc: PackDoc, it: CustomItem, vanilla: Pick<Vanilla, 'format'>): { label: string; command: string; spec: ItemSpec }[] {
  const { min, max } = formatRange(doc, vanilla);
  const out: { label: string; command: string; spec: ItemSpec }[] = [];
  const base: ItemSpec = { ...emptySpec(), item: it.base, name: it.name };
  if (max[0] >= ITEM_MODEL_FORMAT) {
    const spec = { ...base, itemModel: `${packNamespace(doc)}:${it.id}` };
    out.push({ label: min[0] < ITEM_MODEL_FORMAT ? t('1.21.2 and newer') : '', command: buildGive(spec, giveVersionOf(max)).command, spec });
  }
  if (min[0] < ITEM_MODEL_FORMAT) {
    const spec = { ...base, modelData: String(it.cmd) };
    out.push({ label: max[0] >= ITEM_MODEL_FORMAT ? t('before 1.21.2') : '', command: buildGive(spec, giveVersionOf(min)).command, spec });
  }
  return out;
}

/** The pack as a .zip (PNGs are stored as they are, everything else compressed). */
export function buildPackZip(doc: PackDoc, vanilla: Pick<Vanilla, 'format' | 'files'>): Uint8Array {
  const files = packFiles(doc, vanilla);
  const zipped: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const [path, data] of Object.entries(files)) zipped[path] = [data, { level: path.endsWith('.png') || path.endsWith('.ogg') ? 0 : 6 }];
  return zipSync(zipped);
}

// ---- opening a pack ----

const CODE_BY_NAME = new Map<string, string>(MC_COLORS.map((c) => [c.name, c.code]));

/** A text component (from a pack's description) → legacy § text, for turning into MiniMessage. */
function componentLegacy(c: unknown, inherited = ''): string {
  if (typeof c === 'string') return inherited + c;
  if (Array.isArray(c)) return c.map((x) => componentLegacy(x, inherited)).join('');
  if (!c || typeof c !== 'object') return '';
  const o = c as Record<string, unknown>;
  let style = inherited;
  if (typeof o.color === 'string') {
    const code = CODE_BY_NAME.get(o.color);
    style = code ? `§${code}` : /^#[0-9a-f]{6}$/i.test(o.color) ? `§#${o.color.slice(1)}` : style;
  }
  for (const f of MC_FORMATS) if (o[f.name] === true) style += `§${f.code}`;
  const own = typeof o.text === 'string' ? o.text : typeof o.translate === 'string' ? o.translate : '';
  const extra = Array.isArray(o.extra) ? o.extra.map((x) => componentLegacy(x, style)).join('') : '';
  return (own ? style + own : '') + extra;
}

export const descriptionToMini = (d: unknown) => legacyToMiniMessage(componentLegacy(d)).replace(/^<reset>/, '');

export type OpenedPack = { doc: PackDoc; format: Format | null; skipped: number };

/** Reads a resource pack .zip (or a folder zipped one level deep) into a PackDoc. */
export function readPackZip(bytes: Uint8Array, name: string, version: string): OpenedPack {
  let all: Record<string, Uint8Array>;
  try {
    all = unzipSync(bytes);
  } catch {
    throw new Error(t('This isn’t a .zip file, or it’s damaged.'));
  }
  const metaPath = Object.keys(all)
    .filter((p) => p.endsWith('pack.mcmeta'))
    .sort((a, b) => a.length - b.length)[0];
  if (metaPath === undefined) throw new Error(t('No pack.mcmeta in this .zip, so it isn’t a resource pack.'));
  const root = metaPath.slice(0, -'pack.mcmeta'.length);
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(strFromU8(all[metaPath]).replace(/^﻿/, ''));
  } catch {
    throw new Error(t('pack.mcmeta in this .zip isn’t valid JSON.'));
  }
  const { pack, ...rest } = meta as { pack?: Record<string, unknown> };
  const fmt = (v: unknown): Format | null => (typeof v === 'number' ? [v, 0] : Array.isArray(v) && typeof v[0] === 'number' ? [v[0], typeof v[1] === 'number' ? v[1] : 0] : null);
  const max = fmt(pack?.max_format) ?? fmt(Array.isArray(pack?.supported_formats) ? (pack.supported_formats as number[])[1] : (pack?.supported_formats as { max_inclusive?: number })?.max_inclusive) ?? fmt(pack?.pack_format);
  const min = fmt(pack?.min_format) ?? fmt(Array.isArray(pack?.supported_formats) ? (pack.supported_formats as number[])[0] : (pack?.supported_formats as { min_inclusive?: number })?.min_inclusive) ?? fmt(pack?.pack_format);
  const minVersion = min && max && min[0] < max[0] ? (Object.entries(KNOWN_FORMATS).find(([, f]) => f[0] === min[0])?.[0] ?? '') : '';

  const doc: PackDoc = { ...emptyPack(version), name: name.replace(/\.zip$/i, '').slice(0, 60), description: descriptionToMini(pack?.description ?? ''), minVersion, mcmetaRest: rest };
  let skipped = 0;
  for (const [full, data] of Object.entries(all)) {
    if (!full.startsWith(root) || full.endsWith('/')) {
      if (!full.endsWith('/')) skipped++;
      continue;
    }
    const p = full.slice(root.length);
    if (p === 'pack.mcmeta') continue;
    if (p === 'pack.png') {
      doc.icon = data;
      continue;
    }
    const lang = p.match(/^assets\/minecraft\/lang\/([a-z0-9_]+)\.json$/);
    if (lang) {
      try {
        const keys = JSON.parse(strFromU8(data).replace(/^﻿/, '')) as Record<string, unknown>;
        if (keys && typeof keys === 'object' && Object.values(keys).every((v) => typeof v === 'string')) {
          doc.lang[lang[1]] = keys as Record<string, string>;
          continue;
        }
      } catch {
        /* not a language file after all: kept as it is */
      }
    }
    if (p === 'assets/minecraft/texts/splashes.txt') {
      doc.splashes = { mode: 'replace', lines: strFromU8(data).split(/\r?\n/).filter((l) => l.trim()) };
      continue;
    }
    const tex = p.match(/^assets\/minecraft\/(textures\/.+\.png)(\.mcmeta)?$/);
    if (tex) {
      const entry = (doc.textures[tex[1]] ??= { png: new Uint8Array(0) });
      if (tex[2]) entry.mcmeta = strFromU8(data);
      else entry.png = data;
      continue;
    }
    doc.extra[p] = data;
  }
  // A lone .mcmeta without its picture stays a plain file.
  for (const [path, entry] of Object.entries(doc.textures))
    if (!entry.png.length) {
      if (entry.mcmeta !== undefined) doc.extra[`assets/minecraft/${path}.mcmeta`] = strToU8(entry.mcmeta);
      delete doc.textures[path];
    }

  // Made here before: its items and tweaks come back as items and tweaks, not as loose files.
  const notesBytes = doc.extra[OWN_NOTES];
  if (notesBytes) {
    delete doc.extra[OWN_NOTES];
    try {
      const notes = JSON.parse(strFromU8(notesBytes)) as {
        namespace?: string;
        tweaks?: string[];
        textures?: string[];
        items?: Partial<CustomItem>[];
        sounds?: Record<string, { id: string; name: string }[]>;
        splashes?: PackDoc['splashes'];
      };
      if (notes.splashes && Array.isArray(notes.splashes.lines)) doc.splashes = { mode: notes.splashes.mode === 'add' ? 'add' : 'replace', lines: notes.splashes.lines.map(String) };
      // Sounds made here: the files and their events in sounds.json become sounds again.
      if (notes.sounds && Object.keys(notes.sounds).length) {
        const nsS = typeof notes.namespace === 'string' ? notes.namespace : '';
        let soundsJson: Record<string, { subtitle?: string }> = {};
        try {
          soundsJson = JSON.parse(strFromU8(doc.extra['assets/minecraft/sounds.json'] ?? strToU8('{}')));
        } catch {
          soundsJson = {};
        }
        for (const [event, list] of Object.entries(notes.sounds)) {
          const files: SoundEntry['files'] = [];
          for (const f of list) {
            const path = `assets/${nsS}/sounds/${soundFile(event, f.id)}.ogg`;
            if (doc.extra[path]) files.push({ id: f.id, name: f.name, ogg: doc.extra[path] });
            delete doc.extra[path];
          }
          if (files.length) doc.sounds[event] = { files, subtitle: soundsJson[event]?.subtitle };
          delete soundsJson[event];
        }
        if (Object.keys(soundsJson).length) doc.extra['assets/minecraft/sounds.json'] = json(soundsJson);
        else delete doc.extra['assets/minecraft/sounds.json'];
      }
      // Textures changed by hand stay, also where a tweak would write.
      const own = new Set(notes.textures ?? []);
      const ns = typeof notes.namespace === 'string' ? notes.namespace : '';
      doc.namespace = ns;
      for (const id of notes.tweaks ?? []) {
        const tw = TWEAKS.find((x) => x.id === id);
        if (!tw) continue;
        doc.tweaks.push(id);
        for (const p of tw.paths) {
          if (own.has(p)) continue;
          delete doc.textures[p];
          delete doc.extra[`assets/minecraft/${p}`];
          delete doc.extra[`assets/minecraft/${p}.mcmeta`];
        }
      }
      for (const raw of notes.items ?? []) {
        if (!raw.id || !/^[a-z0-9_.-]+$/.test(raw.id)) continue;
        const tex = `assets/${ns}/textures/item/${raw.id}.png`;
        const png = doc.extra[tex] ?? null;
        const meta = doc.extra[`${tex}.mcmeta`];
        doc.items.push({ id: raw.id, name: String(raw.name ?? raw.id), base: String(raw.base ?? 'paper'), style: raw.style === 'generated' ? 'generated' : 'handheld', cmd: Number(raw.cmd) || 1, png, mcmeta: meta ? strFromU8(meta) : undefined });
        for (const p of [tex, `${tex}.mcmeta`, `assets/${ns}/models/item/${raw.id}.json`, `assets/${ns}/items/${raw.id}.json`]) delete doc.extra[p];
        delete doc.extra[`assets/minecraft/models/item/${raw.base}.json`];
      }
    } catch {
      /* unreadable notes: everything stays as plain files */
    }
  }
  return { doc, format: max, skipped };
}
