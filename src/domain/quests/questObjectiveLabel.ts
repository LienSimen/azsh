import type { QuestDef } from '../../data/schema.ts';
import { stripInternalNameTags } from '../core/internalNameTags.ts';

export { stripInternalNameTags } from '../core/internalNameTags.ts';

// Player-facing quest-log line for one objective slot. ObjectiveText wins over creature/GO/item name
// (SMSG_QUEST_QUERY_RESPONSE). Cite: QuestDef.cpp:61-62; QuestHandler.cpp:336-337.
export function questObjectiveLabel(text: string | undefined, fallbackName: string): string {
  const sourced = (text ?? '').trim();
  if (sourced) return sourced;
  return stripInternalNameTags(fallbackName);
}

export function creatureObjectiveLabel(quest: QuestDef, entry: number, fallbackName: string): string {
  const slim = quest.killTargets?.find((k) => k.creatureEntry === entry)?.text;
  if (slim?.trim()) return slim.trim();
  const raw = quest.rawObjectives;
  const i = raw?.reqCreatureOrGoId?.findIndex((id) => id === entry) ?? -1;
  const fromRaw = i >= 0 ? raw?.objectiveText?.[i] : '';
  return questObjectiveLabel(fromRaw, fallbackName);
}

export function objectObjectiveLabel(quest: QuestDef, entry: number, fallbackName: string): string {
  const slim = quest.objectTargets?.find((o) => o.objectEntry === entry)?.text;
  if (slim?.trim()) return slim.trim();
  const raw = quest.rawObjectives;
  const i = raw?.reqCreatureOrGoId?.findIndex((id) => id === -entry) ?? -1;
  const fromRaw = i >= 0 ? raw?.objectiveText?.[i] : '';
  return questObjectiveLabel(fromRaw, fallbackName);
}

export function itemObjectiveLabel(quest: QuestDef, item: number, fallbackName: string): string {
  const slim = quest.itemTargets?.find((it) => it.item === item)?.text;
  if (slim?.trim()) return slim.trim();
  const raw = quest.rawObjectives;
  const i = raw?.reqItemId?.findIndex((id) => id === item) ?? -1;
  const fromRaw = i >= 0 ? raw?.objectiveText?.[i] : '';
  return questObjectiveLabel(fromRaw, fallbackName);
}
