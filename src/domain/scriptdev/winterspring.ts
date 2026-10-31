// Winterspring ScriptDev IR ports. Source: scripts/kalimdor/winterspring.cpp — npc_ranshalla,
// go_elune_fire and npc_artorius. The cinematic summons and both GOs are absent from bake.

import type { ScriptDevIR } from './types.ts';


// Shared time / faction / class / emote constants

/** Time units. Cite: Common.h MINUTE=60 HOUR=3600 IN_MILLISECONDS=1000 */
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;

/** FACTION_ESCORT_A_NEUTRAL_PASSIVE. Cite: ScriptDevAIMgr.h:44 = 10; winterspring.cpp:460 */
export const FACTION_ESCORT_A_NEUTRAL_PASSIVE = 10;

/** TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h:577 = 0x01; winterspring.cpp:460 */
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;

// CLASS_HUNTER — Aggro gate (only hunter may pull Doombringer). Cite: SharedDefines.h:69 = 3;
// winterspring.cpp:584
export const CLASS_HUNTER = 3;

/** EMOTE_ONESHOT_ROAR — transform emote at 5s. Cite: SharedDefines.h:762 = 15; winterspring.cpp:645 */
export const EMOTE_ONESHOT_ROAR = 15;

/** UNIT_STAND_STATE_KNEEL — quest end kneel. Cite: Unit.h; winterspring.cpp:402 */
export const UNIT_STAND_STATE_KNEEL = 8;

// INTERACTION-style GO search radius for Ranshalla / fire. Cite: winterspring.cpp:202,211,479 GetClosest*
// 10.0f
export const RANSHALLA_GO_SEARCH_YD = 10;

// Constants — npc_ranshalla / go_elune_fire

// winterspring.cpp:40–97
/** Cite: winterspring.cpp:40 SAY_QUEST_START = -1000739 */
export const SAY_QUEST_START = -1_000_739;
/** Cite: winterspring.cpp:41 SAY_ENTER_OWL_THICKET = -1000707 */
export const SAY_ENTER_OWL_THICKET = -1_000_707;
/** Cite: winterspring.cpp:42 SAY_REACH_TORCH_1 = -1000708 */
export const SAY_REACH_TORCH_1 = -1_000_708;
/** Cite: winterspring.cpp:43 SAY_REACH_TORCH_2 = -1000709 */
export const SAY_REACH_TORCH_2 = -1_000_709;
/** Cite: winterspring.cpp:44 SAY_REACH_TORCH_3 = -1000710 */
export const SAY_REACH_TORCH_3 = -1_000_710;
/** Cite: winterspring.cpp:45 SAY_AFTER_TORCH_1 = -1000711 */
export const SAY_AFTER_TORCH_1 = -1_000_711;
/** Cite: winterspring.cpp:46 SAY_AFTER_TORCH_2 = -1000712 */
export const SAY_AFTER_TORCH_2 = -1_000_712;
/** Cite: winterspring.cpp:47 SAY_REACH_ALTAR_1 = -1000713 */
export const SAY_REACH_ALTAR_1 = -1_000_713;
/** Cite: winterspring.cpp:48 SAY_REACH_ALTAR_2 = -1000714 */
export const SAY_REACH_ALTAR_2 = -1_000_714;

/** Cite: winterspring.cpp:51 SAY_RANSHALLA_ALTAR_1 = -1000715 */
export const SAY_RANSHALLA_ALTAR_1 = -1_000_715;
/** Cite: winterspring.cpp:52 SAY_RANSHALLA_ALTAR_2 = -1000716 */
export const SAY_RANSHALLA_ALTAR_2 = -1_000_716;
/** Cite: winterspring.cpp:53 SAY_RANSHALLA_ALTAR_5 = -1000719 */
export const SAY_RANSHALLA_ALTAR_5 = -1_000_719;
/** Cite: winterspring.cpp:54 SAY_RANSHALLA_ALTAR_6 = -1000720 */
export const SAY_RANSHALLA_ALTAR_6 = -1_000_720;
/** Cite: winterspring.cpp:72 SAY_QUEST_END_1 = -1000736 */
export const SAY_QUEST_END_1 = -1_000_736;
/** Cite: winterspring.cpp:73 SAY_QUEST_END_2 = -1000737 */
export const SAY_QUEST_END_2 = -1_000_737;
/** Cite: winterspring.cpp:75 EMOTE_CHANT_SPELL = -1000738 */
export const EMOTE_CHANT_SPELL = -1_000_738;

/** Cite: winterspring.cpp:77 SPELL_LIGHT_TORCH = 18953 */
export const SPELL_LIGHT_TORCH = 18_953;
/** Cite: winterspring.cpp:78 SPELL_RANSHALLA_DESPAWN = 18954 */
export const SPELL_RANSHALLA_DESPAWN = 18_954;
/** Cite: winterspring.cpp:79 SPELL_BIND_WILDKIN = 18994 */
export const SPELL_BIND_WILDKIN = 18_994;

/** Cite: winterspring.cpp:81 NPC_RANSHALLA = 10300 */
export const NPC_RANSHALLA = 10_300;
/** Cite: winterspring.cpp:82 NPC_PRIESTESS_ELUNE = 12116 */
export const NPC_PRIESTESS_ELUNE = 12_116;
/** Cite: winterspring.cpp:83 NPC_VOICE_ELUNE = 12152 */
export const NPC_VOICE_ELUNE = 12_152;
/** Cite: winterspring.cpp:84 NPC_GUARDIAN_ELUNE = 12140 */
export const NPC_GUARDIAN_ELUNE = 12_140;

/** Cite: winterspring.cpp:91 GO_ELUNE_ALTAR = 177404 */
export const GO_ELUNE_ALTAR = 177_404;
/** Cite: winterspring.cpp:92 GO_ELUNE_FIRE = 177417 */
export const GO_ELUNE_FIRE = 177_417;
/** Cite: winterspring.cpp:93 GO_ELUNE_GEM = 177414 */
export const GO_ELUNE_GEM = 177_414;
/** Cite: winterspring.cpp:94 GO_ELUNE_LIGHT = 177415 */
export const GO_ELUNE_LIGHT = 177_415;
/** Cite: winterspring.cpp:95 GO_ELUNE_AURA = 177416 */
export const GO_ELUNE_AURA = 177_416;

/** Cite: winterspring.cpp:97 QUEST_GUARDIANS_ALTAR = 4901 */
export const QUEST_GUARDIANS_ALTAR = 4901;

/** After-torch / altar continue delay before unpause. Cite: winterspring.cpp:183 m_uiDelayTimer = 2000 */
export const RANSHALLA_CONTINUE_DELAY_MS = 2000;

// Quest-end ForcedDespawn after kneel + explore credit. Cite: winterspring.cpp:405 ForcedDespawn(1 * MINUTE
// * IN_MILLISECONDS)
export const RANSHALLA_COMPLETE_DESPAWN_MS = 1 * MINUTE_MS;

/** Voice of Elune TEMPSPAWN_TIMED_DESPAWN. Cite: winterspring.cpp:351 TEMPSPAWN_TIMED_DESPAWN, 30000 */
export const VOICE_ELUNE_DESPAWN_MS = 30_000;

// Torch waypoint ids that channel SPELL_LIGHT_TORCH. Cite: winterspring.cpp:260-266 cases 10,15,20,25,36
export const RANSHALLA_TORCH_WAYPOINTS = [10, 15, 20, 25, 36] as const;

// Altar cinematic dialogue (aIntroDialogue) — entry, speaker and delay ms. Speakers 1 and 2 are
// dummy priestess data slots. Cite: winterspring.cpp:100–132.
export const RANSHALLA_ALTAR_DIALOGUE = [
  { entry: SAY_REACH_ALTAR_1, speaker: NPC_RANSHALLA, delayMs: 2000, cite: 'winterspring.cpp:102' },
  { entry: SAY_REACH_ALTAR_2, speaker: NPC_RANSHALLA, delayMs: 3000, cite: 'winterspring.cpp:103' },
  { entry: NPC_RANSHALLA, speaker: 0, delayMs: 0, cite: 'winterspring.cpp:104 (start altar channel)' },
  { entry: -1_000_717, speaker: 2, delayMs: 1000, cite: 'winterspring.cpp:105 SAY_PRIESTESS_ALTAR_3' },
  { entry: -1_000_718, speaker: 1, delayMs: 4000, cite: 'winterspring.cpp:106 SAY_PRIESTESS_ALTAR_4' },
  { entry: SAY_RANSHALLA_ALTAR_5, speaker: NPC_RANSHALLA, delayMs: 4000, cite: 'winterspring.cpp:107' },
  { entry: SAY_RANSHALLA_ALTAR_6, speaker: NPC_RANSHALLA, delayMs: 4000, cite: 'winterspring.cpp:108 (resume escort)' },
  { entry: -1_000_721, speaker: 2, delayMs: 4000, cite: 'winterspring.cpp:109 SAY_PRIESTESS_ALTAR_7' },
  { entry: -1_000_722, speaker: 2, delayMs: 5000, cite: 'winterspring.cpp:110 SAY_PRIESTESS_ALTAR_8 (gem)' },
  { entry: GO_ELUNE_GEM, speaker: 0, delayMs: 5000, cite: 'winterspring.cpp:111' },
  { entry: -1_000_723, speaker: 1, delayMs: 4000, cite: 'winterspring.cpp:112 SAY_PRIESTESS_ALTAR_9' },
  { entry: 1, speaker: 0, delayMs: 3000, cite: 'winterspring.cpp:113 NPC_PRIESTESS_DATA_1 move' },
  { entry: -1_000_724, speaker: 1, delayMs: 5000, cite: 'winterspring.cpp:114 SAY_PRIESTESS_ALTAR_10' },
  { entry: -1_000_725, speaker: 1, delayMs: 4000, cite: 'winterspring.cpp:115 SAY_PRIESTESS_ALTAR_11' },
  { entry: -1_000_726, speaker: 1, delayMs: 5000, cite: 'winterspring.cpp:116 SAY_PRIESTESS_ALTAR_12' },
  { entry: -1_000_727, speaker: 1, delayMs: 8000, cite: 'winterspring.cpp:117 SAY_PRIESTESS_ALTAR_13 (summon voice+guard)' },
  { entry: NPC_VOICE_ELUNE, speaker: 0, delayMs: 12_000, cite: 'winterspring.cpp:118' },
  { entry: -1_000_729, speaker: NPC_VOICE_ELUNE, delayMs: 5000, cite: 'winterspring.cpp:119 SAY_VOICE_ALTAR_15' },
  { entry: 2, speaker: 0, delayMs: 3000, cite: 'winterspring.cpp:120 NPC_PRIESTESS_DATA_2 move' },
  { entry: -1_000_730, speaker: 2, delayMs: 4000, cite: 'winterspring.cpp:121 SAY_PRIESTESS_ALTAR_16' },
  { entry: -1_000_731, speaker: 2, delayMs: 6000, cite: 'winterspring.cpp:122 SAY_PRIESTESS_ALTAR_17' },
  { entry: -1_000_732, speaker: 1, delayMs: 5000, cite: 'winterspring.cpp:123 SAY_PRIESTESS_ALTAR_18' },
  { entry: -1_000_733, speaker: 1, delayMs: 3000, cite: 'winterspring.cpp:124 SAY_PRIESTESS_ALTAR_19 (owlbeast leave)' },
  { entry: NPC_GUARDIAN_ELUNE, speaker: 0, delayMs: 2000, cite: 'winterspring.cpp:125' },
  { entry: -1_000_734, speaker: 1, delayMs: 4000, cite: 'winterspring.cpp:126 SAY_PRIESTESS_ALTAR_20' },
  { entry: -1_000_735, speaker: 2, delayMs: 10_000, cite: 'winterspring.cpp:127 SAY_PRIESTESS_ALTAR_21' },
  { entry: 3, speaker: 0, delayMs: 6000, cite: 'winterspring.cpp:128 DATA_MOVE_PRIESTESS' },
  { entry: 4, speaker: 0, delayMs: 2000, cite: 'winterspring.cpp:129 DATA_EVENT_END' },
  { entry: SAY_QUEST_END_2, speaker: NPC_RANSHALLA, delayMs: 0, cite: 'winterspring.cpp:130' },
] as const;

// Constants — npc_artorius

// winterspring.cpp:488–503 SPELL_FOOLS_PLIGHT — enum only; never cast by artorius AI. Cite:
// winterspring.cpp:490 (no UpdateAI / Reset cast site)
export const SPELL_FOOLS_PLIGHT = 23_504;

/** Cite: winterspring.cpp:492 SPELL_DEMONIC_FRENZY = 23257 */
export const SPELL_DEMONIC_FRENZY = 23_257;
/** Cite: winterspring.cpp:493 SPELL_DEMONIC_DOOM = 23298 */
export const SPELL_DEMONIC_DOOM = 23_298;
/** Cite: winterspring.cpp:494 SPELL_STINGING_TRAUMA = 23299 */
export const SPELL_STINGING_TRAUMA = 23_299;

/** Cite: winterspring.cpp:496 EMOTE_POISON = -1001251 */
export const EMOTE_POISON = -1_001_251;

/** Cite: winterspring.cpp:498 NPC_ARTORIUS_THE_AMIABLE = 14531 */
export const NPC_ARTORIUS_THE_AMIABLE = 14_531;
/** Cite: winterspring.cpp:499 NPC_ARTORIUS_THE_DOOMBRINGER = 14535 */
export const NPC_ARTORIUS_THE_DOOMBRINGER = 14_535;
/** Cite: winterspring.cpp:500 NPC_THE_CLEANER = 14503 */
export const NPC_THE_CLEANER = 14_503;

/** Cite: winterspring.cpp:502 QUEST_STAVE_OF_THE_ANCIENTS = 7636 */
export const QUEST_STAVE_OF_THE_ANCIENTS = 7636;

// Serpent Sting ranks that trigger Stinging Trauma. Cite: winterspring.cpp:629 pSpell->Id == 13555 || 25295
export const SPELL_SERPENT_STING_R8 = 13_555;
export const SPELL_SERPENT_STING_R9 = 25_295;

/** Demonic Doom cast range gate (yards). Cite: winterspring.cpp:692 IsWithinDistInMap(victim, 25) */
export const ARTORIUS_DOOM_RANGE_YD = 25;

// Transform sequence after BeginEvent. Cite: winterspring.cpp:549 m_uiTransform_Timer=10000; :550
// m_uiTransformEmote_Timer=5000
export const ARTORIUS_TRANSFORM_MS = 10_000;
export const ARTORIUS_TRANSFORM_EMOTE_MS = 5000;

/** Amiable Reset respawn delay. Cite: winterspring.cpp:538-539 35 * MINUTE */
export const ARTORIUS_AMIABLE_RESPAWN_MS = 35 * MINUTE_MS;

// Amiable home teleport after reset. Cite: winterspring.cpp:540 NearTeleportTo(7909.71f, -4598.67f,
// 710.008f, 0.606013f)
export const ARTORIUS_HOME = {
  x: 7909.71,
  y: -4598.67,
  z: 710.008,
  o: 0.606_013,
} as const;

// Demonic Frenzy. Reset urand(5000,8000); CAST_OK re-arm urand(15000,20000). Cite:
// winterspring.cpp:560,679-682
export const ARTORIUS_FRENZY_INIT_MIN_MS = 5000;
export const ARTORIUS_FRENZY_INIT_MAX_MS = 8000;
export const ARTORIUS_FRENZY_REPEAT_MIN_MS = 15_000;
export const ARTORIUS_FRENZY_REPEAT_MAX_MS = 20_000;

// Demonic Doom. Reset 7500; timer always re-arms 7500 (cast if ≤25yd). Cite: winterspring.cpp:559,687-694
export const ARTORIUS_DOOM_INIT_MS = 7500;
export const ARTORIUS_DOOM_REPEAT_MS = 7500;

// OOC despawn arm on Doombringer (Reset when !m_uiDespawn_Timer). Cite: winterspring.cpp:555-556 20 *
// MINUTE * IN_MILLISECONDS
export const ARTORIUS_DESPAWN_MS = 20 * MINUTE_MS;

// DemonDespawn / JustDied respawn delays. Cite: winterspring.cpp:594-596 JustDied 2*HOUR; :602-603
// DemonDespawn 15*MINUTE
export const ARTORIUS_RESPAWN_ON_DEATH_MS = 2 * HOUR_MS;
export const ARTORIUS_RESPAWN_ON_DESPAWN_MS = 15 * MINUTE_MS;

/** Cleaner summon TEMPSPAWN_DEAD_DESPAWN. Cite: winterspring.cpp:609 20 * MINUTE * IN_MILLISECONDS */
export const CLEANER_DESPAWN_MS = 20 * MINUTE_MS;

// ScriptDev IR — npc_ranshalla

// npc_ranshallaAI, creature 10300. Escort 4901 with the 18953 torch channel and the altar
// cinematic residual. No combat cast timers; SpellHit 18954 is the fail path.
export const NPC_RANSHALLA_SCRIPT: ScriptDevIR = {
  name: 'npc_ranshalla',
  boundCreatures: [NPC_RANSHALLA],
  sourceFile: 'kalimdor/winterspring.cpp',
  spellIds: [SPELL_LIGHT_TORCH, SPELL_RANSHALLA_DESPAWN, SPELL_BIND_WILDKIN],
  timers: [],
  spellHits: [
    {
      spellId: SPELL_RANSHALLA_DESPAWN,
      actions: [
        {
          kind: 'flavor',
          text: 'FailQuestForPlayerAndGroup + ForcedDespawn (ranshallaSpellHitDespawn)',
          cite: 'winterspring.cpp:189-193',
        },
        {
          kind: 'force_despawn',
          delayMs: 0,
          cite: 'winterspring.cpp:192 m_creature->ForcedDespawn()',
        },
      ],
      cite:
        'winterspring.cpp:186-194 SpellHit SPELL_RANSHALLA_DESPAWN 18954 → fail quest + despawn',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_uiDelayTimer=0; m_uiCurrentWaypoint=0',
        cite: 'winterspring.cpp:163-167',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_PRIESTESS_ELUNE,
      kind: 'creature',
      reason:
        'NPC 12116 Priestess of Elune is altar-cinematic summon (winterspring.cpp:231-241) but absent from product bake - IR dialogue residual ported; product cannot spawn until rebake',
      cite: 'winterspring.cpp:82,231-241; loadRealBundle missing 12116',
    },
    {
      entry: NPC_VOICE_ELUNE,
      kind: 'creature',
      reason:
        'NPC 12152 Voice of Elune is altar-cinematic summon (winterspring.cpp:351) but absent from product bake',
      cite: 'winterspring.cpp:83,351; loadRealBundle missing 12152',
    },
    {
      entry: NPC_GUARDIAN_ELUNE,
      kind: 'creature',
      reason:
        'NPC 12140 Guardian of Elune is altar-cinematic summon (winterspring.cpp:343) + Bind Wildkin 18994 caster but absent from product bake',
      cite: 'winterspring.cpp:84,343-364; loadRealBundle missing 12140',
    },
  ],
  cites: [
    'winterspring.cpp:146-448 npc_ranshalla',
    'winterspring.cpp:40-97 SAY_*/SPELL_*/NPC_*/GO_*/QUEST constants',
    'winterspring.cpp:100-132 aIntroDialogue altar cinematic',
    'winterspring.cpp:163-167 Reset delay+waypoint',
    'winterspring.cpp:170-184 DoContinueEscort after torch/altar',
    'winterspring.cpp:186-194 SpellHit 18954 fail+despawn',
    'winterspring.cpp:197-226 DoChannelTorchSpell LIGHT_TORCH 18953',
    'winterspring.cpp:228-242 DoSummonPriestess',
    'winterspring.cpp:253-304 WaypointReached torch/altar/lights',
    'winterspring.cpp:306-408 JustDidDialogueStep altar end → explore 4901',
    'winterspring.cpp:455-469 QuestAccept 4901 faction 10 escort',
  ],
};

// ScriptDev IR — go_elune_fire

// GOUse_go_elune_fire on GO 177417 and 177404. Both are in gameobject-data but absent from
// tables/gameObjects, so the product spawn is an unused binding. pGOUse only, no combat.
export const GO_ELUNE_FIRE_SCRIPT: ScriptDevIR = {
  name: 'go_elune_fire',
  boundCreatures: [],
  boundGos: [GO_ELUNE_FIRE, GO_ELUNE_ALTAR],
  sourceFile: 'kalimdor/winterspring.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_ELUNE_FIRE, GO_ELUNE_ALTAR],
    actions: [
      {
        kind: 'flavor',
        text: 'GetClosest Ranshalla ≤10yd → DoContinueEscort(isAltar=entry==177404) (eluneFireUsed)',
        cite: 'winterspring.cpp:471-486',
      },
    ],
    cite: 'winterspring.cpp:471-486 GOUse_go_elune_fire',
  },
  unusedBindings: [
    {
      entry: GO_ELUNE_FIRE,
      kind: 'go',
      reason:
        'GO 177417 Fire of Elune is in gameobject-data.json but absent from tables/gameObjects.json product GO list - IR ported; pGOUse → Ranshalla DoContinueEscort(false)',
      cite: 'winterspring.cpp:92,471-486; loadRealBundle gameObjects missing 177417',
    },
    {
      entry: GO_ELUNE_ALTAR,
      kind: 'go',
      reason:
        'GO 177404 Altar of Elune is in gameobject-data.json but absent from tables/gameObjects.json product GO list - IR ported; pGOUse → Ranshalla DoContinueEscort(true)',
      cite: 'winterspring.cpp:91,471-486; loadRealBundle gameObjects missing 177404',
    },
  ],
  cites: [
    'winterspring.cpp:471-486 GOUse_go_elune_fire',
    'winterspring.cpp:91-92 GO_ELUNE_ALTAR/FIRE',
    'winterspring.cpp:731-734 RegisterSelf pGOUse',
  ],
};

// ScriptDev IR — npc_artorius

// npc_artoriusAI — 14531 Amiable is absent from bake, 14535 Doombringer is in it, and one script
// covers both via an UpdateEntry morph. Doombringer runs Demonic Frenzy and Demonic Doom.
export const NPC_ARTORIUS_SCRIPT: ScriptDevIR = {
  name: 'npc_artorius',
  boundCreatures: [NPC_ARTORIUS_THE_AMIABLE, NPC_ARTORIUS_THE_DOOMBRINGER],
  sourceFile: 'kalimdor/winterspring.cpp',
  spellIds: [
    SPELL_DEMONIC_FRENZY,
    SPELL_DEMONIC_DOOM,
    SPELL_STINGING_TRAUMA,
    // Enum residue only — not scheduled (see whole-mechanic map).
    SPELL_FOOLS_PLIGHT,
  ],
  timers: [
    {
      id: 'demonic_frenzy',
      spellId: SPELL_DEMONIC_FRENZY,
      // Reset m_uiDemonic_Frenzy_Timer = urand(5000, 8000) (cpp:560)
      initialMinMs: ARTORIUS_FRENZY_INIT_MIN_MS,
      initialMaxMs: ARTORIUS_FRENZY_INIT_MAX_MS,
      // CAST_OK re-arm urand(15000, 20000) (cpp:681-682)
      repeatMinMs: ARTORIUS_FRENZY_REPEAT_MIN_MS,
      repeatMaxMs: ARTORIUS_FRENZY_REPEAT_MAX_MS,
      target: 'self',
      creatureEntry: NPC_ARTORIUS_THE_DOOMBRINGER,
      cite:
        'winterspring.cpp:560,679-682 Demonic Frenzy 23257 init 5000-8000 re-arm 15000-20000 self',
    },
    {
      id: 'demonic_doom',
      spellId: SPELL_DEMONIC_DOOM,
      // Reset m_uiDemonic_Doom_Timer = 7500 (cpp:559)
      initialMinMs: ARTORIUS_DOOM_INIT_MS,
      initialMaxMs: ARTORIUS_DOOM_INIT_MS,
      // Timer always re-arms 7500; cast if victim ≤25yd (cpp:687-694)
      repeatMinMs: ARTORIUS_DOOM_REPEAT_MS,
      repeatMaxMs: ARTORIUS_DOOM_REPEAT_MS,
      target: 'victim',
      creatureEntry: NPC_ARTORIUS_THE_DOOMBRINGER,
      cite:
        'winterspring.cpp:559,687-694 Demonic Doom 23298 init/re-arm 7500 victim (≤25yd gate)',
    },
  ],
  spellHits: [
    {
      spellId: SPELL_SERPENT_STING_R8,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_STINGING_TRAUMA,
          castFlags: 1, // CAST_TRIGGERED
          cite: 'winterspring.cpp:631 DoCastSpellIfCan(self, 23299, CAST_TRIGGERED)',
        },
        {
          kind: 'yell',
          textId: EMOTE_POISON,
          cite: 'winterspring.cpp:632 DoScriptText(EMOTE_POISON)',
        },
      ],
      cite:
        'winterspring.cpp:627-634 SpellHit Serpent Sting R8 13555 → Stinging Trauma 23299 + EMOTE_POISON',
    },
    {
      spellId: SPELL_SERPENT_STING_R9,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_STINGING_TRAUMA,
          castFlags: 1,
          cite: 'winterspring.cpp:631 DoCastSpellIfCan(self, 23299, CAST_TRIGGERED)',
        },
        {
          kind: 'yell',
          textId: EMOTE_POISON,
          cite: 'winterspring.cpp:632 DoScriptText(EMOTE_POISON)',
        },
      ],
      cite:
        'winterspring.cpp:627-634 SpellHit Serpent Sting R9 25295 → Stinging Trauma 23299 + EMOTE_POISON',
    },
  ],
  gossipHello: {
    defaultTextId: 0,
    cite:
      'winterspring.cpp:702-708 GossipHello: challenge item when 7636 incomplete (artoriusGossipHello)',
  },
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `Amiable: respawn ${ARTORIUS_AMIABLE_RESPAWN_MS}; home teleport; gossip ON; transform 10s/emote 5s. Doombringer: despawn arm ${ARTORIUS_DESPAWN_MS}; Frenzy urand(5-8)s; Doom 7.5s`,
        cite: 'winterspring.cpp:533-562',
      },
    ],
    onAggro: [
      {
        kind: 'flavor',
        text: 'hunter-only else DemonDespawn (artoriusAggro)',
        cite: 'winterspring.cpp:582-590',
      },
    ],
    onDeath: [
      {
        kind: 'flavor',
        text: `respawn delay ${ARTORIUS_RESPAWN_ON_DEATH_MS} (2*HOUR)`,
        cite: 'winterspring.cpp:592-598',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_ARTORIUS_THE_AMIABLE,
      kind: 'creature',
      reason:
        'NPC 14531 Artorius the Amiable is DB-bound to npc_artorius (Stave 7636 gossip/transform) but absent from product bake - IR + pure helpers (artoriusBeginEvent/TransformTick/Transform) ported; product cannot spawn until rebake. Combat residual 14535 is in bake and fight-tested.',
      cite:
        'winterspring.cpp:515-716; scriptdev-corpus bound 14531; loadRealBundle missing 14531',
    },
    {
      entry: NPC_THE_CLEANER,
      kind: 'creature',
      reason:
        'NPC 14503 The Cleaner is DemonDespawn residual (winterspring.cpp:609) absent from product bake',
      cite: 'winterspring.cpp:500,609; loadRealBundle missing 14503',
    },
  ],
  cites: [
    'winterspring.cpp:515-721 npc_artorius',
    'winterspring.cpp:488-503 SPELL_*/NPC_*/QUEST constants',
    'winterspring.cpp:533-562 Reset Amiable/Doombringer arms',
    'winterspring.cpp:566-570 Transform UpdateEntry 14535',
    'winterspring.cpp:572-579 BeginEvent',
    'winterspring.cpp:582-590 Aggro hunter gate',
    'winterspring.cpp:592-598 JustDied 2h respawn',
    'winterspring.cpp:600-625 DemonDespawn Cleaner + ForcedDespawn',
    'winterspring.cpp:627-634 SpellHit Serpent Sting → Stinging Trauma',
    'winterspring.cpp:636-699 UpdateAI transform + despawn + Frenzy/Doom + multi-threat',
    'winterspring.cpp:702-716 GossipHello/Select 7636 → BeginEvent',
  ],
};
