// QI4 — razorfen_downs residual, extracted for the 1500-line ratchet. This batch claims the accept
// hook for quest 3525 only. Cite: kalimdor/razorfen_downs/razorfen_downs.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface RazorfenDownsQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: razorfen_downs.cpp:39 QUEST_EXTINGUISHING_THE_IDOL = 3525 Escort + idol-shutdown ritual; explore
// credit at ritual phase 10.
export const QUEST_EXTINGUISHING_THE_IDOL = 3525;

// Cite: bake starterCreatureEntries / enderCreatureEntries quest 3525; Belnistrasz (8516) — not an enum in
// the cpp file.
const NPC_BELNISTRASZ = 8516;
// Cite: razorfen_downs.cpp:50 NPC_IDOL_ROOM_SPAWNER = 8611 Summoned at m_fSpawnerCoord[i] during ritual;
// JustSummoned → SpawnerSummon.
const NPC_IDOL_ROOM_SPAWNER = 8611;
/** Cite: razorfen_downs.cpp:52–55 wave / boss entries from SpawnerSummon. */
const NPC_WITHERED_BATTLE_BOAR = 7333;
const NPC_WITHERED_QUILGUARD = 7329;
const NPC_DEATHS_HEAD_GEOMANCER = 7335;
const NPC_PLAGUEMAW_THE_ROTTING = 7356;

// Cite: razorfen_downs.cpp:57 GO_BELNISTRASZ_BRAZIER = 152097 Refresh on ritual complete; bake
// goEnderEntries / goEnder for turn-in.
const GO_BELNISTRASZ_BRAZIER = 152097;
/** Cite: razorfen_downs.cpp:58–60,81 aGOList idol fires deactivated at phase 10. */
const GO_IDOL_OVEN_FIRE = 151951;
const GO_IDOL_CUP_FIRE = 151952;
const GO_IDOL_MOUTH_FIRE = 151973;

/** Cite: razorfen_downs.cpp:41–48 script texts. */
const SAY_BELNISTRASZ_READY = -1129005;
const SAY_BELNISTRASZ_START_RIT = -1129006;
const SAY_BELNISTRASZ_AGGRO_1 = -1129007;
const SAY_BELNISTRASZ_AGGRO_2 = -1129008;
const SAY_BELNISTRASZ_3_MIN = -1129009;
const SAY_BELNISTRASZ_2_MIN = -1129010;
const SAY_BELNISTRASZ_1_MIN = -1129011;
const SAY_BELNISTRASZ_FINISH = -1129012;

// Cite: razorfen_downs.cpp:62–66 combat / ritual spells. SPELL_ARCANE_INTELLECT noted as default (comment
// only).
const SPELL_ARCANE_INTELLECT = 13326;
const SPELL_FIREBALL = 9053;
const SPELL_FROST_NOVA = 11831;
const SPELL_IDOL_SHUTDOWN = 12774;
const SPELL_IDOL_ROOM_SHAKE = 12816;

/** Cite: ScriptDevAIMgr.h:50 FACTION_ESCORT_N_NEUTRAL_ACTIVE = 250 SetFactionTemporary on accept. */
const FACTION_ESCORT_N_NEUTRAL_ACTIVE = 250;
// Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 razorfen_downs.cpp:301 SetFactionTemporary(…,
// TEMPFACTION_RESTORE_RESPAWN).
const TEMPFACTION_RESTORE_RESPAWN = 0x01;

/** Cite: Object.h:46 TEMPSPAWN_TIMED_DESPAWN = 4 DoSummonSpawner: TEMPSPAWN_TIMED_DESPAWN, 10000. */
const TEMPSPAWN_TIMED_DESPAWN = 4;
// Cite: Object.h:47 TEMPSPAWN_TIMED_OOC_DESPAWN = 5 SpawnerSummon wave/boss: TEMPSPAWN_TIMED_OOC_DESPAWN,
// 60000.
const TEMPSPAWN_TIMED_OOC_DESPAWN = 5;
/** Cite: razorfen_downs.cpp:164 spawner despawn delay 10000 */
const SPAWNER_DESPAWN_MS = 10000;
/** Cite: razorfen_downs.cpp:126,153 wave/boss despawn delay 60000 */
const WAVE_DESPAWN_MS = 60000;

// Cite: Common.h:113–119 MINUTE=60, HOUR=MINUTE*60, IN_MILLISECONDS=1000 razorfen_downs.cpp:235
// SetRespawnTime(HOUR * IN_MILLISECONDS) on brazier.
const HOUR_MS = 60 * 60 * 1000;
/** Cite: razorfen_downs.cpp:231 GetClosestGameObjectWithEntry radius 10.0f */
const BRAZIER_SEARCH_RADIUS = 10;
/** Cite: razorfen_downs.cpp:248 GetGameObjectListWithEntryInGrid radius 40.0f */
const IDOL_FIRE_SEARCH_RADIUS = 40;

/** Cite: razorfen_downs.cpp:74–79 m_fSpawnerCoord[3][4] */
const SPAWNER_COORDS = [
  { x: 2582.79, y: 954.392, z: 52.4821, o: 3.78736 },
  { x: 2569.42, y: 956.38, z: 52.2732, o: 5.42797 },
  { x: 2570.62, y: 942.393, z: 53.7433, o: 0.71558 },
] as const;

// Cite: razorfen_downs.cpp:88 m_uiRitualTimer = 1000 initial Ritual phase timers (cases 0–9 before ++phase
// advances).
const RITUAL_TIMER_INITIAL_MS = 1000;
/** Cite: razorfen_downs.cpp:186 case 0 → 1000 after cast */
const RITUAL_TIMER_AFTER_SHUTDOWN_MS = 1000;
/** Cite: razorfen_downs.cpp:190 case 1 → 39000 */
const RITUAL_TIMER_PHASE1_MS = 39000;
/** Cite: razorfen_downs.cpp:194,198,212,220 cases 2/3/6/8 → 20000 */
const RITUAL_TIMER_20S_MS = 20000;
/** Cite: razorfen_downs.cpp:202,207,215 cases 4/5/7 → 40000 */
const RITUAL_TIMER_40S_MS = 40000;
/** Cite: razorfen_downs.cpp:223 case 9 → 3000 before finish */
const RITUAL_TIMER_FINISH_MS = 3000;
/** Cite: razorfen_downs.cpp:102–103 combat timers on Reset */
const FIREBALL_TIMER_MS = 1000;
const FROST_NOVA_TIMER_MS = 6000;
/** Cite: razorfen_downs.cpp:169 WP id that starts ritual */
const RITUAL_WAYPOINT = 24;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_belnistrasz — quest 3525 Extinguishing the Idol: a run escort that pauses at WP24
// for the ritual, whose tenth phase credits and refreshes the brazier. Cite: :293–306, :176–262.
function runBelnistraszAccept(): DbScriptIntent[] {
  const citeEscort =
    `razorfen_downs.cpp:299 npc_belnistrasz (${NPC_BELNISTRASZ}) ` +
    'npc_escortAI::Start(true, player, quest) - FO6 degraded finishEscort';
  const citeReady =
    `razorfen_downs.cpp:300 DoScriptText(SAY_BELNISTRASZ_READY=${SAY_BELNISTRASZ_READY})`;
  const citeFaction =
    `razorfen_downs.cpp:301 SetFactionTemporary(FACTION_ESCORT_N_NEUTRAL_ACTIVE=` +
    `${FACTION_ESCORT_N_NEUTRAL_ACTIVE}, TEMPFACTION_RESTORE_RESPAWN=${TEMPFACTION_RESTORE_RESPAWN})`;
  const citeWp =
    `razorfen_downs.cpp:169–173 WP${RITUAL_WAYPOINT} DoScriptText(SAY_BELNISTRASZ_START_RIT=` +
    `${SAY_BELNISTRASZ_START_RIT}) + SetEscortPaused(true) - FO6`;
  const citeRitual0 =
    `razorfen_downs.cpp:184–187 case 0 DoCastSpellIfCan(SPELL_IDOL_SHUTDOWN=` +
    `${SPELL_IDOL_SHUTDOWN}); m_uiRitualTimer=${RITUAL_TIMER_AFTER_SHUTDOWN_MS}ms - FO6 ritual`;
  const citeSpawners =
    `razorfen_downs.cpp:162–165,188–220 DoSummonSpawner irand(0,2) NPC_IDOL_ROOM_SPAWNER=` +
    `${NPC_IDOL_ROOM_SPAWNER} at m_fSpawnerCoord[0..2] ` +
    `(${SPAWNER_COORDS[0].x}/${SPAWNER_COORDS[1].x}/${SPAWNER_COORDS[2].x}) ` +
    `TEMPSPAWN_TIMED_DESPAWN=${TEMPSPAWN_TIMED_DESPAWN} ${SPAWNER_DESPAWN_MS}ms; ` +
    `timers ${RITUAL_TIMER_PHASE1_MS}/${RITUAL_TIMER_20S_MS}/${RITUAL_TIMER_40S_MS}ms - FO6`;
  const citeWaves =
    `razorfen_downs.cpp:122–155 SpawnerSummon: phase≤7 2×NPC_WITHERED_BATTLE_BOAR=` +
    `${NPC_WITHERED_BATTLE_BOAR} + NPC_WITHERED_QUILGUARD=${NPC_WITHERED_QUILGUARD} + ` +
    `NPC_DEATHS_HEAD_GEOMANCER=${NPC_DEATHS_HEAD_GEOMANCER}; phase>7 ` +
    `NPC_PLAGUEMAW_THE_ROTTING=${NPC_PLAGUEMAW_THE_ROTTING}; ` +
    `TEMPSPAWN_TIMED_OOC_DESPAWN=${TEMPSPAWN_TIMED_OOC_DESPAWN} ${WAVE_DESPAWN_MS}ms - FO6 combat`;
  const citeCountdown =
    `razorfen_downs.cpp:197–223 SAY_BELNISTRASZ_3_MIN/2_MIN/1_MIN/FINISH=` +
    `${SAY_BELNISTRASZ_3_MIN}/${SAY_BELNISTRASZ_2_MIN}/${SAY_BELNISTRASZ_1_MIN}/` +
    `${SAY_BELNISTRASZ_FINISH}; finish timer ${RITUAL_TIMER_FINISH_MS}ms - FO6`;
  const citeAggro =
    `razorfen_downs.cpp:107–114 AttackedBy while paused urand ` +
    `SAY_BELNISTRASZ_AGGRO_1/2=${SAY_BELNISTRASZ_AGGRO_1}/${SAY_BELNISTRASZ_AGGRO_2} - FO6 combat`;
  const citeCombat =
    `razorfen_downs.cpp:100–104,268–282 combat SPELL_FIREBALL=${SPELL_FIREBALL} ` +
    `timer ${FIREBALL_TIMER_MS}ms; SPELL_FROST_NOVA=${SPELL_FROST_NOVA} timer ` +
    `${FROST_NOVA_TIMER_MS}ms (default SPELL_ARCANE_INTELLECT=${SPELL_ARCANE_INTELLECT}) - FO6`;
  const citeCredit =
    `razorfen_downs.cpp:225–242 case 10 RewardPlayerAndGroupAtEventExplored(3525) + ` +
    `GO_BELNISTRASZ_BRAZIER=${GO_BELNISTRASZ_BRAZIER} within ${BRAZIER_SEARCH_RADIUS} ` +
    `SetRespawnTime(HOUR_MS=${HOUR_MS}) Refresh + RemoveAurasDueToSpell(SPELL_IDOL_SHUTDOWN=` +
    `${SPELL_IDOL_SHUTDOWN}) + SetEscortPaused(false) - FO6 finishEscort`;
  const citeFires =
    `razorfen_downs.cpp:244–251 SPELL_IDOL_ROOM_SHAKE=${SPELL_IDOL_ROOM_SHAKE} + ` +
    `deactivate aGOList GO_IDOL_OVEN/CUP/MOUTH_FIRE=${GO_IDOL_OVEN_FIRE}/` +
    `${GO_IDOL_CUP_FIRE}/${GO_IDOL_MOUTH_FIRE} radius ${IDOL_FIRE_SEARCH_RADIUS} ` +
    `GO_JUST_DEACTIVATED - FO6`;
  const citeEnder =
    `bake enderCreatureEntries NPC_BELNISTRASZ=${NPC_BELNISTRASZ} + ` +
    `goEnder GO_BELNISTRASZ_BRAZIER=${GO_BELNISTRASZ_BRAZIER} after explore credit`;
  return [
    {
      kind: 'skip',
      reason:
        `escort Start(true, player, quest) npc_belnistrasz (${NPC_BELNISTRASZ}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'talk',
      textId: SAY_BELNISTRASZ_READY,
      stringTemplateId: 0,
      cite: citeReady,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_N_NEUTRAL_ACTIVE,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `WP${RITUAL_WAYPOINT} SAY_BELNISTRASZ_START_RIT (${SAY_BELNISTRASZ_START_RIT}) + ` +
        `SetEscortPaused(true) - FO6`,
      cite: citeWp,
    },
    {
      kind: 'skip',
      reason:
        `ritual case 0 SPELL_IDOL_SHUTDOWN (${SPELL_IDOL_SHUTDOWN}) timer ` +
        `${RITUAL_TIMER_INITIAL_MS}ms - FO6 ritual`,
      cite: citeRitual0,
    },
    {
      kind: 'skip',
      reason:
        `DoSummonSpawner NPC_IDOL_ROOM_SPAWNER (${NPC_IDOL_ROOM_SPAWNER}) ` +
        `TEMPSPAWN_TIMED_DESPAWN (${TEMPSPAWN_TIMED_DESPAWN}) ${SPAWNER_DESPAWN_MS}ms - FO6`,
      cite: citeSpawners,
    },
    {
      kind: 'skip',
      reason:
        `SpawnerSummon waves boar/quilguard/geomancer ` +
        `(${NPC_WITHERED_BATTLE_BOAR}/${NPC_WITHERED_QUILGUARD}/${NPC_DEATHS_HEAD_GEOMANCER}) ` +
        `→ Plaguemaw (${NPC_PLAGUEMAW_THE_ROTTING}) TEMPSPAWN_TIMED_OOC_DESPAWN ` +
        `(${TEMPSPAWN_TIMED_OOC_DESPAWN}) ${WAVE_DESPAWN_MS}ms - FO6 combat`,
      cite: citeWaves,
    },
    {
      kind: 'skip',
      reason:
        `countdown SAY 3/2/1 min + FINISH (${SAY_BELNISTRASZ_3_MIN}/` +
        `${SAY_BELNISTRASZ_2_MIN}/${SAY_BELNISTRASZ_1_MIN}/${SAY_BELNISTRASZ_FINISH}) - FO6`,
      cite: citeCountdown,
    },
    {
      kind: 'skip',
      reason:
        `AttackedBy aggro SAY (${SAY_BELNISTRASZ_AGGRO_1}/${SAY_BELNISTRASZ_AGGRO_2}) - FO6 combat`,
      cite: citeAggro,
    },
    {
      kind: 'skip',
      reason:
        `combat SPELL_FIREBALL/FROST_NOVA (${SPELL_FIREBALL}/${SPELL_FROST_NOVA}) - FO6`,
      cite: citeCombat,
    },
    {
      kind: 'skip',
      reason:
        `case 10 RewardPlayerAndGroupAtEventExplored(3525) + GO_BELNISTRASZ_BRAZIER ` +
        `(${GO_BELNISTRASZ_BRAZIER}) Refresh HOUR_MS=${HOUR_MS} + RemoveAuras ` +
        `SPELL_IDOL_SHUTDOWN (${SPELL_IDOL_SHUTDOWN}) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `SPELL_IDOL_ROOM_SHAKE (${SPELL_IDOL_ROOM_SHAKE}) + deactivate idol fires ` +
        `(${GO_IDOL_OVEN_FIRE}/${GO_IDOL_CUP_FIRE}/${GO_IDOL_MOUTH_FIRE}) - FO6`,
      cite: citeFires,
    },
    {
      kind: 'skip',
      reason:
        `turn-in NPC_BELNISTRASZ (${NPC_BELNISTRASZ}) / GO_BELNISTRASZ_BRAZIER ` +
        `(${GO_BELNISTRASZ_BRAZIER}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/razorfen_downs/razorfen_downs.cpp Hooks: pQuestAcceptNPC belnistrasz (3525).
// Residuals documented on accept chain: idol ritual phases, SpawnerSummon waves.
export function runRazorfenDowns(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_EXTINGUISHING_THE_IDOL) return runBelnistraszAccept();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/razorfen_downs/razorfen_downs'` in registry.ts.
export const RAZORFEN_DOWNS_REGISTRY: Record<string | number, RazorfenDownsQuestScriptEntry> = {
  'kalimdor/razorfen_downs/razorfen_downs': {
    family: 'kalimdor/razorfen_downs/razorfen_downs',
    questIds: [QUEST_EXTINGUISHING_THE_IDOL],
    hooks: ['accept'],
    cite: 'kalimdor/razorfen_downs/razorfen_downs.cpp:293–306,167–262,122–165',
    run: runRazorfenDowns,
  },
  [QUEST_EXTINGUISHING_THE_IDOL]: {
    family: 'kalimdor/razorfen_downs/razorfen_downs',
    questId: QUEST_EXTINGUISHING_THE_IDOL,
    questIds: [QUEST_EXTINGUISHING_THE_IDOL],
    hooks: ['accept'],
    cite: 'razorfen_downs.cpp:293–306 QuestAccept_npc_belnistrasz',
    run: runRazorfenDowns,
  },
};
