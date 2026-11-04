// Boots the DataStore from disk. Same attach order as the engine's QA harness.mjs
// bootDataStore(), with every table readable as .json or .json.gz (scripts/pack-data.mjs).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createDataStore } from '../data/dataStore.ts';
import { withDungeons } from '../data/dungeons.ts';
import { materializeHollowSpellsInPlace } from '../engine/spells/interpreter/item-triggers.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(HERE, '..', 'data');
export const TABLES_DIR = join(DATA_DIR, 'tables');

/** Parse `<dir>/<name>.json` or `<dir>/<name>.json.gz`, whichever exists. Null when neither does. */
export function readJson(dir, name) {
  const gz = join(dir, `${name}.json.gz`);
  if (existsSync(gz)) return JSON.parse(gunzipSync(readFileSync(gz)).toString('utf8'));
  const raw = join(dir, `${name}.json`);
  if (existsSync(raw)) return JSON.parse(readFileSync(raw, 'utf8'));
  return null;
}

/** Every table on disk, keyed by filename stem. */
export function readBundle(dir = TABLES_DIR) {
  const bundle = {};
  for (const f of readdirSync(dir)) {
    const m = f.match(/^(.+?)\.json(\.gz)?$/);
    if (!m || m[1] in bundle) continue;
    bundle[m[1]] = readJson(dir, m[1]);
  }
  return bundle;
}

let shared = null;

/** Full store: boot tables + authored dungeons + the five lazy chunks. Cached per process. */
export function bootDataStore(onStage = () => {}) {
  if (shared) return shared;
  onStage('tables');
  const bundle = readBundle();
  const ds = createDataStore(withDungeons(bundle));
  onStage('loot');
  ds.attachLoot(readJson(DATA_DIR, 'loot-data'));
  onStage('professions');
  ds.attachProfessions(readJson(DATA_DIR, 'profession-data'));
  onStage('spells');
  ds.attachSpells(readJson(DATA_DIR, 'spell-data'));
  materializeHollowSpellsInPlace(ds.allSpells());
  onStage('objects');
  ds.attachGameObjects(readJson(DATA_DIR, 'gameobject-data'));
  onStage('items');
  const items = readJson(DATA_DIR, 'item-data');
  if (items) ds.attachItems(items);
  shared = ds;
  return ds;
}
