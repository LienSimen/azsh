// BG out-of-combat drink and eat. The endless match session has no between-pull seam, so casters
// would chain-wipe once the pots run dry. Rates follow the same spirit path as between-pull rest.

import type { BgTeam, BgUnitId } from './types.ts';

export interface BgRestSeams {
  now(): number;
  livingUnits(): readonly { id: BgUnitId; team: BgTeam; side: string }[];
  /** Planar yards between two living units, or null. */
  distYd(a: BgUnitId, b: BgUnitId): number | null;
  /** Current vitals 0..1. Power is ignored for rage (empties OOC). */
  vitals(side: string): { hpPct: number; powerPct: number; powerType: string } | null;
  // Partial refill toward full. Same contract as session.restoreUnit — rage → 0, mana/energy fill. Returns
  // false when the side is unknown/dead.
  restore(side: string, hpPct: number, powerPct: number): boolean;
}

/** No living enemy of the other team inside this radius ⇒ "safe to drink". */
export const BG_REST_SAFE_YD = 35;
/** How often the director rechecks. */
const REST_EVERY_MS = 500;
// Full-vitals channel length while fully OOC. Classic water is ~20–30 s; 20 s keeps mid-map respawns useful
// without inventing per-item totals.
const FULL_CHANNEL_MS = 20_000;
/** Start drinking only when under this fraction (avoid thrash at 99%). */
const REST_BELOW = 0.9;
/** Must be this far from full to bother (same gate after a sip). */
const REST_STOP = 0.98;

// While a unit has no enemy within BG_REST_SAFE_YD, refill hp/mana toward full over FULL_CHANNEL_MS of safe
// time. Combat proximity aborts progress (no free mid-fight sit). Both teams.
export function createBgRestDirector(seams: BgRestSeams): { tick(): void } {
  let nextAt = 0;
  /** Safe-time accrued while below REST_BELOW, per side. Reset when threatened. */
  const safeMs = new Map<string, number>();

  return {
    tick(): void {
      const t = seams.now();
      if (t < nextAt) return;
      nextAt = t + REST_EVERY_MS;

      const living = seams.livingUnits();
      for (const u of living) {
        const v = seams.vitals(u.side);
        if (!v) {
          safeMs.delete(u.side);
          continue;
        }
        // Rage empties out of combat; never "drink" it full. Energy ticks on its own
        // in the session — still top HP for rogues that brawled.
        const needsHp = v.hpPct < REST_BELOW;
        const needsPower = v.powerType === 'mana' && v.powerPct < REST_BELOW;
        if (!needsHp && !needsPower) {
          safeMs.delete(u.side);
          continue;
        }

        let threatened = false;
        for (const o of living) {
          if (o.team === u.team) continue;
          const d = seams.distYd(u.id, o.id);
          if (d != null && d <= BG_REST_SAFE_YD) {
            threatened = true;
            break;
          }
        }
        if (threatened) {
          safeMs.delete(u.side);
          continue;
        }

        const prev = safeMs.get(u.side) ?? 0;
        const next = prev + REST_EVERY_MS;
        safeMs.set(u.side, next);

        // Linear pace to full over FULL_CHANNEL_MS of continuous safe time.
        const step = REST_EVERY_MS / FULL_CHANNEL_MS;
        const hpTarget = needsHp
          ? Math.min(REST_STOP, Math.max(v.hpPct, v.hpPct + (1 - v.hpPct) * Math.min(1, step * 2) + step))
          : Math.max(v.hpPct, REST_STOP);
        // Two steps on the first safe ticks so a 5% mana caster is not stuck for a full
        // channel before the first GCD of the next fight; still capped at full.
        const pwTarget = needsPower
          ? Math.min(REST_STOP, Math.max(v.powerPct, v.powerPct + step * 1.5))
          : (v.powerType === 'rage' ? 0 : Math.max(v.powerPct, REST_STOP));
        seams.restore(u.side, hpTarget, pwTarget);
      }
    },
  };
}
