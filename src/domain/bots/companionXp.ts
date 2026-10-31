// ICH4 companion XP grants, outdoor and dungeon. While `xpLocked` the grants no-op; unlocked, they
// use the same grantXp and killXpAmount helpers as the player, capped at min(60, playerLevel).

import type { DataStore } from '../../data/dataStore.ts';
import type { CreatureDef } from '../../data/schema.ts';
import {
  companionCharacter,
  companionLevel,
  isXpLocked,
  type Companion,
} from './squad.ts';
import { grantXp } from '../../progression/leveling.ts';
import { killXpAmount } from '../../progression/xpGain.ts';

export interface CompanionXpResult {
  /** Levels actually applied (filtered by player soft-cap). */
  leveledTo: number[];
  /** Raw kill/grant amount considered (0 when locked, grey, or empty). */
  gain: number;
}

// Apply raw XP to one companion; a no-op when locked or the amount is ≤ 0. The new level caps at
// min(60, playerLevel), and overflow past the cap zeroes into-level XP.
export function applyCompanionXp(
  comp: Companion,
  amount: number,
  playerLevel: number,
  ds: DataStore,
): CompanionXpResult {
  if (isXpLocked(comp)) return { leveledTo: [], gain: 0 };
  const gain = Math.max(0, Math.round(amount));
  if (gain <= 0) return { leveledTo: [], gain: 0 };

  const playerCap = Math.min(60, Math.max(1, playerLevel));
  const lvl = companionLevel(comp, playerLevel);
  // Above soft cap (should not happen) — clamp and refuse further progress.
  if (lvl > playerCap) {
    comp.level = playerCap;
    comp.xp = 0;
    return { leveledTo: [], gain: 0 };
  }

  const before = companionCharacter(comp, lvl, ds);
  const r = grantXp(before, gain, ds);
  const newLevel = Math.min(playerCap, r.char.level);
  const appliedLevels = r.leveledTo.filter((nl) => nl <= playerCap);
  comp.level = newLevel;
  // Soft-cap overflow or hard L60: zero into-level XP (same shape as ICH0 outdoor).
  comp.xp = (newLevel >= 60 || r.char.level > newLevel) ? 0 : r.char.xp;
  return { leveledTo: appliedLevels, gain };
}

// Personal kill-XP for one companion vs a creature (full curve at their level, not ÷n). Honors xpLocked and
// the player soft-cap.
export function applyCompanionKillXp(
  comp: Companion,
  cdef: CreatureDef,
  playerLevel: number,
  ds: DataStore,
  mobLevel?: number,
): CompanionXpResult {
  if (isXpLocked(comp)) return { leveledTo: [], gain: 0 };
  const lvl = companionLevel(comp, playerLevel);
  const gain = killXpAmount(cdef, lvl, mobLevel);
  return applyCompanionXp(comp, gain, playerLevel, ds);
}
