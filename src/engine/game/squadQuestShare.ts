// Party quest credit + Auto Quest share (questSquadShare). Cite: Group.cpp:1519–1526 KilledMonster.

import type { DataStore } from '../../data/dataStore.ts';
import { normalizeAutopilotConfig } from '../../autopilot/config.ts';
import type { Companion } from '../../domain/bots/squad.ts';
import {
  companionCharacter,
  companionLevel,
  companionSpellbook,
} from '../../domain/bots/squad.ts';
import { companionPlayerbotSpecId } from '../../domain/bots/playerbotStatWeight.ts';
import {
  companionBags,
  companionQuestLog,
} from '../../domain/bots/companionQuests.ts';
import { knows } from '../../domain/character/spellbook.ts';
import { addItem, canFit, countItem } from '../../domain/items/inventory.ts';
import { bagCapacity, DUAL_WIELD_SPELL_ID, type EquipOpts } from '../../domain/items/equipment.ts';
import { pickQuestRewardIndex } from '../../domain/quests/questRewardChoice.ts';
import type { PartyOverflow } from './bagOverflow.ts';
import {
  abandon as abandonQuest,
  getQuest,
  questNeededItems,
  recordKill,
  recordEventHappens,
  recordExplore,
  recordGoEnderInteract,
  recordSameZoneTalkOrDeliver,
  recordSourceItemUse,
  recordSpellCast,
  recordTalkToNpc,
  type QuestLog,
} from '../../domain/quests/questlog.ts';
import { recordDeliverTalk } from '../../domain/quests/talkDeliver.ts';
import {
  acceptCompanionQuest,
  turnInCompanionQuest,
} from './companionQuestActions.ts';
import type { GameState } from './types.ts';

export function hiredQuestCompanions(state: GameState): Companion[] {
  const out: Companion[] = [];
  for (const comp of state.squad ?? []) {
    if (!comp.mission) out.push(comp);
  }
  return out;
}

export function squadQuestShareEnabled(state: GameState): boolean {
  return normalizeAutopilotConfig(state.autopilot).questSquadShare;
}

export function creditSquadLogs(state: GameState, fn: (log: QuestLog) => QuestLog): void {
  for (const comp of hiredQuestCompanions(state)) {
    const cur = companionQuestLog(comp);
    if (cur.quests.length === 0) continue;
    const next = fn(cur);
    if (next !== cur) comp.questLog = next;
  }
}

export function creditSquadKill(state: GameState, creatureEntry: number, ds: DataStore): void {
  const key = String(creatureEntry);
  const qOf = (e: number) => ds.quest(e);
  for (const comp of hiredQuestCompanions(state)) {
    const cur = companionQuestLog(comp);
    if (!cur.quests.some((q) => q.status !== 'turnedIn' && q.status !== 'failed' && key in q.kills)) continue;
    comp.questLog = recordKill(cur, creatureEntry, qOf);
  }
}

export function creditSquadEvent(state: GameState, questId: number): void {
  creditSquadLogs(state, (log) => recordEventHappens(log, questId));
}

export function creditSquadSpellCast(state: GameState, spellId: number, ds: DataStore): void {
  const qOf = (e: number) => ds.quest(e);
  creditSquadLogs(state, (log) => recordSpellCast(log, spellId, qOf));
}

// Zone-enter credit: AreaExplored and the same-zone talk/deliver arrival. A deliver reads each
// companion's OWN bags, so one who never got the items stays incomplete. Cite: travel.ts:205.
export function creditSquadZoneEnter(state: GameState, ds: DataStore, zoneId: string): void {
  const qOf = (e: number) => ds.quest(e);
  for (const comp of hiredQuestCompanions(state)) {
    const cur = companionQuestLog(comp);
    if (cur.quests.length === 0) continue;
    let log = recordExplore(cur, zoneId, qOf);
    log = recordSameZoneTalkOrDeliver(log, zoneId, qOf, companionBags(comp));
    if (log !== cur) comp.questLog = log;
  }
}

// A quest that ends at a gameobject: the same talked/explored credit the player takes when they use
// it, against each companion's own bags. Cite: professions.ts:1666 recordGoEnderInteract.
export function creditSquadGoEnder(
  state: GameState,
  ds: DataStore,
  objectEntry: number,
  opts?: { goName?: string; questsEnded?: readonly number[] },
): void {
  const qOf = (e: number) => ds.quest(e);
  for (const comp of hiredQuestCompanions(state)) {
    const cur = companionQuestLog(comp);
    if (cur.quests.length === 0) continue;
    const next = recordGoEnderInteract(cur, objectEntry, qOf, companionBags(comp), opts);
    if (next !== cur) comp.questLog = next;
  }
}

export function creditSquadSourceUse(state: GameState, itemEntry: number, ds: DataStore): void {
  const qOf = (e: number) => ds.quest(e);
  creditSquadLogs(state, (log) => recordSourceItemUse(log, itemEntry, qOf, 1));
}

export function creditSquadTalk(
  state: GameState,
  ds: DataStore,
  opts: { npcName?: string; creatureEntry?: number },
): void {
  const qOf = (e: number) => ds.quest(e);
  const nameOf = (e: number) => ds.creature(e)?.name;
  for (const comp of hiredQuestCompanions(state)) {
    const cur = companionQuestLog(comp);
    if (cur.quests.length === 0) continue;
    let log = recordTalkToNpc(cur, qOf, opts, nameOf);
    log = recordDeliverTalk(log, qOf, opts, companionBags(comp), nameOf);
    if (log !== cur) comp.questLog = log;
  }
}

export function partyNeededQuestItems(state: GameState, ds: DataStore): Set<number> {
  const qOf = (e: number) => ds.quest(e);
  const needed = questNeededItems(state.questlog, qOf);
  for (const comp of hiredQuestCompanions(state)) {
    for (const id of questNeededItems(companionQuestLog(comp), qOf)) needed.add(id);
  }
  return needed;
}

function companionNeedOf(comp: Companion, item: number, ds: DataStore): number {
  let need = 0;
  for (const qs of companionQuestLog(comp).quests) {
    if (qs.status === 'turnedIn' || qs.status === 'failed') continue;
    const q = ds.quest(qs.entry);
    if (!q) continue;
    for (const t of q.itemTargets ?? []) if (t.item === item) need += t.count;
    for (const t of q.sourceItemTargets ?? []) if (t.item === item) need += t.count;
  }
  return Math.max(0, need - countItem(companionBags(comp), item));
}

export function giveSquadQuestItem(
  state: GameState,
  ds: DataStore,
  item: number,
  count: number,
): void {
  if (!(item > 0) || !(count > 0)) return;
  const def = ds.item(item);
  if (!def) return;
  const stack = def.stackable ?? 1;
  for (const comp of hiredQuestCompanions(state)) {
    const want = Math.min(count, companionNeedOf(comp, item, ds));
    if (want <= 0) continue;
    const lvl = companionLevel(comp, state.char.level);
    const char = companionCharacter(comp, lvl, ds);
    const bags = companionBags(comp);
    const cap = bagCapacity(char, ds);
    if (!canFit(bags, item, want, stack, cap)) continue;
    comp.bags = addItem(bags, item, want, stack);
  }
}

function companionEquipOpts(
  comp: Companion,
  playerLevel: number,
  ds: DataStore,
): EquipOpts {
  const lvl = companionLevel(comp, playerLevel);
  const sb = companionSpellbook(comp, lvl, ds);
  return {
    canDualWield: knows(sb, DUAL_WIELD_SPELL_ID),
    specId: companionPlayerbotSpecId(comp.cls, comp.specIdx, comp.role, ds),
    role: comp.role,
  };
}

function pickCompanionQuestRewardIndex(
  comp: Companion,
  entry: number,
  playerLevel: number,
  ds: DataStore,
): number {
  const q = ds.quest(entry);
  if (!q) return 0;
  const lvl = companionLevel(comp, playerLevel);
  const char = companionCharacter(comp, lvl, ds);
  return pickQuestRewardIndex(q, char, companionBags(comp), ds, companionEquipOpts(comp, playerLevel, ds));
}

// A refusal every companion shares forever (their class, their race) is the design, not news. Every
// other one is a companion falling behind the player, and the player has to be told which.
function isPermanentQuestRefusal(reason: string | undefined): boolean {
  return !!reason && (reason.startsWith('Not a quest for ') || reason === 'Unknown quest');
}

export function shareSquadAccept(
  state: GameState,
  ds: DataStore,
  entry: number,
  feed?: (msg: string) => void,
): string[] {
  if (!squadQuestShareEnabled(state)) return [];
  const accepted: string[] = [];
  for (const comp of hiredQuestCompanions(state)) {
    const r = acceptCompanionQuest(comp, entry, state.char.level, ds);
    if (r.ok) accepted.push(comp.name);
    else if (!isPermanentQuestRefusal(r.reason)) feed?.(`${comp.name} cannot take it: ${r.reason}.`);
  }
  return accepted;
}

export function shareSquadTurnIn(
  state: GameState,
  ds: DataStore,
  entry: number,
  overflow?: PartyOverflow,
  feed?: (msg: string) => void,
): string[] {
  if (!squadQuestShareEnabled(state)) return [];
  const turned: string[] = [];
  for (const comp of hiredQuestCompanions(state)) {
    const idx = pickCompanionQuestRewardIndex(comp, entry, state.char.level, ds);
    const r = turnInCompanionQuest(comp, entry, state.char.level, ds, state.char.zoneId, idx, overflow, feed);
    if (!r.ok) {
      // Only for one who HAS the quest — a companion who never took it was named at accept.
      const held = getQuest(companionQuestLog(comp), entry);
      if (held && held.status !== 'turnedIn') feed?.(`${comp.name} cannot hand it in: ${r.reason}.`);
      continue;
    }
    if ((r.money ?? 0) > 0) state.char = { ...state.char, gold: state.char.gold + (r.money ?? 0) };
    turned.push(comp.name);
  }
  return turned;
}

export function shareSquadAbandon(state: GameState, entry: number): string[] {
  if (!squadQuestShareEnabled(state)) return [];
  const dropped: string[] = [];
  for (const comp of hiredQuestCompanions(state)) {
    const before = companionQuestLog(comp);
    const next = abandonQuest(before, entry);
    if (next === before) continue;
    comp.questLog = next;
    dropped.push(comp.name);
  }
  return dropped;
}
