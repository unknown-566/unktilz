// Builds src/workers/cubiomes.wasm from cubiomes and scripts/seedmap.c. Uses xpple's fork
// (MIT, github.com/xpple/cubiomes, the one SeedMapper uses): it keeps up with new Minecraft
// versions, while upstream Cubitect/cubiomes stops at 1.21.4.
// Needs Zig (winget install zig.zig). The .wasm is committed, so normal builds don't need this.
//   node scripts/build-cubiomes.mjs          → wasm
//   node scripts/build-cubiomes.mjs --native → also a native test binary in vendor/
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'https://github.com/xpple/cubiomes';
const COMMIT = '4f04235f3e6e25491a02a830e4f500f68045be17'; // 2026-10-02, generation up to 26.3
const root = join(import.meta.dirname, '..');
const src = join(root, 'vendor', 'cubiomes-xpple');

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

if (!existsSync(src)) execFileSync('git', ['clone', '-q', REPO, src], { stdio: 'inherit' });
execFileSync('git', ['-C', src, 'fetch', '-q', 'origin'], { stdio: 'inherit' });
execFileSync('git', ['-C', src, 'checkout', '-q', COMMIT], { stdio: 'inherit' });

// The library's own source list (CMakeLists.txt), minus quadbase.c: that's the quad-witch-hut seed
// search, which needs threads and isn't used by the map. Unused code is dropped at link time.
const cmake = readFileSync(join(src, 'CMakeLists.txt'), 'utf8');
const files = cmake
  .slice(cmake.indexOf('set(SOURCES'), cmake.indexOf(')', cmake.indexOf('set(SOURCES')))
  .split(/\s+/)
  .filter((f) => f.endsWith('.c') && f !== 'quadbase.c')
  .map((f) => join(src, f));
const common = ['-O3', '-Wno-c23-extensions', `-I${src}`, ...files, join(root, 'scripts', 'seedmap.c')];

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
  console.log('wrote vendor/cubiomes-xpple/seedmap-test.exe');
}
