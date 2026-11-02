// The full-size art sixel draws (sixel.mjs, modelArt.mjs): creature sprites, icons and one gear file per body,
// about 179 MB, too much to ship to every terminal that cannot draw it. The package carries only the manifest
// (src/data/hd-art.json: the release tag, and each file's name, size and sha256); the files are assets of that
// GitHub release, fetched on request into ~/.azsh/art/<tag>/ and checked against the manifest.
//
// A checkout that baked them (npm run art:hd) has them in src/data and uses those; AZSH_ART_DIR points
// anywhere else. scripts/publish-hd-art.mjs writes the manifest and uploads a release.
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

let manifest;
/** { tag, base, files: [{ name, path, size, sha256 }] }, or null when the package has none. */
export function hdManifest() {
  if (manifest !== undefined) return manifest;
  try { manifest = JSON.parse(readFileSync(join(DATA_DIR, 'hd-art.json'), 'utf8')); } catch { manifest = null; }
  return manifest;
}

/** Where downloaded art goes: ~/.azsh/art/<tag>/. */
export function downloadDir() {
  const m = hdManifest();
  return process.env.AZSH_ART_DIR ?? join(process.env.AZSH_HOME ?? join(homedir(), '.azsh'), 'art', m?.tag ?? 'local');
}

/** The file to read for an art path ("model-art-hd.bin.br", "gear-art-hd/orc-male.bin.br"): the download, or a
 *  checkout's own bake (unless AZSH_ART_DIR says where the art is). Null when neither is there. */
export function hdArtPath(path) {
  const got = join(downloadDir(), path);
  if (existsSync(got)) return got;
  if (process.env.AZSH_ART_DIR) return null;
  const baked = join(DATA_DIR, path);
  return existsSync(baked) ? baked : null;
}

/** The manifest's files not on disk yet. */
export function missingHdArt() {
  const m = hdManifest();
  return m ? m.files.filter((f) => !hdArtPath(f.path)) : [];
}

/** Bytes still to fetch. */
export const missingHdBytes = () => missingHdArt().reduce((n, f) => n + f.size, 0);

/**
 * Fetch every missing file from the release. `onProgress(done, total)` in bytes. Each file is written beside
 * its place, hashed as it streams, and moved in only when the sha256 matches. Resolves { ok, reason }.
 */
export async function downloadHdArt(onProgress = () => {}) {
  const m = hdManifest();
  if (!m) return { ok: false, reason: 'This build has no art manifest.' };
  const todo = missingHdArt(), total = todo.reduce((n, f) => n + f.size, 0);
  let done = 0;
  for (const f of todo) {
    const dest = join(downloadDir(), f.path), part = `${dest}.part`;
    mkdirSync(dirname(dest), { recursive: true });
    try {
      const res = await fetch(`${m.base}${f.name}`);
      if (!res.ok || !res.body) return { ok: false, reason: `${f.name}: HTTP ${res.status}` };
      const hash = createHash('sha256'), out = createWriteStream(part);
      for await (const chunk of Readable.fromWeb(res.body)) {
        hash.update(chunk);
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        done += chunk.length;
        onProgress(done, total);
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
      if (hash.digest('hex') !== f.sha256) { rmSync(part, { force: true }); return { ok: false, reason: `${f.name} did not match its checksum` }; }
      renameSync(part, dest);
    } catch (e) {
      rmSync(part, { force: true });
      return { ok: false, reason: `${f.name}: ${e.message}` };
    }
  }
  return { ok: true };
}
