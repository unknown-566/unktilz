import { useState } from 'react';
import { NumberField, Output, Panel, Stat, num } from '../../components/ui';

export default function ChunkFinder() {
  const [x, setX] = useState('');
  const [y, setY] = useState('64');
  const [z, setZ] = useState('');

  const bx = Math.floor(num(x));
  const by = Math.floor(num(y, 64));
  const bz = Math.floor(num(z));
  const cx = bx >> 4;
  const cz = bz >> 4;
  const sy = by >> 4;
  const rx = cx >> 5;
  const rz = cz >> 5;

  return (
    <>
      <section className="panel" aria-label="Block coordinates">
        <div className="fields">
          <NumberField label="Block X" value={x} onChange={setX} placeholder="0" />
          <NumberField label="Block Y" value={y} onChange={setY} />
          <NumberField label="Block Z" value={z} onChange={setZ} placeholder="0" />
        </div>
      </section>

      <Panel title="result">
        <div className="stats" aria-live="polite">
          <Stat label="chunk" value={`${cx}, ${cz}`} />
          <Stat label="in chunk (x y z)" value={`${bx & 15} ${by & 15} ${bz & 15}`} />
          <Stat label="section" value={sy} />
          <Stat label="region file" value={`r.${rx}.${rz}.mca`} />
          <Stat label="chunk in region" value={`${cx & 31}, ${cz & 31}`} />
        </div>
        <Output label="Chunk spans (from → to)" value={`${cx * 16} ${cz * 16} → ${cx * 16 + 15} ${cz * 16 + 15}`} />
        <Output label="Force-load this chunk" value={`/forceload add ${cx * 16} ${cz * 16}`} />
        <p className="note">
          Region files live in world/region (Overworld), world/DIM-1/region (Nether) and world/DIM1/region (End). Each holds 32×32 chunks.
        </p>
      </Panel>
    </>
  );
}
