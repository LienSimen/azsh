// Feralas ScriptDev IR ports. Source: scripts/kalimdor/feralas.cpp plus world_kalimdor for
// TYPE_FREEDOM_CREATURES — OOX-22/FE, Shay, the sprite darter, Kindal and the cage door.

import type { ScriptDevIR } from './types.ts';

import { INSTANCE_DATA } from './types.ts';

// Shared faction / tempfaction / stand-state / AI event constants

/** FACTION_ESCORT_N_FRIEND_ACTIVE. Cite: ScriptDevAIMgr.h:53 = 495; feralas.cpp:150 OOX, :422 sprite */
export const FACTION_ESCORT_N_FRIEND_ACTIVE = 495;

/** FACTION_ESCORT_A_NEUTRAL_ACTIVE. Cite: ScriptDevAIMgr.h:48 = 231; feralas.cpp:566 Kindal StartFollow */
export const FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231;

/** TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h:577 = 0x01; feralas.cpp:150 */
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;

/** TEMPFACTION_TOGGLE_IMMUNE_TO_NPC. Cite: Creature.h:582 = 0x20; feralas.cpp:150 */
export const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;

/** UNIT_STAND_STATE_STAND / DEAD. Cite: Unit.h; feralas.cpp:107 DEAD Reset, :149 STAND accept */
export const UNIT_STAND_STATE_STAND = 0;
export const UNIT_STAND_STATE_DEAD = 7;

/** INTERACTION_DISTANCE. Cite: ObjectDefines.h:25 = 5.0f; feralas.cpp:224 Shay recall */
export const INTERACTION_DISTANCE = 5;

// AI_EVENT_START_EVENT / AI_EVENT_CUSTOM_A. Cite: AIDefines.h:45 = 102, :50 = 1000; feralas.cpp:244
// START_EVENT, :247 CUSTOM_A (bell)
export const AI_EVENT_START_EVENT = 102;
export const AI_EVENT_CUSTOM_A = 1000;

// Constants — world map TYPE_FREEDOM_CREATURES (quest 2969)

/** TYPE_FREEDOM_CREATURES encounter field on world_map_kalimdor. Cite: world_kalimdor.h:47 = 3 */
export const TYPE_FREEDOM_CREATURES = 3;

/** Freed Sprite Darters required for DONE. Cite: world_kalimdor.cpp:381 if (m_freedSpriteDarter >= 6) */
export const FREEDOM_CREATURES_DONE_COUNT = 6;

// Constants — npc_oox22fe

// feralas.cpp:47–60
/** Cite: feralas.cpp:47 SAY_OOX_START = -1000287 */
export const SAY_OOX_START = -1_000_287;
/** Cite: feralas.cpp:48 SAY_OOX_AGGRO1 = -1000288 */
export const SAY_OOX_AGGRO1 = -1_000_288;
/** Cite: feralas.cpp:49 SAY_OOX_AGGRO2 = -1000289 */
export const SAY_OOX_AGGRO2 = -1_000_289;
/** Cite: feralas.cpp:50 SAY_OOX_AMBUSH = -1000290 */
export const SAY_OOX_AMBUSH = -1_000_290;
/** Cite: feralas.cpp:51 SAY_OOX_END = -1000292 */
export const SAY_OOX_END = -1_000_292;

/** Cite: feralas.cpp:53 NPC_YETI = 7848 */
export const NPC_YETI = 7848;
/** Cite: feralas.cpp:54 NPC_GORILLA = 5260 */
export const NPC_GORILLA = 5260;
/** Cite: feralas.cpp:55 NPC_WOODPAW_REAVER = 5255 */
export const NPC_WOODPAW_REAVER = 5255;
/** Cite: feralas.cpp:56 NPC_WOODPAW_BRUTE = 5253 */
export const NPC_WOODPAW_BRUTE = 5253;
/** Cite: feralas.cpp:57 NPC_WOODPAW_ALPHA = 5258 */
export const NPC_WOODPAW_ALPHA = 5258;
/** Cite: feralas.cpp:58 NPC_WOODPAW_MYSTIC = 5254 */
export const NPC_WOODPAW_MYSTIC = 5254;

/** Cite: feralas.cpp:60 QUEST_RESCUE_OOX22FE = 2767 */
export const QUEST_RESCUE_OOX22FE = 2767;

/** DB binding. Cite: scriptdev-corpus.json entry 7807 */
export const NPC_OOX22FE = 7807;

/** Ambush corpse despawn ms. Cite: feralas.cpp:76 TEMPSPAWN_CORPSE_TIMED_DESPAWN, 10000 */
export const OOX_AMBUSH_CORPSE_DESPAWN_MS = 10_000;

/** WP12 first ambush — 3 Yetis. Cite: feralas.cpp:74–78 */
export const OOX_WP12_SPAWNS = [
  {
    entry: NPC_YETI,
    x: -4841.01,
    y: 1593.91,
    z: 73.42,
    o: 3.98,
    cite: 'feralas.cpp:76',
  },
  {
    entry: NPC_YETI,
    x: -4837.61,
    y: 1568.58,
    z: 78.21,
    o: 3.13,
    cite: 'feralas.cpp:77',
  },
  {
    entry: NPC_YETI,
    x: -4841.89,
    y: 1569.95,
    z: 76.53,
    o: 0.68,
    cite: 'feralas.cpp:78',
  },
] as const;

/** WP22 second ambush — 3 Gorillas. Cite: feralas.cpp:81–85 */
export const OOX_WP22_SPAWNS = [
  {
    entry: NPC_GORILLA,
    x: -4595.81,
    y: 2005.99,
    z: 53.08,
    o: 3.74,
    cite: 'feralas.cpp:83',
  },
  {
    entry: NPC_GORILLA,
    x: -4597.53,
    y: 2008.31,
    z: 52.7,
    o: 3.78,
    cite: 'feralas.cpp:84',
  },
  {
    entry: NPC_GORILLA,
    x: -4599.37,
    y: 2010.59,
    z: 52.77,
    o: 3.84,
    cite: 'feralas.cpp:85',
  },
] as const;

/** WP31 third ambush — 4 Woodpaw gnolls. Cite: feralas.cpp:88–93 */
export const OOX_WP31_SPAWNS = [
  {
    entry: NPC_WOODPAW_REAVER,
    x: -4425.14,
    y: 2075.87,
    z: 47.77,
    o: 3.77,
    cite: 'feralas.cpp:90',
  },
  {
    entry: NPC_WOODPAW_BRUTE,
    x: -4426.68,
    y: 2077.98,
    z: 47.57,
    o: 3.77,
    cite: 'feralas.cpp:91',
  },
  {
    entry: NPC_WOODPAW_MYSTIC,
    x: -4428.33,
    y: 2080.24,
    z: 47.43,
    o: 3.87,
    cite: 'feralas.cpp:92',
  },
  {
    entry: NPC_WOODPAW_ALPHA,
    x: -4430.04,
    y: 2075.54,
    z: 46.83,
    o: 3.81,
    cite: 'feralas.cpp:93',
  },
] as const;

// QuestAccept temp faction flags. Cite: feralas.cpp:150 TEMPFACTION_RESTORE_RESPAWN |
// TEMPFACTION_TOGGLE_IMMUNE_TO_NPC
export const OOX_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;

// Constants — npc_shay_leafrunner

// feralas.cpp:164–178
/** Cite: feralas.cpp:164 SAY_ESCORT_START = -1001106 */
export const SAY_SHAY_ESCORT_START = -1_001_106;
/** Cite: feralas.cpp:165 SAY_WANDER_1 = -1001107 */
export const SAY_WANDER_1 = -1_001_107;
/** Cite: feralas.cpp:166 SAY_WANDER_2 = -1001108 */
export const SAY_WANDER_2 = -1_001_108;
/** Cite: feralas.cpp:167 SAY_WANDER_3 = -1001109 */
export const SAY_WANDER_3 = -1_001_109;
/** Cite: feralas.cpp:168 SAY_WANDER_4 = -1001110 */
export const SAY_WANDER_4 = -1_001_110;
/** Cite: feralas.cpp:169 SAY_WANDER_DONE_1 = -1001111 */
export const SAY_WANDER_DONE_1 = -1_001_111;
/** Cite: feralas.cpp:170 SAY_WANDER_DONE_2 = -1001112 */
export const SAY_WANDER_DONE_2 = -1_001_112;
/** Cite: feralas.cpp:171 SAY_WANDER_DONE_3 = -1001113 */
export const SAY_WANDER_DONE_3 = -1_001_113;
/** Cite: feralas.cpp:172 EMOTE_WANDER = -1001114 */
export const EMOTE_WANDER = -1_001_114;
/** Cite: feralas.cpp:173 SAY_EVENT_COMPLETE_1 = -1001115 */
export const SAY_EVENT_COMPLETE_1 = -1_001_115;
/** Cite: feralas.cpp:174 SAY_EVENT_COMPLETE_2 = -1001116 */
export const SAY_EVENT_COMPLETE_2 = -1_001_116;

/** Cite: feralas.cpp:176 SPELL_SHAYS_BELL = 11402 */
export const SPELL_SHAYS_BELL = 11402;
/** Cite: feralas.cpp:177 NPC_ROCKBITER = 7765 */
export const NPC_ROCKBITER = 7765;
/** Cite: feralas.cpp:178 QUEST_ID_WANDERING_SHAY = 2845 */
export const QUEST_ID_WANDERING_SHAY = 2845;

/** DB binding. Cite: scriptdev-corpus.json entry 7774 */
export const NPC_SHAY_LEAFRUNNER = 7774;

/** Initial wander arm after follow starts. Cite: feralas.cpp:245 m_uiWanderTimer = 30000 */
export const SHAY_WANDER_INIT_MS = 30_000;

/** Re-arm wander after player recalls with bell. Cite: feralas.cpp:226 m_uiWanderTimer = 60000 */
export const SHAY_WANDER_RECALL_MS = 60_000;

/** Rockbiter complete LOS radius. Cite: feralas.cpp:203 IsWithinDistInMap(pWho, 20.0f) */
export const SHAY_ROCKBITER_LOS_YD = 20;

/** ForcedDespawn after complete. Cite: feralas.cpp:215 ForcedDespawn(30000) */
export const SHAY_COMPLETE_DESPAWN_MS = 30_000;

/** Wander random point distance range. Cite: feralas.cpp:277 frand(25.0f, 40.0f) */
export const SHAY_WANDER_DIST_MIN_YD = 25;
export const SHAY_WANDER_DIST_MAX_YD = 40;

/** MoveRandomAroundPoint radius after wander point pick. Cite: feralas.cpp:278 radius 20.0f */
export const SHAY_WANDER_AROUND_RADIUS_YD = 20;

export const SHAY_WANDER_TEXTS = [
  SAY_WANDER_1,
  SAY_WANDER_2,
  SAY_WANDER_3,
  SAY_WANDER_4,
] as const;

export const SHAY_WANDER_DONE_TEXTS = [
  SAY_WANDER_DONE_1,
  SAY_WANDER_DONE_2,
  SAY_WANDER_DONE_3,
] as const;

// Constants — Freedom for all creatures (sprite + kindal + cage)

// feralas.cpp:324–337
/** Cite: feralas.cpp:324 SAY_KINDAL_QUEST_START = -1010023 */
export const SAY_KINDAL_QUEST_START = -1_010_023;
/** Cite: feralas.cpp:325 SAY_KINDAL_INITIAL_AGGRO = -1010024 */
export const SAY_KINDAL_INITIAL_AGGRO = -1_010_024;
/** Cite: feralas.cpp:326 SAY_KINDAL_AGGRO = -1010025 */
export const SAY_KINDAL_AGGRO = -1_010_025;
/** Cite: feralas.cpp:327 SAY_KINDAL_QUEST_COMPLETE = -1010026 */
export const SAY_KINDAL_QUEST_COMPLETE = -1_010_026;

/** Cite: feralas.cpp:329 NPC_CAPTURED_SPRITE_DARTER = 7997 */
export const NPC_CAPTURED_SPRITE_DARTER = 7997;
/** Cite: feralas.cpp:330 NPC_GRIMTOTEM_RAIDER = 7725 */
export const NPC_GRIMTOTEM_RAIDER = 7725;
/** Cite: feralas.cpp:331 NPC_KINDAL_MOONWEAVER = 7956 */
export const NPC_KINDAL_MOONWEAVER = 7956;

/** Cite: feralas.cpp:333 QUEST_FREEDOM_ALL_CREATURES = 2969 */
export const QUEST_FREEDOM_ALL_CREATURES = 2969;

/** Cite: feralas.cpp:335 SPELL_MANA_BURN = 11981 */
export const SPELL_MANA_BURN = 11981;
/** Cite: feralas.cpp:336 SPELL_SHOOT = 14443 (bake name "Multi-Shot" — id from cpp, not renamed) */
export const SPELL_SHOOT = 14443;
/** Cite: feralas.cpp:337 SPELL_MULTI_SHOT = 6660 (bake name "Shoot" — id from cpp, not renamed) */
export const SPELL_MULTI_SHOT = 6660;

// GO cage door ScriptName binding. Cite: scriptdev2.sql UPDATE … WHERE entry=143979; gameobject-data Cage
// Door
export const GO_CAGE_DOOR = 143979;

/** Raider spawn position on cage open. Cite: feralas.cpp:340 raiderSpawnPos */
export const RAIDER_SPAWN_POS = {
  x: -4515.35,
  y: 811.36,
  z: 62.99,
  o: 3.60244,
  cite: 'feralas.cpp:340',
} as const;

/** Raider TEMPSPAWN_DEAD_DESPAWN duration. Cite: feralas.cpp:427 10 * MINUTE * IN_MILLISECONDS */
export const RAIDER_DESPAWN_MS = 10 * 60 * 1000;

/** Cage / Kindal search radius for sprites and Kindal. Cite: feralas.cpp:416,430 20.0f */
export const CAGE_SEARCH_YD = 20;

// Mana Burn timer. Reset urand(3,6)*IN_MILLISECONDS; CAST_OK re-arm urand(7,10)*IN_MILLISECONDS. Cite:
// feralas.cpp:359,384
export const SPRITE_MANA_BURN_INIT_MIN_MS = 3000;
export const SPRITE_MANA_BURN_INIT_MAX_MS = 6000;
export const SPRITE_MANA_BURN_REPEAT_MIN_MS = 7000;
export const SPRITE_MANA_BURN_REPEAT_MAX_MS = 10_000;

/** Escort path end waypoint → free credit. Cite: feralas.cpp:367 if (pointId == 8) */
export const SPRITE_ESCORT_END_WP = 8;

/** Kindal completion poll interval. Cite: feralas.cpp:460 m_checkCompletionTimer = 1 * IN_MILLISECONDS */
export const KINDAL_COMPLETION_CHECK_MS = 1000;

/** Kindal despawn arm after quest complete. Cite: feralas.cpp:489 m_despawnTimer = 5 * IN_MILLISECONDS */
export const KINDAL_COMPLETE_DESPAWN_MS = 5000;

/** Shoot timer. Reset urand(2,4)*IN_MILLISECONDS; CAST_OK re-arm same. Cite: feralas.cpp:462,528 */
export const KINDAL_SHOOT_INIT_MIN_MS = 2000;
export const KINDAL_SHOOT_INIT_MAX_MS = 4000;
export const KINDAL_SHOOT_REPEAT_MIN_MS = 2000;
export const KINDAL_SHOOT_REPEAT_MAX_MS = 4000;

// Multi-Shot timer, Reset urand(8,11)s. The CAST_OK line writes m_shootTimer instead (a cpp typo),
// so the IR re-arms multi with those values rather than firing it every tick. Cite: :463, :544.
export const KINDAL_MULTI_SHOT_INIT_MIN_MS = 8000;
export const KINDAL_MULTI_SHOT_INIT_MAX_MS = 11_000;
export const KINDAL_MULTI_SHOT_REPEAT_MIN_MS = 8000;
export const KINDAL_MULTI_SHOT_REPEAT_MAX_MS = 11_000;

// Shoot / Multi-Shot range band (yards). Cite: feralas.cpp:525,540 IsInRange(..., 5.0f, 30.0f, true, true)
export const KINDAL_SHOT_RANGE_MIN_YD = 5;
export const KINDAL_SHOT_RANGE_MAX_YD = 30;

/** Flee HP threshold. Cite: feralas.cpp:514 GetHealthPercent() <= 15.0f */
export const KINDAL_FLEE_HP_PCT = 15;

// ---------------------------------------------------------------------------

// ScriptDev IR — npc_oox22fe
// ---------------------------------------------------------------------------

// npc_oox22feAI, creature 7807. Escort 2767 with three ambush waves and a WP38 explore credit.
// No combat cast timers — melee escort, with the ambush AttackStart via JustSummoned.
export const NPC_OOX22FE_SCRIPT: ScriptDevIR = {
  name: 'npc_oox22fe',
  boundCreatures: [NPC_OOX22FE],
  sourceFile: 'kalimdor/feralas.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: '!escorting → UNIT_STAND_STATE_DEAD',
        cite: 'feralas.cpp:104-108',
      },
    ],
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_OOX_AGGRO1,
        cite:
          'feralas.cpp:113-117 urand(0,9) case 0/1 → SAY_OOX_AGGRO1/2 (ooxAggro)',
      },
    ],
    onDeath: [
      {
        kind: 'flavor',
        text: 'ForcedDespawn all tracked ambush summons',
        cite: 'feralas.cpp:127-135',
      },
    ],
  },
  cites: [
    'feralas.cpp:41-156 npc_oox22fe',
    'feralas.cpp:47-60 SAY/NPC/QUEST constants',
    'feralas.cpp:69-101 WaypointReached WP12/22/31/38',
    'feralas.cpp:104-108 Reset DEAD stand',
    'feralas.cpp:110-118 Aggro 10% yell',
    'feralas.cpp:120-125 JustSummoned AttackStart + track',
    'feralas.cpp:127-135 JustDied despawn summons',
    'feralas.cpp:143-156 QuestAccept 2767',
  ],
};

// ScriptDev IR — npc_shay_leafrunner

// npc_shay_leafrunnerAI and the ShaysBell spell script, creature 7774. Follower 2845 with a wander
// timer, the 11402 bell recall and a Rockbiter 7765 completion. No combat cast timers.
export const NPC_SHAY_LEAFRUNNER_SCRIPT: ScriptDevIR = {
  name: 'npc_shay_leafrunner',
  boundCreatures: [NPC_SHAY_LEAFRUNNER],
  sourceFile: 'kalimdor/feralas.cpp',
  spellIds: [SPELL_SHAYS_BELL],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_bIsRecalled=false; m_bIsComplete=false (ctor wander 0)',
        cite: 'feralas.cpp:185-197',
      },
    ],
  },
  cites: [
    'feralas.cpp:158-317 npc_shay_leafrunner + ShaysBell',
    'feralas.cpp:164-178 SAY/SPELL/NPC/QUEST constants',
    'feralas.cpp:199-236 MoveInLineOfSight Rockbiter + recall',
    'feralas.cpp:238-253 ReceiveAIEvent START_EVENT / CUSTOM_A',
    'feralas.cpp:255-288 UpdateFollowerAI wander 30s/60s',
    'feralas.cpp:296-304 QuestAccept 2845',
    'feralas.cpp:306-317 spell_shays_bell 11402',
  ],
};

// ScriptDev IR — npc_captured_sprite_darter

// npc_captured_sprite_darterAI, creature 7997. Mana Burn 11981 on a random mana target, init 3–6s
// re-arm 7–10s; WP8 sets SPECIAL and despawns. The escort starts from the cage GO.
export const NPC_CAPTURED_SPRITE_DARTER_SCRIPT: ScriptDevIR = {
  name: 'npc_captured_sprite_darter',
  boundCreatures: [NPC_CAPTURED_SPRITE_DARTER],
  sourceFile: 'kalimdor/feralas.cpp',
  spellIds: [SPELL_MANA_BURN],
  timers: [
    {
      id: 'mana_burn',
      spellId: SPELL_MANA_BURN,
      // Reset m_manaBurnTimer = urand(3, 6) * IN_MILLISECONDS (cpp:359)
      initialMinMs: SPRITE_MANA_BURN_INIT_MIN_MS,
      initialMaxMs: SPRITE_MANA_BURN_INIT_MAX_MS,
      // CAST_OK re-arm urand(7, 10) * IN_MILLISECONDS (cpp:384)
      repeatMinMs: SPRITE_MANA_BURN_REPEAT_MIN_MS,
      repeatMaxMs: SPRITE_MANA_BURN_REPEAT_MAX_MS,
      target: 'hostile_random_mana',
      select: { powerMana: true },
      cite:
        'feralas.cpp:359,379-385 Mana Burn 11981 init 3000-6000 re-arm 7000-10000 random mana',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'manaBurn urand(3-6)s; SetEscortWaypoints(urand(0,3))',
        cite: 'feralas.cpp:357-362',
      },
    ],
  },
  cites: [
    'feralas.cpp:342-397 npc_captured_sprite_darter',
    'feralas.cpp:335 SPELL_MANA_BURN=11981',
    'feralas.cpp:359 Reset mana burn 3-6s',
    'feralas.cpp:364-372 WP8 SetData SPECIAL + despawn',
    'feralas.cpp:374-391 UpdateEscortAI Mana Burn + melee',
  ],
};

// ScriptDev IR — npc_kindal_moonweaver

// npc_kindal_moonweaverAI, creature 7956. Follower 2969 with Shoot 14443 and Multi-Shot 6660, and
// a flee at ≤15%. Completion needs TYPE_FREEDOM_CREATURES DONE from the world map counter.
export const NPC_KINDAL_MOONWEAVER_SCRIPT: ScriptDevIR = {
  name: 'npc_kindal_moonweaver',
  boundCreatures: [NPC_KINDAL_MOONWEAVER],
  sourceFile: 'kalimdor/feralas.cpp',
  spellIds: [SPELL_SHOOT, SPELL_MULTI_SHOT],
  timers: [
    {
      id: 'shoot',
      spellId: SPELL_SHOOT,
      // Reset m_shootTimer = urand(2, 4) * IN_MILLISECONDS (cpp:462)
      initialMinMs: KINDAL_SHOOT_INIT_MIN_MS,
      initialMaxMs: KINDAL_SHOOT_INIT_MAX_MS,
      // CAST_OK re-arm urand(2, 4) * IN_MILLISECONDS (cpp:528)
      repeatMinMs: KINDAL_SHOOT_REPEAT_MIN_MS,
      repeatMaxMs: KINDAL_SHOOT_REPEAT_MAX_MS,
      target: 'victim',
      cite:
        'feralas.cpp:462,520-530 Shoot 14443 init/re-arm 2000-4000 victim range 5-30yd',
    },
    {
      id: 'multi_shot',
      spellId: SPELL_MULTI_SHOT,
      // Reset m_multiShotTimer = urand(8, 11) * IN_MILLISECONDS (cpp:463)
      initialMinMs: KINDAL_MULTI_SHOT_INIT_MIN_MS,
      initialMaxMs: KINDAL_MULTI_SHOT_INIT_MAX_MS,
      // cpp:544 writes m_shootTimer (typo); IR re-arms multi with urand(8,11)s
      repeatMinMs: KINDAL_MULTI_SHOT_REPEAT_MIN_MS,
      repeatMaxMs: KINDAL_MULTI_SHOT_REPEAT_MAX_MS,
      target: 'victim',
      cite:
        'feralas.cpp:463,536-546 Multi-Shot 6660 init 8000-11000 re-arm 8000-11000 victim range 5-30yd',
    },
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: KINDAL_FLEE_HP_PCT,
      actions: [
        {
          kind: 'flavor',
          text: 'DoFlee() once; m_hasFleed=true (kindalFleeCheck)',
          cite: 'feralas.cpp:514-517',
        },
      ],
      cite: 'feralas.cpp:513-518 GetHealthPercent() <= 15.0f → DoFlee once',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'check 1s; shoot 2-4s; multi 8-11s; hasFleed=false; despawn 0',
        cite: 'feralas.cpp:458-465',
      },
    ],
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_KINDAL_AGGRO,
        cite:
          'feralas.cpp:469-470 !urand(0,3) → SAY_KINDAL_AGGRO (kindalAggro)',
      },
    ],
  },
  cites: [
    'feralas.cpp:439-573 npc_kindal_moonweaver',
    'feralas.cpp:324-337 SAY/NPC/QUEST/SPELL constants',
    'feralas.cpp:458-465 Reset timers',
    'feralas.cpp:467-471 Aggro 25% yell',
    'feralas.cpp:473-553 UpdateFollowerAI poll + shoot + multi + flee',
    'feralas.cpp:561-573 QuestAccept 2969',
  ],
};

// ScriptDev IR — go_cage_door

// GOUse_go_cage_door, GO 143979. Sets IN_PROGRESS, frees the sprites, summons Grimtotem Raider
// 7725 and gives Kindal her initial aggro. No combat timers.
export const GO_CAGE_DOOR_SCRIPT: ScriptDevIR = {
  name: 'go_cage_door',
  boundCreatures: [],
  boundGos: [GO_CAGE_DOOR],
  sourceFile: 'kalimdor/feralas.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_CAGE_DOOR],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_FREEDOM_CREATURES,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'feralas.cpp:412 SetData(TYPE_FREEDOM_CREATURES, IN_PROGRESS)',
      },
      {
        kind: 'summon',
        creatureEntry: NPC_GRIMTOTEM_RAIDER,
        cite:
          'feralas.cpp:427-429 SummonCreature Grimtotem Raider 7725 at raiderSpawnPos',
      },
      {
        kind: 'flavor',
        text:
          'sprites ≤20yd faction 495 + escort Start; Kindal ≤20yd SAY initial aggro + AttackStart(raider)',
        cite: 'feralas.cpp:414-434',
      },
    ],
    cite: 'feralas.cpp:403-437 GOUse_go_cage_door entry 143979',
  },
  cites: [
    'feralas.cpp:399-437 go_cage_door',
    'feralas.cpp:340 raiderSpawnPos',
    'feralas.cpp:412 SetData IN_PROGRESS',
    'feralas.cpp:414-425 free Captured Sprite Darters ≤20yd',
    'feralas.cpp:427-434 summon Raider + Kindal aggro',
    'scriptdev2.sql entry 143979 ScriptName go_cage_door',
  ],
};

