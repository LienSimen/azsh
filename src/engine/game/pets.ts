// Hunter and warlock pet facade methods plus the Feed Pet helpers. The out-of-combat regen helper is
// exported so game.ts can call it without pets importing game.ts.

import {
  newPet, petHasHappiness, petTaughtIds, petRepertoireHas,
  feedPetHappinessGain, petDiet, isPetFood, tpForSpell, hasTpForSpell,
  LOYALTY_REBELLIOUS, FEED_PET_DURATION_S,
  autoFeedThreshold, AUTO_FEED_TARGET, HAPPINESS_MAX,
  applyPetPartyAuras, stripPetPartyAuras, petPartyAuraSpellIds, reconcilePetPartyAuras,
  applyPetHappinessPowerDrains,
} from '../../domain/pet/pet.ts';
import { resolveSpellId } from '../../domain/character/spellbook.ts';
import { removeItem, countItem } from '../../domain/items/inventory.ts';
import { itemTeachIntent } from '../../domain/items/itemTeaches.ts';
import { canInteractWithCreature } from '../../domain/creature/faction.ts';
import type { Character } from '../../domain/character/character.ts';
import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import { CLASS } from '../../data/schema.ts';
import { resolveCombatSpell } from '../spells/interpreter/item-triggers.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';
import { moneyMarked } from '../../domain/economy/money.ts';
import { vendorPriceMultiplierFor, trainerSpellCost } from './vendorOffers.ts';
import { refuseIfDead, refuseIfInCombat } from '../../domain/run/death.ts';
import { playerCombatFlagSet } from './oocCast.ts';
import type { CombatSession } from '../combat/session-types.ts';
import {
  buyStableSlot as purchaseStableSlot,
  findFreeStableSlot,
  setStableOccupant,
  stableOccupant,
} from '../../domain/pet/petStable.ts';

/** Dismiss Pet — sole classic SPELL_EFFECT_DISMISS_PET (102) row. Cite: spell 2641. */
const DISMISS_PET_SPELL_ID = 2641;

/** COMMAND_FOLLOW / COMMAND_STAY. Attack is mid-fight only. Cite: Pet.h CommandStates. */
function isPetCommand(v: unknown): v is 'follow' | 'stay' {
  return v === 'follow' || v === 'stay';
}

/** REACT_PASSIVE / DEFENSIVE / AGGRESSIVE. Cite: Pet.h ReactStates. */
function isPetReact(v: unknown): v is 'aggressive' | 'defensive' | 'passive' {
  return v === 'aggressive' || v === 'defensive' || v === 'passive';
}

// Shared feed validation for every feed path: a living happiness pet, real pet food in its diet, and
// still worth eating at the pet's level. Returns the food and the full-course happiness gain.
function resolveFeed(
  ctx: GameCtx,
  itemEntry: number,
): { ok: true; it: ItemDef; gain: number } | { ok: false; reason: string } {
  const { ds, state } = ctx;
  const pet = state.char.pet;
  if (!pet) return { ok: false, reason: 'You have no pet' };
  if (pet.health <= 0) return { ok: false, reason: 'Your pet is dead' };
  const petDef = ds.creature(pet.creature);
  if (!petDef || !petHasHappiness(petDef)) return { ok: false, reason: 'This pet has no happiness' };
  // item_template.FoodType is the canonical marker (Pet.cpp HaveInDiet); the legacy
  // consumable shape covers fixtures/seed foods.
  const it = ds.item(itemEntry);
  if (!it || !isPetFood(it)) return { ok: false, reason: 'Not pet food' };
  if (!petDiet(petDef, it)) return { ok: false, reason: 'Your pet will not eat that' };
  const gain = feedPetHappinessGain(state.char.level, it.itemLevel ?? 0);
  if (gain <= 0) return { ok: false, reason: 'That food is too low-level to help' };
  return { ok: true, it, gain };
}

// The first bag food that passes the feed check, for a Feed Pet cast with no item cursor.
// Cite: Spell.cpp:5332-5355 CheckCast FEED_PET itemTarget.
export function firstFeedableFoodEntry(ctx: GameCtx): number | null {
  for (const stack of ctx.state.inventory.stacks) {
    if ((stack.count ?? 0) <= 0) continue;
    if (resolveFeed(ctx, stack.item).ok) return stack.item;
  }
  return null;
}

// Begin the 20 s Feed Pet effect, consuming one food; the caller has validated diet and gain.
// Re-feeding replaces a running effect, as a recast aura does. Cite: spell 1539.
function beginFeeding(ctx: GameCtx, it: ItemDef, gain: number, auto: boolean): void {
  const { state, log } = ctx;
  const pet = state.char.pet!;
  state.inventory = removeItem(state.inventory, it.entry, 1)[0];
  state.char.pet = { ...pet, feedRemaining: gain, feedPerSec: gain / FEED_PET_DURATION_S };
  log(
    `${pet.name} ${auto ? 'automatically eats' : 'begins eating'} ${it.name} `
    + `(+${gain} happiness - ${gain / 10} per bite every 2s over ${FEED_PET_DURATION_S}s).`,
  );
}

// Out-of-combat auto-feed: once happiness has fallen far enough that a full course lands without
// wasting benefit. A silent no-op when the food ran out or greyed out, so the setting survives.
function tryAutoFeedImpl(ctx: GameCtx): void {
  const { state } = ctx;
  const pet = state.char.pet;
  if (!pet || pet.health <= 0 || pet.autoFeed == null) return;
  if ((pet.feedRemaining ?? 0) > 0) return;                 // already mid-course
  if (countItem(state.inventory, pet.autoFeed) <= 0) return; // out of that food
  const r = resolveFeed(ctx, pet.autoFeed);
  if (!r.ok) return;                                         // no longer edible - keep setting
  if (pet.happiness > autoFeedThreshold(r.gain)) return;    // still topped up
  beginFeeding(ctx, r.it, r.gain, true);
}

/** Pure OOC regen callback (progression/rest.ts regen) — injected to avoid pets→rest coupling. */
export type OocRegenFn = (
  char: Character,
  ds: DataStore,
  seconds: number,
  sitting: boolean,
) => Character;

// Run OOC regen then auto-feed, stepping in one-second quanta while armed so a course started
// mid-window still absorbs. A single bulk pass would consume the food with no happiness gain.
function applyOocRegenImpl(ctx: GameCtx, seconds: number, sitting: boolean, regenFn: OocRegenFn): void {
  const { state, ds } = ctx;
  const pet = state.char.pet;
  const stepBulk = !!pet && pet.health > 0 && pet.autoFeed != null && seconds > 1 + 1e-9;
  if (stepBulk) {
    let left = seconds;
    while (left > 1e-9) {
      const step = Math.min(1, left);
      state.char = regenFn(state.char, ds, step, sitting);
      tryAutoFeedImpl(ctx);
      left -= step;
    }
  } else {
    state.char = regenFn(state.char, ds, seconds, sitting);
    tryAutoFeedImpl(ctx);
  }
}

/** Export feed helpers for game.ts regenTick (pets module must not import game.ts). */
export function createPetFeedHelpers(ctx: GameCtx): {
  tryAutoFeed: () => void;
  applyOocRegen: (seconds: number, sitting: boolean, regenFn: OocRegenFn) => void;
} {
  return {
    tryAutoFeed: () => tryAutoFeedImpl(ctx),
    applyOocRegen: (seconds, sitting, regenFn) => applyOocRegenImpl(ctx, seconds, sitting, regenFn),
  };
}

export type PetsExtras = {
  /** Open combat/floor session — Feed Pet refuses while the pull owns the flag. */
  liveSession: () => CombatSession | null;
};

export function createPetsModule(ctx: GameCtx, extras: PetsExtras): Pick<
  Game,
  | 'trainPet'
  | 'tamePet'
  | 'feedPet'
  | 'setPetAutoFeed'
  | 'buyPetSpell'
  | 'teachPetSpell'
  | 'togglePetAutocast'
  | 'setPetCommand'
  | 'setPetReact'
  | 'dismissPet'
  | 'buyStableSlot'
  | 'stablePet'
  | 'callStabledPet'
> {
  const { ds, state, log } = ctx;
  return {
    trainPet(itemEntry) {
      const it = ds.item(itemEntry);
      // Through the shared teach intent so the gate matches every other teach surface: all 59
      // grimoires carry the baked field today, and this stays right if a future bake drops it.
      const teach = itemTeachIntent(it, ds);
      if (!it || teach?.kind !== 'petSpell') return { ok: false, reason: 'That is not a pet-training book' };
      if (it.allowClass && !it.allowClass.includes(state.char.cls)) return { ok: false, reason: 'Your class cannot study this' };
      if (it.requiredLevel > state.char.level) return { ok: false, reason: `Requires level ${it.requiredLevel}` };
      if (countItem(state.inventory, itemEntry) <= 0) return { ok: false, reason: "You don't have that book" };
      const liveId = resolveSpellId(teach.id, ds);
      const spell = ds.spell(liveId);
      if (!spell) return { ok: false, reason: 'That book teaches an unknown ability' };
      state.char.petSpells = state.char.petSpells ?? [];
      if (petRepertoireHas(state.char.petSpells, liveId, ds)) {
        return { ok: false, reason: `${spell.name} (Rank ${spell.rank}) is already known` };
      }
      // Reading the book consumes it and unlocks the rank character-wide, so a re-summoned demon
      // keeps it. Store the live rank, never the learn stub. Cite: SpellEffects.cpp:3399-3404.
      state.inventory = removeItem(state.inventory, itemEntry, 1)[0];
      state.char.petSpells.push(liveId);
      // Grimoire while Imp is out: APPLY_AREA_AURA_PARTY (Blood Pact) lands immediately.
      // Cite: AreaAura::Update; KI-066.
      if (state.char.pet && state.char.pet.health > 0) {
        state.char = applyPetPartyAuras(state.char, ds);
      }
      log(`You study ${it.name}. Your pet can now cast ${spell.name} (Rank ${spell.rank}).`);
      return { ok: true, spell: spell.id, name: spell.name };
    },

    tamePet(creatureEntry) {
      const c = ds.creature(creatureEntry);
      if (!c?.tameable) return { ok: false, reason: 'That beast cannot be tamed' };
      // Taming is gated in the UI: the button appears only once Tame Beast is learned, which is the
      // only in-game path here. The facade itself stays an ungated primitive.
      const pet = newPet(creatureEntry, ds, state.char);
      if (!pet) return { ok: false, reason: 'Unknown beast' };
      state.char.pet = pet;
      // New tame abandons any dismissed pet (NOT_IN_SLOT). Stabled slots are untouched.
      state.char.storedPet = undefined;
      log(`You tamed ${c.name}.`);
      return { ok: true };
    },

    feedPet(itemEntry) {
      const r = resolveFeed(ctx, itemEntry);
      if (!r.ok) return r;
      // Feed Pet 6991 is a non-combat spell and the effect refuses a pet in combat. CheckCast order:
      // no pet / wrong diet first, combat last. Cite: Spell.cpp:5340-5353 pet->IsInCombat().
      const live = extras.liveSession();
      const busy = refuseIfInCombat(
        live?.unitInCombat?.('pet') === true || playerCombatFlagSet(live),
      );
      if (busy) return busy;
      if (countItem(state.inventory, itemEntry) <= 0) return { ok: false, reason: "You don't have that" };
      // Full Feed Pet Effect course: per-tick benefit × 10 ticks (35/17/8) - restored over
      // 20s by rest.ts tickFeeding, not instantly.
      beginFeeding(ctx, r.it, r.gain, false);
      return { ok: true };
    },

    setPetAutoFeed(itemEntry) {
      const pet = state.char.pet;
      if (!pet) return { ok: false, reason: 'You have no pet' };
      if (itemEntry == null) {
        // Toggle off - leave everything else on the pet untouched.
        if (pet.autoFeed != null) {
          state.char.pet = { ...pet, autoFeed: undefined };
          log(`${pet.name} will no longer auto-feed.`);
        }
        return { ok: true, entry: null };
      }
      // Validate the food the same way feedPet does, but don't consume anything yet - the
      // auto-feed tick handles that once happiness drops.
      const r = resolveFeed(ctx, itemEntry);
      if (!r.ok) return r;
      state.char.pet = { ...pet, autoFeed: itemEntry };
      log(
        `${pet.name} will auto-feed ${r.it.name} at ${Math.round(autoFeedThreshold(r.gain) / (HAPPINESS_MAX / 100))}% happiness `
        + `(back up to ~${Math.round(AUTO_FEED_TARGET / (HAPPINESS_MAX / 100))}%).`,
      );
      return { ok: true, entry: itemEntry };
    },

    buyPetSpell(trainerEntry, spellId) {
      const trainer = ds.trainer(trainerEntry);
      if (!trainer) return { ok: false, reason: 'No trainer here' };
      if (!canInteractWithCreature(ds, state.char.race, trainerEntry)) {
        return { ok: false, reason: 'They refuse to deal with you.' };
      }
      // Pet trainers are tagged by subname "Pet Trainer" (baked) or offer via zone.petTrainers.
      const isPetTrainer = (trainer.subname ?? '').toLowerCase().includes('pet trainer');
      if (!isPetTrainer) return { ok: false, reason: 'That is not a pet trainer' };
      const ts = trainer.spells.find((s) => s.spell === spellId);
      if (!ts) return { ok: false, reason: "The trainer doesn't offer that" };
      // The vanilla split: buying at the trainer teaches YOU the rank, character-wide, and each pet is
      // then taught from it for its own training points. The core gates only class and money.
      if (state.char.cls !== CLASS.HUNTER) return { ok: false, reason: 'Only hunters train pet abilities' };
      const liveId = resolveSpellId(spellId, ds);
      const known = state.char.petSpells ?? [];
      if (petRepertoireHas(known, liveId, ds)) return { ok: false, reason: 'Already known' };
      if (state.char.level < ts.reqLevel) return { ok: false, reason: `Requires level ${ts.reqLevel}` };
      const cost = trainerSpellCost(ts.cost, vendorPriceMultiplierFor(ds, state.char, trainerEntry));
      if (state.char.gold < cost) return { ok: false, reason: 'Not enough money' };
      state.char.gold -= cost;
      if (!state.char.petSpells) state.char.petSpells = [];
      state.char.petSpells.push(liveId);
      const sp = ds.spell(liveId);
      log(`You learned ${sp?.name ?? spellId}${sp?.rank ? ` (Rank ${sp.rank})` : ''} for ${moneyMarked(cost)} - teach it to your pet via Beast Training.`);
      return { ok: true };
    },

    teachPetSpell(spellId) {
      const pet = state.char.pet;
      if (!pet) return { ok: false, reason: 'You have no pet' };
      if (pet.health <= 0) return { ok: false, reason: 'Your pet is dead' };
      const petDef = ds.creature(pet.creature);
      if (!petDef || !petHasHappiness(petDef)) {
        return { ok: false, reason: 'Only a hunter pet can be taught' };
      }
      const liveId = resolveSpellId(spellId, ds);
      const sp = ds.spell(liveId);
      if (!sp) return { ok: false, reason: 'Unknown ability' };
      const repertoire = state.char.petSpells ?? [];
      if (!petRepertoireHas(repertoire, liveId, ds)) return { ok: false, reason: "You haven't learned that rank" };
      // The pet must be able to use it: its family kit or the shared Pet-Generic line.
      const family = petDef.petSpells ?? [];
      const generic = (ds.petGenericSpells?.() ?? []).some((g) => g.id === liveId || resolveSpellId(g.id, ds) === liveId);
      if (!generic && !family.includes(liveId) && !family.includes(spellId)) {
        return { ok: false, reason: 'Your pet cannot learn that' };
      }
      // petTaughtIds: pre-v17 pets fall back to the repertoire (they were taught under the
      // combined model) - teaching materializes the field without re-charging those ranks.
      const taught = [...petTaughtIds(state.char, petDef)];
      if (petRepertoireHas(taught, liveId, ds) || petRepertoireHas(petDef.petDefaultSpells ?? [], liveId, ds)) {
        return { ok: false, reason: 'Your pet already knows that' };
      }
      if (sp.reqLevel > state.char.level) return { ok: false, reason: `Your pet must be level ${sp.reqLevel}` };
      // TP cost = rank cost minus the highest already spent in the chain, per THIS pet.
      const needTp = tpForSpell(liveId, taught, ds);
      if (!hasTpForSpell(pet, liveId, taught, ds)) {
        return { ok: false, reason: needTp > 0 ? `Needs ${needTp} training points` : 'Cannot train this' };
      }
      state.char.pet = {
        ...pet,
        // Signed like SetTP — a 0-clamp would erase innate tame debt on a free teach.
        trainingPoints: (pet.trainingPoints ?? 0) - needTp,
        loyalty: pet.loyalty ?? LOYALTY_REBELLIOUS,
        taughtSpells: [...taught, liveId],
      };
      log(`${pet.name} learned ${sp.name}${sp.rank ? ` (Rank ${sp.rank})` : ''}${needTp ? ` for ${needTp} TP` : ''}.`);
      return { ok: true };
    },

    togglePetAutocast(spellId) {
      const pet = state.char.pet;
      if (!pet) return { ok: false, reason: 'You have no pet' };
      const sp = ds.spell(spellId);
      if (!sp) return { ok: false, reason: 'Unknown ability' };
      // Toggle the whole name chain so a later rank keeps the choice (PetSpellMap ACT_*).
      const sameChain = (id: number) => id === spellId || ds.spell(id)?.name === sp.name;
      const off = pet.autocastOff ?? [];
      const wasOff = off.some(sameChain);
      const next = wasOff ? off.filter((id) => !sameChain(id)) : [...off, spellId];
      state.char.pet = { ...pet, ...(next.length ? { autocastOff: next } : { autocastOff: undefined }) };
      return { ok: true, enabled: wasOff };
    },

    setPetCommand(command) {
      const pet = state.char.pet;
      if (!pet) return { ok: false, reason: 'You have no pet' };
      if (pet.health <= 0) return { ok: false, reason: 'Your pet is dead' };
      if (!isPetCommand(command)) return { ok: false, reason: 'Unknown command' };
      // 'follow' is the summon default — store nothing for it so old saves keep round-tripping.
      state.char.pet = { ...pet, command: command === 'follow' ? undefined : command };
      return { ok: true };
    },

    setPetReact(react) {
      const pet = state.char.pet;
      if (!pet) return { ok: false, reason: 'You have no pet' };
      if (pet.health <= 0) return { ok: false, reason: 'Your pet is dead' };
      if (!isPetReact(react)) return { ok: false, reason: 'Unknown react' };
      state.char.pet = { ...pet, react: react === 'defensive' ? undefined : react };
      return { ok: true };
    },

    dismissPet() {
      if (!state.char.pet) return { ok: false, reason: 'You have no pet' };
      // CMaNGOS EffectDismissPet: "not let dismiss dead pet".
      // Cite: SpellEffects.cpp:4721–4723; UI intercept calls this facade (appInteractInputA).
      if (state.char.pet.health <= 0) return { ok: false, reason: 'Your pet is dead' };
      const name = state.char.pet.name;
      // Area-aura party buffs (Blood Pact) fall when the pet caster leaves. Capture living kit ids before
      // clear; also repertoire orphans (VW kit has no BP). Cite: SpellAuras.cpp AreaAura; KI-066 / KI-555.
      const partyAuraIds = petPartyAuraSpellIds(state.char, ds);
      if (partyAuraIds.length > 0) {
        state.char = stripPetPartyAuras(state.char, ds, partyAuraIds);
      }
      // Dismiss stores the pet for Call Pet, applying the happiness drain first. The UI intercept used
      // this facade without the spell path, so that drain was spell-only until it was wired here.
      const dismissRaw = ds.spell(DISMISS_PET_SPELL_ID);
      const drainFx = dismissRaw
        ? resolveCombatSpell(dismissRaw, { casterLevel: state.char.level }).effects
        : [];
      // name was read above after the living-pet gate; pet is still present here.
      const living = state.char.pet;
      if (!living) return { ok: false, reason: 'You have no pet' };
      state.char.storedPet = applyPetHappinessPowerDrains(living, drainFx);
      state.char.pet = undefined;
      // Reconcile with no living pet: drops repertoire party auras kit missed (Imp→VW orphan).
      state.char = reconcilePetPartyAuras(state.char, ds);
      log(`You dismissed ${name}.`);
      return { ok: true };
    },

    buyStableSlot() {
      const gate = hunterStableGate(state);
      if (gate) return gate;
      const res = purchaseStableSlot(state.char.stableSlots ?? 0, state.char.gold);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot buy a stable slot' };
      state.char = { ...state.char, gold: state.char.gold - res.cost, stableSlots: res.stableSlots };
      log(`Bought a stable slot for ${moneyMarked(res.cost)}.`);
      return { ok: true, spent: res.cost, stableSlots: res.stableSlots };
    },

    stablePet() {
      const gate = hunterStableGate(state);
      if (gate) return gate;
      // Cite: Entities/NPCHandler.cpp HandleStablePet IsAlive + HUNTER_PET + free_slot <= m_stableSlots.
      const slot = findFreeStableSlot(state.char);
      if (slot == null) return { ok: false, reason: 'No stable slot free' };
      const current = state.char.pet;
      const dismissed = current ? undefined : state.char.storedPet;
      const moving = current ?? dismissed;
      if (!moving) return { ok: false, reason: 'You have no pet' };
      if (moving.health <= 0) return { ok: false, reason: 'Your pet is dead' };
      if (!isHunterStablePet(ds, moving)) return { ok: false, reason: 'That is not a hunter pet' };
      if (current) {
        const partyAuraIds = petPartyAuraSpellIds(state.char, ds);
        if (partyAuraIds.length > 0) {
          state.char = stripPetPartyAuras(state.char, ds, partyAuraIds);
        }
        state.char.pet = undefined;
        state.char.stablePets = setStableOccupant(state.char.stablePets, slot, current);
        state.char = reconcilePetPartyAuras(state.char, ds);
      } else {
        state.char.storedPet = undefined;
        state.char.stablePets = setStableOccupant(state.char.stablePets, slot, moving);
      }
      log(`You stabled ${moving.name}.`);
      return { ok: true, slot };
    },

    callStabledPet(slot) {
      const gate = hunterStableGate(state);
      if (gate) return gate;
      const incoming = stableOccupant(state.char, slot);
      if (!incoming) return { ok: false, reason: 'That stable slot is empty' };
      if (!isHunterStablePet(ds, incoming)) return { ok: false, reason: 'That is not a hunter pet' };
      const current = state.char.pet;
      const dismissed = current ? undefined : state.char.storedPet;
      const outgoing = current ?? dismissed;
      if (outgoing) {
        if (outgoing.health <= 0) return { ok: false, reason: 'Your pet is dead' };
        if (!isHunterStablePet(ds, outgoing)) return { ok: false, reason: 'That is not a hunter pet' };
      }
      if (current) {
        const partyAuraIds = petPartyAuraSpellIds(state.char, ds);
        if (partyAuraIds.length > 0) {
          state.char = stripPetPartyAuras(state.char, ds, partyAuraIds);
        }
      }
      state.char.stablePets = setStableOccupant(state.char.stablePets, slot, outgoing ?? null);
      state.char.storedPet = undefined;
      state.char.pet = incoming;
      state.char = reconcilePetPartyAuras(state.char, ds);
      log(`You call ${incoming.name}.`);
      return { ok: true };
    },
  };
}

function hunterStableGate(state: GameCtx['state']): { ok: false; reason: string } | null {
  if (state.char.cls !== CLASS.HUNTER) return { ok: false, reason: 'Only hunters use the pet stable' };
  return refuseIfDead(state.char.health, state.deathFlow);
}

function isHunterStablePet(ds: DataStore, pet: { creature: number }): boolean {
  const cdef = ds.creature(pet.creature);
  return !!cdef && petHasHappiness(cdef);
}
