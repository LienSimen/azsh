// Combat session context bag: createSession's mutable state plus the hub function slots, so leaf and
// hub peels take (ctx, …) instead of closing over locals. Extracted modules must not import combat.ts.

import type { Rng } from '../core/rng.ts';
import type { CombatEvent, Side, TotemSide, EnemySide, HitResult } from '../core/events.ts';
import type { CombatantId } from './threat.ts';
import type { ThreatManager } from './threat.ts';
import type { ControlKind, Mechanic, School, ShapeshiftFormId, SpellDef } from '../../data/schema.ts';
import type { CreatureCastSlot, CreatureEventAiState } from '../../domain/creature/creatureAi.ts';
import type { ScriptDevRuntimeState } from '../../domain/scriptdev/index.ts';
import type { GroundPool } from '../game/dynamicObject.ts';
import type { Hazard } from './hazards.ts';
import type { CombatPosYd, SummonWorldPoint } from './combatGeometry.ts';
import type {
  ActiveEffect,
  AllyActionProvider,
  CombatConfig,
  CombatItem,
  CombatantView,
  Fighter,
} from './types.ts';
import type { QueuedCast } from './session-types.ts';
import type { EventAiIntent } from '../../domain/creature/creatureAi.ts';
import type { AreaAuraSource } from './areaAura.ts';
import type { MotionClaims, MotionOwner } from './motionClaim.ts';
import type { MotionGates } from './motionGate.ts';
import type { SlowDiag } from './slowUpdate.ts';

// Delayed spell impact after cast finish (missile flight). Cost/CD already taken at cast finish;
// effects/threat land at `landAt`. Cite: Spell.cpp cast with SpellEntry.speed ≠ 0.
export interface PendingMissile {
  /** Session clock when the missile left the caster (cast finish). */
  launchAt: number;
  /** Session clock when effects land (launchAt + travel from cast-time yards). */
  landAt: number;
  casterSide: Side;
  targetSide: Side;
  spell: SpellDef;
  /** Snapshot next-cast crit / effect mods armed at cast finish. */
  castCritAdd: number;
  castEffectPct: number;
  // White Auto Shot / wand / Throw: land via rangedStrike(null), not deliverSpellImpact.
  // Cite: Unit.cpp:4192 recast of 75/5019; weapon.ts white-swing contract.
  whiteRanged?: boolean;
  /** Wand weapon school for the orb tint; Auto Shot stays physical. */
  school?: string;
}

/** Per-enemy cast / EventAI / ScriptDev runtime (lives on the session). */
export interface EnemyCastState {
  fighter: Fighter;
  slots: CreatureCastSlot[];
  // Auras the creature is already wearing when the fight opens — its out-of-combat self-casts, which
  // the C++ resolves at spawn and refuses once combat is open. Cite: CreatureEventAI.cpp:216-218.
  spawnAuras: SpellDef[];
  pendingSlot: CreatureCastSlot | null;
  eventAi: CreatureEventAiState;
  /** Null when creature has no ScriptDev IR binding. */
  scriptDev: ScriptDevRuntimeState | null;
  /** Last main-spell exclusive window end (ranged MAIN_SPELL vs white melee). */
  mainSpellExclusiveUntil?: number;
  // Next time this creature may evaluate its spell list. UpdateSpellLists burns a 1200 ms timer at the
  // top of every evaluation, so a blocking row fires once per poll, not once per engine tick.
  spellListPollAt: number;
  // This creature's scheduled kit contains a heal, measured off its own cast entries and never a name.
  // A pack that heals itself must be un-healed first, or four Flamewaker Healers sit at 100% forever.
  healer?: boolean;
}

// Explicit session bag for peels. State fields are required; hub methods are filled as clusters attach
// (same call order as the original nested defs).
export interface CombatContext {
  // ---- clocks / outcome ----
  t: number;
  ended: boolean;
  winner: Side | 'timeout' | null;
  tickMs: number;
  maxMs: number;
  rng: Rng;
  cfg: CombatConfig;

  // ---- fighters ----
  player: Fighter;
  // The primary enemy, ABSENT when the session holds none — a continuous floor run between pulls. Two
  // readers, both 1v1-shaped reporting rather than engine logic.
  enemy?: Fighter;
  pet: Fighter | null;
  // HP the pet had when the owner's death unsummoned it (RemovePet), so the writeback restores a live
  // pet instead of reading the 0 the despawn leaves. Null while the pet is out. Cite: Player.cpp:1670.
  petUnsummonedHp: number | null;
  // Keyed by the totem's own side, which carries owner + slot: the slot array is per-Unit
  // (Unit.h:2625), so two shamans never contend for one seat.
  totems: Map<TotemSide, Fighter>;

  // ---- combat tables ----
  effects: ActiveEffect[];
  // `effects` bucketed by the unit they sit on, rebuilt only when the array structurally changes.
  // Same objects in the same order, without the per-unit scan that dominated view at raid size.
  effectsOn: (side: Side) => ActiveEffect[];
  // Same rebuild as effectsOn, bucketed by the unit that applied the row (totem / caster).
  effectsFrom: (side: Side) => ActiveEffect[];
  /** Re-source a live row and move it between by-source buckets. Never write `e.source` directly. */
  setEffectSource: (e: ActiveEffect, side: Side) => void;
  /** Bump the version after an in-place edit a version-keyed skip reads (heartbeat, broken). */
  bumpEffectsVersion: () => void;
  /** Monotonic structural version of `effects` — every push/splice bumps it. */
  effectsVersion: () => number;
  // Next sim time the effects sweep / totem expiry / ground-pool pulse has work. Skip those loops while `t
  // < nextPeriodicDue`. Cite: EventProcessor.cpp:39.
  nextPeriodicDue: number;
  /** Lower nextPeriodicDue from this row's nextTickAt / expiresAt / heartbeat nextRollAt. */
  touchEffect: (e: ActiveEffect) => void;
  /** Lower nextPeriodicDue to `at` when finite and earlier. */
  touchPeriodicDue: (at: number) => void;
  /** Lower nextPeriodicDue from a ground-pool pulse / expiry. */
  touchGroundPool: (p: GroundPool) => void;
  /** Rebuild nextPeriodicDue from live effects, totems, and ground pools. */
  recomputePeriodicDue: () => void;
  events: CombatEvent[];
  threatByOwner: Map<CombatantId, ThreatManager>;
  enemyCastBySide: Map<EnemySide, EnemyCastState>;
  groundPools: GroundPool[];
  // Live class-A area-aura holders — party auras, pet area auras, totem kits. Empty until one is
  // applied, so a fight without any does zero extra work and draws no RNG.
  areaAuraSources: AreaAuraSource[];
  // Spell ids carrying DO_NOT_DISPLAY seen this session, whose chips the view drops. There is no
  // spell registry here: the view folds in the roster's kits and applySpell stamps the rest.
  hiddenAuraSpellIds: Set<number>;
  unitPositionsMutable: Record<string, CombatPosYd> | undefined;
  // Position generation counter — bumped by setPos for acquire-range hostiles cache. Owned by
  // sessionGeometry; read by sessionPools.
  posGen: number;
  // Explicit click/kill-target focus on a floor passive (no threat yet). Free AI may aim only at this side
  // until it enters combat — not every streamed passive in range.
  explicitEnemyFocus: EnemySide | null;
  /** Companion manual kill-target override (ally side → enemy side). */
  allyManualTarget: Map<Side, EnemySide>;
  // Pet bar command state (CharmInfo COMMAND_ATTACK / COMMAND_FOLLOW / COMMAND_STAY). Cite: Unit.h:819-824
  // CommandStates; PetAI.cpp:376-377.
  petCommand: 'attack' | 'follow' | 'stay';
  /** Pet bar react state. Cite: UnitAI.h:81-86 ReactStates; PetAI.cpp:83,380,480. */
  petReact: 'aggressive' | 'defensive' | 'passive';
  /** Victim the Attack command named; cleared when it dies or a Follow/Stay is issued. */
  petManualTarget: EnemySide | null;
  /** COMMAND_STAY anchor. Cite: PetAI.cpp:395-398 CharmInfo::UpdateStayPosition / MoveStay. */
  petStayPos: CombatPosYd | null;
  // GetIsRetreating — Follow is a RECALL, not a command flip. Without it the order is invisible
  // mid-fight, since owner-assist re-acquires the victim the very next tick.
  petRetreating: boolean;
  /** Per-side motion-resolution tally (sessionMotion). Diagnosis only — never read by logic. */
  navDiag?: Map<string, Record<string, number>>;
  /** C2 SlowUpdate think/skip tallies. Diagnosis only. */
  slowDiag?: SlowDiag;
  // In-flight missiles, landing once the clock reaches their arrival. Empty with no geometry or no
  // projectile spells, so a 1v1 golden does zero work.
  pendingMissiles: PendingMissile[];
  instanceData: Map<number, number>;
  guardianSidesBySummoner: Map<Side, Set<Side>>;

  // ---- items ----
  playerItems: CombatItem[];
  itemCd: Map<number, number>;
  itemsSpent: Map<number, number>;
  /** Items a fight put in the player's bags (Scorched Rocket Boots). Emitted as itemsGained. */
  itemsGained: Map<number, number>;
  // Every non-player unit's combat bag, keyed by SIDE. It replaced six seat-indexed arrays: an inject
  // had to grow three of them in lockstep, and every reader scanned the roster back to an index.
  unitItems: Map<Side, CombatItem[]>;
  unitItemCd: Map<Side, Map<number, number>>;
  unitItemsSpent: Map<Side, Map<number, number>>;
  /** Items a fight put in a non-player unit's bag (a companion warlock's Drain Soul shard). */
  unitItemsGained: Map<Side, Map<number, number>>;
  // Every non-player unit's rotation provider, keyed by SIDE. The seat-indexed arrays stay as the
  // input contract, but nothing reads them by index — that needed a whole memo module to stay cheap.
  unitActionProvider: Map<Side, AllyActionProvider>;
  /** BG enemy-bot kits (index-aligned with `enemies` at session start; injected enemies have none). */

  // ---- misc session sets ----
  deathEmitted: Set<string>;
  invalidTargetReported: Set<number>;
  // Party interrupt coordination: enemy side → claimer side. One Kick/CS/Spell Lock at a time per casting
  // target; miss frees the next.
  interruptClaim: Map<CombatantId, CombatantId>;
  // Party dispel coordination: `${targetId}:${dispelCat}` → claimer side. One Tranq/Purge/Cleanse per
  // (target, category); miss frees the next. Cite: AUTOPILOT-PLAN §4 row 21.
  dispelClaim: Map<string, CombatantId>;
  // Party battle-rez coordination: corpse side → claimer side. One Rebirth per corpse, so N druids stand up
  // N bodies instead of racing for one.
  rezClaim: Map<CombatantId, CombatantId>;

  // ---- focus / AI ----
  aiPlayer: boolean;
  /** Player focus combatant id. */
  playerFocus: CombatantId;
  /** Player focus Fighter (writable; side is mirrored via playerFocus). */
  playerFocusFighter: Fighter;
  /** Warlock soul shards gained this fight (checkDeaths). */
  soulShardsGained: number;
  // Last non-aura/resource event time (ms). Kept for diagnostics; fights no longer abort because nothing
  // has swung.
  lastActionT: number;
  /** Rows discarded by the session event ring (MAX_SESSION_EVENTS trim). */
  eventsDropped: number;
  // Damage can never kill this enemy (armed SetDeathPrevention, or the UNKILLABLE static flag), so it is
  // not a kill target while anything else in the pull is. Installed by sessionPools.
  isUnkillableEnemy?: (f: Fighter) => boolean;
  // Scripted-mechanic counts tallied at push time, so they survive the ring trim that drops the first
  // minutes of a raid-length fight. Read out as `CombatResult.mechanics`.
  mechanicTally?: Map<CombatEvent['kind'], { count: number; firstT: number; lastT: number }>;
  // Damage landed per victim side, tallied at push time for the same reason as mechanicTally. Read out as
  // `CombatResult.damageTakenBySide`; the domain buckets it by role.
  damageTakenBySide?: Map<string, number>;
  /** Deaths in order with their killing blow, push-time. Read out as `CombatResult.deaths`. */
  deathRoll?: { side: Side; t: number; by?: Side; cause?: string }[];
  /** Deaths counted including any the deathRoll cap dropped. */
  deathsTotalOf?: () => number;

  // Live floor hazards for THIS tick, pools and hazard bodies alike. One answer per fight per tick,
  // because the avoid move and the proximity condition both ask and must not disagree.
  hazardCache?: { t: number; list: readonly Hazard[] };
  motionClaims?: MotionClaims;
  /** Which gate resolved each unit's motion last tick (sessionMotion). Diagnosis only. */
  motionGates?: MotionGates;
  unitMoveOrders?: Map<string, CombatPosYd[]>;
  unitMoveIntents?: Map<string, CombatPosYd>;
  unitManualMotion?: Set<string>;
  /** Player "go here" dests — AI must not drop them to start a cast-time spell. */
  unitHoldCourse?: Set<string>;
  /** Split-now / own-slot dests — do not follow the player's corridor. */
  unitDirectMove?: Set<string>;
  // Which sides the player drives as ONE unit — the `partyFollowYd` bubble only tows a member in here
  // alongside the player's own body. Unset means every side, which is what a bare session opens with.
  followGroupSides?: Set<string>;
  unitStance?: Map<string, 'retaliate' | 'passive' | 'hold' | 'patrol'>;
  unitPatrolLoop?: Map<string, CombatPosYd[]>;
  unitAnchors?: Map<string, CombatPosYd>;
  // Where each enemy walks back to when it evades: its combat-start position, else the spawn coord it
  // was injected at. Cite: HomeMovementGenerator.cpp:40-52; UnitAI.cpp:113-130.
  enemyHomeYd?: Map<string, CombatPosYd>;
  // ORDERED cast list per friendly seat, written by queueUnitCast and consumed head-first. It replaced
  // ONE slot per unit, which a Pre-buff order faked on a wall clock and landed every cast twice.
  unitCastOrders?: Map<Side, QueuedCast[]>;
  castTargetOverride?: Map<Side, { spellId: number; side: EnemySide }>;
  /** This-tick dest for a ground-targeted player cast (Blizzard / RoF). Copied onto Fighter.castDest at startOrCast. */
  castDestOverride?: Map<Side, { spellId: number; dest: CombatPosYd }>;
  // One-shot per-tick aim from a `target: 'other'` rule. Written by pickAction or the live-player tick wrap
  // (CombatAction.offTarget); consumed by the scheduler this tick.
  rotationOffTarget?: Map<Side, EnemySide>;
  /** Same selector as offTargetSpell / `target: 'other'` (pickAction pickCcTarget). */
  pickCcTarget?: (f: Fighter, focus: Fighter | null, spell?: SpellDef) => Fighter | null;
  /** Clear pull-sequence spent sets when no combat hostiles remain (P11 step wrap). */
  clearPullSpentIfIdle?: () => void;
  /** Drop this unit's pull spent (Feign Death CombatStop → next opener). */
  clearPullSpentFor?: (side: Side) => void;

  // ---- hub / leaf methods (assigned by peels + assembler) ----
  push: (e: CombatEvent) => void;
  fightersOrder: () => Fighter[];
  /** E7: inject/totem — composition of fightersOrder changed. */
  bumpRoster?: () => void;
  // Roster membership writers (E1.1). Seat and generation together - never `enemies.push` plus a
  // `bumpRoster` the caller has to remember. `idx` past the end appends.
  rosterSeatEnemy?: (side: EnemySide, f: Fighter) => void;
  rosterSeatAlly?: (side: Side, f: Fighter) => void;
  // The seat an inject should take: the first DEAD seat in the block the request accepts, else the
  // next ordinal, else null when the block is at cap. Off the store, so it is no longer a findIndex.
  freeSeatIn?: (
    isBlock: (s: Side) => boolean,
    nameAt: (i: number) => Side,
    want: (f: Fighter) => boolean,
    cap: number,
  ) => Side | null;
  rosterSetTotem?: (side: TotemSide, f: Fighter) => void;
  rosterClearTotem?: (side: TotemSide) => void;
  /** The seat a world id occupies, off the guid index the one writer maintains. E1.2. */
  unitByGuid?: (guid: number) => Fighter | undefined;
  /** Record or clear a seat's world id in that index. Null clears every id for the seat. */
  noteUnitGuid?: (side: Side, guid: number | null) => void;
  /** E7: death/charm — friendly/hostile pool membership changed. */
  bumpPool?: () => void;
  bySide: (s: Side) => Fighter;
  /** bySide without the player/enemy miss fallbacks — undefined when the side is off-roster. */
  sideFighter?: (s: Side) => Fighter | undefined;
  /** Player + pet + companions in turn order, memoized on roster gen (E1.1). */
  partyUnits: () => readonly Fighter[];
  // EVERY seat this session holds, alive or dead, totems included. The turn-order list drops a dead
  // totem, but a per-unit SWEEP wants those too, and four sweeps hand-walked the seat fields instead.
  allSeats: () => readonly Fighter[];
  // One block's seats, alive or dead, in turn order (E1.1) - the answer between `allSeats()` and
  // `livingEnemies` / `livingAllies`, for the sweeps that act ON a corpse.
  enemyBlock: () => readonly Fighter[];
  allyBlock: () => readonly Fighter[];
  factionOf: (side: Side) => 'player' | 'enemy';
  factionOfFighter: (f: Fighter) => 'player' | 'enemy';
  livingHostilesFor: (f: Fighter) => Fighter[];
  livingFriendlies: () => Fighter[];
  // Living ALLY seats, the twin of `livingEnemies` (E1.1). Liveness only - no charm filter, which is what
  // separates it from `livingFriendlies`, the targeting pool.
  livingAllies: () => Fighter[];
  friendlyPoolOf: (f: Fighter) => Fighter[];
  /** Lowest-HP% living free unit on `f`'s faction (heal triage for player or enemy pack). */
  lowestHpFriendlyOf: (f: Fighter) => Fighter | null;
  foePoolOf: (f: Fighter) => Fighter[];
  livingEnemies: () => Fighter[];
  // Living enemies that are free-fire for party AI / multi counts / social pulse. Endless floor: threat
  // table or explicit click only — not the whole 48 yd passive stream. Non-endless: same as livingEnemies.
  livingCombatEnemies: () => Fighter[];
  /** Pull-sequence spent ids for one unit, maintained on push (never rescanned). */
  pullSpentSpellsFor: (side: Side) => ReadonlySet<number>;
  pullSpentItemsFor: (side: Side) => ReadonlySet<number>;
  isCharmed: (f: Fighter) => boolean;
  /** Installed by pickAction.ts:2827, so absent until that install runs. */
  livingPetOf?: (f: Fighter) => Fighter | null;
  isUnattackable: (f: Fighter, observer?: Fighter | null) => boolean;
  threatOf: (owner: CombatantId | Fighter) => ThreatManager | undefined;
  distanceBetween: (a: Fighter, b: Fighter) => number | undefined;
  posOf: (side: Side | string) => CombatPosYd | undefined;
  setPos: (side: Side | string, p: CombatPosYd) => void;
  // Is this unit under way right now? True for one tick after a position write that carried a heading.
  // Combat movement here is always run speed, so this doubles as "not walking".
  isMoving: (side: Side | string) => boolean;
  // Heading in radians this unit is facing, or undefined when the session has no geometry. Cite:
  // engine/combat/facing.ts facingFrom.
  facingOf: (f: Fighter) => number | undefined;
  // WorldObject::HasInArc(other, π) on `observer`'s heading — "is `other` in my front half". True when the
  // session has no geometry, so a positionless fight is unchanged. Cite: Object.cpp:1515-1535.
  isInFrontArc: (observer: Fighter, other: Fighter) => boolean;
  // `IsFacingTargetsBack` — both arc tests, or null when this session has no geometry for one of the two
  // units. Null is the signal to fall back to the non-spatial behind proxy. Cite: Object.cpp:1542-1556.
  facingTargetsBack?: (self: Fighter, target: Fighter) => boolean | null;
  /** `IsFacingTargetsFront` — both arc tests true, null without geometry. Cite: Object.cpp:1558. */
  facingTargetsFront?: (self: Fighter, target: Fighter) => boolean | null;
  /** Snap combat-yard point to navmesh (sessionGeometry). */
  snapToMesh?: (pos: CombatPosYd, radiusYd: number, refZ?: number | null) => CombatPosYd | null;
  // The one "go here" issuer. Finds a corridor, seeds the follower, sets the move order. Floor clicks,
  // kill-target, and gap-close approach all go through this.
  pathTo?: (
    side: string,
    dest: CombatPosYd,
    opts?: {
      queue?: boolean;
      keepFocus?: boolean;
      worldPts?: Array<{ x: number; y: number; z?: number }>;
      viaMesh?: boolean;
      standShortYd?: number;
      holdCourse?: boolean;
      direct?: boolean;
      owner?: MotionOwner;
    },
  ) => boolean;
  /** Enemy spawn placement with ENEMY_SNAP_YD (sessionGeometry). */
  placeEnemyAt?: (pos: CombatPosYd) => CombatPosYd;
  /** Drop this side's cached corridor / stuck state after a teleport (sessionMotion). */
  clearMotionCaches?: (side: string) => void;

  // sessionPools helpers (also used by focus/deaths peels later)
  enemyHasThreat?: (ef: Fighter) => boolean;
  allEnemiesDead?: () => boolean;
  partyWiped?: () => boolean;
  nativeFactionOf?: (side: Side) => 'player' | 'enemy';
  preferFocusHostile?: (hostiles: Fighter[], from?: Fighter) => Fighter | null;
  // Team match only (`cfg.reacquireOnEmptyThreat`): re-open every empty-list enemy on the nearest
  // living hostile. Returns how many re-opened. Cite: sessionFocus.ts reacquireEmptyThreat.
  reacquireEmptyThreat?: () => number;
  lowestHpFriendly?: () => Fighter | null;
  freeFireHostilesFor?: (f: Fighter) => Fighter[];

  // sessionFocus (P4)
  ensurePlayerFocus?: () => Fighter;
  foeOf?: (f: Fighter) => Fighter;
  /** Defender-side talent procs (dodge / resist). Cite: Rogue.cpp SetupRogue. */
  triggerTakenProcs?: (
    victim: Fighter,
    attacker: Fighter,
    outcome: 'dodge' | 'parry' | 'block' | 'resist',
    flagsHint: import('../spells/procs.ts').ProcFlagsHint,
  ) => void;
  hostileTargetOf?: (enemyF: Fighter) => Fighter;
  nearestPartyInAcquire?: (enemySide: string) => CombatantId | null;
  fighterByThreatId?: (id: CombatantId | null) => Fighter | null;
  selectTargetLookup?: (caster: Fighter) => (id: string) => Fighter | null;
  selectTargetCtxFor?: (caster: Fighter, spellId?: number, selectClass?: number) => ReturnType<typeof import('./aiTargetResolve.ts').buildSelectTargetCtx>;
  resolveEventAiTargetFighter?: (summoner: Fighter, targetSel: number) => Fighter;
  // resolveEventAiCastTarget typed below with eventAi surface

  // sessionDeaths (P5)
  unsummonTotem?: (side: TotemSide, reason: 'expire' | 'death' | 'replace' | 'owner' | 'zone') => void;
  /** Every totem `owner` holds, or the whole session's when owner is omitted (zone change). */
  unsummonAllTotems?: (reason: 'owner' | 'expire' | 'zone', owner?: Side) => void;
  checkDeaths?: () => void;

  // aoeCast (P7)
  castOnTargets?: (src: Fighter, primaryTgt: Fighter, spell: SpellDef) => void;
  aoeUnitInRadius?: (
    src: Fighter,
    primaryTgt: Fighter,
    other: Fighter,
    spell: SpellDef,
  ) => boolean;
  selectAoeSecondaries?: (
    src: Fighter,
    primaryTgt: Fighter,
    spell: SpellDef,
    pool: Fighter[],
    totalCap: number | null,
  ) => Fighter[];

  // itemUse (P8)
  useItem?: (entry: number, targetId?: CombatantId, actor?: Side) => boolean;
  resolveItemTarget?: (targetId: CombatantId) => Fighter | null;

  // sessionView (P9)
  view?: (f: Fighter) => CombatantView;
  /** `view(f).debuffs` alone, without building the rest of the view. Installed with `view`. */
  debuffChipsOf?: (f: Fighter) => Array<{ spellId: number; remainingMs?: number; stacks?: number; charges?: number }>;
  invalidateViewMemo?: () => void;

  // powerForm (P6)
  spend?: (
    f: Fighter,
    amount: number,
    pt?: import('../../data/schema.ts').PowerType,
    spell?: SpellDef,
  ) => void;
  /** 80% power back on MISS / DODGE / PARRY / DEFLECT. Cite: Spell.cpp:3647-3663. */
  refundPowerOnMiss?: (f: Fighter, spell: SpellDef, outcome: string) => void;
  // MeleeSpellHitResult for a melee-class spell with no weapon damage; weapon.ts installs it.
  meleeSpellHitResult?: (
    src: Fighter,
    tgt: Fighter,
    spell: SpellDef,
    mechanicResistPct: number,
  ) => { result: HitResult | 'resist'; failPct: number };
  spellCost?: (f: Fighter, spell: SpellDef) => number;
  canAffordSpell?: (f: Fighter, spell: SpellDef) => boolean;
  enterForm?: (f: Fighter, form: ShapeshiftFormId, spellName: string, spellId?: number) => void;
  applyStealth?: (
    f: Fighter,
    strength: number,
    durationMs: number,
    breakFlags: number | undefined,
    spell: SpellDef,
  ) => void;
  /** Player-only; clears Stealth CD then recasts highest learned rank. Cite: Rogue.cpp:61–77. */
  castHighestStealthRank?: (caster: Fighter) => void;
  maybeBreakStealthOn?: (f: Fighter, flag: number, reason: string) => void;
  behindOk?: (caster: Fighter, target: Fighter) => boolean;
  gainRage?: (f: Fighter, amount: number) => void;
  regenRage?: (f: Fighter, dt: number) => void;
  regenEnergy?: (f: Fighter, dt: number) => void;
  regenMana?: (f: Fighter, dt: number) => void;
  regenFocus?: (f: Fighter, dt: number) => void;
  /** SPELL_AURA_MOD_REGEN_DURING_COMBAT spirit HP regen. Cite: Player.cpp:2389–2399; KI-898. */
  regenHealth?: (f: Fighter, dt: number) => void;
  addComboPoints?: (f: Fighter, target: Fighter, count: number) => void;
  clearComboPoints?: (f: Fighter) => void;
  comboOn?: (f: Fighter, tgt: Fighter) => number;
  scaleDurationByCp?: (baseMs: number, maxMs: number | undefined, cp: number) => number;
  rollHeal?: (healer: Fighter, min: number, max: number) => { amount: number; crit: boolean };

  // sessionInject
  injectEnemySpec?: (
    raw: import('./types.ts').CombatantSpec,
    opts?: {
      summonerSide?: Side;
      creatureId?: number;
      position?: CombatPosYd;
      passive?: boolean;
      /** Forced seat (tick seam). Throws when it holds a living unit. */
      side?: string;
    },
  ) => Fighter | null;
  injectEnemySummon?: (
    summoner: Fighter,
    creatureId: number,
    durationMs: number,
    worldPos?: SummonWorldPoint,
    opts?: { attackStart?: boolean },
  ) => Fighter | null;
  /** Ally-seat body from a spec — the friendly half of injectEnemySpec (AV's own guards). */
  injectAllySpec?: (
    raw: import('./types.ts').CombatantSpec,
    opts?: { ownerSide?: Side; position?: CombatPosYd; side?: string },
  ) => Fighter | null;
  /** Ally-seat summon for a player/ally/pet caster. Cite: SpellEffects.cpp AddGuardian. */
  injectFriendlySummon?: (
    summoner: Fighter,
    creatureId: number,
    durationMs: number,
    worldPos?: SummonWorldPoint,
  ) => Fighter | null;
  /** Side-routing entry point: the summon lands on the summoner's live faction. */
  injectSummonForCaster?: (
    summoner: Fighter,
    creatureId: number,
    durationMs: number,
    worldPos?: SummonWorldPoint,
  ) => Fighter | null;
  /** Per-tick TEMPSPAWN expiry for ally-seat summons. Cite: SpellEffects.cpp:2765. */
  expireFriendlySummons?: () => void;
  /** Re-cast replace: drop this owner's guardians of one entry. Cite: SpellEffects.cpp:2839. */
  unsummonFriendlyGuardians?: (
    owner: Fighter,
    creatureId: number,
    createdBySpell: number,
  ) => number;
  summonPositionFor?: (
    summoner: Fighter,
    worldPos?: SummonWorldPoint,
  ) => { position: CombatPosYd } | null;
  forceDespawnEnemy?: (ef: Fighter) => void;
  runScriptDevAggroLifecycle?: (ef: Fighter) => void;
  /** Fire onAggro for watched sides that have since entered combat (floor spawns). */
  pumpScriptDevAggroLifecycle?: () => void;

  // leaf peels
  dispelTypeOfSpell?: (spellId: number) => number;
  /** Guard for the whole dispel pass — false skips every per-ally per-category scan. */
  anyDispellableEffect?: () => boolean;
  /** True when `spell`'s own MECHANIC_IMMUNITY purges every hard control blocking `f`. */
  spellCancelsOwnControl?: (f: Fighter, spell: SpellDef) => boolean;
  dispellableAurasOn?: (unit: Fighter, mask: number, friendlyDispel: boolean) => ActiveEffect[];
  // Spell ids a raid keep-row forbids auto-dispelling. pickAction fills this each tick from keepAuraIdsOf
  // on every live rotation provider. Absent → none skipped.
  keepAuraSpellIds?: ReadonlySet<number>;
  reflectChanceFor?: (unit: Fighter, school: School) => number;
  reverseActiveEffect?: (unit: Fighter, e: ActiveEffect) => void;
  stripAuraOnDispel?: (unit: Fighter, spellId: number, count: number) => void;
  removeAllAurasOnDeath?: (unit: Fighter) => void;
  removeAurasDueToSpell?: (unit: Fighter, spellId: number) => number;
  /** Run an aura row's removal bodies (HandleAuraDummy apply=false). See dispelReflect.ts. */
  fireAuraRemoveBodies?: (
    e: ActiveEffect,
    mode: 'expire' | 'death' | 'dispel' | 'cancel',
  ) => void;
  resolveDispelTarget?: (
    src: Fighter,
    requestedTgt: Fighter,
    dispelType: number,
  ) => { unit: Fighter; friendlyDispel: boolean } | null;
  /** One aura-23 totem pulse onto the totem's party (cleansers / Tremor / Stoneclaw threat). */
  firePartyTotemPulse?: (totem: Fighter, trig: SpellDef) => void;
  /** Record totem→owner for DPSMate merge (survives UnSummon). */
  noteTotemOwner?: (side: TotemSide, owner: Side, name: string) => void;

  /** Is this control live on the unit right now? Cite: Unit.h:2276 IsCrowdControlled. */
  controlActive?: (f: Fighter, control: ControlKind) => boolean;
  breakControl?: (f: Fighter, control: ControlKind) => void;
  breakCharm?: (f: Fighter) => void;
  /** Holding CC our own damage would shatter (poly/sap/gouge/shackle/blind) — not stun/fear. */
  ccProtected?: (f: Fighter) => boolean;
  /** One heartbeat-resist pass over the armed holders. Cite: heartbeatResist.ts. */
  tickHeartbeatResists?: () => void;
  // creature_template_classlevelstats BaseDamage lookup, injected from CombatConfig for
  // SPELL_ATTR_SCALES_WITH_CREATURE_LEVEL. Absent = creature spells keep their baked numbers.
  creatureBaseDamageAt?: (level: number, unitClass: number) => number | undefined;
  /** Rank-chain lookup for aura identity. Cite: dataStore.spellChain. */
  spellChainOf?: (spellId: number) => { first: number; rank: number } | undefined;
  /** Spell 1604 Dazed. Cite: Unit.cpp:2227. */
  dazeSpell?: SpellDef;
  // `SpellEntry.AuraInterruptFlags` by spell id, for holders whose SpellDef is not in hand. Absent = no
  // generic interrupt removal (stealth still breaks off its own breakFlags). Cite: SpellDefines.h:360-386.
  auraInterruptFlagsOf?: (spellId: number) => number;
  // Global spell store injected from CombatConfig, for a triggered payload that sits in no kit. Absent =
  // kit membership only (fixtures). Cite: Unit.cpp:1447-1449.
  spellOf?: (id: number) => SpellDef | undefined;
  // Unit::RemoveAurasWithInterruptFlags — drop every holder on `f` carrying one of `flags`. Cite:
  // Unit.cpp:5197-5209; engine/combat/interruptAuras.ts.
  removeAurasWithInterruptFlags?: (f: Fighter, flags: number, reason: string, opts?: { skipStealth?: boolean; exceptSpellId?: number; skipInvisibility?: boolean }) => void;
  applyControl?: (
    src: Fighter,
    tgt: Fighter,
    spell: SpellDef,
    eff: { control: ControlKind; mechanic: Mechanic; school?: School; breakOnDamage?: boolean },
    durMs: number,
    /** Armed heartbeat-resist holder, when the spell carries SPELL_ATTR_HEARTBEAT_RESIST. */
    heartbeat?: import('./heartbeatResist.ts').HeartbeatHolder | null,
  ) => void;
  // Where this caster's seat for a tracked single-target aura currently sits (empty when free), and
  // the move that drops it elsewhere. Cite: Unit.cpp:4774-4830; SpellMgr.h:2230.
  trackedAuraSeats?: (src: Fighter, spell: SpellDef) => { side: Side; spellId: number }[];
  purgeTrackedAuraTargets?: (src: Fighter, tgt: Fighter, spell: SpellDef) => number;
  applyDr?: (src: Fighter, tgt: Fighter, mechanic: Mechanic, baseMs: number) => number;
  ccImmune?: (tgt: Fighter, mechanic: Mechanic, onlyTypes?: number[]) => boolean;
  // The DealDamage interrupt bag: `absorbed` is the school or mana absorb on this packet, and the skip
  // flag is the damage-shield and split case, where the C++ returns before the channel delay.
  onDamaged?: (
    f: Fighter,
    amount: number,
    damageType?: string,
    fromSpellId?: number,
    info?: { absorbed?: number; attacker?: Fighter; skipChannelDelay?: boolean },
  ) => void;
  // After a heal lands. Twin Emperors HealedBy gets pre-clamp addhealth. Cite: Unit.cpp:6889;
  // boss_twinemperors.cpp:113-125.
  onHealed?: (f: Fighter, amount: number, fromSpellId?: number) => void;
  /** Install damage/heal mirror onDamaged/onHealed wrappers. Cite: boss_twinemperors.cpp:96-125. */
  ensureDamageHealMirrorHooks?: () => void;

  applyDamageThreat?: (
    dealer: Fighter | undefined,
    victim: Fighter,
    damage: number,
    crit: boolean,
    spell?: SpellDef | null,
  ) => void;
  applyFlatThreat?: (
    caster: Fighter,
    amount: number,
    spell?: SpellDef | null,
    onEnemy?: Fighter,
  ) => void;
  // Heal/buff assist threat. `healedSide` is the unit whose HostileRefManager owns the refs — omit for a
  // self-heal or an energize, where the healer IS the healed unit. Cite: HostileRefManager.cpp:39-68.
  applyHealThreat?: (
    healer: Fighter,
    amount: number,
    spell?: SpellDef | null,
    healedSide?: Side,
  ) => void;
  applySpellThreatBonus?: (caster: Fighter, spell: SpellDef, onEnemy?: Fighter, hitCount?: number) => void;
  /** Initial aggro from a resolved hostile action — hit, miss, resist, dodge or immune alike. */
  engageOnHostileSpell?: (
    caster: Fighter,
    target: Fighter,
    spell: SpellDef | null | undefined,
    success: boolean,
    melee?: boolean,
  ) => void;
  isPlayerOrPetSide?: (f: Fighter) => boolean;
  removeFromAllThreat?: (id: CombatantId) => void;
  clearAllThreat?: () => void;

  leaveForm?: (f: Fighter) => void;
  breakStealth?: (f: Fighter, reason: string) => void;
  dealDamage?: (
    target: Fighter,
    raw: number,
    school: School,
    attackerLevel: number,
    opts?: {
      binary?: boolean;
      damageType?: 'spell' | 'dot' | 'weapon' | 'shield';
      ranged?: boolean;
      attacker?: Fighter;
      spell?: SpellDef | null;
      crit?: boolean;
    },
  ) => number;
  applySpell?: (src: Fighter, tgtIn: Fighter, spellIn: SpellDef, reflected?: boolean, hitCount?: number) => void;
  consumePendingSpellMod?: (f: Fighter) => void;
  pickAction?: (f: Fighter, foe: Fighter) => SpellDef | null;
  /** Off-GCD next-swing queue (Cleave/HS/Maul) for party AI — see pickAction hub. */
  pickNextSwingArm?: (f: Fighter, foe: Fighter) => SpellDef | null;
  startOrCast?: (f: Fighter, foe: Fighter, spell: SpellDef) => void;
  step?: (
    action?: import('./types.ts').CombatAction,
    inputs?: import('./types.ts').SimTickInputs,
  ) => CombatEvent[];
  // The last `SimTickInputs` a caller supplied, held for the whole tick. Overwritten only when the
  // caller passes one, so an internal step (runToEnd) keeps the game layer's last answer.
  tickInputs?: import('./types.ts').SimTickInputs;
  // Effects this tick RECORDED for the flush at the end of the step (S6b mechanism 1). Never read by
  // the tick itself — a phase that needs the result must take it from `tickInputs` next step.
  simEffects?: import('./simEffects.ts').SimEffect[];
  /** True only while `ctx.step` runs, so an effect knows whether a flush is coming for it. */
  inStep?: boolean;
  /** Apply school/mechanic/dispel immunity aura (installCrowdControl). */
  grantImmunityAura?: (
    owner: Fighter,
    aura: import('../spells/immunity.ts').ImmunityAura,
    expiresAt: number,
    name: string,
    source: Side,
  ) => void;
  // DropAuraCharge on a charged mechanic_immunity that just blocked this mechanic. Cite: SpellAuras.cpp
  // DropAuraCharge; Fear Ward ProcCharges=1.
  consumeChargedImmunityOnMechanicBlock?: (
    owner: Fighter,
    mechanic: import('../../data/schema.ts').Mechanic | string,
  ) => void;
  applyEventAiIntent?: (summoner: Fighter, intent: EventAiIntent) => void;
  runEnemyEventAi?: (ef: Fighter) => void;
  // One-shot EventAI pulses for the events whose context field no polled build sets, so each gate was
  // permanently false: 177 DB rows, 51 on census creatures. Death already worked this way.
  notifyEventAiKill?: (killer: Fighter, victim?: Fighter) => void;
  notifyEventAiSummoned?: (summoner: Fighter, summonedEntry: number, died: boolean) => void;
  notifyEventAiSpellCast?: (caster: Fighter, spellId: number) => void;
  notifyEventAiReachedHome?: (unit: Fighter) => void;
  notifyEventAiOocLos?: (unit: Fighter) => void;
  notifyEventAiDamageTaken?: (target: Fighter, healthBefore: number, damage: number) => void;
  /** CreatureEventAI::HealedBy full-heal throw. Cite: CreatureEventAI.cpp:1885–1895. */
  notifyEventAiHealedBy?: (target: Fighter, healthBefore: number, healedAmount: number) => void;
  /** ScriptDevTimer.actions after CAST_OK (Yauj Fear → DoResetThreat; Gate 23138 → SendAIEvent). */
  applyScriptDevTimerActions?: (ef: Fighter, spellId: number, target?: Fighter) => void;
  /** ScriptDev send_ai_event / receive actions (death + tick). */
  applyScriptDevCombatActions?: (
    ef: Fighter,
    actions: readonly import('../../domain/scriptdev/types.ts').ScriptDevAction[],
  ) => void;
  // ScriptDev CreatureAI::SpellHit for the unit a spell was delivered to. Cite: Spell.cpp:1345;
  // domain/scriptdev host handleSpellHit.
  runScriptDevSpellHit?: (tgt: Fighter, caster: Fighter, spellId: number) => void;
  /** Viscidus frost/melee hit-count. Cite: boss_viscidus.cpp:295-331,552-565,422-428. */
  notifyScriptDevHitCount?: (target: Fighter, opts: { school: string; melee: boolean }) => void;
  // Periodic stealth detect sweep (stealthDetect.ts). Self-timed: safe to call every tick. Cite:
  // Player.cpp:1538-1550 m_DetectInvTimer.
  stealthDetectPhase?: () => void;
  /** Drop Possess Inv (17250) when the charmer has no living victim. */
  dropIdlePossessInv?: () => void;
  /** EventAI / spell-list cast-target resolution (createSession closure; used by stepSession). */
  resolveEventAiCastTarget?: (
    caster: Fighter,
    spell: SpellDef,
    mode: number,
    source?: 'eventai' | 'spell_list',
    selectClass?: number,
    /** Friendly-searcher range gate. Cite: UnitAI.cpp:764-771; boss_bug_trio.cpp:371 50.0f. */
    friendlyMaxRangeYd?: number,
    /** SELECT_FLAG_IN_MELEE_RANGE. Cite: boss_twinemperors.cpp:256. */
    requireInMelee?: boolean,
  ) => Fighter | null;
  /** SCHEME_HIGHEST_HP among the first N threat entries in melee. Cite: boss_patchwerk.cpp:114-127. */
  resolveHighestHpTopThreat?: (caster: Fighter, topN: number) => Fighter | null;
  // DoSelectLowestHpFriendly. Cite: UnitAI.cpp; boss_sulfuron_harbinger.cpp:162.
  resolveLowestHpFriendly?: (caster: Fighter, radiusYd: number, minDeficit: number) => Fighter | null;

  // allow additional peels to hang methods without widening this type every time
  [key: string]: unknown;
}
