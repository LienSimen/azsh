// Create Healthstone OOC helpers (Warlock.cpp CreateHealthStoneWarlock). Kept out of game.ts to stay under
// the filesize ratchet.
import type { DataStore } from '../../data/dataStore.ts';
import type { SpellEffect } from '../../data/schema.ts';
import type { Character } from '../../domain/character/character.ts';
import { countItem, type Inventory } from '../../domain/items/inventory.ts';
import {
  CREATE_HEALTHSTONE_SPELL_IDS,
  improvedHealthstoneRankFromTalents,
  type InterpretContext,
} from '../spells/interpreter/index.ts';

function isCreateHealthstone(spellId: number): boolean {
  return (CREATE_HEALTHSTONE_SPELL_IDS as readonly number[]).includes(spellId);
}

/** Improved Healthstone talent rank for resolveCombatSpell (itypes column). */
export function createHealthstoneInterpretCtx(
  spellId: number,
  char: Character,
  ds: DataStore,
): Pick<InterpretContext, 'improvedHealthstoneRank'> {
  if (!isCreateHealthstone(spellId)) return {};
  const rank = improvedHealthstoneRankFromTalents(
    char.talents,
    (id) => ds.talent(id),
    (char.activeAuras ?? []).map((a) => a.spellId),
  );
  return rank > 0 ? { improvedHealthstoneRank: rank } : {};
}

// SPELL_FAILED_TOO_MANY_OF_ITEM when the selected stone is already in bags. Cite: Warlock.cpp
// CreateHealthStoneWarlock::OnCheckCast.
export function createHealthstoneBlockedReason(
  spellId: number,
  effects: readonly SpellEffect[],
  inv: Inventory,
): string | null {
  if (!isCreateHealthstone(spellId)) return null;
  const conj = effects.find((e) => e.kind === 'conjure');
  if (conj && conj.kind === 'conjure' && conj.item > 0 && countItem(inv, conj.item) > 0) {
    return 'You already have that item';
  }
  return null;
}
