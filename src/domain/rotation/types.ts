// PURE: no DOM/RNG/Date. Rotation condition/config types and pure constants.

import type { TotemSlot } from '../../data/schema.ts';

// ---- Config data model ----------------------------------------------------

// `'ally'` is the most-hurt living friendly matching the condition's own {@link AllyFilter} — the
// same body the row's `{ lowestHp }` aim casts on, so gate and heal read one bar.
export type CondSubject = 'self' | 'target' | 'pet' | 'ally';

// Which friendly `subject: 'ally'` means: every field given must match, empty = the most-hurt one.
// `unit` is a seat id, the identity `stack_on` and raidPlan.mainTank already name.
export interface AllyFilter {
  role?: 'tank' | 'healer' | 'damage';
  notRole?: 'tank' | 'healer' | 'damage';
  /** Player class id (SharedDefines.h CLASS_WARRIOR = 1 … CLASS_DRUID = 11). */
  classId?: number;
  unit?: string;
}

/** True when the filter narrows nothing — the plain "most-hurt ally" every stored row means. */
export function allyFilterIsAny(f: AllyFilter | undefined): boolean {
  return !f || (f.role == null && f.notRole == null && f.classId == null && !f.unit);
}

export type CondMetric =
  | 'alive'         // 1 if the subject exists and is not dead, else 0 (works when subject is absent)
  | 'healthPct'     // 0..100
  | 'powerPct'      // 0..100 (mana/rage/focus/energy, whatever the subject uses)
  // 0..100 of the MANA bar specifically. A shifted druid's powerPct is energy or rage, so every
  // mana gate on a feral read the wrong bar. No mana pool -> null, and the condition is false.
  | 'manaPct'
  | 'level'
  | 'buffPresent'   // 1 if `ref` (a spellId) is an active buff on the subject, else 0
  | 'debuffPresent' // 1 if `ref` (a spellId) is an active debuff on the subject, else 0
  | 'itemCount'     // count of `ref` (an itemEntry) carried in bags (subject ignored)
  | 'itemEquipped'  // 1 if `ref` is on the paperdoll, else 0 (subject ignored)
  | 'petHappiness'  // pet only, 0..100
  | 'combatTimeMs'  // ms since THIS unit entered combat (0 if OOC)
  | 'inCombat'      // 1 if THIS unit is in combat, else 0 (not party-wide)
  | 'comboPoints'   // 0..5 combo points the subject currently has (rogue/feral; 0 if none)
  // Ms to 0 health at the rate THIS fight has shown: combatTimeMs * healthPct / (100 - healthPct).
  // Unknown under {@link TIME_TO_DIE_MIN_SAMPLE_MS} of sample or on an untouched subject.
  | 'timeToDieMs'
  | 'enemyCount'    // living enemies in the fight (subject ignored; Wave 1B multi-target)
  | 'formId'        // active shapeshift form / stance id (0 = humanoid; Wave 1A)
  | 'totemPresent'  // 1 if `ref` is an occupied totem slot index (0=fire…3=air), else 0 (Wave 1D)
  /** 1 if hand has TEMP enchant: ref 0=MH, 1=OH, 2=all eligible weapon hands coated (open-hand gate). */
  | 'weaponImbuePresent'
  | 'castingPresent' // 1 while the subject has a cast in flight (interrupt gates), else 0
  | 'castingSchool'  // school index of the in-flight cast (0=physical…6=arcane); no cast → condition false
  | 'castingIsHeal'  // 1 if the in-flight cast is a heal, 0 if damage/other; no cast → condition false
  // spellId of the in-flight cast, for "kick THIS one". castingPresent is a boolean, so every
  // named-cast row in the six guides was the same row. No cast reads null, so the condition fails.
  | 'castingSpellId'
  // How many landings of ref's diminishing group the subject has taken in the 15 s window: 0 full,
  // 1 half, 2 a quarter, 3 immune. Against a creature a player-only group stays 0 forever.
  | 'drLevel'
  | 'buffStacks'     // stack count of buff `ref` on the subject (0 when absent; 1 when unstacked)
  | 'debuffStacks'   // stack count of debuff `ref` on the subject (0 when absent; Sunder x5)
  // Ms left on buff `ref`: 0 when absent, Infinity while permanent. One condition says "not on us
  // OR about to fall off", which two ANDed rows cannot — a HoT refresh needs both halves.
  | 'buffRemainingMs'
  /** Ms left on debuff `ref`, 0 when absent, Infinity while permanent. The DoT-clip half. */
  | 'debuffRemainingMs'
  // 1 when the subject can pay for spell `ref` right now, else 0. Cat/Bear Form cost 55% of BASE
  // mana (spells.json costPct 55), which no percentage of the CURRENT bar stands in for.
  | 'canAfford'
  | 'dodgedRecently' // 1 within 5s of the subject dodging a melee swing (Overpower gate), else 0
  // 1 when the subject's creatureType bit is set in condition `ref`, the SpellEntry mask. Gates
  // Exorcism, Holy Wrath and Turn Evil on Undead or Demon. An absent creatureType reads 0.
  | 'creatureTypeMask'
  /** 1 within 5s of the subject dodge/parry/block (Revenge react gate), else 0. */
  | 'defenseReactRecently'
  /** 1 within 5s of a HUNTER's own parry (Counterattack gate), else 0. */
  | 'hunterParryRecently'
  // 1 while the subject is in the melee band of the ACTING unit (≤ reach + park slack). self = you are in
  // the pile (any hostile). target = THIS enemy is on you. Absent → 0.
  | 'inMelee'
  // 1 when the subject is under an active charm or possess side-switch, 0 when free or absent.
  // Distinct from hard CC: a charmed unit still acts, against its former friends.
  | 'charmed'
  // ---- BG / PvP vocabulary (W10) ------------------------------------------------------------
  // Each is a pure read off a snapshot the BG layer fills. 1 while the subject carries a BG flag.
  | 'hasFlag'
  /** 1 if any living FRIENDLY (incl. self) carries a flag. Subject ignored. */
  | 'allyHasFlag'
  /** 1 if any living enemy carries a flag. Subject ignored. */
  | 'enemyHasFlag'
  /** 1 if the subject is the enemy flag carrier — the focus-fire target. */
  | 'isFlagCarrier'
  /** 1 if the subject's group role is healer. Kill the healer first. */
  | 'isHealer'
  /** 1 if the subject is a caster (interrupt / LoS / gap-close gates). */
  | 'isCaster'
  /** 1 if the subject's classId is CLASS_HUNTER (3). Jeklik Charge bait. */
  | 'isHunter'
  // The subject's player class id (SharedDefines.h CLASS_*: 1 warrior … 11 druid), 0 for a creature.
  // The "vs who" gate: which poison, which pet, which totem, which form. isCaster/isHealer answer
  // the archetype; only this separates a warlock from a mage.
  | 'classId'
  // Living enemies within `ref` yards of an anchor, default 10. For self it is planar yards from the
  // acting unit, a PBAoE or cleave; for target it is from the focus, a ground rain's drop point.
  | 'enemiesWithinYd'
  /** Living friendlies within `ref` yards of the acting unit (ref default 10). Subject ignored. */
  | 'alliesWithinYd'
  /** Living FRIENDLY healers within `ref` yards (ref default 30). Gates disengage. */
  | 'healersWithinYd'
  /** Living ENEMY healers within `ref` yards (ref default 30). Gates focus-fire. */
  | 'enemyHealersWithinYd'
  /** 1 while the subject is rooted (MECHANIC_ROOT). Gates the trinket / FAP row. */
  | 'rooted'
  /** 1 while the subject is feared (MECHANIC_FEAR). */
  | 'feared'
  /** 1 while the subject is stunned (MECHANIC_STUN). */
  | 'stunned'
  /** 1 while the subject is snared (MECHANIC_SNARE — a hostile speed aura). */
  | 'snared'
  /** 1 while the subject is silenced (UNIT_FLAG_SILENCED). Cite: Spell.cpp:6049-6050. */
  | 'silenced'
  /** 1 while the subject is under ANY of rooted/feared/stunned/snared. The one-row CC gate. */
  | 'controlled'
  // 1 while a living enemy has a cast in flight AND its threat victim is a friendly other than the
  // acting unit. Reads 0 solo and 0 when the enemy swings at us, so no PvE decision moves.
  | 'enemyCastingOnAlly'
  // 1 while a living enemy is casting at the acting unit. Cite: Unit.cpp:6894-6916 SelectMagnetTarget.
  | 'enemyCastingOnSelf'
  /** 1 if the acting unit's objective (flag / node) is contested right now. Subject ignored. */
  | 'objectiveContested'
  /** 1 if the acting unit's nearest objective is owned by its own team. Subject ignored. */
  | 'objectiveOwnedByUs'
  /** Yards to the acting unit's current objective. Absent → condition is false. */
  | 'objectiveDistanceYd'
  // ---- Group metrics (S1, GROUPING-PLAN) — subject ignored, they describe the acting unit's group view.
  | 'allyLowestHpPct'   // lowest health % among living friendlies incl. self (healer triage gate); solo = own health %
  // 1 if the lowest-HP living friendly — the unit the engine heals for party triage — has buff
  // `ref`. Solo means self buffs. Gates pure HoTs so Renew is not recast every GCD into OOM.
  | 'allyLowestBuffPresent'
  // Count of living friendlies (incl. self) with healthPct < `ref` (ref defaults to 75 when omitted/0).
  // Gate multi-heals: e.g. `alliesBelowHpCount >= 2` + ref 80 → two under 80%.
  | 'alliesBelowHpCount'
  // Living friendlies within `ref` yards, default 30, that are also under the triage band. Missing
  // geometry treats everyone as in range, so a headless run still gets Chain Heal when two are hurt.
  | 'nearbyAlliesBelowHpCount'
  // Power % of the party's HEALER seat, the lowest when there are several and 0 for a dead one. The
  // off-heal gate: a hybrid heals when the healer is dead or dry. Solo is absent, so it never fires.
  | 'healerPowerPct'
  // Party SEATS on the acting unit's side, the unit itself included: 1 solo, 5 a full five-man. Seats,
  // not living bodies, so a wipe in progress never reads as solo. Absent -> 1. The healer damage gate.
  | 'partySeats'
  | 'hasAggro'          // 1 if ANY living enemy's threat victim is the acting unit (DPS throttle), else 0
  // 1 if ANY living enemy's GetVictim / threat victim is a living ally OTHER than the acting unit.
  // Arena peel Blind: the trainer on the healer, not self. Cite: PlayerbotRogueAI.cpp:208-219.
  | 'allyHasAggro'
  // 1 if the unit the current target is attacking — the tank — has debuff `ref`. The tank-swap gate:
  // the off-tank taunts when the main tank has Shadow of Ebonroc or Mortal Wound.
  | 'aggroHolderDebuffPresent'
  // Stacks of debuff `ref` on the unit the current target is attacking, 0 when absent. The stacking
  // tank swap: the off-tank taunts at N, not at the first application.
  | 'aggroHolderDebuffStacks'
  // 1 if any living friendly, including self, holds aura `ref`. The Raid tab's "who has it: anyone".
  // Subject ignored, and an absent snapshot reads 0.
  | 'allyAuraPresent'
  // Max stacks of aura `ref` on any living friendly (0 absent, 1 present-unstacked). The stacking half of
  // allyAuraPresent, same pair as aggroHolderDebuffPresent/Stacks.
  | 'allyAuraStacks'
  | 'targetAttackingMe' // 1 if the CURRENT TARGET's threat victim is the acting unit (tank taunt gate), else 0
  // Living hostiles that are currently charmed, typically a possessed ally. A rotation may burn, CC
  // the body or ignore it. A player's own Mind Control does not raise this.
  | 'charmedHostileCount'
  // Living melee friendlies in the party: non-healer units currently in melee attack mode. Gates
  // group buffs that only pay off with melee beneficiaries, such as Windfury Totem.
  | 'meleeAllyCount'
  // Dead friendlies in the party — corpses eligible for a resurrection. Subject ignored, and absent
  // or solo reads 0 so a rez keep-up never thrash-casts for 75–90% base mana with nothing dead.
  | 'deadAllyCount'
  // S4C companion knobs (COMBAT-INTERACTION-V2): subject ignored.
  // aoeMode: 0=auto, 1=aoe (prefer multi when enemyCount≥2), 2=single (suppress multi). Absent → 0.
  | 'aoeMode'
  // offHealAllowed: 1 when the companion's off-heal knob is on (hybrid DPS emergency heal), else 0. Absent → 0.
  | 'offHealAllowed'
  // 1 if a dispellable aura of category `ref` is present. Subject self means a debuff on any living
  // friendly; subject target means a buff on the enemy. An absent or OOC snapshot reads 0.
  | 'dispellablePresent'
  // Planar yards to the nearest live HAZARD edge, 0 while inside. A hazard is a lingering pool OR a
  // hostile whose kit carries a ground-shaped spell. Same registry the avoid move reads.
  | 'hazardProximityYd'
  // Planar yards from the acting unit to the current target. Absent / no geometry → false. Gate keep_range
  // so the row stops once the caster is outside the disc.
  | 'targetDistanceYd'
  // Planar yards to the nearest living hostile with creature entry `ref`. Jeklik's Sonic Burst keys
  // on 14517, not the current focus, so a kill order onto a bat cannot walk the caster back in.
  | 'creatureDistanceYd'
  | 'allyWithoutAuraNearYd'
  // ---- Raid plan (E6) — subject ignored; the acting unit's own assignment ----
  // Filled from raidPlan.ts in the BgRole shape; absent reads 0. 1 if the unit is the main tank.
  | 'isMainTank'
  /** 1 if the acting unit is an off-tank in the plan. */
  | 'isOffTank'
  // Raid job code: 0=dps, 1=healer, 2=off-tank, 3=main-tank (`RAID_JOB_CODE`). Gate OT swap rows / MT-only
  // taunts without a second brain.
  | 'myJob'
  /** Camp code: 0=unassigned, 1=a, 2=b, … (`raidCampCode`). */
  | 'myCamp'
  // Subgroup this healer is assigned to heal. Non-healers / unassigned → condition false. Compare with `==`
  // to a subgroup index (0..7 on a 40-man).
  | 'assignedHealSubgroup'
  // 1 while the acting unit stands inside the CURRENT TARGET's frontal arc, the default 60-degree
  // cone. It goes false the moment you are behind, so a get-out row stops eating the GCD.
  | 'inTargetCone'
  // soul shards are real items (SOUL_SHARD_ITEM = 6265). Use the existing 'itemCount' metric with that ref.
export type CondOp = '<' | '<=' | '>' | '>=' | '==' | '!=';

/** One guard on a rule. All conditions on a rule are ANDed. `ref` is a DB id (spell/item), never a name. */
export interface Condition {
  subject: CondSubject;
  metric: CondMetric;
  op: CondOp;
  value: number;
  ref?: number;
  /** Which friendly `subject: 'ally'` means. Ignored on every other subject. */
  ally?: AllyFilter;
  // How this condition joins the one above it. Absent = AND (every stored rotation ever written).
  // `'or'` STARTS A NEW GROUP, so the list reads as OR-of-AND runs: `A and B or C` is
  // `(A and B) or (C)`. Ignored on the first condition. See {@link conditionsPass}.
  join?: CondJoin;
}

/** Join between two conditions in a rule's list. Absent reads `'and'`. */
export type CondJoin = 'and' | 'or';

// Who an item rule should apply to when it fires. Omitted / `'self'` = the acting player (backward
// compatible with stored rotations).
export type ItemRuleTarget = 'self' | 'lowest_ally' | 'pet';

/** Which weapon hand an imbue item (sharpening stone / oil / poison) coats. */
export type ItemRuleHand = 'mainhand' | 'offhand';

// Which enemy a spell rule fires at: `focus` is the current target, `other` a living hostile that is
// neither the focus nor already controlled, and the object forms name an entry, role or kill order.
export type RuleSpellTarget =
  | 'focus'
  | 'other'
  | { creatureEntry: number }
  | { role: 'tank' | 'healer' | 'damage' }
  | { priority: readonly number[] }
  // The nearest living friendly OTHER than the caster who does not hold aura `allyMissingAura`. A
  // single-target buff otherwise routes to the caster, so every companion rebuffed only itself.
  // `among` narrows the pool the same way `{ lowestHp }` does: the PallyPower board hands out one
  // family per target CLASS, and a class-blind row blessed whoever it reached instead.
  | { allyMissingAura: number; among?: AllyFilter }
  // The lowest-HP living friendly (heal triage), stamped at evaluate when the row gates on
  // allyLowestHpPct / allyLowestBuffPresent / an `ally` subject. `among` is that gate's filter.
  | { lowestHp: true; among?: AllyFilter };

// Mechanic move vocabulary (PLAN §7.5 / AUTOPILOT P3). Authored in the rotation editor — no second hidden
// brain. Yards come from the caller (baked explosion radius, formation reach).
export type RuleMove =
  | { kind: 'spread'; minYd: number }
  | { kind: 'flee_raid'; yd: number }
  | { kind: 'stack_on'; role: 'tank' | 'healer' | 'damage' }
  | { kind: 'stack_on'; unit: string }
  // The one move whose distance scales with the mover's CURRENT range, so a ranged raider 30 yd out
  // walks about 60 and the run-out yields first. Every other move here is bounded by a radius.
  | { kind: 'behind_target' }
  // Perpendicular to what the target FACES, at our own current radius. "Behind" only clears a front
  // cone, and a boss with a rear cone as well leaves the flank as the only clear ground.
  | { kind: 'flank_target' }
  | { kind: 'move_to'; x: number; y: number; z?: number }
  | { kind: 'avoid_zone'; id: string }
  // Walk away from the current focus until the gap exceeds minYd. A 20 yd radius hits at <=, so
  // 20.5 is the first safe yard. Melee never pick this row.
  | { kind: 'keep_range'; minYd: number; entry?: number }
  // Two camps keyed on who holds `aura`: back off every ally who does NOT hold it until they are
  // awayYd clear, then close on the ones who do. The charge's own payload radius is the number.
  | { kind: 'split_by_aura'; aura: number; awayYd: number };

export type RuleAction =
  | { kind: 'spell'; spellId: number; target?: RuleSpellTarget; after?: RuleAfter }
  // `family` makes the row a RANK LADDER instead of one entry, resolved to the best rank in the bags
  // at use time. `itemEntry` is the display rung, and a family row carries no itemCount gate.
  | {
    kind: 'item'; itemEntry: number; family?: string; target?: ItemRuleTarget;
    hand?: ItemRuleHand; after?: RuleAfter;
  }
  // One of the player's macros, COMPILED to spell and item rules where the rotation is handed to
  // combat. The evaluator never sees this variant, so an uncompiled macro rule cannot fire.
  | { kind: 'macro'; macroId: string }
  // Walk for a mechanic — a bomb run-out, a spread, a stack, a pool to avoid. Executed at the TOP of
  // advanceGapClose so engage and leash cannot drag the runner back into the raid.
  | { kind: 'move'; move: RuleMove }
  // Stop casting damage this tick. `school` is 'all', one School, or a set. `entries` scopes it to
  // those bodies, so a both-up phase can halt on the invulnerable one only. Absent means every body.
  | { kind: 'halt_dps'; school?: HaltDpsSchool; entries?: readonly number[] }
  // Never auto-remove this aura. A filter like halt_dps; pickAction skips it in dispellableAurasOn. Cite:
  // raidCustomRows.ts response `keep`.
  | { kind: 'keep_aura'; spellId: number }
  // Raid-wide kill order: DPS focus the first living entry in `entries`. A filter like halt_dps, not
  // a GCD winner. A NEGATIVE entry means "any living hostile that is not this one".
  | { kind: 'kill_order'; entries: readonly number[] }
  // Click a GameObject by entry, usable while it is in the session's bag. `goEntries` is the SET one
  // row may press, resolved per tick to whichever is usable — Thermaplugg lights one of six.
  | { kind: 'use_object'; goEntry: number; goEntries?: readonly number[] };

/** Armed halt: every damaging school, one school, or a set (Chromaggus four-plus-holy). */
export type HaltDpsSchool = 'all' | string | readonly string[];

// One "then cast" step. `conditions` gate THIS step only, read as the OR-of-AND runs a rule's list is
// ({@link conditionsPass}); a step whose gate is false is SKIPPED, so the chain moves on to the next.
export interface RuleAfterStep {
  spellId: number;
  conditions?: Condition[];
}

// After this rule's cast lands: step back N yards from the focus, and/or walk a chain of follow-up
// casts, one per GCD. Authored on the rule — the auto-battler, not a side brain. Read through
// `ruleAfterChain`, never field by field: `spellId` is the pre-chain single follow-up and folds into
// step 1. 0 / omitted = off.
export interface RuleAfter {
  stepBackYd?: number;
  /** Legacy single follow-up, kept so every stored rotation still runs. */
  spellId?: number;
  /** The chain, in cast order. Capped at RULE_AFTER_STEPS_MAX. */
  steps?: RuleAfterStep[];
}

// Before this rule's action: spend one GCD on `spellId` first, then the action itself on the next.
// Skipped when the prep spell is unusable or its aura / form is already up, so a satisfied prep
// never eats the GCD. Authored on the rule, like `after`.
export interface RuleBefore {
  spellId: number;
}

export interface RotationRule {
  id: string;
  action: RuleAction;
  /** ANDed by default; a condition carrying `join: 'or'` starts a new OR group ({@link conditionsPass}). */
  conditions: Condition[];
  enabled: boolean;
  /** After-cast: step back and/or queue a follow-up spell. */
  after?: RuleAfter;
  /** Pre-cast: fire this spell on the GCD before the action. */
  before?: RuleBefore;
}

// `prebuff` is the only BUTTON-DRIVEN phase: nothing in the automatic loop reads it. The in-dungeon
// order walks it across the party at real mana cost. `buffs` stays the automatic keep-up pass.
export type RotationPhase = 'prebuff' | 'buffs' | 'pull' | 'combat' | 'recovery';
export const ROTATION_PHASES: readonly RotationPhase[] = ['prebuff', 'buffs', 'pull', 'combat', 'recovery'];
// Phases a stored rotation MUST have to be readable. `prebuff` is deliberately absent: adding it
// would fail validation on every save ever written and silently wipe hand-edited rotations.
export const REQUIRED_ROTATION_PHASES: readonly RotationPhase[] = ['buffs', 'pull', 'combat', 'recovery'];

// Signature an auto-generated default was built for, present only on generated rotations. An
// untouched default rebuilds when it drifts. A legacy save has none, so it refreshes once.
export interface RotationAutoSig {
  /** Primary talent tree / spec override the bands were picked for. */
  spec: string;
  /** Character level (bands + reqLevel gating change with it). */
  level: number;
  /** Count of known spells (rises when a new ability like Bear Form is trained). */
  spells: number;
  // Companion squad role the default was built for. Absent on player rotations and on older
  // companion saves. When the live role drifts, the default rebuilds; custom edits never do.
  role?: string;
  // The ROTATION_PACK_REV this default was generated at; absent reads 0 and refreshes once. The
  // other fields all describe the CHARACTER, so a pack change was invisible to them.
  packRev?: number;
  // `'pvp'` when this list was built off a `"mode": "pvp"` band (duel / BG / arena). Absent = the PvE
  // ladder. Carried so a stored PvE list is drift the moment a pvp one is wanted.
  mode?: 'pvp';
  /** The pvp band VARIANT this list was built off (rotationSuggestions selectBand). */
  variant?: string;
}

// Which rotation slot a list fills. A tank / healer keeps its role list as `primary` and an optional second
// `dps` list built on the class DPS band; a DPS spec only ever has `primary`.
export type RotationProfileId = 'primary' | 'dps';

export interface Rotation {
  version: 1;
  cls: number; // the class this rotation was generated for (so we can regenerate on mismatch)
  phases: Record<RotationPhase, RotationRule[]>;
  /** Slot this list fills. Absent = 'primary' (every save written before the DPS profile). */
  profile?: RotationProfileId;
  /** Optional per-creature-entry combat overrides (replaces the base combat list for that mob). */
  overrides?: Record<number, RotationRule[]>;
  /** Signature this default was generated for (untouched auto rotations only). */
  autoSig?: RotationAutoSig;
  /** True once the player edits it in the visual editor — suppresses silent auto-refresh. */
  custom?: boolean;
  // Yards to hold from the focus in auto-combat. 0 / omitted = derive (ranged 20–30, melee 5). Set 5 for a
  // melee Arcane Explosion mage; 25 to park a caster.
  standYards?: number;
  // COMPOSED ONLY, never saved: the Raid tab's two knobs, carried to the per-focus prepend inside
  // withEncounterRows. Reading a save back strips both off.
  raidRowsOff?: readonly string[];
  raidRowYd?: Readonly<Record<string, number>>;
}

// ---- The snapshot the evaluator reasons over ------------------------------
// Plain data assembled by the caller from the live session and character, which keeps it pure.

export interface SubjectState {
  alive: boolean;
  healthPct: number; // 0..100
  powerPct: number;  // 0..100
  // 0..100 of the parallel MANA bar (CombatantView.mana/maxMana), for a unit whose ACTIVE power is
  // not mana — a shifted druid. Absent when there is no mana pool, and `manaPct` then reads null.
  manaPct?: number;
  level: number;
  buffs: ReadonlySet<number>;   // active buff spellIds on this subject
  debuffs: ReadonlySet<number>; // active debuff spellIds on this subject
  happiness?: number;           // pet only (0..100)
  comboPoints?: number;         // 0..5 (player only; absent => 0)
  // Diminishing step per group, indexed by DIMINISHING_GROUP_ORDER: 0 is full duration and 3 is
  // immune. Absent or short reads 0, which is what an untouched group and an expired window mean.
  drSteps?: readonly number[];
  // Active shapeshift form or warrior stance id; 0 or absent is humanoid. Prefer this over
  // buffPresent for form enter and in-form gates.
  formId?: number;
  // The subject's in-flight cast, for interrupt gates: `school` is a SpellSchools index with -1
  // unknown, and `isHeal` says whether it is a heal. Null or absent means not casting.
  casting?: { school: number; isHeal: boolean; spellId?: number } | null;
  // Stack counts for stacked auras (spellId → stacks ≥ 2, e.g. Sunder Armor x5). A spellId present in
  // buffs/debuffs but absent here counts as 1 stack.
  buffStacks?: ReadonlyMap<number, number>;
  debuffStacks?: ReadonlyMap<number, number>;
  // Ms left per aura id; a missing entry is permanent (Infinity). Built in the same walk the id set
  // is, and only once an aura carries a finite remainingMs, so a fight of permanents allocates none.
  buffRemainingMs?: ReadonlyMap<number, number>;
  debuffRemainingMs?: ReadonlyMap<number, number>;
  /** Spell ids this subject can pay for right now. Absent → `canAfford` reads null (false). */
  affordableSpellIds?: ReadonlySet<number>;
  /** True within 5s of this subject DODGING a melee swing (Overpower-style gates). */
  dodgedRecently?: boolean;
  // CMaNGOS CreatureType id (1 Beast … 6 Undead … 7 Humanoid). Used by `creatureTypeMask` gates (Exorcism /
  // Holy Wrath). Absent → mask match fails.
  creatureType?: number;
  // True within 5s of this subject dodging, parrying, or blocking a melee swing (Revenge / defense-react
  // gates). Distinct from {@link dodgedRecently} (dodge only).
  defenseReactRecently?: boolean;
  // True within 5s of a hunter's own parry (AURA_STATE_HUNTER_PARRY, Counterattack's gate). A hunter's
  // dodge sets defenseReactRecently instead, so the two never overlap.
  hunterParryRecently?: boolean;
  // True while in the melee band of the acting unit (self = any hostile; target = pairwise). Absent →
  // evaluate as 0 (not in melee). Snapshot always fills this when geometry exists.
  inMelee?: boolean;
  // True while this subject is under charm / possess side-switch (acts for the other team). Absent → false.
  // Surface from CombatantView.controlled.control === 'charm'.
  charmed?: boolean;
  // ---- BG / PvP (W10). All optional; absent → the matching condition reads 0. ----
  /** Flag aura this subject carries (23333 Warsong / 23335 Silverwing). Absent → not carrying. */
  carryingFlag?: number;
  /** Group role, for `isHealer`. */
  groupRole?: 'tank' | 'healer' | 'damage';
  /** True when this subject's kit is primarily casts (interrupt / gap-close gates). */
  isCaster?: boolean;
  /** True when classId is CLASS_HUNTER. Cite: SharedDefines.h CLASS_HUNTER = 3. */
  isHunter?: boolean;
  /** Player class id, 0 for a creature. Cite: SharedDefines.h CLASS_WARRIOR = 1 … CLASS_DRUID = 11. */
  classId?: number;
  // Live crowd control on this subject, by mechanic. These are what gate a trinket or Free Action Potion
  // row — a rotation cannot decide to break CC it cannot see.
  rooted?: boolean;
  feared?: boolean;
  stunned?: boolean;
  snared?: boolean;
  /** UNIT_FLAG_SILENCED. Cite: Spell.cpp:6049-6050 CheckCast SPELL_FAILED_SILENCED. */
  silenced?: boolean;
  // Spell ids whose hostile aura CANNOT land on this subject. debuffPresent reads these as already
  // present, so a keep-up gated on the aura's absence is not unsatisfiable. Absent means no immunity.
  immuneAuraSpellIds?: ReadonlySet<number>;
  // Offensive spell ids that will fully fail on this subject, so a GCD is not spent into Divine
  // Shield or a school-immune mob. Heals are not listed. Cite: Unit.cpp IsImmuneToSpell ~7329.
  immuneSpellIds?: ReadonlySet<number>;
}

export interface RotationSnapshot {
  self: SubjectState;
  target: SubjectState | null; // null out of combat / no target
  pet: SubjectState | null;    // null until the character has a living pet
  combatTimeMs: number;
  // The session clock (ctx.t). `combatTimeMs` is 0 while this unit is OOC, so a cadence read off it
  // stalls on a seat nobody has hit yet (arenaPace.ts). Absent on fixture snapshots.
  sessionMs?: number;
  // This unit's UNIT_FLAG_IN_COMBAT. Absent (legacy snapshots) → opener uses combatTimeMs only. False =
  // still OOC: stay in the pull sequence (Charge) even if the session clock is old.
  inCombat?: boolean;
  /** Living enemies remaining in the session (1 in pure 1v1; 0 OOC). Wave 1B. */
  enemyCount: number;
  // Planar yards from the acting unit to each living combat enemy (geometry sessions). `enemiesWithinYd`
  // subject self — PBAoE pack density at the caster. Absent → degrades to `enemyCount` (no geometry).
  enemyDists?: readonly number[];
  // Planar yards from the current focus to each living enemy, the focus itself at 0. Feeds
  // enemiesWithinYd with subject target — ground-rain density at the cast point.
  enemyDistsFromTarget?: readonly number[];
  // Self-centred hard-control AoE ids with no body in their disc the control can hold. The rule is
  // unsatisfiable, and the authored step-back would walk the caster out of range for nothing.
  unholdableAoeCcSpellIds?: ReadonlySet<number>;
  /** True when any living hostile holds an interruptible bar (not only the kill focus). */
  kickableCastPresent?: boolean;
  // False only on a dungeon pull the bake measured under a WMO roof; ABSENT MEANS OUTDOORS, matching
  // TerrainInfo::IsOutdoors. Read to refuse outdoors-only spells before the GCD is spent.
  outdoors?: boolean;
  // Occupied shaman totem element slots (fight-scoped). Empty OOC / no totems. Wave 1D — gate summons with
  // `totemPresent == 0` + slot index ref, not only summon spell id.
  totemSlots: ReadonlySet<TotemSlot>;
  // Hands with an active temporary weapon enchant (imbue / poison). ref 0 = mainhand, 1 = offhand. Gate
  // with `weaponImbuePresent == 0`. Absent → treat as empty (tests / legacy snapshots).
  weaponImbueHands?: ReadonlySet<'mainhand' | 'offhand'>;
  // Eligible weapon hands (not shield) still missing a TEMP coat. ref 2 on weaponImbuePresent: 1 when this
  // set is empty (fully coated), else 0. Absent → degrade to MH-only via weaponImbueHands.
  weaponImbueOpenHands?: ReadonlySet<'mainhand' | 'offhand'>;
  itemCounts: ReadonlyMap<number, number>; // itemEntry -> count in bags
  /** Paperdoll entries. `itemEquipped` reads this; absent → 0. Cite: buildCombatant equippedItemEntries. */
  equippedItemEntries?: ReadonlySet<number>;
  // Group metrics, all optional. allyLowestHpPct is the lowest health % among living friendlies
  // INCLUDING the actor, falling back to self when absent; the boolean pair is false when absent.
  allyLowestHpPct?: number;
  // Active buff spell ids on the lowest-HP living friendly (heal triage target). Used by
  // `allyLowestBuffPresent`. Absent → degrade to self.buffs.
  allyTriageBuffs?: ReadonlySet<number>;
  // The body behind `subject: 'ally'`, so every SUBJECT metric reads a friendly the way it reads the
  // enemy. Lazy like allyAuraStacks: absent, or nobody matching, reads null and the row is off.
  allySubject?: (filter?: AllyFilter) => SubjectState | null;
  /** That same body's seat id, so the CAST lands where the gate read. One resolver, not two. */
  allyAimSide?: (filter?: AllyFilter) => string | null;
  /** Living friendly health percents (incl. self). Used by `alliesBelowHpCount`. */
  allyHpPcts?: readonly number[];
  // Living friendlies near the actor: hp% + planar yards (null dist = treat as in range). Used by
  // `nearbyAlliesBelowHpCount`.
  allyDistHp?: ReadonlyArray<{ hpPct: number; distYd: number | null; isHealer?: boolean }>;
  /** Planar yards to living enemy healers (groupRole healer). Absent → enemyHealersWithinYd is 0. */
  enemyHealerDists?: readonly number[];
  // Power % of every OTHER healer seat on this side, dead seats at 0, and [0] when the group has no
  // healer. Absent or empty makes that condition false — solo, or the group's own healer asking.
  healerPowerPcts?: readonly number[];
  // Party seats incl. the acting unit (1 = solo). Absent reads 1, so an unfilled snapshot keeps the
  // solo behaviour. Cite: pickAction.ts healerSeatsOf `groupSeats`.
  partySeats?: number;
  hasAggro?: boolean;
  // True while a living enemy is swinging at a living ally other than the acting unit. Absent → 0.
  // Cite: PlayerbotRogueAI.cpp:208-219 FindAttacker(AIT_VICTIMSELF) Blind, party form.
  allyHasAggro?: boolean;
  targetAttackingMe?: boolean;
  /** Debuff spell ids on the current target's threat victim. Absent → aggroHolderDebuffPresent is 0. */
  aggroHolderDebuffs?: ReadonlySet<number>;
  /** Stack counts for those, when above 1. A present-but-unstacked aura reads 1. */
  aggroHolderDebuffStacks?: ReadonlyMap<number, number>;
  // Max stacks of `aura` on any living friendly (0 absent). Lazy like allyWithoutAuraNearYd: a closure
  // until an `anyone` row asks. Cite: raidCustomRows RaidTriggerOn 'anyone'.
  allyAuraStacks?: (aura: number) => number;
  // Count of living charmed hostiles (possessed allies). Absent → 0. See CondMetric `charmedHostileCount`.
  charmedHostileCount?: number;
  /** Living melee (non-healer, melee-mode) friendlies incl. the acting unit. Absent → 0. */
  meleeAllyCount?: number;
  /** Dead friendlies eligible for party rez. Absent → 0 (see CondMetric deadAllyCount). */
  deadAllyCount?: number;
  // Companion knobs, subject ignored. Optional: aoeMode defaults to 0 auto and offHealAllowed to 0
  // off. Encoding: 0 auto, 1 aoe, 2 single.
  aoeMode?: number;
  offHealAllowed?: number;
  // Dispel gates computed by the engine's ally snapshot: one set for a debuff on any living friendly
  // and one for a buff on the enemy target. Absent makes those conditions false.
  dispellableOnFriendlies?: ReadonlySet<number>;
  dispellableOnTarget?: ReadonlySet<number>;
  // Yards to the nearest ground-pool edge (0 inside). Absent → `hazardProximityYd` is false. Cite:
  // sessionApi.ts groundPools(); AUTOPILOT-PLAN §4 row 3.
  hazardProximityYd?: number;
  // True while a living enemy is casting at a friendly of the acting unit other than itself. Absent
  // reads 0. Cite: pickAction.ts threatOf(e)?.getCurrentVictimId(), the read hasAggro makes.
  enemyCastingOnAlly?: boolean;
  // True while a living enemy is casting at the acting unit. Absent reads 0. Same threat-victim
  // walk as enemyCastingOnAlly; vid === f.side is this flag, not that one.
  enemyCastingOnSelf?: boolean;
  // Yards to the current target. Absent → `targetDistanceYd` is false. Cite: keep_range / Sonic Burst 23918
  // radiusYd 20.
  targetDistanceYd?: number;
  /** Yards to nearest living hostile of entry `ref`. Absent → false. */
  creatureDistanceYd?: (entry: number) => number | null;
  // Yards to the nearest living friendly who does NOT hold `ref`. A camp-split row needs this or it
  // can never stop firing, and the two camps drift back into one ball. Absent reads null.
  allyWithoutAuraNearYd?: (aura: number) => number | null;
  // True when a living friendly other than the acting unit is missing `aura` — the usability gate on
  // an `{ allyMissingAura }` row, shaped like `offTargetSpell`. Absent → the row is unusable.
  // `among` is the row's own filter, so the gate and the aim read one pool.
  allyMissingAura?: (aura: number, among?: AllyFilter) => boolean;
  // True while this unit sits in the current target's frontal arc. Absent (no geometry, no facing target) →
  // `inTargetCone` is false. Cite: combatGeometry isWithinConeYd.
  inTargetCone?: boolean;
  // Living hostile creature_template.entry values this unit can see. Used by `RuleSpellTarget {
  // creatureEntry }` (Mind Control that Worshipper). Absent → entry targets are unusable.
  hostileCreatureEntries?: ReadonlySet<number>;
  // E6 raid plan reads for the acting unit. Absent (solo / legacy) → raid metrics read 0. Codes match
  // `RAID_JOB_CODE` / `raidCampCode` in `src/domain/raid/raidPlan.ts`.
  isMainTank?: boolean;
  isOffTank?: boolean;
  myJob?: number;
  myCamp?: number;
  /** Healer's assigned subgroup; absent → `assignedHealSubgroup` condition is false. */
  assignedHealSubgroup?: number;
  // Battleground view, filled by the BG layer. Absent means every BG condition reads 0, so a PvE
  // rotation is unaffected. Distances are planar yards, and enemies are only those we perceive.
  bg?: {
    /** Living friendlies (excl. self) with distance and role. */
    allyUnits: ReadonlyArray<{ distYd: number; isHealer: boolean; carryingFlag?: number }>;
    /** Living, PERCEIVED enemies with distance and role. */
    enemyUnits: ReadonlyArray<{ distYd: number; isHealer: boolean; carryingFlag?: number }>;
    /** Is the acting unit's nearest objective contested? */
    objectiveContested?: boolean;
    /** Is it owned by the acting unit's team? */
    objectiveOwnedByUs?: boolean;
    /** Yards from the acting unit to that objective. */
    objectiveDistYd?: number;
  };
  // True when `ids` already hold `ref` or a same-or-stronger rank / stack sibling. Absent → exact
  // id. Cite: Unit.cpp:5013-5015; keepUpAlreadyPresent.
  auraCovered?: (ids: ReadonlySet<number>, ref: number) => boolean;
  /** Is the spell castable right now (off GCD/cooldown, affordable, learned)? */
  // "Does the body this lands on already carry what I am applying?" — periodic damage on the
  // focus, a periodic heal on the selected friendly or the caster. Cite: Spell.cpp:2298-2306.
  periodicAlreadyOnAimedBody?: (spellId: number, triageAim: boolean) => boolean;
  usableSpell: (spellId: number) => boolean;
  // Ready except for the stance: every usableSpell gate but the shapeshift one. A rotation stance
  // row cannot ask "is Disarm ready" while standing in the wrong stance without it.
  usableSpellIgnoringForm?: (spellId: number) => boolean;
  /** Form-enter spell in this unit's kit that reaches `formId`, or null when it knows none. */
  stanceSpellForForm?: (formId: number) => number | null;
  /** Form this spell ENTERS, or null when it is not a form spell. The inverse of the above. */
  formEnteredBySpell?: (spellId: number) => number | null;
  // Creature-entry target: can this spell land on THAT body? usableSpell gates the FOCUS, so a
  // charm-immune boss made Mind Control unusable even where the row aims at an add.
  usableOnCreatureEntry?: (spellId: number, creatureEntry: number) => boolean;
  // For a `target: 'other'` rule: is there a second mob this CC could land on? Without it the rule
  // wins the tick and the ENGINE refuses the cast, and the unit stands still for that GCD.
  offTargetSpell?: (spellId: number) => boolean;
  // The body that same selector picked. A subject-`target` gate on an off-target row must read it,
  // or the row describes the focus, casts at a second mob, and never closes.
  offTargetSubject?: (spellId: number) => SubjectState | null;
  // For a FOCUS-aimed break-on-damage CC: did our own damage already knock the hold off? The party is
  // killing it, so re-applying spends a GCD fighting our own group and the rule must yield.
  ccBrokenOnTarget?: (spellId: number) => boolean;
  /** Is the item usable right now (in bags, off cooldown, in combat)? */
  usableItem: (itemEntry: number) => boolean;
  // Best carried rank of a consumable family, or null when the unit carries none. An absent provider
  // falls back to the row's authored itemEntry, which is the pre-family behaviour.
  bestFamilyEntry?: (family: string) => number | null;
  /** Is this gameobject_template.entry present (and not yet consumed) in the fight? */
  usableObject?: (goEntry: number) => boolean;
  // Spell ids and item entries the player already used this fight, from the combat log. The pull
  // phase treats them as spent so the opener walks the list instead of thrashing the first rule.
  pullSpentSpellIds?: ReadonlySet<number>;
  pullSpentItemEntries?: ReadonlySet<number>;
  // After-cast follow-up chain the previous rule queued, in cast order. chooseCombatAction walks it
  // (after recovery) before the combat list, skipping any step whose own gate is false. Absent /
  // expired → ignored.
  followUpChain?: readonly RuleAfterStep[];
}

// Under this much sample one swing moves the answer, so the metric reads unknown and its rows are off.
export const TIME_TO_DIE_MIN_SAMPLE_MS = 2000;

// Ms to 0 health at the rate this fight has shown, or null when the sample cannot answer. No damage
// model: `combatTimeMs` is the ACTING unit's clock, so a late add errs long, which is the safe side.
export function timeToDieMs(healthPct: number, combatTimeMs: number): number | null {
  if (!(combatTimeMs >= TIME_TO_DIE_MIN_SAMPLE_MS)) return null;
  if (!(healthPct > 0)) return 0;
  const lost = 100 - healthPct;
  if (!(lost > 0)) return null; // untouched: nothing has been measured yet
  return Math.round((combatTimeMs * healthPct) / lost);
}

// Base pull/opener window (ms). Multi-rule openers scale up via {@link pullWindowMs} so Charge → shout →
// sunder can complete before combat steals the GCD.
export const PULL_WINDOW_MS = 2000;

/** Per pull-rule GCD-ish step when sizing the opener window. Classic base GCD = 1500. */
export const PULL_STEP_MS = 1500;

// How long recovery+pull stay ahead of the combat list. One step per enabled pull rule (min {@link
// PULL_WINDOW_MS}) so full openers fit.
export function pullWindowMs(enabledPullRules: number): number {
  if (enabledPullRules <= 0) return 0;
  return Math.max(PULL_WINDOW_MS, enabledPullRules * PULL_STEP_MS);
}

/** Default guard thresholds. Editable later via the visual editor; kept here as the sane preset. */
export const DEFAULT_THRESHOLDS = {
  healLowPct: 50,   // self-heal below this health %
  potionLowPct: 35, // use a healing potion/healthstone below this health % (emergency backup to heals)
  /** Divine Shield / Ice Block / Shield Wall / Last Stand panic CDs (KI-213 / 259 / 375 / 395). */
  emergencyDefensivePct: 35,
  manaRestoreLowPct: 20, // mana gem / Evocation below this mana %
  // A mana potion is only worth its shared category-4 lock (itemUseCooldown.ts) while health is
  // safe. Drunk at 40% health it costs the health potion that would have saved the pull.
  manaRestoreSafeHpPct: 70,
  petHealLowPct: 60,     // Mend Pet below this pet health %
  petFeedHappyPct: 60,   // Feed Pet below this happiness %
  conjureBelow: 5,       // conjure food/water: stock a few stacks for long sessions
  /** Soulstone / Firestone / Spellstone / Healthstone / Blinding Powder / mana gem: hold one. */
  conjureUtilityBelow: 1,
  /** Create Healthstone / Soulstone: stock at most one (carry limit), not a pile of 5. */
  conjureConsumableBelow: 1,
  shootBelowPowerPct: 20, // caster wand Shoot: free ranged filler below this mana %
  /** Execute window for Hammer of Wrath / Execute / Shadowburn / Soul Fire (vanilla tooltip ≤20%). */
  executeHealthPct: 20,
  /** Bloodrage: only when rage is thin — not an unconditional opener (KI-330). */
  bloodrageBelowPowerPct: 30,
  // Self combat cooldowns at or above this length use health gates, or are omitted as keep-ups, and
  // never permanent buff or debuff thrash — Shield Wall, Divine Shield, Recklessness, Last Stand.
  combatCdKeepUpMinMs: 60_000,
  // Damage cooldowns and racials: how far into a fight the burst fires. Policy, not WoW data. A short
  // CD waits out the opener; a long one waits for a fight that lasts, which trash never does.
  burstOpenMs: 3_000,
  burstLongFightMs: 15_000,
  burstLongCdMs: 300_000,
} as const;
