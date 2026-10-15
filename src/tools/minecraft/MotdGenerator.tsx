import { useRef, useState } from 'react';
import { Output, Panel } from '../../components/ui';
import { Workbench } from '../../components/Workbench';
import { McText } from '../../lib/mc/text';
import { CodePalette, applyCode } from './CodePalette';

const START = '&a&lMy Server &7· &fSurvival\n&eJoin us at &bplay.example.net';

/** server.properties is read as Latin-1 with \u escapes, so § must be escaped. */
const toProperties = (s: string) =>
  s
    .replace(/&([0-9a-fk-orx#])/gi, '§$1')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/[^\x20-\x7e]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);

export default function MotdGenerator() {
  const [text, setText] = useState(START);
  const area = useRef<HTMLTextAreaElement>(null);

  const lines = text.split('\n');
  const tooMany = lines.length > 2;
  const motd = lines.slice(0, 2).join('\n');

  const preview = (
    <Panel title="preview">
      <div className="mc-preview" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div aria-hidden="true" style={{ flex: 'none', width: 64, height: 64, borderRadius: 4, background: '#3b3b3b', display: 'grid', placeItems: 'center', color: '#777' }}>
          ?
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: '#fff', textShadow: '2px 2px 0 #3f3f3f' }}>Minecraft Server</span>
            <span style={{ color: '#aaa' }}>0/20</span>
          </div>
          <McText text={motd} />
        </div>
      </div>
    </Panel>
  );

  const output = (
    <Panel title="copy">
      <Output label="server.properties" value={`motd=${toProperties(motd)}`} />
      <Output label="Plugins & configs (& codes)" value={motd.replace(/\n/g, '\\n')} />
      <Output label="Section signs (§)" value={motd.replace(/&([0-9a-fk-orx#])/gi, '§$1')} multiline />
    </Panel>
  );

  return (
    <Workbench preview={preview} output={output}>
      <section className="panel" aria-label="Edit MOTD">
        <div className="field">
          <label htmlFor="motd">MOTD · two lines, & for codes</label>
          <textarea
            id="motd"
            ref={area}
            className="textarea mono"
            style={{ minHeight: 96 }}
            value={text}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
          />
          {tooMany && <p className="note">Only the first two lines show in the server list.</p>}
        </div>
        <CodePalette onInsert={(code) => applyCode(area.current, text, code, setText)} />
        <p className="note">Select text, then click a color or style to apply it to just that text.</p>
      </section>
    </Workbench>
  );
}
