import { useEffect, useMemo, useState } from 'react';
import { CopyButton, Segmented, Toggle } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { t } from '../../../lib/i18n-core';
import { useAutosave } from '../../../lib/saved';
import { fromHex, toB64, toHex, utf8 } from './bytes';
import { Cancelled, cryptoJob } from './cryptoClient';
import { DEFAULT_HASHES, HASH_GROUPS, HASH_IDS, HASH_INFO, type HashId } from './hashList';
import { DataInput, type Source } from './io';

type Format = 'hex' | 'HEX' | 'base64';
type Saved = { algos: HashId[]; format: Format; text: string; hmac: boolean };

export default function HashTab() {
  const [algos, setAlgos] = useState<HashId[]>(DEFAULT_HASHES);
  const [format, setFormat] = useState<Format>('hex');
  const [text, setText] = useState('');
  const [source, setSource] = useState<Source>({ kind: 'text' });
  const [hmac, setHmac] = useState(false);
  const [key, setKey] = useState('');
  const [keyHex, setKeyHex] = useState(false);
  const [compare, setCompare] = useState('');
  const [out, setOut] = useState<Partial<Record<HashId, Uint8Array>>>({});
  const [busy, setBusy] = useState<{ progress: number; cancel: () => void } | null>(null);
  const [error, setError] = useState('');
  useAutosave<Saved>('encode-encrypt:hash', { algos, format, text, hmac }, (v) => {
    setAlgos((v.algos ?? DEFAULT_HASHES).filter((a) => HASH_INFO[a]));
    setFormat(v.format ?? 'hex');
    setText(v.text ?? '');
    setHmac(!!v.hmac);
  });

  // Hash again a moment after anything changes; a newer run stops the old one.
  useEffect(() => {
    setError('');
    let hmacKey: Uint8Array | undefined;
    try {
      hmacKey = hmac && key ? (keyHex ? fromHex(key, t('hex key')) : utf8(key)) : undefined;
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    let alive = true;
    let job: ReturnType<typeof cryptoJob<Partial<Record<HashId, Uint8Array>>>> | null = null;
    const timer = setTimeout(() => {
      const data = source.kind === 'file' ? source.file : utf8(text);
      job = cryptoJob({ type: 'hash', data, algos, hmacKey }, (p) => setBusy((b) => (b ? { ...b, progress: p } : b)));
      if (source.kind === 'file') setBusy({ progress: 0, cancel: job.cancel });
      job.done.then(
        (r) => {
          if (!alive) return;
          setOut(r);
          setBusy(null);
        },
        (e) => {
          if (!alive) return;
          setBusy(null);
          if (!(e instanceof Cancelled)) setError((e as Error).message);
        },
      );
    }, source.kind === 'file' ? 0 : 120);
    return () => {
      alive = false;
      clearTimeout(timer);
      // A file stops right away; a text hash is quick, so it just finishes unseen.
      if (source.kind === 'file') job?.cancel();
    };
  }, [algos, text, source, hmac, key, keyHex]);

  const shown = (b: Uint8Array) => (format === 'base64' ? toB64(b) : format === 'HEX' ? toHex(b).toUpperCase() : toHex(b));
  const want = compare.trim().replace(/\s+/g, '');
  const matches = useMemo(() => {
    if (!want) return new Set<HashId>();
    const w = want.toLowerCase();
    return new Set(algos.filter((a) => out[a] && (toHex(out[a]!) === w.replace(/^0x/, '') || toB64(out[a]!) === want)));
  }, [want, algos, out]);
  const toggle = (id: HashId) => setAlgos(algos.includes(id) ? algos.filter((a) => a !== id) : HASH_IDS.filter((a) => a === id || algos.includes(a)));

  return (
    <div className="cr-tab">
      <DataInput label={t('Text or file to hash')} text={text} onText={setText} source={source} onSource={setSource} rows={4} />

      <div className="cr-hash-picks">
        {HASH_GROUPS.map((g) => (
          <div key={g.id} className="cr-pick-group">
            <span className="muted mono">{g.label}</span>
            <div className="cr-chips">
              {HASH_IDS.filter((id) => HASH_INFO[id].group === g.id).map((id) => (
                <button key={id} type="button" className="chip" aria-pressed={algos.includes(id)} onClick={() => toggle(id)}>
                  {HASH_INFO[id].name}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="inline">
          <button type="button" className="btn btn-sm mono" onClick={() => setAlgos(HASH_IDS)}>
            {t('all')}
          </button>
          <button type="button" className="btn btn-sm mono" onClick={() => setAlgos(DEFAULT_HASHES)}>
            {t('the usual ones')}
          </button>
        </div>
      </div>

      <div className="inline cr-hash-opts">
        <Segmented label={t('Write the hash as')} value={format} onChange={setFormat} options={[{ value: 'hex', label: 'hex' }, { value: 'HEX', label: 'HEX' }, { value: 'base64', label: 'Base64' }]} />
        <span className="cr-opt cr-opt-toggle">
          <span className="cr-opt-label">
            <span id="cr-hmac">HMAC</span>
            <Help label="HMAC" text={t('A hash with a secret key: only someone with the same key can make the same value. Used to sign API requests and webhooks. Checksums (CRC, xxHash…) don’t have it.')} />
          </span>
          <Toggle labelledBy="cr-hmac" checked={hmac} onChange={setHmac} />
        </span>
        {hmac && (
          <>
            <span className="cr-opt grow">
              <span className="cr-opt-label">
                <label htmlFor="cr-hmac-key">{t('crypto|Key')}</label>
              </span>
              <input id="cr-hmac-key" className="input mono" value={key} spellCheck={false} autoComplete="off" onChange={(e) => setKey(e.target.value)} />
            </span>
            <span className="cr-opt cr-opt-toggle">
              <span className="cr-opt-label">
                <span id="cr-hmac-hex">{t('key in hex')}</span>
              </span>
              <Toggle labelledBy="cr-hmac-hex" checked={keyHex} onChange={setKeyHex} />
            </span>
          </>
        )}
      </div>

      <div className="field">
        <label htmlFor="cr-compare">{t('Compare with')}</label>
        <input
          id="cr-compare"
          className="input mono"
          value={compare}
          placeholder={t('Paste the checksum from the download page, the matching row turns green')}
          spellCheck={false}
          onChange={(e) => setCompare(e.target.value)}
        />
        {want && (
          <p className={matches.size ? 'cr-ok' : 'error-text'} role="status">
            {matches.size ? t('Matches {names}.', { names: [...matches].map((a) => HASH_INFO[a].name).join(', ') }) : t('Doesn’t match any of the hashes below.')}
          </p>
        )}
      </div>

      {busy && (
        <div className="inline">
          <progress className="cr-progress" value={busy.progress} max={1} />
          <span className="mono muted">{Math.round(busy.progress * 100)} %</span>
          <button type="button" className="btn btn-sm" onClick={busy.cancel}>
            {t('stop')}
          </button>
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      {!busy && algos.length > 0 && (
        <table className="cr-hashes">
          <tbody>
            {algos.map((id) => {
              const v = out[id];
              const keyed = hmac && key && HASH_INFO[id].hmac;
              return (
                <tr key={id} className={matches.has(id) ? 'match' : undefined}>
                  <th scope="row" className="mono">
                    {/* i18n-ignore */}
                    {keyed ? `HMAC-${HASH_INFO[id].name}` : HASH_INFO[id].name}
                    {HASH_INFO[id].weak && <span className="cr-weak" title={t('Broken: fine to check a download, not for security.')}>{t('weak')}</span>}
                  </th>
                  <td className="mono">{v ? shown(v) : '…'}</td>
                  <td>{v && <CopyButton text={shown(v)} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
