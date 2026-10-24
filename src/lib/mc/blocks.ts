/**
 * /setblock and /fill: a block with its states and what it holds (sign text, chest items, a
 * spawner's mob, a command block's command…). Formats by version, checked against the Minecraft
 * Wiki: sign text and names are JSON strings until 1.21.4 and SNBT from 1.21.5; a container lock is
 * `Lock` until 1.21.1 and an item predicate `lock` from 1.21.2; `strict`, and a mode after
 * `replace <filter>`, exist from 1.21.5.
 */
import { atLeast, q, textValue, type GiveVersion } from './give';
import { entityNbt, itemStackNbt, type MobSpec } from './entity';
import { miniSegments } from './minimessage';
import type { Stack } from './entityExtras';
import statesRaw from './data/blockStates.json';
import { fmtNum, t } from '../i18n-core';

// ---------- block states ----------

export type StateDef = { name: string; values: string[]; def: string };
const STATES = statesRaw as unknown as { shapes: [string, string[], number][][]; blocks: Record<string, number> };
const clean = (id: string) => id.replace(/^minecraft:/, '').trim();

/** The states a block has, with the value the game gives it by itself. */
export function statesOf(block: string): StateDef[] {
  const i = STATES.blocks[clean(block)];
  return i === undefined ? [] : STATES.shapes[i].map(([name, values, d]) => ({ name, values, def: values[d] }));
}

// ---------- what blocks hold ----------

export type BlockKind = 'sign' | 'container' | 'spawner' | 'command' | 'head' | 'beacon' | 'jukebox' | 'lectern' | null;

/** How many slots a container has (chest 27, hopper 5, dispenser 9…). */
export function slotsOf(block: string) {
  const id = clean(block);
  if (id === 'hopper') return 5;
  if (['dispenser', 'dropper', 'crafter'].includes(id)) return 9;
  return 27;
}

export function kindOf(block: string): BlockKind {
  const id = clean(block);
  if (id.endsWith('_sign')) return 'sign';
  if (['chest', 'trapped_chest', 'barrel', 'hopper', 'dispenser', 'dropper', 'crafter'].includes(id) || id.endsWith('shulker_box')) return 'container';
  if (id === 'spawner') return 'spawner';
  if (id.endsWith('command_block')) return 'command';
  if (id === 'player_head' || id === 'player_wall_head') return 'head';
  if (id === 'beacon' || id === 'jukebox' || id === 'lectern') return id;
  return null;
}

export type SignSide = { lines: [string, string, string, string]; color: string; glow: boolean };
export const emptySide = (): SignSide => ({ lines: ['', '', '', ''], color: '', glow: false });

export type BlockData = {
  /** MiniMessage; the name a container shows when opened, or a command block's name in chat. */
  name: string;
  items: Stack[];
  lootTable: string;
  /** Opens only with an item of this name in hand. */
  lock: string;
  front: SignSide;
  back: SignSide;
  waxed: boolean;
  /** The spawner's mob. */
  mob?: MobSpec;
  /** Spawner numbers as typed; seconds for the delays. */
  delay: string;
  minDelay: string;
  maxDelay: string;
  count: string;
  range: string;
  maxNearby: string;
  playerRange: string;
  command: string;
  /** Command block: runs without redstone. */
  auto: boolean;
  /** A player's name for a head. */
  head: string;
  primary: string;
  secondary: string;
  /** Jukebox disc, lectern book. */
  stack?: Stack;
  page: string;
};

export const emptyData = (): BlockData => ({
  name: '',
  items: [],
  lootTable: '',
  lock: '',
  front: emptySide(),
  back: emptySide(),
  waxed: false,
  delay: '',
  minDelay: '',
  maxDelay: '',
  count: '',
  range: '',
  maxNearby: '',
  playerRange: '',
  command: '',
  auto: false,
  head: '',
  primary: '',
  secondary: '',
  page: '',
});

const num = (s: string) => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};
const ns = (id: string) => q(id.includes(':') ? id : `minecraft:${id}`);
const has = (s?: Stack) => !!s && (!!s.item.trim() || !!s.spec);
const stackNbt = (s: Stack, v: GiveVersion) => itemStackNbt({ item: s.item, glint: false, drop: -1, spec: s.spec }, v, s.count);

function signSide(side: SignSide, v: GiveVersion) {
  const lines = side.lines.map((l) => textValue(l, v, {}, { interactive: true }));
  const parts = [`messages:[${lines.join(',')}]`];
  if (side.color && side.color !== 'black') parts.push(`color:${q(side.color)}`);
  if (side.glow) parts.push('has_glowing_text:1b');
  return `{${parts.join(',')}}`;
}

/** The block entity data for the kind of block, as SNBT parts. */
export function blockDataNbt(block: string, d: BlockData, v: GiveVersion, notes: string[]): string[] {
  const kind = kindOf(block);
  const p: string[] = [];
  const name = d.name.trim() ? textValue(d.name, v) : '';
  switch (kind) {
    case 'sign': {
      const used = (s: SignSide) => s.lines.some((l) => l.trim()) || s.color || s.glow;
      if (used(d.front)) p.push(`front_text:${signSide(d.front, v)}`);
      if (used(d.back)) p.push(`back_text:${signSide(d.back, v)}`);
      if (d.waxed) p.push('is_waxed:1b');
      // From 1.21.5 a sign only runs click commands with op permission when told it may.
      const clicks = [...d.front.lines, ...d.back.lines].some((l) => miniSegments(l).some((s) => s.style.click));
      if (clicks && atLeast(v, '1.21.5')) p.push('allow_op_features:1b');
      break;
    }
    case 'container': {
      const max = slotsOf(block);
      if (d.lootTable.trim()) p.push(`LootTable:${ns(d.lootTable.trim())}`);
      else {
        const items = d.items.filter(has).slice(0, max);
        if (items.length) p.push(`Items:[${items.map((s, i) => `{Slot:${i}b,${stackNbt(s, v).slice(1)}`).join(',')}]`);
      }
      if (name) p.push(`CustomName:${name}`);
      if (d.lock.trim()) {
        if (!atLeast(v, '1.21.2')) p.push(`Lock:${q(d.lock.trim())}`);
        else p.push(`lock:{components:{"minecraft:custom_name":${textValue(d.lock.trim(), v)}}}`);
      }
      break;
    }
    case 'spawner': {
      if (d.mob) p.push(`SpawnData:{entity:${entityNbt(d.mob, v, { notes })}}`);
      const shorts: [string, string, boolean][] = [
        ['Delay', d.delay, true],
        ['MinSpawnDelay', d.minDelay, true],
        ['MaxSpawnDelay', d.maxDelay, true],
        ['SpawnCount', d.count, false],
        ['SpawnRange', d.range, false],
        ['MaxNearbyEntities', d.maxNearby, false],
        ['RequiredPlayerRange', d.playerRange, false],
      ];
      for (const [tag, val, seconds] of shorts) {
        const n = num(val);
        if (n !== null) p.push(`${tag}:${Math.max(0, Math.min(32767, Math.round(seconds ? n * 20 : n)))}s`);
      }
      const min = num(d.minDelay);
      const max = num(d.maxDelay);
      if (min !== null && max !== null && min > max) notes.push(t('The shortest wait is longer than the longest one, so the spawner won\'t work.'));
      break;
    }
    case 'command':
      if (d.command.trim()) p.push(`Command:${q(d.command.trim().replace(/^\//, ''))}`);
      if (d.auto) p.push('auto:1b');
      if (name) p.push(`CustomName:${name}`);
      break;
    case 'head':
      if (d.head.trim()) p.push(`profile:{name:${q(d.head.trim())}}`);
      break;
    case 'beacon':
      if (d.primary) p.push(`primary_effect:${ns(d.primary)}`);
      if (d.secondary) p.push(`secondary_effect:${ns(d.secondary)}`);
      if (name) p.push(`CustomName:${name}`);
      break;
    case 'jukebox':
      if (has(d.stack)) p.push(`RecordItem:${stackNbt({ ...d.stack!, count: 1 }, v)}`);
      break;
    case 'lectern':
      if (has(d.stack)) {
        p.push(`Book:${stackNbt({ ...d.stack!, count: 1 }, v)}`);
        const pg = num(d.page);
        if (pg !== null && pg > 1) p.push(`Page:${Math.round(pg) - 1}`);
      }
      break;
  }
  return p;
}

/** `id[state=value,…]{nbt}` */
export function blockArg(block: string, states: Record<string, string>, nbt: string[]) {
  const id = clean(block) || 'stone';
  const st = Object.entries(states).filter(([, val]) => val !== '');
  return `${id}${st.length ? `[${st.map(([k, val]) => `${k}=${val}`).join(',')}]` : ''}${nbt.length ? `{${nbt.join(',')}}` : ''}`;
}

// ---------- the commands ----------

export type Pos = [string, string, string];
export type How = 'replace' | 'destroy' | 'keep' | 'strict' | 'hollow' | 'outline';

export type BlockSpec = {
  mode: 'setblock' | 'fill';
  block: string;
  /** Only the states that were picked. */
  states: Record<string, string>;
  pos: Pos;
  /** Fill's other corner. */
  to: Pos;
  how: How;
  /** Fill: only replace these blocks (a block or #tag); empty = everything. */
  filter: string;
  data: BlockData;
};

export const emptyBlock = (): BlockSpec => ({ mode: 'setblock', block: 'stone', states: {}, pos: ['~', '~', '~'], to: ['~', '~', '~'], how: 'replace', filter: '', data: emptyData() });

/** The most blocks one /fill may change (the max_block_modifications game rule, 32768 unless raised). */
export const FILL_LIMIT = 32768;

const COORD = /^([~^]-?(\d+\.?\d*|\.\d+)?|-?(\d+\.?\d*|\.\d+))$/;
const clean3 = (p: Pos) => p.map((c) => c.trim().replace(/\s+/g, '') || '~') as Pos;

/** A coordinate as kind and number: 'abs' 12, 'rel' ~3, 'local' ^1. */
const split = (c: string): { kind: 'abs' | 'rel' | 'local'; n: number } =>
  c.startsWith('~') ? { kind: 'rel', n: Number(c.slice(1) || 0) } : c.startsWith('^') ? { kind: 'local', n: Number(c.slice(1) || 0) } : { kind: 'abs', n: Number(c) };

/**
 * The fill area as whole-block ranges, when it can be worked out: both corners given the same way
 * on each axis (both exact, or both ~). Local ^ coordinates turn with the player, so they can't.
 */
export function fillBox(from: Pos, to: Pos) {
  const a = clean3(from).map(split);
  const b = clean3(to).map(split);
  if (a.some((x, i) => x.kind === 'local' || x.kind !== b[i].kind || !Number.isFinite(x.n) || !Number.isFinite(b[i].n))) return null;
  return a.map((x, i) => {
    const lo = Math.floor(Math.min(x.n, b[i].n));
    const hi = Math.floor(Math.max(x.n, b[i].n));
    return { kind: x.kind, lo, hi, size: hi - lo + 1 };
  });
}

const fmt = (kind: string, n: number) => (kind === 'rel' ? (n === 0 ? '~' : `~${n}`) : String(n));

/** Splits a box into pieces of at most FILL_LIMIT blocks: whole height first, then depth, then width. */
function pieces(box: NonNullable<ReturnType<typeof fillBox>>) {
  const [x, y, z] = box;
  const cy = Math.min(y.size, FILL_LIMIT);
  const cz = Math.max(1, Math.min(z.size, Math.floor(FILL_LIMIT / cy)));
  const cx = Math.max(1, Math.min(x.size, Math.floor(FILL_LIMIT / (cy * cz))));
  const out: [Pos, Pos][] = [];
  for (let x0 = x.lo; x0 <= x.hi; x0 += cx)
    for (let y0 = y.lo; y0 <= y.hi; y0 += cy)
      for (let z0 = z.lo; z0 <= z.hi; z0 += cz)
        out.push([
          [fmt(x.kind, x0), fmt(y.kind, y0), fmt(z.kind, z0)],
          [fmt(x.kind, Math.min(x.hi, x0 + cx - 1)), fmt(y.kind, Math.min(y.hi, y0 + cy - 1)), fmt(z.kind, Math.min(z.hi, z0 + cz - 1))],
        ]);
  return out;
}

export type BlockResult = { commands: string[]; notes: string[]; volume: number | null; dims: number[] | null };

function checkPos(p: Pos, notes: string[]) {
  const xyz = clean3(p);
  const bad = xyz.find((c) => !COORD.test(c));
  if (bad) notes.push(t('“{pos}” isn’t a position. Use a number, ~ (where you are) or ^ (where you look), like ~ ~1 ~.', { pos: bad }));
  const local = xyz.filter((c) => c.startsWith('^')).length;
  if (local && local < 3) notes.push(t('^ only works on all three coordinates at once (^ ^ ^2), not mixed with ~ or numbers.'));
  return xyz.join(' ');
}

export function buildBlock(spec: BlockSpec, v: GiveVersion): BlockResult {
  const notes: string[] = [];
  const states = { ...spec.states };
  // A lectern only shows its book with has_book set.
  if (kindOf(spec.block) === 'lectern' && has(spec.data.stack)) states.has_book = 'true';
  const nbt = blockDataNbt(spec.block, spec.data, v, notes);
  const arg = blockArg(spec.block, states, nbt);
  let how = spec.how;
  if (how === 'strict' && !atLeast(v, '1.21.5')) {
    notes.push(t('“Without updates” (strict) needs Minecraft 1.21.5 or newer, so it was left out.'));
    how = 'replace';
  }

  if (spec.mode === 'setblock') {
    if (how === 'hollow' || how === 'outline') how = 'replace';
    const at = checkPos(spec.pos, notes);
    return { commands: [`/setblock ${at} ${arg}${how === 'replace' ? '' : ` ${how}`}`], notes: [...new Set(notes)], volume: 1, dims: [1, 1, 1] };
  }

  checkPos(spec.pos, notes);
  checkPos(spec.to, notes);
  const filter = spec.filter.trim().replace(/\s+/g, '');
  // The end: "replace <filter> [mode]" from 1.21.5; before, the filter ended the command.
  let tail = '';
  if (filter) {
    if (how !== 'replace' && !atLeast(v, '1.21.5')) notes.push(t('Before 1.21.5 a fill that only replaces some blocks can\'t also be hollow, keep or the like; that part was left out.'));
    if (how === 'keep') notes.push(t('“Only into air” and “only replace” together don\'t make sense; only the filter is used.'));
    tail = ` replace ${filter}${how !== 'replace' && how !== 'keep' && atLeast(v, '1.21.5') ? ` ${how}` : ''}`;
  } else if (how !== 'replace') tail = ` ${how}`;

  const box = fillBox(spec.pos, spec.to);
  const dims = box ? box.map((b) => b.size) : null;
  const volume = dims ? dims[0] * dims[1] * dims[2] : null;
  const one = (a: Pos, b: Pos) => `/fill ${clean3(a).join(' ')} ${clean3(b).join(' ')} ${arg}${tail}`;
  if (volume !== null && volume > FILL_LIMIT) {
    if (how === 'hollow' || how === 'outline') {
      notes.push(t('This area has {n} blocks; one fill may change at most 32,768. A hollow or outline fill can\'t be split, so make it smaller or raise the max_block_modifications game rule.', { n: fmtNum(volume) }));
      return { commands: [one(spec.pos, spec.to)], notes: [...new Set(notes)], volume, dims };
    }
    const parts = pieces(box!);
    notes.push(t('This area has {n} blocks; one fill may change at most 32,768, so it\'s split into {count} commands that fill it together.', { n: fmtNum(volume), count: parts.length }));
    if (parts.length > 64) notes.push(t('That\'s a lot of commands: for areas this big a datapack function or WorldEdit is easier.'));
    return { commands: parts.map(([a, b]) => one(a, b)), notes: [...new Set(notes)], volume, dims };
  }
  if (volume === null) notes.push(t('With ^ (or one corner exact and one with ~) the size can\'t be worked out here; one fill may change at most 32,768 blocks.'));
  return { commands: [one(spec.pos, spec.to)], notes: [...new Set(notes)], volume, dims };
}
