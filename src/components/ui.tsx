import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Help } from './Help';
import { t } from '../lib/i18n-core';

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const id = useId();
  return (
    <section className="panel" aria-labelledby={id}>
      <div className="opt-row">
        <h2 id={id} className="panel-title">
          // {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export type TabDef<T extends string> = { id: T; label: string; /** Shows a ● when the tab holds changes. */ dot?: boolean };

/** Tab strip; render the matching <TabPanel> below it. Arrow keys move between tabs. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (tt: T) => void;
  label: string;
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    onChange(tabs[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          className="tab"
          id={`${idPrefix}-tab-${tab.id}`}
          aria-selected={tab.id === value}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          tabIndex={tab.id === value ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') move(i + 1);
            else if (e.key === 'ArrowLeft') move(i - 1);
            else if (e.key === 'Home') move(0);
            else if (e.key === 'End') move(tabs.length - 1);
            else return;
            e.preventDefault();
          }}
        >
          {tab.label}
          {tab.dot && <span className="tab-dot" aria-label={t('(changed)')}> ●</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ idPrefix, id, children }: { idPrefix: string; id: string; children: ReactNode }) {
  return (
    <div className="tab-panel" role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`}>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  compact,
  labelledBy,
}: {
  label?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  compact?: boolean;
  labelledBy?: string;
}) {
  return (
    <div className={`seg${compact ? ' compact' : ''}`} role="group" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, labelledBy }: { checked: boolean; onChange: (v: boolean) => void; label?: string; labelledBy?: string }) {
  return (
    <span className="switch-hit">
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={checked}
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        onClick={() => onChange(!checked)}
      />
    </span>
  );
}

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const tt = document.createElement('textarea');
      tt.value = text;
      document.body.appendChild(tt);
      tt.select();
      document.execCommand('copy');
      tt.remove();
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1400);
  };
  return { copied, copy };
}

export function CopyButton({ text, label = t('copy'), small = true }: { text: string; label?: string; small?: boolean }) {
  const { copied, copy } = useCopy();
  return (
    <button type="button" className={`btn mono${small ? ' btn-sm' : ''}`} onClick={() => copy(text)} disabled={!text} aria-live="polite">
      {copied ? t('copied') : label}
    </button>
  );
}

/** A labelled, copyable monospace value. */
export function Output({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <span className="field-label" id={id}>
        {label}
      </span>
      <div className="out">
        <pre aria-labelledby={id} style={multiline ? undefined : { whiteSpace: 'pre', wordBreak: 'normal' }}>
          {value || ' '}
        </pre>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  help?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <FieldLabel id={id} label={label} help={help} />
      <input
        id={id}
        className="input mono"
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  autoFocus,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  autoFocus?: boolean;
  help?: string;
}) {
  const id = useId();
  return (
    <div className="field grow">
      <FieldLabel id={id} label={label} help={help} />
      <input
        id={id}
        className={`input${mono ? ' mono' : ''}`}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FieldLabel({ id, label, help }: { id: string; label: string; help?: string }) {
  if (!help) return <label htmlFor={id}>{label}</label>;
  return (
    <span style={{ display: 'flex', alignItems: 'center' }}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <Help label={label} text={help} />
    </span>
  );
}

export const num = (s: string, fallback = 0) => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : fallback;
};
