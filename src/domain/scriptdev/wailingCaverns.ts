// Wailing Caverns ScriptDev IR ports. Source: wailing_caverns.cpp, wailing_cavernsScripts.cpp and
// the header — instance_wailing_caverns and npc_disciple_of_naralex. Escort waypoints are a GAP.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';

// Constants — wailing_caverns.h + wailing_cavernsScripts.cpp enums

// wailing_caverns.h:10–17
export const WC_MAX_ENCOUNTER = 6;
export const TYPE_ANACONDRA = 0;
export const TYPE_COBRAHN = 1;
export const TYPE_PYTHAS = 2;
export const TYPE_SERPENTIS = 3;
export const TYPE_DISCIPLE = 4;
export const TYPE_MUTANUS = 5;

// wailing_caverns.h:19–20
export const NPC_NARALEX = 3679;
export const NPC_DISCIPLE = 3678;

// wailing_caverns.h:22
export const SAY_INTRO = 2101;

// wailing_caverns.h:24–26
export const GO_MYSTERIOUS_CHEST = 180055;
export const QUEST_FORTUNE_AWAITS = 7944;

// wailing_cavernsScripts.cpp:32–50 script_texts / broadcast
export const SAY_FIRST_CORNER = 1256;
export const SAY_CONTINUE = 1257;
export const SAY_CIRCLE_BANISH = 1258;
export const SAY_PURIFIED = 1259;
export const SAY_NARALEX_CHAMBER = 1263;
export const SAY_BEGIN_RITUAL = 1264;
export const SAY_MUTANUS = 1276;
export const SAY_NARALEX_AWAKE = 1271;
export const SAY_AWAKE = 2101;
export const SAY_NARALEX_THANKYOU = 1272;
export const SAY_FAREWELL = 2103;
export const SAY_AGGRO_1 = 1273;
export const SAY_AGGRO_2 = 1277;
export const SAY_AGGRO_3 = 1274;
export const EMOTE_RITUAL_BEGIN = 1265;
export const EMOTE_NARALEX_AWAKE = 1268;
export const EMOTE_BREAK_THROUGH = 1269;
export const EMOTE_VISION = 1270;

// wailing_cavernsScripts.cpp:52–54 gossip
export const GOSSIP_ITEM_BEGIN = -3043000;
export const TEXT_ID_BEGIN = 699;
export const TEXT_ID_DISCIPLE = 698;

// wailing_cavernsScripts.cpp:56–61 spells
export const SPELL_MARK = 5232;
export const SPELL_SLEEP = 1090;
export const SPELL_POTION = 8141;
export const SPELL_CLEANSING = 6270;
export const SPELL_AWAKENING = 6271;
export const SPELL_SHAPESHIFT = 8153;

// wailing_cavernsScripts.cpp:63–68 summons
export const NPC_DEVIATE_RAPTOR = 3636;
export const NPC_DEVIATE_VIPER = 5755;
export const NPC_DEVIATE_ADDER = 5048;
export const NPC_DEVIATE_MOCCASIN = 5762;
export const NPC_NIGHTMARE_ECTOPLASM = 5763;
export const NPC_MUTANUS = 3654;

// wailing_cavernsScripts.cpp:70 escort path
export const PATH_ID_NARALEX = 3678;

/** WP12 raptor spawn table (raptorLocations). Cite: wailing_cavernsScripts.cpp:81–85 */
export const RAPTOR_LOCATIONS = [
  {
    creatureEntry: NPC_DEVIATE_RAPTOR,
    x: -67.44779,
    y: 214.5348,
    z: -93.42037,
    pathId: 1,
    cite: 'wailing_cavernsScripts.cpp:83 raptorLocations[0]',
  },
  {
    creatureEntry: NPC_DEVIATE_RAPTOR,
    x: -67.85276,
    y: 203.7873,
    z: -93.57328,
    pathId: 2,
    cite: 'wailing_cavernsScripts.cpp:84 raptorLocations[1]',
  },
] as const;

// WP30 circle spawn positions (3 slots; each slot random Adder|Viper). Cite:
// wailing_cavernsScripts.cpp:87–92
export const CIRCLE_LOCATIONS = [
  { x: -50.1237, y: 274.7166, z: -92.7608, o: 3.0368 },
  { x: -60.2538, y: 273.0981, z: -92.7608, o: 0.4014 },
  { x: -57.5452, y: 280.2068, z: -92.7608, o: 5.0789 },
] as const;

// WP70 ritual wave 1 moccasin table (array has 3; comment says 6). Cite: wailing_cavernsScripts.cpp:102–107
export const MOCCASIN_LOCATIONS = [
  {
    creatureEntry: NPC_DEVIATE_MOCCASIN,
    x: 171.39545,
    y: 213.76605,
    z: -105.50746,
    pathId: 1,
    cite: 'wailing_cavernsScripts.cpp:104',
  },
  {
    creatureEntry: NPC_DEVIATE_MOCCASIN,
    x: 156.72229,
    y: 189.91829,
    z: -107.48995,
    pathId: 2,
    cite: 'wailing_cavernsScripts.cpp:105',
  },
  {
    creatureEntry: NPC_DEVIATE_MOCCASIN,
    x: 121.39977,
    y: 166.31746,
    z: -105.54061,
    pathId: 3,
    cite: 'wailing_cavernsScripts.cpp:106',
  },
] as const;

// WP70 ritual wave 2 ectoplasm table (array has 7; comment says 10). Cite:
// wailing_cavernsScripts.cpp:116–125
export const ECTOPLASM_LOCATIONS = [
  { creatureEntry: NPC_NIGHTMARE_ECTOPLASM, x: 162.06705, y: 218.71494, z: -105.3624, pathId: 1 },
  { creatureEntry: NPC_NIGHTMARE_ECTOPLASM, x: 115.55489, y: 168.22847, z: -105.68655, pathId: 2 },
  { creatureEntry: NPC_NIGHTMARE_ECTOPLASM, x: 82.065025, y: 280.37723, z: -103.29671, pathId: 3 },
  { creatureEntry: NPC_NIGHTMARE_ECTOPLASM, x: 144.84305, y: 278.07928, z: -104.57445, pathId: 4 },
  { creatureEntry: NPC_NIGHTMARE_ECTOPLASM, x: 155.84459, y: 186.68817, z: -107.08412, pathId: 5 },
  { creatureEntry: NPC_NIGHTMARE_ECTOPLASM, x: 145.35356, y: 219.346, z: -102.98572, pathId: 6 },
  { creatureEntry: NPC_NIGHTMARE_ECTOPLASM, x: 164.62735, y: 274.12335, z: -107.2978, pathId: 7 },
] as const;

/** Mutanus summon position (mutanosLocations). Cite: wailing_cavernsScripts.cpp:127 */
export const MUTANUS_SPAWN = {
  x: 150.94276,
  y: 262.79715,
  z: -103.90348,
  pathId: 1,
  cite: 'wailing_cavernsScripts.cpp:127 mutanosLocations',
} as const;

/** TEMPSPAWN_DEAD_DESPAWN for escort/ritual summons. Cite: cpp:278,341,354,370 20000 */
export const ESCORT_SUMMON_DESPAWN_MS = 20_000;

// Combat Sleep timer values. Reset: m_uiSleepTimer = 5000 (cpp:150) CAST_OK re-arm: 30000 (cpp:474) Target:
// SelectAttackingTarget(RANDOM, 1) = skip top threat (cpp:471)
export const DISCIPLE_SLEEP_INIT_MS = 5000;
export const DISCIPLE_SLEEP_REPEAT_MS = 30_000;

// Combat potion timer values (only when GetHealthPercent() < 80). Reset: m_uiPotionTimer = 5000 (cpp:151)
// CAST_OK re-arm: 45000 (cpp:458); else re-check 5000 (cpp:461) Cite: wailing_cavernsScripts.cpp:452-464
export const DISCIPLE_POTION_INIT_MS = 5000;
export const DISCIPLE_POTION_REPEAT_MS = 45_000;
export const DISCIPLE_POTION_HP_BELOW_PCT = 80;
export const DISCIPLE_POTION_RECHECK_MS = 5000;

// Escort / ritual phase machine (waypoint-paused subevents)

// Escort stop table (WaypointReached + UpdateEscortAI m_uiPoint switch). Cite:
// wailing_cavernsScripts.cpp:220–244 WaypointReached; :263–445 UpdateEscortAI
export const DISCIPLE_ESCORT_STOPS = [
  {
    pointId: 12,
    name: 'first_corner',
    eventTimerMs: 2000,
    cite: 'wailing_cavernsScripts.cpp:224-230 case 12 SAY_FIRST_CORNER + pause; timer 2000',
  },
  {
    pointId: 30,
    name: 'circle_banish',
    eventTimerMs: 1000,
    cite: 'wailing_cavernsScripts.cpp:231-236 case 30 pause; timer 1000',
  },
  {
    pointId: 70,
    name: 'naralex_chamber',
    eventTimerMs: 1000,
    cite: 'wailing_cavernsScripts.cpp:237-242 case 70 pause; timer 1000',
  },
] as const;

// Ritual / subevent steps at each escort stop (m_uiSubeventPhase). Cite: wailing_cavernsScripts.cpp:269–444
export const DISCIPLE_SUBEVENT_STEPS = [
  // ---- WP 12 first corner → raptors ----
  {
    pointId: 12,
    phase: 0,
    nextTimerMs: 0,
    action: 'summon_raptors' as const,
    textId: null as number | null,
    spellId: null as number | null,
    summons: [{ creatureEntry: NPC_DEVIATE_RAPTOR, count: 2 }],
    setData: null as { field: number; value: number } | null,
    cite: 'wailing_cavernsScripts.cpp:275-280 case 12/0 SummonCreature raptorLocations ×2; timer 0 wait kills',
  },
  {
    pointId: 12,
    phase: 1,
    nextTimerMs: 0,
    action: 'resume_escort' as const,
    textId: null,
    spellId: null,
    summons: [] as Array<{ creatureEntry: number; count: number }>,
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:282-286 case 12/1 SetEscortPaused(false) after all dead',
  },
  // ---- WP 30 circle ----
  {
    pointId: 30,
    phase: 0,
    nextTimerMs: 20_000,
    action: 'cast_cleansing' as const,
    textId: SAY_CIRCLE_BANISH,
    spellId: SPELL_CLEANSING,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:293-297 case 30/0 SAY_CIRCLE_BANISH + SPELL_CLEANSING; next 20000',
  },
  {
    pointId: 30,
    phase: 1,
    nextTimerMs: 0,
    action: 'summon_circle' as const,
    textId: null,
    spellId: null,
    // 3 slots random Adder|Viper — InstanceDef uses fixed 2×Adder+1×Viper
    summons: [
      { creatureEntry: NPC_DEVIATE_ADDER, count: 2 },
      { creatureEntry: NPC_DEVIATE_VIPER, count: 1 },
    ],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:299-304 case 30/1 3× urand Adder|Viper at circleLocations; timer 0 wait kills',
  },
  {
    pointId: 30,
    phase: 2,
    nextTimerMs: 10_000,
    action: 'wait_cast' as const,
    textId: null,
    spellId: null,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:306-310 case 30/2 wait 10000 after kills',
  },
  {
    pointId: 30,
    phase: 3,
    nextTimerMs: 0,
    action: 'resume_escort' as const,
    textId: SAY_PURIFIED,
    spellId: null,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:311-317 case 30/3 SAY_PURIFIED + resume; m_uiPoint++',
  },
  // ---- WP 70 chamber ritual ----
  {
    pointId: 70,
    phase: 0,
    nextTimerMs: 5000,
    action: 'begin_ritual' as const,
    textId: SAY_BEGIN_RITUAL,
    spellId: null,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:324-330 case 70/0 SAY_BEGIN_RITUAL; combat script; next 5000',
  },
  {
    pointId: 70,
    phase: 1,
    nextTimerMs: 3000,
    action: 'cast_awakening' as const,
    textId: EMOTE_RITUAL_BEGIN,
    spellId: SPELL_AWAKENING,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:332-336 case 70/1 SPELL_AWAKENING + EMOTE_RITUAL_BEGIN; next 3000',
  },
  {
    pointId: 70,
    phase: 2,
    nextTimerMs: 5000,
    action: 'summon_moccasins' as const,
    textId: null,
    spellId: null,
    summons: [{ creatureEntry: NPC_DEVIATE_MOCCASIN, count: 3 }],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:338-343 case 70/2 moccasinLocations ×3; next 5000',
  },
  {
    pointId: 70,
    phase: 3,
    nextTimerMs: 0,
    action: 'emote_naralex_awake' as const,
    textId: EMOTE_NARALEX_AWAKE,
    spellId: null,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:345-349 case 70/3 EMOTE_NARALEX_AWAKE; timer 0 wait kills',
  },
  {
    pointId: 70,
    phase: 4,
    nextTimerMs: 20_000,
    action: 'summon_ectoplasm' as const,
    textId: null,
    spellId: null,
    summons: [{ creatureEntry: NPC_NIGHTMARE_ECTOPLASM, count: 7 }],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:351-356 case 70/4 ectoplasmLocations ×7; next 20000',
  },
  {
    pointId: 70,
    phase: 5,
    nextTimerMs: 0,
    action: 'emote_break_through' as const,
    textId: EMOTE_BREAK_THROUGH,
    spellId: null,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:358-364 case 70/5 EMOTE_BREAK_THROUGH; timer 0 wait kills',
  },
  {
    pointId: 70,
    phase: 6,
    nextTimerMs: 0,
    action: 'summon_mutanus' as const,
    textId: EMOTE_VISION,
    spellId: null,
    summons: [{ creatureEntry: NPC_MUTANUS, count: 1 }],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:365-372 case 70/6 EMOTE_VISION + SummonCreature MUTANUS; timer 0 wait kill',
  },
  {
    pointId: 70,
    phase: 7,
    nextTimerMs: 5000,
    action: 'disciple_done' as const,
    textId: SAY_NARALEX_AWAKE,
    spellId: null,
    summons: [],
    setData: { field: TYPE_DISCIPLE, value: INSTANCE_DATA.DONE },
    cite: 'wailing_cavernsScripts.cpp:374-383 case 70/7 SAY_NARALEX_AWAKE + SetData(TYPE_DISCIPLE, DONE); next 5000',
  },
  {
    pointId: 70,
    phase: 8,
    nextTimerMs: 1000,
    action: 'interrupt_awakening' as const,
    textId: SAY_AWAKE,
    spellId: null,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:385-391 case 70/8 Interrupt SPELL_AWAKENING + SAY_AWAKE; next 1000',
  },
  {
    pointId: 70,
    phase: 9,
    nextTimerMs: 7000,
    action: 'naralex_thankyou' as const,
    textId: SAY_NARALEX_THANKYOU,
    spellId: null,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:393-400 case 70/9 SAY_NARALEX_THANKYOU; next 7000',
  },
  {
    pointId: 70,
    phase: 10,
    nextTimerMs: 3000,
    action: 'naralex_farewell' as const,
    textId: SAY_FAREWELL,
    spellId: null,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:401-410 case 70/10 SAY_FAREWELL; next 3000',
  },
  {
    pointId: 70,
    phase: 11,
    nextTimerMs: 8000,
    action: 'shapeshift' as const,
    textId: null,
    spellId: SPELL_SHAPESHIFT,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:412-418 case 70/11 SPELL_SHAPESHIFT on Naralex + Disciple; next 8000',
  },
  {
    pointId: 70,
    phase: 12,
    nextTimerMs: 30_000,
    action: 'fly_out' as const,
    textId: null,
    spellId: null,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:420-437 case 70/12 resume escort + levitate/hover; next 30000',
  },
  {
    pointId: 70,
    phase: 13,
    nextTimerMs: 0,
    action: 'despawn_all' as const,
    textId: null,
    spellId: null,
    summons: [],
    setData: null,
    cite: 'wailing_cavernsScripts.cpp:438-443 case 70/13 ForcedDespawn + DespawnAll()',
  },
] as const;

// Pure helpers — instance SetData 4-lord → TYPE_DISCIPLE SPECIAL

export interface WcEncounterState {
  /** m_auiEncounter[0..5] */
  encounters: number[];
}

export interface WcSetDataResult {
  encounters: number[];
  /** TYPE_DISCIPLE auto-promoted to SPECIAL. */
  disciplePromoted: boolean;
  /** First-time intro yell (SAY_INTRO) when promoting from NOT_STARTED. */
  introYell: boolean;
  cite: string;
}

// Port of instance_wailing_caverns::SetData: it stores the value, then promotes TYPE_DISCIPLE to
// SPECIAL once all four Fanglords are DONE, yelling the intro only the first time.
export function applyWailingCavernsSetData(
  state: WcEncounterState,
  uiType: number,
  uiData: number,
): WcSetDataResult {
  const encounters = state.encounters.slice();
  // cpp:70–87 switch write
  if (uiType >= 0 && uiType < WC_MAX_ENCOUNTER) {
    encounters[uiType] = uiData;
  }

  // cpp:90–101 four bosses DONE + disciple NOT_STARTED|FAIL → SPECIAL
  const fourDone =
    encounters[TYPE_ANACONDRA] === INSTANCE_DATA.DONE
    && encounters[TYPE_COBRAHN] === INSTANCE_DATA.DONE
    && encounters[TYPE_PYTHAS] === INSTANCE_DATA.DONE
    && encounters[TYPE_SERPENTIS] === INSTANCE_DATA.DONE;
  const disciple = encounters[TYPE_DISCIPLE] ?? INSTANCE_DATA.NOT_STARTED;
  const canPromote =
    fourDone && (disciple === INSTANCE_DATA.NOT_STARTED || disciple === INSTANCE_DATA.FAIL);

  if (canPromote) {
    const introYell = disciple === INSTANCE_DATA.NOT_STARTED;
    encounters[TYPE_DISCIPLE] = INSTANCE_DATA.SPECIAL;
    return {
      encounters,
      disciplePromoted: true,
      introYell,
      cite: introYell
        ? 'wailing_caverns.cpp:90-100 four DONE + NOT_STARTED → SPECIAL + SAY_INTRO'
        : 'wailing_caverns.cpp:90-100 four DONE + FAIL → SPECIAL (no intro re-yell)',
    };
  }

  return {
    encounters,
    disciplePromoted: false,
    introYell: false,
    cite: 'wailing_caverns.cpp:66-88 store only (gate not met)',
  };
}

// Pure helpers — escort subevent advance

export interface DiscipleSubeventQuery {
  pointId: number;
  phase: number;
}

export interface DiscipleSubeventResult {
  handled: boolean;
  nextTimerMs: number;
  action: string;
  textId: number | null;
  spellId: number | null;
  summons: Array<{ creatureEntry: number; count: number }>;
  setData: { field: number; value: number } | null;
  cite: string;
}

/** Lookup one subevent step at (pointId, phase). Cite: wailing_cavernsScripts.cpp:269–444 */
export function discipleSubeventStep(
  pointId: number,
  phase: number,
): DiscipleSubeventResult {
  const step = DISCIPLE_SUBEVENT_STEPS.find((s) => s.pointId === pointId && s.phase === phase);
  if (!step) {
    return {
      handled: false,
      nextTimerMs: 0,
      action: 'none',
      textId: null,
      spellId: null,
      summons: [],
      setData: null,
      cite: 'wailing_cavernsScripts.cpp:269-444 no subevent for point/phase',
    };
  }
  return {
    handled: true,
    nextTimerMs: step.nextTimerMs,
    action: step.action,
    textId: step.textId,
    spellId: step.spellId,
    summons: [...step.summons],
    setData: step.setData ? { ...step.setData } : null,
    cite: step.cite,
  };
}

/** Potion cast gate: only when HP% < 80. Cite: wailing_cavernsScripts.cpp:454-461 */
export function disciplePotionShouldCast(hpPct: number): boolean {
  return hpPct < DISCIPLE_POTION_HP_BELOW_PCT;
}

/** Potion timer re-arm after tick. Cite: wailing_cavernsScripts.cpp:456-461 */
export function disciplePotionRearmMs(castOk: boolean, hpPct: number): number {
  if (castOk && disciplePotionShouldCast(hpPct)) return DISCIPLE_POTION_REPEAT_MS;
  return DISCIPLE_POTION_RECHECK_MS;
}

/** Cite: sc_gossip.h:112 GOSSIP_ACTION_INFO_DEF = 1000 */
export const GOSSIP_ACTION_INFO_DEF = 1000;
/** Cite: wailing_cavernsScripts.cpp:496,512 GOSSIP_ACTION_INFO_DEF + 1 */
export const DISCIPLE_GOSSIP_ACTION_BEGIN = GOSSIP_ACTION_INFO_DEF + 1;

// GossipSelect INFO_DEF+1 starts escort path 3678 and JustStartedEscort sets TYPE_DISCIPLE
// IN_PROGRESS. The product stand-in sets wc-disciple-ritual, which mutanus requires.
export function discipleGossipSelectStart(action: number): {
  handled: boolean;
  pathId: number;
  setData: { field: number; value: number } | null;
  cite: string;
} {
  if (action !== DISCIPLE_GOSSIP_ACTION_BEGIN) {
    return {
      handled: false,
      pathId: 0,
      setData: null,
      cite: 'wailing_cavernsScripts.cpp:512 action != GOSSIP_ACTION_INFO_DEF+1',
    };
  }
  return {
    handled: true,
    pathId: PATH_ID_NARALEX,
    setData: { field: TYPE_DISCIPLE, value: INSTANCE_DATA.IN_PROGRESS },
    cite: 'wailing_cavernsScripts.cpp:512-518 Start(path 3678); :214-217 JustStartedEscort IN_PROGRESS',
  };
}

// instance_wailing_caverns

// instance_wailing_caverns, m_auiEncounter[6]: the four Fanglords, the Disciple and Mutanus. Four
// Fanglords DONE promotes the Disciple to SPECIAL. Bound via instance_template map 43.
export const INSTANCE_WAILING_CAVERNS: ScriptDevIR = {
  name: 'instance_wailing_caverns',
  boundCreatures: [],
  sourceFile: 'kalimdor/wailing_caverns/wailing_caverns.cpp',
  spellIds: [],
  timers: [],
  encounters: [],
  unusedBindings: [
    {
      entry: GO_MYSTERIOUS_CHEST,
      kind: 'go',
      reason:
        'GO 180055 Mysterious Chest is OnPlayerEnter quest-7944 conditional respawn (wailing_caverns.cpp:39-44); absent from product bake - IR ported',
      cite: 'wailing_caverns.cpp:39-44,60-63; wailing_caverns.h:24-26; loadRealBundle/gameobject-data missing 180055',
    },
  ],
  cites: [
    'wailing_caverns.cpp:29-167 instance body',
    'wailing_caverns.cpp:34-37 Initialize memset encounters',
    'wailing_caverns.cpp:39-44 OnPlayerEnter QUEST_FORTUNE_AWAITS → GO_MYSTERIOUS_CHEST',
    'wailing_caverns.cpp:47-58 OnCreatureCreate NARALEX/DISCIPLE store',
    'wailing_caverns.cpp:66-116 SetData 6 types + four-DONE → TYPE_DISCIPLE SPECIAL',
    'wailing_caverns.cpp:141-150 DespawnAll after Naralex leaves',
    'wailing_caverns.cpp:153-159 GetData',
    'wailing_caverns.cpp:161-167 AddSC_instance_wailing_caverns',
    'wailing_caverns.h:8-54',
    'no creature_template.ScriptName - instance_template map 43 (corpus boundCreatures empty)',
    'EventAI 3671/3669/3670/3673 DEATH SET_INST_DATA → fanglord DONE; 3654 → TYPE_MUTANUS',
  ],
};

// npc_disciple_of_naralex

// npc_disciple_of_naralexAI, creature 3678. Sleep init 5000 re-arm 30000 on a random non-tank; the
// sub-80% potion gate is a pure helper. The escort waypoints and their casts are a GAP.
export const NPC_DISCIPLE_OF_NARALEX: ScriptDevIR = {
  name: 'npc_disciple_of_naralex',
  boundCreatures: [NPC_DISCIPLE],
  sourceFile: 'kalimdor/wailing_caverns/wailing_cavernsScripts.cpp',
  spellIds: [
    SPELL_MARK,
    SPELL_SLEEP,
    SPELL_POTION,
    SPELL_CLEANSING,
    SPELL_AWAKENING,
    SPELL_SHAPESHIFT,
  ],
  timers: [
    {
      id: 'sleep',
      spellId: SPELL_SLEEP,
      // Reset m_uiSleepTimer = 5000 (cpp:150)
      initialMinMs: DISCIPLE_SLEEP_INIT_MS,
      initialMaxMs: DISCIPLE_SLEEP_INIT_MS,
      // CAST_OK re-arm 30000 (cpp:474)
      repeatMinMs: DISCIPLE_SLEEP_REPEAT_MS,
      repeatMaxMs: DISCIPLE_SLEEP_REPEAT_MS,
      // SelectAttackingTarget(RANDOM, 1) — skip top threat (cpp:471)
      target: 'hostile_random_not_top',
      select: { skipTopThreat: true },
      cite: 'wailing_cavernsScripts.cpp:150,469-475 Sleep init 5000 re-arm 30000 RANDOM skipTop',
    },
    // Potion is HP-gated (GetHealthPercent < 80). Shipped as timer for kit/schedule
    // presence; cast path should consult disciplePotionShouldCast. Re-arm 45s on success.
    {
      id: 'potion',
      spellId: SPELL_POTION,
      initialMinMs: DISCIPLE_POTION_INIT_MS,
      initialMaxMs: DISCIPLE_POTION_INIT_MS,
      repeatMinMs: DISCIPLE_POTION_REPEAT_MS,
      repeatMaxMs: DISCIPLE_POTION_REPEAT_MS,
      target: 'self',
      cite: 'wailing_cavernsScripts.cpp:151,452-464 Potion init 5000 re-arm 45000 when HP<80 (disciplePotionShouldCast)',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_AGGRO_1,
        cite: 'wailing_cavernsScripts.cpp:176-190 AttackedBy first-hit: 90% SAY_AGGRO_1 else SAY_AGGRO_2; Mutanus→SAY_MUTANUS; point>=30→SAY_AGGRO_3',
      },
    ],
    onReset: [
      {
        kind: 'set_instance_data',
        field: TYPE_DISCIPLE,
        // JustRespawned sets FAIL when not DONE — Reset itself does not SetData.
        // Documented; host onReset not used for FAIL (respawn path).
        value: INSTANCE_DATA.FAIL,
        cite: 'wailing_cavernsScripts.cpp:167-173 JustRespawned SetData(TYPE_DISCIPLE, FAIL) if not DONE',
      },
    ],
  },
  gossipHello: {
    defaultTextId: TEXT_ID_DISCIPLE,
    branches: [
      {
        gates: [
          {
            field: TYPE_DISCIPLE,
            equals: INSTANCE_DATA.SPECIAL,
            cite: 'wailing_cavernsScripts.cpp:494 GetData(TYPE_DISCIPLE) == SPECIAL',
          },
        ],
        textId: TEXT_ID_BEGIN,
        cite: 'wailing_cavernsScripts.cpp:496-497 TEXT_ID_BEGIN 699 + GOSSIP_ITEM_BEGIN',
      },
    ],
    cite: 'wailing_cavernsScripts.cpp:484-502 GossipHello_npc_disciple_of_naralex (+ Cast SPELL_MARK)',
  },
  cites: [
    'wailing_cavernsScripts.cpp:129-532 npc_disciple_of_naralex',
    'wailing_cavernsScripts.cpp:148-164 Reset combat timers + escort state',
    'wailing_cavernsScripts.cpp:167-173 JustRespawned FAIL',
    'wailing_cavernsScripts.cpp:176-190 AttackedBy aggro yells',
    'wailing_cavernsScripts.cpp:194-211 EnterEvadeMode special at point 30',
    'wailing_cavernsScripts.cpp:214-217 JustStartedEscort TYPE_DISCIPLE IN_PROGRESS',
    'wailing_cavernsScripts.cpp:220-244 WaypointReached 12/30/70',
    'wailing_cavernsScripts.cpp:246-261 JustSummoned / SummonedCreatureJustDied counter',
    'wailing_cavernsScripts.cpp:263-481 UpdateEscortAI subevents + combat',
    'wailing_cavernsScripts.cpp:484-521 GossipHello/Select + SPELL_MARK + path 3678',
    'wailing_cavernsScripts.cpp:512-518 GossipSelect INFO_DEF+1 → Start; discipleGossipSelectStart',
    'wailing_cavernsScripts.cpp:56-61 spell enum 5232/1090/8141/6270/6271/8153',
    'wailing_cavernsScripts.cpp:81-127 spawn tables',
    'sc_gossip.h:112 GOSSIP_ACTION_INFO_DEF=1000',
  ],
};
