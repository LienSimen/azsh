// The autopilot's between-fight planner: one pure decision per call. The UI driver executes
// the returned step (in real time, with real attacks — never auto-resolve) and calls back in.
// PURE: no DOM/RNG/Date — time is passed in via `progress.elapsedMs`.
//
// QI3 fully-autonomous quest loop (docs/archive/QUEST-INTERPRETER.md §5):
//   1. ACCEPT available in-zone quests
//   2. ADVANCE unmet objectives via the baked acquisition graph
//   3. DELIVER/talk when enderZones ∋ currentZone
//   4. TURN IN when questComplete
//   5. NEVER dead-stop — skip cleanly with an honest reason; travel to acquisition zone when known
//
// SESSION 5 (docs/archive/GO-QUEST-RUNSHEET.md): planner self-memory — latches failed steps through
// AutopilotProgress even when the driver forgets blockedObjects/blockedAccepts/blockedSpeaks;
// complete-but-not-turned-in always re-emits turnin/object; accept/advance-at-GO routes via
// zone.objects + acquisitionZonesForQuest; named honest-skip taxonomy (never false "Quest complete!").

import type { DataStore } from '../data/dataStore.ts';
import type { GameState } from '../engine/game.ts';
import { powerType, combatantCreatureType } from '../domain/character/character.ts';
import { knows } from '../domain/character/spellbook.ts';
import { isPlayerAlive } from '../domain/run/death.ts';
import { CREATURE_TYPE } from '../data/schema.ts';
import {
  getQuest,
  activeQuestCount,
  MAX_QUEST_SLOTS,
  itemsMet,
  itemStartGateMet,
  questComplete,
  isEventTalkQuest,
  isTalkToNpcQuest,
  hasGoEnder,
  goEnderEntryOf,
  isDeliverQuest,
  talkMet,
} from '../domain/quests/questlog.ts';
import { countItem } from '../domain/items/inventory.ts';
import { huntableCreatures } from '../world/world.ts';
import {
  huntableQuests,
  questsWithWork,
  questWorkSkipReason,
  lootChanceForItem,
  acquisitionZonesForQuest,
  offeredQuests,
  prereqMet,
  dropperNoiseFloorFor,
  compareQuestDroppers,
} from '../quests/quests.ts';
import { ownedInventory } from '../domain/items/keyring.ts';
import { mailboxAsInventory } from '../domain/economy/mail.ts';
import { UNSUPPORTED_GO_TYPES } from '../domain/world/gameObjects.ts';
import {
  corpseUseFarmEntries,
  corpseUseSummonedEntries,
  corpseUseWorkRemaining,
  itemIsQuestCorpseUse,
  pendingCorpseUseItem,
} from '../domain/quests/questCorpseUse.ts';
import { pendingScriptItemUse } from '../domain/quests/questScriptItemUse.ts';
import {
  canOpenLock,
  requiredKeyItemEntry,
} from '../domain/world/openLock.ts';
import {
  nextDoQuestStep, questHasDoableStep, questVendorBuyStep, itemGoStep, questLockKeyFightTarget,
  questLockKeyObjectStep,
} from '../domain/quests/doQuest.ts';
import {
  buildView, bestHuntTarget, nextAutoGatherNode, partyCanHarvestNode, type BotView,
} from './view.ts';
import { bestConsumable, type ConsumeEffect } from './consumables.ts';
import { questAcceptGate, questRunGate, zoneSwapGate } from './questPolicy.ts';
import { auraIdsForSnapshot } from '../engine/spells/conditions.ts';
import type { AutopilotConfig } from './config.ts';

function lootAuras(state: GameState): number[] {
  return auraIdsForSnapshot(state.char.activeAuras);
}

/** Bags + keyring + overflow mail. Auto Quest must see mailed quest items as owned. */
function ownedOf(state: GameState) {
  return ownedInventory(state.inventory, state.keyring, mailboxAsInventory(state.mailbox ?? []));
}

/**
 * What the autopilot is doing. `farm` with a `creatureEntry` grinds that exact mob the player
 * picked; `farm` without one auto-picks the safest rewarding target. `quest` runs the full
 * accept → advance → deliver → turn-in loop (QI3); `entry` is an optional UI seed (world
 * Auto Quest). `pin` is set by quest-log Do Quest: that entry only — if it cannot
 * move, stop (never fall through to the Auto Quest campaign).
 */
export type AutopilotMode =
  | { kind: 'farm'; creatureEntry?: number }
  /** `handInByHand`: stop as soon as the pinned quest is payable and leave the turn-in to the
   *  player, so the quest page they launched from reopens on its hand-in step. */
  | { kind: 'quest'; entry?: number; pin?: boolean; handInByHand?: boolean };

export type { AutopilotConfig } from './config.ts';
export { DEFAULT_AUTOPILOT_CONFIG, normalizeAutopilotConfig } from './config.ts';

/**
 * Named skip taxonomy for the GO-quest class (SESSION 5). These tokens surface in
 * stop `detail` / autopilot log verbatim — never a false "Quest complete!".
 * Cite: docs/archive/GO-QUEST-RUNSHEET.md SESSION 5 honest skip taxonomy.
 */
export const GO_CLASS_SKIP = {
  LOCKED_NO_KEY: 'locked-no-key',
  ALL_INSTANCES_CONSUMED: 'all-instances-consumed',
  ENDER_NOT_IN_WORLD: 'ender-not-in-world',
  PREREQ_UNMET: 'prereq-unmet',
  UNSUPPORTED_TYPE: 'unsupported-type-dispositioned',
} as const;

/** Orchestration state the driver owns and threads back in (keeps the planner pure). */
export interface AutopilotProgress {
  elapsedMs: number;
  recovering: boolean;        // hysteresis latch: once recovering, keep going until recoverTo
  consecutiveDefeats: number;
  /**
   * Quest entries whose engine accept FAILED this session. The view's acceptable list should
   * already mirror every engine gate, but if any gate is ever missed again the planner must
   * degrade to "skip this quest" — re-proposing the same refused accept every tick deadlocks
   * the whole quest loop (Cortello's Riddle item-start gate did exactly that).
   */
  blockedAccepts?: ReadonlySet<number>;
  /**
   * CQ6: quest entries whose speak step ran but did NOT credit the talk objective (name
   * mismatch / scripted gate). Same degrade-to-skip contract as blockedAccepts — the
   * planner must never re-propose a speak that provably does nothing.
   */
  blockedSpeaks?: ReadonlySet<number>;
  /**
   * GameObject entries whose interact failed this session (missing def, locked without
   * key, permanently despawned, unsupported type). Same degrade-to-skip contract — without
   * this the planner re-proposes the same object step every 400ms and soft-locks Auto Quest
   * on "Interacting with object…" / stuck objective progress.
   */
  blockedObjects?: ReadonlySet<number>;
  // SESSION 5 self-memory: quest entries whose turn-in step produced no state change (engine refused /
  // driver no-op). Filtered out of turnInCandidates so we never spin.
  blockedTurnins?: ReadonlySet<number>;
  /** Item entries whose use step produced no state change this session. */
  blockedUses?: ReadonlySet<number>;
  /** Creature entries whose fight step produced no state change this session. */
  blockedFights?: ReadonlySet<number>;
  /** Zone ids whose travel step produced no state change this session. */
  blockedTravels?: ReadonlySet<string>;
  /**
   * Quest entries Auto Quest skips for the rest of the session after too many deaths while
   * advancing them (default 3 — {@link AutopilotConfig.maxConsecutiveDefeats}). Turn-in of a
   * completed quest is still allowed; only accept/advance/travel/speak for the entry stops.
   */
  blockedQuests?: ReadonlySet<number>;
  /** Defeat counts while fighting for a given quest entry this session (driver-owned). */
  questDefeats?: ReadonlyMap<number, number>;
  /** Wall-clock for gather node respawn. Driver-owned; 0 treats depleted nodes as not ready. */
  nowMs?: number;
  /**
   * SESSION 5: last step planStep proposed + quest-relevant state fingerprint at proposal
   * time. On the next call, if the fingerprint is unchanged the proposal produced no state
   * change and is latched into the matching blocked* set with an honest reason — even when
   * the driver forgets to populate blockedObjects/blockedAccepts/blockedSpeaks.
   * Pure-function shape: no globals; all memory lives on this threaded object.
   */
  lastProposal?: AutopilotStep;
  lastStateKey?: string;
  /** Most recent self-latch / honest-skip reason (for log surface). */
  lastSkipReason?: string;
  /**
   * Latched once an elite quest was refused for an empty squad (questPolicy code
   * 'elite-needs-squad'). The driver reads it to prompt the hire once; never cleared here, so a
   * refusal early in the pass survives the rest of it.
   */
  eliteNeedsSquad?: boolean;
}

export type StopReason =
  | 'timeUp'
  | 'questComplete'
  | 'noTargets'
  | 'defeated'
  | 'outOfConsumables'
  | 'levelCap'
  /** Multi-choice reward pause ended without a pick (questRewardChoice: wait + Stop). */
  | 'rewardChoice';

export type AutopilotStep =
  | { kind: 'fight'; creatureEntry: number; forQuest: boolean; questEntry?: number }
  | { kind: 'consume'; itemEntry: number; effect: ConsumeEffect }
  | { kind: 'cannibalize' } // Forsaken free heal off a fresh Humanoid/Undead corpse (preferred over food)
  | { kind: 'wait' }
  | { kind: 'turnin'; questEntry: number }   // hand in a completed quest (closes the auto-quest loop)
  | { kind: 'accept'; questEntry: number }   // accept an offered quest here (for kill/item quests etc)
  | { kind: 'object'; objectEntry: number; forQuest?: boolean; questEntry?: number } // pickup / open / use a GameObject for quest objective; also used for accept/turn-in at GO givers
  | { kind: 'use'; itemEntry: number; targetCreatureEntry?: number; questEntry?: number } // use a provided/source item for a tracked objective (Lane H)
  /** CQ6: speak to the quest ender (name-based talk credit) — the manual "Speak to {ender}"
   * button's autopilot twin. Emitted only when standing in the ender zone (or the quest has
   * no baked enderZones), so talk quests never soft-lock an auto run. */
  | { kind: 'speak'; questEntry: number; npcName: string }
  /** QI3: journey to an acquisition / ender zone so work can continue (never silent dead-stop). */
  | { kind: 'travel'; zoneId: string; reason: string; questEntry?: number }
  /** Wear a bagged item the current farm needs (Argent Dawn Commission for type 10 loot). */
  | { kind: 'equip'; itemEntry: number; questEntry?: number }
  /** FO6 finishEscort: escort / empty explore / mixed event bit when that is the remaining work. */
  | { kind: 'event'; questEntry: number }
  /** Ready mine/herb node in this zone (party skill + tool). Not latchable — respawn re-opens it. */
  | { kind: 'gather'; nodeId: number }
  /** The skinnable corpse the fight left standing. skin() is the manual click, so the take-list
   * never speaks here: a companion skinner reading gray still gets its hide on an auto run. */
  | { kind: 'skin' }
  /** Buy a quest material from a zone merchant (beer, reagents). Driver calls game.buyItem. */
  | { kind: 'buy'; vendorEntry: number; itemEntry: number; count: number; questEntry?: number }
  | { kind: 'stop'; reason: StopReason; detail?: string };

// ---- SESSION 5 helpers (self-memory, zone presence, skip taxonomy) --------

/**
 * True if this step kind can soft-lock when re-proposed after a no-op.
 *
 * Fight is intentionally excluded. Fights are async (live combat between planStep calls);
 * SESSION 5 fingerprint latch was built for sync GO/accept/turnin/use steps that re-plan in
 * the same tick. Fingerprint-latching fights false-blocked every grind target in a zone
 * ("fight vs creature N produced no state change") whenever a pull left zone/level/health/
 * questlog/inventory unchanged (grey XP-only, empty loot, abandon, or re-plan before resolve).
 * The driver owns beginFight refusals via blockedFights — same contract as blockedAccepts.
 */
function isLatchableStep(step: AutopilotStep): boolean {
  return (
    step.kind === 'object' ||
    step.kind === 'accept' ||
    step.kind === 'speak' ||
    step.kind === 'turnin' ||
    step.kind === 'use' ||
    step.kind === 'equip' ||
    step.kind === 'travel' ||
    step.kind === 'event' ||
    step.kind === 'buy'
  );
}

function stepsEqual(a: AutopilotStep, b: AutopilotStep): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Quest-relevant state fingerprint. Changes when a successful step would mutate progress
 * (zone, log, inventory, health, XP, gold). Used to detect "proposal produced no state change".
 * XP/gold included so grind progress is visible even when HP/inv/questlog are unchanged.
 */
function planStateKey(state: GameState): string {
  const ql = state.questlog.quests
    .map((q) => {
      const kills = JSON.stringify(q.kills ?? {});
      const objects = JSON.stringify(q.objects ?? {});
      const spells = JSON.stringify((q as { spells?: Record<string, number> }).spells ?? {});
      return `${q.entry}:${q.status}:${q.talked === true ? 1 : 0}:${q.explored === true ? 1 : 0}:${kills}:${objects}:${spells}`;
    })
    .join('|');
  const inv = [...ownedOf(state).stacks]
    .map((s) => `${s.item}:${s.count}`)
    .sort()
    .join(',');
  const nodes = Object.keys(state.nodeState ?? {})
    .sort()
    .map((k) => {
      const s = state.nodeState[k];
      return `${k}:${s.charges}:${s.readyAt}`;
    })
    .join(',');
  return `${state.char.zoneId}|L${state.char.level}|H${state.char.health}|X${state.char.xp}|G${state.char.gold}|${ql}|${inv}|N${nodes}`;
}

function mutableNumSet(
  prog: AutopilotProgress,
  field:
    | 'blockedAccepts'
    | 'blockedSpeaks'
    | 'blockedObjects'
    | 'blockedTurnins'
    | 'blockedUses'
    | 'blockedFights'
    | 'blockedQuests',
): Set<number> {
  const cur = prog[field];
  if (cur instanceof Set) return cur;
  const s = new Set<number>(cur ?? []);
  prog[field] = s;
  return s;
}

function questIsDeathSkipped(prog: AutopilotProgress, entry: number): boolean {
  return prog.blockedQuests?.has(entry) === true;
}

/** Hired companions who would join a pull (Auto Quest setup elite policy reads this). */
function squadSize(state: GameState): number {
  return (state.squad ?? []).length;
}

/**
 * Every reason the quest run leaves an ACTIVE quest alone this step: the per-quest death cap,
 * plus the Auto Quest setup policy (elite handling). Turn-in of a completed quest is never
 * gated by this — a finished quest is always worth handing in.
 */
function questIsSkipped(
  state: GameState,
  ds: DataStore,
  cfg: AutopilotConfig,
  prog: AutopilotProgress,
  entry: number,
): boolean {
  if (questIsDeathSkipped(prog, entry)) return true;
  const def = ds.quest(entry);
  if (!def) return false;
  const gate = questRunGate(ds, def, cfg, squadSize(state), state.char.level, state.questlog);
  if (gate.ok) return false;
  prog.lastSkipReason = gate.reason;
  if (gate.code === 'elite-needs-squad') prog.eliteNeedsSquad = true;
  return true;
}

/** True when `entry` is huntable or spawned in the zone Auto Quest is standing in. */
function creatureIsLocal(ds: DataStore, state: GameState, entry: number): boolean {
  const z = ds.zone(state.char.zoneId);
  if (z?.huntable?.includes(entry)) return true;
  if ((z?.spawns ?? []).some((s) => s.entry === entry)) return true;
  return huntableCreatures(ds, state.char.zoneId, state.questlog, state.char.race)
    .some((c) => c.entry === entry);
}

// A campaign step Do Quest would take for an in-log entry, if Auto Quest can run it here (local fight / use
// / object / speak) or travel to it under zone-swap policy.
function campaignMoveStep(
  state: GameState,
  ds: DataStore,
  cfg: AutopilotConfig,
  prog: AutopilotProgress,
  entry: number,
): AutopilotStep | null {
  const step = pinnedQuestStep(state, ds, cfg, prog, entry);
  if (!step || step.kind === 'stop' || step.kind === 'accept') return null;
  if (step.kind === 'fight' && !creatureIsLocal(ds, state, step.creatureEntry)) return null;
  if (step.kind === 'travel' && !travelAllowed(state, ds, cfg, prog, step.zoneId)) return null;
  return step;
}

/** Park log quests with no remaining fight/use/object/speak/travel (Warsong marks). */
function parkUnfinishableQuests(
  state: GameState,
  ds: DataStore,
  cfg: AutopilotConfig,
  prog: AutopilotProgress,
  skipEntry?: number,
): void {
  const inv = ownedOf(state);
  const zoneId = state.char.zoneId;
  for (const qs of state.questlog.quests) {
    if (qs.status !== 'active') continue;
    if (skipEntry != null && qs.entry === skipEntry) continue;
    if (prog.blockedQuests?.has(qs.entry)) continue;
    const def = ds.quest(qs.entry);
    if (!def) continue;
    if (questComplete(def, qs, inv)) continue;
    if (campaignMoveStep(state, ds, cfg, prog, qs.entry)) continue;
    const skip = questWorkSkipReason(ds, def, qs, inv, zoneId, state.questlog, state.char.level, lootAuras(state));
    if (
      skip.routeZone &&
      skip.routeZone !== zoneId &&
      !prog.blockedTravels?.has(skip.routeZone) &&
      travelAllowed(state, ds, cfg, prog, skip.routeZone)
    ) {
      continue;
    }
    // No move and no usable travel: a skip naming this same zone (or nowhere) has no route left, so
    // park it and keep the rest of the log rather than ending the run. Cite: quest 5561.
    if (!skip.noPath && skip.routeZone != null && skip.routeZone !== zoneId) continue;
    mutableNumSet(prog, 'blockedQuests').add(qs.entry);
    prog.lastSkipReason = skip.reason;
  }
}

// Quest-log Do Quest pin. World Auto Quest does not set `pin`, so this is a no-op there. Turn-in ends the
// pin; the player tapped this quest so level-band does not drop it.
function launchFocus(
  state: GameState,
  ds: DataStore,
  mode: AutopilotMode,
  _cfg: AutopilotConfig,
  prog: AutopilotProgress,
  _acceptable: readonly number[],
): number | undefined {
  if (mode.kind !== 'quest' || mode.entry == null || !mode.pin) return undefined;
  const entry = mode.entry;
  if (questIsDeathSkipped(prog, entry)) return undefined;
  const qs = getQuest(state.questlog, entry);
  if (qs?.status === 'turnedIn') return undefined;
  if (!ds.quest(entry)) return undefined;
  return entry;
}

/** Map nextDoQuestStep onto an AutopilotStep so Do Quest uses this same UI. */
function pinnedQuestStep(
  state: GameState,
  ds: DataStore,
  cfg: AutopilotConfig,
  prog: AutopilotProgress,
  focus: number,
): AutopilotStep | null {
  const def = ds.quest(focus);
  if (!def) return { kind: 'stop', reason: 'noTargets', detail: 'Unknown quest' };
  const dq = nextDoQuestStep(state, ds, focus, {
    skipObjects: prog.blockedObjects,
    skipCreatures: prog.blockedFights,
  });
  if (dq.kind === 'done') return null;
  if (dq.kind === 'blocked') return { kind: 'stop', reason: 'noTargets', detail: dq.reason };
  if (dq.kind === 'accept') {
    if (prog.blockedAccepts?.has(focus)) {
      return { kind: 'stop', reason: 'noTargets', detail: `Cannot accept "${def.title}"` };
    }
    if (!questHasDoableStep(state, ds, focus)) {
      return { kind: 'stop', reason: 'noTargets', detail: `Cannot finish "${def.title}" on this data` };
    }
    return { kind: 'accept', questEntry: focus };
  }
  if (dq.kind === 'talk') {
    // A GO ender IS the talk objective — recordTalkToNpc refuses every hasGoEnder quest
    // (questlog.ts:1295), so open the object instead of speaking to a chest.
    const goEnder = goEnderEntryOf(def);
    if (goEnder != null) {
      if (prog.blockedObjects?.has(goEnder)) return null;
      const step = objectOrTravelStep(
        state,
        ds,
        goEnder,
        {
          forQuest: true,
          questEntry: focus,
          reasonHint: `Talk for "${def.title}" at ${ds.gameObject(goEnder)?.name ?? goEnder}`,
        },
        prog.blockedTravels,
        (z) => travelAllowed(state, ds, cfg, prog, z),
      );
      return step.kind === 'stop' ? null : step;
    }
    if (prog.blockedSpeaks?.has(focus)) return null;
    const npcName = isEventTalkQuest(def)
      ? eventTalkAutopilotNpcName(def)
      : ((def.enderName ?? '').trim() || (def.starterName ?? '').trim());
    if (!npcName) return null;
    return { kind: 'speak', questEntry: focus, npcName };
  }
  if (dq.kind === 'object') {
    return { kind: 'object', objectEntry: dq.objectEntry, forQuest: true, questEntry: focus };
  }
  if (dq.kind === 'use') {
    return { kind: 'use', itemEntry: dq.itemEntry, targetCreatureEntry: dq.targetCreatureEntry, questEntry: focus };
  }
  if (dq.kind === 'equip') {
    if (prog.blockedUses?.has(dq.itemEntry)) {
      const nm = ds.item(dq.itemEntry)?.name ?? `item ${dq.itemEntry}`;
      return { kind: 'stop', reason: 'noTargets', detail: `Cannot equip ${nm}` };
    }
    return { kind: 'equip', itemEntry: dq.itemEntry, questEntry: focus };
  }
  if (dq.kind === 'travel') {
    return { kind: 'travel', zoneId: dq.zoneId, reason: dq.reason, questEntry: focus };
  }
  if (dq.kind === 'turnin' || dq.kind === 'pick-reward') {
    return turnInStepFor(state, ds, cfg, focus, prog);
  }
  if (dq.kind === 'fight') {
    if (prog.blockedFights?.has(dq.creatureEntry)) return null;
    return { kind: 'fight', creatureEntry: dq.creatureEntry, forQuest: true, questEntry: focus };
  }
  if (dq.kind === 'grant-src') {
    return { kind: 'stop', reason: 'noTargets', detail: `Need the source item for "${def.title}"` };
  }
  if (dq.kind === 'buy') {
    if (prog.blockedUses?.has(dq.itemEntry)) {
      const nm = ds.item(dq.itemEntry)?.name ?? `item ${dq.itemEntry}`;
      return { kind: 'stop', reason: 'noTargets', detail: `Cannot buy ${nm}` };
    }
    return {
      kind: 'buy',
      vendorEntry: dq.vendorEntry,
      itemEntry: dq.itemEntry,
      count: dq.count,
      questEntry: focus,
    };
  }
  if (dq.kind === 'escort') {
    return { kind: 'event', questEntry: focus };
  }
  if (dq.kind === 'garments') {
    return { kind: 'stop', reason: 'noTargets', detail: `"${def.title}" needs a spell on the patient` };
  }
  return null;
}

function questWantsObject(ds: DataStore, questEntry: number, objectEntry: number): boolean {
  const def = ds.quest(questEntry);
  return !!def && (def.objectTargets ?? []).some((ot) => ot.objectEntry === objectEntry);
}

/** Whether the run may route to `zoneId` under the setup's zone-swap policy. */
function travelAllowed(
  state: GameState,
  ds: DataStore,
  cfg: AutopilotConfig,
  prog: AutopilotProgress,
  zoneId: string,
): boolean {
  const gate = zoneSwapGate(ds, zoneId, state.char.level, cfg);
  if (gate.ok) return true;
  prog.lastSkipReason = gate.reason;
  return false;
}

/**
 * Record a defeat while advancing `questEntry`. At {@link AutopilotConfig.maxConsecutiveDefeats}
 * (default 3) the quest is session-skipped and consecutiveDefeats is cleared so Auto Quest
 * continues with the next quest instead of stopping the whole run.
 * Returns true when the quest was just blocked (caller should surface a feed line).
 */
export function noteQuestDefeat(
  prog: AutopilotProgress,
  questEntry: number,
  maxDefeats: number,
): boolean {
  const map = prog.questDefeats instanceof Map
    ? prog.questDefeats as Map<number, number>
    : new Map<number, number>(prog.questDefeats ?? []);
  prog.questDefeats = map;
  const n = (map.get(questEntry) ?? 0) + 1;
  map.set(questEntry, n);
  const cap = Math.max(1, maxDefeats | 0);
  if (n < cap) {
    prog.consecutiveDefeats++;
    prog.recovering = true;
    return false;
  }
  mutableNumSet(prog, 'blockedQuests').add(questEntry);
  prog.consecutiveDefeats = 0;
  prog.recovering = true;
  prog.lastSkipReason = `skipped quest ${questEntry} after ${n} defeats`;
  return true;
}

function mutableStrSet(prog: AutopilotProgress, field: 'blockedTravels'): Set<string> {
  const cur = prog[field];
  if (cur instanceof Set) return cur;
  const s = new Set<string>(cur ?? []);
  prog[field] = s;
  return s;
}

/** Baked zones that list `entry` on zone.objects (SESSION 1 visibility). */
function zonesListingObject(ds: DataStore, entry: number): string[] {
  const out: string[] = [];
  for (const z of ds.zones()) {
    if ((z.objects ?? []).includes(entry)) out.push(z.id);
  }
  return out;
}

function objectPresentInZone(ds: DataStore, zoneId: string, entry: number): boolean {
  const z = ds.zone(zoneId);
  if (!z) return false;
  return (z.objects ?? []).includes(entry);
}

function isUnsupportedGoType(type: number): boolean {
  return UNSUPPORTED_GO_TYPES.some((t) => t.type === type);
}

// Classify why a latchable step produced no progress — named taxonomy tokens when known. Cite:
// docs/archive/GO-QUEST-RUNSHEET.md SESSION 5; GameObject Use / openLock / zone.objects.
function classifyFailedStep(step: AutopilotStep, state: GameState, ds: DataStore): string {
  if (step.kind === 'object') {
    const go = ds.gameObject(step.objectEntry);
    if (!go) {
      return `${GO_CLASS_SKIP.ENDER_NOT_IN_WORLD}: Object#${step.objectEntry} has no baked template`;
    }
    if (isUnsupportedGoType(go.type)) {
      return `${GO_CLASS_SKIP.UNSUPPORTED_TYPE}: ${go.name} (type ${go.type})`;
    }
    if (!objectPresentInZone(ds, state.char.zoneId, step.objectEntry)) {
      const elsewhere = zonesListingObject(ds, step.objectEntry);
      if (elsewhere.length === 0) {
        return `${GO_CLASS_SKIP.ENDER_NOT_IN_WORLD}: ${go.name} is not on any baked zone.objects list`;
      }
      return `${go.name} is not in this zone (lives in ${elsewhere.map((z) => ds.zone(z)?.name ?? z).join(' / ')})`;
    }
    if (go.lockId || go.keyId) {
      const lock = go.lockId != null ? ds.lock(go.lockId) : undefined;
      const keyEntry = go.keyId ?? requiredKeyItemEntry(lock);
      // A quest key sits in the KEYRING, not the bags: reading state.inventory classified the
      // Defias Tower Key as missing at 1/1 and latched the door into blockedObjects.
      const hasKey = keyEntry != null && countItem(ownedOf(state), keyEntry) >= 1;
      if (keyEntry != null && !hasKey) {
        const keyName = ds.item(keyEntry)?.name ?? `item ${keyEntry}`;
        return `${GO_CLASS_SKIP.LOCKED_NO_KEY}: ${go.name} needs ${keyName}`;
      }
      const openFree = canOpenLock({
        lock,
        keyItemEntry: hasKey ? keyEntry : undefined,
        skillValueFor: () => undefined,
      });
      if (!openFree.ok) {
        return `${GO_CLASS_SKIP.LOCKED_NO_KEY}: ${go.name} (${openFree.reason ?? 'locked'})`;
      }
    }
    // Consumable multi-spawn exhaustion surfaces this way after interact leaves state unchanged.
    return `${GO_CLASS_SKIP.ALL_INSTANCES_CONSUMED}: ${go.name} interact produced no progress`;
  }
  if (step.kind === 'accept') {
    const def = ds.quest(step.questEntry);
    if (def && !prereqMet(ds, def, state.questlog)) {
      return `${GO_CLASS_SKIP.PREREQ_UNMET}: cannot accept "${def.title}"`;
    }
    return `accept of ${def?.title ?? step.questEntry} produced no state change`;
  }
  if (step.kind === 'speak') {
    return `speak to ${step.npcName} for quest ${step.questEntry} produced no talk credit`;
  }
  if (step.kind === 'turnin') {
    const def = ds.quest(step.questEntry);
    if (def?.goEnder && def.goEnder > 0) {
      const zones = zonesListingObject(ds, def.goEnder);
      if (zones.length === 0) {
        return `${GO_CLASS_SKIP.ENDER_NOT_IN_WORLD}: "${def.title}" goEnder ${def.goEnder} not in world`;
      }
    }
    return `turn-in of "${def?.title ?? step.questEntry}" produced no state change`;
  }
  if (step.kind === 'use') {
    return `use of item ${step.itemEntry} produced no state change`;
  }
  if (step.kind === 'equip') {
    return `equip of item ${step.itemEntry} produced no state change`;
  }
  if (step.kind === 'buy') {
    const it = ds.item(step.itemEntry);
    return `buy of ${it?.name ?? step.itemEntry} produced no state change`;
  }
  if (step.kind === 'fight') {
    return `fight vs creature ${step.creatureEntry} produced no state change`;
  }
  if (step.kind === 'travel') {
    return step.reason;
  }
  if (step.kind === 'event') {
    const def = ds.quest(step.questEntry);
    return `event credit of "${def?.title ?? step.questEntry}" produced no state change`;
  }
  return 'step produced no state change';
}

/** Latch a no-op proposal into the matching blocked* set (SESSION 5 self-memory). */
function latchFailedStep(prog: AutopilotProgress, step: AutopilotStep, reason: string): void {
  prog.lastSkipReason = reason;
  if (step.kind === 'object') mutableNumSet(prog, 'blockedObjects').add(step.objectEntry);
  else if (step.kind === 'accept') mutableNumSet(prog, 'blockedAccepts').add(step.questEntry);
  else if (step.kind === 'speak') mutableNumSet(prog, 'blockedSpeaks').add(step.questEntry);
  else if (step.kind === 'turnin') mutableNumSet(prog, 'blockedTurnins').add(step.questEntry);
  else if (step.kind === 'use') mutableNumSet(prog, 'blockedUses').add(step.itemEntry);
  else if (step.kind === 'equip') mutableNumSet(prog, 'blockedUses').add(step.itemEntry);
  else if (step.kind === 'buy') mutableNumSet(prog, 'blockedUses').add(step.itemEntry);
  else if (step.kind === 'fight') mutableNumSet(prog, 'blockedFights').add(step.creatureEntry);
  else if (step.kind === 'travel') mutableStrSet(prog, 'blockedTravels').add(step.zoneId);
  else if (step.kind === 'event') mutableNumSet(prog, 'blockedQuests').add(step.questEntry);
}

function markProposal(prog: AutopilotProgress, step: AutopilotStep, stateKey: string): void {
  if (step.kind === 'stop' || step.kind === 'wait' || step.kind === 'consume' || step.kind === 'cannibalize') {
    // Recovery / terminal steps are not soft-lock proposals.
    prog.lastProposal = step.kind === 'stop' ? undefined : step;
    prog.lastStateKey = step.kind === 'stop' ? undefined : stateKey;
    return;
  }
  prog.lastProposal = step;
  prog.lastStateKey = stateKey;
}

/** Prefer a GO that is present in the current zone; else travel with the real zone named. */
function objectOrTravelStep(
  state: GameState,
  ds: DataStore,
  objectEntry: number,
  opts: { forQuest?: boolean; questEntry?: number; reasonHint?: string },
  blockedTravels?: ReadonlySet<string>,
  /** Zone-swap policy filter (Auto Quest setup); absent = every unblocked zone is routeable. */
  zoneAllowed?: (zoneId: string) => boolean,
): AutopilotStep {
  if (objectPresentInZone(ds, state.char.zoneId, objectEntry)) {
    return {
      kind: 'object',
      objectEntry,
      forQuest: opts.forQuest,
      questEntry: opts.questEntry,
    };
  }
  const zones = zonesListingObject(ds, objectEntry);
  const route = zones.find((z) =>
    z !== state.char.zoneId && !blockedTravels?.has(z) && (zoneAllowed ? zoneAllowed(z) : true));
  const go = ds.gameObject(objectEntry);
  const name = go?.name ?? `Object#${objectEntry}`;
  if (route) {
    const zname = ds.zone(route)?.name ?? route;
    const reason =
      opts.reasonHint ??
      (opts.questEntry != null
        ? `"${ds.quest(opts.questEntry)?.title ?? opts.questEntry}" needs ${name} in ${zname}`
        : `${name} is in ${zname}`);
    return { kind: 'travel', zoneId: route, reason, questEntry: opts.questEntry };
  }
  if (zones.length === 0) {
    // No baked zone lists this GO — honest skip token (caller may degrade further).
    return {
      kind: 'stop',
      reason: 'noTargets',
      detail: `${GO_CLASS_SKIP.ENDER_NOT_IN_WORLD}: ${name} is not on any baked zone.objects list`,
    };
  }
  // Only routes are blocked — surface that.
  return {
    kind: 'stop',
    reason: 'noTargets',
    detail: `${name} lives in ${zones.map((z) => ds.zone(z)?.name ?? z).join(' / ')} but those routes are blocked this session`,
  };
}

/** True if the Forsaken can devour the last kill's corpse right now (undead + learned + edible corpse). */
function canCannibalize(state: GameState): boolean {
  const type = state.lastCorpse?.creatureType;
  return combatantCreatureType(state.char) === CREATURE_TYPE.UNDEAD
    && knows(state.spellbook, 20577)
    && (type === CREATURE_TYPE.HUMANOID || type === CREATURE_TYPE.UNDEAD);
}

interface RecoverNeed { health: boolean; mana: boolean; petPower: boolean }

/** Recovery need with hysteresis: enter below the threshold, keep going until recoverTo. */
function recoverNeed(
  view: BotView,
  cfg: AutopilotConfig,
  prog: AutopilotProgress,
  isManaUser: boolean,
): RecoverNeed {
  const below = (pct: number, enterPct: number): boolean =>
    pct < enterPct || (prog.recovering && pct < cfg.recoverToPct);
  return {
    health: below(view.healthPct, cfg.healthEnterPct),
    mana: isManaUser && below(view.powerPct, cfg.manaEnterPct),
    // 1 for an absent/dead/powerless pet, so a pet never gates on what rest cannot fix.
    petPower: below(view.petPowerPct, cfg.manaEnterPct),
  };
}

/** Cannibalize, food, drink, then sit; null when nothing here refills (eat-only, empty bags). */
function recoverStep(
  state: GameState,
  ds: DataStore,
  cfg: AutopilotConfig,
  need: RecoverNeed,
): AutopilotStep | null {
  // A Forsaken devours a fresh corpse first - free health, no consumable spent.
  if (need.health && canCannibalize(state)) return { kind: 'cannibalize' };
  if (need.health && cfg.autoEat) {
    const food = bestConsumable(state.char, state.inventory, ds, 'food');
    if (food) return { kind: 'consume', itemEntry: food.itemEntry, effect: 'food' };
  }
  if (need.mana && cfg.autoDrink) {
    const drink = bestConsumable(state.char, state.inventory, ds, 'drink');
    if (drink) return { kind: 'consume', itemEntry: drink.itemEntry, effect: 'drink' };
  }
  return cfg.restMode === 'eat-then-wait' ? { kind: 'wait' } : null;
}

/** Nothing left here: the next zone offering quests this run would accept, nearest band first.
 *  Same count the map badge shows (world.ts:766 availableQuestCount, mapPanel.ts:74). */
function questPickupTravelStep(
  state: GameState,
  ds: DataStore,
  cfg: AutopilotConfig,
  prog: AutopilotProgress,
): AutopilotStep | null {
  if (!cfg.questAutoAccept || cfg.questZoneSwap === 'off') return null;
  if (activeQuestCount(state.questlog) >= MAX_QUEST_SLOTS) return null;
  const here = state.char.zoneId;
  const level = state.char.level;
  const inv = ownedOf(state);
  const neighbours = new Set(ds.zone(here)?.neighbors ?? []);
  // Cheap pass over every zone first: canAccept offers only. The full accept gate below walks the
  // dropper index per quest, so it runs on the shortlist in order and stops at the first hit.
  const shortlist: { zoneId: string; offers: ReturnType<typeof offeredQuests>; band: number; near: number }[] = [];
  for (const z of ds.zones()) {
    if (z.id === here || prog.blockedTravels?.has(z.id)) continue;
    if (!zoneSwapGate(ds, z.id, level, cfg).ok) continue;
    const offers = offeredQuests(ds, z.id, state.char, state.questlog)
      .filter((o) => o.canAccept && itemStartGateMet(o.quest, inv)
        && !prog.blockedAccepts?.has(o.quest.entry));
    if (offers.length === 0) continue;
    const [lo, hi] = z.levelRange;
    const band = level < lo ? lo - level : level > hi ? level - hi : 0;
    shortlist.push({ zoneId: z.id, offers, band, near: neighbours.has(z.id) ? 0 : 1 });
  }
  shortlist.sort((a, b) =>
    a.band - b.band || a.near - b.near || b.offers.length - a.offers.length
    || (a.zoneId < b.zoneId ? -1 : 1));
  const squad = squadSize(state);
  const auras = lootAuras(state);
  for (const cand of shortlist) {
    let take = 0;
    let first = '';
    for (const o of cand.offers) {
      const gate = questAcceptGate(ds, o.quest, level, cfg, squad, {
        log: state.questlog,
        inv,
        zoneId: cand.zoneId,
        auras,
      });
      if (!gate.ok) continue;
      if (!take) first = o.quest.title;
      take++;
    }
    if (take === 0) continue;
    const name = ds.zone(cand.zoneId)?.name ?? cand.zoneId;
    const more = take > 1 ? ` and ${take - 1} more quest${take > 2 ? 's' : ''}` : '';
    return {
      kind: 'travel',
      zoneId: cand.zoneId,
      reason: `Travel to ${name} for "${first}"${more}`,
    };
  }
  return null;
}

/**
 * Why a quest run ended once no work remains advanceable here.
 * Uses full questComplete (talk/deliver included) so talk-only quests never mis-report as complete.
 * QI3: never dead-stop on one unsolvable quest while another still has a route —
 * walk the work list, travel for the first routeable quest, only stop when none can move.
 * SESSION 5: if a complete-not-turned-in quest remains, re-emit turnin (never false questComplete).
 * Cite: docs/archive/QUEST-INTERPRETER.md §5 QI3 "honest skip" / "move to the next quest".
 */
function questRunReason(
  state: GameState,
  ds: DataStore,
  cfg: AutopilotConfig,
  prog: AutopilotProgress,
  onlyEntry?: number,
): AutopilotStep {
  // Complete-but-not-turned-in must never die as "Quest complete!" while still in the log.
  const stillReady = turnInCandidates(state, ds, prog);
  if (stillReady.length > 0) {
    const pick = onlyEntry != null && stillReady.includes(onlyEntry) ? onlyEntry
      : (onlyEntry == null ? stillReady[0] : undefined);
    if (pick != null) return turnInStepFor(state, ds, cfg, pick, prog);
  }

  const zoneId = state.char.zoneId;
  // Bags + keyring. The planner's lock gate reported "locked-no-key" forever for any key that
  // had migrated to the keyring, so auto-quest re-planned the same blocked step every tick.
  const inv = ownedOf(state);
  const withWork = questsWithWork(ds, state.questlog, inv, state.char.level)
    .filter((q) => !questIsSkipped(state, ds, cfg, prog, q.entry))
    .filter((q) => onlyEntry == null || q.entry === onlyEntry);
  if (withWork.length === 0) {
    // Pinned launch quest cannot move — caller falls through to the rest of the log.
    if (onlyEntry != null) {
      return { kind: 'stop', reason: 'noTargets', detail: 'launch quest has no route from here' };
    }
    // Out of work HERE is not out of work: the world still offers quests, so pick the next zone
    // that has some rather than ending the run on an empty local board.
    const restock = questPickupTravelStep(state, ds, cfg, prog);
    if (restock) return restock;
    // Nothing advanceable left. "All done" and "everything left is skipped" are different
    // endings — a skipped log must never report as a cleared one (QI3 honest skip).
    const leftover = questsWithWork(ds, state.questlog, inv, state.char.level);
    if (leftover.length > 0) {
      const names = leftover.slice(0, 3).map((q) => `"${q.title}"`).join(', ');
      const extra = leftover.length > 3 ? ` +${leftover.length - 3} more` : '';
      const full = activeQuestCount(state.questlog) >= MAX_QUEST_SLOTS
        ? ' Quest log is full. Abandon one to take something else.'
        : '';
      return {
        kind: 'stop',
        reason: 'noTargets',
        detail: (prog.lastSkipReason ?? `Skipped ${leftover.length} quest${leftover.length === 1 ? '' : 's'} still in the log (${names}${extra})`)
          + full,
      };
    }
    return { kind: 'stop', reason: 'questComplete' };
  }
  // First pass: any remaining quest with a known acquisition/ender zone → travel there.
  let firstHonest: string | undefined;
  const unfinishable: { entry: number; title: string; reason: string }[] = [];
  for (const q of withWork) {
    const qs = getQuest(state.questlog, q.entry);
    if (!qs) continue;
    const skip = questWorkSkipReason(ds, q, qs, inv, zoneId, state.questlog, state.char.level, lootAuras(state));
    if (!firstHonest) firstHonest = skip.reason;
    if (
      skip.routeZone && skip.routeZone !== zoneId && !prog.blockedTravels?.has(skip.routeZone)
      && travelAllowed(state, ds, cfg, prog, skip.routeZone)
    ) {
      return { kind: 'travel', zoneId: skip.routeZone, reason: skip.reason, questEntry: q.entry };
    }
    if (skip.noPath && !skip.routeZone) {
      unfinishable.push({ entry: q.entry, title: q.title, reason: skip.reason });
      continue;
    }
  }
  // Nothing routes. An objective with NO source in the bake (no dropper, no ender zone, no GO
  // template) never becomes doable by waiting or walking, so park those entries for the run the
  // same way the Skip button does — turn-in stays allowed, accept/advance/travel/speak stop.
  // Without this the planner re-picked the dead quest every tick and ended the run on it.
  if (unfinishable.length > 0) {
    const parked = mutableNumSet(prog, 'blockedQuests');
    for (const u of unfinishable) parked.add(u.entry);
  }
  // No route for any remaining quest. Everything in the log is parked or unreachable, so the run
  // still has somewhere to be: a zone with quests it can take.
  if (onlyEntry == null) {
    const restock = questPickupTravelStep(state, ds, cfg, prog);
    if (restock) return restock;
  }
  // No route and nothing to pick up — honest stop (real reason, not false "Quest complete!").
  const head = unfinishable.length > 0
    ? `${unfinishable[0].reason} - "${unfinishable[0].title}" cannot be finished on this data, `
      + `${unfinishable.length > 1 ? `${unfinishable.length} quests parked` : 'parked'} (abandon it to free the slot)`
    : (firstHonest ?? `"${withWork[0].title}" has remaining work but no baked acquisition path from here`);
  return {
    kind: 'stop',
    reason: 'noTargets',
    detail: head,
  };
}

// Complete quests ready to hand in (status complete OR live questComplete including talk). Lowest
// questLevel first. SESSION 5: excludes blockedTurnins.
function turnInCandidates(state: GameState, ds: DataStore, prog?: AutopilotProgress): number[] {
  const ready = new Set<number>();
  const owned = ownedOf(state);
  for (const qs of state.questlog.quests) {
    if (qs.status === 'turnedIn') continue;
    if (prog?.blockedTurnins?.has(qs.entry)) continue;
    if (qs.status === 'complete') {
      ready.add(qs.entry);
      continue;
    }
    const def = ds.quest(qs.entry);
    if (def && questComplete(def, qs, owned)) ready.add(qs.entry);
  }
  return [...ready]
    .map((e) => ({ entry: e, def: ds.quest(e) }))
    .filter((x): x is { entry: number; def: NonNullable<ReturnType<DataStore['quest']>> } => !!x.def)
    .sort((a, b) => a.def.questLevel - b.def.questLevel || a.entry - b.entry)
    .map((x) => x.entry);
}

/** Emit object (GO ender in zone) or turnin for a complete quest — every cycle until turned in. */
function turnInStepFor(
  state: GameState,
  ds: DataStore,
  cfg: AutopilotConfig,
  entry: number,
  prog: AutopilotProgress,
): AutopilotStep {
  const def = ds.quest(entry)!;
  const enders = def.enderZones ?? [];
  const inEnder = enders.length === 0 || enders.includes(state.char.zoneId);
  if (
    inEnder &&
    def.goEnder != null &&
    def.goEnder > 0 &&
    !prog.blockedObjects?.has(def.goEnder)
  ) {
    // Prefer GO ender interact when the object is visible here; else travel or plain turnin.
    if (objectPresentInZone(ds, state.char.zoneId, def.goEnder)) {
      return { kind: 'object', objectEntry: def.goEnder, questEntry: entry };
    }
    const zones = zonesListingObject(ds, def.goEnder);
    const route = zones.find((z) =>
      z !== state.char.zoneId && !prog.blockedTravels?.has(z)
      && travelAllowed(state, ds, cfg, prog, z));
    if (route) {
      const name = ds.gameObject(def.goEnder)?.name ?? `Object#${def.goEnder}`;
      return {
        kind: 'travel',
        zoneId: route,
        reason: `Turn in "${def.title}" at ${name} in ${ds.zone(route)?.name ?? route}`,
        questEntry: entry,
      };
    }
    // goEnder not in world (or all routes blocked) — engine turnIn still works without the GO.
    if (zones.length === 0) {
      // Keep advancing via turnin; surface taxonomy on the progress for the log.
      prog.lastSkipReason = `${GO_CLASS_SKIP.ENDER_NOT_IN_WORLD}: "${def.title}" goEnder not on any zone.objects`;
    }
  }
  return { kind: 'turnin', questEntry: entry };
}

/**
 * Same-zone deliver/talk: when enderZones ∋ currentZone and talk not yet credited, the engine
 * credits on zone enter (QI2.5). If still active but objectives (items) are met and we're in
 * the ender zone, prefer turn-in path after refresh — if still incomplete talk, surface object
 * ender interact when goEnder is baked, else re-check complete.
 * Cite: questlog.recordSameZoneTalkOrDeliver; docs/archive/QUEST-INTERPRETER.md §5.
 */
function deliverOrTalkStep(
  state: GameState,
  ds: DataStore,
  cfg: AutopilotConfig,
  prog: AutopilotProgress,
  focus?: number,
): AutopilotStep | null {
  const zoneId = state.char.zoneId;
  const blockedSpeaks = prog.blockedSpeaks;
  const owned = ownedOf(state);
  for (const qs of state.questlog.quests) {
    if (focus != null && qs.entry !== focus) continue;
    if (qs.status === 'turnedIn' || qs.status === 'complete') continue;
    if (questIsSkipped(state, ds, cfg, prog, qs.entry)) continue;
    const def = ds.quest(qs.entry);
    if (!def) continue;
    const enders = def.enderZones ?? [];
    if (enders.length > 0 && !enders.includes(zoneId)) continue;

    if (isTalkToNpcQuest(def) || isEventTalkQuest(def)) {
      if (isTalkToNpcQuest(def) && (talkMet(qs, def) || questComplete(def, qs, owned))) {
        // Ready — turn-in path handles it.
        continue;
      }
      if (isEventTalkQuest(def) && (qs.explored === true || questComplete(def, qs, owned))) {
        continue;
      }
      // In ender zone but talk not credited (e.g. accepted without zone re-enter), or the
      // quest has no baked enderZones at all (outer filter passes those through).
      // GO ender interact, else SPEAK for a quest with no GO — the driver calls game.talkToNpc
      // (name-based credit, same as the manual button). This closes the CQ6 soft-lock:
      // Training the Beast / priest racials / Tome quests stalled 'active' forever on AUTO.
      // Empty-SF2 gossip-event (KI-778/KI-788): same Speak step sets m_explored.
      const talkGo = goEnderEntryOf(def);
      if (talkGo != null && !prog.blockedObjects?.has(talkGo)) {
        const step = objectOrTravelStep(
          state,
          ds,
          talkGo,
          {
            forQuest: true,
            questEntry: qs.entry,
            reasonHint: `Talk for "${def.title}" at ${ds.gameObject(talkGo)?.name ?? talkGo}`,
          },
          prog.blockedTravels,
          (z) => travelAllowed(state, ds, cfg, prog, z),
        );
        if (step.kind === 'stop') {
          // Fall through to NPC speak when GO is unusable.
        } else {
          return step;
        }
      }
      // recordTalkToNpc refuses every hasGoEnder quest (questlog.ts:1295), so a name-based speak
      // at a chest or a brand can never credit — leave it to the skip reason.
      if (hasGoEnder(def)) continue;
      const npcName = isEventTalkQuest(def)
        ? eventTalkAutopilotNpcName(def)
        : ((def.enderName ?? '').trim() || (def.starterName ?? '').trim());
      if (npcName && !blockedSpeaks?.has(qs.entry)) return { kind: 'speak', questEntry: qs.entry, npcName };
      continue;
    }
    if (isDeliverQuest(def) && itemsMet(def, owned) && !talkMet(qs, def)) {
      const deliverGo = goEnderEntryOf(def);
      if (deliverGo != null && !prog.blockedObjects?.has(deliverGo)) {
        const step = objectOrTravelStep(
          state,
          ds,
          deliverGo,
          {
            forQuest: true,
            questEntry: qs.entry,
            reasonHint: `Deliver "${def.title}" at ${ds.gameObject(deliverGo)?.name ?? deliverGo}`,
          },
          prog.blockedTravels,
          (z) => travelAllowed(state, ds, cfg, prog, z),
        );
        if (step.kind !== 'stop') return step;
      }
    }
  }
  return null;
}

/** Mid-event gossip NPC for empty-SF2 listen/speak quests (KI-778 Great Bear Spirit). */
function eventTalkAutopilotNpcName(def: {
  objectivesText?: string;
  enderName?: string;
  starterName?: string;
}): string {
  const text = def.objectivesText ?? '';
  const listen = text.match(/\blisten as ([^.]+?) tells/i);
  if (listen?.[1]?.trim()) return listen[1].trim();
  const seek = text.match(/\bseek out the ([^.]+?) in /i);
  if (seek?.[1]?.trim()) return seek[1].trim();
  const speakAfter = text.match(/\bafter speaking with ([^.]+?)\.?$/i);
  if (speakAfter?.[1]?.trim()) return speakAfter[1].trim();
  return (def.enderName ?? '').trim() || (def.starterName ?? '').trim();
}

/** Core QI3 / farm decision (no self-memory). Called once, or again after latching a no-op. */
function planStepCore(
  state: GameState,
  ds: DataStore,
  mode: AutopilotMode,
  cfg: AutopilotConfig,
  prog: AutopilotProgress,
): AutopilotStep {
  // 1) Hard stops first: the session clock, the repeated-defeat guard, and the level cap
  // (checked between fights, so the level that crosses the cap still lands its full kill).
  // sessionMs <= 0 → no time cap (UI "no limit"). Cite: AutopilotConfig.sessionMs.
  if (cfg.sessionMs > 0 && prog.elapsedMs >= cfg.sessionMs) return { kind: 'stop', reason: 'timeUp' };
  // A dead or ghost character has no legal step: every engine verb refuses YOU_ARE_DEAD, and
  // `gather` is not latchable, so the driver re-proposed it every 200 ms forever.
  if (!isPlayerAlive(state.char.health, state.deathFlow)) {
    return {
      kind: 'stop',
      reason: 'defeated',
      detail: 'You are dead - reclaim your corpse or use the spirit healer to continue.',
    };
  }
  if (prog.consecutiveDefeats >= cfg.maxConsecutiveDefeats) return { kind: 'stop', reason: 'defeated' };
  if (cfg.stopAtLevel > 0 && state.char.level >= cfg.stopAtLevel) return { kind: 'stop', reason: 'levelCap' };

  // The corpse at your feet before anything else — nothing else in the run can reach it, and the
  // next fight clears the slot. Only when the group holds the skill AND the knife, so the driver
  // never re-proposes a step skin() refuses; a proposal that changed nothing is not repeated.
  if (cfg.autoGather && state.corpse != null) {
    const corpseNode = ds.gatherNode(state.corpse.node);
    const repeat = prog.lastProposal?.kind === 'skin' && prog.lastStateKey === planStateKey(state);
    if (corpseNode && !repeat && partyCanHarvestNode(state, ds, corpseNode)) return { kind: 'skin' };
  }

  // Ready mine/herb first — before accept, turn-in, rest, or a pull. Depleted nodes are
  // skipped; a later tick takes them again after respawn. Cite: view.ts nextAutoGatherNode.
  if (cfg.autoGather) {
    const skipId =
      prog.lastProposal?.kind === 'gather' && prog.lastStateKey === planStateKey(state)
        ? prog.lastProposal.nodeId
        : undefined;
    const nodeId = nextAutoGatherNode(state, ds, prog.nowMs ?? 0, skipId);
    if (nodeId != null) return { kind: 'gather', nodeId };
  }

  const view = buildView(state, ds);
  const isManaUser = powerType(state.char) === 'mana';

  // 2) Recover BEFORE the quest errands, not only before a pull: every quest step below returns
  // early, so a run at 8% health walked its turn-ins and accepts without ever eating (measured).
  const need = recoverNeed(view, cfg, prog, isManaUser);
  if (need.health || need.mana) {
    const recover = recoverStep(state, ds, cfg, need);
    // eat-only with nothing to eat: errands still run, and the pull gate below owns the stop.
    if (recover) return recover;
  }

  // For a quest run, resolve which quest to work RIGHT NOW: an on-level active quest that
  // still has a safe target (or dropper for pickup loot) huntable in this zone. Chaining
  // happens automatically. Empty list means accept more / travel / honest stop.
  let questFight: { creatureEntry: number; questEntry: number } | null = null;
  if (mode.kind === 'quest') {
    parkUnfinishableQuests(state, ds, cfg, prog, mode.pin ? mode.entry : undefined);
    // ---- QI3 policy: turn-in → deliver/talk → accept → advance → travel/honest-skip ----
    // Cite: docs/archive/QUEST-INTERPRETER.md §5 QI3.
    const focus = launchFocus(state, ds, mode, cfg, prog, view.acceptable);
    if (mode.pin && mode.entry != null) {
      const pinDef = ds.quest(mode.entry);
      const pinQs = getQuest(state.questlog, mode.entry);
      if (pinQs?.status === 'turnedIn') {
        return {
          kind: 'stop',
          reason: 'questComplete',
          detail: `Finished "${pinDef?.title ?? mode.entry}"`,
        };
      }
      if (mode.handInByHand && turnInCandidates(state, ds, prog).includes(mode.entry)) {
        return {
          kind: 'stop',
          reason: 'questComplete',
          detail: `Ready to hand in "${pinDef?.title ?? mode.entry}"`,
        };
      }
      if (questIsDeathSkipped(prog, mode.entry)) {
        return {
          kind: 'stop',
          reason: 'noTargets',
          detail: prog.lastSkipReason ?? `Skipped "${pinDef?.title ?? mode.entry}"`,
        };
      }
    }

    // TURN IN when questComplete. Engine turnInQuest does NOT require the ender zone
    // (items-met delivers / timed "bring this in 60 min" are already complete in bags).
    // Prefer immediate turn-in so Auto Quest closes the loop without a multi-leg trip
    // to the hub that players were doing by hand. GO enders use the object step when the
    // GO is present in-zone; otherwise turnIn awards XP/rewards the same way.
    // SESSION 5: re-emit every cycle until turned in — never stall on a dead "Quest complete!".
    const turnReady = turnInCandidates(state, ds, prog);
    if (turnReady.length > 0) {
      const pick = focus != null
        ? (turnReady.includes(focus) ? focus : undefined)
        : turnReady[0];
      if (pick != null) return turnInStepFor(state, ds, cfg, pick, prog);
    }

    // DELIVER / talk when enderZones ∋ currentZone (GO ender interact / CQ6 speak path).
    const deliver = deliverOrTalkStep(state, ds, cfg, prog, focus);
    if (deliver) return deliver;

    if (focus != null) {
      const pinned = pinnedQuestStep(state, ds, cfg, prog, focus);
      if (pinned?.kind === 'fight') {
        questFight = { creatureEntry: pinned.creatureEntry, questEntry: focus };
      } else if (pinned) {
        return pinned;
      } else {
        return {
          kind: 'stop',
          reason: 'noTargets',
          detail: prog.lastSkipReason
            ?? `Cannot advance "${ds.quest(focus)?.title ?? focus}"`,
        };
      }
    } else if (!questFight) {
    // ACCEPT available in-zone quests (one per step; frees the accept→advance loop).
    // Entries whose accept the engine already refused this session are skipped, not retried.
    // Setup gates (level band, elite policy) are re-read every pass rather than latched:
    // a level-up or a fresh hire legitimately re-opens a quest the band closed a minute ago.
    // A launched quest pins accept: take that one (if still offered) and leave the rest.
    const hasSlot = activeQuestCount(state.questlog) < MAX_QUEST_SLOTS;
    if (hasSlot && cfg.questAutoAccept) {
      const aEntry = view.acceptable.find((e) => {
        if (focus != null && e !== focus) return false;
        if (prog.blockedAccepts?.has(e)) return false;
        const def = ds.quest(e);
        if (!def) return true;
        // Do Quest is an explicit pick — take that offer even if the setup band would skip it.
        if (focus != null && e === focus) return true;
        const gate = questAcceptGate(ds, def, state.char.level, cfg, squadSize(state), {
          log: state.questlog,
          inv: ownedOf(state),
          zoneId: state.char.zoneId,
          auras: lootAuras(state),
        });
        if (gate.code === 'elite-needs-squad') prog.eliteNeedsSquad = true;
        return gate.ok;
      });
      if (aEntry != null) {
        const aDef = ds.quest(aEntry);
        if (aDef && !prereqMet(ds, aDef, state.questlog)) {
          // Should be rare (view gates prereq) — latch and keep scanning.
          mutableNumSet(prog, 'blockedAccepts').add(aEntry);
          prog.lastSkipReason = `${GO_CLASS_SKIP.PREREQ_UNMET}: "${aDef.title}"`;
        } else if (aDef?.goStarter != null && aDef.goStarter > 0 && !prog.blockedObjects?.has(aDef.goStarter)) {
          // Accept-at-GO: only interact when zone.objects lists the starter; else plain accept
          // (offered here) or travel to a zone that carries the GO.
          if (objectPresentInZone(ds, state.char.zoneId, aDef.goStarter)) {
            return { kind: 'object', objectEntry: aDef.goStarter, questEntry: aEntry };
          }
          const zones = zonesListingObject(ds, aDef.goStarter);
          const route = zones.find((z) =>
            z !== state.char.zoneId && !prog.blockedTravels?.has(z)
            && travelAllowed(state, ds, cfg, prog, z));
          if (route) {
            const name = ds.gameObject(aDef.goStarter)?.name ?? `Object#${aDef.goStarter}`;
            return {
              kind: 'travel',
              zoneId: route,
              reason: `Accept "${aDef.title}" at ${name} in ${ds.zone(route)?.name ?? route}`,
              questEntry: aEntry,
            };
          }
          // GO starter not visible in any baked zone — NPC-style accept still works when offered.
          return { kind: 'accept', questEntry: aEntry };
        } else {
          return { kind: 'accept', questEntry: aEntry };
        }
      }
    }

    // ADVANCE — sourceItem use, GO interact, kill/dropper fights.
    const ownedNow = ownedOf(state);
    for (const qs of state.questlog.quests) {
      if (focus != null && qs.entry !== focus) continue;
      if (qs.status === 'turnedIn' || qs.status === 'complete') continue;
      if (questIsSkipped(state, ds, cfg, prog, qs.entry)) continue;
      const def = ds.quest(qs.entry);
      if (!def) continue;
      if (questComplete(def, qs, ownedNow)) continue;
      const corpseItem = pendingCorpseUseItem(ds, def, state.inventory, state.lastCorpse);
      if (corpseItem && !prog.blockedUses?.has(corpseItem)) {
        return { kind: 'use', itemEntry: corpseItem, questEntry: qs.entry };
      }
      // Kill credit from a ScriptDev spell hit on a live NPC (Lazy Peons 5441). The target is
      // CIVILIAN, so it never reaches the fight lane. Cite: questScriptItemUse.ts.
      const scriptUse = pendingScriptItemUse(ds, def, qs, ownedNow, state.char.zoneId);
      if (scriptUse && !prog.blockedUses?.has(scriptUse.item)) {
        return {
          kind: 'use',
          itemEntry: scriptUse.item,
          targetCreatureEntry: scriptUse.targetCreatureEntry,
          questEntry: qs.entry,
        };
      }
      for (const st of (def.sourceItemTargets || [])) {
        if (prog.blockedUses?.has(st.item)) continue;
        if (itemIsQuestCorpseUse(ds, st.item)) continue;
        if (countItem(ownedNow, st.item) >= st.count) {
          return { kind: 'use', itemEntry: st.item, questEntry: qs.entry };
        }
      }
      // A container in this zone holds an item objective (grape buckets, pumpkins). view.objects
      // carries objectTargets only, so the world run never saw these; the Do Quest pin already did.
      // A lock between us and the objective needs a key a mob here drops: farm it BEFORE walking to
      // the object, or the open is refused and latches. Cite: quests.ts:1035 names that dropper.
      const keyMob = questLockKeyFightTarget(state, ds, def, qs, prog.blockedFights);
      if (keyMob != null) {
        return { kind: 'fight', creatureEntry: keyMob, forQuest: true, questEntry: qs.entry };
      }
      const keyGo = questLockKeyObjectStep(state, ds, def, qs, prog.blockedObjects);
      if (keyGo != null) {
        return { kind: 'object', objectEntry: keyGo, forQuest: true, questEntry: qs.entry };
      }
      // A container in this zone holds an item objective (grape buckets, pumpkins). view.objects
      // carries objectTargets only, so the world run never saw these; the Do Quest pin already did.
      const goLoot = itemGoStep(state, ds, def);
      if (goLoot && !prog.blockedObjects?.has(goLoot.objectEntry)) {
        return { kind: 'object', objectEntry: goLoot.objectEntry, forQuest: true, questEntry: qs.entry };
      }
    }
    // Object interact — skip entries the driver already proved unusable this session
    // (locked without key, missing template, permanent despawn). Prefer a usable one that
    // is actually present in the current zone (SESSION 1 zone.objects); otherwise travel.
    // When every pending object is blocked/missing, fall through to questRunReason
    // (honest skip / travel) instead of spinning forever on interactObject failure.
    const pendingObjs = view.objects.filter(
      (o) => o.forQuest && !prog.blockedObjects?.has(o.entry) && ds.gameObject(o.entry)
        && (focus == null || questWantsObject(ds, focus, o.entry)),
    );
    // Prefer local GO first.
    const localObj = pendingObjs.find((o) => objectPresentInZone(ds, state.char.zoneId, o.entry));
    if (localObj) {
      const go = ds.gameObject(localObj.entry)!;
      if (isUnsupportedGoType(go.type)) {
        mutableNumSet(prog, 'blockedObjects').add(localObj.entry);
        prog.lastSkipReason = `${GO_CLASS_SKIP.UNSUPPORTED_TYPE}: ${go.name}`;
      } else {
        // Attach questEntry when a single active quest owns this object target.
        let questEntry: number | undefined;
        let ownedBySkippedOnly = false;
        for (const qs of state.questlog.quests) {
          if (qs.status === 'turnedIn' || qs.status === 'complete') continue;
          const def = ds.quest(qs.entry);
          if (!def) continue;
          if (!(def.objectTargets ?? []).some((ot) => ot.objectEntry === localObj.entry)) continue;
          if (questIsSkipped(state, ds, cfg, prog, qs.entry)) {
            ownedBySkippedOnly = true;
            continue;
          }
          questEntry = qs.entry;
          ownedBySkippedOnly = false;
          break;
        }
        if (questEntry == null && ownedBySkippedOnly) {
          // Only skipped quests (defeat cap / setup policy) want this GO — do not spin on it.
          mutableNumSet(prog, 'blockedObjects').add(localObj.entry);
        } else {
          return { kind: 'object', objectEntry: localObj.entry, forQuest: true, questEntry };
        }
      }
    } else if (pendingObjs.length > 0) {
      // Remote objective GO — travel via acquisitionZones / zone.objects listing.
      for (const o of pendingObjs) {
        const step = objectOrTravelStep(
          state,
          ds,
          o.entry,
          { forQuest: true },
          prog.blockedTravels,
          (z) => travelAllowed(state, ds, cfg, prog, z),
        );
        if (step.kind === 'travel') {
          // Prefer quest-named reason when we can bind the object to a quest.
          for (const qs of state.questlog.quests) {
            if (qs.status === 'turnedIn' || qs.status === 'complete') continue;
            const def = ds.quest(qs.entry);
            if (!def) continue;
            if ((def.objectTargets ?? []).some((ot) => ot.objectEntry === o.entry)) {
              const zones = acquisitionZonesForQuest(
                ds, def, qs, ownedOf(state), state.questlog, state.char.level,
                lootAuras(state),
              );
              const route = zones.find((z) =>
                z !== state.char.zoneId && !prog.blockedTravels?.has(z)
                && travelAllowed(state, ds, cfg, prog, z));
              if (route) {
                const skip = questWorkSkipReason(
                  ds, def, qs, ownedOf(state), state.char.zoneId, state.questlog, state.char.level,
                  lootAuras(state),
                );
                return {
                  kind: 'travel',
                  zoneId: route,
                  reason: skip.reason,
                  questEntry: qs.entry,
                };
              }
              return { ...step, questEntry: qs.entry };
            }
          }
          return step;
        }
        if (step.kind === 'object') return step;
        // stop from objectOrTravelStep — remember and try next object
        if (step.kind === 'stop' && step.detail) prog.lastSkipReason = step.detail;
        mutableNumSet(prog, 'blockedObjects').add(o.entry);
      }
    }

    // Buy quest materials from a merchant in this zone before farming droppers.
    for (const qs of state.questlog.quests) {
      if (focus != null && qs.entry !== focus) continue;
      if (qs.status === 'turnedIn' || qs.status === 'complete') continue;
      if (questIsSkipped(state, ds, cfg, prog, qs.entry)) continue;
      const buy = questVendorBuyStep(state, ds, qs.entry);
      if (buy && !prog.blockedUses?.has(buy.itemEntry)) {
        return {
          kind: 'buy',
          vendorEntry: buy.vendorEntry,
          itemEntry: buy.itemEntry,
          count: buy.count,
          questEntry: qs.entry,
        };
      }
    }

    const huntable = huntableQuests(
      ds,
      state.questlog,
      view.hunt.map((h) => h.entry),
      ownedOf(state),
      state.char.level,
      lootAuras(state),
    ).filter((q) => !questIsSkipped(state, ds, cfg, prog, q.entry));
    let local = focus != null ? huntable.find((q) => q.entry === focus) : huntable[0];
    if (!local && focus != null) {
      // Launched quest has no local fight — travel for it before grinding someone else.
      const focused = questRunReason(state, ds, cfg, prog, focus);
      if (focused.kind !== 'stop') return focused;
      local = huntable[0];
    }
    if (local) {
      const qs = getQuest(state.questlog, local.entry)!;
      const killNeed = new Set<number>();
      // Best loot chance among still-needed itemTargets for this entry (0 = not an item dropper).
      const itemChance = new Map<number, number>();
      // Direct kill targets still needed.
      for (const kt of local.killTargets) {
        if ((qs.kills[String(kt.creatureEntry)] ?? 0) < kt.count) {
          if (corpseUseSummonedEntries(ds, local).includes(kt.creatureEntry)) {
            for (const e of corpseUseFarmEntries(ds, local)) killNeed.add(e);
          } else {
            killNeed.add(kt.creatureEntry);
          }
        }
      }
      if (corpseUseWorkRemaining(ds, local, qs, state.inventory)) {
        for (const e of corpseUseFarmEntries(ds, local)) killNeed.add(e);
      }
      // Pickup-loot / itemTargets: real drop chance + our-level first (QI3). Lowest-level-with-any-row
      // farmed Small Crag Boar (0.02%); highest-drop-first pulled above-level Large Crag Boar.
      const aurasNow = lootAuras(state);
      for (const it of local.itemTargets) {
        if (countItem(ownedNow, it.item) >= it.count) continue;
        const floor = dropperNoiseFloorFor(ds, it.item, state.questlog, state.char.level, aurasNow);
        for (const h of view.hunt) {
          const ch = lootChanceForItem(ds, h.entry, it.item, state.questlog, state.char.level, aurasNow);
          if (ch <= 0 || ch < floor) continue;
          const prev = itemChance.get(h.entry) ?? 0;
          if (ch > prev) itemChance.set(h.entry, ch);
        }
      }
      const candidates = view.hunt.filter((h) => {
        if (prog.blockedFights?.has(h.entry)) return false;
        if (killNeed.has(h.entry)) return true;
        const ch = itemChance.get(h.entry) ?? 0;
        return ch > 0;
      });
      if (candidates.length > 0) {
        // Kill objectives first, then a normal dropper over an elite, then closer, then highest drop.
        const target = candidates.reduce((a, b) => {
          const aKill = killNeed.has(a.entry);
          const bKill = killNeed.has(b.entry);
          if (aKill !== bKill) return aKill ? a : b;
          const cmp = compareQuestDroppers(
            { level: a.level, chance: itemChance.get(a.entry) ?? 0, rank: a.rank ?? 0 },
            { level: b.level, chance: itemChance.get(b.entry) ?? 0, rank: b.rank ?? 0 },
            state.char.level,
          );
          return cmp <= 0 ? a : b;
        });
        questFight = { creatureEntry: target.entry, questEntry: local.entry };
      }
    }

    if (!questFight) {
      const invNow = ownedOf(state);
      const order = questsWithWork(ds, state.questlog, invNow, state.char.level)
        .filter((q) => !questIsSkipped(state, ds, cfg, prog, q.entry));
      const ranked = focus != null
        ? [...order.filter((q) => q.entry === focus), ...order.filter((q) => q.entry !== focus)]
        : order;
      for (const q of ranked) {
        const step = campaignMoveStep(state, ds, cfg, prog, q.entry);
        if (!step) continue;
        if (step.kind === 'fight') {
          questFight = { creatureEntry: step.creatureEntry, questEntry: q.entry };
          break;
        }
        return step;
      }
    }

    if (!questFight) {
      // No local fight, nothing to accept → travel or honest skip (never dead-stop).
      if (focus != null) {
        const focused = questRunReason(state, ds, cfg, prog, focus);
        if (focused.kind !== 'stop') return focused;
      }
      return questRunReason(state, ds, cfg, prog);
    }
    }
  }

  // 2b) The pull also weighs the pet: it is half the damage for a warlock or hunter, and
  // regenTick (its only refill) runs solely in `wait` - measured 377 -> 327 mana over 8 pulls.
  if (need.health || need.mana || need.petPower) {
    const recover = recoverStep(state, ds, cfg, need);
    if (recover) return recover;
    // A drained pet is NOT an out-of-consumables condition - no food refills a pet, only time,
    // so wait it out rather than stranding the run on a reason the player cannot act on.
    if (need.petPower && !need.health && !need.mana) return { kind: 'wait' };
    return { kind: 'stop', reason: 'outOfConsumables' };
  }

  // 3) Safe to fight. In quest mode the target was resolved above (the on-level chainable quest);
  // forQuest is always true here, and questEntry tells the driver which quest it's crediting.
  if (mode.kind === 'quest') {
    return { kind: 'fight', creatureEntry: questFight!.creatureEntry, forQuest: true, questEntry: questFight!.questEntry };
  }

  // A player-picked mob is farmed as chosen (only gated by "is it in this zone"), so their
  // choice is respected even if it's a tougher con than the auto-picker would select.
  // Driver-blocked pins stop with the refusal reason rather than spinning forever.
  if (mode.creatureEntry != null) {
    if (prog.blockedFights?.has(mode.creatureEntry)) {
      return {
        kind: 'stop',
        reason: 'noTargets',
        detail: prog.lastSkipReason ?? `cannot fight creature ${mode.creatureEntry}`,
      };
    }
    const here = huntableCreatures(ds, state.char.zoneId, state.questlog, state.char.race).some((c) => c.entry === mode.creatureEntry);
    if (!here) return { kind: 'stop', reason: 'noTargets' };
    const forQuest = view.hunt.some((h) => h.entry === mode.creatureEntry && h.forQuest);
    return { kind: 'fight', creatureEntry: mode.creatureEntry, forQuest };
  }

  // Skip driver-blocked entries and pick the next best con — never stop the whole zone farm
  // because one template refused beginFight (was: best target blocked → stop immediately).
  const huntOpen = view.hunt.filter((h) => !prog.blockedFights?.has(h.entry));
  const target = bestHuntTarget({ ...view, hunt: huntOpen });
  if (!target) {
    return {
      kind: 'stop',
      reason: 'noTargets',
      detail: prog.lastSkipReason,
    };
  }
  return { kind: 'fight', creatureEntry: target.entry, forQuest: target.forQuest };
}

/** Decide the next thing the autopilot should do. */
export function planStep(
  state: GameState,
  ds: DataStore,
  mode: AutopilotMode,
  cfg: AutopilotConfig,
  prog: AutopilotProgress,
): AutopilotStep {
  const stateKey = planStateKey(state);

  // SESSION 5 self-memory: if the last proposal produced no state change, latch it into the
  // matching blocked* set with an honest reason — even when the driver forgot to populate
  // blockedObjects / blockedAccepts / blockedSpeaks. Pure: memory lives only on `prog`.
  if (
    prog.lastProposal &&
    prog.lastStateKey === stateKey &&
    isLatchableStep(prog.lastProposal)
  ) {
    const reason = classifyFailedStep(prog.lastProposal, state, ds);
    latchFailedStep(prog, prog.lastProposal, reason);
  }

  let step = planStepCore(state, ds, mode, cfg, prog);

  // If core still re-emits the identical latchable step after a no-op, force honest skip
  // (covers step kinds whose latch did not change the decision path).
  if (
    prog.lastProposal &&
    prog.lastStateKey === stateKey &&
    isLatchableStep(step) &&
    stepsEqual(step, prog.lastProposal)
  ) {
    const reason = prog.lastSkipReason ?? classifyFailedStep(step, state, ds);
    latchFailedStep(prog, step, reason);
    step = planStepCore(state, ds, mode, cfg, prog);
    if (isLatchableStep(step) && stepsEqual(step, prog.lastProposal!)) {
      step = {
        kind: 'stop',
        reason: 'noTargets',
        detail: reason,
      };
    }
  }

  markProposal(prog, step, stateKey);
  return step;
}
