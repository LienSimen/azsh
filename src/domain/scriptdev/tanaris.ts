// Tanaris ScriptDev IR ports. Source: scripts/kalimdor/tanaris.cpp — mob_aquementas (absent from
// bake), npc_oox17tn (escort 648) and npc_tooga (follower 1560). Every value cites file:line.

import type { ScriptDevIR } from './types.ts';


// Shared faction / tempfaction / stand-state constants

/** FACTION_ESCORT_N_FRIEND_ACTIVE. Cite: ScriptDevAIMgr.h:53 = 495; tanaris.cpp:242 OOX */
export const FACTION_ESCORT_N_FRIEND_ACTIVE = 495;

/** FACTION_ESCORT_N_FRIEND_PASSIVE. Cite: ScriptDevAIMgr.h:52 = 290; tanaris.cpp:403 Tooga StartFollow */
export const FACTION_ESCORT_N_FRIEND_PASSIVE = 290;

/** TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h TEMPFACTION_RESTORE_RESPAWN=0x01; tanaris.cpp:242 */
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;

// TEMPFACTION_TOGGLE_IMMUNE_TO_NPC. Cite: Creature.h TEMPFACTION_TOGGLE_IMMUNE_TO_NPC=0x20; tanaris.cpp:242
export const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;

/** UNIT_STAND_STATE_STAND / DEAD. Cite: Unit.h; tanaris.cpp:199 DEAD Reset, :241 STAND accept */
export const UNIT_STAND_STATE_STAND = 0;
export const UNIT_STAND_STATE_DEAD = 7;

/** INTERACTION_DISTANCE. Cite: ObjectDefines.h = 5.0f; tanaris.cpp:298 Tooga ↔ Torta LOS */
export const INTERACTION_DISTANCE = 5;

// Constants — mob_aquementas

// tanaris.cpp:42–54
/** Cite: tanaris.cpp:42 AGGRO_YELL_AQUE = -1000168 */
export const AGGRO_YELL_AQUE = -1_000_168;

/** Cite: tanaris.cpp:44 SPELL_AQUA_JET = 13586 */
export const SPELL_AQUA_JET = 13586;
/** Cite: tanaris.cpp:45 SPELL_FROST_SHOCK = 15089 */
export const SPELL_FROST_SHOCK = 15089;

/** Cite: tanaris.cpp:47 ITEM_SILVER_TOTEM = 11522 */
export const ITEM_SILVER_TOTEM = 11522;
/** Cite: tanaris.cpp:48 ITEM_BOOK_AQUOR = 11169 */
export const ITEM_BOOK_AQUOR = 11169;
/** Cite: tanaris.cpp:49 ITEM_SILVERY_CLAWS = 11172 */
export const ITEM_SILVERY_CLAWS = 11172;
/** Cite: tanaris.cpp:50 ITEM_IRONTREE_HEART = 11173 */
export const ITEM_IRONTREE_HEART = 11173;

/** Cite: tanaris.cpp:52 FACTION_FRIENDLY = 35 */
export const FACTION_FRIENDLY = 35;
/** Cite: tanaris.cpp:53 FACTION_ELEMENTAL = 91 */
export const FACTION_ELEMENTAL = 91;

/** DB binding. Cite: scriptdev-corpus.json entry 9453 Aquementas */
export const NPC_AQUEMENTAS = 9453;

// Switch from friendly → elemental after spawn/reset. Cite: tanaris.cpp:66 m_uiSwitchFactionTimer = 10000
export const AQUEMENTAS_SWITCH_FACTION_MS = 10_000;

/** Aqua Jet initial arm. Cite: tanaris.cpp:67 m_uiAquaJetTimer = 5000 */
export const AQUEMENTAS_AQUA_JET_INIT_MS = 5000;
/** Aqua Jet re-arm after cast. Cite: tanaris.cpp:121 m_uiAquaJetTimer = 15000 */
export const AQUEMENTAS_AQUA_JET_REPEAT_MS = 15_000;

/** Frost Shock initial arm. Cite: tanaris.cpp:68 m_uiFrostShockTimer = 1000 */
export const AQUEMENTAS_FROST_SHOCK_INIT_MS = 1000;
/** Frost Shock re-arm after cast. Cite: tanaris.cpp:113 m_uiFrostShockTimer = 15000 */
export const AQUEMENTAS_FROST_SHOCK_REPEAT_MS = 15_000;

// Silvery Claws required for Silver Totem grant. Cite: tanaris.cpp:76 HasItemCount(ITEM_SILVERY_CLAWS, 11)
export const AQUEMENTAS_SILVERY_CLAWS_COUNT = 11;

// Constants — npc_oox17tn

// tanaris.cpp:141–153
/** Cite: tanaris.cpp:141 SAY_OOX_START = -1000287 */
export const SAY_OOX_START = -1_000_287;
/** Cite: tanaris.cpp:142 SAY_OOX_AGGRO1 = -1000288 */
export const SAY_OOX_AGGRO1 = -1_000_288;
/** Cite: tanaris.cpp:143 SAY_OOX_AGGRO2 = -1000289 */
export const SAY_OOX_AGGRO2 = -1_000_289;
/** Cite: tanaris.cpp:144 SAY_OOX_AMBUSH = -1000290 */
export const SAY_OOX_AMBUSH = -1_000_290;
/** Cite: tanaris.cpp:145 SAY_OOX17_AMBUSH_REPLY = -1000291 */
export const SAY_OOX17_AMBUSH_REPLY = -1_000_291;
/** Cite: tanaris.cpp:146 SAY_OOX_END = -1000292 */
export const SAY_OOX_END = -1_000_292;

/** Cite: tanaris.cpp:148 QUEST_RESCUE_OOX_17TN = 648 */
export const QUEST_RESCUE_OOX_17TN = 648;

/** Cite: tanaris.cpp:150 NPC_SCORPION = 7803 */
export const NPC_SCORPION = 7803;
/** Cite: tanaris.cpp:151 NPC_SCOFFLAW = 7805 */
export const NPC_SCOFFLAW = 7805;
/** Cite: tanaris.cpp:152 NPC_SHADOW_MAGE = 5617 */
export const NPC_SHADOW_MAGE = 5617;

/** DB binding. Cite: scriptdev-corpus.json entry 7784 */
export const NPC_OOX17TN = 7784;

/** WP23 ambush corpse despawn (scorpions). Cite: tanaris.cpp:173 TEMPSPAWN_CORPSE_TIMED_DESPAWN, 30000 */
export const OOX_WP23_CORPSE_DESPAWN_MS = 30_000;

/** WP29 first scofflaw corpse despawn. Cite: tanaris.cpp:181 TEMPSPAWN_CORPSE_TIMED_DESPAWN, 10000 */
export const OOX_WP29_SCOFFLAW_SHORT_DESPAWN_MS = 10_000;

// WP29 shadow mage + second scofflaw corpse despawn. Cite: tanaris.cpp:182–184
// TEMPSPAWN_CORPSE_TIMED_DESPAWN, 30000
export const OOX_WP29_CORPSE_DESPAWN_MS = 30_000;

/** WP23 first ambush — 3 Scorpids. Cite: tanaris.cpp:171–176 */
export const OOX_WP23_SPAWNS = [
  {
    entry: NPC_SCORPION,
    x: -8340.7,
    y: -4448.17,
    z: 9.17,
    o: 3.1,
    despawnMs: OOX_WP23_CORPSE_DESPAWN_MS,
    cite: 'tanaris.cpp:173',
  },
  {
    entry: NPC_SCORPION,
    x: -8343.18,
    y: -4444.35,
    z: 9.44,
    o: 2.35,
    despawnMs: OOX_WP23_CORPSE_DESPAWN_MS,
    cite: 'tanaris.cpp:174',
  },
  {
    entry: NPC_SCORPION,
    x: -8348.7,
    y: -4457.8,
    z: 9.58,
    o: 2.02,
    despawnMs: OOX_WP23_CORPSE_DESPAWN_MS,
    cite: 'tanaris.cpp:175',
  },
] as const;

// WP29 second ambush — 2 Scofflaws + 1 Shadow Mage. Cite: tanaris.cpp:178–186 Last scofflaw speaks
// SAY_OOX17_AMBUSH_REPLY.
export const OOX_WP29_SPAWNS = [
  {
    entry: NPC_SCOFFLAW,
    x: -7488.02,
    y: -4786.56,
    z: 10.67,
    o: 3.74,
    despawnMs: OOX_WP29_SCOFFLAW_SHORT_DESPAWN_MS,
    replyTextId: null as number | null,
    cite: 'tanaris.cpp:181',
  },
  {
    entry: NPC_SHADOW_MAGE,
    x: -7486.41,
    y: -4791.55,
    z: 10.54,
    o: 3.26,
    despawnMs: OOX_WP29_CORPSE_DESPAWN_MS,
    replyTextId: null as number | null,
    cite: 'tanaris.cpp:182',
  },
  {
    entry: NPC_SCOFFLAW,
    x: -7488.47,
    y: -4800.77,
    z: 9.77,
    o: 2.5,
    despawnMs: OOX_WP29_CORPSE_DESPAWN_MS,
    replyTextId: SAY_OOX17_AMBUSH_REPLY,
    cite: 'tanaris.cpp:184-185',
  },
] as const;

// QuestAccept temp faction flags. Cite: tanaris.cpp:242 TEMPFACTION_RESTORE_RESPAWN |
// TEMPFACTION_TOGGLE_IMMUNE_TO_NPC
export const OOX_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;

// Constants — npc_tooga

// tanaris.cpp:256–271
/** Cite: tanaris.cpp:256 SAY_TOOG_THIRST = -1000391 */
export const SAY_TOOG_THIRST = -1_000_391;
/** Cite: tanaris.cpp:257 SAY_TOOG_WORRIED = -1000392 */
export const SAY_TOOG_WORRIED = -1_000_392;
/** Cite: tanaris.cpp:258 SAY_TOOG_POST_1 = -1000393 */
export const SAY_TOOG_POST_1 = -1_000_393;
/** Cite: tanaris.cpp:259 SAY_TORT_POST_2 = -1000394 */
export const SAY_TORT_POST_2 = -1_000_394;
/** Cite: tanaris.cpp:260 SAY_TOOG_POST_3 = -1000395 */
export const SAY_TOOG_POST_3 = -1_000_395;
/** Cite: tanaris.cpp:261 SAY_TORT_POST_4 = -1000396 */
export const SAY_TORT_POST_4 = -1_000_396;
/** Cite: tanaris.cpp:262 SAY_TOOG_POST_5 = -1000397 */
export const SAY_TOOG_POST_5 = -1_000_397;
/** Cite: tanaris.cpp:263 SAY_TORT_POST_6 = -1000398 */
export const SAY_TORT_POST_6 = -1_000_398;

/** Cite: tanaris.cpp:265 QUEST_TOOGA = 1560 */
export const QUEST_TOOGA = 1560;
/** Cite: tanaris.cpp:266 NPC_TORTA = 6015 */
export const NPC_TORTA = 6015;

/** Cite: tanaris.cpp:268 POINT_ID_TO_WATER = 1 */
export const POINT_ID_TO_WATER = 1;

/** DB binding. Cite: scriptdev-corpus.json entry 5955 */
export const NPC_TOOGA = 5955;

/** Water move point after post-event dialogue. Cite: tanaris.cpp:271 m_afToWaterLoc[] */
export const TOOGA_TO_WATER_LOC = {
  x: -7032.664551,
  y: -4906.199219,
  z: -1.606446,
  cite: 'tanaris.cpp:271',
} as const;

/** Follow speech check initial arm. Cite: tanaris.cpp:285 m_uiCheckSpeechTimer = 2500 */
export const TOOGA_SPEECH_INIT_MS = 2500;
/** Follow speech check re-arm. Cite: tanaris.cpp:374 m_uiCheckSpeechTimer = 5000 */
export const TOOGA_SPEECH_REPEAT_MS = 5000;

/** Post-event dialogue initial arm. Cite: tanaris.cpp:286 m_uiPostEventTimer = 1000 */
export const TOOGA_POST_EVENT_INIT_MS = 1000;
/** Post-event dialogue re-arm between phases. Cite: tanaris.cpp:332 m_uiPostEventTimer = 5000 */
export const TOOGA_POST_EVENT_REPEAT_MS = 5000;

/** urand(0, 50) speech rolls that fire texts. Cite: tanaris.cpp:376–379 case 10 thirst / case 25 worried */
export const TOOGA_SPEECH_ROLL_THIRST = 10;
export const TOOGA_SPEECH_ROLL_WORRIED = 25;
export const TOOGA_SPEECH_ROLL_MAX = 50;

// ScriptDev IR — mob_aquementas

// mob_aquementasAI, creature 9453 — ABSENT from bake, so the binding is unused. Frost Shock 1s/15s,
// Aqua Jet 5s/15s, plus a 10 s friendly→elemental faction switch and the Silver Totem grant.
export const MOB_AQUEMENTAS: ScriptDevIR = {
  name: 'mob_aquementas',
  boundCreatures: [NPC_AQUEMENTAS],
  sourceFile: 'kalimdor/tanaris.cpp',
  spellIds: [SPELL_AQUA_JET, SPELL_FROST_SHOCK],
  timers: [
    {
      id: 'frost_shock',
      spellId: SPELL_FROST_SHOCK,
      initialMinMs: AQUEMENTAS_FROST_SHOCK_INIT_MS,
      initialMaxMs: AQUEMENTAS_FROST_SHOCK_INIT_MS,
      repeatMinMs: AQUEMENTAS_FROST_SHOCK_REPEAT_MS,
      repeatMaxMs: AQUEMENTAS_FROST_SHOCK_REPEAT_MS,
      target: 'victim',
      cite: 'tanaris.cpp:68,110-114 Frost Shock victim init 1000 re-arm 15000',
    },
    {
      id: 'aqua_jet',
      spellId: SPELL_AQUA_JET,
      initialMinMs: AQUEMENTAS_AQUA_JET_INIT_MS,
      initialMaxMs: AQUEMENTAS_AQUA_JET_INIT_MS,
      repeatMinMs: AQUEMENTAS_AQUA_JET_REPEAT_MS,
      repeatMaxMs: AQUEMENTAS_AQUA_JET_REPEAT_MS,
      target: 'self',
      cite: 'tanaris.cpp:67,118-122 Aqua Jet self init 5000 re-arm 15000',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `m_uiSwitchFactionTimer=${AQUEMENTAS_SWITCH_FACTION_MS}; setFaction(FACTION_FRIENDLY=${FACTION_FRIENDLY})`,
        cite: 'tanaris.cpp:64-70 Reset switch 10s + faction 35',
      },
    ],
    onAggro: [
      {
        kind: 'yell',
        textId: AGGRO_YELL_AQUE,
        cite: 'tanaris.cpp:87 DoScriptText(AGGRO_YELL_AQUE)',
      },
      {
        kind: 'flavor',
        text: 'SendItem: Book Aquor + 11 Silvery Claws + Irontree Heart → grant Silver Totem 11522 if absent (aquementasSendItem)',
        cite: 'tanaris.cpp:73-92 Aggro SendItem via beneficiary player',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_AQUEMENTAS,
      kind: 'creature',
      reason:
        'Creature 9453 Aquementas is DB-bound ScriptName mob_aquementas but absent from product bake - IR + pure helpers + synthetic createSession kit proof ported; product cannot spawn until rebake. Quest 4005 Aquementas is in bake (item residual).',
      cite: 'tanaris.cpp:412-414; scriptdev-corpus.json entry 9453; loadRealBundle missing 9453',
    },
  ],
  cites: [
    'tanaris.cpp:36-133 mob_aquementas',
    'tanaris.cpp:42-54 SAY/SPELL/ITEM/FACTION constants',
    'tanaris.cpp:64-70 Reset timers + FACTION_FRIENDLY 35',
    'tanaris.cpp:73-83 SendItem Silver Totem gate',
    'tanaris.cpp:85-92 Aggro yell + SendItem',
    'tanaris.cpp:94-127 UpdateAI faction switch + Frost Shock + Aqua Jet + melee',
    'tanaris.cpp:412-414 RegisterSelf mob_aquementas',
  ],
};

// ScriptDev IR — npc_oox17tn

// npc_oox17tnAI, creature 7784. Escort 648 with two ambush waves and a WP35 explore credit. No
// combat cast timers. Ambush Scorpid 7803 is absent from bake; 7805 and 5617 are in it.
export const NPC_OOX17TN_SCRIPT: ScriptDevIR = {
  name: 'npc_oox17tn',
  boundCreatures: [NPC_OOX17TN],
  sourceFile: 'kalimdor/tanaris.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: '!escorting → UNIT_STAND_STATE_DEAD',
        cite: 'tanaris.cpp:196-200',
      },
    ],
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_OOX_AGGRO1,
        cite:
          'tanaris.cpp:202-209 urand(0,9) case 0/1 → SAY_OOX_AGGRO1/2 (oox17tnAggro)',
      },
    ],
    onDeath: [
      {
        kind: 'flavor',
        text: 'ForcedDespawn all tracked ambush summons',
        cite: 'tanaris.cpp:218-227',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_SCORPION,
      kind: 'creature',
      reason:
        'Ambush template 7803 Scorpid (WP23) is summoned by OOX-17/TN escort but absent from product bake - coords + despawn still ported; product cannot spawn scorpids until rebake. Escort still completes via WP29 (7805/5617 in bake) + WP35 explore 648.',
      cite: 'tanaris.cpp:150,173-175; loadRealBundle missing 7803',
    },
  ],
  cites: [
    'tanaris.cpp:135-248 npc_oox17tn',
    'tanaris.cpp:141-153 SAY/NPC/QUEST constants',
    'tanaris.cpp:161-194 WaypointReached WP23/29/35',
    'tanaris.cpp:196-200 Reset DEAD stand',
    'tanaris.cpp:202-210 Aggro 10% yell',
    'tanaris.cpp:212-216 JustSummoned AttackStart + track',
    'tanaris.cpp:218-227 JustDied despawn summons',
    'tanaris.cpp:235-248 QuestAccept 648',
  ],
};

// ScriptDev IR — npc_tooga

// npc_toogaAI (FollowerAI), creature 5955. Follower 1560 with a speech timer, a Torta 6015 LOS
// completion and a post-event dialogue that walks him to the water. No combat cast timers.
export const NPC_TOOGA_SCRIPT: ScriptDevIR = {
  name: 'npc_tooga',
  boundCreatures: [NPC_TOOGA],
  sourceFile: 'kalimdor/tanaris.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `m_uiCheckSpeechTimer=${TOOGA_SPEECH_INIT_MS}; m_uiPostEventTimer=${TOOGA_POST_EVENT_INIT_MS}; m_uiPhasePostEvent=0; pTorta=null`,
        cite: 'tanaris.cpp:283-290',
      },
    ],
  },
  cites: [
    'tanaris.cpp:250-407 npc_tooga',
    'tanaris.cpp:256-271 SAY/QUEST/NPC/POINT constants + water loc',
    'tanaris.cpp:283-290 Reset speech/post timers',
    'tanaris.cpp:292-310 MoveInLineOfSight Torta complete',
    'tanaris.cpp:312-321 MovementInform water point complete',
    'tanaris.cpp:323-390 UpdateFollowerAI post-event + speech + melee',
    'tanaris.cpp:398-407 QuestAccept 1560 StartFollow faction 290',
  ],
};
