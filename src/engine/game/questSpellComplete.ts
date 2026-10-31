// SPELL_EFFECT_QUEST_COMPLETE credits the event for the effect's quest id. The bake often leaves
// effects empty while the raw effects carry it. Cite: SpellEffects.cpp:4928-4935.
import type { SpellDef } from '../../data/schema.ts';
import type { QuestLog } from '../../domain/quests/questlog.ts';
import { recordEventHappens } from '../../domain/quests/questlog.ts';
import { resolveSpellEffects } from '../spells/interpreter/index.ts';

/** Apply quest_complete intents from a spell onto the quest log. */
export function creditQuestCompleteFromSpell(
  log: QuestLog,
  spell: SpellDef | null | undefined,
): QuestLog {
  if (!spell?.rawEffects?.length) return log;
  let out = log;
  for (const intent of resolveSpellEffects(spell, { unitTargetIsPlayer: true }).intents ?? []) {
    if (intent.kind === 'quest_complete' && intent.questId) {
      out = recordEventHappens(out, intent.questId);
    }
  }
  return out;
}
