// PURE: no DOM/RNG/Date. Runtime rotation condition evaluator.
import type {
  AllyFilter,
  CondSubject,
  Condition,
  CondOp,
  HaltDpsSchool,
  Rotation,
  RotationRule,
  RuleAction,
  RuleAfter,
  RuleBefore,
  RuleSpellTarget,
  RotationSnapshot,
  SubjectState,
} from './types.ts';
import { allyFilterIsAny, pullWindowMs, timeToDieMs } from './types.ts';
import { encounterTacticRows, isRaidRuleId } from '../raid/raidEncounterTactics.ts';
import { HAPPINESS_MAX } from '../pet/pet.ts';
import { totemSlotFromIndex } from '../spells/totem.ts';
import { IN_MELEE_YD } from './stand.ts';
import { sanitizeRuleAfter } from './ruleAfterChain.ts';
import { raidRuleWithYd } from './raidRowTuning.ts';
import { killOrderEntryMatches } from './killOrder.ts';

// `c` is passed because subject 'ally' carries its own filter: which friendly the row means.
function subjectOf(snap: RotationSnapshot, s: CondSubject, c?: Condition): SubjectState | null {
  if (s === 'ally') return snap.allySubject?.(c?.ally) ?? null;
  return s === 'self' ? snap.self : s === 'target' ? snap.target : snap.pet;
}

function idsHave(snap: RotationSnapshot, ids: ReadonlySet<number> | undefined, ref: number): boolean {
  if (!ids) return false;
  if (ids.has(ref)) return true;
  return snap.auraCovered?.(ids, ref) === true;
}

/** Every metric that reads the condition's SUBJECT. Disjoint from every `c.metric ===` test in
 *  metricValue below — checked, and the fast path at the top of it depends on that. */
const SUBJECT_METRICS: ReadonlySet<string> = new Set([
  'healthPct', 'powerPct', 'manaPct', 'comboPoints', 'drLevel', 'formId', 'level',
  'buffPresent', 'debuffPresent',
  'castingSchool', 'castingIsHeal', 'buffStacks', 'debuffStacks', 'petHappiness', 'classId',
  'buffRemainingMs', 'debuffRemainingMs', 'canAfford',
]);

// One-element scratch for the rank walk below. auraCovered takes a SET, and allocating one per
// candidate rank turned a cold miss into garbage on every pick. Read and discarded inside one call.
const ONE_ID = new Set<number>([0]);

// Ms left on the aura `ref` names, through the SAME rank coverage idsHave uses: a row written
// against Rejuvenation r1 must read the r4 chip that is actually up, or it reads permanent and the
// refresh never fires. Exact hit first, so the walk only pays on a rank mismatch. A missing entry
// is permanent (Infinity), which is what an aura with no expiry means.
function auraRemainingMs(
  snap: RotationSnapshot,
  remaining: ReadonlyMap<number, number> | undefined,
  ids: ReadonlySet<number>,
  ref: number,
): number {
  if (!remaining) return Number.POSITIVE_INFINITY;
  const exact = remaining.get(ref);
  if (exact != null) return exact;
  if (!snap.auraCovered) return Number.POSITIVE_INFINITY;
  for (const id of ids) {
    if (id === ref) continue;
    const ms = remaining.get(id);
    if (ms == null) continue;
    ONE_ID.clear();
    ONE_ID.add(id);
    if (snap.auraCovered(ONE_ID, ref)) return ms;
  }
  return Number.POSITIVE_INFINITY;
}
function subjectMetricValue(snap: RotationSnapshot, c: Condition): number | null {
  const subj = subjectOf(snap, c.subject, c);
  if (!subj || !subj.alive) return null; // any other metric on an absent/dead subject can't apply
  switch (c.metric) {
    case 'healthPct': return subj.healthPct;
    case 'powerPct': return subj.powerPct;
    // The mana bar, never the form bar. A druid in Cat Form reads energy on powerPct, so a mana
    // potion row gated there drank on an empty energy bar and never on empty mana.
    case 'manaPct': return subj.manaPct ?? null;
    case 'comboPoints': return subj.comboPoints ?? 0;
    // `ref` indexes DIMINISHING_GROUP_ORDER. A group nobody has touched, an expired window and
    // a missing snapshot all read 0 — the same answer, and the one that means "full duration".
    case 'drLevel': return subj.drSteps?.[(c.ref ?? -1) | 0] ?? 0;
    case 'formId': return subj.formId ?? 0;
    // A creature has no class, so it reads 0 and every `classId ==` row is simply false in PvE.
    case 'classId': return subj.classId ?? 0;
    case 'level': return subj.level;
    case 'buffPresent': return idsHave(snap, subj.buffs, c.ref ?? -1) ? 1 : 0;
    // A keep-up whose aura CANNOT land on this target reads as already present, or the gate is
    // unsatisfiable and re-fires forever — Hamstring 15 times on a snare-immune boss.
    case 'debuffPresent':
      if (idsHave(snap, subj.debuffs, c.ref ?? -1)) return 1;
      return subj.immuneAuraSpellIds?.has(c.ref ?? -1) ? 1 : 0;
    // School / heal-ness of the in-flight cast: no cast → null → condition false, so an
    // "interrupt fire casts" rule simply never fires while the subject isn't casting.
    case 'castingSchool': return subj.casting ? subj.casting.school : null;
    case 'castingIsHeal': return subj.casting ? (subj.casting.isHeal ? 1 : 0) : null;
    case 'castingSpellId': return subj.casting ? (subj.casting.spellId ?? 0) : null;
    // Stacks: 0 when the aura is absent, 1 when present unstacked — so both
    // "reapply below 5 stacks" (< 5) and "spend at 5 stacks" (>= 5) read naturally.
    case 'buffStacks': {
      const ref = c.ref ?? -1;
      if (subj.buffs.has(ref)) return subj.buffStacks?.get(ref) ?? 1;
      return idsHave(snap, subj.buffs, ref) ? 1 : 0;
    }
    case 'debuffStacks': {
      const ref = c.ref ?? -1;
      if (subj.debuffs.has(ref)) return subj.debuffStacks?.get(ref) ?? 1;
      return idsHave(snap, subj.debuffs, ref) ? 1 : 0;
    }
    // Absent reads 0 and permanent reads Infinity, so `< 3000` is "gone or nearly gone" in one row
    // and `>= 1` is plain presence. An immune target reads Infinity for the same reason
    // debuffPresent reads 1: the keep-up is unsatisfiable and must not re-fire.
    case 'buffRemainingMs': {
      const ref = c.ref ?? -1;
      if (!idsHave(snap, subj.buffs, ref)) return 0;
      return auraRemainingMs(snap, subj.buffRemainingMs, subj.buffs, ref);
    }
    case 'debuffRemainingMs': {
      const ref = c.ref ?? -1;
      if (subj.immuneAuraSpellIds?.has(ref)) return Number.POSITIVE_INFINITY;
      if (!idsHave(snap, subj.debuffs, ref)) return 0;
      return auraRemainingMs(snap, subj.debuffRemainingMs, subj.debuffs, ref);
    }
    // Absent set reads null (condition false), not 0: a snapshot that never priced the kit must not
    // read as "cannot afford anything" and fire every out-of-mana row at once.
    case 'canAfford':
      return subj.affordableSpellIds ? (subj.affordableSpellIds.has(c.ref ?? -1) ? 1 : 0) : null;
    // Editor speaks in percent ("pet happiness %"); happiness stores 0..1000 → normalize.
    case 'petHappiness': return subj.happiness != null ? (subj.happiness / HAPPINESS_MAX) * 100 : 0;
    default: return null;
  }
}

/** Resolve a condition's left-hand metric to a number, or null when it can't apply. */
function metricValue(snap: RotationSnapshot, c: Condition): number | null {
  // The hot metrics sat behind ~37 sequential compares: healthPct alone is 12,957 of 67,594 calls
  // in a 300-tick 40-man fight. The two sets are disjoint, so answering these first is safe.
  if (SUBJECT_METRICS.has(c.metric)) return subjectMetricValue(snap, c);
  // These three build their own subject and sat at positions ~212-221 of ~230 tests. Each metric
  // name appears exactly once in this function, so position cannot change an answer.
  if (c.metric === 'alive') { const s = subjectOf(snap, c.subject, c); return s && s.alive ? 1 : 0; }
  if (c.metric === 'castingPresent') {
    const s = subjectOf(snap, c.subject, c);
    if (s?.alive && s.casting) return 1;
    // Kick/CS: the bar may be on an add, not the kill focus.
    if (c.subject === 'target' && snap.kickableCastPresent) return 1;
    return 0;
  }
  if (c.metric === 'dodgedRecently') { const s = subjectOf(snap, c.subject, c); return s?.alive && s.dodgedRecently ? 1 : 0; }
  // Not a SUBJECT_METRIC: it reads the subject's health AND the fight clock, and null (unknown)
  // has to reach the comparison so the row is simply off rather than true at 0.
  if (c.metric === 'timeToDieMs') {
    const s = subjectOf(snap, c.subject, c);
    if (!s?.alive) return null;
    return timeToDieMs(s.healthPct, snap.combatTimeMs);
  }
  // Subject-independent metrics first.
  if (c.metric === 'combatTimeMs') return snap.combatTimeMs;
  if (c.metric === 'inCombat') return snap.inCombat ? 1 : 0;
  if (c.metric === 'enemyCount') return snap.enemyCount;
  // Group metrics (S1): the healer triage gate degrades to self health when the snapshot
  // has no group data (solo autopilot / OOC), so a companion rotation still self-heals solo.
  if (c.metric === 'allyLowestHpPct') return snap.allyLowestHpPct ?? snap.self.healthPct;
  // HoT keep-up on the triage target. firstFiring stamps `{ lowestHp }` so the aura lands there.
  if (c.metric === 'allyLowestBuffPresent') {
    const ref = c.ref ?? -1;
    if (snap.allyTriageBuffs) return idsHave(snap, snap.allyTriageBuffs, ref) ? 1 : 0;
    return idsHave(snap, snap.self.buffs, ref) ? 1 : 0;
  }
  // Count of living friendlies under ref% HP (default 75). AOE heal gates.
  if (c.metric === 'alliesBelowHpCount') {
    const thr = c.ref != null && c.ref > 0 ? c.ref : 75;
    const pcts = snap.allyHpPcts ?? [snap.self.healthPct];
    let n = 0;
    for (const p of pcts) if (p < thr) n++;
    return n;
  }
  // Hurt friendlies within ref yards (default 30). No geometry → all allies count as in range.
  if (c.metric === 'nearbyAlliesBelowHpCount') {
    const yards = c.ref != null && c.ref > 0 ? c.ref : 30;
    const hpThr = 75;
    const list = snap.allyDistHp
      ?? (snap.allyHpPcts ?? [snap.self.healthPct]).map((hpPct) => ({ hpPct, distYd: null as number | null }));
    let n = 0;
    for (const a of list) {
      if (a.hpPct >= hpThr) continue;
      if (a.distYd != null && a.distYd > yards) continue;
      n++;
    }
    return n;
  }
  // S4C companion knobs: absent → auto (0) / off-heal disallowed (0).
  if (c.metric === 'aoeMode') return snap.aoeMode ?? 0;
  if (c.metric === 'offHealAllowed') return snap.offHealAllowed ?? 0;
  // E6 raid plan — acting unit only (subject ignored). Absent → 0 / false.
  if (c.metric === 'isMainTank') return snap.isMainTank ? 1 : 0;
  if (c.metric === 'isOffTank') return snap.isOffTank ? 1 : 0;
  if (c.metric === 'myJob') return snap.myJob ?? 0;
  if (c.metric === 'myCamp') return snap.myCamp ?? 0;
  if (c.metric === 'assignedHealSubgroup') {
    return snap.assignedHealSubgroup == null ? null : snap.assignedHealSubgroup;
  }
  // Aggro booleans: absent (OOC / legacy snapshot) → null → the condition is false.
  if (c.metric === 'hasAggro') return snap.hasAggro == null ? null : (snap.hasAggro ? 1 : 0);
  // Party peel: a hostile's GetVictim is an ally other than self. Cite: PlayerbotRogueAI.cpp:208-219.
  if (c.metric === 'allyHasAggro') return snap.allyHasAggro == null ? null : (snap.allyHasAggro ? 1 : 0);
  if (c.metric === 'targetAttackingMe') return snap.targetAttackingMe == null ? null : (snap.targetAttackingMe ? 1 : 0);
  if (c.metric === 'aggroHolderDebuffPresent') {
    return snap.aggroHolderDebuffs?.has(c.ref ?? -1) ? 1 : 0;
  }
  // Unstacked-but-present reads 1, the same shape `debuffStacks` uses on a subject.
  if (c.metric === 'aggroHolderDebuffStacks') {
    const ref = c.ref ?? -1;
    if (!snap.aggroHolderDebuffs?.has(ref)) return 0;
    return snap.aggroHolderDebuffStacks?.get(ref) ?? 1;
  }
  // Raid-tab "anyone has it": any living friendly holds `ref`. Absent getter → 0.
  if (c.metric === 'allyAuraPresent') {
    return (snap.allyAuraStacks?.(c.ref ?? -1) ?? 0) > 0 ? 1 : 0;
  }
  if (c.metric === 'allyAuraStacks') {
    return snap.allyAuraStacks?.(c.ref ?? -1) ?? 0;
  }
  // Charm/possess group view: absent → 0 (no charmed hostile).
  if (c.metric === 'charmedHostileCount') return snap.charmedHostileCount ?? 0;
  // Ground-pool edge yards. Absent / no pools → null → condition false.
  if (c.metric === 'hazardProximityYd') {
    return snap.hazardProximityYd == null ? null : snap.hazardProximityYd;
  }
  if (c.metric === 'targetDistanceYd') {
    return snap.targetDistanceYd == null ? null : snap.targetDistanceYd;
  }
  if (c.metric === 'creatureDistanceYd') {
    const d = snap.creatureDistanceYd?.(c.ref ?? -1);
    return d == null ? null : d;
  }
  // Nearest friendly lacking `ref`, in yards. Absent / nobody placed -> null -> false.
  if (c.metric === 'allyWithoutAuraNearYd') {
    const d = snap.allyWithoutAuraNearYd?.(c.ref ?? -1);
    return d == null ? null : d;
  }
  // Standing in the target's frontal arc. Absent (no geometry / no facing) → null → false,
  // so a "step out of the breath" row cannot fire on a session that cannot answer it.
  if (c.metric === 'inTargetCone') {
    return snap.inTargetCone == null ? null : (snap.inTargetCone ? 1 : 0);
  }
  // Group composition: melee friendlies for Windfury-class buffs. Absent → 0.
  if (c.metric === 'meleeAllyCount') return snap.meleeAllyCount ?? 0;
  // Party rez gate: dead friendlies. Absent / solo → 0 (never thrash Redemption OOC).
  if (c.metric === 'deadAllyCount') return snap.deadAllyCount ?? 0;
  if (c.metric === 'itemCount') return snap.itemCounts.get(c.ref ?? -1) ?? 0;
  if (c.metric === 'itemEquipped') return snap.equippedItemEntries?.has(c.ref ?? -1) ? 1 : 0;
  // ---- BG / PvP vocabulary (W10, runsheet §4) ------------------------------------------
  // Every one is defined when the BG view is absent and reads 0 there, so no PvE decision moves.
  if (c.metric === 'hasFlag') {
    const s = subjectOf(snap, c.subject, c);
    return s?.alive && s.carryingFlag ? 1 : 0;
  }
  if (c.metric === 'isFlagCarrier') {
    const s = subjectOf(snap, c.subject, c);
    return s?.alive && s.carryingFlag ? 1 : 0;
  }
  if (c.metric === 'allyHasFlag') {
    if (snap.self.carryingFlag) return 1;
    return snap.bg?.allyUnits.some((a) => a.carryingFlag) ? 1 : 0;
  }
  if (c.metric === 'enemyHasFlag') {
    return snap.bg?.enemyUnits.some((e) => e.carryingFlag) ? 1 : 0;
  }
  if (c.metric === 'enemyCastingOnAlly') return snap.enemyCastingOnAlly ? 1 : 0;
  if (c.metric === 'enemyCastingOnSelf') return snap.enemyCastingOnSelf ? 1 : 0;
  if (c.metric === 'isHealer') {
    const s = subjectOf(snap, c.subject, c);
    return s?.groupRole === 'healer' ? 1 : 0;
  }
  if (c.metric === 'isCaster') {
    const s = subjectOf(snap, c.subject, c);
    return s?.isCaster ? 1 : 0;
  }
  if (c.metric === 'isHunter') {
    const s = subjectOf(snap, c.subject, c);
    return s?.isHunter ? 1 : 0;
  }
  if (c.metric === 'enemiesWithinYd') {
    const r = c.ref && c.ref > 0 ? c.ref : 10;
    // subject target → density at the focus (ground rain). self/pet → density at caster (PBAoE).
    if (c.subject === 'target') {
      if (snap.enemyDistsFromTarget) {
        let n = 0;
        for (const d of snap.enemyDistsFromTarget) if (d <= r) n++;
        return n;
      }
      // No focus geometry: fight-wide pack (still better than hard-false).
      return snap.enemyCount;
    }
    // BG view first (perceived enemies), then PvE geometry from actor, then fight-wide.
    if (snap.bg?.enemyUnits) {
      return snap.bg.enemyUnits.filter((e) => e.distYd <= r).length;
    }
    if (snap.enemyDists) {
      let n = 0;
      for (const d of snap.enemyDists) if (d <= r) n++;
      return n;
    }
    return snap.enemyCount;
  }
  if (c.metric === 'alliesWithinYd') {
    const r = c.ref && c.ref > 0 ? c.ref : 10;
    if (snap.bg?.allyUnits) return snap.bg.allyUnits.filter((a) => a.distYd <= r).length;
    if (snap.allyDistHp) {
      let n = 0;
      for (const a of snap.allyDistHp) {
        if (a.distYd === 0) continue;
        if (a.distYd != null && a.distYd > r) continue;
        n++;
      }
      return n;
    }
    return 0;
  }
  if (c.metric === 'healersWithinYd') {
    const r = c.ref && c.ref > 0 ? c.ref : 30;
    if (snap.bg?.allyUnits) {
      return snap.bg.allyUnits.filter((a) => a.isHealer && a.distYd <= r).length;
    }
    if (snap.allyDistHp) {
      let n = 0;
      for (const a of snap.allyDistHp) {
        if (!a.isHealer) continue;
        if (a.distYd != null && a.distYd > r) continue;
        n++;
      }
      return n;
    }
    return 0;
  }
  // The party healer's mana (dead seat = 0). No healer seat → null → the condition is false,
  // which is what keeps the off-heal rows off solo and all-DPS rotations.
  if (c.metric === 'healerPowerPct') {
    const pcts = snap.healerPowerPcts;
    if (!pcts || pcts.length === 0) return null;
    let low = pcts[0]!;
    for (const p of pcts) if (p < low) low = p;
    return low;
  }
  // Seats, not living bodies: a party mid-wipe must not read as solo and turn the damage rows back on.
  if (c.metric === 'partySeats') return snap.partySeats ?? 1;
  if (c.metric === 'enemyHealersWithinYd') {
    const r = c.ref && c.ref > 0 ? c.ref : 30;
    if (snap.bg?.enemyUnits) {
      return snap.bg.enemyUnits.filter((e) => e.isHealer && e.distYd <= r).length;
    }
    if (snap.enemyHealerDists) {
      let n = 0;
      for (const d of snap.enemyHealerDists) if (d <= r) n++;
      return n;
    }
    return 0;
  }
  if (c.metric === 'rooted') { const s = subjectOf(snap, c.subject, c); return s?.alive && s.rooted ? 1 : 0; }
  if (c.metric === 'feared') { const s = subjectOf(snap, c.subject, c); return s?.alive && s.feared ? 1 : 0; }
  if (c.metric === 'stunned') { const s = subjectOf(snap, c.subject, c); return s?.alive && s.stunned ? 1 : 0; }
  if (c.metric === 'snared') { const s = subjectOf(snap, c.subject, c); return s?.alive && s.snared ? 1 : 0; }
  // Cite: Spell.cpp:6049-6050 UNIT_FLAG_SILENCED -> SPELL_FAILED_SILENCED.
  if (c.metric === 'silenced') { const s = subjectOf(snap, c.subject, c); return s?.alive && s.silenced ? 1 : 0; }
  if (c.metric === 'controlled') {
    const s = subjectOf(snap, c.subject, c);
    if (!s?.alive) return 0;
    return (s.rooted || s.feared || s.stunned || s.snared) ? 1 : 0;
  }
  if (c.metric === 'objectiveContested') return snap.bg?.objectiveContested ? 1 : 0;
  if (c.metric === 'objectiveOwnedByUs') return snap.bg?.objectiveOwnedByUs ? 1 : 0;
  if (c.metric === 'objectiveDistanceYd') {
    // Absent → null so the condition is FALSE rather than "distance 0", which would make
    // "objective distance < 10" fire everywhere there is no objective.
    return snap.bg?.objectiveDistYd ?? null;
  }
  // Wave 1D: slot occupancy (any summon in the element), not a specific spell id.
  if (c.metric === 'totemPresent') {
    const slot = totemSlotFromIndex(c.ref ?? -1);
    if (!slot) return 0;
    return snap.totemSlots.has(slot) ? 1 : 0;
  }
  // Weapon temp enchant (MH/OH): any imbue/poison on the hand, not a specific apply spell.
  // ref 2 = fully coated (no open eligible weapon hand) — dual-wield keep-up MH then OH.
  if (c.metric === 'weaponImbuePresent') {
    const r = c.ref ?? 0;
    if (r === 2) {
      if (snap.weaponImbueOpenHands) return snap.weaponImbueOpenHands.size === 0 ? 1 : 0;
      return snap.weaponImbueHands?.has('mainhand') ? 1 : 0;
    }
    const hand = r === 1 ? 'offhand' : 'mainhand';
    if (snap.weaponImbueHands?.has(hand)) return 1;
    // A hand that can never take a coat (nothing equipped there, a shield, a two-hander's offhand)
    // reads as covered, so a per-hand coat row does not fire into a refusal every prep tick.
    if (snap.weaponImbueOpenHands && !snap.weaponImbueOpenHands.has(hand)) return 1;
    return 0;
  }
  // Omitted/negative ref = any category, the question GetDispelTarget / NOTHING_TO_DISPEL ask.
  // Cite: PlayerbotPriestAI.cpp:442; Spell.cpp:4890–4919.
  if (c.metric === 'dispellablePresent') {
    const set = c.subject === 'target' ? snap.dispellableOnTarget : snap.dispellableOnFriendlies;
    if (!set) return 0;
    const cat = c.ref;
    if (cat == null || cat < 0) return set.size > 0 ? 1 : 0;
    return set.has(cat) ? 1 : 0;
  }
  // Creature-type mask gate: defined when subject is absent/dead as 0 so "mask match == 1"
  // fails cleanly (never fire Exorcism with no target).
  if (c.metric === 'creatureTypeMask') {
    const s = subjectOf(snap, c.subject, c);
    if (!s?.alive) return 0;
    const type = s.creatureType ?? 0;
    if (!type) return 0;
    const mask = c.ref ?? 0;
    if (!mask) return 0;
    return ((1 << (type - 1)) & mask) !== 0 ? 1 : 0;
  }
  // Defense react (Revenge): dodge/parry/block gate on the subject. Absent → 0 (never free).
  if (c.metric === 'defenseReactRecently') {
    const s = subjectOf(snap, c.subject, c);
    return s?.alive && s.defenseReactRecently ? 1 : 0;
  }
  // Hunter parry (Counterattack): AURA_STATE_HUNTER_PARRY. Absent → 0.
  if (c.metric === 'hunterParryRecently') {
    const s = subjectOf(snap, c.subject, c);
    return s?.alive && s.hunterParryRecently ? 1 : 0;
  }
  // Melee band vs the acting unit. Absent / unknown → 0 so "at range" is not a no-op
  // (the old degrade-to-1 made every inMelee==1 rule fire at 30 yd).
  if (c.metric === 'inMelee') {
    const s = subjectOf(snap, c.subject, c);
    if (!s?.alive) return 0;
    if (s.inMelee === true) return 1;
    if (s.inMelee === false) return 0;
    if (c.subject === 'self' && snap.enemyDists) {
      for (const d of snap.enemyDists) if (d <= IN_MELEE_YD) return 1;
    }
    return 0;
  }
  // Charm/possess on a subject: defined when absent/dead as 0 so "target charmed == 1" fails cleanly.
  if (c.metric === 'charmed') {
    const s = subjectOf(snap, c.subject, c);
    return s?.alive && s.charmed ? 1 : 0;
  }
  return subjectMetricValue(snap, c);
}

function compare(a: number, op: CondOp, b: number): boolean {
  switch (op) {
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '==': return a === b;
    case '!=': return a !== b;
    default: return false;
  }
}

// Bear Form family for rotation gates: Classic Bear (5) and Dire Bear (8) both satisfy "in Bear Form" /
// "not in Bear Form" when the expected id is BEAR. Exact DIREBEAR / CAT / stance ids stay exact. Wave 1A.
function formIdEquals(actual: number, expected: number): boolean {
  // SHAPESHIFT_FORM.BEAR = 5, DIREBEAR = 8 (schema) — keep numeric to avoid domain↔schema cycles in tests.
  if (expected === 5) return actual === 5 || actual === 8;
  return actual === expected;
}

function compareFormId(actual: number, op: CondOp, expected: number): boolean {
  if (op === '==') return formIdEquals(actual, expected);
  if (op === '!=') return !formIdEquals(actual, expected);
  return compare(actual, op, expected);
}

/** Evaluate a single condition. A metric that can't apply (absent subject) is FALSE. */
export function evalCondition(snap: RotationSnapshot, c: Condition): boolean {
  const v = metricValue(snap, c);
  if (v === null) return false;
  if (c.metric === 'formId') return compareFormId(v, c.op, c.value);
  return compare(v, c.op, c.value);
}

function hasPackDensityGate(rule: RotationRule): boolean {
  return rule.conditions.some((c) => c.metric === 'enemyCount' || c.metric === 'enemiesWithinYd');
}

function ruleWantsTriageAim(rule: RotationRule): boolean {
  return rule.conditions.some(
    (c) => c.metric === 'allyLowestHpPct' || c.metric === 'allyLowestBuffPresent'
      || c.subject === 'ally',
  );
}

// The filter the row's ALLY gates read, so the aim lands on the body they measured. First
// ally-subject condition wins: two different filters on one row is two rows.
export function allyFilterOfRule(rule: RotationRule): AllyFilter | undefined {
  for (const c of rule.conditions) {
    if (c.subject === 'ally' && !allyFilterIsAny(c.ally)) return c.ally;
  }
  return undefined;
}

export function isLowestHpSpellTarget(
  t: RuleSpellTarget | undefined,
): t is { lowestHp: true; among?: AllyFilter } {
  return !!t && typeof t === 'object' && 'lowestHp' in t && t.lowestHp === true;
}

function spellActionWithTriageAim(rule: RotationRule, action: RuleAction): RuleAction {
  if (action.kind !== 'spell' || action.target != null || !ruleWantsTriageAim(rule)) return action;
  const among = allyFilterOfRule(rule);
  return { ...action, target: among ? { lowestHp: true, among } : { lowestHp: true } };
}

function isNotFearedKeepUp(rule: RotationRule): boolean {
  return rule.conditions.some(
    (c) => c.metric === 'feared' && c.op === '==' && c.value === 0,
  );
}

// Stock Fear is `target: other` (a second mob). Deleting the 2+ if does not clear that. With no
// pack-density gate, fire at the focus — otherwise 1v1 never casts.
function actionForEval(rule: RotationRule, snap?: RotationSnapshot): RuleAction {
  const a = rule.action;
  if (a.kind === 'spell' && a.target === 'other' && !hasPackDensityGate(rule)) {
    const { target: _drop, ...rest } = a;
    return rest;
  }
  // A family row is a ladder: swap in the best rank actually carried. No provider (or nothing
  // carried) leaves the authored rung, which usableItem then refuses like any empty-bag row.
  if (a.kind === 'item' && a.family && snap?.bestFamilyEntry) {
    const best = snap.bestFamilyEntry(a.family);
    if (best != null && best !== a.itemEntry) return { ...a, itemEntry: best };
  }
  // A multi-entry click resolves to the one entry usable now: the row names the SET and the
  // snapshot names the member. Thermaplugg lights one of six buttons at a time.
  if (a.kind === 'use_object' && a.goEntries?.length && snap?.usableObject) {
    const live = a.goEntries.find((e) => snap.usableObject?.(e) === true);
    if (live != null && live !== a.goEntry) return { ...a, goEntry: live };
  }
  return a;
}

// A `target: 'other'` row casts at a SECOND body, so a subject-`target` gate read against the focus
// describes one unit and types another: the gate never closes and the row repeats every GCD.
function snapForAction(snap: RotationSnapshot, action: RuleAction): RotationSnapshot {
  if (action.kind !== 'spell' || action.target !== 'other' || !snap.offTargetSubject) return snap;
  const other = snap.offTargetSubject(action.spellId);
  return other ? { ...snap, target: other } : snap;
}

// Pack `ACTION_SPELL` (whenMap.ts:40) and a missing editor ref both mean this row's spell.
const PRESENCE_BIND_METRICS: ReadonlySet<string> = new Set([
  'buffPresent', 'debuffPresent', 'buffStacks', 'debuffStacks',
  'allyLowestBuffPresent', 'allyAuraPresent', 'allyAuraStacks',
  'aggroHolderDebuffPresent', 'aggroHolderDebuffStacks',
]);

function presenceRefUnbound(ref: unknown): boolean {
  return ref == null || ref === 'ACTION_SPELL' || (typeof ref === 'number' && ref <= 0);
}

function bindActionSpellRefs(rule: RotationRule, conds: readonly Condition[]): readonly Condition[] {
  if (rule.action.kind !== 'spell') return conds;
  const spellId = rule.action.spellId;
  if (!(spellId > 0)) return conds;
  let dirty = false;
  const out: Condition[] = [];
  for (const c of conds) {
    if (!PRESENCE_BIND_METRICS.has(c.metric) || !presenceRefUnbound(c.ref)) {
      out.push(c);
      continue;
    }
    dirty = true;
    out.push({ ...c, ref: spellId });
  }
  return dirty ? out : conds;
}

// Drop conditions the evaluator hides, keeping the OR groups the player authored: a dropped group
// head hands its `or` to the next survivor, or the rest of that group would AND into the group above.
function dropConditions(
  conds: readonly Condition[],
  drop: (c: Condition) => boolean,
): readonly Condition[] {
  const out: Condition[] = [];
  let owedOr = false;
  for (const c of conds) {
    if (drop(c)) {
      if (c.join === 'or') owedOr = true;
      continue;
    }
    out.push(owedOr && c.join !== 'or' ? { ...c, join: 'or' } : c);
    owedOr = false;
  }
  return out;
}

// The same list split into its OR groups, for a caller that has to REWRITE it rather than read it
// (the macro compile ANDs its own guard onto each group, since (A and B or C) and V distributes).
export function conditionGroups(conds: readonly Condition[]): Condition[][] {
  const groups: Condition[][] = [];
  for (let i = 0; i < conds.length; i++) {
    const c = conds[i]!;
    if (i === 0 || c.join === 'or' || groups.length === 0) groups.push([]);
    groups[groups.length - 1]!.push(c);
  }
  return groups;
}

// A rule's condition list as OR-of-AND runs: a condition carrying `join: 'or'` STARTS a new group,
// every other one ANDs into the group it sits in, and the rule fires when any group passes. An
// all-`and` list (every rotation written before the join field) is one group, so this is `.every`.
export function conditionsPass(
  snap: RotationSnapshot,
  conds: readonly Condition[],
): boolean {
  if (conds.length === 0) return true;
  let group = true;
  let passed = false;
  for (let i = 0; i < conds.length; i++) {
    const c = conds[i]!;
    if (i > 0 && c.join === 'or') {
      if (group) passed = true;
      group = true;
    }
    if (group && !evalCondition(snap, c)) group = false;
  }
  return passed || group;
}

function conditionsForEval(rule: RotationRule): readonly Condition[] {
  const base = isNotFearedKeepUp(rule)
    ? dropConditions(rule.conditions, (c) => c.metric === 'castingPresent')
    : rule.conditions;
  return bindActionSpellRefs(rule, base);
}

function actionUsable(snap: RotationSnapshot, a: RuleAction): boolean {
  // A macro rule is compiled away before the evaluator sees it (domain/macro/rotation.ts). One
  // reaching here is a hand-edited save or a call site that skipped rotationForCombat: refuse.
  if (a.kind === 'macro') return false;
  if (a.kind === 'item') return snap.usableItem(a.itemEntry);
  // Move / halt_dps have no GCD cost — usable whenever their conditions hold.
  if (a.kind === 'move' || a.kind === 'halt_dps' || a.kind === 'kill_order' || a.kind === 'keep_aura') return true;
  if (a.kind === 'use_object') {
    const entries = a.goEntries?.length ? a.goEntries : [a.goEntry];
    return entries.some((e) => snap.usableObject?.(e) === true);
  }
  // Creature-entry target: canCast against THAT body, not the focus. Faerlina is charm-immune, so
  // usableSpell(605) read false while the row aimed at a Worshipper. Cite: boss_faerlina.cpp:47.
  if (a.target && typeof a.target === 'object' && 'creatureEntry' in a.target) {
    const entries = snap.hostileCreatureEntries;
    if (!entries || !entries.has(a.target.creatureEntry)) return false;
    if (snap.usableOnCreatureEntry) {
      return snap.usableOnCreatureEntry(a.spellId, a.target.creatureEntry);
    }
    return snap.usableSpell(a.spellId);
  }
  if (!snap.usableSpell(a.spellId)) return false;
  // The engine asks it once, so no authored row has to carry the condition: a DoT already on the
  // focus, or a HoT already on the body it would land on, never wins the GCD.
  if (snap.periodicAlreadyOnAimedBody?.(a.spellId, isLowestHpSpellTarget(a.target)) === true) return false;
  // Target school / damage immunity — skip so the next rule takes the GCD (Divine Shield,
  // Blessing of Protection, fire-immune mob). Cite: Unit.cpp IsImmuneToSpell ~7329.
  if (snap.target?.immuneSpellIds?.has(a.spellId)) return false;
  // A CC rule aimed at a second mob is usable only when a second mob it can hold exists. Deciding
  // it here, rather than letting the engine veto the pick, is what lets the next rule take the tick.
  if (a.target === 'other' && snap.offTargetSpell && !snap.offTargetSpell(a.spellId)) return false;
  // Focus-aimed break-on-damage CC on a body our own damage already broke it on. This is also the
  // shape a player creates by deleting the pack-density condition in the editor.
  if (a.target !== 'other' && snap.ccBrokenOnTarget?.(a.spellId) === true) return false;
  if (a.target && typeof a.target === 'object' && 'priority' in a.target) {
    if (firstLivingKillOrderEntry(a.target.priority, snap.hostileCreatureEntries) == null) return false;
  }
  // Usable only while somebody else still lacks the aura, or the row eats the caster's GCD forever.
  if (a.target && typeof a.target === 'object' && 'allyMissingAura' in a.target) {
    if (snap.allyMissingAura?.(a.target.allyMissingAura, a.target.among) !== true) return false;
  }
  return true;
}

function ruleAfterOf(rule: RotationRule): RuleAfter | undefined {
  // A macro action carries no `after` of its own — the rule's is the only one (see RuleAction).
  return sanitizeRuleAfter(rule.after ?? (
    rule.action.kind === 'spell' || rule.action.kind === 'item' ? rule.action.after : undefined
  ));
}

function ruleBeforeOf(rule: RotationRule): RuleBefore | undefined {
  const id = rule.before?.spellId;
  return typeof id === 'number' && id > 0 ? { spellId: id | 0 } : undefined;
}

// True when a `before` clause is already paid for: nothing to cast, the prep is not castable now,
// its aura is already on us, or we already stand in the form it enters. A satisfied prep must never
// eat the GCD - that is the whole difference between a pre-cast and a thrash.
function beforeSatisfied(snap: RotationSnapshot, spellId: number): boolean {
  if (!snap.usableSpell(spellId)) return true;
  if (idsHave(snap, snap.self.buffs, spellId)) return true;
  const enters = snap.formEnteredBySpell?.(spellId) ?? null;
  return enters != null && enters === ((snap.self.formId ?? 0) | 0);
}

// The prep cast a rule's `before` clause owes, or null. It arms the rule's OWN spell as the
// after-cast follow-up, so the next GCD is the action itself: chooseCombatAction reads
// `followUpSpellId` ahead of the list (see the follow-up branch there).
function beforeCastFor(
  rule: RotationRule,
  action: RuleAction,
  snap: RotationSnapshot,
): RuleAction | null {
  const before = ruleBeforeOf(rule);
  if (!before) return null;
  // Only a spell action can be re-armed as the follow-up; an item rule has no spellId to queue.
  if (action.kind !== 'spell' || action.spellId === before.spellId) return null;
  if (beforeSatisfied(snap, before.spellId)) return null;
  return { kind: 'spell', spellId: before.spellId, after: { spellId: action.spellId } };
}

// Per-fight tactic rows ride ON TOP of whatever list the player authored. They are not defaults: a
// spread that is right in one room is wrong in another, so they exist only while that entry is focus.
function withEncounterRows(
  targetEntry: number | undefined,
  list: readonly RotationRule[],
  living?: ReadonlySet<number>,
  tuning?: Pick<Rotation, 'raidRowsOff' | 'raidRowYd'>,
): readonly RotationRule[] {
  const extras: RotationRule[] = [];
  const seen = new Set<string>();
  // The Raid tab's switch and its retuned distance ride on the COMPOSED rotation
  // (withRaidTacticRows) because this prepend happens per focus, after composition.
  const off = tuning?.raidRowsOff?.length ? new Set(tuning.raidRowsOff) : null;
  const yd = tuning?.raidRowYd;
  const add = (entry: number): void => {
    for (const r of encounterTacticRows(entry)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      if (off?.has(r.id)) continue;
      const tunedYd = yd?.[r.id];
      extras.push(tunedYd != null ? raidRuleWithYd(r, tunedYd) : r);
    }
  };
  if (targetEntry != null) add(targetEntry);
  if (living) for (const e of living) add(e);
  return extras.length ? [...extras, ...list] : list;
}

function actionWithAfter(rule: RotationRule): RuleAction {
  const after = ruleAfterOf(rule);
  if (!after || (rule.action.kind !== 'spell' && rule.action.kind !== 'item')) return rule.action;
  return { ...rule.action, after };
}

// The highest-priority halt_dps whose conditions pass, in list order. The engine arms the school
// BEFORE evaluate, so a school-specific halt can refuse one school while allowing a lower rule.
export type HaltDpsPeek = {
  school: HaltDpsSchool;
  /** creature_template.entry bodies this halt covers. Absent = every body. */
  entries?: readonly number[];
};
export function peekHaltDpsSchool(
  rot: Rotation,
  snap: RotationSnapshot,
  targetEntry?: number,
): HaltDpsPeek | null {
  const combatList = withEncounterRows(
    targetEntry,
    (targetEntry != null && rot.overrides?.[targetEntry]) || rot.phases.combat,
    snap.hostileCreatureEntries,
    rot,
  );
  for (const list of [rot.phases.recovery, combatList] as const) {
    for (const rule of list) {
      if (!rule.enabled || rule.action.kind !== 'halt_dps') continue;
      if (!conditionsPass(snap, conditionsForEval(rule))) continue;
      return { school: rule.action.school ?? 'all', entries: rule.action.entries };
    }
  }
  return null;
}

// True when an armed halt covers the body being attacked. No entries means every body. An absent
// entry reads as not covered: a halt that cannot name what it stops must not stop everything.
export function haltDpsCoversEntry(
  entries: readonly number[] | undefined,
  entry: number | undefined,
): boolean {
  if (entries == null || entries.length === 0) return true;
  if (entry == null) return false;
  for (const e of entries) if (e === entry) return true;
  return false;
}

// True when an armed halt refuses this spell's school. 'all' is every damaging school, a string is
// one, an array is that set. Physical is refused only when listed or the halt is 'all'.
export function haltDpsRefusesSchool(
  halt: HaltDpsSchool | null | undefined,
  school: string | undefined,
): boolean {
  if (halt == null) return false;
  if (halt === 'all') return true;
  if (!school) return false;
  if (typeof halt === 'string') return school === halt;
  for (const s of halt) {
    if (s === school) return true;
  }
  return false;
}

/** creature_template.entry list on a kill-order filter or a spell `{ priority }` target. */
export function killOrderEntriesFromAction(action: RuleAction): readonly number[] | null {
  if (action.kind === 'kill_order') return action.entries;
  if (action.kind === 'spell' && action.target && typeof action.target === 'object'
    && 'priority' in action.target) {
    return action.target.priority;
  }
  return null;
}

/** First entry in `order` that is currently alive. */
export function firstLivingKillOrderEntry(
  order: readonly number[],
  living: ReadonlySet<number> | undefined,
): number | null {
  if (!living || order.length === 0) return null;
  for (const e of order) {
    if (e >= 0) {
      if (living.has(e)) return e;
      continue;
    }
    for (const alive of living) {
      if (killOrderEntryMatches(e, alive)) return alive;
    }
  }
  return null;
}

/** Spell ids a keep_aura row forbids auto-dispelling. Enabled only; conditions are the sentence. */
export function keepAuraIdsOf(rot: Rotation): ReadonlySet<number> {
  const out = new Set<number>();
  const take = (rules: readonly RotationRule[] | undefined): void => {
    for (const r of rules ?? []) {
      if (!r.enabled || r.action.kind !== 'keep_aura') continue;
      const id = r.action.spellId | 0;
      if (id > 0) out.add(id);
    }
  };
  take(rot.phases.recovery);
  take(rot.phases.combat);
  for (const list of Object.values(rot.overrides ?? {})) take(list);
  return out;
}

// Highest-priority kill-order list whose conditions pass (encounter rows first via withEncounterRows). Used
// to retarget DPS onto the first living add. Cite: AUTOPILOT-PLAN §4 row 17.
export function peekKillOrderEntries(
  rot: Rotation,
  snap: RotationSnapshot,
  targetEntry?: number,
): readonly number[] | null {
  const combatList = withEncounterRows(
    targetEntry,
    (targetEntry != null && rot.overrides?.[targetEntry]) || rot.phases.combat,
    snap.hostileCreatureEntries,
    rot,
  );
  for (const list of [rot.phases.recovery, combatList] as const) {
    for (const rule of list) {
      if (!rule.enabled) continue;
      const entries = killOrderEntriesFromAction(rule.action);
      if (!entries?.length) continue;
      if (!conditionsPass(snap, conditionsForEval(rule))) continue;
      return entries;
    }
  }
  return null;
}

// The form a row demands, from the `self formId ==` guard build.ts:1115 injects on a stance-gated
// spell. 0 when the row names none. Nothing else in the vocabulary names a form.
function wantedFormOf(conds: readonly Condition[]): number {
  for (const c of conds) {
    if (c.subject === 'self' && c.metric === 'formId' && c.op === '==') return c.value | 0;
  }
  return 0;
}

// The stance this row would need entering, when the ROW ITSELF is otherwise ready. Disarm needs
// Defensive Stance (spells.json 676 stances=131072) and every warrior pvp band stands in Battle, so
// without this the row is skipped forever instead of swapping for it. The press-side twin is
// stancePrereq.ts:22, which combatView.ts:1676 already runs for a hand-pressed button.
function stanceSwapFor(
  rule: RotationRule,
  conds: readonly Condition[],
  snap: RotationSnapshot,
): number | null {
  if (!snap.usableSpellIgnoringForm || !snap.stanceSpellForForm) return null;
  if (rule.action.kind !== 'spell') return null;
  const want = wantedFormOf(conds);
  if (!want || want === (snap.self.formId ?? 0)) return null;
  // Every OTHER guard must already pass, so a row on cooldown or out of rage never dances.
  for (const c of conds) {
    if (c.subject === 'self' && c.metric === 'formId' && c.op === '==') continue;
    if (!evalCondition(snap, c)) return null;
  }
  if (!snap.usableSpellIgnoringForm(rule.action.spellId)) return null;
  const stance = snap.stanceSpellForForm(want);
  return stance != null && snap.usableSpell(stance) ? stance : null;
}

// A default-stance row must not pop the unit back out of a stance a LOWER row is mid-way through
// using. Arms@60 puts `Battle Stance when formId != 17` above Shield Wall and Revenge, so the tick
// after the swap the setup row won on priority and the payload never fired.
function formRowPopsAServedStance(
  action: RuleAction,
  rest: readonly RotationRule[],
  snap: RotationSnapshot,
): boolean {
  if (action.kind !== 'spell' || !snap.formEnteredBySpell || !snap.usableSpellIgnoringForm) return false;
  const here = (snap.self.formId ?? 0) | 0;
  const enters = snap.formEnteredBySpell(action.spellId) ?? 0;
  if (!here || !enters || enters === here) return false;
  for (const r of rest) {
    if (!r.enabled || r.action.kind !== 'spell') continue;
    const conds = conditionsForEval(r);
    if (wantedFormOf(conds) !== here) continue;
    if (!conditionsPass(snap, conds)) continue;
    if (snap.usableSpellIgnoringForm(r.action.spellId)) return true;
  }
  return false;
}

// First enabled rule whose conditions pass and whose action is usable, else null. halt_dps is a
// filter, not a winner: remember it and keep scanning, and return it only if nothing else fires.
function firstFiring(
  rules: readonly RotationRule[],
  snap: RotationSnapshot,
  pred?: (rule: RotationRule) => boolean,
  // `before` clauses ride the after-cast follow-up channel, which only the combat pick arms
  // (pickAction armRuleAfter). An OOC caller passes false or the prep would fire with nothing behind it.
  allowBefore = true,
): RuleAction | null {
  let pendingHalt: RuleAction | null = null;
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (!rule.enabled) continue;
    if (pred && !pred(rule)) continue;
    const conds = conditionsForEval(rule);
    // Resolve the action first ONLY for an off-target row, so the gate reads the body it will hit.
    const early = rule.action.kind === 'spell' && rule.action.target === 'other'
      ? actionForEval(rule, snap)
      : null;
    const condSnap = early ? snapForAction(snap, early) : snap;
    if (!conditionsPass(condSnap, conds)) {
      const swap = stanceSwapFor(rule, conds, snap);
      if (swap != null) return { kind: 'spell', spellId: swap };
      continue;
    }
    const action = spellActionWithTriageAim(rule, early ?? actionForEval(rule, snap));
    if (action.kind === 'halt_dps') {
      if (!pendingHalt) pendingHalt = action;
      continue;
    }
    // Kill-order is armed by peekKillOrderEntries; keep_aura by keepAuraIdsOf. Neither spends the GCD.
    if (action.kind === 'kill_order' || action.kind === 'keep_aura') continue;
    if (!actionUsable(snap, action)) continue;
    if (formRowPopsAServedStance(action, rules.slice(i + 1), snap)) continue;
    if (allowBefore) {
      const prep = beforeCastFor(rule, action, snap);
      if (prep) return prep;
    }
    return actionWithAfter({ ...rule, action });
  }
  return pendingHalt;
}

function isPullActionSpent(action: RuleAction, snap: RotationSnapshot): boolean {
  if (action.kind === 'spell') return snap.pullSpentSpellIds?.has(action.spellId) ?? false;
  if (action.kind === 'item') return snap.pullSpentItemEntries?.has(action.itemEntry) ?? false;
  return false; // a macro rule never reaches the evaluator (actionUsable refuses it)
}

// Pull opener as a SEQUENCE, not a thrash priority list: walk top to bottom, skip spent and
// unneeded rules, fire the first that is needed and usable, and wait on a needed head.
function pullSequenceAction(
  rules: readonly RotationRule[],
  snap: RotationSnapshot,
): { kind: 'fire'; action: RuleAction } | { kind: 'wait' } | { kind: 'done' } {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    // Resolve first: a family row's spent-check has to name the rank it would actually drink.
    const action = spellActionWithTriageAim(rule, actionForEval(rule, snap));
    if (isPullActionSpent(action, snap)) continue;
    const condSnap = snapForAction(snap, action);
    if (!conditionsPass(condSnap, conditionsForEval(rule))) continue; // not needed this pull
    if (!actionUsable(snap, action)) {
      const inMelee = snap.self.inMelee === true
        || (!!snap.enemyDists && snap.enemyDists.some((d) => d <= IN_MELEE_YD));
      if (inMelee || snap.enemyCount === 0) continue;
      return { kind: 'wait' }; // walking into range / GCD / CD
    }
    // Opener prep: a spent prep is done, so the opener steps on to the action it guards.
    const prep = beforeCastFor(rule, action, snap);
    if (prep && !isPullActionSpent(prep, snap)) return { kind: 'fire', action: prep };
    return { kind: 'fire', action: actionWithAfter({ ...rule, action }) };
  }
  return { kind: 'done' };
}

// Choose the in-combat action for this tick. Raid-response, interrupts and dispels beat recovery;
// then recovery, the pull opener and combat. `targetEntry` selects a per-creature override.
export function chooseCombatAction(
  rot: Rotation,
  snap: RotationSnapshot,
  targetEntry?: number,
  opts?: { skipMove?: boolean },
): RuleAction | null {
  const combatList = withEncounterRows(
    targetEntry,
    (targetEntry != null && rot.overrides?.[targetEntry]) || rot.phases.combat,
    snap.hostileCreatureEntries,
    rot,
  );
  // `skipMove` asks the same list what it would do without the run-out row. A move pick spends the
  // whole tick, so this is how the engine finds the instant it may still fire while walking.
  const noMove = opts?.skipMove === true
    ? (rule: RotationRule) => actionForEval(rule, snap).kind !== 'move'
    : undefined;
  // halt_dps stays a filter in the combat scan; hoisting it here would skip heals.
  const raidPick = firstFiring(combatList, snap, (r) => {
    if (!isRaidRuleId(r.id)) return false;
    if (r.action.kind === 'halt_dps' || r.action.kind === 'keep_aura') return false;
    if (noMove && !noMove(r)) return false;
    return true;
  });
  if (raidPick) return raidPick;
  const kickPick = firstFiring(combatList, snap, (r) => {
    if (r.action.kind !== 'spell') return false;
    if (noMove && !noMove(r)) return false;
    return r.conditions.some(
      (c) => c.metric === 'castingPresent' && c.subject === 'target' && c.op === '==' && c.value === 1,
    );
  });
  if (kickPick) return kickPick;
  const isDispelRule = (r: RotationRule): boolean =>
    r.action.kind === 'spell'
    && r.conditions.some((c) => c.metric === 'dispellablePresent');
  const dispelPick = firstFiring(combatList, snap, (r) => {
    if (!isDispelRule(r)) return false;
    if (noMove && !noMove(r)) return false;
    return true;
  }) ?? firstFiring(rot.phases.recovery, snap, (r) => {
    if (!isDispelRule(r)) return false;
    if (noMove && !noMove(r)) return false;
    return true;
  });
  if (dispelPick) return dispelPick;
  // Party off-heal (healer dead or dry) before recovery self-heals. Recovery is own-HP
  // gated, so a topped hybrid never mended the tank. Cite: invent.ts HEALER_DRY_POWER_PCT.
  const offHealPick = firstFiring(combatList, snap, (r) => {
    if (r.action.kind !== 'spell') return false;
    if (noMove && !noMove(r)) return false;
    return r.conditions.some((c) => c.metric === 'healerPowerPct');
  });
  if (offHealPick) return offHealPick;
  const recovery = firstFiring(rot.phases.recovery, snap, noMove);
  // halt_dps is a school filter, not a recovery exclusive — fall through so combat can swap.
  if (recovery && recovery.kind !== 'halt_dps') return recovery;

  const pullRules = rot.phases.pull;
  const enabledPull = pullRules.reduce((n, r) => n + (r.enabled ? 1 : 0), 0);
  // Per-unit combat: OOC units stay in pull (Charge) even if the session clock is old.
  // Absent inCombat → legacy snapshots keep the combatTimeMs window only.
  const inOpener = snap.inCombat === false || snap.combatTimeMs < pullWindowMs(enabledPull);
  // A pull needs a live target. OOC (target null) the opener re-armed every idle tick
  // (pull-spent clears), so pull Battle Stance vs combat Defensive Stance danced forever.
  if (inOpener && enabledPull > 0 && snap.target != null) {
    const step = pullSequenceAction(pullRules, snap);
    if (step.kind === 'fire') return step.action;
    // Wait out GCD/range for the next opener spell — don't let combat steal the GCD.
    if (step.kind === 'wait') return null;
    // done → fall through to combat inside the window
  }
  // After-cast follow-up: the "then cast this" chain, one step per GCD, still under recovery. A step
  // whose OWN gate is false is SKIPPED, so "then Rejuvenation if it has under 2s left" hands the GCD
  // to the next step instead of stalling the chain.
  for (const step of snap.followUpChain ?? []) {
    const follow = step.spellId | 0;
    if (!(follow > 0) || !snap.usableSpell(follow)) continue;
    if (snap.target?.immuneSpellIds?.has(follow)) continue;
    if (step.conditions?.length && !conditionsPass(snap, step.conditions)) continue;
    // A follow-up a `before` clause armed IS that rule's action, so it still owes the rule's own
    // after-cast. Only a before-owning rule re-attaches, or two rows could arm each other forever.
    const owner = combatList.find((r) => r.enabled && r.before?.spellId
      && r.action.kind === 'spell' && r.action.spellId === follow);
    const ownerAfter = owner ? ruleAfterOf(owner) : undefined;
    return { kind: 'spell', spellId: follow, ...(ownerAfter ? { after: ownerAfter } : {}) };
  }
  return firstFiring(combatList, snap, noMove);
}

/** Choose an out-of-combat action (buff / conjure / summon / feed), or null when nothing applies. */
export function chooseOocAction(rot: Rotation, snap: RotationSnapshot): RuleAction | null {
  const buffs = firstFiring(rot.phases.buffs, snap, undefined, false);
  if (buffs) return buffs;
  // Mend Pet / Health Funnel live in recovery (combat-first), but the pet is still
  // hurt between pulls. Only pet-subject rules — do not quaff panic CDs OOC.
  return firstFiring(rot.phases.recovery, snap, (r) => r.conditions.some((c) => c.subject === 'pet'), false);
}
