// Quest-fight NPCs (Bartleby, Calvin Montague, Dashel Stonefist). These bake EXPLORATION_OR_EVENT
// with empty killTargets, so without this helper the template stays Friendly and the chain locks.

import type { DataStore } from '../../data/dataStore.ts';
import type { QuestLog } from './questlog.ts';
import { requiresEventCredit } from './questlog.ts';
import { resolveQuestScript } from './interpreter/dbscript/registry.ts';

// If `creatureEntry` is the accept target of an active event quest whose QI4 registry emits
// AttackStart, return that quest id for event credit. Otherwise null.
export function questFightEventQuestId(
  ds: DataStore,
  log: QuestLog,
  creatureEntry: number,
): number | null {
  for (const qs of log.quests) {
    if (qs.status !== 'active') continue;
    // Already credited via finishEscort / prior yield.
    if (qs.explored === true) continue;
    const q = ds.quest(qs.entry);
    if (!q) continue;
    if (!requiresEventCredit(q)) continue;
    const starters = q.starterCreatureEntries ?? [];
    if (!starters.includes(creatureEntry)) continue;
    const script = resolveQuestScript(q.entry);
    if (!script?.run) continue;
    const intents = script.run('accept', q.entry);
    const attackStart = intents.some(
      (i) => i.kind === 'attack_start' && i.canAttack !== false,
    );
    if (attackStart) return q.entry;
  }
  return null;
}
