// SpellRadius.dbc, effect radius index to yards. The spell-level radius cannot stand in: it is the
// FIRST non-zero effect's, so a spell whose later effect owns the radius reads the wrong number.
const RADIUS_YD: Record<number, number> = {
  7: 2, 8: 5, 9: 20, 10: 30, 11: 45, 12: 100, 13: 10, 14: 8, 15: 3, 16: 1,
  17: 13, 18: 15, 19: 18, 20: 25, 21: 35, 22: 200, 23: 40, 24: 65, 25: 70,
  26: 4, 27: 50, 28: 50000, 29: 6, 31: 80,
};

/** Yards for an EffectRadiusIndex. 0 when absent — GetSpellRadius(nullptr) returns 0. */
export function spellRadiusYd(radiusIndex: number): number {
  return RADIUS_YD[radiusIndex | 0] ?? 0;
}

/** The sentinel radius CheckScriptTargeting rewrites. Cite: Spell.cpp:2650. */
export const SPELL_RADIUS_SENTINEL_YD = 50000;
