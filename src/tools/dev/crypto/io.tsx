// Input (text or a file) and output (text, or hex / Base64 for binary data) shared by the tabs.
import { useId, useMemo, useRef, useState } from 'react';
import { CopyButton, Segmented } from '../../../components/ui';
import { formatBytes, saveBlob } from '../../../queue/download';
import { filesFromDrop, isFileDrag } from '../../../queue/dragFiles';
import { t } from '../../../lib/i18n-core';
import { toB64, toHex, utf8OrNull } from './bytes';

export type Source = { kind: 'text' } | { kind: 'file'; file: File };

/** At most this much is shown on the page; the download has everything. */
const SHOW = 200_000;

export function DataInput({
  label,
  text,
  onText,
  source,
  onSource,
  placeholder,
  rows = 6,
}: {
  label: string;
  text: string;
  onText: (s: string) => void;
  source: Source;
  onSource: (s: Source) => void;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = (f: File | undefined) => f && onSource({ kind: 'file', file: f });
  return (
    <div
      className={`field cr-input${over ? ' over' : ''}`}
      onDragEnter={(e) => isFileDrag(e) && e.preventDefault()}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setOver(false);
        void filesFromDrop(e).then((f) => pick(f[0]), () => {});
      }}
    >
      <div className="cr-input-head">
        <label htmlFor={id}>{label}</label>
        <span className="cr-input-actions">
          {source.kind === 'file' ? (
            <button type="button" className="btn btn-sm mono" onClick={() => onSource({ kind: 'text' })}>
              {t('type text instead')}
            </button>
          ) : (
            <button type="button" className="btn btn-sm mono" onClick={() => picker.current?.click()}>
              {t('choose a file')}
            </button>
          )}
          <input
            ref={picker}
            type="file"
            hidden
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </span>
      </div>
      {source.kind === 'file' ? (
        <div className="cr-file" id={id}>
          <span className="mono">{source.file.name}</span>
          <span className="muted mono">{formatBytes(source.file.size)}</span>
          <button type="button" className="btn btn-sm" onClick={() => picker.current?.click()}>
            {t('another file')}
          </button>
        </div>
      ) : (
        <textarea
          id={id}
          className="textarea mono"
          rows={rows}
          value={text}
          spellCheck={false}
          placeholder={placeholder ?? t('Type or paste text, or drop a file here')}
          onChange={(e) => onText(e.target.value)}
        />
      )}
    </div>
  );
}

type View = 'text' | 'hex' | 'base64';

/** Shows bytes as text when they are text, otherwise as hex or Base64; always downloadable. */
export function BytesOutput({ label, bytes, fileName, note }: { label: string; bytes: Uint8Array; fileName: string; note?: string }) {
  const id = useId();
  const asText = useMemo(() => utf8OrNull(bytes), [bytes]);
  const [pick, setPick] = useState<View>('text');
  const view: View = pick === 'text' && asText === null ? 'hex' : pick;
  const shown = useMemo(() => {
    const part = bytes.length > SHOW ? bytes.subarray(0, SHOW) : bytes;
    if (view === 'text') return asText!.length > SHOW ? asText!.slice(0, SHOW) : asText!;
    return view === 'hex' ? toHex(part) : toB64(part);
  }, [bytes, view, asText]);
  const full = useMemo(() => (bytes.length > SHOW ? null : view === 'text' ? asText! : shown), [bytes, view, asText, shown]);
  return (
    <div className="field">
      <div className="cr-input-head">
        <span className="field-label" id={id}>
          {label} <span className="muted mono">· {formatBytes(bytes.length)}</span>
        </span>
        <span className="cr-input-actions">
          <Segmented
            compact
            label={t('Show as')}
            value={view}
            onChange={setPick}
            options={[...(asText !== null ? [{ value: 'text' as const, label: t('text') }] : []), { value: 'hex', label: 'hex' }, { value: 'base64', label: 'Base64' }]}
          />
          <button type="button" className="btn btn-sm mono" onClick={() => saveBlob(new Blob([bytes as BlobPart]), fileName)}>
            {t('download')}
          </button>
        </span>
      </div>
      {asText === null && view !== 'text' && <p className="note">{t('This isn’t readable text (binary data), so it’s shown as {view}.', { view: view === 'hex' ? 'hex' : 'Base64' })}</p>}
      {note && <p className="note">{note}</p>}
      <div className="out">
        <pre aria-labelledby={id} className="cr-pre">
          {shown || ' '}
          {bytes.length > SHOW && '…'}
        </pre>
        {full !== null && <CopyButton text={full} />}
      </div>
      {bytes.length > SHOW && <p className="note">{t('Only the start is shown; “download” saves all of it.')}</p>}
    </div>
  );
}

/** A file's bytes, or the text as UTF-8. */
export async function readSource(source: Source, text: string): Promise<Uint8Array> {
  return source.kind === 'file' ? new Uint8Array(await source.file.arrayBuffer()) : new TextEncoder().encode(text);
}
