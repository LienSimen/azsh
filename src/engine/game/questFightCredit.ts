// Quest-fight yield credit, the auto-resolve stand-in for the scripted low-HP event. A quest duel
// bakes an event flag with EMPTY kill targets, so a kill credits nothing and the chain soft-locks.

import type { DataStore } from '../../data/dataStore.ts';
import type { QuestLog } from '../../domain/quests/questlog.ts';
import { recordEventHappens } from '../../domain/quests/questlog.ts';
import { questFightEventQuestId } from '../../domain/quests/questFight.ts';

export interface QuestFightCreditResult {
  /** The questlog after credit (identical reference when nothing was credited). */
  questlog: QuestLog;
  /** Player-facing line to log, or null when no credit landed. */
  message: string | null;
}

// Credit the active attack-start event quest for beating this creature. Returns the same questlog
// reference when it was not a quest duel, the quest is inactive, or credit was already recorded.
export function creditQuestFightWin(
  ds: DataStore,
  questlog: QuestLog,
  creatureEntry: number | undefined,
  creatureName: string,
): QuestFightCreditResult {
  if (creatureEntry == null) return { questlog, message: null };
  const duelQuest = questFightEventQuestId(ds, questlog, creatureEntry);
  if (duelQuest == null) return { questlog, message: null };
  const next = recordEventHappens(questlog, duelQuest);
  if (next === questlog) return { questlog, message: null };
  const qdef = ds.quest(duelQuest);
  return {
    questlog: next,
    message: qdef?.title
      ? `You beat ${creatureName} - ${qdef.title} complete.`
      : `You beat ${creatureName} - quest ${duelQuest} complete.`,
  };
}
