import { useState } from 'react';
import { NumberField, Panel, Segmented, Stat, num } from '../../components/ui';
import { Help } from '../../components/Help';
import { t } from '../../lib/i18n-core';

type Size = '64' | '16' | '1';

const fmt = (n: number) => n.toLocaleString('en-US');

export default function StackCalculator() {
  const [items, setItems] = useState('5000');
  const [size, setSize] = useState<Size>('64');
  const [shulkers, setShulkers] = useState('0');
  const [stacks, setStacks] = useState('0');
  const [loose, setLoose] = useState('0');

  const s = Number(size);
  const n = Math.max(0, Math.floor(num(items)));
  const perShulker = 27 * s;
  const perDouble = 54 * s;

  const sh = Math.floor(n / perShulker);
  const st = Math.floor((n % perShulker) / s);
  const rest = n % s;

  const back = Math.max(0, Math.floor(num(shulkers))) * perShulker + Math.max(0, Math.floor(num(stacks))) * s + Math.max(0, Math.floor(num(loose)));

  const parts = [sh && `${fmt(sh)} shulker${sh > 1 ? 's' : ''}`, st && `${st} stack${st > 1 ? 's' : ''}`, rest && `${rest} item${rest > 1 ? 's' : ''}`].filter(Boolean);

  return (
    <>
      <Panel title={t('items → storage')}>
        <div className="inline">
          <NumberField label={t('Items')} value={items} onChange={setItems} min={0} />
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <span className="field-label" id="ss">
                {t('Stack size')}
              </span>
              <Help label={t('stack size')} text={t('Most items stack to 64. Ender pearls, eggs, snowballs, signs, banners and buckets of snow stack to 16. Tools, armor, potions and most buckets don’t stack (1).')} />
            </span>
            <Segmented
              labelledBy="ss"
              value={size}
              onChange={setSize}
              compact
              options={[
                { value: '64', label: '64' },
                { value: '16', label: '16' },
                { value: '1', label: '1' },
              ]}
            />
          </div>
        </div>
        <div className="stats" aria-live="polite">
          <Stat label={t('stacks')} value={`${fmt(Math.floor(n / s))}${n % s ? ` + ${n % s}` : ''}`} />
          <Stat label={t('shulker boxes')} value={(n / perShulker).toFixed(2).replace(/\.00$/, '')} />
          <Stat label={t('double chests')} value={(n / perDouble).toFixed(2).replace(/\.00$/, '')} />
        </div>
        <p className="note" style={{ color: 'var(--fg)' }}>
          {parts.length ? parts.join(' + ') : t('nothing')}
        </p>
      </Panel>

      <Panel title={t('storage → items')}>
        <div className="fields">
          <NumberField label={t('Shulker boxes')} value={shulkers} onChange={setShulkers} min={0} />
          <NumberField label={t('Stacks')} value={stacks} onChange={setStacks} min={0} />
          <NumberField label={t('Loose items')} value={loose} onChange={setLoose} min={0} />
        </div>
        <div className="stats" aria-live="polite">
          <Stat label={t('items')} value={fmt(back)} />
        </div>
        <p className="note">{t('A shulker box and a single chest hold 27 slots; a double chest holds 54.')}</p>
      </Panel>
    </>
  );
}
