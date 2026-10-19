// Builds the site (dist/) when it is missing, older than its sources or from another version;
// otherwise does nothing.
// start.bat runs this before serving the built site, so the first start and the first start after
// an update take a moment longer, and every other start is instant.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = join(root, 'dist', '.built');
const SOURCES = ['src', 'public', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'CHANGELOG.md'];

/** The newest change time of a file, or of anything inside a folder. */
function newest(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = st.mtimeMs;
  for (const name of readdirSync(path)) max = Math.max(max, newest(join(path, name)));
  return max;
}

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
/** What the last build was made from: its version, and when. */
const last = (() => {
  try {
    return existsSync(join(root, 'dist', 'index.html')) ? JSON.parse(readFileSync(stamp, 'utf8')) : null;
  } catch {
    return null;
  }
})();
const changed = Math.max(...SOURCES.map((s) => newest(join(root, s))));
// update.bat copies files with their GitHub times, which can be older than the last build: a new
// version number (every update has one) also means a new build.
const fresh = !!last && last.version === version && last.at >= changed;
if (process.argv.includes('--check')) {
  console.log(fresh ? 'up to date' : 'needs build');
  process.exit(0);
}
if (fresh) process.exit(0);

console.log('\n  Preparing the site (only after an update, takes about half a minute)...\n');
// Vite is run with node directly: npm's launcher scripts break when the folder path has an "&" in it.
const r = spawnSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
writeFileSync(stamp, JSON.stringify({ version, at: Date.now() }));
