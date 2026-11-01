import type { DataStore } from '../data/dataStore.ts';
import { firstDungeonGameObjectForEntry } from '../data/dungeonGameObjects.ts';
import type { Character } from '../domain/character/character.ts';
import type { QuestLog, QuestState, QuestPlayerSnapshot } from '../domain/quests/questlog.ts';
import {
  getQuest,
  questComplete,
  canSeeQuest,
  canTakeQuest,
  questStatusFromLog,
  isTalkToNpcQuest,
  isEventTalkQuest,
  isDeliverQuest,
  talkMet,
  itemsMet,
  requiresEventCredit,
  exploreMet,
  accept,
  shouldGrantSrcItemOnAccept,
  isWorldLootSrcItemObjective,
  isItemStartedQuest,
  isRepeatableQuest,
  itemStartGateMet,
  canDegradedAutoFinish,
  satisfyQuestClass,
  satisfyQuestExclusiveGroup,
  satisfyQuestLevel,
  satisfyQuestPreviousQuest,
  satisfyQuestRace,
  satisfyQuestReputation,
  satisfyQuestSkill,
  satisfyQuestTimed,
  hasGoEnder,
  goEnderEntryOf,
  creatureCreditTargets,
} from '../domain/quests/questlog.ts';
import { getStanding } from '../domain/creature/reputation.ts';
import type { Inventory } from '../domain/items/inventory.ts';
import { addItem, countItem } from '../domain/items/inventory.ts';
import type { ConditionDef, QuestDef } from '../data/schema.ts';
import { isConditionSatisfied, type ConditionSnapshot } from '../engine/spells/conditions.ts';
import { isConditionFulfilled, worldStateConditionFns } from '../engine/game/worldState.ts';
import {
  canOpenLock,
  requiredKeyItemEntry,
  hardestSkillLockCase,
} from '../domain/world/openLock.ts';
import { FARM_LEVEL_HI_SLACK } from '../domain/questFarmFilter.mjs';
import { lootRowIsQuestItemSource } from '../domain/items/loot.ts';
import { creatureObjectiveLabel } from '../domain/quests/questObjectiveLabel.ts';
import { isScriptCreditOnlyTarget } from '../domain/quests/questScriptCredit.ts';
import {
  corpseUseFarmEntries,
  corpseUseFightEntries,
  corpseUseSpellId,
  corpseUseSummonedEntries,
  corpseUseWorkRemaining,
} from '../domain/quests/questCorpseUse.ts';

/** Zones listing `creatureEntry` as huntable or on spatial spawns (Do Quest zonesHostingCreature). */
function spawnZonesForCreature(ds: DataStore, creatureEntry: number): string[] {
  const cache = spawnZoneCache(ds);
  const hit = cache.get(creatureEntry);
  if (hit) return hit;
  const out: string[] = [];
  for (const z of ds.zones()) {
    if ((z.huntable ?? []).includes(creatureEntry)) out.push(z.id);
    else if ((z.spawns ?? []).some((s) => s.entry === creatureEntry)) out.push(z.id);
  }
  cache.set(creatureEntry, out);
  return out;
}

// A per-store memo for the spawn-zone walk: one call visits all 46 zones and Do Quest asks per dropper
// per quest. Keyed on the world generation so a late attach drops it rather than freezing the answer.
const spawnZoneCaches = new WeakMap<DataStore, { gen: number; zones: Map<number, string[]> }>();

function spawnZoneCache(ds: DataStore): Map<number, string[]> {
  const gen = ds.zoneWorldGen();
  let slot = spawnZoneCaches.get(ds);
  if (!slot || slot.gen !== gen) {
    slot = { gen, zones: new Map() };
    spawnZoneCaches.set(ds, slot);
  }
  return slot.zones;
}

/** Classic WoW difficulty colour of a target relative to the player, red = hardest. */
export type DifficultyTier = 'gray' | 'green' | 'yellow' | 'orange' | 'red';

// The level at (or below) which a target is "gray" — trivial, no XP — for a player of `playerLevel`. This
// is the classic 1.12 gray formula, used for both mobs and quests. Below level 6 nothing is gray.
function grayLevel(playerLevel: number): number {
  if (playerLevel <= 5) return 0;
  if (playerLevel <= 39) return playerLevel - 5 - Math.floor(playerLevel / 10);
  if (playerLevel <= 59) return playerLevel - 1 - Math.floor(playerLevel / 5);
  return playerLevel - 9;
}

// Difficulty colour of a `targetLevel` (quest or mob) for a given `playerLevel`, mirroring the WoW client:
// red (deadly, 5+ above) → orange → yellow (even, ±2) → green (below but not trivial) → gray (trivial).
export function difficultyTier(targetLevel: number, playerLevel: number): DifficultyTier {
  const diff = targetLevel - playerLevel;
  if (diff >= 5) return 'red';
  if (diff >= 3) return 'orange';
  if (diff >= -2) return 'yellow';
  if (targetLevel > grayLevel(playerLevel)) return 'green';
  return 'gray';
}

/** A quest offered in a zone, annotated for display (colour + accept eligibility). */
export interface OfferedQuest {
  quest: QuestDef;
  tier: DifficultyTier; // colour of the quest vs the player's level
  canAccept: boolean;   // player meets the quest's minLevel
  reqLevel: number;     // minLevel required to accept
}

function compareOffered(a: OfferedQuest, b: OfferedQuest, playerLevel: number): number {
  // Acceptable quests first, then the ones closest to the player's level, so the most relevant surface
  // at the top; then a low-to-high tiebreak, then required level, then title.
  if (a.canAccept !== b.canAccept) return a.canAccept ? -1 : 1;
  return (
    Math.abs(a.quest.questLevel - playerLevel) - Math.abs(b.quest.questLevel - playerLevel) ||
    a.quest.questLevel - b.quest.questLevel ||
    a.reqLevel - b.reqLevel ||
    a.quest.title.localeCompare(b.quest.title)
  );
}

// Whether a quest's chain prerequisite is satisfied — it must have been TURNED IN. A prerequisite the
// bake pruned counts as satisfied, or a chain whose talk-only intro was dropped could never start.
export function prereqMet(ds: DataStore, quest: QuestDef, log: QuestLog): boolean {
  if (!quest.prevQuest) return true;
  if (!ds.quest(quest.prevQuest)) return true; // prerequisite pruned from the data → don't gate
  return getQuest(log, quest.prevQuest)?.status === 'turnedIn';
}

// The pure player view for the offer gates. It must carry every field the accept path's snapshot does,
// or an offer passes the list's gate and fails the accept's — which is a button that says no.
function offerSnapshot(char: Character, log: QuestLog, ds?: DataStore): QuestPlayerSnapshot {
  let condTable: Map<number, ConditionDef> | undefined;
  return {
    level: char.level,
    classId: char.cls,
    raceId: char.race,
    questStatus: questStatusFromLog(log),
    standingFor: ds
      ? (factionId: number) => {
        const f = ds.faction(factionId);
        return f ? getStanding(char.reputations, f, char.race, char.cls) : 0;
      }
      : undefined,
    skillValue: (skillId: number) => char.combatSkills?.[skillId]?.current ?? 0,
    hasActiveTimedQuest: log.quests.some((qq) => {
      if (qq.status === 'turnedIn' || qq.status === 'failed') return false;
      const qd = ds?.quest(qq.entry);
      return !!(qd?.limitTime && qd.limitTime > 0);
    }),
    conditionEval: ds ? (conditionId: number) => {
      if (!condTable) {
        condTable = new Map();
        for (const c of ds.conditionsList()) condTable.set(c.id, c);
      }
      const cSnap: ConditionSnapshot = {
        level: char.level,
        raceMask: char.race ? 1 << (char.race - 1) : undefined,
        classMask: char.cls ? 1 << (char.cls - 1) : undefined,
        quests: Object.fromEntries(log.quests.map((q) => [
          q.entry,
          q.status === 'turnedIn' ? 'rewarded' : q.status === 'complete' ? 'complete' : 'taken',
        ])),
      };
      return isConditionSatisfied(conditionId, cSnap, condTable).ok;
    } : undefined,
  };
}

// A log row that no longer blocks an offer: a rewarded REPEATABLE, which core has already put back to
// QUEST_STATUS_NONE. Cite: Player.cpp:12611 RewardQuest; questlog.satisfyQuestStatus.
export function logRowBlocksOffer(log: QuestLog, quest: QuestDef): boolean {
  const held = getQuest(log, quest.entry);
  if (!held) return false;
  return !(held.status === 'turnedIn' && isRepeatableQuest(quest));
}

// Every quest a zone offers that is not already in the log and that this character may see, including
// ones their level refuses, so the UI can show the requirement. Item-starts and wrong-zone rows are out.
export function offeredQuests(ds: DataStore, zoneId: string, char: Character, log: QuestLog): OfferedQuest[] {
  const zone = ds.zone(zoneId);
  if (!zone) return [];
  const snap = offerSnapshot(char, log, ds);
  const out: OfferedQuest[] = [];
  for (const qe of zone.quests) {
    const q = ds.quest(qe);
    if (!q) continue;
    if (logRowBlocksOffer(log, q)) continue; // already active/complete/turned in
    if (isItemStartedQuest(q)) continue; // the item is the giver — see bagQuestStarts
    const starters = q.starterZones ?? [];
    if (starters.length > 0 && !starters.includes(zoneId)) continue;
    // prevQuest pruned from the bake (no row) must not gate — same as prereqMet / acceptQuest.
    const prevQuestMissingFromData = !!(q.prevQuest && !ds.quest(q.prevQuest));
    if (!canSeeQuest(snap, q, { prevQuestMissingFromData })) continue; // class/race/prev/skill/exclusive/week
    const prevOpts = {
      prevQuestMissingFromData,
      questDefFor: (id: number) => ds.quest(id),
    };
    out.push({
      quest: q,
      tier: difficultyTier(q.questLevel, char.level),
      // Full CanTakeQuest (level + rep + timed + exclusive) so Accept never soft-fails.
      canAccept: canTakeQuest(snap, q, prevOpts),
      reqLevel: q.minLevel,
    });
  }
  return out.sort((a, b) => compareOffered(a, b, char.level));
}

/** The chain follow-up this zone offers now that `handedIn` is turned in, or null. Only an explicit
 *  link counts - NextQuestId, else an offer whose PrevQuestId is it. Cite: quest.ts:53-54. */
export function chainFollowUpOffer(
  ds: DataStore,
  char: Character,
  log: QuestLog,
  handedIn: number,
): OfferedQuest | null {
  const offers = offeredQuests(ds, char.zoneId, char, log).filter((o) => o.canAccept);
  if (offers.length === 0) return null;
  const next = ds.quest(handedIn)?.nextQuest ?? 0;
  return (next ? offers.find((o) => o.quest.entry === next) : undefined)
    ?? offers.find((o) => o.quest.prevQuest === handedIn)
    ?? null;
}

/** An item-started offer, plus the bag item that is the giver. */
export interface BagQuestStart extends OfferedQuest {
  /** item_template entry whose `startQuest` opened this offer. */
  startItem: number;
}

// The item-started quests the bags can start right now: the ITEM is the giver, so the offer follows the
// bag. Of 208 baked item-starts, 30 appear in no zone list and the rest were gated to one zone.
export function bagQuestStarts(
  ds: DataStore,
  char: Character,
  log: QuestLog,
  inv: Inventory,
): BagQuestStart[] {
  // Candidates first: this runs on the world-view / menu-badge render path, and most bags
  // hold no quest starter at all, so the snapshot is only worth building when one does.
  const candidates: { startItem: number; quest: QuestDef }[] = [];
  const seenQuest = new Set<number>();
  for (const st of inv.stacks) {
    const def = ds.item(st.item);
    const qe = def?.startQuest ?? 0;
    if (qe <= 0 || seenQuest.has(qe)) continue;
    seenQuest.add(qe);
    const q = ds.quest(qe);
    if (!q) continue;
    if (logRowBlocksOffer(log, q)) continue; // already active/complete/turned in
    candidates.push({ startItem: st.item, quest: q });
  }
  if (!candidates.length) return [];
  const snap = offerSnapshot(char, log, ds);
  const out: BagQuestStart[] = [];
  for (const { startItem, quest: q } of candidates) {
    const prevQuestMissingFromData = !!(q.prevQuest && !ds.quest(q.prevQuest));
    if (!canSeeQuest(snap, q, { prevQuestMissingFromData })) continue;
    // The engine gates on the required start item, preferring the baked one. Two items can name the
    // same quest, so holding the other one offered an accept that then refused.
    if (!itemStartGateMet(q, inv)) continue;
    out.push({
      quest: q,
      startItem,
      tier: difficultyTier(q.questLevel, char.level),
      canAccept: canTakeQuest(snap, q, {
        prevQuestMissingFromData,
        questDefFor: (id: number) => ds.quest(id),
      }),
      reqLevel: q.minLevel,
    });
  }
  return out.sort((a, b) => compareOffered(a, b, char.level));
}

/** The quest a held item would start, when the bags can start it right now. */
export function bagQuestStartFor(
  ds: DataStore,
  char: Character,
  log: QuestLog,
  inv: Inventory,
  itemEntry: number,
): BagQuestStart | undefined {
  return bagQuestStarts(ds, char, log, inv).find((o) => o.startItem === itemEntry);
}

/** What a quest-starting item is doing right now, or why it is doing nothing. */
export type BagQuestStartState =
  | { kind: 'offer'; offer: BagQuestStart }
  | { kind: 'blocked'; quest: QuestDef; reason: string }
  | null;

// The state of a quest a bag item starts: the live offer, or the one gate holding it. Without this a
// gated starter is a dead item with no button and no explanation. The reasons follow the C++ order.
export function bagQuestStartState(
  ds: DataStore,
  char: Character,
  log: QuestLog,
  inv: Inventory,
  itemEntry: number,
): BagQuestStartState {
  const qe = ds.item(itemEntry)?.startQuest ?? 0;
  if (qe <= 0) return null;
  const quest = ds.quest(qe);
  if (!quest) return null;
  const offer = bagQuestStarts(ds, char, log, inv).find((o) => o.startItem === itemEntry);
  if (offer?.canAccept) return { kind: 'offer', offer };
  const blocked = (reason: string): BagQuestStartState => ({ kind: 'blocked', quest, reason });
  const st = getQuest(log, qe);
  if (st) {
    return blocked(st.status === 'turnedIn'
      ? `You already finished "${quest.title}"`
      : `"${quest.title}" is in your quest log`);
  }
  const snap = offerSnapshot(char, log, ds);
  if (!satisfyQuestClass(snap, quest)) return blocked(`"${quest.title}" is not for your class`);
  if (!satisfyQuestRace(snap, quest)) return blocked(`"${quest.title}" is not for your race`);
  if (!satisfyQuestLevel(snap, quest)) return blocked(`"${quest.title}" requires level ${quest.minLevel}`);
  if (!satisfyQuestSkill(snap, quest)) return blocked(`"${quest.title}" needs a higher skill`);
  if (snap.standingFor && !satisfyQuestReputation({
    minFaction: quest.requiredMinRepFaction,
    minValue: quest.requiredMinRepValue,
    maxFaction: quest.requiredMaxRepFaction,
    maxValue: quest.requiredMaxRepValue,
    standingFor: snap.standingFor,
  })) {
    return blocked(`Your reputation is wrong for "${quest.title}"`);
  }
  const prev = quest.prevQuest ? ds.quest(quest.prevQuest) : undefined;
  if (prev && !satisfyQuestPreviousQuest(snap, quest, { questDefFor: (id: number) => ds.quest(id) })) {
    return blocked(`Finish "${prev.title}" before "${quest.title}"`);
  }
  // INVALIDREASON_QUEST_ONLY_ONE_TIMED (Player.cpp:13051).
  if (!satisfyQuestTimed(snap, quest)) return blocked(`Finish your timed quest before "${quest.title}"`);
  if (!satisfyQuestExclusiveGroup(snap, quest)) return blocked(`Another quest in the same set as "${quest.title}" is in your log`);
  if (!itemStartGateMet(quest, inv)) {
    const need = ds.item(quest.startedByItem ?? quest.srcItem?.item ?? 0)?.name;
    return blocked(need ? `"${quest.title}" starts from ${need}` : `You cannot start "${quest.title}" yet`);
  }
  return blocked(`You cannot start "${quest.title}" yet`);
}

/** Quests a zone offers that the character can accept right now. */
export function availableQuests(ds: DataStore, zoneId: string, char: Character, log: QuestLog): QuestDef[] {
  return offeredQuests(ds, zoneId, char, log).filter((o) => o.canAccept).map((o) => o.quest);
}

// ---- QI3 acquisition graph (item→creature reverse index, zone routing) ----
// Cite: docs/archive/QUEST-INTERPRETER.md §5 QI3; extract.mjs droppersForItem; LootMgr conditionId.

/** Player::CanTakeQuest for CONDITION_QUESTAVAILABLE. Cite: Conditions.cpp:295-298. */
export function canTakeQuestForCondition(
  ds: DataStore,
  char: Pick<Character, 'level' | 'cls' | 'race'>,
  log: QuestLog,
): (questId: number) => boolean {
  const questStatus = questStatusFromLog(log);
  return (questId: number) => {
    const q = ds.quest(questId);
    if (!q) return false;
    return canTakeQuest(
      { level: char.level, classId: char.cls, raceId: char.race, questStatus },
      q,
      {
        prevQuestMissingFromData: !!(q.prevQuest && !ds.quest(q.prevQuest)),
        questDefFor: (id) => ds.quest(id),
      },
    );
  };
}

/** Quest-state snapshot for loot conditionId evaluation (QUESTREWARDED / QUESTTAKEN / QUESTAVAILABLE). */
export function questConditionSnapshot(
  log: QuestLog,
  level?: number,
  canTake?: (questId: number) => boolean,
  worldStates?: Record<number, number>,
  areaFlags?: number,
  auras?: readonly number[],
): ConditionSnapshot {
  const quests: Record<string, 'none' | 'taken' | 'complete' | 'rewarded'> = {};
  for (const q of log.quests) {
    if (q.status === 'turnedIn') quests[String(q.entry)] = 'rewarded';
    else if (q.status === 'complete') quests[String(q.entry)] = 'complete';
    else quests[String(q.entry)] = 'taken';
  }
  const base = {
    quests,
    level,
    // Cite: Conditions.cpp:254 pAreaEntry->flags. Absent bake → undefined (fail-closed).
    areaFlags,
    worldScript: isConditionFulfilled,
    ...(worldStates ? worldStateConditionFns(worldStates) : {}),
    ...(auras !== undefined ? { auras } : {}),
  };
  return canTake ? { ...base, canTakeQuest: canTake } : base;
}

function lootSnap(log?: QuestLog, level?: number, auras?: readonly number[]): ConditionSnapshot {
  return questConditionSnapshot(log ?? { quests: [] }, level, undefined, undefined, undefined, auras);
}

function conditionsTable(ds: DataStore): Map<number, ConditionDef> {
  const map = new Map<number, ConditionDef>();
  for (const c of ds.conditionsList()) map.set(c.id, c);
  return map;
}

// Whether a loot row's condition is satisfiable for planning. Fail-closed: no evaluator or an
// unsatisfied condition means not a usable dropper. Cite: LootMgr.cpp Process; Conditions.cpp Meets.
export function lootDropAllowed(
  ds: DataStore,
  conditionId: number | undefined,
  snapshot: ConditionSnapshot,
): boolean {
  const cid = (conditionId ?? 0) | 0;
  if (cid === 0) return true;
  const table = conditionsTable(ds);
  if (!table.has(cid)) return false;
  return isConditionSatisfied(cid, snapshot, table).ok;
}

// The minimum free-drop chance to count as a farm source when better droppers exist. Below it is
// reverse-loot noise. A quest-gated row uses the absolute chance and is never scrubbed by this alone.
export const MIN_QUEST_DROPPER_CHANCE = 1;

const bestItemDropCache = new WeakMap<DataStore, Map<string, number>>();

function dropSnapKey(itemId: number, snapshot: ConditionSnapshot): string {
  const auras = snapshot.auras;
  let ak = '';
  if (auras) {
    const ids = [...auras].map((n) => n | 0).sort((a, b) => a - b);
    ak = ids.join(',');
  }
  return `${itemId}:${snapshot.team ?? 0}:${ak}`;
}

// Best chance on ANY loot table for the item. A local-pool floor read "in this zone" and quest
// 4022 fought Dark Iron Taskmaster 0.02% over Frenzied Black Drake 96%.
export function bestItemDropChance(
  ds: DataStore,
  itemId: number,
  snapshot: ConditionSnapshot,
): number {
  const key = dropSnapKey(itemId, snapshot);
  let slot = bestItemDropCache.get(ds);
  const hit = slot?.get(key);
  if (hit != null) return hit;
  let best = 0;
  for (const lootId of ds.lootKeysForItem(itemId)) {
    for (const d of ds.lootTable(lootId)) {
      if (d.item !== itemId) continue;
      if (!lootDropAllowed(ds, d.conditionId, snapshot)) continue;
      const mag = d.chance < 0 ? -d.chance : d.chance;
      const ch = (d.groupId ?? 0) !== 0 && mag === 0 ? 1 : mag;
      if (ch > best) best = ch;
    }
  }
  if (ds.lootAttached()) {
    if (!slot) {
      slot = new Map();
      bestItemDropCache.set(ds, slot);
    }
    slot.set(key, best);
  }
  return best;
}

export function dropperNoiseFloor(
  ds: DataStore,
  itemId: number,
  snapshot: ConditionSnapshot,
): number {
  return bestItemDropChance(ds, itemId, snapshot) >= MIN_QUEST_DROPPER_CHANCE ? MIN_QUEST_DROPPER_CHANCE : 0;
}

export function dropperNoiseFloorFor(
  ds: DataStore,
  itemId: number,
  log?: QuestLog,
  level?: number,
  auras?: readonly number[],
): number {
  return dropperNoiseFloor(ds, itemId, lootSnap(log, level, auras));
}

/** Template level used for farm ranking (static, else scaling min). */
export function creatureFarmLevel(
  cr: { level?: number; scaling?: { minLevel?: number } } | null | undefined,
): number {
  if (!cr) return 0;
  return ((cr.level ?? 0) | 0) || ((cr.scaling?.minLevel ?? 0) | 0) || 0;
}

/** CREATURE_ELITE_* (`rank ?? scaling.rank`). Same read as dataStore spawnRankOf / questPolicy. */
export function creatureFarmRank(
  cr: { rank?: number; scaling?: { rank?: number } } | null | undefined,
): number {
  if (!cr) return 0;
  return (cr.rank ?? cr.scaling?.rank ?? 0) | 0;
}

// Item-farm ranking: non-elite before elite, then closer to the player, then at-or-below, then
// highest drop chance. Highest-drop-first pulled elites; lowest-level pulled Small Crag Boar.
export function compareQuestDroppers(
  a: { level: number; chance: number; rank?: number },
  b: { level: number; chance: number; rank?: number },
  playerLevel: number,
): number {
  const aElite = (a.rank ?? 0) > 0 ? 1 : 0;
  const bElite = (b.rank ?? 0) > 0 ? 1 : 0;
  if (aElite !== bElite) return aElite - bElite;
  if (!(playerLevel > 0)) {
    return (b.chance - a.chance) || (a.level - b.level);
  }
  const aDist = Math.abs(a.level - playerLevel);
  const bDist = Math.abs(b.level - playerLevel);
  if (aDist !== bDist) return aDist - bDist;
  const aOver = a.level > playerLevel ? 1 : 0;
  const bOver = b.level > playerLevel ? 1 : 0;
  if (aOver !== bOver) return aOver - bOver;
  if (a.chance !== b.chance) return b.chance - a.chance;
  return a.level - b.level;
}

/** A dropper counts as "as good" as the best one when its chance is at least this share of it. */
export const SIMILAR_DROPPER_RATIO = 0.75;
/** ...and its level is at most this far below the best one's (and never gray to the player). */
export const SIMILAR_DROPPER_LEVELS_BELOW = 3;
/** ...and at most this far above the player (a harder mob than the best is never the pool's gain). */
export const SIMILAR_DROPPER_LEVELS_OVER = 1;

/**
 * The entries worth pulling interchangeably with the top-ranked one: same elite class, a drop
 * chance at least SIMILAR_DROPPER_RATIO of its chance, a level no more than SIMILAR_DROPPER_LEVELS_OVER
 * above the player (or the best, when the whole set is above the player), no more than
 * SIMILAR_DROPPER_LEVELS_BELOW under the best, and not gray unless the best is. Kill objectives
 * carry chance 0, so every credited entry in the level band qualifies. `ranked` is ordered by
 * compareQuestDroppers already, so ranked[0] is the best.
 */
export function similarQuestDroppers<T extends { level: number; chance: number; rank?: number }>(
  ranked: readonly T[],
  playerLevel: number,
): T[] {
  const best = ranked[0];
  if (!best) return [];
  const bestElite = (best.rank ?? 0) > 0;
  const haveLevel = playerLevel > 0;
  const ceiling = Math.max(best.level, haveLevel ? playerLevel + SIMILAR_DROPPER_LEVELS_OVER : best.level);
  const floor = best.level - SIMILAR_DROPPER_LEVELS_BELOW;
  const bestGray = haveLevel && difficultyTier(best.level, playerLevel) === 'gray';
  return ranked.filter((c) => {
    if (((c.rank ?? 0) > 0) !== bestElite) return false;
    if (c.chance < best.chance * SIMILAR_DROPPER_RATIO) return false;
    if (c.level > ceiling || c.level < floor) return false;
    return bestGray || !haveLevel || difficultyTier(c.level, playerLevel) !== 'gray';
  });
}

/**
 * One pull among the similar droppers, chosen by `salt` so the same state names the same mob and
 * the next fight (state.fightCounter moved) can name another. Always picking the comparator's
 * winner sent every Murloc quest at the Oracle and every collect quest at one template; a pool
 * of near-equal mobs spreads the kills without touching the ranking the smokes pin.
 */
export function pickQuestDropper<T extends { level: number; chance: number; rank?: number }>(
  ranked: readonly T[],
  playerLevel: number,
  salt: number,
): T | undefined {
  const pool = similarQuestDroppers(ranked, playerLevel);
  if (pool.length <= 1) return pool[0] ?? ranked[0];
  // A short integer mix so consecutive salts do not walk the pool in order.
  let h = (salt ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return pool[h % pool.length];
}

/** The salt pickQuestDropper takes for a save: the fight nonce under the save's seed. */
export function dropperPickSalt(state: { rngSeed: number; fightCounter: number }): number {
  return ((state.rngSeed | 0) * 31 + (state.fightCounter | 0)) | 0;
}

// The best eligible loot chance for an item on this creature, 0 for none. An equal-chance group row
// scores as one so it beats a near-zero free row. Cite: domain/items/loot.ts.
export function lootChanceForItem(
  ds: DataStore,
  creatureEntry: number,
  itemId: number,
  log?: QuestLog,
  level?: number,
  auras?: readonly number[],
): number {
  return lootChanceWithSnap(ds, creatureEntry, itemId, lootSnap(log, level, auras));
}

/** Same, with the snapshot already built — droppersForItem scans 2,605 creatures per call. */
function lootChanceWithSnap(
  ds: DataStore,
  creatureEntry: number,
  itemId: number,
  snapshot: ConditionSnapshot,
): number {
  const cr = ds.creature(creatureEntry);
  if (!cr) return 0;
  let best = 0;
  for (const d of ds.lootTable(cr.lootId)) {
    if (d.item !== itemId) continue;
    if (!lootDropAllowed(ds, d.conditionId, snapshot)) continue;
    const mag = Math.abs(d.chance);
    if ((d.groupId ?? 0) !== 0 && mag === 0) best = Math.max(best, 1);
    else best = Math.max(best, mag);
  }
  return best;
}

// The huntable universe the dropper search walks, keyed the way the store answers: loot id to the
// creatures reading it. The old form visited all 2,605 creatures — 766k rows a call.
interface HuntableLootIndex {
  byLootId: Map<number, number[]>;
  farmLevel: Map<number, number>;
  farmRank: Map<number, number>;
}
const huntableLootIndex = new WeakMap<DataStore, { gen: number; index: HuntableLootIndex }>();

function huntableDroppers(ds: DataStore): HuntableLootIndex {
  const gen = ds.zoneWorldGen();
  const hit = huntableLootIndex.get(ds);
  if (hit && hit.gen === gen) return hit.index;
  const byLootId = new Map<number, number[]>();
  const farmLevel = new Map<number, number>();
  const farmRank = new Map<number, number>();
  for (const z of ds.zones()) {
    for (const ce of z.huntable ?? []) {
      if (farmLevel.has(ce)) continue;
      const cr = ds.creature(ce);
      if (!cr) continue;
      farmLevel.set(ce, creatureFarmLevel(cr));
      farmRank.set(ce, creatureFarmRank(cr));
      // No lootId is no loot: lootChanceForItem read [] and scored 0 for these.
      const lootId = cr.lootId ?? 0;
      if (!lootId) continue;
      let list = byLootId.get(lootId);
      if (list === undefined) {
        list = [];
        byLootId.set(lootId, list);
      }
      list.push(ce);
    }
  }
  const built = { byLootId, farmLevel, farmRank };
  huntableLootIndex.set(ds, { gen, index: built });
  return built;
}

/** Build the huntable map ahead of the first Quest Log paint (bootData's idle warm). */
export function warmDropperIndex(ds: DataStore): void {
  huntableDroppers(ds);
}

/** Huntable creatures whose table can hold `itemId`. Deduped: one creature, one score. */
function huntableCandidates(ds: DataStore, itemId: number): Set<number> {
  const index = huntableDroppers(ds);
  const out = new Set<number>();
  for (const lootId of ds.lootKeysForItem(itemId)) {
    // A prefixed key (go:/item:/skinning:…) is never a creature lootId — normalizeLootKey
    // leaves only those as strings, and this index holds creature.lootId numbers.
    if (typeof lootId !== 'number') continue;
    for (const ce of index.byLootId.get(lootId) ?? []) out.add(ce);
  }
  return out;
}

// The cache generation for the dropper search: the only log state a loot condition reads is each
// quest's status, so a status change is the whole invalidation.
function questStatusKey(log?: QuestLog): string {
  if (!log) return '-';
  let key = '';
  for (const q of log.quests) key += `${q.entry}${q.status[0]}`;
  return key;
}

// One dropper search walks 2,605 huntable creatures and their whole tables — about 8M rows on one
// Quest Log paint before this cache. Same shape as the planner's, plus the status generation.
const dropperCache = new WeakMap<DataStore, { gen: string; hits: Map<string, number[]> }>();

// The creature entries whose baked loot can yield an item, scanned from the zone huntable lists so no
// dropper is invented. Reverse-loot elites far above the band and near-zero free drops are dropped.
export function droppersForItem(
  ds: DataStore,
  itemId: number,
  log?: QuestLog,
  level?: number,
  questLevel?: number,
  auras?: readonly number[],
): number[] {
  const bandAnchor = (questLevel != null && questLevel > 0)
    ? questLevel
    : (level != null && level > 0 ? level : 0);
  // Never cache before the lazy loot chunk mounts — the answer is empty until then.
  const cacheable = ds.lootAttached();
  const cacheKey = `${itemId}|${level ?? ''}|${questLevel ?? ''}|${auras ? [...auras].sort((a, b) => a - b).join(',') : ''}`;
  let slot = cacheable ? dropperCache.get(ds) : undefined;
  if (cacheable) {
    const gen = questStatusKey(log);
    if (!slot || slot.gen !== gen) {
      slot = { gen, hits: new Map() };
      dropperCache.set(ds, slot);
    }
    const hit = slot.hits.get(cacheKey);
    // Callers only read the result (iterate / .length / [0]) — the array is shared.
    if (hit) return hit;
  }
  const snapshot = lootSnap(log, level, auras);
  const index = huntableDroppers(ds);
  const farmLevels = index.farmLevel;
  const farmRanks = index.farmRank;
  const scored: { ce: number; chance: number; level: number; rank: number }[] = [];
  for (const ce of huntableCandidates(ds, itemId)) {
    const cl = farmLevels.get(ce) ?? 0;
    if (bandAnchor > 0) {
      // Same high slack as outdoor huntable / farm filter (KI-786/800/826).
      if (cl > 0 && cl > bandAnchor + FARM_LEVEL_HI_SLACK) continue;
    }
    const chance = lootChanceWithSnap(ds, ce, itemId, snapshot);
    if (chance <= 0) continue;
    scored.push({ ce, chance, level: cl, rank: farmRanks.get(ce) ?? 0 });
  }
  // Floor from the item's WHOLE table, the way huntableQuests reads it. A max over this banded
  // subset collapses the floor and hands back the 0.02% row the hunt gate then refuses.
  const floor = dropperNoiseFloor(ds, itemId, snapshot);
  const rankLevel = (level != null && level > 0) ? level : bandAnchor;
  const out = scored
    .filter((s) => s.chance >= floor)
    .sort((a, b) => compareQuestDroppers(a, b, rankLevel) || a.ce - b.ce)
    .map((s) => s.ce);
  slot?.hits.set(cacheKey, out);
  return out;
}

// True when this creature's loot can yield the item under the condition snapshot, at any chance. Do not
// use it alone to pick: the fight selection ranks by level closeness and chance first.
export function creatureDropsItem(
  ds: DataStore,
  creatureEntry: number,
  itemId: number,
  log?: QuestLog,
  level?: number,
  auras?: readonly number[],
): boolean {
  return lootChanceForItem(ds, creatureEntry, itemId, log, level, auras) > 0;
}

// The zones where the player can advance this quest's remaining work — a kill spawn, an item dropper,
// an object or a talk ender. Empty when it is unsolvable with baked data.
export function acquisitionZonesForQuest(
  ds: DataStore,
  quest: QuestDef,
  qs: QuestState,
  inv?: Inventory,
  log?: QuestLog,
  level?: number,
  auras?: readonly number[],
): string[] {
  const zones = new Set<string>();
  const snapshot = lootSnap(log, level, auras);
  // Kill targets still needed → creature spawn zones.
  for (const kt of quest.killTargets ?? []) {
    if ((qs.kills[String(kt.creatureEntry)] ?? 0) < kt.count) {
      const entries = corpseUseSummonedEntries(ds, quest).includes(kt.creatureEntry)
        ? corpseUseFarmEntries(ds, quest)
        : [kt.creatureEntry];
      for (const ce of entries) {
        for (const z of spawnZonesForCreature(ds, ce)) zones.add(z);
      }
    }
  }
  // Item targets still needed → dropper spawn zones (condition-gated reverse index).
  for (const it of quest.itemTargets ?? []) {
    if (inv && countItem(inv, it.item) >= it.count) continue;
    for (const ce of droppersForItem(ds, it.item, log, level, quest.questLevel, auras)) {
      for (const z of spawnZonesForCreature(ds, ce)) zones.add(z);
    }
    for (const zid of vendorZonesForItem(ds, it.item)) zones.add(zid);
    // Item objectives often come from quest-gated CHEST loot rather than a creature, so a zone listing
    // a gameobject whose table yields the item is an acquisition zone too. World-chest group loot is not.
    const yields = (key: number | string): boolean =>
      ds.lootHasItem(key, it.item)
      && ds.lootTable(key).some((d) =>
        lootRowIsQuestItemSource(d, it.item) && lootDropAllowed(ds, d.conditionId, snapshot));
    for (const z of ds.zones()) {
      for (const ge of z.objects ?? []) {
        const go = ds.gameObject(ge);
        if (!go?.lootId) continue;
        if (yields(`go:${go.lootId}`)) {
          zones.add(z.id);
          break;
        }
      }
    }
  }
  // Object targets: zones that list the GO, else ender/starter zones as a soft hint.
  for (const ot of quest.objectTargets ?? []) {
    const cur = (qs.objects || {})[String(ot.objectEntry)] ?? 0;
    if (cur >= ot.count) continue;
    let found = false;
    for (const z of ds.zones()) {
      if ((z.objects ?? []).includes(ot.objectEntry)) {
        zones.add(z.id);
        found = true;
      }
    }
    if (!found) {
      for (const z of quest.enderZones ?? []) zones.add(z);
      for (const z of quest.starterZones ?? []) zones.add(z);
    }
  }
  // Talk / deliver: ender zone is the completion zone (QI2.5 same-zone rule).
  // Empty enderZones still have a home: the starter zone (Welcome to the Jungle / Barnil).
  if (isTalkToNpcQuest(quest) && !talkMet(qs, quest)) {
    const enders = quest.enderZones ?? [];
    if (enders.length > 0) {
      for (const z of enders) zones.add(z);
    } else {
      for (const z of quest.starterZones ?? []) zones.add(z);
    }
  }
  if (isDeliverQuest(quest) && inv && itemsMet(quest, inv) && !talkMet(qs, quest)) {
    for (const z of quest.enderZones ?? []) zones.add(z);
  }
  return [...zones];
}

/** Instance name for a map id, cutting a shared map's wing suffix the way instanceForCreature does. */
function instanceNameForMap(ds: DataStore, mapId: number): string | undefined {
  const onMap = ds.instances().filter((i) => i.mapId === mapId);
  if (onMap.length === 0) return undefined;
  if (onMap.length === 1) return onMap[0]!.name;
  const cut = onMap[0]!.name.search(/ - | \(/);
  if (cut > 0) {
    const shared = onMap[0]!.name.slice(0, cut);
    if (onMap.every((i) => i.name.startsWith(shared))) return shared;
  }
  // Wings with no shared prefix (Lower / Upper Blackrock Spire): name both rather than "a dungeon".
  return onMap.map((i) => i.name).join(' / ');
}

// Why a GO-ender quest is out of the outdoor autoquester's reach, or null when the GameObject is on
// a baked zone.objects list. The GO Use is its only credit path (questlog.ts:1295 refuses the talk).
export function goEnderOutOfReach(ds: DataStore, quest: QuestDef): string | null {
  if (!hasGoEnder(quest)) return null;
  const entries = [quest.goEnder ?? 0, ...(quest.goEnderEntries ?? [])].filter((e) => e > 0);
  if (entries.length === 0) return null;
  for (const z of ds.zones()) {
    if ((z.objects ?? []).some((o) => entries.includes(o))) return null;
  }
  for (const e of entries) {
    const spawn = firstDungeonGameObjectForEntry(e);
    if (!spawn) continue;
    const goName = ds.gameObject(e)?.name ?? spawn.name;
    const inst = instanceNameForMap(ds, spawn.map);
    return `"${quest.title}" ends at ${goName}${inst ? ` inside ${inst}` : ' inside a dungeon'}, Auto Quest leaves it to you`;
  }
  const e0 = entries[0]!;
  const nm = ds.gameObject(e0)?.name ?? `Object#${e0}`;
  return `ender-not-in-world: "${quest.title}" ends at ${nm}, which no baked zone.objects list carries`;
}

// An honest skip or travel hint for an active quest that cannot advance here, never claiming complete
// while work remains. `noPath` marks a baked-data ABSENCE, which waiting or walking cannot fix.
export function questWorkSkipReason(
  ds: DataStore,
  quest: QuestDef,
  qs: QuestState,
  inv: Inventory,
  currentZone: string,
  log?: QuestLog,
  level?: number,
  auras?: readonly number[],
): { reason: string; routeZone?: string; noPath?: boolean } {
  if (questComplete(quest, qs, inv)) {
    const enders = quest.enderZones ?? [];
    if (enders.length > 0 && !enders.includes(currentZone)) {
      return {
        reason: `Turn in "${quest.title}" in ${enders.map((z) => ds.zone(z)?.name ?? z).join(' / ')}`,
        routeZone: enders[0],
      };
    }
    return { reason: `"${quest.title}" is ready to turn in` };
  }

  // Reputation objective: Auto Quest has no rep-grinding step, so it parks rather than reporting a
  // false "Quest complete!" (questsWithWork saw no trackable and dropped the quest entirely).
  const rep = quest.repObjective;
  if (rep && (rep.value || 0) > 0) {
    const fname = ds.faction(rep.faction)?.name ?? `faction ${rep.faction}`;
    return {
      reason: `"${quest.title}" needs ${fname} standing, which Auto Quest does not grind`,
      noPath: true,
    };
  }

  // Talk / deliver not in ender zone.
  if (isTalkToNpcQuest(quest) && !talkMet(qs, quest)) {
    // The GO Use is the only credit path a GO-ender quest has; an unreachable one is noPath, so the
    // planner parks it instead of ending the run on a speak that can never land.
    const outOfReach = goEnderOutOfReach(ds, quest);
    if (outOfReach) return { reason: outOfReach, noPath: true };
    const enders = quest.enderZones ?? [];
    const homes = enders.length > 0 ? enders : (quest.starterZones ?? []);
    if (homes.length === 0) {
      const npc = (quest.enderName ?? '').trim() || (quest.starterName ?? '').trim();
      if (npc) {
        return { reason: `"${quest.title}" needs talk credit with ${npc}` };
      }
      return {
        reason: `"${quest.title}" needs talk credit but has no baked enderZones (scripted/QI4?)`,
        noPath: true,
      };
    }
    if (!homes.includes(currentZone)) {
      return {
        reason: `Talk for "${quest.title}" needs ${homes.map((z) => ds.zone(z)?.name ?? z).join(' / ')}`,
        routeZone: homes[0],
      };
    }
    const goEnder = goEnderEntryOf(quest);
    if (goEnder != null) {
      return {
        reason: `"${quest.title}" needs ${ds.gameObject(goEnder)?.name ?? `Object#${goEnder}`} opened in ${ds.zone(currentZone)?.name ?? currentZone}`,
      };
    }
    return { reason: `"${quest.title}" talk objective not yet credited in ${currentZone}` };
  }
  if (isDeliverQuest(quest)) {
    if (!itemsMet(quest, inv)) {
      const missing = (quest.itemTargets ?? []).filter((it) => countItem(inv, it.item) < it.count);
      const item = missing[0];
      if (item) {
        const droppers = droppersForItem(ds, item.item, log, level, quest.questLevel, auras);
        const vendorZones = vendorZonesForItem(ds, item.item);
        if (droppers.length === 0) {
          if (vendorZones.length > 0) {
            const route = vendorZones.includes(currentZone) ? undefined : vendorZones[0];
            return {
              reason: `"${quest.title}" needs ${ds.item(item.item)?.name ?? item.item} from a vendor${route ? ` in ${ds.zone(route)?.name ?? route}` : ''}`,
              routeZone: route,
            };
          }
          // A container holds it: questHasBakedPath already accepts on this source, so the skip must
          // route to it rather than call the quest unfinishable. Cite: doQuest.ts itemGoStep.
          const goSources = goLootSourcesForItem(ds, item.item, log ?? { quests: [] }, level ?? 1, auras);
          if (goSources.length > 0) {
            const iname = ds.item(item.item)?.name ?? String(item.item);
            // Every container is locked: name what opens it the way the objectTarget branch does,
            // instead of routing to a chest nothing in the run can open.
            const gate = containerGateForSources(ds, goSources, inv);
            if (gate) {
              return {
                reason: `"${quest.title}" needs ${iname} from ${gate.goName}, which requires ${gate.need}`,
                noPath: true,
              };
            }
            const goZones = [...new Set(goSources.map((g) => g.zoneId))];
            const route = goZones.includes(currentZone) ? undefined : goZones[0];
            return {
              reason: `"${quest.title}" needs ${iname} from a container${route ? ` in ${ds.zone(route)?.name ?? route}` : ` in ${ds.zone(currentZone)?.name ?? currentZone}`}`,
              routeZone: route,
            };
          }
          return {
            reason: `"${quest.title}" needs ${ds.item(item.item)?.name ?? item.item} but no condition-satisfied dropper is baked`,
            noPath: true,
          };
        }
        const zid = spawnZonesForCreature(ds, droppers[0])[0];
        return {
          reason: `"${quest.title}" needs ${ds.item(item.item)?.name ?? item.item} from ${ds.creature(droppers[0])?.name ?? droppers[0]}${zid ? ` (${ds.zone(zid)?.name ?? zid})` : ''}`,
          routeZone: zid,
        };
      }
    }
    const enders = quest.enderZones ?? [];
    if (enders.length > 0 && !enders.includes(currentZone)) {
      return {
        reason: `Deliver "${quest.title}" in ${enders.map((z) => ds.zone(z)?.name ?? z).join(' / ')}`,
        routeZone: enders[0],
      };
    }
  }

  // Kill targets elsewhere. Type-2 corpse-use farms the script-target corpse, not the summon.
  for (const kt of quest.killTargets ?? []) {
    if ((qs.kills[String(kt.creatureEntry)] ?? 0) >= kt.count) continue;
    const farm = corpseUseSummonedEntries(ds, quest).includes(kt.creatureEntry)
      ? corpseUseFarmEntries(ds, quest)
      : [kt.creatureEntry];
    const zids = [...new Set(farm.flatMap((ce) => spawnZonesForCreature(ds, ce)))];
    // Script credit, not a kill: no zone hosts a pull that can advance it, so never route for one.
    if (farm.length > 0 && farm.every((ce) => isScriptCreditOnlyTarget(ds, ce, log))) {
      const nm = creatureObjectiveLabel(
        quest,
        kt.creatureEntry,
        ds.creature(kt.creatureEntry)?.name ?? String(kt.creatureEntry),
      );
      return {
        reason: `"${quest.title}" credits ${nm} by script, not by a kill Auto Quest can make`,
        noPath: true,
      };
    }
    if (!zids.includes(currentZone)) {
      const home = (quest.starterZones ?? []).find((z) => z !== currentZone) ?? (quest.starterZones ?? [])[0];
      const route = zids[0] ?? home;
      return {
        reason: `"${quest.title}" needs ${creatureObjectiveLabel(quest, kt.creatureEntry, ds.creature(kt.creatureEntry)?.name ?? String(kt.creatureEntry))} in ${zids.map((z) => ds.zone(z)?.name ?? z).join(' / ') || (route ? (ds.zone(route)?.name ?? route) : 'an unknown zone')}`,
        routeZone: route,
        noPath: zids.length === 0 && !home,
      };
    }
    return {
      reason: `"${quest.title}" still needs ${creatureObjectiveLabel(quest, kt.creatureEntry, ds.creature(kt.creatureEntry)?.name ?? String(kt.creatureEntry))} here but none are huntable (greyed / filtered)`,
    };
  }

  // Item targets with no local condition-satisfied dropper.
  for (const it of quest.itemTargets ?? []) {
    if (countItem(inv, it.item) >= it.count) continue;
    const droppers = droppersForItem(ds, it.item, log, level, quest.questLevel, auras);
    const itemName = ds.item(it.item)?.name ?? String(it.item);
    const vendorZones = vendorZonesForItem(ds, it.item);
    if (droppers.length === 0) {
      if (vendorZones.length > 0) {
        const route = vendorZones.includes(currentZone) ? undefined : vendorZones[0];
        return {
          reason: `"${quest.title}" needs ${itemName} from a vendor${route ? ` in ${ds.zone(route)?.name ?? route}` : ''}`,
          routeZone: route,
        };
      }
      // Same container question the deliver branch asks: itemHasBakedSource accepts on GO loot, so
      // this line must route to the chest or name its lock rather than claim nothing is baked.
      const goSources = goLootSourcesForItem(ds, it.item, log ?? { quests: [] }, level ?? 1, auras);
      if (goSources.length > 0) {
        const gate = containerGateForSources(ds, goSources, inv);
        if (gate) {
          return {
            reason: `"${quest.title}" needs ${itemName} from ${gate.goName}, which requires ${gate.need}`,
            noPath: true,
          };
        }
        const goZones = [...new Set(goSources.map((g) => g.zoneId))];
        const route = goZones.includes(currentZone) ? undefined : goZones[0];
        return {
          reason: `"${quest.title}" needs ${itemName} from a container in ${ds.zone(route ?? currentZone)?.name ?? (route ?? currentZone)}`,
          routeZone: route,
        };
      }
      return {
        reason: `"${quest.title}" needs ${itemName} but no condition-satisfied dropper is baked (prereq or QI4 script?)`,
        noPath: true,
      };
    }
    const local = droppers.some((ce) => (ds.zone(currentZone)?.huntable ?? []).includes(ce));
    if (!local) {
      const zid = spawnZonesForCreature(ds, droppers[0])[0];
      return {
        reason: `"${quest.title}" needs ${itemName} from ${ds.creature(droppers[0])?.name ?? droppers[0]}${zid ? ` in ${ds.zone(zid)?.name ?? zid}` : ''}`,
        routeZone: zid,
      };
    }
    // Droppers live here but the planner still could not pull them (greyed/red-filtered,
    // empty hunt list, or not in view.hunt). Never claim "no acquisition path".
    return {
      reason: `"${quest.title}" still needs ${itemName} from local droppers (${droppers
        .slice(0, 3)
        .map((ce) => ds.creature(ce)?.name ?? ce)
        .join(', ')}) but none are currently huntable here`,
    };
  }

  for (const ot of quest.objectTargets ?? []) {
    const cur = (qs.objects || {})[String(ot.objectEntry)] ?? 0;
    if (cur >= ot.count) continue;
    const go = ds.gameObject(ot.objectEntry);
    const name = go?.name ?? `Object#${ot.objectEntry}`;
    if (!go) {
      return {
        reason: `ender-not-in-world: "${quest.title}" needs ${name} but no GameObject template is baked`,
        noPath: true,
      };
    }
    // The lock gate: a free-open case passes, a missing key skips honestly with the key's name and its
    // route when a dropper is baked, and a hard skill gate names the skill and value.
    if (go.lockId && inv) {
      const lock = ds.lock(go.lockId);
      const skillValueFor = (lockType: number): number | undefined => {
        // Planner has no combatSkills on inv-only path — skill-only hard locks still report.
        void lockType;
        return undefined;
      };
      const openFree = canOpenLock({ lock, skillValueFor });
      if (!openFree.ok) {
        const keyEntry =
          go.keyId ??
          requiredKeyItemEntry(lock);
        if (keyEntry != null && countItem(inv, keyEntry) < 1) {
          const keyName = ds.item(keyEntry)?.name ?? `item ${keyEntry}`;
          const droppers = droppersForItem(ds, keyEntry, log, level, undefined, auras);
          // Taxonomy token locked-no-key (SESSION 5) surfaces in autopilot log verbatim.
          if (droppers.length > 0) {
            const zid = spawnZonesForCreature(ds, droppers[0])[0];
            return {
              reason: `locked-no-key: "${quest.title}" needs ${name} but you lack ${keyName} (from ${ds.creature(droppers[0])?.name ?? droppers[0]}${zid ? ` in ${ds.zone(zid)?.name ?? zid}` : ''})`,
              routeZone: zid,
            };
          }
          return {
            reason: `locked-no-key: "${quest.title}" needs ${name} but you lack ${keyName}`,
          };
        }
        const hard = hardestSkillLockCase(lock);
        if (hard && openFree.reason === 'low_skill') {
          return {
            reason: `"${quest.title}" needs ${name} but requires ${hard.skillName} ${hard.skillReq}`,
          };
        }
        if (openFree.reason === 'bad_targets') {
          const keyName = keyEntry != null
            ? (ds.item(keyEntry)?.name ?? `item ${keyEntry}`)
            : 'the matching key';
          return {
            reason: `locked-no-key: "${quest.title}" needs ${name} but you lack ${keyName}`,
          };
        }
      }
    } else if (go.keyId && inv && countItem(inv, go.keyId) < 1) {
      // keyId without lock cases (legacy): still name the key.
      const keyName = ds.item(go.keyId)?.name ?? `item ${go.keyId}`;
      return {
        reason: `locked-no-key: "${quest.title}" needs ${name} but you lack ${keyName}`,
      };
    }
    const zones = acquisitionZonesForQuest(ds, quest, qs, inv, log, level, auras);
    const route = zones.find((z) => z !== currentZone) ?? zones[0];
    if (route && route !== currentZone) {
      return {
        reason: `"${quest.title}" needs ${name} in ${ds.zone(route)?.name ?? route}`,
        routeZone: route,
      };
    }
    return { reason: `"${quest.title}" still needs ${name}` };
  }

  const zones = acquisitionZonesForQuest(ds, quest, qs, inv, log, level, auras);
  const route = zones.find((z) => z !== currentZone);
  if (route) {
    return {
      reason: `"${quest.title}" has work in ${ds.zone(route)?.name ?? route}`,
      routeZone: route,
    };
  }
  if (zones.includes(currentZone)) {
    return { reason: `"${quest.title}" has remaining work here` };
  }
  return {
    reason: `"${quest.title}" has remaining work but no baked acquisition path from here`,
    noPath: true,
  };
}

// Active quests whose remaining targets or drops can still be hunted HERE. Kill objectives check
// progress and presence; item ones look for a local mob whose loot yields a need. On-level first.
export function huntableQuests(
  ds: DataStore,
  log: QuestLog,
  huntableEntries: Iterable<number>,
  inv?: Inventory,
  level?: number,
  auras?: readonly number[],
): QuestDef[] {
  const here = new Set(huntableEntries);
  const out: QuestDef[] = [];
  for (const qs of log.quests) {
    if (qs.status !== 'active') continue;
    const qd = ds.quest(qs.entry);
    if (!qd) continue;
    // A quest with every objective already met has no work left here — leave it ready to turn in. This
    // is what stops the planner re-picking a finished collect quest and crashing on an empty list.
    if (inv && questComplete(qd, qs, inv)) continue;
    const hasKillTarget = qd.killTargets.some(
      (kt) => (qs.kills[String(kt.creatureEntry)] ?? 0) < kt.count && here.has(kt.creatureEntry),
    );
    let hasTarget = hasKillTarget;
    if (!hasTarget && corpseUseSpellId(ds, qd) && corpseUseWorkRemaining(ds, qd, qs, inv)) {
      hasTarget = corpseUseFightEntries(ds, qd, qs, inv).some((e) => here.has(e));
    }
    if (!hasTarget && qd.itemTargets.length > 0) {
      // Item pickup: usable-rate droppers only. Floor is the item's best known table, not this
      // zone's pool — Searing Gorge only has the 0.02% molt rows and a local floor collapsed.
      const stillNeeded = (item: number, count: number): boolean => !inv || countItem(inv, item) < count;
      const neededItems = qd.itemTargets.filter((it) => stillNeeded(it.item, it.count));
      const snap = lootSnap(log, level, auras);
      found: for (const entry of here) {
        for (const it of neededItems) {
          const ch = lootChanceWithSnap(ds, entry, it.item, snap);
          if (ch > 0 && ch >= dropperNoiseFloor(ds, it.item, snap)) {
            hasTarget = true;
            break found;
          }
        }
      }
    }
    if (hasTarget) out.push(qd);
  }
  return out.sort((a, b) => compareQuestWorkOrder(a, b, level));
}

// Non-gray first, then closest to the player. Lowest-first travelled back to starter zones.
function compareQuestWorkOrder(a: QuestDef, b: QuestDef, playerLevel?: number): number {
  if (playerLevel != null && playerLevel > 0) {
    const aGray = difficultyTier(a.questLevel, playerLevel) === 'gray' ? 1 : 0;
    const bGray = difficultyTier(b.questLevel, playerLevel) === 'gray' ? 1 : 0;
    if (aGray !== bGray) return aGray - bGray;
    const dist = Math.abs(a.questLevel - playerLevel) - Math.abs(b.questLevel - playerLevel);
    if (dist) return dist;
  }
  return a.questLevel - b.questLevel || a.minLevel - b.minLevel || a.title.localeCompare(b.title);
}

// Every active quest with at least one unmet objective ANYWHERE — the broad twin of the huntable
// list, used to tell remaining work from travel-needed. An unmet event credit counts.
export function questsWithWork(
  ds: DataStore,
  log: QuestLog,
  inv?: Inventory,
  playerLevel?: number,
): QuestDef[] {
  const out: QuestDef[] = [];
  for (const qs of log.quests) {
    if (qs.status !== 'active') continue;
    const qd = ds.quest(qs.entry);
    if (!qd) continue;
    // Fully complete (including talk) is ready to turn in — not "work".
    if (inv && questComplete(qd, qs, inv)) continue;
    // creatureCreditTargets, not killTargets: the bake strips a friendly credit target off the slim
    // list (Guard Roberts 12423), and questComplete still tracks it, so the two must agree.
    const hasKillTarget = creatureCreditTargets(qd).some(
      (kt) => (qs.kills[String(kt.creatureEntry)] ?? 0) < kt.count,
    );
    // Item/source still needed only when inventory is known and short, or always when inv omitted.
    const hasItemTarget = inv
      ? qd.itemTargets.some((it) => countItem(inv, it.item) < it.count)
      : qd.itemTargets.length > 0;
    const hasSourceTarget = inv
      ? (qd.sourceItemTargets || []).some((it) => countItem(inv, it.item) < it.count)
      : (qd.sourceItemTargets || []).length > 0;
    const hasObjTarget = (qd.objectTargets || []).some(
      (ot) => (((qs as any).objects || (qs.objects || {}))[String(ot.objectEntry)] ?? 0) < ot.count,
    );
    const hasTalk = isTalkToNpcQuest(qd) && !talkMet(qs, qd);
    const hasDeliverTalk =
      isDeliverQuest(qd) && inv && itemsMet(qd, inv) && !talkMet(qs, qd);
    // Exploration / scripted event credit still pending (not a free-complete).
    const hasEvent = requiresEventCredit(qd) && !exploreMet(qs, qd);
    const hasRep = !!(qd.repObjective && (qd.repObjective.value || 0) > 0);
    if (
      hasRep ||
      hasKillTarget ||
      hasItemTarget ||
      hasSourceTarget ||
      hasObjTarget ||
      hasTalk ||
      hasDeliverTalk ||
      hasEvent
    ) {
      out.push(qd);
    }
  }
  return out.sort((a, b) => compareQuestWorkOrder(a, b, playerLevel));
}

/** All quests currently in the log (active or complete, not yet turned in), with their def. */
export function trackedQuests(ds: DataStore, log: QuestLog): { quest: QuestDef; state: QuestState }[] {
  const out: { quest: QuestDef; state: QuestState }[] = [];
  for (const st of log.quests) {
    if (st.status === 'turnedIn') continue;
    const quest = ds.quest(st.entry);
    if (quest) out.push({ quest, state: st });
  }
  return out;
}

/** Log entries painted gray by `difficultyTier` — trivial, no XP. Ones ready to turn in are left
 *  out: a completable quest still pays money and items. Same tier call the log titles use. */
export function grayLogQuests(
  ds: DataStore,
  log: QuestLog,
  playerLevel: number,
): { quest: QuestDef; state: QuestState }[] {
  return trackedQuests(ds, log).filter((t) =>
    t.state.status !== 'complete' && difficultyTier(t.quest.questLevel, playerLevel) === 'gray');
}

// Quest-log entries ordered for display: ready to turn in first, then the active ones by how close
// their level is to the player's, with a low-to-high tiebreak. Each is annotated with its colour.
export function orderTracked(
  tracked: { quest: QuestDef; state: QuestState }[],
  playerLevel: number,
): { quest: QuestDef; state: QuestState; tier: DifficultyTier }[] {
  return tracked
    .map((t) => ({ ...t, tier: difficultyTier(t.quest.questLevel, playerLevel) }))
    .sort((a, b) => {
      const ar = a.state.status === 'complete' ? 0 : 1;
      const br = b.state.status === 'complete' ? 0 : 1;
      return (
        ar - br ||
        Math.abs(a.quest.questLevel - playerLevel) - Math.abs(b.quest.questLevel - playerLevel) ||
        a.quest.questLevel - b.quest.questLevel ||
        a.quest.title.localeCompare(b.quest.title)
      );
    });
}

/** Quest Log zone header. ZoneOrSort > 0 is AreaTable; else starter/ender ZoneDef.name. Cite: ObjectMgr.cpp:4320 ZoneOrSort; QuestLogFrame.lua GetQuestLogTitle isHeader. */
export function questLogZoneHeader(ds: DataStore, quest: QuestDef): { id: string; name: string } | null {
  const zos = (quest.rawZoneOrSort ?? 0) | 0;
  if (zos > 0) {
    for (const z of ds.zones()) {
      if ((z.areaId ?? 0) === zos) return { id: z.id, name: z.name };
    }
  }
  for (const id of [...(quest.starterZones ?? []), ...(quest.enderZones ?? [])]) {
    const z = ds.zone(id);
    if (z) return { id: z.id, name: z.name };
  }
  for (const z of ds.zones()) {
    if (z.quests.includes(quest.entry)) return { id: z.id, name: z.name };
  }
  return null;
}

const vendorSoldCache = new WeakMap<object, Set<number>>();
const vendorZonesCache = new WeakMap<object, Map<number, string[]>>();

function vendorSoldItems(ds: DataStore): Set<number> {
  let set = vendorSoldCache.get(ds);
  if (set) return set;
  set = new Set<number>();
  for (const v of ds.vendors()) {
    for (const item of v.items) set.add(item);
  }
  vendorSoldCache.set(ds, set);
  return set;
}

function itemSoldByVendor(ds: DataStore, itemId: number): boolean {
  return vendorSoldItems(ds).has(itemId);
}

function vendorZonesForItem(ds: DataStore, itemId: number): string[] {
  let idx = vendorZonesCache.get(ds);
  if (!idx) {
    idx = new Map();
    for (const z of ds.zones()) {
      const entries = [
        ...(z.vendors ?? []),
        ...(z.innkeepers ?? []).map((i) => i.entry),
      ];
      const seen = new Set<number>();
      for (const e of entries) {
        if (!(e > 0) || seen.has(e)) continue;
        seen.add(e);
        const v = ds.vendor(e);
        if (!v) continue;
        for (const item of v.items) {
          const list = idx.get(item);
          if (list) {
            if (!list.includes(z.id)) list.push(z.id);
          } else {
            idx.set(item, [z.id]);
          }
        }
      }
    }
    vendorZonesCache.set(ds, idx);
  }
  return idx.get(itemId) ?? [];
}

/** True when a GO listed on some zone.objects can yield `itemId` under loot conditions. */
// Zones whose baked objects hold a container that yields this quest item (grape buckets, pumpkins).
// The same rows doQuest.ts itemGoStep opens, so the skip line and the step agree on the source.
// What every one of these containers demands to open, or null when any of them opens free. The
// objectTarget branch already reports both shapes; the item branch reported neither.
// Cite: openLock.ts hardestSkillLockCase / requiredKeyItemEntry.
function containerGateForSources(
  ds: DataStore,
  sources: readonly { goEntry: number }[],
  inv: Inventory,
): { goName: string; need: string } | null {
  let gate: { goName: string; need: string } | null = null;
  for (const src of sources) {
    const go = ds.gameObject(src.goEntry);
    if (!go?.lockId && !go?.keyId) return null;
    const lock = go.lockId != null ? ds.lock(go.lockId) : undefined;
    if (lock && canOpenLock({ lock, skillValueFor: () => undefined }).ok) return null;
    const keyEntry = go.keyId ?? (lock ? requiredKeyItemEntry(lock) : undefined);
    if (keyEntry != null) {
      if (countItem(inv, keyEntry) > 0) return null;
      gate ??= { goName: go.name, need: ds.item(keyEntry)?.name ?? `item ${keyEntry}` };
      continue;
    }
    const hard = lock ? hardestSkillLockCase(lock) : undefined;
    if (!hard) return null;
    gate ??= { goName: go.name, need: `${hard.skillName} ${hard.skillReq}` };
  }
  return gate;
}

export function goLootSourcesForItem(
  ds: DataStore,
  itemId: number,
  log: QuestLog,
  level: number,
  auras?: readonly number[],
): { zoneId: string; goEntry: number }[] {
  const snap = lootSnap(log, level, auras);
  const yields = (key: number | string): boolean =>
    ds.lootHasItem(key, itemId)
    && ds.lootTable(key).some((d) =>
      lootRowIsQuestItemSource(d, itemId) && lootDropAllowed(ds, d.conditionId, snap));
  const out: { zoneId: string; goEntry: number }[] = [];
  for (const z of ds.zones()) {
    for (const ge of z.objects ?? []) {
      const go = ds.gameObject(ge);
      if (!go?.lootId) continue;
      if (yields(`go:${go.lootId}`)) out.push({ zoneId: z.id, goEntry: ge });
    }
  }
  return out;
}

export function goLootZonesForItem(
  ds: DataStore,
  itemId: number,
  log: QuestLog,
  level: number,
  auras?: readonly number[],
): string[] {
  return [...new Set(goLootSourcesForItem(ds, itemId, log, level, auras).map((s) => s.zoneId))];
}

function itemHasGoLootSource(
  ds: DataStore,
  itemId: number,
  log: QuestLog,
  level: number,
  auras?: readonly number[],
): boolean {
  return goLootZonesForItem(ds, itemId, log, level, auras).length > 0;
}

// Instance / battleground creatures grouped by lootId, so an item objective can answer "run it
// inside X" the way the kill-objective branch already does. Built once per store, on first miss.
const instanceLootIndex = new WeakMap<DataStore, { gen: number; byLootId: Map<number, number[]> }>();

function instanceDroppersForItem(ds: DataStore, itemId: number): number[] {
  const gen = ds.zoneWorldGen();
  let slot = instanceLootIndex.get(ds);
  let byLootId = slot && slot.gen === gen ? slot.byLootId : null;
  if (!byLootId) {
    byLootId = new Map<number, number[]>();
    for (const cr of ds.creatures()) {
      const lootId = cr.lootId ?? 0;
      if (!lootId) continue;
      if (!ds.isInstanceCreature(cr.entry) && !ds.isBattlegroundCreature(cr.entry)) continue;
      let list = byLootId.get(lootId);
      if (list === undefined) byLootId.set(lootId, (list = []));
      list.push(cr.entry);
    }
    slot = { gen, byLootId };
    instanceLootIndex.set(ds, slot);
  }
  const out: number[] = [];
  for (const key of ds.lootKeysForItem(itemId)) {
    if (typeof key !== 'number') continue;
    if (!ds.lootHasItem(key, itemId)) continue;
    for (const ce of byLootId.get(key) ?? []) if (!out.includes(ce)) out.push(ce);
  }
  return out;
}

function itemHasBakedSource(
  ds: DataStore,
  itemId: number,
  log: QuestLog,
  level: number,
  questLevel: number,
  quest?: QuestDef,
  auras?: readonly number[],
): boolean {
  if (droppersForItem(ds, itemId, log, level, questLevel, auras).length > 0) return true;
  if (itemHasGoLootSource(ds, itemId, log, level, auras)) return true;
  if (itemSoldByVendor(ds, itemId)) return true;
  if (quest?.srcItem?.item === itemId && !isWorldLootSrcItemObjective(quest)) return true;
  if (quest?.startedByItem === itemId) return true;
  for (const ce of quest?.farm ?? []) {
    if (spawnZonesForCreature(ds, ce).length === 0) continue;
    if (lootChanceForItem(ds, ce, itemId, log, level, auras) > 0) return true;
  }
  return false;
}

// Whether Auto Quest can finish this quest on baked data: every remaining kill and item objective needs
// a source. A hint for the first item is not enough — the route then dies on the second.
export function questHasBakedPath(
  ds: DataStore,
  quest: QuestDef,
  log: QuestLog,
  inv: Inventory,
  currentZone: string,
  level: number,
  auras?: readonly number[],
): { ok: true } | { ok: false; reason: string } {
  const dummy = accept(
    { quests: log.quests.filter((q) => q.entry !== quest.entry) },
    quest,
  );
  const qs = getQuest(dummy, quest.entry);
  if (!qs) return { ok: false, reason: `"${quest.title}" cannot be taken` };
  let bag = inv;
  if (shouldGrantSrcItemOnAccept(quest) && quest.srcItem && quest.srcItem.item > 0) {
    const item = quest.srcItem.item;
    const need = quest.srcItem.count > 0 ? quest.srcItem.count : 1;
    const have = countItem(bag, item);
    if (have < need) {
      bag = addItem(bag, item, need - have, ds.item(item)?.stackable ?? 1);
    }
  }
  if (questComplete(quest, qs, bag)) return { ok: true };

  if (isTalkToNpcQuest(quest) || isEventTalkQuest(quest)) {
    const outOfReach = goEnderOutOfReach(ds, quest);
    if (outOfReach) return { ok: false, reason: outOfReach };
    const npc = (quest.enderName ?? '').trim() || (quest.starterName ?? '').trim();
    if (npc || (quest.enderZones?.length ?? 0) > 0 || (quest.starterZones?.length ?? 0) > 0) {
      return { ok: true };
    }
  }

  for (const kt of quest.killTargets ?? []) {
    if ((qs.kills[String(kt.creatureEntry)] ?? 0) >= kt.count) continue;
    const farm = corpseUseSummonedEntries(ds, quest).includes(kt.creatureEntry)
      ? corpseUseFarmEntries(ds, quest)
      : [kt.creatureEntry];
    if (farm.length > 0 && farm.every((ce) => isScriptCreditOnlyTarget(ds, ce, log))) {
      const nm = creatureObjectiveLabel(
        quest,
        kt.creatureEntry,
        ds.creature(kt.creatureEntry)?.name ?? String(kt.creatureEntry),
      );
      return { ok: false, reason: `"${quest.title}" credits ${nm} by script, Auto Quest leaves it to you` };
    }
    const zids = [...new Set(farm.flatMap((ce) => spawnZonesForCreature(ds, ce)))];
    if (zids.length === 0) {
      // Instance-only target: no world spawn and no outdoor pull. The starterZones escape
      // below would otherwise call every dungeon quest walkable (318 of 1390 fight steps).
      if (farm.every((ce) => ds.isInstanceCreature(ce) || ds.isBattlegroundCreature(ce))) {
        const bg = ds.battlegroundForCreature(kt.creatureEntry);
        if (bg) {
          return { ok: false, reason: `"${quest.title}" is a battleground quest, run it inside ${bg}` };
        }
        const inst = ds.instanceForCreature(kt.creatureEntry)?.name;
        return {
          ok: false,
          reason: `"${quest.title}" is a dungeon quest${inst ? `, run it inside ${inst}` : ''}`,
        };
      }
      const home = quest.starterZones ?? [];
      if (!(ds.creature(kt.creatureEntry) && home.length > 0)) {
        const nm = creatureObjectiveLabel(
          quest,
          kt.creatureEntry,
          ds.creature(kt.creatureEntry)?.name ?? String(kt.creatureEntry),
        );
        return { ok: false, reason: `"${quest.title}" needs ${nm} in an unknown zone` };
      }
    }
  }

  const stillNeeded = [
    ...(quest.itemTargets ?? []),
    ...(quest.sourceItemTargets ?? []),
  ];
  for (const it of stillNeeded) {
    if (countItem(bag, it.item) >= it.count) continue;
    if (itemHasBakedSource(ds, it.item, dummy, level, quest.questLevel, quest, auras)) continue;
    const itemName = ds.item(it.item)?.name ?? String(it.item);
    // Same answer the kill branch gives: the drop exists, it is just behind an instance door.
    const inside = instanceDroppersForItem(ds, it.item);
    if (inside.length > 0) {
      const bg = inside.map((ce) => ds.battlegroundForCreature(ce)).find(Boolean);
      if (bg) {
        return { ok: false, reason: `"${quest.title}" is a battleground quest, run it inside ${bg}` };
      }
      const inst = inside.map((ce) => ds.instanceForCreature(ce)?.name).find(Boolean);
      return {
        ok: false,
        reason: `"${quest.title}" is a dungeon quest${inst ? `, run it inside ${inst}` : ''}`,
      };
    }
    return {
      ok: false,
      reason: `"${quest.title}" needs ${itemName} but no condition-satisfied dropper is baked`,
    };
  }

  // Escort / empty explore: finishEscort is the baked end-condition (FO6). Mixed
  // exploreTriggers still count as a path (zone-enter or the same event credit).
  if (canDegradedAutoFinish(quest) || (quest.exploreTriggers?.length ?? 0) > 0) return { ok: true };

  const skip = questWorkSkipReason(ds, quest, qs, bag, currentZone, dummy, level, auras);
  if (skip.routeZone) return { ok: true };
  if (!skip.noPath) return { ok: true };
  const zones = acquisitionZonesForQuest(ds, quest, qs, bag, dummy, level, auras);
  if (zones.length > 0) return { ok: true };
  return { ok: false, reason: skip.reason };
}
