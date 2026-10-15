import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Panel, Segmented, Toggle } from '../../components/ui';
import { Workbench } from '../../components/Workbench';
import { Help } from '../../components/Help';
import { UploadIcon } from '../../components/icons';
import { computeValue } from '../../lib/compute';
import { saveBlob } from '../../queue/download';
import { SUPPORT_BLOCK, baseById } from '../../lib/mc/mapColors';
import { EMPTY, countBlocks } from '../../lib/mc/schematic';
import type { Dither, MapGridResult } from '../../workers/tasks/mapArt';

// Data versions from the Minecraft Wiki. A newer game upgrades older files; an older game can't read newer ones.
const VERSIONS = [
  ['1.20.1', 3465],
  ['1.20.4', 3700],
  ['1.21.1', 3955],
  ['1.21.4', 4189],
  ['1.21.8', 4440],
  ['1.21.10', 4556],
  ['26.1', 4786],
  ['26.3', 5023],
] as const;

const SIZES = ['1', '2', '3', '4'].map((v) => ({ value: v, label: v }));
const fmt = (n: number) => n.toLocaleString('en-US');
const safeName = (s: string) => s.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '') || 'map_art';

function OptRow({ id, label, help, children }: { id: string; label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="opt-row">
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <span className="opt-label" id={id}>
          {label}
        </span>
        <Help label={label} text={help} />
      </span>
      {children}
    </div>
  );
}

export default function MapArt() {
  const [file, setFile] = useState<File | null>(null);
  const [mapsX, setMapsX] = useState('1');
  const [mapsY, setMapsY] = useState('1');
  const [fit, setFit] = useState<'cover' | 'contain' | 'stretch'>('cover');
  const [shading, setShading] = useState<'flat' | 'staircase'>('flat');
  const [dither, setDither] = useState<Dither>('smooth');
  const [skipExpensive, setSkipExpensive] = useState(false);
  const [maxHeight, setMaxHeight] = useState('32');
  const [version, setVersion] = useState('1.21.1');
  const [grid, setGrid] = useState<MapGridResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef(0);

  const staircase = shading === 'staircase';
  const dataVersion = VERSIONS.find(([v]) => v === version)?.[1] ?? 3955;
  const name = safeName(file?.name ?? 'map_art');

  // Re-convert whenever the picture or a setting changes; older results that arrive late are dropped.
  useEffect(() => {
    if (!file) return;
    const id = ++run.current;
    setBusy(true);
    setError('');
    const t = setTimeout(() => {
      computeValue('map-grid', { file, mapsX: Number(mapsX), mapsY: Number(mapsY), fit, dither, staircase, skipExpensive, maxHeight: Number(maxHeight) })
        .then((g) => id === run.current && setGrid(g))
        .catch((e: Error) => id === run.current && setError(e.message))
        .finally(() => id === run.current && setBusy(false));
    }, 120);
    return () => clearTimeout(t);
  }, [file, mapsX, mapsY, fit, dither, staircase, skipExpensive, maxHeight]);

  // Paint the preview at one pixel per block; CSS scales it up without smoothing.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !grid) return;
    c.width = grid.width;
    c.height = grid.height;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(grid.width, grid.height);
    for (let i = 0; i < grid.idx.length; i++) {
      const e = grid.idx[i];
      if (e === EMPTY) continue;
      const p = grid.palette[e];
      img.data[i * 4] = p.r;
      img.data[i * 4 + 1] = p.g;
      img.data[i * 4 + 2] = p.b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [grid]);

  const materials = useMemo(() => {
    if (!grid) return [];
    return [...countBlocks(grid).entries()]
      .map(([id, n]) => ({ base: baseById.get(id)!, n }))
      .sort((a, b) => b.n - a.n);
  }, [grid]);
  const total = materials.reduce((s, m) => s + m.n, 0);

  // The layout whose shape is closest to the picture, keeping about as many maps as now.
  const suggestion = useMemo(() => {
    if (!grid) return null;
    const ratio = grid.sourceWidth / grid.sourceHeight;
    const longest = Math.max(2, Number(mapsX), Number(mapsY));
    let best: [number, number] = [1, 1];
    let bestErr = Infinity;
    for (let x = 1; x <= 4; x++)
      for (let y = 1; y <= 4; y++) {
        if (Math.max(x, y) !== longest) continue;
        const err = Math.abs(Math.log(x / y / ratio));
        if (err < bestErr) {
          bestErr = err;
          best = [x, y];
        }
      }
    return best[0] === Number(mapsX) && best[1] === Number(mapsY) ? null : best;
  }, [grid, mapsX, mapsY]);

  const take = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError(`${f.name} isn’t an image.`);
    setGrid(null);
    setFile(f);
  };

  const download = async (kind: 'litematic' | 'nbt') => {
    if (!grid) return;
    setExporting(kind);
    try {
      const [out] = await computeValue('map-export', {
        grid: { width: grid.width, height: grid.height, idx: grid.idx, palette: grid.palette },
        kind,
        staircase,
        dataVersion,
        name,
      });
      saveBlob(out.blob, out.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting('');
    }
  };

  const downloadPng = () => canvas.current?.toBlob((b) => b && saveBlob(b, `${name}.png`));
  const downloadList = () => {
    if (!grid) return;
    const lines = [
      `Map art: ${name}`,
      `${mapsX}×${mapsY} maps (${grid.width}×${grid.height} blocks), ${staircase ? `staircase, ${grid.buildHeight} blocks tall` : 'flat'}`,
      '',
      ...materials.map((m) => `${String(m.n).padStart(6)}  ${m.base.block.padEnd(24)} (${Math.floor(m.n / 64)} stacks + ${m.n % 64})`),
      `${String(grid.width).padStart(6)}  ${SUPPORT_BLOCK.block.padEnd(24)} (support row on the north edge, any block works)`,
      '',
      `${fmt(total + grid.width)} blocks total`,
    ];
    saveBlob(new Blob([lines.join('\n')], { type: 'text/plain' }), `${name}-blocks.txt`);
  };

  const mx = Number(mapsX);
  const my = Number(mapsY);

  const preview = (
    <Panel title={grid ? `preview · ${grid.width}×${grid.height}` : 'preview'}>
      {file ? (
        <div
          className="mapart-preview"
          // Width follows the shape of the layout, capped so the whole thing fits on screen.
          style={{ aspectRatio: `${mx} / ${my}`, width: `min(100%, calc((100dvh - 380px) * ${mx / my}))`, opacity: busy && grid ? 0.6 : 1 }}
        >
          <canvas ref={canvas} role="img" aria-label="Map art preview" />
          {/* One cell per map, so you can see where each 128×128 map ends. */}
          <div className="mapart-grid" style={{ backgroundSize: `${100 / mx}% ${100 / my}%` }} aria-hidden="true" />
          {!grid && <span className="mapart-wait mono">converting…</span>}
        </div>
      ) : (
        <p className="note">Pick a picture on the left to see it in map colors.</p>
      )}
      {grid && (
        <div className="stats">
          <div className="stat">
            <span className="stat-label">blocks</span>
            <span className="stat-value">{fmt(total + grid.width)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">colors used</span>
            <span className="stat-value">{materials.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">build height</span>
            <span className="stat-value">{staircase ? grid.buildHeight : 1}</span>
          </div>
        </div>
      )}
    </Panel>
  );

  const output = grid ? (
    <>
      <Panel title="download">
        <div className="seg">
          <button type="button" className="btn btn-primary" onClick={() => download('litematic')} disabled={!!exporting}>
            {exporting === 'litematic' ? 'building…' : '.litematic'}
          </button>
          <button type="button" className="btn" onClick={() => download('nbt')} disabled={!!exporting}>
            {exporting === 'nbt' ? 'building…' : mx * my > 1 ? `.nbt × ${mx * my} (zip)` : '.nbt'}
          </button>
          <button type="button" className="btn" onClick={downloadPng}>
            .png
          </button>
          <button type="button" className="btn" onClick={downloadList}>
            block list
          </button>
        </div>
        <details>
          <summary className="mono muted" style={{ cursor: 'pointer', minHeight: 40, display: 'flex', alignItems: 'center' }}>
            how to get it into the game
          </summary>
          <ol className="steps" style={{ marginTop: 6 }}>
            <li>
              <b>Litematica:</b> put the .litematic in <span className="mono">.minecraft/schematics/</span>, load it from the Litematica menu (M + C) and build along the
              hologram.
            </li>
            <li>
              <b>No mods:</b> put the .nbt in <span className="mono">world/generated/minecraft/structures/</span> and run{' '}
              <span className="mono">/place template minecraft:{name}_1 -64 ~ -65</span>
              {mx * my > 1 ? ' (then _2, _3… for the other maps, each 128 blocks further)' : ''}. A structure block can’t load it (they max out at
              48 blocks), but /place can.
            </li>
            <li>
              Each map covers a 128×128 area that starts at X and Z = −64 plus a multiple of 128. The art starts on that line and the cobblestone row sits one block
              north of it. Stand inside the area and use an empty map.
            </li>
            <li>Build in the Overworld or the End. In the Nether a map shows noise instead of your art.</li>
          </ol>
        </details>
      </Panel>
      <Panel title={`blocks · ${materials.length}`}>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {materials.map((m) => (
                <tr key={m.base.id}>
                  <td>
                    <span className="swatch" style={{ background: `#${m.base.rgb.toString(16).padStart(6, '0')}`, marginRight: 10 }} />
                    {m.base.block}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {fmt(m.n)}
                  </td>
                  <td className="mono muted" style={{ textAlign: 'right' }}>
                    {m.n >= 1728 ? `${(m.n / 1728).toFixed(1)} shulkers` : `${Math.ceil(m.n / 64)} stacks`}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="muted">{SUPPORT_BLOCK.block} (support row)</td>
                <td className="mono" style={{ textAlign: 'right' }}>
                  {fmt(grid.width)}
                </td>
                <td className="mono muted" style={{ textAlign: 'right' }}>
                  any block
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  ) : undefined;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files[0]);
  };

  return (
    <Workbench preview={preview} output={output}>
      <div
        className={`drop${over ? ' over' : ''}`}
        style={{ padding: file ? '20px 24px' : undefined }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={onDrop}
      >
        {!file && (
          <span className="accent">
            <UploadIcon />
          </span>
        )}
        <div className="drop-title">{file ? file.name : 'Drop a picture here'}</div>
        <button type="button" className={file ? 'btn' : 'btn btn-primary'} onClick={() => input.current?.click()}>
          {file ? 'Use another picture' : 'Choose a picture'}
        </button>
        {error && (
          <p className="drop-error" role="alert">
            {error}
          </p>
        )}
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
      </div>

      <section className="panel" aria-label="Settings">
        <OptRow id="ma-w" label="Maps wide" help="How many maps side by side. Each map is 128 × 128 blocks.">
          <Segmented labelledBy="ma-w" value={mapsX} onChange={setMapsX} compact options={SIZES} />
        </OptRow>
        <OptRow id="ma-h" label="Maps tall" help="How many maps stacked top to bottom.">
          <Segmented labelledBy="ma-h" value={mapsY} onChange={setMapsY} compact options={SIZES} />
        </OptRow>
        {suggestion && (
          <button
            type="button"
            className="btn btn-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              setMapsX(String(suggestion[0]));
              setMapsY(String(suggestion[1]));
            }}
          >
            match picture shape: {suggestion[0]} × {suggestion[1]}
          </button>
        )}
        <hr className="divider" />
        <OptRow id="ma-fit" label="Fit" help="Crop fills every map and cuts off what doesn’t fit. Whole picture leaves empty edges. Stretch fills exactly but squashes it.">
          <Segmented
            labelledBy="ma-fit"
            value={fit}
            onChange={setFit}
            options={[
              { value: 'cover', label: 'crop' },
              { value: 'contain', label: 'whole picture' },
              { value: 'stretch', label: 'stretch' },
            ]}
          />
        </OptRow>
        <hr className="divider" />
        <OptRow
          id="ma-shade"
          label="Shading"
          help="Flat: everything at one height, easy to build, one shade per color. Staircase: each block steps up or down from the one north of it, which gives 3 shades per color and a much better picture, but it’s harder to build."
        >
          <Segmented
            labelledBy="ma-shade"
            value={shading}
            onChange={setShading}
            options={[
              { value: 'flat', label: 'flat' },
              { value: 'staircase', label: 'staircase (3D)' },
            ]}
          />
        </OptRow>
        {staircase && (
          <OptRow
            id="ma-max"
            label="Max build height"
            help="How tall the staircase may get, in blocks. Lower is easier to build but uses the light and dark shades less often, so the picture gets a bit flatter. The world is 384 blocks tall."
          >
            <Segmented
              labelledBy="ma-max"
              value={maxHeight}
              onChange={setMaxHeight}
              compact
              options={['16', '32', '64', '128'].map((v) => ({ value: v, label: v }))}
            />
          </OptRow>
        )}
        <hr className="divider" />
        <OptRow
          id="ma-dither"
          label="Dithering"
          help="Mixes nearby colors so your eye sees shades the palette doesn’t have. Smooth suits photos, the grid pattern looks more regular, none keeps flat areas clean for logos and pixel art."
        >
          <Segmented
            labelledBy="ma-dither"
            value={dither}
            onChange={setDither}
            options={[
              { value: 'none', label: 'none' },
              { value: 'smooth', label: 'smooth' },
              { value: 'ordered', label: 'grid' },
            ]}
          />
        </OptRow>
        <hr className="divider" />
        <OptRow
          id="ma-cheap"
          label="Skip expensive blocks"
          help="Leaves out diamond, emerald, gold, lapis, iron, raw iron and froglights. For survival builds; the picture gets slightly fewer colors."
        >
          <Toggle labelledBy="ma-cheap" checked={skipExpensive} onChange={setSkipExpensive} />
        </OptRow>
        <hr className="divider" />
        <OptRow
          id="ma-ver"
          label="Minecraft version"
          help="The version the files are saved for. Newer versions open older files fine, but an older version can’t open files made for a newer one. Pick yours or older."
        >
          <select id="ma-ver" aria-labelledby="ma-ver" className="select mono" value={version} onChange={(e) => setVersion(e.target.value)}>
            {VERSIONS.map(([v]) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </OptRow>
      </section>
    </Workbench>
  );
}
