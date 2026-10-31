// Which of quest_template's four texts the player is owed at each step of the dialog. Port of
// GossipDef.cpp:531 SendQuestGiverRequestItems, falling through to :435 SendQuestGiverOfferReward.

import type { QuestDef } from '../../data/schema.ts';

export type QuestDialogStep = 'details' | 'requestItems' | 'offerReward';

/** GetReqItemsCount() — the ReqItemId slots the ender takes off you. Cite: QuestDef.h:205. */
function reqItemsCount(quest: QuestDef): number {
  const raw = quest.rawObjectives?.reqItemId;
  if (raw) return raw.filter((id) => id > 0).length;
  return (quest.itemTargets ?? []).length;
}

/** The step the ender is at. `completable` is CanRewardQuest: would the turn-in pay right now. */
export function questEnderStep(quest: QuestDef, completable: boolean): QuestDialogStep {
  const request = quest.requestItemsText?.trim() ?? '';
  if (!request || (reqItemsCount(quest) === 0 && completable)) return 'offerReward';
  return 'requestItems';
}

/** The line for a step, or '' when that quest_template column is blank. */
export function questStepText(quest: QuestDef, step: QuestDialogStep): string {
  if (step === 'details') return quest.detailsText ?? '';
  if (step === 'requestItems') return quest.requestItemsText ?? '';
  return quest.offerRewardText ?? '';
}

/** What the ender says now. Empty for the 136 quests whose OfferRewardText row is blank too. */
export function questEnderText(quest: QuestDef, completable: boolean): string {
  return questStepText(quest, questEnderStep(quest, completable));
}

/** Every line the ender speaks, in packet order: the RequestItems frame first when the client
 *  would get one, then the OfferReward frame it falls through to. Cite: GossipDef.cpp:531. */
export function questEnderLines(quest: QuestDef, completable: boolean): string[] {
  const lines: string[] = [];
  if (questEnderStep(quest, completable) === 'requestItems') {
    lines.push(quest.requestItemsText ?? '');
  }
  if (completable && quest.offerRewardText) lines.push(quest.offerRewardText);
  return lines.filter(Boolean);
}
