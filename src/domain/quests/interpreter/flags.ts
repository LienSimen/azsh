// QI2 — quest special-flag constants and the SetSpecialFlag computation. The DB stores only
// REPEATABLE and EXPLORATION_OR_EVENT; the rest are computed at load. Cite: QuestDef.h:147–161.

import type { QuestDef } from '../../../data/schema.ts';

/** Cite: QuestDef.h:150 */
export const QUEST_SPECIAL_FLAG_REPEATABLE = 0x001;
/** Cite: QuestDef.h:151 */
export const QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT = 0x002;
/** Cite: QuestDef.h:155 — internal, computed when any ReqItemId */
export const QUEST_SPECIAL_FLAG_DELIVER = 0x008;
/** Cite: QuestDef.h:156 — internal, with KILL_OR_CAST when any ReqCreatureOrGOId */
export const QUEST_SPECIAL_FLAG_SPEAKTO = 0x010;
/** Cite: QuestDef.h:157 — internal, with SPEAKTO when any ReqCreatureOrGOId */
export const QUEST_SPECIAL_FLAG_KILL_OR_CAST = 0x020;
/** Cite: QuestDef.h:158 — internal, when LimitTime > 0 */
export const QUEST_SPECIAL_FLAG_TIMED = 0x040;

/** Cite: QuestDef.h:161 */
export const QUEST_SPECIAL_FLAG_DB_ALLOWED =
  QUEST_SPECIAL_FLAG_REPEATABLE | QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT;

/** QuestDef.h:34 — QUEST_OBJECTIVES_COUNT */
export const QUEST_OBJECTIVES_COUNT = 4;

/** QuestDef.h:143 — auto-rewarded quests never occupy the log */
export const QUEST_FLAGS_AUTO_REWARDED = 0x00000400;
/** QuestDef.h:136 — sharable (CastedCreatureOrGO non-original-caster gate) */
export const QUEST_FLAGS_SHARABLE = 0x00000008;

export type RawObjectives = NonNullable<QuestDef['rawObjectives']>;

// Inputs needed to compute special flags (raw bake + slim explore/limit fields). Prefer rawObjectives
// (QI1); fall back to slim targets when raw absent.
export interface SpecialFlagQuestInput {
  specialFlags?: number;
  limitTime?: number;
  exploreTriggers?: Array<{ id: number; zone?: string }>;
  rawObjectives?: RawObjectives;
  /** Slim fallbacks when rawObjectives missing (pre-QI1 fixtures). */
  itemTargets?: Array<{ item: number; count: number }>;
  killTargets?: Array<{ creatureEntry: number; count: number }>;
  objectTargets?: Array<{ objectEntry: number; count: number }>;
  spellCastTargets?: Array<{ spell: number; count: number; creatureEntry?: number; objectEntry?: number }>;
}

// Compute the full m_SpecialFlags as ObjectMgr LoadQuests does: keep the DB-allowed bits, then add
// DELIVER, KILL_OR_CAST | SPEAKTO, EXPLORATION and TIMED from the raw rows. Cite: ObjectMgr.cpp.
export function computeSpecialFlags(quest: SpecialFlagQuestInput): number {
  let flags = (quest.specialFlags ?? 0) & QUEST_SPECIAL_FLAG_DB_ALLOWED;

  const raw = quest.rawObjectives;
  if (raw) {
    for (let j = 0; j < QUEST_OBJECTIVES_COUNT; j++) {
      if ((raw.reqItemId[j] ?? 0) > 0) {
        flags |= QUEST_SPECIAL_FLAG_DELIVER;
      }
    }
    for (let j = 0; j < QUEST_OBJECTIVES_COUNT; j++) {
      if ((raw.reqCreatureOrGoId[j] ?? 0) !== 0) {
        // Cite: ObjectMgr.cpp:4602–4604 — SpeakTo and Kill are both set for any target.
        flags |= QUEST_SPECIAL_FLAG_KILL_OR_CAST | QUEST_SPECIAL_FLAG_SPEAKTO;
      }
    }
  } else {
    // Slim fallback for fixtures without QI1 raw bake.
    if ((quest.itemTargets?.length ?? 0) > 0) flags |= QUEST_SPECIAL_FLAG_DELIVER;
    if (
      (quest.killTargets?.length ?? 0) > 0 ||
      (quest.objectTargets?.length ?? 0) > 0 ||
      (quest.spellCastTargets ?? []).some((t) => (t.count || 0) > 0)
    ) {
      flags |= QUEST_SPECIAL_FLAG_KILL_OR_CAST | QUEST_SPECIAL_FLAG_SPEAKTO;
    }
  }

  // Cite: ObjectMgr.cpp:6273–6274 — areatrigger_involvedrelation forces the flag.
  if ((quest.exploreTriggers?.length ?? 0) > 0) {
    flags |= QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT;
  }

  // Cite: ObjectMgr.cpp:4818–4819
  if ((quest.limitTime ?? 0) > 0) {
    flags |= QUEST_SPECIAL_FLAG_TIMED;
  }

  return flags;
}

export function hasSpecialFlag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0;
}

/** QuestDef.h:248 — IsAutoComplete: !QuestMethod */
export function isAutoComplete(quest: { method?: number }): boolean {
  return (quest.method ?? 2) === 0;
}

export function hasQuestFlag(questFlags: number | undefined, flag: number): boolean {
  return ((questFlags ?? 0) & flag) !== 0;
}
