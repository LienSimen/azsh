// Mounts and Riding skill. Pure domain: a gold sink plus a travel-time fraction ported from the
// mount auras — aura 32 gives 60 or 100%, and travelMs = baseMs / (1 + pct/100). One mount only.

import type { Character } from '../character/character.ts';
import type { ItemDef } from '../../data/schema.ts';
import { raceClassMaskMatches } from '../character/combatSkills.ts';

/** SharedDefines.h SKILL_RIDING = 762 (unified riding line). */
export const SKILL_RIDING = 762;

/** Apprentice Riding skill value (SkillTiers maximized; archive 3296_spell_learn_skill). */
export const RIDING_RANK_APPRENTICE = 75;

/** Journeyman Riding skill value. */
export const RIDING_RANK_JOURNEYMAN = 150;

// Phonecraft text-RPG pacing for one zone hop. This base is authoring for a readable delay; the
// FRACTION under mount speed is what is sourced. Not a CMaNGOS travel-ms value.
export const BASE_TRAVEL_MS = 10_000;

/** Baked DataBundle.ridingSpells row (skill-GRANT spells, not SpellDefs). */
export interface RidingSpellRow {
  id: number;
  trainerSpell: number;
  rank: number;
  step: number;
  cost: number;
  reqLevel: number;
}

export interface Check {
  ok: boolean;
  reason?: string;
}

export interface CharResult extends Check {
  char: Character;
}

export interface CanTrainRidingInput {
  level: number;
  gold: number;
  /** Current riding skill value (0 if untrained). */
  currentRank: number;
  spell: RidingSpellRow;
  /** GetReputationPriceDiscount; default 1 so existing callers stay undiscounted. */
  discountMod?: number;
}

// Whether the character may purchase this riding rank from a trainer. Journeyman requires Apprentice first
// (npc_trainer reqskill 762 on 33392).
export function canTrainRiding(input: CanTrainRidingInput): Check {
  const { level, gold, currentRank, spell } = input;
  if (currentRank >= spell.rank) {
    return { ok: false, reason: 'Already trained' };
  }
  // Step order: cannot train 150 without 75 (reqskill 762 on Journeyman).
  if (spell.step > 1 && currentRank < RIDING_RANK_APPRENTICE) {
    return { ok: false, reason: 'Requires Apprentice Riding first' };
  }
  if (level < spell.reqLevel) {
    return { ok: false, reason: `Requires level ${spell.reqLevel}` };
  }
  const cost = Math.floor(spell.cost * (input.discountMod ?? 1));
  if (gold < cost) {
    return { ok: false, reason: 'Not enough money' };
  }
  return { ok: true };
}

// Train a riding rank: deduct gold, snap skill to rank (SkillTiers maximized). Cite: Player.cpp
// SetSkillStep + SKILL_FLAG_MAXIMIZED.
export function trainRiding(char: Character, spell: RidingSpellRow, discountMod = 1): CharResult {
  const currentRank = char.ridingSkill ?? 0;
  const chk = canTrainRiding({
    level: char.level,
    gold: char.gold,
    currentRank,
    spell,
    discountMod,
  });
  if (!chk.ok) return { ok: false, reason: chk.reason, char };
  const cost = Math.floor(spell.cost * discountMod);
  return {
    ok: true,
    char: {
      ...char,
      gold: char.gold - cost,
      ridingSkill: spell.rank,
    },
  };
}

// AllowableRace mask gate (Player.cpp CanUseItem). mask 0 / absent = unrestricted; else bit (1 << (race -
// 1)). Cite: raceClassMaskMatches / unitRaceOrClassMask.
export function raceAllowedForMount(race: number, allowableRace?: number): boolean {
  if (allowableRace == null || allowableRace === 0) return true;
  return raceClassMaskMatches(allowableRace, race);
}

export interface CanUseMountOpts {
  /** Text-RPG: mounts only out of combat (non-combat cast with damage interrupt). */
  inCombat?: boolean;
}

// CanUseItem-shaped mount gate: level, riding rank, race mask and out-of-combat. Ownership is the
// caller's. Re-using the same mount is idempotent, and a different one replaces it.
export function canUseMount(
  char: Character,
  item: ItemDef,
  opts: CanUseMountOpts = {},
): Check {
  if (item.mountSpell == null && item.mountSpeedPct == null && item.requiredRidingRank == null) {
    return { ok: false, reason: 'Not a mount' };
  }
  if (opts.inCombat) {
    return { ok: false, reason: 'Cannot mount in combat' };
  }
  if (item.requiredLevel != null && char.level < item.requiredLevel) {
    return { ok: false, reason: `Requires level ${item.requiredLevel}` };
  }
  const needRank = item.requiredRidingRank ?? 0;
  const have = char.ridingSkill ?? 0;
  if (have < needRank) {
    return {
      ok: false,
      reason: needRank > 0
        ? `Requires Riding skill ${needRank}`
        : 'Requires Riding skill',
    };
  }
  if (!raceAllowedForMount(char.race, item.allowableRace)) {
    return { ok: false, reason: 'Your race cannot use this mount' };
  }
  return { ok: true };
}

// Mount: one mount only (never-stack). Replaces any previous mount item. Cite: SpellStacking.cpp
// SPELL_AURA_MOUNTED never stacking; Unit::Mount.
export function mount(char: Character, item: ItemDef, opts: CanUseMountOpts = {}): CharResult {
  const chk = canUseMount(char, item, opts);
  if (!chk.ok) return { ok: false, reason: chk.reason, char };
  return {
    ok: true,
    char: { ...char, mountedItem: item.entry },
  };
}

/** Clear mounted state. Cite: Unit::Unmount. */
export function dismount(char: Character): CharResult {
  if (char.mountedItem == null) {
    return { ok: false, reason: 'Not mounted', char };
  }
  const next = { ...char };
  delete next.mountedItem;
  return { ok: true, char: next };
}

// Effective zone-hop travel time under mounted speed: baseMs / (1 + speedPct/100), so +60% is
// ×1/1.6. Unmounted is identity. Cite: Unit.cpp UpdateSpeed mounted bucket.
export function travelTimeMs(baseMs: number, mountedSpeedPct: number | null | undefined): number {
  if (mountedSpeedPct == null || mountedSpeedPct <= 0) return baseMs;
  return baseMs / (1 + mountedSpeedPct / 100);
}

/** Resolve travel ms for a character given the mounted item's speed (or walk). */
export function travelTimeForChar(
  baseMs: number,
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
): number {
  const entry = char.mountedItem;
  if (entry == null) return travelTimeMs(baseMs, null);
  const pct = itemOf(entry)?.mountSpeedPct;
  return travelTimeMs(baseMs, pct ?? null);
}

// Pick a riding spell row by rank, skill-grant id, or trainer wrapper id. Prefer reading bake rows over
// hardcoding ids in callers.
export function findRidingSpell(
  spells: readonly RidingSpellRow[],
  rankOrSpellId: number,
): RidingSpellRow | undefined {
  return spells.find(
    (s) =>
      s.rank === rankOrSpellId
      || s.id === rankOrSpellId
      || s.trainerSpell === rankOrSpellId,
  );
}
