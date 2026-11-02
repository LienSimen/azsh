// Publish the full-size art (npm run art:hd) as a GitHub release the game downloads from (hdArt.mjs), and
// write src/data/hd-art.json, the manifest the package carries: the tag, the download base and each file's
// name, size and sha256. Dev only; --upload needs the gh CLI signed in with push access.
//
//   node scripts/publish-hd-art.mjs [--tag art-1] [--upload]
//
// Without --upload it only writes the manifest (check it, commit it, then upload). A new bake needs a new tag:
// a game that has art-1 keeps it, and one that sees art-2 in its manifest fetches art-2.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src/data');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const TAG = opt('--tag', 'art-1');
const REPO = 'LienSimen/azsh';

// path under src/data -> release asset name (assets are flat, so a gear body's file takes its folder's name).
const paths = ['model-art-hd.bin.br', 'icon-art-hd.bin.br', ...readdirSync(join(DATA, 'gear-art-hd')).filter((f) => f.endsWith('.bin.br')).sort().map((f) => `gear-art-hd/${f}`)];
const files = paths.map((path) => {
  const buf = readFileSync(join(DATA, path));
  return { name: path.replace('/', '-'), path, size: statSync(join(DATA, path)).size, sha256: createHash('sha256').update(buf).digest('hex') };
});
const manifest = { tag: TAG, base: `https://github.com/${REPO}/releases/download/${TAG}/`, files };
writeFileSync(join(DATA, 'hd-art.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const mb = files.reduce((n, f) => n + f.size, 0) / 1e6;
console.error(`${files.length} files, ${mb.toFixed(1)} MB -> src/data/hd-art.json (${TAG})`);

if (args.includes('--upload')) {
  const stage = join(tmpdir(), `azsh-${TAG}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage);
  for (const f of files) copyFileSync(join(DATA, f.path), join(stage, f.name));
  const notes = `Full-size art for terminals that draw sixel: creature sprites, icons and every body's gear (${mb.toFixed(0)} MB). azsh offers to download it the first time it finds such a terminal.

Personal, non-commercial homage. These pictures are World of Warcraft icons and model renders and are the property of Blizzard Entertainment or its licensors; this project is not affiliated with or endorsed by Blizzard.`;
  execFileSync('gh', ['release', 'create', TAG, '--repo', REPO, '--title', `Art: ${TAG}`, '--notes', notes, ...files.map((f) => join(stage, f.name))], { stdio: 'inherit' });
  rmSync(stage, { recursive: true, force: true });
  console.error(`uploaded ${TAG}`);
}
