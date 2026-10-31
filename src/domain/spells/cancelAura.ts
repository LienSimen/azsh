// CMSG_CANCEL_AURA — right-clicking a buff drops the aura. A port of HandleCancelAuraOpcode. Word 0
// and word 1 attributes are both baked, so every bit this gate needs is readable.

import type { SpellDef } from '../../data/schema/spell.ts';
import { SPELL_ATTR } from '../../engine/spells/spellAttributes.ts';
import { isPartyAreaAura } from './areaAuraMembership.ts';

/** SPELL_ATTR_AURA_IS_DEBUFF. Cite: SpellDefines.h:56 (word 0 bit 26). */
export const SPELL_ATTR_AURA_IS_DEBUFF = 0x04000000;
/** SPELL_ATTR_EX_NO_AURA_ICON. Cite: SpellDefines.h:94 (word 1 bit 28). */
export const SPELL_ATTR_EX_NO_AURA_ICON = 0x10000000;

/** Why a right-click did nothing, or null when the aura may be cancelled. */
export type AuraCancelRefusal =
  | 'unknown-spell'
  | 'passive'
  | 'debuff'
  | 'no-aura-cancel'
  | 'no-aura-icon'
  | 'channeled'
  | 'possessed'
  | 'foreign-area-aura';

// The two gate inputs that are state rather than spell data, both straight off the opcode: is the
// player possessed or charmed, and is the holder's caster the player.
export interface AuraCancelState {
  /** True while something else drives the player. Refuses every cancel. */
  possessed?: boolean;
  // True when the player is the holder's caster. Only consulted for an area aura, and `undefined` counts as
  // NOT own — an unknown caster must not open a cancel the core refuses.
  ownAura?: boolean;
}

// HandleCancelAuraOpcode in the core's own order, so the reason reported is the gate the client would
// have hit. Only the holder lookup is left to the caller, which already holds the aura.
export function auraCancelRefusal(
  sp: SpellDef | null | undefined,
  st: AuraCancelState = {},
): AuraCancelRefusal | null {
  if (!sp) return 'unknown-spell';
  const attr = (sp.attributes ?? 0) >>> 0;
  // :431 SPELL_ATTR_NO_AURA_CANCEL.
  if (attr & SPELL_ATTR.NO_AURA_CANCEL) return 'no-aura-cancel';
  // :434 SPELL_ATTR_EX_NO_AURA_ICON. Word 1 is baked; 933 rows carry the bit.
  if (((sp.attributesEx ?? 0) >>> 0) & SPELL_ATTR_EX_NO_AURA_ICON) return 'no-aura-icon';
  // :437 IsPassiveSpell (SpellMgr.h:340); `passive` is the baked word-0 bit 6, exact on every row.
  if (sp.passive) return 'passive';
  // :446 "cant remove any auras while possessed" — UNIT_FLAG_POSSESSED || HasCharmer().
  if (st.possessed) return 'possessed';
  // :450 !holder->IsPositive() (SpellAuras.cpp:5846). The engine's own buffs/debuffs split covers
  // the hostile-caster case; this is the attribute half (IsPositiveAuraEffect, SpellMgr.h:1214).
  if (attr & SPELL_ATTR_AURA_IS_DEBUFF) return 'debuff';
  // :475 IsChanneledSpell (SpellMgr.h:1373) — the core interrupts the channel, not the holder.
  if (sp.channelMs) return 'channeled';
  // "Not own area auras can't be cancelled". isPartyAreaAura is this tree's predicate for
  // effect 35 and also catches the bake rows carrying only that — the auras you hold but did not cast.
  if (!st.ownAura && isPartyAreaAura(sp)) return 'foreign-area-aura';
  return null;
}

// Reason text for a refused cancel. The real client draws no cancelable flag on these and a
// right-click does nothing, so a caller should prefer silence; these exist for the dev log.
export const CANCEL_AURA_REFUSAL_TEXT: Record<AuraCancelRefusal, string> = {
  'unknown-spell': 'Unknown spell',
  passive: 'That is a passive effect',
  debuff: 'You cannot remove a debuff',
  'no-aura-cancel': 'That effect cannot be cancelled',
  'no-aura-icon': 'That effect cannot be cancelled',
  channeled: 'Stop the channel instead',
  possessed: 'You are not in control of yourself',
  'foreign-area-aura': 'Only the caster can cancel that aura',
};

/** True when a buff chip for `sp` should respond to a right-click. */
export function canCancelAura(
  sp: SpellDef | null | undefined,
  st: AuraCancelState = {},
): boolean {
  return auraCancelRefusal(sp, st) === null;
}
