// Does a baked plate SHOW this spot? One bit per `cellYd` cell of vmap-internal XY. Region and
// storey renders are a SUBSET of the geometry, so their claim boxes reach spots they never ink.

import plateCoverJson from './tables/dungeonPlateCover.json' with { type: 'json' };

type PlateCoverRow = {
  nx: number;
  ny: number;
  /** Internal-XY min of the asset's own projection worldBBox. */
  min: [number, number];
  inkFrac: number;
  bits: string;
};

const plate = plateCoverJson as { assets: Record<string, PlateCoverRow>; cellYd: number };
const rows = plate.assets;
const CELL_YD = plate.cellYd;

const decoded = new Map<string, Uint8Array | null>();

function bitsFor(slug: string): Uint8Array | null {
  const memo = decoded.get(slug);
  if (memo !== undefined) return memo;
  const row = rows[slug];
  let out: Uint8Array | null = null;
  if (row) {
    try {
      if (typeof atob === 'function') {
        const s = atob(row.bits);
        out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
      } else {
        // Node probes (no atob in older runtimes).
        out = new Uint8Array(Buffer.from(row.bits, 'base64'));
      }
    } catch {
      out = null;
    }
  }
  decoded.set(slug, out);
  return out;
}

/** True when a coverage grid ships for this asset slug. */
export function hasPlateCover(slug: string): boolean {
  return rows[slug] != null;
}

/** Fraction of cells with ink, or null when no grid ships for `slug`. */
export function plateInkFrac(slug: string): number | null {
  const row = rows[slug];
  return row ? row.inkFrac : null;
}

// Ink at this internal-XY point on `slug`'s picture, or `null` when no grid ships (overviews) — a null must
// never be read as "not covered".
export function plateCoversInternal(slug: string, ix: number, iy: number): boolean | null {
  const row = rows[slug];
  const bits = bitsFor(slug);
  if (!row || !bits) return null;
  const cx = Math.floor((ix - row.min[0]) / CELL_YD);
  const cy = Math.floor((iy - row.min[1]) / CELL_YD);
  if (cx < 0 || cy < 0 || cx >= row.nx || cy >= row.ny) return false;
  const i = cy * row.nx + cx;
  return (bits[i >> 3]! & (0x80 >> (i & 7))) !== 0;
}
