// Product-layer party-aura membership: drop an aura nobody in the player's subgroup can still supply.
// Combat's maintain pass owns this in a fight; the sheet must do the same on every other transition.

import type { DataStore } from '../../data/dataStore.ts';
import { getActiveBuffIds } from '../../domain/character/character.ts';
import type { ActiveAura } from '../../domain/character/character.ts';
import {
  dropUnsourcedAreaAuras,
  partySuppliedAuraIds,
} from '../../domain/spells/areaAuraMembership.ts';
import { partyRaidSubgroups } from '../../domain/raid/raidComp.ts';
import { dropWeakerMultirankSiblings } from '../spells/auraStacking.ts';
import { companionSpellbook } from '../../domain/bots/squad.ts';
import type { GameState } from './types.ts';

/** A unit's own supply: its spellbook plus its pet's kit. A holder never loses its own aura. */
function ownSupplyLists(
  ds: DataStore,
  known: readonly number[] | undefined,
  pet: { creature: number; taughtSpells?: readonly number[] } | undefined,
  petSpells: readonly number[] | undefined,
): (readonly number[])[] {
  const lists: (readonly number[])[] = [known ?? []];
  if (pet) {
    // Blood Pact lives on the Imp, never in the owner's spellbook. Cite: KI-436.
    lists.push(
      ds.creature(pet.creature)?.spells ?? [],
      ds.creature(pet.creature)?.petSpells ?? [],
      petSpells ?? [],
      pet.taughtSpells ?? [],
    );
  }
  return lists;
}

// Supply of the units PRESENT: inside an instance, or on a `withSquad` pull outdoors (autopilot's
// squadJoinsPull), the companions are in radius; a solo pull has none. Cite: SpellAuras.cpp:597 IsWithinDistInMap.
export function partyAuraSupplyLists(
  state: GameState,
  ds: DataStore,
  squadPresent = false,
): (readonly number[])[] {
  const lists = ownSupplyLists(ds, state.spellbook?.known, state.char.pet, state.char.petSpells);
  if (!state.instance && !squadPresent) return lists;
  const squad = state.squad ?? [];
  // Same seating the fight uses (raidComp.partyRaidSubgroups) - a sheet that strips on a
  // different grouping than combat maintains would drop an aura the group can still supply.
  const subgroups = partyRaidSubgroups(
    { cls: state.char.cls, role: state.squadRole ?? 'dps' },
    squad.map((c) => ({ cls: c.cls, role: c.role, key: c.id })),
    state.autopilot?.raidSeating ?? null,
  );
  const playerSub = subgroups[0] ?? 0;
  for (let i = 0; i < squad.length; i++) {
    if ((subgroups[i + 1] ?? 0) !== playerSub) continue;
    const c = squad[i]!;
    lists.push(...companionOwnSupplyLists(state, ds, c));
  }
  return lists;
}

function companionOwnSupplyLists(
  state: GameState,
  ds: DataStore,
  c: NonNullable<GameState['squad']>[number],
): (readonly number[])[] {
  return ownSupplyLists(
    ds, companionSpellbook(c, c.level ?? state.char.level, ds).known, c.pet, c.petSpells,
  );
}

function spellOf(ds: DataStore): (id: number) => ReturnType<DataStore['spell']> {
  return (id) => ds.spell(id);
}

// Strip class-A auras nobody in the subgroup still supplies, and collapse a multirank pair the sheet
// may already hold - an older save carries both Mark of the Wild and Gift of the Wild until expiry.
export function reconcileGamePartyAuras(
  state: GameState,
  ds: DataStore,
  now: number = Date.now(),
  squadPresent = false,
): void {
  const lookup = spellOf(ds);
  const supplied = partySuppliedAuraIds(partyAuraSupplyLists(state, ds, squadPresent), lookup);
  const sourced = dropUnsourcedAreaAuras(state.char.activeAuras, { spell: lookup, supplied });
  const next = dropWeakerMultirankSiblings(sourced, lookup);
  if (next !== state.char.activeAuras) {
    const kept = [...next];
    state.char = {
      ...state.char,
      activeAuras: kept,
      activeBuffs: getActiveBuffIds({ ...state.char, activeAuras: kept }, now, ds),
    };
  }
  // Companions and every pet carry the same class-A chips; a paladin leave used to drop only the
  // player's sheet.
  const reconcilePet = (pet: { prePullAuras?: ActiveAura[] } | undefined): void => {
    if (!pet?.prePullAuras?.length) return;
    const from = dropUnsourcedAreaAuras(pet.prePullAuras, { spell: lookup, supplied });
    const kept = dropWeakerMultirankSiblings(from, lookup);
    if (kept === pet.prePullAuras) return;
    pet.prePullAuras = kept.length ? [...kept] : undefined;
  };
  reconcilePet(state.char.pet);
  for (const c of state.squad ?? []) {
    // The companion keeps what it casts itself (the holder row) plus what is present around it.
    const own = new Set(supplied);
    for (const id of partySuppliedAuraIds(companionOwnSupplyLists(state, ds, c), lookup)) own.add(id);
    if (c.pet?.prePullAuras?.length) {
      const from = dropUnsourcedAreaAuras(c.pet.prePullAuras, { spell: lookup, supplied: own });
      const kept = dropWeakerMultirankSiblings(from, lookup);
      if (kept !== c.pet.prePullAuras) c.pet.prePullAuras = kept.length ? [...kept] : undefined;
    }
    if (!c.prePullAuras?.length) continue;
    const from = dropUnsourcedAreaAuras(c.prePullAuras, { spell: lookup, supplied: own });
    const kept = dropWeakerMultirankSiblings(from, lookup);
    if (kept === c.prePullAuras) continue;
    c.prePullAuras = kept.length ? [...kept] : undefined;
  }
}
