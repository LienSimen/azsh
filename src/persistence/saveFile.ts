// Characters as a FILE. IndexedDB lives inside one browser profile: clearing site data, a
// new machine, or a profile that gets recreated takes every character with it, and the game
// itself can only ever hold one row per slot. A file is the copy that outlives all of that,
// so export/import is part of the save layer, not a debug tool.
//
// The bundle is plain JSON (a Save array plus a stamp) and every import runs through
// migrate(), so a file written by an older build loads exactly like an older IndexedDB row.

import type { Save } from './saveShape.ts';
import { migrate, SAVE_VERSION } from './saveShape.ts';

export const SAVE_FILE_KIND = 'phonecraft-characters';

export interface SaveFileBundle {
  kind: typeof SAVE_FILE_KIND;
  /** Save schema version at export time - informational; each save carries its own. */
  saveVersion: number;
  exportedAt: number;
  saves: Save[];
}

export function bundleOf(saves: readonly Save[], at: number): SaveFileBundle {
  return { kind: SAVE_FILE_KIND, saveVersion: SAVE_VERSION, exportedAt: at, saves: [...saves] };
}

/** phonecraft-Gilleis-2026-08-21.json / phonecraft-19-characters-2026-08-21.json */
export function bundleFileName(bundle: SaveFileBundle): string {
  const d = new Date(bundle.exportedAt);
  const p = (n: number): string => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const who = bundle.saves.length === 1
    ? (bundle.saves[0]?.state.char.name ?? 'character').replace(/[^A-Za-z0-9_-]/g, '')
    : `${bundle.saves.length}-characters`;
  return `phonecraft-${who}-${day}.json`;
}

export interface ImportReport {
  saves: Save[];
  /** Rows the importer refused, with the reason - never silently dropped. */
  problems: string[];
}

/** Accepts a bundle, a bare Save array, or a single Save (a hand-edited file usually is one). */
export function savesFromBundle(raw: unknown): ImportReport {
  const problems: string[] = [];
  const rows: unknown[] = Array.isArray(raw)
    ? raw
    : isBundle(raw)
      ? raw.saves
      : raw && typeof raw === 'object'
        ? [raw]
        : [];
  if (!rows.length) return { saves: [], problems: ['that file holds no characters'] };
  const saves: Save[] = [];
  for (const [i, row] of rows.entries()) {
    const migrated = migrate(row);
    if (!migrated) {
      problems.push(`entry ${i + 1} is not a character this build can read`);
      continue;
    }
    saves.push(migrated);
  }
  return { saves, problems };
}

function isBundle(v: unknown): v is SaveFileBundle {
  return !!v && typeof v === 'object' && Array.isArray((v as { saves?: unknown }).saves);
}
