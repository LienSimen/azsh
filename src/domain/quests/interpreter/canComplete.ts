// QI2 — Player::CanCompleteQuest, per flag. Cite: Player.cpp:12220–12290. The AUTO_REWARDED and
// IsAutoComplete paths return false without a canTake hook rather than invent gates.

import type { QuestDef } from '../../../data/schema.ts';
import {
  QUEST_FLAGS_AUTO_REWARDED,
  QUEST_OBJECTIVES_COUNT,
  QUEST_SPECIAL_FLAG_DELIVER,
  QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT,
  QUEST_SPECIAL_FLAG_KILL_OR_CAST,
  QUEST_SPECIAL_FLAG_SPEAKTO,
  QUEST_SPECIAL_FLAG_TIMED,
  computeSpecialFlags,
  hasQuestFlag,
  hasSpecialFlag,
  isAutoComplete,
} from './flags.ts';
import type { InterpreterQuestStatus } from './types.ts';

export interface CanCompleteOpts {
  // Optional CanTakeQuest-style gate for IsAutoComplete path (Player.cpp:12246–12247). When omitted,
  // auto-complete quests cannot complete here.
  canTake?: boolean;
  // AUTO_REWARDED path (Player.cpp:12239–12242) — when true, all listed Satisfy* checks are considered met.
  // When false/omitted, AUTO_REWARDED returns false.
  autoRewardedSatisfied?: boolean;
  /** Absolute copper; used when RewOrReqMoney < 0 (Player.cpp:12282–12286). */
  money?: number;
  // Standing for RepObjectiveFaction (Player.cpp:12288–12289). When rep objective present and standingFor
  // omitted → cannot complete.
  standingFor?: (factionId: number) => number;
  // Negative money cost from quest (RewOrReqMoney). Phonecraft QuestDef has rewMoney ≥ 0; pass
  // rewOrReqMoney when negative cost is known. Default: no money gate.
  rewOrReqMoney?: number;
  /** Rep objective override; defaults to rawObjectives.repFaction/repValue or quest.repObjective. */
  repObjectiveFaction?: number;
  repObjectiveValue?: number;
}

/** Player::CanCompleteQuest — pure. Cite: Player.cpp:12220–12290. */
export function canCompleteQuest(
  quest: QuestDef,
  status: InterpreterQuestStatus | undefined,
  opts?: CanCompleteOpts,
): boolean {
  const questId = quest.entry;
  if (!questId) return false;

  // status COMPLETE → not allow re-complete (Player.cpp:12230–12231)
  if (status?.status === 'complete') return false;

  const flags = computeSpecialFlags(quest);
  const questFlags = quest.questFlags ?? 0;

  // AUTO_REWARDED flag quests (Player.cpp:12239–12242)
  if (hasQuestFlag(questFlags, QUEST_FLAGS_AUTO_REWARDED)) {
    return opts?.autoRewardedSatisfied === true;
  }

  // IsAutoComplete && CanTakeQuest (Player.cpp:12246–12247)
  if (isAutoComplete(quest)) {
    return opts?.canTake === true;
  }

  // Must be INCOMPLETE with status data (Player.cpp:12249–12253)
  if (!status || status.status !== 'incomplete') return false;

  // DELIVER: all ReqItemCount met by m_itemcount (Player.cpp:12255–12262)
  if (hasSpecialFlag(flags, QUEST_SPECIAL_FLAG_DELIVER)) {
    const raw = quest.rawObjectives;
    if (raw) {
      for (let i = 0; i < QUEST_OBJECTIVES_COUNT; i++) {
        const need = raw.reqItemCount[i] ?? 0;
        if (need !== 0 && status.m_itemcount[i] < need) return false;
      }
    } else {
      // Slim fallback: map itemTargets order to slots 0..n
      const items = quest.itemTargets ?? [];
      for (let i = 0; i < items.length && i < QUEST_OBJECTIVES_COUNT; i++) {
        const need = items[i].count;
        if (need !== 0 && status.m_itemcount[i] < need) return false;
      }
    }
  }

  // KILL_OR_CAST | SPEAKTO: all ReqCreatureOrGOCount met (Player.cpp:12264–12274)
  if (
    hasSpecialFlag(
      flags,
      QUEST_SPECIAL_FLAG_KILL_OR_CAST | QUEST_SPECIAL_FLAG_SPEAKTO,
    )
  ) {
    const raw = quest.rawObjectives;
    if (raw) {
      for (let i = 0; i < QUEST_OBJECTIVES_COUNT; i++) {
        if ((raw.reqCreatureOrGoId[i] ?? 0) === 0) continue;
        const need = raw.reqCreatureOrGoCount[i] ?? 0;
        if (need !== 0 && status.m_creatureOrGOcount[i] < need) return false;
      }
    } else {
      // Slim: kill targets then object targets fill positive/negative conceptual slots.
      let slot = 0;
      for (const kt of quest.killTargets ?? []) {
        if (slot >= QUEST_OBJECTIVES_COUNT) break;
        if (kt.count !== 0 && status.m_creatureOrGOcount[slot] < kt.count) return false;
        slot++;
      }
      for (const ot of quest.objectTargets ?? []) {
        if (slot >= QUEST_OBJECTIVES_COUNT) break;
        if (ot.count !== 0 && status.m_creatureOrGOcount[slot] < ot.count) return false;
        slot++;
      }
    }
  }

  // EXPLORATION_OR_EVENT: m_explored (Player.cpp:12276–12277)
  if (hasSpecialFlag(flags, QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT) && !status.m_explored) {
    return false;
  }

  // TIMED: m_timer != 0 (Player.cpp:12279–12280)
  if (hasSpecialFlag(flags, QUEST_SPECIAL_FLAG_TIMED) && status.m_timer === 0) {
    return false;
  }

  // Money cost (Player.cpp:12282–12286)
  const rewMoney = opts?.rewOrReqMoney ?? 0;
  if (rewMoney < 0) {
    const have = opts?.money ?? 0;
    if (have < -rewMoney) return false;
  }

  // Rep objective (Player.cpp:12288–12289)
  const repFac =
    opts?.repObjectiveFaction ??
    quest.rawObjectives?.repFaction ??
    quest.repObjective?.faction ??
    0;
  const repVal =
    opts?.repObjectiveValue ??
    quest.rawObjectives?.repValue ??
    quest.repObjective?.value ??
    0;
  if (repFac && repVal) {
    if (!opts?.standingFor) return false;
    if (opts.standingFor(repFac) < repVal) return false;
  }

  return true;
}
