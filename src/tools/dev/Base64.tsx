import { useMemo, useRef, useState } from 'react';
import { Output, Panel, Segmented, Toggle } from '../../components/ui';
import { formatBytes, saveBlob } from '../../queue/download';
import { Help } from '../../components/Help';

type Mode = 'encode' | 'decode';

function bytesToB64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function b64ToBytes(s: string) {
  let clean = s.replace(/^data:[^,]*,/, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (clean.length % 4) clean += '='.repeat(4 - (clean.length % 4));
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const urlSafe = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export default function Base64() {
  const [mode, setMode] = useState<Mode>('encode');
  const [input, setInput] = useState('');
  const [safe, setSafe] = useState(false);
  const [file, setFile] = useState<{ name: string; type: string; b64: string; size: number } | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const result = useMemo(() => {
    if (!input) return { out: '' };
    try {
      if (mode === 'encode') {
        const b = bytesToB64(new TextEncoder().encode(input));
        return { out: safe ? urlSafe(b) : b };
      }
      const bytes = b64ToBytes(input);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return { out: text, bytes };
    } catch (e) {
      if (mode === 'decode' && e instanceof TypeError) {
        // Valid Base64, but not text: offer the bytes as a file instead.
        try {
          return { out: '', bytes: b64ToBytes(input), binary: true };
        } catch {
          /* fall through */
        }
      }
      return { out: '', error: 'That isn’t valid Base64.' };
    }
  }, [input, mode, safe]);

  const encodeFile = async (f: File | undefined) => {
    if (!f) return;
    const b = bytesToB64(new Uint8Array(await f.arrayBuffer()));
    setFile({ name: f.name, type: f.type || 'application/octet-stream', b64: b, size: f.size });
  };

  return (
    <>
      <section className="panel" aria-label="Text">
        <div className="inline" style={{ justifyContent: 'space-between' }}>
          <Segmented
            label="Mode"
            value={mode}
            onChange={(m) => {
              if (m !== mode && result.out) setInput(result.out);
              setMode(m);
            }}
            options={[
              { value: 'encode', label: 'encode' },
              { value: 'decode', label: 'decode' },
            ]}
          />
          {mode === 'encode' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span id="safe" className="opt-label">
                URL-safe
              </span>
              <Help label="URL-safe" text="Uses - and _ instead of + and /, and drops the = padding, so the result can go straight into URLs and file names." />
              <Toggle labelledBy="safe" checked={safe} onChange={setSafe} />
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="b64-in">{mode === 'encode' ? 'Text' : 'Base64'}</label>
          <textarea id="b64-in" className="textarea mono" value={input} spellCheck={false} onChange={(e) => setInput(e.target.value)} />
        </div>
        {result.error && (
          <p className="error-text" role="alert">
            {result.error}
          </p>
        )}
        {result.out && <Output label={mode === 'encode' ? 'Base64' : 'Text'} value={result.out} multiline />}
        {result.binary && result.bytes && (
          <div className="inline">
            <p className="note">Decoded {formatBytes(result.bytes.length)} of binary data.</p>
            <button type="button" className="btn btn-sm" onClick={() => saveBlob(new Blob([result.bytes as BlobPart]), 'decoded.bin')}>
              download bytes
            </button>
          </div>
        )}
      </section>

      <Panel title="file to base64">
        <div className="inline">
          <button type="button" className="btn" onClick={() => picker.current?.click()}>
            Choose a file
          </button>
          {file && (
            <span className="mono muted" style={{ fontSize: 13 }}>
              {file.name} · {formatBytes(file.size)}
            </span>
          )}
          <input ref={picker} type="file" hidden onChange={(e) => encodeFile(e.target.files?.[0])} />
        </div>
        {file && (
          <>
            <Output label="Base64" value={file.b64.length > 200_000 ? `${file.b64.slice(0, 200_000)}…` : file.b64} multiline />
            <Output label="Data URL" value={`data:${file.type};base64,${file.b64.slice(0, 200_000)}${file.b64.length > 200_000 ? '…' : ''}`} multiline />
            {file.b64.length > 200_000 && (
              <button type="button" className="btn btn-sm" onClick={() => saveBlob(new Blob([file.b64], { type: 'text/plain' }), `${file.name}.b64.txt`)}>
                download full Base64 ({formatBytes(file.b64.length)})
              </button>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
