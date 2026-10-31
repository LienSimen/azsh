// SpellDuration.dbc index to milliseconds, a port of the ETL fallback table for pure engine use with no
// CSV at runtime. Values are already ms. Cite: spell-duration.mjs FALLBACK_DURATION_MS.

// The embedded duration table for pure interpretation, already in ms. Expanded to cover every index the
// committed bake references — a missing one resolved to 0 and expired rotation auras instantly.
export const FALLBACK_DURATION_MS: Readonly<Record<number, number>> = {
  0: 0,
  1: 10_000,
  2: 30_000,
  3: 60_000,
  4: 120_000,
  5: 300_000,
  6: 600_000,
  7: 5000,
  8: 15_000,
  9: 30_000,
  10: 60_000,
  18: 20_000,
  21: 0, // −1 infinite in DBC → 0 until-cancelled
  22: 45_000,
  23: 90_000, // SpellDuration.csv
  25: 180_000,
  26: 240_000, // SpellDuration.csv
  27: 3000,
  28: 5000,
  29: 12_000,
  30: 1_800_000,
  31: 8000,
  32: 6000,
  35: 4000,
  36: 1000,
  37: 1, // SpellDuration.csv
  39: 2000,
  40: 1_200_000,
  41: 360_000, // SpellDuration.csv
  42: 3_600_000,
  62: 75_000, // SpellDuration.csv
  63: 25_000, // SpellDuration.csv
  64: 40_000,
  65: 1500, // SpellDuration.csv
  66: 2500, // SpellDuration.csv
  85: 18_000,
  86: 21_000,
  105: 9000,
  106: 24_000, // Curse of Agony family — SpellDuration.csv ID 106
  125: 35_000, // SpellDuration.csv
  145: 2_700_000, // SpellDuration.csv
  165: 7000, // SpellDuration.csv
  185: 6000, // Slice and Dice base — MaxDuration 21000 (baked durationMaxMs)
  186: 2000, // SpellDuration.csv (Kidney Shot base band)
  187: 0, // SpellDuration.csv Duration 0 / Max 5000 (Kidney Shot 0-CP base)
  205: 27_000, // SpellDuration.csv
  225: 604_800_000, // SpellDuration.csv (7d)
  245: 50_000, // SpellDuration.csv
  265: 55_000, // SpellDuration.csv
  285: 1000, // SpellDuration.csv
  305: 14_000, // SpellDuration.csv
  327: 500, // SpellDuration.csv
  347: 900_000, // SpellDuration.csv
  367: 7_200_000, // SpellDuration.csv
  387: 16_000, // SpellDuration.csv
  407: 100, // SpellDuration.csv
  447: 2000, // SpellDuration.csv
  467: 22_000, // SpellDuration.csv
  468: 26_000, // SpellDuration.csv
  487: 1700, // SpellDuration.csv
  553: 6000, // Rupture base — MaxDuration 16000 (baked durationMaxMs)
};

// Duration index to base milliseconds. Undefined when the index is unknown, so the caller must not
// invent a 10 or 12 second default.
export function durMs(idx: number | undefined | null): number | undefined {
  if (idx == null) return undefined;
  const k = idx | 0;
  if (Object.prototype.hasOwnProperty.call(FALLBACK_DURATION_MS, k)) {
    return FALLBACK_DURATION_MS[k];
  }
  return undefined;
}

// Resolve an effect's duration: an explicit override first, then the duration index, then undefined —
// which handlers read as 0, honestly unhandled or permanent, never a magic default.
export function resolveDurationMs(
  ctxDurationMs: number | undefined,
  ctxDurationIndex: number | undefined,
  spellDurationIndex: number | undefined,
): number | undefined {
  if (ctxDurationMs != null) return ctxDurationMs;
  return durMs(ctxDurationIndex ?? spellDurationIndex);
}
