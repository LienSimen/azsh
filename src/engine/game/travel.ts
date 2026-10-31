// Travel, journey, taxi, hearth and mount facade methods plus the journey engine. The helpers are
// created early so the fight and dungeon paths share them; fight teardown is late-bound.

import type { CombatSession } from '../combat.ts';
import { unsummonTotemsOnLeaveWorld } from '../combat/sessionDeaths.ts';
import type { ItemDef, SpellDef } from '../../data/schema.ts';
import { AURA_INTERRUPT } from '../../domain/spells/stealth.ts';

// Player travel only: Teleport:/Portal: kit + eng. transporters (not quest "Teleport to …"). KI-900.
function isTravelTeleportSpell(spell: Pick<SpellDef, 'effects' | 'name' | 'rawEffects'>): boolean {
  const hasTeleportFx =
    !!spell.effects?.some((e) => e.kind === 'teleport' || e.kind === 'teleport_hearth') ||
    !!(spell.rawEffects ?? []).some((r) => (r.effect | 0) === 5); // SPELL_EFFECT_TELEPORT_UNITS
  if (!hasTeleportFx) return false;
  const name = spell.name ?? '';
  if (/^Teleport:\s/i.test(name)) return true;
  if (/^Portal:\s/i.test(name)) return true;
  if (/Transporter/i.test(name) || /Dimensional Ripper/i.test(name)) return true;
  return false;
}
import {
  trainRiding as doTrainRiding,
  mount as doMount,
  dismount as doDismount,
  findRidingSpell,
  type RidingSpellRow,
} from '../../domain/items/mounts.ts';
import { playerCombatFlagSet } from './oocCast.ts';
import {
  planJourney,
  departJourney,
  journeyProgress,
  addIdlePause,
  completeJourneyNow as doCompleteJourneyNow,
  journeyArrivalEpochMs,
  setJourneyTimeScale,
  normalizeTimeScale,
  taxiFareCopper,
} from '../../domain/nav/travel.ts';
import type { Journey, JourneyLeg, HearthBind } from '../../domain/nav/travelTypes.ts';
import {
  bestTravelSpeeds,
  AURA_INCREASE_SPEED,
  AURA_INCREASE_SWIM_SPEED,
  type SpeedEffect,
} from '../../domain/nav/speed.ts';
import { formSpeedBoostSpellIds } from '../../domain/character/forms.ts';
import { permanentSpeedAuras } from '../../domain/character/characterStats.ts';
import { SHAPESHIFT_FORM } from '../../data/schema.ts';
import { pruneExpiredAuras } from '../../domain/character/character.ts';
import { isPlayerAlive, refuseIfDead as refuseIfDeadHelper } from '../../domain/run/death.ts';
import { addItem, countItem, removeItem } from '../../domain/items/inventory.ts';
import {
  recordExplore,
  recordSameZoneTalkOrDeliver,
} from '../../domain/quests/questlog.ts';
import { creditSquadZoneEnter } from './squadQuestShare.ts';
import { factionOf } from '../../domain/character/races.ts';
import { isCapitalTeleport } from '../../domain/nav/cityTeleports.ts';
import { isCityDefender } from '../../domain/run/honor.ts';
import { canInteractWithCreature } from '../../domain/creature/faction.ts';
import { vendorPriceMultiplierFor } from './vendorOffers.ts';
import { getSpellRecoveryTime } from '../spells/recovery.ts';
import { currentMana, powerType } from '../../domain/character/character.ts';
import { grantXp } from '../../progression/leveling.ts';
import {
  CLASSIC_MAX_PLAYER_LEVEL,
  explorationXp,
  zoneAreaLevelProxy,
} from '../../progression/xpGain.ts';
import { pruneInstanceSaves, saveRunOnLeave } from '../../world/instances.ts';
import { restoreRaidPartySeating } from './raidParty.ts';
import { reconcileGamePartyAuras } from './partyAuras.ts';
import type { Rng } from '../core/rng.ts';
import type {
  ActionResult,
  BeginFight,
  FightOutcome,
  Game,
  TravelPace,
} from './types.ts';
import type { GameCtx } from './context.ts';
import { moneyMarked } from '../../domain/economy/money.ts';

/** Hearthstone item - seed-hearthstone.mjs / item_template 6948. */
const HEARTHSTONE_ITEM = 6948;
/** Hearthstone spell - seed-hearthstone.mjs / spell_template 8690. */
const HEARTHSTONE_SPELL = 8690;

/** Pending-fight shape travel reads. Owned by combatSession (S14). */
export type TravelPendingFight = {
  rng: Rng;
  creatureEntry: number;
  enemyLevel: number;
  pack?: Array<{ entry: number; level: number }>;
  encounter?: {
    dungeonId: string;
    encounterId: string;
    phaseIndex?: number;
    fusedIds?: string[];
  };
  withSquad?: boolean;
};

// Late-bound combat re-entry for travel-owned fight teardown. Filled after startFight / resolveFight / sync
// helpers exist in createGame.
export type TravelFightBridge = {
  startFight: (
    creatureEntry: number,
    bossSpellIds: number[] | undefined,
    encounter: undefined,
  ) => ActionResult<BeginFight>;
  resolveFight: (session: CombatSession) => FightOutcome;
  syncCharFromSession: (session: CombatSession) => void;
  persistSessionCooldowns: (session: CombatSession) => void;
  getPendingFight: () => TravelPendingFight | null;
  setPendingFight: (p: TravelPendingFight | null) => void;
  getLiveFightSession: () => CombatSession | null;
  setLiveFightSession: (s: CombatSession | null) => void;
};

export type TravelFightBridgeRef = { current: TravelFightBridge | null };

/** Late-bound: createTravelCore runs before outfitter module exists (game.ts). */
export type TravelOutfitterSyncRef = { current: (() => void) | null };

export type TravelCore = {
  discoverTaxiNodesInZone: (zoneId: string) => void;
  applyZoneEnterHooks: (zoneId: string) => void;
  ownedMountItems: () => ItemDef[];
  onFootSpeedCandidates: () => SpeedEffect[];
  travelerFaction: () => 'alliance' | 'horde';
  busyTravelling: () => boolean;
  resetJourneyTrack: (journey: Journey | undefined) => void;
  applyTravelPace: (nowMs: number) => void;
  journeyTick: (nowMs?: number) => void;
  journeyStatus: (nowMs?: number) => ReturnType<Game['journeyStatus']>;
  /** Sim Pause: fold wall time into pausedMs so travel does not jump. */
  setIdlePaused: (paused: boolean, nowMs?: number) => void;
  /** Carry journeyTrackKey across pace/speed rebases (setJourneySpeed). */
  setJourneyTrackKey: (key: number | undefined) => void;
  /** Construction-time taxi backfill (run once at createGame). */
  initTravelOnLoad: () => void;
};

function travelPaceOf(ctx: GameCtx): TravelPace {
  const p = typeof ctx.opts.travelPace === 'function' ? ctx.opts.travelPace() : ctx.opts.travelPace;
  return p === 2 || p === 4 || p === 'instant' ? p : 1;
}

// Journey engine state and helpers, created before the fight paths so they can share the busy check
// and the tick. Fight teardown and outfitter sync are late-bound through refs.
export function createTravelCore(
  ctx: GameCtx,
  fightRef: TravelFightBridgeRef,
  outfitterSyncRef: TravelOutfitterSyncRef = { current: null },
): TravelCore {
  const { ds, state, opts, log, refreshQuests } = ctx;

  // Journey engine state, engine-local and not persisted: position is derived from the wall clock, so
  // this only tracks observation. The last leg whose completion hooks ran; -1 is none.
  let journeyHooksThroughLeg = -1;
  /** Zone already credited for enter hooks this journey (skip re-hook at departure origin). */
  let journeyLastHookedZone: string | undefined;
  /** departedAtEpochMs of the journey we've been tracking (reset on new depart). */
  let journeyTrackKey: number | undefined;
  /** Sim Pause anchor — in-memory, not saved. */
  let idlePausedAt: number | null = null;

  const foldIdlePause = (nowMs: number): void => {
    if (idlePausedAt == null) return;
    const journey = state.char.journey;
    const dt = nowMs - idlePausedAt;
    idlePausedAt = nowMs;
    if (!journey || dt <= 0) return;
    state.char = { ...state.char, journey: addIdlePause(journey, dt) };
  };

  const setIdlePaused = (paused: boolean, nowMs: number = Date.now()): void => {
    if (paused) {
      if (idlePausedAt == null) idlePausedAt = nowMs;
      return;
    }
    foldIdlePause(nowMs);
    idlePausedAt = null;
  };

  /** D8: unlock all taxi nodes whose zone matches (both factions - planner gates use). */
  const discoverTaxiNodesInZone = (zoneId: string): void => {
    const nodes = ds.taxiNodes().filter((n) => n.zone === zoneId);
    if (!nodes.length) return;
    const have = new Set(state.char.discoveredTaxiNodes ?? []);
    let changed = false;
    for (const n of nodes) {
      if (!have.has(n.id)) {
        have.add(n.id);
        changed = true;
      }
    }
    if (changed) state.char.discoveredTaxiNodes = [...have];
  };

  // First-visit and zone-enter hooks: quest exploration credit, exploration XP and taxi discovery.
  // Idempotent — XP checks the explored list and discovery is a set union.
  const applyZoneEnterHooks = (zoneId: string): void => {
    if (state.char.health > 0) {
      state.questlog = recordExplore(state.questlog, zoneId, (e) => ds.quest(e));
      // Same-zone talk and deliver credit for an active quest whose ender zones include this one; a
      // deliver also needs the item carried. Cite: docs/archive/QUEST-INTERPRETER.md §5.
      state.questlog = recordSameZoneTalkOrDeliver(
        state.questlog,
        zoneId,
        (e) => ds.quest(e),
        state.inventory,
      );
      creditSquadZoneEnter(state, ds, zoneId);
      refreshQuests();
    }
    const explored = state.char.exploredZones ?? [];
    if (!explored.includes(zoneId)) {
      state.char = { ...state.char, exploredZones: [...explored, zoneId] };
      // D8 taxi discovery on first zone visit (exploredZones transition).
      discoverTaxiNodesInZone(zoneId);
      const zone = ds.zone(zoneId);
      const baseRows = ds.explorationBasexp();
      if (zone && baseRows.length > 0 && state.char.level < CLASSIC_MAX_PLAYER_LEVEL) {
        const baseXpFor = (lvl: number): number =>
          baseRows.find((r) => r.level === lvl)?.basexp ?? 0;
        const areaLevel = zoneAreaLevelProxy(
          zone.quests.map((q) => ds.quest(q)?.questLevel ?? 0),
        );
        const xp = explorationXp(state.char.level, baseXpFor(areaLevel ?? state.char.level), 1, {
          areaLevel,
          baseXpFor,
        });
        if (xp > 0) {
          const lv = grantXp(state.char, xp, ds);
          state.char = lv.char;
          log(`Discovered ${zone.name}: +${xp} XP.`);
          for (const newLevel of lv.leveledTo) log(`You have reached level ${newLevel}!`);
        }
      }
    } else {
      // Already explored: still union taxi nodes (e.g. backfill gaps).
      discoverTaxiNodesInZone(zoneId);
    }
  };

  // Owned mount items in bags + bank (I1 flow: item stays in bags; bank holds extras). Mount equip is via
  // useMount, not paperdoll - mountedItem is the active entry only.
  const ownedMountItems = (): ItemDef[] => {
    const out: ItemDef[] = [];
    const seen = new Set<number>();
    const consider = (entry: number): void => {
      if (seen.has(entry)) return;
      const item = ds.item(entry);
      if (!item) return;
      if (item.mountSpeedPct != null || item.mountSpell != null) {
        seen.add(entry);
        out.push(item);
      }
    };
    for (const s of state.inventory.stacks) if (s.count > 0) consider(s.item);
    for (const s of state.bank.stacks) if (s.count > 0) consider(s.item);
    return out;
  };

  // On-foot and swim speed candidates for auto-best: sustained ground and swim auras only, since a
  // timed sprint stays combat-only. Travel Form's speed rides an unlearned passive, so it is linked.
  const onFootSpeedCandidates = (): SpeedEffect[] => {
    const out: SpeedEffect[] = [];
    const seen = new Set<string>();
    const harvest = (sid: number): void => {
      const sp = ds.spell(sid);
      if (sp?.effects) {
        for (const eff of sp.effects) {
          if (eff.kind !== 'speed' || (eff.durationMs ?? 0) !== 0) continue;
          if (eff.aura !== AURA_INCREASE_SPEED && eff.aura !== AURA_INCREASE_SWIM_SPEED) continue;
          const key = `${eff.aura}:${eff.pct}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ aura: eff.aura, pct: eff.pct });
        }
      } else if (sid === 5419) {
        // Travel Form (Passive) 5419 — aura 31 +40% speed (bake hole fallback)
        // Cite: SpellAuras.cpp HandleShapeshiftBoosts FORM_TRAVEL->5419 (+40% run speed).
        const key = `${AURA_INCREASE_SPEED}:40`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ aura: AURA_INCREASE_SPEED, pct: 40 });
        }
      } else if (sid === 5421) {
        // Aquatic Form (Passive) 5421 — aura 58 +50% swim speed (bake hole fallback)
        // Cite: SpellAuras.cpp HandleShapeshiftBoosts FORM_AQUA->5421 (+50% swim speed).
        const key = `${AURA_INCREASE_SWIM_SPEED}:50`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ aura: AURA_INCREASE_SWIM_SPEED, pct: 50 });
        }
      }
    };
    for (const sid of state.spellbook.known) {
      harvest(sid);
      // Travel Form only: its speed spell is never trained, so a known-form auto-best has to follow the
      // boost link. The active-form path below covers casting in form for both.
      const sp = ds.spell(sid);
      const formEff = sp?.effects?.find((e) => e.kind === 'shapeshift');
      if (formEff && formEff.kind === 'shapeshift' && formEff.form === SHAPESHIFT_FORM.TRAVEL) {
        for (const boostId of formSpeedBoostSpellIds(formEff.form)) harvest(boostId);
      }
    }
    const activeForm = state.char.form ?? SHAPESHIFT_FORM.NONE;
    if (activeForm !== SHAPESHIFT_FORM.NONE) {
      for (const boostId of formSpeedBoostSpellIds(activeForm)) harvest(boostId);
    }
    // Boots enchant and speed talents — one row each, so effectiveSpeeds maxes them against a form
    // (and Pursuit of Justice's aura-32 half reaches a mounted trip).
    for (const p of permanentSpeedAuras(state.char, ds)) {
      const key = `${p.aura}:${p.pct}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ aura: p.aura, pct: p.pct });
    }
    return out;
  };

  const travelerFaction = (): 'alliance' | 'horde' => {
    const f = factionOf(ds, state.char.race);
    return f === 'horde' ? 'horde' : 'alliance';
  };

  const busyTravelling = (): boolean => !!state.char.journey;

  const resetJourneyTrack = (journey: Journey | undefined): void => {
    if (!journey) {
      journeyTrackKey = undefined;
      journeyHooksThroughLeg = -1;
      journeyLastHookedZone = undefined;
      return;
    }
    if (journeyTrackKey !== journey.departedAtEpochMs) {
      journeyTrackKey = journey.departedAtEpochMs;
      journeyHooksThroughLeg = -1;
      // Traveler is already in leg[0].from - do not re-fire enter hooks for the origin
      // (quest AreaExplored requires a real re-entry; MiscHandler explore order).
      journeyLastHookedZone = journey.legs[0]?.from ?? state.char.zoneId;
    }
  };

  // Apply the client's persistent travel pace to a just-departed journey — a settings mode, not a
  // per-journey dial. Rebasing the departure changes identity, so the track key is carried over.
  const applyTravelPace = (nowMs: number): void => {
    const journey = state.char.journey;
    if (!journey) return;
    const pace = travelPaceOf(ctx);
    if (pace === 'instant') {
      state.char = { ...state.char, journey: doCompleteJourneyNow(journey, nowMs) };
      journeyTrackKey = state.char.journey!.departedAtEpochMs;
    } else if (pace === 2 || pace === 4) {
      const next = setJourneyTimeScale(journey, pace, nowMs);
      state.char = { ...state.char, journey: next };
      journeyTrackKey = next.departedAtEpochMs;
    }
  };

  const hookZoneIfNew = (zoneId: string): void => {
    if (zoneId === journeyLastHookedZone) return;
    applyZoneEnterHooks(zoneId);
    journeyLastHookedZone = zoneId;
    outfitterSyncRef.current?.();
  };

  // Single derive-and-apply step for wall-clock journeys (D5). Offline catch-up: zone hooks for legs
  // completed while away.
  const journeyTick = (nowMs: number = Date.now()): void => {
    const journey = state.char.journey;
    if (!journey) {
      resetJourneyTrack(undefined);
      return;
    }
    // Death interrupts travel in place. Do not change the zone or clear the corpse: that was a free
    // corpse-run bypass mid-journey. Cite: domain/run/death.ts isPlayerAlive.
    if (!isPlayerAlive(state.char.health, state.deathFlow)) {
      state.char = { ...state.char, journey: undefined };
      resetJourneyTrack(undefined);
      return;
    }
    resetJourneyTrack(journey);

    if (idlePausedAt != null) {
      foldIdlePause(nowMs);
      return;
    }

    const progress = journeyProgress(journey, nowMs);

    // Apply first-visit hooks for every zone newly entered since the last observation. The zone id must
    // land before the hook: the outfitter sync reads the character's zone, not the argument.
    for (let i = journeyHooksThroughLeg + 1; i < progress.legIndex; i++) {
      const leg = journey.legs[i];
      if (!leg) continue;
      if (state.char.zoneId !== leg.to) {
        state.char.zoneId = leg.to;
        state.corpse = null;
        state.char.activeAuras = pruneExpiredAuras(state.char.activeAuras);
      }
      hookZoneIfNew(leg.to);
    }
    if (progress.arrived) {
      if (state.char.zoneId !== progress.zone) {
        state.char.zoneId = progress.zone;
        state.corpse = null;
        state.char.activeAuras = pruneExpiredAuras(state.char.activeAuras);
      }
      hookZoneIfNew(progress.zone);
      journeyHooksThroughLeg = progress.legIndex;
      const destName = ds.zone(progress.zone)?.name ?? progress.zone;
      log(`You arrive in ${destName}.`);

      // Commit cast costs only on successful arrival, never at departure or on cancel: an interrupt
      // must not start the recovery or eat the reagents. Cite: Spell.cpp cast success path.
      const arrivedAt = journeyArrivalEpochMs(journey);
      let hearthCooldownUntil = state.char.hearthCooldownUntil;
      if (journey.legs.some((l) => l.kind === 'hearth')) {
        const hearthSpell = ds.spell(HEARTHSTONE_SPELL);
        if (hearthSpell) {
          // Recovery starts when the cast lands (wall-clock arrival), not press time.
          hearthCooldownUntil = arrivedAt + getSpellRecoveryTime(hearthSpell);
        }
      }
      if (journey.teleportSpellId != null) {
        const tpId = journey.teleportSpellId;
        const row = ds.spellTeleports().find((t) => t.spell === tpId);
        // The City Defender grant is free at arrival too, or a mage who holds rank 15 would still
        // burn the rune the cast gate waived. Cite: castTeleport `granted` below.
        const free = row != null && isCapitalTeleport(row) && isCityDefender(state.char.honor);
        if (row && !free) {
          for (const r of row.reagents) {
            state.inventory = removeItem(state.inventory, r.item, r.count)[0];
          }
        }
        // TakePower + recovery on successful land (KI-643). Cite: Spell.cpp cast path.
        const tpSpell = ds.spell(tpId);
        if (tpSpell) {
          const cost = free ? 0 : (tpSpell.cost ?? 0) | 0;
          if (cost > 0) {
            if (powerType(state.char) === 'mana') {
              state.char.power = Math.max(0, (state.char.power ?? 0) - cost);
            } else {
              state.char.mana = Math.max(0, (state.char.mana ?? 0) - cost);
            }
          }
          const rec = getSpellRecoveryTime(tpSpell);
          if (rec > 0) {
            if (!state.spellCooldowns) state.spellCooldowns = {};
            const ready = arrivedAt + rec;
            state.spellCooldowns[tpId] = Math.max(state.spellCooldowns[tpId] ?? 0, ready);
            // Portals share a 60s category in 1.12; bake often omits Category — mirror via name.
            if (/^Portal:/i.test(tpSpell.name ?? '')) {
              for (const pr of ds.spellTeleports()) {
                const ps = ds.spell(pr.spell);
                if (ps && /^Portal:/i.test(ps.name ?? '') && getSpellRecoveryTime(ps) > 0) {
                  state.spellCooldowns[pr.spell] = Math.max(
                    state.spellCooldowns[pr.spell] ?? 0,
                    ready,
                  );
                }
              }
            }
          }
        }
      }

      state.char = { ...state.char, journey: undefined, hearthCooldownUntil };
      resetJourneyTrack(undefined);
      return;
    }

    if (state.char.zoneId !== progress.zone) {
      state.char.zoneId = progress.zone;
      state.corpse = null;
      state.char.activeAuras = pruneExpiredAuras(state.char.activeAuras);
    }
    // Mid-journey handoff into legs[legIndex].from (equals prior leg.to).
    hookZoneIfNew(progress.zone);
    journeyHooksThroughLeg = Math.max(journeyHooksThroughLeg, progress.legIndex - 1);
  };

  const journeyStatus = (nowMs: number = Date.now()) => {
    journeyTick(nowMs);
    const journey = state.char.journey;
    if (!journey) return null;
    const progress = journeyProgress(journey, nowMs);
    return {
      progress,
      legs: journey.legs,
      arrivalEpochMs: journeyArrivalEpochMs(journey),
      destination: journey.destination,
      timeScale: normalizeTimeScale(journey.timeScale),
    };
  };

  const initTravelOnLoad = (): void => {
    // D8 construction backfill: current zone's taxi nodes for pre-discovery saves.
    discoverTaxiNodesInZone(state.char.zoneId);

    // The race's default-known flight nodes, unioned at construction so new heroes AND existing saves
    // know their racial nodes. Cite: Player.cpp:295-301 PlayerTaxi::InitTaxiNodes.
    {
      const starting = ds.race(state.char.race)?.startingTaxiNodes ?? [];
      if (starting.length) {
        const have = new Set(state.char.discoveredTaxiNodes ?? []);
        let changed = false;
        for (const id of starting) {
          if (!have.has(id)) {
            have.add(id);
            changed = true;
          }
        }
        if (changed) state.char.discoveredTaxiNodes = [...have];
      }
    }
  };

  const core: TravelCore = {
    discoverTaxiNodesInZone,
    applyZoneEnterHooks,
    ownedMountItems,
    onFootSpeedCandidates,
    travelerFaction,
    busyTravelling,
    resetJourneyTrack,
    applyTravelPace,
    journeyTick,
    journeyStatus,
    setIdlePaused,
    setJourneyTrackKey: (key) => { journeyTrackKey = key; },
    initTravelOnLoad,
  };
  return core;
}

export type TravelMethodsExtras = {
  core: TravelCore;
  fightRef: TravelFightBridgeRef;
  innkeeperHere: () => { entry: number; name: string } | undefined;
  onOutfitterSync?: () => void;
};

export function createTravelMethods(
  ctx: GameCtx,
  extras: TravelMethodsExtras,
): Pick<
  Game,
  | 'previewTravel'
  | 'travelTo'
  | 'journeyTick'
  | 'journeyStatus'
  | 'setIdlePaused'
  | 'cancelJourney'
  | 'setJourneySpeed'
  | 'completeJourneyNow'
  | 'abandonLiveFight'
  | 'bindHearth'
  | 'castHearth'
  | 'classTravelOptions'
  | 'castTeleport'
  | 'taxiOptions'
  | 'trainRiding'
  | 'useMount'
  | 'dismount'
> {
  const { ds, state, log } = ctx;
  const { core, fightRef, innkeeperHere, onOutfitterSync } = extras;
  const {
    journeyTick: doJourneyTick,
    journeyStatus: doJourneyStatus,
    setIdlePaused: doSetIdlePaused,
    resetJourneyTrack,
    applyTravelPace,
    ownedMountItems,
    onFootSpeedCandidates,
    travelerFaction,
    setJourneyTrackKey,
  } = core;

  // A dead or ghost player cannot start a road, taxi, boat, hearth or teleport. The depart paths clear
  // the corpse and would relocate the body, so the gate is shared with every other dead-char refusal.
  const refuseIfDead = (): { ok: false; reason: string } | null =>
    refuseIfDeadHelper(state.char.health, state.deathFlow);

  // Same 30-min / lockout hold as leaveInstance (KI-968). Cite MapPersistentStateMgr.h:41.
  const dropOpenInstanceOnDepart = (nowMs: number): void => {
    if (!state.instance) return;
    // Same restore leaveInstance does — benched companions live only on raidParty.
    restoreRaidPartySeating(state, ds);
    const def = ds.instance(state.instance.dungeonId);
    const saves = state.instanceSaves ?? {};
    state.instanceSaves = def
      ? saveRunOnLeave(saves, state.instance, def, nowMs, state.lockouts)
      : pruneInstanceSaves(saves, nowMs);
    state.instance = null;
    reconcileGamePartyAuras(state, ds);
  };

  // Player.cpp:17118 npc ? GetReputationPriceDiscount(npc) : 0.0f — 0.0 is SEND_TAXI (free); no FM keeps 1.
  const taxiDiscountMod = (): number => {
    const fms = ds.zone(state.char.zoneId)?.flightMasters ?? [];
    for (const fm of fms) {
      if (!ds.creature(fm.entry) || canInteractWithCreature(ds, state.char.race, fm.entry)) {
        return vendorPriceMultiplierFor(ds, state.char, fm.entry);
      }
    }
    return 1;
  };

  return {
    previewTravel(zoneId, nowMs = Date.now()) {
      // Plan-only view (K5 map preview): same assembly as travelTo, NO state change.
      // Do not journeyTick here - a pure read must not apply arrivals.
      if (!ds.zone(zoneId)) return { ok: false, reason: 'Unknown zone' };
      if (zoneId === state.char.zoneId) return { ok: false, reason: 'You are already here' };
      const speeds = bestTravelSpeeds({
        char: state.char,
        ownedMounts: ownedMountItems(),
        onFootCandidates: onFootSpeedCandidates(),
        inCombat: false,
      });
      const plan = planJourney({
        from: state.char.zoneId,
        to: zoneId,
        now: nowMs,
        speeds,
        faction: travelerFaction(),
        discoveredTaxiNodes: state.char.discoveredTaxiNodes ?? [],
        availableCopper: state.char.gold,
        taxiDiscountMod: taxiDiscountMod(),
        travelEdges: ds.travelEdges(),
        taxiNodes: ds.taxiNodes(),
        taxiRoutes: ds.taxiRoutes(),
        transports: ds.transports(),
      });
      if (!plan.ok) {
        return {
          ok: false,
          reason: plan.reason === 'same_zone' ? 'You are already here' : 'No route to that destination',
        };
      }
      return { ok: true, legs: plan.legs, totalSeconds: plan.totalSeconds, totalCopper: plan.totalCopper };
    },

    travelTo(zoneId, nowMs = Date.now()) {
      doJourneyTick(nowMs);
      const dead = refuseIfDead();
      if (dead) return dead;
      if (zoneId === state.char.zoneId && !state.char.journey) {
        return { ok: false, reason: 'You are already here' };
      }
      if (state.char.journey) {
        return { ok: false, reason: 'You are already travelling' };
      }
      // Cannot depart mid-pull. Cite: Player::ActivateTaxiPathTo IsInCombat → ERR_TAXIPLAYERBUSY
      // (cmangos Player.cpp:17026); same gate as castHearth/castTeleport via getPendingFight.
      const bridge = fightRef.current;
      if (bridge?.getPendingFight()) return { ok: false, reason: 'You are in combat' };
      if (!ds.zone(zoneId)) {
        return { ok: false, reason: 'Unknown zone' };
      }

      // D7 auto-best speeds: owned mounts (bags/bank) + riding rank + sustained on-foot aura-31 / swim
      // aura-58 (incl. form-linked HandleShapeshiftBoosts passives). No tripConsumables in this wave.
      const speeds = bestTravelSpeeds({
        char: state.char,
        ownedMounts: ownedMountItems(),
        onFootCandidates: onFootSpeedCandidates(),
        inCombat: false,
      });
      const plan = planJourney({
        from: state.char.zoneId,
        to: zoneId,
        now: nowMs,
        speeds,
        faction: travelerFaction(),
        discoveredTaxiNodes: state.char.discoveredTaxiNodes ?? [],
        availableCopper: state.char.gold,
        taxiDiscountMod: taxiDiscountMod(),
        travelEdges: ds.travelEdges(),
        taxiNodes: ds.taxiNodes(),
        taxiRoutes: ds.taxiRoutes(),
        transports: ds.transports(),
      });
      if (!plan.ok) {
        const reason =
          plan.reason === 'same_zone'
            ? 'You are already here'
            : 'No route to that destination';
        return { ok: false, reason };
      }

      // Taxi fares prepaid at departure (roadmap K1).
      if (plan.totalCopper > 0) {
        if (state.char.gold < plan.totalCopper) {
          return { ok: false, reason: 'Not enough money' };
        }
        state.char = { ...state.char, gold: state.char.gold - plan.totalCopper };
      }

      // Departing leaves any open instance (no separate "leave first" gate) — save like leaveInstance.
      dropOpenInstanceOnDepart(nowMs);
      unsummonTotemsOnLeaveWorld(bridge?.getLiveFightSession());

      const journey = departJourney(plan.legs, nowMs);
      state.char = { ...state.char, journey };
      state.corpse = null;
      state.char.activeAuras = pruneExpiredAuras(state.char.activeAuras);
      resetJourneyTrack(journey);
      applyTravelPace(nowMs);

      const destName = ds.zone(zoneId)?.name ?? zoneId;
      const etaMin = Math.max(1, Math.round(plan.totalSeconds / 60));
      const fareNote = plan.totalCopper > 0 ? ` Fare: ${moneyMarked(plan.totalCopper)}.` : '';
      log(`You set out for ${destName} (ETA ~${etaMin} min).${fareNote}`);

      // Observe departure immediately so leg-0 zone hooks fire on the first tick.
      doJourneyTick(nowMs);

      return {
        ok: true,
        travelMs: plan.totalSeconds * 1000,
        totalSeconds: plan.totalSeconds,
        totalCopper: plan.totalCopper,
      };
    },

    journeyTick(nowMs = Date.now()) {
      doJourneyTick(nowMs);
    },

    journeyStatus(nowMs = Date.now()) {
      return doJourneyStatus(nowMs);
    },

    setIdlePaused(paused, nowMs = Date.now()) {
      doSetIdlePaused(paused, nowMs);
    },

    cancelJourney(nowMs = Date.now()) {
      doJourneyTick(nowMs);
      const dead = refuseIfDead();
      if (dead) return dead;
      const journey = state.char.journey;
      if (!journey) return { ok: false, reason: 'You are not travelling' };
      const progress = journeyProgress(journey, nowMs);
      // Prepaid taxi (legs.costCopper after Player.cpp:17118 rep discount) — refund incomplete legs
      // only; cancel undoes unrendered service (KI-901). Completed hops keep their fare.
      let refundCopper = 0;
      for (let i = progress.legIndex; i < journey.legs.length; i++) {
        refundCopper += journey.legs[i]!.costCopper;
      }
      state.char.zoneId = progress.zone;
      state.char = {
        ...state.char,
        journey: undefined,
        gold: state.char.gold + refundCopper,
      };
      resetJourneyTrack(undefined);
      state.corpse = null;
      const zoneName = ds.zone(progress.zone)?.name ?? progress.zone;
      const fareNote = refundCopper > 0 ? ` Fare refunded: ${moneyMarked(refundCopper)}.` : '';
      log(`You abandon your journey in ${zoneName}.${fareNote}`);
      return { ok: true };
    },

    setJourneySpeed(scale, nowMs = Date.now()) {
      if (scale !== 1 && scale !== 2 && scale !== 4) {
        return { ok: false, reason: 'Travel speed must be 1, 2 or 4' };
      }
      doJourneyTick(nowMs); // observe arrival first - never fast-forward a finished journey
      const journey = state.char.journey;
      if (!journey) return { ok: false, reason: 'You are not travelling' };
      const next = setJourneyTimeScale(journey, scale, nowMs);
      if (next !== journey) {
        state.char = { ...state.char, journey: next };
        // The rebase moves departedAtEpochMs, which resetJourneyTrack uses as the journey identity - carry
        // the key over so a dial press never re-fires zone hooks on the same journey.
        setJourneyTrackKey(next.departedAtEpochMs);
      }
      return { ok: true };
    },

    completeJourneyNow(nowMs = Date.now()) {
      // Instant arrival, gated on the live travel pace (D3 amendment). Phase-6
      // server path must never accept this call.
      if (travelPaceOf(ctx) !== 'instant') {
        return { ok: false, reason: 'Instant travel is disabled' };
      }
      // Observe first: death mid-journey aborts in place via journeyTick (KI-834).
      doJourneyTick(nowMs);
      const dead = refuseIfDead();
      if (dead) return dead;
      const journey = state.char.journey;
      if (!journey) return { ok: false, reason: 'You are not travelling' };
      state.char = {
        ...state.char,
        journey: doCompleteJourneyNow(journey, nowMs),
      };
      doJourneyTick(nowMs);
      return { ok: true };
    },

    abandonLiveFight(nowMs = Date.now()) {
      const bridge = fightRef.current;
      if (!bridge) return { ok: false, reason: 'No fight in progress' };
      const session = bridge.getLiveFightSession();
      if (!session) return { ok: false, reason: 'No fight in progress' };
      unsummonTotemsOnLeaveWorld(session);
      // The live session never wrote back to state.char, so dropping it leaves the hero at
      // pre-fight HP with no XP/loot/wear - the fight simply never counted.
      bridge.setPendingFight(null);
      bridge.setLiveFightSession(null);
      return { ok: true };
    },

    bindHearth(nowMs = Date.now()) {
      // Same busy guard as travelTo / castHearth — binding is an innkeeper dialog, impossible mid-flight
      // (KI-546). Observe arrival first so a just-finished journey does not falsely block.
      doJourneyTick(nowMs);
      const dead = refuseIfDead();
      if (dead) return dead;
      if (state.char.journey) {
        return { ok: false, reason: 'You are already travelling' };
      }
      if (state.instance) return { ok: false, reason: 'Cannot bind inside an instance' };
      // Vanilla bind is innkeeper gossip only (Unit::CanInteract via innkeeperHere /
      // KI-669). areatrigger_tavern rows are rest-XP markers, not bind points (KI-731).
      const inn = innkeeperHere();
      if (!inn) {
        return { ok: false, reason: 'There is no inn here' };
      }
      const tav = ds.tavernTriggers().find((t) => t.zone === state.char.zoneId);
      const bind: HearthBind = {
        zone: state.char.zoneId,
        name: inn.name,
        ...(tav ? { trigger: tav.id } : {}),
      };
      state.char = { ...state.char, hearthBind: bind };

      // Vanilla innkeepers replace a lost hearthstone (item 6948). Documented bridge:
      // CharStartOutfit / inn bind grants the stone when missing; seed-hearthstone.mjs.
      const inBags = countItem(state.inventory, HEARTHSTONE_ITEM);
      const inBank = countItem(state.bank, HEARTHSTONE_ITEM);
      if (inBags <= 0 && inBank <= 0) {
        const idef = ds.item(HEARTHSTONE_ITEM);
        if (idef) {
          state.inventory = addItem(
            state.inventory,
            HEARTHSTONE_ITEM,
            1,
            idef.stackable ?? 1,
          );
        }
      }

      const place = bind.name ?? ds.zone(bind.zone)?.name ?? bind.zone;
      log(`You are now bound to ${place}.`);
      return { ok: true, bind };
    },

    castHearth(nowMs = Date.now()) {
      doJourneyTick(nowMs);
      const dead = refuseIfDead();
      if (dead) return dead;
      if (state.char.journey) {
        return { ok: false, reason: 'You are already travelling' };
      }
      const bridge = fightRef.current;
      if (bridge?.getPendingFight()) return { ok: false, reason: 'You are in combat' };
      const bind = state.char.hearthBind;
      if (!bind) return { ok: false, reason: 'You have no hearthstone bind' };
      if (countItem(state.inventory, HEARTHSTONE_ITEM) <= 0) {
        return { ok: false, reason: 'You need a Hearthstone' };
      }
      const cdUntil = state.char.hearthCooldownUntil ?? 0;
      if (nowMs < cdUntil) {
        const remMin = Math.ceil((cdUntil - nowMs) / 60_000);
        return { ok: false, reason: `Hearthstone is recharging (${remMin} min left)` };
      }
      // Timing from the baked hearthstone spell: the cast time drives the journey leg, while the
      // recovery is applied only on successful arrival, so a cancel must not start the cooldown.
      const spell = ds.spell(HEARTHSTONE_SPELL);
      if (!spell) return { ok: false, reason: 'Hearthstone spell missing from data' };
      const castTimeMs = spell.castTimeMs ?? 0;
      const seconds = castTimeMs / 1000;
      const leg: JourneyLeg = {
        kind: 'hearth',
        from: state.char.zoneId,
        to: bind.zone,
        seconds,
        costCopper: 0,
      };
      // Departing leaves any open instance (no "leave first" gate — same as travelTo).
      dropOpenInstanceOnDepart(nowMs);
      unsummonTotemsOnLeaveWorld(bridge?.getLiveFightSession());
      const journey = departJourney([leg], nowMs);
      state.char = {
        ...state.char,
        journey,
      };
      resetJourneyTrack(journey);
      applyTravelPace(nowMs);
      const dest = bind.name ?? ds.zone(bind.zone)?.name ?? bind.zone;
      log(`You cast Hearthstone - returning to ${dest}.`);
      doJourneyTick(nowMs);
      return { ok: true, totalSeconds: seconds };
    },

    classTravelOptions(nowMs = Date.now()) {
      // Pure read with lazy tick (same pattern as journeyStatus) so arrival is observed.
      doJourneyTick(nowMs);
      const known = new Set(state.spellbook.known);
      // The City Defender easter egg rides the mage's own rows: rank 15 grants the six capital
      // teleports free of the rune and the mana. Cite: domain/run/honor.ts isCityDefender.
      const defender = isCityDefender(state.char.honor);
      const out: Array<{
        spellId: number;
        name: string;
        toZone: string;
        castSeconds: number;
        free: boolean;
        reagents: Array<{ item: number; count: number; have: number }>;
      }> = [];
      // Only real player travel teleports the character knows, which is what keeps non-travel junk and
      // quest or script ports out. Cite: DataBundle.spellTeleports.
      for (const row of ds.spellTeleports()) {
        const granted = defender && isCapitalTeleport(row);
        if (!known.has(row.spell) && !granted) continue;
        const spell = ds.spell(row.spell);
        if (!spell) continue;
        if (!isTravelTeleportSpell(spell)) continue;
        const castTimeMs = spell.castTimeMs ?? 0;
        out.push({
          spellId: row.spell,
          name: spell.name,
          toZone: row.zone,
          castSeconds: castTimeMs / 1000,
          free: granted,
          reagents: granted ? [] : row.reagents.map((r) => ({
            item: r.item,
            count: r.count,
            have: countItem(state.inventory, r.item),
          })),
        });
      }
      return out;
    },

    castTeleport(spellId, nowMs = Date.now()) {
      doJourneyTick(nowMs);
      const dead = refuseIfDead();
      if (dead) return dead;
      if (state.char.journey) {
        return { ok: false, reason: 'You are already travelling' };
      }
      const bridge = fightRef.current;
      if (bridge?.getPendingFight()) return { ok: false, reason: 'You are in combat' };
      // Destination + reagents from bake only - never hardcode zones/reagents.
      // Cite: enrich-class-travel.mjs; spell_target_position + spell_template Reagent1..8.
      const row = ds.spellTeleports().find((t) => t.spell === spellId);
      // A City Defender casts the six capital teleports without knowing them, without the rune and
      // without the mana — the rank IS the spell. Everything else still needs the spellbook.
      const granted = row != null && isCapitalTeleport(row) && isCityDefender(state.char.honor);
      if (!granted && !state.spellbook.known.includes(spellId)) {
        return { ok: false, reason: 'You do not know that spell' };
      }
      if (!row) {
        return { ok: false, reason: 'That spell is not a teleport' };
      }
      const spell = ds.spell(spellId);
      if (!spell) return { ok: false, reason: 'Spell missing from data' };
      // Refuse non-player-travel spells that polluted spell_target_position (KI-705/KI-900).
      if (!isTravelTeleportSpell(spell)) {
        return { ok: false, reason: 'That spell is not a teleport' };
      }
      if (row.zone === state.char.zoneId) {
        return { ok: false, reason: 'You are already here' };
      }

      // Mana gate (KI-643). TakePower deferred to arrival with reagents.
      const manaCost = granted ? 0 : (spell.cost ?? 0) | 0;
      if (manaCost > 0 && currentMana(state.char) < manaCost) {
        return { ok: false, reason: 'Not enough mana' };
      }

      // Recovery gate (portal 60s, etc.). Cite: SpellMgr.h GetSpellRecoveryTime.
      const rec = getSpellRecoveryTime(spell);
      if (rec > 0) {
        const readyAt = state.spellCooldowns?.[spellId] ?? 0;
        if (nowMs < readyAt) {
          return { ok: false, reason: 'On cooldown' };
        }
        if (/^Portal:/i.test(spell.name ?? '')) {
          for (const pr of ds.spellTeleports()) {
            const ps = ds.spell(pr.spell);
            if (!ps || !/^Portal:/i.test(ps.name ?? '')) continue;
            const pReady = state.spellCooldowns?.[pr.spell] ?? 0;
            if (nowMs < pReady) return { ok: false, reason: 'On cooldown' };
          }
        }
      }

      // Reagents are checked at cast start and taken only on successful arrival, so an interrupt does
      // not consume them. Cite: Spell.cpp CheckItems; TakeReagents after the cast lands.
      for (const r of (granted ? [] : row.reagents)) {
        if (countItem(state.inventory, r.item) < r.count) {
          const idef = ds.item(r.item);
          return {
            ok: false,
            reason: idef
              ? `Requires ${r.count}× ${idef.name}`
              : `Missing reagents (item ${r.item})`,
          };
        }
      }

      // Cast time from baked spell row - not a hardcoded constant.
      const castTimeMs = spell.castTimeMs ?? 0;
      const seconds = castTimeMs / 1000;
      const leg: JourneyLeg = {
        kind: 'portal',
        from: state.char.zoneId,
        to: row.zone,
        seconds,
        costCopper: 0,
      };
      // Channeling leaves any open instance (same as travelTo — no "leave first" gate).
      dropOpenInstanceOnDepart(nowMs);
      unsummonTotemsOnLeaveWorld(bridge?.getLiveFightSession());
      const journey: Journey = {
        ...departJourney([leg], nowMs),
        teleportSpellId: spellId,
      };
      state.char = { ...state.char, journey };
      state.corpse = null;
      state.char.activeAuras = pruneExpiredAuras(state.char.activeAuras);
      resetJourneyTrack(journey);
      applyTravelPace(nowMs);
      log(`You begin channeling ${spell.name}...`);
      doJourneyTick(nowMs);
      return { ok: true, totalSeconds: seconds };
    },

    taxiOptions(_nowMs = Date.now()) {
      // Pure read: single-hop flights from discovered nodes in the current zone.
      const zoneId = state.char.zoneId;
      const discovered = new Set(state.char.discoveredTaxiNodes ?? []);
      const faction = travelerFaction();
      const discountMod = taxiDiscountMod();
      const nodeById = new Map(ds.taxiNodes().map((n) => [n.id, n]));
      const hereNodes = ds.taxiNodes().filter(
        (n) => n.zone === zoneId && discovered.has(n.id),
      );
      const out: Array<{ toZone: string; seconds: number; priceCopper: number; pathId: number }> = [];
      const factionOk = (f: string): boolean =>
        f === 'both' || f === faction;

      for (const fromNode of hereNodes) {
        if (!factionOk(fromNode.faction)) continue;
        for (const route of ds.taxiRoutes()) {
          if (route.transportPath) continue;
          if (route.from !== fromNode.id) continue;
          if (!(route.seconds > 0)) continue;
          if (!discovered.has(route.to)) continue;
          const toNode = nodeById.get(route.to);
          if (!toNode?.zone) continue;
          if (!factionOk(toNode.faction)) continue;
          if (toNode.zone === zoneId) continue;
          out.push({
            toZone: toNode.zone,
            seconds: route.seconds,
            priceCopper: taxiFareCopper(route.priceCopper, discountMod),
            pathId: route.id,
          });
        }
      }
      return out;
    },

    trainRiding(trainerNpcEntry, rankOrSpellId) {
      const spells = ds.ridingSpells() as RidingSpellRow[];
      const spell = findRidingSpell(spells, rankOrSpellId);
      if (!spell) return { ok: false, reason: 'Unknown riding rank' };
      // Zone presence: trainer must be listed on current zone.ridingTrainers.
      // Entry 0 skips the gate (tests / debug). Riding NPCs are not in `trainers` map.
      if (trainerNpcEntry !== 0) {
        const zone = ds.zone(state.char.zoneId);
        const listed = zone?.ridingTrainers?.includes(trainerNpcEntry);
        if (!listed) {
          return { ok: false, reason: 'No riding trainer here' };
        }
        // Optional faction refuse when we have a creature def (fail open if missing).
        if (ds.creature(trainerNpcEntry) && !canInteractWithCreature(ds, state.char.race, trainerNpcEntry)) {
          return { ok: false, reason: 'They refuse to deal with you.' };
        }
      }
      const goldBefore = state.char.gold;
      const discountMod = vendorPriceMultiplierFor(ds, state.char, trainerNpcEntry);
      const res = doTrainRiding(state.char, spell, discountMod);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot train riding' };
      state.char = res.char;
      const spent = goldBefore - state.char.gold;
      const npcName = trainerNpcEntry
        ? (ds.creature(trainerNpcEntry)?.name ?? `trainer ${trainerNpcEntry}`)
        : 'riding instructor';
      log(`Trained Riding (${spell.rank}) with ${npcName} for ${moneyMarked(spent)}.`);
      return { ok: true, rank: spell.rank, spent };
    },

    useMount(itemEntry) {
      const dead = refuseIfDead();
      if (dead) return dead;
      if (countItem(state.inventory, itemEntry) <= 0) {
        return { ok: false, reason: "You don't have that mount" };
      }
      const item = ds.item(itemEntry);
      if (!item) return { ok: false, reason: 'Unknown item' };
      // Mounting is a non-combat action: the flag is hot for the pull, so the bag button refuses the
      // same way a mount SPELL does. Cite: oocCast.playerCombatFlagSet; Spell.cpp:4598.
      const res = doMount(state.char, item, {
        inCombat: playerCombatFlagSet(fightRef.current?.getLiveFightSession()),
      });
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot mount' };
      state.char = res.char;

      // Cite: Unit.cpp:7747, the first statement in Unit::Mount.
      const live = fightRef.current?.getLiveFightSession();
      if (live?.removeAurasWithInterruptFlags) {
        live.removeAurasWithInterruptFlags('player', AURA_INTERRUPT.MOUNTING, 'mounting');
      }

      const pct = item.mountSpeedPct;
      log(`You mount ${item.name}${pct != null ? ` (+${pct}% travel speed)` : ''}.`);
      onOutfitterSync?.();
      return { ok: true };
    },

    dismount() {
      const res = doDismount(state.char);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Not mounted' };
      state.char = res.char;
      log('You dismount.');
      onOutfitterSync?.();
      return { ok: true };
    },
  };
}
