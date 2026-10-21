import { useEffect, useRef, useState } from 'react';
import { Panel, Segmented, TextField, Toggle } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { Workbench } from '../../../components/Workbench';
import { computeValue } from '../../../lib/compute';
import { useAutosave } from '../../../lib/saved';
import { useQueue } from '../../../queue/store';
import type { ScanLook } from '../../../workers/tasks/scan';
import type { OcrWord } from '../../../workers/tasks/ocrLayer';
import type { PreparedPage } from '../../../workers/tasks/scanPdf';
import { IMAGE_ACCEPTS } from '../../image/formats';
import { pdfName } from '../pages/model';
import { CornerEditor, type Pt } from './CornerEditor';
import { mm, place, type Layout, type PageSize } from './layout';
import { OCR_CORE_MB, OCR_LANGS, startOcr } from './ocr';
import { fmtNum, t, tn } from '../../../lib/i18n';

type Photo = {
  id: number;
  file: File;
  /** Clockwise turn on top of the photo's own. */
  turn: number;
  /** The sheet's corners (fractions of the turned photo); null = the whole photo. */
  quad: Pt[] | null;
  /** What was found automatically (to go back to). */
  found: Pt[] | null;
  view?: { url: string; w: number; h: number };
  error?: string;
};

type Settings = { mode: 'scan' | 'photo'; look: ScanLook; layout: Layout; size: PageSize; margin: string; ocr: boolean; langs: string[] };
const DEFAULTS: Settings = { mode: 'scan', look: 'gray', layout: 'whole', size: 'a4', margin: '10', ocr: false, langs: ['eng'] };
const MARGINS = [
  { value: '0', label: t('none') },
  { value: '10', label: t('10 mm') },
  { value: '15', label: t('15 mm') },
  { value: '25', label: t('25 mm') },
];

let nextId = 0;
const isImage = (f: File) => f.type.startsWith('image/') || IMAGE_ACCEPTS.some((ext) => f.name.toLowerCase().endsWith(ext));
/** A corner turned with the photo: a clockwise quarter turn moves (x, y) to (1 − y, x). */
const turnQuad = (q: Pt[] | null): Pt[] | null => q?.map(([x, y]) => [1 - y, x] as Pt) ?? null;

/** One option row: label (with help) and its control. */
function Row({ label, help, id, children }: { label: string; help?: string; id: string; children: React.ReactNode }) {
  return (
    <div className="opt-row">
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        <span className="opt-label" id={id}>
          {label}
        </span>
        {help && <Help label={label} text={help} />}
      </span>
      {children}
    </div>
  );
}

export default function ScanToPdf() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [s, setS] = useState<Settings>(DEFAULTS);
  useAutosave<Settings>('images-to-pdf', s, (d) => setS({ ...DEFAULTS, ...d }));
  const set = (patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch }));
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');
  const [over, setOver] = useState(false);

  const photosRef = useRef(photos);
  photosRef.current = photos;
  const patch = (id: number, change: Partial<Photo>) => setPhotos((list) => list.map((p) => (p.id === id ? { ...p, ...change } : p)));
  // Picture URLs are freed with the page.
  useEffect(() => () => photosRef.current.forEach((p) => p.view && URL.revokeObjectURL(p.view.url)), []);

  /** The photo as it's shown (turned) and where its sheet is. */
  const look = async (id: number, file: File, turn: number, keep?: Pt[] | null) => {
    try {
      const r = await computeValue('scan-detect', { file, turn });
      const old = photosRef.current.find((p) => p.id === id)?.view;
      if (old) URL.revokeObjectURL(old.url);
      patch(id, { view: { url: URL.createObjectURL(r.preview), w: r.w, h: r.h }, found: r.quad, quad: keep === undefined ? r.quad : keep, error: undefined });
    } catch (e) {
      patch(id, { error: e instanceof Error ? e.message : String(e) });
    }
  };

  const add = async (files: File[]) => {
    const fresh = files.filter(isImage).map((file) => ({ id: ++nextId, file, turn: 0, quad: null, found: null }) as Photo);
    if (!fresh.length) return;
    setPhotos((list) => [...list, ...fresh]);
    setCurrent((c) => c ?? fresh[0].id);
    if (!name) setName(fresh[0].file.name.replace(/\.[^.]+$/, '') || 'scan');
    setSaved('');
    for (const p of fresh) await look(p.id, p.file, 0);
  };

  const remove = (id: number) => {
    const p = photos.find((x) => x.id === id);
    if (p?.view) URL.revokeObjectURL(p.view.url);
    const left = photos.filter((x) => x.id !== id);
    setPhotos(left);
    if (current === id) setCurrent(left[0]?.id ?? null);
  };
  const shift = (id: number, by: number) => {
    const i = photos.findIndex((p) => p.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    setPhotos(next);
  };
  const turnPhoto = (id: number) => {
    const p = photos.find((x) => x.id === id);
    if (!p) return;
    const turn = (p.turn + 90) % 360;
    const quad = turnQuad(p.quad);
    patch(id, { turn, quad });
    void look(id, p.file, turn, quad);
  };

  const cur = photos.find((p) => p.id === current) ?? null;

  // The page as it will be in the PDF, made again (a moment after changes) for the photo shown.
  const [page, setPage] = useState<{ url: string; page: PreparedPage; key: string } | null>(null);
  const [making, setMaking] = useState(false);
  const pageKey = cur ? JSON.stringify([cur.id, cur.turn, cur.quad, s.mode, s.look, s.layout]) : '';
  useEffect(() => {
    if (!cur || !cur.view) return;
    let stale = false;
    const timer = setTimeout(async () => {
      setMaking(true);
      try {
        const r = await computeValue('prepare-page', { file: cur.file, turn: cur.turn, mode: s.mode, look: s.look, quad: cur.quad, layout: s.layout });
        if (stale) return;
        setPage((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { url: URL.createObjectURL(r.blob), page: r, key: pageKey };
        });
      } catch (e) {
        if (!stale) patch(cur.id, { error: e instanceof Error ? e.message : String(e) });
      } finally {
        if (!stale) setMaking(false);
      }
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [pageKey, cur?.view]); // eslint-disable-line react-hooks/exhaustive-deps

  const margin = mm(Number(s.margin));
  const scan = s.mode === 'scan';
  const layout: Layout = scan ? s.layout : 'whole';

  const make = () => {
    if (!photos.length) return;
    const file = pdfName(name, 'scan');
    const list = photos.map((p) => ({ file: p.file, turn: p.turn, quad: p.quad }));
    const opts = { ...s, layout };
    useQueue.getState().addTask({ slug: 'images-to-pdf', name: 'Images to PDF', category: 'pdf', file }, async (signal, onProgress) => {
      // With text recognition, each page is read right after it's made (on the clean page, which reads best).
      const ocr = opts.ocr ? await startOcr(opts.langs) : null;
      try {
        const pages: (PreparedPage & { words?: OcrWord[] })[] = [];
        for (let i = 0; i < list.length; i++) {
          if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
          const it = list[i];
          const page = await computeValue('prepare-page', { file: it.file, turn: it.turn, mode: opts.mode, look: opts.look, quad: it.quad, layout: opts.layout }, (p) =>
            onProgress(((i + p * (ocr ? 0.5 : 1)) / list.length) * 0.9),
          );
          const words = ocr ? await ocr.read(page.blob) : undefined;
          pages.push({ ...page, words });
          onProgress(((i + 1) / list.length) * 0.9);
        }
        return await computeValue('pages-to-pdf', { name: file, pages, size: opts.size, margin, layout: opts.layout }, (p) => onProgress(0.9 + p * 0.1));
      } finally {
        await ocr?.end();
      }
    });
    setSaved(file);
  };

  const shown = page && page.key === pageKey ? page : null;
  const at = shown ? place({ w: shown.page.width, h: shown.page.height, sheet: shown.page.sheet }, s.size, margin, layout, shown.page.dpi) : null;
  const preview = (
    <Panel title={cur ? t('photo {n} of {length}', { n: photos.indexOf(cur) + 1, length: photos.length }) : t('preview')}>
      {!cur ? (
        <p className="note">{t('Add photos to start.')}</p>
      ) : (
        <div className="sc-preview">
          {scan && cur.view && (
            <div className="sc-step">
              <div className="inline sc-step-head">
                <b>{t('1 · the paper')}</b>
                <span className="pg-bar-gap" />
                <button type="button" className="btn btn-sm" disabled={!cur.found} onClick={() => patch(cur.id, { quad: cur.found })} title={cur.found ? t('Put the corners where they were found') : t('No paper was found in this photo')}>
                  {t('find it again')}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => patch(cur.id, { quad: null })}>
                  {t('whole photo')}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => turnPhoto(cur.id)} title={t('Turn the photo a quarter to the right')}>
                  {t('↻ turn')}
                </button>
              </div>
              <CornerEditor src={cur.view.url} w={cur.view.w} h={cur.view.h} quad={cur.quad} onChange={(quad) => patch(cur.id, { quad })} />
              <p className="note">{cur.found ? t('Drag the corners onto the paper’s corners if they’re off.') : t('The paper wasn’t found: drag the corners onto it, or keep the whole photo.')}</p>
            </div>
          )}
          <div className="sc-step">
            <div className="inline sc-step-head">
              <b>{scan ? t('2 · the page') : t('the page')}</b>
              <span className="pg-bar-gap" />
              {!scan && (
                <button type="button" className="btn btn-sm" onClick={() => turnPhoto(cur.id)}>
                  {t('↻ turn')}
                </button>
              )}
              {making && <span className="note">{t('making…')}</span>}
            </div>
            <div className="sc-page" style={at ? { aspectRatio: `${at.pageW} / ${at.pageH}` } : undefined}>
              {shown && at && (
                <img
                  src={shown.url}
                  alt={t('This page in the PDF')}
                  style={{ left: `${(at.x / at.pageW) * 100}%`, top: `${((at.pageH - at.y - at.h) / at.pageH) * 100}%`, width: `${(at.w / at.pageW) * 100}%`, height: `${(at.h / at.pageH) * 100}%` }}
                />
              )}
              {shown && at && margin > 0 && (
                <span
                  className="sc-margin"
                  style={{ left: `${(margin / at.pageW) * 100}%`, right: `${(margin / at.pageW) * 100}%`, top: `${(margin / at.pageH) * 100}%`, bottom: `${(margin / at.pageH) * 100}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
            {cur.error && <p className="error-text">{cur.error}</p>}
          </div>
        </div>
      )}
    </Panel>
  );

  return (
    <Workbench preview={preview}>
      <Panel title={photos.length ? t('photos · {n}', { n: photos.length }) : t('photos')}>
        <label
          className={`pg-drop sc-drop${over ? ' over' : ''}${photos.length ? ' small' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void add([...e.dataTransfer.files]);
          }}
        >
          <input
            type="file"
            accept={['image/*', ...IMAGE_ACCEPTS].join(',')}
            multiple
            hidden
            onChange={(e) => {
              void add([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <b>{photos.length ? t('+ add photos') : t('Drop photos here or click to choose them')}</b>
          {!photos.length && <span className="note">{t('Photos of paper (homework, receipts, letters…) or any pictures: JPG, PNG, HEIC from an iPhone, WebP, TIFF. Each becomes a page.')}</span>}
        </label>
        {photos.length > 0 && (
          <ul className="sc-photos">
            {photos.map((p, i) => (
              <li key={p.id} className={p.id === current ? 'on' : undefined}>
                <button type="button" className="sc-thumb" onClick={() => setCurrent(p.id)} aria-pressed={p.id === current} aria-label={t('Page {n}: {name}', { n: i + 1, name: p.file.name })}>
                  {p.view ? <img src={p.view.url} alt="" /> : <span className="pg-wait" />}
                  <b>{i + 1}</b>
                </button>
                <div className="sc-thumb-btns">
                  <button type="button" className="pg-icon" disabled={i === 0} onClick={() => shift(p.id, -1)} aria-label={t('Move page {n} earlier', { n: i + 1 })} title={t('Earlier')}>
                    ←
                  </button>
                  <button type="button" className="pg-icon" disabled={i === photos.length - 1} onClick={() => shift(p.id, 1)} aria-label={t('Move page {n} later', { n: i + 1 })} title={t('Later')}>
                    →
                  </button>
                  <button type="button" className="pg-icon" onClick={() => remove(p.id)} aria-label={t('Remove page {n}', { n: i + 1 })} title={t('Remove')}>
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t('pages')}>
        <Row id="sc-mode" label={t('Photos are')} help={t('Paper: finds the sheet in each photo, straightens it and cleans it up so it reads like a scan. Pictures: each photo goes on its page as it is.')}>
          <Segmented
            labelledBy="sc-mode"
            value={s.mode}
            onChange={(mode) => set({ mode })}
            options={[
              { value: 'scan', label: t('paper (scan it)') },
              { value: 'photo', label: t('pictures (as they are)') },
            ]}
          />
        </Row>
        {scan && (
          <>
            <hr className="divider" />
            <Row id="sc-look" label={t('Look')} help={t('Color keeps stamps and highlighter. Grayscale is the cleanest for most text. Black & white gives the sharpest, smallest pages but can lose faint pencil.')}>
              <Segmented
                labelledBy="sc-look"
                value={s.look}
                onChange={(lk) => set({ look: lk })}
                options={[
                  { value: 'color', label: t('color') },
                  { value: 'gray', label: t('grayscale') },
                  { value: 'bw', label: t('black & white') },
                ]}
              />
            </Row>
            <hr className="divider" />
            <Row
              id="sc-layout"
              label={t('On the page')}
              help={t('Whole sheet: the paper fills the page, edges and all. Only what’s written: just the text and drawings are taken off the paper and put on a clean white page, where they were on the paper, always inside the margins.')}
            >
              <Segmented
                labelledBy="sc-layout"
                value={s.layout}
                onChange={(lay) => set({ layout: lay })}
                options={[
                  { value: 'whole', label: t('whole sheet') },
                  { value: 'content', label: t('only what’s written') },
                ]}
              />
            </Row>
          </>
        )}
        <hr className="divider" />
        <Row id="sc-size" label={t('Page size')} help={t('A4 and Letter are standard paper (sideways for wide pages). Fit makes each page exactly the size of its picture.')}>
          <Segmented
            labelledBy="sc-size"
            value={s.size}
            onChange={(size) => set({ size })}
            options={[
              { value: 'a4', label: 'A4' },
              { value: 'letter', label: t('Letter') },
              { value: 'fit', label: t('fit picture') },
            ]}
          />
        </Row>
        <hr className="divider" />
        <Row id="sc-margin" label={t('Margin')} help={t('Empty white space around the edge of each page. Nothing is put in it.')}>
          <Segmented labelledBy="sc-margin" value={s.margin} onChange={(m) => set({ margin: m })} options={MARGINS} />
        </Row>
      </Panel>

      <Panel title={t('text')}>
        <Row
          id="sc-ocr"
          label={t('Recognize the text')}
          help={t('Reads the text on each page and puts it into the PDF, invisible, right under the picture: the PDF still looks like the scan, but you can search it (Ctrl+F), select and copy the text. Handwriting and pictures aren\'t read.')}
        >
          <Toggle labelledBy="sc-ocr" checked={s.ocr} onChange={(ocr) => set({ ocr })} />
        </Row>
        {s.ocr && (
          <>
            <div className="chips-row" role="group" aria-label={t('Languages of the text')}>
              {OCR_LANGS.map((l) => {
                const on = s.langs.includes(l.code);
                return (
                  <button
                    key={l.code}
                    type="button"
                    className="chip dl-sub"
                    aria-pressed={on}
                    // At least one language stays picked.
                    onClick={() => set({ langs: on ? (s.langs.length > 1 ? s.langs.filter((c) => c !== l.code) : s.langs) : [...s.langs, l.code] })}
                  >
                    {t(l.name)}
                  </button>
                );
              })}
            </div>
            <p className="note">
              {t('Pick the languages of the text (more than one is fine, but each makes it slower). The first time, it loads {mb} MB from this site; after that it works offline.', {
                mb: fmtNum(Math.round((OCR_CORE_MB + s.langs.reduce((n, c) => n + (OCR_LANGS.find((l) => l.code === c)?.mb ?? 0), 0)) * 10) / 10),
              })}
            </p>
          </>
        )}
      </Panel>

      <Panel title={t('save')}>
        <div className="inline">
          <TextField label={t('File name')} value={name} onChange={setName} />
          <button type="button" className="btn btn-primary" disabled={!photos.length} onClick={make}>
            {t('Make PDF')}
          </button>
        </div>
        {saved && <p className="note">{tn('{file} is being made: it lands in the queue on the left.', { file: saved })}</p>}
      </Panel>
    </Workbench>
  );
}

