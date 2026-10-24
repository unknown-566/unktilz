import { useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import { Segmented, Toggle } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { t } from '../../../lib/i18n-core';
import { useAutosave } from '../../../lib/saved';
import { BytesOutput, DataInput, type Source } from './io';
import { METHODS, getMethod, newStep, runChain, type OptDef, type Step } from './methods';
import { caesar } from './ciphers';
import { detect, type Guess } from './detect';
import { base64Encode } from './codecs';
import { utf8OrNull } from './bytes';

type Saved = { steps: Step[]; decode: boolean; text: string };

const GROUPS = [
  { id: 'encoding', label: t('Encodings') },
  { id: 'cipher', label: t('Classic ciphers (not secure)') },
] as const;

export default function ChainTab({ start, onGuess, incoming }: { start?: string; onGuess: (g: Guess, text: string) => void; incoming?: File }) {
  const [steps, setSteps] = useState<Step[]>(() => [newStep(start && getMethod(start) ? start : 'base64')]);
  const [decode, setDecode] = useState(false);
  const [text, setText] = useState('');
  const [source, setSource] = useState<Source>({ kind: 'text' });
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  useAutosave<Saved>(
    'encode-encrypt',
    { steps, decode, text },
    (v) => {
      // Opened from the old Base64 address: keep its Base64 step, take only the text.
      if (!start) {
        setSteps(v.steps?.filter((s) => getMethod(s.method)).length ? v.steps.filter((s) => getMethod(s.method)) : [newStep('base64')]);
        setDecode(!!v.decode);
      }
      setText(v.text ?? '');
    },
  );

  useEffect(() => {
    if (source.kind !== 'file') return setFileBytes(null);
    let alive = true;
    void source.file.arrayBuffer().then((b) => alive && setFileBytes(new Uint8Array(b)));
    return () => {
      alive = false;
    };
  }, [source]);

  useEffect(() => {
    if (incoming) setSource({ kind: 'file', file: incoming });
  }, [incoming]);

  const lazyText = useDeferredValue(text);
  const input = useMemo(() => (source.kind === 'file' ? fileBytes : new TextEncoder().encode(lazyText)), [source, fileBytes, lazyText]);
  const result = useMemo(() => (input && input.length ? runChain(input, steps, decode) : null), [input, steps, decode]);
  const guesses = useMemo(() => (decode && source.kind === 'text' ? detect(lazyText) : []), [decode, source, lazyText]);

  const setStep = (i: number, s: Step) => setSteps(steps.map((x, j) => (j === i ? s : x)));
  const move = (i: number, d: number) => {
    const next = steps.slice();
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setSteps(next);
  };
  const outText = result && !result.error ? new TextDecoder().decode(result.out) : '';
  const single = steps.length === 1 ? steps[0].method : '';

  return (
    <div className="cr-tab">
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <Segmented
          label={t('Direction')}
          value={decode ? 'decode' : 'encode'}
          onChange={(v) => setDecode(v === 'decode')}
          options={[
            { value: 'encode', label: t('encode / encrypt') },
            { value: 'decode', label: t('decode / decrypt') },
          ]}
        />
        {result && !result.error && source.kind === 'text' && (
          <button
            type="button"
            className="btn btn-sm mono"
            onClick={() => {
              setText(outText);
              setDecode(!decode);
            }}
          >
            {t('⇄ result to input')}
          </button>
        )}
      </div>

      <DataInput label={decode ? t('Encoded text') : t('Text')} text={text} onText={setText} source={source} onSource={setSource} />

      {guesses.length > 0 && (
        <div className="cr-guesses" aria-label={t('What this looks like')}>
          <span className="muted mono">{t('looks like:')}</span>
          {guesses.map((g, i) =>
            g.kind === 'step' ? (
              <button
                key={i}
                type="button"
                className="chip"
                aria-pressed={single === g.method}
                title={g.preview ? t('Decodes to: {text}', { text: g.preview }) : undefined}
                onClick={() => setSteps([newStep(g.method)])}
              >
                {g.label}
                {g.preview && <span className="cr-guess-preview"> → {g.preview}</span>}
              </button>
            ) : g.kind === 'hash' || g.kind === 'info' ? (
              <span key={i} className="cr-guess-note">
                {g.label}
                {g.kind === 'info' && g.preview && <span className="mono"> · {g.preview}</span>}
              </span>
            ) : (
              <button key={i} type="button" className="chip" onClick={() => onGuess(g, text)}>
                {g.label} →
              </button>
            ),
          )}
        </div>
      )}

      <ol className="cr-steps" aria-label={t('Steps')}>
        {steps.map((s, i) => (
          <StepRow
            key={i}
            n={i + 1}
            step={s}
            decode={decode}
            error={result?.error?.step === i ? result.error.message : undefined}
            onChange={(next) => setStep(i, next)}
            onUp={i > 0 ? () => move(i, -1) : undefined}
            onDown={i < steps.length - 1 ? () => move(i, 1) : undefined}
            onRemove={steps.length > 1 ? () => setSteps(steps.filter((_, j) => j !== i)) : undefined}
          />
        ))}
      </ol>
      <div className="inline">
        <button type="button" className="btn btn-sm mono" onClick={() => setSteps([...steps, newStep('base64')])}>
          {t('+ add a step')}
        </button>
        {steps.length > 1 && (
          <p className="note">{decode ? t('Decoding runs the steps from the last one up, each one undone.') : t('Each step works on what the step above made.')}</p>
        )}
      </div>

      {result && !result.error && (
        <BytesOutput
          label={t('Result')}
          bytes={result.out}
          fileName={outName(source, decode, result.out)}
        />
      )}
      {result && !result.error && source.kind === 'file' && !decode && single === 'base64' && fileBytes && (
        <DataUrl file={source.file} bytes={fileBytes} url={!!steps[0].opts.url} />
      )}
      {decode && single === 'caesar' && source.kind === 'text' && lazyText.trim() && <EveryShift text={lazyText} onPick={(shift) => setStep(0, { method: 'caesar', opts: { shift } })} />}
    </div>
  );
}

function outName(source: Source, decode: boolean, out: Uint8Array) {
  const ext = utf8OrNull(out) !== null ? '.txt' : '.bin';
  if (source.kind === 'file') return `${source.file.name}.${decode ? 'decoded' : 'encoded'}${ext}`;
  return `${decode ? 'decoded' : 'encoded'}${ext}`;
}

function DataUrl({ file, bytes, url }: { file: File; bytes: Uint8Array; url: boolean }) {
  const value = useMemo(() => (bytes.length > 150_000 ? '' : `data:${file.type || 'application/octet-stream'};base64,${base64Encode(bytes, url)}`), [file, bytes, url]);
  if (!value) return <p className="note">{t('A data: URL is offered for files up to 150 kB.')}</p>;
  return <BytesOutput label={t('Data URL')} bytes={new TextEncoder().encode(value)} fileName={`${file.name}.dataurl.txt`} />;
}

function EveryShift({ text, onPick }: { text: string; onPick: (n: number) => void }) {
  const sample = Array.from(text).slice(0, 90).join('');
  return (
    <div className="field">
      <span className="field-label">{t('Every shift')}</span>
      <p className="note">{t('Caesar has only 25 keys: find the line that reads well and click it.')}</p>
      <ul className="cr-shifts">
        {Array.from({ length: 25 }, (_, i) => i + 1).map((n) => (
          <li key={n}>
            <button type="button" onClick={() => onPick(n)}>
              <span className="muted">{String(n).padStart(2, ' ')}</span> {caesar(sample, -n)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepRow({
  n,
  step,
  decode,
  error,
  onChange,
  onUp,
  onDown,
  onRemove,
}: {
  n: number;
  step: Step;
  decode: boolean;
  error?: string;
  onChange: (s: Step) => void;
  onUp?: () => void;
  onDown?: () => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const m = getMethod(step.method)!;
  const set = (key: string, v: string | number | boolean) => onChange({ ...step, opts: { ...step.opts, [key]: v } });
  return (
    <li className={`cr-step${error ? ' bad' : ''}`}>
      <div className="cr-step-head">
        <span className="cr-step-n mono">{n}</span>
        <select id={id} className="select" aria-label={t('Method of step {n}', { n })} value={step.method} onChange={(e) => onChange(newStep(e.target.value))}>
          {GROUPS.map((g) => (
            <optgroup key={g.id} label={g.label}>
              {METHODS.filter((x) => x.group === g.id).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <Help label={m.name} text={m.help} />
        {m.same && <span className="muted mono cr-same">{t('same both ways')}</span>}
        <span className="cr-step-tools">
          <button type="button" className="icon-btn" aria-label={t('Move step {n} up', { n })} disabled={!onUp} onClick={onUp}>
            ↑
          </button>
          <button type="button" className="icon-btn" aria-label={t('Move step {n} down', { n })} disabled={!onDown} onClick={onDown}>
            ↓
          </button>
          <button type="button" className="icon-btn" aria-label={t('Remove step {n}', { n })} disabled={!onRemove} onClick={onRemove}>
            ×
          </button>
        </span>
      </div>
      {m.opts && m.opts.some((o) => !(o.type === 'toggle' && o.only === 'encode' && decode)) && (
        <div className="cr-step-opts">
          {m.opts.map((o) => (o.type === 'toggle' && o.only === 'encode' && decode ? null : <OptField key={o.key} def={o} value={step.opts[o.key] ?? o.default} onChange={(v) => set(o.key, v)} />))}
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function OptField({ def, value, onChange }: { def: OptDef; value: string | number | boolean; onChange: (v: string | number | boolean) => void }) {
  const id = useId();
  const label = (
    <span className="cr-opt-label">
      <label htmlFor={id} id={`${id}-l`}>
        {def.label}
      </label>
      {def.help && <Help label={def.label} text={def.help} />}
    </span>
  );
  if (def.type === 'toggle')
    return (
      <span className="cr-opt cr-opt-toggle">
        <span className="cr-opt-label">
          <span id={`${id}-l`}>{def.label}</span>
          {def.help && <Help label={def.label} text={def.help} />}
        </span>
        <Toggle labelledBy={`${id}-l`} checked={!!value} onChange={onChange} />
      </span>
    );
  if (def.type === 'select')
    return (
      <span className="cr-opt">
        {label}
        <select id={id} className="select" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {def.choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </span>
    );
  if (def.type === 'number')
    return (
      <span className="cr-opt">
        {label}
        <input
          id={id}
          className="input mono cr-num"
          type="number"
          value={String(value)}
          min={def.min}
          max={def.max}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        />
      </span>
    );
  return (
    <span className="cr-opt grow">
      {label}
      <input id={id} className="input mono" value={String(value)} placeholder={def.placeholder} spellCheck={false} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}
