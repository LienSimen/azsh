// BG PvP consumable kit plus the in-match item director. Every unit carries a class-matched PvP
// Insignia; the director pops the flag carrier's escape items and grenades the enemy carrier.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../character/character.ts';
import { combatItems, meetsItemSkillGate } from '../character/buildCombatant.ts';
import { companionCharacter, type Companion } from '../bots/squad.ts';
import { isRaidGearProfile } from '../bots/botGear.ts';
import { addItem, emptyInventory } from '../items/inventory.ts';
import { slotTargets } from '../items/equipment.ts';
import { hashSeed } from '../../engine/core/rng.ts';
import { CLASS } from '../../data/schema/constants.ts';
import type { BgTeam, BgUnitId } from './types.ts';

export const SWIFTNESS_POTION = 2459; // useSpell 2379: +50% run 15 s (potion category 4)
export const FREE_ACTION_POTION = 5634; // useSpell 6615: stun/root/snare immunity 30 s (cat 4)
export const LIVING_ACTION_POTION = 20008; // useSpell 24364: same immunities 5 s, removes existing
export const GOBLIN_ROCKET_BOOTS = 7189; // useSpell 8892: +70% run 20 s, 300 s CD (row is use-ungated)
export const SKULL_OF_IMPENDING_DOOM = 4984; // useSpell 5024 "Flee": +60% run 10 s, self-drain
export const IRON_GRENADE = 4390; // useSpell 4068: 132–218 fire + 3 s stun, eng 175 (bomb cat 24)
export const THORIUM_GRENADE = 15993; // useSpell 19769: 300–500 fire + 3 s stun, eng 260

/** Grenades the director may throw, strongest first (kit carries at most one kind). */
export const PVP_GRENADES: readonly number[] = [THORIUM_GRENADE, IRON_GRENADE];

// The Engineering PvP trinkets at the ranks item_template names: 18634 260, 18638 290, 18639 300,
// 10720 210, 10645 level-only. The two HEAD pieces are excluded — a head swap costs a gear slot.
export const PVP_ENGINEER_TRINKETS: readonly number[] = [18639, 18638, 18634, 10720, 10645];

// Class → PvP Insignia; the 1.12 trinkets differ per class in WHAT they break — 5579 root/snare/
// stun, 23273 charm/fear/poly, 23274, 23276, 23277. Source: item_template AllowableClass.
const PVP_TRINKET: Readonly<Record<BgTeam, Readonly<Record<number, number>>>> = {
  horde: {
    [CLASS.WARRIOR]: 18834,
    [CLASS.SHAMAN]: 18845,
    [CLASS.HUNTER]: 18846,
    [CLASS.ROGUE]: 18849,
    [CLASS.MAGE]: 18850,
    [CLASS.PRIEST]: 18851,
    [CLASS.WARLOCK]: 18852,
    [CLASS.DRUID]: 18853,
  },
  alliance: {
    [CLASS.WARRIOR]: 18854,
    [CLASS.HUNTER]: 18856,
    [CLASS.ROGUE]: 18857,
    [CLASS.WARLOCK]: 18858,
    [CLASS.MAGE]: 18859,
    [CLASS.PRIEST]: 18862,
    [CLASS.DRUID]: 18863,
    [CLASS.PALADIN]: 18864,
  },
};

export function pvpTrinketFor(team: BgTeam, cls: number): number | null {
  return PVP_TRINKET[team][cls] ?? null;
}

// The PvP kit for one unit's bags: Insignia always, the consumable staples only when the tier says
// consumes. Items the unit cannot use are left out so bags stay honest.
export function pvpKitEntries(
  char: Character,
  team: BgTeam,
  cls: number,
  consumes: boolean,
  ds: DataStore,
): Array<{ entry: number; count: number }> {
  const out: Array<{ entry: number; count: number }> = [];
  const usable = (entry: number): boolean => {
    const it = ds.item(entry);
    return !!it && meetsItemSkillGate(char, it) && (it.requiredLevel ?? 0) <= char.level;
  };
  const trinket = pvpTrinketFor(team, cls);
  if (trinket != null && ds.item(trinket)) out.push({ entry: trinket, count: 1 });
  if (!consumes) return out;
  if (usable(FREE_ACTION_POTION)) out.push({ entry: FREE_ACTION_POTION, count: 2 });
  if (usable(SWIFTNESS_POTION)) out.push({ entry: SWIFTNESS_POTION, count: 3 });
  if (usable(LIVING_ACTION_POTION)) out.push({ entry: LIVING_ACTION_POTION, count: 1 });
  if (usable(GOBLIN_ROCKET_BOOTS)) out.push({ entry: GOBLIN_ROCKET_BOOTS, count: 1 });
  if (usable(SKULL_OF_IMPENDING_DOOM)) out.push({ entry: SKULL_OF_IMPENDING_DOOM, count: 1 });
  for (const g of PVP_GRENADES) {
    if (usable(g)) { out.push({ entry: g, count: 5 }); break; }
  }
  return out;
}

// Fold the PvP kit into a generated companion shell. A SLOTTED entry is EQUIPPED, because a bagged
// one can never be used: 10 of 10 bots carried an Insignia, 0 wore one, and 0 could use one.
export function applyPvpKit(
  ds: DataStore,
  shell: Companion,
  team: BgTeam,
  level: number,
  consumes: boolean,
): void {
  const geared = companionCharacter(shell, level, ds);
  let bags = shell.bags ?? emptyInventory();
  const insignia = pvpTrinketFor(team, shell.cls);
  for (const { entry, count } of pvpKitEntries(geared, team, shell.cls, consumes, ds)) {
    const it = ds.item(entry);
    const slot = it?.slot;
    if (slot) {
      // First free paperdoll slot the item fits, else the first - the kit outranks generated
      // gear for the one trinket it grants, which is the point of granting it.
      const targets = slotTargets(slot);
      const free = targets.find((t) => shell.equipped?.[t] == null);
      const target = free ?? targets[0];
      if (target) {
        shell.equipped = { ...(shell.equipped ?? {}), [target]: entry };
        continue;
      }
    }
    bags = addItem(bags, entry, count, ds.item(entry)?.stackable ?? 1);
  }
  shell.bags = bags;
  equipEngineerTrinket(ds, shell, geared, insignia);
}

// G11's named list, folded like the kit above: slotted entries equip, the rest bag one stack each.
export function applyNamedItemList(
  ds: DataStore,
  shell: Companion,
  level: number,
  entries: readonly number[],
): void {
  if (!entries.length) return;
  const geared = companionCharacter(shell, level, ds);
  let bags = shell.bags ?? emptyInventory();
  for (const entry of entries) {
    const it = ds.item(entry);
    if (!it || !meetsItemSkillGate(geared, it) || (it.requiredLevel ?? 0) > geared.level) continue;
    // A bagged trinket can never be used (buildCombatant.ts:197).
    const targets = it.slot ? slotTargets(it.slot) : [];
    const target = targets.find((t) => shell.equipped?.[t] == null) ?? targets[0];
    if (target) {
      shell.equipped = { ...(shell.equipped ?? {}), [target]: entry };
    } else {
      const stack = it.stackable ?? 1;
      bags = addItem(bags, entry, stack, stack);
    }
  }
  shell.bags = bags;
}

// One Engineering PvP trinket on a raid-tier engineer. It DISPLACES the generated trinket and never
// the Insignia, which is the hard-CC self-rescue. Only the two raid tiers take the trade.
function equipEngineerTrinket(
  ds: DataStore,
  shell: Companion,
  geared: Character,
  insignia: number | null,
): void {
  if (!isRaidGearProfile(shell.gearProfile ?? 'field')) return;
  // The unit must actually BE an engineer. Usability alone is not enough: 10645 carries no
  // requiredSkill, so gating on that put an Engineering trinket on 9 of 9 bodies.
  if (((geared.skills?.engineering?.current ?? 0) | 0) <= 0) return;
  const eq = { ...(shell.equipped ?? {}) };
  const slot = eq.trinket1 === insignia ? 'trinket2' : 'trinket1';
  // Does a WORN copy actually produce a CombatItem? That is all session.unitItems reads, and the
  // item row cannot predict it — 10720 resolves its spell and still matches no combatItems branch.
  const emitsCombatItem = (entry: number): boolean => {
    const probe: Character = { ...geared, equipped: { ...(geared.equipped ?? {}), [slot]: entry } };
    return combatItems(probe, emptyInventory(), ds).some((i) => i.entry === entry);
  };
  const usable = PVP_ENGINEER_TRINKETS.filter((entry) => {
    const it = ds.item(entry);
    if (!it || !meetsItemSkillGate(geared, it) || (it.requiredLevel ?? 0) > geared.level) return false;
    return emitsCombatItem(entry);
  });
  if (!usable.length) return;
  const pick = usable[Math.abs(hashSeed(shell.seed ?? 0, 0x2e91)) % usable.length]!;
  if (eq.trinket1 === pick || eq.trinket2 === pick) return;
  eq[slot] = pick;
  shell.equipped = eq;
}

// ---- the in-match director -------------------------------------------------------------

/** Everything the director needs from the BG screen (world + session), kept narrow for probes. */
export interface BgConsumeSeams {
  /** World clock ms. */
  now(): number;
  /** Unit currently carrying `flagTeam`'s flag (an OPPOSING-team unit), or null. */
  carrierOf(flagTeam: BgTeam): BgUnitId | null;
  /** Living units of a team. */
  livingUnitsOf(team: BgTeam): BgUnitId[];
  sideOf(unit: BgUnitId): string | undefined;
  /** Planar yards between two living units, or null when unknown. */
  distYd(a: BgUnitId, b: BgUnitId): number | null;
  /** session.unitRunSpeedYd — above the unit's own baseline means SOME speed buff already runs. */
  runSpeedYd(side: string): number;
  // session.unitBaseRunSpeedYd — the same unit with only its PERMANENT speed (a boots enchant)
  // counted. A carrier wearing Minor Speed reads 7.56 yd/s at rest, so BASE_RUN_SPEED is not the
  // comparison: against it the director would read "already buffed" and never pop anything.
  baseRunSpeedYd(side: string): number;
  /** session.unitItems usability for one entry (count/cd/category folded in). */
  itemUsable(side: string, entry: number): boolean;
  /** session.useUnitItem. */
  useItem(side: string, entry: number, targetSide?: string): boolean;
  /** Feed hook — fired only when a use actually happened. */
  onUse?(unit: BgUnitId, entry: number, target?: BgUnitId): void;
}

const TEAMS: readonly BgTeam[] = ['alliance', 'horde'];
/** Director cadence — item decisions don't need the 100 ms world tick. */
const DIRECT_EVERY_MS = 700;
/** One grenade per team per this window — five simultaneous grenades would vaporize a carrier. */
const GRENADE_TEAM_GAP_MS = 6_000;
/** Throw only inside this range (grenade spells are 45 yd; stay well under the acquire backstop). */
const GRENADE_RANGE_YD = 30;

// Flag-carrier consumables and defender grenades, both teams. Per carrier tick: Free Action first,
// which also purges the root it lands on, then one speed item — boots, skull, swiftness.
export function createBgConsumeDirector(seams: BgConsumeSeams): { tick(): void } {
  let nextAt = 0;
  const nextGrenadeAt: Record<BgTeam, number> = { alliance: 0, horde: 0 };

  const driveCarrier = (unit: BgUnitId): void => {
    const side = seams.sideOf(unit);
    if (!side) return;
    // FAP's own 120 s item CD is 4× its 30 s buff — usable implies the buff already lapsed.
    if (seams.itemUsable(side, FREE_ACTION_POTION) && seams.useItem(side, FREE_ACTION_POTION)) {
      seams.onUse?.(unit, FREE_ACTION_POTION);
      return;
    }
    // Above this unit's own resting speed = SOME speed buff already runs (item, powerup, Sprint).
    if (seams.runSpeedYd(side) > seams.baseRunSpeedYd(side) + 0.01) return;
    for (const entry of [GOBLIN_ROCKET_BOOTS, SKULL_OF_IMPENDING_DOOM, SWIFTNESS_POTION]) {
      if (seams.itemUsable(side, entry) && seams.useItem(side, entry)) {
        seams.onUse?.(unit, entry);
        return;
      }
    }
  };

  const driveGrenades = (defenders: BgTeam, carrier: BgUnitId, t: number): void => {
    if (t < nextGrenadeAt[defenders]) return;
    const carrierSide = seams.sideOf(carrier);
    if (!carrierSide) return;
    let best: { unit: BgUnitId; side: string; entry: number; d: number } | null = null;
    for (const unit of seams.livingUnitsOf(defenders)) {
      const d = seams.distYd(unit, carrier);
      if (d == null || d > GRENADE_RANGE_YD) continue;
      const side = seams.sideOf(unit);
      if (!side) continue;
      const entry = PVP_GRENADES.find((g) => seams.itemUsable(side, g));
      if (entry == null) continue;
      if (!best || d < best.d) best = { unit, side, entry, d };
    }
    if (best && seams.useItem(best.side, best.entry, carrierSide)) {
      nextGrenadeAt[defenders] = t + GRENADE_TEAM_GAP_MS;
      seams.onUse?.(best.unit, best.entry, carrier);
    }
  };

  return {
    tick(): void {
      const t = seams.now();
      if (t < nextAt) return;
      nextAt = t + DIRECT_EVERY_MS;
      for (const flagTeam of TEAMS) {
        const carrier = seams.carrierOf(flagTeam);
        if (!carrier) continue;
        driveCarrier(carrier);
        driveGrenades(flagTeam, carrier, t);
      }
    },
  };
}
