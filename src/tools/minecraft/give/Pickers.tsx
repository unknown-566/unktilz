import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

export type Option = { id: string; name: string };

/** Best matches first: exact id/name, then starts-with, then contains. */
function search(options: Option[], query: string, limit: number) {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return options.slice(0, limit);
  const qu = q.replace(/ /g, '_');
  const scored: [number, Option][] = [];
  for (const o of options) {
    const n = o.name.toLowerCase();
    const id = o.id;
    let s = -1;
    if (id === qu || n === q) s = 0;
    else if (id.startsWith(qu) || n.startsWith(q)) s = 1;
    else if (n.split(' ').some((w) => w.startsWith(q))) s = 2;
    else if (id.includes(qu) || n.includes(q)) s = 3;
    if (s >= 0) scored.push([s * 1000 + n.length, o]);
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map((x) => x[1]);
}

/**
 * Searchable list: type part of a name or id, pick with the mouse or arrows + Enter.
 * With `allowCustom`, anything typed can be used as an id (modded or brand-new items).
 */
export function Combo({
  label,
  options,
  value,
  onPick,
  placeholder,
  allowCustom,
  clearOnPick,
}: {
  label: string;
  options: Option[];
  value?: string;
  onPick: (id: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  clearOnPick?: boolean;
}) {
  const current = value ? options.find((o) => o.id === value) : undefined;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => search(options, query, 40), [options, query]);
  const custom = allowCustom && query.trim() && !matches.some((m) => m.id === query.trim().toLowerCase()) ? query.trim().toLowerCase().replace(/\s+/g, '_') : '';
  const rows: Option[] = custom ? [...matches, { id: custom, name: `Use “${custom}” as the id` }] : matches;

  const pick = (o: Option) => {
    onPick(o.id);
    setQuery('');
    setOpen(false);
    if (!clearOnPick) input.current?.blur();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setHi((h) => Math.min(rows.length - 1, h + 1));
    else if (e.key === 'ArrowUp') setHi((h) => Math.max(0, h - 1));
    else if (e.key === 'Enter' && rows[hi]) pick(rows[hi]);
    else if (e.key === 'Escape') setOpen(false);
    else return;
    e.preventDefault();
  };

  return (
    <div className="combo">
      <input
        ref={input}
        className="input"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        value={open ? query : current ? `${current.name}` : value ?? ''}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setHi(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setHi(0);
          setOpen(true);
        }}
        onKeyDown={key}
      />
      {!open && current && <span className="combo-id mono">{current.id}</span>}
      {open && rows.length > 0 && (
        <ul className="combo-list" id={listId} role="listbox">
          {rows.map((o, i) => (
            <li key={o.id + i} role="option" aria-selected={i === hi} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHi(i)} onClick={() => pick(o)}>
              <span>{o.name}</span>
              <span className="mono muted">{o.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Several ids from a list, shown as removable chips. */
export function MultiPick({ label, options, values, onChange }: { label: string; options: Option[]; values: string[]; onChange: (v: string[]) => void }) {
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <Combo label={label} options={options} onPick={(id) => !values.includes(id) && onChange([...values, id])} placeholder="search blocks…" allowCustom clearOnPick />
      {values.length > 0 && (
        <div className="chips-row">
          {values.map((v) => (
            <span key={v} className="pick-chip">
              {byId.get(v)?.name ?? v}
              <button type="button" aria-label={`Remove ${byId.get(v)?.name ?? v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
