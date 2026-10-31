// Un'Goro Crater ScriptDev IR ports. Source: scripts/kalimdor/ungoro_crater.cpp — A-Me 01, Ringo
// and the three Stave of the Ancients bodies. Simone the Inconspicuous and Precious lack bake rows.

import type { ScriptDevIR } from './types.ts';


// Shared faction / tempfaction / stand-state constants

/** FACTION_ESCORT_A_PASSIVE. Cite: ScriptDevAIMgr.h:55 = 774; ungoro_crater.cpp:108 */
export const FACTION_ESCORT_A_PASSIVE = 774;

/** FACTION_ESCORT_H_PASSIVE. Cite: ScriptDevAIMgr.h:56 = 775; ungoro_crater.cpp:110 */
export const FACTION_ESCORT_H_PASSIVE = 775;

/** FACTION_ESCORT_N_FRIEND_PASSIVE. Cite: ScriptDevAIMgr.h:52 = 290; ungoro_crater.cpp:334 */
export const FACTION_ESCORT_N_FRIEND_PASSIVE = 290;

/** TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h:577 = 0x01; ungoro_crater.cpp:108-110 */
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;

/** TEMPFACTION_TOGGLE_IMMUNE_TO_NPC. Cite: Creature.h:582 = 0x20; ungoro_crater.cpp:108-110 */
export const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;

// UNIT_STAND_STATE_STAND / SLEEP / DEAD.
// Cite: Unit.h:97 STAND=0, :100 SLEEP=3, :104 DEAD=7; ungoro_crater.cpp:55, :105, :220.
export const UNIT_STAND_STATE_STAND = 0;
export const UNIT_STAND_STATE_SLEEP = 3;
export const UNIT_STAND_STATE_DEAD = 7;

/** INTERACTION_DISTANCE. Cite: ObjectDefines.h:25 = 5.0f; ungoro_crater.cpp:184 */
export const INTERACTION_DISTANCE = 5;

/** Time units. Cite: Common.h:113-119 MINUTE=60 HOUR=3600 IN_MILLISECONDS=1000 */
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;

/** EMOTE_ONESHOT_LAUGH / SHOUT. Cite: SharedDefines.h:758=11, :769=22; ungoro_crater.cpp:754,799 */
export const EMOTE_ONESHOT_LAUGH = 11;
export const EMOTE_ONESHOT_SHOUT = 22;

// Constants — npc_ame01

// ungoro_crater.cpp:41–48
/** Cite: ungoro_crater.cpp:41 SAY_AME_START = -1000446 */
export const SAY_AME_START = -1_000_446;
/** Cite: ungoro_crater.cpp:42 SAY_AME_PROGRESS = -1000447 */
export const SAY_AME_PROGRESS = -1_000_447;
/** Cite: ungoro_crater.cpp:43 SAY_AME_END = -1000448 */
export const SAY_AME_END = -1_000_448;
/** Cite: ungoro_crater.cpp:44 SAY_AME_AGGRO1 = -1000449 */
export const SAY_AME_AGGRO1 = -1_000_449;
/** Cite: ungoro_crater.cpp:45 SAY_AME_AGGRO2 = -1000450 */
export const SAY_AME_AGGRO2 = -1_000_450;
/** Cite: ungoro_crater.cpp:46 SAY_AME_AGGRO3 = -1000451 */
export const SAY_AME_AGGRO3 = -1_000_451;

/** Cite: ungoro_crater.cpp:48 QUEST_CHASING_AME = 4245 */
export const QUEST_CHASING_AME = 4245;

/** DB binding. Cite: scriptdev-corpus.json entry 9623 A-Me 01 */
export const NPC_AME01 = 9623;

/** Aggro SAY pool. Cite: ungoro_crater.cpp:89-93 urand(0,2) */
export const AME_AGGRO_TEXTS = [SAY_AME_AGGRO1, SAY_AME_AGGRO2, SAY_AME_AGGRO3] as const;

// QuestAccept temp faction flags. Cite: ungoro_crater.cpp:108-110 TEMPFACTION_RESTORE_RESPAWN |
// TEMPFACTION_TOGGLE_IMMUNE_TO_NPC
export const AME_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;

// Constants — npc_ringo

// ungoro_crater.cpp:129–153
/** Cite: ungoro_crater.cpp:129 SAY_RIN_START_1 = -1000416 */
export const SAY_RIN_START_1 = -1_000_416;
/** Cite: ungoro_crater.cpp:130 SAY_RIN_START_2 = -1000417 */
export const SAY_RIN_START_2 = -1_000_417;

/** Cite: ungoro_crater.cpp:132-135 SAY_FAINT_1..4 */
export const SAY_FAINT_1 = -1_000_418;
export const SAY_FAINT_2 = -1_000_419;
export const SAY_FAINT_3 = -1_000_420;
export const SAY_FAINT_4 = -1_000_421;
export const RINGO_FAINT_TEXTS = [SAY_FAINT_1, SAY_FAINT_2, SAY_FAINT_3, SAY_FAINT_4] as const;

/** Cite: ungoro_crater.cpp:137-140 SAY_WAKE_1..4 */
export const SAY_WAKE_1 = -1_000_422;
export const SAY_WAKE_2 = -1_000_423;
export const SAY_WAKE_3 = -1_000_424;
export const SAY_WAKE_4 = -1_000_425;
export const RINGO_WAKE_TEXTS = [SAY_WAKE_1, SAY_WAKE_2, SAY_WAKE_3, SAY_WAKE_4] as const;

/** Cite: ungoro_crater.cpp:142-149 end-event texts */
export const SAY_RIN_END_1 = -1_000_426;
export const SAY_SPR_END_2 = -1_000_427;
export const SAY_RIN_END_3 = -1_000_428;
export const EMOTE_RIN_END_4 = -1_000_429;
export const EMOTE_RIN_END_5 = -1_000_430;
export const SAY_RIN_END_6 = -1_000_431;
export const SAY_SPR_END_7 = -1_000_432;
export const EMOTE_RIN_END_8 = -1_000_433;

/** Cite: ungoro_crater.cpp:151 SPELL_REVIVE_RINGO = 15591 */
export const SPELL_REVIVE_RINGO = 15591;
/** Cite: ungoro_crater.cpp:152 QUEST_A_LITTLE_HELP = 4491 */
export const QUEST_A_LITTLE_HELP = 4491;
/** Cite: ungoro_crater.cpp:153 NPC_SPRAGGLE = 9997 */
export const NPC_SPRAGGLE = 9997;

/** DB binding. Cite: scriptdev-corpus.json entry 9999 Ringo */
export const NPC_RINGO = 9999;

/** Faint timer Reset arm. Cite: ungoro_crater.cpp:172 m_uiFaintTimer = urand(30000, 60000) */
export const RINGO_FAINT_INIT_MIN_MS = 30_000;
export const RINGO_FAINT_INIT_MAX_MS = 60_000;

// Faint re-arm after SetFaint while FOLLOW_INPROGRESS. Cite: ungoro_crater.cpp:308 m_uiFaintTimer =
// urand(60000, 120000)
export const RINGO_FAINT_REPEAT_MIN_MS = 60_000;
export const RINGO_FAINT_REPEAT_MAX_MS = 120_000;

/** End-event initial timer. Cite: ungoro_crater.cpp:174 m_uiEndEventTimer = 1000 */
export const RINGO_END_EVENT_INIT_MS = 1000;

// End-event step delays after each progress case, before the counter increments. The counter starts
// at 0, so the first tick after SetFollowComplete runs case 1. Cite: ungoro_crater.cpp:257–293.
export const RINGO_END_EVENT_STEP_DELAYS_MS = {
  1: 3000, // cpp:259 after SAY_RIN_END_1
  2: 5000, // cpp:263 after SAY_SPR_END_2
  3: 1000, // cpp:267 after SAY_RIN_END_3
  4: 9000, // cpp:272 after EMOTE_RIN_END_4 + SetFaint
  5: 1000, // cpp:277 after EMOTE_RIN_END_5 + ClearFaint
  6: 3000, // cpp:281 after SAY_RIN_END_6
  7: 10_000, // cpp:285 after SAY_SPR_END_7
  8: 5000, // cpp:289 after EMOTE_RIN_END_8
  9: 0, // cpp:292 SetFollowComplete — no further timer
} as const;

// Constants — Simone / Precious / Stave of the Ancients

// ungoro_crater.cpp:343–357
/** Cite: ungoro_crater.cpp:343 SPELL_FOOLS_PLIGHT = 23504 */
export const SPELL_FOOLS_PLIGHT = 23504;
/** Cite: ungoro_crater.cpp:344 SPELL_CHAIN_LIGHTNING = 23206 */
export const SPELL_CHAIN_LIGHTNING = 23206;
/** Cite: ungoro_crater.cpp:345 SPELL_TEMPTRESS_KISS = 23205 */
export const SPELL_TEMPTRESS_KISS = 23205;
/** Cite: ungoro_crater.cpp:346 SPELL_SILENCE = 23207 */
export const SPELL_SILENCE = 23207;

/** Cite: ungoro_crater.cpp:348 EMOTE_SILENCE = -1001250 */
export const EMOTE_SILENCE = -1_001_250;

/** Cite: ungoro_crater.cpp:350 NPC_SIMONE_THE_INCONSPICUOUS = 14527 */
export const NPC_SIMONE_THE_INCONSPICUOUS = 14527;
/** Cite: ungoro_crater.cpp:351 NPC_SIMONE_THE_SEDUCTRESS = 14533 */
export const NPC_SIMONE_THE_SEDUCTRESS = 14533;
/** Cite: ungoro_crater.cpp:352 NPC_PRECIOUS = 14528 */
export const NPC_PRECIOUS = 14528;
/** Cite: ungoro_crater.cpp:353 NPC_PRECIOUS_THE_DEVOURER = 14538 */
export const NPC_PRECIOUS_THE_DEVOURER = 14538;
/** Cite: ungoro_crater.cpp:354 NPC_THE_CLEANER = 14503 */
export const NPC_THE_CLEANER = 14503;

/** Cite: ungoro_crater.cpp:356 QUEST_STAVE_OF_THE_ANCIENTS = 7636 */
export const QUEST_STAVE_OF_THE_ANCIENTS = 7636;

// Viper Sting (Rank 3) — SpellHit gate for Silence reaction. Cite: ungoro_crater.cpp:584 if (pSpell->Id ==
// 14280)
export const SPELL_VIPER_STING_R3 = 14280;

// CLASS_HUNTER — Aggro gate (only hunter may pull demon form). Cite: SharedDefines.h Classes;
// ungoro_crater.cpp:510 getClass() == CLASS_HUNTER
export const CLASS_HUNTER = 3;

// --- Precious the Devourer timers ---

/** Split-check OOC initial / re-arm. Cite: ungoro_crater.cpp:373 Reset=7500; :406 re-arm=2500 */
export const PRECIOUS_SPLIT_CHECK_INIT_MS = 7500;
export const PRECIOUS_SPLIT_CHECK_REPEAT_MS = 2500;

// --- Simone Seductress timers ---

/** Temptress Kiss. Reset urand(3000,6000); CAST_OK re-arm 45000. Cite: ungoro_crater.cpp:457,634-637 */
export const SIMONE_KISS_INIT_MIN_MS = 3000;
export const SIMONE_KISS_INIT_MAX_MS = 6000;
export const SIMONE_KISS_REPEAT_MS = 45_000;

// Chain Lightning. Reset urand(3000,6000); CAST_OK re-arm urand(8000,12000). Cite:
// ungoro_crater.cpp:458,642-645
export const SIMONE_LIGHTNING_INIT_MIN_MS = 3000;
export const SIMONE_LIGHTNING_INIT_MAX_MS = 6000;
export const SIMONE_LIGHTNING_REPEAT_MIN_MS = 8000;
export const SIMONE_LIGHTNING_REPEAT_MAX_MS = 12_000;

/** Threat multi-pull poll. Reset 5000; re-arm 2000. Cite: ungoro_crater.cpp:459,622-624 */
export const SIMONE_THREAT_CHECK_INIT_MS = 5000;
export const SIMONE_THREAT_CHECK_REPEAT_MS = 2000;

/** Split-check OOC. Reset 7500; re-arm 2500. Cite: ungoro_crater.cpp:460,603-605 */
export const SIMONE_SPLIT_CHECK_INIT_MS = 7500;
export const SIMONE_SPLIT_CHECK_REPEAT_MS = 2500;

// OOC despawn arm (ctor, not Reset). Cite: ungoro_crater.cpp:436 m_uiDespawn_Timer = 20 * MINUTE *
// IN_MILLISECONDS
export const SIMONE_DESPAWN_MS = 20 * MINUTE_MS;

// DemonDespawn / JustDied respawn delays on the inconspicuous template. Cite: ungoro_crater.cpp:522-525
// JustDied 2*HOUR; :533-535 DemonDespawn 15*MINUTE
export const SIMONE_RESPAWN_ON_DEATH_MS = 2 * HOUR_MS;
export const SIMONE_RESPAWN_ON_DESPAWN_MS = 15 * MINUTE_MS;

/** Cleaner summon TEMPSPAWN_DEAD_DESPAWN. Cite: ungoro_crater.cpp:540 20 * MINUTE * IN_MILLISECONDS */
export const CLEANER_DESPAWN_MS = 20 * MINUTE_MS;

// --- Simone Inconspicuous timers ---

/** Fool's Plight. Reset/re-arm urand(5000,10000). Cite: ungoro_crater.cpp:682,773-776 */
export const SIMONE_FOOLS_PLIGHT_INIT_MIN_MS = 5000;
export const SIMONE_FOOLS_PLIGHT_INIT_MAX_MS = 10_000;
export const SIMONE_FOOLS_PLIGHT_REPEAT_MIN_MS = 5000;
export const SIMONE_FOOLS_PLIGHT_REPEAT_MAX_MS = 10_000;

// Transform sequence after BeginEvent. Cite: ungoro_crater.cpp:683 m_uiTransform_Timer=10000; :684
// m_uiTransformEmote_Timer=5000
export const SIMONE_TRANSFORM_MS = 10_000;
export const SIMONE_TRANSFORM_EMOTE_MS = 5000;

/** Inconspicuous Reset respawn delay. Cite: ungoro_crater.cpp:676-677 35 * MINUTE */
export const SIMONE_INCONSPICUOUS_RESPAWN_MS = 35 * MINUTE_MS;

// Gossip menu BCT item for Stave challenge. Cite: ungoro_crater.cpp:789 ADD_GOSSIP_ITEM_ID_BCT(0, 9755, …)
export const GOSSIP_BCT_STAVE_CHALLENGE = 9755;

// ScriptDev IR — npc_ame01

// Cite: ungoro_crater.cpp npc_ame01AI Binding: creature 9623 A-Me 01 (in bake). Escort 4245 with waypoint
// SAY + explore credit. No combat cast timers (melee escort). Spells: none.
export const NPC_AME01_SCRIPT: ScriptDevIR = {
  name: 'npc_ame01',
  boundCreatures: [NPC_AME01],
  sourceFile: 'kalimdor/ungoro_crater.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; ctor SetStandState(DEAD)',
        cite: 'ungoro_crater.cpp:55-59',
      },
    ],
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_AME_AGGRO1,
        cite:
          'ungoro_crater.cpp:89-93 non-player aggro urand SAY_AME_AGGRO1/2/3 (ameAggro)',
      },
    ],
  },
  cites: [
    'ungoro_crater.cpp:36-121 npc_ame01',
    'ungoro_crater.cpp:41-48 SAY_*/QUEST constants',
    'ungoro_crater.cpp:55 ctor DEAD stand',
    'ungoro_crater.cpp:61-77 WaypointReached WP1/20/38',
    'ungoro_crater.cpp:79-96 Aggro non-player yells',
    'ungoro_crater.cpp:99-116 QuestAccept 4245 faction A/H PASSIVE + Start',
  ],
};

// ScriptDev IR — npc_ringo

// npc_ringoAI, creature 9999. Follower 4491 with a faint timer, the SpellHit 15591 revive, a
// Spraggle LOS credit and a post-event dialogue. No combat cast timers.
export const NPC_RINGO_SCRIPT: ScriptDevIR = {
  name: 'npc_ringo',
  boundCreatures: [NPC_RINGO],
  sourceFile: 'kalimdor/ungoro_crater.cpp',
  spellIds: [SPELL_REVIVE_RINGO],
  timers: [],
  spellHits: [
    {
      spellId: SPELL_REVIVE_RINGO,
      actions: [
        {
          kind: 'flavor',
          text: 'ClearFaint: STAND + SAY_WAKE + SetFollowPaused(false)',
          cite: 'ungoro_crater.cpp:200-201,223-239',
        },
      ],
      cite:
        'ungoro_crater.cpp:198-202 SpellHit 15591 while FOLLOW_INPROGRESS|PAUSED → ClearFaint (ringoSpellHit)',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `m_uiFaintTimer=urand(${RINGO_FAINT_INIT_MIN_MS},${RINGO_FAINT_INIT_MAX_MS}); endProgress=0; endTimer=${RINGO_END_EVENT_INIT_MS}`,
        cite: 'ungoro_crater.cpp:170-176',
      },
    ],
  },
  cites: [
    'ungoro_crater.cpp:123-339 npc_ringo',
    'ungoro_crater.cpp:129-153 SAY_*/SPELL/QUEST/NPC constants',
    'ungoro_crater.cpp:160 ctor DEAD stand',
    'ungoro_crater.cpp:170-176 Reset faint 30-60s + end event 1000',
    'ungoro_crater.cpp:178-195 Spraggle LOS explore 4491 + postevent',
    'ungoro_crater.cpp:198-202 SpellHit Revive Ringo 15591',
    'ungoro_crater.cpp:204-239 SetFaint/ClearFaint',
    'ungoro_crater.cpp:241-319 UpdateFollowerAI end dialogue + faint + melee',
    'ungoro_crater.cpp:327-338 QuestAccept 4491 StartFollow faction 290',
  ],
};

// ScriptDev IR — npc_precious_the_devourer

// npc_precious_the_devourerAI, creature 14538 — ABSENT from the product bake, so the binding is
// unused. Pet of the Seductress: a combat link, an OOC split-check and an evade despawn.
export const NPC_PRECIOUS_THE_DEVOURER_SCRIPT: ScriptDevIR = {
  name: 'npc_precious_the_devourer',
  boundCreatures: [NPC_PRECIOUS_THE_DEVOURER],
  sourceFile: 'kalimdor/ungoro_crater.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `visibility ON; m_uiSplitCheck_Timer=${PRECIOUS_SPLIT_CHECK_INIT_MS}`,
        cite: 'ungoro_crater.cpp:370-374',
      },
    ],
    onAggro: [
      {
        kind: 'flavor',
        text: 'if Simone alive → Simone.AttackStart(who)',
        cite: 'ungoro_crater.cpp:376-385',
      },
    ],
    onEvade: [
      {
        kind: 'force_despawn',
        delayMs: 0,
        cite:
          'ungoro_crater.cpp:387-398 EnterEvade: if !Simone alive ForcedDespawn (preciousEnterEvade)',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_PRECIOUS_THE_DEVOURER,
      kind: 'creature',
      reason:
        'NPC 14538 Precious the Devourer is DB-bound to npc_precious_the_devourer (Simone pet / transform summon) but absent from product bake - IR + pure helpers (preciousAggro/EnterEvade/splitCheck) ported; product cannot spawn until rebake',
      cite:
        'ungoro_crater.cpp:360-426; scriptdev-corpus bound 14538; loadRealBundle missing 14538',
    },
    {
      entry: NPC_PRECIOUS,
      kind: 'creature',
      reason:
        'NPC 14528 Precious (pre-transform pet of Inconspicuous) is escort residual of the stave event (ungoro_crater.cpp:687-698,732-733) but absent from product bake',
      cite: 'ungoro_crater.cpp:352,687-698,732-733; loadRealBundle missing 14528',
    },
    {
      entry: NPC_THE_CLEANER,
      kind: 'creature',
      reason:
        'NPC 14503 The Cleaner is summoned by DemonDespawn(true) when multi-pull/wrong class (ungoro_crater.cpp:540) but absent from product bake',
      cite: 'ungoro_crater.cpp:354,540; loadRealBundle missing 14503',
    },
  ],
  cites: [
    'ungoro_crater.cpp:360-426 npc_precious_the_devourer',
    'ungoro_crater.cpp:370-374 Reset visibility + split 7500',
    'ungoro_crater.cpp:376-385 Aggro link Simone',
    'ungoro_crater.cpp:387-398 EnterEvade force despawn if Simone dead',
    'ungoro_crater.cpp:400-420 UpdateAI split-check OOC + melee',
  ],
};

// ScriptDev IR — npc_simone_seductress

// npc_simone_seductressAI, creature 14533. Temptress Kiss 23205 and Chain Lightning 23206 on
// sourced timers; a Viper Sting hit silences her, and a multi-threat or non-hunter pull despawns.
export const NPC_SIMONE_SEDUCTRESS_SCRIPT: ScriptDevIR = {
  name: 'npc_simone_seductress',
  boundCreatures: [NPC_SIMONE_THE_SEDUCTRESS],
  sourceFile: 'kalimdor/ungoro_crater.cpp',
  spellIds: [
    SPELL_TEMPTRESS_KISS,
    SPELL_CHAIN_LIGHTNING,
    SPELL_SILENCE,
  ],
  timers: [
    {
      id: 'temptress_kiss',
      spellId: SPELL_TEMPTRESS_KISS,
      // Reset m_uiTemptressKiss_Timer = urand(3000, 6000) (cpp:457)
      initialMinMs: SIMONE_KISS_INIT_MIN_MS,
      initialMaxMs: SIMONE_KISS_INIT_MAX_MS,
      // CAST_OK re-arm 45000 (cpp:637)
      repeatMinMs: SIMONE_KISS_REPEAT_MS,
      repeatMaxMs: SIMONE_KISS_REPEAT_MS,
      target: 'victim',
      cite:
        'ungoro_crater.cpp:457,634-637 Temptress Kiss 23205 init 3000-6000 re-arm 45000 victim',
    },
    {
      id: 'chain_lightning',
      spellId: SPELL_CHAIN_LIGHTNING,
      // Reset m_uiLightingBolt_Timer = urand(3000, 6000) (cpp:458)
      initialMinMs: SIMONE_LIGHTNING_INIT_MIN_MS,
      initialMaxMs: SIMONE_LIGHTNING_INIT_MAX_MS,
      // CAST_OK re-arm urand(8000, 12000) (cpp:645)
      repeatMinMs: SIMONE_LIGHTNING_REPEAT_MIN_MS,
      repeatMaxMs: SIMONE_LIGHTNING_REPEAT_MAX_MS,
      target: 'victim',
      cite:
        'ungoro_crater.cpp:458,642-645 Chain Lightning 23206 init 3000-6000 re-arm 8000-12000 victim',
    },
  ],
  spellHits: [
    {
      spellId: SPELL_VIPER_STING_R3,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_SILENCE,
          castFlags: 1, // CAST_TRIGGERED
          cite: 'ungoro_crater.cpp:586 DoCastSpellIfCan(self, 23207, CAST_TRIGGERED)',
        },
        {
          kind: 'yell',
          textId: EMOTE_SILENCE,
          cite: 'ungoro_crater.cpp:587 DoScriptText(EMOTE_SILENCE)',
        },
      ],
      cite:
        'ungoro_crater.cpp:582-588 SpellHit Viper Sting 14280 → Silence 23207 + EMOTE_SILENCE',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `Kiss/Lightning urand(3-6)s; threat ${SIMONE_THREAT_CHECK_INIT_MS}; split ${SIMONE_SPLIT_CHECK_INIT_MS}; ctor despawn ${SIMONE_DESPAWN_MS}`,
        cite: 'ungoro_crater.cpp:436,451-461',
      },
    ],
    onAggro: [
      {
        kind: 'flavor',
        text: 'link Precious AttackStart; hunter-only else DemonDespawn (simoneSeductressAggro)',
        cite: 'ungoro_crater.cpp:499-516',
      },
    ],
    onDeath: [
      {
        kind: 'flavor',
        text: `inconspicuous template respawn delay ${SIMONE_RESPAWN_ON_DEATH_MS} (2*HOUR)`,
        cite: 'ungoro_crater.cpp:518-527',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_THE_CLEANER,
      kind: 'creature',
      reason:
        'NPC 14503 The Cleaner is DemonDespawn residual (ungoro_crater.cpp:540) absent from bake - documented once on precious IR; seductress owns the summon call',
      cite: 'ungoro_crater.cpp:540; loadRealBundle missing 14503',
    },
  ],
  cites: [
    'ungoro_crater.cpp:428-657 npc_simone_seductress',
    'ungoro_crater.cpp:343-357 SPELL_*/NPC_*/QUEST constants',
    'ungoro_crater.cpp:436 ctor despawn 20min',
    'ungoro_crater.cpp:451-461 Reset Kiss/Lightning/threat/split',
    'ungoro_crater.cpp:463-497 JustReachedHome respawn Devourer',
    'ungoro_crater.cpp:499-516 Aggro hunter gate + Precious link',
    'ungoro_crater.cpp:518-527 JustDied 2h respawn inconspicuous',
    'ungoro_crater.cpp:529-580 DemonDespawn Cleaner + hide',
    'ungoro_crater.cpp:582-588 SpellHit Viper Sting → Silence',
    'ungoro_crater.cpp:591-651 UpdateAI despawn/split/threat/casts/melee',
  ],
};

// ScriptDev IR — npc_simone_the_inconspicuous

// npc_simone_the_inconspicuousAI, creature 14527 — ABSENT from the product bake. Gossip 7636 begins
// the event: a 5 s shout then a 10 s transform summoning 14533 and 14538. Fool's Plight if pulled.
export const NPC_SIMONE_THE_INCONSPICUOUS_SCRIPT: ScriptDevIR = {
  name: 'npc_simone_the_inconspicuous',
  boundCreatures: [NPC_SIMONE_THE_INCONSPICUOUS],
  sourceFile: 'kalimdor/ungoro_crater.cpp',
  spellIds: [SPELL_FOOLS_PLIGHT],
  timers: [
    {
      id: 'fools_plight',
      spellId: SPELL_FOOLS_PLIGHT,
      // Reset m_uiFoolsPlight_Timer = urand(5000, 10000) (cpp:682)
      initialMinMs: SIMONE_FOOLS_PLIGHT_INIT_MIN_MS,
      initialMaxMs: SIMONE_FOOLS_PLIGHT_INIT_MAX_MS,
      // CAST_OK re-arm urand(5000, 10000) (cpp:776)
      repeatMinMs: SIMONE_FOOLS_PLIGHT_REPEAT_MIN_MS,
      repeatMaxMs: SIMONE_FOOLS_PLIGHT_REPEAT_MAX_MS,
      target: 'victim',
      cite:
        'ungoro_crater.cpp:682,773-776 Fool\'s Plight 23504 init/re-arm 5000-10000 victim',
    },
  ],
  gossipHello: {
    defaultTextId: 0,
    cite:
      'ungoro_crater.cpp:785-792 GossipHello: BCT 9755 when 7636 incomplete or GM (simoneGossipHello)',
  },
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `respawn ${SIMONE_INCONSPICUOUS_RESPAWN_MS}; gossip ON; FoolsPlight urand(5-10)s; transform 10s/emote 5s; m_bTransform=false; ensure Precious 14528 follow`,
        cite: 'ungoro_crater.cpp:674-698',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_SIMONE_THE_INCONSPICUOUS,
      kind: 'creature',
      reason:
        'NPC 14527 Simone the Inconspicuous is DB-bound to npc_simone_the_inconspicuous (Stave of the Ancients 7636 gossip/transform) but absent from product bake - IR + pure helpers (simoneBeginEvent/TransformTick/Transform) ported; product cannot spawn until rebake. Combat residual 14533 is in bake and fight-tested.',
      cite:
        'ungoro_crater.cpp:659-806; scriptdev-corpus bound 14527; loadRealBundle missing 14527',
    },
  ],
  cites: [
    'ungoro_crater.cpp:659-806 npc_simone_the_inconspicuous',
    'ungoro_crater.cpp:674-698 Reset respawn 35min + FoolsPlight + transform arms + Precious follow',
    'ungoro_crater.cpp:701-736 Transform summon 14533+14538',
    'ungoro_crater.cpp:738-744 BeginEvent',
    'ungoro_crater.cpp:746-782 UpdateAI transform + FoolsPlight + melee',
    'ungoro_crater.cpp:785-801 GossipHello/Select 7636 → BeginEvent + LAUGH',
  ],
};

