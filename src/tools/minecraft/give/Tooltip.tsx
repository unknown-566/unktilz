import type { ReactNode } from 'react';
import { MiniText } from '../../../lib/mc/minimessage';
import { atLeast, itemKinds, type GiveVersion, type ItemSpec } from '../../../lib/mc/give';
import { BLOCK_BY_ID, EFFECT_BY_ID, ENCH_BY_ID, ITEM_BY_ID, SLOT_HEADING, TRIM_MATERIALS, label, roman } from './data';
import { t } from '../../../lib/i18n-core';

const RARITY_COLOR = { common: '#FFFFFF', uncommon: '#FFFF55', rare: '#55FFFF', epic: '#FF55FF' } as const;
const Line = ({ color = '#AAAAAA', children }: { color?: string; children: ReactNode }) => (
  <div className="mct-line" style={{ color }}>
    {children}
  </div>
);
const dur = (s: number) => (s < 0 ? '∞' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
const pct = (n: number) => `${Math.round(n * 100 * 100) / 100}%`;

/** Roughly what the item's tooltip looks like in game, in the game's order. */
export function Tooltip({ spec, version }: { spec: ItemSpec; version: GiveVersion }) {
  const k = itemKinds(spec.item);
  const info = ITEM_BY_ID.get(spec.item);
  const h = spec.hide;
  if (spec.hideTooltip)
    return (
      <div className="mct mct-empty">
        <span className="muted">{t('No tooltip: hovering the item shows nothing.')}</span>
      </div>
    );

  // Enchanted items show their name one rarity up (common → rare), like in game.
  const enchanted = spec.enchants.length > 0 && !k.storedEnchants;
  const rarity = (spec.rarity || 'common') === 'common' && enchanted ? 'rare' : spec.rarity || 'common';
  const nameColor = RARITY_COLOR[rarity];
  const italicName = spec.nameKind === 'custom' && spec.nameItalic;
  const plainName = k.head && spec.head.trim() ? `${spec.head.trim()}'s Head` : (info?.name ?? label(spec.item.replace(/^minecraft:/, '')));
  const name = spec.name.trim() ? (italicName ? `<italic>${spec.name}</italic>` : spec.name) : plainName;
  const modern = atLeast(version, '1.21.5');
  const lines: ReactNode[] = [];
  let n = 0;
  const add = (node: ReactNode) => lines.push(<div key={n++}>{node}</div>);

  if (k.potion && !h.other) {
    for (const e of spec.effects) {
      const ef = EFFECT_BY_ID.get(e.id);
      add(<Line color={ef?.good === false ? '#FF5555' : '#5555FF'}>{`${ef?.name ?? label(e.id)}${e.level > 1 ? ` ${roman(e.level)}` : ''}${e.seconds !== 0 ? ` (${dur(e.seconds)})` : ''}`}</Line>);
    }
    if (!spec.effects.length && spec.potionBase) add(<Line color="#5555FF">{label(spec.potionBase)}</Line>);
  }
  if (k.book && !h.other) {
    add(<Line>by {spec.bookAuthor.trim() || 'unktilz'}</Line>); // i18n-ignore: the game's own words
    add(<Line>Original</Line>); // i18n-ignore: the game's own words
  }
  if ((k.firework || k.star) && !h.other) {
    if (k.firework) add(<Line>Flight Duration: {spec.flight}</Line>); // i18n-ignore: the game's own words
    for (const e of spec.explosions) add(<Line>{`  ${label(e.shape)}${e.trail ? ' · Trail' : ''}${e.twinkle ? ' · Twinkle' : ''}`}</Line>);
  }
  if (k.trim && spec.trimPattern && !h.trim) {
    const mat = TRIM_MATERIALS.find((m) => m.id === spec.trimMaterial);
    add(<Line>Upgrade:</Line>); // i18n-ignore: the game's own words
    add(<Line color={mat?.color}> {label(spec.trimPattern)} Armor Trim</Line>); // i18n-ignore: the game's own words
    add(<Line color={mat?.color}> {label(spec.trimMaterial)} Material</Line>); // i18n-ignore: the game's own words
  }
  if (!h.enchantments)
    for (const e of spec.enchants) {
      const en = ENCH_BY_ID.get(e.id);
      add(<Line color={en?.curse ? '#FF5555' : '#AAAAAA'}>{`${en?.name ?? label(e.id)}${en?.max === 1 && e.level === 1 ? '' : ` ${roman(e.level)}`}`}</Line>);
    }
  if (k.dye && spec.dye && !h.dye && !modern) add(<Line>Dyed</Line>); // i18n-ignore: the game's own words
  for (const l of spec.lore.filter((x) => x.trim()))
    add(
      <div className="mct-line">
        <MiniText text={spec.loreItalic ? `<italic>${l}</italic>` : l} defaultColor="#AA00AA" />
      </div>,
    );
  if (!h.attributes && spec.attributes.length) {
    const bySlot = new Map<string, typeof spec.attributes>();
    for (const a of spec.attributes) bySlot.set(a.slot, [...(bySlot.get(a.slot) ?? []), a]);
    for (const [slot, list] of bySlot) {
      add(<Line> </Line>);
      add(<Line>{SLOT_HEADING[slot] ?? 'When equipped:'}</Line>); // i18n-ignore: the game's own words
      for (const a of list) {
        const neg = a.amount < 0;
        const v = a.op === 'add_value' ? String(Math.abs(a.amount)) : pct(Math.abs(a.amount));
        add(<Line color={neg ? '#FF5555' : '#5555FF'}>{`${neg ? '-' : '+'}${v} ${label(a.type)}`}</Line>);
      }
    }
  }
  if (spec.unbreakable && !h.unbreakable) add(<Line color="#5555FF">Unbreakable</Line>); // i18n-ignore: the game's own words
  for (const [title, list] of [
    ['Can be placed on:', spec.canPlaceOn], // i18n-ignore: the game's own words
    ['Can break:', spec.canBreak], // i18n-ignore
  ] as const) {
    if (!list.length || h.adventure) continue;
    add(<Line> </Line>);
    add(<Line>{title}</Line>);
    for (const b of list) add(<Line color="#555555">{BLOCK_BY_ID.get(b)?.name ?? label(b)}</Line>);
  }

  return (
    <div className="mct" aria-label={t('Item tooltip preview')}>
      <div className="mct-line mct-name">
        <MiniText text={name} defaultColor={nameColor} />
      </div>
      {lines}
    </div>
  );
}
