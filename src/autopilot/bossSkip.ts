/**
 * Operator "Skip boss" must outlive a pack clear, a re-arm, and the second lap.
 * Transient skips (no path / gate / stall) still live in `autoSkipped` and can be
 * wiped; ids in `held` are written back after every wipe.
 */

export function holdBossSkip(held: Set<string>, skipped: Set<string>, id: string): void {
  if (!id) return;
  held.add(id);
  skipped.add(id);
}

export function releaseBossSkip(held: Set<string>, skipped: Set<string>, id: string): void {
  if (!id) return;
  held.delete(id);
  skipped.delete(id);
}

/** After `skipped.clear()`, put operator skips back so the route does not walk them again. */
export function keepHeldSkips(held: Set<string>, skipped: Set<string>): void {
  for (const id of held) skipped.add(id);
}

export function isBossHeldSkip(held: Set<string>, id: string): boolean {
  return !!id && held.has(id);
}
