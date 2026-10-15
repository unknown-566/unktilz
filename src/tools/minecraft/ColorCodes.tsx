import { useRef, useState } from 'react';
import { Output, Panel, Segmented, useCopy } from '../../components/ui';
import { MC_COLORS, MC_FORMATS, McText, legacyToMiniMessage, miniMessageToLegacy } from '../../lib/mc/text';
import { CodePalette, applyCode } from './CodePalette';
import { Workbench } from '../../components/Workbench';

type Dir = 'legacy' | 'mm';

function CopyCell({ text }: { text: string }) {
  const { copied, copy } = useCopy();
  return (
    <button type="button" className="btn btn-sm mono" onClick={() => copy(text)} aria-label={`Copy ${text}`} style={{ minWidth: 96 }}>
      {copied ? 'copied' : text}
    </button>
  );
}

export default function ColorCodes() {
  const [dir, setDir] = useState<Dir>('legacy');
  const [input, setInput] = useState('&6&lGold bold &r&7then gray &#ff66aahex pink');
  const area = useRef<HTMLTextAreaElement>(null);

  const legacy = dir === 'legacy' ? input : miniMessageToLegacy(input);
  const output = dir === 'legacy' ? legacyToMiniMessage(input) : legacy;

  const flip = (d: Dir) => {
    if (d === dir) return;
    setInput(output);
    setDir(d);
  };

  const preview = (
    <Panel title="preview">
      <div className="mc-preview">
        <McText text={legacy} />
      </div>
    </Panel>
  );

  const result = (
    <Panel title="result">
      <Output label={dir === 'legacy' ? 'MiniMessage' : '& codes'} value={output} multiline />
    </Panel>
  );

  return (
    <>
      <Workbench preview={preview} output={result}>
      <section className="panel" aria-label="Converter">
        <div className="opt-row">
          <span className="opt-label" id="dir">
            Convert
          </span>
          <Segmented
            labelledBy="dir"
            value={dir}
            onChange={flip}
            options={[
              { value: 'legacy', label: '& codes → MiniMessage' },
              { value: 'mm', label: 'MiniMessage → & codes' },
            ]}
          />
        </div>
        <div className="field">
          <label htmlFor="cc-in">{dir === 'legacy' ? 'Text with & or § codes' : 'MiniMessage'}</label>
          <textarea id="cc-in" ref={area} className="textarea mono" style={{ minHeight: 96 }} value={input} spellCheck={false} onChange={(e) => setInput(e.target.value)} />
        </div>
        {dir === 'legacy' && <CodePalette onInsert={(c) => applyCode(area.current, input, c, setInput)} />}
      </section>
      </Workbench>

      <Panel title="colors">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">color</th>
                <th scope="col">code</th>
                <th scope="col">section</th>
                <th scope="col">minimessage</th>
                <th scope="col">hex</th>
              </tr>
            </thead>
            <tbody>
              {MC_COLORS.map((c) => (
                <tr key={c.code}>
                  <td>
                    <span className="swatch" style={{ background: c.hex, marginRight: 10 }} />
                    {c.label}
                  </td>
                  <td>
                    <CopyCell text={`&${c.code}`} />
                  </td>
                  <td>
                    <CopyCell text={`§${c.code}`} />
                  </td>
                  <td>
                    <CopyCell text={`<${c.name}>`} />
                  </td>
                  <td className="mono muted">{c.hex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="formats">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">format</th>
                <th scope="col">code</th>
                <th scope="col">section</th>
                <th scope="col">minimessage</th>
              </tr>
            </thead>
            <tbody>
              {[...MC_FORMATS, { code: 'r', name: 'reset', label: 'Reset', key: 'reset' }].map((f) => (
                <tr key={f.code}>
                  <td>{f.label}</td>
                  <td>
                    <CopyCell text={`&${f.code}`} />
                  </td>
                  <td>
                    <CopyCell text={`§${f.code}`} />
                  </td>
                  <td>
                    <CopyCell text={`<${f.name}>`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">Hex colors (1.16+): &amp;#RRGGBB in most plugins, &lt;#RRGGBB&gt; in MiniMessage. In legacy text a color code also clears bold, italic and the rest.</p>
      </Panel>
    </>
  );
}
