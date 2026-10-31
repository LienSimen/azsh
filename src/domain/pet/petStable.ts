// Hunter pet stable: purchased slots and swap in or out. Pure — gold is deducted by the caller.
// Cite: Pet.h MAX_PET_STABLES; NPCHandler.cpp HandleBuyStableSlot / HandleStablePet.

import type { Character, PetState } from '../character/character.ts';

/** Cite: Pet.h `#define MAX_PET_STABLES 2`. */
export const MAX_PET_STABLES = 2;

// Copper price for the next slot, indexed by how many are already owned: DBC rows 1 → 500 and
// 2 → 50000. Cite: StableSlotPrices.dbc; NPCHandler.cpp HandleBuyStableSlot.
export const STABLE_SLOT_PRICES: readonly number[] = [500, 50_000];

/** Cite: Pet.h PetSaveMode. FIRST_STABLE_SLOT=1 .. LAST_STABLE_SLOT=MAX_PET_STABLES. */
export const PET_SAVE_FIRST_STABLE_SLOT = 1;
export const PET_SAVE_LAST_STABLE_SLOT = MAX_PET_STABLES;

/** How many slots this character has bought (0..2). Absent save field → 0. */
export function purchasedStableSlots(char: Pick<Character, 'stableSlots'>): number {
  const n = char.stableSlots ?? 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_PET_STABLES, n | 0);
}

/** Copper to buy the next slot, or null when both are owned. */
export function nextStableSlotCost(stableSlots: number): number | null {
  const owned = Math.max(0, stableSlots | 0);
  if (owned >= MAX_PET_STABLES) return null;
  return STABLE_SLOT_PRICES[owned] ?? null;
}

/** Pet in 1-based stable slot, or null if the slot is empty / unpurchased. */
export function stableOccupant(
  char: Pick<Character, 'stableSlots' | 'stablePets'>,
  slot: number,
): PetState | null {
  if (slot < PET_SAVE_FIRST_STABLE_SLOT || slot > purchasedStableSlots(char)) return null;
  const p = char.stablePets?.[slot - 1];
  return p && typeof p === 'object' ? p : null;
}

// First empty purchased slot in query order (1, 2, …), or null. Cite: NPCHandler.cpp HandleStablePet
// free_slot scan ~677–699.
export function findFreeStableSlot(char: Pick<Character, 'stableSlots' | 'stablePets'>): number | null {
  const owned = purchasedStableSlots(char);
  for (let slot = PET_SAVE_FIRST_STABLE_SLOT; slot <= owned; slot++) {
    if (!stableOccupant(char, slot)) return slot;
  }
  return null;
}

export interface BuyStableSlotResult {
  ok: boolean;
  reason?: string;
  stableSlots: number;
  cost: number;
}

/** Purchase the next slot. Gold is deducted by the caller. */
export function buyStableSlot(stableSlots: number, gold: number): BuyStableSlotResult {
  const owned = Math.max(0, stableSlots | 0);
  const cost = nextStableSlotCost(owned);
  if (cost == null) return { ok: false, reason: 'All stable slots are bought', stableSlots: owned, cost: 0 };
  if (gold < cost) return { ok: false, reason: "You don't have enough money", stableSlots: owned, cost };
  return { ok: true, stableSlots: owned + 1, cost };
}

/** Write `pet` (or empty) into a 1-based purchased slot. Length stays MAX_PET_STABLES. */
export function setStableOccupant(
  pets: Character['stablePets'],
  slot: number,
  pet: PetState | null,
): (PetState | null)[] {
  const next: (PetState | null)[] = [
    pets?.[0] ?? null,
    pets?.[1] ?? null,
  ];
  next[slot - 1] = pet;
  return next;
}

export const STABLE_ICON = 'inv_box_petcarrier_01';
