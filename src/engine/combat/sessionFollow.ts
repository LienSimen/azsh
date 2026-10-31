// Follow arms for the motion phase, peeled from sessionMotion for the filesize ratchet: the pet bar's
// stay and follow, the guardian's out-of-combat follow, one scripted follow, and the party bubble.
// No combat import.

import { isEnemySide, type Side } from '../core/events.ts';
import { moveStepYd, combatDistanceYd, type CombatPosYd } from './combatGeometry.ts';
import { followDistFor, isGuardianFollow, PET_FOLLOW_SLACK_YD } from '../../domain/creature/creatureAiConstants.ts';
import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { MotionOwner } from './motionClaim.ts';
import type { MotionGenerator } from './motionGenerator.ts';

/** Closures the follow arms need from installSessionMotion. */
export interface FollowDeps {
  ctx: CombatContext;
  tickMs: number;
  posOf: (side: Side | string) => CombatPosYd | undefined;
  setPos: (side: Side | string, p: CombatPosYd) => void;
  dead: (f: Fighter) => boolean;
  foeOf: (f: Fighter) => Fighter | null;
  bySide: (s: Side) => Fighter;
  enemyEngaged: (f: Fighter) => boolean;
  takeMotion: (
    side: string, owner: MotionOwner, goal: CombatPosYd | null,
    opts?: { force?: boolean; holdMs?: number },
  ) => CombatPosYd | null;
  navStepToward: (
    side: string, from: CombatPosYd, to: CombatPosYd,
    step: number, stopAtDist: number, pathfind?: boolean,
  ) => CombatPosYd;
  runSpeedYdPerSec: (f: Fighter) => number;
}

export function createFollowArms(deps: FollowDeps): {
  petCommand: MotionGenerator;
  guardianFollow: MotionGenerator;
  spiritFollow: MotionGenerator;
  partyFollow: MotionGenerator;
} {
  const {
    ctx, tickMs, posOf, setPos, dead, foeOf, bySide, enemyEngaged,
    takeMotion, navStepToward, runSpeedYdPerSec,
  } = deps;

  // The pet bar's stay, follow and attack. Stay parks on its pin, follow parks at the follow distance
  // and a recall clears at twice that, and attack falls to the companion dest and corridor.
  const advancePetCommand = (f: Fighter): boolean => {
    if (f.side !== 'pet') return false;
    if (ctx.petCommand === 'stay') {
      const from = posOf('pet');
      if (!from) return false;
      const speed = runSpeedYdPerSec(f);
      const stay = ctx.petStayPos ?? { x: from.x, y: from.y, ...(from.z != null ? { z: from.z } : {}) };
      ctx.petStayPos = stay;
      const dStay = combatDistanceYd(from, stay);
      if (dStay != null && dStay > PET_FOLLOW_SLACK_YD && speed > 0
        && takeMotion('pet', 'pet', stay) != null) {
        setPos('pet', navStepToward('pet', from, stay, moveStepYd(speed, tickMs), 0, true));
      }
      return true;
    }
    if (ctx.petCommand === 'attack') {
      ctx.petRetreating = false;
      return false;
    }
    const from = posOf('pet');
    const owner = posOf('player');
    if (!from || !owner) return false;
    const d = combatDistanceYd(from, owner);
    if (ctx.petRetreating && d != null && d <= PET_FOLLOW_SLACK_YD) ctx.petRetreating = false;
    if (!ctx.petRetreating) {
      const victim = foeOf(f);
      if (victim && victim !== f && !dead(victim)) return false;
    }
    const park = followDistFor(f.spec);
    const speed = runSpeedYdPerSec(f);
    if (d != null && d > park && speed > 0 && takeMotion('pet', 'pet', owner) != null) {
      setPos('pet', navStepToward('pet', from, owner, moveStepYd(speed, tickMs), park, true));
    }
    return true;
  };

  /** GuardianAI OOC follow at 1.5 (Imp 11939 at 3). Cite: GuardianAI.cpp:31, :36. */
  const advanceGuardianFollow = (f: Fighter): boolean => {
    if (!isGuardianFollow(f.spec)) return false;
    if (isEnemySide(f.side) && enemyEngaged(f)) return false;
    if (!isEnemySide(f.side)) {
      const victim = foeOf(f);
      if (victim && victim !== f && !dead(victim)) return false;
    }
    let ownerSide: Side | null = null;
    for (const [owner, owned] of ctx.guardianSidesBySummoner) {
      if (owned.has(f.side)) { ownerSide = owner; break; }
    }
    if (!ownerSide && !isEnemySide(f.side)) ownerSide = 'player';
    if (!ownerSide) return false;
    const from = posOf(f.side);
    const owner = posOf(ownerSide);
    if (!from || !owner) return false;
    const park = followDistFor(f.spec);
    const d = combatDistanceYd(from, owner);
    const speed = runSpeedYdPerSec(f);
    if (d != null && d > park && speed > 0 && takeMotion(f.side, 'follow', owner) != null) {
      setPos(f.side, navStepToward(f.side, from, owner, moveStepYd(speed, tickMs), park, !isEnemySide(f.side)));
    }
    return true;
  };

  // ScriptDev JustSummoned MoveFollow(boss) during the encounter — Burning Spirit 9178. Cite:
  // boss_ambassador_flamelash.cpp:112 MoveFollow(m_creature, 0, 0).
  const advanceFlamelashSpiritFollow = (f: Fighter): boolean => {
    if (((f.spec.creatureEntry ?? 0) | 0) !== 9178) return false;
    let ownerSide: Side | null = null;
    for (const [owner, owned] of ctx.guardianSidesBySummoner) {
      if (owned.has(f.side)) { ownerSide = owner; break; }
    }
    if (!ownerSide) return false;
    const ownerF = bySide(ownerSide);
    if (!ownerF || ((ownerF.spec.creatureEntry ?? 0) | 0) !== 9156) return false;
    const from = posOf(f.side);
    const owner = posOf(ownerSide);
    if (!from || !owner) return false;
    const park = 0;
    const d = combatDistanceYd(from, owner);
    const speed = runSpeedYdPerSec(f);
    if (d != null && d > park && speed > 0 && takeMotion(f.side, 'follow', owner) != null) {
      setPos(f.side, navStepToward(f.side, from, owner, moveStepYd(speed, tickMs), park, false));
    }
    return true;
  };

  // The party bubble. No hostile inside cfg.acquireRangeYd means foeOf hands back the unit itself
  // (sessionPools.ts:347) and chase stands it forever (sessionChase.ts:160). Cite: combatGeometry.ts:788.
  const advancePartyFollow = (f: Fighter): boolean => {
    const holdYd = ctx.cfg.partyFollowYd;
    // The RTS hold bubble answers the same question with an anchor, and `home` above walks to it.
    if (holdYd == null || !(holdYd > 0) || ctx.cfg.friendlyHoldYd != null) return false;
    if (isEnemySide(f.side) || f.side === 'player' || f.side === 'pet') return false;
    // The bubble is the unit path's rule: it tows a member the player moves TOGETHER with their own
    // body. One sent off alone, or left standing while you walk alone, keeps its ground until regrouped.
    const unit = ctx.followGroupSides;
    if (unit && !(unit.has(f.side) && unit.has('player'))) return false;
    // A live focus is the chase arm's; only the no-target sentinel reaches here.
    const victim = foeOf(f);
    if (victim && victim !== f && !dead(victim)) return false;
    const leader = bySide('player');
    if (!leader || dead(leader)) return false;
    const from = posOf(f.side);
    const lead = posOf('player');
    if (!from || !lead) return false;
    const d = combatDistanceYd(from, lead);
    if (d == null || d <= holdYd) return false;
    const speed = runSpeedYdPerSec(f);
    if (!(speed > 0) || takeMotion(f.side, 'follow', lead) == null) return false;
    setPos(f.side, navStepToward(f.side, from, lead, moveStepYd(speed, tickMs), holdYd, true));
    return true;
  };

  // Three generators share the `follow` tag on purpose — CMaNGOS stacks many
  // FollowMovementGenerator instances too; the tag is the kind, not the instance.
  return {
    petCommand: { owner: 'pet', update: (f) => advancePetCommand(f) },
    guardianFollow: { owner: 'follow', update: (f) => advanceGuardianFollow(f) },
    spiritFollow: { owner: 'follow', update: (f) => advanceFlamelashSpiritFollow(f) },
    partyFollow: { owner: 'follow', update: (f) => advancePartyFollow(f) },
  };
}
