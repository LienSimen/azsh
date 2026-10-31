// CombatSession — the live-fight facade (extracted from combat/types.ts, which was over its
// line ceiling). Re-exported from types.ts so every existing import site is unchanged.

import type { School, SpellDef, TotemSlot } from '../../data/schema.ts';
import type { CombatEvent, Side, TotemSide } from '../core/events.ts';
import type { CombatantId, HostileEntry } from './threat.ts';
import type { RotationSnapshot } from '../../domain/rotation/rotation.ts';
import type { CombatPosYd, PullGeometryAnchor } from './combatGeometry.ts';
import type { MotionGateReport } from './motionGate.ts';
import type {
  AbilityStatus,
  AllyActionProvider,
  CombatAction,
  CombatItemStatus,
  CombatResult,
  CombatantSpec,
  CombatantView,
  GroupRole,
  SimTickInputs,
  TotemView,
  TrapView,
} from './types.ts';

// One step on a friendly seat's ordered cast list — the `unitMoveOrders` payload shape with a cast where a
// waypoint would be. Exactly one of `spellId` / `itemEntry` is set.
export interface QueuedCast {
  /** Spell to cast. Absent only when `itemEntry` names a kit item to use instead. */
  spellId?: number;
  /** Kit item to use. Instant and off-GCD, so it never waits behind a GCD. */
  itemEntry?: number;
  /** The body this step names: an ENEMY side aims a hostile cast, a FRIENDLY side a heal / HoT. */
  targetSide?: Side;
  // A live human keypress produced this step. Only a press may clip a cast bar already in flight, and only
  // a press outranks a queued step at the head of the list.
  fromPress?: boolean;
  // Drop this step when the body it names already wears the spell. Opt-in, because a re-cast is the
  // point of most one-shots — a pet-bar click refreshes the shield. A Pre-buff row wants the skip.
  skipIfActive?: boolean;
}

export interface CombatSession {
  readonly events: CombatEvent[];
  // Rows the event ring has discarded from the front. An absolute index taken earlier maps past this
  // count, and a cursor that ignores it double-counts after the first trim.
  readonly eventsDropped: number;
  readonly t: number;
  readonly ended: boolean;
  readonly winner: Side | 'timeout' | null;
  aiPlayer: boolean;
  playerView(): CombatantView;
  // Current player focus (auto-retargets to a living pack mate when the focus dies). Wave 4A: not stuck on
  // the primary corpse — UI/rotation must use this for the target frame.
  enemyView(): CombatantView;
  /** The player's pet frame, or null when there's no pet in this fight. */
  petView(): CombatantView | null;
  /** All ally combatants in ally_0.. order (party frames). Empty for solo sessions. */
  alliesView(): CombatantView[];
  /** Active totems (0–4), for the small battler icon strip. */
  totemsView(): TotemView[];
  // Armed hunter trap GOs. Not unit auras — the floor chip / strip uses this, the buff bar does not. Empty
  // when none are armed. Cite: hunter-kit; SpellEffects.cpp SLOT1.
  trapsView?(): TrapView[];
  // Totem side → owner (and display name) for the whole fight, including despawned totems — DPSMate merges
  // guardian damage into the owner after UnSummon.
  totemOwners?(): Array<{ side: TotemSide; ownerSide: Side; name: string }>;
  // A companion pet's side mapped to its owner and display name. The meter folds pet damage into the
  // owner, and the macro unit refs ask the same list. A mid-fight guardian is not here.
  companionPets?(): Array<{ side: Side; ownerSide: Side; name: string }>;
  /** Whether a totem occupies this element slot (rotation "if not active"). */
  hasTotem(slot: TotemSlot, owner?: Side): boolean;
  // UnSummon every standing totem (GetSpell() auras on owner + same-subgroup party). Cite: Totem.cpp
  // UnSummon :131–158; Player.cpp RemoveFromWorld :2238.
  unsummonAllTotems?(reason: 'owner' | 'expire' | 'zone', owner?: Side): void;
  abilities(): AbilityStatus[];
  // The same strip for a seat that is NOT the player: a non-lead ally, or the enemy lead of the other
  // team. Same gates and same reasons — `abilities()` is this plus a memo. Null target = the seat's own.
  abilitiesFor(side: string, targetSide?: string | null): AbilityStatus[];
  /** In-combat consumables (potions/healthstone/mana gem) with live usability. */
  items(): CombatItemStatus[];
  /** Advance one tick. `action` = the player's tap: a spell id, `{item}` to use a consumable, or
   * null/none. Ignored if illegal or on AI. On-next-swing taps arm the next auto-attack. Returns events appended this tick. */
  tick(action?: CombatAction, inputs?: SimTickInputs): CombatEvent[];
  /** Flip the player to AI and run to completion (the Auto button / simulate). */
  runToEnd(): CombatResult;
  result(): CombatResult;
  /** Live remaining for a spell (from session clock). */
  cooldownRemainingMs(spellId: number): number;
  categoryCooldownRemainingMs(category: number): number;
  // A snapshot of positive remainings, for persisting across session boundaries. The side defaults to
  // the player; naming a companion carries its long cooldowns out to the world clock.
  cooldownSnapshot(side?: Side): { spell: Record<number, number>; category: Record<number, number> };
  // Threat list snapshot for one enemy owner (most hated first). Default owner = primary `'enemy'` (1v1
  // back-compat). Wave 4A: pass pack member side. Cite: ThreatManager — System 10 / Wave 4A.
  enemyThreatList(ownerId?: CombatantId): HostileEntry[];
  /** Current victim of one enemy's ThreatManager, or null if empty / no selection. */
  enemyThreatVictim(ownerId?: CombatantId): CombatantId | null;
  /** All enemy combatants in spawn order (primary first). Wave 4A multi-enemy. */
  enemiesView(): CombatantView[];
  // The view row for one seat, or null - the same memoized object the array views hand out. Answers for any
  // seat the roster holds: player, pet, an ally, an enemy or a totem.
  viewOfSide?(side: string): CombatantView | null;
  /** Living enemies remaining (same order). */
  livingEnemiesView(): CombatantView[];
  // Living enemy with non-empty threat. Cheap OOC gate (no view rebuild). Absent on older session stubs —
  // callers must guard.
  hasEngagedEnemy?(): boolean;
  /** Threat or explicit click-target on a passive — enemy strip may be non-empty. */
  hasFightListEnemy?(): boolean;
  // Live combat yards for a side when unitPositionsYd was seeded (Geometry v2.1b). Undefined when
  // no-geometry session or side missing from the map.
  unitPosYd(side: Side | string): CombatPosYd | undefined;
  /** Live heading in radians, for the portrait mirror. Absent on a session stub. */
  unitFacing?(side: Side | string): number | undefined;
  // Live hp as 0..100 for the Recoil hp-fill lerp (undefined for an unknown side). Absent on older session
  // stubs — callers must guard.
  unitHpPct?(side: Side | string): number | undefined;
  // The per-tick pose payload for the whole roster, written into the caller's buffer (PERF-RUNSHEET S6
  // "Payload contract"). Absent on a session stub, and `unitPosYd` is then the only reader.
  poseFrame?(filler: import('./simSnapshot.ts').PoseFiller): import('./simSnapshot.ts').SimPoseFrame;
  // The inverse, for the reading side's copy: take positions and hp from a frame the sim produced
  // elsewhere. That copy never ticks, so without this `reviveUnit` says "not dead" to a corpse.
  mirrorPoseFrame?(frame: import('./simSnapshot.ts').SimPoseFrame): void;
  // The same inverse for the fight's VERDICT. `mirrorPoseFrame` can drop a unit to 0 hp, but it runs no
  // death sweep, so the copy `result()` reads never names a winner and every far kill settled as
  // `winner ?? 'timeout'` — no xp, no loot, no kill credit.
  mirrorOutcome?(ended: boolean, winner: Side | 'timeout' | null): void;
  // How to rebuild this exact fight from PLAIN DATA, for a Worker (PERF-RUNSHEET S6b). Set by the game
  // layer, which is the only place holding the specs and the seed. Absent = this fight stays on-thread.
  workerInit?: import('./tickWorkerBody.ts').TickWorkerInit;
  // Apply one effect a far-side tick RECORDED (S6b mechanism 1): the config's `applyEffect`, reachable
  // from the pump that drains the batch. Absent when the config has none.
  applySimEffect?(effect: import('./simEffects.ts').SimEffect): void;
  // The per-tick inputs the config's supplier builds, for a caller that posts the tick somewhere the
  // supplier cannot run. Undefined when the config has no supplier.
  tickInputsNow?(): import('./types.ts').SimTickInputs | undefined;
  // Missiles still in flight, in geometry sessions only. The stage homes these to the live target and
  // impacts on the hit event at their landing time.
  missilesInFlight?(): readonly {
    launchAt: number;
    landAt: number;
    casterSide: Side;
    targetSide: Side;
    spellId: number;
    school?: string;
  }[];
  // Live ground pools — Consecration, Blizzard, Rain of Fire. Empty when none are active, and a disc
  // is omitted when either the origin or the radius is missing rather than invented.
  groundPools?(): readonly {
    id: number;
    spellId: number;
    name: string;
    school: School;
    radius?: number;
    origin?: { x: number; y: number; z?: number };
    expiresAt: number;
    source: Side;
  }[];
  /** Per-side motion-resolution tally (searchDenied / followWedged / …). Diagnosis only. */
  navDiag(): Record<string, Record<string, number>>;
  // Which gate resolved this unit's motion last tick, and what it measured — the layer above the
  // stepper's own diagnosis. Null until motion has resolved the side once. Diagnosis only.
  motionExplain(side: string): MotionGateReport | null;
  /** Every side `motionExplain` has a row for — same shape as `navDiag()`. */
  motionExplainAll(): Record<string, MotionGateReport>;
  /** C2 SlowUpdate think/skip tallies. Diagnosis only. */
  slowDiag(): {
    pickThink: number;
    pickSkip: number;
    eventAiThink: number;
    eventAiSkip: number;
    areaAuraRadius: number;
    areaAuraSkip: number;
  };
  // Which frame the offsets live in, so a renderer knows whether origin plus offset is a real world
  // position. Undefined when the session has no geometry, and a caller must not guess.
  geometryAnchor(): PullGeometryAnchor | undefined;
  // Reposition a unit inside a geometry session. A no-op without positions, so it never opens geometry
  // on a byte-stable fixture. A bare number is read as pull-axis yards.
  setUnitPosYd(side: Side | string, pos: CombatPosYd | number): void;
  // Everyone who counts as a party member is down: the player plus every companion, never a pet,
  // a totem or an injected guardian. An endless floor never ends, so it asks instead of being told.
  partyWiped?(): boolean;
  // A graveyard-cycle revive for an endless session: put a benched unit back at a health fraction.
  // Death benching tolerates a healed corpse, so this is hp plus cast state, never a new Fighter.
  reviveUnit(side: Side | string, hpPct?: number): boolean;
  // An external world-rules hook — a BG powerup, a coat applied from the bags — applying a spell to one
  // unit as a free self-cast. Naming the hand matters, or an off-hand poison lands on the main hand.
  applySpellToUnit(
    side: Side | string,
    spell: SpellDef,
    opts?: { weaponImbueHand?: 'mainhand' | 'offhand' },
  ): boolean;
  // Eat and drink downtime: refill a living unit's health and power. A dead unit is refused, since the
  // graveyard cycle owns that, and rage empties instead of filling.
  restoreUnit?(side: Side | string, hpPct?: number, powerPct?: number): boolean;
  // The TOP-UP half, touching nothing the unit has in flight — no cleared cast bar, no interrupted
  // channel. The live floor rests every 500 ms, and the full version wiped a healer's cast each time.
  restoreVitals?(side: Side | string, hpPct?: number, powerPct?: number): boolean;
  // Use an item from ANY unit's own kit — the BG item director's seam. It routes through the same gates
  // a player tap does, so a hard-CC'd unit is refused unless the item's own immunity cancels it.
  useUnitItem(side: Side | string, entry: number, targetId?: CombatantId): boolean;
  /** Any unit's in-combat kit with live usability (items() generalized beyond the player). */
  unitItems(side: Side | string): CombatItemStatus[];
  // Items the fight has put in non-player bags since the last call, and CLEARS them. An endless match
  // never produces a CombatResult, so this is the only way its Drain Soul shards reach a real bag.
  consumeUnitItemsGained?(): { side: Side; entry: number; count: number }[];
  // Current run speed (yd/s) from the unit's LIVE speed auras — Unit::UpdateSpeed over ctx.effects. The BG
  // screen mirrors this into world units it moves itself (enemies).
  unitRunSpeedYd(side: Side | string): number;
  // The same yd/s with only the unit's PERMANENT speed sources (gear enchants) counted. A caller
  // asking "is a temporary speed buff running" compares against this, not BASE_RUN_SPEED.
  unitBaseRunSpeedYd(side: Side | string): number;
  // Ride or step off — Unit::Mount / Unit::Unmount. WHETHER the ground and the rider allow it is
  // domain/nav/mounting.ts; this only carries the mount into UpdateSpeed's mounted buckets.
  setUnitMounted(side: Side | string, mount: { speedPct: number } | null): boolean;
  /** Is this unit riding right now (Unit::IsMounted)? */
  unitMounted(side: Side | string): boolean;
  /** UNIT_FLAG_IN_COMBAT for this unit (Unit::IsInCombat) — the world layer's non-combat cast gate. */
  unitInCombat(side: Side | string): boolean;
  // Switch the player's combat focus to a living enemy side. It does not retarget the pet, which has
  // its own command, and returns false when the side is not a living pack member.
  setPlayerTarget(side: CombatantId, opts?: { skipMove?: boolean }): boolean;
  // Living victim this unit is currently swinging at (foeOf / hostileTargetOf), or null when it has none.
  // Used to freeze a defensive pet when the owner retargets alone.
  targetOf?(side: string): CombatantId | null;
  // Party takeover: aim one companion's hostile actions at a specific living enemy, or release it back
  // to the AI. The rotation keeps running, so a controlled healer never stops healing.
  setAllyTarget(allySide: string, targetSide: string | null, opts?: { skipMove?: boolean }): boolean;
  // A mid-fight companion role swap: stamp the role on the live ally, restamp its stand yards, dirty
  // its next decision, and optionally replace the action provider.
  setAllyGroupRole?(
    allySide: string,
    role: GroupRole,
    provider?: AllyActionProvider | null,
  ): boolean;
  // One companion's kit with live usability. A target side evaluates every entry against THAT enemy,
  // which is what makes the right-click menu honest about type gates and range.
  allyAbilities(allySide: string, targetSide?: string | null): AbilityStatus[];
  /** Current manual target of a companion, or null when the AI drives. */
  allyTargetOf(allySide: string): string | null;
  // The pet bar commands. Attack with no target sends the pet at the player's focus, while follow and
  // stay drop the victim and take the pet's motion off the party's ground orders.
  setPetCommand?(cmd: 'attack' | 'follow' | 'stay', targetSide?: string | null): boolean;
  // Latch or release the pet's standing kill-target without changing Follow/Stay. Null releases it back to
  // PetAI. False when there is no living pet or illegal side.
  setPetTarget?(targetSide: string | null): boolean;
  /** Pet bar react state (slots 8-10). Cite: UnitAI.h ReactStates. */
  setPetReact?(react: 'aggressive' | 'defensive' | 'passive'): boolean;
  /** Live pet bar state for the bar's pressed/checked look. */
  petBarState?(): {
    command: 'attack' | 'follow' | 'stay';
    react: 'aggressive' | 'defensive' | 'passive';
    targetSide: string | null;
    /** Walking home on a Follow order — no victim until it arrives. */
    retreating: boolean;
    // Everything the pet knows, whether the AI may currently pick it, and the fight-clock cooldown the bar
    // draws (`cooldownMs` = full recovery, for the swipe arc).
    kit: Array<{
      id: number; autocast: boolean; cooldownRemainingMs: number; cooldownMs: number;
    }>;
  };
  /** Pet ability slot, right-click: autocast on/off for this fight (moves it in/out of the kit). */
  setPetAutocast?(spellId: number, on: boolean): boolean;
  /** Pet ability slot, left-click / Ctrl-N: cast it once now, autocast-off ones included. */
  queuePetAction?(spellId: number): boolean;
  // A SHIM over the queue with replace semantics. Every product call site queues directly now; the two
  // remaining callers are gates. Nothing new should use it, since it cannot express a LIST.
  queueAllyAction(
    allySide: string,
    action: number | { item: number } | null,
    targetSide?: string | null,
  ): boolean;
  // The held one-shot action armed for a side, or null. The tick's chooser reads it so an automatic
  // pick does not outrank a queued cast — a companion's queue already beats its rotation.
  queuedActionOf?(side: string): number | { item: number } | null;
  // The ORDERED cast list for one friendly seat, the same shape and lifetime as the waypoint queue. A
  // single slot is what the Pre-buff order had, and re-poking it every 250 ms fired every cast twice.
  queueUnitCast(side: string, cast: QueuedCast | null, queue?: boolean): boolean;
  /** The steps this seat still owes, head first. Empty when the list is clear. */
  unitCastOrderOf?(side: string): readonly QueuedCast[];
  // A click-to-move order for a friendly unit: pathfind a corridor and outrank gap-close until arrival.
  // Shift appends a waypoint, null clears, and a ground click cancels the kill target unless kept.
  setMoveOrder(
    side: string,
    pos: CombatPosYd | null,
    queue?: boolean,
    opts?: { keepFocus?: boolean; keepTravel?: boolean; holdCourse?: boolean; direct?: boolean },
  ): boolean;
  // Stamp a rotation rule's after-cast onto a friendly (step-back / follow-up). Used by the player's UI
  // pick path; engine-driven picks apply in pickAction.
  noteRuleAfter?(
    side: string,
    after: import('../../domain/rotation/types.ts').RuleAfter | null | undefined,
  ): void;
  /** Queue after-cast for this spell; motion starts only when the cast actually lands. */
  armRuleAfter?(
    side: string,
    spellId: number,
    after: import('../../domain/rotation/types.ts').RuleAfter | null | undefined,
  ): void;
  /** Clear a queued after-cast follow-up once it fired. */
  consumeFollowUp?(side: string, pickedSpellId: number): void;
  /** True while this friendly still owes after-cast step-back yards. */
  stepBackActive?(side: string): boolean;
  // The one "go here": snap, pathfind, seed the follower, set the move order. `worldPts` skips a second A*
  // when the caller already has the corridor (walkOnNav).
  pathTo?(
    side: string,
    dest: CombatPosYd,
    opts?: {
      queue?: boolean;
      keepFocus?: boolean;
      worldPts?: Array<{ x: number; y: number; z?: number }>;
      viaMesh?: boolean;
      standShortYd?: number;
      /** Player "go here" — walk it; AI must not stop to pre-cast. */
      holdCourse?: boolean;
      /** Own slot — do not follow the player's corridor (Move now). */
      direct?: boolean;
      // Who is asking. Omitted means a person clicked and the dest always takes the unit, while a route
      // marks a walk the game re-decides on a timer, which may be refused for the one in flight.
      owner?: import('./motionClaim.ts').MotionOwner;
    },
  ): boolean;
  /** Who owns this unit's motion right now, or null when nothing does. Cite: motionClaim.ts. */
  motionOwnerOf?(side: string): string | null;
  // Motion arbitration tallies for the session: denials on priority or a hold, same-owner re-aims
  // answered with the goal already claimed, and grants where the owner changed. Diagnosis only.
  motionClaimStats?(): { refused: number; reaimsKept: number; handovers: number };
  /** Yards this side parks short of a kill-target (standYards, or 2 for melee). */
  standShortYd?(side: string): number;
  /** Current manual move dest for a side, or null when AI motion drives. */
  moveOrderOf(side: string): CombatPosYd | null;
  /** True while this side's dest is a player "go here" (floor click / Move). */
  holdCourseOf?(side: string): boolean;
  // Snap a combat-yard point onto walkable floor, so a formation offset does not land in a wall. Null
  // means no floor within radius. A reference z restricts the answer to that storey and reports it back.
  snapMoveDest?(
    pos: CombatPosYd,
    radiusYd?: number,
    refZ?: number | null,
  ): CombatPosYd | null;
  // Held-direction locomotion. The vector is normalised here and stepped by the motion phase, so snares
  // stretch it and hard control freezes it. Setting one cancels a queued move order for that side.
  setMoveIntent?(side: string, dir: { x: number; y: number } | null): boolean;
  /** Current unit-length move intent for a side, or null when nothing is held. */
  moveIntentOf?(side: string): CombatPosYd | null;
  // The sides the player moves as ONE unit. The party bubble (`cfg.partyFollowYd`) tows a member only
  // while it is in here with the player, so a companion sent on its own holds ground. Null = every side.
  setFollowGroup?(sides: readonly string[] | null): boolean;
  followGroupOf?(): readonly string[] | null;
  // The motion ownership latch: on, the AI never gap-closes this unit while its rotation is untouched.
  // Separate from a move order because "I am driving" must survive the moment a key is released.
  setManualMotion?(side: string, on: boolean): boolean;
  manualMotionOf?(side: string): boolean;
  // The RTS combat stance for a friendly side: retaliate by default, passive walks then stands, hold
  // freezes motion while keeping the rotation, and patrol cycles the last two waypoints.
  setUnitStance?(
    side: string,
    stance: 'retaliate' | 'passive' | 'hold' | 'patrol',
    opts?: { patrolWaypoints?: readonly CombatPosYd[] },
  ): boolean;
  unitStanceOf?(side: string): 'retaliate' | 'passive' | 'hold' | 'patrol';
  // Re-anchor a friendly's hold-ground bubble (`friendlyHoldYd` sessions). The BG screen uses it to keep
  // companion pets tethered to their owner instead of their spawn point.
  setUnitAnchor(side: string, pos: CombatPosYd): void;
  // Attach or clear the dungeon nav flags after open, since a floor shell often mounts before the async
  // bake lands. Omitting the sight flag leaves it alone: a late bake must not silently un-gate it.
  setFloorFlags?(opts?: { clampOnly?: boolean; los?: boolean }): void;
  // Move the roof over an already-open session. The continuous shell is ONE session for a whole run, so
  // the roof belongs to the current pull — Zul'Gurub alone crosses it 32 times.
  setOutdoors?(outdoors: boolean): void;
  /** Current player focus combatant id. */
  playerTargetId(): CombatantId;
  // Pull-sequence spent spell/item ids for one unit, maintained as events are pushed. Rebuilding these from
  // `events` is O(whole run) in an endless session — see push().
  pullSpentSpellsFor?(side: Side): ReadonlySet<number>;
  pullSpentItemsFor?(side: Side): ReadonlySet<number>;
  // The engine-built rotation snapshot for one unit, the same object companion providers get. Null only
  // when the side is absent; a dead unit still reports. A pinned foe overrides the engine's own pick.
  rotationSnapshot(side: Side, foeSide?: string): import('../../domain/rotation/types.ts').RotationSnapshot | null;
  // Party interrupt claim: true when another living ally already owns the kick on this casting target (so
  // the next free interrupt waits or covers a miss).
  interruptClaimedByOther(targetId: CombatantId, actorId: CombatantId): boolean;
  // Party dispel claim: true when another living ally already owns this (target, category)
  // (Tranq/Purge/Cleanse rota). Cite: AUTOPILOT-PLAN §4 row 21.
  dispelClaimedByOther(targetId: CombatantId, actorId: CombatantId, cat: number): boolean;
  // Inject a living ALLY mid-fight from a spec. Same seat machinery as a friendly summon; the caller
  // is a battleground whose own NPCs fight beside the party (domain/bg/avSession.ts).
  injectAlly?(spec: CombatantSpec, position?: CombatPosYd, opts?: { side?: string }): CombatantId | null;
  // Mid-fight inject on the EventAI summon path; passive = no threat seed. `side` forces the seat (tick
  // seam): the far side takes the name this side answered, or the rosters diverge after the first death.
  injectEnemy(
    spec: CombatantSpec,
    position?: CombatPosYd,
    opts?: { passive?: boolean; side?: string },
  ): CombatantId | null;
  // The seat a world guid currently occupies, or null. Derived from the roster, never a kept map: a side is
  // recycled between bodies and the guid is the unit. Cite: ENGINE-REBUILD E1.0.
  sideOfGuid?(guid: number): CombatantId | null;
  /** The level this seat's unit was built at (`spec.level`), or undefined for an unknown seat. */
  unitLevelOf?(side: string): number | undefined;
  /** The world guid in a seat, or null when the world never minted one. */
  guidOfSide?(side: string): number | null;
  // Record a world id on a seat combat created itself (a ScriptDev summon the live layer then mirrors into
  // the world). Refuses on a seat that already has one - E1.0 mints once.
  stampUnitGuid?(side: string, guid: number): boolean;
  // The un-bind half: this seat is no longer the world body it was bound to. De-stream drops a living body
  // from the fight, so the seat stops being it while it goes on existing.
  releaseUnitGuid?(side: string, expectGuid?: number): boolean;
  // AttackStart threat seed on a living enemy already in the session (passive floor pool that just detected
  // the party). No-op if side unknown / dead.
  seedEnemyThreat?(enemySide: string, on?: CombatantId, opts?: { force?: boolean }): boolean;
  // Endless floor wipe/disengage: set every living enemy to 0 HP so inject can recycle slots. No-op /
  // absent on non-endless product sessions is fine.
  disengageAllEnemies?(): number;
  // Drop only the listed living enemy sides (hp → 0). Passives not listed stay in the pool. Prefer this
  // over disengageAllEnemies on wipe/evade so stream maps do not wipe.
  disengageEnemySides?(sides: readonly string[]): number;
  // The ally-block mirror, for injected friendly bodies only (spec.summonOwnerSide set). A battleground
  // guard the fight has marched away from gives its seat back instead of holding it all match.
  disengageAllySides?(sides: readonly string[]): number;
  // Clear threat + full heal on a living enemy — back to passive (evade / wipe survivor). Keeps the side in
  // the session pool; no re-inject thrash.
  releaseEnemyToPassive?(enemySide: string): boolean;
  // Strip every effect of a spell on the named combatant and reverse all combat side-effects. Returns
  // how many rows went, and 0 when the side is unknown or holds no such aura.
  removeAurasDueToSpell(side: CombatantId | Side, spellId: number): number;
  // Cast start forwards skipStealth / skipInvisibility / exceptSpellId. Cite: Unit.cpp:5247-5251.
  removeAurasWithInterruptFlags?(
    side: string | Side,
    flags: number,
    reason: string,
    opts?: { skipStealth?: boolean; exceptSpellId?: number; skipInvisibility?: boolean },
  ): void;
  // This side surrenders: the other duelist wins and the fight ends on this call. Before the countdown
  // it would be an interrupt instead, which this session never sees — the count runs before it mounts.
  forfeit(side: CombatantId | Side): boolean;
  // The two cancel-aura gate inputs the sheet cannot answer: whether something else drives the player,
  // and whether the player is the holder's caster. Reads the charm flag directly, or a possess is missed.
  auraCancelState?(spellId: number): { possessed: boolean; ownAura: boolean } | null;
  // SetDeathPrevention — clamp lethal hits at 1 HP while enabled. External script seams call this and
  // the encounter reset arms it. Cite: CreatureAI.cpp:130-135; boss_razorgore.cpp:67.
  setDeathPrevention?(side: CombatantId | Side, enabled: boolean): boolean;
  // Drop the unit's shapeshift (buff-cancel). Ghost Wolf is a 3s cast — recast cannot leave while walking,
  // so autopilot cancels instead of re-casting.
  leaveForm?(side?: CombatantId | Side): void;
  // Drop this unit's hardcast and take its channel down, with the channel's auras. The same path a plain
  // move order uses. False when the side is unknown or dead.
  stopCasting?(side?: CombatantId | Side): boolean;
  // Switch auto-attack on or off without touching motion or the rotation. A passive stance also stops
  // swinging, but freezes movement too, so it cannot stand in for this.
  setAutoAttack?(side: CombatantId | Side | string, on: boolean): boolean;
  /** Per-dungeon-run InstanceData store (ACTION_T_SET_INST_DATA). Cite: CreatureEventAI.cpp ~1044–1054. */
  getInstanceData(field: number): number;
  /** Snapshot of all instance data fields set this session. */
  instanceDataView(): ReadonlyMap<number, number>;
}
