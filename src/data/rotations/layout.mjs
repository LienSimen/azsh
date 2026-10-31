// Where a band lives: <mode>/<class>/<spec-slug>.json. Mode is the DIRECTORY, never a field.
// The node-script half of ./index.ts, which is what the app loads.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROTATION_MODES = ['pve', 'pvp'];

export const ROTATION_CLASS_KEYS = [
  'warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid',
];

export const ROTATIONS_DIR = fileURLToPath(new URL('.', import.meta.url));

/** Filename stem for an authored `spec` label, e.g. "Beast Mastery" → "beast-mastery". */
export function specSlug(spec) {
  const slug = String(spec ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) throw new Error(`rotations/layout: band spec ${JSON.stringify(spec)} has no slug`);
  return slug;
}

/** Every pack file on disk, in load order: pve before pvp, spec slug ascending inside each. */
export function listPackFiles(classKey) {
  const out = [];
  for (const mode of ROTATION_MODES) {
    const dir = join(ROTATIONS_DIR, mode, classKey);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      out.push({ mode, classKey, slug: file.slice(0, -5), path: join(dir, file) });
    }
  }
  return out;
}

/** One class's bands, merged in load order with `mode` stamped back on from the directory. */
export function readClassBands(classKey) {
  const out = [];
  for (const f of listPackFiles(classKey)) {
    const bands = JSON.parse(readFileSync(f.path, 'utf8'));
    for (const band of bands) out.push(f.mode === 'pvp' ? { ...band, mode: 'pvp' } : band);
  }
  return out;
}

/** Split `bands` back over the pve/pvp spec files, deleting any file the new set no longer fills. */
export function writeClassBands(classKey, bands) {
  const wanted = new Map();
  for (const band of bands) {
    const mode = String(band.mode ?? '').trim().toLowerCase() === 'pvp' ? 'pvp' : 'pve';
    const key = `${mode}/${specSlug(band.spec)}`;
    const { mode: _drop, ...rest } = band;
    (wanted.get(key) ?? wanted.set(key, []).get(key)).push(rest);
  }
  // Prune only inside the modes this call actually produced. materialize-rotation-packs.mjs emits
  // PvE bands only, and an unscoped prune deleted every file bake-pvp-rotations.mjs owns.
  const modes = new Set([...wanted.keys()].map((k) => k.split('/')[0]));
  for (const f of listPackFiles(classKey)) {
    if (!modes.has(f.mode)) continue;
    if (!wanted.has(`${f.mode}/${f.slug}`)) rmSync(f.path);
  }
  const written = [];
  for (const [key, rows] of wanted) {
    const [mode, slug] = key.split('/');
    const dir = join(ROTATIONS_DIR, mode, classKey);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${slug}.json`);
    writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
    written.push(path);
  }
  return written;
}
