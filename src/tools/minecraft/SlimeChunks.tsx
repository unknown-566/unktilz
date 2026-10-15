import { useMemo, useState } from 'react';
import { NumberField, Panel, Stat, TextField, num } from '../../components/ui';
import { isSlimeChunk, parseSeed } from '../../lib/mc/slime';
import { Workbench } from '../../components/Workbench';

const R = 12; // chunks around the center → 25×25 grid

export default function SlimeChunks() {
  const [seedText, setSeedText] = useState('');
  const [x, setX] = useState('0');
  const [z, setZ] = useState('0');
  const [picked, setPicked] = useState<[number, number] | null>(null);

  const seed = parseSeed(seedText);
  const cx = Math.floor(num(x)) >> 4;
  const cz = Math.floor(num(z)) >> 4;

  const grid = useMemo(() => {
    if (seed === null) return null;
    const rows: boolean[][] = [];
    for (let dz = -R; dz <= R; dz++) {
      const row: boolean[] = [];
      for (let dx = -R; dx <= R; dx++) row.push(isSlimeChunk(seed, cx + dx, cz + dz));
      rows.push(row);
    }
    return rows;
  }, [seed, cx, cz]);

  const nearest = useMemo(() => {
    if (!grid) return null;
    let best: [number, number, number] | null = null;
    grid.forEach((row, iz) =>
      row.forEach((slime, ix) => {
        if (!slime) return;
        const d = Math.hypot(ix - R, iz - R);
        if (!best || d < best[2]) best = [cx + ix - R, cz + iz - R, d];
      }),
    );
    return best as [number, number, number] | null;
  }, [grid, cx, cz]);

  const count = grid?.flat().filter(Boolean).length ?? 0;
  const sel = picked ?? (nearest ? [nearest[0], nearest[1]] : null);

  const map = !grid ? (
    <Panel title="slime chunks">
      <p className="note">Enter your world seed to see the slime chunks around you.</p>
    </Panel>
  ) : (
    <Panel title={`slime chunks · ${count} of ${(R * 2 + 1) ** 2}`}>
      <div
        role="grid"
        aria-label="Chunks around you, north at the top"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${R * 2 + 1}, minmax(0, 1fr))`,
          gap: 2,
          // As big as the column allows while the whole map still fits on screen.
          width: 'min(100%, calc(100dvh - 340px))',
          minWidth: 260,
        }}
      >
        {grid.map((row, iz) => (
          <div role="row" key={iz} style={{ display: 'contents' }}>
            {row.map((slime, ix) => {
              const gx = cx + ix - R;
              const gz = cz + iz - R;
              const here = ix === R && iz === R;
              const isSel = sel && sel[0] === gx && sel[1] === gz;
              return (
                <button
                  key={ix}
                  type="button"
                  role="gridcell"
                  aria-label={`Chunk ${gx}, ${gz}${slime ? ', slime chunk' : ''}${here ? ', you are here' : ''}`}
                  aria-selected={!!isSel}
                  tabIndex={here ? 0 : -1}
                  onClick={() => setPicked([gx, gz])}
                  style={{
                    aspectRatio: '1',
                    padding: 0,
                    minWidth: 0,
                    borderRadius: 3,
                    border: isSel ? '2px solid var(--fg)' : here ? '2px solid var(--accent-text)' : '1px solid var(--line)',
                    background: slime ? 'var(--accent)' : 'var(--bg)',
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      {sel && (
        <div className="stats">
          <Stat label="chunk" value={`${sel[0]}, ${sel[1]}`} />
          <Stat label="blocks from" value={`${sel[0] * 16}, ${sel[1] * 16}`} />
          <Stat label="blocks to" value={`${sel[0] * 16 + 15}, ${sel[1] * 16 + 15}`} />
          <Stat label="slime chunk" value={isSlimeChunk(seed!, sel[0], sel[1]) ? 'yes' : 'no'} />
        </div>
      )}
      <p className="note">Outlined square: your chunk. Click a square for its block range.</p>
    </Panel>
  );

  return (
    <Workbench preview={map}>
      <section className="panel" aria-label="Seed and position">
        <TextField
          label="World seed"
          value={seedText}
          onChange={setSeedText}
          placeholder="-4172144997902289642"
          mono
          autoFocus
          help="Type /seed in the game to see it (needs operator or cheats). Words work too: the game turns a text seed into a number the same way."
        />
        <div className="fields">
          <NumberField label="Your X" value={x} onChange={setX} />
          <NumberField label="Your Z" value={z} onChange={setZ} />
        </div>
        <p className="note">
          Slimes spawn in slime chunks below Y 40 in any light level, except in mushroom fields. Bedrock Edition uses a different rule.
        </p>
      </section>
    </Workbench>
  );
}
