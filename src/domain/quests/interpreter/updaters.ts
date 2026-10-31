// QI2 — pure objective progress updaters ported from Player.cpp (AdjustQuestReqItemCount,
// KilledMonster, CastedCreatureOrGO, TalkedToCreature). They return whether CanComplete would fire.

import type { QuestDef } from '../../../data/schema.ts';
import { canCompleteQuest, type CanCompleteOpts } from './canComplete.ts';
import {
  QUEST_FLAGS_SHARABLE,
  QUEST_OBJECTIVES_COUNT,
  QUEST_SPECIAL_FLAG_DELIVER,
  QUEST_SPECIAL_FLAG_KILL_OR_CAST,
  QUEST_SPECIAL_FLAG_SPEAKTO,
  computeSpecialFlags,
  hasQuestFlag,
  hasSpecialFlag,
} from './flags.ts';
import {
  cloneLog,
  cloneStatus,
  type InterpreterLog,
  type InterpreterQuestStatus,
  type QuestOf,
} from './types.ts';

export interface UpdaterResult {
  log: InterpreterLog;
  /** Quest ids that became completable after this update. */
  completable: number[];
}

function incompleteStatuses(
  log: InterpreterLog,
): Array<[number, InterpreterQuestStatus]> {
  const out: Array<[number, InterpreterQuestStatus]> = [];
  for (const [id, st] of log) {
    if (st.status === 'incomplete') out.push([id, st]);
  }
  return out;
}

function maybeComplete(
  quest: QuestDef,
  st: InterpreterQuestStatus,
  opts?: CanCompleteOpts,
): boolean {
  return canCompleteQuest(quest, st, opts);
}

// AdjustQuestReqItemCount — sync m_itemcount from current inventory (capped). Cite: Player.cpp:13308–13324.
export function adjustQuestReqItemCount(
  quest: QuestDef,
  status: InterpreterQuestStatus,
  itemCountOf: (itemId: number) => number,
): InterpreterQuestStatus {
  const flags = computeSpecialFlags(quest);
  if (!hasSpecialFlag(flags, QUEST_SPECIAL_FLAG_DELIVER)) return status;

  const out = cloneStatus(status);
  const raw = quest.rawObjectives;
  if (raw) {
    for (let i = 0; i < QUEST_OBJECTIVES_COUNT; i++) {
      const req = raw.reqItemCount[i] ?? 0;
      if (req === 0) continue;
      const itemId = raw.reqItemId[i] ?? 0;
      const cur = itemCountOf(itemId);
      out.m_itemcount[i] = Math.min(cur, req);
    }
  } else {
    const items = quest.itemTargets ?? [];
    for (let i = 0; i < items.length && i < QUEST_OBJECTIVES_COUNT; i++) {
      const req = items[i].count;
      if (req === 0) continue;
      out.m_itemcount[i] = Math.min(itemCountOf(items[i].item), req);
    }
  }
  return out;
}

// AreaExploredOrEventHappens — set m_explored for one quest. Cite: Player.cpp:13335–13357 (slot COMPLETE UI
// omitted; explored bit only).
export function areaExploredOrEventHappens(
  log: InterpreterLog,
  questId: number,
  questOf: QuestOf,
  opts?: CanCompleteOpts,
): UpdaterResult {
  if (!questId) return { log, completable: [] };
  const st = log.get(questId);
  if (!st || st.status !== 'incomplete') return { log, completable: [] };

  const out = cloneLog(log);
  const next = cloneStatus(st);
  if (!next.m_explored) next.m_explored = true;
  out.set(questId, next);

  const quest = questOf(questId);
  const completable: number[] = [];
  if (quest && maybeComplete(quest, next, opts)) completable.push(questId);
  return { log: out, completable };
}

// ItemAddedQuestCheck — for each incomplete DELIVER quest, add to matching ReqItem. Cite:
// Player.cpp:13377–13418.
export function itemAddedQuestCheck(
  log: InterpreterLog,
  questOf: QuestOf,
  entry: number,
  count: number,
  opts?: CanCompleteOpts,
): UpdaterResult {
  if (!entry || count <= 0) return { log, completable: [] };
  const out = cloneLog(log);
  const completable: number[] = [];

  for (const [questid, st0] of incompleteStatuses(log)) {
    const qInfo = questOf(questid);
    if (!qInfo) continue;
    const flags = computeSpecialFlags(qInfo);
    if (!hasSpecialFlag(flags, QUEST_SPECIAL_FLAG_DELIVER)) continue;

    const st = cloneStatus(st0);
    let touched = false;
    const raw = qInfo.rawObjectives;

    if (raw) {
      for (let j = 0; j < QUEST_OBJECTIVES_COUNT; j++) {
        const reqitem = raw.reqItemId[j] ?? 0;
        if (reqitem !== entry) continue;
        const reqitemcount = raw.reqItemCount[j] ?? 0;
        const curitemcount = st.m_itemcount[j];
        if (curitemcount < reqitemcount) {
          const add = Math.min(count, reqitemcount - curitemcount);
          st.m_itemcount[j] = curitemcount + add;
          touched = true;
        }
      }
    } else {
      const items = qInfo.itemTargets ?? [];
      for (let j = 0; j < items.length && j < QUEST_OBJECTIVES_COUNT; j++) {
        if (items[j].item !== entry) continue;
        const reqitemcount = items[j].count;
        const curitemcount = st.m_itemcount[j];
        if (curitemcount < reqitemcount) {
          const add = Math.min(count, reqitemcount - curitemcount);
          st.m_itemcount[j] = curitemcount + add;
          touched = true;
        }
      }
    }

    if (touched) {
      out.set(questid, st);
      if (maybeComplete(qInfo, st, opts)) completable.push(questid);
    }
  }

  return { log: out, completable };
}

// KilledMonsterCredit — credit kill for matching ReqCreatureOrGOId > 0, ReqSpell == 0. Cite:
// Player.cpp:13477–13527. Raid/group gate omitted (Phonecraft solo; IsAllowedInRaid always true here).
export function killedMonsterCredit(
  log: InterpreterLog,
  questOf: QuestOf,
  entry: number,
  opts?: CanCompleteOpts,
): UpdaterResult {
  if (!entry) return { log, completable: [] };
  const addkillcount = 1;
  const out = cloneLog(log);
  const completable: number[] = [];

  for (const [questid, st0] of incompleteStatuses(log)) {
    const qInfo = questOf(questid);
    if (!qInfo) continue;
    const flags = computeSpecialFlags(qInfo);
    if (!hasSpecialFlag(flags, QUEST_SPECIAL_FLAG_KILL_OR_CAST)) continue;

    const st = cloneStatus(st0);
    let touched = false;
    const raw = qInfo.rawObjectives;

    if (raw) {
      for (let j = 0; j < QUEST_OBJECTIVES_COUNT; j++) {
        // skip GO activate objective or none (Player.cpp:13498–13500)
        if ((raw.reqCreatureOrGoId[j] ?? 0) <= 0) continue;
        // skip Cast at creature objective (Player.cpp:13502–13504)
        if ((raw.reqSpell[j] ?? 0) !== 0) continue;

        const reqkill = raw.reqCreatureOrGoId[j];
        if (reqkill !== entry) continue;

        const reqkillcount = raw.reqCreatureOrGoCount[j] ?? 0;
        const cur = st.m_creatureOrGOcount[j];
        if (cur < reqkillcount) {
          st.m_creatureOrGOcount[j] = cur + addkillcount;
          touched = true;
        }
      }
    } else {
      // Slim killTargets
      const kills = qInfo.killTargets ?? [];
      for (let j = 0; j < kills.length && j < QUEST_OBJECTIVES_COUNT; j++) {
        if (kills[j].creatureEntry !== entry) continue;
        const req = kills[j].count;
        const cur = st.m_creatureOrGOcount[j];
        if (cur < req) {
          st.m_creatureOrGOcount[j] = cur + addkillcount;
          touched = true;
        }
      }
    }

    if (touched) {
      out.set(questid, st);
      if (maybeComplete(qInfo, st, opts)) completable.push(questid);
    }
  }

  return { log: out, completable };
}

// KilledMonster — credit the template entry, the live entry when it differs, then each non-zero
// KillCredit[]. Cite: Player.cpp:13463–13475.
export function killedMonster(
  log: InterpreterLog,
  questOf: QuestOf,
  cInfoEntry: number,
  opts?: CanCompleteOpts & {
    creatureEntry?: number;
    killCredits?: number[];
  },
): UpdaterResult {
  let result: UpdaterResult = { log, completable: [] };
  const seen = new Set<number>();

  const apply = (entry: number) => {
    if (!entry || seen.has(entry)) return;
    seen.add(entry);
    const r = killedMonsterCredit(result.log, questOf, entry, opts);
    result = {
      log: r.log,
      completable: [...new Set([...result.completable, ...r.completable])],
    };
  };

  if (cInfoEntry) apply(cInfoEntry);
  const live = opts?.creatureEntry ?? 0;
  if (live && live !== cInfoEntry) apply(live);
  for (const kc of opts?.killCredits ?? []) {
    if (kc) apply(kc);
  }
  return result;
}

// CastedCreatureOrGO — credit a cast objective matching ReqSpell plus the creature or GO target.
// With originalCaster false, only SHARABLE quests credit. Cite: Player.cpp:13530–13600.
export function castedCreatureOrGO(
  log: InterpreterLog,
  questOf: QuestOf,
  entry: number,
  isCreature: boolean,
  spellId: number,
  opts?: CanCompleteOpts & { originalCaster?: boolean },
): UpdaterResult {
  const originalCaster = opts?.originalCaster !== false;
  const addCastCount = 1;
  const out = cloneLog(log);
  const completable: number[] = [];

  for (const [questid, st0] of incompleteStatuses(log)) {
    const qInfo = questOf(questid);
    if (!qInfo) continue;

    if (!originalCaster && !hasQuestFlag(qInfo.questFlags, QUEST_FLAGS_SHARABLE)) {
      continue;
    }

    const flags = computeSpecialFlags(qInfo);
    if (!hasSpecialFlag(flags, QUEST_SPECIAL_FLAG_KILL_OR_CAST)) continue;

    const st = cloneStatus(st0);
    let touched = false;
    const raw = qInfo.rawObjectives;

    if (raw) {
      for (let j = 0; j < QUEST_OBJECTIVES_COUNT; j++) {
        // skip kill creature objective (0) or wrong spell (Player.cpp:13558–13560)
        if ((raw.reqSpell[j] ?? 0) !== spellId) continue;

        let reqTarget = 0;
        const id = raw.reqCreatureOrGoId[j] ?? 0;
        if (isCreature) {
          if (id > 0) reqTarget = id;
        } else {
          if (id < 0) reqTarget = -id;
        }
        if (reqTarget !== entry) continue;

        const reqCastCount = raw.reqCreatureOrGoCount[j] ?? 0;
        const cur = st.m_creatureOrGOcount[j];
        if (cur < reqCastCount) {
          st.m_creatureOrGOcount[j] = cur + addCastCount;
          touched = true;
        }
        // same objective target can be in many quests, but not 2 slots on one quest
        break;
      }
    } else {
      // Slim spellCastTargets — progress by spell id only (FO3 shape).
      const spells = qInfo.spellCastTargets ?? [];
      for (let j = 0; j < spells.length && j < QUEST_OBJECTIVES_COUNT; j++) {
        if (spells[j].spell !== spellId) continue;
        const req = spells[j].count;
        const cur = st.m_creatureOrGOcount[j];
        if (cur < req) {
          st.m_creatureOrGOcount[j] = cur + addCastCount;
          touched = true;
        }
        break;
      }
    }

    if (touched) {
      out.set(questid, st);
      if (maybeComplete(qInfo, st, opts)) completable.push(questid);
    }
  }

  return { log: out, completable };
}

// TalkedToCreature — credit SPEAKTO / kill-or-cast creature talk objectives. Cite: Player.cpp:13603–13649.
// Skips spell casts and GO objectives (Player.cpp:13624–13626).
export function talkedToCreature(
  log: InterpreterLog,
  questOf: QuestOf,
  entry: number,
  opts?: CanCompleteOpts,
): UpdaterResult {
  if (!entry) return { log, completable: [] };
  const addTalkCount = 1;
  const out = cloneLog(log);
  const completable: number[] = [];

  for (const [questid, st0] of incompleteStatuses(log)) {
    const qInfo = questOf(questid);
    if (!qInfo) continue;
    const flags = computeSpecialFlags(qInfo);
    if (
      !hasSpecialFlag(
        flags,
        QUEST_SPECIAL_FLAG_KILL_OR_CAST | QUEST_SPECIAL_FLAG_SPEAKTO,
      )
    ) {
      continue;
    }

    const st = cloneStatus(st0);
    let touched = false;
    const raw = qInfo.rawObjectives;

    if (raw) {
      for (let j = 0; j < QUEST_OBJECTIVES_COUNT; j++) {
        // skip spell casts and Gameobject objectives (Player.cpp:13624–13626)
        if ((raw.reqSpell[j] ?? 0) > 0 || (raw.reqCreatureOrGoId[j] ?? 0) < 0) continue;
        const reqTarget = raw.reqCreatureOrGoId[j] ?? 0;
        if (reqTarget <= 0) continue;
        if (reqTarget !== entry) continue;

        const reqTalkCount = raw.reqCreatureOrGoCount[j] ?? 0;
        const cur = st.m_creatureOrGOcount[j];
        if (cur < reqTalkCount) {
          st.m_creatureOrGOcount[j] = cur + addTalkCount;
          touched = true;
        }
      }
    } else {
      // Slim: talk credit against killTargets (same slots as kill).
      const kills = qInfo.killTargets ?? [];
      for (let j = 0; j < kills.length && j < QUEST_OBJECTIVES_COUNT; j++) {
        if (kills[j].creatureEntry !== entry) continue;
        const req = kills[j].count;
        const cur = st.m_creatureOrGOcount[j];
        if (cur < req) {
          st.m_creatureOrGOcount[j] = cur + addTalkCount;
          touched = true;
        }
      }
    }

    if (touched) {
      out.set(questid, st);
      if (maybeComplete(qInfo, st, opts)) completable.push(questid);
    }
  }

  return { log: out, completable };
}

// Credit a GO interact when ReqSpell is 0, i.e. activating it without a cast, through the
// CastedCreatureOrGO(entry, isCreature=false, spellId=0) path. Cite: Player.cpp:13530.
export function gameObjectActivated(
  log: InterpreterLog,
  questOf: QuestOf,
  goEntry: number,
  opts?: CanCompleteOpts,
): UpdaterResult {
  return castedCreatureOrGO(log, questOf, goEntry, false, 0, {
    ...opts,
    originalCaster: true,
  });
}
