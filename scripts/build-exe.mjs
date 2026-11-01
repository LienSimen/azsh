// Build a standalone azsh executable (Node single executable application): the running node binary
// plus scripts/sea-main.cjs plus bin/ and src/ packed as one gzipped asset. The exe needs no Node
// install; it runs on the Node version that built it. Output: dist/azsh(.exe).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, rmSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const WORK = join(DIST, 'sea');
const win = process.platform === 'win32';
const mac = process.platform === 'darwin';

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Archive: u32 header length, header JSON [[relPath, size], ...], then the file bodies in order.
// docs/ rides along because a few engine modules import survey tables from it.
const files = [join(ROOT, 'package.json'), ...['bin', 'src', 'docs'].flatMap((d) => walk(join(ROOT, d)))];
const bodies = files.map((f) => readFileSync(f));
const head = Buffer.from(JSON.stringify(files.map((f, i) => [relative(ROOT, f).split(sep).join('/'), bodies[i].length])));
const len = Buffer.alloc(4);
len.writeUInt32LE(head.length);
const archive = gzipSync(Buffer.concat([len, head, ...bodies]), { level: 9 });
const id = createHash('sha256').update(archive).update(process.version).digest('hex').slice(0, 12);

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
writeFileSync(join(WORK, 'app.bin'), archive);
writeFileSync(join(WORK, 'id.txt'), id);
writeFileSync(join(WORK, 'sea-config.json'), JSON.stringify({
  main: join(ROOT, 'scripts', 'sea-main.cjs'),
  output: join(WORK, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
  assets: { app: join(WORK, 'app.bin'), id: join(WORK, 'id.txt') },
}, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', join(WORK, 'sea-config.json')], { stdio: 'inherit' });

const exe = join(DIST, win ? 'azsh.exe' : 'azsh');
rmSync(exe, { force: true });
copyFileSync(process.execPath, exe);
if (mac) execFileSync('codesign', ['--remove-signature', exe], { stdio: 'inherit' });
const inject = [exe, 'NODE_SEA_BLOB', join(WORK, 'sea-prep.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'];
if (mac) inject.push('--macho-segment-name', 'NODE_SEA');
execSync(`npx --yes postject@1.0.0-alpha.6 ${inject.map((a) => `"${a}"`).join(' ')}`, { stdio: 'inherit' });
if (mac) execFileSync('codesign', ['--sign', '-', exe], { stdio: 'inherit' });

const mb = (b) => (b / 1048576).toFixed(1);
console.log(`built ${relative(ROOT, exe)} (${mb(statSync(exe).size)} MB, app ${mb(archive.length)} MB, id ${id}, node ${process.version})`);
