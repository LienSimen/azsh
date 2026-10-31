// Silverpine Forest ScriptDev IR ports. Source: eastern_kingdoms/silverpine_forest.cpp —
// npc_deathstalker_erland and npc_deathstalker_faerleia. Spell 3359 is absent from the bake.

import type { ScriptDevIR } from './types.ts';

// Constants — silverpine_forest.cpp npc_deathstalker_erland

// silverpine_forest.cpp:40–56
export const SAY_START_1 = -1000306;
export const SAY_START_2 = -1000307;
export const SAY_AGGRO_1 = -1000308;
export const SAY_AGGRO_2 = -1000309;
export const SAY_AGGRO_3 = -1000310;
export const SAY_PROGRESS = -1000311;
export const SAY_END = -1000312;
export const SAY_RANE = -1000313;
export const SAY_RANE_REPLY = -1000314;
export const SAY_CHECK_NEXT = -1000315;
export const SAY_QUINN = -1000316;
export const SAY_QUINN_REPLY = -1000317;
export const SAY_BYE = -1000318;

export const QUEST_ERLAND = 435;
export const NPC_RANE = 1950;
export const NPC_QUINN = 1951;
export const NPC_DEATHSTALKER_ERLAND = 1978;

// Constants — silverpine_forest.cpp npc_deathstalker_faerleia

// silverpine_forest.cpp:138–158
export const QUEST_PYREWOOD_AMBUSH = 452;
/** Cite: silverpine_forest.cpp:141 SPELL_DRINK_POTION = 3359 */
export const SPELL_DRINK_POTION = 3359;
export const SAY_START_FAERLEIA = -1000553;
export const SAY_COMPLETED = -1000554;

export const NPC_COUNCILMAN_SMITHERS = 2060;
export const NPC_COUNCILMAN_THATHER = 2061;
export const NPC_COUNCILMAN_HENDRICKS = 2062;
export const NPC_COUNCILMAN_WILHELM = 2063;
export const NPC_COUNCILMAN_HARTIN = 2064;
export const NPC_COUNCILMAN_COOPER = 2065;
export const NPC_COUNCILMAN_HIGARTH = 2066;
export const NPC_COUNCILMAN_BRUNSWICK = 2067;
export const NPC_LORD_MAYOR_MORRISON = 2068;
export const NPC_DEATHSTALKER_FAERLEIA = 2058;

// Initial / wave 0–1 re-arm wave timer. Cite: silverpine_forest.cpp:196 StartEvent; :257/:262 case 0–1 =
// 10000
export const FAERLEIA_WAVE_TIMER_MS = 10_000;

/** Wave 2 re-arm after 3-councilman spawn. Cite: silverpine_forest.cpp:268 m_uiWaveTimer = 8000 */
export const FAERLEIA_WAVE2_TIMER_MS = 8000;

/** TEMPSPAWN_CORPSE_TIMED_DESPAWN for council summons. Cite: silverpine_forest.cpp:256–273 20000 */
export const FAERLEIA_SUMMON_DESPAWN_MS = 20_000;

/** JustSummoned GetRandomPoint radius toward move coords. Cite: silverpine_forest.cpp:222 10.0f */
export const FAERLEIA_MOVE_RADIUS_YD = 10;

// UNIT_NPC_FLAG_QUESTGIVER stripped on StartEvent / restored on FinishEvent. Cite: Unit.h
// UNIT_NPC_FLAG_QUESTGIVER; silverpine_forest.cpp:192,205
export const UNIT_NPC_FLAG_QUESTGIVER = 0x00000002;

/** SpawnPoint table (index used by SummonCreature calls). Cite: silverpine_forest.cpp:169–174 */
export const FAERLEIA_SPAWN_POINTS = [
  {
    x: -397.45,
    y: 1509.56,
    z: 18.87,
    o: 4.73,
    cite: 'silverpine_forest.cpp:171 SpawnPoints[0]',
  },
  {
    x: -398.35,
    y: 1510.75,
    z: 18.87,
    o: 4.76,
    cite: 'silverpine_forest.cpp:172 SpawnPoints[1]',
  },
  {
    x: -396.41,
    y: 1511.06,
    z: 18.87,
    o: 4.74,
    cite: 'silverpine_forest.cpp:173 SpawnPoints[2]',
  },
] as const;

// JustSummoned MovePoint destination origin (GetRandomPoint center). Cite: silverpine_forest.cpp:176
// m_afMoveCoords
export const FAERLEIA_MOVE_COORDS = {
  x: -410.69,
  y: 1498.04,
  z: 19.77,
  cite: 'silverpine_forest.cpp:176 m_afMoveCoords',
} as const;

/** Wave index after final spawn (credit when == 4 and summons clear). Cite: cpp:235 */
export const FAERLEIA_FINAL_WAVE_COUNT = 4;

// Pure helpers — Erland WaypointReached + Aggro

/** Escort WaypointReached actions. Cite: silverpine_forest.cpp:63–99 */
export const ERLAND_WAYPOINTS = [
  {
    pointId: 1,
    textIds: [SAY_START_2] as readonly number[],
    /** Speaker entry when dialogue is from nearby NPC; null = self. */
    speakerEntry: null as number | null,
    questCredit: false,
    cite: 'silverpine_forest.cpp:72-74 case 1 SAY_START_2',
  },
  {
    pointId: 14,
    textIds: [SAY_END],
    speakerEntry: null,
    questCredit: true,
    cite: 'silverpine_forest.cpp:76-78 case 14 SAY_END + RewardPlayerAndGroupAtEventExplored 435',
  },
  {
    pointId: 15,
    textIds: [SAY_RANE],
    speakerEntry: NPC_RANE,
    questCredit: false,
    cite: 'silverpine_forest.cpp:79-82 case 15 SAY_RANE from closest Rane 1950',
  },
  {
    pointId: 16,
    textIds: [SAY_RANE_REPLY],
    speakerEntry: null,
    questCredit: false,
    cite: 'silverpine_forest.cpp:83-85 case 16 SAY_RANE_REPLY',
  },
  {
    pointId: 17,
    textIds: [SAY_CHECK_NEXT],
    speakerEntry: null,
    questCredit: false,
    cite: 'silverpine_forest.cpp:86-88 case 17 SAY_CHECK_NEXT',
  },
  {
    pointId: 25,
    textIds: [SAY_QUINN],
    speakerEntry: null,
    questCredit: false,
    cite: 'silverpine_forest.cpp:89-91 case 25 SAY_QUINN',
  },
  {
    pointId: 26,
    textIds: [SAY_QUINN_REPLY],
    speakerEntry: NPC_QUINN,
    questCredit: false,
    cite: 'silverpine_forest.cpp:92-95 case 26 SAY_QUINN_REPLY from closest Quinn 1951',
  },
  {
    pointId: 27,
    textIds: [SAY_BYE],
    speakerEntry: null,
    questCredit: false,
    cite: 'silverpine_forest.cpp:96-98 case 27 SAY_BYE',
  },
] as const;

export interface ErlandWaypointResult {
  handled: boolean;
  textIds: number[];
  speakerEntry: number | null;
  questId: number | null;
  cite: string;
}

// Port of npc_deathstalker_erlandAI::WaypointReached. Cite: silverpine_forest.cpp:63–99 Requires escort
// player (cpp:65–68 early return when missing).
export function erlandWaypointReached(
  pointId: number,
  hasEscortPlayer: boolean,
): ErlandWaypointResult {
  if (!hasEscortPlayer) {
    return {
      handled: false,
      textIds: [],
      speakerEntry: null,
      questId: null,
      cite: 'silverpine_forest.cpp:65-68 !pPlayer → return',
    };
  }
  const step = ERLAND_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      textIds: [],
      speakerEntry: null,
      questId: null,
      cite: 'silverpine_forest.cpp:63-99 no case for this pointId',
    };
  }
  return {
    handled: true,
    textIds: [...step.textIds],
    speakerEntry: step.speakerEntry,
    questId: step.questCredit ? QUEST_ERLAND : null,
    cite: step.cite,
  };
}

export interface ErlandAggroResult {
  textId: number;
  cite: string;
}

// Port of npc_deathstalker_erlandAI::Aggro, urand(0,2).
// Cite: silverpine_forest.cpp:104–112.
export function erlandAggroYell(roll02: number): ErlandAggroResult {
  const texts = [SAY_AGGRO_1, SAY_AGGRO_2, SAY_AGGRO_3] as const;
  const idx = roll02 === 0 || roll02 === 1 || roll02 === 2 ? roll02 : 0;
  return {
    textId: texts[idx]!,
    cite: 'silverpine_forest.cpp:106-111 urand(0,2) SAY_AGGRO_1/2/3',
  };
}

export interface ErlandQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  startEscort: boolean;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_deathstalker_erland. Cite: silverpine_forest.cpp:115–125 */
export function erlandQuestAccept(questId: number): ErlandQuestAcceptResult {
  if (questId !== QUEST_ERLAND) {
    return {
      handled: false,
      textId: null,
      startEscort: false,
      questId,
      cite: 'silverpine_forest.cpp:117 quest != 435 → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_START_1,
    startEscort: true,
    questId: QUEST_ERLAND,
    cite: 'silverpine_forest.cpp:119-122 SAY_START_1 + escort Start(false, player, quest)',
  };
}

// Pure helpers — Faerleia StartEvent / wave timer / death / finish

export interface FaerleiaEventState {
  eventStarted: boolean;
  waveTimerMs: number;
  summonCount: number;
  waveCount: number;
  /** QUESTGIVER flag present (cpp RemoveFlag/SetFlag). */
  questGiver: boolean;
}

export interface FaerleiaSummon {
  creatureEntry: number;
  x: number;
  y: number;
  z: number;
  o: number;
  despawnMs: number;
  /** JustSummoned MovePoint origin (GetRandomPoint center). */
  moveToX: number;
  moveToY: number;
  moveToZ: number;
  moveRadiusYd: number;
}

export interface FaerleiaStartEventResult {
  handled: boolean;
  next: FaerleiaEventState;
  textId: number | null;
  cite: string;
}

// Port of QuestAccept + StartEvent for Faerleia. Cite: silverpine_forest.cpp:290–300 accept; :190–199
// StartEvent
export function faerleiaQuestAccept(
  questId: number,
  prior: FaerleiaEventState,
): FaerleiaStartEventResult {
  if (questId !== QUEST_PYREWOOD_AMBUSH) {
    return {
      handled: false,
      next: prior,
      textId: null,
      cite: 'silverpine_forest.cpp:292 quest != 452 → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_START_FAERLEIA,
    next: {
      eventStarted: true,
      waveTimerMs: FAERLEIA_WAVE_TIMER_MS,
      summonCount: 0,
      waveCount: 0,
      questGiver: false,
    },
    cite: 'silverpine_forest.cpp:294-297 SAY_START + StartEvent timer=10000 wave=0 strip QUESTGIVER',
  };
}

/** Wave summon table by m_uiWaveCount before ++. Cite: silverpine_forest.cpp:253–274 */
export const FAERLEIA_WAVES = [
  {
    waveIndex: 0,
    entries: [
      { creatureEntry: NPC_COUNCILMAN_SMITHERS, spawnIndex: 1 },
    ] as readonly { creatureEntry: number; spawnIndex: number }[],
    nextTimerMs: FAERLEIA_WAVE_TIMER_MS,
    cite: 'silverpine_forest.cpp:255-258 case 0 Smithers SpawnPoints[1] timer=10000',
  },
  {
    waveIndex: 1,
    entries: [
      { creatureEntry: NPC_COUNCILMAN_THATHER, spawnIndex: 2 },
      { creatureEntry: NPC_COUNCILMAN_HENDRICKS, spawnIndex: 1 },
    ],
    nextTimerMs: FAERLEIA_WAVE_TIMER_MS,
    cite: 'silverpine_forest.cpp:259-263 case 1 Thather[2]+Hendricks[1] timer=10000',
  },
  {
    waveIndex: 2,
    entries: [
      { creatureEntry: NPC_COUNCILMAN_WILHELM, spawnIndex: 1 },
      { creatureEntry: NPC_COUNCILMAN_HARTIN, spawnIndex: 0 },
      { creatureEntry: NPC_COUNCILMAN_HIGARTH, spawnIndex: 2 },
    ],
    nextTimerMs: FAERLEIA_WAVE2_TIMER_MS,
    cite: 'silverpine_forest.cpp:264-269 case 2 Wilhelm[1]+Hartin[0]+Higarth[2] timer=8000',
  },
  {
    waveIndex: 3,
    entries: [
      { creatureEntry: NPC_COUNCILMAN_COOPER, spawnIndex: 1 },
      { creatureEntry: NPC_COUNCILMAN_BRUNSWICK, spawnIndex: 2 },
      { creatureEntry: NPC_LORD_MAYOR_MORRISON, spawnIndex: 0 },
    ],
    /** Final case does not re-arm timer (cpp:270-274 break only). */
    nextTimerMs: 0,
    cite: 'silverpine_forest.cpp:270-274 case 3 Cooper[1]+Brunswick[2]+Morrison[0]',
  },
] as const;

export interface FaerleiaWaveTickResult {
  /** Timer expired and wave spawned. */
  spawned: boolean;
  /** Timer still counting down. */
  waiting: boolean;
  summons: FaerleiaSummon[];
  next: FaerleiaEventState;
  cite: string;
}

function mkSummon(creatureEntry: number, spawnIndex: number): FaerleiaSummon {
  const sp = FAERLEIA_SPAWN_POINTS[spawnIndex]!;
  return {
    creatureEntry,
    x: sp.x,
    y: sp.y,
    z: sp.z,
    o: sp.o,
    despawnMs: FAERLEIA_SUMMON_DESPAWN_MS,
    moveToX: FAERLEIA_MOVE_COORDS.x,
    moveToY: FAERLEIA_MOVE_COORDS.y,
    moveToZ: FAERLEIA_MOVE_COORDS.z,
    moveRadiusYd: FAERLEIA_MOVE_RADIUS_YD,
  };
}

// Port of npc_deathstalker_faerleiaAI::UpdateAI wave branch, which only runs while the event is
// started and the prior wave is dead. Cite: silverpine_forest.cpp:247–281.
export function faerleiaWaveTick(
  state: FaerleiaEventState,
  diffMs: number,
): FaerleiaWaveTickResult {
  if (!state.eventStarted || state.summonCount !== 0) {
    return {
      spawned: false,
      waiting: false,
      summons: [],
      next: state,
      cite: 'silverpine_forest.cpp:249 !eventStarted or summonCount!=0 → skip wave arm',
    };
  }
  // Cite: silverpine_forest.cpp:251 if (m_uiWaveTimer < uiDiff) spawn else subtract
  if (!(state.waveTimerMs < diffMs)) {
    return {
      spawned: false,
      waiting: true,
      summons: [],
      next: { ...state, waveTimerMs: state.waveTimerMs - diffMs },
      cite: 'silverpine_forest.cpp:279-280 m_uiWaveTimer -= uiDiff',
    };
  }
  const wave = FAERLEIA_WAVES.find((w) => w.waveIndex === state.waveCount);
  if (!wave) {
    return {
      spawned: false,
      waiting: false,
      summons: [],
      next: { ...state, waveTimerMs: 0 },
      cite: 'silverpine_forest.cpp:253-274 no case for waveCount (past final)',
    };
  }
  const summons = wave.entries.map((e) => mkSummon(e.creatureEntry, e.spawnIndex));
  // JustSummoned ++ per summon (cpp:216-218)
  const nextCount = state.summonCount + summons.length;
  return {
    spawned: true,
    waiting: false,
    summons,
    next: {
      ...state,
      waveTimerMs: wave.nextTimerMs,
      summonCount: nextCount,
      waveCount: state.waveCount + 1,
    },
    cite: wave.cite,
  };
}

export interface FaerleiaSummonDiedResult {
  drinkPotion: boolean;
  spellId: number | null;
  completed: boolean;
  textId: number | null;
  questId: number | null;
  next: FaerleiaEventState;
  cite: string;
}

/** Port of SummonedCreatureJustDied. Cite: silverpine_forest.cpp:226–244 */
export function faerleiaSummonedCreatureJustDied(
  state: FaerleiaEventState,
): FaerleiaSummonDiedResult {
  const summonCount = Math.max(0, state.summonCount - 1);
  if (summonCount > 0) {
    return {
      drinkPotion: false,
      spellId: null,
      completed: false,
      textId: null,
      questId: null,
      next: { ...state, summonCount },
      cite: 'silverpine_forest.cpp:228 summonCount still > 0 after --',
    };
  }
  // Wave clear: potion always; final wave also credits + FinishEvent
  const completed = state.waveCount === FAERLEIA_FINAL_WAVE_COUNT;
  if (completed) {
    return {
      drinkPotion: true,
      spellId: SPELL_DRINK_POTION,
      completed: true,
      textId: SAY_COMPLETED,
      questId: QUEST_PYREWOOD_AMBUSH,
      next: {
        eventStarted: false,
        waveTimerMs: 0,
        summonCount: 0,
        waveCount: state.waveCount,
        questGiver: true,
      },
      cite: 'silverpine_forest.cpp:232-242 potion + waveCount==4 SAY_COMPLETED + explore 452 + FinishEvent',
    };
  }
  return {
    drinkPotion: true,
    spellId: SPELL_DRINK_POTION,
    completed: false,
    textId: null,
    questId: null,
    next: { ...state, summonCount: 0 },
    cite: 'silverpine_forest.cpp:232 DoCast SPELL_DRINK_POTION after wave clear (not final)',
  };
}

export interface FaerleiaJustDiedResult {
  questFailed: boolean;
  questId: number | null;
  next: FaerleiaEventState;
  cite: string;
}

/** Port of JustDied SendQuestFailed + FinishEvent. Cite: silverpine_forest.cpp:208–214 */
export function faerleiaJustDied(state: FaerleiaEventState): FaerleiaJustDiedResult {
  return {
    questFailed: state.eventStarted,
    questId: state.eventStarted ? QUEST_PYREWOOD_AMBUSH : null,
    next: {
      eventStarted: false,
      waveTimerMs: 0,
      summonCount: 0,
      waveCount: 0,
      questGiver: true,
    },
    cite: 'silverpine_forest.cpp:208-214 JustDied SendQuestFailed(452) + FinishEvent',
  };
}

/** Idle pre-event state. Cite: Reset empty + fields default before StartEvent. */
export function faerleiaInitialState(): FaerleiaEventState {
  return {
    eventStarted: false,
    waveTimerMs: 0,
    summonCount: 0,
    waveCount: 0,
    questGiver: true,
  };
}

// npc_deathstalker_erland

// npc_deathstalker_erlandAI, creature 1978. No combat cast timers — Reset is empty. The escort
// waypoints, aggro yells and quest accept are pure helpers.
export const NPC_DEATHSTALKER_ERLAND_SCRIPT: ScriptDevIR = {
  name: 'npc_deathstalker_erland',
  boundCreatures: [NPC_DEATHSTALKER_ERLAND],
  sourceFile: 'eastern_kingdoms/silverpine_forest.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'npc_escortAI Reset empty (no combat timers / no m_* state)',
        cite: 'silverpine_forest.cpp:102 Reset() override {}',
      },
    ],
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_AGGRO_1,
        cite: 'silverpine_forest.cpp:106-111 urand SAY_AGGRO_1/2/3 (IR samples first)',
      },
    ],
  },
  cites: [
    'silverpine_forest.cpp:34-130 npc_deathstalker_erland',
    'silverpine_forest.cpp:102 Reset empty',
    'silverpine_forest.cpp:104-112 Aggro urand SAY_AGGRO_1/2/3',
    'silverpine_forest.cpp:63-99 WaypointReached WP1/14/15-17/25-27',
    'silverpine_forest.cpp:76-78 WP14 explore credit 435 + SAY_END',
    'silverpine_forest.cpp:115-125 QuestAccept 435 SAY_START_1 + Start escort',
    'silverpine_forest.cpp:40-56 text + QUEST_ERLAND=435 NPC_RANE/QUINN',
  ],
};

// npc_deathstalker_faerleia

// npc_deathstalker_faerleiaAI, creature 2058. No combat cast timers on Reset; the four-wave defence
// event runs OOC-style. SPELL_DRINK_POTION 3359 and council summons 2060–2068 are absent from bake.
export const NPC_DEATHSTALKER_FAERLEIA_SCRIPT: ScriptDevIR = {
  name: 'npc_deathstalker_faerleia',
  boundCreatures: [NPC_DEATHSTALKER_FAERLEIA],
  sourceFile: 'eastern_kingdoms/silverpine_forest.cpp',
  spellIds: [SPELL_DRINK_POTION],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'ScriptedAI Reset empty; event fields arm on StartEvent only',
        cite: 'silverpine_forest.cpp:182 Reset() override {}',
      },
    ],
    onDeath: [
      {
        kind: 'flavor',
        text: 'JustDied SendQuestFailed(452) + FinishEvent when event was running',
        cite: 'silverpine_forest.cpp:208-214',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_COUNCILMAN_SMITHERS,
      kind: 'creature',
      reason:
        'NPC 2060 Councilman Smithers is wave-0 summon-only (silverpine_forest.cpp:256); absent from product bake - IR ported; FAERLEIA_WAVES documents summon',
      cite: 'silverpine_forest.cpp:147,256; loadRealBundle missing 2060',
    },
    {
      entry: NPC_COUNCILMAN_THATHER,
      kind: 'creature',
      reason:
        'NPC 2061 Councilman Thatcher is wave-1 summon-only; absent from product bake',
      cite: 'silverpine_forest.cpp:149,260; loadRealBundle missing 2061',
    },
    {
      entry: NPC_COUNCILMAN_HENDRICKS,
      kind: 'creature',
      reason:
        'NPC 2062 Councilman Hendricks is wave-1 summon-only; absent from product bake',
      cite: 'silverpine_forest.cpp:150,261; loadRealBundle missing 2062',
    },
    {
      entry: NPC_COUNCILMAN_WILHELM,
      kind: 'creature',
      reason:
        'NPC 2063 Councilman Wilhelm is wave-2 summon-only; absent from product bake',
      cite: 'silverpine_forest.cpp:152,265; loadRealBundle missing 2063',
    },
    {
      entry: NPC_COUNCILMAN_HARTIN,
      kind: 'creature',
      reason:
        'NPC 2064 Councilman Hartin is wave-2 summon-only; absent from product bake',
      cite: 'silverpine_forest.cpp:153,266; loadRealBundle missing 2064',
    },
    {
      entry: NPC_COUNCILMAN_HIGARTH,
      kind: 'creature',
      reason:
        'NPC 2066 Councilman Higarth is wave-2 summon-only; absent from product bake',
      cite: 'silverpine_forest.cpp:154,267; loadRealBundle missing 2066',
    },
    {
      entry: NPC_COUNCILMAN_COOPER,
      kind: 'creature',
      reason:
        'NPC 2065 Councilman Cooper is final-wave summon-only; absent from product bake',
      cite: 'silverpine_forest.cpp:156,271; loadRealBundle missing 2065',
    },
    {
      entry: NPC_COUNCILMAN_BRUNSWICK,
      kind: 'creature',
      reason:
        'NPC 2067 Councilman Brunswick is final-wave summon-only; absent from product bake',
      cite: 'silverpine_forest.cpp:157,272; loadRealBundle missing 2067',
    },
    {
      entry: NPC_LORD_MAYOR_MORRISON,
      kind: 'creature',
      reason:
        'NPC 2068 Lord Mayor Morrison is final-wave summon-only; absent from product bake',
      cite: 'silverpine_forest.cpp:158,273; loadRealBundle missing 2068',
    },
  ],
  cites: [
    'silverpine_forest.cpp:132-305 npc_deathstalker_faerleia',
    'silverpine_forest.cpp:182 Reset empty',
    'silverpine_forest.cpp:190-199 StartEvent strip QUESTGIVER timer=10000',
    'silverpine_forest.cpp:201-206 FinishEvent restore QUESTGIVER',
    'silverpine_forest.cpp:208-214 JustDied SendQuestFailed 452',
    'silverpine_forest.cpp:216-224 JustSummoned ++count MovePoint r10',
    'silverpine_forest.cpp:226-244 SummonedCreatureJustDied potion + final credit',
    'silverpine_forest.cpp:247-281 UpdateAI wave table Smithers→Morrison',
    'silverpine_forest.cpp:290-300 QuestAccept 452 SAY_START + StartEvent',
    'silverpine_forest.cpp:141 SPELL_DRINK_POTION=3359 (absent bake - GAPS)',
    'silverpine_forest.cpp:169-176 SpawnPoints + m_afMoveCoords',
  ],
};
