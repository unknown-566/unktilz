import { useState, type FormEvent } from 'react';
import { SavedPanel } from '../../components/SavedPanel';
import { Panel, Segmented, Stat, TextField } from '../../components/ui';
import { McText } from '../../lib/mc/text';
import { t } from '../../lib/i18n-core';

type Status = {
  online: boolean;
  ip?: string;
  port?: number;
  hostname?: string;
  version?: string;
  software?: string;
  gamemode?: string;
  icon?: string;
  protocol?: { version: number; name?: string };
  players?: { online: number; max: number; list?: { name: string; uuid?: string }[] };
  motd?: { raw?: string[]; clean?: string[] };
};

type Edition = 'java' | 'bedrock';

export default function ServerStatus() {
  const [address, setAddress] = useState('');
  const [edition, setEdition] = useState<Edition>('java');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ address: string; status: Status } | null>(null);

  const check = (e: FormEvent) => {
    e.preventDefault();
    run(address, edition);
  };

  const run = async (addr: string, ed: Edition) => {
    const host = addr.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!host) return;
    setLoading(true);
    setError('');
    try {
      const url = `https://api.mcsrvstat.us/${ed === 'bedrock' ? 'bedrock/' : ''}3/${encodeURIComponent(host)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(t('Status service answered {status}. Try again in a minute.', { status: res.status }));
      setResult({ address: host, status: (await res.json()) as Status });
    } catch (err) {
      setResult(null);
      setError(err instanceof TypeError ? t('Could not reach the status service. Check your connection.') : (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const s = result?.status;
  return (
    <>
      <form className="panel" onSubmit={check} aria-label={t('Server address')}>
        <div className="inline">
          <TextField label={t('Server address')} value={address} onChange={setAddress} placeholder={t('play.example.net or 1.2.3.4:25565')} mono autoFocus />
          <Segmented label={t('Edition')} value={edition} onChange={setEdition} options={[{ value: 'java', label: t('java') }, { value: 'bedrock', label: t('bedrock') }]} />
          <button type="submit" className="btn btn-primary" disabled={loading || !address.trim()}>
            {loading ? t('Checking…') : t('Check')}
          </button>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </form>

      <SavedPanel<{ address: string; edition: Edition }>
        slug="server-status"
        title={t('favourite servers')}
        help={t('Servers you check often. Click one to check it right away.')}
        saveLabel={t('add')}
        loadLabel={t('Check')}
        undoable={false}
        suggestName={() => address.trim()}
        getData={() => (address.trim() ? { address: address.trim(), edition } : null)}
        onLoad={(d) => {
          setAddress(d.address);
          setEdition(d.edition);
          run(d.address, d.edition);
        }}
        describe={(i) => `${i.data.address} · ${i.data.edition}`}
        emptyText={t('No favourites yet. Type an address above and press add.')}
      />

      {s && result && (
        <Panel title={result.address}>
          <div aria-live="polite" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {s.icon && <img src={s.icon} width={64} height={64} alt="" style={{ imageRendering: 'pixelated', borderRadius: 6 }} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="mono" style={{ fontSize: 18, color: s.online ? 'var(--accent-text)' : 'var(--danger)' }}>
                {s.online ? t('● online') : t('○ offline')}
              </span>
              <span className="mono muted" style={{ fontSize: 13 }}>
                {s.ip ? `${s.ip}:${s.port}` : t('no answer from this address')}
              </span>
            </div>
          </div>
          {s.online && (
            <>
              {s.motd?.raw?.length ? (
                <div className="mc-preview" aria-label={`MOTD: ${s.motd.clean?.join(' ') ?? ''}` /* i18n-ignore */}>
                  <McText text={s.motd.raw.join('\n')} prefixes="§" />
                </div>
              ) : null}
              <div className="stats">
                <Stat label={t('players')} value={s.players ? `${s.players.online} / ${s.players.max}` : '–'} />
                <Stat label={t('version')} value={s.protocol?.name ?? s.version ?? '–'} />
                {s.protocol?.version !== undefined && <Stat label={t('protocol')} value={s.protocol.version} />}
                {s.software && <Stat label={t('software')} value={s.software} />}
                {s.gamemode && <Stat label={t('gamemode')} value={s.gamemode} />}
              </div>
              {s.players?.list?.length ? (
                <div className="field">
                  <span className="field-label">{t('Players online')}</span>
                  <div className="seg">
                    {s.players.list.slice(0, 60).map((p) => (
                      <span key={p.uuid ?? p.name} className="btn btn-sm mono" style={{ cursor: 'default' }}>
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
          <p className="note">{t('Status comes from mcsrvstat.us and is cached for a few minutes.')}</p>
        </Panel>
      )}
    </>
  );
}
