import { useState, type FormEvent } from 'react';
import { Panel, TextField } from '../../components/ui';
import { GoLink } from '../../components/Transition';
import { saveBlob } from '../../queue/download';
import { isName, lookupProfile, type Profile } from '../../lib/mc/uuid';

const img = { imageRendering: 'pixelated' as const, maxWidth: '100%' };

export default function SkinViewer() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isName(query)) return;
    setLoading(true);
    setError('');
    try {
      const p = await lookupProfile(query);
      setProfile(p);
      if (!p) setError(`No Java account named “${query.trim()}”.`);
    } catch (err) {
      setProfile(null);
      setError(err instanceof TypeError ? 'Could not reach the lookup service. Check your connection.' : (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const skinUrl = profile ? `https://mc-heads.net/skin/${profile.id}` : '';

  const download = async () => {
    if (!profile) return;
    try {
      const res = await fetch(skinUrl);
      if (!res.ok) throw new Error();
      saveBlob(await res.blob(), `${profile.name}.png`);
    } catch {
      window.open(skinUrl, '_blank', 'noopener');
    }
  };

  return (
    <>
      <form className="panel" onSubmit={submit} aria-label="Player">
        <div className="inline">
          <TextField label="Player name" value={query} onChange={setQuery} placeholder="jeb_" mono autoFocus />
          <button type="submit" className="btn btn-primary" disabled={loading || !isName(query)}>
            {loading ? 'Loading…' : 'Show skin'}
          </button>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </form>

      {profile && (
        <Panel
          title={profile.name}
          actions={
            <span className="inline">
              <GoLink className="btn btn-sm" to={`/t/skin-editor?player=${encodeURIComponent(profile.name)}`}>
                edit in skin editor
              </GoLink>
              <button type="button" className="btn btn-sm" onClick={download}>
                download .png
              </button>
            </span>
          }
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end' }}>
            <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <img src={`https://mc-heads.net/body/${profile.id}/240`} height={240} alt={`${profile.name}’s skin, front view`} style={img} />
              <figcaption className="mono muted" style={{ fontSize: 12 }}>
                body
              </figcaption>
            </figure>
            <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <img src={`https://mc-heads.net/head/${profile.id}/120`} width={120} alt={`${profile.name}’s head`} style={img} />
              <figcaption className="mono muted" style={{ fontSize: 12 }}>
                head
              </figcaption>
            </figure>
            <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <img
                src={skinUrl}
                width={256}
                alt={`${profile.name}’s skin texture`}
                style={{ ...img, background: 'repeating-conic-gradient(var(--line) 0 25%, transparent 0 50%) 0 0 / 16px 16px', borderRadius: 6 }}
              />
              <figcaption className="mono muted" style={{ fontSize: 12 }}>
                texture · 64×64
              </figcaption>
            </figure>
          </div>
          <p className="note">Images come from mc-heads.net. Skin changes can take a few minutes to show up.</p>
        </Panel>
      )}
    </>
  );
}
