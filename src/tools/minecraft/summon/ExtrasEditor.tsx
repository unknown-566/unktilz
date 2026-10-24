import { useState, type ReactNode } from 'react';
import { Help } from '../../../components/Help';
import { useSaved } from '../../../lib/saved';
import type { ItemSpec } from '../../../lib/mc/give';
import type { MobSpec } from '../../../lib/mc/entity';
import { POSE_PARTS, fieldsFor, groupsFor, type ExtraField, type Pose, type PosePart, type Stack, type Trade, type Values } from '../../../lib/mc/entityExtras';
import { dashed, isName, isUuid, lookupProfile, offlineUuid } from '../../../lib/mc/uuid';
import { BLOCKS, DYE_COLORS, ITEMS, ITEM_BY_ID, POTIONS, label } from '../give/data';
import { EffectList } from '../give/MobEditor';
import { Combo } from '../give/Pickers';
import { t } from '../../../lib/i18n-core';

const ITEM_OPTIONS = ITEMS.map((i) => ({ id: i.id, name: i.name }));
const BLOCK_OPTIONS = BLOCKS.map((b) => ({ id: b.id, name: b.name }));

const POSE_LABEL: Record<PosePart, string> = {
  Head: t('pose|Head'),
  Body: t('pose|Body'),
  LeftArm: t('pose|Left arm'),
  RightArm: t('pose|Right arm'),
  LeftLeg: t('pose|Left leg'),
  RightLeg: t('pose|Right leg'),
};

/** Ready-made poses for an armor stand (degrees around x, y, z). */
const POSES: { label: string; pose: Pose }[] = [
  { label: t('pose|wave'), pose: { RightArm: ['-150', '0', '-20'], LeftArm: ['10', '0', '-10'] } },
  { label: t('pose|point'), pose: { RightArm: ['-90', '0', '0'], Head: ['0', '10', '0'] } },
  { label: t('pose|walk'), pose: { RightArm: ['-30', '0', '0'], LeftArm: ['30', '0', '0'], RightLeg: ['30', '0', '0'], LeftLeg: ['-30', '0', '0'] } },
  { label: t('pose|sit'), pose: { RightLeg: ['-90', '10', '0'], LeftLeg: ['-90', '-10', '0'] } },
  { label: t('pose|zombie'), pose: { RightArm: ['-90', '0', '0'], LeftArm: ['-90', '0', '0'] } },
];

/** An item with a count: search the items, or take one of "my items" from the give generator. */
export function StackPicker({ value, onChange, label: text, max = 99 }: { value?: Stack; onChange: (s: Stack | undefined) => void; label: string; max?: number }) {
  const saved = useSaved<ItemSpec>('give-generator');
  const s = value ?? { item: '', count: 1 };
  return (
    <div className="sm-stack">
      {s.spec ? (
        <span className="pick-chip" title={ITEM_BY_ID.get(s.spec.item)?.name ?? s.spec.item}>
          ★ {s.label ?? s.spec.item}
          <button type="button" aria-label={t('Use a plain item for {v1}', { v1: text })} onClick={() => onChange({ item: s.spec!.item, count: s.count })}>
            ×
          </button>
        </span>
      ) : (
        <Combo label={text} options={ITEM_OPTIONS} value={s.item || undefined} onPick={(id) => onChange({ ...s, item: id })} placeholder={t('search items…')} allowCustom />
      )}
      <input
        className="input mono give-num"
        type="number"
        min={1}
        max={max}
        aria-label={t('{v1}: how many', { v1: text })}
        value={s.count}
        onChange={(e) => onChange({ ...s, count: Math.max(1, Math.min(max, Math.round(Number(e.target.value)) || 1)) })}
      />
      <select
        className="select"
        aria-label={t('{v1}: one of my items', { v1: text })}
        value=""
        disabled={!saved.items.length}
        title={saved.items.length ? t('Use an item from “my items”') : t('Save an item in the give generator first to use it here')}
        onChange={(ev) => {
          const it = saved.items.find((x) => x.id === ev.target.value);
          if (it) onChange({ item: it.data.item, count: s.count, spec: it.data, label: it.name });
        }}
      >
        <option value="">{t('my items…')}</option>
        {saved.items.map((it) => (
          <option key={it.id} value={it.id}>
            {it.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldLabel({ id, text, help, since }: { id?: string; text: string; help?: string; since?: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center' }}>
      {id ? (
        <label htmlFor={id} className="field-label">
          {text}
        </label>
      ) : (
        <span className="field-label">{text}</span>
      )}
      {since && <span className="note sm-since">{since}+</span>}
      {help && <Help label={text} text={help} />}
    </span>
  );
}

const newTrade = (): Trade => ({ buy: { item: 'emerald', count: 1 }, sell: { item: '', count: 1 }, maxUses: '', xp: false });

function Trades({ trades, onChange }: { trades: Trade[]; onChange: (t: Trade[]) => void }) {
  const setTrade = (i: number, p: Partial<Trade>) => onChange(trades.map((tr, j) => (j === i ? { ...tr, ...p } : tr)));
  return (
    <>
      <FieldLabel
        text={t('Trades')}
        help={t('What it sells, in this order. These replace its normal trades. Uses: how often before it runs out; empty never runs out.')}
      />
      {trades.map((tr, i) => (
        <div key={i} className="give-box sm-trade">
          <div className="opt-row">
            <span className="field-label">{t('Trade {n}', { n: i + 1 })}</span>
            <button type="button" className="btn btn-sm" onClick={() => onChange(trades.filter((_, j) => j !== i))}>
              {t('remove')}
            </button>
          </div>
          <span className="give-inline-label">{t('wants')}</span>
          <StackPicker label={t('Price')} value={tr.buy} onChange={(s) => setTrade(i, { buy: s ?? { item: '', count: 1 } })} />
          {tr.buyB ? (
            <>
              <span className="give-inline-label">
                {t('and')}
                <button type="button" className="btn btn-sm" onClick={() => setTrade(i, { buyB: undefined })}>
                  {t('remove')}
                </button>
              </span>
              <StackPicker label={t('Second price')} value={tr.buyB} onChange={(s) => setTrade(i, { buyB: s })} />
            </>
          ) : (
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setTrade(i, { buyB: { item: '', count: 1 } })}>
              {t('+ second price item')}
            </button>
          )}
          <span className="give-inline-label">{t('gives')}</span>
          <StackPicker label={t('Sells')} value={tr.sell} onChange={(s) => setTrade(i, { sell: s ?? { item: '', count: 1 } })} />
          <div className="inline">
            <label className="give-inline-label">
              {t('uses')}
              <input className="input mono give-num" type="number" min={1} placeholder="∞" value={tr.maxUses} onChange={(e) => setTrade(i, { maxUses: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={tr.xp} onChange={(e) => setTrade(i, { xp: e.target.checked })} />
              {t('gives the player XP')}
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...trades, newTrade()])}>
        {t('+ add trade')}
      </button>
    </>
  );
}

function PoseEditor({ pose, onChange }: { pose: Pose; onChange: (p: Pose) => void }) {
  const setPart = (part: PosePart, axis: number, v: string) => {
    const cur = pose[part] ?? ['', '', ''];
    onChange({ ...pose, [part]: cur.map((d, i) => (i === axis ? v : d)) as [string, string, string] });
  };
  return (
    <>
      <FieldLabel text={t('Pose')} help={t('Rotation of each part in degrees around x (forward/back), y (turn) and z (sideways). Turn on Arms to see the arms.')} />
      <div className="seg">
        {POSES.map((p) => (
          <button key={p.label} type="button" className="btn btn-sm" onClick={() => onChange(p.pose)}>
            {p.label}
          </button>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => onChange({})}>
          {t('pose|straight')}
        </button>
      </div>
      <div className="sm-pose">
        <span />
        <span className="give-inline-label">x</span>
        <span className="give-inline-label">y</span>
        <span className="give-inline-label">z</span>
        {POSE_PARTS.map((part) => (
          <PoseRow key={part} part={part} value={pose[part]} onChange={setPart} />
        ))}
      </div>
    </>
  );
}

function PoseRow({ part, value, onChange }: { part: PosePart; value?: [string, string, string]; onChange: (part: PosePart, axis: number, v: string) => void }) {
  return (
    <>
      <span className="give-list-name">{POSE_LABEL[part]}</span>
      {[0, 1, 2].map((axis) => (
        <input
          key={axis}
          className="input mono"
          type="number"
          min={-360}
          max={360}
          placeholder="0"
          aria-label={`${POSE_LABEL[part]} ${'xyz'[axis]}`}
          value={value?.[axis] ?? ''}
          onChange={(e) => onChange(part, axis, e.target.value)}
        />
      ))}
    </>
  );
}

/**
 * A player by name or UUID. A name is looked up (playerdb.co, like the UUID lookup tool); the UUID
 * is what goes into the command. Offline-mode servers give players another UUID, made from the name.
 */
function PlayerField({ f, x, set }: { f: ExtraField; x: Values; set: (p: Values) => void }) {
  const uuid = typeof x[f.key] === 'string' ? (x[f.key] as string) : '';
  const name = typeof x[`${f.key}Name`] === 'string' ? (x[`${f.key}Name`] as string) : '';
  const [query, setQuery] = useState(name || uuid);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const find = async () => {
    const q = query.trim();
    setErr('');
    if (!q) return set({ [f.key]: '', [`${f.key}Name`]: '' });
    if (isUuid(q)) return set({ [f.key]: dashed(q), [`${f.key}Name`]: '' });
    if (!isName(q)) return setErr(t('That isn’t a player name or a UUID.'));
    setBusy(true);
    try {
      const p = await lookupProfile(q);
      if (p) set({ [f.key]: p.id, [`${f.key}Name`]: p.name });
      else setErr(t('No Minecraft account is called {name}.', { name: q }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="field sm-wide">
      <FieldLabel id={`sm-x-${f.key}`} text={f.label} help={f.help} since={f.since} />
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
      >
        <input id={`sm-x-${f.key}`} className="input mono" value={query} placeholder={t('player name or UUID')} spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" className="btn btn-sm" disabled={busy}>
          {busy ? t('looking up…') : t('use')}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!isName(query)}
          title={t('For a server with online-mode=false, where players get a UUID made from their name')}
          onClick={() => {
            setErr('');
            set({ [f.key]: offlineUuid(query.trim()), [`${f.key}Name`]: `${query.trim()} (offline)` });
          }}
        >
          {t('offline server')}
        </button>
        {uuid && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setQuery('');
              set({ [f.key]: '', [`${f.key}Name`]: '' });
            }}
          >
            ×
          </button>
        )}
      </form>
      {err ? <span className="error-text">{err}</span> : uuid ? <span className="note mono">{name ? `${name} · ${uuid}` : uuid}</span> : null}
    </div>
  );
}

/**
 * The entity's own settings (see src/lib/mc/entityExtras.ts). `textInput` draws the text display's
 * text so the MiniMessage toolbar above can edit it.
 */
export function ExtrasEditor({ mob, onChange, textInput }: { mob: MobSpec; onChange: (p: Partial<MobSpec>) => void; textInput: (f: ExtraField) => ReactNode }) {
  const x: Values = mob.extra ?? {};
  const set = (key: string, v: string | boolean) => onChange({ extra: { ...x, [key]: v } });
  const groups = groupsFor(mob.entity);
  const fields = fieldsFor(mob.entity);
  // What every mob has (drops, team, lead…) comes after what's this entity's own.
  const general = new Set(groups.filter((g) => g.match).flatMap((g) => g.fields));
  const own = fields.filter((f) => !general.has(f));
  const shared = fields.filter((f) => general.has(f));
  const id = (f: ExtraField) => `sm-x-${f.key}`;

  const field = (f: ExtraField): ReactNode => {
    const v = x[f.key];
    const s = typeof v === 'string' ? v : '';
    switch (f.type) {
      case 'number':
        return (
          <div className="field" key={f.key}>
            <FieldLabel id={id(f)} text={f.label} help={f.help} since={f.since} />
            <input id={id(f)} className="input mono" type="number" step="any" min={f.min} max={f.max} placeholder={f.placeholder} value={s} onChange={(e) => set(f.key, e.target.value)} />
          </div>
        );
      case 'select':
        return (
          <div className="field" key={f.key}>
            <FieldLabel id={id(f)} text={f.label} help={f.help} since={f.since} />
            <select id={id(f)} className="select" value={s} onChange={(e) => set(f.key, e.target.value)}>
              {f.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        );
      case 'dye':
        return (
          <div className="field sm-wide" key={f.key}>
            <FieldLabel text={f.label} help={f.help} since={f.since} />
            <div className="give-dyes">
              {DYE_COLORS.map(([name, hex], i) => (
                <button
                  key={name}
                  type="button"
                  className="give-dye"
                  style={{ background: hex }}
                  aria-pressed={s === String(i)}
                  aria-label={label(name)}
                  title={label(name)}
                  onClick={() => set(f.key, s === String(i) ? '' : String(i))}
                />
              ))}
            </div>
          </div>
        );
      case 'block':
        return (
          <div className="field sm-wide" key={f.key}>
            <FieldLabel text={f.label} help={f.help} since={f.since} />
            <Combo label={f.label} options={BLOCK_OPTIONS} value={s || undefined} onPick={(b) => set(f.key, b)} placeholder={f.placeholder} allowCustom />
          </div>
        );
      case 'mini':
        return (
          <div className="field sm-wide" key={f.key}>
            {textInput(f)}
          </div>
        );
      case 'background': {
        const mode = s === '' ? '' : s === 'none' ? 'none' : 'color';
        return (
          <div className="field sm-wide" key={f.key}>
            <FieldLabel id={id(f)} text={f.label} help={f.help} since={f.since} />
            <span className="inline">
              <select id={id(f)} className="select" value={mode} onChange={(e) => set(f.key, e.target.value === 'color' ? '#000000' : e.target.value)}>
                <option value="">{t('the game’s gray box')}</option>
                <option value="none">{t('none (see-through)')}</option>
                <option value="color">{t('a color…')}</option>
              </select>
              {mode === 'color' && (
                <>
                  <input type="color" className="give-color" aria-label={t('Background color')} value={s} onChange={(e) => set(f.key, e.target.value)} />
                  <label className="give-inline-label">
                    {t('opacity %')}
                    <input className="input mono give-num" type="number" min={0} max={100} placeholder="100" value={typeof x.opacity === 'string' ? x.opacity : ''} onChange={(e) => set('opacity', e.target.value)} />
                  </label>
                </>
              )}
            </span>
          </div>
        );
      }
      case 'stack':
        return (
          <div className="field sm-wide" key={f.key}>
            <FieldLabel text={f.label} help={f.help} since={f.since} />
            <StackPicker label={f.label} value={mob.stack} onChange={(st) => onChange({ stack: st })} />
          </div>
        );
      case 'text':
        return (
          <div className="field sm-wide" key={f.key}>
            <FieldLabel id={id(f)} text={f.label} help={f.help} since={f.since} />
            <input id={id(f)} className="input mono" value={s} placeholder={f.placeholder} spellCheck={false} onChange={(e) => set(f.key, e.target.value)} />
          </div>
        );
      case 'vec3': {
        const parts = s.split(',');
        return (
          <div className="field sm-wide" key={f.key}>
            <FieldLabel text={f.label} help={f.help} since={f.since} />
            <div className="inline">
              {['x', 'y', 'z'].map((axis, i) => (
                <label key={axis} className="give-inline-label">
                  {axis}
                  <input
                    className="input mono sm-num"
                    type="number"
                    step="any"
                    placeholder={f.placeholder}
                    value={parts[i] ?? ''}
                    onChange={(e) => set(f.key, [0, 1, 2].map((j) => (j === i ? e.target.value : (parts[j] ?? ''))).join(','))}
                  />
                </label>
              ))}
            </div>
          </div>
        );
      }
      case 'color':
        return (
          <div className="field" key={f.key}>
            <FieldLabel text={f.label} help={f.help} since={f.since} />
            <span className="inline">
              <input type="color" className="give-color" aria-label={f.label} value={s || '#ffffff'} onChange={(e) => set(f.key, e.target.value)} />
              {s ? (
                <button type="button" className="btn btn-sm" onClick={() => set(f.key, '')}>
                  {t('none')}
                </button>
              ) : (
                <span className="note">{t('none')}</span>
              )}
            </span>
          </div>
        );
      case 'potion':
        return (
          <div className="field" key={f.key}>
            <FieldLabel id={id(f)} text={f.label} help={f.help} since={f.since} />
            <select id={id(f)} className="select" value={s} onChange={(e) => set(f.key, e.target.value)}>
              <option value="">{t('none')}</option>
              {POTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        );
      case 'effects':
        return (
          <div className="field sm-wide" key={f.key}>
            <FieldLabel text={f.label} help={f.help} since={f.since} />
            <EffectList effects={mob.effects} onChange={(effects) => onChange({ effects })} />
          </div>
        );
      case 'items': {
        const items = mob.items ?? [];
        const max = mob.entity === 'hopper_minecart' ? 5 : f.max;
        return (
          <div className="field sm-wide" key={f.key}>
            <FieldLabel text={f.label} help={f.help} since={f.since} />
            {items.map((st, i) => (
              <div key={i} className="sm-item-row">
                <StackPicker label={t('Slot {n}', { n: i + 1 })} value={st} onChange={(v) => onChange({ items: items.map((x2, j) => (j === i ? (v ?? { item: '', count: 1 }) : x2)) })} />
                <button type="button" className="btn btn-sm" aria-label={t('Remove slot {n}', { n: i + 1 })} onClick={() => onChange({ items: items.filter((_, j) => j !== i) })}>
                  ×
                </button>
              </div>
            ))}
            {items.length < max && (
              <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ items: [...items, { item: '', count: 1 }] })}>
                {t('+ add item')}
              </button>
            )}
          </div>
        );
      }
      case 'player':
        return <PlayerField key={`${f.key}:${s}`} f={f} x={x} set={(p) => onChange({ extra: { ...x, ...p } })} />;
      default:
        return null;
    }
  };

  const block = (list: ExtraField[]) => {
    const bools = list.filter((f) => f.type === 'bool');
    const others = list.filter((f) => f.type !== 'bool');
    return (
      <>
        {others.length > 0 && <div className="fields">{others.map(field)}</div>}
        {bools.length > 0 && (
          <div className="check-grid">
            {bools.map((f) => (
              <label key={f.key} className="check" title={f.help}>
                <input type="checkbox" checked={x[f.key] === true} onChange={(e) => set(f.key, e.target.checked)} />
                {f.label}
                {f.since && <span className="note sm-since">{f.since}+</span>}
              </label>
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <>
      {block(own)}
      {groups.some((g) => g.pose) && (
        <>
          <hr className="divider" />
          <PoseEditor pose={mob.pose ?? {}} onChange={(pose) => onChange({ pose })} />
        </>
      )}
      {groups.some((g) => g.trades) && (
        <>
          <hr className="divider" />
          <Trades trades={mob.trades ?? []} onChange={(trades) => onChange({ trades })} />
        </>
      )}
      {shared.length > 0 && (
        <>
          {own.length > 0 && <hr className="divider" />}
          <span className="field-label">{t('Any mob')}</span>
          {block(shared)}
        </>
      )}
    </>
  );
}
