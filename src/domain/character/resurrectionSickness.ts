// Resurrection sickness (spell 15007), pure duration rules: none below startLevel, then one minute
// per level for eight levels, then the full aura. Cite: Player.cpp resurrect ~4340–4360.

/** SharedDefines.h SPELL_ID_PASSIVE_RESURRECTION_SICKNESS */
export const SPELL_ID_RESURRECTION_SICKNESS = 15007;

/** Classic CONFIG_INT32_DEATH_SICKNESS_LEVEL default (Player.cpp comments: 1–10 immune). */
export const DEFAULT_DEATH_SICKNESS_LEVEL = 11;

const MINUTE_MS = 60_000;

// Whether applySickness path applies for this level. Cite: Player.cpp ~4346 `if (int32(GetLevel()) >=
// startLevel)`.
export function appliesResurrectionSickness(
  level: number,
  startLevel = DEFAULT_DEATH_SICKNESS_LEVEL,
): boolean {
  return level >= startLevel;
}

// Duration in ms for spell 15007 after a revive: 0 below startLevel, (level - startLevel + 1)
// minutes for the next nine, then fullDurationMs. Cite: Player.cpp ~4352 SetAuraDuration.
export function resurrectionSicknessDurationMs(
  level: number,
  startLevel = DEFAULT_DEATH_SICKNESS_LEVEL,
  /** Full spell duration when not shortened — from Spell.dbc DurationIndex for 15007. */
  fullDurationMs = 10 * MINUTE_MS,
): number {
  if (!appliesResurrectionSickness(level, startLevel)) return 0;
  if (level < startLevel + 9) {
    const minutes = level - startLevel + 1;
    return minutes * MINUTE_MS;
  }
  return fullDurationMs;
}

// Pure result of a sickness-applying revive: which spell to cast and for how long. Caller wires into aura
// application when death flow is hooked.
export function resurrectionSicknessOnRevive(
  level: number,
  applySickness: boolean,
  startLevel = DEFAULT_DEATH_SICKNESS_LEVEL,
  fullDurationMs = 10 * MINUTE_MS,
): { spellId: number; durationMs: number } | null {
  if (!applySickness) return null;
  const durationMs = resurrectionSicknessDurationMs(level, startLevel, fullDurationMs);
  if (durationMs <= 0) return null;
  return { spellId: SPELL_ID_RESURRECTION_SICKNESS, durationMs };
}
