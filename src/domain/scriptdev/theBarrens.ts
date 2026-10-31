// The Barrens ScriptDev IR ports. Source: scripts/kalimdor/the_barrens.cpp — Gilthares, Fizzule,
// Twiggy Flathead, the shredder escort, the Venture Co. tower NPCs and Regthar Deathgate.

import type { ScriptDevIR } from './types.ts';

// Shared factions / tempfaction / stand / emote

/** FACTION_ESCORT_H_NEUTRAL_ACTIVE. Cite: ScriptDevAIMgr.h:49 = 232; the_barrens.cpp:132 */
export const FACTION_ESCORT_H_NEUTRAL_ACTIVE = 232;

/** FACTION_FRIENDLY_F (Fizzule friendly after 2nd flare / whistle). Cite: the_barrens.cpp:149 = 35 */
export const FACTION_FRIENDLY_F = 35;

/** FACTION_RATCHET (Wizzlecrank escort). Cite: the_barrens.cpp:525 = 637 */
export const FACTION_RATCHET = 637;

/** FACTION_FRIENDLY (Twiggy summons start friendly). Cite: the_barrens.cpp:291 = 35 */
export const FACTION_FRIENDLY = 35;

/** FACTION_HOSTILE_WILL / FACTION_HOSTILE_CHALLENGER. Cite: the_barrens.cpp:292–293 */
export const FACTION_HOSTILE_WILL = 32;
export const FACTION_HOSTILE_CHALLENGER = 14;

/** TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h = 0x01; the_barrens.cpp:132 */
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** TEMPFACTION_RESTORE_REACH_HOME. Cite: Creature.h; the_barrens.cpp:239 */
export const TEMPFACTION_RESTORE_REACH_HOME = 0x04;
/** TEMPFACTION_TOGGLE_IMMUNE_TO_NPC. Cite: Creature.h:582 = 0x20; the_barrens.cpp:132 */
export const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;

/** UNIT_STAND_STATE_STAND. Cite: Unit.h; the_barrens.cpp:133 */
export const UNIT_STAND_STATE_STAND = 0;
/** UNIT_STAND_STATE_DEAD. Cite: Unit.h; the_barrens.cpp:549 */
export const UNIT_STAND_STATE_DEAD = 7;

/** TEXTEMOTE_SALUTE. Cite: SharedDefines.h:650 = 78; the_barrens.cpp:257 */
export const TEXTEMOTE_SALUTE = 78;

// Constants — npc_gilthares

// the_barrens.cpp:43–57
/** Cite: the_barrens.cpp:43 SAY_GIL_START = -1000370 */
export const SAY_GIL_START = -1_000_370;
/** Cite: the_barrens.cpp:44 SAY_GIL_AT_LAST = -1000371 */
export const SAY_GIL_AT_LAST = -1_000_371;
/** Cite: the_barrens.cpp:45 SAY_GIL_PROCEED = -1000372 */
export const SAY_GIL_PROCEED = -1_000_372;
/** Cite: the_barrens.cpp:46 SAY_GIL_FREEBOOTERS = -1000373 */
export const SAY_GIL_FREEBOOTERS = -1_000_373;
/** Cite: the_barrens.cpp:47 SAY_GIL_AGGRO_1 = -1000374 */
export const SAY_GIL_AGGRO_1 = -1_000_374;
/** Cite: the_barrens.cpp:48 SAY_GIL_AGGRO_2 = -1000375 */
export const SAY_GIL_AGGRO_2 = -1_000_375;
/** Cite: the_barrens.cpp:49 SAY_GIL_AGGRO_3 = -1000376 */
export const SAY_GIL_AGGRO_3 = -1_000_376;
/** Cite: the_barrens.cpp:50 SAY_GIL_AGGRO_4 = -1000377 */
export const SAY_GIL_AGGRO_4 = -1_000_377;
/** Cite: the_barrens.cpp:51 SAY_GIL_ALMOST = -1000378 */
export const SAY_GIL_ALMOST = -1_000_378;
/** Cite: the_barrens.cpp:52 SAY_GIL_SWEET = -1000379 */
export const SAY_GIL_SWEET = -1_000_379;
/** Cite: the_barrens.cpp:53 SAY_GIL_FREED = -1000380 */
export const SAY_GIL_FREED = -1_000_380;

/** Cite: the_barrens.cpp:55 QUEST_FREE_FROM_HOLD = 898 */
export const QUEST_FREE_FROM_HOLD = 898;
/** Cite: the_barrens.cpp:56 AREA_MERCHANT_COAST = 391 */
export const AREA_MERCHANT_COAST = 391;

/** Bound creature. Cite: scriptdev-corpus / the_barrens.cpp npc_gilthares */
export const NPC_GILTHARES = 3465;

/** Gilthares escort waypoint dialogue + credit. Cite: the_barrens.cpp:80–98 */
export const GILTHARES_WAYPOINTS = [
  { pointId: 17, textId: SAY_GIL_AT_LAST, questCredit: false, cite: 'the_barrens.cpp:80-82' },
  { pointId: 18, textId: SAY_GIL_PROCEED, questCredit: false, cite: 'the_barrens.cpp:83-85' },
  { pointId: 19, textId: SAY_GIL_FREEBOOTERS, questCredit: false, cite: 'the_barrens.cpp:86-88' },
  { pointId: 38, textId: SAY_GIL_ALMOST, questCredit: false, cite: 'the_barrens.cpp:89-91' },
  { pointId: 48, textId: SAY_GIL_SWEET, questCredit: false, cite: 'the_barrens.cpp:92-94' },
  { pointId: 54, textId: SAY_GIL_FREED, questCredit: true, cite: 'the_barrens.cpp:95-98 explore 898' },
] as const;

// Constants — npc_taskmaster_fizzule

// the_barrens.cpp:149–157
/** Cite: the_barrens.cpp:150 SPELL_FLARE = 10113 */
export const SPELL_FLARE = 10113;
/** Cite: the_barrens.cpp:151 SPELL_FOLLY = 10137 */
export const SPELL_FOLLY = 10137;

/** Cite: the_barrens.cpp:153–156 FIZZULE_* step ids */
export const FIZZULE_FLARE_1 = 1;
export const FIZZULE_FLARE_2 = 2;
export const FIZZULE_SALUTE = 3;
export const FIZZULE_WHISTLE = 4;

/** Bound creature. Cite: scriptdev-corpus entry 7233 */
export const NPC_TASKMASTER_FIZZULE = 7233;

// Deep Cover quest (turn-in Fizzule after friendly). Cite: the_barrens.cpp SDComment Quest support: 2458;
// bake ender 7233
export const QUEST_DEEP_COVER = 2458;

/** resetTimer after first flare / whistle. Cite: the_barrens.cpp:235,246 resetTimer = 120000 */
export const FIZZULE_RESET_TIMER_MS = 120_000;

// Constants — npc_twiggy_flathead + at_twiggy_flathead

// the_barrens.cpp:279–296
/** Cite: the_barrens.cpp:279 SAY_BIG_WILL_READY = -1000123 */
export const SAY_BIG_WILL_READY = -1_000_123;
/** Cite: the_barrens.cpp:280 SAY_TWIGGY_BEGIN = -1000124 */
export const SAY_TWIGGY_BEGIN = -1_000_124;
/** Cite: the_barrens.cpp:281 SAY_TWIGGY_FRAY = -1000125 */
export const SAY_TWIGGY_FRAY = -1_000_125;
/** Cite: the_barrens.cpp:282 SAY_TWIGGY_DOWN = -1000126 */
export const SAY_TWIGGY_DOWN = -1_000_126;
/** Cite: the_barrens.cpp:283 SAY_TWIGGY_OVER = -1000127 */
export const SAY_TWIGGY_OVER = -1_000_127;

/** Cite: the_barrens.cpp:285 NPC_TWIGGY = 6248 */
export const NPC_TWIGGY = 6248;
/** Cite: the_barrens.cpp:286 NPC_BIG_WILL = 6238 */
export const NPC_BIG_WILL = 6238;
/** Cite: the_barrens.cpp:287 NPC_AFFRAY_CHALLENGER = 6240 */
export const NPC_AFFRAY_CHALLENGER = 6240;

/** Cite: the_barrens.cpp:289 QUEST_AFFRAY = 1719 */
export const QUEST_AFFRAY = 1719;

/** Cite: the_barrens.cpp:295 MAX_CHALLENGERS = 6 */
export const MAX_CHALLENGERS = 6;

/** Affray challenger + Big Will spawn coords (8 rows). Cite: the_barrens.cpp:298–308 */
export const AFFRAY_CHALLENGER_LOCS = [
  { x: -1683.0, y: -4326.0, z: 2.79, o: 0.0, cite: 'the_barrens.cpp:300' },
  { x: -1682.0, y: -4329.0, z: 2.79, o: 0.0, cite: 'the_barrens.cpp:301' },
  { x: -1683.0, y: -4330.0, z: 2.79, o: 0.0, cite: 'the_barrens.cpp:302' },
  { x: -1680.0, y: -4334.0, z: 2.79, o: 1.49, cite: 'the_barrens.cpp:303' },
  { x: -1674.0, y: -4326.0, z: 2.79, o: 3.49, cite: 'the_barrens.cpp:304' },
  { x: -1677.0, y: -4334.0, z: 2.79, o: 1.66, cite: 'the_barrens.cpp:305' },
  { x: -1713.79, y: -4342.09, z: 6.05, o: 6.15, cite: 'the_barrens.cpp:306 Big Will spawn' },
  { x: -1682.31, y: -4329.68, z: 2.78, o: 0.0, cite: 'the_barrens.cpp:307 Big Will move' },
] as const;

/** Initial event timer on Reset / after start. Cite: the_barrens.cpp:328 m_uiEventTimer = 1000 */
export const TWIGGY_EVENT_TIMER_INIT_MS = 1000;
/** After SetChallengers (step 0 → 1). Cite: the_barrens.cpp:449 m_uiEventTimer = 5000 */
export const TWIGGY_AFTER_SUMMON_MS = 5000;
/** Between challenger activations while count < MAX. Cite: the_barrens.cpp:468 m_uiEventTimer = 25000 */
export const TWIGGY_CHALLENGER_GAP_MS = 25_000;
/** After last challenger ready → Big Will spawn arm. Cite: the_barrens.cpp:465 m_uiEventTimer = 5000 */
export const TWIGGY_AFTER_LAST_CHALLENGER_MS = 5000;
/** After Big Will summon before default poll. Cite: the_barrens.cpp:472 m_uiEventTimer = 15000 */
export const TWIGGY_AFTER_BIG_WILL_SUMMON_MS = 15_000;
/** On challenger death re-arm. Cite: the_barrens.cpp:426 m_uiEventTimer = 15000 */
export const TWIGGY_AFTER_CHALLENGER_DEATH_MS = 15_000;
/** AT search radius for Twiggy. Cite: the_barrens.cpp:494 GetClosestCreatureWithEntry(..., 30.0f) */
export const TWIGGY_AT_SEARCH_YD = 30;
/** Challenger TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN. Cite: the_barrens.cpp:372 600000 */
export const TWIGGY_CHALLENGER_DESPAWN_MS = 600_000;
/** Big Will TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN. Cite: the_barrens.cpp:471 300000 */
export const TWIGGY_BIG_WILL_DESPAWN_MS = 300_000;

// Constants — npc_wizzlecranks_shredder

// the_barrens.cpp:515–528
/** Cite: the_barrens.cpp:515 SAY_START = -1000298 */
export const SAY_WIZZ_START = -1_000_298;
/** Cite: the_barrens.cpp:516 SAY_STARTUP1 = -1000299 */
export const SAY_WIZZ_STARTUP1 = -1_000_299;
/** Cite: the_barrens.cpp:517 SAY_STARTUP2 = -1000300 */
export const SAY_WIZZ_STARTUP2 = -1_000_300;
/** Cite: the_barrens.cpp:518 SAY_MERCENARY = -1000301 */
export const SAY_WIZZ_MERCENARY = -1_000_301;
/** Cite: the_barrens.cpp:519 SAY_PROGRESS_1 = -1000302 */
export const SAY_WIZZ_PROGRESS_1 = -1_000_302;
/** Cite: the_barrens.cpp:520 SAY_PROGRESS_2 = -1000303 */
export const SAY_WIZZ_PROGRESS_2 = -1_000_303;
/** Cite: the_barrens.cpp:521 SAY_PROGRESS_3 = -1000304 */
export const SAY_WIZZ_PROGRESS_3 = -1_000_304;
/** Cite: the_barrens.cpp:522 SAY_END = -1000305 */
export const SAY_WIZZ_END = -1_000_305;

/** Cite: the_barrens.cpp:524 QUEST_ESCAPE = 863 */
export const QUEST_ESCAPE = 863;
/** Cite: the_barrens.cpp:526 NPC_PILOT_WIZZ = 3451 */
export const NPC_PILOT_WIZZ = 3451;
/** Cite: the_barrens.cpp:527 NPC_MERCENARY = 3282 */
export const NPC_MERCENARY = 3282;

/** Bound creature. Cite: corpus entry 3439 */
export const NPC_WIZZLECRANKS_SHREDDER = 3439;

/** Post-event step delay. Cite: the_barrens.cpp:636 m_uiPostEventTimer = 5000 */
export const WIZZ_POST_EVENT_STEP_MS = 5000;
/** Initial post-event timer / Reset OOC. Cite: the_barrens.cpp:535,552 m_uiPostEventTimer = 1000 */
export const WIZZ_POST_EVENT_INIT_MS = 1000;
/** Mercenary TEMPSPAWN_TIMED_OOC_DESPAWN. Cite: the_barrens.cpp:569 120000 */
export const WIZZ_MERCENARY_DESPAWN_MS = 120_000;
/** Pilot TEMPSPAWN_TIMED_DESPAWN. Cite: the_barrens.cpp:630 180000 */
export const WIZZ_PILOT_DESPAWN_MS = 180_000;

/** Mercenary ambush coords at WP18. Cite: the_barrens.cpp:569-572 */
export const WIZZ_MERCENARY_SPAWNS = [
  {
    x: 1128.489,
    y: -3037.611,
    z: 92.701,
    o: 1.472,
    cite: 'the_barrens.cpp:569',
  },
  {
    x: 1160.172,
    y: -2980.168,
    z: 97.313,
    o: 3.69,
    cite: 'the_barrens.cpp:572',
  },
] as const;

// Constants — npc_gallywix / silixiz / lookout (Tower of the Venture Co.)

// the_barrens.cpp:669–675
/** Cite: the_barrens.cpp:669 SPELL_DECIMATE = 10268 */
export const SPELL_DECIMATE = 10268;
/** Cite: the_barrens.cpp:670 SPELL_SLUSH = 10267 */
export const SPELL_SLUSH = 10267;

/** Cite: the_barrens.cpp:672 SAY_STEALTH_ALERT_GALLYWIX = -1010005 */
export const SAY_STEALTH_ALERT_GALLYWIX = -1_010_005;
/** Cite: the_barrens.cpp:673 SAY_STEALTH_ALERT_SILIXIZ = -1010006 */
export const SAY_STEALTH_ALERT_SILIXIZ = -1_010_006;
/** Cite: the_barrens.cpp:674 SAY_STEALTH_ALERT_LOOKOUT_1 = -1010007 */
export const SAY_STEALTH_ALERT_LOOKOUT_1 = -1_010_007;
/** Cite: the_barrens.cpp:675 SAY_STEALTH_ALERT_LOOKOUT_2 = -1010008 */
export const SAY_STEALTH_ALERT_LOOKOUT_2 = -1_010_008;

/** Bound creatures. Cite: scriptdev-corpus */
export const NPC_GALLYWIX = 7288;
export const NPC_FOREMAN_SILIXIZ = 7287;
export const NPC_VENTURE_CO_LOOKOUT = 7307;

/** Rogue Ambush family mask (IsFitToFamilyMask). Cite: the_barrens.cpp:694 0x0000000000800200 */
export const ROGUE_AMBUSH_FAMILY_MASK = 0x0000_0000_0080_0200n;
/** Rogue Eviscerate family mask. Cite: the_barrens.cpp:715 0x0000000000820000 */
export const ROGUE_EVISCERATE_FAMILY_MASK = 0x0000_0000_0082_0000n;

// Constants — npc_regthar_deathgate

// the_barrens.cpp:756–769
/** Cite: the_barrens.cpp:756 QUEST_COUNTERATTACK = 4021 */
export const QUEST_COUNTERATTACK = 4021;
/** Cite: the_barrens.cpp:758 SAY_START_REGTHAR = -1010001 */
export const SAY_START_REGTHAR = -1_010_001;
/** Cite: the_barrens.cpp:759 SAY_DEFENDER = -1010002 */
export const SAY_DEFENDER = -1_010_002;
/** Cite: the_barrens.cpp:760 YELL_RETREAT = -1010003 */
export const YELL_RETREAT = -1_010_003;

/** Cite: the_barrens.cpp:762 NPC_REGTHAR_DEATHGATE = 3389 */
export const NPC_REGTHAR_DEATHGATE = 3389;
/** Cite: the_barrens.cpp:763 NPC_WARLORD_KROMZAR = 9456 */
export const NPC_WARLORD_KROMZAR = 9456;
/** Cite: the_barrens.cpp:764 NPC_HORDE_DEFENDER = 9457 */
export const NPC_HORDE_DEFENDER = 9457;
/** Cite: the_barrens.cpp:765 NPC_HORDE_AXE_THROWER = 9458 */
export const NPC_HORDE_AXE_THROWER = 9458;
/** Cite: the_barrens.cpp:766 NPC_KOLKAR_INVADER = 9524 */
export const NPC_KOLKAR_INVADER = 9524;
/** Cite: the_barrens.cpp:767 NPC_KOLKAR_STORMSEER = 9523 */
export const NPC_KOLKAR_STORMSEER = 9523;

/** Cite: the_barrens.cpp:769 KILL_LIMIT = 20 */
export const KILL_LIMIT = 20;

/** Respawn times (seconds). Cite: the_barrens.cpp:773–775 */
export const COUNTERATTACK_RESPAWN_TIME_HORDE_S = 12;
export const COUNTERATTACK_RESPAWN_TIME_HORDE_INC_S = 1;
export const COUNTERATTACK_RESPAWN_TIME_KOLKAR_S = 10;

/** Event duration. Cite: the_barrens.cpp:954 m_eventTimer = 20 * MINUTE * IN_MILLISECONDS */
export const REGTHAR_EVENT_DURATION_MS = 20 * 60 * 1000;

/** Corpse despawn for summons. Cite: the_barrens.cpp:871 40 * IN_MILLISECONDS */
export const REGTHAR_CORPSE_DESPAWN_MS = 40_000;

// ForceDespawn delay when still in combat at FinishEvent. Cite: the_barrens.cpp:918 MINUTE *
// IN_MILLISECONDS
export const REGTHAR_COMBAT_DESPAWN_MS = 60_000;

/** Horde spawn points (7). Cite: the_barrens.cpp:784–793 */
export const SPAWN_POINTS_HORDE = [
  { x: -307.23, y: -1919.84, z: 91.66, o: 0.64, cite: 'the_barrens.cpp:786' },
  { x: -281.15, y: -1906.39, z: 91.66, o: 1.88, cite: 'the_barrens.cpp:787' },
  { x: -270.09, y: -1901.58, z: 91.66, o: 1.88, cite: 'the_barrens.cpp:788' },
  { x: -275.24, y: -1901.96, z: 91.66, o: 1.9, cite: 'the_barrens.cpp:789' },
  { x: -295.84, y: -1913.58, z: 91.66, o: 1.86, cite: 'the_barrens.cpp:790' },
  { x: -221.61, y: -1936.54, z: 94.0, o: 0.41, cite: 'the_barrens.cpp:791' },
  { x: -226.65, y: -1927.87, z: 93.24, o: 0.41, cite: 'the_barrens.cpp:792' },
] as const;

/** Kromzar pack spawn points (3). Cite: the_barrens.cpp:795–800 */
export const SPAWN_POINTS_KROMZAR = [
  { x: -281.19, y: -1855.54, z: 92.58, o: 4.85, cite: 'the_barrens.cpp:797' },
  { x: -283.66, y: -1858.45, z: 92.47, o: 4.85, cite: 'the_barrens.cpp:798' },
  { x: -286.5, y: -1856.18, z: 92.44, o: 4.85, cite: 'the_barrens.cpp:799' },
] as const;

/** Kolkar spawn points (15). Cite: the_barrens.cpp:802–819 */
export const SPAWN_POINTS_KOLKAR = [
  { x: -290.26, y: -1860.85, z: 92.48, o: 3.68, cite: 'the_barrens.cpp:804' },
  { x: -311.46, y: -1871.16, z: 92.64, o: 6.06, cite: 'the_barrens.cpp:805' },
  { x: -321.75, y: -1868.48, z: 93.73, o: 0.3, cite: 'the_barrens.cpp:806' },
  { x: -338.12, y: -1852.1, z: 94.09, o: 0.01, cite: 'the_barrens.cpp:807' },
  { x: -311.46, y: -1847.78, z: 94.93, o: 6.15, cite: 'the_barrens.cpp:808' },
  { x: -292.02, y: -1840.0, z: 93.06, o: 3.51, cite: 'the_barrens.cpp:809' },
  { x: -267.14, y: -1853.97, z: 93.24, o: 3.52, cite: 'the_barrens.cpp:810' },
  { x: -267.68, y: -1832.77, z: 92.69, o: 3.52, cite: 'the_barrens.cpp:811' },
  { x: -279.7, y: -1845.67, z: 92.81, o: 3.83, cite: 'the_barrens.cpp:812' },
  { x: -338.99, y: -1868.68, z: 93.5, o: 0.17, cite: 'the_barrens.cpp:813' },
  { x: -210.28, y: -1916.22, z: 92.87, o: 4.89, cite: 'the_barrens.cpp:814' },
  { x: -209.09, y: -1922.44, z: 93.26, o: 3.87, cite: 'the_barrens.cpp:815' },
  { x: -206.64, y: -1924.83, z: 93.78, o: 2.41, cite: 'the_barrens.cpp:816' },
  { x: -283.57, y: -1883.91, z: 92.6, o: 3.53, cite: 'the_barrens.cpp:817' },
  { x: -197.5, y: -1929.31, z: 94.03, o: 3.51, cite: 'the_barrens.cpp:818' },
] as const;

// Pure helpers (re-exported for tests / host consumers)

export type {
  GiltharesQuestAcceptResult,
  GiltharesWaypointResult,
  FizzuleState,
  FizzuleSpellHitResult,
  TwiggyEventState,
  TwiggyCanStartResult,
  TwiggyAreaTriggerResult,
  TwiggyTimerTickResult,
  TwiggySummonedDeathResult,
  WizzleQuestAcceptResult,
  WizzleWaypointResult,
  WizzlePostEventResult,
  RegtharEventState,
  RegtharStartResult,
  RegtharKolkarKillResult,
} from './theBarrensHelpers.ts';

export {
  giltharesQuestAccept,
  giltharesWaypointReached,
  giltharesAggroText,
  fizzuleInitialState,
  fizzuleHandleFlareOrKneel,
  fizzuleSpellHit,
  fizzuleReceiveEmote,
  fizzuleResetTimerTick,
  twiggyReset,
  twiggyCanStartEvent,
  twiggyAreaTrigger,
  twiggyEventTimerTick,
  twiggySummonedJustDied,
  twiggyBigWillArrived,
  wizzleQuestAccept,
  wizzleWaypointReached,
  wizzleWaypointStart,
  wizzlePostEventStep,
  gallywixStealthAlert,
  gallywixDamageTaken,
  silixizStealthAlert,
  lookoutStealthAlert,
  lookoutDamageTaken,
  regtharReset,
  regtharStartEvent,
  regtharKolkarKilled,
  regtharFinishEvent,
  regtharQuestAccept,
  regtharDefenderDeathSay,
  regtharHordeRespawnDelayS,
} from './theBarrensHelpers.ts';

// ScriptDev IR — npc_gilthares

// Cite: the_barrens.cpp npc_giltharesAI Binding: 3465 Gilthares Firebough (in bake). Escort 898; no combat
// cast timers.
export const NPC_GILTHARES_SCRIPT: ScriptDevIR = {
  name: 'npc_gilthares',
  boundCreatures: [NPC_GILTHARES],
  sourceFile: 'kalimdor/the_barrens.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onAggro: [
      {
        kind: 'flavor',
        text: '25% chance (urand 0..3==0) NPC-only in area 391 → random SAY_GIL_AGGRO_1..4',
        cite: 'the_barrens.cpp:102-120; giltharesAggroText pure helper',
      },
    ],
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; JustReachedHome SetStandState STAND',
        cite: 'the_barrens.cpp:63 Reset; :65-69 JustReachedHome STAND',
      },
    ],
  },
  cites: [
    'the_barrens.cpp:37-141 npc_gilthares',
    'the_barrens.cpp:43-57 SAY/QUEST/AREA constants',
    'the_barrens.cpp:71-100 WaypointReached 17/18/19/38/48/54 credit 898',
    'the_barrens.cpp:102-120 Aggro text gate',
    'the_barrens.cpp:128-141 QuestAccept 898 faction 232 + Start(false)',
  ],
};

// ScriptDev IR — npc_taskmaster_fizzule

// Cite: the_barrens.cpp npc_taskmaster_fizzuleAI Binding: 7233 Taskmaster Fizzule (in bake). Deep Cover
// 2458 friendly transform via Flare×2+Salute or Folly whistle. Spells 10113/10137 present (SI4 dummy).
export const NPC_TASKMASTER_FIZZULE_SCRIPT: ScriptDevIR = {
  name: 'npc_taskmaster_fizzule',
  boundCreatures: [NPC_TASKMASTER_FIZZULE],
  sourceFile: 'kalimdor/the_barrens.cpp',
  spellIds: [SPELL_FLARE, SPELL_FOLLY],
  timers: [],
  spellHits: [
    {
      spellId: SPELL_FLARE,
      playerCaster: true,
      actions: [
        {
          kind: 'flavor',
          text: `if flareCount<2 → ++count; FLARE_1 immune+resetTimer ${FIZZULE_RESET_TIMER_MS}; FLARE_2 faction ${FACTION_FRIENDLY_F}`,
          cite: 'the_barrens.cpp:190-197,234-240; fizzuleSpellHit pure helper',
        },
      ],
      cite: 'the_barrens.cpp:190-197 SpellHit SPELL_FLARE 10113',
    },
    {
      spellId: SPELL_FOLLY,
      playerCaster: true,
      actions: [
        {
          kind: 'flavor',
          text: `flareCount=4 whistle: resetTimer ${FIZZULE_RESET_TIMER_MS} + immune + faction ${FACTION_FRIENDLY_F} + questgiver + salute`,
          cite: 'the_barrens.cpp:199-203,245-251; fizzuleSpellHit pure helper',
        },
      ],
      cite: 'the_barrens.cpp:199-203 SpellHit SPELL_FOLLY 10137',
    },
  ],
  receiveEmotes: [
    {
      emote: TEXTEMOTE_SALUTE,
      actions: [
        {
          kind: 'flavor',
          text: 'if flareCount==2 → count 3 questgiver flag + EMOTE_ONESHOT_SALUTE',
          cite: 'the_barrens.cpp:255-265; fizzuleReceiveEmote pure helper',
        },
      ],
      cite: 'the_barrens.cpp:255-265 ReceiveEmote TEXTEMOTE_SALUTE=78',
    },
  ],
  lifecycle: {
    onEvade: [
      {
        kind: 'flavor',
        text: 'if resetTimer active: RemoveAllAurasOnEvade + CombatStop; else ScriptedAI evade',
        cite: 'the_barrens.cpp:172-181 EnterEvadeMode',
      },
    ],
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; ctor resetTimer=0 flareCount=0',
        cite: 'the_barrens.cpp:161-170',
      },
    ],
  },
  cites: [
    'the_barrens.cpp:143-271 npc_taskmaster_fizzule',
    'the_barrens.cpp:149-157 FACTION/SPELL/FIZZULE_*',
    'the_barrens.cpp:183-265 SpellHit + HandleFlareOrKneel + ReceiveEmote',
    'the_barrens.cpp:208-222 resetTimer 120000 expiry',
  ],
};

// ScriptDev IR — npc_twiggy_flathead

// Cite: the_barrens.cpp npc_twiggy_flatheadAI Binding: 6248 Twiggy Flathead (in bake). Affray 1719 event
// controller. Challenger 6240 ABSENT bake → unused-binding; Big Will 6238 present.
export const NPC_TWIGGY_FLATHEAD_SCRIPT: ScriptDevIR = {
  name: 'npc_twiggy_flathead',
  boundCreatures: [NPC_TWIGGY],
  sourceFile: 'kalimdor/the_barrens.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `event off; timer ${TWIGGY_EVENT_TIMER_INIT_MS}; challengerCount=0 step=0 clear guids`,
        cite: 'the_barrens.cpp:324-336 Reset',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_AFFRAY_CHALLENGER,
      kind: 'creature',
      reason:
        'NPC 6240 Affray Challenger is summoned by SetChallengers (MAX=6) but absent from product bake - IR + pure helpers ported; product cannot spawn wave until rebake. Big Will 6238 is present.',
      cite: 'the_barrens.cpp:287,367-373; loadRealBundle missing 6240',
    },
  ],
  cites: [
    'the_barrens.cpp:273-488 npc_twiggy_flathead',
    'the_barrens.cpp:279-308 SAY/NPC/QUEST/FACTION/locs',
    'the_barrens.cpp:324-482 Reset CanStart SetChallengers UpdateAI steps',
    'the_barrens.cpp:416-428 SummonedCreatureJustDied OVER/DOWN',
  ],
};

// ScriptDev IR — at_twiggy_flathead

// Cite: the_barrens.cpp AreaTrigger_at_twiggy_flathead No creature ScriptName — area trigger residual for
// quest 1719.
export const AT_TWIGGY_FLATHEAD: ScriptDevIR = {
  name: 'at_twiggy_flathead',
  boundCreatures: [],
  sourceFile: 'kalimdor/the_barrens.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `AT: alive + incomplete ${QUEST_AFFRAY} → closest Twiggy ≤${TWIGGY_AT_SEARCH_YD}yd CanStartEvent`,
        cite: 'the_barrens.cpp:490-507; twiggyAreaTrigger pure helper',
      },
    ],
  },
  cites: [
    'the_barrens.cpp:490-507 at_twiggy_flathead',
    'the_barrens.cpp:492-501 incomplete 1719 + Twiggy 30yd',
  ],
};

// ScriptDev IR — npc_wizzlecranks_shredder

// Cite: the_barrens.cpp npc_wizzlecranks_shredderAI Binding: 3439 Wizzlecrank's Shredder (in bake). Escort
// 863; mercenary 3282 present; Pilot Wizz 3451 ABSENT → unused-binding.
export const NPC_WIZZLECRANKS_SHREDDER_SCRIPT: ScriptDevIR = {
  name: 'npc_wizzlecranks_shredder',
  boundCreatures: [NPC_WIZZLECRANKS_SHREDDER],
  sourceFile: 'kalimdor/the_barrens.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `if not escorting: STAND if DEAD; postEvent false; timer ${WIZZ_POST_EVENT_INIT_MS}; count 0`,
        cite: 'the_barrens.cpp:544-555 Reset OOC',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_PILOT_WIZZ,
      kind: 'creature',
      reason:
        'NPC 3451 Pilot Wizzlecrank is post-event summon (case 3) and forces shredder stand-state DEAD on JustSummoned - absent from product bake. Escort credit 863 still modeled; pilot chrome blocked until rebake.',
      cite: 'the_barrens.cpp:526,597-600,626-631; loadRealBundle missing 3451',
    },
  ],
  cites: [
    'the_barrens.cpp:509-665 npc_wizzlecranks_shredder',
    'the_barrens.cpp:515-528 SAY/QUEST/FACTION/NPC',
    'the_barrens.cpp:557-595 WaypointReached/Start',
    'the_barrens.cpp:606-646 UpdateEscortAI post-event 5s steps credit 863',
    'the_barrens.cpp:649-660 QuestAccept 863',
  ],
};

// ScriptDev IR — npc_gallywix

// Cite: the_barrens.cpp npc_gallywixAI Binding: 7288 Grand Foreman Puzik Gallywix (in bake). Stealth alert
// + Ambush → Decimate 10268 (resolves). No combat cast schedule.
export const NPC_GALLYWIX_SCRIPT: ScriptDevIR = {
  name: 'npc_gallywix',
  boundCreatures: [NPC_GALLYWIX],
  sourceFile: 'kalimdor/the_barrens.cpp',
  spellIds: [SPELL_DECIMATE],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; OnStealthAlert SAY; DamageTaken Ambush family → Decimate 10268 self',
        cite: 'the_barrens.cpp:685-696; gallywixDamageTaken pure helper',
      },
    ],
  },
  cites: [
    'the_barrens.cpp:678-697 npc_gallywix',
    'the_barrens.cpp:669 SPELL_DECIMATE=10268',
    'the_barrens.cpp:672 SAY_STEALTH_ALERT_GALLYWIX',
    'the_barrens.cpp:687-696 OnStealthAlert + DamageTaken Ambush',
  ],
};

// ScriptDev IR — npc_foreman_silixiz

// Cite: the_barrens.cpp npc_foreman_silixizAI Binding: 7287 Foreman Silixiz (in bake). OnStealthAlert only.
export const NPC_FOREMAN_SILIXIZ_SCRIPT: ScriptDevIR = {
  name: 'npc_foreman_silixiz',
  boundCreatures: [NPC_FOREMAN_SILIXIZ],
  sourceFile: 'kalimdor/the_barrens.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; OnStealthAlert SAY_STEALTH_ALERT_SILIXIZ only',
        cite: 'the_barrens.cpp:727-732',
      },
    ],
  },
  cites: [
    'the_barrens.cpp:720-733 npc_foreman_silixiz',
    'the_barrens.cpp:673 SAY_STEALTH_ALERT_SILIXIZ',
    'the_barrens.cpp:729-732 OnStealthAlert',
  ],
};

// ScriptDev IR — npc_venture_co_lookout

// Cite: the_barrens.cpp npc_venture_co_lookoutAI Binding: 7307 Venture Co. Lookout (in bake). Stealth alert
// + Eviscerate → Slush 10267 (resolves). No combat cast schedule.
export const NPC_VENTURE_CO_LOOKOUT_SCRIPT: ScriptDevIR = {
  name: 'npc_venture_co_lookout',
  boundCreatures: [NPC_VENTURE_CO_LOOKOUT],
  sourceFile: 'kalimdor/the_barrens.cpp',
  spellIds: [SPELL_SLUSH],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; OnStealthAlert urand LOOKOUT_1/2; DamageTaken Eviscerate → Slush 10267 self',
        cite: 'the_barrens.cpp:706-717; lookoutDamageTaken pure helper',
      },
    ],
  },
  cites: [
    'the_barrens.cpp:699-718 npc_venture_co_lookout',
    'the_barrens.cpp:670 SPELL_SLUSH=10267',
    'the_barrens.cpp:674-675 SAY_STEALTH_ALERT_LOOKOUT_1/2',
    'the_barrens.cpp:708-717 OnStealthAlert + DamageTaken Eviscerate',
  ],
};

// ScriptDev IR — npc_regthar_deathgate

// npc_regthar_deathgateAI, creature 3389 — the Counterattack 4021 wave event. Horde defender 9457
// and axe thrower 9458 are absent from bake; Krom'zar 9456 and the Kolkar are present.
export const NPC_REGTHAR_DEATHGATE_SCRIPT: ScriptDevIR = {
  name: 'npc_regthar_deathgate',
  boundCreatures: [NPC_REGTHAR_DEATHGATE],
  sourceFile: 'kalimdor/the_barrens.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `event off; killCount 0; timer 0; clear maps; StartEvent → ${REGTHAR_EVENT_DURATION_MS}ms + SpawnAllSlot`,
        cite: 'the_barrens.cpp:928-959 Reset/StartEvent',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_HORDE_DEFENDER,
      kind: 'creature',
      reason:
        'NPC 9457 Horde Defender is a Counterattack wave summon (SpawnAllSlot horde) but absent from product bake - IR + pure helpers ported.',
      cite: 'the_barrens.cpp:764,957; loadRealBundle missing 9457',
    },
    {
      entry: NPC_HORDE_AXE_THROWER,
      kind: 'creature',
      reason:
        'NPC 9458 Horde Axe Thrower is a Counterattack wave summon (paired with 9457) but absent from product bake - IR + pure helpers ported.',
      cite: 'the_barrens.cpp:765,957; loadRealBundle missing 9458',
    },
  ],
  cites: [
    'the_barrens.cpp:750-1095 npc_regthar_deathgate',
    'the_barrens.cpp:756-819 QUEST/SAY/NPC/KILL_LIMIT/spawn points',
    'the_barrens.cpp:948-970 StartEvent/FinishEvent',
    'the_barrens.cpp:972-1049 SummonedCreatureJustDied + UpdateAI kill 20 → Kromzar',
    'the_barrens.cpp:1057-1095 Gossip/QuestAccept start',
  ],
};
