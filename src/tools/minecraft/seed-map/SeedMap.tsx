import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Help } from '../../../components/Help';
import { CopyButton, Toggle } from '../../../components/ui';
import { STRUCTURES, STRUCTURE_ICONS, SeedMapEngine, VERSIONS, biomeLabel, inVersion, randomSeed, worldKey, type World } from '../../../lib/mc/seedmap';
import { parseSeed } from '../../../lib/mc/slime';
import type { MetaResult } from '../../../workers/seedmap.worker';
import { MAX_BPP, MIN_BPP, MapCanvas, type Command, type Pick, type Pin, type View } from './MapCanvas';
import { SavedPanel } from '../../../components/SavedPanel';
import { useAutosave, useSaved } from '../../../lib/saved';

type SavedSeed = { seed: string; version: string; large: boolean };
type Place = SavedSeed & { x: number; y?: number; z: number };

const STORE = 'unktilz-seedmap-structures';

function StructIcon({ i }: { i: number }) {
  return (
    <span className="sm-marker" style={{ background: STRUCTURES[i].color }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={STRUCTURE_ICONS[STRUCTURES[i].key]} />
      </svg>
    </span>
  );
}
const fmt = (n: number) => n.toLocaleString('en-US');

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
}

function loadEnabled(): boolean[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Record<string, boolean> | null;
    if (saved) return STRUCTURES.map((s) => saved[s.key] ?? s.on);
  } catch {
    /* private mode etc. */
  }
  return STRUCTURES.map((s) => s.on);
}

/** A round length (1, 2 or 5 × 10ⁿ blocks) that's 70–170 px long at this zoom. */
function scaleBar(bpp: number) {
  for (let p = 1; p < 1e7; p *= 10)
    for (const m of [1, 2, 5]) {
      const blocks = m * p;
      if (blocks / bpp >= 70) return { blocks, px: blocks / bpp };
    }
  return { blocks: 0, px: 0 };
}

export default function SeedMap() {
  const [params, setParams] = useSearchParams();
  const first = useRef({
    /** A link with a seed wins over the last seed used. */
    fromLink: params.get('seed') !== null,
    seed: params.get('seed') ?? randomSeed(),
    // Links from before the newer versions were added used "1.21" for 1.21.4.
    version: ((v) => (VERSIONS.some((x) => x.id === v) ? v! : VERSIONS[0].id))(params.get('v') === '1.21' ? '1.21.4' : params.get('v')),
    large: params.get('large') === '1',
    view: {
      x: Number(params.get('x')) || 0,
      z: Number(params.get('z')) || 0,
      bpp: Math.min(MAX_BPP, Math.max(MIN_BPP, 2 ** (Number(params.get('zoom')) || 2))),
    },
  }).current;

  const [seedText, setSeedText] = useState(first.seed);
  const [version, setVersion] = useState<string>(first.version);
  const [large, setLarge] = useState(first.large);
  const [enabled, setEnabled] = useState(loadEnabled);
  const [meta, setMeta] = useState<MetaResult | null>(null);
  const [view, setView] = useState<View>(first.view);

  const current = useMemo<SavedSeed>(() => ({ seed: seedText, version, large }), [seedText, version, large]);
  const openSeed = (d: SavedSeed) => {
    setSeedText(d.seed);
    setVersion(VERSIONS.some((v) => v.id === d.version) ? d.version : VERSIONS[0].id);
    setLarge(!!d.large);
  };
  useAutosave<SavedSeed>('seed-map', current, (d) => !first.fromLink && openSeed(d));
  const places = useSaved<Place>('seed-map:places').items;
  const [hover, setHover] = useState<Pick | null>(null);
  const [selected, setSelected] = useState<Pick | null>(null);
  const [inView, setInView] = useState<number[]>([]);
  const [spawn, setSpawn] = useState<{ x: number; z: number } | null>(null);
  const [showSpawn, setShowSpawn] = useState(true);
  const [toast, setToast] = useState('');
  // Y for spots that were hovered or clicked, by world and position.
  const heights = useRef(new Map<string, number | 'loading'>());
  const [, setHeightsVersion] = useState(0);
  const [command, setCommand] = useState<Command>();
  const [gx, setGx] = useState('');
  const [gz, setGz] = useState('');
  const seedId = useId();
  const verId = useId();

  // Made in an effect (not useMemo) so a remount gets fresh workers instead of disposed ones.
  const [engine, setEngine] = useState<SeedMapEngine | null>(null);
  useEffect(() => {
    const e = new SeedMapEngine();
    setEngine(e);
    return () => e.dispose();
  }, []);

  const seed = parseSeed(seedText);
  const lastSeed = useRef(seed ?? 0n);
  if (seed !== null) lastSeed.current = seed;
  // While the field is empty or half-typed, keep showing the last good seed.
  const world: World = useMemo(() => ({ version, seed: lastSeed.current.toString(), large }), [version, large, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!engine) return;
    let alive = true;
    engine.meta(world).then((m) => alive && setMeta(m), () => {});
    return () => {
      alive = false;
    };
    // Names and colors only depend on the version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, version]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(STRUCTURES.map((s, i) => [s.key, enabled[i]]))));
    } catch {
      /* ignore */
    }
  }, [enabled]);

  // Keep the address shareable: seed, version and where you're looking.
  useEffect(() => {
    const t = setTimeout(() => {
      const next: Record<string, string> = { seed: world.seed, v: version, x: String(Math.round(view.x)), z: String(Math.round(view.z)), zoom: Math.log2(view.bpp).toFixed(2) };
      if (large) next.large = '1';
      setParams(next, { replace: true });
    }, 400);
    return () => clearTimeout(t);
  }, [world.seed, version, large, view, setParams]);

  useEffect(() => setSelected(null), [world.seed, version, large]);

  const hKey = (p: { x: number; z: number }) => `${worldKey(world)}|${p.x}|${p.z}`;
  /** Y to stand at for a spot, or undefined while it's being worked out. */
  const yOf = (p: { x: number; z: number } | null) => {
    if (!p) return undefined;
    const v = heights.current.get(hKey(p));
    return typeof v === 'number' ? v : undefined;
  };
  const standY = (p: { x: number; z: number }): Promise<number> => {
    const key = hKey(p);
    const v = heights.current.get(key);
    if (typeof v === 'number') return Promise.resolve(v);
    if (!engine) return Promise.reject(new Error('not ready'));
    heights.current.set(key, 'loading');
    return engine.standY(world, p.x, p.z).then(
      (y) => {
        heights.current.set(key, y);
        setHeightsVersion((n) => n + 1);
        return y;
      },
      (err) => {
        heights.current.delete(key);
        throw err;
      },
    );
  };
  const isPlace = (p: Pick | null) => !!p && (p.structure !== undefined || !!p.spawn || !!p.pin);
  // Saved places in the world on screen, as pins.
  const pins = useMemo<Pin[]>(
    () => places.filter((p) => p.data.seed === world.seed && p.data.version === version && !!p.data.large === large).map((p) => ({ x: p.data.x, z: p.data.z, name: p.name })),
    [places, world.seed, version, large],
  );
  const placeName = (p: Pick) => (p.pin ? p.pin : p.spawn ? 'World spawn' : p.structure !== undefined ? STRUCTURES[p.structure].name : 'Place');
  // Work out the Y of a structure as soon as it's hovered, so the label can show it.
  useEffect(() => {
    if (hover && isPlace(hover) && !heights.current.has(hKey(hover))) standY(hover).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover?.x, hover?.z, hover?.structure, hover?.spawn, engine, world]);
  useEffect(() => {
    if (selected && !heights.current.has(hKey(selected))) standY(selected).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, engine, world]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  /** Clicking a structure (or the spawn) copies its coordinates as "X Y Z". */
  const select = (p: Pick | null) => {
    setSelected(p);
    if (!p || !isPlace(p)) return;
    standY(p)
      .then((y) => `${p.x} ${y} ${p.z}`)
      .catch(() => `${p.x} ~ ${p.z}`)
      .then((text) => copyText(text).then(() => setToast(`Copied ${text}`)));
  };
  const coords = (p: { x: number; z: number }) => `${p.x} ${yOf(p) ?? '…'} ${p.z}`;

  useEffect(() => {
    if (!engine) return;
    let alive = true;
    setSpawn(null);
    engine.spawn(world).then((s) => alive && setSpawn(s), () => {});
    return () => {
      alive = false;
    };
  }, [engine, world]);

  const name = (id: number | null) => (id === null ? '…' : biomeLabel(meta?.names[id] ?? ''));
  const color = (id: number) => `#${(meta?.colors[id] ?? 0).toString(16).padStart(6, '0')}`;
  const visibleEnabled = enabled.map((on, i) => on && inVersion(i, version));
  const hiddenByZoom = STRUCTURES.some((s, i) => visibleEnabled[i] && view.bpp > s.maxBpp);
  const bar = scaleBar(view.bpp);

  const go = (e: FormEvent) => {
    e.preventDefault();
    const x = Number(gx);
    const z = Number(gz);
    if (!Number.isFinite(x) || !Number.isFinite(z) || gx.trim() === '' || gz.trim() === '') return;
    setCommand({ n: Date.now(), kind: 'goto', x, z, bpp: Math.min(view.bpp, 2) });
    setSelected({ x: Math.floor(x), z: Math.floor(z), biome: null });
  };

  const map = (
    <div className="sm-mapwrap">
      {engine ? (
        <MapCanvas
          engine={engine}
        world={world}
        structureIds={meta?.structureIds ?? null}
        enabled={visibleEnabled}
        initial={first.view}
        command={command}
        selected={selected}
          spawn={showSpawn ? spawn : null}
          pins={pins}
        onView={setView}
        onHover={setHover}
        onSelect={select}
          onBiomesInView={setInView}
        />
      ) : (
        <div className="sm-map" />
      )}
      <div className="sm-ctrl" role="group" aria-label="Map controls">
        <button type="button" className="btn btn-sm" aria-label="Zoom in" onClick={() => setCommand({ n: Date.now(), kind: 'zoom', factor: 0.5 })}>
          +
        </button>
        <button type="button" className="btn btn-sm" aria-label="Zoom out" onClick={() => setCommand({ n: Date.now(), kind: 'zoom', factor: 2 })}>
          −
        </button>
        <button type="button" className="btn btn-sm" title="Back to 0, 0" aria-label="Back to 0, 0" onClick={() => setCommand({ n: Date.now(), kind: 'goto', x: 0, z: 0 })}>
          ⌂
        </button>
      </div>
      {hover?.sx !== undefined && isPlace(hover) && (
        <div className="sm-tip" style={{ left: hover.sx + 16, top: hover.sy! - 12 }}>
          {placeName(hover)}
          <span className="sm-tip-xyz mono">{coords(hover)}</span>
        </div>
      )}
      <div className="sm-hover mono" aria-live="off">
        {hover ? (
          <>
            <b>{name(hover.biome)}</b> · X {fmt(hover.x)} · Z {fmt(hover.z)}
          </>
        ) : (
          <span className="muted">
            X {fmt(Math.round(view.x))} · Z {fmt(Math.round(view.z))}
          </span>
        )}
      </div>
      <div className="sm-scale mono" aria-hidden="true">
        <span style={{ width: bar.px }} />
        {fmt(bar.blocks)} blocks
      </div>
      {hiddenByZoom && <div className="sm-zoomnote mono">zoom in to see all structures</div>}
      {toast && (
        <div className="sm-toast mono" role="status">
          {toast}
        </div>
      )}
    </div>
  );

  const sel = selected && (
    <section className="panel sm-sel" aria-label="Selected spot">
      <div className="opt-row">
        <h2 className="panel-title">// {isPlace(selected) ? placeName(selected).toLowerCase() : 'spot'}</h2>
        <button type="button" className="btn btn-sm" onClick={() => setSelected(null)}>
          close
        </button>
      </div>
      <p className="mono sm-coords">
        {coords(selected)} <span className="muted">· {name(selected.biome)}</span>
      </p>
      <div className="seg">
        <CopyButton text={`${selected.x} ${yOf(selected) ?? '~'} ${selected.z}`} label="copy X Y Z" />
        <CopyButton text={`/tp @s ${selected.x} ${yOf(selected) ?? '~'} ${selected.z}`} label="copy /tp command" />
      </div>
      <p className="note">
        Y is where you’d stand: the ground there, or the water surface over the sea.
        {selected.structure !== undefined && ' The position is where the structure starts generating; the buildings spread out around it, and underground ones (ancient cities, trial chambers) are below this.'}
      </p>
    </section>
  );

  return (
    <div className="sm">
      <div className="sm-side">
        <section className="panel" aria-label="World">
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <label htmlFor={seedId} className="field-label">
                World seed
              </label>
              <Help label="World seed" text="Type /seed in the game to see it (needs cheats or operator). Words work too: the game turns a text seed into a number the same way." />
            </span>
            <div className="inline">
              <input
                id={seedId}
                className="input mono"
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="e.g. -4172144997902289642"
              />
              <button type="button" className="btn" title="Random seed" onClick={() => setSeedText(randomSeed())}>
                random
              </button>
            </div>
            {seed !== null && String(seed) !== seedText.trim() && <span className="note mono">= {String(seed)}</span>}
          </div>
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <label htmlFor={verId} className="field-label">
                Minecraft version
              </label>
              <Help
                label="Minecraft version"
                text="Java Edition. World generation changes between versions, so the same seed can give a different world: 1.18 rebuilt it completely, and newer drops add biomes and structures (pale garden, sulfur caves, dappled forest, abandoned camps). Pick the version the world was created in."
              />
            </span>
            <select id={verId} className="select mono" value={version} onChange={(e) => setVersion(e.target.value)}>
              {VERSIONS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div className="opt-row">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <span className="opt-label" id="sm-large">
                Large biomes
              </span>
              <Help label="Large biomes" text="Only if the world was created with the “Large Biomes” world type." />
            </span>
            <Toggle labelledBy="sm-large" checked={large} onChange={setLarge} />
          </div>
          <form className="field" onSubmit={go}>
            <span className="field-label">Go to</span>
            <div className="inline sm-goto">
              <input className="input mono" aria-label="X" placeholder="X" inputMode="numeric" value={gx} onChange={(e) => setGx(e.target.value)} />
              <input className="input mono" aria-label="Z" placeholder="Z" inputMode="numeric" value={gz} onChange={(e) => setGz(e.target.value)} />
              <button type="submit" className="btn">
                go
              </button>
            </div>
          </form>
        </section>

        <section className="panel" aria-label="Structures">
          <div className="opt-row">
            <h2 className="panel-title">// structures</h2>
            <span className="seg">
              <button type="button" className="btn btn-sm" onClick={() => setEnabled(STRUCTURES.map(() => true))}>
                all
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setEnabled(STRUCTURES.map(() => false))}>
                none
              </button>
            </span>
          </div>
          <div className="sm-structs">
            <label className="sm-struct">
              <input type="checkbox" checked={showSpawn} onChange={(e) => setShowSpawn(e.target.checked)} />
              <span className="sm-spawn-icon" aria-hidden="true">
                +
              </span>
              <span>World spawn</span>
            </label>
            {STRUCTURES.map((s, i) => {
              const ok = inVersion(i, version);
              return (
                <label key={s.key} className={`sm-struct${ok ? '' : ' off'}`} title={ok ? undefined : 'Not in this version'}>
                  <input type="checkbox" checked={enabled[i] && ok} disabled={!ok} onChange={(e) => setEnabled(enabled.map((v, j) => (j === i ? e.target.checked : v)))} />
                  <StructIcon i={i} />
                  <span>{s.name}</span>
                </label>
              );
            })}
          </div>
          <p className="note">Only spots where the structure really generates are shown. Desert and jungle temples and mansions can rarely be missing in-game when the ground there is too uneven.</p>
        </section>

        <SavedPanel<SavedSeed>
          slug="seed-map"
          title="my seeds"
          help="Seeds you want to come back to, with their version."
          suggestName={() => seedText.trim()}
          getData={() => (seed === null ? null : current)}
          onLoad={openSeed}
          describe={(i) => `${VERSIONS.find((v) => v.id === i.data.version)?.label ?? i.data.version}${i.data.large ? ' · large biomes' : ''}`}
          emptyText="No saved seeds yet."
        />
        <SavedPanel<Place>
          slug="seed-map:places"
          title="my places"
          help="Click a spot or structure on the map, then save it here. Saved places show as white pins on the map; click one in the list to fly there."
          saveLabel="save place"
          loadLabel="Go to"
          undoable={false}
          suggestName={() => (selected ? placeName(selected) : '')}
          getData={() => (selected ? { ...current, seed: world.seed, x: selected.x, y: yOf(selected), z: selected.z } : null)}
          onLoad={(d) => {
            if (d.seed !== world.seed || d.version !== version || !!d.large !== large) openSeed(d);
            setCommand({ n: Date.now(), kind: 'goto', x: d.x, z: d.z, bpp: Math.min(view.bpp, 2) });
            setSelected({ x: d.x, z: d.z, biome: null });
          }}
          describe={(i) => `${i.data.x} ${i.data.y ?? '~'} ${i.data.z}${i.data.seed === world.seed ? '' : ` · seed ${i.data.seed}`}`}
          emptyText="No saved places. Click a spot on the map first."
        />
        {inView.length > 0 && (
          <section className="panel" aria-label="Biomes on the map">
            <h2 className="panel-title">// biomes in view</h2>
            <ul className="sm-legend">
              {inView.slice(0, 24).map((id) => (
                <li key={id}>
                  <span className="sm-swatch" style={{ background: color(id) }} aria-hidden="true" />
                  {name(id)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="sm-main">
        {map}
        {sel}
      </div>
    </div>
  );
}
