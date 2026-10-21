import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Panel } from '../../../components/ui';
import { computeValue } from '../../../lib/compute';
import { baseName, closePdf, openPdf } from '../../../lib/pdfjs';
import { useQueue } from '../../../queue/store';
import { PageGrid } from '../pages/PageGrid';
import { PdfDrop } from '../pages/PdfDrop';
import { cutsEvery, pagesOf, partsFromCuts, pdfName, rangeLabel, type GridItem } from '../pages/model';
import { useThumbs } from '../pages/thumbs';
import { plural, t, tc, tn } from '../../../lib/i18n';

/** Each part's colour (frames and the list), repeating after these. */
const TONES = ['#b6f24a', '#4ac7f2', '#f2a54a', '#c74af2', '#f24a7a', '#4af2b0', '#f2e04a', '#7a8cf2'];

export default function Split() {
  const thumbs = useThumbs();
  const [source, setSource] = useState<{ file: File; doc: PDFDocumentProxy } | null>(null);
  const [items, setItems] = useState<GridItem[]>([]);
  const [cuts, setCuts] = useState<Set<number>>(new Set());
  const [names, setNames] = useState<Record<number, string>>({});
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [every, setEvery] = useState(2);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const doc = useRef<PDFDocumentProxy | null>(null);
  useEffect(() => () => void closePdf(doc.current), []);

  const open = async ([file]: File[]) => {
    setError('');
    try {
      const d = await openPdf(file);
      void closePdf(doc.current);
      doc.current = d;
      thumbs.setDocs([d]);
      setSource({ file, doc: d });
      setItems(pagesOf(0, d.numPages));
      setCuts(new Set());
      setNames({});
      setSkip(new Set());
      setSelected(new Set());
      setSaved('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!source)
    return (
      <Panel title="pdf">
        <PdfDrop onFiles={(f) => void open(f)} label={t('Drop a PDF here or click to choose it')} />
        {error && <p className="error-text">{error}</p>}
      </Panel>
    );

  const count = items.length;
  const base = baseName(source.file.name);
  const parts = partsFromCuts(count, cuts);
  const partOf = new Map<number, number>();
  parts.forEach((pages, k) => pages.forEach((i) => partOf.set(i, k)));
  const tone = (k: number) => TONES[k % TONES.length];
  const nameOf = (k: number) => names[k] ?? `${base}-part-${k + 1}`;
  const setCutsFresh = (next: Set<number>) => {
    setCuts(next);
    // Names and skipped parts belong to the parts as they were.
    setNames({});
    setSkip(new Set());
    setSaved('');
  };
  const toggleCut = (i: number) => {
    const next = new Set(cuts);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setCutsFresh(next);
  };

  const run = (file: string, outputs: { name: string; pages: number[] }[]) => {
    const files = [source.file];
    useQueue.getState().addTask({ slug: 'split-pdf', name: 'Split PDF', category: 'pdf', file }, (_signal, onProgress) =>
      computeValue('build-pdf', { sources: files, outputs: outputs.map((o) => ({ name: o.name, pages: o.pages.map((index) => ({ src: 0, index, rotate: 0 })) })) }, onProgress),
    );
    setSaved(file);
  };
  const kept = parts.map((pages, k) => ({ k, pages })).filter(({ k }) => !skip.has(k));
  const saveParts = () => {
    if (!kept.length) return;
    run(kept.length === 1 ? pdfName(nameOf(kept[0].k), base) : `${base}: ${plural(kept.length, ['{n} part', '{n} parts'], ['{n} část', '{n} části', '{n} částí'])}`, kept.map(({ k, pages }) => ({ name: pdfName(nameOf(k), `${base}-part-${k + 1}`), pages })));
  };
  const picked = items.flatMap((it, i) => (selected.has(it.key) ? [i] : []));
  const savePicked = () => {
    if (!picked.length) return;
    const file = pdfName(`${base}-pages-${rangeLabel(picked).replace(/[–, ]+/g, (m) => (m === '–' ? '-' : '_'))}`, base);
    run(file, [{ name: file, pages: picked }]);
  };

  return (
    <div className="pg-tool">
      <Panel title={`${source.file.name} · ${plural(count, ['{n} page', '{n} pages'], ['{n} stránka', '{n} stránky', '{n} stránek'])}`}>
        <div className="pg-bar" role="toolbar" aria-label={t('Where to split')}>
          <span className="note">{t('Split:')}</span>
          <button type="button" className="btn btn-sm" onClick={() => setCutsFresh(cutsEvery(count, 1))}>
            {t('every page')}
          </button>
          <span className="inline pg-every">
            <button type="button" className="btn btn-sm" onClick={() => setCutsFresh(cutsEvery(count, every))}>
              {tc('split every', 'every')}
            </button>
            <input
              className="input input-num"
              type="number"
              min={1}
              max={Math.max(1, count)}
              value={every}
              onChange={(e) => setEvery(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              aria-label={t('Pages in each part')}
            />
            <span className="note">{tc('split every', 'pages')}</span>
          </span>
          <button type="button" className="btn btn-sm" disabled={count < 2} onClick={() => setCutsFresh(new Set([Math.ceil(count / 2) - 1]))}>
            {t('in half')}
          </button>
          <button type="button" className="btn btn-sm" disabled={!cuts.size} onClick={() => setCutsFresh(new Set())}>
            {t('no cuts')}
          </button>
          <PdfDrop compact onFiles={(f) => void open(f)} label={t('other PDF')} />
        </div>
        <PageGrid
          items={items}
          thumbs={thumbs}
          selected={selected}
          onSelect={setSelected}
          tone={(_it, i) => (parts.length > 1 ? tone(partOf.get(i) ?? 0) : undefined)}
          caption={(_it, i) => (
            <>
              <b>{i + 1}</b>
              {parts.length > 1 && <span className="note"> · {t('part {n}', { n: (partOf.get(i) ?? 0) + 1 })}</span>}
            </>
          )}
          after={(_it, i) =>
            i < count - 1 ? (
              <button
                type="button"
                className={`pg-cut${cuts.has(i) ? ' on' : ''}`}
                onClick={() => toggleCut(i)}
                aria-pressed={cuts.has(i)}
                aria-label={cuts.has(i) ? t('Join pages {n} and {n2} again', { n: i + 1, n2: i + 2 }) : t('Split after page {n}', { n: i + 1 })}
                title={cuts.has(i) ? t('Join again') : t('Split after page {n}', { n: i + 1 })}
              >
                ✂
              </button>
            ) : null
          }
        />
        <p className="note">{t('Click ✂ between two pages to split there (again to join). Or pick pages (Ctrl / Shift) and save just those as one PDF.')}</p>
      </Panel>

      <Panel title={plural(parts.length, ['{n} part', '{n} parts'], ['{n} část', '{n} části', '{n} částí'])}>
        <ul className="pg-parts">
          {parts.map((pages, k) => (
            <li key={k} className={skip.has(k) ? 'off' : undefined}>
              <span className="pg-tone" style={{ background: tone(k) }} aria-hidden="true" />
              <input
                type="checkbox"
                checked={!skip.has(k)}
                aria-label={t('Save part {n}', { n: k + 1 })}
                onChange={(e) => {
                  const next = new Set(skip);
                  if (e.target.checked) next.delete(k);
                  else next.add(k);
                  setSkip(next);
                }}
              />
              <input className="input" value={nameOf(k)} onChange={(e) => setNames({ ...names, [k]: e.target.value })} aria-label={t('Name of part {n}', { n: k + 1 })} spellCheck={false} />
              <span className="note mono">
                {pages.length === 1 ? t('page {range}', { range: rangeLabel(pages) }) : t('pages {range}', { range: rangeLabel(pages) })}
              </span>
            </li>
          ))}
        </ul>
        <div className="inline">
          <button type="button" className="btn btn-primary" disabled={!kept.length} onClick={saveParts}>
            {kept.length > 1 ? plural(kept.length, ['Save {n} PDF', 'Save {n} PDFs'], ['Uložit {n} PDF', 'Uložit {n} PDF', 'Uložit {n} PDF']) : t('Save PDF')}
          </button>
          <button type="button" className="btn" disabled={!picked.length} onClick={savePicked}>
            {picked.length
              ? plural(picked.length, ['Save the {n} picked page as one PDF', 'Save the {n} picked pages as one PDF'], ['Uložit {n} vybranou stránku jako jedno PDF', 'Uložit {n} vybrané stránky jako jedno PDF', 'Uložit {n} vybraných stránek jako jedno PDF'])
              : t('Pick pages to save just those')}
          </button>
        </div>
        {saved && (
          <p className="note">
            {saved.endsWith('.pdf')
              ? tn('{file} is being made: it lands in the queue on the left.', { file: saved })
              : tn('{files} are being made: they land in the queue on the left (several files download as one .zip).', { files: saved })}
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
      </Panel>
    </div>
  );
}
