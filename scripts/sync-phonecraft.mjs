// Re-copy phonecraft's engine, rules and data into this tree. Usage: node scripts/sync-phonecraft.mjs [path]
// (default ../../code/phonecraft, or PHONECRAFT). `--dry` lists what would change. Keeps the azsh shims,
// skips web-only files, re-applies the azsh patches below and gzips any changed data table.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');
const PC = process.argv.slice(2).find((a) => !a.startsWith('--'))
  ?? process.env.PHONECRAFT ?? join(ROOT, '..', '..', 'code', 'phonecraft');
const DIRS = ['engine', 'domain', 'world', 'quests', 'progression', 'persistence', 'autopilot', 'data'];
// Web only, or audio this tree never loads.
const SKIP = [
  /\.test\.ts$/, /^engine\/combat\/simWorker\.ts$/, /^persistence\/indexedDbRepository\.ts$/,
  /^data\/(game-data|sound-data)\.ts$/, /^data\/index\//,
  /^data\/tables\/(creatureSound|npcVoice|raceSoundRef|spellImpactSounds|spellSound|textVoice|weaponSounds)/,
];
// azsh-only files that replace phonecraft UI imports.
const KEEP = ['world/bakeSlug.ts', 'world/navmeshFloors.ts'];
// [file, from, to]: azsh edits re-applied after every copy. `from` in UI_COPIES may be a global RegExp.
const PATCHES = [
  ['world/dungeonWingRooms.ts', "from '../ui/dungeon/navmeshFloors.ts';", "from './navmeshFloors.ts';"],
  ['world/dungeonWingRooms.ts', "import { bakeSlugForInstance } from '../ui/dungeon/dungeonBakeLoader.ts';",
    "import { bakeSlugForInstance } from './bakeSlug.ts';"],
  // A text game rests more often: there is no floor to watch the bar drain on.
  ['autopilot/config.ts', '  healthEnterPct: 0.5,   // mirrors the dev bot LOW_HEALTH', '  healthEnterPct: 0.75,'],
  ['autopilot/config.ts', '  manaEnterPct: 0.3,     // mirrors the dev bot LOW_MANA', '  manaEnterPct: 0.75,'],
  ['autopilot/config.ts', '  recoverToPct: 0.9,     // mirrors the dev bot RECOVER_TO', '  recoverToPct: 1,'],
];

// Phonecraft UI files the terminal runs unchanged apart from import paths: [phonecraft src path, azsh src path, extra patches].
const ACTION_BAR_MACRO_INFO = `// Copied from phonecraft src/ui/macros/macroHostCombat.ts; only this type came from its action bar model.
export interface ActionBarMacroInfo {
  name: string;
  icon?: string;
  showSpellId?: number;
  showItemEntry?: number;
  /** Cooldown of the thing the macro would fire, so the button swipes like a normal one. */
  cooldownRemainingMs?: number;
  usable?: boolean;
  reason?: string;
}`;
const UI_COPIES = [
  ['ui/macros/macroHostWorld.ts', 'cli/macroHostWorld.ts', [['// Runs a macro out in the world', '// Copied from phonecraft src/ui/macros/macroHostWorld.ts (import paths only).' + String.fromCharCode(10) + '// Runs a macro out in the world']]],
  ['ui/macros/macroHostCombat.ts', 'cli/macroHostCombat.ts', [["import type { ActionBarMacroInfo } from '../combat/actionBarModel.ts';", ACTION_BAR_MACRO_INFO]]],
  // The wiki's name index and item-source index are pure; the terminal draws its own pages over them.
  ['ui/wiki/wikiIndex.ts', 'cli/wikiIndex.ts', []],
  ['ui/wiki/wikiSources.ts', 'cli/wikiSources.ts', []],
  // Stratholme's Baron Run, Ysida, Barthilas and Aurius over the continuous floor (tuiFloor.mjs gives it a context).
  ['ui/live/liveStratUndead.ts', 'cli/liveStratUndead.ts', [["import type { LiveDungeonCtx } from './liveDungeonCtx.ts';",
    '// The live controller context, as much of it as this module reads; tuiFloor.mjs builds one.' + String.fromCharCode(10) + '// eslint-disable-next-line @typescript-eslint/no-explicit-any' + String.fromCharCode(10) + 'type LiveDungeonCtx = any;']]],
  // Gauntlets, waves, escorts, Moira's release, Finkle and Celebras over the same floor. Its bare imports are UI
  // modules loaded for their side effects; the terminal has no sound and strips the feed's markup.
  ['ui/live/liveGauntletEscort.ts', 'cli/liveGauntletEscort.ts', [
    [/^import '[^']+';\n/gm, ''],
    ["import type { LiveDungeonCtx } from './liveDungeonCtx.ts';",
      '// The live controller context, as much of it as this module reads; tuiFloor.mjs builds one.' + String.fromCharCode(10) + '// eslint-disable-next-line @typescript-eslint/no-explicit-any' + String.fromCharCode(10) + 'type LiveDungeonCtx = any;'],
    ["import type { FloorGauntlet, LiveRouteEditNode } from './liveDungeonCtx.ts';", 'type LiveRouteEditNode = unknown;'],
    ["import { sound } from '../audio/sfx.ts';", 'const sound = { clip: (_name: string): void => {} };'],
    ["import { esc } from '../core/format.ts';",
      "const esc = (s: string): string => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');"],
  ]],
];

const walk = (d, b = '') => (existsSync(join(d, b)) ? readdirSync(join(d, b), { withFileTypes: true }) : [])
  .flatMap((e) => (e.isDirectory() ? walk(d, join(b, e.name)) : [join(b, e.name)]));
const posix = (p) => p.split(sep).join('/');
const lf = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
const gz = (rel) => rel.startsWith('data/') && rel.endsWith('.json');

const changed = [], added = [], removed = [], patchMiss = [];
const want = new Map();
for (const dir of DIRS) {
  for (const f of walk(join(PC, 'src', dir))) {
    const rel = posix(join(dir, f));
    if (SKIP.some((re) => re.test(rel))) continue;
    want.set(rel, lf(readFileSync(join(PC, 'src', rel))));
  }
}
for (const [file, from, to] of PATCHES) {
  const s = want.get(file);
  if (s == null || !s.includes(from)) { patchMiss.push(`${file}: ${from.trim()}`); continue; }
  want.set(file, s.replace(from, to));
}
for (const [rel, text] of want) {
  const dest = join(ROOT, 'src', gz(rel) ? `${rel}.gz` : rel);
  let have = null;
  if (existsSync(dest)) have = lf(gz(rel) ? gunzipSync(readFileSync(dest)) : readFileSync(dest));
  else if (gz(rel) && existsSync(dest.slice(0, -3))) have = lf(readFileSync(dest.slice(0, -3)));
  if (have === text) continue;
  (have == null ? added : changed).push(rel);
  if (dry) continue;
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, gz(rel) ? gzipSync(Buffer.from(text), { level: 9 }) : text);
  if (gz(rel) && existsSync(dest.slice(0, -3))) unlinkSync(dest.slice(0, -3));
}
for (const [from, to, patches] of UI_COPIES) {
  const src = join(PC, 'src', from);
  if (!existsSync(src)) { patchMiss.push(`${from}: missing in phonecraft`); continue; }
  let text = lf(readFileSync(src)).replaceAll("'../../", "'../");
  for (const [a, b] of patches) {
    const hit = typeof a === 'string' ? text.includes(a) : a.test(text);
    if (!hit) { patchMiss.push(`${from}: ${String(a).trim()}`); continue; }
    text = text.replace(a, b);
  }
  const dest = join(ROOT, 'src', to);
  const have = existsSync(dest) ? lf(readFileSync(dest)) : null;
  if (have === text) continue;
  (have == null ? added : changed).push(to);
  if (!dry) writeFileSync(dest, text);
}
for (const dir of DIRS) {
  for (const f of walk(join(ROOT, 'src', dir))) {
    const rel = posix(join(dir, f));
    const key = rel.endsWith('.json.gz') ? rel.slice(0, -3) : rel;
    if (want.has(key) || KEEP.includes(rel)) continue;
    removed.push(rel);
    if (!dry) unlinkSync(join(ROOT, 'src', rel));
  }
}
const list = (label, xs) => xs.length && console.log(`${label} (${xs.length}):\n  ${xs.join('\n  ')}`);
console.log(`${dry ? 'would sync' : 'synced'} from ${relative(ROOT, PC) || PC}`);
list('changed', changed); list('added', added); list('removed', removed);
if (patchMiss.length) { list('PATCH DID NOT APPLY', patchMiss); process.exitCode = 1; }
if (!changed.length && !added.length && !removed.length) console.log('already in sync');
