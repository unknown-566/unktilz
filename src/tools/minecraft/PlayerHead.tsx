import { useState } from 'react';
import { NumberField, Output, Panel, Segmented, TextField, num } from '../../components/ui';
import { isName } from '../../lib/mc/uuid';
import { Help } from '../../components/Help';
import { t } from '../../lib/i18n-core';

type Version = 'new' | 'mid' | 'old';

const TARGETS = [
  { value: '@p', label: t('@p · nearest player') },
  { value: '@s', label: t('@s · yourself') },
  { value: '@a', label: t('@a · every player') },
  { value: '@r', label: t('@r · random player') },
  { value: 'name', label: t('a specific player…') },
] as const;

const VERSIONS = [
  { value: 'new', label: '1.20.5+' },
  { value: 'mid', label: '1.13 – 1.20.4' },
  { value: 'old', label: t('1.12 and older') },
] as const;

export function headCommand(name: string, version: Version, target: string, count: number) {
  const n = Math.max(1, Math.min(64, Math.round(count)));
  const tt = target.trim() || '@p';
  if (version === 'new') return `/give ${tt} minecraft:player_head[minecraft:profile={name:"${name}"}] ${n}`;
  if (version === 'mid') return `/give ${tt} minecraft:player_head{SkullOwner:"${name}"} ${n}`;
  return `/give ${tt} minecraft:skull ${n} 3 {SkullOwner:"${name}"}`;
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
      <section className="panel" aria-label={t('Head settings')}>
        <div className="inline">
          <TextField label={t('Player name')} value={name} onChange={setName} placeholder={t('MHF_Chest')} mono autoFocus />
          {ok && (
            <img src={`https://mc-heads.net/head/${name.trim()}/64`} width={64} height={64} alt={t('{v1}’s head', { v1: name.trim() })} style={{ imageRendering: 'pixelated' }} />
          )}
        </div>
        <div className="field">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="field-label" id="ver">
              {t('Game version')}
            </span>
            <Help label={t('game version')} text={t('The /give syntax for heads changed twice. 1.20.5+ uses item components, 1.13 to 1.20.4 uses SkullOwner NBT, and 1.12 or older uses the skull item with damage value 3.')} />
          </span>
          <Segmented labelledBy="ver" value={version} onChange={setVersion} options={VERSIONS} />
        </div>
        <div className="fields">
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <label htmlFor="ph-target" className="field-label">
                {t('Target')}
              </label>
              <Help label={t('target')} text={t('Who gets the head. @p is the player nearest to where the command runs, @s is whoever runs it (you, in chat), @a gives one to everyone online, @r to one random player. Pick “a specific player” to type a name.')} />
            </span>
            <select id="ph-target" className="select mono" value={target} onChange={(e) => setTarget(e.target.value)}>
              {TARGETS.map((tt) => (
                <option key={tt.value} value={tt.value}>
                  {tt.label}
                </option>
              ))}
            </select>
          </div>
          {target === 'name' && <TextField label={t('Player to give it to')} value={targetName} onChange={setTargetName} placeholder={t('Steve')} mono />}
          <NumberField label={t('Count')} value={count} onChange={setCount} min={1} max={64} />
        </div>
      </section>
      <Panel title={t('command')}>
        {ok ? <Output label={t('Paste into chat or a command block')} value={cmd} multiline /> : <p className="note">{t('Enter a player name to get the command.')}</p>}
        <p className="note">{t('The head shows the skin the player has when the head is placed. Use names like MHF_Chest or MHF_Cake for Mojang’s decoration heads.')}</p>
      </Panel>
    </>
  );
}
