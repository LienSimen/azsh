// Stage s21: Improved Sprint's trigger 30918, which removes root and snare through mechanic immunity.
// The talent ranks cast it on a Sprint hit at 50% and 100%. Cite: SpellEffects.cpp:4140-4147.

import type { SpellDef } from '../../data/schema.ts';
import { MECHANIC } from './immunity.ts';

// ── Stage s21 spell ids ─────────────────────────────────────────────────────

// Improved Sprint triggered payload — SCRIPT_EFFECT remove root+snare. Cite: SpellEffects.cpp:4140–4147.
export const IMPROVED_SPRINT_TRIGGER_SPELL_ID = 30918;

// Improved Sprint talent rank 1 (50% chance). Aura 109 → trigger 30918. Cite: spell_template 13743
// EffectBasePoints 49 + die 1 = 50; EffectTriggerSpell 30918.
export const IMPROVED_SPRINT_RANK1_SPELL_ID = 13743;

// Improved Sprint talent rank 2 (100% chance). Cite: spell_template 13875 EffectBasePoints 99 + die 1 =
// 100; EffectTriggerSpell 30918.
export const IMPROVED_SPRINT_RANK2_SPELL_ID = 13875;

/** Rank spell id → proc chance %. Cite: Spell.cpp:7457–7458 roll_chance_i(chance). */
export const IMPROVED_SPRINT_CHANCE_PCT: Readonly<Record<number, number>> = Object.freeze({
  [IMPROVED_SPRINT_RANK1_SPELL_ID]: 50,
  [IMPROVED_SPRINT_RANK2_SPELL_ID]: 100,
});

// Duration of 30918's mechanic immunities: duration index 36 is 1000 ms.
// Cite: spell-data 30918 durationIndex 36; aura 77 misc 11 and 7.
export const IMPROVED_SPRINT_IMMUNITY_DURATION_MS = 1000;

/** SPELLFAMILY_ROGUE. Cite: SharedDefines.h / spell_template Sprint SpellFamilyName=8. */
export const SPELLFAMILY_ROGUE = 8;

// Sprint SpellFamilyFlags bit (all ranks 2983/8696/11305). Cite: spell_template Sprint SpellFamilyFlags=64.
export const SPRINT_FAMILY_FLAGS = 64;

/** Stage floor — every Dimension-C id this stage owns. */
export const STAGE_S21_SPELL_IDS: readonly number[] = Object.freeze([
  IMPROVED_SPRINT_TRIGGER_SPELL_ID,
]);

// No pure-RP dispositions for this stage: 30918 is combat-visible (root/snare purge). Empty map kept so the
// test pattern matches prior stages.
export const STAGE_S21_CPP_DISPOSITIONS: Readonly<
  Record<number, { reason: string; cite: string }>
> = Object.freeze({});

// ── Helpers ─────────────────────────────────────────────────────────────────

// True when `spellId` is a real Sprint rank (not the talent passive or trigger). Cite: spell_template
// SpellFamilyName=8 SpellFamilyFlags=64; Spell.cpp:7441 isAffectedOnSpell.
export function isSprintSpell(
  spellId: number,
  spellFamilyName: number | undefined,
  spellFamilyFlags: number | undefined,
): boolean {
  const id = spellId | 0;
  if (
    id === IMPROVED_SPRINT_TRIGGER_SPELL_ID
    || id === IMPROVED_SPRINT_RANK1_SPELL_ID
    || id === IMPROVED_SPRINT_RANK2_SPELL_ID
  ) {
    return false;
  }
  return (
    ((spellFamilyName ?? 0) | 0) === SPELLFAMILY_ROGUE
    && ((Number(spellFamilyFlags) || 0) & SPRINT_FAMILY_FLAGS) !== 0
  );
}

// Proc chance % for a talent rank spell id (0 if not Improved Sprint). Cite: Spell.cpp:7457–7458;
// spell_template 13743/13875.
export function improvedSprintChancePct(rankSpellId: number): number {
  return IMPROVED_SPRINT_CHANCE_PCT[rankSpellId | 0] ?? 0;
}

// The roll-chance equivalent: true when a uniform roll is strictly below the chance. At or under 0 it
// never fires and at or over 100 it always does. Cite: Spell.cpp:7458 roll_chance_i.
export function improvedSprintShouldProc(chancePct: number, roll01: number): boolean {
  const chance = chancePct | 0;
  if (chance <= 0) return false;
  if (chance >= 100) return true;
  return roll01 * 100 < chance;
}

// The SpellDef for the 30918 trigger: mechanic immunities that purge live root and snare. Numbers off
// spell-data 30918 — duration index 36 is 1000 ms, aura 77 with misc 11 and 7.
export function improvedSprintTriggerSpellDef(): SpellDef {
  return {
    id: IMPROVED_SPRINT_TRIGGER_SPELL_ID,
    name: 'Improved Sprint',
    rank: 0,
    school: 'physical',
    powerType: 'mana',
    cost: 0,
    castTimeMs: 0,
    cooldownMs: 0,
    gcdMs: 0,
    rangeMax: 0,
    reqLevel: 0,
    // Instant triggered cast — no GCD/CD. Cite: Spell.cpp:7460 TRIGGERED_OLD_TRIGGERED.
    effects: [
      {
        kind: 'mechanic_immunity',
        mechanic: MECHANIC.SNARE,
        durationMs: IMPROVED_SPRINT_IMMUNITY_DURATION_MS,
        positive: true,
      },
      {
        kind: 'mechanic_immunity',
        mechanic: MECHANIC.ROOT,
        durationMs: IMPROVED_SPRINT_IMMUNITY_DURATION_MS,
        positive: true,
      },
    ],
  };
}
