import { useId, useMemo, useRef, useState } from 'react';
import { SavedPanel } from '../../components/SavedPanel';
import { useAutosave } from '../../lib/saved';
import { Segmented, TabPanel, Tabs, Toggle } from '../../components/ui';
import { Help } from '../../components/Help';
import { parseProperties, writeProperties } from '../../lib/properties';
import { saveBlob } from '../../queue/download';
import { plural, t, tc, tn, tx } from '../../lib/i18n';

type Kind = { t: 'bool' } | { t: 'int'; min?: number; max?: number } | { t: 'enum'; values: string[] } | { t: 'text' };
type Prop = { key: string; def: string; kind: Kind; group: string; help?: string };

const bool: Kind = { t: 'bool' };
const text: Kind = { t: 'text' };
const int = (min?: number, max?: number): Kind => ({ t: 'int', min, max });

// Defaults of a fresh 1.21 server, with what each key does.
const PROPS: Prop[] = [
  { key: 'motd', def: 'A Minecraft Server', kind: text, group: 'General', help: t('The text under your server’s name in the multiplayer list. Use the MOTD generator to add colors.') },
  { key: 'max-players', def: '20', kind: int(0), group: 'General', help: t('How many players can be online at the same time.') },
  { key: 'gamemode', def: 'survival', kind: { t: 'enum', values: ['survival', 'creative', 'adventure', 'spectator'] }, group: 'General', help: t('The game mode players get the first time they join. Adventure: they can’t break or place blocks. Spectator: they fly through everything and can’t interact.') },
  { key: 'difficulty', def: 'easy', kind: { t: 'enum', values: ['peaceful', 'easy', 'normal', 'hard'] }, group: 'General', help: t('How dangerous the world is. Peaceful removes hostile mobs and hunger damage; on hard, mobs hit harder and hunger can kill you.') },
  { key: 'hardcore', def: 'false', kind: bool, group: 'General', help: t('One life: players who die are switched to spectator mode, and difficulty is locked to hard.') },
  { key: 'pvp', def: 'true', kind: bool, group: 'General', help: t('Whether players can damage each other. Mobs and the environment still hurt players when it’s off.') },
  { key: 'force-gamemode', def: 'false', kind: bool, group: 'General', help: t('On: players are put back into the default game mode every time they join, even if someone changed it with /gamemode.') },
  { key: 'allow-flight', def: 'false', kind: bool, group: 'General', help: t('Off: players who seem to fly in survival get kicked (a simple anti-cheat). Turn it on if mods or plugins let people fly, or they’ll get kicked by mistake.') },
  { key: 'spawn-protection', def: '16', kind: int(0), group: 'General', help: t('Radius in blocks around world spawn where only operators can build or break. 0 turns protection off. It does nothing while there are no operators.') },
  { key: 'enable-command-block', def: 'false', kind: bool, group: 'General', help: t('Lets command blocks run their commands. Off: they can be placed but do nothing.') },

  { key: 'level-name', def: 'world', kind: text, group: 'World', help: t('Name of the world folder. Change it to load a different world folder, or to start a fresh world without deleting the old one.') },
  { key: 'level-seed', def: '', kind: text, group: 'World', help: t('Seed for generating the world. Empty means random. Only used when the world is first created; changing it later doesn’t touch existing land.') },
  { key: 'level-type', def: 'minecraft:normal', kind: { t: 'enum', values: ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified'] }, group: 'World', help: t('Generator for a new world. Flat is superflat, large biomes makes biomes 16× bigger, amplified makes huge mountains (heavy on the server).') },
  { key: 'generate-structures', def: 'true', kind: bool, group: 'World', help: t('Whether villages, temples, strongholds and other structures generate in new chunks.') },
  { key: 'allow-nether', def: 'true', kind: bool, group: 'World', help: t('Off: nether portals don’t take anyone to the Nether.') },
  { key: 'view-distance', def: '10', kind: int(3, 32), group: 'World', help: t('How many chunks around each player the server sends, i.e. how far they can see. Higher looks better but uses more CPU, RAM and upload.') },
  { key: 'simulation-distance', def: '10', kind: int(3, 32), group: 'World', help: t('How many chunks around players are active: mobs move, crops grow, redstone and farms run. Lowering this is the best way to reduce lag.') },
  { key: 'max-world-size', def: '29999984', kind: int(1, 29999984), group: 'World', help: t('Largest possible world border radius in blocks. Lower it to stop players exploring (and generating) too far.') },
  { key: 'sync-chunk-writes', def: 'true', kind: bool, group: 'World', help: t('Saves chunks to disk right away. Safer if the server crashes, but slower; many servers turn it off for performance.') },

  { key: 'online-mode', def: 'true', kind: bool, group: 'Players', help: t('Checks every player has a real, paid Minecraft account. Off lets cracked clients join, anyone can take any name, and every player gets a different (offline) UUID. Leave it on unless you run a proxy like Velocity or BungeeCord.') },
  { key: 'white-list', def: 'false', kind: bool, group: 'Players', help: t('Only players on the whitelist can join. Add them in game with /whitelist add <name>.') },
  { key: 'enforce-whitelist', def: 'false', kind: bool, group: 'Players', help: t('When the whitelist is turned on or reloaded, kick players who are online but not on it.') },
  { key: 'enforce-secure-profile', def: 'true', kind: bool, group: 'Players', help: t('Requires players to have a Mojang-signed key used for chat reporting. Off lets in players without one (some modded or cracked clients).') },
  { key: 'op-permission-level', def: '4', kind: { t: 'enum', values: ['1', '2', '3', '4'] }, group: 'Players', help: t('What /op gives by default. 1: build inside spawn protection. 2: cheat commands and command blocks. 3: kick and ban. 4: everything, including /stop.') },
  { key: 'player-idle-timeout', def: '0', kind: int(0), group: 'Players', help: t('Kick players who haven’t moved for this many minutes. 0 never kicks.') },
  { key: 'hide-online-players', def: 'false', kind: bool, group: 'Players', help: t('Hide the names of online players when someone hovers the player count in the server list.') },
  { key: 'accepts-transfers', def: 'false', kind: bool, group: 'Players', help: t('Lets other servers send players here with the /transfer command (1.20.5+).') },

  { key: 'server-port', def: '25565', kind: int(1, 65535), group: 'Network', help: t('The port players connect to. 25565 is the default, so players don’t have to type it. This is the port to forward on your router.') },
  { key: 'server-ip', def: '', kind: text, group: 'Network', help: t('Only listen on one network address of this machine. Leave it empty; filling it in is a common reason nobody can connect.') },
  { key: 'network-compression-threshold', def: '256', kind: int(-1), group: 'Network', help: t('Packets bigger than this many bytes get compressed. Lower saves bandwidth but costs CPU; -1 turns compression off (fine on a LAN or behind a proxy).') },
  { key: 'rate-limit', def: '0', kind: int(0), group: 'Network', help: t('Most packets per second a player may send before being kicked. 0 means no limit.') },
  { key: 'enable-status', def: 'true', kind: bool, group: 'Network', help: t('Answer server-list pings. Off: the server shows as offline in the list, but players who know the address can still join.') },
  { key: 'enable-query', def: 'false', kind: bool, group: 'Network', help: t('Turns on the GameSpy4 query protocol that some server lists and monitoring tools use to read the player count.') },
  { key: 'query.port', def: '25565', kind: int(1, 65535), group: 'Network', help: t('UDP port for query, used when enable-query is on.') },
  { key: 'enable-rcon', def: 'false', kind: bool, group: 'Network', help: t('Remote console: run server commands from another program. Set a strong rcon.password and never open this port to the internet.') },
  { key: 'rcon.port', def: '25575', kind: int(1, 65535), group: 'Network', help: t('TCP port RCON listens on.') },
  { key: 'rcon.password', def: '', kind: text, group: 'Network', help: t('Password RCON programs must send. RCON stays off while this is empty.') },

  { key: 'resource-pack', def: '', kind: text, group: 'Resource pack', help: t('Direct download link to a .zip resource pack that players are offered when they join. The link must download the file itself, not open a web page.') },
  { key: 'resource-pack-sha1', def: '', kind: text, group: 'Resource pack', help: t('SHA-1 hash of the pack file. Lets the game check the download and notice when you update the pack. Optional but recommended.') },
  { key: 'resource-pack-prompt', def: '', kind: text, group: 'Resource pack', help: t('Your own message on the “download resource pack?” screen, as JSON text, for example {"text":"Needed for custom items"}.') },
  { key: 'require-resource-pack', def: 'false', kind: bool, group: 'Resource pack', help: t('Players who decline the pack are disconnected.') },
];

const GROUPS = [...new Set(PROPS.map((p) => p.group))];
/** The groups' names as tabs show them (tc('settings group', name)). */
export const GROUP_NAMES = [tx('settings group|General'), tx('settings group|World'), tx('settings group|Players'), tx('settings group|Network'), tx('settings group|Resource pack'), tx('settings group|Other')];
const defaults = () => new Map(PROPS.map((p) => [p.key, p.def]));

function Row({ prop, value, set }: { prop: Prop; value: string; set: (v: string) => void }) {
  const id = useId();
  const k = prop.kind;
  const changed = value !== prop.def;
  return (
    <div className="opt-row">
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <label htmlFor={k.t === 'bool' || k.t === 'enum' ? undefined : id} id={`${id}-l`} className="mono" style={{ fontSize: 14 }}>
          {prop.key}
          {changed && <span className="accent"> ●</span>}
        </label>
        {prop.help && <Help label={prop.key} text={prop.help} />}
      </div>
      {k.t === 'bool' ? (
        <Toggle labelledBy={`${id}-l`} checked={value === 'true'} onChange={(v) => set(String(v))} />
      ) : k.t === 'enum' ? (
        k.values.length <= 4 ? (
          <Segmented labelledBy={`${id}-l`} value={value} onChange={set} options={k.values.map((v) => ({ value: v, label: v.replace('minecraft:', '') }))} />
        ) : (
          <select id={id} className="select mono" value={value} onChange={(e) => set(e.target.value)}>
            {k.values.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        )
      ) : (
        <input
          id={id}
          className={`input mono${k.t === 'int' ? ' input-num' : ''}`}
          style={k.t === 'text' ? { flex: '1 1 240px', maxWidth: 360 } : undefined}
          type={k.t === 'int' ? 'number' : 'text'}
          inputMode={k.t === 'int' ? 'numeric' : undefined}
          min={k.t === 'int' ? k.min : undefined}
          max={k.t === 'int' ? k.max : undefined}
          value={value}
          spellCheck={false}
          onChange={(e) => set(e.target.value)}
        />
      )}
    </div>
  );
}

export default function ServerProperties() {
  const [values, setValues] = useState<Map<string, string>>(defaults);
  const [source, setSource] = useState('defaults');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('General');
  const file = useRef<HTMLInputElement>(null);

  const set = (key: string, v: string) => setValues((m) => new Map(m).set(key, v));

  // Saved as a plain object (a Map doesn't survive the backup file).
  type Draft = { values: Record<string, string>; source: string };
  const draft = useMemo<Draft>(() => ({ values: Object.fromEntries(values), source }), [values, source]);
  const restore = (d: Draft) => {
    setValues(new Map([...defaults(), ...Object.entries(d.values)]));
    setSource(d.source);
  };
  useAutosave('server-properties', draft, restore);
  const extra = [...values.keys()].filter((k) => !PROPS.some((p) => p.key === k)).sort();
  const changed = PROPS.filter((p) => (values.get(p.key) ?? p.def) !== p.def).length;

  const open = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed = parseProperties(await f.text());
      if (!parsed.size) throw new Error();
      // Keys missing from an older file get their defaults so the controls work.
      setValues(new Map([...defaults(), ...parsed]));
      setSource(f.name);
      setError('');
    } catch {
      setError(t('{name} doesn’t look like a properties file.', { name: f.name }));
    }
  };

  const save = () => {
    const out = writeProperties(values, 'Minecraft server properties'); // i18n-ignore (the file's header)
    saveBlob(new Blob([out], { type: 'text/plain' }), 'server.properties');
  };

  const otherProps: Prop[] = extra.map((k) => ({ key: k, def: values.get(k) ?? '', kind: text, group: 'Other' }));
  const all = [...PROPS, ...otherProps];
  const groups = extra.length ? [...GROUPS, 'Other'] : GROUPS;
  const q = query.trim().toLowerCase();
  // Searching looks through every group, so you don't have to guess which tab a key is in.
  // Keys whose name matches come first; ones that only mention it in their explanation follow.
  const shown = q
    ? [...all.filter((p) => p.key.includes(q)), ...all.filter((p) => !p.key.includes(q) && p.help?.toLowerCase().includes(q))]
    : all.filter((p) => p.group === (groups.includes(tab) ? tab : groups[0]));
  const changedIn = (g: string) => all.some((p) => p.group === g && p.group !== 'Other' && (values.get(p.key) ?? p.def) !== p.def);

  const rows = (list: Prop[], showGroup: boolean) =>
    list.map((p, i) => (
      <div key={p.key} style={{ display: 'contents' }}>
        {showGroup && (i === 0 || list[i - 1].group !== p.group) ? (
          <div className="mono muted" style={{ fontSize: 12, paddingTop: i ? 8 : 0 }}>
            {tc('settings group', p.group).toLowerCase()}
          </div>
        ) : (
          i > 0 && <hr className="divider" />
        )}
        <Row prop={p} value={values.get(p.key) ?? p.def} set={(v) => set(p.key, v)} />
      </div>
    ));

  return (
    <>
      <section className="sticky-bar" aria-label={t('File')}>
        <div className="inline" style={{ alignItems: 'center' }}>
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            {t('Open file')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setValues(defaults());
              setSource('defaults');
            }}
          >
            {t('Reset')}
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            {t('Save server.properties')}
          </button>
          <input
            className="input"
            type="search"
            aria-label={t('Search settings')}
            placeholder={t('search settings… e.g. whitelist, port')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: '1 1 200px' }}
          />
          <input ref={file} type="file" accept=".properties,.txt" hidden onChange={(e) => open(e.target.files?.[0])} />
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          {tn('Editing {file}', { file: <span className="mono">{source === 'defaults' ? t('the defaults') : source}</span> })} ·{' '}
          {changed ? t('{n} changed from default (marked ●)', { n: changed }) : t('nothing changed from default')}
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="panel" aria-label={t('Settings')}>
        {q ? (
          <>
            <p className="note" role="status">
              {shown.length
                ? plural(shown.length, ['{n} setting matches “{q}”', '{n} settings match “{q}”'], ['Hledání „{q}“ odpovídá {n} nastavení', 'Hledání „{q}“ odpovídají {n} nastavení', 'Hledání „{q}“ odpovídá {n} nastavení'], { q: query.trim() })
                : t('No setting matches “{q}”.', { q: query.trim() })}
            </p>
            {rows(shown, true)}
          </>
        ) : (
          <>
            <Tabs
              idPrefix="sp"
              label={t('Setting groups')}
              value={groups.includes(tab) ? tab : groups[0]}
              onChange={setTab}
              tabs={groups.map((g) => ({ id: g, label: tc('settings group', g).toLowerCase(), dot: changedIn(g) }))}
            />
            <TabPanel idPrefix="sp" id={groups.includes(tab) ? tab : groups[0]}>
              {rows(shown, false)}
            </TabPanel>
          </>
        )}
      </section>

      <SavedPanel<Draft>
        slug="server-properties"
        title={t('my configs')}
        help={t('Keep setups for different servers (survival, creative, minigame…) and switch between them.')}
        suggestName={() => (values.get('motd') ?? '').replace(/[§&][0-9a-fk-or]/gi, '').trim().slice(0, 40) || (source === 'defaults' ? t('My server') : source)}
        getData={() => draft}
        onLoad={restore}
        describe={(i) => {
          const n = PROPS.filter((p) => (i.data.values[p.key] ?? p.def) !== p.def).length;
          return plural(n, ['{n} changed from default', '{n} changed from default'], ['{n} změna oproti výchozímu', '{n} změny oproti výchozímu', '{n} změn oproti výchozímu']);
        }}
        emptyText={t('No saved configs yet.')}
      />
    </>
  );
}
