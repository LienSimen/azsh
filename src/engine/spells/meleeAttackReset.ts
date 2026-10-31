// The melee swing-timer reset on cast: a non-triggered spell with the combat interrupt flag resets the
// timers unless it carries the do-not-reset attribute. Free swings after every cast were the weave.

import type { SpellDef } from '../../data/schema.ts';
import type { Fighter } from '../combat/types.ts';
import { scaleTime } from '../combat/formulas.ts';
import { SPELL_INTERRUPT_FLAG_COMBAT } from './interrupt.ts';
import { hasAttrEx2, SPELL_ATTR_EX2 } from './spellAttributes.ts';

// Spell.dbc AttributesEx2 & DO_NOT_RESET_COMBAT_TIMERS — 61 ids (1.12.1). Bake now stamps attributesEx2;
// the id set is the fallback for rows that omit it. Measured: datadump/DBFilesClient/Spell.dbc field 8.
const DO_NOT_RESET_COMBAT_TIMER_IDS: ReadonlySet<number> = new Set([
  1510, 1978, 2643, 3034, 3043, 3044, 5116, 13549, 13550, 13551, 13552, 13553,
  13554, 13555, 14274, 14275, 14276, 14277, 14279, 14280, 14281, 14282, 14283,
  14284, 14285, 14286, 14287, 14288, 14289, 14290, 14294, 14295, 15629, 15630,
  15631, 15632, 16791, 17171, 17174, 18545, 18649, 19386, 19434, 19501, 19503,
  19801, 20736, 20900, 20901, 20902, 20903, 20904, 22908, 22914, 23601, 24132,
  24133, 25294, 25295, 27632, 27634,
]);

export function spellHasDoNotResetCombatTimers(
  spell: { id: number; attributesEx2?: number },
): boolean {
  if (hasAttrEx2(spell, SPELL_ATTR_EX2.DO_NOT_RESET_COMBAT_TIMERS)) return true;
  return DO_NOT_RESET_COMBAT_TIMER_IDS.has(spell.id);
}

/** Spell.h IsMeleeAttackResetSpell — gate only; caller applies timers. */
export function isMeleeAttackResetSpell(
  spell: Pick<SpellDef, 'id' | 'interruptFlags' | 'attributesEx2'>,
  triggered: boolean,
): boolean {
  if (triggered) return false;
  if (spellHasDoNotResetCombatTimers(spell)) return false;
  return ((spell.interruptFlags ?? 0) & SPELL_INTERRUPT_FLAG_COMBAT) !== 0;
}

// Reset the melee attack timers after a successful cast. The shared swing clock is the main hand in
// melee mode and the ranged weapon in ranged mode, so this is skipped there.
export function resetMeleeAttackTimersOnCast(f: Fighter, t: number): void {
  if (f.mode !== 'ranged') {
    const spd = f.spec.weapon?.speedMs ?? 2000;
    f.swingReadyAt = t + scaleTime(spd, f.haste, 0);
  }
  const oh = f.spec.offhand;
  if (oh && (oh.dmgMax ?? 0) > 0) {
    f.ohSwingReadyAt = t + scaleTime(oh.speedMs, f.haste, 0);
  }
}

/** Cast() immediate-phase helper: reset when IsMeleeAttackResetSpell. */
export function maybeResetMeleeAttackTimersOnCast(
  f: Fighter,
  spell: Pick<SpellDef, 'id' | 'interruptFlags' | 'attributesEx2'>,
  t: number,
  triggered: boolean,
): void {
  if (!isMeleeAttackResetSpell(spell, triggered)) return;
  resetMeleeAttackTimersOnCast(f, t);
}
