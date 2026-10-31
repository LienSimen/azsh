// OOC garments residual: Lesser Heal then Fortitude on the kneeling NPC credits TalkedToCreature. The
// patient entry must be explicit — zone-granular auto-target free-completed the quest with no heal.

import type { DataStore } from '../../data/dataStore.ts';
import type { QuestLog } from '../../domain/quests/questlog.ts';
import { getQuest, recordKill } from '../../domain/quests/questlog.ts';
import {
  garmentsReset,
  garmentsSpellHit,
  type GarmentsState,
  GARMENTS_ENTRY_QUEST,
  SPELL_LESSER_HEAL_R2,
  SPELL_FORTITUDE_R1,
} from '../../domain/scriptdev/npcsSpecial.ts';

/** Session-scoped handler (heal state not persisted — re-heal after reload). */
export function createGarmentsOocHandler(): {
  afterCast: (
    spellId: number,
    targetCreature: number | undefined,
    questlog: QuestLog,
    ds: DataStore,
    log: (line: string) => void,
  ) => QuestLog;
} {
  const healByEntry = new Map<number, GarmentsState>();
  return {
    afterCast(spellId, targetCreature, questlog, ds, log) {
      const targetEntry = (targetCreature ?? 0) | 0;
      if (targetEntry <= 0) return questlog;
      const garmentsQuest = GARMENTS_ENTRY_QUEST[targetEntry];
      if (
        garmentsQuest == null
        || (spellId !== SPELL_LESSER_HEAL_R2 && spellId !== SPELL_FORTITUDE_R1)
      ) {
        return questlog;
      }
      const qst = getQuest(questlog, garmentsQuest);
      // Cite: npcs_special.cpp:577 GetQuestStatus == QUEST_STATUS_INCOMPLETE
      if (!qst || qst.status !== 'active') return questlog;

      let gst = healByEntry.get(targetEntry);
      if (!gst) {
        gst = garmentsReset();
        healByEntry.set(targetEntry, gst);
      }
      const hit = garmentsSpellHit({
        entry: targetEntry,
        spellId,
        questIncomplete: true,
        inCombat: false,
        state: gst,
      });
      if (!hit.handled) return questlog;

      healByEntry.set(targetEntry, hit.state);
      const npc = ds.creature(targetEntry)?.name ?? `NPC ${targetEntry}`;
      if (hit.phase === 'healed') {
        log(`${npc} is healed.`);
        return questlog;
      }
      if (hit.phase === 'fortitude_credit' && hit.questCreditEntry) {
        log(`${npc} thanks you.`);
        return recordKill(questlog, hit.questCreditEntry, (e) => ds.quest(e));
      }
      return questlog;
    },
  };
}
