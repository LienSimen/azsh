// QI2 dual-oracle helpers — normalize + diff interpreter completion vs pre-QI questlog. Test / oracle only
// — not used by live game.

import type { QuestDef } from '../../../data/schema.ts';
import type { Inventory } from '../../items/inventory.ts';
import { countItem } from '../../items/inventory.ts';
import {
  exploreMet,
  itemsMet,
  killsMet,
  objectsMet,
  questCompleteSlim,
  type QuestCompleteOpts,
  type QuestState,
} from '../questlog.ts';
import { canCompleteQuest, type CanCompleteOpts } from './canComplete.ts';
import { isClaimedByQi2 } from './claim.ts';
import {
  QUEST_OBJECTIVES_COUNT,
  QUEST_SPECIAL_FLAG_DELIVER,
  QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT,
  computeSpecialFlags,
  hasSpecialFlag,
} from './flags.ts';
import { exploredForInterpreter } from './live.ts';
import {
  adjustQuestReqItemCount,
  killedMonsterCredit,
  gameObjectActivated,
  areaExploredOrEventHappens,
} from './updaters.ts';
import {
  createIncompleteStatus,
  emptyInterpreterLog,
  type InterpreterQuestStatus,
} from './types.ts';

export interface OracleScenario {
  /** Stable scenario id for golden file. */
  id: string;
  questEntry: number;
  /** Kill progress creatureEntry → count (pre-QI kills map). */
  kills?: Record<string, number>;
  /** Object progress objectEntry → count. */
  objects?: Record<string, number>;
  /** Inventory stacks for item objectives. */
  inventory?: Array<{ item: number; count: number }>;
  /** Exploration / event credit. */
  explored?: boolean;
  /** Expected completion (frozen golden). */
  expectComplete: boolean;
}

export interface DiffMismatch {
  scenarioId: string;
  questEntry: number;
  detail: string;
  interpreter: boolean;
  questlog: boolean;
  golden?: boolean;
}

// Build InterpreterQuestStatus from slim-style scenario progress. Applies AdjustQuestReqItemCount for
// inventory; sets kill/GO slots from maps; sets m_explored from scenario.
export function statusFromScenario(
  quest: QuestDef,
  scenario: Omit<OracleScenario, 'id' | 'expectComplete'>,
): InterpreterQuestStatus {
  let st = createIncompleteStatus(quest);
  const raw = quest.rawObjectives;
  if (!raw) return st;

  // Kill / GO slot progress from maps
  for (let j = 0; j < QUEST_OBJECTIVES_COUNT; j++) {
    const id = raw.reqCreatureOrGoId[j] ?? 0;
    const need = raw.reqCreatureOrGoCount[j] ?? 0;
    if (id > 0) {
      const have = scenario.kills?.[String(id)] ?? 0;
      st.m_creatureOrGOcount[j] = Math.min(need, have);
    } else if (id < 0) {
      const have = scenario.objects?.[String(-id)] ?? 0;
      st.m_creatureOrGOcount[j] = Math.min(need, have);
    }
  }

  // CQ6 / qofid-s3: flag-2 + met kills/objects (no exploreTriggers) satisfy m_explored —
  // same proxy as questlog.exploreMet / live.exploredForInterpreter.
  if (
    exploredForInterpreter(quest, {
      explored: scenario.explored,
      kills: scenario.kills ?? {},
      objects: scenario.objects ?? {},
    })
  ) {
    st.m_explored = true;
  }

  const inv = scenario.inventory ?? [];
  const itemCountOf = (itemId: number) =>
    inv.reduce((n, s) => (s.item === itemId ? n + s.count : n), 0);
  if (hasSpecialFlag(computeSpecialFlags(quest), QUEST_SPECIAL_FLAG_DELIVER)) {
    st = adjustQuestReqItemCount(quest, st, itemCountOf);
  }
  return st;
}

/** Pre-QI QuestState from the same scenario. */
export function questStateFromScenario(
  quest: QuestDef,
  scenario: Omit<OracleScenario, 'id' | 'expectComplete'>,
): QuestState {
  const kills: Record<string, number> = { ...(scenario.kills ?? {}) };
  // Ensure kill keys exist for all killTargets (accept-style).
  for (const kt of quest.killTargets ?? []) {
    const k = String(kt.creatureEntry);
    if (!(k in kills)) kills[k] = 0;
  }
  const objects: Record<string, number> = { ...(scenario.objects ?? {}) };
  for (const ot of quest.objectTargets ?? []) {
    const k = String(ot.objectEntry);
    if (!(k in objects)) objects[k] = 0;
  }
  return {
    entry: quest.entry,
    status: 'active',
    kills,
    objects,
    ...(scenario.explored != null ? { explored: scenario.explored } : {}),
  };
}

export function inventoryFromScenario(
  scenario: Omit<OracleScenario, 'id' | 'expectComplete'>,
): Inventory {
  return { stacks: (scenario.inventory ?? []).map((s) => ({ ...s })) } as Inventory;
}

/** Diff one scenario: interpreter canComplete vs pre-QI questComplete vs optional golden. */
export function diffScenario(
  quest: QuestDef,
  scenario: OracleScenario,
  opts?: { questCompleteOpts?: QuestCompleteOpts; canCompleteOpts?: CanCompleteOpts },
): DiffMismatch | null {
  if (!isClaimedByQi2(quest)) {
    return {
      scenarioId: scenario.id,
      questEntry: quest.entry,
      detail: 'quest not claimed by QI2',
      interpreter: false,
      questlog: false,
      golden: scenario.expectComplete,
    };
  }

  const st = statusFromScenario(quest, scenario);
  const inv = inventoryFromScenario(scenario);
  const qState = questStateFromScenario(quest, scenario);

  const interp = canCompleteQuest(quest, st, opts?.canCompleteOpts);
  // LOCK-9: oracle diffs interpreter vs pre-QI slim body (not the live QI5 path).
  const ql = questCompleteSlim(quest, qState, inv, opts?.questCompleteOpts);

  if (interp !== ql) {
    return {
      scenarioId: scenario.id,
      questEntry: quest.entry,
      detail: `interpreter (${interp}) != questlog (${ql})`,
      interpreter: interp,
      questlog: ql,
      golden: scenario.expectComplete,
    };
  }
  if (interp !== scenario.expectComplete) {
    return {
      scenarioId: scenario.id,
      questEntry: quest.entry,
      detail: `live (${interp}) != golden (${scenario.expectComplete})`,
      interpreter: interp,
      questlog: ql,
      golden: scenario.expectComplete,
    };
  }
  return null;
}

// Apply full kill/item/explore progress via updaters (not pre-built status) and compare to questlog —
// stress-tests updater paths against slim record*.
export function diffViaUpdaters(
  quest: QuestDef,
  scenario: OracleScenario,
): DiffMismatch | null {
  if (!isClaimedByQi2(quest)) return null;

  let log = emptyInterpreterLog();
  log.set(quest.entry, createIncompleteStatus(quest));
  const questOf = (e: number) => (e === quest.entry ? quest : undefined);

  // Items: set inventory then AdjustQuestReqItemCount
  const inv = inventoryFromScenario(scenario);
  const itemCountOf = (id: number) => countItem(inv, id);
  let st = log.get(quest.entry)!;
  st = adjustQuestReqItemCount(quest, st, itemCountOf);
  log.set(quest.entry, st);

  // Kills: apply credit N times per creature
  for (const [creStr, n] of Object.entries(scenario.kills ?? {})) {
    const cre = Number(creStr);
    for (let i = 0; i < n; i++) {
      const r = killedMonsterCredit(log, questOf, cre);
      log = r.log;
    }
  }

  // GOs: activate N times
  for (const [goStr, n] of Object.entries(scenario.objects ?? {})) {
    const go = Number(goStr);
    for (let i = 0; i < n; i++) {
      const r = gameObjectActivated(log, questOf, go);
      log = r.log;
    }
  }

  if (scenario.explored) {
    const r = areaExploredOrEventHappens(log, quest.entry, questOf);
    log = r.log;
  }

  const finalSt = log.get(quest.entry)!;
  // Parity with exploreMet: flag-2 GO/kill met without exploreTriggers → m_explored.
  if (
    exploredForInterpreter(quest, {
      explored: scenario.explored,
      kills: scenario.kills ?? {},
      objects: scenario.objects ?? {},
    })
  ) {
    finalSt.m_explored = true;
    log.set(quest.entry, finalSt);
  }
  const interp = canCompleteQuest(quest, finalSt);
  const qState = questStateFromScenario(quest, scenario);
  const ql = questCompleteSlim(quest, qState, inv);

  if (interp !== ql || interp !== scenario.expectComplete) {
    return {
      scenarioId: scenario.id + '/updaters',
      questEntry: quest.entry,
      detail: `updaters interp=${interp} questlog=${ql} golden=${scenario.expectComplete}`,
      interpreter: interp,
      questlog: ql,
      golden: scenario.expectComplete,
    };
  }
  return null;
}

/** Build empty + full + partial scenarios for a claimed quest (for golden generation). */
export function buildParityScenarios(quest: QuestDef): OracleScenario[] {
  if (!isClaimedByQi2(quest)) return [];
  const raw = quest.rawObjectives!;
  const entry = quest.entry;
  const scenarios: OracleScenario[] = [];

  // empty → usually incomplete
  scenarios.push({
    id: `${entry}-empty`,
    questEntry: entry,
    kills: {},
    objects: {},
    inventory: [],
    explored: false,
    expectComplete: false, // filled by evaluate after
  });

  const fullKills: Record<string, number> = {};
  const fullObjects: Record<string, number> = {};
  const fullInv: Array<{ item: number; count: number }> = [];
  let needExplore = false;

  for (let j = 0; j < QUEST_OBJECTIVES_COUNT; j++) {
    const itemId = raw.reqItemId[j] ?? 0;
    const itemN = raw.reqItemCount[j] ?? 0;
    if (itemId > 0 && itemN > 0) fullInv.push({ item: itemId, count: itemN });

    const id = raw.reqCreatureOrGoId[j] ?? 0;
    const n = raw.reqCreatureOrGoCount[j] ?? 0;
    if (id > 0 && n > 0) fullKills[String(id)] = n;
    if (id < 0 && n > 0) fullObjects[String(-id)] = n;
  }
  if (hasSpecialFlag(computeSpecialFlags(quest), QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT)) {
    needExplore = true;
  }

  scenarios.push({
    id: `${entry}-full`,
    questEntry: entry,
    kills: fullKills,
    objects: fullObjects,
    inventory: fullInv,
    explored: needExplore ? true : false,
    expectComplete: true,
  });

  // partial: half of first kill/item if any
  const partialKills = { ...fullKills };
  const partialInv = fullInv.map((s) => ({ ...s }));
  let partialed = false;
  for (const k of Object.keys(partialKills)) {
    if (partialKills[k] > 1) {
      partialKills[k] = Math.floor(partialKills[k] / 2);
      partialed = true;
      break;
    } else if (partialKills[k] === 1) {
      partialKills[k] = 0;
      partialed = true;
      break;
    }
  }
  if (!partialed && partialInv.length > 0) {
    partialInv[0] = {
      item: partialInv[0].item,
      count: Math.max(0, partialInv[0].count - 1),
    };
    partialed = true;
  }
  if (partialed || needExplore) {
    scenarios.push({
      id: `${entry}-partial`,
      questEntry: entry,
      kills: partialKills,
      objects: fullObjects,
      inventory: partialInv,
      explored: needExplore ? false : false,
      expectComplete: false,
    });
  }

  // Evaluate expectComplete from pre-QI questlog (the frozen golden source of truth).
  for (const sc of scenarios) {
    const qState = questStateFromScenario(quest, sc);
    const inv = inventoryFromScenario(sc);
    sc.expectComplete = questCompleteSlim(quest, qState, inv);
  }

  return scenarios;
}

/** Re-export slim met helpers for tests that assert intermediate parity. */
export { killsMet, itemsMet, objectsMet, exploreMet };
