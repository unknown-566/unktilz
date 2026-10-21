import { useState } from 'react';
import { NumberField, Output, Panel, Segmented, Stat, num } from '../../components/ui';
import { t } from '../../lib/i18n-core';

type Dir = 'toNether' | 'toOverworld';

export default function NetherPortal() {
  const [dir, setDir] = useState<Dir>('toNether');
  const [x, setX] = useState('');
  const [y, setY] = useState('64');
  const [z, setZ] = useState('');

  const k = dir === 'toNether' ? 1 / 8 : 8;
  const tx = Math.floor(num(x) * k);
  const tz = Math.floor(num(z) * k);
  const ty = Math.round(num(y, 64));
  const from = dir === 'toNether' ? 'Overworld' : 'Nether';
  const to = dir === 'toNether' ? 'Nether' : 'Overworld';
  const filled = x.trim() !== '' && z.trim() !== '';

  return (
    <>
      <section className="panel" aria-label={t('Coordinates')}>
        <Segmented
          label={t('Direction')}
          value={dir}
          onChange={setDir}
          options={[
            { value: 'toNether', label: t('overworld → nether') },
            { value: 'toOverworld', label: t('nether → overworld') },
          ]}
        />
        <div className="fields">
          <NumberField label={`${from} X`} value={x} onChange={setX} placeholder="0" />
          <NumberField label="Y" value={y} onChange={setY} />
          <NumberField label={`${from} Z`} value={z} onChange={setZ} placeholder="0" />
        </div>
      </section>

      <Panel title={t('{v1} portal', { v1: to.toLowerCase() })}>
        {filled ? (
          <>
            <div className="stats" aria-live="polite">
              <Stat label="X" value={tx} />
              <Stat label="Y" value={ty} />
              <Stat label="Z" value={tz} />
            </div>
            <Output label={t('Teleport command')} value={`/execute in minecraft:${to === 'Nether' ? 'the_nether' : 'overworld'} run tp @s ${tx} ${ty} ${tz}`} />
          </>
        ) : (
          <p className="note">{t('Enter the X and Z of your portal in the {dimension}.', { dimension: from })}</p>
        )}
        <p className="note">
          {t('Y stays the same. A portal links to the closest portal within {n} blocks of the target point, so build it close to these coordinates to avoid linking to the wrong one.', { n: to === 'Nether' ? 16 : 128 })}
        </p>
      </Panel>
    </>
  );
}
