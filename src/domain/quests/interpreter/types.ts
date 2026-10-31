// QI2 — interpreter quest-status types, mirroring CMaNGOS QuestStatusData for objective progress.
// A pure module, not wired into live game.ts until QI5. Cite: QuestDef.h; Player.cpp AddQuest.

import type { QuestDef } from '../../../data/schema.ts';
import { QUEST_OBJECTIVES_COUNT, computeSpecialFlags, type SpecialFlagQuestInput } from './flags.ts';

/** Subset of CMaNGOS QuestStatus used by CanCompleteQuest / updaters. */
export type InterpreterQuestStatusCode = 'none' | 'incomplete' | 'complete' | 'failed';

// Per-quest progress matching QuestStatusData fields used by QI2. Cite: Player.h QuestStatusData —
// m_status, m_itemcount[], m_creatureOrGOcount[], m_explored, m_timer.
export interface InterpreterQuestStatus {
  questId: number;
  /** QUEST_STATUS_INCOMPLETE while on log; COMPLETE after CompleteQuest. */
  status: InterpreterQuestStatusCode;
  /** ReqItem slot counts (DELIVER). Cite: m_itemcount[QUEST_ITEM_OBJECTIVES_COUNT]. */
  m_itemcount: [number, number, number, number];
  // ReqCreatureOrGO slot counts (KILL_OR_CAST | SPEAKTO). Cite:
  // m_creatureOrGOcount[QUEST_OBJECTIVES_COUNT].
  m_creatureOrGOcount: [number, number, number, number];
  /** AreaExploredOrEventHappens. Cite: m_explored. */
  m_explored: boolean;
  // Remaining timer in ms. 0 means not timed OR expired. CanCompleteQuest TIMED requires m_timer != 0
  // (Player.cpp:12279).
  m_timer: number;
}

/** Zero-filled objective arrays. */
export function emptySlotCounts(): [number, number, number, number] {
  return [0, 0, 0, 0];
}

// Create INCOMPLETE status as AddQuest does (Player.cpp:12404–12437). Zeros deliver / kill-or-cast counts
// when flags apply; sets timer for TIMED.
export function createIncompleteStatus(
  quest: SpecialFlagQuestInput & { entry: number; limitTime?: number },
): InterpreterQuestStatus {
  const flags = computeSpecialFlags(quest);
  // Cite: Player.cpp:12424–12437 — limittime * IN_MILLISECONDS; non-timed → 0.
  const limitSec = quest.limitTime ?? 0;
  const timed = (flags & 0x040) !== 0 && limitSec > 0;
  return {
    questId: quest.entry,
    status: 'incomplete',
    m_itemcount: emptySlotCounts(),
    m_creatureOrGOcount: emptySlotCounts(),
    m_explored: false,
    m_timer: timed ? limitSec * 1000 : 0,
  };
}

export function cloneStatus(st: InterpreterQuestStatus): InterpreterQuestStatus {
  return {
    questId: st.questId,
    status: st.status,
    m_itemcount: [...st.m_itemcount] as [number, number, number, number],
    m_creatureOrGOcount: [...st.m_creatureOrGOcount] as [number, number, number, number],
    m_explored: st.m_explored,
    m_timer: st.m_timer,
  };
}

/** Mutable log of active interpreter statuses keyed by quest id. */
export type InterpreterLog = Map<number, InterpreterQuestStatus>;

export function emptyInterpreterLog(): InterpreterLog {
  return new Map();
}

export function cloneLog(log: InterpreterLog): InterpreterLog {
  const out: InterpreterLog = new Map();
  for (const [id, st] of log) out.set(id, cloneStatus(st));
  return out;
}

export type QuestOf = (entry: number) => QuestDef | undefined;

/** Cap slot index to QUEST_OBJECTIVES_COUNT. */
export function slotIndex(j: number): boolean {
  return j >= 0 && j < QUEST_OBJECTIVES_COUNT;
}
