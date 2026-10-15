import { useMemo, useRef, useState } from 'react';
import { SavedPanel } from '../../components/SavedPanel';
import { useAutosave } from '../../lib/saved';
import { plainText } from '../../lib/mc/minimessage';
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
  type Draft = { dir: Dir; input: string };
  const draft = useMemo<Draft>(() => ({ dir, input }), [dir, input]);
  const restore = (d: Draft) => {
    setDir(d.dir);
    setInput(d.input);
  };
  useAutosave('color-codes', draft, restore);
  const visible = (d: Draft) => (d.dir === 'legacy' ? d.input.replace(/[&§]#[0-9a-f]{6}|[&§][0-9a-fk-orx]/gi, '') : plainText(d.input));

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
      <SavedPanel<Draft>
        slug="color-codes"
        title="my texts"
        help="Keep formatted texts (chat messages, signs, scoreboard titles…) for later. Saved in this browser."
        suggestName={() => visible(draft).split('\n')[0].trim().slice(0, 40)}
        getData={() => draft}
        onLoad={restore}
        describe={(i) => `${i.data.dir === 'legacy' ? '& codes' : 'MiniMessage'} · ${visible(i.data).replace(/\n/g, ' ')}`}
        emptyText="No saved texts yet."
      />
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
