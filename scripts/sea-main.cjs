// Entry point baked into azsh.exe (see scripts/build-exe.mjs). The app tree ships as one gzipped
// archive asset: the first run unpacks it to <LOCALAPPDATA>/azsh/app-<id>, later runs reuse it, and
// bin/azsh.mjs is imported from there so every module keeps its on-disk layout.
const { getAsset } = require('node:sea');
const { existsSync, mkdirSync, writeFileSync, renameSync, rmSync, readdirSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { gunzipSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');
const { homedir } = require('node:os');

const id = getAsset('id', 'utf8').trim();
const base = join(process.env.LOCALAPPDATA ?? join(homedir(), '.azsh'), 'azsh');
const dir = join(base, `app-${id}`);

function unpack() {
  const buf = gunzipSync(Buffer.from(getAsset('app')));
  const headLen = buf.readUInt32LE(0);
  const entries = JSON.parse(buf.subarray(4, 4 + headLen).toString('utf8'));
  const tmp = `${dir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  let off = 4 + headLen;
  for (const [rel, size] of entries) {
    const out = join(tmp, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, buf.subarray(off, off + size));
    off += size;
  }
  writeFileSync(join(tmp, '.ok'), id);
  try { renameSync(tmp, dir); } catch { rmSync(tmp, { recursive: true, force: true }); } // another launch won the race
  for (const d of readdirSync(base)) {
    if (d.startsWith('app-') && d !== `app-${id}`) try { rmSync(join(base, d), { recursive: true, force: true }); } catch { /* still in use */ }
  }
}

if (!existsSync(join(dir, '.ok'))) {
  mkdirSync(base, { recursive: true });
  process.stderr.write('azsh: unpacking game data (first run only)...\n');
  unpack();
}
import(pathToFileURL(join(dir, 'bin', 'azsh.mjs')).href).catch((e) => { console.error(e); process.exit(1); });
