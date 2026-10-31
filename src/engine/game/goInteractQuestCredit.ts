// Quest credit after a successful interactObject Use: a plain Use records the object, while a goober
// spell or a lock-key item whose use spell matches the required one credits the cast on the GO.

import {
  recordObject,
  recordCastedCreatureOrGO,
  reqSpellForObjectTarget,
  type QuestLog,
} from '../../domain/quests/questlog.ts';
import type { QuestDef } from '../../data/schema/quest.ts';

export function applyInteractObjectQuestCredit(opts: {
  questlog: QuestLog;
  objectEntry: number;
  /** false skips recordObject (QUESTGIVER leaves credit undefined). */
  questCredit?: boolean;
  /** Goober/trap spell cast on Use (GameObject.cpp:1645). */
  castSpellId?: number;
  /** LOCK_KEY_ITEM used for this open, if any. */
  keyItemEntry?: number;
  /** item.useSpell for that key (0 when none). */
  keyUseSpell?: number;
  questOf: (entry: number) => QuestDef | undefined;
  activeQuests: ReadonlyArray<{ entry: number; status: string }>;
}): QuestLog {
  let log = opts.questlog;
  if (opts.questCredit !== false) {
    log = recordObject(log, opts.objectEntry, opts.questOf);
  }

  let spellId = opts.castSpellId && opts.castSpellId > 0 ? opts.castSpellId : 0;
  // Key-as-cast-item: interactObject opens via LOCK_KEY_ITEM; real client casts item.useSpell
  // on the GO (OPEN_LOCK), which credits with that spell id — not spellid=0 bare Use.
  if (!spellId && opts.keyItemEntry != null && (opts.keyUseSpell ?? 0) > 0) {
    const useSpell = opts.keyUseSpell!;
    for (const qs of opts.activeQuests) {
      if (qs.status === 'turnedIn') continue;
      const q = opts.questOf(qs.entry);
      if (!q) continue;
      if (!(q.objectTargets ?? []).some((ot) => ot.objectEntry === opts.objectEntry)) continue;
      if (reqSpellForObjectTarget(q, opts.objectEntry) === useSpell) {
        spellId = useSpell;
        break;
      }
    }
  }
  if (spellId > 0) {
    log = recordCastedCreatureOrGO(log, opts.objectEntry, spellId, opts.questOf);
  }
  return log;
}
