// QI4 — world/go_scripts residuals, extracted for the 1500-line ratchet. GO use only: the Andorhal
// towers 176094–176097 credit NPCs 10902–10905 for quests 5097/5098. Cite: world/go_scripts.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface GoScriptsQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: go_scripts.cpp:41 QUEST_ALL_ALONG_THE_WATCHTOWERS_ALLIANCE = 5097 Alliance watchtower torch-mark
// quest (Commander Ashlam Valorfist).
export const QUEST_ALL_ALONG_THE_WATCHTOWERS_ALLIANCE = 5097;
// Cite: go_scripts.cpp:42 QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE = 5098 Horde watchtower torch-mark quest
// (High Executor Derrington).
export const QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE = 5098;

// Cite: go_scripts.cpp:43–46 NPC_ANDORHAL_TOWER_1..4 KilledMonsterCredit targets; bake killTargets
// 10902–10905 ×1 each.
export const NPC_ANDORHAL_TOWER_1 = 10902;
export const NPC_ANDORHAL_TOWER_2 = 10903;
export const NPC_ANDORHAL_TOWER_3 = 10904;
export const NPC_ANDORHAL_TOWER_4 = 10905;

// Cite: go_scripts.cpp:47–50 GO_ANDORHAL_TOWER_1..4 Tower gameobjects that fire GOUse_go_andorhal_tower.
export const GO_ANDORHAL_TOWER_1 = 176094;
export const GO_ANDORHAL_TOWER_2 = 176095;
export const GO_ANDORHAL_TOWER_3 = 176096;
export const GO_ANDORHAL_TOWER_4 = 176097;

/** Cite: go_scripts.cpp:58–64 switch (pGo->GetEntry()) → uiKillCredit GO entry → NPC kill-credit entry. */
export const ANDORHAL_TOWER_GO_TO_CREDIT: Readonly<Record<number, number>> = {
  [GO_ANDORHAL_TOWER_1]: NPC_ANDORHAL_TOWER_1,
  [GO_ANDORHAL_TOWER_2]: NPC_ANDORHAL_TOWER_2,
  [GO_ANDORHAL_TOWER_3]: NPC_ANDORHAL_TOWER_3,
  [GO_ANDORHAL_TOWER_4]: NPC_ANDORHAL_TOWER_4,
};

/** Cite: bake starterCreatureEntries quest 5097 — Commander Ashlam Valorfist. */
const NPC_COMMANDER_ASHLAM_VALORFIST = 10838;
/** Cite: bake starterCreatureEntries quest 5098 — High Executor Derrington. */
const NPC_HIGH_EXECUTOR_DERRINGTON = 10837;
// Cite: bake srcItem quests 5097/5098 — Beacon Torch granted on accept. Host inventory path; GOUse itself
// does not consume the item in C++ residual.
const ITEM_BEACON_TORCH = 12815;

// ── GOUse residual ───────────────────────────────────────────────────────────

// GOUse_go_andorhal_tower for one tower: while either quest is incomplete, map the GO entry to its
// NPC and credit that kill. An unknown entry emits a skip. Cite: go_scripts.cpp:53–68.
export function runAndorhalTowerGoUse(goEntry: number): DbScriptIntent[] {
  const citeGate =
    `go_scripts.cpp:55 GOUse_go_andorhal_tower ` +
    `QUEST_ALL_ALONG_THE_WATCHTOWERS_ALLIANCE=${QUEST_ALL_ALONG_THE_WATCHTOWERS_ALLIANCE} ` +
    `|| QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE=${QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE} ` +
    'INCOMPLETE gate';
  const credit = ANDORHAL_TOWER_GO_TO_CREDIT[goEntry];
  if (!credit) {
    return [
      {
        kind: 'skip',
        reason:
          `GO ${goEntry} is not an Andorhal tower (GO_ANDORHAL_TOWER_1..4 ` +
          `${GO_ANDORHAL_TOWER_1}–${GO_ANDORHAL_TOWER_4}) - no KilledMonsterCredit`,
        cite: 'go_scripts.cpp:58–66 switch uiKillCredit=0',
      },
    ];
  }
  const citeCredit =
    `go_scripts.cpp:58–66 GO ${goEntry} → KilledMonsterCredit(${credit})`;
  return [
    {
      kind: 'skip',
      reason:
        `GOUse Andorhal tower ${goEntry} requires incomplete ` +
        `${QUEST_ALL_ALONG_THE_WATCHTOWERS_ALLIANCE} or ` +
        `${QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE} (Beacon Torch ${ITEM_BEACON_TORCH})`,
      cite: citeGate,
    },
    {
      kind: 'kill_credit',
      creatureEntry: credit,
      cite: citeCredit,
    },
  ];
}

// Zone-granular frame: all four Andorhal tower credits for the incomplete 5097/5098 objective set,
// which the bake lists as killTargets 10902–10905 ×1. Cite: go_scripts.cpp:53–68.
function runAndorhalTowersFrame(questId: number): DbScriptIntent[] {
  const ender =
    questId === QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE
      ? NPC_HIGH_EXECUTOR_DERRINGTON
      : NPC_COMMANDER_ASHLAM_VALORFIST;
  const citeGate =
    `go_scripts.cpp:55 GOUse_go_andorhal_tower questId=${questId} ` +
    `INCOMPLETE (${QUEST_ALL_ALONG_THE_WATCHTOWERS_ALLIANCE}/` +
    `${QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE})`;
  const citeMap =
    `go_scripts.cpp:58–64 GO ${GO_ANDORHAL_TOWER_1}→${NPC_ANDORHAL_TOWER_1}, ` +
    `${GO_ANDORHAL_TOWER_2}→${NPC_ANDORHAL_TOWER_2}, ` +
    `${GO_ANDORHAL_TOWER_3}→${NPC_ANDORHAL_TOWER_3}, ` +
    `${GO_ANDORHAL_TOWER_4}→${NPC_ANDORHAL_TOWER_4}`;
  const citeTurn =
    `bake killTargets ${NPC_ANDORHAL_TOWER_1}–${NPC_ANDORHAL_TOWER_4}×1; ` +
    `srcItem Beacon Torch ${ITEM_BEACON_TORCH}; ender ${ender}`;
  const intents: DbScriptIntent[] = [
    {
      kind: 'skip',
      reason:
        `Andorhal tower GOUse requires incomplete ${questId} ` +
        `(Alliance ${QUEST_ALL_ALONG_THE_WATCHTOWERS_ALLIANCE} / ` +
        `Horde ${QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE}); Beacon Torch ${ITEM_BEACON_TORCH}`,
      cite: citeGate,
    },
    {
      kind: 'skip',
      reason:
        `GO→credit map ${GO_ANDORHAL_TOWER_1}→${NPC_ANDORHAL_TOWER_1} ` +
        `${GO_ANDORHAL_TOWER_2}→${NPC_ANDORHAL_TOWER_2} ` +
        `${GO_ANDORHAL_TOWER_3}→${NPC_ANDORHAL_TOWER_3} ` +
        `${GO_ANDORHAL_TOWER_4}→${NPC_ANDORHAL_TOWER_4}`,
      cite: citeMap,
    },
  ];
  // Zone-granular: emit every tower credit (full bake killTargets set).
  for (const [goEntryStr, credit] of Object.entries(ANDORHAL_TOWER_GO_TO_CREDIT)) {
    const goEntry = Number(goEntryStr);
    intents.push({
      kind: 'kill_credit',
      creatureEntry: credit,
      cite:
        `go_scripts.cpp:58–66 GOUse GO ${goEntry} → ` +
        `KilledMonsterCredit(${credit})`,
    });
  }
  intents.push({
    kind: 'skip',
    reason:
      `turn-in NPC ${ender} after kill_credit ` +
      `${NPC_ANDORHAL_TOWER_1}/${NPC_ANDORHAL_TOWER_2}/` +
      `${NPC_ANDORHAL_TOWER_3}/${NPC_ANDORHAL_TOWER_4}`,
    cite: citeTurn,
  });
  return intents;
}

// Family pack: world/go_scripts.cpp Residual: go_andorhal_tower (5097 Alliance / 5098 Horde).
// Frame/complete only.
export function runGoScripts(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase !== 'frame' && phase !== 'complete') return [];
  if (
    questId === QUEST_ALL_ALONG_THE_WATCHTOWERS_ALLIANCE ||
    questId === QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE
  ) {
    return runAndorhalTowersFrame(questId);
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'world/go_scripts'` in registry.ts.
export const GO_SCRIPTS_REGISTRY: Record<string | number, GoScriptsQuestScriptEntry> = {
  'world/go_scripts': {
    family: 'world/go_scripts',
    questIds: [
      QUEST_ALL_ALONG_THE_WATCHTOWERS_ALLIANCE,
      QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE,
    ],
    hooks: ['frame', 'complete'],
    cite: 'world/go_scripts.cpp:53–68 GOUse_go_andorhal_tower',
    run: runGoScripts,
  },
  [QUEST_ALL_ALONG_THE_WATCHTOWERS_ALLIANCE]: {
    family: 'world/go_scripts',
    questId: QUEST_ALL_ALONG_THE_WATCHTOWERS_ALLIANCE,
    questIds: [QUEST_ALL_ALONG_THE_WATCHTOWERS_ALLIANCE],
    hooks: ['frame', 'complete'],
    cite: 'go_scripts.cpp:53–68 GOUse_go_andorhal_tower (Alliance 5097)',
    run: runGoScripts,
  },
  [QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE]: {
    family: 'world/go_scripts',
    questId: QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE,
    questIds: [QUEST_ALL_ALONG_THE_WATCHTOWERS_HORDE],
    hooks: ['frame', 'complete'],
    cite: 'go_scripts.cpp:53–68 GOUse_go_andorhal_tower (Horde 5098)',
    run: runGoScripts,
  },
};
