import { useState } from 'react';
import { NumberField, Output, Panel, Segmented, TextField, num } from '../../components/ui';
import { isName } from '../../lib/mc/uuid';
import { Help } from '../../components/Help';

type Version = 'new' | 'mid' | 'old';

const TARGETS = [
  { value: '@p', label: '@p · nearest player' },
  { value: '@s', label: '@s · yourself' },
  { value: '@a', label: '@a · every player' },
  { value: '@r', label: '@r · random player' },
  { value: 'name', label: 'a specific player…' },
] as const;

const VERSIONS = [
  { value: 'new', label: '1.20.5+' },
  { value: 'mid', label: '1.13 – 1.20.4' },
  { value: 'old', label: '1.12 and older' },
] as const;

export function headCommand(name: string, version: Version, target: string, count: number) {
  const n = Math.max(1, Math.min(64, Math.round(count)));
  const t = target.trim() || '@p';
  if (version === 'new') return `/give ${t} minecraft:player_head[minecraft:profile={name:"${name}"}] ${n}`;
  if (version === 'mid') return `/give ${t} minecraft:player_head{SkullOwner:"${name}"} ${n}`;
  return `/give ${t} minecraft:skull ${n} 3 {SkullOwner:"${name}"}`;
}

export default function PlayerHead() {
  const [name, setName] = useState('');
  const [version, setVersion] = useState<Version>('new');
  const [target, setTarget] = useState<string>('@p');
  const [targetName, setTargetName] = useState('');
  const [count, setCount] = useState('1');

  const ok = isName(name);
  const cmd = ok ? headCommand(name.trim(), version, target === 'name' ? targetName : target, num(count, 1)) : '';

  return (
    <>
      <section className="panel" aria-label="Head settings">
        <div className="inline">
          <TextField label="Player name" value={name} onChange={setName} placeholder="MHF_Chest" mono autoFocus />
          {ok && (
            <img src={`https://mc-heads.net/head/${name.trim()}/64`} width={64} height={64} alt={`${name.trim()}’s head`} style={{ imageRendering: 'pixelated' }} />
          )}
        </div>
        <div className="field">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="field-label" id="ver">
              Game version
            </span>
            <Help label="game version" text="The /give syntax for heads changed twice. 1.20.5+ uses item components, 1.13 to 1.20.4 uses SkullOwner NBT, and 1.12 or older uses the skull item with damage value 3." />
          </span>
          <Segmented labelledBy="ver" value={version} onChange={setVersion} options={VERSIONS} />
        </div>
        <div className="fields">
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <label htmlFor="ph-target" className="field-label">
                Target
              </label>
              <Help label="target" text="Who gets the head. @p is the player nearest to where the command runs, @s is whoever runs it (you, in chat), @a gives one to everyone online, @r to one random player. Pick “a specific player” to type a name." />
            </span>
            <select id="ph-target" className="select mono" value={target} onChange={(e) => setTarget(e.target.value)}>
              {TARGETS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {target === 'name' && <TextField label="Player to give it to" value={targetName} onChange={setTargetName} placeholder="Steve" mono />}
          <NumberField label="Count" value={count} onChange={setCount} min={1} max={64} />
        </div>
      </section>
      <Panel title="command">
        {ok ? <Output label="Paste into chat or a command block" value={cmd} multiline /> : <p className="note">Enter a player name to get the command.</p>}
        <p className="note">The head shows the skin the player has when the head is placed. Use names like MHF_Chest or MHF_Cake for Mojang’s decoration heads.</p>
      </Panel>
    </>
  );
}
