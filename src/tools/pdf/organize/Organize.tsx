import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Panel, TextField } from '../../../components/ui';
import { computeValue } from '../../../lib/compute';
import { openPdf, baseName, closePdf } from '../../../lib/pdfjs';
import { useQueue } from '../../../queue/store';
import type { PageRef } from '../../../workers/tasks/pdf';
import { PageGrid } from '../pages/PageGrid';
import { PdfDrop } from '../pages/PdfDrop';
import { moveItems, newKey, pagesOf, pdfName, rotateItems, type GridItem } from '../pages/model';
import { useThumbs } from '../pages/thumbs';
import { plural, t, tn } from '../../../lib/i18n';

type Source = { file: File; doc: PDFDocumentProxy };

const A4: [number, number] = [595.28, 841.89];
/** A, B, C… for telling the PDFs apart when there are several. */
const letter = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');

export default function Organize() {
  const thumbs = useThumbs();
  const [sources, setSources] = useState<Source[]>([]);
  const [items, setItems] = useState<GridItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<GridItem[][]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const original = useRef<GridItem[]>([]);

  // The documents are closed when leaving the page.
  const docs = useRef<PDFDocumentProxy[]>([]);
  useEffect(() => () => docs.current.forEach((d) => void closePdf(d)), []);

  const add = async (files: File[]) => {
    setError('');
    setBusy(true);
    try {
      const added: Source[] = [];
      for (const file of files) {
        try {
          added.push({ file, doc: await openPdf(file) });
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
      if (!added.length) return;
      const start = sources.length;
      const all = [...sources, ...added];
      docs.current = all.map((s) => s.doc);
      thumbs.setDocs(docs.current);
      const pages = added.flatMap((s, k) => pagesOf(start + k, s.doc.numPages));
      setSources(all);
      if (!sources.length) {
        original.current = pages;
        setName(`${baseName(added[0].file.name)}-edited`);
        setItems(pages);
        setHistory([]);
      } else commit([...items, ...pages]);
    } finally {
      setBusy(false);
    }
  };

  /** A change that undo can take back. */
  const commit = (next: GridItem[]) => {
    setHistory((h) => [...h.slice(-49), items]);
    setItems(next);
    setSaved('');
  };
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory(history.slice(0, -1));
    setItems(last);
    setSaved('');
  };

  /** The picked pages, or the one whose button was pressed. */
  const target = (key?: string) => (key ? new Set([key]) : selected);
  const rotate = (by: number, key?: string) => commit(rotateItems(items, target(key), by));
  const remove = (key?: string) => {
    const gone = target(key);
    commit(items.filter((it) => !gone.has(it.key)));
    setSelected(new Set([...selected].filter((k) => !gone.has(k))));
  };
  const duplicate = (key?: string) => {
    const which = target(key);
    commit(items.flatMap((it) => (which.has(it.key) ? [it, { ...it, key: newKey() }] : [it])));
  };
  /** An empty page after the last picked one (or at the end), the size of the page before it. */
  const blank = () => {
    const last = items.reduce((n, it, i) => (selected.has(it.key) ? i : n), items.length - 1);
    const near = items[last];
    const tt = near && !near.blank ? thumbs.get(near.src, near.index) : undefined;
    const size: [number, number] = near?.blank ?? (tt ? (near.rotate % 180 ? [tt.h, tt.w] : [tt.w, tt.h]) : A4);
    const page: GridItem = { key: newKey(), src: -1, index: -1, rotate: 0, blank: size };
    commit([...items.slice(0, last + 1), page, ...items.slice(last + 1)]);
    setSelected(new Set([page.key]));
  };

  // Delete, Ctrl+Z and Ctrl+A work on the grid.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (!items.length || (e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (ctrl && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelected(new Set(items.map((it) => it.key)));
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
      e.preventDefault();
      remove();
    } else if (e.key === 'Escape') setSelected(new Set());
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const save = () => {
    if (!items.length) return;
    const file = pdfName(name, 'document');
    const pages: PageRef[] = items.map((it) => (it.blank ? { blank: it.blank } : { src: it.src, index: it.index, rotate: it.rotate }));
    const files = sources.map((s) => s.file);
    useQueue.getState().addTask({ slug: 'organize-pdf', name: 'Organize PDF', category: 'pdf', file }, (_signal, onProgress) =>
      computeValue('build-pdf', { sources: files, outputs: [{ name: file, pages }] }, onProgress),
    );
    setSaved(file);
  };

  if (!sources.length)
    return (
      <Panel title="pdf">
        <PdfDrop multiple onFiles={(f) => void add(f)} label={busy ? t('Opening…') : t('Drop a PDF here or click to choose one (several are put one after another)')} />
        {error && <p className="error-text">{error}</p>}
      </Panel>
    );

  const many = sources.length > 1;
  const n = selected.size;
  const iconBtn = (label: string, text: string, fn: () => void) => (
    <button type="button" className="pg-icon" aria-label={label} title={label} onClick={fn}>
      {text}
    </button>
  );
  return (
    <div className="pg-tool">
      <Panel
        title={
          many
            ? plural(items.length, ['{n} page from {pdfs} PDFs', '{n} pages from {pdfs} PDFs'], ['{n} stránka z {pdfs} PDF', '{n} stránky z {pdfs} PDF', '{n} stránek z {pdfs} PDF'], { pdfs: sources.length })
            : plural(items.length, ['{n} page', '{n} pages'], ['{n} stránka', '{n} stránky', '{n} stránek'])
        }
      >
        <div className="pg-bar" role="toolbar" aria-label={t('Page tools')}>
          <span className="note">{n ? t('{n} picked:', { n }) : t('Pick pages (Ctrl / Shift for more) or use the buttons on a page.')}</span>
          {n > 0 && (
            <>
              <button type="button" className="btn btn-sm" onClick={() => rotate(-90)}>
                {t('↺ turn left')}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => rotate(90)}>
                {t('↻ turn right')}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => duplicate()}>
                {t('duplicate')}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => remove()}>
                {t('delete')}
              </button>
            </>
          )}
          <span className="pg-bar-gap" />
          <button type="button" className="btn btn-sm" onClick={() => setSelected(n === items.length ? new Set() : new Set(items.map((it) => it.key)))}>
            {n === items.length ? t('pick none') : t('pick all')}
          </button>
          <button type="button" className="btn btn-sm" onClick={blank}>
            {t('+ blank page')}
          </button>
          <PdfDrop compact multiple onFiles={(f) => void add(f)} label={t('+ add PDF')} />
          <button type="button" className="btn btn-sm" disabled={!history.length} onClick={undo} title="Ctrl+Z">
            {t('undo')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!history.length}
            onClick={() => {
              commit(original.current.length ? original.current : items);
              setSelected(new Set());
            }}
            title={t('Back to the PDF as it was opened')}
          >
            {t('reset')}
          </button>
        </div>
        {items.length ? (
          <PageGrid
            items={items}
            thumbs={thumbs}
            selected={selected}
            onSelect={setSelected}
            onMove={(k, to) => commit(moveItems(items, k, to))}
            caption={(it, i) => (
              <>
                <b>{i + 1}</b>
                {it.blank ? <span className="note"> {t('blank')}</span> : many ? <span className="note"> {letter(it.src)}{it.index + 1}</span> : it.index !== i ? <span className="note"> {t('(was {n})', { n: it.index + 1 })}</span> : null}
                {it.rotate ? <span className="note"> · {it.rotate}°</span> : null}
              </>
            )}
            actions={(it) => (
              <>
                {iconBtn(t('Turn left'), '↺', () => rotate(-90, it.key))}
                {iconBtn(t('Turn right'), '↻', () => rotate(90, it.key))}
                {iconBtn(t('Duplicate'), '⧉', () => duplicate(it.key))}
                {iconBtn(t('Delete'), '×', () => remove(it.key))}
              </>
            )}
          />
        ) : (
          <p className="note">{t('No pages left. Undo, reset, or add a PDF.')}</p>
        )}
        {many && (
          <p className="note">
            {sources.map((s, i) => (
              <span key={i}>
                {i ? ' · ' : ''}
                <b>{letter(i)}</b> {s.file.name}
              </span>
            ))}
          </p>
        )}
        <p className="note">{t('Drag pages to move them (several picked pages move together). Delete removes the picked pages, Ctrl+Z undoes.')}</p>
      </Panel>

      <Panel title={t('save')}>
        <div className="inline pg-save">
          <TextField label={t('File name')} value={name} onChange={setName} />
          <button type="button" className="btn btn-primary" disabled={!items.length} onClick={save}>
            {t('Save PDF')}
          </button>
        </div>
        {saved && <p className="note">{tn('{file} is being made: it lands in the queue on the left.', { file: saved })}</p>}
        {error && <p className="error-text">{error}</p>}
      </Panel>
    </div>
  );
}
