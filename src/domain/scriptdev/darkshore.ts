// Darkshore ScriptDev IR ports. Source: scripts/kalimdor/darkshore.cpp — Kerlonian, Remtravel,
// Threshwackonator, Volcor, Therylune, the rabid bear, the Blackwood pair and the food GOs.

import type { ScriptDevIR } from './types.ts';

// Shared faction / tempfaction / stand-state constants

/** FACTION_ESCORT_N_FRIEND_PASSIVE. Cite: ScriptDevAIMgr.h:52 = 290; darkshore.cpp:207 Kerlonian */
export const FACTION_ESCORT_N_FRIEND_PASSIVE = 290;

/** FACTION_ESCORT_A_PASSIVE. Cite: ScriptDevAIMgr.h:55 = 774; darkshore.cpp:294 Remtravel */
export const FACTION_ESCORT_A_PASSIVE = 774;

/** FACTION_ESCORT_A_NEUTRAL_ACTIVE. Cite: ScriptDevAIMgr.h:48 = 231; darkshore.cpp:535 Therylune */
export const FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231;

/** FACTION_HOSTILE (Threshwackonator end). Cite: darkshore.cpp:311 FACTION_HOSTILE = 14 */
export const FACTION_HOSTILE = 14;

// FACTION_BLACKWOOD (purified furbolg — cpp note: guessed). Cite: darkshore.cpp:666 FACTION_BLACKWOOD = 35
export const FACTION_BLACKWOOD = 35;

/** TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h; darkshore.cpp:294,341,535 */
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;

/** TEMPFACTION_RESTORE_COMBAT_STOP. Cite: Creature.h; darkshore.cpp:699 purified faction flags */
export const TEMPFACTION_RESTORE_COMBAT_STOP = 0x02;

/** TEMPFACTION_TOGGLE_IMMUNE_TO_NPC. Cite: Creature.h:582 = 0x20; darkshore.cpp:535 */
export const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;

/** UNIT_STAND_STATE_STAND / SLEEP / SIT. Cite: Unit.h; darkshore.cpp:153 SLEEP, :160 STAND, :413 SIT */
export const UNIT_STAND_STATE_STAND = 0;
export const UNIT_STAND_STATE_SIT = 1;
export const UNIT_STAND_STATE_SLEEP = 3;

/** INTERACTION_DISTANCE. Cite: ObjectDefines.h:25 = 5.0f; darkshore.cpp:108,584 */
export const INTERACTION_DISTANCE = 5;

/** AI_EVENT_CUSTOM_A — Awaken Kerlonian spell → ClearSleeping. Cite: AIDefines.h; darkshore.cpp:125,223 */
export const AI_EVENT_CUSTOM_A = 1000;

// Constants — npc_kerlonian

// darkshore.cpp:53–79
/** Cite: darkshore.cpp:55 SAY_KER_START = -1000434 */
export const SAY_KER_START = -1000434;
/** Cite: darkshore.cpp:57–59 EMOTE_KER_SLEEP_* */
export const EMOTE_KER_SLEEP_1 = -1000435;
export const EMOTE_KER_SLEEP_2 = -1000436;
export const EMOTE_KER_SLEEP_3 = -1000437;
/** Cite: darkshore.cpp:61–64 SAY_KER_SLEEP_* */
export const SAY_KER_SLEEP_1 = -1000438;
export const SAY_KER_SLEEP_2 = -1000439;
export const SAY_KER_SLEEP_3 = -1000440;
export const SAY_KER_SLEEP_4 = -1000441;
/** Cite: darkshore.cpp:66 EMOTE_KER_AWAKEN = -1000445 */
export const EMOTE_KER_AWAKEN = -1000445;
/** Cite: darkshore.cpp:68–69 SAY_KER_ALERT_* (road attackers — TODO in cpp) */
export const SAY_KER_ALERT_1 = -1000442;
export const SAY_KER_ALERT_2 = -1000443;
/** Cite: darkshore.cpp:71 SAY_KER_END = -1000444 */
export const SAY_KER_END = -1000444;

/** Cite: darkshore.cpp:73 SPELL_BEAR_FORM = 18309 */
export const SPELL_BEAR_FORM = 18309;
/** Cite: darkshore.cpp:74 SPELL_SLEEP_VISUAL = 25148 */
export const SPELL_SLEEP_VISUAL = 25148;
/** Cite: darkshore.cpp:75 SPELL_AWAKEN = 17536 */
export const SPELL_AWAKEN = 17536;

/** Cite: darkshore.cpp:77 QUEST_SLEEPER_AWAKENED = 5321 */
export const QUEST_SLEEPER_AWAKENED = 5321;
/** Cite: darkshore.cpp:79 NPC_LILADRIS = 11219 */
export const NPC_LILADRIS = 11219;
/** DB binding. Cite: scriptdev2.sql entry 11218 */
export const NPC_KERLONIAN = 11218;

// Fall-asleep timer on Reset (while not following still arms). Cite: darkshore.cpp:91 m_uiFallAsleepTimer =
// urand(10000, 45000)
export const KERLONIAN_SLEEP_INIT_MIN_MS = 10_000;
export const KERLONIAN_SLEEP_INIT_MAX_MS = 45_000;

// Re-arm after SetSleeping while following. Cite: darkshore.cpp:179 m_uiFallAsleepTimer = urand(25000,
// 90000)
export const KERLONIAN_SLEEP_REPEAT_MIN_MS = 25_000;
export const KERLONIAN_SLEEP_REPEAT_MAX_MS = 90_000;

// Liladris complete LOS range = INTERACTION_DISTANCE * 5. Cite: darkshore.cpp:108 IsWithinDistInMap(...,
// INTERACTION_DISTANCE * 5)
export const KERLONIAN_LILADRIS_RANGE_YD = INTERACTION_DISTANCE * 5;

/** Aggro distance sound. Cite: darkshore.cpp:99 PlayDistanceSound(6701) */
export const KERLONIAN_AGGRO_SOUND = 6701;

// Constants — npc_prospector_remtravel

// darkshore.cpp:231–242
/** Cite: darkshore.cpp:233 QUEST_ABSENT_MINDED_PT2 = 731 */
export const QUEST_ABSENT_MINDED_PT2 = 731;
/** Cite: darkshore.cpp:234 REMTRAVEL_ESCORT_PATH = 2917 */
export const REMTRAVEL_ESCORT_PATH = 2917;
/** Cite: darkshore.cpp:236–241 SAY_REM_AGGRO_* broadcast texts */
export const SAY_REM_AGGRO = [938, 939, 940, 941, 942, 943] as const;
/** DB binding. Cite: scriptdev2.sql entry 2917 */
export const NPC_PROSPECTOR_REMTRAVEL = 2917;

// Constants — npc_threshwackonator

// darkshore.cpp:305–316
/** Cite: darkshore.cpp:307 EMOTE_START = -1000325 */
export const EMOTE_THRESH_START = -1000325;
/** Cite: darkshore.cpp:308 SAY_AT_CLOSE = -1000326 */
export const SAY_THRESH_AT_CLOSE = -1000326;
/** Cite: darkshore.cpp:309 QUEST_GYROMAST_REV = 2078 */
export const QUEST_GYROMAST_REV = 2078;
/** Cite: darkshore.cpp:310 NPC_GELKAK = 6667 */
export const NPC_GELKAK = 6667;
/** Cite: darkshore.cpp:313 TEXT_ID_THRESH_DEFAULT = 718 */
export const TEXT_ID_THRESH_DEFAULT = 718;
/** Cite: darkshore.cpp:314 TEXT_ID_KEY_READY = 758 */
export const TEXT_ID_KEY_READY = 758;
/** DB binding. Cite: scriptdev2.sql entry 6669 */
export const NPC_THRESHWACKONATOR = 6669;

/** Gelkak end LOS. Cite: darkshore.cpp:331 IsWithinDistInMap(..., 10.0f) */
export const THRESH_GELKAK_RANGE_YD = 10;

// Constants — npc_volcor

// darkshore.cpp:388–399
/** Cite: darkshore.cpp:390–393 SAY_AGGRO_* */
export const SAY_VOLCOR_AGGRO = [1250, 1251, 1252, 1253] as const;
/** Cite: darkshore.cpp:395 VOLCOR_PATH_01 = 3692 (stealth) */
export const VOLCOR_PATH_STEALTH = 3692;
/** Cite: darkshore.cpp:396 VOLCOR_PATH_02 = 3693 (force) */
export const VOLCOR_PATH_FORCE = 3693;
/** Cite: darkshore.cpp:398 QUEST_ESCAPE_THROUGH_FORCE = 994 */
export const QUEST_ESCAPE_THROUGH_FORCE = 994;
/** Cite: darkshore.cpp:399 QUEST_ESCAPE_THROUGH_STEALTH = 995 */
export const QUEST_ESCAPE_THROUGH_STEALTH = 995;
/** DB binding. Cite: scriptdev2.sql entry 3692 */
export const NPC_VOLCOR = 3692;

/** ForcedDespawn after stealth credit. Cite: darkshore.cpp:454 ForcedDespawn(1000) */
export const VOLCOR_STEALTH_DESPAWN_MS = 1000;

// Constants — npc_therylune

// darkshore.cpp:483–490
/** Cite: darkshore.cpp:485 SAY_THERYLUNE_START = -1000905 */
export const SAY_THERYLUNE_START = -1000905;
/** Cite: darkshore.cpp:486 SAY_THERYLUNE_FINISH = -1000906 */
export const SAY_THERYLUNE_FINISH = -1000906;
/** Cite: darkshore.cpp:488 NPC_THERYSIL = 3585 */
export const NPC_THERYSIL = 3585;
/** Cite: darkshore.cpp:490 QUEST_ID_THERYLUNE_ESCAPE = 945 */
export const QUEST_ID_THERYLUNE_ESCAPE = 945;
/** DB binding. Cite: scriptdev2.sql entry 3584 */
export const NPC_THERYLUNE = 3584;

// Constants — npc_rabid_bear

// darkshore.cpp:547–556
/** Cite: darkshore.cpp:549 QUEST_PLAGUED_LANDS = 2118 */
export const QUEST_PLAGUED_LANDS = 2118;
/** Cite: darkshore.cpp:551 NPC_CAPTURED_RABID_THISTLE_BEAR = 11836 */
export const NPC_CAPTURED_RABID_THISTLE_BEAR = 11836;
/** Cite: darkshore.cpp:552 NPC_THARNARIUN_TREETENDER = 3701 */
export const NPC_THARNARIUN_TREETENDER = 3701;
/** Cite: darkshore.cpp:553 GO_NIGHT_ELVEN_BEAR_TRAP = 111148 */
export const GO_NIGHT_ELVEN_BEAR_TRAP = 111148;
/** Cite: darkshore.cpp:555 SPELL_RABIES = 3150 */
export const SPELL_RABIES = 3150;
/** Cite: darkshore.cpp:556 SPELL_BEAR_CAPTURED = 9439 */
export const SPELL_BEAR_CAPTURED = 9439;
/** DB binding. Cite: scriptdev2.sql entry 2164 */
export const NPC_RABID_BEAR = 2164;

/** Rabies timer init + re-arm. Cite: darkshore.cpp:573,642 m_uiRabiesTimer = urand(12000, 18000) */
export const RABIES_MIN_MS = 12_000;
export const RABIES_MAX_MS = 18_000;

/** JustRespawned check timer. Cite: darkshore.cpp:578 m_uiCheckTimer = 1000 */
export const RABID_BEAR_CHECK_TIMER_MS = 1000;

// Post-capture OOC despawn (3 minutes). Cite: darkshore.cpp:619 m_uiDespawnTimer = 3 * MINUTE *
// IN_MILLISECONDS
export const RABID_BEAR_CAPTURE_DESPAWN_MS = 3 * 60 * 1000;

// Tharnariun hand-off LOS = 2 * INTERACTION_DISTANCE. Cite: darkshore.cpp:585 IsWithinDist(..., 2 *
// INTERACTION_DISTANCE, false)
export const RABID_BEAR_THARNARIUN_RANGE_YD = 2 * INTERACTION_DISTANCE;

// ForcedDespawn delay on Tharnariun LOS / unexpected capture. Cite: darkshore.cpp:588,614
// ForcedDespawn(1000)
export const RABID_BEAR_HANDOFF_DESPAWN_MS = 1000;

// Constants — npc_corrupted_furbolg (blackwood warrior / totemic)

// darkshore.cpp:660–687
/** Cite: darkshore.cpp:661 NPC_BLACKWOOD_WARRIOR = 2168 */
export const NPC_BLACKWOOD_WARRIOR = 2168;
/** Cite: darkshore.cpp:662 NPC_BLACKWOOD_TOTEMIC = 2169 */
export const NPC_BLACKWOOD_TOTEMIC = 2169;
/** Cite: darkshore.cpp:664 GO_PURIFIED_FOOD = 175336 */
export const GO_PURIFIED_FOOD = 175336;
/** Cite: darkshore.cpp:668 EMOTE_LURED = -1010027 */
export const EMOTE_LURED = -1010027;
/** Cite: darkshore.cpp:669 EMOTE_PURIFIED = -1010028 */
export const EMOTE_PURIFIED = -1010028;
/** Cite: darkshore.cpp:670 EMOTE_GENERIC_FLEE = -1000007 */
export const EMOTE_GENERIC_FLEE = -1000007;
/** Cite: darkshore.cpp:672 SPELL_BATTLE_STANCE = 7165 */
export const SPELL_BATTLE_STANCE = 7165;
/** Cite: darkshore.cpp:673 SPELL_THUNDERCLAP = 8078 */
export const SPELL_THUNDERCLAP = 8078;
/** Cite: darkshore.cpp:674 SPELL_HEALING_WARD = 5605 */
export const SPELL_HEALING_WARD = 5605;
/** Cite: darkshore.cpp:686 BOWL_DISTANCE = 5 */
export const BOWL_DISTANCE = 5;

/** Flee HP% gate (timerless ACTION_FLEE). Cite: darkshore.cpp:794 GetHealthPercent() <= 15.f */
export const BLACKWOOD_FLEE_HP_PCT = 15;

// Thunderclap init + re-arm. Cite: darkshore.cpp:733 AddCombatAction ACTION_THUNDERCLAP 16000, 21000 Cite:
// darkshore.cpp:763 GetSubsequentActionTimer urand(16, 21) * IN_MILLISECONDS
export const THUNDERCLAP_MIN_MS = 16_000;
export const THUNDERCLAP_MAX_MS = 21_000;

/** Healing Ward init. Cite: darkshore.cpp:734 AddCombatAction ACTION_HEALING_WARD 6000, 12000 */
export const HEALING_WARD_INIT_MIN_MS = 6000;
export const HEALING_WARD_INIT_MAX_MS = 12_000;

/** Healing Ward re-arm after CAST_OK. Cite: darkshore.cpp:764 urand(30, 36) * IN_MILLISECONDS */
export const HEALING_WARD_REPEAT_MIN_MS = 30_000;
export const HEALING_WARD_REPEAT_MAX_MS = 36_000;

// EVENT_BECOME_PURIFIED delay after MovePoint land. Cite: darkshore.cpp:785
// ResetTimer(EVENT_BECOME_PURIFIED, 5 * IN_MILLISECONDS)
export const PURIFY_BECOME_DELAY_MS = 5000;

// EVENT_FURBOLG_RESET after purification roam. Cite: darkshore.cpp:702 ResetTimer(EVENT_FURBOLG_RESET, 90s)
export const PURIFY_RESET_MS = 90_000;

// Non-first furbolg start delay. Cite: darkshore.cpp:776 ResetTimer(EVENT_START_PURIFICATION, urand(0, 5 *
// IN_MILLISECONDS))
export const PURIFY_START_STAGGER_MAX_MS = 5000;

// Seek purification max squared distance to bowl (3600 = 60yd²). Cite: darkshore.cpp:713
// m_bowlCoords.GetDistance(...) <= 3600.f
export const PURIFY_BOWL_DIST_SQ = 3600;

// Furbolg grid search + event summon radius. Cite: darkshore.cpp:835 GetCreatureListWithEntryInGrid(...,
// 40.f) Cite: darkshore.cpp:842 GetRandomPoint(..., 30.0f)
export const PURIFY_FURBOLG_SEARCH_YD = 40;
export const PURIFY_SUMMON_RADIUS_YD = 30;

// Event/GO warrior temp summon despawn. Cite: darkshore.cpp:843,880 TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN
// 120000
export const BLACKWOOD_TEMP_DESPAWN_MS = 120_000;

/** Extra warriors summoned by purify event. Cite: darkshore.cpp:840 for (int8 i = 0; i < 2; ++i) */
export const PURIFY_EXTRA_WARRIORS = 2;

// go_furbolg_food search / summon radius. Cite: darkshore.cpp:870 GetClosestCreatureWithEntry(..., 20.0f)
// Cite: darkshore.cpp:879 GetRandomPoint(..., 20.0f)
export const FURBOLG_FOOD_RANGE_YD = 20;

// go_furbolg_food bound entries (scriptdev2.sql). Cite: UPDATE gameobject_template ScriptName
// go_furbolg_food WHERE entry=175329/175330/175331
export const GO_FURBOLG_FOOD_ENTRIES = [175329, 175330, 175331] as const;

/** ProcessEventId binding. Cite: scriptdev2.sql (3938,'event_purify_food') */
export const EVENT_ID_PURIFY_FOOD = 3938;


// Pure helpers live in darkshoreHelpers.ts (file-size split ≤1500).
export {
  kerlonianQuestAccept,
  kerlonianSetSleeping,
  kerlonianClearSleeping,
  kerlonianLiladrisLos,
  remtravelQuestAccept,
  remtravelWaypointReached,
  remtravelAggroText,
  threshGossipHello,
  threshGossipSelect,
  threshGelkakLos,
  volcorQuestAccept,
  volcorWaypointReached,
  volcorAggroText,
  theryluneQuestAccept,
  theryluneWaypointReached,
  rabidBearSpellHit,
  rabidBearTharnariunLos,
  blackwoodFleeCheck,
  blackwoodSeekPurification,
  blackwoodStartPurification,
  blackwoodBecomePurified,
  purifyFoodProcessEvent,
  furbolgFoodUse,
} from './darkshoreHelpers.ts';
export type {
  KerlonianQuestAcceptResult,
  KerlonianSleepFireResult,
  KerlonianClearSleepResult,
  KerlonianLiladrisLosResult,
  RemtravelQuestAcceptResult,
  RemtravelWaypointResult,
  ThreshGossipHelloResult,
  ThreshGossipSelectResult,
  ThreshGelkakLosResult,
  VolcorQuestAcceptResult,
  VolcorWaypointResult,
  TheryluneQuestAcceptResult,
  TheryluneWaypointResult,
  RabidBearSpellHitResult,
  RabidBearTharnariunLosResult,
  BlackwoodFleeResult,
  PurifySeekResult,
  PurifyStartResult,
  PurifyBecomeResult,
  PurifyFoodEventResult,
  FurbolgFoodUseResult,
} from './darkshoreHelpers.ts';

// ScriptDev IR — npc_kerlonian
// ---------------------------------------------------------------------------

// Cite: darkshore.cpp npc_kerlonianAI (FollowerAI) Binding: 11218 Kerlonian Evershade (in bake). No combat
// cast schedule — sleep/awaken/quest complete are pure helpers + flavor lifecycle.
export const NPC_KERLONIAN_SCRIPT: ScriptDevIR = {
  name: 'npc_kerlonian',
  boundCreatures: [NPC_KERLONIAN],
  sourceFile: 'kalimdor/darkshore.cpp',
  spellIds: [SPELL_BEAR_FORM, SPELL_SLEEP_VISUAL, SPELL_AWAKEN],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'cast_self',
        spellId: SPELL_BEAR_FORM,
        cite: 'darkshore.cpp:93-94 !following → DoCastSpellIfCan SPELL_BEAR_FORM 18309',
      },
      {
        kind: 'flavor',
        text: `m_uiFallAsleepTimer=urand(${KERLONIAN_SLEEP_INIT_MIN_MS},${KERLONIAN_SLEEP_INIT_MAX_MS})`,
        cite: 'darkshore.cpp:91 Reset fall-asleep urand(10000,45000)',
      },
    ],
    onAggro: [
      {
        kind: 'flavor',
        text: `PlayDistanceSound(${KERLONIAN_AGGRO_SOUND})`,
        cite: 'darkshore.cpp:99 Aggro PlayDistanceSound 6701',
      },
    ],
  },
  spellHits: [
    {
      spellId: SPELL_AWAKEN,
      playerCaster: true,
      actions: [
        {
          kind: 'remove_auras',
          spellId: SPELL_SLEEP_VISUAL,
          cite: 'darkshore.cpp:159 ClearSleeping RemoveAurasDueToSpell 25148',
        },
        {
          kind: 'flavor',
          text: 'AI_EVENT_CUSTOM_A → ClearSleeping stand + EMOTE_KER_AWAKEN + SetFollowPaused false',
          cite: 'darkshore.cpp:123-129,157-164,214-224 AwakenKerlonian SpellScript',
        },
      ],
      cite: 'darkshore.cpp:214-224 spell_awaken_kerlonian → AI_EVENT_CUSTOM_A',
    },
  ],
  cites: [
    'darkshore.cpp:49-225 npc_kerlonian + AwakenKerlonian',
    'darkshore.cpp:73-75 SPELL_BEAR_FORM=18309 SLEEP_VISUAL=25148 AWAKEN=17536',
    'darkshore.cpp:77-79 QUEST=5321 NPC_LILADRIS=11219',
    'darkshore.cpp:89-95 Reset fall-asleep + bear form',
    'darkshore.cpp:102-120 Liladris LOS complete 5321',
    'darkshore.cpp:123-189 sleep/awaken/UpdateFollowerAI',
    'darkshore.cpp:197-211 QuestAccept 5321',
    'scriptdev2.sql entry 11218',
  ],
};

// ScriptDev IR — npc_prospector_remtravel

// Cite: darkshore.cpp npc_prospector_remtravelAI (npc_escortAI) Binding: 2917 Prospector Remtravel (in
// bake). No combat cast timers — aggro yells + WP38/39 pure helpers.
export const NPC_PROSPECTOR_REMTRAVEL_SCRIPT: ScriptDevIR = {
  name: 'npc_prospector_remtravel',
  boundCreatures: [NPC_PROSPECTOR_REMTRAVEL],
  sourceFile: 'kalimdor/darkshore.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_REM_AGGRO[0],
        cite: 'darkshore.cpp:251-261 Aggro urand(0,5) DoBroadcastText 938-943 (remtravelAggroText)',
      },
    ],
  },
  cites: [
    'darkshore.cpp:227-299 npc_prospector_remtravel',
    'darkshore.cpp:233-234 QUEST=731 path=2917',
    'darkshore.cpp:251-261 Aggro texts 938-943',
    'darkshore.cpp:264-268 ReceiveAIEvent CUSTOM_EVENTAI_A → AttackStart',
    'darkshore.cpp:271-285 WP38 credit 731 WP39 End',
    'darkshore.cpp:288-298 QuestAccept faction 774 path 2917',
    'scriptdev2.sql entry 2917',
  ],
};

// ScriptDev IR — npc_threshwackonator

// Cite: darkshore.cpp npc_threshwackonatorAI (FollowerAI) Binding: 6669 The Threshwackonator 4100 (in
// bake). Gossip + Gelkak end pure helpers; no combat cast timers (hostile melee after end).
export const NPC_THRESHWACKONATOR_SCRIPT: ScriptDevIR = {
  name: 'npc_threshwackonator',
  boundCreatures: [NPC_THRESHWACKONATOR],
  sourceFile: 'kalimdor/darkshore.cpp',
  spellIds: [],
  timers: [],
  gossipHello: {
    defaultTextId: TEXT_ID_THRESH_DEFAULT,
    branches: [
      {
        // Host models quest-incomplete branch via pure helper threshGossipHello;
        // IR documents both text ids (758 key ready / 718 default).
        gates: [],
        textId: TEXT_ID_KEY_READY,
        cite: 'darkshore.cpp:357-360 quest 2078 incomplete → text 758',
      },
    ],
    cite: 'darkshore.cpp:355-365 GossipHello',
  },
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'FollowerAI Reset empty',
        cite: 'darkshore.cpp:323 Reset {}',
      },
    ],
  },
  cites: [
    'darkshore.cpp:301-382 npc_threshwackonator',
    'darkshore.cpp:307-314 EMOTE/SAY/QUEST/NPC/FACTION/TEXT ids',
    'darkshore.cpp:325-347 Gelkak LOS ≤10yd → hostile AttackStart',
    'darkshore.cpp:355-381 GossipHello/Select turn key → StartFollow',
    'scriptdev2.sql entry 6669',
  ],
};

// ScriptDev IR — npc_volcor

// Cite: darkshore.cpp npc_volcorAI (npc_escortAI) Binding: 3692 Volcor (in bake). Dual quest escort pure
// helpers; no combat casts.
export const NPC_VOLCOR_SCRIPT: ScriptDevIR = {
  name: 'npc_volcor',
  boundCreatures: [NPC_VOLCOR],
  sourceFile: 'kalimdor/darkshore.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: '!escorting → m_uiQuestId=0 + UNIT_STAND_STATE_SIT',
        cite: 'darkshore.cpp:408-414 Reset sit when not escorting',
      },
    ],
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_VOLCOR_AGGRO[0],
        cite: 'darkshore.cpp:417-426 Aggro urand(0,5) cases 0-3 texts 1250-1253 (volcorAggroText)',
      },
    ],
  },
  cites: [
    'darkshore.cpp:384-477 npc_volcor',
    'darkshore.cpp:390-399 SAY_AGGRO paths 3692/3693 quests 994/995',
    'darkshore.cpp:408-414 Reset sit',
    'darkshore.cpp:430-465 StartEscort + WaypointReached',
    'darkshore.cpp:468-476 QuestAccept 994/995',
    'scriptdev2.sql entry 3692',
  ],
};

// ScriptDev IR — npc_therylune

// Cite: darkshore.cpp npc_theryluneAI (npc_escortAI) Binding: 3584 Therylune (in bake). Escort pure
// helpers; no combat casts.
export const NPC_THERYLUNE_SCRIPT: ScriptDevIR = {
  name: 'npc_therylune',
  boundCreatures: [NPC_THERYLUNE],
  sourceFile: 'kalimdor/darkshore.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; JustRespawned sets UNIT_FLAG_IMMUNE_TO_NPC',
        cite: 'darkshore.cpp:498-504',
      },
    ],
  },
  cites: [
    'darkshore.cpp:479-541 npc_therylune',
    'darkshore.cpp:485-490 SAY_* NPC_THERYSIL QUEST=945',
    'darkshore.cpp:500-504 JustRespawned immune NPC',
    'darkshore.cpp:506-519 WP18 credit 945 WP20 finish + SetRun',
    'darkshore.cpp:528-540 QuestAccept faction 231 + SAY start',
    'scriptdev2.sql entry 3584',
  ],
};

// ScriptDev IR — npc_rabid_bear

// Cite: darkshore.cpp npc_rabid_bearAI Binding: 2164 Rabid Thistle Bear (in bake). Combat Rabies schedule +
// SpellHit capture machine (pure helpers + IR spellHits).
export const NPC_RABID_BEAR_SCRIPT: ScriptDevIR = {
  name: 'npc_rabid_bear',
  boundCreatures: [NPC_RABID_BEAR],
  sourceFile: 'kalimdor/darkshore.cpp',
  spellIds: [SPELL_RABIES, SPELL_BEAR_CAPTURED],
  timers: [
    {
      id: 'rabies',
      spellId: SPELL_RABIES,
      initialMinMs: RABIES_MIN_MS,
      initialMaxMs: RABIES_MAX_MS,
      repeatMinMs: RABIES_MIN_MS,
      repeatMaxMs: RABIES_MAX_MS,
      target: 'victim',
      cite: 'darkshore.cpp:573,638-642 m_uiRabiesTimer urand(12000,18000) SelectAttackingTarget TOPAGGRO SPELL_RABIES 3150',
    },
  ],
  spellHits: [
    {
      spellId: SPELL_BEAR_CAPTURED,
      playerCaster: true,
      requireQuestIncomplete: QUEST_PLAGUED_LANDS,
      actions: [
        {
          kind: 'update_entry',
          entry: NPC_CAPTURED_RABID_THISTLE_BEAR,
          cite: 'darkshore.cpp:606 UpdateEntry NPC_CAPTURED_RABID_THISTLE_BEAR 11836',
        },
        {
          kind: 'quest_credit',
          entry: NPC_CAPTURED_RABID_THISTLE_BEAR,
          credit: 'creature',
          cite: 'darkshore.cpp:610 KilledMonsterCredit captured entry',
        },
        {
          kind: 'force_despawn',
          delayMs: RABID_BEAR_CAPTURE_DESPAWN_MS,
          cite: 'darkshore.cpp:619 m_uiDespawnTimer = 3 * MINUTE * IN_MILLISECONDS',
        },
      ],
      cite: 'darkshore.cpp:597-620 SpellHit 9439 player + quest 2118',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `m_uiRabiesTimer=urand(${RABIES_MIN_MS},${RABIES_MAX_MS})`,
        cite: 'darkshore.cpp:571-574 Reset Rabies timer',
      },
    ],
  },
  unusedBindings: [
    {
      entry: GO_NIGHT_ELVEN_BEAR_TRAP,
      kind: 'go',
      reason:
        'GO 111148 Night Elven Bear Trap is the visual spell-focus for SPELL_BEAR_CAPTURED 9439 (darkshore.cpp:553) - not a ScriptName binding; absent from product tables/gameObjects.json (present in gameobject-data.json). Capture is driven by SpellHit on the bear, not GO AI.',
      cite: 'darkshore.cpp:553; gameobject-data 111148; tables/gameObjects missing 111148',
    },
  ],
  cites: [
    'darkshore.cpp:543-654 npc_rabid_bear',
    'darkshore.cpp:549-556 QUEST=2118 NPCs spells GO trap',
    'darkshore.cpp:571-574 Reset Rabies urand(12-18)s',
    'darkshore.cpp:576-580 JustRespawned checkTimer=1000',
    'darkshore.cpp:582-591 Tharnariun LOS hand-off',
    'darkshore.cpp:597-620 SpellHit capture 9439',
    'darkshore.cpp:623-648 UpdateAI despawn OOC + Rabies combat',
    'scriptdev2.sql entry 2164',
  ],
};

// ScriptDev IR — npc_blackwood_warrior

// Cite: darkshore.cpp npc_corrupted_furbolgAI (entry 2168 branch) Binding: 2168 Blackwood Warrior (in
// bake). Battle Stance onReset + Thunderclap combat + flee ≤15% + purification pure helpers.
export const NPC_BLACKWOOD_WARRIOR_SCRIPT: ScriptDevIR = {
  name: 'npc_blackwood_warrior',
  boundCreatures: [NPC_BLACKWOOD_WARRIOR],
  sourceFile: 'kalimdor/darkshore.cpp',
  spellIds: [SPELL_BATTLE_STANCE, SPELL_THUNDERCLAP],
  timers: [
    {
      id: 'battle_stance',
      spellId: SPELL_BATTLE_STANCE,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      cite: 'darkshore.cpp:748 Reset DoCastSpellIfCan SPELL_BATTLE_STANCE 7165 (warrior only)',
    },
    {
      id: 'thunderclap',
      spellId: SPELL_THUNDERCLAP,
      initialMinMs: THUNDERCLAP_MIN_MS,
      initialMaxMs: THUNDERCLAP_MAX_MS,
      repeatMinMs: THUNDERCLAP_MIN_MS,
      repeatMaxMs: THUNDERCLAP_MAX_MS,
      target: 'self',
      // The IN_MELEE_RANGE flag is an EXISTENCE test here, not a pick: the cast goes to nullptr and
      // only happens while somebody is in reach. `select: { notInMelee: false }` was a no-op.
      requireMeleeTargetExists: true,
      cite: 'darkshore.cpp:733,763,803-809 SelectAttackingTarget(RANDOM, 0, 0, SELECT_FLAG_IN_MELEE_RANGE) then DoCastSpellIfCan(nullptr, SPELL_THUNDERCLAP 8078), init/re-arm urand(16,21)s',
    },
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: BLACKWOOD_FLEE_HP_PCT,
      actions: [
        {
          kind: 'yell',
          textId: EMOTE_GENERIC_FLEE,
          cite: 'darkshore.cpp:797 DoScriptText(EMOTE_GENERIC_FLEE) then DoFlee',
        },
        {
          kind: 'flavor',
          text: 'DoFlee() + DisableCombatAction(ACTION_FLEE); m_hasFled=true',
          cite: 'darkshore.cpp:794-799',
        },
      ],
      cite: 'darkshore.cpp:792-801 ACTION_FLEE GetHealthPercent() <= 15.f',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'CombatAI::Reset + Battle Stance + clear purify flags REACT_AGGRESSIVE strip immune player',
        cite: 'darkshore.cpp:742-757',
      },
    ],
  },
  cites: [
    'darkshore.cpp:656-820 npc_corrupted_furbolg (warrior branch)',
    'darkshore.cpp:661-674 entries + spells + emotes',
    'darkshore.cpp:733 Thunderclap 16-21s',
    'darkshore.cpp:748 Battle Stance on Reset',
    'darkshore.cpp:763,803-809 Thunderclap re-arm + cast',
    'darkshore.cpp:792-801 flee ≤15%',
    'darkshore.cpp:769-786 SeekPurification + MovementInform',
    'scriptdev2.sql entry 2168',
  ],
};

// ScriptDev IR — npc_blackwood_totemic

// Cite: darkshore.cpp npc_corrupted_furbolgAI (entry 2169 branch) Binding: 2169 Blackwood Totemic (in
// bake). Healing Ward combat + flee ≤15%.
export const NPC_BLACKWOOD_TOTEMIC_SCRIPT: ScriptDevIR = {
  name: 'npc_blackwood_totemic',
  boundCreatures: [NPC_BLACKWOOD_TOTEMIC],
  sourceFile: 'kalimdor/darkshore.cpp',
  spellIds: [SPELL_HEALING_WARD],
  timers: [
    {
      id: 'healing_ward',
      spellId: SPELL_HEALING_WARD,
      initialMinMs: HEALING_WARD_INIT_MIN_MS,
      initialMaxMs: HEALING_WARD_INIT_MAX_MS,
      repeatMinMs: HEALING_WARD_REPEAT_MIN_MS,
      repeatMaxMs: HEALING_WARD_REPEAT_MAX_MS,
      target: 'self',
      cite: 'darkshore.cpp:734,764,812-816 Healing Ward 5605 self init urand(6,12)s re-arm urand(30,36)s',
    },
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: BLACKWOOD_FLEE_HP_PCT,
      actions: [
        {
          kind: 'yell',
          textId: EMOTE_GENERIC_FLEE,
          cite: 'darkshore.cpp:797 DoScriptText(EMOTE_GENERIC_FLEE) then DoFlee',
        },
        {
          kind: 'flavor',
          text: 'DoFlee() + DisableCombatAction(ACTION_FLEE); m_hasFled=true',
          cite: 'darkshore.cpp:794-799',
        },
      ],
      cite: 'darkshore.cpp:792-801 ACTION_FLEE GetHealthPercent() <= 15.f',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'CombatAI::Reset; totemic no Battle Stance; clear purify flags',
        cite: 'darkshore.cpp:742-757 totemic case break',
      },
    ],
  },
  cites: [
    'darkshore.cpp:656-820 npc_corrupted_furbolg (totemic branch)',
    'darkshore.cpp:662,674,734,764,812-816 Healing Ward',
    'darkshore.cpp:792-801 flee ≤15%',
    'darkshore.cpp:769-786 SeekPurification + MovementInform',
    'scriptdev2.sql entry 2169',
  ],
};

// ScriptDev IR — event_purify_food

// Cite: darkshore.cpp ProcessEventId_event_purify_food Binding: scriptdev2.sql event 3938 (no creature
// ScriptName). Host models ProcessEventId as goUse-shaped event (no GO entries) like event_arcanite_buoy.
export const EVENT_PURIFY_FOOD: ScriptDevIR = {
  name: 'event_purify_food',
  boundCreatures: [],
  sourceFile: 'kalimdor/darkshore.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [],
    actions: [
      {
        kind: 'summon_count',
        creatureEntry: NPC_BLACKWOOD_WARRIOR,
        count: PURIFY_EXTRA_WARRIORS,
        radiusYd: PURIFY_SUMMON_RADIUS_YD,
        cite: 'darkshore.cpp:840-844 SummonCreature ×2 NPC_BLACKWOOD_WARRIOR r30 TEMPSPAWN 120000',
      },
      {
        kind: 'flavor',
        text: `player bowl @ BOWL_DISTANCE=${BOWL_DISTANCE}; grid furbolgs 2168/2169 ≤${PURIFY_FURBOLG_SEARCH_YD}yd SeekPurification(last=first); skip in-combat/dead/!CanAttack`,
        cite: 'darkshore.cpp:830-855',
      },
    ],
    cite: `darkshore.cpp:826-860 ProcessEventId_event_purify_food; scriptdev2.sql event ${EVENT_ID_PURIFY_FOOD}`,
  },
  unusedBindings: [
    {
      entry: GO_PURIFIED_FOOD,
      kind: 'go',
      reason:
        'GO 175336 Purified Food is referenced by the Blackwood purification quest chain (darkshore.cpp:664) but is not a ScriptName binding for event_purify_food (ProcessEventId 3938). Absent from product tables/gameObjects.json; present in gameobject-data.json.',
      cite: 'darkshore.cpp:664; scriptdev2.sql event 3938; tables/gameObjects missing 175336',
    },
  ],
  cites: [
    'darkshore.cpp:822-860 event_purify_food',
    'darkshore.cpp:835-855 grid + summons + SeekPurification',
    'darkshore.cpp:936-938 RegisterSelf pProcessEventId',
    'scriptdev2.sql (3938,event_purify_food)',
  ],
};

// ScriptDev IR — go_furbolg_food

// GOUse_go_furbolg_food, GO 175329/175330/175331. All three are absent from
// tables/gameObjects.json, so the bindings are unused; the IR and pure helper are ported.
export const GO_FURBOLG_FOOD_SCRIPT: ScriptDevIR = {
  name: 'go_furbolg_food',
  boundCreatures: [],
  boundGos: [...GO_FURBOLG_FOOD_ENTRIES],
  sourceFile: 'kalimdor/darkshore.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [...GO_FURBOLG_FOOD_ENTRIES],
    actions: [
      {
        kind: 'flavor',
        text: `closest warrior 2168 ≤${FURBOLG_FOOD_RANGE_YD}yd AttackStart else SummonCreature 2168 r${FURBOLG_FOOD_RANGE_YD} TEMPSPAWN ${BLACKWOOD_TEMP_DESPAWN_MS} + AttackStart (furbolgFoodUse)`,
        cite: 'darkshore.cpp:867-884',
      },
    ],
    cite: 'darkshore.cpp:867-884 GOUse_go_furbolg_food',
  },
  unusedBindings: GO_FURBOLG_FOOD_ENTRIES.map((entry) => ({
    entry,
    kind: 'go' as const,
    reason: `GO ${entry} is DB-bound ScriptName go_furbolg_food but absent from product tables/gameObjects.json (present in gameobject-data.json) - IR + pure helper ported; product GO use not spawnable until tables row.`,
    cite: `scriptdev2.sql entry ${entry}; darkshore.cpp:867-884; tables/gameObjects missing ${entry}`,
  })),
  cites: [
    'darkshore.cpp:863-884 go_furbolg_food',
    'darkshore.cpp:870-881 warrior search 20yd or summon AttackStart',
    'darkshore.cpp:940-943 RegisterSelf pGOUse',
    'scriptdev2.sql entries 175329/175330/175331',
  ],
};

