// Moonglade ScriptDev pure helpers (SESSION 10 batch). Companion to moonglade.ts IR exports. Cite:
// kalimdor/moonglade.cpp

import { INSTANCE_DATA } from './types.ts';
import {
  EMOTE_ERANIKUS_REDEEM,
  EMOTE_SUMMON_ERANIKUS,
  EMOTE_TYRANDE_KNEEL,
  ERANIKUS_ACID_BREATH_INIT_MS,
  ERANIKUS_HEALTH_CHECK_START,
  ERANIKUS_NOXIOUS_BREATH_INIT_MS,
  ERANIKUS_REDEEM_EVENT_START_MS,
  ERANIKUS_REDEEM_HP_PCT,
  ERANIKUS_SHADOWBOLT_INIT_MS,
  ERANIKUS_SPAWN,
  MAX_DEFENDERS,
  MAX_PRIESTESS,
  MAX_SHADOWS,
  MAX_SUMMON_TURNS,
  NPC_ERANIKUS_REDEEMED,
  NPC_ERANIKUS_TYRANT,
  NPC_REMULOS,
  QUEST_NIGHTMARE_MANIFESTS,
  REMULOS_HEAL_MS,
  REMULOS_HEAL_SPELLS,
  REMULOS_OUTRO_DESPAWN_MS,
  REMULOS_OUTRO_MS,
  REMULOS_SHADE_FIRST_MS,
  REMULOS_STARFIRE_INIT_MS,
  SAY_ERANIKUS_ATTACK_2,
  SAY_ERANIKUS_ATTACK_3,
  SAY_ERANIKUS_DEFEAT_1,
  SAY_ERANIKUS_DEFEAT_2,
  SAY_ERANIKUS_DEFEAT_3,
  SAY_ERANIKUS_SPAWN,
  SAY_REDEEMED_1,
  SAY_REDEEMED_2,
  SAY_REDEEMED_3,
  SAY_REDEEMED_4,
  SAY_REMULOS_DEFEND_1,
  SAY_REMULOS_DEFEND_2,
  SAY_REMULOS_DEFEND_3,
  SAY_REMULOS_INTRO_1,
  SAY_REMULOS_INTRO_2,
  SAY_REMULOS_INTRO_3,
  SAY_REMULOS_OUTRO_1,
  SAY_REMULOS_OUTRO_2,
  SAY_TYRANDE_APPEAR,
  SAY_TYRANDE_FORGIVEN_2,
  SAY_TYRANDE_FORGIVEN_3,
  SAY_TYRANDE_REDEEMED,
  SPELL_CONJURE_RIFT,
  SPELL_DRAGON_HOVER,
  TYPE_OMEN,
} from './moonglade.ts';

// Pure helpers — npc_keeper_remulos

export interface RemulosResetResult {
  healTimerMs: number;
  starfireTimerMs: number;
  shadeSummonTimerMs: number;
  outroTimerMs: number;
  outroPhase: number;
  summonCount: number;
  isFirstWave: boolean;
  clearEranikusGuid: boolean;
  cite: string;
}

// Port of Reset when not escorting.
// Cite: moonglade.cpp:195–210.
export function remulosReset(escorting: boolean): RemulosResetResult {
  if (escorting) {
    return {
      healTimerMs: REMULOS_HEAL_MS,
      starfireTimerMs: REMULOS_STARFIRE_INIT_MS,
      shadeSummonTimerMs: 0,
      outroTimerMs: 0,
      outroPhase: 0,
      summonCount: 0,
      isFirstWave: true,
      clearEranikusGuid: false,
      cite: 'moonglade.cpp:197 HasEscortState ESCORTING → keep event state; combat timers not re-inited in cpp when escorting (if-guard)',
    };
  }
  return {
    healTimerMs: REMULOS_HEAL_MS,
    starfireTimerMs: REMULOS_STARFIRE_INIT_MS,
    shadeSummonTimerMs: 0,
    outroTimerMs: 0,
    outroPhase: 0,
    summonCount: 0,
    isFirstWave: true,
    clearEranikusGuid: true,
    cite: 'moonglade.cpp:199-209 !escorting → clear outro/summon/guid; heal 10s starfire 25s',
  };
}

export interface RemulosQuestAcceptResult {
  handled: boolean;
  startEscort: boolean;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_keeper_remulos. Cite: moonglade.cpp:508–519 */
export function remulosQuestAccept(questId: number): RemulosQuestAcceptResult {
  if ((questId | 0) === QUEST_NIGHTMARE_MANIFESTS) {
    return {
      handled: true,
      startEscort: true,
      questId: QUEST_NIGHTMARE_MANIFESTS,
      cite: 'moonglade.cpp:510-513 quest 8736 → escortAI->Start(true, player, quest)',
    };
  }
  return {
    handled: false,
    startEscort: false,
    questId: 0,
    cite: 'moonglade.cpp:518-519 other quests → false (DB scripts e.g. 8447)',
  };
}

export interface RemulosWaypointResult {
  handled: boolean;
  textId: number | null;
  setPvpFlag: boolean;
  startDialogue: boolean;
  dialogueEntry: number | null;
  pauseEscort: boolean;
  cite: string;
}

/** Port of WaypointReached. Cite: moonglade.cpp:279–305 */
export function remulosWaypointReached(pointId: number): RemulosWaypointResult {
  switch (pointId | 0) {
    case 1:
      return {
        handled: true,
        textId: SAY_REMULOS_INTRO_1,
        setPvpFlag: true,
        startDialogue: false,
        dialogueEntry: null,
        pauseEscort: false,
        cite: 'moonglade.cpp:283-289 WP1 SAY_REMULOS_INTRO_1 + UNIT_FLAG_PVP',
      };
    case 2:
      return {
        handled: true,
        textId: SAY_REMULOS_INTRO_2,
        setPvpFlag: false,
        startDialogue: false,
        dialogueEntry: null,
        pauseEscort: false,
        cite: 'moonglade.cpp:291-293 WP2 SAY_REMULOS_INTRO_2',
      };
    case 14:
      return {
        handled: true,
        textId: null,
        setPvpFlag: false,
        startDialogue: true,
        dialogueEntry: NPC_REMULOS,
        pauseEscort: true,
        cite: 'moonglade.cpp:294-297 WP14 StartNextDialogueText(NPC_REMULOS) + pause',
      };
    case 18:
      return {
        handled: true,
        textId: null,
        setPvpFlag: false,
        startDialogue: true,
        dialogueEntry: SAY_REMULOS_DEFEND_2,
        pauseEscort: true,
        cite: 'moonglade.cpp:298-300 WP18 StartNextDialogueText(SAY_REMULOS_DEFEND_2) + pause',
      };
    case 19:
      return {
        handled: true,
        textId: null,
        setPvpFlag: false,
        startDialogue: false,
        dialogueEntry: null,
        pauseEscort: true,
        cite: 'moonglade.cpp:302-304 WP19 SetEscortPaused(true)',
      };
    default:
      return {
        handled: false,
        textId: null,
        setPvpFlag: false,
        startDialogue: false,
        dialogueEntry: null,
        pauseEscort: false,
        cite: 'moonglade.cpp:279 unknown WP → no-op',
      };
  }
}

export interface RemulosDialogueStepResult {
  handled: boolean;
  textId: number | null;
  castConjureRift: boolean;
  emoteSummonEranikus: boolean;
  moveEranikusFlight: boolean;
  resumeEscort: boolean;
  faceEranikus: boolean;
  setCenarionFaction: boolean;
  armShadeSummonMs: number | null;
  pauseEscort: boolean;
  cite: string;
}

/** Port of JustDidDialogueStep. Cite: moonglade.cpp:320–355 */
export function remulosDialogueStep(entry: number): RemulosDialogueStepResult {
  switch (entry | 0) {
    case NPC_REMULOS:
      return {
        handled: true,
        textId: SAY_REMULOS_INTRO_3,
        castConjureRift: false,
        emoteSummonEranikus: false,
        moveEranikusFlight: false,
        resumeEscort: false,
        faceEranikus: false,
        setCenarionFaction: false,
        armShadeSummonMs: null,
        pauseEscort: false,
        cite: 'moonglade.cpp:324-327 NPC_REMULOS step → SAY_REMULOS_INTRO_3 to player',
      };
    case SPELL_CONJURE_RIFT:
      return {
        handled: true,
        textId: null,
        castConjureRift: true,
        emoteSummonEranikus: false,
        moveEranikusFlight: false,
        resumeEscort: false,
        faceEranikus: false,
        setCenarionFaction: false,
        armShadeSummonMs: null,
        pauseEscort: false,
        cite: 'moonglade.cpp:328-330 DoCastSpellIfCan(SPELL_CONJURE_RIFT 25813)',
      };
    case SAY_ERANIKUS_SPAWN:
      return {
        handled: true,
        textId: EMOTE_SUMMON_ERANIKUS,
        castConjureRift: false,
        emoteSummonEranikus: true,
        moveEranikusFlight: false,
        resumeEscort: false,
        faceEranikus: false,
        setCenarionFaction: false,
        armShadeSummonMs: null,
        pauseEscort: false,
        cite: 'moonglade.cpp:331-334 SAY_ERANIKUS_SPAWN step → EMOTE_SUMMON_ERANIKUS on Eranikus',
      };
    case NPC_ERANIKUS_TYRANT:
      return {
        handled: true,
        textId: SAY_REMULOS_DEFEND_1,
        castConjureRift: false,
        emoteSummonEranikus: false,
        moveEranikusFlight: true,
        resumeEscort: true,
        faceEranikus: false,
        setCenarionFaction: false,
        armShadeSummonMs: null,
        pauseEscort: false,
        cite: 'moonglade.cpp:336-344 DEFEND_1 + remove hover + MovePoint FLIGHT + resume escort',
      };
    case SAY_REMULOS_DEFEND_2:
      return {
        handled: true,
        textId: null,
        castConjureRift: false,
        emoteSummonEranikus: false,
        moveEranikusFlight: false,
        resumeEscort: false,
        faceEranikus: true,
        setCenarionFaction: false,
        armShadeSummonMs: null,
        pauseEscort: false,
        cite: 'moonglade.cpp:346-348 face Eranikus',
      };
    case SAY_REMULOS_DEFEND_3:
      return {
        handled: true,
        textId: null,
        castConjureRift: false,
        emoteSummonEranikus: false,
        moveEranikusFlight: false,
        resumeEscort: false,
        faceEranikus: false,
        setCenarionFaction: true,
        armShadeSummonMs: REMULOS_SHADE_FIRST_MS,
        pauseEscort: true,
        cite: 'moonglade.cpp:350-353 pause + faction 996 + shadesummon 5s',
      };
    default:
      return {
        handled: false,
        textId: null,
        castConjureRift: false,
        emoteSummonEranikus: false,
        moveEranikusFlight: false,
        resumeEscort: false,
        faceEranikus: false,
        setCenarionFaction: false,
        armShadeSummonMs: null,
        pauseEscort: false,
        cite: 'moonglade.cpp:322 unknown dialogue step → no-op',
      };
  }
}

// Port of the heal urand(0,2) spell pick.
// Cite: moonglade.cpp:476-481.
export function remulosPickHealSpell(roll0to2: number): number {
  const idx = ((roll0to2 | 0) % 3 + 3) % 3;
  return REMULOS_HEAL_SPELLS[idx]!;
}

export interface RemulosShadeWaveResult {
  firstWaveHouseSummons: boolean;
  phantasmCount: number;
  defenderCount: number;
  eranikusAttackYell: boolean;
  nextSummonCount: number;
  landEranikus: boolean;
  nextTimerMs: number;
  isFirstWave: boolean;
  cite: string;
}

// Port of the shade summon timer fire; `shadeRepeatRollMs` is a pre-rolled urand(20,30)s re-arm.
// Cite: moonglade.cpp:398–465.
export function remulosShadeWaveFire(
  isFirstWave: boolean,
  summonCount: number,
  livingDefenders: number,
  shadeRepeatRollMs: number,
): RemulosShadeWaveResult {
  let count = summonCount | 0;
  let first = isFirstWave;
  let house = false;
  let phantasms = 0;
  let defenders = 0;
  let yell = false;

  if (first) {
    // cpp:404-423 first wave: house shades + full defenders + ATTACK_1
    house = true;
    phantasms = MAX_SHADOWS;
    defenders = MAX_DEFENDERS;
    yell = true;
    count += 1;
    first = false;
  }

  // cpp: always continues into the outside-wave block after first-wave arm — first fire therefore
  // increments twice (0→1 house, then 1→2 outside). Cite: moonglade.cpp:404-449
  if (count < MAX_SUMMON_TURNS) {
    // cpp:431-448 outside shades + refill defenders
    if (!house) {
      phantasms = MAX_SHADOWS;
      const missing = Math.max(0, MAX_DEFENDERS - (livingDefenders | 0));
      defenders = missing;
    } else {
      // First-fire also summons outside shades (cpp does not skip this block).
      phantasms = MAX_SHADOWS; // house already counted; product may stack both
      // Defender refill: list just filled to MAX so missing typically 0.
      const missing = Math.max(0, MAX_DEFENDERS - (livingDefenders | 0) - defenders);
      defenders += missing;
    }
    count += 1;
  }

  if (count === MAX_SUMMON_TURNS) {
    return {
      firstWaveHouseSummons: house,
      phantasmCount: phantasms,
      defenderCount: defenders,
      eranikusAttackYell: yell,
      nextSummonCount: count,
      landEranikus: true,
      nextTimerMs: 0,
      isFirstWave: first,
      cite: 'moonglade.cpp:453-459 summonCount==MAX_SUMMON_TURNS → land Eranikus combat point; timer=0',
    };
  }

  return {
    firstWaveHouseSummons: house,
    phantasmCount: phantasms,
    defenderCount: defenders,
    eranikusAttackYell: yell,
    nextSummonCount: count,
    landEranikus: false,
    nextTimerMs: shadeRepeatRollMs,
    isFirstWave: first,
    cite: 'moonglade.cpp:462 re-arm urand(20,30)s for next shade wave',
  };
}

export interface RemulosOutroResult {
  exploreQuestId: number;
  despawnDefenders: boolean;
  clearPvpFlag: boolean;
  outroTimerMs: number;
  cite: string;
}

/** Port of DoHandleOutro (quest credit + arm outro). Cite: moonglade.cpp:358–368 */
export function remulosDoHandleOutro(): RemulosOutroResult {
  return {
    exploreQuestId: QUEST_NIGHTMARE_MANIFESTS,
    despawnDefenders: true,
    clearPvpFlag: true,
    outroTimerMs: REMULOS_OUTRO_MS,
    cite: 'moonglade.cpp:360-367 explore 8736 + despawn defenders + clear PVP + outro 3s',
  };
}

export interface RemulosOutroTickResult {
  textId: number | null;
  forceDespawnMs: number;
  nextOutroTimerMs: number;
  nextOutroPhase: number;
  cite: string;
}

/** Port of outro timer switch. Cite: moonglade.cpp:374–396 */
export function remulosOutroTick(outroPhase: number): RemulosOutroTickResult {
  switch (outroPhase | 0) {
    case 0:
      return {
        textId: SAY_REMULOS_OUTRO_1,
        forceDespawnMs: 0,
        nextOutroTimerMs: REMULOS_OUTRO_MS,
        nextOutroPhase: 1,
        cite: 'moonglade.cpp:380-383 phase0 SAY_REMULOS_OUTRO_1 + timer 3s',
      };
    case 1:
      return {
        textId: SAY_REMULOS_OUTRO_2,
        forceDespawnMs: REMULOS_OUTRO_DESPAWN_MS,
        nextOutroTimerMs: 0,
        nextOutroPhase: 2,
        cite: 'moonglade.cpp:384-389 phase1 SAY_REMULOS_OUTRO_2 + ForcedDespawn 3s',
      };
    default:
      return {
        textId: null,
        forceDespawnMs: 0,
        nextOutroTimerMs: 0,
        nextOutroPhase: outroPhase | 0,
        cite: 'moonglade.cpp:374 outro done',
      };
  }
}

export interface ConjureDreamRiftResult {
  summonEntry: number;
  spawn: typeof ERANIKUS_SPAWN;
  castHover: boolean;
  hoverSpellId: number;
  setHover: boolean;
  cite: string;
}

/** Port of ConjureDreamRift SpellScript OnEffectExecute INDEX_0. Cite: moonglade.cpp:898–912 */
export function conjureDreamRiftOnEffect(): ConjureDreamRiftResult {
  return {
    summonEntry: NPC_ERANIKUS_TYRANT,
    spawn: ERANIKUS_SPAWN,
    castHover: true,
    hoverSpellId: SPELL_DRAGON_HOVER,
    setHover: true,
    cite: 'moonglade.cpp:905-909 SummonCreature 15491 + SPELL_DRAGON_HOVER TRIGGERED + SetHover',
  };
}

// Pure helpers — boss_eranikus

export interface EranikusResetResult {
  acidBreathMs: number;
  noxiousBreathMs: number;
  shadowboltMs: number;
  healthCheck: number;
  eventPhase: number;
  eventTimerMs: number;
  tyrandeMoveMs: number;
  combatMovement: boolean;
  cite: string;
}

/** Port of boss_eranikusAI::Reset. Cite: moonglade.cpp:561–577 */
export function eranikusReset(): EranikusResetResult {
  return {
    acidBreathMs: ERANIKUS_ACID_BREATH_INIT_MS,
    noxiousBreathMs: ERANIKUS_NOXIOUS_BREATH_INIT_MS,
    shadowboltMs: ERANIKUS_SHADOWBOLT_INIT_MS,
    healthCheck: ERANIKUS_HEALTH_CHECK_START,
    eventPhase: 0,
    eventTimerMs: 0,
    tyrandeMoveMs: 0,
    combatMovement: false,
    cite: 'moonglade.cpp:563-576 timers + healthCheck=85 + SetCombatMovement(false)',
  };
}

export interface EranikusHealthCheckResult {
  handled: boolean;
  /** Next m_healthCheck after this threshold (0 = redeem done). */
  nextHealthCheck: number;
  textId: number | null;
  /** Temporary Tyrande for appear yell only (1s despawn). */
  summonTyrandeAppear: boolean;
  /** Permanent Tyrande mount summon. */
  summonTyrandeMount: boolean;
  summonPriestessCount: number;
  tyrandeTextId: number | null;
  enterEvadeRedeem: boolean;
  cite: string;
}

// Port of the m_healthCheck switch when GetHealthPercent() drops below the current threshold.
// Cite: moonglade.cpp:813–860.
export function eranikusHealthCheck(
  healthCheck: number,
  hpPct: number,
): EranikusHealthCheckResult {
  if (!(hpPct < healthCheck)) {
    return {
      handled: false,
      nextHealthCheck: healthCheck,
      textId: null,
      summonTyrandeAppear: false,
      summonTyrandeMount: false,
      summonPriestessCount: 0,
      tyrandeTextId: null,
      enterEvadeRedeem: false,
      cite: 'moonglade.cpp:813 HP not below healthCheck → skip',
    };
  }
  switch (healthCheck | 0) {
    case 85:
      return {
        handled: true,
        nextHealthCheck: 75,
        textId: SAY_ERANIKUS_ATTACK_3,
        summonTyrandeAppear: true,
        summonTyrandeMount: false,
        summonPriestessCount: 0,
        tyrandeTextId: SAY_TYRANDE_APPEAR,
        enterEvadeRedeem: false,
        cite: 'moonglade.cpp:817-822 case 85 ATTACK_3 + temp Tyrande SAY_TYRANDE_APPEAR → 75',
      };
    case 75:
      return {
        handled: true,
        nextHealthCheck: 50,
        textId: SAY_ERANIKUS_ATTACK_3,
        summonTyrandeAppear: false,
        summonTyrandeMount: false,
        summonPriestessCount: 0,
        tyrandeTextId: null,
        enterEvadeRedeem: false,
        cite: 'moonglade.cpp:824-827 case 75 ATTACK_3 → 50',
      };
    case 50:
      return {
        handled: true,
        nextHealthCheck: 35,
        textId: null,
        summonTyrandeAppear: false,
        summonTyrandeMount: true,
        summonPriestessCount: 0,
        tyrandeTextId: null,
        enterEvadeRedeem: false,
        cite: 'moonglade.cpp:829-833 case 50 summon Tyrande mounted → 35',
      };
    case 35:
      return {
        handled: true,
        nextHealthCheck: 31,
        textId: SAY_ERANIKUS_DEFEAT_1,
        summonTyrandeAppear: false,
        summonTyrandeMount: false,
        summonPriestessCount: MAX_PRIESTESS,
        tyrandeTextId: null,
        enterEvadeRedeem: false,
        cite: 'moonglade.cpp:835-839 case 35 DoSummonHealers×7 + DEFEAT_1 → 31',
      };
    case 31:
      return {
        handled: true,
        nextHealthCheck: 27,
        textId: null,
        summonTyrandeAppear: false,
        summonTyrandeMount: false,
        summonPriestessCount: 0,
        tyrandeTextId: SAY_TYRANDE_FORGIVEN_2,
        enterEvadeRedeem: false,
        cite: 'moonglade.cpp:841-844 case 31 Tyrande FORGIVEN_2 → 27',
      };
    case 27:
      return {
        handled: true,
        nextHealthCheck: 25,
        textId: null,
        summonTyrandeAppear: false,
        summonTyrandeMount: false,
        summonPriestessCount: 0,
        tyrandeTextId: SAY_TYRANDE_FORGIVEN_3,
        enterEvadeRedeem: false,
        cite: 'moonglade.cpp:846-849 case 27 Tyrande FORGIVEN_3 → 25',
      };
    case 25:
      return {
        handled: true,
        nextHealthCheck: 20,
        textId: SAY_ERANIKUS_DEFEAT_2,
        summonTyrandeAppear: false,
        summonTyrandeMount: false,
        summonPriestessCount: 0,
        tyrandeTextId: null,
        enterEvadeRedeem: false,
        cite: 'moonglade.cpp:851-853 case 25 DEFEAT_2 → 20',
      };
    case 20:
      return {
        handled: true,
        nextHealthCheck: 0,
        textId: SAY_ERANIKUS_DEFEAT_3,
        summonTyrandeAppear: false,
        summonTyrandeMount: false,
        summonPriestessCount: 0,
        tyrandeTextId: null,
        enterEvadeRedeem: true,
        cite: 'moonglade.cpp:855-859 case 20 DEFEAT_3 + EnterEvadeMode redeem',
      };
    default:
      return {
        handled: false,
        nextHealthCheck: healthCheck,
        textId: null,
        summonTyrandeAppear: false,
        summonTyrandeMount: false,
        summonPriestessCount: 0,
        tyrandeTextId: null,
        enterEvadeRedeem: false,
        cite: 'moonglade.cpp:815 unknown healthCheck',
      };
  }
}

export interface EranikusEnterEvadeResult {
  redeem: boolean;
  updateEntry: number | null;
  eventTimerMs: number;
  forceDespawnSelf: boolean;
  despawnPriestess: boolean;
  remulosEvade: boolean;
  cite: string;
}

// Port of the EnterEvadeMode branch on HP%.
// Cite: moonglade.cpp:579–612.
export function eranikusEnterEvade(hpPct: number): EranikusEnterEvadeResult {
  if (hpPct < ERANIKUS_REDEEM_HP_PCT) {
    return {
      redeem: true,
      updateEntry: NPC_ERANIKUS_REDEEMED,
      eventTimerMs: ERANIKUS_REDEEM_EVENT_START_MS,
      forceDespawnSelf: false,
      despawnPriestess: true,
      remulosEvade: true,
      cite: 'moonglade.cpp:581-601 HP<20 → stop combat + remulos evade + despawn priestess + UpdateEntry 15628 + event 5s',
    };
  }
  return {
    redeem: false,
    updateEntry: null,
    eventTimerMs: 0,
    forceDespawnSelf: true,
    despawnPriestess: true,
    remulosEvade: false,
    cite: 'moonglade.cpp:603-611 HP≥20 evade mid-event → ForcedDespawn self + priestess + Tyrande',
  };
}

export interface EranikusRedeemEventResult {
  handled: boolean;
  textId: number | null;
  tyrandeTextId: number | null;
  tyrandeKneel: boolean;
  castRedeemed: boolean;
  moveRedeemedPoint: boolean;
  standUp: boolean;
  callRemulosOutro: boolean;
  forceDespawnSelfMs: number;
  forceDespawnTyrandeMs: number;
  nextEventTimerMs: number;
  nextEventPhase: number;
  cite: string;
}

/** Port of m_eventTimer redeem phase switch. Cite: moonglade.cpp:725–790 */
export function eranikusRedeemEventPhase(eventPhase: number): EranikusRedeemEventResult {
  switch (eventPhase | 0) {
    case 0:
      return {
        handled: true,
        textId: EMOTE_ERANIKUS_REDEEM,
        tyrandeTextId: EMOTE_TYRANDE_KNEEL,
        tyrandeKneel: true,
        castRedeemed: false,
        moveRedeemedPoint: false,
        standUp: false,
        callRemulosOutro: false,
        forceDespawnSelfMs: 0,
        forceDespawnTyrandeMs: 0,
        nextEventTimerMs: 5_000,
        nextEventPhase: 1,
        cite: 'moonglade.cpp:731-745 phase0 Tyrande kneel + EMOTE_ERANIKUS_REDEEM + stand dead + 5s',
      };
    case 1:
      return {
        handled: true,
        textId: null,
        tyrandeTextId: SAY_TYRANDE_REDEEMED,
        tyrandeKneel: false,
        castRedeemed: false,
        moveRedeemedPoint: false,
        standUp: false,
        callRemulosOutro: false,
        forceDespawnSelfMs: 0,
        forceDespawnTyrandeMs: 0,
        nextEventTimerMs: 6_000,
        nextEventPhase: 2,
        cite: 'moonglade.cpp:747-750 phase1 SAY_TYRANDE_REDEEMED + 6s',
      };
    case 2:
      return {
        handled: true,
        textId: null,
        tyrandeTextId: null,
        tyrandeKneel: false,
        castRedeemed: true,
        moveRedeemedPoint: false,
        standUp: false,
        callRemulosOutro: false,
        forceDespawnSelfMs: 0,
        forceDespawnTyrandeMs: 0,
        nextEventTimerMs: 5_000,
        nextEventPhase: 3,
        cite: 'moonglade.cpp:752-755 phase2 SPELL_ERANIKUS_REDEEMED 25846 + 5s',
      };
    case 3:
      return {
        handled: true,
        textId: null,
        tyrandeTextId: null,
        tyrandeKneel: false,
        castRedeemed: false,
        moveRedeemedPoint: true,
        standUp: true,
        callRemulosOutro: false,
        forceDespawnSelfMs: 0,
        forceDespawnTyrandeMs: 0,
        nextEventTimerMs: 0,
        nextEventPhase: 4,
        cite: 'moonglade.cpp:757-762 phase3 stand + MovePoint REDEEMED (timer 0 until MovementInform)',
      };
    case 4:
      // SAY_REDEEMED_1 was MovementInform POINT_REDEEMED (cpp:715-716);
      // case 4 timer fire says SAY_REDEEMED_2.
      return {
        handled: true,
        textId: SAY_REDEEMED_2,
        tyrandeTextId: null,
        tyrandeKneel: false,
        castRedeemed: false,
        moveRedeemedPoint: false,
        standUp: false,
        callRemulosOutro: false,
        forceDespawnSelfMs: 0,
        forceDespawnTyrandeMs: 0,
        nextEventTimerMs: 11_000,
        nextEventPhase: 5,
        cite: 'moonglade.cpp:764-766 phase4 SAY_REDEEMED_2 + 11s',
      };
    case 5:
      return {
        handled: true,
        textId: SAY_REDEEMED_3,
        tyrandeTextId: null,
        tyrandeKneel: false,
        castRedeemed: false,
        moveRedeemedPoint: false,
        standUp: false,
        callRemulosOutro: false,
        forceDespawnSelfMs: 0,
        forceDespawnTyrandeMs: 0,
        nextEventTimerMs: 13_000,
        nextEventPhase: 6,
        cite: 'moonglade.cpp:768-770 phase5 SAY_REDEEMED_3 + 13s',
      };
    case 6:
      return {
        handled: true,
        textId: SAY_REDEEMED_4,
        tyrandeTextId: null,
        tyrandeKneel: false,
        castRedeemed: false,
        moveRedeemedPoint: false,
        standUp: false,
        callRemulosOutro: false,
        forceDespawnSelfMs: 0,
        forceDespawnTyrandeMs: 0,
        nextEventTimerMs: 7_000,
        nextEventPhase: 7,
        cite: 'moonglade.cpp:772-774 phase6 SAY_REDEEMED_4 + 7s',
      };
    case 7:
      return {
        handled: true,
        textId: null,
        tyrandeTextId: null,
        tyrandeKneel: false,
        castRedeemed: false,
        moveRedeemedPoint: false,
        standUp: false,
        callRemulosOutro: true,
        forceDespawnSelfMs: 2_000,
        forceDespawnTyrandeMs: 9_000,
        nextEventTimerMs: 0,
        nextEventPhase: 8,
        cite: 'moonglade.cpp:776-787 phase7 Tyrande stand+despawn 9s + Remulos DoHandleOutro + self despawn 2s',
      };
    default:
      return {
        handled: false,
        textId: null,
        tyrandeTextId: null,
        tyrandeKneel: false,
        castRedeemed: false,
        moveRedeemedPoint: false,
        standUp: false,
        callRemulosOutro: false,
        forceDespawnSelfMs: 0,
        forceDespawnTyrandeMs: 0,
        nextEventTimerMs: 0,
        nextEventPhase: eventPhase | 0,
        cite: 'moonglade.cpp:729 event done',
      };
  }
}

/** Port of MovementInform POINT_ID_ERANIKUS_REDEEMED. Cite: moonglade.cpp:713–717 */
export function eranikusMovementInformRedeemed(): {
  textId: number;
  eventTimerMs: number;
  cite: string;
} {
  return {
    textId: SAY_REDEEMED_1,
    eventTimerMs: 11_000,
    cite: 'moonglade.cpp:715-716 SAY_REDEEMED_1 + m_eventTimer=11s',
  };
}

/** Port of MovementInform POINT_ID_ERANIKUS_COMBAT land. Cite: moonglade.cpp:701–711 */
export function eranikusMovementInformCombat(): {
  immuneNpc: boolean;
  immunePlayer: boolean;
  attackStart: boolean;
  textId: number;
  removeHover: boolean;
  cite: string;
} {
  return {
    immuneNpc: false,
    immunePlayer: false,
    attackStart: true,
    textId: SAY_ERANIKUS_ATTACK_2,
    removeHover: true,
    cite: 'moonglade.cpp:704-710 clear immune + AttackStart + ATTACK_2 + remove hover',
  };
}

// Pure helpers — go_omen_cluster

export interface OmenClusterUseResult {
  handled: boolean;
  setDataField: number | null;
  setDataValue: number | null;
  cite: string;
}

// Port of GOUse_go_omen_cluster; `hasSpawner` is true for an engineering-crafted launcher.
// Cite: moonglade.cpp:919–935.
export function omenClusterUse(
  hasSpawner: boolean,
  hasInstance: boolean,
): OmenClusterUseResult {
  if (hasSpawner) {
    return {
      handled: false,
      setDataField: null,
      setDataValue: null,
      cite: 'moonglade.cpp:923-924 GetSpawner() → false (only static cluster launchers)',
    };
  }
  if (!hasInstance) {
    return {
      handled: false,
      setDataField: null,
      setDataValue: null,
      cite: 'moonglade.cpp:928-929 !pInstance → false',
    };
  }
  return {
    handled: true,
    setDataField: TYPE_OMEN,
    setDataValue: INSTANCE_DATA.NOT_STARTED,
    cite: 'moonglade.cpp:933 SetData(TYPE_OMEN, NOT_STARTED) → world map Omen counter',
  };
}
