// TERMINATE_SCRIPT / TERMINATE_COND host — fail-quest ids onto the quest log. Cite: ScriptMgr.cpp:2548–2682
// (31), :2699–2736 (34); Player.cpp:12730–12761.

import { fail, type QuestLog } from '../../domain/quests/questlog.ts';
import { collectFailedQuestIds as collectFailedFromVm } from '../../domain/world/goEventFire.ts';
import type { ScriptActor } from '../../domain/quests/interpreter/dbscript/types.ts';
import {
  isConditionSatisfied,
  type ConditionSnapshot,
  type ConditionTable,
} from '../spells/conditions.ts';

/** Ratchet kinds — product host must name both outside interpreter/dbscript/. */
const TERMINATE_SCRIPT = 'terminate_script';
const TERMINATE_COND = 'terminate_cond';

export type TerminateIntent = {
  kind: string;
  failQuest?: number;
  /** False while the cond/script is only registered; FailQuest only when true. */
  terminated?: boolean;
};

export type TerminateWorldBag = {
  failedQuests?: readonly number[];
};

/** Collect fail-quest ids from world.failedQuests + fired terminate_cond intents. */
export function collectFailedQuestIds(
  world: TerminateWorldBag | undefined,
  intents?: readonly TerminateIntent[],
): number[] {
  // Filter so both kind string literals stay in this product host file (unhosted ratchet).
  const filtered = (intents ?? []).filter(
    (i) => i.kind === TERMINATE_COND || i.kind === TERMINATE_SCRIPT,
  );
  return collectFailedFromVm({
    world: { failedQuests: world?.failedQuests ?? [] },
    intents: filtered,
  });
}

/** Apply TERMINATE_COND failQuest — active → failed only. */
export function applyFailedQuests(log: QuestLog, ids: readonly number[]): QuestLog {
  let out = log;
  for (const id of ids) out = fail(out, id | 0);
  return out;
}

// DEAD_OR_AWAY bag from script actors. Omit player/source when that actor is null (away). Cite:
// Conditions.cpp:424–464.
export function deadOrAwayFromActors(
  player: ScriptActor | null | undefined,
  source: ScriptActor | null | undefined,
): NonNullable<ConditionSnapshot['deadOrAway']> {
  const deadOrAway: NonNullable<ConditionSnapshot['deadOrAway']> = {};
  if (player) {
    const bag: { alive: boolean; distToSource?: number } = {
      alive: player.alive !== false,
    };
    if (
      source
      && player.x != null && player.y != null && player.z != null
      && source.x != null && source.y != null && source.z != null
    ) {
      const dx = player.x - source.x;
      const dy = player.y - source.y;
      const dz = player.z - source.z;
      bag.distToSource = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    deadOrAway.player = bag;
  }
  if (source) {
    deadOrAway.source = {
      isUnit: source.kind === 'unit' || source.kind === 'creature' || source.kind === 'player',
      alive: source.alive !== false,
    };
  }
  return deadOrAway;
}

// evaluateCondition for TERMINATE_COND — base loot/quest snap + deadOrAway from actors. Cite:
// ScriptMgr.cpp:2714–2717 IsConditionSatisfied; Conditions.cpp:424–464.
export function makeDbScriptEvaluateCondition(
  base: ConditionSnapshot,
  table: ConditionTable,
): (conditionId: number, player: ScriptActor | null, second: ScriptActor | null) => boolean {
  return (conditionId, player, second) => {
    const snap: ConditionSnapshot = {
      ...base,
      deadOrAway: deadOrAwayFromActors(player, second),
    };
    return isConditionSatisfied(conditionId, snap, table).ok;
  };
}
