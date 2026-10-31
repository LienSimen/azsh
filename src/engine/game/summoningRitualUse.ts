// Apply a successful summoning-ritual Use: persist the unique users, start the grouped channel, and
// fire the ritual's spell when it is ready. Cite: GameObject.cpp:1772-1829, :2440-2477.

import type { DbScriptRow, GameObjectDef, SpellDef } from '../../data/schema.ts';
import type { Character } from '../../domain/character/character.ts';
import { applyAura, pruneExpiredAuras } from '../../domain/character/character.ts';
import {
  type GoRuntimeState,
  type UseGameObjectResult,
  useSummoningRitualParty,
} from '../../domain/world/gameObjects.ts';
import type { QuestLog } from '../../domain/quests/questlog.ts';
import { applySendEventFromSpell } from './sendEventFromSpell.ts';

export function ritualPartyUserIds(squadLength: number): string[] {
  const ids = ['player'];
  for (let i = 0; i < squadLength; i++) ids.push(`ally_${i}`);
  return ids;
}

export function persistRitualRuntime(
  runtime: GoRuntimeState | undefined,
  used: UseGameObjectResult,
  nowMs: number,
): GoRuntimeState {
  const next: GoRuntimeState = { ...(runtime ?? {}) };
  if (used.uniqueUserIds) next.uniqueUsers = used.uniqueUserIds;
  if (used.firstUser !== undefined) next.firstUser = used.firstUser;
  else delete next.firstUser;
  if (used.despawn) next.readyAtMs = Number.MAX_SAFE_INTEGER;
  else if (used.state === 'ready') {
    next.uniqueUsers = [];
    delete next.firstUser;
  }
  next.open = used.state === 'activated' ? true : used.state === 'ready' ? false : next.open;
  void nowMs;
  return next;
}

// Channel aura on the clicking player (animSpell / GetSpellId), then the completion spell when unique uses
// ≥ reqParticipants.
export function ritualRefuseReason(reason: string | undefined): string {
  if (reason === 'not_in_group') return 'You must be in the group';
  if (reason === 'is_owner') return 'You are already channeling';
  if (reason === 'owner_not_channeling') return 'The ritual has not started';
  if (reason === 'not_ready') return 'Not ready yet';
  return 'Nothing happens';
}

export function applySummoningRitualUse(opts: {
  used: UseGameObjectResult;
  go: GameObjectDef;
  char: Character;
  questlog: QuestLog;
  goRuntime: Record<string, GoRuntimeState> | undefined;
  rtKey: string;
  nowMs: number;
  spellOf: (id: number) => SpellDef | undefined;
  eventScripts: (eventId: number) => readonly DbScriptRow[];
  log: (msg: string) => void;
}): {
  char: Character;
  questlog: QuestLog;
  goRuntime: Record<string, GoRuntimeState>;
} {
  const { used, go, nowMs, spellOf, log } = opts;
  const goRuntime = {
    ...(opts.goRuntime ?? {}),
    [opts.rtKey]: persistRitualRuntime(opts.goRuntime?.[opts.rtKey], used, nowMs),
  };
  let char = opts.char;
  let questlog = opts.questlog;

  const channelId = (used.channelSpellId ?? 0) | 0;
  if (channelId > 0) {
    const ch = spellOf(channelId);
    const durationMs = ch?.channelUntilCancelled ? undefined : ch?.channelMs;
    char = applyAura(char, channelId, durationMs, nowMs, undefined);
    log(`You begin channeling ${ch?.name ?? go.name}.`);
  }

  const ritualId = (used.ritualSpellId ?? 0) | 0;
  if (used.ritualReady && ritualId > 0) {
    const ritual = spellOf(ritualId);
    // FinishSpell(CURRENT_CHANNELED_SPELL) on every unique user. Cite: :2453–2465.
    if (channelId > 0) {
      char = {
        ...char,
        activeAuras: pruneExpiredAuras(char.activeAuras, nowMs).filter((a) => a.spellId !== channelId),
      };
    }
    const se = applySendEventFromSpell(questlog, ritual, opts.eventScripts, log);
    questlog = se.log;
    log(`The ritual completes (${ritual?.name ?? ritualId}).`);
  }

  return { char, questlog, goRuntime };
}

/** Instance Use for type 18: grouped channel, then caller still runs objectGate. */
export function applyInstanceSummoningRitual(opts: {
  go: GameObjectDef;
  dungeonId: string;
  char: Character;
  questlog: QuestLog;
  goRuntime: Record<string, GoRuntimeState> | undefined;
  squadLength: number;
  nowMs: number;
  spellOf: (id: number) => SpellDef | undefined;
  eventScripts: (eventId: number) => readonly DbScriptRow[];
  log: (msg: string) => void;
}):
  | { ok: false; reason: string }
  | {
    ok: true;
    char: Character;
    questlog: QuestLog;
    goRuntime: Record<string, GoRuntimeState>;
    /** True when TriggerSummoningRitual fired (unique uses ≥ reqParticipants). */
    ritualReady: boolean;
  } {
  const rtKey = `${opts.dungeonId}:${opts.go.entry}`;
  const runtime = opts.goRuntime?.[rtKey];
  const party = ritualPartyUserIds(opts.squadLength);
  const used = useSummoningRitualParty(opts.go, {
    nowMs: opts.nowMs,
    runtime,
    userId: 'player',
    uniqueUserIds: runtime?.uniqueUsers,
    firstUser: runtime?.firstUser,
    delayedActionUntilMs: runtime?.delayedActionUntilMs,
    inGroup: party.length > 1,
    partyUserIds: party,
  });
  if (!used.ok) return { ok: false, reason: ritualRefuseReason(used.reason) };
  return {
    ok: true,
    ...applySummoningRitualUse({ ...opts, used, rtKey }),
    ritualReady: used.ritualReady === true,
  };
}
