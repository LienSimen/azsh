// A companion's OWN quest log: the same QuestLog shape and the same Player.cpp Satisfy* gates the
// player runs, read against THEIR level, class, race and standings. Pure — no state writes here.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef, QuestDef } from '../../data/schema.ts';
import { getStanding } from '../creature/reputation.ts';
import type { Inventory } from '../items/inventory.ts';
import { emptyInventory } from '../items/inventory.ts';
import {
  canTakeQuest,
  getQuest,
  isItemStartedQuest,
  questComplete,
  recordSameZoneDeliver,
  type QuestLog,
  type QuestPlayerSnapshot,
  type QuestStatus,
} from '../quests/questlog.ts';
import { companionCharacter, companionLevel, type Companion } from './squad.ts';

/** This companion's log; absent (every pre-feature save) reads as empty. */
export function companionQuestLog(comp: Pick<Companion, 'questLog'>): QuestLog {
  return comp.questLog ?? { quests: [] };
}

/** Their bags; absent reads as empty, same as everywhere else that touches comp.bags. */
export function companionBags(comp: Pick<Companion, 'bags'>): Inventory {
  return comp.bags ?? emptyInventory();
}

// The player's acceptQuest snapshot (engine/game/questLog.ts:186) retargeted to one companion.
// combatSkills are not stored per body, so skillValue reads 0 — no ZG/AQ/T3 quest gates on one.
export function companionQuestSnapshot(
  comp: Companion,
  playerLevel: number,
  ds: DataStore,
): QuestPlayerSnapshot {
  const lvl = companionLevel(comp, playerLevel);
  const char = companionCharacter(comp, lvl, ds);
  const log = companionQuestLog(comp);
  return {
    level: lvl,
    classId: comp.cls,
    raceId: comp.race,
    skillValue: () => 0,
    standingFor: (factionId: number) => {
      const f = ds.faction(factionId);
      if (!f) return 0;
      return getStanding(char.reputations, f, char.race, char.cls);
    },
    questStatus: (id: number): QuestStatus | 'none' => getQuest(log, id)?.status ?? 'none',
    hasActiveTimedQuest: log.quests.some((qq) => {
      if (qq.status === 'turnedIn' || qq.status === 'failed') return false;
      const qd = ds.quest(qq.entry);
      return !!(qd?.limitTime && qd.limitTime > 0);
    }),
  };
}

// ---- item → quest reverse index ---------------------------------------------
// Quests attach lazily, so the memo keys on zoneWorldGen() — dataStore.ts:1167 does the same.

interface QuestItemIndex {
  gen: number;
  /** item entry → quests that item STARTS (quest.startedByItem / item.startQuest). */
  starts: Map<number, number[]>;
  /** item entry → quests that consume it as an objective (quest.itemTargets). */
  feeds: Map<number, number[]>;
}

const indexByStore = new WeakMap<DataStore, QuestItemIndex>();

function push(map: Map<number, number[]>, key: number, value: number): void {
  const hit = map.get(key);
  if (hit) hit.push(value);
  else map.set(key, [value]);
}

function questItemIndex(ds: DataStore): QuestItemIndex {
  const gen = ds.zoneWorldGen();
  const hit = indexByStore.get(ds);
  if (hit && hit.gen === gen) return hit;
  const built: QuestItemIndex = { gen, starts: new Map(), feeds: new Map() };
  for (const q of ds.quests()) {
    if (q.inactive) continue;
    const start = q.startedByItem ?? 0;
    if (start > 0) push(built.starts, start, q.entry);
    for (const t of q.itemTargets ?? []) {
      if (t.item > 0) push(built.feeds, t.item, q.entry);
    }
  }
  indexByStore.set(ds, built);
  return built;
}

/** Quests this item starts. Empty for anything that is not a "This Item Begins a Quest" row. */
export function questsStartedByItem(itemEntry: number, ds: DataStore): number[] {
  return questItemIndex(ds).starts.get(itemEntry) ?? [];
}

/** Quests that consume this item as an objective — the Paragon / Desecrated / Coin turn-ins. */
export function questsFedByItem(itemEntry: number, ds: DataStore): number[] {
  return questItemIndex(ds).feeds.get(itemEntry) ?? [];
}

/** Every quest an item is involved in, starts first. Used to price a token before handing it over. */
export function questsForItem(itemEntry: number, ds: DataStore): number[] {
  return [...questsStartedByItem(itemEntry, ds), ...questsFedByItem(itemEntry, ds)];
}

// ---- where a companion may act ----------------------------------------------

/** Party location for the offer gate: the open-world zone, or the instance run you are inside. */
export interface CompanionQuestPlace {
  zoneId: string;
  /** InstanceDef.quests of the run in progress — being in the run IS being at the giver. */
  instanceQuests?: readonly number[];
}

// Accept-side zone gate. Item-started quests bypass it: the item IS the giver, exactly as
// engine/game/questLog.ts:236 has it for the player.
function canReachGiver(q: QuestDef, place: CompanionQuestPlace): boolean {
  if (isItemStartedQuest(q)) return true;
  if (place.instanceQuests?.includes(q.entry)) return true;
  const starters = q.starterZones ?? [];
  if (starters.length === 0) return true;
  return starters.includes(place.zoneId);
}

// Turn-in zone gate. A quest with no baked enderZones is not location-locked (the same
// degrade-gracefully rule autopilot/plan.ts:884 applies to the player's deliver step).
function canReachEnder(q: QuestDef, place: CompanionQuestPlace): boolean {
  if (place.instanceQuests?.includes(q.entry)) return true;
  const enders = q.enderZones ?? [];
  if (enders.length === 0) return true;
  return enders.includes(place.zoneId);
}

/** One thing a companion can do with a quest right here. */
export interface CompanionQuestOffer {
  companionId: string;
  companionName: string;
  quest: number;
  title: string;
  kind: 'accept' | 'turn-in';
  /** The bag item that produced this offer, when one did. */
  itemEntry?: number;
}

// Everything ONE companion can accept or hand in at this place. Accept candidates come from their
// own bags (an item-started row) plus any instance/zone giver; turn-ins come from their own log.
export function companionQuestOffers(
  comp: Companion,
  playerLevel: number,
  place: CompanionQuestPlace,
  ds: DataStore,
): CompanionQuestOffer[] {
  if (comp.mission) return [];
  const snap = companionQuestSnapshot(comp, playerLevel, ds);
  const bags = companionBags(comp);
  // Standing in the ender zone with the goods is the deliver credit, so read the log as the
  // turn-in will (companionQuestActions.ts) — otherwise a finished deliver never offers.
  const log = recordSameZoneDeliver(companionQuestLog(comp), place.zoneId, (e) => ds.quest(e), bags);
  const out: CompanionQuestOffer[] = [];
  const seen = new Set<number>();

  const takeable = (q: QuestDef): boolean => {
    const prevMissing = !!(q.prevQuest && !ds.quest(q.prevQuest));
    return canTakeQuest(snap, q, {
      prevQuestMissingFromData: prevMissing,
      questDefFor: (id) => ds.quest(id),
    });
  };

  // An item in their bags that a quest wants: the "This Item Begins a Quest" row, and the plain
  // turn-in token (a Coin, a Paragon, a Desecrated piece) whose giver stands in this zone.
  for (const stack of bags.stacks) {
    for (const entry of questsForItem(stack.item, ds)) {
      if (seen.has(entry)) continue;
      const q = ds.quest(entry);
      if (!q || !canReachGiver(q, place) || !takeable(q)) continue;
      seen.add(entry);
      out.push({
        companionId: comp.id,
        companionName: comp.name,
        quest: entry,
        title: q.title,
        kind: 'accept',
        itemEntry: stack.item,
      });
    }
  }

  for (const entry of place.instanceQuests ?? []) {
    if (seen.has(entry)) continue;
    const q = ds.quest(entry);
    if (!q || !takeable(q)) continue;
    seen.add(entry);
    out.push({ companionId: comp.id, companionName: comp.name, quest: entry, title: q.title, kind: 'accept' });
  }

  for (const st of log.quests) {
    if (st.status === 'turnedIn' || st.status === 'failed') continue;
    const q = ds.quest(st.entry);
    if (!q || !canReachEnder(q, place)) continue;
    if (!questComplete(q, st, bags, { standingFor: snap.standingFor })) continue;
    out.push({
      companionId: comp.id,
      companionName: comp.name,
      quest: st.entry,
      title: q.title,
      kind: 'turn-in',
    });
  }

  return out;
}

// ---- handing an item over ----------------------------------------------------

/** Why a companion cannot take a quest item, or that they can. */
export type CompanionQuestItemFit =
  | { ok: true; quest: number; title: string; kind: 'accept' | 'objective' }
  | { ok: false; reason: string };

// Can THIS companion use this item for a quest, ignoring where the party stands, so a bag picker can
// say so before you travel. allowClass first — itemRestrictions.ts:263.
export function companionQuestItemFit(
  it: ItemDef,
  comp: Companion,
  playerLevel: number,
  ds: DataStore,
): CompanionQuestItemFit {
  if (it.allowClass?.length && !it.allowClass.includes(comp.cls)) {
    return { ok: false, reason: 'not for their class' };
  }
  const lvl = companionLevel(comp, playerLevel);
  if ((it.requiredLevel | 0) > lvl) return { ok: false, reason: `needs level ${it.requiredLevel}` };

  const snap = companionQuestSnapshot(comp, playerLevel, ds);
  const log = companionQuestLog(comp);

  for (const entry of questsStartedByItem(it.entry, ds)) {
    const q = ds.quest(entry);
    if (!q) continue;
    const st = getQuest(log, entry)?.status;
    if (st === 'turnedIn') return { ok: false, reason: 'they have already done it' };
    if (st) return { ok: true, quest: entry, title: q.title, kind: 'objective' };
    const prevMissing = !!(q.prevQuest && !ds.quest(q.prevQuest));
    if (canTakeQuest(snap, q, { prevQuestMissingFromData: prevMissing, questDefFor: (id) => ds.quest(id) })) {
      return { ok: true, quest: entry, title: q.title, kind: 'accept' };
    }
  }

  for (const entry of questsFedByItem(it.entry, ds)) {
    const q = ds.quest(entry);
    if (!q) continue;
    const st = getQuest(log, entry)?.status;
    if (st && st !== 'turnedIn') return { ok: true, quest: entry, title: q.title, kind: 'objective' };
    const prevMissing = !!(q.prevQuest && !ds.quest(q.prevQuest));
    if (!getQuest(log, entry) && canTakeQuest(snap, q, {
      prevQuestMissingFromData: prevMissing,
      questDefFor: (id) => ds.quest(id),
    })) {
      return { ok: true, quest: entry, title: q.title, kind: 'objective' };
    }
  }

  return { ok: false, reason: 'no quest of theirs wants it' };
}
