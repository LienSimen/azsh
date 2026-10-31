// QI5 — live cutover helpers bridging a slim QuestState to interpreter status and gate. On by
// default when rawObjectives exists. It does NOT import questlog.ts, which would be a cycle.

import type { QuestDef } from '../../../data/schema.ts';
import type { Inventory } from '../../items/inventory.ts';
import { countItem } from '../../items/inventory.ts';
import {
  QUEST_OBJECTIVES_COUNT,
  QUEST_SPECIAL_FLAG_DELIVER,
  QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT,
  computeSpecialFlags,
  hasSpecialFlag,
} from './flags.ts';
import { adjustQuestReqItemCount } from './updaters.ts';
import {
  createIncompleteStatus,
  type InterpreterQuestStatus,
} from './types.ts';

export interface LiveInterpreterOpts {
  // QI5 gate: `false` forces pre-QI slim questComplete body; `true` forces interpreter. When omitted, env /
  // default apply.
  useInterpreter?: boolean;
}

// SI5-style gate for the quest interpreter cutover. Default on; `useInterpreter: false` or env
// `PHONECRAFT_QI_INTERPRETER=0` disables.
export function isQuestInterpreterEnabled(opts?: LiveInterpreterOpts): boolean {
  if (opts?.useInterpreter === false) return false;
  if (opts?.useInterpreter === true) return true;
  if (typeof process !== 'undefined' && process.env?.PHONECRAFT_QI_INTERPRETER === '0') {
    return false;
  }
  return true;
}

/** Whether this quest should use the interpreter completion path (raw bake + gate on). */
export function shouldUseQuestInterpreter(
  quest: QuestDef,
  opts?: LiveInterpreterOpts,
): boolean {
  return isQuestInterpreterEnabled(opts) && !!quest.rawObjectives;
}

// exploreMet proxy without importing questlog: with no EXPLORATION flag and no triggers, explored
// is not required; otherwise it is true when explored, or when kill objectives are all met.
export function exploredForInterpreter(
  quest: QuestDef,
  state: {
    explored?: boolean;
    kills: Record<string, number>;
    objects?: Record<string, number>;
  },
): boolean {
  const hasTriggers = (quest.exploreTriggers?.length ?? 0) > 0;
  const flags = computeSpecialFlags(quest);
  const needsEvent =
    hasTriggers || hasSpecialFlag(flags, QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT);
  if (!needsEvent) return false; // not an explore quest — m_explored unused
  if (state.explored === true) return true;
  // CQ6: flag-2 with real kills, no area triggers — kills satisfy the event bit.
  if (!hasTriggers && (quest.killTargets?.length ?? 0) > 0) {
    const killsOk = (quest.killTargets ?? []).every(
      (kt) => (state.kills[String(kt.creatureEntry)] ?? 0) >= kt.count,
    );
    if (killsOk) return true;
  }
  // qofid-s3: flag-2 + real objectTargets + no triggers — GO credit is the event.
  // Cite: questlog.exploreMet; Player.cpp CanCompleteQuest ~12276.
  if (!hasTriggers && (quest.objectTargets?.length ?? 0) > 0) {
    return (quest.objectTargets ?? []).every(
      (ot) => (state.objects?.[String(ot.objectEntry)] ?? 0) >= ot.count,
    );
  }
  return false;
}

// Map slim QuestState + inventory → InterpreterQuestStatus for CanCompleteQuest. Cite: Player.cpp AddQuest
// / AdjustQuestReqItemCount / kill-GO-spell updaters.
export function statusFromQuestState(
  quest: QuestDef,
  state: {
    kills: Record<string, number>;
    objects?: Record<string, number>;
    spells?: Record<string, number>;
    explored?: boolean;
    status?: string;
    timerMs?: number;
  },
  inv: Inventory,
): InterpreterQuestStatus {
  let st = createIncompleteStatus(quest);
  // Always evaluate as incomplete so CanCompleteQuest can return true (refresh flips status).
  st.status = 'incomplete';

  const raw = quest.rawObjectives;
  if (raw) {
    if (hasSpecialFlag(computeSpecialFlags(quest), QUEST_SPECIAL_FLAG_DELIVER)) {
      st = adjustQuestReqItemCount(quest, st, (itemId) => countItem(inv, itemId));
    }
    for (let j = 0; j < QUEST_OBJECTIVES_COUNT; j++) {
      const need = raw.reqCreatureOrGoCount[j] ?? 0;
      if (need === 0) continue;
      const spell = raw.reqSpell[j] ?? 0;
      const id = raw.reqCreatureOrGoId[j] ?? 0;
      if (spell > 0 && id < 0) {
        // Cast-on-GO: CastedCreatureOrGO needs BOTH the ReqSpell and the GO entry to match, and
        // slim progress is stored on objects[goEntry]. Cite: Player.cpp:13530–13590.
        const have = state.objects?.[String(-id)] ?? 0;
        st.m_creatureOrGOcount[j] = Math.min(need, have);
      } else if (spell > 0 && id > 0) {
        // Cast-on-creature: progress tracked on kills[entry] when cast path credits it.
        const have = state.kills[String(id)] ?? 0;
        st.m_creatureOrGOcount[j] = Math.min(need, have);
      } else if (spell > 0) {
        // Spell-only slot (no creature/GO id) — FO3 spellCastTargets by spell id.
        const have = state.spells?.[String(spell)] ?? 0;
        st.m_creatureOrGOcount[j] = Math.min(need, have);
      } else if (id > 0) {
        const have = state.kills[String(id)] ?? 0;
        st.m_creatureOrGOcount[j] = Math.min(need, have);
      } else if (id < 0) {
        const have = state.objects?.[String(-id)] ?? 0;
        st.m_creatureOrGOcount[j] = Math.min(need, have);
      }
    }
  } else {
    // Slim fixtures without QI1 raw bake.
    const items = quest.itemTargets ?? [];
    for (let i = 0; i < items.length && i < QUEST_OBJECTIVES_COUNT; i++) {
      const need = items[i]!.count;
      if (need > 0) {
        st.m_itemcount[i] = Math.min(need, countItem(inv, items[i]!.item));
      }
    }
    let slot = 0;
    for (const kt of quest.killTargets ?? []) {
      if (slot >= QUEST_OBJECTIVES_COUNT) break;
      st.m_creatureOrGOcount[slot] = Math.min(
        kt.count,
        state.kills[String(kt.creatureEntry)] ?? 0,
      );
      slot++;
    }
    for (const ot of quest.objectTargets ?? []) {
      if (slot >= QUEST_OBJECTIVES_COUNT) break;
      st.m_creatureOrGOcount[slot] = Math.min(
        ot.count,
        state.objects?.[String(ot.objectEntry)] ?? 0,
      );
      slot++;
    }
    for (const sp of quest.spellCastTargets ?? []) {
      if (slot >= QUEST_OBJECTIVES_COUNT) break;
      if (!sp.spell || (sp.count || 0) <= 0) continue;
      st.m_creatureOrGOcount[slot] = Math.min(
        sp.count,
        state.spells?.[String(sp.spell)] ?? 0,
      );
      slot++;
    }
  }

  if (exploredForInterpreter(quest, state)) {
    st.m_explored = true;
  }

  // FailQuest: QUEST_STATUS_FAILED keeps the log slot, m_timer = 0. CanCompleteQuest TIMED requires m_timer
  // != 0 (Player.cpp:12279). Cite: Player.cpp:12736–12760; Player.cpp:1432–1450.
  if (state.status === 'failed') {
    st.status = 'failed';
    st.m_timer = 0;
  } else if (state.timerMs !== undefined) {
    st.m_timer = state.timerMs;
  }

  return st;
}
