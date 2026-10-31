// Thousand Needles ScriptDev IR ports. Source: scripts/kalimdor/thousand_needles.cpp — Kanati,
// Lakota Windsong, Paoka Swiftmountain and Plucky Johnson. All melee escorts, no cast timers.

import type { ScriptDevIR } from './types.ts';

// Shared factions / tempfaction / emotes

/** FACTION_KANATI_ESCORT. Cite: thousand_needles.cpp:47 = 232 */
export const FACTION_KANATI_ESCORT = 232;

// FACTION_ESCORT_H_NEUTRAL_ACTIVE (Lakota / Pao'ka). Cite: ScriptDevAIMgr.h:49 = 232;
// thousand_needles.cpp:192,268
export const FACTION_ESCORT_H_NEUTRAL_ACTIVE = 232;

/** FACTION_FRIENDLY (Plucky after beckon/chicken). Cite: thousand_needles.cpp:282 = 35 */
export const FACTION_FRIENDLY = 35;

/** TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h:577 = 0x01 */
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** TEMPFACTION_RESTORE_COMBAT_STOP. Cite: Creature.h:578 = 0x02 */
export const TEMPFACTION_RESTORE_COMBAT_STOP = 0x02;

/** TEXTEMOTE_BECKON. Cite: SharedDefines.h:579 = 7; thousand_needles.cpp:313 */
export const TEXTEMOTE_BECKON = 7;

/** TEXTEMOTE_CHICKEN. Cite: SharedDefines.h:594 = 22; thousand_needles.cpp:321 */
export const TEXTEMOTE_CHICKEN = 22;

/** EMOTE_ONESHOT_WAVE (Plucky CHICKEN path). Cite: SharedDefines.h:752 = 3; thousand_needles.cpp:328 */
export const EMOTE_ONESHOT_WAVE = 3;

/** GOSSIP_ACTION_INFO_DEF. Cite: sc_gossip.h:112 = 1000; thousand_needles.cpp:363,371 */
export const GOSSIP_ACTION_INFO_DEF = 1000;

// Constants — npc_kanati

// thousand_needles.cpp:42–49
/** Cite: thousand_needles.cpp:42 SAY_KAN_START = 6149 (broadcast_text) */
export const SAY_KAN_START = 6149;
/** Cite: thousand_needles.cpp:44 QUEST_PROTECT_KANATI = 4966 */
export const QUEST_PROTECT_KANATI = 4966;
/** Cite: thousand_needles.cpp:45 NPC_GALAK_ASS = 10720 */
export const NPC_GALAK_ASS = 10720;
/** Cite: thousand_needles.cpp:49 PATH_ID_KANATI = 10638 */
export const PATH_ID_KANATI = 10638;

/** Bound creature. Cite: scriptdev-corpus entry 10638 */
export const NPC_KANATI = 10638;

/** Galak Assassin spawn point (3 summons, same xyz). Cite: thousand_needles.cpp:52 m_afGalakLoc */
export const GALAK_SPAWN_LOC = {
  x: -4867.387695,
  y: -1357.35376,
  z: -48.226,
  cite: 'thousand_needles.cpp:52',
} as const;

/** TEMPSPAWN_TIMED_OOC_DESPAWN for Galak. Cite: thousand_needles.cpp:82 25000 */
export const GALAK_DESPAWN_MS = 25_000;

/** Kanati escort waypoints with scripted actions. Cite: thousand_needles.cpp:60-77 */
export const KANATI_WAYPOINTS = [
  {
    pointId: 1,
    textId: SAY_KAN_START,
    spawnGalak: true,
    questCredit: false,
    cite: 'thousand_needles.cpp:64-68 WP1 clear immune + SAY + DoSpawnGalak×3',
  },
  {
    pointId: 2,
    textId: null as number | null,
    spawnGalak: false,
    questCredit: true,
    cite: 'thousand_needles.cpp:69-75 WP2 set immune + explore 4966 + RestoreOriginalFaction',
  },
] as const;

// Constants — npc_lakota_windsong

// thousand_needles.cpp:110–122
/** Cite: thousand_needles.cpp:110 SAY_LAKO_START = -1000365 */
export const SAY_LAKO_START = -1_000_365;
/** Cite: thousand_needles.cpp:111 SAY_LAKO_LOOK_OUT = -1000366 */
export const SAY_LAKO_LOOK_OUT = -1_000_366;
/** Cite: thousand_needles.cpp:112 SAY_LAKO_HERE_COME = -1000367 */
export const SAY_LAKO_HERE_COME = -1_000_367;
/** Cite: thousand_needles.cpp:113 SAY_LAKO_MORE = -1000368 */
export const SAY_LAKO_MORE = -1_000_368;
/** Cite: thousand_needles.cpp:114 SAY_LAKO_END = -1000369 */
export const SAY_LAKO_END = -1_000_369;

/** Cite: thousand_needles.cpp:116 QUEST_FREE_AT_LAST = 4904 */
export const QUEST_FREE_AT_LAST = 4904;
/** Cite: thousand_needles.cpp:117 NPC_GRIM_BANDIT = 10758 */
export const NPC_GRIM_BANDIT = 10758;

/** Cite: thousand_needles.cpp:119–121 ambush base indices into m_afBanditLoc */
export const ID_AMBUSH_1 = 0;
export const ID_AMBUSH_2 = 2;
export const ID_AMBUSH_3 = 4;

/** Bound creature. Cite: scriptdev-corpus entry 10646 */
export const NPC_LAKOTA_WINDSONG = 10646;

// Grimtotem Bandit ambush coords (6 rows; each ambush uses 2 consecutive). Cite:
// thousand_needles.cpp:124-132
export const GRIM_BANDIT_LOCS = [
  { x: -4905.479492, y: -2062.732666, z: 84.352, cite: 'thousand_needles.cpp:126' },
  { x: -4915.201172, y: -2073.52832, z: 84.733, cite: 'thousand_needles.cpp:127' },
  { x: -4878.883301, y: -1986.947876, z: 91.966, cite: 'thousand_needles.cpp:128' },
  { x: -4877.503906, y: -1966.113403, z: 91.859, cite: 'thousand_needles.cpp:129' },
  { x: -4767.985352, y: -1873.169189, z: 90.192, cite: 'thousand_needles.cpp:130' },
  { x: -4788.861328, y: -1888.007813, z: 89.888, cite: 'thousand_needles.cpp:131' },
] as const;

/** TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN for bandits. Cite: thousand_needles.cpp:173 60000 */
export const BANDIT_DESPAWN_MS = 60_000;

/** Lakota escort waypoints. Cite: thousand_needles.cpp:144-166 */
export const LAKOTA_WAYPOINTS = [
  {
    pointId: 9,
    textId: SAY_LAKO_LOOK_OUT,
    ambushId: ID_AMBUSH_1,
    questCredit: false,
    cite: 'thousand_needles.cpp:148-150 WP9 LOOK_OUT + ambush 0',
  },
  {
    pointId: 15,
    textId: SAY_LAKO_HERE_COME,
    ambushId: ID_AMBUSH_2,
    questCredit: false,
    cite: 'thousand_needles.cpp:152-154 WP15 HERE_COME + ambush 2',
  },
  {
    pointId: 22,
    textId: SAY_LAKO_MORE,
    ambushId: ID_AMBUSH_3,
    questCredit: false,
    cite: 'thousand_needles.cpp:156-158 WP22 MORE + ambush 4',
  },
  {
    pointId: 46,
    textId: SAY_LAKO_END,
    ambushId: null as number | null,
    questCredit: true,
    cite: 'thousand_needles.cpp:160-163 WP46 END + explore 4904',
  },
] as const;

// Constants — npc_paoka_swiftmountain

// thousand_needles.cpp:206–211
/** Cite: thousand_needles.cpp:206 SAY_START = -1000362 */
export const SAY_START = -1_000_362;
/** Cite: thousand_needles.cpp:207 SAY_WYVERN = -1000363 */
export const SAY_WYVERN = -1_000_363;
/** Cite: thousand_needles.cpp:208 SAY_COMPLETE = -1000364 */
export const SAY_COMPLETE = -1_000_364;

/** Cite: thousand_needles.cpp:210 QUEST_HOMEWARD = 4770 */
export const QUEST_HOMEWARD = 4770;
/** Cite: thousand_needles.cpp:211 NPC_WYVERN = 4107 */
export const NPC_WYVERN = 4107;

/** Bound creature. Cite: scriptdev-corpus entry 10427 */
export const NPC_PAOKA_SWIFTMOUNTAIN = 10427;

/** Highperch Wyvern spawn coords (3). Cite: thousand_needles.cpp:214-219 */
export const WYVERN_LOCS = [
  { x: -4990.606, y: -906.057, z: -5.343, cite: 'thousand_needles.cpp:216' },
  { x: -4970.241, y: -927.378, z: -4.951, cite: 'thousand_needles.cpp:217' },
  { x: -4985.364, y: -952.528, z: -5.199, cite: 'thousand_needles.cpp:218' },
] as const;

/** TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN for wyverns. Cite: thousand_needles.cpp:254 60000 */
export const WYVERN_DESPAWN_MS = 60_000;

/** Pao'ka escort waypoints. Cite: thousand_needles.cpp:231-246 */
export const PAOKA_WAYPOINTS = [
  {
    pointId: 16,
    textId: SAY_WYVERN,
    spawnWyvern: true,
    questCredit: false,
    cite: 'thousand_needles.cpp:235-237 WP16 SAY_WYVERN + DoSpawnWyvern×3',
  },
  {
    pointId: 27,
    textId: SAY_COMPLETE,
    spawnWyvern: false,
    questCredit: false,
    cite: 'thousand_needles.cpp:239-240 WP27 SAY_COMPLETE',
  },
  {
    pointId: 28,
    textId: null as number | null,
    spawnWyvern: false,
    questCredit: true,
    cite: 'thousand_needles.cpp:242-244 WP28 explore 4770',
  },
] as const;

// Constants — npc_plucky_johnson

// thousand_needles.cpp:282–286
/** Cite: thousand_needles.cpp:283 QUEST_SCOOP = 1950 */
export const QUEST_SCOOP = 1950;
/** Cite: thousand_needles.cpp:284 SPELL_PLUCKY_HUMAN = 9192 */
export const SPELL_PLUCKY_HUMAN = 9192;
/** Cite: thousand_needles.cpp:285 SPELL_PLUCKY_CHICKEN = 9220 */
export const SPELL_PLUCKY_CHICKEN = 9220;

/** Bound creature. Cite: scriptdev-corpus entry 6626 */
export const NPC_PLUCKY_JOHNSON = 6626;

/** m_uiResetTimer after Reset / gossip window. Cite: thousand_needles.cpp:301 m_uiResetTimer = 120000 */
export const PLUCKY_RESET_TIMER_MS = 120_000;

/** Gossip menu text ids. Cite: thousand_needles.cpp:365 SEND_GOSSIP_MENU(720); :373 menu 738 */
export const GOSSIP_MENU_PLUCKY_DEFAULT = 720;
export const GOSSIP_MENU_PLUCKY_PHRASE = 738;

// Pure helpers (re-exported for tests / host consumers)

export type {
  KanatiQuestAcceptResult,
  KanatiWaypointResult,
  LakotaQuestAcceptResult,
  LakotaWaypointResult,
  PaokaQuestAcceptResult,
  PaokaWaypointResult,
  PluckyState,
  PluckyEmoteResult,
  PluckyTimerTickResult,
  PluckyGossipHelloResult,
  PluckyGossipSelectResult,
} from './thousandNeedlesHelpers.ts';

export {
  kanatiQuestAccept,
  kanatiWaypointReached,
  kanatiJustSummoned,
  lakotaQuestAccept,
  lakotaWaypointReached,
  lakotaAmbushIds,
  lakotaJustSummoned,
  paokaQuestAccept,
  paokaWaypointReached,
  pluckyReset,
  pluckyReceiveEmote,
  pluckyResetTimerTick,
  pluckyGossipHello,
  pluckyGossipSelect,
  pluckyTempFactionFlags,
  pluckyWaveEmoteId,
  pluckyResetCastSpellId,
} from './thousandNeedlesHelpers.ts';

// ScriptDev IR — npc_kanati

// Cite: thousand_needles.cpp npc_kanatiAI Binding: 10638 Kanati Greycloud (in bake). Escort 4966; Galak
// 10720 absent.
export const NPC_KANATI_SCRIPT: ScriptDevIR = {
  name: 'npc_kanati',
  boundCreatures: [NPC_KANATI],
  sourceFile: 'kalimdor/thousand_needles.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; escort state owned by npc_escortAI',
        cite: 'thousand_needles.cpp:58 Reset',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_GALAK_ASS,
      kind: 'creature',
      reason:
        'NPC 10720 Galak Assassin is WP1 summon (×3, TEMPSPAWN_TIMED_OOC_DESPAWN 25000) but absent from product bake - IR + pure helpers ported; product cannot spawn ambush pack until rebake. Kanati + quest 4966 present.',
      cite: 'thousand_needles.cpp:45,79-83; loadRealBundle missing 10720',
    },
  ],
  cites: [
    'thousand_needles.cpp:36-102 npc_kanati',
    'thousand_needles.cpp:42-52 SAY/QUEST/NPC/FACTION/PATH/loc',
    'thousand_needles.cpp:60-88 WaypointReached + DoSpawnGalak + JustSummoned',
    'thousand_needles.cpp:91-102 QuestAccept 4966 faction 232 path 10638',
  ],
};

// ScriptDev IR — npc_lakota_windsong

// Cite: thousand_needles.cpp npc_lakota_windsongAI Binding: 10646 Lakota Windsong (in bake). Escort 4904;
// bandit 10758 present.
export const NPC_LAKOTA_WINDSONG_SCRIPT: ScriptDevIR = {
  name: 'npc_lakota_windsong',
  boundCreatures: [NPC_LAKOTA_WINDSONG],
  sourceFile: 'kalimdor/thousand_needles.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; ctor SetReactState(REACT_DEFENSIVE)',
        cite: 'thousand_needles.cpp:136-142 ctor defensive + Reset',
      },
    ],
  },
  cites: [
    'thousand_needles.cpp:104-198 npc_lakota_windsong',
    'thousand_needles.cpp:110-132 SAY/QUEST/NPC/ambush ids + m_afBanditLoc',
    'thousand_needles.cpp:144-179 WaypointReached + DoSpawnBandits + JustSummoned',
    'thousand_needles.cpp:187-198 QuestAccept 4904 SAY_START + faction 232',
  ],
};

// ScriptDev IR — npc_paoka_swiftmountain

// Cite: thousand_needles.cpp npc_paoka_swiftmountainAI Binding: 10427 Pao'ka Swiftmountain (in bake).
// Escort 4770; wyvern 4107 present.
export const NPC_PAOKA_SWIFTMOUNTAIN_SCRIPT: ScriptDevIR = {
  name: 'npc_paoka_swiftmountain',
  boundCreatures: [NPC_PAOKA_SWIFTMOUNTAIN],
  sourceFile: 'kalimdor/thousand_needles.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; ctor SetReactState(REACT_DEFENSIVE)',
        cite: 'thousand_needles.cpp:223-229 ctor defensive + Reset',
      },
    ],
  },
  cites: [
    'thousand_needles.cpp:200-274 npc_paoka_swiftmountain',
    'thousand_needles.cpp:206-219 SAY/QUEST/NPC + m_afWyvernLoc',
    'thousand_needles.cpp:231-255 WaypointReached + DoSpawnWyvern',
    'thousand_needles.cpp:263-274 QuestAccept 4770 SAY_START + faction 232',
  ],
};

// ScriptDev IR — npc_plucky_johnson

// Cite: thousand_needles.cpp npc_plucky_johnsonAI Binding: 6626 "Plucky" Johnson (in bake). Quest 1950 form
// + gossip residual. Spells 9192/9220 resolve from spell-data (polymorph-shaped form chrome).
export const NPC_PLUCKY_JOHNSON_SCRIPT: ScriptDevIR = {
  name: 'npc_plucky_johnson',
  boundCreatures: [NPC_PLUCKY_JOHNSON],
  sourceFile: 'kalimdor/thousand_needles.cpp',
  spellIds: [SPELL_PLUCKY_HUMAN, SPELL_PLUCKY_CHICKEN],
  timers: [],
  receiveEmotes: [
    {
      emote: TEXTEMOTE_BECKON,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_PLUCKY_HUMAN,
          cite: 'thousand_needles.cpp:317 CastSpell SPELL_PLUCKY_HUMAN 9192',
        },
        {
          kind: 'flavor',
          text: `if QUEST_SCOOP incomplete: faction ${FACTION_FRIENDLY} TEMPFACTION_RESTORE_RESPAWN|RESTORE_COMBAT_STOP + UNIT_NPC_FLAG_GOSSIP + human form`,
          cite: 'thousand_needles.cpp:311-318; pluckyReceiveEmote pure helper',
        },
      ],
      cite: 'thousand_needles.cpp:313-318 ReceiveEmote TEXTEMOTE_BECKON=7',
    },
    {
      emote: TEXTEMOTE_CHICKEN,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_PLUCKY_HUMAN,
          cite: 'thousand_needles.cpp:327 CastSpell SPELL_PLUCKY_HUMAN 9192',
        },
        {
          kind: 'flavor',
          text: `if !GOSSIP: faction ${FACTION_FRIENDLY} + gossip + human form + EMOTE_ONESHOT_WAVE=${EMOTE_ONESHOT_WAVE}`,
          cite: 'thousand_needles.cpp:321-328; pluckyReceiveEmote pure helper',
        },
      ],
      cite: 'thousand_needles.cpp:321-328 ReceiveEmote TEXTEMOTE_CHICKEN=22',
    },
  ],
  gossipHello: {
    defaultTextId: GOSSIP_MENU_PLUCKY_DEFAULT,
    cite: 'thousand_needles.cpp:360-367 GossipHello menu 720; phrase item if 1950 incomplete',
  },
  lifecycle: {
    onReset: [
      {
        kind: 'cast_self',
        spellId: SPELL_PLUCKY_CHICKEN,
        cite: 'thousand_needles.cpp:306 CastSpell SPELL_PLUCKY_CHICKEN 9220',
      },
      {
        kind: 'flavor',
        text: `m_uiResetTimer=${PLUCKY_RESET_TIMER_MS}; RemoveFlag UNIT_NPC_FLAG_GOSSIP if set`,
        cite: 'thousand_needles.cpp:299-306 Reset',
      },
    ],
    onEvade: [
      {
        kind: 'flavor',
        text: 'EnterEvadeMode from gossip timer OOC → Reset chicken form + clear gossip',
        cite: 'thousand_needles.cpp:338-339 UpdateAI resetTimer expiry',
      },
    ],
  },
  cites: [
    'thousand_needles.cpp:276-378 npc_plucky_johnson',
    'thousand_needles.cpp:282-286 FACTION/QUEST/SPELL constants',
    'thousand_needles.cpp:299-352 Reset + ReceiveEmote + UpdateAI timer 120000',
    'thousand_needles.cpp:360-378 GossipHello 720 + GossipSelect 738 credit 1950',
  ],
};
