import { useMemo, useState } from 'react';
import { NumberField, Panel, Segmented, Stat, num } from '../../../components/ui';
import { ENCH_BY_ID } from '../give/data';
import { useAutosave } from '../../../lib/saved';
import { fmtNum, plural, t } from '../../../lib/i18n-core';
import { MAX_STEP, ITEM_KINDS, ROMAN, cheapest, contents, enchantsFor, oneByOne, pointsFor, steps, type Book, type ItemKind, type Plan } from './anvil';

const ITEM_NAMES: Record<ItemKind, string> = {
  netherite_helmet: t('Helmet'),
  netherite_chestplate: t('Chestplate'),
  netherite_leggings: t('Leggings'),
  netherite_boots: t('Boots'),
  netherite_sword: t('Sword'),
  netherite_spear: t('Spear'),
  netherite_axe: t('Axe'),
  netherite_pickaxe: t('Pickaxe'),
  netherite_shovel: t('Shovel'),
  netherite_hoe: t('Hoe'),
  mace: t('Mace'),
  bow: t('Bow'),
  crossbow: t('Crossbow'),
  trident: t('Trident'),
  fishing_rod: t('Fishing rod'),
  shears: t('Shears'),
  elytra: t('Elytra'),
  shield: t('Shield'),
  flint_and_steel: t('Flint and steel'),
  carrot_on_a_stick: t('Carrot on a stick'),
  brush: t('Brush'),
};

type State = { item: ItemKind; picked: Record<string, number>; uses: string };
const DEFAULT: State = { item: 'netherite_sword', picked: { sharpness: 5, looting: 3, fire_aspect: 2, sweeping_edge: 3, unbreaking: 3, mending: 1 }, uses: '0' };

function Chips({ part, item, from }: { part: Plan; item: ItemKind; from?: number }) {
  const c = contents(part);
  return (
    <span className="en-part">
      <span className={`en-thing${c.item ? ' item' : ''}`}>{c.item ? ITEM_NAMES[item] : t('Book')}</span>
      {from !== undefined && <span className="en-from mono">{t('from step {n}', { n: from })}</span>}
      {from === undefined && c.books.map((b) => (
        <span key={b.id} className="en-chip">
          {nameOf(b.id)}
          {b.level > 0 && ROMAN[b.level] && maxOf(b.id) > 1 ? ` ${ROMAN[b.level]}` : ''}
        </span>
      ))}
    </span>
  );
}

const nameOf = (id: string) => ENCH_BY_ID.get(id)?.name ?? id;
const maxOf = (id: string) => ENCH_BY_ID.get(id)?.max ?? 1;

export default function EnchantOrder() {
  const [s, setS] = useState<State>(DEFAULT);
  useAutosave('enchant-order', s, (v) => setS({ ...DEFAULT, ...v }));

  const list = useMemo(() => enchantsFor(s.item), [s.item]);

  // Only what fits this item (switching items keeps what still fits).
  const picked = list.filter((e) => s.picked[e.id]);
  const books: Book[] = picked.map((e) => ({ id: e.id, level: Math.min(e.max, s.picked[e.id]) }));
  const uses = Math.max(0, Math.min(10, Math.round(num(s.uses))));

  const solution = useMemo(() => (books.length ? cheapest(books, uses) : null), [JSON.stringify(books), uses]); // eslint-disable-line react-hooks/exhaustive-deps
  const naive = useMemo(() => oneByOne(books, uses), [JSON.stringify(books), uses]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = solution ? steps(solution.plan) : [];
  /** Which step made a joined part (to say "from step 2" instead of listing it all again). */
  const made = new Map(plan.map((st, i) => [st.node, i + 1]));

  const blockedBy = (id: string) => picked.find((p) => p.id !== id && (p.exclude.includes(id) || list.find((e) => e.id === id)?.exclude.includes(p.id)));

  const toggle = (id: string, max: number) =>
    setS((old) => {
      const next = { ...old.picked };
      if (next[id]) delete next[id];
      else next[id] = max;
      return { ...old, picked: next };
    });
  const setLevel = (id: string, level: number) => setS((old) => ({ ...old, picked: { ...old.picked, [id]: level } }));

  return (
    <>
      <Panel title={t('item')}>
        <div className="en-items" role="group" aria-label={t('Item')}>
          {ITEM_KINDS.map((k) => (
            <button key={k} type="button" className="en-item" aria-pressed={s.item === k} onClick={() => setS((old) => ({ ...old, item: k }))}>
              {ITEM_NAMES[k]}
            </button>
          ))}
        </div>
        <div className="fields" style={{ maxWidth: 320 }}>
          <NumberField
            label={t('Times it was already in an anvil')}
            value={s.uses}
            onChange={(v) => setS((old) => ({ ...old, uses: v }))}
            min={0}
            max={10}
            help={t('Every trip through the anvil makes the next one dearer (1, 3, 7, 15… levels more). A new item from the crafting table or the enchanting table: 0. Renaming counts too.')}
          />
        </div>
      </Panel>

      <Panel
        title={t('enchantments')}
        actions={
          picked.length > 0 ? (
            <button type="button" className="btn btn-sm" onClick={() => setS((old) => ({ ...old, picked: {} }))}>
              {t('clear')}
            </button>
          ) : undefined
        }
      >
        <ul className="en-list">
          {list.map((e) => {
            const on = !!s.picked[e.id];
            const block = on ? undefined : blockedBy(e.id);
            return (
              <li key={e.id} className={`en-row${on ? ' on' : ''}${block ? ' blocked' : ''}${e.curse ? ' curse' : ''}`}>
                <button type="button" className="en-name" aria-pressed={on} disabled={!!block} onClick={() => toggle(e.id, e.max)}>
                  <span className="en-check" aria-hidden="true" />
                  {e.name}
                  {block && <span className="muted en-why"> · {t('not with {name}', { name: block.name })}</span>}
                </button>
                {on && e.max > 1 && (
                  <Segmented
                    compact
                    label={t('Level of {name}', { name: e.name })}
                    value={String(Math.min(e.max, s.picked[e.id]))}
                    onChange={(v) => setLevel(e.id, Number(v))}
                    options={Array.from({ length: e.max }, (_, i) => ({ value: String(i + 1), label: ROMAN[i + 1] }))}
                  />
                )}
              </li>
            );
          })}
        </ul>
        <p className="note">{t('Each enchantment is one book. Enchantment names are in English, like in the game’s commands. Java Edition rules.')}</p>
      </Panel>

      <Panel title={t('cheapest order')}>
        {!books.length && <p className="empty">{t('Pick the enchantments you want above.')}</p>}
        {books.length > 0 && !solution && (
          <p className="error-text" role="alert">
            {t('No order works: some step would cost more than 39 levels ("Too Expensive!"). Leave out an enchantment, or start with an item that has been in the anvil fewer times.')}
          </p>
        )}
        {solution && (
          <>
            <div className="stats" aria-live="polite">
              <Stat label={t('levels in total')} value={fmtNum(solution.total)} />
              <Stat label={t('most expensive step')} value={fmtNum(solution.max)} />
              <Stat label={t('XP points, at least')} value={fmtNum(plan.reduce((a, st) => a + pointsFor(st.cost), 0))} />
              <Stat
                label={t('putting them on one by one')}
                value={naive.possible ? (naive.total > solution.total ? t('{n} levels more', { n: fmtNum(naive.total - solution.total) }) : t('the same')) : t('too expensive')}
              />
            </div>
            <ol className="en-steps">
              {plan.map((st, i) => (
                <li key={i} className={st.final ? 'final' : undefined} style={{ animationDelay: `${i * 50}ms` }}>
                  <span className="en-num mono" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="en-step">
                    <Chips part={st.target} item={s.item} from={made.get(st.target)} />
                    <span className="en-plus" aria-label={t('plus')}>
                      +
                    </span>
                    <Chips part={st.sacrifice} item={s.item} from={made.get(st.sacrifice)} />
                  </span>
                  <span className={`en-cost mono${st.cost > 30 ? ' high' : ''}`}>{plural(st.cost, ['{n} level', '{n} levels'], ['{n} level', '{n} levely', '{n} levelů'])}</span>
                </li>
              ))}
            </ol>
            {plan.length > 0 && (
              <div className="en-result">
                <span className="field-label">{t('Result')}</span>
                <Chips part={solution.plan} item={s.item} />
              </div>
            )}
            <p className="note">
              {t('Put the first thing in the left slot of the anvil and the second in the right one. Books joined in an earlier step are used whole later.')}{' '}
              {plan.length > 0 &&
                plural(solution.work, ['Afterwards the item has been in an anvil {n} time.', 'Afterwards the item has been in an anvil {n} times.'], ['Potom bude mít předmět za sebou {n} průchod kovadlinou.', 'Potom bude mít předmět za sebou {n} průchody kovadlinou.', 'Potom bude mít předmět za sebou {n} průchodů kovadlinou.'])}
            </p>
            <p className="note">{t('A step costs the levels of the enchantments in the right slot (times a number for each enchantment, from 1 for Sharpness to 4 for Silk Touch or Thorns, on a book) plus 1, 3, 7, 15… for every earlier anvil trip of both things. Above {max} levels the game says "Too Expensive!".', { max: MAX_STEP })}</p>
          </>
        )}
      </Panel>
    </>
  );
}
