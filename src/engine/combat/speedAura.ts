// Hostile vs self/beneficial speed-aura polarity. The decrease-speed family carries self-slows
// (Stealth, Prowl) with hostile:false, and apply and view must trust that flag over a negative pct.

/** Minimal shape shared by SpellEffect and live session speed rows. */
export type SpeedPolarity = {
  kind?: string;
  hostile?: boolean;
  pct?: number;
};

// True when a speed effect is a hostile snare or daze. An explicit hostile:false wins over a negative
// pct; with the flag omitted a negative pct is hostile, which is what a bake-thin row leaves.
export function isHostileSpeedEffect(e: SpeedPolarity): boolean {
  if (e.kind != null && e.kind !== 'speed') return false;
  if (e.hostile === true) return true;
  if (e.hostile === false) return false;
  return (e.pct ?? 0) < 0;
}

/** UnitSpeedChanged: recompute run speed only on apply/remove, not a per-tick scan. */
export function markSpeedDirty(f: { speedDirty: boolean }): void {
  f.speedDirty = true;
}

/** Beneficial / self speed (Sprint, Cheetah, Stealth cost) — buff bar, not snare. */
function isBeneficialSpeedEffect(e: SpeedPolarity): boolean {
  if (e.kind != null && e.kind !== 'speed') return false;
  return !isHostileSpeedEffect(e);
}
