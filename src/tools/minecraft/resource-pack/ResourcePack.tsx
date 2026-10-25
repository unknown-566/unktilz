import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Workbench } from '../../../components/Workbench';
import { Panel, Tabs } from '../../../components/ui';
import { SavedPanel, UndoBar } from '../../../components/SavedPanel';
import { useAutosave } from '../../../lib/saved';
import { formatBytes, saveBlob } from '../../../queue/download';
import { NO_ADJUST, adjustImg, decodeImage, encodePng, isNoAdjust, type Adjust } from '../../../lib/mc/pack/pixels';
import { buildPackZip, changedCount, emptyPack, packNamespace, readPackZip, slugName, type PackDoc } from '../../../lib/mc/pack/pack';
import { getCached, type Vanilla } from '../../../lib/mc/pack/vanilla';
import { GamePanel } from './GamePanel';
import { PackPanel, textureIcon } from './PackPanel';
import { TextureBrowser } from './TextureBrowser';
import { AdjustControls, TextureEditor } from './TextureEditor';
import { Preview } from './Preview';
import { TweaksPanel } from './TweaksPanel';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { ItemsPanel, itemKey } from './ItemsPanel';
import { prettyName } from '../../../lib/mc/pack/catalog';
import { plainText } from '../../../lib/mc/minimessage';
import { strFromU8 } from 'fflate';
import { LiveTexture } from './live';
import { SoundsPanel } from './SoundsPanel';
import { TextsPanel } from './TextsPanel';
import { PanoramaPanel } from './PanoramaPanel';
import { PANORAMA_PATHS } from '../../../lib/mc/pack/panorama';
import { plural, t } from '../../../lib/i18n-core';

const SLUG = 'resource-pack';
type Section = 'textures' | 'items' | 'tweaks' | 'sounds' | 'texts' | 'menu';

/** Change the colors of several picked textures at once. */
function BatchPanel({ paths, busy, onApply, onReset, onClear }: { paths: string[]; busy: boolean; onApply: (a: Adjust) => void; onReset: () => void; onClear: () => void }) {
  const [adjust, setAdjust] = useState<Adjust>(NO_ADJUST);
  return (
    <Panel
      title={plural(paths.length, ['{n} texture picked', '{n} textures picked'], ['{n} vybraná textura', '{n} vybrané textury', '{n} vybraných textur'])}
      actions={
        <button type="button" className="btn btn-sm" onClick={onClear}>
          {t('unpick all')}
        </button>
      }
    >
      <p className="note">{t('Change the colors of all of them at once, e.g. every wool or every ore.')}</p>
      <AdjustControls value={adjust} onChange={setAdjust} />
      <div className="opt-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || isNoAdjust(adjust)}
          onClick={() => {
            onApply(adjust);
            setAdjust(NO_ADJUST);
          }}
        >
          {plural(paths.length, ['Apply to {n} texture', 'Apply to {n} textures'], ['Použít na {n} texturu', 'Použít na {n} textury', 'Použít na {n} textur'])}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onReset}>
          {t('all back to original')}
        </button>
      </div>
    </Panel>
  );
}

export default function ResourcePack() {
  const [doc, setDoc] = useState<PackDoc>(() => emptyPack());
  // Bumps when textures change from outside the editor (opened pack, several at once, undo), so it reloads.
  const [rev, setRev] = useState(0);
  const [vanilla, setVanilla] = useState<Vanilla | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('textures');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ text: string; doc: PackDoc } | null>(null);
  const [error, setError] = useState('');
  const live = useMemo(() => new LiveTexture(), []);
  const openInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const ready = useAutosave(SLUG, doc, (v) => {
    setDoc({ ...emptyPack(), ...v });
    setRev((r) => r + 1);
  });

  // The version the pack was made with, if it's downloaded already.
  useEffect(() => {
    if (!ready || vanilla || !doc.version) return;
    getCached(doc.version).then((v) => v && setVanilla(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, doc.version]);

  const patch = (p: Partial<PackDoc>) => setDoc((d) => ({ ...d, ...p }));
  const replaceDoc = (next: PackDoc, text: string) => {
    setUndo({ text, doc });
    setDoc(next);
    setRev((r) => r + 1);
    setSelected([]);
  };

  const onLoaded = (v: Vanilla) => {
    setVanilla(v);
    patch({ version: v.id });
  };

  const commitTexture = useCallback(
    (path: string, png: Uint8Array | null, mcmeta: string | undefined) =>
      setDoc((d) => {
        const textures = { ...d.textures };
        if (png) textures[path] = mcmeta === undefined ? { png } : { png, mcmeta };
        else delete textures[path];
        return { ...d, textures };
      }),
    [],
  );
  const commitItem = useCallback(
    (id: string, png: Uint8Array | null, mcmeta: string | undefined) => setDoc((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? { ...it, png, mcmeta } : it)) })),
    [],
  );

  const open = (path: string) => {
    setActive(path);
    setSection(path.startsWith('item:') ? 'items' : 'textures');
    setSelected([]);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const applyBatch = async (a: Adjust) => {
    if (!vanilla) return;
    setBusy(true);
    const before = doc;
    const textures = { ...doc.textures };
    for (const p of selected) {
      const src = textures[p]?.png ?? vanilla.files[p];
      if (!src) continue;
      try {
        textures[p] = { ...textures[p], png: encodePng(adjustImg(await decodeImage(src), a)) };
      } catch {
        /* a texture that can't be read stays as it is */
      }
    }
    setUndo({ text: plural(selected.length, ['Colors of {n} texture changed', 'Colors of {n} textures changed'], ['Změněny barvy {n} textury', 'Změněny barvy {n} textur', 'Změněny barvy {n} textur']), doc: before });
    setDoc((d) => ({ ...d, textures }));
    setRev((r) => r + 1);
    setBusy(false);
  };

  const resetBatch = () => {
    const textures = { ...doc.textures };
    for (const p of selected) delete textures[p];
    setUndo({ text: t('Back to the original'), doc });
    setDoc((d) => ({ ...d, textures }));
    setRev((r) => r + 1);
  };

  const download = () => {
    if (!vanilla) return;
    setError('');
    try {
      const zip = buildPackZip(doc, vanilla);
      saveBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), `${slugName(doc.name)}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const openPack = async (file: File) => {
    setError('');
    try {
      const { doc: next, skipped } = readPackZip(new Uint8Array(await file.arrayBuffer()), file.name, vanilla?.id ?? doc.version);
      replaceDoc(next, skipped ? t('Opened {name} ({n} files outside the pack left out)', { name: file.name, n: skipped }) : t('Opened {name}', { name: file.name }));
      setActive(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const n = changedCount(doc);
  const zipSize = useMemo(() => {
    let b = doc.icon?.length ?? 0;
    for (const e of Object.values(doc.textures)) b += e.png.length;
    for (const it of doc.items) b += it.png?.length ?? 0;
    for (const e of Object.values(doc.sounds)) for (const f of e.files) b += f.ogg.length;
    for (const e of Object.values(doc.extra)) b += e.length;
    return b;
  }, [doc]);

  const openItem = active?.startsWith('item:') ? doc.items.find((it) => itemKey(it.id) === active) : undefined;
  const activeBytes = openItem ? openItem.png : active && vanilla ? (doc.textures[active]?.png ?? vanilla.files[active]) : null;
  const iconFromTexture = activeBytes ? () => textureIcon(activeBytes) : null;
  const activeTitle = openItem ? plainText(openItem.name) || openItem.id : active ? prettyName(active.split('/').pop()!.replace(/\.png$/, '')) : '';
  const gameMeta = active && vanilla?.files[`${active}.mcmeta`] ? strFromU8(vanilla.files[`${active}.mcmeta`]) : null;

  const output = (
    <>
      <section className="panel" aria-label={t('Download')}>
        <h2 className="panel-title">{t('// your pack')}</h2>
        <p className="rp-summary">
          {n ? plural(n, ['{n} changed texture', '{n} changed textures'], ['{n} změněná textura', '{n} změněné textury', '{n} změněných textur']) : t('Nothing changed yet.')}
          {doc.items.length > 0 && <> · {plural(doc.items.length, ['{n} own item', '{n} own items'], ['{n} vlastní item', '{n} vlastní itemy', '{n} vlastních itemů'])}</>}
          {doc.tweaks.length > 0 && <> · {plural(doc.tweaks.length, ['{n} ready-made change', '{n} ready-made changes'], ['{n} hotová úprava', '{n} hotové úpravy', '{n} hotových úprav'])}</>}
          {Object.keys(doc.sounds).length > 0 && <> · {plural(Object.keys(doc.sounds).length, ['{n} sound', '{n} sounds'], ['{n} zvuk', '{n} zvuky', '{n} zvuků'])}</>}
          {Object.keys(doc.lang).length > 0 && <> · {plural(Object.values(doc.lang).reduce((n, k) => n + Object.keys(k).length, 0), ['{n} text', '{n} texts'], ['{n} text', '{n} texty', '{n} textů'])}</>}
          {Object.keys(doc.extra).length > 0 && <> · {plural(Object.keys(doc.extra).length, ['{n} other file', '{n} other files'], ['{n} další soubor', '{n} další soubory', '{n} dalších souborů'])}</>}
          {' · '}
          {t('about {size}', { size: formatBytes(zipSize) })}
        </p>
        <button type="button" className="btn btn-primary" onClick={download} disabled={!vanilla}>
          {t('Download pack (.zip)')}
        </button>
        <p className="note">{t('In Minecraft: Options → Resource Packs → Open Pack Folder, put the .zip there, then move the pack to the right side.')}</p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="opt-row">
          <button type="button" className="btn btn-sm" onClick={() => openInput.current?.click()} title={t('Open a resource pack .zip to change it')}>
            {t('open a pack (.zip)')}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => replaceDoc({ ...emptyPack(vanilla?.id ?? doc.version) }, t('New pack'))}>
            {t('new pack')}
          </button>
        </div>
        <input
          ref={openInput}
          type="file"
          accept=".zip"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) openPack(f);
          }}
        />
        {undo && (
          <UndoBar
            text={undo.text}
            onUndo={() => {
              setDoc(undo.doc);
              setRev((r) => r + 1);
            }}
            onClose={() => setUndo(null)}
          />
        )}
      </section>
      <SavedPanel<PackDoc>
        slug={SLUG}
        title={t('my packs')}
        suggestName={() => doc.name}
        getData={() => doc}
        onLoad={(d) => {
          setDoc({ ...emptyPack(), ...d });
          setRev((r) => r + 1);
          setSelected([]);
        }}
        describe={(item) => plural(changedCount(item.data), ['{n} texture', '{n} textures'], ['{n} textura', '{n} textury', '{n} textur'])}
      />
    </>
  );

  return (
    <Workbench preview={<Preview live={live} doc={doc} vanilla={vanilla} active={active} title={activeTitle} />} output={output}>
      <GamePanel vanilla={vanilla} wanted={doc.version} onLoaded={onLoaded} />
      <PackPanel doc={doc} vanilla={vanilla} onChange={patch} iconFromTexture={iconFromTexture} />
      {vanilla && (
        <div className="rp-sections">
          <Tabs<Section>
            label={t('Parts of the pack')}
            idPrefix="rp-sec"
            value={section}
            onChange={setSection}
            tabs={[
              { id: 'textures', label: t('Textures'), dot: Object.keys(doc.textures).some((k) => !PANORAMA_PATHS.includes(k)) },
              { id: 'items', label: t('Own items'), dot: doc.items.length > 0 },
              { id: 'tweaks', label: t('Ready-made changes'), dot: doc.tweaks.length > 0 },
              { id: 'sounds', label: t('Sounds'), dot: Object.keys(doc.sounds).length > 0 },
              { id: 'texts', label: t('Texts'), dot: Object.keys(doc.lang).length > 0 || !!doc.splashes },
              { id: 'menu', label: t('Menu background'), dot: PANORAMA_PATHS.some((k) => doc.textures[k]) },
            ]}
          />
        </div>
      )}
      {vanilla && section === 'items' && <ItemsPanel doc={doc} vanilla={vanilla} active={active} onChange={patch} onOpen={open} />}
      {vanilla && section === 'textures' && selected.length > 1 && <BatchPanel paths={selected} busy={busy} onApply={applyBatch} onReset={resetBatch} onClear={() => setSelected([])} />}
      <div ref={editorRef} className="rp-editor-anchor">
        <ErrorBoundary resetKey={`${active}:${rev}`} fallback={() => <p className="error-text">{t('This texture can’t be edited here.')}</p>}>
        {vanilla && section === 'items' && openItem && (
          <TextureEditor
            key={`${active}:${rev}`}
            path={active!}
            title={activeTitle}
            subtitle={`${packNamespace(doc)}:${openItem.id}`}
            origBytes={null}
            origMeta={null}
            entry={{ png: openItem.png, mcmeta: openItem.mcmeta }}
            blank={{ w: 16, h: 16 }}
            live={live}
            onCommit={(png, mcmeta) => commitItem(openItem.id, png, mcmeta)}
          />
        )}
        {vanilla && section === 'textures' && active && !openItem && vanilla.files[active] && (
          <TextureEditor
            key={`${active}:${rev}:${vanilla.id}`}
            path={active}
            title={activeTitle}
            origBytes={vanilla.files[active]}
            origMeta={gameMeta}
            entry={doc.textures[active]}
            live={live}
            onCommit={(png, mcmeta) => commitTexture(active, png, mcmeta)}
          />
        )}
        </ErrorBoundary>
      </div>
      {vanilla && section === 'textures' && <TextureBrowser vanilla={vanilla} doc={doc} active={active} selected={selected} onOpen={open} onSelect={setSelected} />}
      {vanilla && section === 'tweaks' && <TweaksPanel doc={doc} vanilla={vanilla} onChange={(tweaks) => patch({ tweaks })} />}
      {vanilla && section === 'sounds' && <SoundsPanel doc={doc} vanilla={vanilla} onChange={(sounds) => patch({ sounds })} />}
      {vanilla && section === 'texts' && <TextsPanel doc={doc} vanilla={vanilla} onChange={patch} />}
      {vanilla && section === 'menu' && <PanoramaPanel doc={doc} vanilla={vanilla} onChange={(textures) => patch({ textures })} />}
    </Workbench>
  );
}
