// createSession and simulate — deterministic, seeded, fixed-tick combat. Two consumers advance the
// same session: simulate runs it to the end with the AI, and the UI feeds action-bar taps in.

import type { SpellDef } from '../../data/schema.ts';
import type { Rng } from '../core/rng.ts';
import { channelInterruptCtx, interruptChannel, maybeCancelChannelOnMove } from './channel.ts';
export { MAX_SESSION_EVENTS } from './sessionStepWrap.ts';
// Rows kept in the trim-proof death roll. A boss fight never reaches this; a continuous world session
// can, and the total stays exact. Oldest rows are the graded ones, so the cap drops later deaths.
const MAX_TRACKED_DEATHS = 512;
// Bucket for damage whose row carried no `target`. Named rather than folded into a guess: a non-zero
// reading here means the attribution is lossy and the per-role columns undercount.
export const UNATTRIBUTED_VICTIM = '_unattributed';
import type { CombatEvent, Side, TotemSide, EnemySide } from '../core/events.ts';
import { isEnemySide, enemySideAt, allySideAt, MAX_ALLIES, MECHANIC_EVENT_KINDS } from '../core/events.ts';
import { TUNING } from './formulas.ts';
import {
  isDetectedAtDistance,
} from '../../domain/spells/stealth.ts';
import { combatPerf } from './perfSink.ts';
import { type GroundPool } from '../game/dynamicObject.ts';
import { type CombatPosYd } from './combatGeometry.ts';
import { stripExclusiveSiblingSources, type AreaAuraSource } from './areaAura.ts';
import { resolveCombatSpell, isInterpreterEnabled, durMs } from '../spells/interpreter/index.ts';
import { ThreatManager, type CombatantId } from './threat.ts';

// ---- Wave 4 S24–S27: types / predicates / roles / fighter factory ----
import type {
  WeaponProfile,
  AllyActionProvider,
  CombatantSpec,
  CombatItem,
  CombatConfig,
  CombatResult,
  ActiveEffect,
  CombatAction,
  SimTickInputs,
  Fighter,
  CombatSession,
} from './types.ts';
import type { QueuedCast } from './session-types.ts';
// P12: types / predicates / roles re-export only from combat.ts barrel (not here).
import { makeFighter } from './fighterFactory.ts';
import type { CombatContext, PendingMissile } from './context.ts';
import type { ScriptDevAction } from '../../domain/scriptdev/types.ts';
import { installDispelReflect } from './dispelReflect.ts';
import { armEnemyCastState, installSessionInject } from './sessionInject.ts';
import { installSessionGeometry } from './sessionGeometry.ts';
import { installSessionPools } from './sessionPools.ts';
import { installSessionFocus } from './sessionFocus.ts';
import { installSessionDeaths } from './sessionDeaths.ts';
import { installPowerForm } from './powerForm.ts';
import { installInterruptAuras } from './interruptAuras.ts';
import { DAZED_SPELL_ID } from './facing.ts';
import { installCrowdControl } from './crowdControl.ts';
import { seedFighterSchoolImmunities } from './seedSchoolImmunities.ts';
import { installThreatOps } from './threatOps.ts';
import { installEventAi } from './eventAi.ts';
import { installProcsDamage } from './procsDamage.ts';
import { installApplySpell } from './applySpell.ts';
import { installAoeCast } from './aoeCast.ts';
import { installItemUse } from './itemUse.ts';
import { installWeapon } from './weapon.ts';
import { installPickAction } from './pickAction.ts';
import { installStepSession } from './stepSession.ts';
import { buildSessionView } from './sessionView.ts';
import { buildCombatSessionApi } from './sessionApi.ts';
import {
  seedAllOocEffects,
  seedDamageShields as seedDamageShieldsInto,
  seedProcTriggers as seedProcTriggersInto,
  seedSchoolAbsorbs as seedSchoolAbsorbsInto,
  seedManaShields as seedManaShieldsInto,
  seedRestoreHealth as seedRestoreHealthInto,
} from './seedOocEffects.ts';
import { seedDisplayAurasInto } from './seedDisplayAuras.ts';
import { totalStealthStrength } from '../../domain/spells/stealth.ts';
import {
  dueInstantOfEffect,
  dueInstantOfPool,
  lowerPeriodicDue,
  PERIODIC_DUE_NONE,
  recomputePeriodicDue as recomputePeriodicDueFrom,
} from './periodicDue.ts';

// SoR swing formula lives on combat.ts barrel; local copy for install deps (same coeffs).
// Cite: combat.ts sealRighteousnessSwing; UnitAuraProcHandler.cpp:1116-1134.
function sealRighteousnessSwing(coeff: number, weapon: WeaponProfile): number {
  const speed = weapon.speedMs / 1000;
  const scaled = coeff * 1.2 * 1.03 * speed / 100;
  const base = weapon.twoHand ? (1.20 * scaled + 1) : (0.85 * Math.ceil(scaled) - 1);
  return Math.max(1, Math.floor(base + 0.03 * (weapon.dmgMin + weapon.dmgMax) / 2) + 1);
}

/** SI5: pre-resolve kit spells so AI roleOf / ability lists see interpreter effects. */
function materializeSpecForCombat(spec: CombatantSpec): CombatantSpec {
  if (!isInterpreterEnabled()) return spec;
  return {
    ...spec,
    spells: spec.spells.map((s) => resolveCombatSpell(s)),
  };
}

export function createSession(
  playerSpec: CombatantSpec,
  enemySpec: CombatantSpec | CombatantSpec[],
  rng: Rng,
  cfg: CombatConfig = {},
  petSpec: CombatantSpec | null = null,
  allySpecs: CombatantSpec[] | null = null,
): CombatSession {
  const tickMs = cfg.tickMs ?? TUNING.tickMs;
  const maxMs = cfg.maxMs ?? TUNING.maxMs;

  // May be EMPTY: a continuous floor session opens with no enemy and every body arrives by inject.
  // Nothing in the engine needs a primary — the two readers are 1v1-shaped reporting.
  const enemySpecs = Array.isArray(enemySpec) ? enemySpec : [enemySpec];

  const player = makeFighter('player', materializeSpecForCombat(playerSpec));
  player.sitting = cfg.sitting ?? false;
  // Wave 4A: N enemies. Index 0 keeps side `'enemy'` for 1v1 event/UI back-compat.
  const enemies: Fighter[] = enemySpecs.map((spec, i) => makeFighter(enemySideAt(i), materializeSpecForCombat(spec)));
  // The primary enemy, absent on a floor session. Written as a ternary, NOT an annotated const: with
  // unchecked indexed access off, control-flow narrows a const straight back past the annotation.
  const enemy: Fighter | undefined = enemies.length > 0 ? enemies[0] : undefined;
  // Optional player-side pet. Everything pet-related is guarded by `pet != null`
  // so a fight without a pet behaves EXACTLY as the 1v1 engine always has (no extra rng draws).
  const pet = petSpec ? makeFighter('pet', materializeSpecForCombat(petSpec)) : null;
  // Friendly companions as real combatants. Every ally touchpoint iterates this array, so zero allies
  // keeps a solo session byte-identical — no extra rng draws and no extra events.
  const allyList = allySpecs ?? [];
  if (allyList.length > MAX_ALLIES) {
    throw new Error(`createSession allows at most ${MAX_ALLIES} allies (got ${allyList.length})`);
  }
  const allies: Fighter[] = allyList.map((spec, i) => makeFighter(allySideAt(i), materializeSpecForCombat(spec)));
  // The companion -> pet edge, off the seat-indexed config and onto the units, once (E1.1). Every
  // reader asks the unit from here on; cfg.allyPetIndex stays the game layer's input contract.
  for (let i = 0; i < allies.length; i++) {
    const pIdx = cfg.allyPetIndex?.[i];
    if (pIdx == null || pIdx < 0 || pIdx >= allies.length) continue;
    allies[i]!.spec.petSide = allies[pIdx]!.side;
  }
  // The player holds seat 0 of subgroup 0 and their pet rides with them; the ally seats are dealt by
  // whoever built the party. Stamped here so no caller can leave the player ungrouped.
  player.spec.subgroup ??= 0;
  if (pet) pet.spec.subgroup ??= 0;

  // Per-enemy creature cast scheduler — the EventAI subset plus the spell list, with full EventAI
  // state beside it. Pets and the player keep the class-heuristic picker.
  const enemyCastBySide = new Map<EnemySide, import('./context.ts').EnemyCastState>();
  const initialResetActions = new Map<EnemySide, ScriptDevAction[]>();
  for (const ef of enemies) {
    const acts: ScriptDevAction[] = [];
    enemyCastBySide.set(ef.side as EnemySide, armEnemyCastState(ef, rng, acts));
    if (acts.length > 0) initialResetActions.set(ef.side as EnemySide, acts);
  }

  // Per-dungeon-run InstanceData store (ACTION_T_SET_INST_DATA). Cite: CreatureEventAI.cpp ~1044–1054;
  // ScriptDev instance scripts consume in S9/S10.
  const instanceData = new Map<number, number>(
    Object.entries(cfg.instanceData ?? {}).map(([k, v]) => [Number(k), v | 0]),
  );
  // Guardian ownership for DESPAWN_GUARDIANS — summoner side → set of enemy sides. Cite:
  // CreatureEventAI.cpp ACTION_T_DESPAWN_GUARDIANS ~1283–1295.
  const guardianSidesBySummoner = new Map<Side, Set<Side>>();

  // Up to 4 totems PER SHAMAN (Unit.h:2625 is a per-unit slot array), keyed by the totem's side.
  // Empty until someone casts summon_totem — zero totems means no extra RNG.
  const totems = new Map<TotemSide, Fighter>();
  /** Totem side → owner/name — survives UnSummon so DPSMate can merge guardian damage. */
  const totemOwnerMeta = new Map<TotemSide, { ownerSide: Side; name: string }>();

  // Wave N1 — session-owned DynamicObject ground pools (Consecration / Blizzard / RoF).
  // Empty until a PERSISTENT_AREA_AURA (or aoe+dot bake) is cast — zero pools ⇒ no extra RNG.
  const groundPools: GroundPool[] = [];
  /** SpellEntry.speed missiles — empty until a geometry session launches one. */
  const pendingMissiles: PendingMissile[] = [];
  let nextGroundPoolId = 1; // bumped via ctx.nextGroundPoolId (installed below, after ctx exists)

  // Live class-A area-aura holders. Empty until one is applied, so a fight without party auras does
  // zero extra work. Cite: SpellAuras.cpp AreaAura::Update; RANGE-ARCHITECTURE §4.8.
  const areaAuraSources: AreaAuraSource[] = [];
  // SPELL_ATTR_DO_NOT_DISPLAY ids seen this session (sessionView drops their aura chips).
  const hiddenAuraSpellIds = new Set<number>();

  // Per-unit combat yards relative to the pull origin, mutable when seeded and absent on the legacy
  // no-geometry path. The z is carried, not stripped: it is the only trustworthy storey on a stack.
  let unitPositionsMutable: Record<string, CombatPosYd> | undefined = cfg.unitPositionsYd
    ? Object.fromEntries(
      Object.entries(cfg.unitPositionsYd).map(([k, v]) => [k, {
        x: v.x,
        y: v.y,
        ...(v.z != null && Number.isFinite(v.z)
          ? { z: v.z }
          : (!isEnemySide(k) && cfg.unitPositionsYd?.player?.z != null
            ? { z: cfg.unitPositionsYd.player.z }
            : {})),
      }]),
    )
    : undefined;
  // Geometry helpers (posOf/setPos/placeEnemyAt/…) installed via installSessionGeometry after ctx.

  // Each creature that can hold a threat list owns its own manager. The player, pets and totems are
  // list ENTRIES and own none. Cite: ThreatManager.cpp; Unit.cpp AddThreat / DeleteThreatList.
  const threatByOwner = new Map<CombatantId, ThreatManager>();
  for (const ef of enemies) {
    threatByOwner.set(ef.side, new ThreatManager(ef.side));
  }
  // AttackStart seed — a multi-enemy pack co-pulls as already engaged, while a solo mob waits for the
  // first threat unless the caller asks otherwise.
  {
    const seed =
      cfg.seedAttackStart === true
      || (cfg.seedAttackStart !== false && enemies.length > 1);
    if (seed) {
      // It opens on the party's tank, which is the PLAYER when the player is the one tanking.
      // Preferring a companion over a tanking human treated the human as a separate unit.
      let seedId: CombatantId = 'player';
      if (player.spec.groupRole !== 'tank') {
        for (const al of allies) {
          if (al.hp > 0 && al.spec.groupRole === 'tank') {
            seedId = al.side;
            break;
          }
        }
      }
      for (const ef of enemies) {
        threatByOwner.get(ef.side)!.addThreatDirectly(seedId, 1, false);
      }
    }
  }
  const threatOf = (owner: CombatantId | Fighter): ThreatManager | undefined => {
    const id = typeof owner === 'string' ? owner : owner.side;
    return threatByOwner.get(id);
  };
  // Seed pre-fight cooldowns (remainings from world state or prior fight) as relative readyAt from t=0.
  if (cfg.initialSpellCooldowns) {
    for (const [idStr, rem] of Object.entries(cfg.initialSpellCooldowns)) {
      const r = Number(rem);
      if (r > 0) player.cooldowns.set(Number(idStr), r);
    }
  }
  if (cfg.initialCategoryCooldowns) {
    for (const [cStr, rem] of Object.entries(cfg.initialCategoryCooldowns)) {
      const r = Number(rem);
      if (r > 0) player.categoryCooldowns.set(Number(cStr), r);
    }
  }
  const effects: ActiveEffect[] = [];
  // A structural version of `effects`, bumped from the array itself rather than from ~400 call sites,
  // so a new push cannot skip it. In-place field edits need no bump: the index holds the same objects.
  let effectsVersion = 0;
  let nextPeriodicDue = PERIODIC_DUE_NONE;
  const touchPeriodicDue = (at: number): void => {
    nextPeriodicDue = lowerPeriodicDue(nextPeriodicDue, at);
  };
  const touchEffect = (e: ActiveEffect): void => {
    touchPeriodicDue(dueInstantOfEffect(e));
  };
  const touchGroundPool = (pool: GroundPool): void => {
    touchPeriodicDue(dueInstantOfPool(pool));
  };
  const recomputePeriodicDue = (): void => {
    nextPeriodicDue = recomputePeriodicDueFrom(effects, totems.values(), groundPools);
  };
  // Assigned after bySide exists — seed OOC speed auras leave fighters speedDirty=true.
  let noteSpeedAura: ((e: ActiveEffect) => void) | null = null;
  let noteDecideAura: ((e: ActiveEffect) => void) | null = null;
  // Effects bucketed by the unit they sit on. The view used to walk the GLOBAL array twice per unit,
  // 8.3% of tick self time at 40 units. Rebuilt on the version, so it is exact, not eventual.
  const effectsByTarget = new Map<Side, ActiveEffect[]>();
  const effectsBySource = new Map<Side, ActiveEffect[]>();
  let effectsIndexVersion = -1;
  const NO_EFFECTS: ActiveEffect[] = [];
  const indexAdd = (e: ActiveEffect): void => {
    const on = effectsByTarget.get(e.target);
    if (on === undefined) effectsByTarget.set(e.target, [e]);
    else on.push(e);
    const from = effectsBySource.get(e.source);
    if (from === undefined) effectsBySource.set(e.source, [e]);
    else from.push(e);
  };
  const indexDrop = (e: ActiveEffect): void => {
    const on = effectsByTarget.get(e.target);
    if (on) {
      const i = on.lastIndexOf(e);
      if (i >= 0) on.splice(i, 1);
      if (on.length === 0) effectsByTarget.delete(e.target);
    }
    const from = effectsBySource.get(e.source);
    if (from) {
      const i = from.lastIndexOf(e);
      if (i >= 0) from.splice(i, 1);
      if (from.length === 0) effectsBySource.delete(e.source);
    }
  };
  const rebuildEffectIndex = (): void => {
    if (effectsIndexVersion === effectsVersion) return;
    effectsByTarget.clear();
    effectsBySource.clear();
    for (const e of effects) indexAdd(e);
    effectsIndexVersion = effectsVersion;
  };
  const rawPush = Array.prototype.push;
  const rawSplice = Array.prototype.splice;
  effects.push = function push(...items: ActiveEffect[]): number {
    const indexLive = effectsIndexVersion === effectsVersion;
    effectsVersion++;
    if (noteSpeedAura) for (const e of items) noteSpeedAura(e);
    if (noteDecideAura) for (const e of items) noteDecideAura(e);
    for (const e of items) touchEffect(e);
    const n = rawPush.apply(this, items);
    if (indexLive) {
      for (const e of items) indexAdd(e);
      effectsIndexVersion = effectsVersion;
    }
    return n;
  };
  effects.splice = function splice(...args: [number, number?, ...ActiveEffect[]]): ActiveEffect[] {
    const indexLive = effectsIndexVersion === effectsVersion;
    const removed = rawSplice.apply(this, args as unknown as [number, number]);
    effectsVersion++;
    if (indexLive) {
      for (const e of removed) indexDrop(e);
      for (let i = 2; i < args.length; i++) if (args[i]) indexAdd(args[i] as ActiveEffect);
      effectsIndexVersion = effectsVersion;
    }
    if (noteSpeedAura) {
      for (const e of removed) noteSpeedAura(e);
      for (let i = 2; i < args.length; i++) if (args[i]) noteSpeedAura(args[i] as ActiveEffect);
    }
    if (noteDecideAura) {
      for (const e of removed) noteDecideAura(e);
      for (let i = 2; i < args.length; i++) if (args[i]) noteDecideAura(args[i] as ActiveEffect);
    }
    for (let i = 2; i < args.length; i++) if (args[i]) touchEffect(args[i] as ActiveEffect);
    return removed;
  };
  // A refresh that re-sources a live row moves it between by-source buckets; writing the field in
  // place left it parked under the old caster and a paladin aura swap then stripped nothing.
  const setEffectSource = (e: ActiveEffect, side: Side): void => {
    if (e.source === side) return;
    const indexLive = effectsIndexVersion === effectsVersion;
    if (indexLive) indexDrop(e);
    e.source = side;
    if (indexLive) indexAdd(e);
  };
  // Version-keyed skips (heartbeat resists) read fields a refresh edits in place; bump for them.
  const bumpEffectsVersion = (): void => {
    const indexLive = effectsIndexVersion === effectsVersion;
    effectsVersion++;
    if (indexLive) effectsIndexVersion = effectsVersion;
  };
  const effectsOn = (side: Side): ActiveEffect[] => {
    rebuildEffectIndex();
    return effectsByTarget.get(side) ?? NO_EFFECTS;
  };
  const effectsFrom = (side: Side): ActiveEffect[] => {
    rebuildEffectIndex();
    return effectsBySource.get(side) ?? NO_EFFECTS;
  };
  const events: CombatEvent[] = [];

  // Pre-pull out-of-combat shields, absorbs, HoTs and display auras. The party in turn order is the
  // shape the store serves once pools install, built by hand here only because this runs first.
  seedAllOocEffects({
    party: [player, ...(pet ? [pet] : []), ...allies],
    player, effects, rng,
    posOf: (side) => unitPositionsMutable?.[side],
  });
  // Single-arg wrappers for installApplySpell dep bag (closed over session effects/rng).
  const seedDamageShields = (f: Fighter): void => seedDamageShieldsInto(f, effects);
  const seedProcTriggers = (f: Fighter): void =>
    seedProcTriggersInto(f, effects, (side) => unitPositionsMutable?.[side]);
  const seedSchoolAbsorbs = (f: Fighter): void => seedSchoolAbsorbsInto(f, effects, rng);
  const seedManaShields = (f: Fighter): void => seedManaShieldsInto(f, effects, rng);
  const seedRestoreHealth = (f: Fighter): void => seedRestoreHealthInto(f, effects);
  const seedDisplayAuras = (f: Fighter): void => seedDisplayAurasInto(f, effects);

  // Pull detect: only when cfg.encounterDistanceYd is set (opt-in). Product unitPositions alone
  // must not strip the opener window (KI-872). breakStealth is defined later; applied at return.

  let t = 0;
  let done = false;
  let winner: Side | 'timeout' | null = null;
  let aiPlayer = false;
  // Last non-aura/resource event time. Push still re-arms it; fights no longer abort on it.
  let lastActionT = 0;
  let eventsDropped = 0;
  /** Trim-proof count of scripted-mechanic events (see push + CombatResult.mechanics). */
  const mechanicTally = new Map<CombatEvent['kind'], { count: number; firstT: number; lastT: number }>();
  /** Trim-proof damage landed per victim side (see push + CombatResult.damageTakenBySide). */
  const damageTakenBySide = new Map<string, number>();
  /** Most recent damaging row per victim — the killing blow the next `death` row reads. */
  const lastHitBySide = new Map<string, { by: Side; name: string }>();
  /** Trim-proof death roll in order (see push + CombatResult.deaths). Capped; deathsTotal counts all. */
  const deathRoll: { side: Side; t: number; by?: Side; cause?: string }[] = [];
  let deathsTotal = 0;
  const deathEmitted = new Set<string>();
  // TargetCreatureType cast refusals already logged this fight (one line per spell).
  const invalidTargetReported = new Set<number>();
  let soulShardsGained = 0;

  // Player and pet focus among the pack, defaulting to the primary and re-targeting when it dies. No
  // primary starts on the PLAYER, which is what the focus stands down to when nothing bears threat.
  let playerFocus: Fighter = enemy ?? player;

  // Soul Shard on kill: a target that dies under a DoT/aura with grantsSoulShardOnKill (or from a
  // killing spell with that flag) yields item 6265 in resolveFight. Wave D bake; not an id-Set.

  // In-combat consumables. Counts and cooldowns are local copies so the caller's bags are not mutated
  // mid-fight; the spent totals reconcile at the end. Each unit has an independent kit.
  const playerItems: CombatItem[] = (playerSpec.items ?? []).map((it) => ({ ...it, effect: { ...it.effect } }));
  const itemCd = new Map<number, number>();
  const itemsSpent = new Map<number, number>();
  const itemsGained = new Map<number, number>();
  // One side-keyed store for every non-player bag. Seat order still decides who gets one; it is
  // no longer how anyone finds it.
  const unitItems = new Map<Side, CombatItem[]>();
  const unitItemCd = new Map<Side, Map<number, number>>();
  const unitItemsSpent = new Map<Side, Map<number, number>>();
  const unitItemsGained = new Map<Side, Map<number, number>>();
  for (const al of allies) {
    unitItems.set(al.side, (al.spec.items ?? []).map((it) => ({ ...it, effect: { ...it.effect } })));
    unitItemCd.set(al.side, new Map());
    unitItemsSpent.set(al.side, new Map());
  }
  // BG enemy bots carry the same PvP kits (companionSpec fills spec.items for them too), into
  // the same store. Their spent totals reconcile nowhere — enemies own no persistent inventory.
  for (const ef of enemies) {
    unitItems.set(ef.side, (ef.spec.items ?? []).map((it) => ({ ...it, effect: { ...it.effect } })));
    unitItemCd.set(ef.side, new Map());
    unitItemsSpent.set(ef.side, new Map());
  }
  // Rotation providers off the two seat-indexed config arrays and onto the seats, once. The same move
  // as the bags above: seat order still decides who gets one, it is no longer how anyone finds it.
  const unitActionProvider = new Map<Side, AllyActionProvider>();
  for (let i = 0; i < allies.length; i++) {
    const p = cfg.allyActionProviders?.[i];
    if (p) unitActionProvider.set(allies[i]!.side, p);
  }
  for (let i = 0; i < enemies.length; i++) {
    const p = cfg.enemyActionProviders?.[i];
    if (p) unitActionProvider.set(enemies[i]!.side, p);
  }

  // Pools/faction helpers installed via installSessionPools after ctx + geometry.
  // Focus / manual maps — on ctx for sessionPools free-fire + inject recycle.
  let explicitEnemyFocus: EnemySide | null = null;
  const allyManualTarget = new Map<Side, EnemySide>();
  // Pet bar state. The spec carries the player's persisted choice; a fresh pet is follow and defensive
  // like a newly summoned one. Cite: Pet.cpp SetReactState; CharmInfo::SetCommandState.
  let petCommand: 'attack' | 'follow' | 'stay' = pet?.spec.petCommand ?? 'follow';
  let petReact: 'aggressive' | 'defensive' | 'passive' = pet?.spec.petReact ?? 'defensive';
  let petManualTarget: EnemySide | null = null;
  let petStayPos: CombatPosYd | null = null;
  // A pet that starts a fight already at heel is not retreating. Cite: PetHandler.cpp:182.
  let petRetreating = false;

  // ---- Wave 4 S28/S29: CombatContext bag + dispel/reflect peel ----
  const ctx = {
    get t() { return t; },
    set t(v: number) { t = v; },
    get ended() { return done; },
    set ended(v: boolean) { done = v; },
    get winner() { return winner; },
    set winner(v: Side | 'timeout' | null) { winner = v; },
    get aiPlayer() { return aiPlayer; },
    set aiPlayer(v: boolean) { aiPlayer = v; },
    tickMs,
    maxMs,
    rng,
    cfg,
    // creature_template_classlevelstats BaseDamage, for SCALES_WITH_CREATURE_LEVEL only.
    creatureBaseDamageAt: cfg.creatureBaseDamageAt,
    // The rank ladder, for aura identity.
    spellChainOf: cfg.spellChainOf,
    // Both fall back to the global spell store when a caller wired only `spellOf`. Every PvP session
    // did: no creature could daze, and Feign Death never dropped on a move (interruptAuras.ts:18).
    dazeSpell: cfg.dazeSpell ?? cfg.spellOf?.(DAZED_SPELL_ID),
    auraInterruptFlagsOf: cfg.auraInterruptFlagsOf
      ?? (cfg.spellOf ? (id: number) => (cfg.spellOf!(id)?.auraInterruptFlags ?? 0) | 0 : undefined),
    // The global spell store, for triggered payloads that sit in no kit.
    spellOf: cfg.spellOf,
    player,
    // `enemies` and `allies` are NOT on the context: the by-side map is the storage and the block
    // views are the ordered readers. The locals exist only to seed it and finish construction.
    enemy,
    pet,
    petUnsummonedHp: null,
    totems,
    effects,
    effectsOn,
    effectsFrom,
    setEffectSource,
    bumpEffectsVersion,
    effectsVersion: () => effectsVersion,
    get nextPeriodicDue() { return nextPeriodicDue; },
    touchEffect,
    touchPeriodicDue,
    touchGroundPool,
    recomputePeriodicDue,
    events,
    threatByOwner,
    enemyCastBySide,
    groundPools,
    areaAuraSources,
    hiddenAuraSpellIds,
    pendingMissiles,
    get unitPositionsMutable() { return unitPositionsMutable; },
    set unitPositionsMutable(v: any) { unitPositionsMutable = v; },
    posGen: 0,
    get explicitEnemyFocus() { return explicitEnemyFocus; },
    set explicitEnemyFocus(v: EnemySide | null) { explicitEnemyFocus = v; },
    allyManualTarget,
    get petCommand() { return petCommand; },
    set petCommand(v: 'attack' | 'follow' | 'stay') { petCommand = v; },
    get petReact() { return petReact; },
    set petReact(v: 'aggressive' | 'defensive' | 'passive') { petReact = v; },
    get petManualTarget() { return petManualTarget; },
    set petManualTarget(v: EnemySide | null) { petManualTarget = v; },
    get petStayPos() { return petStayPos; },
    set petStayPos(v: CombatPosYd | null) { petStayPos = v; },
    get petRetreating() { return petRetreating; },
    set petRetreating(v: boolean) { petRetreating = v; },
    instanceData,
    guardianSidesBySummoner,
    playerItems,
    itemCd,
    itemsSpent,
    itemsGained,
    unitItems,
    unitItemCd,
    unitItemsSpent,
    unitItemsGained,
    unitActionProvider,
    deathEmitted,
    invalidTargetReported,
    interruptClaim: new Map<CombatantId, CombatantId>(),
    dispelClaim: new Map<string, CombatantId>(),
    rezClaim: new Map<CombatantId, CombatantId>(),
    get playerFocus() { return playerFocus.side; },
    get playerFocusFighter() { return playerFocus; },
    set playerFocusFighter(v: Fighter) { playerFocus = v; },
    get soulShardsGained() { return soulShardsGained; },
    set soulShardsGained(v: number) { soulShardsGained = v; },
    get lastActionT() { return lastActionT; },
    set lastActionT(v: number) { lastActionT = v; },
    get eventsDropped() { return eventsDropped; },
    set eventsDropped(v: number) { eventsDropped = v; },
    push: null as unknown as CombatContext['push'],
    fightersOrder: null as unknown as CombatContext['fightersOrder'],
    partyUnits: null as unknown as CombatContext['partyUnits'],
    bySide: null as unknown as CombatContext['bySide'],
    factionOf: null as unknown as CombatContext['factionOf'],
    factionOfFighter: null as unknown as CombatContext['factionOfFighter'],
    livingHostilesFor: null as unknown as CombatContext['livingHostilesFor'],
    livingFriendlies: null as unknown as CombatContext['livingFriendlies'],
    friendlyPoolOf: null as unknown as CombatContext['friendlyPoolOf'],
    lowestHpFriendlyOf: null as unknown as CombatContext['lowestHpFriendlyOf'],
    foePoolOf: null as unknown as CombatContext['foePoolOf'],
    livingEnemies: null as unknown as CombatContext['livingEnemies'],
    livingCombatEnemies: null as unknown as CombatContext['livingCombatEnemies'],
    isCharmed: null as unknown as CombatContext['isCharmed'],
    isUnattackable: null as unknown as CombatContext['isUnattackable'],
    threatOf: null as unknown as CombatContext['threatOf'],
    distanceBetween: null as unknown as CombatContext['distanceBetween'],
    posOf: null as unknown as CombatContext['posOf'],
    setPos: null as unknown as CombatContext['setPos'],
    isMoving: null as unknown as CombatContext['isMoving'],
  } as CombatContext;

  // The ground-pool case bumps the session counter through the context. The peel left a bare local
  // increment behind, which was a ReferenceError on every persistent-area cast.
  ctx.nextGroundPoolId = () => nextGroundPoolId++;
  ctx.threatOf = threatOf;

  // P2 geometry → P3 pools (pools read posOf/distanceBetween/posGen).
  installSessionGeometry(ctx);
  // Liveness: non-finite HP, from bad damage math, and non-positive are both dead. The negated
  // comparison is intentional — NaN <= 0 is false in JS, which left mobs immortal after a NaN.
  const dead = (f: Fighter): boolean => !(f.hp > 0);
  (ctx as any).dead = dead;
  installSessionPools(ctx, { dead, seedEnemies: enemies, seedAllies: allies });

  // Local aliases for remaining createSession bodies (bound once after install).
  const posOf = ctx.posOf;
  const setPos = ctx.setPos;
  const distanceBetween = ctx.distanceBetween;
  const placeEnemyAt = ctx.placeEnemyAt!;
  const snapToMesh = ctx.snapToMesh!;
  const fightersOrder = ctx.fightersOrder;
  const bySide = ctx.bySide;
  noteSpeedAura = (e: ActiveEffect): void => {
    if (e.kind !== 'speed') return;
    const f = bySide(e.target);
    if (f.side === e.target) f.speedDirty = true;
  };
  noteDecideAura = (e: ActiveEffect): void => {
    const f = bySide(e.target);
    if (f.side === e.target) f.decideDirty = true;
  };
  const bumpRoster = ctx.bumpRoster!;
  const bumpPool = ctx.bumpPool!;
  const livingEnemies = ctx.livingEnemies;
  const livingCombatEnemies = ctx.livingCombatEnemies;
  const livingHostilesFor = ctx.livingHostilesFor;
  const livingFriendlies = ctx.livingFriendlies;
  const friendlyPoolOf = ctx.friendlyPoolOf;
  const foePoolOf = ctx.foePoolOf;
  const lowestHpFriendlyOf = ctx.lowestHpFriendlyOf;
  const lowestHpFriendly = ctx.lowestHpFriendly!;
  const isCharmed = ctx.isCharmed;
  const isUnattackable = ctx.isUnattackable;
  const factionOf = ctx.factionOf;
  const factionOfFighter = ctx.factionOfFighter;
  const nativeFactionOf = ctx.nativeFactionOf!;
  const enemyHasThreat = ctx.enemyHasThreat!;
  const allEnemiesDead = ctx.allEnemiesDead!;
  const partyWiped = ctx.partyWiped!;
  const preferFocusHostile = ctx.preferFocusHostile!;
  const freeFireHostilesFor = ctx.freeFireHostilesFor!;

  installDispelReflect(ctx);

  // Register or refresh a class-A area-aura holder. Re-casting the same aura from the same holder
  // replaces the entry rather than stacking maintain passes — the C++ holder is one per caster.
  const registerAreaAuraSource = (source: AreaAuraSource): void => {
    source.radiusPending = true;
    // A paladin swapping auras keeps one holder row per spell_group; the old aura leaves every carrier.
    stripExclusiveSiblingSources(areaAuraSources, source, ctx.bySide);
    const i = areaAuraSources.findIndex(
      (s) => s.holderSide === source.holderSide && s.spellId === source.spellId,
    );
    if (i >= 0) areaAuraSources[i] = source;
    else areaAuraSources.push(source);
  };
  ctx.registerAreaAuraSource = registerAreaAuraSource;

  // Party takeover: the rotation KEEPS running while a companion is controlled, so a queued cast wins
  // exactly one pick and a controlled healer never stops healing. The aim rides INSIDE each step.
  const unitCastOrders = new Map<Side, QueuedCast[]>();
  (ctx as { unitCastOrders?: Map<Side, QueuedCast[]> }).unitCastOrders = unitCastOrders;
  // The target of an IN-FLIGHT cast that was aimed explicitly. A finished cast otherwise re-resolves,
  // so a Shackle aimed at a skeleton landed on whatever the priest was fighting. Keyed by spell id.
  const castTargetOverride = new Map<Side, { spellId: number; side: EnemySide }>();
  (ctx as { castTargetOverride?: Map<Side, { spellId: number; side: EnemySide }> })
    .castTargetOverride = castTargetOverride;
  const castDestOverride = new Map<Side, { spellId: number; dest: CombatPosYd }>();
  (ctx as { castDestOverride?: Map<Side, { spellId: number; dest: CombatPosYd }> })
    .castDestOverride = castDestOverride;
  /** Rotation `target: 'other'` aim, set and consumed within one tick (CC on a non-focus mob). */
  const rotationOffTarget = new Map<Side, EnemySide>();
  (ctx as { rotationOffTarget?: Map<Side, EnemySide> }).rotationOffTarget = rotationOffTarget;
  /** Click-to-move / RTS group orders — WAYPOINT QUEUES honored in sessionMotion
   *  (shift-click appends; a plain order replaces the whole queue). */
  const unitMoveOrders = new Map<string, CombatPosYd[]>();
  (ctx as { unitMoveOrders?: Map<string, CombatPosYd[]> }).unitMoveOrders = unitMoveOrders;
  /** Held-direction locomotion (WASD / stick), unit vectors. Stepped in sessionMotion. */
  const unitMoveIntents = new Map<string, CombatPosYd>();
  (ctx as { unitMoveIntents?: Map<string, CombatPosYd> }).unitMoveIntents = unitMoveIntents;
  /** Sides whose motion the player owns — AI gap-close is off for them until released. */
  const unitManualMotion = new Set<string>();
  (ctx as { unitManualMotion?: Set<string> }).unitManualMotion = unitManualMotion;
  /** Player "go here" dests: walk the order; do not stop to pre-cast. */
  const unitHoldCourse = new Set<string>();
  (ctx as { unitHoldCourse?: Set<string> }).unitHoldCourse = unitHoldCourse;
  /** Split-now slots: each unit walks its own dest, not the player's corridor. */
  const unitDirectMove = new Set<string>();
  (ctx as { unitDirectMove?: Set<string> }).unitDirectMove = unitDirectMove;
  /** RTS stance: gap-close policy after move / on stand. Default retaliate (absent = retaliate). */
  type UnitStance = 'retaliate' | 'passive' | 'hold' | 'patrol';
  const unitStance = new Map<string, UnitStance>();
  (ctx as { unitStance?: Map<string, UnitStance> }).unitStance = unitStance;
  /** Full patrol loop when stance is patrol (cycled when the move queue empties). */
  const unitPatrolLoop = new Map<string, CombatPosYd[]>();
  (ctx as { unitPatrolLoop?: Map<string, CombatPosYd[]> }).unitPatrolLoop = unitPatrolLoop;
  /** Drop every manual-motion claim on a side (death, despawn, fight end). */
  const clearManualMotion = (side: string): void => {
    unitMoveOrders.delete(side);
    unitMoveIntents.delete(side);
    unitManualMotion.delete(side);
    unitHoldCourse.delete(side);
    unitDirectMove.delete(side);
    unitStance.delete(side);
    unitPatrolLoop.delete(side);
  };
  // A plain move outranks a cast: cancel the hardcast and the channel so the unit walks now. A
  // shift-queued order leaves the cast alone, since motion waits behind it.
  const cancelCastForMove = (unit: Fighter): void => {
    if (unit.castingSpell) {
      unit.castingSpell = null;
      unit.castStartedAt = 0;
      unit.castFinishAt = 0;
      unit.castPushbacks = 0;
      unit.castCost = 0;
      unit.castCostPower = undefined;
      unit.castCritAdd = 0;
      unit.castEffectPct = 0;
    }
    // A channel is a cast bar, not a fire-and-forget aura: dropping the state alone left Blizzard and
    // Drain Life ticking off a caster who had walked away. The teardown takes its auras with it.
    if (unit.channeling) maybeCancelChannelOnMove(unit, channelInterruptCtx(ctx));
    unit.pendingCharge = null;
  };
  /** Hold-ground anchors (cfg.friendlyHoldYd): initial spot / move-order dest / resync. */
  const unitAnchors = new Map<string, CombatPosYd>();
  if (cfg.friendlyHoldYd != null && unitPositionsMutable) {
    for (const [side, p] of Object.entries(unitPositionsMutable)) {
      if (!isEnemySide(side)) unitAnchors.set(side, { x: p.x, y: p.y });
    }
  }
  (ctx as { unitAnchors?: Map<string, CombatPosYd> }).unitAnchors = unitAnchors;
  // Evade home per enemy side, seeded here for the pack the session was CREATED with. An inject stamps
  // every streamed or summoned body as it places it. Cite: HomeMovementGenerator.cpp:51.
  const enemyHomeYd = new Map<string, CombatPosYd>();
  if (unitPositionsMutable) {
    for (const [side, p] of Object.entries(unitPositionsMutable)) {
      if (isEnemySide(side)) enemyHomeYd.set(side, { ...p });
    }
  }
  (ctx as { enemyHomeYd?: Map<string, CombatPosYd> }).enemyHomeYd = enemyHomeYd;
  // Pull-sequence spent sets, maintained per event instead of rescanned. Walking the whole log cost
  // O(run length) per unit per tick, and after the first pull every opener stayed spent forever.
  const pullSpentSpells = new Map<Side, Set<number>>();
  const pullSpentItems = new Map<Side, Set<number>>();
  const markPullSpent = (map: Map<Side, Set<number>>, side: Side, id: number): void => {
    let s = map.get(side);
    if (!s) { s = new Set(); map.set(side, s); }
    s.add(id);
  };
  const EMPTY_SPENT: ReadonlySet<number> = new Set();
  const pullSpentSpellsFor = (side: Side): ReadonlySet<number> => pullSpentSpells.get(side) ?? EMPTY_SPENT;
  const pullSpentItemsFor = (side: Side): ReadonlySet<number> => pullSpentItems.get(side) ?? EMPTY_SPENT;
  const clearPullSpent = (): void => { pullSpentSpells.clear(); pullSpentItems.clear(); };
  const clearPullSpentIfIdle = (): void => {
    if (pullSpentSpells.size && livingCombatEnemies().length === 0) clearPullSpent();
  };
  const clearPullSpentFor = (side: Side): void => {
    pullSpentSpells.delete(side);
    pullSpentItems.delete(side);
  };

  const push = (e: CombatEvent): void => {
    // Anything but a passive tick is combat progress and re-arms the evade timer. `aura` and
    // `resource` are exactly what a stalled fight keeps emitting (measured on Onyxia).
    if (e.kind !== 'aura' && e.kind !== 'resource') lastActionT = e.t ?? t;
    // The scripted-mechanic tally, counted BEFORE the ring can trim. A raid emits ~250 events a second,
    // so a 100 s boss keeps only its last ~30 s and every phase transition was pushed then dropped.
    if (MECHANIC_EVENT_KINDS.has(e.kind)) {
      const slot = mechanicTally.get(e.kind);
      const at = e.t ?? t;
      if (slot) {
        slot.count += 1;
        slot.lastT = at;
      } else {
        mechanicTally.set(e.kind, { count: 1, firstT: at, lastT: at });
      }
    }
    // Damage taken and the death roll, tallied here for the same reason: `events` is a tail, so a long
    // fight's columns cover only its end. Every damage row the engine pushes sets a target.
    if (e.kind === 'melee' || e.kind === 'spell_hit' || e.kind === 'dot_tick') {
      if (Number.isFinite(e.amount) && e.amount > 0) {
        const victim: string = e.target ?? UNATTRIBUTED_VICTIM;
        damageTakenBySide.set(victim, (damageTakenBySide.get(victim) ?? 0) + e.amount);
        if (e.target !== undefined) {
          // Mutated in place, not re-allocated: this runs on every damage row and the map is
          // bounded by the side count, not by the fight's length.
          const blowName = e.kind === 'melee' ? (e.name ?? 'melee') : e.name;
          const prev = lastHitBySide.get(victim);
          if (prev) { prev.by = e.actor; prev.name = blowName; }
          else lastHitBySide.set(victim, { by: e.actor, name: blowName });
        }
      }
    } else if (e.kind === 'death') {
      deathsTotal += 1;
      if (deathRoll.length < MAX_TRACKED_DEATHS) {
        const blow = lastHitBySide.get(e.actor);
        deathRoll.push({
          side: e.actor,
          t: e.t ?? t,
          ...(blow ? { by: blow.by, cause: blow.name } : {}),
        });
      }
    }
    // Same kinds the two rescans matched. The aura row is the ally contract (KI-631):
    // self-buff openers emit only `aura`, and without it the opener waits on a spent cast.
    if (e.kind === 'cast_start' || e.kind === 'cast_finish' || e.kind === 'spell_hit') {
      markPullSpent(pullSpentSpells, e.actor, e.spellId);
    } else if (e.kind === 'aura' && e.applied !== false && e.spellId != null) {
      markPullSpent(pullSpentSpells, e.actor, e.spellId);
    } else if (e.kind === 'item_use') {
      markPullSpent(pullSpentItems, e.actor, e.entry);
    }
    events.push(e);
  };
  ctx.pullSpentSpellsFor = pullSpentSpellsFor;
  ctx.pullSpentItemsFor = pullSpentItemsFor;
  ctx.clearPullSpentIfIdle = clearPullSpentIfIdle;
  ctx.clearPullSpentFor = clearPullSpentFor;
  ctx.push = push;
  ctx.mechanicTally = mechanicTally;
  ctx.damageTakenBySide = damageTakenBySide;
  ctx.deathRoll = deathRoll;
  ctx.deathsTotalOf = () => deathsTotal;
  ctx.noteTotemOwner = (side, owner, name) => {
    totemOwnerMeta.set(side, { ownerSide: owner, name });
  };
  /** Clamp HP to a finite non-negative integer (keeps display and death checks aligned). */
  const sanitizeHp = (f: Fighter): void => {
    if (!Number.isFinite(f.hp) || f.hp <= 0) f.hp = 0;
    else f.hp = Math.round(f.hp);
  };

  // ---- sessionFocus (P4) — after pools; inject/eventAi consume focus helpers ----
  installSessionFocus(ctx, { dead });
  const ensurePlayerFocus = ctx.ensurePlayerFocus!;
  const foeOf = ctx.foeOf!;
  const hostileTargetOf = ctx.hostileTargetOf!;
  const nearestPartyInAcquire = ctx.nearestPartyInAcquire!;
  const fighterByThreatId = ctx.fighterByThreatId!;
  const resolveEventAiTargetFighter = ctx.resolveEventAiTargetFighter!;

  // ---- sessionInject (P1) — before eventAi (spawn/summon deps) --------------
  installSessionInject(ctx, {
    dead,
    nearestPartyInAcquire,
    hostileTargetOf,
    materializeSpecForCombat,
  });
  const injectEnemySpec = ctx.injectEnemySpec!;
  const injectEnemySummon = ctx.injectEnemySummon!;
  const forceDespawnEnemy = ctx.forceDespawnEnemy!;
  const runScriptDevAggroLifecycle = ctx.runScriptDevAggroLifecycle!;

  // ---- eventAi hub (S32 peel → eventAi.ts) ----------------------------------
  installEventAi(ctx, {
    injectEnemySummon,
    forceDespawnEnemy,
    resolveEventAiTargetFighter,
    removeAurasDueToSpell: (unit, spellId) => ctx.removeAurasDueToSpell!(unit, spellId),
    dead,
    hostileTargetOf,
    breakCharm: (f) => ctx.breakCharm!(f),
  });
  // resolveEventAiCastTarget already hung by installSessionFocus.

  for (const ef of enemies) {
    const acts = initialResetActions.get(ef.side as EnemySide);
    if (acts && acts.length > 0) {
      ctx.applyScriptDevCombatActions?.(ef, acts);
    }
  }

  // Damage dealt TO an enemy generates threat for the dealer on THAT enemy's list, DoTs included.
  // Cite: Unit.cpp:1207–1208 threat = damage * GetSpellThreatMultiplier; victim->AddThreat.
  installThreatOps(ctx);

  const finalize = (): void => {
    if (winner === null) {
      if (partyWiped()) winner = 'enemy';
      else if (allEnemiesDead()) winner = 'player';
      else winner = 'timeout';
    }
    // The clock stops when the fight ends, so a channel armed on the killing blow read as running
    // forever and the frame kept drawing its bar. Its auras come off with it, as on any cancel.
    for (const f of ctx.allSeats()) {
      if (f.channeling) interruptChannel(f, channelInterruptCtx(ctx), { quiet: true });
    }
    if (cfg.duel) duelComplete();
  };

  // Player::DuelComplete — each duelist loses every NEGATIVE aura the other applied, and combo points
  // on the opponent clear. A cross-side aura IS a negative one, since a duelist cannot help the other.
  const duelComplete = (): void => {
    const strip: Array<{ side: Side; spellId: number }> = [];
    for (const e of ctx.effects) {
      if (e.spellId == null) continue;
      if (isEnemySide(e.source) === isEnemySide(e.target)) continue;
      strip.push({ side: e.target, spellId: e.spellId | 0 });
    }
    for (const s of strip) {
      const f = ctx.sideFighter?.(s.side);
      if (f) ctx.removeAurasDueToSpell!(f, s.spellId);
    }
    // Cite: Player.cpp:6979-6989 — points held on the opponent (or their pet) are cleared.
    for (const f of ctx.allSeats()) {
      if (f.comboTarget == null) continue;
      if (isEnemySide(f.comboTarget) === isEnemySide(f.side)) continue;
      f.comboTarget = null;
      f.comboPoints = 0;
    }
  };

  const removeFromAllThreat = (id: CombatantId): void => ctx.removeFromAllThreat!(id);
  const clearAllThreat = (): void => ctx.clearAllThreat!();

  // ---- sessionDeaths (P5) — after inject / eventAi / threatOps ----
  installSessionDeaths(ctx, { dead, sanitizeHp, clearManualMotion });
  const unsummonTotem = ctx.unsummonTotem!;
  const checkDeaths = ctx.checkDeaths!;

  // ---- powerForm (P6) — hang spend/form/stealth/regen/combo/rollHeal before applySpell ----
  installPowerForm(ctx);
  const rollHeal = ctx.rollHeal!;
  const spend = ctx.spend!;
  const spellCost = ctx.spellCost!;
  const canAffordSpell = ctx.canAffordSpell!;
  const leaveForm = ctx.leaveForm!;
  const enterForm = ctx.enterForm!;
  const applyStealth = ctx.applyStealth!;
  const breakStealth = ctx.breakStealth!;
  const maybeBreakStealthOn = ctx.maybeBreakStealthOn!;
  const behindOk = ctx.behindOk!;
  // Generic RemoveAurasWithInterruptFlags — needs powerForm's stealth break, so it installs here.
  installInterruptAuras(ctx, { maybeBreakStealthOn });
  const gainRage = ctx.gainRage!;
  const regenRage = ctx.regenRage!;
  const regenEnergy = ctx.regenEnergy!;
  const regenMana = ctx.regenMana!;
  const regenFocus = ctx.regenFocus!;
  const regenHealth = ctx.regenHealth!;
  const addComboPoints = ctx.addComboPoints!;
  const clearComboPoints = ctx.clearComboPoints!;
  const comboOn = ctx.comboOn!;
  const scaleDurationByCp = ctx.scaleDurationByCp!;

  // S30 — CC + DR + onDamaged + grantImmunityAura; KI-086 OOC school_immunity seed.
  installCrowdControl(ctx);
  // installCrowdControl just assigned grantImmunityAura on ctx.
  const grantImm = ctx.grantImmunityAura;
  if (grantImm) {
    // The party, from the store - the same list, memoized, and no `if (f)` for a pet that
    // `partyUnits()` only includes when there is one. Cite: ENGINE-REBUILD E1.1.
    for (const f of ctx.partyUnits()) seedFighterSchoolImmunities(f, grantImm);
  }

  // ---- procsDamage hub (Wave 4 peel → procsDamage.ts) ----
  installProcsDamage(ctx, {
    dead,
    gainRage,
  });
  // ---- applySpell hub (Wave 4 peel → applySpell.ts) ----
  installApplySpell(ctx, {
    dead,
    sanitizeHp,
    spend,
    gainRage,
    addComboPoints,
    clearComboPoints,
    comboOn,
    scaleDurationByCp,
    spellCost,
    canAffordSpell,
    leaveForm,
    enterForm,
    applyStealth,
    breakStealth,
    maybeBreakStealthOn,
    behindOk,
    foeOf,
    ensurePlayerFocus,
    lowestHpFriendly,
    isControlled: (f) => (ctx.isControlled as (f: Fighter) => boolean)(f),
    isControlledHard: (f) => (ctx.isControlledHard as (f: Fighter) => boolean)(f),
    isWeaponAction: (s) => (ctx.isWeaponAction as (s: SpellDef) => boolean)(s),
    isBreaker: (s, f) => (ctx.isBreaker as (s: SpellDef, f?: Fighter) => boolean)(s, f),
    spellTemplateImmune: (tgt, spell) => (ctx.spellTemplateImmune as (tgt: Fighter, spell: SpellDef) => boolean)(tgt, spell),
    ccImmune: (tgt, mechanic, onlyTypes) => ctx.ccImmune!(tgt, mechanic, onlyTypes),
    applyDr: (src, tgt, mechanic, baseMs) => ctx.applyDr!(src, tgt, mechanic, baseMs),
    applyControl: (src, tgt, spell, eff, durMs, heartbeat) => ctx.applyControl!(src, tgt, spell, eff, durMs, heartbeat),
    breakControl: (f, control) => ctx.breakControl!(f, control),
    onDamaged: (f, amount, damageType, fromSpellId, info) => ctx.onDamaged!(f, amount, damageType, fromSpellId, info),
    rollHeal,
    unsummonTotem,
    checkDeaths,
    finalize,
    seedDamageShields,
    seedProcTriggers,
    seedSchoolAbsorbs,
    seedManaShields,
    seedRestoreHealth,
    seedDisplayAuras,
    sealRighteousnessSwing,
    materializeSpecForCombat,
  });
  // ---- aoeCast (P7) / itemUse (P8) — after applySpell ----
  installAoeCast(ctx);
  installItemUse(ctx);
  const castOnTargets = ctx.castOnTargets!;
  const useItem = ctx.useItem!;

  // Weapon temp-enchant combat procs — Windfury, Flametongue, poisons — and Rockbiter's flat damage.
  // RNG is drawn only when a chance or PPM imbue is present, so a no-imbue fight stays deterministic.
  installWeapon(ctx, {
    dead,
    sanitizeHp,
    spend,
    gainRage,
    addComboPoints,
    clearComboPoints,
    comboOn,
    onDamaged: (f, amount, damageType, fromSpellId, info) => ctx.onDamaged!(f, amount, damageType, fromSpellId, info),
    dealDamage: (...args: any[]) => (ctx.dealDamage as Function)(...args),
    applySpell: (...args: any[]) => (ctx.applySpell as Function)(...args),
    triggerProcs: (...args: any[]) => (ctx.triggerProcs as Function)(...args),
    triggerTakenProcs: (...args: any[]) => (ctx.triggerTakenProcs as Function)(...args),
    rollGearProcs: (...args: any[]) => (ctx.rollGearProcs as Function)(...args),
    fireDamageShields: (...args: any[]) => (ctx.fireDamageShields as Function)(...args),
    fireDealMeleeAura42: (...args: any[]) => (ctx.fireDealMeleeAura42 as Function)(...args),
    breakStealth,
    maybeBreakStealthOn,
    sealRighteousnessSwing,
  });
  // ---- pickAction hub (Wave 4 peel → pickAction.ts) ----
  installPickAction(ctx, {
    dead,
    isControlled: (f) => (ctx.isControlled as (f: Fighter) => boolean)(f),
    isControlledHard: (f) => (ctx.isControlledHard as (f: Fighter) => boolean)(f),
    isWeaponAction: (s) => (ctx.isWeaponAction as (s: SpellDef) => boolean)(s),
    isBreaker: (s, f) => (ctx.isBreaker as (s: SpellDef, f?: Fighter) => boolean)(s, f),
    ccImmune: (tgt, mechanic, onlyTypes) => ctx.ccImmune!(tgt, mechanic, onlyTypes),
    spellTemplateImmune: (tgt, spell) => (ctx.spellTemplateImmune as (tgt: Fighter, spell: SpellDef) => boolean)(tgt, spell),
    canAffordSpell,
    spellCost,
    comboOn,
    foeOf,
    ensurePlayerFocus,
    lowestHpFriendly,
  });
  // Probe tap (D): record the pick without a second call — pickAction spends items / EventAI.
  {
    const rawPick = ctx.pickAction;
    if (rawPick) {
      ctx.pickAction = (f, foe) => {
        const r = rawPick(f, foe);
        const tap = (globalThis as { __pcPickTap?: (side: string, id: number) => void }).__pcPickTap;
        if (tap) tap(f.side, r?.id ?? 0);
        return r;
      };
    }
  }
  // sim.pickAction: 37.7% of JS on the 2026-08-18 MC capture and invisible inside combat.sim.
  if (ctx.pickAction) {
    const innerPick = ctx.pickAction;
    ctx.pickAction = (f, foe) => combatPerf('sim.pickAction', () => innerPick(f, foe));
  }
  // ---- stepSession hub (Wave 4 peel → stepSession.ts; P11 ring+evade wrap inside) ----
  installStepSession(ctx, {
    dead,
    sanitizeHp,
    spend,
    gainRage,
    addComboPoints,
    clearComboPoints,
    comboOn,
    foeOf,
    ensurePlayerFocus,
    hostileTargetOf,
    isWeaponAction: (s) => (ctx.isWeaponAction as (s: SpellDef) => boolean)(s),
    isBreaker: (s, f) => (ctx.isBreaker as (s: SpellDef, f?: Fighter) => boolean)(s, f),
    spellCost,
    allySnapshot: (...args: any[]) => (ctx.allySnapshot as Function)(...args),
    castOnTargets,
    useItem,
    enterForm,
    applyStealth,
    maybeBreakStealthOn,
    checkDeaths,
    finalize,
    unsummonTotem,
    preferFocusHostile,
    allEnemiesDead,
    regenRage,
    regenEnergy,
    regenMana,
    regenFocus,
    regenHealth,
  });
  // Typed rather than spread through `any`: `tick(action, inputs)` carries the per-tick game-layer
  // values (S6b mechanism 2), and an `any[]` forwarder let a caller drop them with no complaint.
  const step = (action?: CombatAction, inputs?: SimTickInputs): CombatEvent[] => {
    const run = ctx.step;
    if (!run) throw new Error('createSession: step wrapper not installed');
    return run(action, inputs);
  };

  // ---- sessionView (P9) ----
  const sessionView = buildSessionView(ctx);
  const { memoView, invalidateViewMemo, result, enemiesView, alliesView } = sessionView;

  // Wave 4 peel fix-up: peels reference these via ctx.
  ctx.behindOk = behindOk;
  ctx.fighterByThreatId = fighterByThreatId;

  // Fire on-equip procs (trigger=1) once hub methods (incl. rollGearProcs) are on ctx.
  (ctx.rollGearProcs as Function)(player, enemy, 'equip');
  for (const ef of enemies) (ctx.rollGearProcs as Function)(ef, player, 'equip');
  if (pet) (ctx.rollGearProcs as Function)(pet, enemy, 'equip');
  for (const al of allies) (ctx.rollGearProcs as Function)(al, enemy, 'equip');

  // Every enemy walks in wearing its out-of-combat self-casts: those rows fire on the first idle tick
  // after spawn and are refused once combat is open, so a session can only ever inherit them.
  for (const ef of enemies) {
    for (const sp of enemyCastBySide.get(ef.side as EnemySide)?.spawnAuras ?? []) {
      ctx.applySpell?.(ef, ef, sp);
    }
  }

  // Detect-on-pull only when the encounter distance is set; absent is the opener window. EVERY
  // stealthed body is checked, not only the player — party rogues now arrive stealthed too.
  if (cfg.encounterDistanceYd != null) {
    const stealthStrengthOf = (f: Fighter) =>
      totalStealthStrength(f.stealthAuraStrength, f.stealthLevelBonus);
    for (const sneaker of [player, ...allies]) {
      if (!sneaker.stealthed) continue;
      for (const ef of enemies) {
        const dist = distanceBetween(sneaker, ef) ?? cfg.encounterDistanceYd;
        if (dist == null) continue;
        if (isDetectedAtDistance(
          dist,
          ef.spec.level,
          stealthStrengthOf(sneaker),
          ef.stealthDetectStrength,
          false,
        )) {
          breakStealth(sneaker, 'detected');
          break;
        }
      }
    }
  }

  // ---- sessionApi (P10) ----
  return buildCombatSessionApi(ctx, {
    dead,
    step: step as any,
    result,
    memoView,
    invalidateViewMemo,
    enemiesView,
    alliesView,
    finalize,
    totemOwnerMeta,
    unitMoveOrders,
    unitMoveIntents,
    unitManualMotion,
    unitStance,
    unitPatrolLoop,
    unitAnchors,
    unitCastOrders,
    clearManualMotion,
    cancelCastForMove,
  });
}

export function simulate(
  playerSpec: CombatantSpec,
  enemySpec: CombatantSpec | CombatantSpec[],
  rng: Rng,
  cfg: CombatConfig = {},
): CombatResult {
  return createSession(playerSpec, enemySpec, rng, cfg).runToEnd();
}

