import { useMemo, useRef, useState } from 'react';
import { CopyButton, Panel, Segmented, Toggle } from '../../components/ui';
import { saveBlob } from '../../queue/download';
import { Workbench } from '../../components/Workbench';
import { Help } from '../../components/Help';

type Indent = '2' | '4' | 'tab' | 'min';

const sortDeep = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]),
    );
  return v;
};

/**
 * Offset of the first syntax error. Engines word (and sometimes omit) positions
 * differently, so this walks the grammar itself; it only runs after JSON.parse failed.
 */
function errorOffset(s: string): number {
  let i = 0;
  const ws = () => {
    while (i < s.length && ' \t\n\r'.includes(s[i])) i++;
  };
  const fail = (): never => {
    throw i;
  };
  const lit = (word: string) => {
    for (const ch of word) if (s[i++] !== ch) (i--, fail());
  };
  const str = () => {
    i++;
    while (i < s.length && s[i] !== '"') {
      if (s.charCodeAt(i) < 0x20) fail();
      if (s[i] === '\\') {
        i++;
        if (s[i] === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(s.slice(i + 1, i + 5))) fail();
          i += 4;
        } else if (!'"\\/bfnrt'.includes(s[i] ?? '')) fail();
      }
      i++;
    }
    if (s[i] !== '"') fail();
    i++;
  };
  const value = (): void => {
    ws();
    const ch = s[i];
    if (ch === '{') {
      i++;
      ws();
      if (s[i] === '}') return void i++;
      for (;;) {
        ws();
        if (s[i] !== '"') fail();
        str();
        ws();
        if (s[i] !== ':') fail();
        i++;
        value();
        ws();
        if (s[i] === ',') i++;
        else if (s[i] === '}') return void i++;
        else fail();
      }
    }
    if (ch === '[') {
      i++;
      ws();
      if (s[i] === ']') return void i++;
      for (;;) {
        value();
        ws();
        if (s[i] === ',') i++;
        else if (s[i] === ']') return void i++;
        else fail();
      }
    }
    if (ch === '"') return str();
    if (ch === 't') return lit('true');
    if (ch === 'f') return lit('false');
    if (ch === 'n') return lit('null');
    const m = s.slice(i).match(/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/);
    if (!m) fail();
    i += m![0].length;
  };
  try {
    value();
    ws();
    if (i < s.length) fail();
    return -1;
  } catch (at) {
    return Math.min(at as number, s.length);
  }
}

function locate(text: string) {
  const at = errorOffset(text);
  if (at < 0) return null;
  const before = text.slice(0, at);
  return { line: before.split('\n').length, col: at - before.lastIndexOf('\n') };
}

export default function JsonFormatter() {
  const [input, setInput] = useState('{"name":"unktilz","tools":["json formatter","map art"],"nested":{"ok":true,"count":3}}');
  const [indent, setIndent] = useState<Indent>('2');
  const [sort, setSort] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const result = useMemo(() => {
    if (!input.trim()) return { ok: true as const, out: '' };
    try {
      let v = JSON.parse(input);
      if (sort) v = sortDeep(v);
      const space = indent === 'min' ? undefined : indent === 'tab' ? '\t' : Number(indent);
      return { ok: true as const, out: JSON.stringify(v, null, space) };
    } catch (e) {
      const msg = (e as Error).message;
      return { ok: false as const, msg, at: locate(input) };
    }
  }, [input, indent, sort]);

  const jump = () => {
    if (result.ok || !result.at || !area.current) return;
    const lines = input.split('\n');
    const offset = lines.slice(0, result.at.line - 1).reduce((n, l) => n + l.length + 1, 0) + result.at.col - 1;
    area.current.focus();
    area.current.setSelectionRange(offset, offset + 1);
  };

  const status = (
    <div id="json-status" role="status">
      {result.ok ? (
        input.trim() && <span className="note accent mono">✓ valid JSON</span>
      ) : (
        <p className="error-text">
          {result.msg}
          {result.at && (
            <>
              {' '}
              <button type="button" className="btn btn-sm mono" onClick={jump}>
                go to line {result.at.line}:{result.at.col}
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );

  // Both boxes are as tall as the screen allows, so long JSON scrolls inside them instead of the page.
  const boxHeight = 'max(260px, calc(100dvh - 380px))';

  const output = (
    <Panel
      title="output"
      actions={
        result.ok && result.out ? (
          <div className="seg">
            <CopyButton text={result.out} />
            <button type="button" className="btn btn-sm mono" onClick={() => saveBlob(new Blob([result.out], { type: 'application/json' }), 'formatted.json')}>
              download
            </button>
          </div>
        ) : undefined
      }
    >
      {result.ok && result.out ? (
        <>
          <pre className="code" style={{ height: boxHeight, overflow: 'auto', whiteSpace: 'pre', wordBreak: 'normal' }}>
            {result.out}
          </pre>
          <p className="note mono">
            {result.out.length.toLocaleString('en-US')} chars · {input.length.toLocaleString('en-US')} in
          </p>
        </>
      ) : (
        <p className="note">{result.ok ? 'Paste JSON on the left.' : 'Fix the error on the left to see the output.'}</p>
      )}
    </Panel>
  );

  return (
    <>
      <section className="panel" aria-label="Options">
        <div className="inline" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="inline" style={{ alignItems: 'center' }}>
            <span className="opt-label" id="ind">
              Indent
            </span>
            <Segmented
              labelledBy="ind"
              value={indent}
              onChange={setIndent}
              compact
              options={[
                { value: '2', label: '2' },
                { value: '4', label: '4' },
                { value: 'tab', label: 'tab' },
                { value: 'min', label: 'minify' },
              ]}
            />
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="opt-label" id="sortk">
              Sort keys
            </span>
            <Help label="sort keys" text="Puts the keys of every object in alphabetical order, at every level. Handy for comparing two JSON files." />
            <Toggle labelledBy="sortk" checked={sort} onChange={setSort} />
          </span>
        </div>
        {status}
      </section>

      <Workbench preview={output}>
        <section className="panel" aria-label="Input">
          <div className="field">
            <label htmlFor="json-in">JSON</label>
            <textarea
              id="json-in"
              ref={area}
              className="textarea mono"
              style={{ height: boxHeight, resize: 'none' }}
              value={input}
              spellCheck={false}
              onChange={(e) => setInput(e.target.value)}
              aria-invalid={!result.ok}
              aria-describedby="json-status"
            />
          </div>
        </section>
      </Workbench>
    </>
  );
}
