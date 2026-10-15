import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Help } from './Help';
import { savedWhen, useSaved, type SavedItem } from '../lib/saved';

/** A short-lived "Loaded X · undo" line. */
export function UndoBar({ text, onUndo, onClose }: { text: string; onUndo: () => void; onClose: () => void }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const t = setTimeout(() => close.current(), 15000);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <div className="undo-bar" role="status">
      <span>{text}</span>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => {
          onUndo();
          onClose();
        }}
      >
        undo
      </button>
      <button type="button" className="undo-x" aria-label="Dismiss" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

/**
 * The same "saved" list in every tool: save what you have under a name, load it back (with undo),
 * rename, update with the current state, delete. Stored by src/lib/saved.ts.
 */
export function SavedPanel<T>({
  slug,
  title = 'saved',
  help,
  suggestName,
  getData,
  onLoad,
  describe,
  saveLabel = 'save',
  emptyText = 'Nothing saved yet.',
  loadLabel = 'Load',
  undoable = true,
}: {
  slug: string;
  title?: string;
  help?: string;
  /** Name put in the box when it's empty. */
  suggestName: () => string;
  /** What to save right now; null disables saving (e.g. nothing selected). */
  getData: () => T | null;
  onLoad: (data: T, item: SavedItem<T>) => void;
  describe?: (item: SavedItem<T>) => ReactNode;
  saveLabel?: string;
  emptyText?: string;
  loadLabel?: string;
  /** Offer "undo" after loading (off where loading doesn't replace anything). */
  undoable?: boolean;
}) {
  const { items, save, rename, remove } = useSaved<T>(slug);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [undo, setUndo] = useState<{ text: string; prev: T } | null>(null);
  const canSave = getData() !== null;

  const doSave = async () => {
    const data = getData();
    if (data === null) return;
    const n = name.trim() || suggestName().trim() || 'Untitled';
    const existing = items.find((i) => i.name === n);
    if (existing && !window.confirm(`Replace the saved “${n}”?`)) return;
    await save(n, data, existing?.id);
    setName('');
  };
  const load = (item: SavedItem<T>) => {
    const prev = undoable ? getData() : null;
    onLoad(item.data, item);
    if (prev !== null) setUndo({ text: `${loadLabel}ed “${item.name}”`, prev });
  };

  return (
    <section className="panel saved-panel" aria-label={title}>
      <div className="opt-row">
        <h2 className="panel-title">
          // {title} {items.length > 0 && <span className="muted">({items.length})</span>}
        </h2>
        {help && <Help label={title} text={help} />}
      </div>
      {undo && <UndoBar text={undo.text} onUndo={() => onLoad(undo.prev, { id: '', name: '', data: undo.prev, savedAt: 0 })} onClose={() => setUndo(null)} />}
      <div className="inline">
        <input
          className="input"
          aria-label="Name to save under"
          value={name}
          placeholder={canSave ? suggestName() || 'name' : 'nothing to save yet'}
          disabled={!canSave}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSave()}
        />
        <button type="button" className="btn" disabled={!canSave} onClick={doSave}>
          {saveLabel}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="note">{emptyText}</p>
      ) : (
        <ul className="saved-list">
          {items.map((item) => (
            <li key={item.id}>
              {editing?.id === item.id ? (
                <input
                  className="input"
                  aria-label="New name"
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editing.name.trim()) {
                      rename(item.id, editing.name.trim());
                      setEditing(null);
                    }
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  onBlur={() => {
                    if (editing.name.trim()) rename(item.id, editing.name.trim());
                    setEditing(null);
                  }}
                />
              ) : (
                <button type="button" className="saved-name" title={`${loadLabel} “${item.name}”`} onClick={() => load(item)}>
                  <span>{item.name}</span>
                  {describe && <span className="saved-desc">{describe(item)}</span>}
                </button>
              )}
              <span className="saved-when mono">{savedWhen(item.savedAt)}</span>
              <span className="saved-actions">
                <button type="button" title="Rename" aria-label={`Rename ${item.name}`} onClick={() => setEditing({ id: item.id, name: item.name })}>
                  ✎
                </button>
                <button
                  type="button"
                  title="Replace with what you have now"
                  aria-label={`Update ${item.name} with the current state`}
                  disabled={!canSave}
                  onClick={() => {
                    const data = getData();
                    if (data !== null && window.confirm(`Replace “${item.name}” with what you have now?`)) save(item.name, data, item.id);
                  }}
                >
                  ⤓
                </button>
                <button type="button" title="Delete" aria-label={`Delete ${item.name}`} onClick={() => window.confirm(`Delete “${item.name}”?`) && remove(item.id)}>
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
