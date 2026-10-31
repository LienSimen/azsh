// A real break between packs instead of a free vitals snap. The RATE comes from numbers already in
// the tree: a consumable's own row when there is food, else the same OOC spirit formulas. Pure.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import {
  effectiveStats,
  equippedStatBonuses,
  powerType,
  type Character,
} from '../character/character.ts';
import { healthRegenPerSec, updateManaRegen, TUNING } from '../../engine/combat/formulas.ts';
import { healthRegenPercentMultiplier } from '../../progression/rest.ts';
import { countItem, type Inventory } from '../items/inventory.ts';
import { isAutoConsumableCandidate, listAutoConsumableOptions } from '../bots/autoConsumables.ts';

/** Health and power a unit regains per second of sitting, and what it is spending to do it. */
export interface RestRate {
  hpPerSec: number;
  powerPerSec: number;
  /** Food entry being eaten, when one was picked from the bags. */
  foodEntry?: number;
  /** Drink entry being drunk, when one was picked from the bags. */
  drinkEntry?: number;
  /** No food in the bags and health is short — spirit regen only. */
  outOfFood: boolean;
  /** No water in the bags and mana is short — spirit regen only. */
  outOfWater: boolean;
}

/** Per-second restore a consumable row delivers (flat, or percent of the unit's own max). */
export function consumablePerSec(it: ItemDef | undefined, maxValue: number): number {
  const c = it?.consumable;
  if (!c) return 0;
  const tickMs = c.tickMs > 0 ? c.tickMs : 1000;
  const perTick = c.pctOfMax != null && c.pctOfMax > 0
    ? (maxValue * c.pctOfMax) / 100
    : c.amountPerTick;
  if (!(perTick > 0)) return 0;
  return (perTick * 1000) / tickMs;
}

/** Best food in this unit's own bags it is allowed to eat at its level, else undefined. */
export function pickRestFood(char: Character, inv: Inventory, ds: DataStore): number | undefined {
  const pref = char.autoConsumables?.food;
  if (pref != null && countItem(inv, pref) > 0) {
    const it = ds.item(pref);
    if (it && isAutoConsumableCandidate(it, char)) return pref;
  }
  return listAutoConsumableOptions(char, inv, ds).find((o) => o.kind === 'food')?.entry;
}

/** Best drink in this unit's own bags, mana users only. */
export function pickRestDrink(char: Character, inv: Inventory, ds: DataStore): number | undefined {
  if (powerType(char) !== 'mana') return undefined;
  const pref = char.autoConsumables?.drink;
  if (pref != null && countItem(inv, pref) > 0) {
    const it = ds.item(pref);
    if (it && isAutoConsumableCandidate(it, char)) return pref;
  }
  return listAutoConsumableOptions(char, inv, ds).find((o) => o.kind === 'drink')?.entry;
}

// Recovery rate for one unit sitting between packs. needHp and needPower are the caller's "is this
// unit actually short" answers — a full unit must not open food, and outOfFood must not fire.
export function restRateFor(args: {
  char: Character;
  inventory: Inventory | undefined;
  ds: DataStore;
  maxHealth: number;
  maxPower: number;
  needHp: boolean;
  needPower: boolean;
}): RestRate {
  const { char, ds } = args;
  const inv = args.inventory;
  const pt = powerType(char);
  const spi = effectiveStats(char, ds).spi;
  const mp5 = equippedStatBonuses(char, ds).mp5 ?? 0;

  // Sit regen is the floor under both branches — food adds to it, it never replaces it.
  // OOC: spirit × MOD_HEALTH_REGEN_PERCENT (88) × sit. Cite: Player.cpp:2392-2398.
  let hpPerSec = healthRegenPerSec(spi, char.level, char.cls)
    * healthRegenPercentMultiplier(char, ds) * TUNING.sitRegenMult;
  let powerPerSec = pt === 'mana'
    ? updateManaRegen(char.cls, spi, mp5, 0).modManaRegen
    : pt === 'energy' ? TUNING.energyPerSec : 0;

  let foodEntry: number | undefined;
  let drinkEntry: number | undefined;
  let outOfFood = false;
  let outOfWater = false;

  if (args.needHp) {
    foodEntry = inv ? pickRestFood(char, inv, ds) : undefined;
    if (foodEntry != null) hpPerSec += consumablePerSec(ds.item(foodEntry), args.maxHealth);
    else outOfFood = true;
  }
  if (args.needPower && pt === 'mana') {
    drinkEntry = inv ? pickRestDrink(char, inv, ds) : undefined;
    if (drinkEntry != null) powerPerSec += consumablePerSec(ds.item(drinkEntry), args.maxPower);
    else outOfWater = true;
  }

  return {
    hpPerSec: Math.max(0, hpPerSec),
    powerPerSec: pt === 'rage' ? 0 : Math.max(0, powerPerSec),
    ...(foodEntry != null ? { foodEntry } : {}),
    ...(drinkEntry != null ? { drinkEntry } : {}),
    outOfFood,
    outOfWater,
  };
}

// The rest target as a whole point. A session stores whole points while restoreUnit takes a fraction,
// so aiming at the raw product wrote one point SHORT for 45% of max values. Ceil.
export function restTargetPoint(max: number, restTo: number): number {
  if (!(max > 0)) return 0;
  const t = Math.min(1, Math.max(0, restTo));
  return Math.min(Math.round(max), Math.ceil(max * t));
}

// Points one rest tick hands ONE bar back. A bar a real food or drink is filling closes on the first
// tick, since the item was already debited. A bar on spirit alone keeps its measured rate.
export function restTickGain(args: {
  /** Points still missing on this bar. */
  gap: number;
  /** Per-second regen the break bought. */
  perSec: number;
  /** True when a food or drink out of the bags is what is filling this bar. */
  fromConsumable: boolean;
  dtSec: number;
  /** Fraction of a point carried over from the previous tick (spirit path only). */
  carry: number;
}): number {
  if (!(args.gap > 0)) return 0;
  if (args.fromConsumable) return args.gap;
  return args.carry + Math.max(0, args.perSec) * Math.max(0, args.dtSec);
}

// Seconds this unit still owes before it is rested, at the given rate. Infinity when it is short and
// regenerating nothing at all (a rage user is never short on power, so it is excluded).
export function secondsToRested(args: {
  hp: number;
  maxHp: number;
  power: number;
  maxPower: number;
  powerType: string;
  restTo: number;
  rate: RestRate;
}): number {
  const hpGap = Math.max(0, args.maxHp * args.restTo - args.hp);
  const powerGap = args.powerType === 'rage'
    ? 0
    : Math.max(0, args.maxPower * args.restTo - args.power);
  const hpSec = hpGap <= 0 ? 0 : (args.rate.hpPerSec > 0 ? hpGap / args.rate.hpPerSec : Infinity);
  const pwSec = powerGap <= 0 ? 0 : (args.rate.powerPerSec > 0 ? powerGap / args.rate.powerPerSec : Infinity);
  return Math.max(hpSec, pwSec);
}
