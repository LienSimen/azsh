// Between-pull rest as a real OOC consume loop: eat and drink from bags, then plain spirit regen
// for the remainder up to SQUAD_PACING.restTo. Never assigns vitals without consume() or regen().

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import {
  effectiveStats,
  equippedStatBonuses,
  maxHealth,
  maxPower,
  powerType,
  type Character,
} from '../character/character.ts';
import {
  isAutoConsumableCandidate,
  listAutoConsumableOptions,
  type AutoConsumablePrefs,
} from './autoConsumables.ts';
import { countItem, type Inventory } from '../items/inventory.ts';
import { SQUAD_PACING, type SquadStrategy } from './squad.ts';
import { downtimeToFullSec } from '../run/dungeonRun.ts';
import { consume, healthRegenPercentMultiplier, regen } from '../../progression/rest.ts';
import { healthRegenPerSec, updateManaRegen, TUNING } from '../../engine/combat/formulas.ts';
import { petMaxHealth } from '../pet/pet.ts';
import { isPlayerAlive, type DeathFlowState } from '../run/death.ts';

export interface BetweenPullRestResult {
  char: Character;
  inventory: Inventory;
  /** Modeled downtime seconds for scoring (consumable channel + leftover regen). */
  seconds: number;
  /** True when HP was below rest target and no food was available. */
  outOfFood: boolean;
  /** True when mana was below rest target and no water/drink was available. */
  outOfWater: boolean;
  /** Feed lines (e.g. "Out of food/water", "Ate Freshly Baked Bread"). */
  messages: string[];
  ateEntry?: number;
  drankEntry?: number;
}

/** Channel duration in whole seconds for a food/drink item (0 when unknown). */
export function consumableChannelSec(it: ItemDef | undefined, ds: DataStore): number {
  if (!it) return 0;
  if (it.consumable?.durationMs != null && it.consumable.durationMs > 0) {
    return Math.ceil(it.consumable.durationMs / 1000);
  }
  if (it.useSpell != null) {
    const sp = ds.spell(it.useSpell);
    for (const e of sp?.effects ?? []) {
      if (
        (e.kind === 'restore_health' || e.kind === 'restore_power')
        && typeof (e as { durationMs?: number }).durationMs === 'number'
      ) {
        const d = (e as { durationMs: number }).durationMs;
        if (d > 0) return Math.ceil(d / 1000);
      }
    }
  }
  return 0;
}

/** Prefer auto-consumable food pref, else first bag food. */
export const pickFoodEntry = (
  char: Character,
  inv: Inventory,
  ds: DataStore,
  prefs: AutoConsumablePrefs | undefined,
): number | undefined => {
  if (prefs?.food != null && countItem(inv, prefs.food) > 0) {
    const it = ds.item(prefs.food);
    if (it && isAutoConsumableCandidate(it, char)) return prefs.food;
  }
  const opt = listAutoConsumableOptions(char, inv, ds).find((o) => o.kind === 'food');
  return opt?.entry;
};

/** Prefer auto-consumable drink pref, else first bag drink (mana users only). */
export const pickDrinkEntry = (
  char: Character,
  inv: Inventory,
  ds: DataStore,
  prefs: AutoConsumablePrefs | undefined,
): number | undefined => {
  if (powerType(char) !== 'mana') return undefined;
  if (prefs?.drink != null && countItem(inv, prefs.drink) > 0) {
    const it = ds.item(prefs.drink);
    if (it && isAutoConsumableCandidate(it, char)) return prefs.drink;
  }
  const opt = listAutoConsumableOptions(char, inv, ds).find((o) => o.kind === 'drink');
  return opt?.entry;
};

// Run one between-pull rest: consume food/water when carried, then OOC regen for any remaining deficit up
// to SQUAD_PACING[strategy].restTo. Pure inputs → new char/inventory; no free vitals snap.
export function betweenPullConsumeLoop(args: {
  char: Character;
  inventory: Inventory;
  ds: DataStore;
  strategy?: SquadStrategy | null;
  /** Ghost/corpse gate — HP-only misses BuildPlayerRepop SetHealth(1). */
  deathFlow?: Pick<DeathFlowState, 'deathState'> | null;
}): BetweenPullRestResult {
  const ds = args.ds;
  const deathFlow = args.deathFlow;
  // Unknown / corrupt strategy keys fall back to careful — never throw mid-run (KI-687).
  const strategyKey = args.strategy ?? 'careful';
  const pacing = SQUAD_PACING[strategyKey as SquadStrategy] ?? SQUAD_PACING.careful;
  const restTo = pacing.restTo;
  let char: Character = { ...args.char };
  let inventory: Inventory = args.inventory;
  const prefs = char.autoConsumables;
  const messages: string[] = [];
  let ateEntry: number | undefined;
  let drankEntry: number | undefined;
  let outOfFood = false;
  let outOfWater = false;
  let channelSec = 0;

  // Dead/ghost stays dead through between-pull rest (KI-948). Cite: Player.cpp:1515–1519 IsAlive;
  // ghost HP=1 (Player.cpp:4288 BuildPlayerRepop) needs deathFlow, not health alone.
  if (!isPlayerAlive(char.health, deathFlow)) {
    return {
      char,
      inventory,
      seconds: 0,
      outOfFood: false,
      outOfWater: false,
      messages,
    };
  }

  const mh = maxHealth(char, ds);
  const mp = maxPower(char, ds);
  const pt = powerType(char);
  const hpTarget = Math.ceil(mh * restTo);
  const powerTarget = pt === 'rage' ? 0 : Math.ceil(mp * restTo);

  // --- Food (HP) ------------------------------------------------------------
  if (char.health < hpTarget) {
    const entry = pickFoodEntry(char, inventory, ds, prefs);
    if (entry != null) {
      const res = consume(char, inventory, ds, entry, deathFlow);
      if (res.ok) {
        char = res.char;
        inventory = res.inventory;
        ateEntry = entry;
        const it = ds.item(entry);
        channelSec = Math.max(channelSec, consumableChannelSec(it, ds));
        messages.push(`Ate ${it?.name ?? `item ${entry}`}${res.restored > 0 ? ` (+${res.restored} HP)` : ''}`);
      } else {
        outOfFood = true;
      }
    } else {
      outOfFood = true;
    }
  }

  // --- Drink (mana) ---------------------------------------------------------
  if (pt === 'mana' && char.power < powerTarget) {
    const entry = pickDrinkEntry(char, inventory, ds, prefs);
    if (entry != null) {
      const res = consume(char, inventory, ds, entry, deathFlow);
      if (res.ok) {
        char = res.char;
        inventory = res.inventory;
        drankEntry = entry;
        const it = ds.item(entry);
        channelSec = Math.max(channelSec, consumableChannelSec(it, ds));
        messages.push(`Drank ${it?.name ?? `item ${entry}`}${res.restored > 0 ? ` (+${res.restored} mana)` : ''}`);
      } else {
        outOfWater = true;
      }
    } else {
      outOfWater = true;
    }
  }

  if (outOfFood || outOfWater) {
    const parts: string[] = [];
    if (outOfFood && char.health < hpTarget) parts.push('food');
    if (outOfWater && pt === 'mana' && char.power < powerTarget) parts.push('water');
    if (parts.length) messages.push(`Out of ${parts.join('/')}`);
  }

  // --- Remaining deficit: plain OOC regen (never free-snap) -----------------
  const spi = effectiveStats(char, ds).spi;
  const mp5 = equippedStatBonuses(char, ds).mp5 ?? 0;
  // OOC: spirit × MOD_HEALTH_REGEN_PERCENT (88) × sit. Cite: Player.cpp:2392-2398.
  const hpPerSec = healthRegenPerSec(spi, char.level, char.cls)
    * healthRegenPercentMultiplier(char, ds) * TUNING.sitRegenMult;
  const manaPerSec = pt === 'mana' ? updateManaRegen(char.cls, spi, mp5, 0).modManaRegen : 0;
  const energyPerSec = pt === 'energy' ? TUNING.energyPerSec : 0;

  const missingHp = Math.max(0, hpTarget - char.health);
  const missingMana = pt === 'mana' ? Math.max(0, powerTarget - char.power) : 0;
  const missingEnergy = pt === 'energy' ? Math.max(0, powerTarget - char.power) : 0;

  const regenSec = downtimeToFullSec({
    missingHp,
    hpPerSec,
    ...(pt === 'mana' ? { missingMana, manaPerSec } : {}),
    ...(pt === 'energy' ? { missingEnergy, energyPerSec } : {}),
  });

  if (regenSec > 0) {
    char = regen(char, ds, regenSec, true /* sitting */, deathFlow);
    // Cap at the rest target so careful/aggressive/sip land on the dial — regen can overshoot from
    // rounding toward full. Only clamp down; never snap up past what regen produced.
    if (char.health > hpTarget) char = { ...char, health: hpTarget };
    if (pt !== 'rage' && char.power > powerTarget) char = { ...char, power: powerTarget };
  } else if (pt === 'rage' && char.power > 0) {
    // Rage empties on rest (Player.cpp OOC rage decay); regen() handles it when
    // seconds > 0 — force a decay tick when already at rest target with leftover rage.
    char = regen(char, ds, 1, true, deathFlow);
  }

  // Pet: OOC regen toward full (regen() already tops pet HP/power when seconds > 0). When no regen time was
  // needed for the player but pet is hurt, apply a short sit tick so the pet is not free-snapped either.
  if (char.pet && char.pet.health > 0 && ds.creature(char.pet.creature)) {
    const pmh = petMaxHealth(char, ds);
    if (char.pet.health < pmh && regenSec <= 0 && channelSec <= 0) {
      char = regen(char, ds, 1, true, deathFlow);
    }
  }

  const seconds = Math.max(channelSec, regenSec);

  return {
    char,
    inventory,
    seconds,
    outOfFood,
    outOfWater,
    messages,
    ...(ateEntry != null ? { ateEntry } : {}),
    ...(drankEntry != null ? { drankEntry } : {}),
  };
}
