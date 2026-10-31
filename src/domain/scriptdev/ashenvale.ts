// Ashenvale ScriptDev IR ports. Source: scripts/kalimdor/ashenvale.cpp — npc_muglash,
// go_naga_brazier, npc_ruul_snowhoof, npc_torek, npc_feero_ironhand. Every value cites file:line.

import type { ScriptDevIR } from './types.ts';

// Shared faction / tempfaction / AI event constants

// FACTION_ESCORT_H_NEUTRAL_PASSIVE. Cite: ScriptDevAIMgr.h:45 = 33; ashenvale.cpp:362 Muglash, :470 Ruul
export const FACTION_ESCORT_H_NEUTRAL_PASSIVE = 33;

/** FACTION_ESCORT_A_NEUTRAL_PASSIVE. Cite: ScriptDevAIMgr.h:44 = 10; ashenvale.cpp:768 Feero */
export const FACTION_ESCORT_A_NEUTRAL_PASSIVE = 10;

/** TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h TEMPFACTION_RESTORE_RESPAWN=0x01; ashenvale.cpp:362 */
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;

// TEMPFACTION_TOGGLE_IMMUNE_TO_PLAYER. Cite: Creature.h:581 = 0x10; ashenvale.cpp:470 Ruul flags
// RESTORE_RESPAWN|TOGGLE_IMMUNE_TO_PLAYER
export const TEMPFACTION_TOGGLE_IMMUNE_TO_PLAYER = 0x10;

// TEMPFACTION_TOGGLE_IMMUNE_TO_NPC. Cite: Creature.h:582 = 0x20; ashenvale.cpp:768 Feero flags
// RESTORE_RESPAWN|TOGGLE_IMMUNE_TO_NPC
export const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;

/** AI_EVENT_CUSTOM_A — brazier → Muglash wave start. Cite: AIDefines.h:50 = 1000; ashenvale.cpp:177,374 */
export const AI_EVENT_CUSTOM_A = 1000;

/** UNIT_STAND_STATE_STAND / SIT. Cite: Unit.h; ashenvale.cpp:297,303 SIT */
export const UNIT_STAND_STATE_STAND = 0;
export const UNIT_STAND_STATE_SIT = 1;

// Constants — ashenvale.cpp npc_muglash + go_naga_brazier

// ashenvale.cpp:43–75
/** Cite: ashenvale.cpp:43 SAY_MUGLASH_AGGRO = 8412 */
export const SAY_MUGLASH_AGGRO = 8412;
/** Cite: ashenvale.cpp:44 SAY_MUGLASH_BRAZIER = 8556 */
export const SAY_MUGLASH_BRAZIER = 8556;
/** Cite: ashenvale.cpp:45 SAY_MUGLASH_FAIL = 8409 */
export const SAY_MUGLASH_FAIL = 8409;
/** Cite: ashenvale.cpp:46 SAY_MUGLASH_EVENT_01 = 8410 */
export const SAY_MUGLASH_EVENT_01 = 8410;
/** Cite: ashenvale.cpp:47 SAY_MUGLASH_EVENT_02 = 8413 */
export const SAY_MUGLASH_EVENT_02 = 8413;
/** Cite: ashenvale.cpp:48 SAY_MUGLASH_EVENT_03 = 8567 */
export const SAY_MUGLASH_EVENT_03 = 8567;
/** Cite: ashenvale.cpp:49 SAY_MUGLASH_EVENT_04 = 8568 */
export const SAY_MUGLASH_EVENT_04 = 8568;
/** Cite: ashenvale.cpp:50 SAY_MUGLASH_SUCCESS = 8569 */
export const SAY_MUGLASH_SUCCESS = 8569;
/** Cite: ashenvale.cpp:51 SAY_MUGLASH_SUCCESS_02 = 8558 */
export const SAY_MUGLASH_SUCCESS_02 = 8558;
/** Cite: ashenvale.cpp:52 SAY_MUGLASH_SUCCESS_03 = 8564 */
export const SAY_MUGLASH_SUCCESS_03 = 8564;
/** Cite: ashenvale.cpp:53 SAY_MUGLASH_SUCCESS_04 = 8565 */
export const SAY_MUGLASH_SUCCESS_04 = 8565;

/** Cite: ashenvale.cpp:55 QUEST_VORSHA = 6641 */
export const QUEST_VORSHA = 6641;
/** Cite: ashenvale.cpp:56 MUGLASH_ESCORT_PATH = 12717 */
export const MUGLASH_ESCORT_PATH = 12717;
/** Cite: ashenvale.cpp:57 SPELL_MUGLASH_WAITING = 20861 */
export const SPELL_MUGLASH_WAITING = 20861;
/** Cite: ashenvale.cpp:59 GO_NAGA_BRAZIER = 178247 */
export const GO_NAGA_BRAZIER = 178247;
/** Cite: ashenvale.cpp:61 NPC_MUGLASH = 12717 */
export const NPC_MUGLASH = 12717;

/** First wave entries. Cite: ashenvale.cpp:64–66,90–95 */
export const NPC_WRATH_RIDER = 3713;
export const NPC_WRATH_SORCERESS = 3717;
export const NPC_WRATH_RAZORTAIL = 3712;

/** Second wave entries. Cite: ashenvale.cpp:69–71,103–108 */
export const NPC_WRATH_PRIESTESS = 3944;
export const NPC_WRATH_MYRMIDON = 3711;
export const NPC_WRATH_SEAWITCH = 3715;

/** Cite: ashenvale.cpp:74 NPC_VORSHA = 12940 */
export const NPC_VORSHA = 12940;

// MUGLASH_FAIL timer arm (5 minutes if brazier unused). Cite: ashenvale.cpp:273 ResetTimer(MUGLASH_FAIL,
// 300000)
export const MUGLASH_FAIL_MS = 300_000;

// Default MUGLASH_EVENT re-arm between dialogue steps. Cite:
// ashenvale.cpp:161,169,184,275,299,310,321,333,339,344 ResetTimer(…, 2000|…)
export const MUGLASH_EVENT_STEP_MS = 2000;

/** Post-wave1 rest delay before sit-continue. Cite: ashenvale.cpp:224 ResetTimer(MUGLASH_EVENT, 5000) */
export const MUGLASH_WAVE1_CLEAR_MS = 5000;

/** After EVENT_02 sit: next event step 9s. Cite: ashenvale.cpp:299 ResetTimer(MUGLASH_EVENT, 9000) */
export const MUGLASH_SIT_REST_MS = 9000;

// Wave2-dead dialogue step delays. Cite: ashenvale.cpp:310 3000; :321 8000; :333 3000; :339 5000; :344 5000
export const MUGLASH_EVENT_03_DELAY_MS = 3000;
export const MUGLASH_SUCCESS_DELAY_MS = 8000;
export const MUGLASH_SUCCESS_02_DELAY_MS = 3000;
export const MUGLASH_SUCCESS_03_DELAY_MS = 5000;
export const MUGLASH_SUCCESS_04_DELAY_MS = 5000;

/** ForcedDespawn after escort End random-walk. Cite: ashenvale.cpp:350 ForcedDespawn(14000) */
export const MUGLASH_DESPAWN_MS = 14_000;

/** Wave summon TEMPSPAWN_TIMED_OOC_DESPAWN. Cite: ashenvale.cpp:222,234,291 60000 */
export const MUGLASH_WAVE_DESPAWN_MS = 60_000;

/** First wave spawn coords. Cite: ashenvale.cpp:90–95 nagaLocations */
export const MUGLASH_WAVE1_SPAWNS = [
  {
    entry: NPC_WRATH_RAZORTAIL,
    x: 3629.9194,
    y: 1169.9987,
    z: -3.4472558,
    cite: 'ashenvale.cpp:92 NPC_WRATH_RAZORTAIL',
  },
  {
    entry: NPC_WRATH_RIDER,
    x: 3617.8516,
    y: 1097.7166,
    z: -4.0877485,
    cite: 'ashenvale.cpp:93 NPC_WRATH_RIDER',
  },
  {
    entry: NPC_WRATH_SORCERESS,
    x: 3583.1497,
    y: 1165.5658,
    z: -5.3660164,
    cite: 'ashenvale.cpp:94 NPC_WRATH_SORCERESS',
  },
] as const;

/** Second wave spawn coords. Cite: ashenvale.cpp:103–108 secondnagaLocations */
export const MUGLASH_WAVE2_SPAWNS = [
  {
    entry: NPC_WRATH_MYRMIDON,
    x: 3575.009,
    y: 1119.8704,
    z: -4.2547455,
    cite: 'ashenvale.cpp:105 NPC_WRATH_MYRMIDON',
  },
  {
    entry: NPC_WRATH_SEAWITCH,
    x: 3606.9448,
    y: 1176.3822,
    z: -2.9632108,
    cite: 'ashenvale.cpp:106 NPC_WRATH_SEAWITCH',
  },
  {
    entry: NPC_WRATH_PRIESTESS,
    x: 3651.5383,
    y: 1155.5522,
    z: -3.9628646,
    cite: 'ashenvale.cpp:107 NPC_WRATH_PRIESTESS',
  },
] as const;

// Vorsha spawn. Cite: ashenvale.cpp:234 SummonCreature(NPC_VORSHA, 3630.2092f, 1190.3536f, -16.624332f, …)
export const VORSHA_SPAWN = {
  entry: NPC_VORSHA,
  x: 3630.2092,
  y: 1190.3536,
  z: -16.624332,
  o: 0,
  despawnMs: MUGLASH_WAVE_DESPAWN_MS,
  cite: 'ashenvale.cpp:234 NPC_VORSHA TEMPSPAWN_TIMED_OOC_DESPAWN 60000',
} as const;

// Constants — ashenvale.cpp npc_ruul_snowhoof

// ashenvale.cpp:388–402
/** Cite: ashenvale.cpp:388 QUEST_FREEDOM_TO_RUUL = 6482 */
export const QUEST_FREEDOM_TO_RUUL = 6482;
/** Cite: ashenvale.cpp:389 NPC_T_AVENGER = 3925 */
export const NPC_T_AVENGER = 3925;
/** Cite: ashenvale.cpp:390 NPC_T_SHAMAN = 3924 */
export const NPC_T_SHAMAN = 3924;
/** Cite: ashenvale.cpp:391 NPC_T_PATHFINDER = 3926 */
export const NPC_T_PATHFINDER = 3926;
/** Cite: ashenvale.cpp:392 SPELL_RUUL_SHAPECHANGE = 20514 */
export const SPELL_RUUL_SHAPECHANGE = 20514;
/** Cite: ashenvale.cpp:393 SAY_RUUL_COMPLETE = -1010022 */
export const SAY_RUUL_COMPLETE = -1010022;

export const NPC_RUUL_SNOWHOOF = 12818;

/** Ambusher entries. Cite: ashenvale.cpp:396 */
export const RUUL_AMBUSHERS = [NPC_T_AVENGER, NPC_T_SHAMAN, NPC_T_PATHFINDER] as const;

/** Ambush center coords + random radius 7.0f. Cite: ashenvale.cpp:398–402,418 GetRandomPoint radius 7.0f */
export const RUUL_AMBUSH_COORDS = [
  { x: 3425.33, y: -595.93, z: 178.31, cite: 'ashenvale.cpp:400 First ambush WP14' },
  { x: 3245.34, y: -506.66, z: 150.05, cite: 'ashenvale.cpp:401 Second ambush WP31' },
] as const;

/** Cite: ashenvale.cpp:418 GetRandomPoint … 7.0f */
export const RUUL_AMBUSH_RADIUS_YD = 7;

/** Ambush TEMPSPAWN_DEAD_DESPAWN. Cite: ashenvale.cpp:419 60 * IN_MILLISECONDS */
export const RUUL_AMBUSH_DESPAWN_MS = 60_000;

// Constants — ashenvale.cpp npc_torek

// ashenvale.cpp:490–504
/** Cite: ashenvale.cpp:490 SAY_READY = -1000106 */
export const SAY_TOREK_READY = -1000106;
/** Cite: ashenvale.cpp:491 SAY_MOVE = -1000107 */
export const SAY_TOREK_MOVE = -1000107;
/** Cite: ashenvale.cpp:492 SAY_PREPARE = -1000108 */
export const SAY_TOREK_PREPARE = -1000108;
/** Cite: ashenvale.cpp:493 SAY_WIN = -1000109 */
export const SAY_TOREK_WIN = -1000109;
/** Cite: ashenvale.cpp:494 SAY_END = -1000110 */
export const SAY_TOREK_END = -1000110;

/** Cite: ashenvale.cpp:496 SPELL_REND = 11977 */
export const SPELL_REND = 11977;
/** Cite: ashenvale.cpp:497 SPELL_THUNDERCLAP = 8078 */
export const SPELL_THUNDERCLAP = 8078;

/** Cite: ashenvale.cpp:499 QUEST_TOREK_ASSULT = 6544 */
export const QUEST_TOREK_ASSULT = 6544;

/** Cite: ashenvale.cpp:501 NPC_SPLINTERTREE_RAIDER = 12859 */
export const NPC_SPLINTERTREE_RAIDER = 12859;
/** Cite: ashenvale.cpp:502 NPC_DURIEL = 12860 */
export const NPC_DURIEL = 12860;
/** Cite: ashenvale.cpp:503 NPC_SILVERWING_SENTINEL = 12896 */
export const NPC_SILVERWING_SENTINEL = 12896;
/** Cite: ashenvale.cpp:504 NPC_SILVERWING_WARRIOR = 12897 */
export const NPC_SILVERWING_WARRIOR = 12897;

export const NPC_TOREK = 12858;

/** Rend timer. Reset 5000; CAST_OK re-arm 20000; target victim. Cite: ashenvale.cpp:516,563-564 */
export const TOREK_REND_INIT_MS = 5000;
export const TOREK_REND_REPEAT_MS = 20_000;

/** Thunderclap timer. Reset 8000; CAST_OK re-arm 30000; target self. Cite: ashenvale.cpp:517,571-572 */
export const TOREK_THUNDERCLAP_INIT_MS = 8000;
export const TOREK_THUNDERCLAP_REPEAT_MS = 30_000;

/** WP20 Silverwing pack TEMPSPAWN_TIMED_OOC_DESPAWN. Cite: ashenvale.cpp:537-539 25000 */
export const TOREK_WP20_DESPAWN_MS = 25_000;

/** WP20 summons (Duriel + Sentinel + Warrior). Cite: ashenvale.cpp:537-539 */
export const TOREK_WP20_SPAWNS = [
  {
    entry: NPC_DURIEL,
    x: 1776.73,
    y: -2049.06,
    z: 109.83,
    o: 1.54,
    cite: 'ashenvale.cpp:537 NPC_DURIEL',
  },
  {
    entry: NPC_SILVERWING_SENTINEL,
    x: 1774.64,
    y: -2049.41,
    z: 109.83,
    o: 1.4,
    cite: 'ashenvale.cpp:538 NPC_SILVERWING_SENTINEL',
  },
  {
    entry: NPC_SILVERWING_WARRIOR,
    x: 1778.73,
    y: -2049.5,
    z: 109.83,
    o: 1.67,
    cite: 'ashenvale.cpp:539 NPC_SILVERWING_WARRIOR',
  },
] as const;

// Constants — ashenvale.cpp npc_feero_ironhand

// ashenvale.cpp:606–625
/** Cite: ashenvale.cpp:606 SAY_QUEST_START = -1000771 */
export const SAY_FEERO_QUEST_START = -1000771;
/** Cite: ashenvale.cpp:607 SAY_FIRST_AMBUSH_START = -1000772 */
export const SAY_FIRST_AMBUSH_START = -1000772;
/** Cite: ashenvale.cpp:608 SAY_FIRST_AMBUSH_END = -1000773 */
export const SAY_FIRST_AMBUSH_END = -1000773;
/** Cite: ashenvale.cpp:609 SAY_SECOND_AMBUSH_START = -1000774 */
export const SAY_SECOND_AMBUSH_START = -1000774;
/** Cite: ashenvale.cpp:610 SAY_SCOUT_SECOND_AMBUSH = -1000775 */
export const SAY_SCOUT_SECOND_AMBUSH = -1000775;
/** Cite: ashenvale.cpp:611 SAY_SECOND_AMBUSH_END = -1000776 */
export const SAY_SECOND_AMBUSH_END = -1000776;
/** Cite: ashenvale.cpp:612 SAY_FINAL_AMBUSH_START = -1000777 */
export const SAY_FINAL_AMBUSH_START = -1000777;
/** Cite: ashenvale.cpp:613 SAY_BALIZAR_FINAL_AMBUSH = -1000778 */
export const SAY_BALIZAR_FINAL_AMBUSH = -1000778;
/** Cite: ashenvale.cpp:614 SAY_FINAL_AMBUSH_ATTACK = -1000779 */
export const SAY_FINAL_AMBUSH_ATTACK = -1000779;
/** Cite: ashenvale.cpp:615 SAY_QUEST_END = -1000780 */
export const SAY_FEERO_QUEST_END = -1000780;

/** Cite: ashenvale.cpp:617 QUEST_SUPPLIES_TO_AUBERDINE = 976 */
export const QUEST_SUPPLIES_TO_AUBERDINE = 976;

/** Cite: ashenvale.cpp:619 NPC_DARK_STRAND_ASSASSIN = 3879 */
export const NPC_DARK_STRAND_ASSASSIN = 3879;
/** Cite: ashenvale.cpp:620 NPC_FORSAKEN_SCOUT = 3893 */
export const NPC_FORSAKEN_SCOUT = 3893;
/** Cite: ashenvale.cpp:622 NPC_ALIGAR_THE_TORMENTOR = 3898 */
export const NPC_ALIGAR_THE_TORMENTOR = 3898;
/** Cite: ashenvale.cpp:623 NPC_BALIZAR_THE_UMBRAGE = 3899 */
export const NPC_BALIZAR_THE_UMBRAGE = 3899;
/** Cite: ashenvale.cpp:624 NPC_CAEDAKAR_THE_VICIOUS = 3900 */
export const NPC_CAEDAKAR_THE_VICIOUS = 3900;

export const NPC_FEERO_IRONHAND = 4484;

// Polar summon offsets (distance, angle base). Cite: ashenvale.cpp:633–637 aSummonPositions WP15: 4
// assassins at angle base 1.25 − π/4 * i WP21: 3 scouts at angle base 0.95 − π/3 * i
export const FEERO_SUMMON_POS = [
  { distance: 30.0, angle: 1.25, cite: 'ashenvale.cpp:635 first ambush' },
  { distance: 30.0, angle: 0.95, cite: 'ashenvale.cpp:636 second ambush' },
] as const;

/** Cite: ashenvale.cpp:674 M_PI_F / 4 for assassin spacing */
export const FEERO_ASSASSIN_ANGLE_STEP = Math.PI / 4;
/** Cite: ashenvale.cpp:680 M_PI_F / 3 for scout spacing */
export const FEERO_SCOUT_ANGLE_STEP = Math.PI / 3;
/** Cite: ashenvale.cpp:673 for (i < 4) */
export const FEERO_FIRST_AMBUSH_COUNT = 4;
/** Cite: ashenvale.cpp:679 for (i < 3) */
export const FEERO_SECOND_AMBUSH_COUNT = 3;

/** Final elite hard-coded spawns. Cite: ashenvale.cpp:640–645,685–687 */
export const FEERO_ELITE_SPAWNS = [
  {
    entry: NPC_BALIZAR_THE_UMBRAGE,
    x: 4243.12,
    y: 108.22,
    z: 38.12,
    o: 3.62,
    cite: 'ashenvale.cpp:642,685 NPC_BALIZAR',
  },
  {
    entry: NPC_ALIGAR_THE_TORMENTOR,
    x: 4240.95,
    y: 114.04,
    z: 38.35,
    o: 3.56,
    cite: 'ashenvale.cpp:643,686 NPC_ALIGAR',
  },
  {
    entry: NPC_CAEDAKAR_THE_VICIOUS,
    x: 4235.78,
    y: 118.09,
    z: 38.08,
    o: 4.12,
    cite: 'ashenvale.cpp:644,687 NPC_CAEDAKAR',
  },
] as const;

/** TEMPSPAWN_TIMED_OOC_DESPAWN for ambush adds. Cite: ashenvale.cpp:685–687,716 20000 */
export const FEERO_AMBUSH_DESPAWN_MS = 20_000;

// ---------------------------------------------------------------------------

// Pure helpers live in ashenvaleHelpers.ts (file-size split ≤1500).
export {
  muglashInitialState,
  muglashReset,
  muglashWaypointReached,
  muglashBrazierUsed,
  muglashDoEvent,
  muglashSummonedCreatureJustDied,
  muglashAggro,
  muglashDoFailEscort,
  muglashQuestAccept,
  ruulWaypointReached,
  ruulSpawnAmbush,
  ruulQuestAccept,
  torekReset,
  torekWaypointReached,
  torekQuestAccept,
  feeroInitialState,
  feeroReset,
  feeroWaypointReached,
  feeroJustSummoned,
  feeroSummonedCreatureJustDied,
  feeroAttackedBy,
  feeroQuestAccept,
} from './ashenvaleHelpers.ts';
export type {
  MuglashState,
  MuglashWaypointResult,
  MuglashBrazierUseResult,
  MuglashEventStepResult,
  MuglashSummonedDiedResult,
  MuglashAggroResult,
  MuglashFailResult,
  MuglashQuestAcceptResult,
  RuulWaypointResult,
  RuulQuestAcceptResult,
  TorekCombatState,
  TorekWaypointResult,
  TorekQuestAcceptResult,
  FeeroState,
  FeeroWaypointResult,
  FeeroJustSummonedResult,
  FeeroSummonedDiedResult,
  FeeroAttackedByResult,
  FeeroQuestAcceptResult,
} from './ashenvaleHelpers.ts';

// ScriptDev IR — npc_muglash
// ---------------------------------------------------------------------------

// npc_muglashAI, creature 12717. No combat cast timers — an event machine plus wave summons.
// Vorsha 12940 is absent from bake; quest 6641 credits at DoEvent case 8.
export const NPC_MUGLASH_SCRIPT: ScriptDevIR = {
  name: 'npc_muglash',
  boundCreatures: [NPC_MUGLASH],
  sourceFile: 'kalimdor/ashenvale.cpp',
  spellIds: [SPELL_MUGLASH_WAITING],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset when !escorting: m_uiEventId=0; MUGLASH_FAIL/EVENT custom timers disabled at ctor',
        cite: 'ashenvale.cpp:112-131',
      },
    ],
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_MUGLASH_AGGRO,
        cite: 'ashenvale.cpp:134-143 Aggro while PAUSED 50% SAY_MUGLASH_AGGRO (muglashAggro)',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_VORSHA,
      kind: 'creature',
      reason:
        'NPC 12940 Vorsha the Lasher is escort-summon-only after wave2 clear (ashenvale.cpp:234); absent from product bake - IR ported; spawn coords + death→eventId 7 success dialogue + quest 6641 credit documented in VORSHA_SPAWN / muglashSummonedCreatureJustDied / muglashDoEvent',
      cite: 'ashenvale.cpp:74,234,238-241,323-328; loadRealBundle missing 12940',
    },
  ],
  cites: [
    'ashenvale.cpp:37-380 npc_muglash + go_naga_brazier',
    'ashenvale.cpp:43-75 SAY_* QUEST=6641 path=12717 SPELL=20861 GO=178247 waves + Vorsha',
    'ashenvale.cpp:90-108 nagaLocations / secondnagaLocations',
    'ashenvale.cpp:126-131 Reset eventId when !escorting',
    'ashenvale.cpp:134-143 Aggro 50% SAY while paused',
    'ashenvale.cpp:146-172 WaypointReached WP10/12/15/16/17',
    'ashenvale.cpp:175-185 ReceiveAIEvent CUSTOM_A brazier used',
    'ashenvale.cpp:188-242 JustSummoned / SummonedCreatureJustDied wave counters',
    'ashenvale.cpp:246-352 DoFailEscort + DoEvent cases 0-11',
    'ashenvale.cpp:356-367 QuestAccept 6641 faction 33 path 12717',
    'ashenvale.cpp:57 SPELL_MUGLASH_WAITING=20861',
  ],
};

// ScriptDev IR — go_naga_brazier

// GOUse_go_naga_brazier, gameobject 178247. tables/gameObjects.json omits it, so the product
// spawn is an unused binding; the IR and pure helper are ported. pGOUse only, no combat.
export const GO_NAGA_BRAZIER_SCRIPT: ScriptDevIR = {
  name: 'go_naga_brazier',
  boundCreatures: [],
  boundGos: [GO_NAGA_BRAZIER],
  sourceFile: 'kalimdor/ashenvale.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_NAGA_BRAZIER],
    actions: [
      {
        kind: 'flavor',
        text: 'SendAIEvent CUSTOM_A to Muglash ≤ INTERACTION_DISTANCE*2; GO READY + NO_INTERACT (muglashBrazierUsed)',
        cite: 'ashenvale.cpp:369-379',
      },
    ],
    cite: 'ashenvale.cpp:369-379 GOUse_go_naga_brazier',
  },
  unusedBindings: [
    {
      entry: GO_NAGA_BRAZIER,
      kind: 'go',
      reason:
        'GO 178247 Naga Brazier is in gameobject-data.json but absent from tables/gameObjects.json product GO list - IR ported; pGOUse → AI_EVENT_CUSTOM_A on Muglash + GO ready/no-interact documented in muglashBrazierUsed',
      cite: 'ashenvale.cpp:59,369-379; scriptdev-corpus boundGos=1; loadRealBundle gameObjects missing 178247',
    },
  ],
  cites: [
    'ashenvale.cpp:369-379 GOUse_go_naga_brazier',
    'ashenvale.cpp:59 GO_NAGA_BRAZIER=178247',
    'ashenvale.cpp:818-821 RegisterSelf pGOUse',
  ],
};

// ScriptDev IR — npc_ruul_snowhoof

// npc_ruul_snowhoofAI, creature 12818. No combat cast timers; Reset casts 20514 TRIGGERED.
// Ambush packs 3925/3924/3926 are in bake, and quest 6482 credits at WP32.
export const NPC_RUUL_SNOWHOOF_SCRIPT: ScriptDevIR = {
  name: 'npc_ruul_snowhoof',
  boundCreatures: [NPC_RUUL_SNOWHOOF],
  sourceFile: 'kalimdor/ashenvale.cpp',
  spellIds: [SPELL_RUUL_SHAPECHANGE],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'cast_self',
        spellId: SPELL_RUUL_SHAPECHANGE,
        castFlags: 1, // TRIGGERED_OLD_TRIGGERED
        cite: 'ashenvale.cpp:410 DoCastSpellIfCan SPELL_RUUL_SHAPECHANGE TRIGGERED',
      },
    ],
  },
  cites: [
    'ashenvale.cpp:382-482 npc_ruul_snowhoof',
    'ashenvale.cpp:388-393 QUEST=6482 ambush NPCs SPELL=20514 SAY_RUUL_COMPLETE',
    'ashenvale.cpp:396-402 ambusher table + coords',
    'ashenvale.cpp:408-411 Reset cast 20514 TRIGGERED',
    'ashenvale.cpp:413-424 DoSpawnAmbush radius 7 TEMPSPAWN_DEAD 60000',
    'ashenvale.cpp:427-462 WaypointReached WP14/31/32/33/34/36',
    'ashenvale.cpp:466-477 QuestAccept 6482 faction 33 + Start',
  ],
};

// ScriptDev IR — npc_torek

// npc_torekAI, creature 12858. Rend 11977 victim init 5s / re-arm 20s; Thunderclap 8078 self
// init 8s / re-arm 30s. Duriel 12860 at WP20 is absent from bake; quest 6544 credits at WP21.
export const NPC_TOREK_SCRIPT: ScriptDevIR = {
  name: 'npc_torek',
  boundCreatures: [NPC_TOREK],
  sourceFile: 'kalimdor/ashenvale.cpp',
  spellIds: [SPELL_REND, SPELL_THUNDERCLAP],
  timers: [
    {
      id: 'rend',
      spellId: SPELL_REND,
      // Reset m_uiRend_Timer = 5000 (cpp:516)
      initialMinMs: TOREK_REND_INIT_MS,
      initialMaxMs: TOREK_REND_INIT_MS,
      // CAST_OK re-arm 20000 (cpp:564)
      repeatMinMs: TOREK_REND_REPEAT_MS,
      repeatMaxMs: TOREK_REND_REPEAT_MS,
      target: 'victim',
      cite: 'ashenvale.cpp:516,561-564 m_uiRend_Timer init 5000 re-arm 20000 SPELL_REND 11977 victim',
    },
    {
      id: 'thunderclap',
      spellId: SPELL_THUNDERCLAP,
      // Reset m_uiThunderclap_Timer = 8000 (cpp:517)
      initialMinMs: TOREK_THUNDERCLAP_INIT_MS,
      initialMaxMs: TOREK_THUNDERCLAP_INIT_MS,
      // CAST_OK re-arm 30000 (cpp:572)
      repeatMinMs: TOREK_THUNDERCLAP_REPEAT_MS,
      repeatMaxMs: TOREK_THUNDERCLAP_REPEAT_MS,
      target: 'self',
      cite: 'ashenvale.cpp:517,569-572 m_uiThunderclap_Timer init 8000 re-arm 30000 SPELL_THUNDERCLAP 8078 self',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_uiRend_Timer=5000 m_uiThunderclap_Timer=8000',
        cite: 'ashenvale.cpp:514-517',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_DURIEL,
      kind: 'creature',
      reason:
        'NPC 12860 Duriel is escort-summon-only at Torek WP20 (ashenvale.cpp:537); absent from product bake - IR ported; spawn coords + JustSummoned AttackStart(Torek) documented in TOREK_WP20_SPAWNS / torekWaypointReached',
      cite: 'ashenvale.cpp:502,537,551-554; loadRealBundle missing 12860',
    },
  ],
  cites: [
    'ashenvale.cpp:484-598 npc_torek',
    'ashenvale.cpp:490-504 SAY_* SPELL_REND=11977 SPELL_THUNDERCLAP=8078 QUEST=6544 NPCs',
    'ashenvale.cpp:514-517 Reset combat timers 5000/8000',
    'ashenvale.cpp:520-548 WaypointReached WP2/9/20/21/22',
    'ashenvale.cpp:551-554 JustSummoned AttackStart Torek',
    'ashenvale.cpp:556-578 UpdateEscortAI Rend + Thunderclap + melee',
    'ashenvale.cpp:581-593 QuestAccept 6544 SAY_READY + Start',
  ],
};

// ScriptDev IR — npc_feero_ironhand

// npc_feero_ironhandAI, creature 4484. No combat cast timers; ambush summons at WP15/21/30 and
// quest 976 credits at WP31. Forsaken Scout 3893 is absent from bake.
export const NPC_FEERO_IRONHAND_SCRIPT: ScriptDevIR = {
  name: 'npc_feero_ironhand',
  boundCreatures: [NPC_FEERO_IRONHAND],
  sourceFile: 'kalimdor/ashenvale.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset when !escorting: m_uiCreaturesCount=0 m_bIsAttacked=false',
        cite: 'ashenvale.cpp:657-663',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_FORSAKEN_SCOUT,
      kind: 'creature',
      reason:
        'NPC 3893 Forsaken Scout is escort-summon-only at Feero WP21 (ashenvale.cpp:679-680); absent from product bake - IR ported; polar spawn offsets + JustSummoned scout yell + AttackStart documented in feeroWaypointReached / feeroJustSummoned',
      cite: 'ashenvale.cpp:620,676-681,742-748; loadRealBundle missing 3893',
    },
  ],
  cites: [
    'ashenvale.cpp:600-775 npc_feero_ironhand',
    'ashenvale.cpp:606-625 SAY_* QUEST=976 ambush NPC entries',
    'ashenvale.cpp:633-645 aSummonPositions + aEliteSummonPositions',
    'ashenvale.cpp:657-663 Reset counters when !escorting',
    'ashenvale.cpp:666-694 WaypointReached WP15/21/30/31',
    'ashenvale.cpp:697-707 AttackedBy first Balizar → SAY_FINAL_AMBUSH_ATTACK',
    'ashenvale.cpp:711-717 DoSpawnMob polar GetNearPoint',
    'ashenvale.cpp:719-755 SummonedCreatureJustDied clear texts + JustSummoned',
    'ashenvale.cpp:763-775 QuestAccept 976 SAY_QUEST_START + faction 10 + Start',
  ],
};

