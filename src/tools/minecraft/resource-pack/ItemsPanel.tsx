import { useState } from 'react';
import { CopyButton, Panel, Segmented, TextField } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { GoLink } from '../../../components/Transition';
import { Combo } from '../give/Pickers';
import { ITEMS, ITEM_BY_ID } from '../give/data';
import { MiniText, plainText } from '../../../lib/mc/minimessage';
import { pushSaved } from '../../../lib/saved';
import { giveCommands, packNamespace, slugName, type CustomItem, type PackDoc } from '../../../lib/mc/pack/pack';
import type { Vanilla } from '../../../lib/mc/pack/vanilla';
import { pngUrl } from './thumbs';
import { t } from '../../../lib/i18n-core';

const ITEM_OPTIONS = ITEMS.map((i) => ({ id: i.id, name: i.name }));
export const itemKey = (id: string) => `item:${id}`;

/** Items of the pack's own: a texture each, given with /give …[item_model="namespace:id"]. */
export function ItemsPanel({
  doc,
  vanilla,
  active,
  onChange,
  onOpen,
}: {
  doc: PackDoc;
  vanilla: Vanilla;
  active: string | null;
  onChange: (p: Partial<PackDoc>) => void;
  onOpen: (key: string) => void;
}) {
  const [name, setName] = useState('');
  const [base, setBase] = useState('diamond_sword');
  const [sent, setSent] = useState('');
  const ns = packNamespace(doc);
  const items = doc.items;
  const open = items.find((it) => itemKey(it.id) === active);

  const setItem = (id: string, p: Partial<CustomItem>) => onChange({ items: items.map((it) => (it.id === id ? { ...it, ...p } : it)) });

  const add = () => {
    const label = name.trim() || ITEM_BY_ID.get(base)?.name || base;
    let id = slugName(plainText(label)) || 'item';
    for (let i = 2; items.some((it) => it.id === id); i++) id = `${slugName(plainText(label))}_${i}`;
    // It starts as the base item's own texture (if it has one), ready to be painted over.
    const png = vanilla.files[`textures/item/${base}.png`] ?? null;
    const style: CustomItem['style'] = /_(sword|axe|pickaxe|shovel|hoe)$|^(stick|bone|blaze_rod|breeze_rod|trident|mace|fishing_rod)$/.test(base) ? 'handheld' : 'generated';
    const cmd = Math.max(0, ...items.map((it) => it.cmd)) + 1;
    const item: CustomItem = { id, name: label, base, style, png, cmd };
    onChange({ items: [...items, item], namespace: doc.namespace || ns });
    setName('');
    onOpen(itemKey(id));
  };

  const toGive = async (it: CustomItem) => {
    const cmd = giveCommands(doc, it, vanilla)[0];
    if (!cmd) return;
    await pushSaved('give-generator', plainText(it.name) || it.id, cmd.spec);
    setSent(it.id);
  };

  return (
    <Panel title={t('your own items')}>
      <p className="note">{t('New items with their own texture: the pack gives them a look, and /give makes them from an existing item (they work like it, e.g. a sword still hits like a sword).')}</p>

      {items.length > 0 && (
        <div className="rp-items">
          {items.map((it) => {
            const cmds = giveCommands(doc, it, vanilla);
            return (
              <div key={it.id} className={`rp-item${itemKey(it.id) === active ? ' active' : ''}`}>
                <button type="button" className="rp-item-pic" onClick={() => onOpen(itemKey(it.id))} title={t('Edit the texture')}>
                  {it.png ? <img src={pngUrl(it.png)} alt="" /> : <span className="muted">?</span>}
                </button>
                <div className="rp-item-main">
                  <span className="rp-item-name">
                    <MiniText text={it.name} defaultColor="var(--fg)" />
                    <span className="mono muted">
                      {ns}:{it.id} · {ITEM_BY_ID.get(it.base)?.name ?? it.base}
                    </span>
                  </span>
                  {cmds.map((c) => (
                    <span key={c.command} className="rp-give">
                      {c.label && <span className="muted">{c.label}</span>}
                      <code className="mono">{c.command}</code>
                      <CopyButton text={c.command} />
                    </span>
                  ))}
                  <span className="rp-item-actions">
                    <button type="button" className="btn btn-sm" onClick={() => onOpen(itemKey(it.id))}>
                      {t('edit texture')}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => toGive(it)} title={t('Save it to “my items” in the Give generator, to add enchantments, lore and more')}>
                      {t('to Give generator')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        if (window.confirm(t('Delete the item “{n}”?', { n: plainText(it.name) || it.id }))) onChange({ items: items.filter((x) => x.id !== it.id) });
                      }}
                    >
                      {t('delete')}
                    </button>
                  </span>
                  {sent === it.id && (
                    <span className="note" role="status">
                      {t('Saved to “my items”.')} <GoLink to="/t/give-generator">{t('Open the Give generator')}</GoLink>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div className="rp-item-edit">
          <TextField label={t('Name in the game')} value={open.name} onChange={(v) => setItem(open.id, { name: v })} help={t('MiniMessage colors work here too, e.g. <gold>Ruby sword.')} />
          <div className="field">
            <span className="field-label">{t('Made from')}</span>
            <Combo label={t('Made from')} options={ITEM_OPTIONS} value={open.base} onPick={(b) => setItem(open.id, { base: b })} placeholder={t('search items…')} />
          </div>
          <div className="opt-row">
            <span className="opt-label" id="rp-style">
              {t('In the hand')}
            </span>
            <Segmented
              labelledBy="rp-style"
              value={open.style}
              onChange={(v) => setItem(open.id, { style: v })}
              options={[
                { value: 'handheld', label: t('like a sword or tool') },
                { value: 'generated', label: t('like a flat item') },
              ]}
            />
          </div>
          <div className="opt-row">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <label className="opt-label" htmlFor="rp-cmd">
                {t('Number for older versions')}
              </label>
              <Help label={t('Number for older versions')} text={t('Before 1.21.2 an item finds its own look by custom_model_data. Every item of the pack needs its own number.')} />
            </span>
            <input id="rp-cmd" className="input mono rp-ticks" type="number" min={1} value={open.cmd} onChange={(e) => setItem(open.id, { cmd: Math.max(1, Math.round(Number(e.target.value)) || 1) })} />
          </div>
        </div>
      )}

      <div className="rp-item-add">
        <TextField label={t('New item')} value={name} onChange={setName} placeholder={t('e.g. Ruby sword')} />
        <div className="field">
          <span className="field-label">{t('Made from')}</span>
          <Combo label={t('Made from')} options={ITEM_OPTIONS} value={base} onPick={setBase} placeholder={t('search items…')} />
        </div>
        <button type="button" className="btn btn-primary" onClick={add}>
          {t('Add item')}
        </button>
      </div>

      <div className="opt-row">
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <label className="opt-label" htmlFor="rp-ns">
            {t('Namespace')}
          </label>
          <Help label={t('Namespace')} text={t('The first half of each item’s id (namespace:item). Made from the pack’s name; change it before you give the items out, the commands use it.')} />
        </span>
        <input id="rp-ns" className="input mono" value={doc.namespace || ns} onChange={(e) => onChange({ namespace: e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '_') })} spellCheck={false} />
      </div>
    </Panel>
  );
}
