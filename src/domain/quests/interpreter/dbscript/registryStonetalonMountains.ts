// QI4 — kalimdor/stonetalon_mountains residual, extracted for the 1500-line ratchet. It claims the
// accept hook for quest 6523; 1079 and 1080 are GameObject residuals. Cite: stonetalon_mountains.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface StonetalonMountainsQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: stonetalon_mountains.cpp:45 QUEST_PROTECT_KAYA = 6523 Escort Kaya Flathoof to Camp Aparaje; explore
// credit at WP19.
export const QUEST_PROTECT_KAYA = 6523;

// Cite: bake starterCreatureEntries quest 6523; scriptdev-corpus boundCreatures Kaya Flathoof (11856) — not
// an enum in the cpp file.
const NPC_KAYA_FLATHOOF = 11856;
/** Cite: bake enderCreatureEntries quest 6523 Makaba Flathoof. */
const NPC_MAKABA_FLATHOOF = 11857;

/** Cite: stonetalon_mountains.cpp:37 NPC_GRIMTOTEM_RUFFIAN = 11910 WP17 ambush summon. */
const NPC_GRIMTOTEM_RUFFIAN = 11910;
/** Cite: stonetalon_mountains.cpp:38 NPC_GRIMTOTEM_BRUTE = 11912 */
const NPC_GRIMTOTEM_BRUTE = 11912;
/** Cite: stonetalon_mountains.cpp:39 NPC_GRIMTOTEM_SORCERER = 11913 */
const NPC_GRIMTOTEM_SORCERER = 11913;

/** Cite: stonetalon_mountains.cpp:41–43 script texts. */
const SAY_START = -1000357;
const SAY_AMBUSH = -1000358;
const SAY_END = -1000359;

/** Cite: ScriptDevAIMgr.h:56 FACTION_ESCORT_H_PASSIVE = 775 SetFactionTemporary on accept. */
const FACTION_ESCORT_H_PASSIVE = 775;
/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: stonetalon_mountains.cpp:95 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x01 |
// 0x20 = 0x21
const KAYA_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;

// Cite: Object.h:45 TEMPSPAWN_CORPSE_TIMED_DESPAWN = 3 WP17 SummonCreature TEMPSPAWN_CORPSE_TIMED_DESPAWN,
// 30000.
const TEMPSPAWN_CORPSE_TIMED_DESPAWN = 3;
/** Cite: stonetalon_mountains.cpp:69–71 ambush despawn delay 30000 */
const AMBUSH_DESPAWN_MS = 30000;

/** Cite: stonetalon_mountains.cpp:69–71 WP17 SummonCreature positions. Ruffian / Brute / Sorcerer. */
const AMBUSH_SPAWN = [
  { entry: NPC_GRIMTOTEM_RUFFIAN, x: -50.75, y: -500.77, z: -46.13, o: 0.4 },
  { entry: NPC_GRIMTOTEM_BRUTE, x: -40.05, y: -510.89, z: -46.05, o: 1.7 },
  { entry: NPC_GRIMTOTEM_SORCERER, x: -32.21, y: -499.2, z: -45.35, o: 2.8 },
] as const;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_kaya — quest 6523 Protect Kaya: temporary passive faction, the start line and an
// escort; WP17 is the Grimtotem ambush and WP19 the credit. Cite: stonetalon_mountains.cpp:89–102.
function runKayaAccept(): DbScriptIntent[] {
  const citeFaction =
    `stonetalon_mountains.cpp:95 SetFactionTemporary(FACTION_ESCORT_H_PASSIVE=` +
    `${FACTION_ESCORT_H_PASSIVE}, TEMPFACTION_RESTORE_RESPAWN|TOGGLE_IMMUNE_TO_NPC=` +
    `${KAYA_TEMP_FACTION_FLAGS})`;
  const citeTalk =
    `stonetalon_mountains.cpp:96 npc_kaya (${NPC_KAYA_FLATHOOF}) ` +
    `DoScriptText(SAY_START=${SAY_START})`;
  const citeEscort =
    `stonetalon_mountains.cpp:98–99 npc_kaya (${NPC_KAYA_FLATHOOF}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeWp17 =
    `stonetalon_mountains.cpp:64–72 WP17 DoScriptText(SAY_AMBUSH=${SAY_AMBUSH}) + ` +
    `SummonCreature(NPC_GRIMTOTEM_RUFFIAN=${NPC_GRIMTOTEM_RUFFIAN} @ ${AMBUSH_SPAWN[0].x}) + ` +
    `SummonCreature(NPC_GRIMTOTEM_BRUTE=${NPC_GRIMTOTEM_BRUTE} @ ${AMBUSH_SPAWN[1].x}) + ` +
    `SummonCreature(NPC_GRIMTOTEM_SORCERER=${NPC_GRIMTOTEM_SORCERER} @ ${AMBUSH_SPAWN[2].x}) ` +
    `TEMPSPAWN_CORPSE_TIMED_DESPAWN=${TEMPSPAWN_CORPSE_TIMED_DESPAWN} ${AMBUSH_DESPAWN_MS}ms - FO6`;
  const citeWp19 =
    `stonetalon_mountains.cpp:74–78 WP19 DoScriptText(SAY_END=${SAY_END}) + ` +
    'RewardPlayerAndGroupAtEventExplored(6523) - FO6 finishEscort';
  const citeSummoned =
    `stonetalon_mountains.cpp:54–57 JustSummoned AttackStart(m_creature) for ` +
    `grimtotems ${NPC_GRIMTOTEM_RUFFIAN}/${NPC_GRIMTOTEM_BRUTE}/${NPC_GRIMTOTEM_SORCERER} - FO6 combat`;
  const citeEnder =
    `bake enderCreatureEntries NPC_MAKABA_FLATHOOF=${NPC_MAKABA_FLATHOOF} after explore credit`;
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_H_PASSIVE,
      flags: KAYA_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'talk',
      textId: SAY_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_kaya (${NPC_KAYA_FLATHOOF}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP17 SAY_AMBUSH (${SAY_AMBUSH}) + NPC_GRIMTOTEM_RUFFIAN (${NPC_GRIMTOTEM_RUFFIAN}) + ` +
        `NPC_GRIMTOTEM_BRUTE (${NPC_GRIMTOTEM_BRUTE}) + NPC_GRIMTOTEM_SORCERER (${NPC_GRIMTOTEM_SORCERER}) ` +
        `TEMPSPAWN_CORPSE_TIMED_DESPAWN (${TEMPSPAWN_CORPSE_TIMED_DESPAWN}) ${AMBUSH_DESPAWN_MS}ms - FO6`,
      cite: citeWp17,
    },
    {
      kind: 'skip',
      reason:
        `WP19 SAY_END (${SAY_END}) + RewardPlayerAndGroupAtEventExplored(6523) - FO6 finishEscort`,
      cite: citeWp19,
    },
    {
      kind: 'skip',
      reason:
        `JustSummoned AttackStart grimtotems (${NPC_GRIMTOTEM_RUFFIAN}/${NPC_GRIMTOTEM_BRUTE}/` +
        `${NPC_GRIMTOTEM_SORCERER}) - FO6 combat`,
      cite: citeSummoned,
    },
    {
      kind: 'skip',
      reason:
        `turn-in NPC_MAKABA_FLATHOOF (${NPC_MAKABA_FLATHOOF}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/stonetalon_mountains.cpp Hooks: pQuestAcceptNPC kaya (6523). Residuals documented
// on accept chain: WP17 grimtotem ambush, WP19 explore.
export function runStonetalonMountains(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_PROTECT_KAYA) return runKayaAccept();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/stonetalon_mountains'` in registry.ts.
export const STONETALON_MOUNTAINS_REGISTRY: Record<
  string | number,
  StonetalonMountainsQuestScriptEntry
> = {
  'kalimdor/stonetalon_mountains': {
    family: 'kalimdor/stonetalon_mountains',
    questIds: [QUEST_PROTECT_KAYA],
    hooks: ['accept'],
    cite: 'kalimdor/stonetalon_mountains.cpp:89–102,59–80,54–57',
    run: runStonetalonMountains,
  },
  [QUEST_PROTECT_KAYA]: {
    family: 'kalimdor/stonetalon_mountains',
    questId: QUEST_PROTECT_KAYA,
    questIds: [QUEST_PROTECT_KAYA],
    hooks: ['accept'],
    cite: 'stonetalon_mountains.cpp:89–102 QuestAccept_npc_kaya',
    run: runStonetalonMountains,
  },
};
