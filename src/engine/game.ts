// The Game facade, the single object the UI drives. It owns the mutable GameState, delegates rules to
// the pure modules, and derives a fresh RNG sub-seed per fight so a reload cannot re-roll a fight.

import type { DataStore } from '../data/dataStore.ts';
import type { CombatantSpec } from './combat.ts';
import { mulberry32, hashSeed } from './core/rng.ts';
export {
  newGameState,
  newGameStateFromWorldBot,
  pickRandomWorldBot,
} from './game/newGameState.ts';
import { normalizeAutopilotConfig } from '../autopilot/config.ts';
import { normalizeGatherFilterConfig } from '../domain/professions/gatherFilter.ts';
import {
  bagCapacity,
} from '../domain/items/equipment.ts';
import {
  maybeAutoSelectAmmo,
  isAmmoItem,
  canFitWithBagFamily,
  addItemPreferAmmoBag,
  packInventoryByBagFamily,
} from '../domain/items/ammo.ts';
import {
  isKeyItem,
  addToKeyring,
  emptyKeyring,
} from '../domain/items/keyring.ts';
import {
  canAcceptUnique,
  uniqueSignalsOf,
} from '../domain/items/itemRestrictions.ts';
import {
  addInstance, countItem,
} from '../domain/items/inventory.ts';
import { hasIdentity, identityCapable } from '../domain/items/itemInstance.ts';
import { sanitizeDriftedItems } from './game/sanitizeDriftedItems.ts';
import { createItemInstance } from '../domain/items/createItem.ts';
import { applyBindToInstance, resolveBonding } from '../domain/items/itemBonding.ts';
import { createLearnFromItemModule } from './game/learnFromItem.ts';
import { makeEnchantItemRouter } from './game/enchantItem.ts';
import { makeWeaponImbueItemRouter, type LiveImbueUnit } from './game/weaponImbueItem.ts';
import { createGarmentsOocHandler } from './game/garmentsOoc.ts';
import { type ApplySendEventFromSpellResult } from './game/sendEventFromSpell.ts';
import { applyTempSpawnsFromEventFire } from './game/tempSpawnCreature.ts';
import { fireGoUseDoorScripts } from './game/applyDoorFromDbScript.ts';
import { createRefreshQuests, createQuestLogModule } from './game/questLog.ts';
import { createDevGrantModule } from './game/devGrant.ts';
import { createEquipmentHelperModule } from './game/equipmentHelper.ts';
import { createOutfitterModule } from './game/outfitter.ts';
import { createGlobalActionBarModule } from './game/globalActionBar.ts';
import { createTradeModule } from './game/trade.ts';
import { createRunSupplyModule } from './game/runSupply.ts';
import { createDeathFlowModule } from './game/deathFlow.ts';
import { createActionBarsModule } from './game/actionBars.ts';
import { createPaladinBoardModule } from './game/paladinBoard.ts';
import { createMacrosModule } from './game/macros.ts';
import { createRotationModule } from './game/rotation.ts';
import { createTalentsModule } from './game/talents.ts';
import { createWorldSessionModule } from './game/worldSession.ts';
import { createConsumablesModule } from './game/consumables.ts';
import { createRegenRestModule, type RegenRestGameRef } from './game/regenRest.ts';
import { createOocCastMethodsModule } from './game/oocCastMethods.ts';
import {
  getStanding,
  getRank,
} from '../domain/creature/reputation.ts';
import { createFactionStateApi } from './game/factionState.ts';
import { canInteractWithCreature } from '../domain/creature/faction.ts';
import { factionOf } from '../domain/character/races.ts';
import {
  forcedReactionsFrom,
  forcedReactionsOf,
  type ForcedReactionMap,
} from '../domain/creature/forcedReaction.ts';
import { activeEventIds, activeHolidayIds } from '../domain/world/gameEvents.ts';
import {
  TRADE_SKILL_IDS, playerConditionFacts, playerSkillValue,
  type PlayerConditionFacts,
} from '../domain/core/conditionSnapshot.ts';
import {
  addBonusHonor, bgBracketId, calculateHonorRank, newHonorState, rankForRp, rankTitle,
  recordHonorableKill, WSG_WIN_MATCH_HONOR,
} from '../domain/run/honor.ts';
import {
  PLAYER_STANDING_KEY,
  recordWeeklyContribution,
  runHonorMaintenance,
} from '../domain/run/honorWeek.ts';
import {
  TEAM_ALLIANCE,
  TEAM_HORDE,
} from '../domain/run/death.ts';
// Death-flow types re-exported for UI/tests (DeathFlowMode lives in domain/run/death.ts).
export type { DeathFlowMode, DeathFlowState } from '../domain/run/death.ts';
export { nextRespecCost } from './game/talents.ts';

// Wave 2 S6: types live in game/types.ts; re-export for existing importers.
import type {
  GameState,
  AhDuration,
  FightOutcome,
  BeginFight,
  PullAdditionalPackResult,
  ActionResult,
  Game,
  TravelPace,
  CreateGameOptions,
  ConsumeItemOpts,
} from './game/types.ts';
import type { GameCtx } from './game/context.ts';
import { createBankModule } from './game/bank.ts';
import { createSortContainersModule } from './game/sortContainers.ts';
import { createVendorOffersModule, makeVendorHelpers } from './game/vendorOffers.ts';
import { createAuctionMailModule } from './game/auctionMail.ts';
import { createMailModule, mailOverflow } from './game/mail.ts';
import { mailboxAsInventory } from '../domain/economy/mail.ts';
import { createPetsModule, createPetFeedHelpers } from './game/pets.ts';
import { createProfessionsModule, createGatherHelpers } from './game/professions.ts';
import { createLootModule } from './game/loot.ts';
import { AURA_INTERRUPT } from '../domain/spells/stealth.ts';
import { removeCharAurasWithInterruptFlags } from './game/oocAuraInterrupt.ts';
import {
  createTravelCore,
  createTravelMethods,
  type TravelFightBridgeRef,
  type TravelOutfitterSyncRef,
} from './game/travel.ts';
import {
  createSquadHelpers,
  createSquadMethods,
} from './game/squadDungeon.ts';
import { createBattlegroundMethods } from './game/battleground.ts';
import { applyLoadReconcile } from './game/loadReconcile.ts';
import { createCombatSessionModule } from './game/combatSession.ts';
import { useWallWorldClock } from './game/combatSessionClock.ts';
export type {
  GameState,
  AhDuration,
  FightOutcome,
  BeginFight,
  PullAdditionalPackResult,
  ActionResult,
  InnCandidate,
  Game,
  TravelPace,
  CreateGameOptions,
  ConsumeItemOpts,
} from './game/types.ts';
export {
  AH_DURATIONS_MS,
  isSkippableBeginFailure,
} from './game/types.ts';
export type { LootDrop } from './game/types.ts';
import {
  auraIdsForSnapshot,
  isConditionSatisfied,
  type ConditionTable,
} from './spells/conditions.ts';
import { canTakeQuestForCondition } from '../quests/quests.ts';
import { worldStateConditionFns } from './game/worldState.ts';

// Bank and bag slots live in game/bank.ts and game/squadDungeon.ts; the auction house in
// game/auctionMail.ts; mail in game/mail.ts; the state factories in game/newGameState.ts.
import { dmNorthGuardsAlive } from '../data/dungeons/dire-maul-north.ts';
import { isCompletedDungeonEncounter } from '../domain/scriptdev/templeOfAhnqiraj.ts';

export function createGame(ds: DataStore, state: GameState, opts: CreateGameOptions = {}): Game {

  // Wall-clock world timers before load reconcile — the app plays at 2x by default and
  // every world reader is on Date.now(). Cite: game/combatSessionClock.ts.
  if (opts.wallWorldClock) useWallWorldClock(state);

  // Wave 2 S13: Phase A load reconciliation (instance, skills, quest spells, bars,
  // cooldowns, learn stubs, racials, talent grants). Also unlearnTalentGrantedSpells.
  const { unlearnTalentGrantedSpells, eligibleSpellIds } = applyLoadReconcile(ds, state);

  // D8 taxi discovery runs via travelCore.initTravelOnLoad() (S11).
  // equip/junk/DE pipeline lives in game/equipmentHelper.ts (P3).

  /** Total backpack capacity right now (base pack + equipped bags). */
  const cap = (): number => bagCapacity(state.char, ds);

  const log = (msg: string): void => {
    state.activity.unshift(msg);
    if (state.activity.length > 60) state.activity.pop();
  };
  // Enchant-item route (armor kits / arcana / scopes). Bound once; see game/enchantItem.ts.
  const enchantItemRouter = makeEnchantItemRouter({ ds, state, log });
  // A coat applied while a session is open has to reach that session's Fighter, which owns the weapon
  // for the run. Filled after the combat module exists; null before, so the router writes the sheet.
  const liveImbueUnitRef: { current: LiveImbueUnit | null } = { current: null };
  // Temporary weapon imbues (poisons / stones / oils / lures) — slot pick + full kit.
  // Bound once; see game/weaponImbueItem.ts (W5 — do not re-inline into this file).
  const weaponImbueItemRouter = makeWeaponImbueItemRouter({
    ds, state, log, liveUnit: (target) => liveImbueUnitRef.current?.(target) ?? null,
  });
  // Conditions rows by id (lazy, built once) so in-fight conditionId gates resolve. Cite: ObjectMgr
  // LoadConditions / Conditions.cpp Meets.
  let _conditionTable: ConditionTable | undefined;
  const conditionTableById = (): ConditionTable => {
    if (!_conditionTable) {
      const rows = ds.conditionsList();
      const map = new Map<number, (typeof rows)[number]>();
      for (const c of rows) map.set(c.id, c);
      _conditionTable = map as ConditionTable;
    }
    return _conditionTable;
  };

  // The snapshot every gossip line, loot row, profession gate and quest check is evaluated against.
  // A missing supplier turns real content off: SKILL, REPUTATION and RACE_CLASS read unsupported.
  const lootConditionSnapshot = (): PlayerConditionFacts & {
    quests: Record<string, 'none' | 'taken' | 'complete' | 'rewarded'>;
    items: Record<number, number>;
    bankItems: Record<number, number>;
    auras: number[];
    canTakeQuest: (questId: number) => boolean;
    instanceCondition?: (conditionId: number) => boolean;
    completedEncounter?: (encounterId: number) => boolean;
    worldScript: (conditionId: number, state: number) => boolean;
    worldState: (id: number) => number;
  } => {
    const quests: Record<string, 'none' | 'taken' | 'complete' | 'rewarded'> = {};
    for (const q of state.questlog.quests) {
      if (q.status === 'turnedIn') quests[String(q.entry)] = 'rewarded';
      else if (q.status === 'complete') quests[String(q.entry)] = 'complete';
      else quests[String(q.entry)] = 'taken';
    }
    const items: Record<number, number> = {};
    for (const s of state.inventory.stacks) items[s.item] = (items[s.item] ?? 0) + s.count;
    for (const s of (state.keyring ?? emptyKeyring()).stacks) items[s.item] = (items[s.item] ?? 0) + s.count;
    const bankItems: Record<number, number> = {};
    for (const s of state.bank.stacks) bankItems[s.item] = (bankItems[s.item] ?? 0) + s.count;
    const auras = auraIdsForSnapshot(state.char.activeAuras, Date.now());
    const snap: PlayerConditionFacts & {
      quests: Record<string, 'none' | 'taken' | 'complete' | 'rewarded'>;
      items: Record<number, number>;
      bankItems: Record<number, number>;
      auras: number[];
      instanceCondition?: (conditionId: number) => boolean;
      completedEncounter?: (encounterId: number) => boolean;
      canTakeQuest: (questId: number) => boolean;
      worldScript: (conditionId: number, state: number) => boolean;
      worldState: (id: number) => number;
    } = {
      ...playerConditionFacts(ds, state.char, state.spellbook, Date.now()),
      quests,
      items,
      bankItems,
      auras,
      completedEncounter: (id: number) => isCompletedDungeonEncounter(state.instance, id),
      canTakeQuest: canTakeQuestForCondition(ds, state.char, state.questlog),
      ...worldStateConditionFns(state.worldStates),
    };
    // DM North tribute chest go:16577 conditions 733–739 (exactly N guards alive).
    // Cite: instance_dire_maul.cpp:499-521 CheckConditionCriteriaMeet.
    if (state.instance?.dungeonId === 'dire-maul-north') {
      const alive = dmNorthGuardsAlive(state.instance.flags ?? []);
      snap.instanceCondition = (id: number) => id === alive;
    }
    return snap;
  };

  // Player-state snapshot for the conditions evaluator, captured at fight start: reputation ranks for
  // every baked faction, skill values, active game events, and team.
  const buildConditionCtx = (): NonNullable<CombatantSpec['conditionCtx']> => {
    const reputationRanks: Record<number, number> = {};
    for (const fac of ds.factions()) {
      reputationRanks[fac.id] = getRank(state.char.reputations, fac, state.char.race, state.char.cls);
    }
    const skillValues: Record<number, number> = {};
    // CombatSkillProgress uses `current` (not `value`). Cite: domain/character/combatSkills.ts.
    for (const [sid, s] of Object.entries(state.char.combatSkills ?? {})) {
      if (s) skillValues[Number(sid)] = s.current;
    }
    // Trade lines live in a SEPARATE store keyed by name, so a spell-list or cast gate on
    // mining / herbalism read no skill here and refused. Cite: domain/core/conditionSnapshot.ts.
    const tradeSkillOf = playerSkillValue(state.char, ds, state.spellbook);
    for (const sid of TRADE_SKILL_IDS) {
      const v = tradeSkillOf(sid);
      if (v != null) skillValues[sid] = v;
    }
    const nowMs = Date.now();
    const events = ds.gameEvents();
    return {
      reputationRanks,
      skillValues,
      activeEvents: [...activeEventIds(events, nowMs)],
      activeHolidays: [...activeHolidayIds(events, nowMs)],
      team: factionOf(ds, state.char.race) === 'horde' ? TEAM_HORDE : TEAM_ALLIANCE,
      pvpRank: calculateHonorRank(state.char.honor?.rp ?? 0).rank,
      worldStates: { ...(state.worldStates ?? {}) },
    };
  };

  // Rep-pane list state (At War / Inactive / watched) + the at-war set the NPC gates read.
  const factionApi = createFactionStateApi({
    ds, log, char: () => state.char, setChar: (next) => { state.char = next; },
  });

  // force_reaction map for Unit::CanInteract: active auras (crown / suit) plus the run's flag-derived map
  // when auras have not been stamped yet. Cite: ReputationMgr GetForcedRankIfAny.
  const playerForcedReactions = () => {
    const fromAuras = forcedReactionsFrom(
      ds,
      (state.char.activeAuras ?? []).map((a) => a.spellId),
    );
    const fromRun = state.instance?.forcedReactions as ForcedReactionMap | undefined;
    const merged: ForcedReactionMap = { ...(fromRun ?? {}), ...fromAuras };
    return forcedReactionsOf(merged);
  };

  /** Absolute standing for quest repObjective / gates (base when sparse key missing). */
  const standingFor = (factionId: number): number => {
    const fac = ds.faction(factionId);
    if (!fac) return 0;
    return getStanding(state.char.reputations, fac, state.char.race, state.char.cls);
  };

  // Wave 2 P1: quest log refresh body in game/questLog.ts (early — GameCtx needs it).
  const refreshQuests = createRefreshQuests({ ds, state }, { standingFor });

  // Garments heal+fort OOC TalkedToCreature (KI-749). Cite: npcs_special.cpp:563–668.
  const garmentsOoc = createGarmentsOocHandler();

  // Drop items the dataset no longer carries, gated on the item catalog being fully attached: a
  // half-loaded catalog used to delete the player's whole paperdoll here.
  sanitizeDriftedItems(ds, state, log);

  // Quest-item cap: null is no cap, else the objective room, and a starter allows one. With no active
  // objective needing it, allow one stack so a chance-100 row is not silently discarded.
  const questItemRoom = (entry: number): number | null => {
    const def = ds.item(entry);
    if (!def?.questItem) return null;
    let needed = 0;
    for (const qs of state.questlog.quests) {
      if (qs.status === 'turnedIn') continue;
      const q = ds.quest(qs.entry);
      if (!q) continue;
      for (const t of q.itemTargets ?? []) if (t.item === entry) needed += t.count;
      for (const t of q.sourceItemTargets ?? []) if (t.item === entry) needed += t.count;
    }
    const have = countItem(state.inventory, entry)
      + countItem(state.keyring ?? emptyKeyring(), entry)
      + countItem(mailboxAsInventory(state.mailbox ?? []), entry);
    if (needed === 0 && (def.startQuest ?? 0) > 0) {
      return Math.max(0, 1 - have);
    }
    if (needed === 0) {
      const stack = Math.max(1, def.stackable ?? 1);
      return Math.max(0, Math.min(stack, stack - have));
    }
    return Math.max(0, needed - have);
  };

  // Wired after equipmentHelper is created (takeDrop is defined first so ctx can hold it).
  let handleFullBags: GameCtx['handleFullBags'] = () => (
    { soldIncoming: 0, earnedIncoming: 0, destroyedIncoming: 0, madeRoom: false }
  );

  // Add a rolled drop to the bags or keyring, honouring bag space, unique and max count, and the
  // quest-item cap. Returns the count actually taken, 0 when capped or full.
  const takeDrop = (item: number, count: number): number => {
    const def = ds.item(item);
    if (!def) {
      // Item no longer in dataset (data change) - drop it on the floor.
      return 0;
    }
    const room = questItemRoom(item);
    let want = room == null ? count : Math.min(count, room);
    if (want <= 0) return 0;
    // MaxCount / Unique ownership across bags + bank + keyring + mailbox + equipped.
    // Cite: Player.cpp CanStoreNewItem ~8552 EQUIP_ERR_CANT_CARRY_MORE_OF_THIS.
    const uniq = canAcceptUnique(
      state.inventory,
      state.char,
      item,
      uniqueSignalsOf(def),
      undefined,
      {
        bank: state.bank,
        keyring: state.keyring ?? emptyKeyring(),
        mailbox: mailboxAsInventory(state.mailbox ?? []),
      },
    );
    if (!uniq.ok) {
      log(uniq.reason);
      return 0;
    }
    if (uniq.room != null && Number.isFinite(uniq.room)) {
      want = Math.min(want, uniq.room);
      if (want <= 0) {
        log(uniq.room === 0 ? 'Unique: you may only carry one' : `You may only carry ${uniq.room} more`);
        return 0;
      }
    }
    const maxStack = def.stackable ?? 1;
    // Keys go to the keyring (unbounded) — never consume backpack slots.
    // Cite: Player.cpp keyring store; domain/items/keyring.ts.
    if (isKeyItem(def)) {
      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      const inst = applyBindToInstance(
        createItemInstance(item, want, ds, rng),
        resolveBonding(def),
        'loot',
      );
      state.keyring = addToKeyring(
        state.keyring ?? emptyKeyring(),
        item,
        want,
        def,
        hasIdentity(inst) || identityCapable(def) ? inst : undefined,
      );
      return want;
    }
    // Family-aware fit: quiver/pouch capacity only holds matching ammo; overflow uses bags.
    // Cite: Item.cpp ItemCanGoIntoBag; packInventoryByBagFamily.
    let overflowSold = 0;
    if (!canFitWithBagFamily(state.inventory, state.char, ds, item, want, maxStack)) {
      // Junk filter (sell/destroy lists + quality) instead of mailing trash. Keepers
      // spill to the mailbox — outdoor autofight has no corpse window (KI-1061).
      const handled = handleFullBags(item, want);
      overflowSold = handled.soldIncoming;
      want -= handled.soldIncoming + handled.destroyedIncoming;
      if (want <= 0) return overflowSold;
      const fitsNow = handled.madeRoom
        && canFitWithBagFamily(state.inventory, state.char, ds, item, want, maxStack);
      if (!fitsNow) {
        // Instance and outdoor autofight both auto-loot; there is no corpse window.
        // Same spill as dungeon KI-150/KI-1029 so quest drops are not deleted (KI-1061).
        const spillRng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
        const spillInst = applyBindToInstance(
          createItemInstance(item, want, ds, spillRng),
          resolveBonding(def),
          'loot',
        );
        mailOverflow(ctx, {
          item,
          quantity: want,
          ...(hasIdentity(spillInst) || identityCapable(def) ? { instance: spillInst } : {}),
          subject: def.name ?? '',
        });
        log(`Bags full - ${want}x ${def.name ?? item} sent to your mailbox.`);
        return overflowSold + want;
      }
    }
    const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
    // BoP / quest bind on loot; BoE stays unbound until equip.
    const inst = applyBindToInstance(
      createItemInstance(item, want, ds, rng),
      resolveBonding(def),
      'loot',
    );
    if (hasIdentity(inst) || identityCapable(def)) {
      state.inventory = addInstance(state.inventory, inst, maxStack);
      if (isAmmoItem(def)) {
        state.inventory = packInventoryByBagFamily(state.inventory, state.char, ds);
      }
    } else {
      state.inventory = addItemPreferAmmoBag(state.inventory, state.char, ds, item, want, maxStack);
    }
    // Auto-select projectile when no valid ammo selection (create/loot path).
    // Cite: Player.cpp create second pass SetAmmo; Playerbot FindAmmo.
    if (isAmmoItem(def)) {
      state.char = maybeAutoSelectAmmo(state.char, state.inventory, ds, item);
    }
    return want;
  };

  // Wave 2 S6–S10: shared context for game/* sub-modules (pattern C).
  const ctx: GameCtx = {
    ds,
    state,
    opts,
    log,
    cap,
    refreshQuests,
    takeDrop,
    handleFullBags: (item, count, owner) => handleFullBags(item, count, owner),
  };
  // Wave 2 P3: equip / junk / DE before modules that need runAutoEquipUpgrades extras.
  const equipmentHelper = createEquipmentHelperModule(ctx);
  const {
    runAutoEquipUpgrades,
    containerOpener,
    sellAllJunkInner,
    discardItemInner,
    playerBags,
    handleFullBags: handleFullBagsImpl,
    methods: equipmentHelperMethods,
  } = equipmentHelper;
  handleFullBags = handleFullBagsImpl;
  const { vendorPriceMultiplier, vendorStockTracker } = makeVendorHelpers(ctx);
  // npc_vendor.condition_id for a merchant line. The WSG supply officers gate all 73 of theirs this
  // way, so without it the whole rep-gear shelf sold at rank 0. Cite: Player.cpp:17545.
  const vendorConditionSatisfied = (conditionId: number): boolean =>
    isConditionSatisfied(conditionId, lootConditionSnapshot(), conditionTableById()).ok;
  // Post-bag hook, same wrap as takeLoot below: vendor buy already calls runAutoEquipUpgrades
  // in trade.ts; mail / AH / bank did not, so a bought or mailed upgrade sat unworn.
  const bankBase = createBankModule(ctx);
  const bank = {
    ...bankBase,
    bankWithdraw(itemEntry, qty) {
      const res = bankBase.bankWithdraw(itemEntry, qty);
      if (res.ok) runAutoEquipUpgrades(3);
      return res;
    },
    bankWithdrawStack(slotIndex, qty) {
      const res = bankBase.bankWithdrawStack(slotIndex, qty);
      if (res.ok) runAutoEquipUpgrades(3);
      return res;
    },
  };
  const auctionMailBase = createAuctionMailModule(ctx);
  const auctionMail = {
    ...auctionMailBase,
    buyoutAuction(auctionId) {
      const res = auctionMailBase.buyoutAuction(auctionId);
      if (res.ok) runAutoEquipUpgrades(3);
      return res;
    },
    cancelAuction(auctionId) {
      const res = auctionMailBase.cancelAuction(auctionId);
      if (res.ok) runAutoEquipUpgrades(3);
      return res;
    },
  };
  const mailBase = createMailModule(ctx);
  const mail = {
    ...mailBase,
    takeMailItem(mailId, nowMs) {
      const res = mailBase.takeMailItem(mailId, nowMs);
      if (res.ok) runAutoEquipUpgrades(3);
      return res;
    },
    collectMail() {
      const res = mailBase.collectMail();
      if (res.ok && res.moved > 0) runAutoEquipUpgrades(8);
      return res;
    },
  };
  // Pet feed helpers before pets module: regenTick calls tryAutoFeed; methods share resolveFeed.
  const petFeed = createPetFeedHelpers(ctx);
  const pets = createPetsModule(ctx, { liveSession: () => combatSession.getLiveFightSession() });
  // Gather applyGather for fight-end auto-skin; professions methods via createProfessionsModule.
  const gatherHelpers = createGatherHelpers(ctx, { lootConditionSnapshot, conditionTableById });
  // The loot container (WoW's Loot object): every `{ hold: true }` loot act fills it and the
  // player takes rows out of it one click at a time.
  const lootBase = createLootModule(ctx, {
    onOpenLoot: () => {
      // Player::DoLoot. Both stores: the sheet, which nothing swept before, and the live unit while
      // a session is open. Cite: Player.cpp:20029 DoLoot.
      const gone = removeCharAurasWithInterruptFlags(
        state.char, AURA_INTERRUPT.LOOTING, ds, null, combatSession.getLiveFightSession(),
      );
      for (const sp of gone) log(`${sp.name} fades.`);
    },
  });
  // Manual loot take: equip upgrades then auto-DE (same post-bag hooks as resolveFight).
  const loot = {
    ...lootBase,
    takeLoot(index: number) {
      const res = lootBase.takeLoot(index);
      if (res.ok) runAutoEquipUpgrades(3);
      return res;
    },
    takeAllLoot() {
      const res = lootBase.takeAllLoot();
      if (res.ok && (res.taken.length > 0 || res.copper > 0)) runAutoEquipUpgrades(8);
      return res;
    },
  };
  // One depart hook for both transport types (tram 11 and boat/zep 15).
  const transportDepart: { afterDepart: (nowMs: number) => void } = {
    afterDepart: () => { /* travelCore fills this after createTravelCore */ },
  };
  const professionsBase = createProfessionsModule(ctx, {
    standingFor,
    trainerDiscountMod: (vendorEntry?: number) => {
      if (vendorEntry != null) return vendorPriceMultiplier(vendorEntry);
      return 1;
    },
    lootConditionSnapshot,
    conditionTableById,
    openLoot: loot.openLoot,
    transportDepart,
  });
  // Late-bind the auto-opener now that openContainerItem exists (same shape as transportDepart
  // above). requireRoom keeps a tight-bag open from consuming the container and spilling.
  containerOpener.open = (slotIndex: number): boolean =>
    professionsBase.openContainerItem(slotIndex, { requireRoom: true }).ok;
  const professions = {
    ...professionsBase,
    craft(recipeId) {
      const res = professionsBase.craft(recipeId);
      if (res.ok) runAutoEquipUpgrades(3);
      return res;
    },
    craftAll(recipeId) {
      const res = professionsBase.craftAll(recipeId);
      if (res.ok) runAutoEquipUpgrades(8);
      return res;
    },
  };
  // Class books (Tome/Codex/Libram/…) + the shared teach-item route consumeItem dispatches through.
  const learnFromItem = createLearnFromItemModule(ctx, { eligibleSpellIds: () => eligibleSpellIds() });
  const vendorOffersModule = createVendorOffersModule(ctx, {
    vendorPriceMultiplier,
    vendorStockTracker,
    vendorConditionSatisfied,
    canFitUnits: (itemEntry, units, stackable) =>
      canFitWithBagFamily(state.inventory, state.char, ds, itemEntry, units, stackable),
  });

  // Wave 2 S11: journey engine + travel facade (pattern C).
  // travelFightRef / outfitterSyncRef filled after combat + outfitter modules exist.
  const travelFightRef: TravelFightBridgeRef = { current: null };
  const outfitterSyncRef: TravelOutfitterSyncRef = { current: null };
  const travelCore = createTravelCore(ctx, travelFightRef, outfitterSyncRef);
  travelCore.initTravelOnLoad();

  // The weekly honor pass, owed on every maintenance day the save has crossed. Runs on load and again
  // whenever a match banks honor, so a session that spans midnight into Wednesday still ranks.
  const runWeeklyHonorPass = (nowMs = Date.now()): number => {
    const res = runHonorMaintenance(state.char.honor, state.honorWeek, nowMs);
    state.honorWeek = res.ledger;
    if (res.passes <= 0) return 0;
    state.char = { ...state.char, honor: res.honor };
    const fac = factionOf(ds, state.char.race) === 'horde' ? 'horde' : 'alliance';
    const now = rankForRp(res.honor.rp);
    if (res.rankAfter > res.rankBefore && now) {
      log(`The weekly standings are in. You are promoted to ${rankTitle(now, fac)}.`);
    } else if (res.rankAfter < res.rankBefore) {
      log(now
        ? `The weekly standings are in. Your rank falls to ${rankTitle(now, fac)}.`
        : 'The weekly standings are in. You no longer hold a rank.');
    }
    return res.passes;
  };
  runWeeklyHonorPass();
  transportDepart.afterDepart = (nowMs) => {
    travelCore.resetJourneyTrack(state.char.journey);
    travelCore.applyTravelPace(nowMs);
    travelCore.journeyTick(nowMs);
  };
  const {
    journeyTick,
    busyTravelling,
    resetJourneyTrack,
  } = travelCore;

  // Wave 2 S12: squad battle helpers (early — startFight / resolveFight share them).
  const squadHelpers = createSquadHelpers(ctx, {
    liveImbueUnit: (target) => liveImbueUnitRef.current?.(target) ?? null,
  });
  const {
    buildSquadBattleParty,
    syncCompanionPetAfterLevel,
  } = squadHelpers;

  // Wave 2 P4: death-flow facade (mode for combat extras + public methods).
  const deathFlow = createDeathFlowModule(ctx);

  // Wave 2 S14: combat session hub (owns pendingFight / liveFightSession).
  const combatSession = createCombatSessionModule(ctx, {
    deathFlowMode: deathFlow.deathFlowMode,
    busyTravelling,
    buildSquadBattleParty,
    syncCompanionPetAfterLevel,
    buildConditionCtx,
    conditionTableById,
    lootConditionSnapshot,
    runAutoEquipUpgrades,
    applyGather: gatherHelpers.applyGather,
    openLoot: loot.openLoot,
  });
  // The open session owns each wearer's weapon enchant — see weaponImbueItem mirror.
  liveImbueUnitRef.current = (target) => {
    const session = combatSession.getLiveFightSession();
    if (!session) return null;
    if (target.kind !== 'companion') return { session, side: 'player' };
    const side = combatSession.allySideForCompanion(session, target.id);
    return side ? { session, side } : null;
  };

  // S11: fill travel↔combat bridge now that fight helpers exist; build travel methods.
  travelFightRef.current = {
    startFight: (creatureEntry, bossSpellIds, encounter) =>
      combatSession.startFight(creatureEntry, bossSpellIds, encounter),
    resolveFight: combatSession.resolveFight,
    syncCharFromSession: combatSession.syncCharFromSession,
    persistSessionCooldowns: combatSession.persistSessionCooldowns,
    getPendingFight: combatSession.getPendingFight,
    setPendingFight: combatSession.setPendingFight,
    getLiveFightSession: combatSession.getLiveFightSession,
    setLiveFightSession: combatSession.setLiveFightSession,
  };
  const travel = createTravelMethods(ctx, {
    core: travelCore,
    fightRef: travelFightRef,
    innkeeperHere: squadHelpers.innkeeperHere,
    onOutfitterSync: () => outfitterSyncRef.current?.(),
  });

  // S12: squad/dungeon facade (late — runFullDungeon needs beginEncounter / resolveFight).
  const squad = createSquadMethods(ctx, {
    helpers: squadHelpers,
    combat: {
      beginEncounter: combatSession.methods.beginEncounter,
      resolveFight: combatSession.resolveFight,
      getLiveFightSession: combatSession.getLiveFightSession,
      getPendingFight: combatSession.getPendingFight,
    },
    journeyTick,
    busyTravelling,
    gear: equipmentHelperMethods,
  });

  // TEMP_SPAWN_CREATURE from send_event (Binding runes, etc.) — apply + ritual engage.
  // Cite: ScriptMgr.cpp:2027–2051; game/tempSpawnCreature.ts; KI-840.
  const applySendEventTempSpawns = (fired: ApplySendEventFromSpellResult['fired']): void => {
    applyTempSpawnsFromEventFire({
      fired,
      nowMs: Date.now(),
      questlog: state.questlog,
      questOf: (e) => ds.quest(e),
      creatureName: (e) => ds.creature(e)?.name ?? `creature ${e}`,
      fight: (entry) => combatSession.methods.fight(entry),
      log,
    });
  };

  // Wave 2 P1: quest log methods (needs applySendEventTempSpawns from combat).
  const questLog = createQuestLogModule(ctx, {
    standingFor,
    liveSession: () => combatSession.getLiveFightSession(),
    playerBags,
    runAutoEquipUpgrades,
    applySendEventTempSpawns,
    conditionTableById,
    lootConditionSnapshot,
  });

  // The cheapest repair vendor standing in the current zone, or null. With no vendor the best discount
  // among them applies. Cite: NPCHandler.cpp DurabilityRepairAll.
  const zoneRepairVendor = (): { entry: number; name: string; mod: number } | null => {
    // Inside an instance the outdoor zone's NPCs are on another map, so none of them is found.
    // Cite: Player.cpp:2429 GetNPCIfCanInteractWith GetMap()->GetAnyTypeCreature.
    if (state.instance) return null;
    let best: { entry: number; name: string; mod: number } | null = null;
    const zone = ds.zone(state.char.zoneId);
    for (const ve of zone?.vendors ?? []) {
      const v = ds.vendor(ve);
      if (!v?.canRepair) continue;
      // An enemy-faction repairer never mends your gear, and never sets the zone's price.
      // Cite: NPCHandler.cpp:996 GetNPCIfCanInteractWith(UNIT_NPC_FLAG_REPAIR).
      if (!canInteractWithCreature(ds, state.char.race, ve, factionApi.atWarFactions(), playerForcedReactions())) continue;
      const mod = vendorPriceMultiplier(ve);
      if (!best || mod < best.mod) best = { entry: ve, name: v.name, mod };
    }
    return best;
  };
  const repairDiscountMod = (vendorEntry?: number): number => {
    if (vendorEntry != null) return vendorPriceMultiplier(vendorEntry);
    return zoneRepairVendor()?.mod ?? 1;
  };

  // Wave 2 P2: trainer / buy / sell / repair / wrap.
  const trade = createTradeModule(ctx, {
    vendorPriceMultiplier,
    vendorStockTracker,
    vendorConditionSatisfied,
    playerForcedReactions,
    atWarFactions: () => factionApi.atWarFactions(),
    repairDiscountMod,
    zoneRepairVendor,
    runAutoEquipUpgrades,
    sellAllJunkInner,
    discardItemInner,
    eligibleSpellIds: () => eligibleSpellIds(),
  });

  // Wave 2 P6–P7: rotation then talents (talents needs playerRotationBand).
  const rotation = createRotationModule(ctx);
  // Macros before action bars: placing a macro on a bar is gated on it existing.
  const macros = createMacrosModule(ctx, {
    accountMacros: () => (typeof opts.accountMacros === 'function' ? opts.accountMacros() : (opts.accountMacros ?? [])),
    onAccountMacrosChange: opts.onAccountMacrosChange,
  });
  const actionBars = createActionBarsModule(ctx, {
    eligibleSpellIds: () => eligibleSpellIds(),
    knownMacroIds: () => macros.macros().map((m) => m.id),
  });
  const talents = createTalentsModule(ctx, {
    unlearnTalentGrantedSpells,
    eligibleSpellIds: () => eligibleSpellIds(),
    playerRotationBand: () => rotation.playerRotationBand(),
  });

  // Wave 2 P8: gossip / graveyard / events / weather (session-private map inside module).
  const worldSession = createWorldSessionModule(ctx);

  // Wave 2 P9: bag-use consumables (needs travel/professions/pets/learn + temp spawns).
  const consumables = createConsumablesModule(ctx, {
    enchantItemRouter,
    weaponImbueItemRouter,
    castHearth: (nowMs) => travel.castHearth(nowMs),
    openContainerItem: (slot, opts) => professions.openContainerItem(slot, opts),
    teachApi: { ...pets, ...professions, ...learnFromItem },
    applySendEventTempSpawns,
    // Food/Drink OOC-only while a floor fight is live (KI-909).
    isInCombat: () =>
      !!combatSession.getLiveFightSession() || !!combatSession.getPendingFight(),
    // The open session owns the player's live auras/vitals — a bag buff must land on it too.
    liveSession: () => combatSession.getLiveFightSession(),
    onOutfitterSync: () => outfitterSyncRef.current?.(),
  });

  // Wave 2 P10: regen/rest — gameRef bound after Game object is built.
  const gameRef: RegenRestGameRef = { current: null };
  const regenRest = createRegenRestModule(ctx, {
    gameRef,
    applyOocRegen: (seconds, sitting, regenFn) => petFeed.applyOocRegen(seconds, sitting, regenFn),
  });

  // Wave 2 P11: OOC cast methods (predicates remain in oocCast.ts).
  const oocCastMethods = createOocCastMethodsModule(ctx, {
    journeyTick,
    castTeleport: (spellId, nowMs) => travel.castTeleport(spellId, nowMs),
    pickPocket: (creatureEntry, opts) => professions.pickPocket(creatureEntry, opts),
    skin: (opts) => professions.skin(opts),
    disenchant: (itemEntry) => professions.disenchant(itemEntry),
    feedPet: (itemEntry) => pets.feedPet(itemEntry),
    garmentsAfterCast: (spellId, targetCreature, questlog, dsArg, logFn) =>
      garmentsOoc.afterCast(spellId, targetCreature, questlog, dsArg, logFn),
    applySendEventTempSpawns,
    // The open session owns the player's live auras — an OOC buff must land on it too.
    liveSession: () => combatSession.getLiveFightSession(),
  });

  const outfitter = createOutfitterModule(ctx, {
    isInCombat: () =>
      !!combatSession.getLiveFightSession() || !!combatSession.getPendingFight(),
    outfitterEnabled: () => {
      const v = opts.outfitterEnabled;
      return typeof v === 'function' ? v() : v !== false;
    },
  });
  outfitterSyncRef.current = () => outfitter.syncOutfitterSpecials();

  const globalActionBar = createGlobalActionBarModule(ctx, {
    consumeItem: (entry, prefer) => consumables.consumeItem(entry, prefer),
    useCompanionItem: (id, entry, opts) => squad.useCompanionItem(id, entry, opts),
    wearOutfitByName: (name, opts) => outfitter.wearOutfitByName(name, opts),
    liveSession: () => combatSession.getLiveFightSession(),
  });

  const game: Game = {
    get state() {
      return state;
    },

    bankWeeklyHonor(key, cp, hk = 0) {
      state.honorWeek = recordWeeklyContribution(
        state.honorWeek ?? { weekStart: '', rows: {} },
        key === 'player' ? PLAYER_STANDING_KEY : key,
        cp,
        hk,
      );
    },
    awardDuelHonor(opponent) {
      // Same three calls bgScreen's awardKillHonor makes (bgScreen.ts:904-922), against a real
      // person instead of a bot seat. Keyed by NAME so the per-victim falloff tracks a person.
      const res = recordHonorableKill(
        state.char.honor ?? newHonorState(),
        { level: state.char.level },
        { id: opponent.name, level: opponent.level, rankPoints: opponent.rankPoints ?? 0 },
        new Date().toISOString().slice(0, 10),
      );
      state.char = { ...state.char, honor: res.state };
      // A falloff-zeroed win still banks nothing and no HK, exactly as in a battleground.
      game.bankWeeklyHonor('player', res.cp, res.cp > 0 ? 1 : 0);
      game.runWeeklyHonorPass();
      return { cp: res.cp };
    },
    // The win bonus for the two brackets that fight on the combat surface. 3v3, 5v5, WSG and AB take
    // the same number at their end card (bgScreen.ts settleMatchHonor), so every bracket pays a win.
    // Cite: BattleGroundWS.h BG_WSG_WinMatchHonor; BattleGround.cpp RewardHonorToTeam.
    awardArenaWinHonor() {
      const cp = WSG_WIN_MATCH_HONOR[bgBracketId(state.char.level, 10, 60)] ?? 0;
      if (cp <= 0) return { cp: 0 };
      state.char = {
        ...state.char,
        honor: addBonusHonor(state.char.honor ?? newHonorState(), cp, {
          today: new Date().toISOString().slice(0, 10),
        }),
      };
      game.bankWeeklyHonor('player', cp, 0);
      game.runWeeklyHonorPass();
      return { cp };
    },
    runWeeklyHonorPass(nowMs) {
      return runWeeklyHonorPass(nowMs ?? Date.now());
    },

    ...bank,
    ...createSortContainersModule(ctx),
    ...auctionMail,
    ...mail,
    ...pets,
    ...professions,
    ...learnFromItem,
    ...loot,
    ...vendorOffersModule,
    ...travel,
    ...squad,
    ...createBattlegroundMethods(ctx, { onOutfitterSync: () => outfitterSyncRef.current?.() }),
    ...combatSession.methods,
    useInstanceObject(goEntry, opts) {
      const r = combatSession.methods.useInstanceObject(goEntry, opts);
      if (r.ok) {
        const used = fireGoUseDoorScripts({
          goEntry,
          goGuidScripts: (guid) => ds.goGuidUseScripts(guid),
          goTemplateScripts: (entry) => ds.goUseScripts(entry),
          goRuntime: state.goRuntime,
          goRuntimeKey: (e) => `${state.char.zoneId}:${e}`,
          gameObject: (e) => ds.gameObject(e),
          log,
        });
        if (used.goRuntime) state.goRuntime = used.goRuntime;
      }
      return r;
    },
    ...questLog,
    ...createDevGrantModule(ctx, { turnInQuest: questLog.turnInQuest }),
    ...trade,
    ...createRunSupplyModule(ctx),

    ...deathFlow.methods,
    ...consumables,
    ...regenRest,
    ...oocCastMethods,
    ...factionApi,
    ...rotation,
    autopilotConfig() { return normalizeAutopilotConfig(state.autopilot); },
    setAutopilotConfig(cfg) { state.autopilot = normalizeAutopilotConfig(cfg); },
    gatherFilterConfig() { return normalizeGatherFilterConfig(state.gatherFilter); },
    setGatherFilterConfig(cfg) { state.gatherFilter = normalizeGatherFilterConfig(cfg); },
    // Wave 2 P3: equip / junk / DE public surface.
    ...equipmentHelperMethods,
    ...outfitter,
    ...globalActionBar,

    ...actionBars,
    ...createPaladinBoardModule(ctx),
    ...macros,
    ...talents,
    ...worldSession,

    snapshot() {
      return JSON.parse(JSON.stringify(state)) as GameState;
    },
  };
  gameRef.current = game;
  return game;
}
