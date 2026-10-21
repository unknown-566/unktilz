import type { ReactNode } from 'react';
import { Help } from '../../../components/Help';
import { useSaved } from '../../../lib/saved';
import type { Effect, ItemSpec } from '../../../lib/mc/give';
import { EQUIP_SLOTS, babyIsPermanent, type Equip, type EquipSlot, type MobSpec } from '../../../lib/mc/entity';
import { ATTRIBUTES, EFFECTS, ITEMS, ITEM_BY_ID, MOBS, MOB_BY_ID } from './data';
import { Combo } from './Pickers';
import { t } from '../../../lib/i18n-core';

const MOB_OPTIONS = MOBS.map((m) => ({ id: m.id, name: m.name }));
const ITEM_OPTIONS = ITEMS.map((i) => ({ id: i.id, name: i.name }));
const COMMON_ATTRS = new Set(['max_health', 'movement_speed', 'attack_damage', 'scale']);
const EXTRA_ATTRS = ATTRIBUTES.filter((a) => !COMMON_ATTRS.has(a.id));

const SLOT_LABEL: Record<EquipSlot, string> = {
  head: t('equipment|Head'),
  chest: t('equipment|Chest'),
  legs: t('equipment|Legs'),
  feet: t('equipment|Feet'),
  mainhand: t('equipment|Main hand'),
  offhand: t('equipment|Off hand'),
  body: t('equipment|Body'),
};
const SLOT_HINT: Partial<Record<EquipSlot, string>> = {
  head: 'diamond_helmet',
  chest: 'diamond_chestplate',
  legs: 'diamond_leggings',
  feet: 'diamond_boots',
  mainhand: 'iron_sword',
  offhand: 'shield',
  body: t('horse / wolf / llama armor'),
};

const FLAGS: { key: keyof MobSpec; label: string; help: string }[] = [
  { key: 'noAI', label: t('No AI'), help: t('Stands still, never attacks or moves on its own. Can still be pushed.') },
  { key: 'silent', label: t('Silent'), help: t('Makes no sounds.') },
  { key: 'invulnerable', label: t('Invulnerable'), help: t('Takes no damage, except from /kill and players in creative.') },
  { key: 'glowing', label: t('Glowing'), help: t('Outlined and visible through walls.') },
  { key: 'noGravity', label: t('No gravity'), help: t('Floats where it spawned.') },
  { key: 'persistent', label: t('Never despawns'), help: t('Stays even when no player is near.') },
  { key: 'pickUp', label: t('Picks up items'), help: t('Grabs armor and weapons lying on the ground (zombies, skeletons, piglins…).') },
  { key: 'leftHanded', label: t('Left handed'), help: t('Holds its weapon in the left hand.') },
];

/** A list of status effects, shared by potions and mobs. */
export function EffectList({ effects, onChange }: { effects: Effect[]; onChange: (e: Effect[]) => void }) {
  const setEff = (i: number, p: Partial<Effect>) => onChange(effects.map((e, j) => (j === i ? { ...e, ...p } : e)));
  return (
    <>
      {effects.map((e, i) => (
        <div key={i} className="give-attr">
          <select className="select" aria-label={t('Effect')} value={e.id} onChange={(ev) => setEff(i, { id: ev.target.value })}>
            {EFFECTS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <label className="give-inline-label">
            {t('level')}
            <input className="input mono give-num" type="number" min={1} max={256} value={e.level} onChange={(ev) => setEff(i, { level: Math.max(1, Math.min(256, Number(ev.target.value) || 1)) })} />
          </label>
          <label className="give-inline-label">
            {t('seconds')}
            <input className="input mono give-num" type="number" min={-1} value={e.seconds} onChange={(ev) => setEff(i, { seconds: Number(ev.target.value) })} title={t('-1 = forever')} />
          </label>
          <label className="check">
            <input type="checkbox" checked={e.particles} onChange={(ev) => setEff(i, { particles: ev.target.checked })} />
            {t('particles')}
          </label>
          <button type="button" className="btn btn-sm" aria-label={t('Remove effect')} onClick={() => onChange(effects.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...effects, { id: 'speed', level: 1, seconds: 60, particles: true, icon: true }])}>
        {t('+ add effect')}
      </button>
    </>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div className="opt-row">
      <span className="field-label">{title}</span>
    </div>
  );
}

function Stat({ id, label, value, onChange, placeholder, help }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string; help: string }) {
  return (
    <div className="field">
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        <Help label={label} text={help} />
      </span>
      <input id={id} className="input mono" type="number" step="any" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * What a spawn egg spawns: the mob, its name, stats, gear, effects and behaviour.
 * The name field comes from the parent so the MiniMessage toolbar there can edit it.
 */
export function MobEditor({ mob, onChange, nameInput }: { mob: MobSpec; onChange: (p: Partial<MobSpec>) => void; nameInput: ReactNode }) {
  const saved = useSaved<ItemSpec>('give-generator');
  const info = MOB_BY_ID.get(mob.entity);
  const canBaby = !!info?.baby || babyIsPermanent(mob.entity);

  const setEquip = (slot: EquipSlot, p: Partial<Equip> | null) => {
    const next = { ...mob.equipment };
    if (p === null) delete next[slot];
    else next[slot] = { item: '', glint: false, drop: -1, ...next[slot], ...p };
    onChange({ equipment: next });
  };
  const setAttr = (i: number, p: Partial<MobSpec['attributes'][number]>) => onChange({ attributes: mob.attributes.map((a, j) => (j === i ? { ...a, ...p } : a)) });

  return (
    <>
      <div className="field">
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <span className="field-label">{t('Spawns')}</span>
          <Help label={t('Spawns')} text={t('Any mob, whatever egg it comes from: the egg keeps its own look. You can also type an id that isn\'t in the list.')} />
        </span>
        <Combo label={t('Spawns')} options={MOB_OPTIONS} value={mob.entity} onPick={(id) => onChange({ entity: id })} placeholder={t('search mobs…')} allowCustom />
      </div>
      {nameInput}
      <label className="check">
        <input type="checkbox" checked={mob.nameVisible} disabled={!mob.name.trim()} onChange={(e) => onChange({ nameVisible: e.target.checked })} />
        {t('name always visible (not only when looking at it)')}
      </label>

      <hr className="divider" />
      <Section title={t('Health & stats')} />
      <div className="fields">
        <Stat id="m-hp" label={t('Max health')} value={mob.maxHealth} onChange={(v) => onChange({ maxHealth: v })} placeholder={t('normal')} help={t('In half hearts: 20 is 10 hearts (a zombie). It also starts with this much health.')} />
        <Stat id="m-speed" label={t('Speed')} value={mob.speed} onChange={(v) => onChange({ speed: v })} placeholder={t('normal')} help={t('Walking speed. A zombie has 0.23, a player 0.1 (mobs and players use different scales).')} />
        <Stat id="m-atk" label={t('Attack damage')} value={mob.attack} onChange={(v) => onChange({ attack: v })} placeholder={t('normal')} help={t('Damage per hit in half hearts, before its weapon. A zombie has 3. Mobs that don\'t attack ignore this.')} />
        <Stat id="m-scale" label={t('Size (scale)')} value={mob.scale} onChange={(v) => onChange({ scale: v })} placeholder="1" help={t('1 is the normal size, 2 is twice as big, 0.5 half. From 0.0625 to 16.')} />
      </div>
      {mob.attributes.map((a, i) => (
        <div key={i} className="give-attr">
          <select className="select" aria-label={t('Attribute')} value={a.type} onChange={(e) => setAttr(i, { type: e.target.value })}>
            {EXTRA_ATTRS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <input
            className="input mono give-num"
            type="number"
            step="any"
            aria-label={t('Base value')}
            value={a.base}
            placeholder={String(EXTRA_ATTRS.find((x) => x.id === a.type)?.def ?? '')}
            onChange={(e) => setAttr(i, { base: e.target.value })}
          />
          <button type="button" className="btn btn-sm" aria-label={t('Remove attribute')} onClick={() => onChange({ attributes: mob.attributes.filter((_, j) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ attributes: [...mob.attributes, { type: 'armor', base: '10' }] })}>
        {t('+ other attribute')}
      </button>

      <hr className="divider" />
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <span className="field-label">{t('Equipment')}</span>
        <Help
          label={t('Equipment')}
          text={t('What it wears and holds. Pick a plain item, or one of “my items” with all its enchantments and names. Drop: the chance it drops the item when killed; empty is the game\'s normal 8.5 %, 100 % drops it undamaged.')}
        />
      </span>
      {EQUIP_SLOTS.map((slot) => {
        const e = mob.equipment[slot];
        return (
          <div key={slot} className="give-equip">
            <span className="give-list-name">{SLOT_LABEL[slot]}</span>
            {e?.spec ? (
              <span className="pick-chip" title={ITEM_BY_ID.get(e.spec.item)?.name ?? e.spec.item}>
                ★ {e.label ?? e.spec.item}
                <button type="button" aria-label={t('Use a plain item for {v1}', { v1: SLOT_LABEL[slot] })} onClick={() => setEquip(slot, { spec: undefined, label: undefined, item: e.spec!.item })}>
                  ×
                </button>
              </span>
            ) : (
              <Combo label={t('{v1} item', { v1: SLOT_LABEL[slot] })} options={ITEM_OPTIONS} value={e?.item || undefined} onPick={(id) => setEquip(slot, { item: id })} placeholder={SLOT_HINT[slot]} allowCustom />
            )}
            {e?.spec ? (
              <span />
            ) : (
              <label className="check" title={t('The enchantment glint, without real enchantments')}>
                <input type="checkbox" checked={!!e?.glint} disabled={!e?.item} onChange={(ev) => setEquip(slot, { glint: ev.target.checked })} />
                {t('shine')}
              </label>
            )}
            <select
              className="select"
              aria-label={t('{v1}: one of my items', { v1: SLOT_LABEL[slot] })}
              value=""
              disabled={!saved.items.length}
              title={saved.items.length ? t('Use an item from “my items”') : t('Save an item first to use it here')}
              onChange={(ev) => {
                const it = saved.items.find((x) => x.id === ev.target.value);
                if (it) setEquip(slot, { spec: it.data, label: it.name, item: it.data.item });
              }}
            >
              <option value="">{t('my items…')}</option>
              {saved.items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
            <label className="give-inline-label">
              {t('drop %')}
              <input
                className="input mono give-num"
                type="number"
                min={0}
                max={100}
                placeholder="8.5"
                disabled={!e?.item && !e?.spec}
                value={e && e.drop >= 0 ? Math.round(e.drop * 1000) / 10 : ''}
                onChange={(ev) => setEquip(slot, { drop: ev.target.value === '' ? -1 : Math.max(0, Math.min(100, Number(ev.target.value))) / 100 })}
              />
            </label>
            <button type="button" className="btn btn-sm" aria-label={t('Empty {v1}', { v1: SLOT_LABEL[slot] })} disabled={!e} onClick={() => setEquip(slot, null)}>
              ×
            </button>
          </div>
        );
      })}
      <p className="note">{t('Body is for what animals wear: horse armor, wolf armor and the like.')}</p>

      <hr className="divider" />
      <Section title={t('Effects')} />
      <EffectList effects={mob.effects} onChange={(effects) => onChange({ effects })} />
      <p className="note">{t('Seconds −1 lasts forever. Level 1 is the normal strength.')}</p>

      <hr className="divider" />
      <Section title={t('Behaviour')} />
      <div className="check-grid">
        {FLAGS.map((f) => (
          <label key={f.key} className="check" title={f.help}>
            <input type="checkbox" checked={!!mob[f.key]} onChange={(e) => onChange({ [f.key]: e.target.checked })} />
            {f.label}
          </label>
        ))}
        {canBaby && (
          <label className="check" title={babyIsPermanent(mob.entity) ? t('Stays a baby forever.') : t('Grows up after 20 minutes, like a bred baby.')}>
            <input type="checkbox" checked={mob.baby} onChange={(e) => onChange({ baby: e.target.checked })} />
            {t('Baby')}
          </label>
        )}
      </div>
      {canBaby && mob.baby && <p className="note">{babyIsPermanent(mob.entity) ? t('This one stays a baby forever.') : t('Animals grow up after 20 minutes, like bred babies.')}</p>}
    </>
  );
}
