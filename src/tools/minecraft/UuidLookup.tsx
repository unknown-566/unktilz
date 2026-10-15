import { useEffect, useState, type FormEvent } from 'react';
import { Output, Panel, Segmented, TextField } from '../../components/ui';
import { Help } from '../../components/Help';
import { intArray, isName, isUuid, lookupProfile, offlineUuid, type Profile } from '../../lib/mc/uuid';

type Mode = 'online' | 'offline';

type Lookup =
  | { state: 'idle' }
  | { state: 'loading'; query: string }
  | { state: 'found'; query: string; profile: Profile }
  | { state: 'missing'; query: string }
  | { state: 'error'; query: string; message: string };

export default function UuidLookup() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('online');
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [retry, setRetry] = useState(0);

  const q = query.trim();
  const valid = mode === 'online' ? isName(q) || isUuid(q) : isName(q);

  // Online: look the player up as you type, once typing pauses, so there's nothing to click.
  useEffect(() => {
    if (mode !== 'online' || !valid) {
      setLookup({ state: 'idle' });
      return;
    }
    let alive = true;
    const t = window.setTimeout(async () => {
      setLookup({ state: 'loading', query: q });
      try {
        const profile = await lookupProfile(q);
        if (!alive) return;
        setLookup(profile ? { state: 'found', query: q, profile } : { state: 'missing', query: q });
      } catch (err) {
        if (!alive) return;
        setLookup({
          state: 'error',
          query: q,
          message: err instanceof TypeError ? 'Could not reach the lookup service. Check your connection.' : (err as Error).message,
        });
      }
    }, 450);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, mode, valid, retry]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setRetry((n) => n + 1);
  };

  return (
    <>
      <form className="panel" onSubmit={submit} aria-label="Player">
        <div className="opt-row">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="opt-label" id="uuid-mode">
              Server type
            </span>
            <Help
              label="server type"
              text="Online is the normal case: players log in with a real Minecraft account and keep the same UUID everywhere. Offline is for servers with online-mode=false, where the UUID is made from the name alone."
            />
          </span>
          <Segmented
            labelledBy="uuid-mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'online', label: 'online (real account)' },
              { value: 'offline', label: 'offline mode' },
            ]}
          />
        </div>
        <TextField
          label={mode === 'online' ? 'Player name or UUID' : 'Player name'}
          value={query}
          onChange={setQuery}
          placeholder="Notch"
          mono
          autoFocus
        />
        {q && !valid && (
          <p className="note">{mode === 'online' ? 'Type a name (1–16 letters, digits or _) or a UUID.' : 'Names are 1–16 letters, digits or underscores.'}</p>
        )}
        <div role="status" aria-live="polite">
          {lookup.state === 'loading' && <p className="note mono">looking up {lookup.query}…</p>}
          {lookup.state === 'missing' && <p className="note">No Java account called “{lookup.query}”. Check the spelling, or switch to offline mode for cracked servers.</p>}
          {lookup.state === 'error' && (
            <p className="error-text">
              {lookup.message}{' '}
              <button type="submit" className="btn btn-sm">
                try again
              </button>
            </p>
          )}
        </div>
      </form>

      {mode === 'online' && lookup.state === 'found' && (
        <Panel title={`online uuid · ${lookup.profile.name}`}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <img
              src={`https://mc-heads.net/avatar/${lookup.profile.id}/64`}
              width={64}
              height={64}
              alt={`${lookup.profile.name}’s head`}
              style={{ imageRendering: 'pixelated', borderRadius: 6 }}
            />
            <span className="mono" style={{ fontSize: 18 }}>
              {lookup.profile.name}
            </span>
          </div>
          <Output label="UUID" value={lookup.profile.id} />
          <Output label="Without dashes" value={lookup.profile.id.replace(/-/g, '')} />
          <Output label="Int array (NBT, 1.16+)" value={intArray(lookup.profile.id)} />
          <p className="note">This is the player’s real UUID from Mojang. It stays the same even if they change their name.</p>
        </Panel>
      )}

      {mode === 'offline' && isName(q) && (
        <Panel title={`offline uuid · ${q}`}>
          <Output label="UUID" value={offlineUuid(q)} />
          <Output label="Without dashes" value={offlineUuid(q).replace(/-/g, '')} />
          <Output label="Int array (NBT, 1.16+)" value={intArray(offlineUuid(q))} />
          <p className="note">Servers with online-mode=false give players this UUID. It’s made from the name, so it changes if the name or its capitals change.</p>
        </Panel>
      )}
    </>
  );
}
