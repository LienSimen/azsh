// Stealth up in the MOMENT before the pull, never for the walk in — every real sneak carries
// MOD_DECREASE_SPEED. The window is one-sided: the first thing that flags combat closes it.

import type { DataStore } from '../../data/dataStore.ts';
import type { SpellDef } from '../../data/schema.ts';
import { SHAPESHIFT_FORM } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import type { SpellBook } from '../character/spellbook.ts';
import { requiredFormIdFromStances } from '../rotation/classify.ts';

/** SPELL_AURA_MOD_DECREASE_SPEED — the sneak tax, and what separates a sneak from Shadowmeld. */
const AURA_MOD_DECREASE_SPEED = 33;

/** A spell is castable in `form` when it names no stance, or names that one. */
function stanceAllows(spell: SpellDef, form: number): boolean {
  const stances = spell.stances ?? 0;
  if (!stances) return true;
  return requiredFormIdFromStances(stances) === form;
}

// The sneak this character would press before a pull: a stealth aura it can hold out of combat
// that also SLOWS it. That second half keeps Shadowmeld out, which is a hide, not an opener.
function bestSneakSpell(char: Character, sb: SpellBook, ds: DataStore): SpellDef | null {
  const form = (char.form ?? 0) | 0;
  let best: SpellDef | null = null;
  let bestStrength = 0;
  for (const id of sb.known) {
    const s = ds.spell(id);
    if (!s || s.passive) continue;
    if (!s.notInCombatOnly) continue;
    if ((s.reqLevel ?? 0) > char.level) continue;
    if (!stanceAllows(s, form)) continue;
    if (!(s.rawEffects ?? []).some((r) => (r.auraName | 0) === AURA_MOD_DECREASE_SPEED)) continue;
    let strength = 0;
    for (const e of s.effects) if (e.kind === 'stealth') strength = Math.max(strength, e.strength | 0);
    if (strength <= 0 || strength <= bestStrength) continue;
    best = s;
    bestStrength = strength;
  }
  return best;
}

// True when this character owns an opener that only fires from stealth and can fire it in the form
// the sneak leaves it in. Without one, stealthing costs the opening white swing and buys nothing.
function hasStealthOpener(char: Character, sb: SpellBook, ds: DataStore, sneakForm: number): boolean {
  for (const id of sb.known) {
    const s = ds.spell(id);
    if (!s || !s.requiresStealth) continue;
    if ((s.reqLevel ?? 0) > char.level) continue;
    if (stanceAllows(s, sneakForm)) return true;
  }
  return false;
}

// The stealth spell this character should already hold when the pull starts, or null. The caller
// seeds it as an active aura and lets buildCombatant derive strength and break flags.
export function prePullStealthSpell(char: Character, sb: SpellBook, ds: DataStore): SpellDef | null {
  const sneak = bestSneakSpell(char, sb, ds);
  if (!sneak) return null;
  // fighterFactory only stamps FORM_STEALTH when the unit has no form of its own, so a druid
  // that prowls stays in FORM_CAT and its openers (Ravage / Pounce, stances bit 0) still gate.
  const sneakForm = ((char.form ?? 0) | 0) || SHAPESHIFT_FORM.STEALTH;
  return hasStealthOpener(char, sb, ds, sneakForm) ? sneak : null;
}

// The sneak for the pull about to start — one implementation for the companion seat (squad.ts) and
// the player's own (combatSession.ts). Seeded as an AURA; buildCombatant derives the rest.
export function seedPrePullStealth(
  char: Character,
  sb: SpellBook,
  ds: DataStore,
  opts?: { spellCooldowns?: Record<number, number> | null; now?: number },
): SpellDef | null {
  const sneak = prePullStealthSpell(char, sb, ds);
  if (!sneak) return null;
  const now = opts?.now ?? 0;
  if ((opts?.spellCooldowns?.[sneak.id] ?? 0) > now) return null;
  const auras = (char.activeAuras ??= []);
  if (auras.some((a) => a.spellId === sneak.id)) return sneak;
  auras.push({ spellId: sneak.id });
  return sneak;
}
