// i18n-ignore-file: enchantment ids and item ids
import { ENCHANTS, ITEM_BY_ID, type EnchInfo } from '../give/data';

/**
 * Anvil costs in Java Edition (minecraft.wiki/w/Anvil_mechanics). When the thing put in the second
 * slot is a book, each of its enchantments costs level × this; from an item it would be double.
 */
export const BOOK_COST: Record<string, number> = {
  protection: 1, fire_protection: 1, feather_falling: 1, blast_protection: 2, projectile_protection: 1, thorns: 4, respiration: 2, depth_strider: 2,
  aqua_affinity: 2, sharpness: 1, smite: 1, bane_of_arthropods: 1, knockback: 1, fire_aspect: 2, looting: 2, efficiency: 1, silk_touch: 4, unbreaking: 1,
  fortune: 2, power: 1, punch: 2, flame: 2, infinity: 4, luck_of_the_sea: 2, lure: 2, frost_walker: 2, mending: 2, binding_curse: 4, vanishing_curse: 4,
  impaling: 2, riptide: 2, loyalty: 1, channeling: 4, multishot: 2, piercing: 1, quick_charge: 1, soul_speed: 4, swift_sneak: 4, wind_burst: 2, density: 1,
  breach: 2, lunge: 1, sweeping_edge: 2,
};

/** A step costing more than this is "Too Expensive!" in survival. */
export const MAX_STEP = 39;

/** The extra cost of something that has been through the anvil `work` times. */
export const penalty = (work: number) => 2 ** work - 1;

/** The kinds of items (one item id stands for all its materials: they take the same enchantments). */
export const ITEM_KINDS = [
  'netherite_helmet', 'netherite_chestplate', 'netherite_leggings', 'netherite_boots', 'netherite_sword', 'netherite_spear', 'netherite_axe', 'netherite_pickaxe',
  'netherite_shovel', 'netherite_hoe', 'mace', 'bow', 'crossbow', 'trident', 'fishing_rod', 'shears', 'elytra', 'shield', 'flint_and_steel', 'carrot_on_a_stick', 'brush',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** The enchantments an item can get, the normal ones first and the curses last. */
export function enchantsFor(item: ItemKind): EnchInfo[] {
  const cats = ITEM_BY_ID.get(item)?.cats ?? [];
  return ENCHANTS.filter((e) => cats.includes(e.cat) && BOOK_COST[e.id] !== undefined).sort((a, b) => Number(a.curse) - Number(b.curse) || a.name.localeCompare(b.name));
}

export type Book = { id: string; level: number };

export type Plan =
  | { kind: 'item' }
  | { kind: 'book'; book: Book }
  | { kind: 'merge'; target: Plan; sacrifice: Plan; cost: number; work: number };

type Best = { cost: number; max: number; plan: Plan };
/** Per work count: the cheapest way to get there. */
type Options = (Best | undefined)[];

const keep = (opts: Options, work: number, b: Best) => {
  const old = opts[work];
  if (!old || b.cost < old.cost || (b.cost === old.cost && b.max < old.max)) opts[work] = b;
};

const bookValue = (b: Book) => b.level * (BOOK_COST[b.id] ?? 1);

export type Solution = { total: number; max: number; plan: Plan; work: number };

/**
 * The cheapest order to put `books` (one enchantment each, work 0) on an item that has been through
 * the anvil `itemWork` times. Tries every way of joining books into books first and every order of
 * putting them on the item, keeping each step at 39 levels or less. Null: no order is possible.
 */
export function cheapest(books: Book[], itemWork = 0): Solution | null {
  const n = books.length;
  const full = (1 << n) - 1;
  const value = new Array<number>(1 << n).fill(0);
  for (let m = 1; m <= full; m++) {
    const low = m & -m;
    value[m] = value[m ^ low] + bookValue(books[31 - Math.clz32(low)]);
  }

  // Books joined into one book.
  const joined: Options[] = new Array(1 << n);
  for (let m = 1; m <= full; m++) {
    const opts: Options = [];
    if ((m & (m - 1)) === 0) opts[0] = { cost: 0, max: 0, plan: { kind: 'book', book: books[31 - Math.clz32(m)] } };
    else
      for (let a = (m - 1) & m; a > 0; a = (a - 1) & m) {
        const s = m ^ a;
        joinInto(opts, joined[a], joined[s], value[s]);
      }
    joined[m] = opts;
  }

  // The item with some of the books on it.
  const onItem: Options[] = new Array(1 << n);
  onItem[0] = [];
  onItem[0][itemWork] = { cost: 0, max: 0, plan: { kind: 'item' } };
  for (let m = 1; m <= full; m++) {
    const opts: Options = [];
    // a: the books already on the item (may be none), s: the book put on now.
    for (let a = (m - 1) & m; ; a = (a - 1) & m) {
      joinInto(opts, onItem[a], joined[m ^ a], value[m ^ a]);
      if (a === 0) break;
    }
    onItem[m] = opts;
  }

  let best: Solution | null = null;
  onItem[full].forEach((b, work) => {
    if (b && (!best || b.cost < best.total || (b.cost === best.total && b.max < best.max))) best = { total: b.cost, max: b.max, plan: b.plan, work };
  });
  return best;
}

function joinInto(out: Options, targets: Options, sacrifices: Options, sacrificeValue: number) {
  targets.forEach((t, wt) => {
    if (!t) return;
    sacrifices.forEach((s, ws) => {
      if (!s) return;
      const step = sacrificeValue + penalty(wt) + penalty(ws);
      if (step > MAX_STEP) return;
      const work = Math.max(wt, ws) + 1;
      keep(out, work, { cost: t.cost + s.cost + step, max: Math.max(t.max, s.max, step), plan: { kind: 'merge', target: t.plan, sacrifice: s.plan, cost: step, work } });
    });
  });
}

/** Putting the books on the item one after another, in this order (what most people do). */
export function oneByOne(books: Book[], itemWork = 0) {
  let work = itemWork;
  let total = 0;
  let max = 0;
  for (const b of books) {
    const step = bookValue(b) + penalty(work);
    total += step;
    max = Math.max(max, step);
    work++;
  }
  return { total, max, possible: max <= MAX_STEP };
}

export type Step = { node: Plan; target: Plan; sacrifice: Plan; cost: number; work: number; final: boolean };

/** The anvil steps of a plan in an order that works (what goes in comes before it is used). */
export function steps(plan: Plan): Step[] {
  const out: Step[] = [];
  const walk = (p: Plan) => {
    if (p.kind !== 'merge') return;
    walk(p.sacrifice);
    walk(p.target);
    out.push({ node: p, target: p.target, sacrifice: p.sacrifice, cost: p.cost, work: p.work, final: false });
  };
  walk(plan);
  if (out.length) out[out.length - 1].final = true;
  return out;
}

/** The books in a part of the plan, and whether the item is in it. */
export function contents(p: Plan): { item: boolean; books: Book[] } {
  if (p.kind === 'item') return { item: true, books: [] };
  if (p.kind === 'book') return { item: false, books: [p.book] };
  const a = contents(p.target);
  const b = contents(p.sacrifice);
  return { item: a.item || b.item, books: [...a.books, ...b.books] };
}

/** Experience points to go from level `from` to `from + levels`, for spending levels at the anvil. */
export function pointsFor(levels: number) {
  const total = (l: number) => (l <= 16 ? l * l + 6 * l : l <= 31 ? 2.5 * l * l - 40.5 * l + 360 : 4.5 * l * l - 162.5 * l + 2220);
  return total(levels);
}

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
