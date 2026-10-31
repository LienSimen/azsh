// Combat session hub: start and resolve fights, dungeon pulls, session sync. Owns the pending fight and
// the live session; travel and squad re-entry go through bridges filled in createGame.

import type {
  AllyActionProvider, CombatantSpec, CombatConfig, CombatResult, CombatSession,
} from '../combat.ts';
import { createSession } from '../combat.ts';
import { seedReagentBagCounts } from '../combat/spellReagents.ts';
import { mergeCombatSkillGains, type CombatSkillMap } from '../../domain/character/combatSkills.ts';
import { unsummonTotemsOnLeaveWorld } from '../combat/sessionDeaths.ts';
import { mulberry32, hashSeed } from '../core/rng.ts';

import type { Rng } from '../core/rng.ts';
import { navMeshForMap } from '../../domain/nav/nav.ts';
import { navMeshSourceUrl } from '../../domain/nav/navmesh.ts';
import { collisionSourceUrl } from '../../domain/nav/navCollision.ts';
import { outdoorsSourceUrl } from '../../domain/nav/navOutdoors.ts';
import type { ActionProviderSpec } from '../../domain/bots/actionProviderSpec.ts';
import { partyRoleOf } from '../../domain/bots/partyRole.ts';
import { seedPrePullStealth } from '../../domain/bots/prePullStealth.ts';
import {
  applyEncounterPullGearToCompanion,
  applyEncounterPullGearToPlayer,
} from '../../domain/raid/raidEncounterGear.ts';
import { isCompanionKeepUpSpell, rotationActionProvider, syncCompanionBagItemRules } from '../../domain/bots/companionRotation.ts';
import {
  combatObjectSitesFromBake,
  combatObjectsFromBake,
  combatObjectsReusableFromBake,
} from '../../domain/raid/raidEncounterTactics.ts';
import { combatObjectTrapsFromBake, spellTrapSitesFromBake } from './combatObjectTraps.ts';
import { isMultiTargetCombatSpell } from '../../domain/rotation/classify.ts';
import { isRotationValid } from '../../domain/rotation/build.ts';
import { activeRotationProfile, ensurePlayerRotation, playerMacroExpandEnv } from './rotation.ts';
import { rotationWithMacros } from '../../domain/macro/rotation.ts';
import { stampStandYards } from '../../domain/rotation/stand.ts';
import {
  resolveCreatureDefForCombat,
} from '../../data/dungeons/boss-eventai.ts';
import { getDungeonSpawn } from '../../data/dungeonSpawns.ts';
import {
  materializeRingOfLawEncounter,
  ringOfLawAttemptSeed,
} from '../../data/dungeons/blackrock-depths.ts';
import { goLootKind } from '../../domain/items/pendingLoot.ts';
import type { EncounterDef } from '../../data/schema.ts';
import {
  buildCombatant, combatItems, maxHealth, maxPower, powerType,
  pruneExpiredAuras, getActiveBuffIds,
} from '../../domain/character/character.ts';
import type { PetState } from '../../domain/character/character.ts';
import {
  isStealthShapeshift, classHasParallelMana,
} from '../../domain/character/forms.ts';
import { DAZED_SPELL_ID } from '../combat/facing.ts';
import {
  buildPet, petHasHappiness, applyKillLoyalty, HAPPINESS_DEATH_LOSS,
  decayHappiness, LOYALTY_REBELLIOUS, reconcilePetPartyAuras, checkPetLearning,
  petPartyAuraSpellIds, stripPetPartyAuras,
} from '../../domain/pet/pet.ts';
import {
  applyCombatWear,
} from '../../domain/items/durability.ts';
import { applyDurabilityDamageFromLandedSpells } from './applySpellDurability.ts';
import { refuseIfDead } from '../../domain/run/death.ts';
import { tickPendingWellFed } from '../../progression/rest.ts';
import {
  type DeathFlowMode,
  createAliveDeathFlow,
  deathToGhostAtGraveyard,
  toGraveyardEntry,
  usesFullDeathFlow,
} from '../../domain/run/death.ts';
import type { CreatureDef, GatherNodeDef } from '../../data/schema.ts';
import { CLASS, CREATURE_TYPE } from '../../data/schema.ts';
import { SOUL_SHARD_ITEM } from '../../domain/core/ids.ts';
import {
  emptyInventory, addItem, removeItem, countItem, latestRandomPropertyId,
  isExpendableCastItem, freeSlots, canFit,
} from '../../domain/items/inventory.ts';
import { bagCapacity } from '../../domain/items/equipment.ts';
import { soulShardRoom, isSoulShard } from '../../domain/bots/soulShardCap.ts';
import { ownedInventory } from '../../domain/items/keyring.ts';
import { consumeOwnedCharges } from '../../domain/items/inventory.ts';
import { equippedEntry, equippedInstance } from '../../domain/items/itemInstance.ts';
import type { LootDrop } from '../../domain/items/loot.ts';
import { rollLootDeep } from '../../domain/items/loot.ts';
import { gainSkill } from '../../domain/professions/professions.ts';
import {
  miningHarvestTapCount, miningLockReqSkill, miningVeinOpenRange, mergeLootDrops,
} from '../../domain/professions/miningHarvest.ts';
import { clampGold } from '../../domain/economy/trading.ts';
import { formatItemName } from '../../domain/items/itemDisplayName.ts';
import { withPendingIdentities } from './loot.ts';
import {
  recordKill, recordSpellCast, recordEventHappens,
} from '../../domain/quests/questlog.ts';
import {
  creditSquadEvent,
  creditSquadKill,
  creditSquadLogs,
  creditSquadSpellCast,
  giveSquadQuestItem,
  partyNeededQuestItems,
} from './squadQuestShare.ts';
import { questFightEventQuestId } from '../../domain/quests/questFight.ts';
import { creditQuestFightWin } from './questFightCredit.ts';
import { runCreatureDeathScripts, type ScriptSummon } from './applyDeathAndSpellScripts.ts';
import { deliverScriptMail } from './mail.ts';
import { makeDbScriptEvaluateCondition } from './applyTerminateFromDbScript.ts';
import {
  rewardKillReputation,
  atWarFactionIds,
  reputationAuraModFromSpells,
} from '../../domain/creature/reputation.ts';
import { factionOf, racialSpells } from '../../domain/character/races.ts';
import { avAllowsLoot } from '../../domain/bg/avQuestItems.ts';
import { canAttackCreature } from '../../domain/creature/faction.ts';
import {
  TEAM_ALLIANCE,
  TEAM_HORDE,
} from '../../domain/run/death.ts';
import {
  partyHasSkinner,
  tryProfessionAutoSkin,
} from './killSkin.ts';
import {
  canPickPocket,
  rollPickPocket,
  canRestockPickpocket,
  startPickpocketRestock,
  pickpocketLootKey,
} from '../../domain/professions/pickpocket.ts';
import { dismount as doDismount } from '../../domain/items/mounts.ts';
import { grantXp } from '../../progression/leveling.ts';
import {
  killXpAmount, restBonusSpend,
} from '../../progression/xpGain.ts';
import { getCreatureAttackDistance } from '../../domain/creature/creatureAggro.ts';
import { CREATURE_FAMILY_ASSISTANCE_DELAY_MS } from '../../domain/creature/creatureAiConstants.ts';
import {
  packAssistForPull,
  guardAiAssistForPull,
  questTargets,
  spatialAddsForPull,
  zoneHasSpatialSpawns,
} from '../../world/world.ts';
import { aoePullCap, aoePullClass, aoePullExtras } from '../../world/aoePull.ts';
import {
  injectEnemySlotPosition,
  isEnemyCasterKit,
  PARTY_FOLLOW_YD,
} from '../combat/combatGeometry.ts';
import { detCos, detSin } from '../core/detMath.ts';
import { pullOpenYd, seedPullGeometry } from './combatSeed.ts';
import {
  normalizeAutopilotConfig,
  pullCountsFor,
  resolvePullOpenYards,
  firstOffensiveRotationRangeYd,
} from '../../autopilot/config.ts';
import {
  buildEnemySpecFromCreature,
  resolveSummonForFight,
} from './combatEnemySpec.ts';
import {
  isComplete, isCleared, isUnlocked, encounterOf,
  applyEncounterCleared, resolveEncounterPhase, encounterPhaseCount,
  findObjectGate, useObjectGate,
  hpThresholdEvents, flagsForHpThresholds, hasFlag, setFlag,
  materializeEncounterCse,
  routeEncounterList,
} from '../../world/instances.ts';
import { applyDmNorthKingPackClear } from '../../data/dungeons/dire-maul-north.ts';
import {
  createThermapluggFightState,
  thermapluggActiveFaceCount,
  thermapluggButtonFaceIndex,
  thermapluggButtonIsLive,
  thermapluggDeactivateFace,
} from '../../data/dungeons/gnomeregan.ts';
import {
  instanceDefaultOutdoors,
  outdoorsForSpawnGuid,
} from '../../data/dungeons/apply-encounter-outdoors.ts';
import { getDungeonGameObject } from '../../data/dungeonGameObjects.ts';
import { GAMEOBJECT_TYPE_SUMMONING_RITUAL } from '../../domain/world/gameObjects.ts';
import { applyInstanceSummoningRitual } from './summoningRitualUse.ts';
import {
  persistScriptInstanceData,
  runScriptDevGoUse,
  scriptDevGoUseAllowed,
  scriptInstanceDataMap,
} from './scriptDevGoUse.ts';
import { scriptDevByGo } from '../../domain/scriptdev/index.ts';
import {
  DEFAULT_PULL_FUSION,
  DEFAULT_ROUTE_DENSITY,
  fusionBatchFrom,
  mergeRoutePulls,
  resolveFusionEncounters,
  isFusionBreak,
  combatantCount,
  MAYHEM_SOFT_CAP,
} from '../../world/dungeonRoute.ts';
import {
  makeFusionBudgetGuard,
  packBudgetPresetFor,
} from '../../world/packBudget.ts';
import { isConditionSatisfied } from '../spells/conditions.ts';
import type { ConditionTable } from '../spells/conditions.ts';
import { allySideAt, isAllySide } from '../core/events.ts';
import type { Side } from '../core/events.ts';
import {
  GO_OSSIRIAN_CRYSTAL,
  NPC_OSSIRIAN,
  OSSIRIAN_WEAKNESS_SPELLS,
  SPELL_OSSIRIAN_SUPREME,
} from '../../domain/scriptdev/ruinsOfAhnqiraj.ts';
import {
  sessionSeedFromWorldCooldowns,
  worldCooldownsFromSessionSnapshot,
} from '../spells/recovery.ts';
import {
  bindFightEnter,
  commitFightClock,
  fightClockNow,
  fightEnterOf,
  isWallWorldClock,
  peekFightChain,
  peekOrAnchorFightChain,
} from './combatSessionClock.ts';
import {
  companionCharacter,
  companionLevel,
  encodeAoeMode,
  resolveAoeMode,
  resolveOffHeal,
  type Companion,
} from '../../domain/bots/squad.ts';
import { reconcileGamePartyAuras } from './partyAuras.ts';
import { carryCombatBuffs, type CombatBuffChip } from './persistCombatAuras.ts';
import { syncSheetStealthFromSession } from './oocAuraInterrupt.ts';
import { applyCompanionKillXp } from '../../domain/bots/companionXp.ts';
import { applyCompanionKillReputation } from '../../domain/bots/companionRep.ts';
import { requiredKeyItemEntry } from '../../domain/world/openLock.ts';
import type {
  ActionResult,
  BeginFight,
  FightOutcome,
  Game,
  GameState,
  PullAdditionalPackResult,
} from './types.ts';
import type { GameCtx } from './context.ts';
import { moneyMarked } from '../../domain/economy/money.ts';
import { createSimFacade, rawOf, type SimFacade } from '../combat/simFacade.ts';

// Fold a chained phase's push-time tallies onto the prior phase's. They are per-session and survive the
// event ring, so merging them is what makes a two-phase boss report its FIRST phase at all.
function mergePushTallies(
  prior: CombatResult,
  chained: CombatResult,
  shiftMs: number,
): Partial<CombatResult> {
  const out: Partial<CombatResult> = {};
  if (prior.mechanics || chained.mechanics) {
    const m: NonNullable<CombatResult['mechanics']> = { ...(prior.mechanics ?? {}) };
    for (const [kind, slot] of Object.entries(chained.mechanics ?? {})) {
      const before = m[kind];
      m[kind] = before
        ? {
          count: before.count + slot.count,
          firstT: before.firstT,
          lastT: slot.lastT + shiftMs,
        }
        : { count: slot.count, firstT: slot.firstT + shiftMs, lastT: slot.lastT + shiftMs };
    }
    out.mechanics = m;
  }
  if (prior.damageTakenBySide || chained.damageTakenBySide) {
    const d: Record<string, number> = { ...(prior.damageTakenBySide ?? {}) };
    for (const [side, n] of Object.entries(chained.damageTakenBySide ?? {})) {
      d[side] = (d[side] ?? 0) + n;
    }
    out.damageTakenBySide = d;
  }
  if (prior.deaths?.length || chained.deaths?.length) {
    out.deaths = [
      ...(prior.deaths ?? []),
      ...(chained.deaths ?? []).map((x) => ({ ...x, t: x.t + shiftMs })),
    ];
    out.deathsTotal = (prior.deathsTotal ?? 0) + (chained.deathsTotal ?? 0);
  }
  const dropped = (prior.eventsDropped ?? 0) + (chained.eventsDropped ?? 0);
  if (dropped > 0) out.eventsDropped = dropped;
  return out;
}

/**
 * A creature a corpse's death script asked for, plus the guid of the corpse that owes it. The floor
 * places it where that body fell — SummonCreature takes the summoner's position when the script row
 * carries no coordinate. Cite: ScriptMgr.cpp:2027-2051 TEMP_SPAWN_CREATURE; :2134-2180 CAST_SPELL.
 */
export type FloorDeathSummon = ScriptSummon & { fromGuid?: number };

/** Pending fight metadata owned by the combat session module. */
export type PendingFight = {
  rng: Rng;
  creatureEntry: number;
  /** Actual enemy level after SelectLevel (or cdef.level). Used for Formulas::Gain. */
  enemyLevel: number;
  // Wave 4B pack members that joined (entry + SelectLevel level) for XP/loot/quest credit. Primary is
  // `creatureEntry` / `enemyLevel`; pack is assistants only.
  pack?: Array<{ entry: number; level: number; guid?: number }>;
  encounter?: {
    dungeonId: string;
    encounterId: string;
    phaseIndex?: number;
    /** DR fusion: all route encounter ids cleared when this pull wins. */
    fusedIds?: string[];
    /** Kept so the phase chain can hand the next pull the same roof it opened under. */
    outdoors?: boolean;
    /** Sticky multi-phase snapshot (Ring of Law rolls); phase chain uses this. */
    resolved?: EncounterDef;
  };
  /** S3: re-apply squad allies when multi-phase chains call startFight again. */
  withSquad?: boolean;
  /** Continuous floor shell: seats outlive their pull, so only creditFloorKills pays by guid. */
  endless?: boolean;
};

export type CombatSessionExtras = {
  deathFlowMode: () => DeathFlowMode;
  busyTravelling: () => boolean;
  buildSquadBattleParty: (targetEntry?: number) => {
    allySpecs: CombatantSpec[];
    allyActionProviders: (AllyActionProvider | null)[];
    allyProviderSpecs: (ActionProviderSpec | null)[];
    allyPetIndex: (number | null)[];
  };
  syncCompanionPetAfterLevel: (comp: Companion, leveledTo: readonly number[]) => void;
  buildConditionCtx: () => NonNullable<CombatantSpec['conditionCtx']>;
  conditionTableById: () => ConditionTable;
  lootConditionSnapshot: () => {
    quests: Record<string, 'none' | 'taken' | 'complete' | 'rewarded'>;
    level: number;
    /** SharedDefines.h Team: ALLIANCE=469, HORDE=67 — required for CONDITION_TEAM (type 6). */
    team: number;
    /** HonorRankInfo.rank 0..18. Cite: Conditions.cpp:236-243 CONDITION_PVP_RANK. */
    pvpRank: number;
    /** CONDITION_AD_COMMISSION_AURA (10). Cite: Conditions.cpp:228-234. */
    auras?: number[];
    /** CONDITION_INSTANCE_SCRIPT (18) — DM North guards-alive. */
    instanceCondition?: (conditionId: number) => boolean;
    /** CONDITION_COMPLETED_ENCOUNTER (31) — AQ40 Twin Emperors / Ouro SetData. */
    completedEncounter?: (encounterId: number) => boolean;
    /** CONDITION_WORLD_SCRIPT (40) — sWorldState.IsConditionFulfilled. */
    worldScript: (conditionId: number, state: number) => boolean;
  };
  runAutoEquipUpgrades: (max?: number) => number;
  /** Put the corpse's drops + coin in the loot container (resolveFight's holdLoot path). */
  openLoot: Game['openLoot'];
  applyGather: (
    node: GatherNodeDef,
    rng?: Rng,
  ) => ActionResult<{ yielded: LootDrop[]; skillUp?: number }>;
};

export type CombatSessionModule = {
  methods: Pick<
    Game,
    | 'fight'
    | 'beginFight'
    | 'resolveFight'
    | 'beginEncounter'
    | 'beginFloorPull'
    | 'beginFloorShell'
    | 'injectFloorMember'
    | 'noteFloorPackMember'
    | 'creditFloorKills'
    | 'pullAdditionalPack'
    | 'useInstanceObject'
    | 'lootInstanceObject'
    | 'liveFightSession'
  >;
  startFight: (
    creatureEntry: number,
    bossSpellIds: number[] | undefined,
    encounter:
      | {
          dungeonId: string;
          encounterId: string;
          pack?: { creatureEntry: number; count: number }[];
          phaseIndex?: number;
          fusedIds?: string[];
          origin?: { x: number; y: number };
          spawnGuids?: number[];
          mapId?: number;
          outdoors?: boolean;
          /** Sim-time since instance enter — MT=2 poses (L05). */
          elapsedMs?: number;
          /** Sticky wave materialization (Ring of Law). */
          resolved?: EncounterDef;
        }
      | undefined,
    opts?: {
      withSquad?: boolean; endless?: boolean; noPrimary?: boolean; sitting?: boolean;
      attack?: boolean; noAoe?: boolean;
    },
  ) => ActionResult<BeginFight>;
  resolveFight: (session: CombatSession) => FightOutcome;
  syncCharFromSession: (session: CombatSession) => void;
  persistSessionCooldowns: (session: CombatSession) => void;
  getPendingFight: () => PendingFight | null;
  setPendingFight: (p: PendingFight | null) => void;
  getLiveFightSession: () => CombatSession | null;
  setLiveFightSession: (s: CombatSession | null) => void;
  // `ally_N` this companion occupies in an open session, or null when it is not in the party that built it.
  // By the pinned layout, never by squad index — hiring reorders `state.squad`.
  allySideForCompanion: (session: CombatSession, compId: string) => string | null;
};

export function createCombatSessionModule(
  ctx: GameCtx,
  extras: CombatSessionExtras,
): CombatSessionModule {
  const { ds, state, log, takeDrop, refreshQuests, cap } = ctx;
  const {
    deathFlowMode,
    busyTravelling,
    buildSquadBattleParty,
    syncCompanionPetAfterLevel,
    buildConditionCtx,
    conditionTableById,
    lootConditionSnapshot,
    runAutoEquipUpgrades,
    openLoot,
    applyGather,
  } = extras;

  // Creatures a spell summons, for a death script's CAST_SPELL row. Cite: SpellEffects.cpp:2729
  // EffectSummonWild — Eject Sneed (5141) is effect 41, EffectMiscValue 643.
  const spellSummonsOf = (spellId: number): { creatureEntry: number; count: number }[] => {
    const sp = ds.spell(spellId);
    if (!sp) return [];
    const out: { creatureEntry: number; count: number }[] = [];
    for (const eff of sp.effects) {
      if (
        eff.kind !== 'summon_wild' && eff.kind !== 'summon_guardian'
        && eff.kind !== 'summon_demon' && eff.kind !== 'summon_possessed'
      ) continue;
      const entry = eff.creature | 0;
      if (entry > 0) out.push({ creatureEntry: entry, count: Math.max(1, (eff.count ?? 1) | 0) });
    }
    return out;
  };

  /** Unit.cpp:1382 ScriptsStart(SCRIPT_TYPE_CREATURE_DEATH) after a live kill credit. */
  const applyCreatureDeathScripts = (entry: number): ScriptSummon[] => {
    const rows = ds.creatureDeathScripts(entry);
    if (!rows.length) return [];
    const applied = runCreatureDeathScripts(entry, rows, {
      questlog: state.questlog,
      inventory: state.inventory,
      itemOf: (e) => ds.item(e),
      bagCap: cap(),
      goRuntime: state.goRuntime,
      goRuntimeKey: (e) => `${state.char.zoneId}:${e}`,
      worldStates: state.worldStates,
      relayScripts: (id) => ds.relayScripts(id),
      evaluateCondition: makeDbScriptEvaluateCondition(
        lootConditionSnapshot(),
        conditionTableById(),
      ),
      questOf: (e) => ds.quest(e),
      spellSummonsOf,
      log,
      onMail: (rec) => deliverScriptMail(
        ctx,
        rec,
        sessionClockNow(),
        ds.creature(entry)?.name ?? 'Mailbox',
      ),
    });
    state.questlog = applied.questlog;
    if (applied.inventory) state.inventory = applied.inventory;
    if (applied.goRuntime) state.goRuntime = applied.goRuntime;
    if (applied.worldStates) state.worldStates = applied.worldStates;
    return applied.summons ?? [];
  };

  // The rng of the in-flight fight is kept so loot and gold roll on the same seeded stream after combat
  // ends. `encounter` credits a win to the instance run; `phaseIndex` tracks a multi-phase pull.
  let pendingFight: PendingFight | null = null;

  // ally_N to whose world cooldowns to write back, captured when the party was built: hiring between
  // pulls reorders the squad, so resolving by index alone would stamp the wrong companion.
  const sessionPartyLayout = new WeakMap<
    CombatSession,
    { compIds: string[]; petAllyIndex: (number | null)[] }
  >();

  /** Most recent opened combat session; cleared on resolveFight. */
  let liveFightSession: CombatSession | null = null;
  // What THIS session has already been debited for. `itemsConsumed` is cumulative, so a pack clear
  // and the final settle must charge the DELTA, never the running total.
  let itemSpendApplied = new Map<number, number>();
  // Companion spends, keyed `${allyIndex}:${entry}`. Same delta rule as the player ledger.
  let allyItemSpendApplied = new Map<string, number>();
  // The other direction, same delta rule: what a pull PUT in the bags. Drain Soul shards on the live
  // floor were credited only at zone-out, so a warlock's stone run died mid-dungeon.
  let itemGainApplied = new Map<number, number>();
  let allyItemGainApplied = new Map<string, number>();
  let shardGainApplied = 0;
  // The seam every holder reads and writes through (PERF-RUNSHEET S6b). One per RUN rather than per
  // fight, so a handle taken at mount time is already looking at the current pull.
  let runFacade: SimFacade | null = null;

  // A live fight reads enter plus session.t, else the per-state chain, with a wall anchor only before
  // this game has opened one. Wall mode short-circuits: the sim runs at 1x to 4x and drifts off it.
  const sessionClockNow = (session?: CombatSession | null): number => {
    if (isWallWorldClock(state)) return Date.now();
    const s = session ?? liveFightSession;
    if (s && fightEnterOf(s) != null) return fightClockNow(s, s.t);
    const chained = peekFightChain(state);
    if (chained != null) return chained;
    return peekOrAnchorFightChain(state, Date.now());
  };

  /** KI-612: in-fight Pick Pocket — same gates/loot as OOC professions.pickPocket. */
  const grantInFightPickPocket = (creatureEntry: number): {
    ok: boolean;
    drops?: LootDrop[];
    goldCopper?: number;
    reason?: string;
  } => {
    const cdef = ds.creature(creatureEntry);
    if (!cdef) return { ok: false, reason: 'No such creature' };
    const nowMs = sessionClockNow();
    const spawnKey = `${state.char.zoneId}:${creatureEntry}`;
    if (!canRestockPickpocket(state.pickpocketRestock, spawnKey, nowMs)) {
      return { ok: false, reason: 'Already pickpocketed' };
    }
    // Combat cast already required stealth form; do not re-fail on char aura lag.
    const gate = canPickPocket({
      cls: state.char.cls,
      targetAlive: true,
      stealthOk: true,
    });
    if (!gate.ok) return { ok: false, reason: gate.reason };
    const defLoot = (cdef as { pickpocketLootId?: number }).pickpocketLootId;
    const lootId: number | string = (defLoot != null && defLoot > 0)
      ? defLoot
      : pickpocketLootKey(creatureEntry);
    {
      const probe = ds.lootTable(lootId);
      if (probe.length === 0 && typeof lootId === 'string') {
        return { ok: false, reason: 'Target has no pockets' };
      }
    }
    const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
    const rolled = rollPickPocket({
      pickpocketLootId: lootId,
      getTable: (id) => {
        const rows = ds.lootTable(id);
        return rows.length > 0 ? rows : undefined;
      },
      rng,
      playerLevel: state.char.level,
      targetLevel: cdef.level,
      skipSkillCheck: true,
    });
    if (!rolled.ok) return { ok: false, reason: rolled.reason };
    const granted: LootDrop[] = [];
    for (const d of rolled.drops) {
      const took = takeDrop(d.item, d.count);
      if (took > 0) granted.push({ item: d.item, count: took });
    }
    if (rolled.goldCopper > 0) {
      state.char = { ...state.char, gold: state.char.gold + rolled.goldCopper };
    }
    state.pickpocketRestock = startPickpocketRestock(state.pickpocketRestock, spawnKey, nowMs);
    return { ok: true, drops: granted, goldCopper: rolled.goldCopper };
  };

  // Sessions already paid out, with the outcome they produced: resolving is a one-time settlement. A UI
  // remount that re-fired the end screen was duplicating rewards about six times a second.
  const settled = new WeakMap<CombatSession, FightOutcome>();

// Shared fight setup: build the enemy spec, optionally with boss abilities, and open a seeded session.
// Outdoor pulls bring CallAssistance helpers, and `withSquad` folds the squad in as real allies.
const startFight = (
  creatureEntry: number,
  bossSpellIds: number[] | undefined,
  encounter:
    | {
        dungeonId: string;
        encounterId: string;
        pack?: { creatureEntry: number; count: number }[];
        /** D-4 multi-phase index (0 = first pull). Absent = 0. */
        phaseIndex?: number;
        /** DR fusion: mark all these ids defeated on win (default: [encounterId]). */
        fusedIds?: string[];
        // Geometry v2.1a: cluster centroid + spawn guids for real-coord seed. Absent / unresolved →
        // seedMeleePackPositions fallback.
        origin?: { x: number; y: number };
        spawnGuids?: number[];
        /** Classic map id for pack-clusters.json (e.g. 36 Deadmines). Optional — guids also resolve via full cluster scan. */
        mapId?: number;
        // EncounterDef.outdoors — false only when the bake measured a WMO roof over this pull. Absent is
        // outdoors (TerrainInfo::IsOutdoors), so nothing outside a dungeon changes.
        outdoors?: boolean;
        /** Sim-time since instance enter — MT=2 poses (L05). */
        elapsedMs?: number;
        resolved?: EncounterDef;
      }
    | undefined,
  // `noPrimary` opens the session with an EMPTY enemy list (no blanked creature 598 shell).
  // `attack` reads the Attack pull counts; `noAoe` skips farm-dial extras (CallAssistance still fires).
  opts?: {
    withSquad?: boolean; endless?: boolean; noPrimary?: boolean; sitting?: boolean;
    attack?: boolean; noAoe?: boolean;
  },
): ActionResult<BeginFight> => {
  // Dead / ghost cannot open combat (vanilla 1.12). Shared refuseIfDead (KI-861).
  // Cite: domain/run/death.ts; Unit.h IsAlive; Spell.cpp SPELL_FAILED_CASTER_DEAD.
  {
    const dead = refuseIfDead(state.char.health, state.deathFlow);
    if (dead) return dead;
  }
  // Combat stands you up — a food well-fed still waiting on the sit gate is cancelled.
  if (state.char.pendingWellFed) {
    state.char = tickPendingWellFed(state.char, ds, 0, false);
  }
  // Busy while wall-clock travelling.
  if (busyTravelling()) {
    return { ok: false, reason: 'You are travelling' };
  }
  // One live combat session only: a second beginFight must not replace the pointer or leave an orphan
  // session resolveFight can still settle for XP. The multi-phase chain clears it first.
  if (liveFightSession) {
    return { ok: false, reason: 'Already in combat' };
  }
  // Bake first, then Wave-V SUMMON_ONLY_TEMPLATES (and any other summon stubs).
  // Phase-chains / packs that only exist as summon-only rows must still begin.
  const cdef = opts?.noPrimary
    ? undefined
    : resolveCreatureDefForCombat(creatureEntry, (id) => ds.creature(id));
  if (!cdef && !opts?.noPrimary) {
    return { ok: false, reason: `Unknown creature entry ${creatureEntry}` };
  }
  // No friendly fire: same-faction and Friendly-plus NPCs cannot be engaged. Instance trash is always
  // legal, and an active quest kill target stays attackable unless its credit is script-only.
  if (cdef && !encounter && !canAttackCreature(ds, state.char.race, creatureEntry, atWarFactionIds(
    ds.factions(), state.char.reputations, state.char.factionFlags, state.char.race, state.char.cls,
  ))) {
    // noXp + friendly: script-credit workers (Lazy Peon) — not combat kill targets.
    const scriptOnlyCredit = !!cdef.noXp;
    const questKill = !scriptOnlyCredit
      && questTargets(ds, state.questlog).kills.has(creatureEntry);
    const questFight = questFightEventQuestId(ds, state.questlog, creatureEntry) != null;
    if (!questKill && !questFight) {
      return { ok: false, reason: `${cdef.name} is friendly` };
    }
  }
  state.char.activeAuras = pruneExpiredAuras(state.char.activeAuras); // out-of-combat pruning on fight start
  // Per-fight cloak / resist set. Cite: SpellEffects.cpp:3756; AUTOPILOT-PLAN §4 row 25.
  {
    const role = partyRoleOf(state.char, ds, state.squadRole);
    const geared = applyEncounterPullGearToPlayer(
      state.char,
      state.inventory,
      ds,
      creatureEntry,
      role === 'damage' ? 'dps' : role,
    );
    state.char = geared.char;
    state.inventory = geared.inventory;
    if (opts?.withSquad && state.squad?.length) {
      const lvl = state.char.level;
      state.squad = state.squad.map((c) => applyEncounterPullGearToCompanion(c, ds, creatureEntry, lvl));
    }
  }
  // Class-A party auras (Devotion / Blood Pact) drop when nobody in this subgroup holds them.
  // Cite: SpellAuras.cpp AreaAura::Update ~592–624; RANGE-ARCHITECTURE §4.8.3.
  reconcileGamePartyAuras(state, ds, Date.now(), opts?.withSquad === true);
  state.lastCorpse = null; // a fresh fight: the previous corpse is no longer at hand to cannibalize
  // Dismount on combat entry, mounts being out-of-combat only. Vanilla does not dismount on damage,
  // so this is the port's own rule rather than an interrupt flag. Cite: Unit::Unmount.
  if (state.char.mountedItem != null) {
    const d = doDismount(state.char);
    if (d.ok) {
      state.char = d.char;
      log('You dismount as combat begins.');
    }
  }
  // Feed Pet Effect breaks on combat (spell 1539 AuraInterruptFlags 0x3C03: ATTACKING|DAMAGE).
  if (state.char.pet?.feedRemaining) {
    state.char.pet = { ...state.char.pet, feedRemaining: undefined, feedPerSec: undefined };
    log(`${state.char.pet.name} stops eating.`);
  }
  // The SEED, not just the stream: a Worker rebuilds the fight from it, and spec building draws
  // nothing from the rng (1500 templates, 0 draws), so both sides start at the same position.
  const sessionSeed = hashSeed(state.rngSeed, state.fightCounter++);
  const rng = mulberry32(sessionSeed);
  // Enemy stats: SelectLevel when the template carries raw scaling, else the legacy hp roll. Same seed
  // means the same path, so the stream is stable. With no primary the floor opens empty and draws none.
  const primary = cdef ? buildEnemySpecFromCreature(ds, cdef, rng, bossSpellIds) : undefined;
  const enemySpecs: CombatantSpec[] = primary ? [primary.spec] : [];
  const packMeta: Array<{ entry: number; level: number }> = [];
  const packAssistInfo: NonNullable<BeginFight['packAssist']> = [];

  // CallAssistance on combat enter, off the sourced spawns and the call radius. Empty with no positions
  // or with NO_CALL_ASSIST, and never on the floor shell — it must not auto-pull outdoor helpers.
  if (cdef && !encounter && !opts?.endless) {
    const helpers = packAssistForPull(ds, state.char.zoneId, creatureEntry).slice();
    const seenAssist = new Set(helpers.map((h) => h.entry));
    for (const h of guardAiAssistForPull(ds, state.char.zoneId, creatureEntry)) {
      if (seenAssist.has(h.entry)) continue;
      seenAssist.add(h.entry);
      helpers.push(h);
    }
    for (const h of helpers) {
      const adef = resolveCreatureDefForCombat(h.entry, (id) => ds.creature(id));
      if (!adef) continue;
      const built = buildEnemySpecFromCreature(ds, adef, rng);
      enemySpecs.push(built.spec);
      packMeta.push({ entry: h.entry, level: built.level });
      packAssistInfo.push({
        entry: h.entry,
        distance: h.distance,
        name: adef.name,
      });
    }
    if (packAssistInfo.length) {
      const names = packAssistInfo.map((p) => p.name).join(', ');
      log(`${cdef.name} calls for help! ${names} ${packAssistInfo.length === 1 ? 'joins' : 'join'} the fight.`);
    }
  }

  // Player-chosen outdoor AoE: nearby same-class spawns up to the surface's own pull counts —
  // the Attack button's pair by hand, the run bar's pair on a run (config.ts pullCountsFor).
  // Named bosses stay 1. CallAssistance above is separate and still fires.
  const aoePullInfo: NonNullable<BeginFight['aoePull']> = [];
  if (cdef && !encounter && !opts?.endless && !opts?.noAoe) {
    const pullCfg = pullCountsFor(
      normalizeAutopilotConfig(state.autopilot), opts?.attack ? 'attack' : 'auto',
    );
    const cap = aoePullCap(aoePullClass(ds, creatureEntry), pullCfg);
    // The mobs the run still owes a quest fill the pull first: a grind on "kill 10 of each"
    // drags in credit, not bystanders. Cite: world.ts questTargets (active, unmet killTargets).
    const questKills = questTargets(ds, state.questlog).kills;
    const extras = aoePullExtras(
      ds,
      state.char.zoneId,
      creatureEntry,
      pullCfg,
      state.char.level,
      {
        race: state.char.race,
        atWar: atWarFactionIds(
          ds.factions(), state.char.reputations, state.char.factionFlags, state.char.race, state.char.cls,
        ),
        ...(questKills.size ? { prefer: questKills } : {}),
      },
    );
    const assistEntries = new Set(packAssistInfo.map((p) => p.entry));
    for (const h of extras) {
      if (enemySpecs.length >= cap) break;
      if (h.entry !== creatureEntry && assistEntries.has(h.entry)) continue;
      const mdef = resolveCreatureDefForCombat(h.entry, (id) => ds.creature(id));
      if (!mdef) continue;
      const built = buildEnemySpecFromCreature(ds, mdef, rng);
      enemySpecs.push(built.spec);
      packMeta.push({ entry: h.entry, level: built.level });
      aoePullInfo.push({ entry: h.entry, distance: h.distance, name: mdef.name });
    }
    if (aoePullInfo.length) {
      const names = aoePullInfo.map((p) => p.name).join(', ');
      log(`${names} ${aoePullInfo.length === 1 ? 'joins' : 'join'} the pull.`);
    }
  }

  // An authored dungeon pack expands into extra enemies through the same multi-enemy path as an outdoor
  // assist, in authored order. Members join the pack meta so they credit XP, loot and quest kills.
  if (encounter?.pack) {
    for (const member of encounter.pack) {
      if (member.count <= 0) continue;
      const mdef = resolveCreatureDefForCombat(member.creatureEntry, (id) => ds.creature(id));
      if (!mdef) {
        log(`Pack member skipped: no template for creature entry ${member.creatureEntry}.`);
        continue;
      }
      for (let n = 0; n < member.count; n++) {
        const built = buildEnemySpecFromCreature(ds, mdef, rng);
        enemySpecs.push(built.spec);
        packMeta.push({ entry: member.creatureEntry, level: built.level });
      }
    }
  }

  // The chain clock, read before the spec is built because the pull's own sneak is on it.
  const now0 = peekOrAnchorFightChain(state, Date.now());
  // Rogues and ferals open every pull at full energy: energy ticks out of combat at the same rate, but
  // chaining pulls without a full regen window left openers stuck at 0-20.
  if (powerType(state.char) === 'energy') {
    state.char.power = maxPower(state.char, ds);
  }
  // The player's engage, where a party rogue already stealths (squadDungeon.ts:504-506). Stealth is
  // NOT_IN_COMBAT_ONLY_PEACEFUL, so this is the last moment the pack's stealth opener can arm.
  {
    const sneak = seedPrePullStealth(state.char, state.spellbook, ds, {
      spellCooldowns: state.spellCooldowns, now: now0,
    });
    // Spend the entry cost so the loop below carries it into the fight and a chain pull inside the
    // 10 s recovery arrives unstealthed. Cite: spell_template 1784-1787.
    const sneakCd = sneak ? (ds.spell(sneak.id)?.cooldownMs ?? 0) : 0;
    if (sneak && sneakCd > 0) (state.spellCooldowns ??= {})[sneak.id] = now0 + sneakCd;
  }
  const player = buildCombatant(state.char, state.spellbook, ds, state.inventory);
  player.items = combatItems(state.char, state.inventory, ds); // potions/healthstone usable mid-fight
  // CheckItems / TakeReagents bag snapshot (Soul Shard on Shadowburn, runes, …). Mid-fight casts mutate
  // bagItemCounts → itemsConsumed at resolveFight. Cite: Spell.cpp CheckItems / TakeReagents; KI-804.
  {
    const bag = seedReagentBagCounts(player.spells, (item) => countItem(state.inventory, item));
    if (bag) player.bagItemCounts = bag;
  }
  // The player is a party member like any other and ALWAYS carries a role. Leaving it unset excluded
  // the human from threat seeding, peel, heal triage and the front and back bands.
  player.groupRole = partyRoleOf(state.char, ds, state.squadRole);
  // Conditions player-state snapshot (REPUTATION_RANK/SKILL/ACTIVE_GAME_EVENT/TEAM).
  // Precomputed plain data so the session stays deterministic. Cite: Conditions.cpp Meets.
  player.conditionCtx = buildConditionCtx();

  // Seed pre-existing world cooldowns into the session so usable checks inside the fight respect them.
  // Values are remaining ms from t=0, on the chain clock rather than wall time.
  const initSpellCds: Record<number, number> = {};
  const initCatCds: Record<number, number> = {};
  for (const sp of player.spells || []) {
    const rem = Math.max(0, (state.spellCooldowns?.[sp.id] ?? 0) - now0);
    if (rem > 0) initSpellCds[sp.id] = rem;
    if (sp.category != null) {
      const crem = Math.max(0, (state.categoryCooldowns?.[sp.category] ?? 0) - now0);
      if (crem > 0) initCatCds[sp.category] = crem;
    }
  }
  // The loop above walks SPELLS only, so a potion drunk in the world did not lock its shared category
  // inside the next pull. Item personal cooldowns live on the use-spell id, so they ride the same map.
  for (const it of player.items || []) {
    if (it.category != null && it.categoryCooldownMs != null && it.categoryCooldownMs > 0) {
      const crem = Math.max(0, (state.categoryCooldowns?.[it.category] ?? 0) - now0);
      if (crem > 0) initCatCds[it.category] = Math.max(initCatCds[it.category] ?? 0, crem);
    }
    const useSp = ds.item(it.entry)?.useSpell;
    if (useSp != null && it.cooldownMs > 0) {
      const rem = Math.max(0, (state.spellCooldowns?.[useSp] ?? 0) - now0);
      if (rem > 0) initSpellCds[useSp] = Math.max(initSpellCds[useSp] ?? 0, rem);
    }
  }
  // S3 group pulls: optional real squad allies. Empty squad (or withSquad off) leaves
  // allySpecs null so createSession stays solo-equivalent (no extra rng draws).
  let allySpecs: CombatantSpec[] | null = null;
  // null provider = pet uses S0 damage heuristics (createSession accepts null). Cite: combat/types.ts.
  let allyActionProviders: (AllyActionProvider | null)[] | undefined;
  let allyProviderSpecs: (ActionProviderSpec | null)[] | undefined;
  let allyPetIndex: (number | null)[] | undefined;
  if (opts?.withSquad) {
    const party = buildSquadBattleParty(creatureEntry);
    if (party.allySpecs.length > 0) {
      allySpecs = party.allySpecs;
      allyActionProviders = party.allyActionProviders;
      allyProviderSpecs = party.allyProviderSpecs;
      allyPetIndex = party.allyPetIndex;
      // squadDungeon seeds companion CDs with Date.now — restamp on the fight clock (KI-956).
      const squad = state.squad ?? [];
      for (let i = 0; i < squad.length; i++) {
        const comp = squad[i]!;
        const spec = allySpecs[i];
        if (!spec) continue;
        spec.initialSpellCooldowns = sessionSeedFromWorldCooldowns(comp.spellCooldowns, now0);
        spec.initialCategoryCooldowns = sessionSeedFromWorldCooldowns(comp.categoryCooldowns, now0);
        const petIdx = allyPetIndex[i];
        if (petIdx != null) {
          const petSpec = allySpecs[petIdx];
          if (petSpec) {
            petSpec.initialSpellCooldowns =
              sessionSeedFromWorldCooldowns(comp.pet?.spellCooldowns, now0);
            petSpec.initialCategoryCooldowns =
              sessionSeedFromWorldCooldowns(comp.pet?.categoryCooldowns, now0);
          }
        }
      }
    }
  }
  // The player's own rotation for the ticks the ENGINE drives them. Without it those fights fell to
  // pickAction's class heuristics, so an auto-resolved pull ignored the rotation the user wrote.
  const autoCfgForPlayer = normalizeAutopilotConfig(state.autopilot);
  // Rotation-editor play knobs that ride the spec into the motion phase.
  player.movement = autoCfgForPlayer.movement;
  player.packClose = autoCfgForPlayer.aoeMode !== 'single';
  // Rebuild untouched defaults when the kit, level or spec drifted, so a headless fight matches the UI.
  // The profile in force is the one it fights from, and its own stand yards.
  const activeProfile = activeRotationProfile(state);
  // Macro rules compile to spell and item rules HERE, before anything reads the list: the open yards,
  // the stand band and the provider must all see the spell a macro actually casts.
  // Bag potions ride the same inject companions get; rotationForCombat is the UI twin.
  const liveRot = rotationWithMacros(
    syncCompanionBagItemRules(
      ensurePlayerRotation(state, ds, activeProfile),
      state.char,
      state.inventory,
      ds,
    ),
    playerMacroExpandEnv(state, ds, ctx.opts),
  );
  stampStandYards(player, {
    explicit: liveRot?.standYards,
    specName: liveRot?.autoSig?.spec ?? state.rotationSpec,
    offenseYd: firstOffensiveRotationRangeYd(liveRot, (id) => ds.spell(id)),
  });
  const playerRot = liveRot && isRotationValid(liveRot, state.char.cls) ? liveRot : null;
  // The plain half first, so the Worker's copy is built from the SAME spec (actionProviderSpec.ts).
  const playerProviderSpec: ActionProviderSpec | null = playerRot
    ? {
      rotation: playerRot,
      ...(creatureEntry != null ? { targetEntry: creatureEntry } : {}),
      aoeMode: autoCfgForPlayer.aoeMode === 'aoe' || autoCfgForPlayer.aoeMode === 'single'
        ? autoCfgForPlayer.aoeMode
        : 'auto',
      offHealAllowed: autoCfgForPlayer.offHeal === true,
    }
    : null;
  const playerActionProvider = playerProviderSpec
    ? rotationActionProvider(playerProviderSpec.rotation, creatureEntry, {
      aoeMode: playerProviderSpec.aoeMode,
      offHealAllowed: playerProviderSpec.offHealAllowed,
      isMultiSpell: (id) => isMultiTargetCombatSpell(ds.spell(id)),
      isOocKeepUp: (id) => isCompanionKeepUpSpell(ds.spell(id)),
    })
    : null;

  // Every real product fight seeds per-unit yards, so spell range, AoE radius, motion and area auras
  // all engage. Branch policy and the "never open on the melee arc" rule live in combatSeed.ts.
  const petSpecForSession = buildPet(state.char, ds);
  // The pet keeps its own world CDs (Dash/Dive/Sacrifice are minutes) — same store, same clock.
  if (petSpecForSession) {
    petSpecForSession.initialSpellCooldowns =
      sessionSeedFromWorldCooldowns(state.char.pet?.spellCooldowns, now0);
    petSpecForSession.initialCategoryCooldowns =
      sessionSeedFromWorldCooldowns(state.char.pet?.categoryCooldowns, now0);
  }
  // Open yards come from the autopilot's pull setting, not only creature detection, so a frostbolt pull
  // seeds at bolt range. They belong to the pulled creature, and a floor body sets its own band.
  const creatureOpenYd = primary && cdef
    ? pullOpenYd({
      creatureLevel: primary.level,
      playerLevel: state.char.level,
      detectionRange: cdef.detectionRange,
    })
    : 0;
  const primaryOpenYd = resolvePullOpenYards(
    normalizeAutopilotConfig(state.autopilot),
    // The active profile's opener decides the open range: a healer on its DPS list pulls at
    // bolt range, not at the heal band.
    liveRot,
    (id) => ds.spell(id),
    creatureOpenYd,
  );
  const seededGeometry = seedPullGeometry({
    player,
    enemySpecs,
    allySpecs,
    includePet: petSpecForSession != null,
    primaryOpenYd,
    helperDistancesYd: packAssistInfo.map((h) => h.distance),
    // The dial's own mobs seat too, or the pull is a fight against bodies the stage never draws.
    extraDistancesYd: aoePullInfo.map((h) => h.distance),
    primaryEntry: creatureEntry,
    cluster: encounter
      ? {
          origin: encounter.origin,
          spawnGuids: encounter.spawnGuids,
          mapId: encounter.mapId,
          fusedIds: encounter.fusedIds,
          elapsedMs: encounter.elapsedMs,
        }
      : undefined,
    // The pack's melee-vs-caster split reads the kit; the store says what it can reach.
    spellOf: (id) => ds.spell(id),
  });
  const unitPositionsYd = seededGeometry.positions;
  // T3: the frame these offsets live in, so the tactical view knows whether it may draw
  // them on the floorplan or must fall back to an abstract backdrop.
  const geometryAnchor = seededGeometry.anchor;
  // The endless floor MUST clamp motion to the mesh or the party Euclidean-walks into roofed void, and
  // sight comes with it. The party seeds as a tight clump on the origin until the controller restamps.
  let sessionPositions = unitPositionsYd;
  let sessionAnchor = geometryAnchor;
  /** Does this map have geometry to ask? Sight and mesh walk both ride on it. */
  let floorGeometry = false;
  if (opts?.endless && encounter?.origin) {
    sessionAnchor = { frame: 'world-translated', origin: encounter.origin, mapId: encounter.mapId };
    sessionPositions = { player: { x: 0, y: 0 } };
    if (allySpecs?.length) {
      for (let i = 0; i < allySpecs.length; i++) {
        const ring = Math.floor(i / 6) + 1;
        const slot = i % 6;
        const a = (slot / 6) * 2 * Math.PI + (ring % 2 === 0 ? Math.PI / 6 : 0);
        const r = 1.6 * ring;
        sessionPositions[`ally_${i}`] = { x: detCos(a) * r, y: detSin(a) * r };
      }
    }
    if (encounter.mapId != null) {
      // The mesh is the enable gate. A raster that had not decoded turned sight OFF for a whole session
      // with a mesh sitting in the registry, and the raster is gone now.
      floorGeometry = navMeshForMap(encounter.mapId) != null;
    }
  }
  // Seed ScriptDev instanceData from the run (TYPE_PROTECTORS remaining survives across
  // the endless floor session / save). Cite: sunken_temple.cpp:162-178; instances.ts scriptInstanceData.
  const seededInstanceData = state.instance
    ? Object.fromEntries(scriptInstanceDataMap(state.instance))
    : undefined;
  // Hoisted so the Worker payload is DERIVED from the same object the main thread uses, not from a
  // second list that drifts (PERF-RUNSHEET S6b).
  const sessionCfg: CombatConfig = {
    initialSpellCooldowns: initSpellCds,
    initialCategoryCooldowns: initCatCds,
    sitting: opts?.sitting,
    // `encounter` is optional — a plain game.fight(creatureEntry) pull has none, and every
    // other use in this function guards it. Unguarded, a world pull threw on .mapId.
    ...(encounter?.mapId != null
      ? {
        combatObjects: combatObjectsFromBake(encounter.mapId, creatureEntry),
        combatObjectsReusable: combatObjectsReusableFromBake(encounter.mapId, creatureEntry),
        // Where each bag entry stands, so the clicker walks to it.
        combatObjectSites: combatObjectSitesFromBake(
          encounter.mapId,
          combatObjectsFromBake(encounter.mapId, creatureEntry),
          sessionAnchor?.frame === 'world-translated' ? sessionAnchor.origin : undefined,
        ),
        // The click's PAYLOAD, plus every trap gameobject those spells can light with its own spawn.
        // The spell is in no creature kit, so it is resolved here off the bake and handed down.
        spellTrapSites: spellTrapSitesFromBake({
          mapId: encounter.mapId,
          spellIds: enemySpecs.flatMap((e) => (e.spells ?? []).map((sp) => sp.id | 0)),
          anchorOrigin: sessionAnchor?.frame === 'world-translated'
            ? sessionAnchor.origin
            : undefined,
          gameObject: (entry) => ds.gameObject(entry),
          spell: (id) => ds.spell(id),
        }),
        combatObjectTraps: combatObjectTrapsFromBake({
          mapId: encounter.mapId,
          goEntries: combatObjectsFromBake(encounter.mapId, creatureEntry),
          anchorOrigin: sessionAnchor?.frame === 'world-translated'
            ? sessionAnchor.origin
            : undefined,
          goUseScripts: (goEntry) => ds.goUseScripts(goEntry),
          gameObject: (entry) => ds.gameObject(entry),
          spell: (id) => ds.spell(id),
        }),
      }
      : {}),
    // THE per-tick inputs (PERF-RUNSHEET S6b mechanism 2): built once at the top of each step, never
    // asked for during it, so the sim can run where these values are unreachable.
    tickInputs: () => {
      // Quest entries the log holds as 'active'. A 1.12 log caps around 20, so this is nothing.
      const activeQuests = new Set<number>();
      for (const q of state.questlog.quests) {
        if (q.status === 'active') activeQuests.add(q.entry | 0);
      }
      // The two knobs the provider used to read off a LIVE companion ref (S6b). `ally_i` is squad
      // order — squadDungeon pushes one ally spec per companion before any pet.
      const companionKnobs = new Map<string, { aoeMode: number; offHeal: boolean }>();
      const squad = state.squad ?? [];
      for (let i = 0; i < squad.length; i++) {
        const comp = squad[i]!;
        companionKnobs.set(`ally_${i}`, {
          aoeMode: encodeAoeMode(resolveAoeMode(comp)),
          offHeal: resolveOffHeal(comp),
        });
      }
      const mapId = encounter?.mapId;
      if (mapId == null) return { activeQuests, companionKnobs };
      // Which bag entries are worth pressing. Only Gnomeregan answers today: all six gnomeface
      // buttons are present all fight and only the lit face closes a vent.
      const actionableObjects = new Set<number>();
      for (const goEntry of combatObjectsFromBake(mapId, creatureEntry)) {
        // The gnomeface path owns its own liveness (six buttons, one lit).
        if (thermapluggButtonFaceIndex(goEntry) != null) {
          if (thermapluggButtonIsLive(state.instance?.thermapluggFaces, goEntry)) {
            actionableObjects.add(goEntry);
          }
          continue;
        }
        // Otherwise the click has to be able to DO something: `useInstanceObject` refuses with
        // "Nothing happens" when the def hosts no objectGate for this entry, and an unanswerable
        // row still costs the walk. Razorgore's orb 177808 is named by a use_object tactics row
        // while blackwing-lair's def has no objectGate at all, so the raid spent every Razorgore
        // attempt walking to it: move 803, moveDone 0, 21 minutes of sim per attempt and 615 dps
        // from 40 bodies.
        const encDef = ds.instance(state.instance?.dungeonId ?? '');
        if (encDef && findObjectGate(encDef, goEntry)) actionableObjects.add(goEntry);
      }
      return { activeQuests, companionKnobs, actionableObjects };
    },
    // Baked `conditions` rows so spells carrying only a conditionId resolve in-fight.
    conditionTable: conditionTableById(),
    // The one in-fight DataStore read the combat engine cannot do itself: SCALES_WITH_CREATURE_LEVEL
    // needs BaseDamage(level, unitClass). Cite: Object.cpp:3005-3013; dataStore.creatureClassLvlStats.
    creatureBaseDamageAt: (lvl, unitClass) => ds.creatureClassLvlStats(lvl, unitClass)?.baseDamage,
    // The rank ladder, for aura identity (P7). Cite: dataStore.spellChain.
    spellChainOf: (spellId) => ds.spellChain(spellId),
    // Spell 1604 Dazed, for the back-arc NPC white hit. Cite: Unit.cpp:2227.
    dazeSpell: ds.spell(DAZED_SPELL_ID),
    // AuraInterruptFlags by id, for holders the engine only knows by spell id.
    auraInterruptFlagsOf: (spellId) => (ds.spell(spellId)?.auraInterruptFlags ?? 0) | 0,
    // The global spell store: a triggered payload resolves by id, not by kit membership.
    // Cite: Unit.cpp:1447-1449; ENGINE-REBUILD.md E6.
    spellOf: (id) => ds.spell(id),
    ...(seededInstanceData && Object.keys(seededInstanceData).length
      ? { instanceData: seededInstanceData }
      : {}),
    // Map::IsDungeon: inside an instance run. Keeps the outdoor far-evade despawn off the floor, so a
    // boss chased 150 yd from its start point walks home instead of vanishing.
    ...(state.instance ? { dungeonMap: true } : {}),
    // Continuous floor: a pack wipe does not end the session, a member with nothing to fight walks
    // back to 14 yd, and a mob you have not touched does not move — the old t=0 seed ran untouched
    // helpers 27 yd each.
    ...(opts?.endless
      ? {
        endless: true,
        seedAttackStart: false,
        maxMs: 48 * 60 * 60_000,
        // Flat for every roster size. The 35 yd raid leash this replaced existed only to let the back
        // line camp 30 yd out, and the floor formation is 3 yd deep at any size.
        partyFollowYd: PARTY_FOLLOW_YD,
        acquireRangeYd: 45,
      }
      : {
        seedAttackStart: false,
        packAssistDelayMs: CREATURE_FAMILY_ASSISTANCE_DELAY_MS,
      }),
    // Mid-fight EventAI inject: an unresolved template skips with an honest log and combat continues.
    // The spell list's combat condition gates it. Cite: UnitAI.cpp:1218-1224.
    combatConditionTable: {
      combatCondition: (id) => ds.combatCondition(id),
      unitCondition: (id) => ds.unitCondition(id),
    },
    resolveSummon: (creatureId) => {
      const spec = resolveSummonForFight(ds, creatureId, rng);
      if (!spec) {
        log(`Summon skipped: no template for creature entry ${creatureId}.`);
      }
      return spec;
    },
    // ScriptDev SpellHit rows gated on an open quest. 'active' is QUEST_STATUS_INCOMPLETE; 'complete'
    // means objectives met and not turned in. Cite: stranglethorn_vale.cpp:55-64.
    // `isQuestIncomplete` was a closure the tick called mid-step; the ACTIVE set now rides in with
    // the tick (S6b mechanism 2). A 1.12 log holds ~20 quests, so building it per tick is nothing.
    // The recorded-effect applier (S6b mechanism 1). The tick pushes; `ctx.step` flushes here at the
    // end of the step, and off-thread the same array rides back with the batch. One switch, one place.
    applyEffect: (effect) => {
      switch (effect.kind) {
        // ACTION_T_QUEST_EVENT gives the same credit as a GOOBER event. The solo product has no
        // party, so personal credit is the group-event equivalent. Cite: CreatureEventAI.cpp ~847-862.
        case 'questEvent': {
          const questId = effect.questId;
          if (!questId) return;
          const before = state.questlog;
          state.questlog = recordEventHappens(state.questlog, questId);
          creditSquadEvent(state, questId);
          if (state.questlog !== before) {
            const qdef = ds.quest(questId);
            log(qdef?.title
              ? `Event credit: ${qdef.title}.`
              : `Event credit for quest ${questId}.`);
            refreshQuests();
          }
          return;
        }
        // A skill point the swing earned, onto the sheet as it lands. Off-thread the reading side
        // never swings, so this is the only way a weapon point crosses. Cite: Player.cpp
        // UpdateCombatSkills; weapon.ts tryMeleeSkillGains.
        case 'skillGain': {
          const id = effect.skillId | 0;
          if (!id || !state.char.combatSkills) return;
          carryCombatSkillGains({ [id]: { current: effect.current, max: effect.max } });
          return;
        }
        // A consumable the tick spent. Off-thread the reading side's `itemsSpent` is empty, so this
        // is the only way a spend crosses before zone-out. Cite: itemUse.ts ctx.useItem seam.
        case 'itemSpend': {
          const e = effect.entry | 0;
          if (!e) return;
          const side = effect.side;
          if (side && isAllySide(side)) {
            applyAllyItemSpends([{ allyIndex: Number(side.slice(5)), entry: e, count: effect.total | 0 }]);
            return;
          }
          applyItemSpends(
            [{ entry: e, count: effect.total | 0 }],
            effect.charges != null ? [{ entry: e, charges: effect.charges | 0 }] : undefined,
          );
          return;
        }
        // ACTION_T_KILLED_MONSTER: kill credit for an entry OTHER than the one that died, which is
        // why those templates are attackable by faction and must not be pruned as doodads.
        case 'killCredit': {
          const e = effect.creatureEntry | 0;
          if (!e) return;
          const before = state.questlog;
          state.questlog = recordKill(state.questlog, e, (q) => ds.quest(q));
          creditSquadKill(state, e, ds);
          if (state.questlog !== before) {
            log(`Kill credit: ${ds.creature(e)?.name ?? `creature ${e}`}.`);
            refreshQuests();
          }
          return;
        }
        // ACTION_T_START_RELAY_SCRIPT (53) — run the dbscripts_on_relay stream through the same
        // path a GO use takes. Cite: CreatureEventAI.cpp:1225-1244; goEventFire runBakedCommand51.
        case 'relayScript': {
          const rows = ds.relayScripts(effect.relayId | 0);
          if (!rows.length) return;
          log(`Relay script ${effect.relayId} runs (${rows.length} step${rows.length === 1 ? '' : 's'}).`);
          return;
        }
        // OnCreatureDeath SetData → persist + open doors on goRuntime (ST 149431 / #1385 shape).
        // Cite: sunken_temple.cpp:162-178; sessionDeaths applyInstanceSetData.
        case 'instanceData': {
          if (!state.instance) return;
          state.instance = persistScriptInstanceData(state.instance, new Map(effect.store));
          for (const go of effect.openDoors) {
            const key = `${state.char.zoneId}:${go}`;
            const prev = state.goRuntime?.[key] ?? {};
            state.goRuntime = {
              ...(state.goRuntime ?? {}),
              [key]: { ...prev, open: true },
            };
            log(`Door ${go} opens.`);
          }
          return;
        }
        // THE CLICK NEEDS AN EXECUTOR: nothing had assigned this hook, so both shipped use_object
        // rows did nothing — Razorgore's orb and Ossirian's crystals, two whole encounter phases.
        case 'useCombatObject': {
          const r = useInstanceObject(effect.goEntry);
          if (!r.ok) log(`Combat object ${effect.goEntry}: ${r.reason}`);
          return;
        }
        default:
          return;
      }
    },
    // KI-612: in-fight Pick Pocket grants loot/gold (same domain path as OOC pickPocket).
    // Cite: SpellEffects.cpp EffectPickPocket; domain/professions/pickpocket.ts.
    onPickPocket: (entry) => grantInFightPickPocket(entry),
    ...(allyActionProviders ? { allyActionProviders } : {}),
    ...(playerActionProvider ? { playerActionProvider } : {}),
    ...(allyPetIndex ? { allyPetIndex } : {}),
    ...(sessionPositions ? { unitPositionsYd: sessionPositions } : {}),
    ...(sessionPositions ? { geometryAnchor: sessionAnchor } : {}),
    // Floor pulls get mesh walk AND sight: a cast or an AoE fan through a wall was pulling the pack
    // in the next room. Sight fails open off-mesh, which is what kept the cast freeze from recurring.
    ...(floorGeometry ? { navLos: true } : {}),
    // Spell.cpp:4604-4612 — only a measured-indoors pull sets this; absent is outdoors.
    ...(encounter?.outdoors === false ? { outdoors: false } : {}),
  };
  const session = createSession(
    player,
    enemySpecs.length === 1 ? enemySpecs[0]! : enemySpecs,
    rng,
    sessionCfg,
    petSpecForSession,
    allySpecs,
  );
  // What a Worker would be handed instead of this session (PERF-RUNSHEET S6b). DERIVED from the
  // config above by dropping its function members, so the two cannot drift apart.
  // `onPickPocket` is the one member no worker can answer, so a kit that holds Pick Pocket keeps the
  // fight on this thread (smoke/pickPocketSurface.mjs pins that surface at two spells).
  const cloneableCfgEntries: [string, unknown][] = [];
  const droppedCfgNames: string[] = [];
  for (const [k, v] of Object.entries(sessionCfg)) {
    if (typeof v === 'function') { droppedCfgNames.push(k); continue; }
    try {
      structuredClone(v);
      cloneableCfgEntries.push([k, v]);
    } catch {
      // An object holding a closure — `combatConditionTable` is the one that taught us this.
      droppedCfgNames.push(k);
    }
  }
  const PICK_POCKET_IDS = new Set([921, 5967]);
  const kitHasPickPocket = (spec?: CombatantSpec | null): boolean =>
    !!spec?.spells?.some((sp) => PICK_POCKET_IDS.has(sp.id | 0));
  if (!kitHasPickPocket(player) && !(allySpecs ?? []).some(kitHasPickPocket)) {
    session.workerInit = {
      kind: 'init',
      player,
      enemies: enemySpecs,
      ...(allySpecs ? { allies: allySpecs } : {}),
      ...(petSpecForSession ? { pet: petSpecForSession } : {}),
      seed: sessionSeed,
      cfg: {
        ...Object.fromEntries(cloneableCfgEntries),
        wantsSpellStore: true,
      },
      ...(allyProviderSpecs ? { allyProviderSpecs } : {}),
      ...(playerProviderSpec ? { playerProviderSpec } : {}),
      // The floor, by the URLs this thread loaded it from, so the far side stands on the same mesh.
      ...(encounter?.mapId != null && navMeshSourceUrl(encounter.mapId)
        ? {
          navAssets: {
            mapId: encounter.mapId,
            meshUrl: navMeshSourceUrl(encounter.mapId) ?? undefined,
            collisionUrl: collisionSourceUrl(encounter.mapId) ?? undefined,
            outdoorsUrl: outdoorsSourceUrl(encounter.mapId) ?? undefined,
          },
        }
        : {}),
      // Every write tees through the facade (simFacade.ts commandOf), seats are forced to the same
      // name on both sides, and commands posted during the boot are held rather than dropped.
      commandChannel: true,
      // What the filter had to drop. The worker rebuilds these from its own store; naming them means a
      // member that grows a closure is visible instead of silently missing on the far side.
      droppedCfg: droppedCfgNames,
    };
  }
  bindFightEnter(session, now0);
  // Live pet HP is the combat unit, since Health Funnel ticks it. Mirror it onto the character's pet so
  // outdoor autofight sees the heal without waiting for resolveFight.
  const innerTick = session.tick.bind(session);
  session.tick = (action, inputs) => {
    const ev = innerTick(action, inputs);
    const pv = session.petView();
    if (state.char.pet && pv) state.char.pet.health = pv.hp;
    return ev;
  };
  if (allySpecs && allyPetIndex) {
    // Humans occupy ally_0..n-1 in state.squad order (the same mapping allyItemsConsumed uses).
    sessionPartyLayout.set(session, {
      compIds: (state.squad ?? []).slice(0, allyPetIndex.length).map((c) => c.id),
      petAllyIndex: allyPetIndex,
    });
  }
  pendingFight = {
    rng,
    creatureEntry,
    enemyLevel: primary?.level ?? 0,
    pack: packMeta.length ? packMeta : undefined,
    ...(opts?.endless ? { endless: true } : {}),
    encounter: encounter
      ? {
          dungeonId: encounter.dungeonId,
          encounterId: encounter.encounterId,
          phaseIndex: encounter.phaseIndex ?? 0,
          ...(encounter.outdoors === false ? { outdoors: false } : {}),
          ...(encounter.fusedIds?.length ? { fusedIds: encounter.fusedIds } : {}),
          ...(encounter.resolved ? { resolved: encounter.resolved } : {}),
        }
      : undefined,
    withSquad: opts?.withSquad === true ? true : undefined,
  };
  // Wave 4C metadata: who would social-aggro by GetAttackDistance (larger than CallForHelp).
  let spatialAdds: BeginFight['spatialAdds'];
  if (!encounter && zoneHasSpatialSpawns(ds, state.char.zoneId)) {
    const hits = spatialAddsForPull(ds, state.char.zoneId, creatureEntry, state.char.level);
    if (hits.length) {
      spatialAdds = hits.map((h) => ({
        entry: h.entry,
        distance: h.distance,
        attackDistance: h.attackDistance,
      }));
    }
  }
  if (runFacade) {
    runFacade.rebind(session);
  } else {
    runFacade = createSimFacade(session);
    // The pet mirror again, on the READING side, registered once for the run. The `tick` wrapper
    // above only fires where the tick runs, and off-thread that is the worker.
    const held = runFacade.session;
    runFacade.onBatch(() => {
      const pv = held.petView();
      if (state.char.pet && pv) state.char.pet.health = pv.hp;
    });
  }
  const faceted = runFacade.session;
  liveFightSession = faceted;
  // A new fight starts a fresh debit ledger. Cite: applyItemSpends delta tracking below.
  itemSpendApplied = new Map<number, number>();
  allyItemSpendApplied = new Map<string, number>();
  itemGainApplied = new Map<number, number>();
  allyItemGainApplied = new Map<string, number>();
  shardGainApplied = 0;
  // S4A: surface clear-credit batch so live Incoming / openFusedIds stay aligned.
  const beginFusedIds = encounter?.fusedIds?.length
    ? encounter.fusedIds
    : encounter ? [encounter.encounterId] : undefined;
  return {
    ok: true,
    session: faceted,
    enemyName: cdef?.name ?? '',
    enemyEntry: creatureEntry,
    playerMax: player.maxHealth,
    enemyMax: primary?.spec.maxHealth ?? 0,
    ...(packAssistInfo.length ? { packAssist: packAssistInfo } : {}),
    ...(aoePullInfo.length ? { aoePull: aoePullInfo } : {}),
    spatialAdds,
    ...(beginFusedIds ? { fusedIds: beginFusedIds } : {}),
  };
};

// `withSquad` folds the hired companions in as real allies (same path dungeon pulls use).
// Outdoor fights stay solo unless a caller asks — Auto Quest asks for elite pulls (setup).
// `attack` reads the Attack dial; `noAoe` skips farm-dial extras (a detected pickpocket).
const beginFight = (
  creatureEntry: number,
  opts?: { withSquad?: boolean; sitting?: boolean; attack?: boolean; noAoe?: boolean },
): ActionResult<BeginFight> =>
  startFight(creatureEntry, undefined, undefined, {
    withSquad: opts?.withSquad, sitting: opts?.sitting, attack: opts?.attack, noAoe: opts?.noAoe,
  });

// Roof over a live-floor pull. `spawnGuids` on the baked encounters is the join key the floor has; an
// unbaked guid falls back to the instance majority. Cite: apply-encounter-outdoors.ts.
const floorPullOutdoors = (dungeonId: string, guids: readonly number[]): boolean => {
  const def = ds.instance(dungeonId);
  if (def) {
    for (const g of guids) {
      const hit = outdoorsForSpawnGuid(def, g);
      if (hit !== undefined) return hit;
    }
  }
  return instanceDefaultOutdoors(dungeonId);
};

// Free-floor pull: fight exactly these spawn guids at their world coords, with no route wave or pack
// table. The encounter id is synthetic so a win does not auto-clear route ids.
const beginFloorPull = (opts: {
  dungeonId: string;
  mapId: number;
  members: readonly { guid: number; entry: number; x: number; y: number }[];
  withSquad?: boolean;
  elapsedMs?: number;
}): ActionResult<BeginFight> => {
  const members = opts.members.filter((m) => m.entry > 0 && Number.isFinite(m.x) && Number.isFinite(m.y));
  if (!members.length) return { ok: false, reason: 'No hostiles to pull' };
  if (!state.instance || state.instance.dungeonId !== opts.dungeonId) {
    return { ok: false, reason: 'You are not in that dungeon' };
  }
  const primary = members[0]!;
  const pack =
    members.length > 1
      ? members.slice(1).map((m) => ({ creatureEntry: m.entry, count: 1 }))
      : undefined;
  const ox = members.reduce((s, m) => s + m.x, 0) / members.length;
  const oy = members.reduce((s, m) => s + m.y, 0) / members.length;
  const guids = members.map((m) => m.guid);
  // The floor pulls by guid, not by route id — join through EncounterDef.spawnGuids and fall
  // back to the instance's majority when this guid belongs to no baked pull.
  const floorOutdoors = floorPullOutdoors(opts.dungeonId, guids);
  return startFight(primary.entry, undefined, {
    dungeonId: opts.dungeonId,
    encounterId: `floor-${primary.guid}`,
    ...(floorOutdoors === false ? { outdoors: false } : {}),
    ...(pack?.length ? { pack } : {}),
    origin: { x: ox, y: oy },
    spawnGuids: guids,
    mapId: opts.mapId,
    ...(opts.elapsedMs != null && opts.elapsedMs > 0 ? { elapsedMs: opts.elapsedMs } : {}),
  }, opts.withSquad ? { withSquad: true } : undefined);
};

// Continuous dungeon shell: ONE endless combat session for the whole run, opened with NO enemies at all.
// combatView mounts once; pulls inject in place — no scene thrash.
const beginFloorShell = (opts: {
  dungeonId: string;
  mapId: number;
  origin: { x: number; y: number; z?: number };
  withSquad?: boolean;
}): ActionResult<BeginFight> => {
  if (!state.instance || state.instance.dungeonId !== opts.dungeonId) {
    return { ok: false, reason: 'You are not in that dungeon' };
  }
  return startFight(0, undefined, {
    dungeonId: opts.dungeonId,
    encounterId: 'floor-shell',
    // Shell opens on the instance majority; injectFloorMember re-points it per pull.
    ...(instanceDefaultOutdoors(opts.dungeonId) ? {} : { outdoors: false }),
    origin: { x: opts.origin.x, y: opts.origin.y },
    mapId: opts.mapId,
    spawnGuids: [],
  }, {
    withSquad: opts.withSquad === true,
    endless: true,
    noPrimary: true,
  });
};

/** Inject one DB spawn into the open endless floor session at world coords. */
const injectFloorMember = (
  session: CombatSession,
  member: { guid: number; entry: number; x: number; y: number; z?: number },
  opts?: { passive?: boolean },
): ActionResult<{ side: string; name: string; entry: number; level: number }> => {
  if (!liveFightSession || liveFightSession !== session) {
    return { ok: false, reason: 'No open floor session' };
  }
  if (!pendingFight) return { ok: false, reason: 'No pending floor fight' };
  if (!(member.entry > 0) || !Number.isFinite(member.x) || !Number.isFinite(member.y)) {
    return { ok: false, reason: 'Invalid floor member' };
  }
  const mdef = resolveCreatureDefForCombat(member.entry, (id) => ds.creature(id));
  if (!mdef) return { ok: false, reason: `No template for entry ${member.entry}` };
  const built = buildEnemySpecFromCreature(ds, mdef, pendingFight.rng);
  const spawn = getDungeonSpawn(member.guid);
  if (spawn) built.spec.movementType = spawn.MovementType | 0; // GetDefaultMovementType. Cite: naxxramas.cpp:995
  // Ask the FRAME, as the other origin lifts do: `origin` exists only on a world-translated anchor, and
  // falling through to the member's own position stacked every injected body on the session origin.
  const anchor = typeof session.geometryAnchor === 'function' ? session.geometryAnchor() : undefined;
  const origin = anchor?.frame === 'world-translated' ? anchor.origin : undefined;
  if (!origin) {
    return { ok: false, reason: 'Floor session has no world origin to place this body against' };
  }
  // Carry absolute world z (same rule as CombatPosYd) so storey LOS / sameStorey work.
  const pos = member.z != null && Number.isFinite(member.z)
    ? { x: member.x - origin.x, y: member.y - origin.y, z: member.z }
    : { x: member.x - origin.x, y: member.y - origin.y };
  const passive = opts?.passive === true;
  // The world's guid rides in with the spec (E1.0). The side this comes back as is a slot that
  // gets recycled; the guid is the unit.
  const side = session.injectEnemy({ ...built.spec, guid: member.guid }, pos, { passive });
  if (!side) return { ok: false, reason: 'Failed to inject enemy into combat' };
  // One shell session spans the whole run, so the roof travels with the pull, not the open.
  if (!passive && state.instance && typeof session.setOutdoors === 'function') {
    session.setOutdoors(floorPullOutdoors(state.instance.dungeonId, [member.guid]));
  }
  // Kill credit pack only once combat starts (active inject / later engage). Passive pool
  // streams in passive so walking past does not queue every spawn as a pull.
  if (!passive) {
    pendingFight = {
      ...pendingFight,
      pack: [...(pendingFight.pack ?? []), { entry: member.entry, level: built.level, guid: member.guid }],
    };
  }
  return {
    ok: true,
    side,
    name: built.spec.name,
    entry: member.entry,
    level: built.level,
  };
};

/** Queue kill-credit for a floor guid that entered combat after a passive stream inject. */
const noteFloorPackMember = (
  member: { guid: number; entry: number; level: number },
): ActionResult => {
  if (!pendingFight) return { ok: false, reason: 'No pending floor fight' };
  const pack = pendingFight.pack ?? [];
  if (pack.some((k) => k.guid === member.guid)) return { ok: true };
  pendingFight = {
    ...pendingFight,
    pack: [...pack, { entry: member.entry, level: member.level, guid: member.guid }],
  };
  return { ok: true };
};

// Weapon/defense skill the swings earned, onto the sheet. The floor credits a pack without ending the
// session, so this is the only write-back an endless run gets. Cite: Player.cpp UpdateCombatSkills.
const carryCombatSkillGains = (gained: CombatSkillMap | undefined): void => {
  const merged = mergeCombatSkillGains(state.char.combatSkills, gained);
  if (merged && merged !== state.char.combatSkills) state.char.combatSkills = merged;
};

// Settle XP/loot/gold for pending pack members without ending the endless session. Call when living
// hostiles hit 0 after a floor pull.
  /**
 * Debit what a fight SPENT. Cite: Spell.cpp TakeAmmo; Spell.cpp:4209 TakeCastItem.
 * Called from settleFight AND from creditFloorKills — the live floor clears packs without ever
 * reaching resolveFight ("full resolveFight only at zone-out", liveCockpitWalk.ts:304), so a
 * grenade or a quest item used on the floor was never taken out of the bags.
 */
const applyItemSpends = (
  consumed: readonly { entry: number; count: number }[] | undefined,
  chargesLeft: readonly { entry: number; charges: number }[] | undefined,
): void => {
  const delta: { entry: number; count: number }[] = [];
  for (const c of consumed ?? []) {
    const already = itemSpendApplied.get(c.entry) ?? 0;
    const n = c.count - already;
    if (n > 0) { delta.push({ entry: c.entry, count: n }); itemSpendApplied.set(c.entry, c.count); }
  }
  consumed = delta;

  // combatItems reads equippedChargesOf first, so TakeCastItem's instance is the worn one.
  const wornSlotOf = (entry: number): keyof NonNullable<typeof state.char.equipped> | null => {
    const eq = state.char.equipped;
    if (!eq) return null;
    for (const slot of Object.keys(eq) as (keyof typeof eq)[]) {
      if (equippedEntry(eq[slot]) === entry) return slot;
    }
    return null;
  };

  // Charges first: writing after a last-charge destroy would land on a bag spare of the same entry.
  // Cite: Spell.cpp:4209 TakeCastItem; buildCombatant.ts equippedChargesOf.
  for (const c of chargesLeft ?? []) {
    const slot = wornSlotOf(c.entry);
    if (slot != null) {
      const equipped = { ...state.char.equipped };
      const inst = equippedInstance(equipped[slot])!;
      equipped[slot] = { ...inst, charges: c.charges };
      state.char = { ...state.char, equipped };
      continue;
    }
    const stacks = state.inventory.stacks ?? [];
    const idx = stacks.findIndex((st) => st.item === c.entry);
    if (idx >= 0) {
      const next = stacks.map((st) => ({ ...st }));
      next[idx] = { ...next[idx]!, charges: c.charges };
      state.inventory = { ...state.inventory, stacks: next };
    }
  }

  // Remove consumables and ammo/thrown. Cite: Spell.cpp TakeAmmo; Spell.cpp:4209 TakeCastItem.
  for (const c of consumed ?? []) {
    let n = c.count;
    if (n > 0 && isExpendableCastItem(ds.item(c.entry))) {
      const slot = wornSlotOf(c.entry);
      if (slot != null) {
        const equipped = { ...state.char.equipped };
        delete equipped[slot];
        state.char = { ...state.char, equipped };
        n -= 1;
      }
    }
    const bagHave = countItem(state.inventory, c.entry);
    const fromBags = Math.min(bagHave, n);
    if (fromBags > 0) state.inventory = removeItem(state.inventory, c.entry, fromBags)[0];
    const still = n - fromBags;
    // Leftover after bags: thrown depleted off the equipped stack, or Rocket Boots malfunction.
    if (still > 0) {
      const equipped = { ...state.char.equipped };
      let cleared = false;
      for (const slot of Object.keys(equipped) as (keyof typeof equipped)[]) {
        if (equippedEntry(equipped[slot]) !== c.entry) continue;
        delete equipped[slot];
        cleared = true;
      }
      if (cleared) state.char = { ...state.char, equipped };
    }
    if (state.char.ammoItem === c.entry && countItem(state.inventory, c.entry) < 1) {
      const next = { ...state.char };
      delete next.ammoItem;
      state.char = next;
    }
  }
};

const applyAllyItemSpends = (
  consumed: readonly { allyIndex: number; entry: number; count: number }[] | undefined,
): void => {
  for (const c of consumed ?? []) {
    const key = `${c.allyIndex | 0}:${c.entry | 0}`;
    const already = allyItemSpendApplied.get(key) ?? 0;
    const n = (c.count | 0) - already;
    if (n <= 0) continue;
    allyItemSpendApplied.set(key, already + n);
    const comp = state.squad?.[c.allyIndex];
    if (!comp) continue;
    const bags = comp.bags ?? emptyInventory();
    const take = Math.min(countItem(bags, c.entry), n);
    if (take > 0) comp.bags = removeItem(bags, c.entry, take)[0];
  }
};

// Items a fight PUT in the bags — the player's own drops, a warlock's Drain Soul shards, and the same
// for every companion seat. Cumulative like the spend ledgers, so both callers charge the delta.
const bankItemsGained = (result: {
  itemsGained?: readonly { entry: number; count: number }[];
  allyItemsGained?: readonly { allyIndex: number; entry: number; count: number }[];
  soulShardsGained?: number;
}): void => {
  for (const g of result.itemsGained ?? []) {
    const already = itemGainApplied.get(g.entry) ?? 0;
    const n = (g.count | 0) - already;
    if (n <= 0) continue;
    itemGainApplied.set(g.entry, already + n);
    state.inventory = addItem(state.inventory, g.entry, n, ds.item(g.entry)?.stackable ?? 1);
  }
  // A shard is one bag slot (stackable 1): past a full bag DoCreateItem creates nothing.
  // Cite: Spell.cpp DoCreateItem EQUIP_ERR_INVENTORY_FULL.
  const shards = ((result.soulShardsGained ?? 0) | 0) - shardGainApplied;
  if (shards > 0 && state.char.cls === CLASS.WARLOCK && ds.item(SOUL_SHARD_ITEM)) {
    shardGainApplied += shards;
    const room = freeSlots(state.inventory, bagCapacity(state.char, ds));
    const got = Math.min(shards, room);
    if (got > 0) {
      state.inventory = addItem(state.inventory, SOUL_SHARD_ITEM, got, ds.item(SOUL_SHARD_ITEM)?.stackable ?? 1);
      log(`You gain ${got} soul shard${got > 1 ? 's' : ''}.`);
    }
    if (got < shards) log('Your bags are full. The soul shard is lost.');
  }
  for (const g of result.allyItemsGained ?? []) {
    const key = `${g.allyIndex | 0}:${g.entry | 0}`;
    const already = allyItemGainApplied.get(key) ?? 0;
    const n = (g.count | 0) - already;
    if (n <= 0) continue;
    allyItemGainApplied.set(key, already + n);
    const comp = state.squad?.[g.allyIndex];
    if (!comp) continue;
    const bags = comp.bags ?? emptyInventory();
    // Bounded by the bag, and for shards also by the carry cap: an unstacked shard costs a slot, and a
    // warlock that banked every drain kill filled its bags and could not take a gear swap again.
    const shell = companionCharacter(comp, companionLevel(comp, state.char.level), ds);
    const cap = bagCapacity(shell, ds);
    const maxStack = Math.max(1, ds.item(g.entry)?.stackable ?? 1);
    let got = isSoulShard(g.entry)
      ? Math.min(n, soulShardRoom(bags, freeSlots(bags, cap)))
      : n;
    while (got > 0 && !canFit(bags, g.entry, got, maxStack, cap)) got--;
    if (got <= 0) {
      if (isSoulShard(g.entry)) log(`${comp.name} cannot carry another soul shard.`);
      continue;
    }
    comp.bags = addItem(bags, g.entry, got, maxStack);
  }
};

const creditFloorKills = (opts?: {
  /** Credit only these spawn guids (evade: dead mobs pay, leashed mobs don't). */
  guids?: number[];
  /** Drop whatever is left uncredited (wipe/evade — no payout for reset mobs). */
  dropRest?: boolean;
  /** Hold drops + coin in the loot window instead of bagging them (boss kill). */
  holdLoot?: boolean;
  lootTitle?: string;
  lootCreatureEntry?: number;
}): ActionResult<{
  xpGained: number;
  goldGained: number;
  loot: LootDrop[];
  killCount: number;
  /** What each corpse's death script summoned. The floor owns where the body lands. */
  summons: FloorDeathSummon[];
}> => {
  if (!pendingFight) return { ok: false, reason: 'No pending floor fight' };
  // Ahead of the empty-pack return: an evade or a wipe still swung, and those points are earned.
  if (liveFightSession) {
    const r = liveFightSession.result();
    carryCombatSkillGains(r.player.combatSkills);
    // What the pull SPENT leaves the bags here. The floor clears packs without ever reaching
    // resolveFight ("full resolveFight only at zone-out" — liveCockpitWalk.ts:304), and the kit is
    // rebuilt from bags each session, so a grenade or a quest item used on the floor was free.
    applyItemSpends(r.itemsConsumed, r.itemChargesLeft);
    applyAllyItemSpends(r.allyItemsConsumed);
    // …and what it EARNED. Only the spends were here, so a companion warlock's Drain Soul shards
    // waited for zone-out and its healthstone run ran dry after the spawn kit's 10.
    bankItemsGained(r);
    // Auras were never in this write-back: a stealth the pull broke stayed on the sheet all run,
    // so the buff bar showed it and the next fight seeded from it.
    for (const gone of syncSheetStealthFromSession(state.char, ds, liveFightSession)) {
      log(`${gone.name} fades.`);
    }
  }
  const pack = pendingFight.pack ?? [];
  const take = opts?.guids
    ? pack.filter((k) => k.guid != null && opts.guids!.includes(k.guid))
    : pack;
  const rest = opts?.dropRest ? [] : pack.filter((k) => !take.includes(k));
  const kills = take;
  if (!kills.length) {
    pendingFight = { ...pendingFight, pack: rest };
    return { ok: true, xpGained: 0, goldGained: 0, loot: [], killCount: 0, summons: [] };
  }
  const deathSummons: FloorDeathSummon[] = [];
  const rng = pendingFight.rng;
  const neededLootItems = partyNeededQuestItems(state, ds);
  const lootRollCtx = {
    allowsQuestDrop: (entry: { item: number }) => neededLootItems.has(entry.item),
    allowsCondition: (conditionId: number) =>
      isConditionSatisfied(conditionId, lootConditionSnapshot(), conditionTableById()).ok,
    // The other faction's Alterac quest item never drops for you. Cite: avQuestItems.ts — the DB's
    // own rows are asymmetric, so the lock comes from whose quest the item belongs to.
    allowsItem: (itemId: number) => avAllowsLoot(
      itemId,
      factionOf(ds, state.char.race) === 'horde' ? 'horde' : 'alliance',
    ),
  };
  const loot: LootDrop[] = [];
  const heldDrops: LootDrop[] = [];
  let goldGained = 0;
  let xpGained = 0;
  for (const k of kills) {
    const def = ds.creature(k.entry);
    if (!def) continue;
    const rolled = rollLootDeep(ds.lootTable(def.lootId), (id) => ds.lootTable(id), rng, 0, 8, lootRollCtx);
    for (const l of rolled) giveSquadQuestItem(state, ds, l.item, l.count);
    if (opts?.holdLoot) {
      for (const l of rolled) { heldDrops.push(l); loot.push(l); }
    } else {
      for (const l of rolled) {
        const took = takeDrop(l.item, l.count);
        if (took > 0) {
          const rp = latestRandomPropertyId(state.inventory, l.item);
          loot.push(rp != null ? { item: l.item, count: took, randomPropertyId: rp } : { item: l.item, count: took });
        }
      }
    }
    // Floor has no skin-corpse UI: auto-skin when the party can, else skip the hide.
    {
      const skinNode = ds.skinNode(def.entry);
      const skinDef = skinNode != null ? ds.gatherNode(skinNode) : undefined;
      if (skinDef) {
        tryProfessionAutoSkin({
          ds, state, cdefName: def.name, skinDef, rng, applyGather, loot, log,
        });
      }
    }
    goldGained += rng.int(def.minGold, def.maxGold);
    state.questlog = recordKill(state.questlog, def.entry, (e) => ds.quest(e));
    creditSquadKill(state, def.entry, ds);
    for (const s of applyCreatureDeathScripts(def.entry)) {
      deathSummons.push({ ...s, ...(k.guid != null ? { fromGuid: k.guid } : {}) });
    }
    const killXp = killXpAmount(def, state.char.level, k.level);
    xpGained += killXp;
    if (killXp > 0 && (state.char.restedXp ?? 0) > 0) {
      const spend = restBonusSpend(state.char.restedXp ?? 0, killXp);
      if (spend.bonus > 0) {
        xpGained += spend.bonus;
        state.char = { ...state.char, restedXp: spend.remainingRested };
      }
    }
    if (def.onKillRep) {
      const team = factionOf(ds, state.char.race) ?? 'alliance';
      // Diplomacy etc. Cite: Player.cpp GetTotalAuraModifier(SPELL_AURA_MOD_REPUTATION_GAIN).
      const repSpells = [
        ...racialSpells(ds, state.char.race),
        ...(state.spellbook?.known ?? [])
          .map((id) => ds.spell(id))
          .filter((s): s is NonNullable<typeof s> => !!s?.passive),
      ];
      const repMod = reputationAuraModFromSpells(repSpells);
      const repResult = rewardKillReputation({
        onKillRep: def.onKillRep,
        playerTeam: team,
        playerLevel: state.char.level,
        creatureLevel: k.level,
        raceId: state.char.race,
        classId: state.char.cls,
        reputations: state.char.reputations ?? {},
        factions: ds.factions(),
        rates: ds.reputationRates(),
        spillover: ds.reputationSpillover(),
        flags: state.char.factionFlags ?? {},
        ...(repMod ? { repMod } : {}),
      });
      state.char = {
        ...state.char,
        reputations: repResult.reputations,
        factionFlags: repResult.flags ?? state.char.factionFlags,
      };
    }
  }
  // holdLoot: coin stays in the container. Else ModifyMoney clamp — goldGained is applied copper.
  if (opts?.holdLoot) {
    const room = Math.max(0, clampGold(state.char.gold + goldGained) - state.char.gold);
    goldGained = Math.min(goldGained, room);
    if (heldDrops.length || goldGained > 0) {
      const first = kills.map((k) => ds.creature(k.entry)).find((d) => !!d);
      openLoot({
        kind: 'corpse',
        title: opts.lootTitle ?? first?.name ?? 'Corpse',
        creatureEntry: opts.lootCreatureEntry ?? first?.entry,
      }, heldDrops, goldGained);
      loot.splice(0, loot.length, ...withPendingIdentities(loot, state.pendingLoot ?? null));
    }
  } else {
    const before = state.char.gold;
    state.char = { ...state.char, gold: clampGold(before + goldGained) };
    goldGained = state.char.gold - before;
  }
  refreshQuests();
  const lv = grantXp(state.char, xpGained, ds);
  state.char = lv.char;
  if (xpGained > 0 || goldGained > 0) {
    log(
      `Floor pull cleared. +${xpGained} XP`
      + (goldGained ? `, +${moneyMarked(goldGained)}` : '')
      + (kills.length > 1 ? ` (${kills.length} kills)` : '')
      + '.',
    );
  }
  for (const nl of lv.leveledTo) log(`You reached level ${nl}!`);
  // Trash bags immediately (no LootFrame). Equip before sweepGrays sells keepers.
  if (!opts?.holdLoot && loot.length) runAutoEquipUpgrades(8);
  // Pack credit settled — keep session + pendingFight shell for the next inject.
  pendingFight = { ...pendingFight, pack: rest };
  return { ok: true, xpGained, goldGained, loot, killCount: kills.length, summons: deathSummons };
};

const beginEncounter = (
  dungeonId: string,
  encounterId: string,
  opts?: { withSquad?: boolean; elapsedMs?: number; continuousFloor?: boolean },
): ActionResult<BeginFight> => {
  if (!state.instance || state.instance.dungeonId !== dungeonId) {
    return { ok: false, reason: 'You are not in that dungeon' };
  }
  const def = ds.instance(dungeonId);
  const enc = def ? encounterOf(def, encounterId, state.instance) : undefined;
  if (!def || !enc) return { ok: false, reason: 'Unknown encounter' };
  if (isCleared(state.instance, encounterId)) return { ok: false, reason: 'Already defeated' };
  // Continuous product: free-floor pull of any uncleared pack the party walked into.
  // isUnlocked is `requiresFlag` + on-the-route now, so this refuses a gate, not an order.
  if (!opts?.continuousFloor && !isUnlocked(def, state.instance, encounterId)) {
    return { ok: false, reason: 'Clear the path to it first' };
  }

  // DR pull fusion: softCap + PACK_THREAT_BUDGET (mayhem must not reassemble split atoms).
  const fusion = state.instance.pullFusion ?? DEFAULT_PULL_FUSION;
  const route = routeEncounterList(def, state.instance);
  const density = state.instance.routeDensity ?? DEFAULT_ROUTE_DENSITY;
  const budgetPreset =
    state.instance.packBudgetPreset
    ?? packBudgetPresetFor(density, fusion);
  const canAbsorb = makeFusionBudgetGuard(
    state.char.level,
    (entry) => ds.creature(entry),
    (id) => ds.spell(id),
    budgetPreset,
    def.maxPlayers,
  );
  const fuseBatch = fusionBatchFrom(
    route,
    encounterId,
    fusion,
    (id) => isCleared(state.instance!, id),
    MAYHEM_SOFT_CAP,
    canAbsorb,
  );
  // Prefer run.routeEncounters so pack-budget splits are not reloaded from the
  // static InstanceDef (first sub-pull reuses the original id with a smaller pack).
  const fusedEncounters = resolveFusionEncounters(def, fuseBatch, (id) =>
    encounterOf(def, id, state.instance),
  );
  const fusedIds = fuseBatch.encounterIds;

  // CSE pool slots: uniform roll at fight start (seeded rng — LOCK 4 / CMaNGOS ResetEntry).
  const cseRng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
  const rngNext = () => cseRng.next();

  // Ring of Law: same attempt seed as floor startGauntlet (clearedGuids / floorClearedGuids).
  const phaseEnc =
    fusedEncounters.length <= 1
      ? materializeRingOfLawEncounter(
          enc,
          enc.id === 'ring-of-law'
            ? (() => {
                const salt = state.instance!.floorClearedGuids?.length ?? 0;
                const rng = mulberry32(ringOfLawAttemptSeed(enc.id, salt));
                return () => rng.next();
              })()
            : rngNext,
        )
      : enc;

  let pull: { creatureEntry: number; bossSpells?: number[]; pack?: { creatureEntry: number; count: number }[] } | null;
  if (fusedEncounters.length > 1) {
    // Materialize CSE per atom, then union pack members into one multi-enemy pull.
    const materialized = fusedEncounters.map((e) => materializeEncounterCse(e, rngNext));
    pull = mergeRoutePulls(materialized);
  } else {
    // D-4: phase 0 may be primary+pack, a waves[0] table, etc.
    pull = resolveEncounterPhase(phaseEnc, 0, rngNext);
  }
  if (!pull) return { ok: false, reason: 'Encounter has no pull for phase 0' };
  // World-translated seed from the encounter origin, plus spawn guids when present. A fused pull has no
  // coords and takes the synthetic slots; mapId and elapsed time stand path members where they walked.
  const clusterGeom =
    fusedIds.length <= 1 && enc.origin
      ? {
          origin: enc.origin,
          ...(enc.spawnGuids?.length ? { spawnGuids: enc.spawnGuids } : {}),
          mapId: def.mapId,
          ...(opts?.elapsedMs != null && opts.elapsedMs > 0
            ? { elapsedMs: opts.elapsedMs }
            : {}),
        }
      : {};
  return startFight(pull.creatureEntry, pull.bossSpells, {
    dungeonId,
    encounterId,
    pack: pull.pack,
    phaseIndex: 0,
    // Carried even when clusterGeom is skipped (fused pulls): the roof does not depend on
    // whether we could resolve the cluster centroid.
    ...((phaseEnc.outdoors ?? enc.outdoors) === false ? { outdoors: false } : {}),
    ...(fusedIds.length > 1 ? { fusedIds } : {}),
    ...(phaseEnc !== enc ? { resolved: phaseEnc } : {}),
    ...clusterGeom,
  }, opts?.withSquad ? { withSquad: true } : undefined);
};

/** S4A Pull +1 — inject next uncleared route TRASH; never boss/fusion-break. CSE + #187 skip. */
const pullAdditionalPack = (
  dungeonId: string,
  session: CombatSession,
): ActionResult<PullAdditionalPackResult> => {
  if (!state.instance || state.instance.dungeonId !== dungeonId) {
    return { ok: false, reason: 'You are not in that dungeon' };
  }
  if (session.ended) return { ok: false, reason: 'Combat has already ended' };
  if (!liveFightSession || liveFightSession !== session) {
    return { ok: false, reason: 'No open combat session for this pull' };
  }
  if (!pendingFight?.encounter || pendingFight.encounter.dungeonId !== dungeonId) {
    return { ok: false, reason: 'No open dungeon pull' };
  }
  const def = ds.instance(dungeonId);
  if (!def) return { ok: false, reason: 'Unknown dungeon' };

  const currentId = pendingFight.encounter.encounterId;
  const alreadyFused = new Set(
    pendingFight.encounter.fusedIds?.length
      ? pendingFight.encounter.fusedIds
      : [currentId],
  );
  const currentEnc = encounterOf(def, currentId, state.instance);
  if (currentEnc && isFusionBreak(currentEnc)) {
    return { ok: false, reason: 'Cannot pull additional packs during a boss or scripted encounter' };
  }

  const route = routeEncounterList(def, state.instance);
  const routeIds = route.map((e) => e.id);
  const startIdx = routeIds.indexOf(currentId);
  let next: typeof route[number] | undefined;
  const from = startIdx >= 0 ? startIdx + 1 : 0;
  for (let i = from; i < route.length; i++) {
    const enc = route[i]!;
    if (alreadyFused.has(enc.id) || isCleared(state.instance, enc.id)) continue;
    let blocked = false;
    for (let j = 0; j < i; j++) {
      const prevId = routeIds[j]!;
      if (isCleared(state.instance, prevId) || alreadyFused.has(prevId)) continue;
      blocked = true;
      break;
    }
    if (blocked) continue;
    // Pretend open fusion batch is cleared so later route atoms unlock for inject.
    if (!isUnlocked(def, {
      ...state.instance,
      defeated: [
        ...state.instance.defeated,
        ...[...alreadyFused].filter((id) => !state.instance!.defeated.includes(id)),
      ],
    }, enc.id)) {
      if (isFusionBreak(enc) || enc.kind === 'boss') {
        return { ok: false, reason: 'Next encounter is a boss or fusion break' };
      }
      continue;
    }
    if (isFusionBreak(enc) || enc.kind === 'boss') {
      return { ok: false, reason: 'Next encounter is a boss or fusion break' };
    }
    if (enc.kind !== 'trash') continue;
    next = enc;
    break;
  }
  if (!next) return { ok: false, reason: 'No pullable pack remaining on the route' };

  const rng = pendingFight.rng;
  const pull = resolveEncounterPhase(next, 0, () => rng.next());
  if (!pull) return { ok: false, reason: `Encounter ${next.id} has no pull for phase 0` };

  const toBuild: Array<{ entry: number }> = [{ entry: pull.creatureEntry }];
  for (const m of pull.pack ?? []) {
    for (let n = 0; n < m.count; n++) toBuild.push({ entry: m.creatureEntry });
  }

  const injected: PullAdditionalPackResult['injected'] = [];
  const packCredit: Array<{ entry: number; level: number }> = [];
  let baseEnemyIdx = session.enemiesView().length;
  for (const row of toBuild) {
    const mdef = resolveCreatureDefForCombat(row.entry, (id) => ds.creature(id));
    if (!mdef) {
      log(`Pull +1 skipped: no template for creature entry ${row.entry}.`);
      continue;
    }
    const built = buildEnemySpecFromCreature(ds, mdef, rng);
    const caster = isEnemyCasterKit(built.spec.spells, { maxPower: built.spec.maxPower });
    // Ring 1 inject policy: the +1 pack arrives at its honest open band and walks in,
    // not stapled onto the melee arc. Cite: Unit.cpp GetAttackDistance.
    const pos = injectEnemySlotPosition({
      enemyIndex: baseEnemyIdx,
      isCaster: caster,
      meleeOpenYd: getCreatureAttackDistance(built.level, state.char.level, {
        detectionRange: mdef.detectionRange,
      }),
    });
    const side = session.injectEnemy(built.spec, pos);
    if (!side) return { ok: false, reason: 'Failed to inject enemy into combat' };
    injected.push({ side, name: built.spec.name, entry: row.entry });
    packCredit.push({ entry: row.entry, level: built.level });
    baseEnemyIdx++;
  }
  if (injected.length === 0) {
    return { ok: false, reason: `No creatures could be materialized for ${next.name}` };
  }

  const fusedIds = [...alreadyFused, next.id];
  pendingFight = {
    ...pendingFight,
    pack: [...(pendingFight.pack ?? []), ...packCredit],
    encounter: { ...pendingFight.encounter, fusedIds },
  };
  const living = session.livingEnemiesView().length;
  const softCapWarning = living > MAYHEM_SOFT_CAP;
  log(
    `Pull +1: ${next.name} joins the fight (${injected.length} ${injected.length === 1 ? 'enemy' : 'enemies'})` +
      (softCapWarning ? ` - soft cap ${MAYHEM_SOFT_CAP} exceeded` : '') + '.',
  );
  return {
    ok: true,
    encounterId: next.id,
    name: next.name,
    injected,
    softCapWarning,
    combatantCount: combatantCount(next),
    fusedIds,
  };
};

// Use an instance GO wired as `objectGate` on any encounter in the current dungeon. Multi-step gates set
// the flag only after needUses; once-per-instance when gate.once !== false and the flag is already set.
const useInstanceObject = (
  goEntry: number,
  opts?: { ignoreRequiredItem?: boolean },
): ActionResult<{ flag: string; already: boolean; uses: number; needUses: number; completed: boolean }> => {
  if (!state.instance) return { ok: false, reason: 'You are not in an instance' };
  // Corpse cannot fire route flags / object gates (KI-960). Cite: Spell.cpp:4586 CASTER_DEAD.
  {
    const dead = refuseIfDead(state.char.health, state.deathFlow);
    if (dead) return dead;
  }
  const def = ds.instance(state.instance.dungeonId);
  if (!def) return { ok: false, reason: 'Unknown dungeon' };
  if (goEntry === GO_OSSIRIAN_CRYSTAL) {
    const live = liveFightSession;
    const fighting = !!live?.enemiesView().some((e) => e.creatureEntry === NPC_OSSIRIAN);
    if (!live || !fighting) {
      return { ok: false, reason: 'The crystals only answer while Ossirian is engaged.' };
    }
  }
  // The gnomeface buttons are the one GO use whose whole payload is instance state, so the object gate
  // has nothing for them and refused every click. Cite: instance_gnomeregan.cpp:263-274.
  {
    const faceIdx = state.instance.dungeonId === 'gnomeregan'
      ? thermapluggButtonFaceIndex(goEntry)
      : null;
    if (faceIdx != null) {
      const faces = state.instance.thermapluggFaces ?? createThermapluggFightState();
      if (!faces.engaged) {
        return { ok: false, reason: 'Thermaplugg is not engaged; no vent is open.' };
      }
      const was = thermapluggActiveFaceCount(faces);
      const next = thermapluggDeactivateFace(faces, faceIdx);
      const now = thermapluggActiveFaceCount(next);
      state.instance = { ...state.instance, thermapluggFaces: next };
      if (now < was) log(`Bomb face ${faceIdx + 1} deactivates (${now} vents still open).`);
      return { ok: true, flag: '', already: now === was, uses: 1, needUses: 1, completed: true };
    }
  }
  const ritualGo = ds.gameObject(goEntry);
  let ritualJustCompleted = false;
  const wasSummoningRitual = ritualGo?.type === GAMEOBJECT_TYPE_SUMMONING_RITUAL;
  if (wasSummoningRitual && ritualGo) {
    const ritual = applyInstanceSummoningRitual({
      go: ritualGo,
      dungeonId: state.instance.dungeonId,
      char: state.char,
      questlog: state.questlog,
      goRuntime: state.goRuntime,
      squadLength: state.squad?.length ?? 0,
      nowMs: sessionClockNow(),
      spellOf: (id) => ds.spell(id),
      eventScripts: (id) => ds.eventScripts(id),
      log,
    });
    if (!ritual.ok) return { ok: false, reason: ritual.reason };
    state.char = ritual.char;
    state.questlog = ritual.questlog;
    state.goRuntime = ritual.goRuntime;
    ritualJustCompleted = ritual.ritualReady;
  }
  const found = findObjectGate(def, goEntry);
  if (!found) return { ok: false, reason: 'Nothing happens' };
  // molten_coreScripts.cpp:47-52: GetData(type) != DONE → return true (no SetData).
  // Peek before counting the objectGate so seven early clicks cannot spawn 12018.
  const sdIrPeek = scriptDevByGo(goEntry);
  if (sdIrPeek?.goUse && !scriptDevGoUseAllowed(sdIrPeek, state.instance, goEntry)) {
    const alreadyFlag = found.gate.once !== false && hasFlag(state.instance, found.gate.setsFlag);
    const prevUsed = state.instance.objectGateUsedEntries?.[found.gate.setsFlag] ?? [];
    const alreadyEntry = prevUsed.includes(goEntry);
    if (!alreadyFlag && !alreadyEntry) {
      return { ok: false, reason: 'Nothing happens' };
    }
  }
  const required = found.gate.requiredItem;
  // Bags + keyring: Seal of Ascension and friends are BagFamily KEYS, so they are never in bags.
  const owned = required == null || countItem(ownedInventory(state.inventory, state.keyring), required) > 0;
  // Auto-run bypass — same forced `okItem` as autoFireObjectGates (instances.ts:985-988).
  const hasItem = owned || opts?.ignoreRequiredItem === true;
  const r = useObjectGate(state.instance, found.gate, hasItem, {
    goEntry,
    itemCharges: required != null ? ds.item(required)?.charges : undefined,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  state.instance = r.run;
  // Caller spends what useObjectGate reported — never on already / fail / permanent keys.
  if (r.consumeItem != null && owned) {
    const spent = consumeOwnedCharges(state.inventory, state.keyring, r.consumeItem, ds.item(r.consumeItem));
    state.inventory = spent.bags;
    state.keyring = spent.keyring;
  }

  // ScriptDev GO-use, the same seam as interactObject. A type-18 ritual waits for the summoning
  // trigger so the arm matches the send-event. Cite: instance_uldaman.cpp:313-324.
  const sdIr = scriptDevByGo(goEntry);
  if (sdIr?.goUse && (!wasSummoningRitual || ritualJustCompleted)) {
    const dungeonId = state.instance.dungeonId;
    runScriptDevGoUse(sdIr, state, ds, {
      nowMs: sessionClockNow(),
      goRuntimeKey: (entry) => `${dungeonId}:${entry}`,
      log,
      usedGoEntry: goEntry,
    });
  }

  if (goEntry === GO_OSSIRIAN_CRYSTAL && !r.already) {
    const live = liveFightSession;
    if (live) {
      const ossirian = live.enemiesView().find((e) => e.creatureEntry === NPC_OSSIRIAN);
      if (ossirian) {
        const side = ossirian.side;
        live.removeAurasDueToSpell(side, SPELL_OSSIRIAN_SUPREME);
        const weaknessId = OSSIRIAN_WEAKNESS_SPELLS[(Math.max(0, r.uses - 1)) % OSSIRIAN_WEAKNESS_SPELLS.length];
        const weakness = ds.spell(weaknessId);
        if (weakness) live.applySpellToUnit(side, weakness);
        log('The crystal flares - Ossirian weakens!');
      }
    }
  } else if (r.already) {
    log('That has already been used.');
  } else if (!r.completed && r.needUses > 1) {
    log(`You use the object (${goEntry}). (${r.uses}/${r.needUses})`);
  } else {
    log(`You use the object (${goEntry}).`);
  }
  return {
    ok: true,
    flag: r.flag,
    already: r.already,
    uses: r.uses,
    needUses: r.needUses,
    completed: r.completed,
  };
};

// Loot an instance GO authored on `InstanceDef.lootObjects`, once per run per guid, off the baked go
// loot table with the same quest gating as kill loot. Contents are HELD in the standard loot window.
const lootInstanceObject = (
  goGuid: number,
): ActionResult<{ loot: LootDrop[]; name: string }> => {
  if (!state.instance) return { ok: false, reason: 'You are not in an instance' };
  const def = ds.instance(state.instance.dungeonId);
  if (!def) return { ok: false, reason: 'Unknown dungeon' };
  const go = getDungeonGameObject(goGuid);
  if (!go) return { ok: false, reason: 'Nothing there' };
  const authored = (def.lootObjects ?? []).find((l) => l.goEntry === go.entry);
  // Authoring is an OVERRIDE, not the gate: any baked CHEST (type 3) with a lootId is
  // lootable, or the 1,289 chest pins derived from the bake would all open "Nothing happens".
  if (!authored && !(go.type === 3 && (go.lootId ?? 0) > 0)) {
    return { ok: false, reason: 'Nothing happens' };
  }
  if (authored?.revealedByFlag && !hasFlag(state.instance, authored.revealedByFlag)) {
    return { ok: false, reason: 'Nothing happens' };
  }
  const lootedFlag = `go-looted:${goGuid}`;
  if (hasFlag(state.instance, lootedFlag)) {
    return { ok: false, reason: 'It is empty.' };
  }
  // lootTable() is [] until attachLoot. Opening now would mark the guid looted and yield nothing.
  if (!ds.lootAttached()) {
    return { ok: false, reason: 'Nothing happens' };
  }
  // Authored key wins; otherwise the baked lockId decides, and only an ITEM lock blocks —
  // a skill lock (lockpicking/mining) is not a missing key.
  const keyItem = authored?.requiredItem
    ?? (go.lockId ? requiredKeyItemEntry(ds.lock(go.lockId)) ?? undefined : undefined);
  if (keyItem != null && countItem(ownedInventory(state.inventory, state.keyring), keyItem) <= 0) {
    const key = ds.item(keyItem)?.name ?? `item ${keyItem}`;
    return { ok: false, reason: `Locked - you need ${key}` };
  }
  const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
  const neededItems = partyNeededQuestItems(state, ds);
  const table = go.lootId != null && go.lootId !== 0 ? ds.lootTable(`go:${go.lootId}`) : [];
  const rollCtx = {
    allowsQuestDrop: (entry: { item: number }) => neededItems.has(entry.item),
    allowsCondition: (conditionId: number) =>
      isConditionSatisfied(conditionId, lootConditionSnapshot(), conditionTableById()).ok,
    // The other faction's Alterac quest item never drops for you. Cite: avQuestItems.ts — the DB's
    // own rows are asymmetric, so the lock comes from whose quest the item belongs to.
    allowsItem: (itemId: number) => avAllowsLoot(
      itemId,
      factionOf(ds, state.char.race) === 'horde' ? 'horde' : 'alliance',
    ),
  };
  const vein = ds.gatherNode(go.entry);
  let taps = 1;
  if (vein?.skill === 'mining') {
    const tpl = ds.gameObject(go.entry);
    const lock = (go.lockId ? ds.lock(go.lockId) : tpl?.lockId != null ? ds.lock(tpl.lockId) : undefined);
    const skill = state.char.skills?.mining?.current ?? 0;
    const range = miningVeinOpenRange(vein, tpl?.chest);
    taps = miningHarvestTapCount(range.min, range.max, skill, miningLockReqSkill(lock), rng);
  }
  const rolled = table.length
    ? mergeLootDrops(Array.from({ length: taps }, () =>
      rollLootDeep(table, (id) => ds.lootTable(id), rng, 0, 8, rollCtx)).flat())
    : [];
  for (const l of rolled) giveSquadQuestItem(state, ds, l.item, l.count);
  if (vein?.skill === 'mining' && state.char.skills?.mining) {
    for (let i = 0; i < taps; i++) {
      const gain = gainSkill(state.char, 'mining', vein, rng);
      state.char = gain.char;
    }
  }
  state.instance = setFlag(state.instance, lootedFlag);
  openLoot(
    { kind: goLootKind(go), title: go.name, keyUsed: keyItem != null },
    rolled,
  );
  log(`You open the ${go.name}.`);
  refreshQuests();
  return { ok: true, loot: withPendingIdentities(rolled, state.pendingLoot ?? null), name: go.name };
};

/** Sessions whose pet CheckLearning rolls already ran — sync can be called twice (flee). */
const petTeachRolled = new WeakSet<CombatSession>();

function companionImbueSpellIds(comp: Companion): Set<number> {
  const ids = new Set<number>();
  for (const hand of ['mainhand', 'offhand'] as const) {
    const te = comp.tempEnchants?.[hand];
    if (!te) continue;
    ids.add(te.spellId);
    if (te.equipSpellId) ids.add(te.equipSpellId);
  }
  return ids;
}

// Humans occupy ally_0..n-1. Pets are appended after, so views[i] is the companion not its pet.
const persistCompanionAurasFromSession = (session: CombatSession, now: number): void => {
  const lookup = (id: number) => ds.spell(id);
  // A pet keeps what it was wearing, exactly as its owner does; otherwise it walks into the next pull
  // naked and the party's buffers pay for it again. Cite: Spell.cpp:7345-7350 withPets.
  const carryPet = (pet: PetState | undefined, view: { hp: number; buffs: readonly CombatBuffChip[] } | null | undefined): void => {
    if (!pet || !view || !(view.hp > 0)) return;
    const carried = carryCombatBuffs({ prior: pet.prePullAuras, buffs: view.buffs, now, spell: lookup, persistForms: false });
    pet.prePullAuras = carried.length ? carried : undefined;
  };
  // `petView` answers with an Enslave Demon thrall when one is up, which is not this pet's bar.
  carryPet(state.char.pet, session.viewOfSide?.('pet'));
  const layout = sessionPartyLayout.get(rawOf(session));
  if (!layout) return;
  const views = session.alliesView();
  for (let i = 0; i < layout.compIds.length; i++) {
    const comp = (state.squad ?? []).find((c) => c.id === layout.compIds[i]);
    if (!comp) continue;
    const petIdx = layout.petAllyIndex[i];
    if (petIdx != null) carryPet(comp.pet, views[petIdx]);
    const view = views[i];
    if (!view) continue;
    const skip = companionImbueSpellIds(comp);
    const buffs = skip.size ? view.buffs.filter((b) => !skip.has(b.spellId)) : view.buffs;
    const carried = carryCombatBuffs({
      prior: comp.prePullAuras,
      buffs,
      now,
      spell: lookup,
      stealthed: !!view.stealthed,
      persistForms: false,
    });
    comp.prePullAuras = carried.length ? carried : undefined;
  }
};

// Write the session's ending player and pet state back onto the character: vitals, form, parallel mana,
// skill gains, consumables. Shared by win and defeat — an escape must not lose what it spent.
const syncCharFromSession = (session: CombatSession): void => {
  // Totems are fight-scoped (oocCast KI-817): session teardown is RemoveFromWorld.
  // UnSummon first so GetSpell() auras never copy onto the character sheet.
  unsummonTotemsOnLeaveWorld(session);
  const result = session.result();
  // Combat HP is written after the aura carry so the domain max health is known: combat may have
  // inflated it if a party aura was re-applied on top of sheet-baked stats. Always clamp to the max.
  const combatHp = result.player.hp;
  // Keep the power you ended the fight with - rage no longer snaps to 0 the instant combat
  // ends; it bleeds off over time out of combat (see regen()), just like health/mana settle.
  state.char.power = result.player.power;
  // Carry form and parallel mana out of combat. Stealth never survives a fight that engaged, so clear
  // the form and its auras unless the session still shows the player stealthed.
  if (result.player.form != null) state.char.form = result.player.form || undefined;
  else state.char.form = undefined;
  const pv = session.playerView();
  {
    const stillStealthed = !!pv.stealthed;
    if (!stillStealthed) {
      const auras = state.char.activeAuras ?? [];
      state.char.activeAuras = auras.filter((a) => {
        const sp = ds.spell(a.spellId);
        return !sp?.effects.some((e) => e.kind === 'stealth');
      });
      if (isStealthShapeshift((state.char.form ?? 0) | 0)) state.char.form = undefined;
    }
  }
  // Carry combat buffs back onto the sheet with remaining combat time converted to an expiry.
  // Companions used to walk into the next pull empty and recast every keep-up.
  {
    const now = sessionClockNow(session);
    const lookup = (id: number) => ds.spell(id);
    state.char.activeAuras = carryCombatBuffs({
      prior: state.char.activeAuras,
      buffs: pv.buffs,
      now,
      spell: lookup,
      stealthed: !!pv.stealthed,
      form: pv.form,
      formSpellId: pv.formSpellId,
      persistForms: true,
    });
    state.char.activeBuffs = getActiveBuffIds(state.char, now, ds);
    persistCompanionAurasFromSession(session, now);
    reconcileGamePartyAuras(state, ds, now, pendingFight?.withSquad === true);
  }
  // After auras are on the sheet, clamp combat HP to domain max (never persist over-cap).
  state.char.health = Math.min(combatHp, maxHealth(state.char, ds));
  if (result.player.mana != null && classHasParallelMana(state.char.cls)) {
    if ((result.player.powerType ?? powerType(state.char)) === 'mana') {
      state.char.power = result.player.mana;
      delete state.char.mana;
    } else {
      state.char.mana = result.player.mana;
    }
  }
  // Weapon/defense skill gains from the fight. Cite: Player.cpp UpdateCombatSkills
  carryCombatSkillGains(result.player.combatSkills);
  applyItemSpends(result.itemsConsumed, result.itemChargesLeft);
  // M7: debit companion bags for items they spent — never the player's inventory.
  // ally_0 → state.squad[0]; ownership by containment (giveItemToBot).
  applyAllyItemSpends(result.allyItemsConsumed);
  // Items the fight PUT in the bags: a Rocket Boots malfunction's scorched pair, and every seat's
  // Drain Soul shards. Same ledger as the floor, so a run's pack clears are not banked twice.
  bankItemsGained(result);
  // Carry the pet's ending HP and power back onto the character. Power persists between fights, 0 HP is
  // slain until re-summon, and a hunter pet death costs one happiness level.
  if (state.char.pet && result.pet) {
    const pet = state.char.pet;
    // The owner's death unsummons the pet ALIVE, and the live petView mirror has already written the
    // despawn's 0 onto the character, so the result's flag is what says it was standing.
    const unsummoned = result.pet.unsummoned === true;
    const wasAlive = pet.health > 0 || unsummoned;
    pet.health = result.pet.hp;
    pet.power = result.pet.power;
    // LooseHappiness for fight duration (×1.5 in combat). OOC path is rest.ts; this was missing. Cite: Pet.cpp ~731.
    if (wasAlive) {
      const petDef = ds.creature(pet.creature);
      if (petDef && petHasHappiness(petDef)) {
        const durationS = (result.durationMs ?? 0) / 1000;
        if (durationS > 0) {
          const loyalty = pet.loyalty ?? LOYALTY_REBELLIOUS;
          pet.happiness = decayHappiness(pet.happiness, loyalty, durationS, true);
        }
      }
    }
    if (unsummoned) {
      // RemovePet(PET_SAVE_REAGENTS): out of the world and out of the current slot, which is the slot
      // Call Pet reads back. Cite: Player.cpp:1670; Pet.cpp:404-412; LoadPetFromDB Pet.cpp:177-182.
      const partyAuraIds = petPartyAuraSpellIds(state.char, ds);
      if (partyAuraIds.length > 0) state.char = stripPetPartyAuras(state.char, ds, partyAuraIds);
      state.char.storedPet = pet;
      state.char.pet = undefined;
      state.char = reconcilePetPartyAuras(state.char, ds);
      log(`${pet.name} is unsummoned.`);
      // Reagents come back when the pet was alive at the owner's death — the warlock's Soul Shard.
      // Cite: Pet.cpp:1029-1045 (the BG branch, where the minion is auto-resurrected, is not modelled).
      const summonSpell = pet.createdBySpell ? ds.spell(pet.createdBySpell) : undefined;
      for (const r of summonSpell?.reagents ?? []) {
        const idef = ds.item(r.item);
        state.inventory = addItem(state.inventory, r.item, r.count, idef?.stackable ?? 1);
        if (idef) log(`${idef.name} is returned.`);
      }
    } else if (result.pet.hp <= 0 && wasAlive) {
      // A dead unit wears nothing — the buffs it was carrying do not come back with Revive Pet.
      // Cite: Unit.cpp:1106 victim->RemoveAllAurasOnDeath().
      pet.prePullAuras = undefined;
      const petDef = ds.creature(pet.creature);
      if (petDef && petHasHappiness(petDef)) {
        pet.happiness = Math.max(0, pet.happiness - HAPPINESS_DEATH_LOSS);
      }
      // A party area aura falls when the pet casting it dies, and the domain auras can re-merge from
      // the pre-fight chips above, so reconciling with a dead pet is what clears them off the owner.
      state.char = reconcilePetPartyAuras(state.char, ds);
      log(`${pet.name} was slain.`); if ((state.char.cls | 0) === 9) state.char.pet = undefined; // warlock: no Revive Pet (KI-833)
    }
  }
  // CheckLearning: each cast this fight of an ability the pet can still teach rolled 10% for the owner
  // to learn the rank. The roll is per cast, and learning survives the pet's later death.
  const teachPet = state.char.pet;
  if (teachPet?.teachSpells?.length && !petTeachRolled.has(session)) {
    petTeachRolled.add(session);
    const casts: number[] = [];
    for (const e of result.events ?? []) {
      if (e.kind === 'cast_finish' && e.actor === 'pet') casts.push(e.spellId);
    }
    if (casts.length > 0) {
      const rng = pendingFight?.rng ?? mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      const r = checkPetLearning(teachPet, state.char.petSpells ?? [], casts, rng, ds);
      state.char.pet = r.pet;
      if (r.learnedIds.length > 0) {
        state.char.petSpells = state.char.petSpells ?? [];
        for (const id of r.learnedIds) {
          if (!state.char.petSpells.includes(id)) state.char.petSpells.push(id);
          const s = ds.spell(id);
          if (s) log(`You have learned a new spell: ${s.name}${s.rank ? ` (Rank ${s.rank})` : ''}.`);
        }
      }
    }
  }
};

// Every body in the party carries its cooldowns back out to the world clock, not just the player: a
// companion Bloodlusting each mob and a pet Dashing each mob were the same defect.
const persistPartyCooldowns = (session: CombatSession, cnow: number): void => {
  const snapOf = (side: Side): { spell: Record<number, number>; category: Record<number, number> } =>
    (session as any).cooldownSnapshot
      ? (session as any).cooldownSnapshot(side)
      : { spell: {}, category: {} };
  if (state.char.pet) {
    const s = snapOf('pet');
    state.char.pet.spellCooldowns =
      worldCooldownsFromSessionSnapshot(state.char.pet.spellCooldowns, s.spell, cnow);
    state.char.pet.categoryCooldowns =
      worldCooldownsFromSessionSnapshot(state.char.pet.categoryCooldowns, s.category, cnow);
  }
  const layout = sessionPartyLayout.get(rawOf(session));
  if (!layout) return;
  for (let i = 0; i < layout.compIds.length; i++) {
    const comp = (state.squad ?? []).find((c) => c.id === layout.compIds[i]);
    if (!comp) continue;
    const s = snapOf(allySideAt(i));
    comp.spellCooldowns = worldCooldownsFromSessionSnapshot(comp.spellCooldowns, s.spell, cnow);
    comp.categoryCooldowns = worldCooldownsFromSessionSnapshot(comp.categoryCooldowns, s.category, cnow);
    const petIdx = layout.petAllyIndex[i];
    if (petIdx != null && comp.pet) {
      const ps = snapOf(allySideAt(petIdx));
      comp.pet.spellCooldowns = worldCooldownsFromSessionSnapshot(comp.pet.spellCooldowns, ps.spell, cnow);
      comp.pet.categoryCooldowns = worldCooldownsFromSessionSnapshot(comp.pet.categoryCooldowns, ps.category, cnow);
    }
  }
};

// Persist remaining spell/category cooldowns out of a session (long CDs survive the fight). Shared by win /
// defeat / flee resolution paths.
const persistSessionCooldowns = (session: CombatSession): void => {
  const snap = (session as any).cooldownSnapshot ? (session as any).cooldownSnapshot() : { spell: {}, category: {} };
  // enter + session.t, then advance the chain for the next pull's seed (KI-956).
  const cnow = commitFightClock(state, session, session.t);
  persistPartyCooldowns(session, cnow);
  state.spellCooldowns = state.spellCooldowns || {};
  state.categoryCooldowns = state.categoryCooldowns || {};
  for (const [sidStr, rem] of Object.entries(snap.spell as Record<string, number>)) {
    state.spellCooldowns[Number(sidStr)] = cnow + (rem as number);
  }
  for (const [cStr, rem] of Object.entries(snap.category as Record<string, number>)) {
    state.categoryCooldowns[Number(cStr)] = cnow + (rem as number);
  }
  // prune stale
  for (const k of Object.keys(state.spellCooldowns)) if (state.spellCooldowns[Number(k)] <= cnow) delete state.spellCooldowns[Number(k)];
  for (const k of Object.keys(state.categoryCooldowns)) if (state.categoryCooldowns[Number(k)] <= cnow) delete state.categoryCooldowns[Number(k)];
};

// Settle a finished fight ONCE. A repeat call replays the first outcome without re-granting anything;
// a multi-phase chain resolves a different session per phase, so each phase still settles on its own.
const resolveFight = (session: CombatSession, opts?: { holdLoot?: boolean }): FightOutcome => {
  const already = settled.get(rawOf(session));
  if (already) return already;
  const outcome = settleFight(session, opts);
  settled.set(rawOf(session), outcome);
  return outcome;
};

// The pull's authored bodies (primary + pack meta), in credit order.
const authoredBodies = (
  cdef: CreatureDef | undefined,
): Array<{ def: CreatureDef; level: number }> => {
  const out: Array<{ def: CreatureDef; level: number }> = [];
  if (cdef) out.push({ def: cdef, level: pendingFight?.enemyLevel ?? cdef.level });
  for (const p of pendingFight?.pack ?? []) {
    const pd = ds.creature(p.entry);
    if (pd) out.push({ def: pd, level: p.level });
  }
  return out;
};

// Those of them that DIED, plus any add a script summoned and lost. A win trusts the authored list:
// a later summon recycles a dead seat (sessionInject freeSeatIn) and takes that corpse out of view.
const bodiesThatDied = (
  session: CombatSession,
  authored: ReadonlyArray<{ def: CreatureDef; level: number }>,
  won: boolean,
): Array<{ def: CreatureDef; level: number }> => {
  const corpses = new Map<number, number[]>();
  for (const e of session.enemiesView()) {
    if (e.hp > 0 || e.creatureEntry == null) continue;
    const rows = corpses.get(e.creatureEntry) ?? [];
    rows.push(e.level);
    corpses.set(e.creatureEntry, rows);
  }
  const out: Array<{ def: CreatureDef; level: number }> = [];
  for (const k of authored) {
    const rows = corpses.get(k.def.entry);
    if (rows?.length) rows.shift();
    else if (!won) continue;
    out.push(k);
  }
  // Floor shell: a credited corpse keeps its seat all run, so harvesting seats here would pay it
  // twice — creditFloorKills owns those bodies, by guid.
  if (pendingFight?.endless) return out;
  for (const [entry, rows] of corpses) {
    if (!rows.length) continue;
    const def = resolveCreatureDefForCombat(entry, (id) => ds.creature(id));
    if (!def) continue;
    // Cite: Formulas.h:368 — IsTotem / IsPet / IsNoXp / IsCritter gain nothing.
    if (def.noXp || def.creatureType === CREATURE_TYPE.TOTEM
      || def.creatureType === CREATURE_TYPE.CRITTER) continue;
    for (const lvl of rows) out.push({ def, level: lvl });
  }
  return out;
};

// Auto-skin each body the party can take, hides into `loot`; the last one it could not becomes the
// corpse the Skin button offers. Once per BODY, pack members included (KI-735).
const skinTheFallen = (
  kills: ReadonlyArray<{ def: CreatureDef; level: number }>,
  rng: Rng,
  loot: LootDrop[],
): { skinnable: boolean; kept: GameState['corpse'] } => {
  let skinnable = false;
  let kept: GameState['corpse'] = null;
  for (const k of kills) {
    const skinNode = ds.skinNode(k.def.entry);
    const skinDef = skinNode != null ? ds.gatherNode(skinNode) : undefined;
    if (skinNode == null || !skinDef) continue;
    skinnable = true;
    const skinnedOk = tryProfessionAutoSkin({
      ds, state, cdefName: k.def.name, skinDef, rng, applyGather, loot, log,
    });
    if (!skinnedOk) kept = { creatureEntry: k.def.entry, node: skinNode };
  }
  return { skinnable, kept };
};

// Loot, coin, XP, quest credit, rep and pet loyalty for each body — per victim at the moment of
// death, never per fight verdict. Cite: Unit.cpp:1084-1091 -> Player.cpp:18733.
const payKillBodies = (
  kills: ReadonlyArray<{ def: CreatureDef; level: number }>,
  rng: Rng,
  opts?: { holdLoot?: boolean },
): {
  loot: LootDrop[];
  heldDrops: LootDrop[];
  xpGained: number;
  goldGained: number;
  restedBonusXp: number;
} => {
  const loot: LootDrop[] = [];
  let goldGained = 0;
  let xpGained = 0;
  let restedBonusXp = 0;
  // Quest-required loot rows only when an active quest still needs the item, and condition rows
  // through the baked conditions. Cite: partyNeededQuestItems; isConditionSatisfied.
  const neededLootItems = partyNeededQuestItems(state, ds);
  const lootRollCtx = {
    allowsQuestDrop: (entry: { item: number }) => neededLootItems.has(entry.item),
    allowsCondition: (conditionId: number) =>
      isConditionSatisfied(conditionId, lootConditionSnapshot(), conditionTableById()).ok,
  };
  // holdLoot: the corpse KEEPS its drops and coin for the player to click (loot window). Every
  // other caller — autopilot, bots, dungeon runs — still takes them straight into the bags.
  const heldDrops: LootDrop[] = [];
  for (const k of kills) {
    // Creature kill loot stays bare numeric lootId (LOCK 3 go: prefix is GO-only).
    const rolled = rollLootDeep(ds.lootTable(k.def.lootId), (id) => ds.lootTable(id), rng, 0, 8, lootRollCtx);
    for (const l of rolled) giveSquadQuestItem(state, ds, l.item, l.count);
    if (opts?.holdLoot) {
      for (const l of rolled) { heldDrops.push(l); loot.push(l); }
    } else {
      for (const l of rolled) {
        const took = takeDrop(l.item, l.count);
        if (took > 0) {
          const rp = latestRandomPropertyId(state.inventory, l.item);
          loot.push(rp != null ? { item: l.item, count: took, randomPropertyId: rp } : { item: l.item, count: took });
        }
      }
    }
    goldGained += rng.int(k.def.minGold, k.def.maxGold);
    state.questlog = recordKill(state.questlog, k.def.entry, (e) => ds.quest(e));
    creditSquadKill(state, k.def.entry, ds);
    applyCreatureDeathScripts(k.def.entry);
    // Formulas.h Gain per kill (BaseGain × elite × ExperienceMultiplier once).
    const killXp = killXpAmount(k.def, state.char.level, k.level);
    xpGained += killXp;
    // Rested bonus is kill-only and spends the pool (Player::GetXPRestBonus ~7754:
    // bonus = min(restBonus, xp), GiveXP(xp + bonus)). Quest/explore paths never spend.
    if (killXp > 0 && (state.char.restedXp ?? 0) > 0) {
      const spend = restBonusSpend(state.char.restedXp ?? 0, killXp);
      if (spend.bonus > 0) {
        xpGained += spend.bonus;
        restedBonusXp += spend.bonus;
        state.char = { ...state.char, restedXp: spend.remainingRested };
      }
    }
    // Living hunter pet: loyalty-XP gate + KillLoyaltyBonus per kill. Cite: Pet.cpp GivePetXP ~1087.
    if (state.char.pet && state.char.pet.health > 0) {
      const petDef = ds.creature(state.char.pet.creature);
      if (petDef && petHasHappiness(petDef)) {
        const ownerXp = ds.xpToNext(state.char.level);
        state.char.pet = applyKillLoyalty(
          state.char.pet,
          killXp,
          state.char.level,
          Number.isFinite(ownerXp) ? ownerXp : undefined,
        );
      }
    }
    // Kill reputation (creature_onkill_reputation). Cite: Player.cpp RewardReputation(Creature).
    if (k.def.onKillRep) {
      const team = factionOf(ds, state.char.race) ?? 'alliance';
      const repSpells = [
        ...racialSpells(ds, state.char.race),
        ...(state.spellbook?.known ?? [])
          .map((id) => ds.spell(id))
          .filter((s): s is NonNullable<typeof s> => !!s?.passive),
      ];
      const repMod = reputationAuraModFromSpells(repSpells);
      const repResult = rewardKillReputation({
        onKillRep: k.def.onKillRep,
        playerTeam: team,
        playerLevel: state.char.level,
        creatureLevel: k.level,
        raceId: state.char.race,
        classId: state.char.cls,
        reputations: state.char.reputations ?? {},
        factions: ds.factions(),
        rates: ds.reputationRates(),
        spillover: ds.reputationSpillover(),
        flags: state.char.factionFlags ?? {},
        ...(repMod ? { repMod } : {}),
      });
      state.char = {
        ...state.char,
        reputations: repResult.reputations,
        // SetVisible / auto at-war ride along, so a newly-earned faction shows up in the pane.
        factionFlags: repResult.flags ?? state.char.factionFlags,
      };
      for (const a of repResult.applied) {
        if (a.delta === 0) continue;
        const name = ds.faction(a.faction)?.name ?? `faction ${a.faction}`;
        const sign = a.delta > 0 ? '+' : '';
        log(`${sign}${a.delta} reputation with ${name}`);
      }
    }
  }
  return { loot, heldDrops, xpGained, goldGained, restedBonusXp };
};

const settleFight = (session: CombatSession, opts?: { holdLoot?: boolean }): FightOutcome => {
  const result = session.result();
  // ScriptDev UpdateEntry morph (Dathrohan → Balnazzar): loot / gold / XP / quest kill
  // credit follow the FINAL form's template, not the entry that was pulled.
  const pulledDef = pendingFight ? ds.creature(pendingFight.creatureEntry) : undefined;
  const finalEntry = result.enemy?.finalCreatureEntry;
  const cdef =
    finalEntry != null && finalEntry !== pendingFight?.creatureEntry
      ? resolveCreatureDefForCombat(finalEntry, (id) => ds.creature(id)) ?? pulledDef
      : pulledDef;
  const rng = pendingFight?.rng ?? mulberry32(1);
  syncCharFromSession(session);

  // Vitals for a player who ended the fight at 0 HP; true when they repop as a ghost. Full death
  // loop only when the setting is `full` and outside a dungeon (wipes stay repair-bill-only).
  const applyPlayerDeath = (): boolean => {
    if (usesFullDeathFlow(deathFlowMode()) && !state.instance) {
      // Zone-based text RPG: death pos is (0,0,0) until continuous world coords exist.
      // Closest-GY still ranks by distance when bake supplies coordinates.
      state.deathFlow = deathToGhostAtGraveyard({
        nowMs: sessionClockNow(session),
        deathPos: { x: 0, y: 0, z: 0 },
        zoneId: state.char.zoneId,
        faction: factionOf(ds, state.char.race) === 'horde' ? TEAM_HORDE : TEAM_ALLIANCE,
        graveyards: ds.graveyards().map(toGraveyardEntry),
        deathExpireTimeSec: state.deathFlow?.deathExpireTimeSec ?? 0,
      });
      // Ghost: 1 HP (BuildPlayerRepop SetHealth(1)); power cleared like a corpse.
      state.char.health = 1;
      state.char.power = 0;
      return true;
    }
    // repair-only (default): revive at half health — autopilot / dungeon wipe path.
    state.deathFlow = createAliveDeathFlow(state.deathFlow?.deathExpireTimeSec ?? 0);
    state.char.health = Math.max(1, Math.round(maxHealth(state.char, ds) * 0.5));
    const pt = powerType(state.char);
    state.char.power = (pt === 'mana' || pt === 'energy') ? maxPower(state.char, ds) : 0;
    return false;
  };
  // Per-hit wear (Unit.cpp:1217 HandleDamageDealt) + 10% on death. Timeout ≠ death (KI-740).
  const died =
    result.winner === 'enemy' || (result.player.hp <= 0 && result.winner !== 'player');
  const soloEnemy = session.enemiesView().length <= 1;
  const wear = { died, events: result.events, rng, soloEnemy };
  state.char = applyCombatWear(state.char, ds.item, wear);
  state.char = applyDurabilityDamageFromLandedSpells(state.char, result.events, (id) => ds.spell(id), ds.item);
  for (const [i, comp] of (state.squad ?? []).entries()) {
    const shell = companionCharacter(comp, companionLevel(comp, state.char.level), ds);
    // The 10% is charged to whoever actually died, not to everyone when the PLAYER did: passing the
    // player's death through made a companion who stood the whole fight pay the repair bill.
    const end = result.allies?.[i];
    const allyDied = end ? end.hp <= 0 : wear.died;
    const worn = applyCombatWear(shell, ds.item, { ...wear, died: allyDied, side: `ally_${i}` });
    comp.durability = worn.durability ?? {};
  }

  // Credit spell cast targets for each player cast finished this fight, on defeat too so cast progress
  // can complete an objective without a win. The resolve-time pass is an idempotent backup.
  let spellCastCredited = false;
  let questEventCredited = false;
  for (const e of result.events ?? []) {
    // RewardPlayerAndGroupAtCast skips a next-melee-swing spell — Heroic Strike and Cleave never
    // pay a "cast N times" objective. Cite: Spell.cpp:1339, :1578.
    if (e.kind === 'cast_finish' && e.actor === 'player' && e.spellId
      && !ds.spell(e.spellId)?.onNextSwing) {
      state.questlog = recordSpellCast(state.questlog, e.spellId, (id) => ds.quest(id));
      creditSquadSpellCast(state, e.spellId, ds);
      spellCastCredited = true;
    }
    if (e.kind === 'quest_event' && e.questId) {
      const before = state.questlog;
      state.questlog = recordEventHappens(state.questlog, e.questId);
      creditSquadEvent(state, e.questId);
      if (state.questlog !== before) questEventCredited = true;
    }
  }
  if (spellCastCredited || questEventCredited) refreshQuests();

  if (result.winner === 'player' && cdef) {
    // Quest-fight yield stand-in (Bartleby 1640, Calvin 590, Dashel 1447). Cite: questFightCredit.ts.
    {
      const duel = creditQuestFightWin(ds, state.questlog, pendingFight?.creatureEntry, cdef.name);
      if (duel.message != null) {
        state.questlog = duel.questlog;
        creditSquadLogs(state, (log) =>
          creditQuestFightWin(ds, log, pendingFight?.creatureEntry, cdef.name).questlog);
        log(duel.message);
        refreshQuests();
      }
    }

    // Record the fallen for Cannibalize: an Undead can devour a fresh Humanoid/Undead corpse to
    // heal out of combat (consumed by cannibalize(), and cleared on the next fight / travel).
    state.lastCorpse = { creatureType: cdef.creatureType ?? 0, creatureEntry: cdef.entry };

    // Loot + XP for primary, Wave 4B pack assistants and any add a script summoned into the pull.
    const kills = bodiesThatDied(session, authoredBodies(cdef), true);
    // Every body that fell pays once. The verdict below only decides the penalties.
    const paid = payKillBodies(kills, rng, opts);
    const loot = paid.loot;
    const heldDrops = paid.heldDrops;
    const xpGained = paid.xpGained;
    let goldGained = paid.goldGained;
    const restedBonusXp = paid.restedBonusXp;
    if (opts?.holdLoot) {
      // Coin rides in the container too, so the money row is a click like it is in WoW.
      // Cap held copper so takeLootMoney cannot push past MAX_MONEY either.
      const room = Math.max(0, clampGold(state.char.gold + goldGained) - state.char.gold);
      goldGained = Math.min(goldGained, room);
      openLoot({
        kind: 'corpse',
        title: cdef.name,
        creatureEntry: cdef.entry,
      }, heldDrops, goldGained);
      loot.splice(0, loot.length, ...withPendingIdentities(loot, state.pendingLoot ?? null));
    } else {
      // ModifyMoney clamp — goldGained reports applied copper only (never exceed MAX_MONEY).
      const before = state.char.gold;
      state.char = { ...state.char, gold: clampGold(before + goldGained) };
      goldGained = state.char.gold - before;
    }
    refreshQuests();
    const lv = grantXp(state.char, xpGained, ds);
    state.char = lv.char;
    const packNote = kills.length > 1 ? ` (pack of ${kills.length})` : '';
    const restedNote = restedBonusXp > 0 ? ` (${restedBonusXp} rested)` : '';
    log(`You defeated ${cdef.name}${packNote}. +${xpGained} XP${restedNote}${goldGained ? `, +${moneyMarked(goldGained)}` : ''}.`);
    if (!opts?.holdLoot) {
      for (const l of loot) {
        const base = ds.item(l.item)?.name ?? String(l.item);
        const suffix = l.randomPropertyId != null && l.randomPropertyId > 0
          ? ds.itemRandomProperty(l.randomPropertyId)?.nameSuffix
          : undefined;
        log(`Looted ${l.count}x ${formatItemName(base, suffix)}.`);
      }
    }
    for (const nl of lv.leveledTo) log(`You reached level ${nl}!`);

    // Equipment helper: equip strict upgrades from newly acquired gear, weighted against this
    // character's current stats. Only 'auto' mutates; 'suggest' leaves them for the UI to offer.
    if (runAutoEquipUpgrades(8) > 0) log('Auto-equipped better gear.');

    // Party Skinning: auto-skin (knife + skill-up). Nobody in the group holds the line: no hide.
    // A group skinner who cannot skin now (no knife / bags full) leaves the corpse (KI-735).
    // Once per BODY, pack members included — the floor path already skins per kill
    // (harvestFloorKills), so a pull of four beasts here left three hides on the ground.
    // state.corpse holds one body, so the last one the party could not take waits for the button.
    {
      const skin = skinTheFallen(kills, rng, loot);
      if (skin.skinnable) {
        state.corpse = skin.kept != null && partyHasSkinner(state) ? skin.kept : null;
      }
    }
    // Credit a dungeon encounter, on the final phase only. Death-summon, wave and HP-spawn rows chain
    // as the next phase of the same encounter id with no downtime for auto-resolve.
    const encounter = pendingFight?.encounter;
    if (encounter && state.instance && state.instance.dungeonId === encounter.dungeonId) {
      const def = ds.instance(encounter.dungeonId);
      const enc = def ? encounterOf(def, encounter.encounterId, state.instance) : undefined;
      if (def && enc) {
        const phaseIndex = encounter.phaseIndex ?? 0;
        const totalPhases = encounterPhaseCount(enc);

        // HP phase flags: primary died ⇒ 0% crossed every authored threshold.
        if (phaseIndex === 0) {
          const thr = hpThresholdEvents(enc);
          if (thr.length) {
            const extra = flagsForHpThresholds(thr, 0, state.instance.flags ?? []);
            for (const f of extra) state.instance = setFlag(state.instance, f);
          }
        }

        if (phaseIndex + 1 < totalPhases) {
          // Intermediate phase: chain the next pull without marking the encounter cleared.
          const phaseRng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
          const nextPhase = phaseIndex + 1;
          const phaseEnc = encounter.resolved ?? enc;
          const nextPull = resolveEncounterPhase(phaseEnc, nextPhase, () => phaseRng.next());
          persistSessionCooldowns(session);
          if (nextPull) {
            const nextName =
              resolveCreatureDefForCombat(nextPull.creatureEntry, (id) => ds.creature(id))?.name
              ?? `creature entry ${nextPull.creatureEntry}`;
            log(`${nextName} appears!`);
            // Preserve S3 squad allies across dungeon phase chains.
            const keepSquad = pendingFight?.withSquad === true;
            // Phase N settled enough to chain — drop live pointer so startFight busy-gate allows phase N+1.
            liveFightSession = null;
            const nextBegin = startFight(nextPull.creatureEntry, nextPull.bossSpells, {
              dungeonId: encounter.dungeonId,
              encounterId: encounter.encounterId,
              pack: nextPull.pack,
              phaseIndex: nextPhase,
              // Same room, same roof — a phase chain never moves the pull.
              ...(encounter.outdoors === false ? { outdoors: false } : {}),
              ...(encounter.fusedIds?.length ? { fusedIds: encounter.fusedIds } : {}),
              ...(encounter.resolved ? { resolved: encounter.resolved } : {}),
            }, keepSquad ? { withSquad: true } : undefined);
            if (nextBegin.ok) {
              nextBegin.session.runToEnd();
              const chained = resolveFight(nextBegin.session);
              // KI-760: merge prior-phase events/duration with chained phase (XP/loot already summed).
              const priorMs = result.durationMs;
              const chainedEvents = chained.result.events.map((e) =>
                priorMs > 0 ? { ...e, t: e.t + priorMs } : e,
              );
              const mergedResult = {
                ...chained.result,
                events: [...result.events, ...chainedEvents],
                durationMs: priorMs + chained.result.durationMs,
                ...(result.soulShardsGained || chained.result.soulShardsGained
                  ? {
                      soulShardsGained:
                        (result.soulShardsGained ?? 0) + (chained.result.soulShardsGained ?? 0),
                    }
                  : {}),
                ...(result.itemsConsumed?.length || chained.result.itemsConsumed?.length
                  ? {
                      itemsConsumed: [
                        ...(result.itemsConsumed ?? []),
                        ...(chained.result.itemsConsumed ?? []),
                      ],
                    }
                  : {}),
                ...(result.allyItemsConsumed?.length || chained.result.allyItemsConsumed?.length
                  ? {
                      allyItemsConsumed: [
                        ...(result.allyItemsConsumed ?? []),
                        ...(chained.result.allyItemsConsumed ?? []),
                      ],
                    }
                  : {}),
                // The push-time tallies are per-SESSION and a phase chain is two sessions, so the
                // spread above reported phase 1's mechanics, damage taken and deaths as zero.
                ...mergePushTallies(result, chained.result, priorMs),
              };
              return {
                ok: true,
                outcome: chained.outcome,
                result: mergedResult,
                xpGained: xpGained + chained.xpGained,
                goldGained: goldGained + chained.goldGained,
                loot: [...loot, ...chained.loot],
                leveledTo: [...lv.leveledTo, ...chained.leveledTo],
                killCount: kills.length + chained.killCount,
              };
            }
            // Next phase failed to start — fall through and clear the encounter so the
            // run cannot soft-lock. Reason is always concrete (never "unknown").
            const phaseReason =
              (nextBegin.reason && nextBegin.reason.trim())
              || `missing failure reason (internal) for phase ${nextPhase} entry ${nextPull.creatureEntry}`;
            log(`The next phase could not start (${phaseReason}).`);
          } else {
            // encounterPhaseCount promised another phase but resolve returned null.
            log(
              `The next phase could not start (no pull for phase ${nextPhase} of ${enc.id}).`,
            );
          }
        }

        // DR fusion: clear every encounter id in the fused batch (single id when unfused).
        const fusedIds = encounter.fusedIds?.length
          ? encounter.fusedIds
          : [encounter.encounterId];
        for (const fid of fusedIds) {
          const fe = encounterOf(def, fid, state.instance);
          if (fe) state.instance = applyEncounterCleared(state.instance, fe);
        }
        // Dire Maul North: a Cho'Rush pack with King must clear the observer on pack death, or the
        // next encounter rematerializes him. Cite: instance_dire_maul.cpp:443-460.
        if (def.id === 'dire-maul-north' && fusedIds.includes('king-gordok')) {
          const killed = new Set<number>();
          if (pendingFight?.creatureEntry) killed.add(pendingFight.creatureEntry);
          for (const p of pendingFight?.pack ?? []) killed.add(p.entry);
          state.instance = applyDmNorthKingPackClear(state.instance, def, killed);
        }
        if (enc.kind === 'boss') log(`${enc.name} has been defeated!`);
        else if (fusedIds.length > 1) {
          log(`Pull cleared (${fusedIds.length} packs).`);
        }
        if (isComplete(def, state.instance)) log(`You have cleared ${def.name}!`);
      }
    }
    // Persist remaining spell/category cooldowns (long CDs survive the fight). Use the session's
    // elapsed t as the time delta for this fight (correct for both watch and fast resolve).
    persistSessionCooldowns(session);

    // An outdoor win grants kill XP to each ACTIVE companion on the full personal curve, capped at the
    // player. Dungeon encounter wins grant elsewhere, so they are skipped here to avoid double-dipping.
    if (!pendingFight?.encounter) {
      for (const comp of state.squad ?? []) {
        for (const k of kills) {
          const r = applyCompanionKillXp(comp, k.def, state.char.level, ds, k.level);
          for (const nl of r.leveledTo) {
            log(`${comp.name} reaches level ${nl}!`);
          }
          if (r.leveledTo.length) syncCompanionPetAfterLevel(comp, r.leveledTo);
          applyCompanionKillReputation(comp, k.def, state.char.level, ds, k.level, log);
        }
      }
    }
    // The party finished the kill while the player lay dead: partyWiped() is false with an ally up
    // (sessionPools.ts:307). Cite: Unit::DealDamage calls KillPlayer on the victim, not on a verdict.
    if (result.player.hp <= 0) {
      if (applyPlayerDeath()) log('Your party finished the kill. Your spirit releases to the graveyard.');
      else log('Your party finished the kill. You woke up weakened.');
    }
    pendingFight = null;
    liveFightSession = null;
    return {
      ok: true, outcome: 'win', result, xpGained, goldGained, loot,
      leveledTo: lv.leveledTo, killCount: kills.length,
    };
  }

  // Persist cooldowns on non-win paths too (time advanced).
  persistSessionCooldowns(session);

  // A wipe or a stall does not un-kill what already fell, so the bodies pay and only the penalties
  // below read the verdict. Cite: Unit.cpp:1084-1091.
  const fallen = bodiesThatDied(session, authoredBodies(cdef), false);
  const paidFallen = fallen.length ? payKillBodies(fallen, rng) : null;
  let fallenXp = 0;
  let fallenGold = 0;
  let fallenLoot: LootDrop[] = [];
  let fallenLevels: number[] = [];
  if (paidFallen) {
    const before = state.char.gold;
    state.char = { ...state.char, gold: clampGold(before + paidFallen.goldGained) };
    fallenGold = state.char.gold - before;
    fallenLoot = paidFallen.loot;
    fallenXp = paidFallen.xpGained;
    refreshQuests();
    const lvF = grantXp(state.char, fallenXp, ds);
    state.char = lvF.char;
    fallenLevels = lvF.leveledTo;
    if (!pendingFight?.encounter) {
      for (const comp of state.squad ?? []) {
        for (const k of fallen) {
          const r = applyCompanionKillXp(comp, k.def, state.char.level, ds, k.level);
          for (const nl of r.leveledTo) log(`${comp.name} reaches level ${nl}!`);
          if (r.leveledTo.length) syncCompanionPetAfterLevel(comp, r.leveledTo);
          applyCompanionKillReputation(comp, k.def, state.char.level, ds, k.level, log);
        }
      }
    }
    log(
      `${fallen.length} kill${fallen.length === 1 ? '' : 's'} credited. +${fallenXp} XP`
      + (fallenGold ? `, +${moneyMarked(fallenGold)}` : '') + '.',
    );
    for (const l of fallenLoot) {
      const base = ds.item(l.item)?.name ?? String(l.item);
      const suffix = l.randomPropertyId != null && l.randomPropertyId > 0
        ? ds.itemRandomProperty(l.randomPropertyId)?.nameSuffix
        : undefined;
      log(`Looted ${l.count}x ${formatItemName(base, suffix)}.`);
    }
    for (const nl of fallenLevels) log(`You reached level ${nl}!`);
  }
  // The beasts that fell are still skinnable — a wipe leaves hides on the ground otherwise. The
  // corpse the party could not take waits for the Skin button, as on a win.
  const skinFallen = skinTheFallen(fallen, rng, fallenLoot);
  const keptCorpse = skinFallen.skinnable && skinFallen.kept != null && partyHasSkinner(state)
    ? skinFallen.kept
    : null;

  // Timeout or stall with the player still alive aborts without death penalties: a combat cap is not a
  // kill, so no half HP, no ghost, no cancelled journey and no defeat.
  if (!died && result.player.hp > 0) {
    if (cdef) {
      log(`The fight with ${cdef.name} drags on with no end. You disengage.`);
    } else {
      log('The fight drags on with no end. You disengage.');
    }
    state.corpse = keptCorpse;
    pendingFight = null;
    liveFightSession = null;
    return {
      ok: true, outcome: 'timeout', result,
      xpGained: fallenXp, goldGained: fallenGold, loot: fallenLoot, leveledTo: fallenLevels,
      killCount: fallen.length,
    };
  }
  state.corpse = keptCorpse; // skinnable creature corpse — not the player corpse record

  const ghosted = applyPlayerDeath();
  // A ghost is at the graveyard, not over the body, so the kept corpse does not travel with them.
  if (ghosted) state.corpse = null;
  if (ghosted) {
    if (cdef) log(`You were slain by ${cdef.name}. Your spirit releases to the graveyard.`);
    else log('You have died. Your spirit releases to the graveyard.');
    if (state.deathFlow?.graveyard) {
      log('A spirit healer waits at the graveyard - or run back to your corpse.');
    }
  } else if (cdef) {
    log(`You were defeated by ${cdef.name} and woke up weakened.`);
  }
  pendingFight = null;
  liveFightSession = null;
  return {
    ok: true, outcome: 'defeat', result,
    xpGained: fallenXp, goldGained: fallenGold, loot: fallenLoot, leveledTo: fallenLevels,
    killCount: fallen.length,
  };
};

const fight = (creatureEntry: number): ActionResult<Omit<FightOutcome, 'ok'>> => {
  const b = beginFight(creatureEntry);
  if (!b.ok) return b;
  b.session.runToEnd();
  return resolveFight(b.session);
};


  return {
    methods: {
      fight,
      beginFight,
      resolveFight,
      beginEncounter,
      beginFloorPull,
      beginFloorShell,
      injectFloorMember,
      noteFloorPackMember,
      creditFloorKills,
      pullAdditionalPack,
      useInstanceObject,
      lootInstanceObject,
      liveFightSession: () => liveFightSession,
    },
    startFight,
    resolveFight,
    syncCharFromSession,
    persistSessionCooldowns,
    getPendingFight: () => pendingFight,
    setPendingFight: (p) => { pendingFight = p; },
    getLiveFightSession: () => liveFightSession,
    setLiveFightSession: (s) => { liveFightSession = s; },
    allySideForCompanion: (session, compId) => {
      const i = sessionPartyLayout.get(rawOf(session))?.compIds.indexOf(compId) ?? -1;
      return i >= 0 ? allySideAt(i) : null;
    },
  };
}
