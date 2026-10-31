// RemoveAurasWithInterruptFlags / RemoveAurasOnCast for the OUT-OF-COMBAT sheet — combat's own copy
// is combat/interruptAuras.ts. Cite: Unit.cpp:5195, Unit.cpp:5239.

import type { DataStore } from '../../data/dataStore.ts';
import type { SpellDef } from '../../data/schema.ts';
import type { ActiveAura, Character } from '../../domain/character/character.ts';
import { isStealthShapeshift } from '../../domain/character/forms.ts';
import { DISPEL_TYPE } from '../../domain/spells/dispel.ts';
import { hasAttrEx, hasAttrEx2, SPELL_ATTR_EX, SPELL_ATTR_EX2 } from '../spells/spellAttributes.ts';
import type { CombatSession } from '../combat/session-types.ts';

/** A holder survives the cast under either ALLOW_WHILE_* exemption. Cite: Unit.cpp:5249-5251. */
function exemptFromCast(holder: SpellDef, casted: SpellDef): boolean {
  // "spellEntry->Id != castedSpellEntry->Id" — a cast never strips the holder it just applied.
  if (holder.id === casted.id) return true;
  const dispel = (holder.dispel ?? 0) | 0;
  if (hasAttrEx(casted, SPELL_ATTR_EX.ALLOW_WHILE_STEALTHED) && dispel === DISPEL_TYPE.STEALTH) return true;
  if (hasAttrEx2(casted, SPELL_ATTR_EX2.ALLOW_WHILE_INVISIBLE) && dispel === DISPEL_TYPE.INVISIBILITY) return true;
  return false;
}

/** Drop sheet auras carrying `flags`; `castedSpell` switches it to the RemoveAurasOnCast form. */
export function removeCharAurasWithInterruptFlags(
  char: Character,
  flags: number,
  ds: DataStore,
  castedSpell?: SpellDef | null,
  live?: CombatSession | null,
): SpellDef[] {
  const mask = flags | 0;
  if (!mask) return [];
  // Two stores hold auras; on a floor usually only the session does. Cast start owns the
  // ALLOW_WHILE_* skip (Unit.cpp:5247-5251). Sheet write-back after a pull is creditFloorKills.
  const skipStealth = !!(castedSpell && hasAttrEx(castedSpell, SPELL_ATTR_EX.ALLOW_WHILE_STEALTHED));
  const skipInvisibility = !!(castedSpell && hasAttrEx2(castedSpell, SPELL_ATTR_EX2.ALLOW_WHILE_INVISIBLE));
  live?.removeAurasWithInterruptFlags?.('player', mask, 'interrupt', {
    ...(skipStealth ? { skipStealth: true } : {}),
    ...(skipInvisibility ? { skipInvisibility: true } : {}),
    ...(castedSpell ? { exceptSpellId: castedSpell.id } : {}),
  });
  const auras = char.activeAuras;
  if (!auras || auras.length === 0) return [];
  const removed: SpellDef[] = [];
  const kept: ActiveAura[] = [];
  for (const a of auras) {
    const sp = ds.spell(a.spellId);
    if (!sp || (((sp.auraInterruptFlags ?? 0) | 0) & mask) === 0) { kept.push(a); continue; }
    if (castedSpell && exemptFromCast(sp, castedSpell)) { kept.push(a); continue; }
    removed.push(sp);
  }
  if (!removed.length) return [];
  char.activeAuras = kept;
  // FORM_STEALTH goes with its holder, as the OOC toggle does (oocCastMethods.ts recast branch).
  if (removed.some((sp) => sp.effects.some((e) => e.kind === 'stealth'))
    && isStealthShapeshift((char.form ?? 0) | 0)) {
    char.form = undefined;
  }
  const gone = new Set(removed.map((sp) => sp.id));
  if (char.activeBuffs?.length) char.activeBuffs = char.activeBuffs.filter((id) => !gone.has(id));
  return removed;
}

/** Spell.cpp:2941-2944: a triggered payload and a NOT_AN_ACTION spell never run the ACTION strip. */
export function castIsAnAction(spell: SpellDef, triggered = false): boolean {
  return !triggered && !hasAttrEx2(spell, SPELL_ATTR_EX2.NOT_AN_ACTION);
}

// Drop sheet stealth the open session no longer holds. An endless run's only sheet write-back is
// creditFloorKills, which carried skill and item spends but never auras.
export function syncSheetStealthFromSession(
  char: Character,
  ds: DataStore,
  live: CombatSession | null | undefined,
): SpellDef[] {
  if (!live) return [];
  const auras = char.activeAuras;
  if (!auras || auras.length === 0) return [];
  if (live.playerView().stealthed) return [];
  const removed: SpellDef[] = [];
  const kept: ActiveAura[] = [];
  for (const a of auras) {
    const sp = ds.spell(a.spellId);
    if (sp && sp.effects.some((e) => e.kind === 'stealth')) removed.push(sp);
    else kept.push(a);
  }
  if (!removed.length) return [];
  char.activeAuras = kept;
  if (isStealthShapeshift((char.form ?? 0) | 0)) char.form = undefined;
  const gone = new Set(removed.map((sp) => sp.id));
  if (char.activeBuffs?.length) char.activeBuffs = char.activeBuffs.filter((id) => !gone.has(id));
  return removed;
}
