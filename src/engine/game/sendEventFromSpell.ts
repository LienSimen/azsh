// SPELL_EFFECT_SEND_EVENT fires the event's dbscripts, the same path a GO fire-on-use takes. The bake
// used to leave effects empty while the raw effects carried it. Cite: SpellEffects.cpp:1794-1798.
import type { DbScriptRow, QuestDef, SpellDef } from '../../data/schema.ts';
import type { QuestLog } from '../../domain/quests/questlog.ts';
import { recordEventHappens, recordKill } from '../../domain/quests/questlog.ts';
import {
  fireGoEventScripts,
  type FireGoEventResult,
} from '../../domain/world/goEventFire.ts';
import { resolveSpellEffects } from '../spells/interpreter/index.ts';
import { applyFailedQuests } from './applyTerminateFromDbScript.ts';

export interface ApplySendEventFromSpellResult {
  log: QuestLog;
  /** One result per unique non-zero eventId fired from the spell. */
  fired: FireGoEventResult[];
}

// Collect event ids from resolved send_event effects + intents (deduped, order preserved). Empty/zero
// eventId still materializes on the spell but is not fired (no script stream).
export function collectSendEventIdsFromSpell(spell: SpellDef | null | undefined): number[] {
  if (!spell) return [];
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const e of spell.effects ?? []) {
    if (e.kind !== 'send_event') continue;
    const id = e.eventId | 0;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  // Intent path covers resolveSpellEffects-only consumers (pre-materialize / hollow bake).
  if (spell.rawEffects?.length) {
    for (const intent of resolveSpellEffects(spell, {}).intents ?? []) {
      if (intent.kind !== 'send_event') continue;
      const id = intent.eventId | 0;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

// Fire the event dbscripts for each send-event slot and apply explore and kill credits to the log.
// The optional activity log mirrors the GO Use event fire text.
export function applySendEventFromSpell(
  questLog: QuestLog,
  spell: SpellDef | null | undefined,
  eventScripts: (eventId: number) => readonly DbScriptRow[],
  activityLog?: (msg: string) => void,
  questOf?: (entry: number) => QuestDef | undefined,
): ApplySendEventFromSpellResult {
  const eventIds = collectSendEventIdsFromSpell(spell);
  if (!eventIds.length) return { log: questLog, fired: [] };

  let out = questLog;
  const fired: FireGoEventResult[] = [];
  for (const eventId of eventIds) {
    const result = fireGoEventScripts(eventId, eventScripts(eventId));
    fired.push(result);
    for (const qid of result.exploreQuestIds) {
      out = recordEventHappens(out, qid);
    }
    if (questOf) {
      for (const entry of result.killCreditEntries) {
        out = recordKill(out, entry, questOf);
      }
    }
    // Cite: ScriptMgr.cpp:2719–2734 TERMINATE_COND failQuest.
    if (result.failedQuestIds.length) out = applyFailedQuests(out, result.failedQuestIds);
    // Same honesty as GO Use: never silent when rows or disposition apply.
    // Cite: game/professions.ts fireGoEventScripts log after GO Use.
    if (activityLog) {
      if (result.rowCount > 0 && result.hasNonCreditCommands) {
        activityLog(
          `Event ${result.eventId} fired (${result.rowCount} script row(s); cmds [${result.commands.join(',')}]) - ${result.disposition}`,
        );
      } else if (result.rowCount > 0) {
        activityLog(`Event ${result.eventId} fired (${result.rowCount} script row(s)).`);
      } else {
        activityLog(`Event ${result.eventId} fired.`);
      }
    }
  }
  return { log: out, fired };
}
