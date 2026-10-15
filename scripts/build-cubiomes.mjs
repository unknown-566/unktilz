// Builds src/workers/cubiomes.wasm from cubiomes (MIT, github.com/Cubitect/cubiomes) and scripts/seedmap.c.
// Needs Zig (winget install zig.zig). The .wasm is committed, so normal builds don't need this.
//   node scripts/build-cubiomes.mjs          → wasm
//   node scripts/build-cubiomes.mjs --native → also a native test binary in vendor/
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const COMMIT = 'e61f90580cbdd883214a8054670dacae655e59c0'; // 2024-11-10, generation up to 1.21.4
const root = join(import.meta.dirname, '..');
const src = join(root, 'vendor', 'cubiomes');

function zig() {
  try {
    execFileSync('zig', ['version'], { stdio: 'ignore' });
    return 'zig';
  } catch {
    // winget puts a link here, which a shell started before the install doesn't have on PATH yet.
    const link = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'zig.exe');
    if (existsSync(link)) return link;
    throw new Error('Zig not found. Install it with: winget install zig.zig');
  }
}

if (!existsSync(src)) execFileSync('git', ['clone', '-q', 'https://github.com/Cubitect/cubiomes', src], { stdio: 'inherit' });
execFileSync('git', ['-C', src, 'fetch', '-q', 'origin'], { stdio: 'inherit' });
execFileSync('git', ['-C', src, 'checkout', '-q', COMMIT], { stdio: 'inherit' });

// quadbase.c is the quad-witch-hut seed search; it needs threads and the map doesn't use it.
const files = readdirSync(src)
  .filter((f) => f.endsWith('.c') && f !== 'tests.c' && f !== 'quadbase.c')
  .map((f) => join(src, f));
const common = ['-O3', `-I${src}`, ...files, join(root, 'scripts', 'seedmap.c')];

execFileSync(
  zig(),
  [
    'cc',
    '-target',
    'wasm32-wasi',
    '-mexec-model=reactor',
    '-fvisibility=hidden',
    '-Wl,--export-dynamic',
    '-Wl,--strip-all',
    ...common,
    '-o',
    join(root, 'src', 'workers', 'cubiomes.wasm'),
  ],
  { stdio: 'inherit' },
);
console.log('wrote src/workers/cubiomes.wasm');

if (process.argv.includes('--native')) {
  execFileSync(zig(), ['cc', ...common, join(root, 'scripts', 'seedmap-test.c'), '-o', join(src, 'seedmap-test.exe')], { stdio: 'inherit' });
  console.log('wrote vendor/cubiomes/seedmap-test.exe');
}
