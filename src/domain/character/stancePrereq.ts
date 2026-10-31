// What a pressed ability wants from the stance bar: the form it must fire in, and the stance spell
// that gets there. The macro `/cast [stance:3] Pummel ; Berserker Stance` is the same two steps
// spelled by hand (domain/macro/templates.ts:125-128).

import type { ShapeshiftFormId, SpellDef } from '../../data/schema.ts';
import { formIdFromSpell, isFormSpell, isStealthShapeshift, shapeshiftCastError } from './forms.ts';
import { listStanceSlots } from './stanceBar.ts';

/** A press's claim on the stance bar. */
export interface StanceIntent {
  /** Form the press must fire in — nothing may shift out of it while the press waits. */
  holdForm: ShapeshiftFormId;
  /** Stance spell to cast before the press, or null when already in `holdForm`. */
  castSpellId: number | null;
}

/**
 * The stance a press needs, or null when a stance change cannot affect it. `holdForm` is the
 * CURRENT form when that already casts and some other stance on the bar would refuse — that is
 * what stops a rotation stance row popping the player back between the swap and the press.
 */
export function stanceIntentForPress(
  spell: SpellDef,
  form: ShapeshiftFormId,
  classId: number,
  known: ReadonlyArray<number>,
  spellOf: (id: number) => SpellDef | undefined,
): StanceIntent | null {
  // A stance press is its own answer, and Stealth is an opener with a cooldown and a snare — the
  // player enters it deliberately, never as a side effect of pressing Ambush.
  if (isFormSpell(spell)) return null;
  const slots = listStanceSlots(classId, known, spellOf, form)
    .filter((s) => !isStealthShapeshift(s.formId));
  if (!slots.length) return null;

  if (shapeshiftCastError(spell, form) === 'ok') {
    const fragile = slots.some((s) => s.formId !== form && shapeshiftCastError(spell, s.formId) !== 'ok');
    return fragile ? { holdForm: form, castSpellId: null } : null;
  }
  // Class bar order (Battle, Defensive, Berserker): Execute is Battle|Berserker and comes back
  // Battle, where the rest of an Arms rotation already lives.
  const fix = slots.find((s) => shapeshiftCastError(spell, s.formId) === 'ok');
  return fix ? { holdForm: fix.formId, castSpellId: fix.spellId } : null;
}

/** A live claim on the stance bar: what to hold, and when it lapses. */
export interface StanceHold {
  form: ShapeshiftFormId;
  // Session clock the claim lapses at. Null while a press is still queued for it — that press is
  // the deadline, and cancelling it is how the player hands the stance back.
  until: number | null;
}

// A stance the player pressed by hand, with nothing queued behind it, holds this long. Five GCDs:
// enough to reach the ability they swapped for, short enough that a stray press is not permanent.
export const STANCE_HOLD_MS = 8000;

/**
 * True when a rotation pick shifts out of the stance a press claimed. Without it the warrior packs'
 * own `Battle Stance when formId != 17` row re-casts on the tick after the swap, every time.
 */
export function rotationPickBlockedByHold(
  spell: SpellDef,
  hold: StanceHold | null,
  now: number,
): boolean {
  if (!hold) return false;
  if (hold.until != null && now >= hold.until) return false;
  return isFormSpell(spell) && formIdFromSpell(spell) !== hold.form;
}
