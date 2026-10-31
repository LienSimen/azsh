// Stage s22: Widow's Embrace, the only thing that removes Faerlina's Enrage, ported from its spell
// script. The 30 s aura is the lockout window; without it the Enrage returns on her next 60 s tick.

/** boss_faerlina.cpp:46 SPELL_WIDOWS_EMBRACE — cast on Faerlina by a mind-controlled add. */
export const WIDOWS_EMBRACE_SPELL_ID = 28732;
/** boss_faerlina.cpp:47 SPELL_WIDOWS_EMBRACE_CD — self-cast lockout / "enrage debuff" marker. */
export const WIDOWS_EMBRACE_CD_SPELL_ID = 28797;
/** boss_faerlina.cpp:44 SPELL_ENRAGE — aura 79 MOD_DAMAGE_PERCENT_DONE 150 physical + haste. */
export const FAERLINA_ENRAGE_SPELL_ID = 28798;
/** boss_faerlina.cpp:48 SPELL_INSTAKILL_SELF — the Worshipper dies casting the Embrace. */
export const WIDOWS_EMBRACE_INSTAKILL_SPELL_ID = 28748;

// The lockout window in ms: the Widow's Embrace aura's own baked duration, passed in so the number
// stays the row's. A missing duration falls back to 0 — strip only, rather than a guessed 30 s.
export function widowsEmbraceLockoutMs(auraDurationMs: number | undefined): number {
  const d = auraDurationMs ?? 0;
  return d > 0 ? d : 0;
}

// Is this cast the Enrage that the lockout refuses? Cite: WidowEmbrace OnApply — the CD spell exists
// precisely to keep 28798 off her.
export function widowsEmbraceRefusesCast(spellId: number, casterHasLockout: boolean): boolean {
  return casterHasLockout && (spellId | 0) === FAERLINA_ENRAGE_SPELL_ID;
}
