// Westfall ScriptDev IR ports. Source: eastern_kingdoms/westfall.cpp — npc_daphne_stilwell,
// npc_defias_traitor and npc_foreman_klaven_mortwake. All three are in the bake.

import type { ScriptDevIR } from './types.ts';

// Constants — westfall.cpp npc_daphne_stilwell

// westfall.cpp:41–56
export const YELL_DEFIAS_START = -1000412;
export const YELL_DAPHNE_START = -1000413;
export const SAY_DS_START = -1000293;
export const SAY_WAVE_DOWN_1 = -1000294;
export const SAY_WAVE_DOWN_2 = -1000295;
export const SAY_WAVE_DOWN_3 = -1000414;
export const SAY_DS_DOWN_3 = -1000296;
export const SAY_DS_PROLOGUE = -1000297;

/** Cite: westfall.cpp:50 SPELL_SHOOT = 6660 */
export const SPELL_SHOOT = 6660;
/** Cite: westfall.cpp:51 QUEST_TOME_VALOR = 1651 */
export const QUEST_TOME_VALOR = 1651;
/** Cite: westfall.cpp:52 NPC_DEFIAS_RAIDER = 6180 */
export const NPC_DEFIAS_RAIDER = 6180;
/** Cite: westfall.cpp:53 EQUIP_ID_RIFLE = 2511 */
export const EQUIP_ID_RIFLE = 2511;
/** Cite: westfall.cpp:55 DAPHNE_SHOOT_CD = 2000 */
export const DAPHNE_SHOOT_CD_MS = 2000;

export const NPC_DAPHNE_STILWELL = 6182;

/** TEMPSPAWN_TIMED_OOC_DESPAWN for Defias Raider summons. Cite: westfall.cpp:193 30000 */
export const DAPHNE_RAIDER_DESPAWN_MS = 30_000;

/** Initial arm of custom wave timer at WP4. Cite: westfall.cpp:119 ResetTimer(1, 1 * IN_MILLISECONDS) */
export const DAPHNE_WAVE_ARM_MS = 1000;

/** Re-arm between waves while m_wave < 3. Cite: westfall.cpp:209 ResetTimer(1, 50 * IN_MILLISECONDS) */
export const DAPHNE_WAVE_REPEAT_MS = 50_000;

// Final wave index after third DoSendWave (++m_wave reaches 3). Cite: westfall.cpp:183-211; :252 m_wave ==
// 3 resume
export const DAPHNE_FINAL_WAVE = 3;

// RaiderCoords spawn / WP table (15 rows × xyz). Indices 0–4 spawn; 5–9 first MovePoint; 10–14 second
// MovePoint. Cite: westfall.cpp:65–84
export const RAIDER_COORDS = [
  { x: -11428.52, y: 1612.757, z: 72.241, cite: 'westfall.cpp:67 Spawn1' },
  { x: -11422.998, y: 1616.106, z: 74.153, cite: 'westfall.cpp:68 Spawn2' },
  { x: -11430.354, y: 1618.334, z: 72.632, cite: 'westfall.cpp:69 Spawn3' },
  { x: -11423.307, y: 1621.033, z: 74.224, cite: 'westfall.cpp:70 Spawn4' },
  { x: -11427.141, y: 1623.22, z: 73.168, cite: 'westfall.cpp:71 Spawn5' },
  { x: -11453.118, y: 1554.38, z: 53.1, cite: 'westfall.cpp:73 WP1a' },
  { x: -11449.692, y: 1554.672, z: 53.598, cite: 'westfall.cpp:74 WP2a' },
  { x: -11454.533, y: 1558.679, z: 52.497, cite: 'westfall.cpp:75 WP3a' },
  { x: -11449.488, y: 1557.817, z: 53.443, cite: 'westfall.cpp:76 WP4a' },
  { x: -11452.123, y: 1559.8, z: 52.89, cite: 'westfall.cpp:77 WP5a' },
  { x: -11475.067, y: 1534.259, z: 50.199, cite: 'westfall.cpp:79 WP1b' },
  { x: -11470.306, y: 1533.835, z: 50.267, cite: 'westfall.cpp:80 WP2b' },
  { x: -11471.954, y: 1539.599, z: 50.273, cite: 'westfall.cpp:81 WP3b' },
  { x: -11465.56, y: 1534.399, z: 50.649, cite: 'westfall.cpp:82 WP4b' },
  { x: -11467.391, y: 1537.989, z: 50.726, cite: 'westfall.cpp:83 WP5b' },
] as const;

/** firstWpOffset in DoSendWave. Cite: westfall.cpp:188 */
export const DAPHNE_FIRST_WP_OFFSET = 5;
/** secondWpOffset in SummonedMovementInform. Cite: westfall.cpp:221 */
export const DAPHNE_SECOND_WP_OFFSET = 10;

// Constants — westfall.cpp npc_defias_traitor

// westfall.cpp:339–348
export const SAY_START = 9;
export const SAY_PROGRESS = 10;
export const SAY_END = 11;
export const SAY_AGGRO_1 = 487;
export const SAY_AGGRO_2 = 485;
export const SAY_AGGRO_3 = 489;

/** Cite: westfall.cpp:347 DEFIAS_TRAITOR_PATH = 467 */
export const DEFIAS_TRAITOR_PATH = 467;
/** Cite: westfall.cpp:348 QUEST_DEFIAS_BROTHERHOOD = 155 */
export const QUEST_DEFIAS_BROTHERHOOD = 155;
export const NPC_DEFIAS_TRAITOR = 467;
/** Bake ender for quest 155. */
export const NPC_GRYAN_STOUTMANTLE = 234;

/** ForcedDespawn delay at WP94 after explore credit. Cite: westfall.cpp:374 ForcedDespawn(3000, true) */
export const DEFIAS_TRAITOR_DESPAWN_MS = 3000;

// Constants — westfall.cpp npc_foreman_klaven_mortwake

// westfall.cpp:411
export const SAY_STEALTH_ALERT_MORTWAKE = 3092;
export const NPC_KLAVEN_MORTWAKE = 7053;

// Pure helpers — Daphne Reset / Shoot timer / QuestAccept

export interface DaphneCombatState {
  /** m_shootTimer remaining ms. Cite: westfall.cpp:94,108 */
  shootTimerMs: number;
  /** m_wave (0 before first DoSendWave). Cite: westfall.cpp:95 */
  wave: number;
  /** m_introIsDone — first raider yelled YELL_DEFIAS_START. Cite: westfall.cpp:97 */
  introIsDone: boolean;
  /** Alive summoned raider count (GUID list size). Cite: westfall.cpp:99 */
  summonedRaiders: number;
  /** Escort paused waiting for waves. Cite: WP7 SetEscortPaused(true) */
  escortPaused: boolean;
  /** Combat movement enabled. Cite: WP7 false; WP9 true; Aggro false */
  combatMovement: boolean;
  /** Rifle equipped / ranged sheath. Cite: WP5 */
  rifleEquipped: boolean;
}

// Port of Reset when not escorting. Cite: westfall.cpp:101–109 When HasEscortState(STATE_ESCORT_ESCORTING)
// Reset returns early (no-op).
export function daphneReset(isEscorting: boolean, prior: DaphneCombatState): DaphneCombatState {
  // Cite: westfall.cpp:104-105 early return while escorting — no field changes.
  if (isEscorting) return prior;
  return {
    shootTimerMs: 0,
    // m_wave is not assigned in Reset body — only set at WP4 / after final clear
    wave: prior.wave,
    introIsDone: false,
    summonedRaiders: prior.summonedRaiders,
    escortPaused: prior.escortPaused,
    combatMovement: prior.combatMovement,
    rifleEquipped: prior.rifleEquipped,
  };
}

/** Idle pre-escort state. Cite: ctor Reset after fields. */
export function daphneInitialState(): DaphneCombatState {
  return {
    shootTimerMs: 0,
    wave: 0,
    introIsDone: false,
    summonedRaiders: 0,
    escortPaused: false,
    combatMovement: true,
    rifleEquipped: false,
  };
}

export interface DaphneQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  startEscort: boolean;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_daphne_stilwell. Cite: westfall.cpp:315–326 */
export function daphneQuestAccept(questId: number): DaphneQuestAcceptResult {
  if (questId !== QUEST_TOME_VALOR) {
    return {
      handled: false,
      textId: null,
      startEscort: false,
      questId,
      cite: 'westfall.cpp:317 quest != 1651 → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_DS_START,
    startEscort: true,
    questId: QUEST_TOME_VALOR,
    cite: 'westfall.cpp:319-322 SAY_DS_START + escort Start(true, player, quest)',
  };
}

// Pure helpers — Daphne WaypointReached

/** Escort WaypointReached actions. Cite: westfall.cpp:111–179 */
export const DAPHNE_WAYPOINTS = [
  {
    pointId: 4,
    textIds: [] as readonly number[],
    armWaveTimerMs: DAPHNE_WAVE_ARM_MS as number,
    equipRifle: false,
    setRun: null as boolean | null,
    yellDaphneStart: false,
    setCombatMovement: null as boolean | null,
    pauseEscort: false,
    questCredit: false,
    endEscort: false,
    cite: 'westfall.cpp:115-122 case 4 m_wave=0 ResetTimer(1,1000) emote USESTANDING',
  },
  {
    pointId: 5,
    textIds: [],
    armWaveTimerMs: 0,
    equipRifle: true,
    setRun: null,
    yellDaphneStart: false,
    setCombatMovement: null,
    pauseEscort: false,
    questCredit: false,
    endEscort: false,
    cite: 'westfall.cpp:123-129 case 5 equip rifle + sheath ranged + emote STAND',
  },
  {
    pointId: 7,
    textIds: [YELL_DAPHNE_START],
    armWaveTimerMs: 0,
    equipRifle: false,
    setRun: false,
    yellDaphneStart: true,
    setCombatMovement: false,
    pauseEscort: true,
    questCredit: false,
    endEscort: false,
    cite: 'westfall.cpp:131-138 case 7 SetRun(false) YELL_DAPHNE_START no combat move pause escort',
  },
  {
    pointId: 8,
    textIds: [SAY_DS_DOWN_3],
    armWaveTimerMs: 0,
    equipRifle: false,
    setRun: null,
    yellDaphneStart: false,
    setCombatMovement: null,
    pauseEscort: false,
    questCredit: false,
    endEscort: false,
    cite: 'westfall.cpp:140-145 case 8 SAY_DS_DOWN_3 + cheer',
  },
  {
    pointId: 9,
    textIds: [SAY_DS_PROLOGUE],
    armWaveTimerMs: 0,
    equipRifle: false,
    setRun: null,
    yellDaphneStart: false,
    setCombatMovement: true,
    pauseEscort: false,
    questCredit: false,
    endEscort: false,
    cite: 'westfall.cpp:147-151 case 9 SAY_DS_PROLOGUE + SetCombatMovement(true)',
  },
  {
    pointId: 12,
    textIds: [],
    armWaveTimerMs: 0,
    equipRifle: false,
    setRun: null,
    yellDaphneStart: false,
    setCombatMovement: null,
    pauseEscort: false,
    questCredit: false,
    endEscort: false,
    cite: 'westfall.cpp:153-158 case 12 restore equipment + unarmed sheath',
  },
  {
    pointId: 13,
    textIds: [],
    armWaveTimerMs: 0,
    equipRifle: false,
    setRun: null,
    yellDaphneStart: false,
    setCombatMovement: null,
    pauseEscort: false,
    questCredit: false,
    endEscort: false,
    cite: 'westfall.cpp:160-163 case 13 emote STAND',
  },
  {
    pointId: 16,
    textIds: [],
    armWaveTimerMs: 0,
    equipRifle: false,
    setRun: null,
    yellDaphneStart: false,
    setCombatMovement: null,
    pauseEscort: false,
    questCredit: true,
    endEscort: false,
    cite: 'westfall.cpp:165-169 case 16 RewardPlayerAndGroupAtEventExplored 1651',
  },
  {
    pointId: 17,
    textIds: [],
    armWaveTimerMs: 0,
    equipRifle: false,
    setRun: null,
    yellDaphneStart: false,
    setCombatMovement: null,
    pauseEscort: false,
    questCredit: false,
    endEscort: true,
    cite: 'westfall.cpp:171-174 case 17 DoEndEscort ForcedDespawn+Respawn',
  },
] as const;

export interface DaphneWaypointResult {
  handled: boolean;
  textIds: number[];
  /** Arm custom wave timer to this ms (0 = none). Also zeros m_wave at WP4. */
  armWaveTimerMs: number;
  resetWaveToZero: boolean;
  equipRifle: boolean;
  setRun: boolean | null;
  setCombatMovement: boolean | null;
  pauseEscort: boolean;
  questId: number | null;
  endEscort: boolean;
  cite: string;
}

/** Port of npc_daphne_stilwellAI::WaypointReached. Cite: westfall.cpp:111–179 */
export function daphneWaypointReached(pointId: number): DaphneWaypointResult {
  const step = DAPHNE_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      textIds: [],
      armWaveTimerMs: 0,
      resetWaveToZero: false,
      equipRifle: false,
      setRun: null,
      setCombatMovement: null,
      pauseEscort: false,
      questId: null,
      endEscort: false,
      cite: 'westfall.cpp:111-179 no case for this pointId',
    };
  }
  return {
    handled: true,
    textIds: [...step.textIds],
    armWaveTimerMs: step.armWaveTimerMs,
    resetWaveToZero: pointId === 4,
    equipRifle: step.equipRifle,
    setRun: step.setRun,
    setCombatMovement: step.setCombatMovement,
    pauseEscort: step.pauseEscort,
    questId: step.questCredit ? QUEST_TOME_VALOR : null,
    endEscort: step.endEscort,
    cite: step.cite,
  };
}

// Pure helpers — Daphne DoSendWave + SummonedCreatureJustDied

export interface DaphneSummon {
  creatureEntry: number;
  x: number;
  y: number;
  z: number;
  /** First MovePoint dest (RaiderCoords[5+counter]). */
  moveToX: number;
  moveToY: number;
  moveToZ: number;
  despawnMs: number;
  /** First-wave first-add YELL_DEFIAS_START. */
  yellDefiasStart: boolean;
  /** Leader (counter==0) roar emote. */
  roarEmote: boolean;
  /** MovePoint data id (= counter for first leg). Cite: westfall.cpp:195 */
  pointData: number;
}

export interface DaphneWaveState {
  wave: number;
  introIsDone: boolean;
  summonedRaiders: number;
  /** Custom timer 1 remaining ms; 0 = disabled. */
  waveTimerMs: number;
  escortPaused: boolean;
}

export interface DaphneSendWaveResult {
  spawned: boolean;
  summons: DaphneSummon[];
  next: DaphneWaveState;
  cite: string;
}

// Port of DoSendWave, called when the custom timer fires: past wave 2 it is a no-op, else it
// summons wave+2 raiders and re-arms 50 s. Cite: westfall.cpp:181–212.
export function daphneDoSendWave(state: DaphneWaveState): DaphneSendWaveResult {
  if (state.wave > 2) {
    return {
      spawned: false,
      summons: [],
      next: { ...state, waveTimerMs: 0 },
      cite: 'westfall.cpp:183-184 m_wave > 2 → return',
    };
  }
  const wave = state.wave + 1;
  const numberOfAdds = wave + 2;
  const summons: DaphneSummon[] = [];
  let introIsDone = state.introIsDone;
  for (let counter = 0; counter < numberOfAdds; counter++) {
    const spawn = RAIDER_COORDS[counter]!;
    const wp = RAIDER_COORDS[DAPHNE_FIRST_WP_OFFSET + counter]!;
    const yellDefiasStart = !introIsDone;
    if (!introIsDone) introIsDone = true;
    summons.push({
      creatureEntry: NPC_DEFIAS_RAIDER,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      moveToX: wp.x,
      moveToY: wp.y,
      moveToZ: wp.z,
      despawnMs: DAPHNE_RAIDER_DESPAWN_MS,
      yellDefiasStart,
      roarEmote: counter === 0,
      pointData: counter,
    });
  }
  const waveTimerMs = wave < 3 ? DAPHNE_WAVE_REPEAT_MS : 0;
  return {
    spawned: true,
    summons,
    next: {
      wave,
      introIsDone,
      summonedRaiders: state.summonedRaiders + summons.length,
      waveTimerMs,
      escortPaused: state.escortPaused,
    },
    cite:
      wave === 1
        ? 'westfall.cpp:186-211 wave1 numberOfAdds=3 ResetTimer 50s'
        : wave === 2
          ? 'westfall.cpp:186-211 wave2 numberOfAdds=4 ResetTimer 50s'
          : 'westfall.cpp:186-211 wave3 numberOfAdds=5 DisableTimer(1)',
  };
}

export interface DaphneRaiderDiedResult {
  textId: number | null;
  resumeEscort: boolean;
  next: DaphneWaveState;
  cite: string;
}

// Port of SummonedCreatureJustDied, the empty-GUID-list branch.
// Cite: westfall.cpp:246–275.
export function daphneSummonedCreatureJustDied(
  state: DaphneWaveState,
  roll02: number,
): DaphneRaiderDiedResult {
  const summonedRaiders = Math.max(0, state.summonedRaiders - 1);
  if (summonedRaiders > 0) {
    return {
      textId: null,
      resumeEscort: false,
      next: { ...state, summonedRaiders },
      cite: 'westfall.cpp:248-250 list not empty after remove',
    };
  }
  if (state.wave === DAPHNE_FINAL_WAVE) {
    return {
      textId: null,
      resumeEscort: true,
      next: {
        ...state,
        summonedRaiders: 0,
        wave: 0,
        escortPaused: false,
        waveTimerMs: 0,
      },
      cite: 'westfall.cpp:252-256 m_wave==3 SetEscortPaused(false) m_wave=0',
    };
  }
  const texts = [SAY_WAVE_DOWN_1, SAY_WAVE_DOWN_2, SAY_WAVE_DOWN_3] as const;
  const idx = roll02 === 0 || roll02 === 1 || roll02 === 2 ? roll02 : 0;
  return {
    textId: texts[idx]!,
    resumeEscort: false,
    next: { ...state, summonedRaiders: 0 },
    cite: 'westfall.cpp:258-272 urand(0,2) SAY_WAVE_DOWN_1/2/3',
  };
}

// Port of SummonedMovementInform second-leg MovePoint. Cite: westfall.cpp:214–227 data ≤ 4 → MovePoint(5,
// RaiderCoords[10+data]); else MoveIdle.
export function daphneSummonedMovementInform(data: number): {
  secondLeg: boolean;
  x: number;
  y: number;
  z: number;
  cite: string;
} {
  if (data <= 4) {
    const wp = RAIDER_COORDS[DAPHNE_SECOND_WP_OFFSET + data]!;
    return {
      secondLeg: true,
      x: wp.x,
      y: wp.y,
      z: wp.z,
      cite: 'westfall.cpp:219-223 data<=4 MovePoint second WP offset 10',
    };
  }
  return {
    secondLeg: false,
    x: 0,
    y: 0,
    z: 0,
    cite: 'westfall.cpp:226 MoveIdle',
  };
}

export interface DaphneAggroResult {
  combatMovement: boolean;
  cite: string;
}

/** Port of Aggro SetCombatMovement(false). Cite: westfall.cpp:229–232 */
export function daphneAggro(): DaphneAggroResult {
  return {
    combatMovement: false,
    cite: 'westfall.cpp:229-232 Aggro SetCombatMovement(false)',
  };
}

// Pure helpers — Defias Traitor

export interface DefiasTraitorQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  startEscort: boolean;
  pathId: number;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_defias_traitor. Cite: westfall.cpp:392–403 */
export function defiasTraitorQuestAccept(questId: number): DefiasTraitorQuestAcceptResult {
  if (questId !== QUEST_DEFIAS_BROTHERHOOD) {
    return {
      handled: false,
      textId: null,
      startEscort: false,
      pathId: 0,
      questId,
      cite: 'westfall.cpp:394 quest != 155 → no-op',
    };
  }
  return {
    handled: true,
    textId: SAY_START,
    startEscort: true,
    pathId: DEFIAS_TRAITOR_PATH,
    questId: QUEST_DEFIAS_BROTHERHOOD,
    cite: 'westfall.cpp:396-399 SAY_START + Start(true, player, quest, true, false, path 467)',
  };
}

/** Escort WaypointReached actions. Cite: westfall.cpp:359–377 */
export const DEFIAS_TRAITOR_WAYPOINTS = [
  {
    pointId: 65,
    textIds: [SAY_PROGRESS] as readonly number[],
    setRun: false as boolean | null,
    questCredit: false,
    forceDespawnMs: 0,
    cite: 'westfall.cpp:363-367 case 65 SetRun(false) SAY_PROGRESS',
  },
  {
    pointId: 94,
    textIds: [SAY_END],
    setRun: null,
    questCredit: true,
    forceDespawnMs: DEFIAS_TRAITOR_DESPAWN_MS,
    cite: 'westfall.cpp:368-374 case 94 SAY_END + explore 155 + ForcedDespawn(3000)',
  },
] as const;

export interface DefiasTraitorWaypointResult {
  handled: boolean;
  textIds: number[];
  setRun: boolean | null;
  questId: number | null;
  forceDespawnMs: number;
  cite: string;
}

/** Port of npc_defias_traitorAI::WaypointReached. Cite: westfall.cpp:359–377 */
export function defiasTraitorWaypointReached(pointId: number): DefiasTraitorWaypointResult {
  const step = DEFIAS_TRAITOR_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      textIds: [],
      setRun: null,
      questId: null,
      forceDespawnMs: 0,
      cite: 'westfall.cpp:359-377 no case for this pointId',
    };
  }
  return {
    handled: true,
    textIds: [...step.textIds],
    setRun: step.setRun,
    questId: step.questCredit ? QUEST_DEFIAS_BROTHERHOOD : null,
    forceDespawnMs: step.forceDespawnMs,
    cite: step.cite,
  };
}

export interface DefiasTraitorAggroResult {
  textId: number | null;
  cite: string;
}

// Port of the Aggro urand(0,3) yell branch; case 3 is silent.
// Cite: westfall.cpp:379–387.
export function defiasTraitorAggroYell(roll03: number): DefiasTraitorAggroResult {
  if (roll03 === 0) {
    return { textId: SAY_AGGRO_1, cite: 'westfall.cpp:383 case 0 SAY_AGGRO_1' };
  }
  if (roll03 === 1) {
    return { textId: SAY_AGGRO_2, cite: 'westfall.cpp:384 case 1 SAY_AGGRO_2' };
  }
  if (roll03 === 2) {
    return { textId: SAY_AGGRO_3, cite: 'westfall.cpp:385 case 2 SAY_AGGRO_3' };
  }
  return {
    textId: null,
    cite: 'westfall.cpp:381-386 urand(0,3) case 3 → silent (no default yell)',
  };
}

// Pure helpers — Klaven Mortwake stealth alert

export interface KlavenStealthAlertResult {
  textId: number;
  cite: string;
}

/** Port of OnStealthAlert. Cite: westfall.cpp:423–426 */
export function klavenStealthAlert(): KlavenStealthAlertResult {
  return {
    textId: SAY_STEALTH_ALERT_MORTWAKE,
    cite: 'westfall.cpp:423-426 OnStealthAlert DoBroadcastText(3092)',
  };
}

// npc_daphne_stilwell

// npc_daphne_stilwellAI, creature 6182. Shoot 6660 on the victim, init 0 and re-arm 2000 on
// CAST_OK. WP4 arms the three-wave raider event, and Defias Raider 6180 is in bake.
export const NPC_DAPHNE_STILWELL_SCRIPT: ScriptDevIR = {
  name: 'npc_daphne_stilwell',
  boundCreatures: [NPC_DAPHNE_STILWELL],
  sourceFile: 'eastern_kingdoms/westfall.cpp',
  spellIds: [SPELL_SHOOT],
  timers: [
    {
      id: 'shoot',
      spellId: SPELL_SHOOT,
      // Reset m_shootTimer = 0 (cpp:108); first cast ASAP in combat
      initialMinMs: 0,
      initialMaxMs: 0,
      // CAST_OK re-arm DAPHNE_SHOOT_CD = 2000 (cpp:306)
      repeatMinMs: DAPHNE_SHOOT_CD_MS,
      repeatMaxMs: DAPHNE_SHOOT_CD_MS,
      target: 'victim',
      cite: 'westfall.cpp:108,303-307 m_shootTimer init 0 re-arm 2000 SPELL_SHOOT 6660 victim',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset when not escorting: m_introIsDone=false m_shootTimer=0 (skip while escorting)',
        cite: 'westfall.cpp:101-109',
      },
    ],
    onAggro: [
      {
        kind: 'set_combat_movement',
        enabled: false,
        cite: 'westfall.cpp:229-232 Aggro SetCombatMovement(false)',
      },
    ],
    onDeath: [
      {
        kind: 'flavor',
        text: 'JustDied clears summoned raider GUID list then npc_escortAI::JustDied',
        cite: 'westfall.cpp:283-288',
      },
    ],
  },
  cites: [
    'westfall.cpp:35-331 npc_daphne_stilwell',
    'westfall.cpp:50-55 SPELL_SHOOT=6660 QUEST=1651 NPC_DEFIAS_RAIDER=6180 DAPHNE_SHOOT_CD=2000',
    'westfall.cpp:65-84 RaiderCoords spawn/WP table',
    'westfall.cpp:101-109 Reset (skip while escorting)',
    'westfall.cpp:111-179 WaypointReached WP4..17',
    'westfall.cpp:181-212 DoSendWave 3/4/5 raiders + 50s re-arm',
    'westfall.cpp:214-227 SummonedMovementInform second leg',
    'westfall.cpp:229-232 Aggro SetCombatMovement(false)',
    'westfall.cpp:246-275 SummonedCreatureJustDied wave clear / final resume',
    'westfall.cpp:296-312 UpdateEscortAI Shoot 6660 CD 2000 + melee',
    'westfall.cpp:315-326 QuestAccept 1651 SAY_DS_START + Start escort',
  ],
};

// npc_defias_traitor

// npc_defias_traitorAI, creature 467. No combat cast timers — Reset is empty. The escort path,
// waypoint dialogue and aggro yells are pure helpers, and the ctor sets REACT_DEFENSIVE.
export const NPC_DEFIAS_TRAITOR_SCRIPT: ScriptDevIR = {
  name: 'npc_defias_traitor',
  boundCreatures: [NPC_DEFIAS_TRAITOR],
  sourceFile: 'eastern_kingdoms/westfall.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'npc_escortAI Reset empty (no combat timers); REACT_DEFENSIVE in ctor',
        cite: 'westfall.cpp:355,389',
      },
    ],
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_AGGRO_1,
        cite: 'westfall.cpp:379-387 urand(0,3) SAY_AGGRO_1/2/3 or silent (IR samples first)',
      },
    ],
  },
  cites: [
    'westfall.cpp:333-403 npc_defias_traitor',
    'westfall.cpp:339-348 SAY_* QUEST_DEFIAS_BROTHERHOOD=155 DEFIAS_TRAITOR_PATH=467',
    'westfall.cpp:355 SetReactState(REACT_DEFENSIVE)',
    'westfall.cpp:359-377 WaypointReached WP65/94',
    'westfall.cpp:379-387 Aggro urand SAY_AGGRO_1/2/3',
    'westfall.cpp:389 Reset empty',
    'westfall.cpp:392-403 QuestAccept 155 SAY_START + Start path 467 instant respawn',
  ],
};

// npc_foreman_klaven_mortwake

// npc_foreman_klaven_mortwakeAI, creature 7053. No combat cast timers — Reset is empty and the
// script is an OnStealthAlert yell only.
export const NPC_FOREMAN_KLAVEN_MORTWAKE_SCRIPT: ScriptDevIR = {
  name: 'npc_foreman_klaven_mortwake',
  boundCreatures: [NPC_KLAVEN_MORTWAKE],
  sourceFile: 'eastern_kingdoms/westfall.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'ScriptedAI Reset empty; OnStealthAlert SAY 3092 only combat-adjacent hook',
        cite: 'westfall.cpp:421,423-426',
      },
    ],
  },
  cites: [
    'westfall.cpp:405-426 npc_foreman_klaven_mortwake',
    'westfall.cpp:411 SAY_STEALTH_ALERT_MORTWAKE=3092',
    'westfall.cpp:421 Reset empty',
    'westfall.cpp:423-426 OnStealthAlert DoBroadcastText',
  ],
};
