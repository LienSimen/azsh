// QI5 talk and deliver class: predicate credit with no id lists. Empty-trackable talk, empty flag-2
// event-talk and item-deliver complete via Speak, a same-zone arrival, or a GO-ender interact.
import type { QuestDef } from '../../data/schema.ts';
import type { Inventory } from '../items/inventory.ts';
import {
  accept,
  emptyQuestLog,
  getQuest,
  hasGoEnder,
  isDeliverQuest,
  isEventTalkQuest,
  isTalkToNpcQuest,
  itemsMet,
  questComplete,
  recordGoEnderInteract,
  recordSameZoneTalkOrDeliver,
  recordTalkToNpc,
  talkMet,
  type QuestLog,
} from './questlog.ts';

export type TalkDeliverKind = 'talk' | 'eventTalk' | 'deliver';

export function talkDeliverKind(quest: QuestDef): TalkDeliverKind | null {
  if (isTalkToNpcQuest(quest)) return 'talk';
  if (isEventTalkQuest(quest)) return 'eventTalk';
  if (isDeliverQuest(quest)) return 'deliver';
  return null;
}

/** Ender identity only (deliver must not credit the starter). */
export function npcMatchesDeliverEnder(
  quest: QuestDef,
  opts: { npcName?: string; creatureEntry?: number },
  creatureNameOf?: (entry: number) => string | undefined,
): boolean {
  const ender = (quest.enderName ?? '').trim();
  if (opts.npcName && ender && opts.npcName.trim() === ender) return true;
  const entry = opts.creatureEntry;
  if (entry != null && (quest.enderCreatureEntries ?? []).includes(entry)) return true;
  if (entry != null && creatureNameOf) {
    const cn = (creatureNameOf(entry) ?? '').trim();
    if (cn && ender && cn === ender) return true;
  }
  return false;
}

// TalkedToCreature for DELIVER: speaking to the ender with the items in bags sets `talked`.
// GO enders stay on recordGoEnderInteract. Cite: Player.cpp TalkedToCreature :13603.
export function recordDeliverTalk(
  log: QuestLog,
  questOf: (entry: number) => QuestDef | undefined,
  opts: { npcName?: string; creatureEntry?: number },
  inv: Inventory,
  creatureNameOf?: (entry: number) => string | undefined,
): QuestLog {
  let touched = false;
  const quests = log.quests.map((q) => {
    if (q.status === 'turnedIn' || q.talked) return q;
    const quest = questOf(q.entry);
    if (!quest || !isDeliverQuest(quest) || hasGoEnder(quest)) return q;
    if (!itemsMet(quest, inv)) return q;
    if (!npcMatchesDeliverEnder(quest, opts, creatureNameOf)) return q;
    touched = true;
    return { ...q, talked: true };
  });
  return touched ? { quests } : log;
}

export type TalkDeliverPath = 'speak' | 'zone' | 'go';

export interface TalkDeliverSatisfy {
  ok: boolean;
  kind: TalkDeliverKind;
  path?: TalkDeliverPath;
}

// True when some class path (Speak / same-zone / GO) makes questComplete true. `standingFor` is required
// for interpreter rep-objective rows (Player.cpp:12288).
export function canSatisfyTalkDeliver(
  quest: QuestDef,
  inv: Inventory,
  opts?: {
    standingFor?: (factionId: number) => number;
    goNameOf?: (entry: number) => string | undefined;
  },
): TalkDeliverSatisfy {
  const kind = talkDeliverKind(quest);
  if (!kind) return { ok: true, kind: 'talk' };
  const standingFor = opts?.standingFor ?? (() => 999999);
  const name = (quest.enderName || quest.starterName || '').trim();

  if (hasGoEnder(quest)) {
    const go = quest.goEnder || (quest.goEnderEntries ?? []).find((e) => e > 0) || 0;
    let log = accept(emptyQuestLog(), quest);
    log = recordGoEnderInteract(log, go, (e) => (e === quest.entry ? quest : undefined), inv, {
      goName: opts?.goNameOf?.(go),
    });
    const st = getQuest(log, quest.entry);
    if (st && questComplete(quest, st, inv, { standingFor })) {
      return { ok: true, kind, path: 'go' };
    }
  }

  if (name) {
    let log = accept(emptyQuestLog(), quest);
    log = recordTalkToNpc(log, (e) => (e === quest.entry ? quest : undefined), { npcName: name });
    if (kind === 'deliver') {
      log = recordDeliverTalk(log, (e) => (e === quest.entry ? quest : undefined), { npcName: name }, inv);
    }
    const st = getQuest(log, quest.entry);
    if (st && questComplete(quest, st, inv, { standingFor })) {
      return { ok: true, kind, path: 'speak' };
    }
  }

  const zones = quest.enderZones ?? [];
  if (zones.length > 0 && !hasGoEnder(quest)) {
    let log = accept(emptyQuestLog(), quest);
    log = recordSameZoneTalkOrDeliver(log, zones[0]!, (e) => (e === quest.entry ? quest : undefined), inv);
    const st = getQuest(log, quest.entry);
    if (st && (questComplete(quest, st, inv, { standingFor }) || talkMet(st, quest) || st.explored)) {
      if (st && questComplete(quest, st, inv, { standingFor })) {
        return { ok: true, kind, path: 'zone' };
      }
    }
  }

  // Deliver with no enderZones: talkMet is vacuously true (cannot soft-lock). Items + interpreter.
  if (kind === 'deliver' && zones.length === 0 && !hasGoEnder(quest)) {
    const log = accept(emptyQuestLog(), quest);
    const st = getQuest(log, quest.entry);
    if (st && questComplete(quest, st, inv, { standingFor })) {
      return { ok: true, kind, path: 'speak' };
    }
  }

  return { ok: false, kind };
}

export interface TalkDeliverCensus {
  talk: number;
  eventTalk: number;
  deliver: number;
  remaining: number;
  dead: Array<{ entry: number; title: string; kind: TalkDeliverKind }>;
}

export function censusTalkDeliver(
  quests: readonly QuestDef[],
  invFor: (quest: QuestDef) => Inventory,
  opts?: { goNameOf?: (entry: number) => string | undefined },
): TalkDeliverCensus {
  const out: TalkDeliverCensus = { talk: 0, eventTalk: 0, deliver: 0, remaining: 0, dead: [] };
  for (const q of quests) {
    const kind = talkDeliverKind(q);
    if (!kind) continue;
    if (kind === 'talk') out.talk++;
    else if (kind === 'eventTalk') out.eventTalk++;
    else out.deliver++;
    // The 897-class gate is talk + eventTalk. Deliver uses items+zone (QI2.5) / GO (qofid).
    if (kind === 'deliver') continue;
    const sat = canSatisfyTalkDeliver(q, invFor(q), opts);
    if (!sat.ok) {
      out.remaining++;
      if (out.dead.length < 40) out.dead.push({ entry: q.entry, title: q.title, kind });
    }
  }
  return out;
}
