import { useCallback, useEffect, useState } from 'react';
import { CopyButton, NumberField, Panel, Segmented, Toggle, num } from '../../components/ui';
import { Help } from '../../components/Help';
import { plural, t } from '../../lib/i18n-core';

type Version = 'v4' | 'v7';

const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

function uuid(version: Version) {
  const b = crypto.getRandomValues(new Uint8Array(16));
  if (version === 'v7') {
    // 48-bit Unix milliseconds up front, so v7 ids sort by creation time.
    const ms = Date.now();
    const hi = Math.floor(ms / 2 ** 16);
    b[0] = (hi >>> 24) & 255;
    b[1] = (hi >>> 16) & 255;
    b[2] = (hi >>> 8) & 255;
    b[3] = hi & 255;
    b[4] = (ms >>> 8) & 255;
    b[5] = ms & 255;
  }
  b[6] = (b[6] & 0x0f) | (version === 'v7' ? 0x70 : 0x40);
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export default function UuidGenerator() {
  const [version, setVersion] = useState<Version>('v4');
  const [count, setCount] = useState('5');
  const [upper, setUpper] = useState(false);
  const [dashes, setDashes] = useState(true);
  const [ids, setIds] = useState<string[]>([]);

  const n = Math.max(1, Math.min(500, Math.round(num(count, 1))));
  const generate = useCallback(() => setIds(Array.from({ length: n }, () => uuid(version))), [n, version]);
  useEffect(generate, [generate]);

  const shown = ids.map((id) => {
    let s = dashes ? id : id.replace(/-/g, '');
    if (upper) s = s.toUpperCase();
    return s;
  });

  return (
    <>
      <section className="panel" aria-label={t('Settings')}>
        <div className="opt-row">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="opt-label" id="uv">
              {t('Version')}
            </span>
            <Help label={t('UUID version')} text={t('v4 is completely random. v7 starts with the current time, so IDs sort in the order they were made, which keeps database indexes fast.')} />
          </span>
          <Segmented
            labelledBy="uv"
            value={version}
            onChange={setVersion}
            options={[
              { value: 'v4', label: t('v4 random') },
              { value: 'v7', label: t('v7 time-ordered') },
            ]}
          />
        </div>
        <hr className="divider" />
        <div className="opt-row">
          <span className="opt-label" id="up">
            {t('Uppercase')}
          </span>
          <Toggle labelledBy="up" checked={upper} onChange={setUpper} />
        </div>
        <hr className="divider" />
        <div className="opt-row">
          <span className="opt-label" id="dash">
            {t('Hyphens')}
          </span>
          <Toggle labelledBy="dash" checked={dashes} onChange={setDashes} />
        </div>
        <hr className="divider" />
        <div className="inline">
          <NumberField label={t('How many')} value={count} onChange={setCount} min={1} max={500} />
          <button type="button" className="btn btn-primary" onClick={generate}>
            {t('Generate')}
          </button>
        </div>
      </section>
      <Panel title={plural(shown.length, ['{n} uuid', '{n} uuids'], ['{n} uuid', '{n} uuid', '{n} uuid'])} actions={<CopyButton text={shown.join('\n')} label={t('copy all')} />}>
        <pre className="code" style={{ maxHeight: 420, overflow: 'auto', whiteSpace: 'pre', wordBreak: 'normal' }}>
          {shown.join('\n')}
        </pre>
      </Panel>
    </>
  );
}
