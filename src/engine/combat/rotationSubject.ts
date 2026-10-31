// Subject extras the rotation evaluator already names. Filled here so pickAction
// does not grow another copy of "is this unit a caster / in the melee band / dead-rezzable".

import { CLASS } from '../../data/schema.ts';
import { MIN_AGGRO_DISTANCE } from '../../domain/creature/creatureAi.ts';
import { MELEE_PARK_SLACK_YD, isEnemyCasterKit } from './combatGeometry.ts';
import type { Fighter } from './types.ts';
import type { SpellDef } from '../../data/schema.ts';
import { castableKitIds } from './castableKit.ts';
import { isPlayerCharacterSide } from '../core/events.ts';

/** Contact band, not the 5.5 park knife-edge — ring float + closing mobs still count. */
export const ROTATION_MELEE_YD = MIN_AGGRO_DISTANCE + MELEE_PARK_SLACK_YD + 2;

// Cite: BattleGroundWS.h:54-59 WS_SPELL_WARSONG_FLAG / WS_SPELL_SILVERWING_FLAG.
const FLAG_AURAS = new Set([23333, 23335]);

// Per FIGHTER, not per kit array: the answer also reads maxPower and the seat's reachability filter,
// so two bodies sharing one kit array can differ. Both inputs are constant for a fighter's lifetime.
const enemyCasterKitCache = new WeakMap<Fighter, boolean>();

export function unitIsCaster(
  u: Fighter,
  /** The session's spell store, so the kit walk below skips what the unit cannot reach. */
  spellOf?: (id: number) => SpellDef | undefined,
): boolean {
  if (u.spec.rangedAuto) return true;
  if (u.spec.groupRole === 'healer') return true;
  if ((u.spec.standYards ?? 0) > MIN_AGGRO_DISTANCE + 1) return true;
  const cls = u.spec.classId ?? 0;
  if (cls === CLASS.PRIEST || cls === CLASS.MAGE || cls === CLASS.WARLOCK) return true;
  // A player seat is stationed by stand.ts and the yards above already answered for it. The caster-kit
  // test reads a CREATURE kit, and all nine classes train past its bar, so it said true for everyone.
  if (cls !== 0) return false;
  // The same filter placement takes (castableKit.ts): 22 creatures read as casters off a kit
  // spell they cannot reach. Without a store this is unfiltered, which is a fixture's answer.
  const hit = enemyCasterKitCache.get(u);
  if (hit !== undefined) return hit;
  const v = isEnemyCasterKit(u.spec.spells ?? [], {
    maxPower: u.spec.maxPower,
    castable: castableKitIds(u, spellOf),
  });
  enemyCasterKitCache.set(u, v);
  return v;
}

/** Cite: SharedDefines.h CLASS_HUNTER = 3. Jeklik Charge bait is a hunter at range. */
export function unitIsHunter(u: Fighter): boolean {
  return (u.spec.classId ?? 0) === CLASS.HUNTER;
}

/** Cite: SharedDefines.h CLASS_WARRIOR = 1 … CLASS_DRUID = 11. A creature carries none, so 0. */
export function unitClassId(u: Fighter): number {
  return (u.spec.classId ?? 0) | 0;
}

export function flagAuraId(buffs: ReadonlySet<number>): number | undefined {
  for (const id of buffs) if (FLAG_AURAS.has(id)) return id;
  return undefined;
}

/** No geometry (abstract 1v1) → in the pile. Else planar yards vs park/white band. */
export function inMeleeBand(dist: number | null, hasGeometry: boolean): boolean {
  if (!hasGeometry) return true;
  return dist != null && dist <= ROTATION_MELEE_YD;
}

// A corpse a battle rez can land on: down, and a PLAYER seat. One predicate, because three copies
// tested for a class id, which does not separate a pet — a pet carries the creature's unit class.
export function isRezzableCorpse(u: Fighter): boolean {
  return !(u.hp > 0) && isPlayerCharacterSide(u.side);
}

export function rezzableDeadCount(units: readonly Fighter[]): number {
  let n = 0;
  for (const u of units) if (isRezzableCorpse(u)) n++;
  return n;
}
