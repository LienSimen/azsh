// Stonetalon Mountains ScriptDev IR ports. Source: scripts/kalimdor/stonetalon_mountains.cpp —
// npc_kaya (escort 6523) and go_covert_ops (GO 19590). Every value cites file:line below.

import type { ScriptDevIR } from './types.ts';

// Shared faction / tempfaction

/** FACTION_ESCORT_H_PASSIVE. Cite: ScriptDevAIMgr.h:56 = 775; stonetalon_mountains.cpp:95 */
export const FACTION_ESCORT_H_PASSIVE = 775;

// TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h TEMPFACTION_RESTORE_RESPAWN=0x01;
// stonetalon_mountains.cpp:95
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;

/** TEMPFACTION_TOGGLE_IMMUNE_TO_NPC. Cite: Creature.h:582 = 0x20; stonetalon_mountains.cpp:95 */
export const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;

// Constants — npc_kaya

// stonetalon_mountains.cpp:37–45
/** Cite: stonetalon_mountains.cpp:37 NPC_GRIMTOTEM_RUFFIAN = 11910 */
export const NPC_GRIMTOTEM_RUFFIAN = 11910;
/** Cite: stonetalon_mountains.cpp:38 NPC_GRIMTOTEM_BRUTE = 11912 */
export const NPC_GRIMTOTEM_BRUTE = 11912;
/** Cite: stonetalon_mountains.cpp:39 NPC_GRIMTOTEM_SORCERER = 11913 */
export const NPC_GRIMTOTEM_SORCERER = 11913;

/** Cite: stonetalon_mountains.cpp:41 SAY_START = -1000357 */
export const SAY_START = -1_000_357;
/** Cite: stonetalon_mountains.cpp:42 SAY_AMBUSH = -1000358 */
export const SAY_AMBUSH = -1_000_358;
/** Cite: stonetalon_mountains.cpp:43 SAY_END = -1000359 */
export const SAY_END = -1_000_359;

/** Cite: stonetalon_mountains.cpp:45 QUEST_PROTECT_KAYA = 6523 */
export const QUEST_PROTECT_KAYA = 6523;

/** Bound creature. Cite: scriptdev-corpus boundCreatures entry 11856 */
export const NPC_KAYA = 11856;

// Quest turn-in NPC (Makaba Flathoof) — bake ender, not ScriptName. Cite: quests.json enderCreatureEntries
// [11857]
export const NPC_MAKABA_FLATHOOF = 11857;

/** TEMPSPAWN_CORPSE_TIMED_DESPAWN for ambush grimtotems. Cite: stonetalon_mountains.cpp:69-71 30000 */
export const KAYA_AMBUSH_DESPAWN_MS = 30_000;

/** Ambush summons at WP17 (fixed world coords). Cite: stonetalon_mountains.cpp:69-71 */
export const KAYA_AMBUSH_SPAWNS = [
  {
    entry: NPC_GRIMTOTEM_RUFFIAN,
    x: -50.75,
    y: -500.77,
    z: -46.13,
    o: 0.4,
    cite: 'stonetalon_mountains.cpp:69 NPC_GRIMTOTEM_RUFFIAN',
  },
  {
    entry: NPC_GRIMTOTEM_BRUTE,
    x: -40.05,
    y: -510.89,
    z: -46.05,
    o: 1.7,
    cite: 'stonetalon_mountains.cpp:70 NPC_GRIMTOTEM_BRUTE',
  },
  {
    entry: NPC_GRIMTOTEM_SORCERER,
    x: -32.21,
    y: -499.2,
    z: -45.35,
    o: 2.8,
    cite: 'stonetalon_mountains.cpp:71 NPC_GRIMTOTEM_SORCERER',
  },
] as const;

/** Ambush pack size. Cite: stonetalon_mountains.cpp:69-71 three SummonCreature */
export const KAYA_AMBUSH_COUNT = 3;

// Constants — go_covert_ops

// stonetalon_mountains.cpp:111–123
/** Cite: stonetalon_mountains.cpp:111 NPC_VENTURE_DEFORESTER = 3991 */
export const NPC_VENTURE_DEFORESTER = 3991;
/** Cite: stonetalon_mountains.cpp:112 NPC_VENTURE_LOGGER = 3989 */
export const NPC_VENTURE_LOGGER = 3989;
/** Cite: stonetalon_mountains.cpp:113 NPC_VENTURE_DIGGER = 3999 */
export const NPC_VENTURE_DIGGER = 3999;
/** Cite: stonetalon_mountains.cpp:114 NPC_VENTURE_OVERLORD = 4004 */
export const NPC_VENTURE_OVERLORD = 4004;
/** Cite: stonetalon_mountains.cpp:115 NPC_VENTURE_OPERATOR = 3988 */
export const NPC_VENTURE_OPERATOR = 3988;

// Venture Co. entries gathered on wagon trap deactivation. Cite: stonetalon_mountains.cpp:123
// ventureCoList[5]
export const VENTURE_CO_LIST = [
  NPC_VENTURE_DEFORESTER,
  NPC_VENTURE_LOGGER,
  NPC_VENTURE_DIGGER,
  NPC_VENTURE_OVERLORD,
  NPC_VENTURE_OPERATOR,
] as const;

/** Cite: stonetalon_mountains.cpp:118 PHASE_INACTIVE = 0 */
export const PHASE_INACTIVE = 0;
/** Cite: stonetalon_mountains.cpp:119 PHASE_CALLING = 1 */
export const PHASE_CALLING = 1;
/** Cite: stonetalon_mountains.cpp:120 PHASE_HOMING = 2 */
export const PHASE_HOMING = 2;

/** GO entry for go_covert_ops. Cite: scriptdev2.sql:538 WHERE entry=19590 */
export const GO_VENTURE_WAGON_TRAP = 19590;

// m_callTimer arm on Reset / JustSpawned. Cite: stonetalon_mountains.cpp:140 m_callTimer = 2 *
// IN_MILLISECONDS Common.h:119 IN_MILLISECONDS = 1000
export const COVERT_OPS_CALL_TIMER_MS = 2_000;

// m_returnTimer arm on Reset / JustSpawned. Cite: stonetalon_mountains.cpp:141 m_returnTimer = 45 *
// IN_MILLISECONDS
export const COVERT_OPS_RETURN_TIMER_MS = 45_000;

// Gather radius for Venture Co. NPCs. Cite: stonetalon_mountains.cpp:153-155
// AllCreaturesOfEntryInRangeCheck 100.0f
export const COVERT_OPS_GATHER_RADIUS_YD = 100;

// Contact-point offset when calling NPCs to wagon. Cite: stonetalon_mountains.cpp:177 GetContactPoint
// radius 10.0f
export const COVERT_OPS_CONTACT_RADIUS_YD = 10;

// Pure helpers — npc_kaya

export interface KayaAmbushSummon {
  creatureEntry: number;
  x: number;
  y: number;
  z: number;
  o: number;
  despawnMs: number;
  /** JustSummoned: AttackStart escort NPC (Kaya). Cite: stonetalon_mountains.cpp:56 */
  attackEscort: boolean;
}

export interface KayaWaypointResult {
  handled: boolean;
  textIds: number[];
  summons: KayaAmbushSummon[];
  questId: number | null;
  cite: string;
}

// Port of npc_kayaAI::WaypointReached ambush summons (WP17). Cite: stonetalon_mountains.cpp:69-71 +
// JustSummoned 54–57
export function kayaDoSpawnAmbush(): KayaAmbushSummon[] {
  return KAYA_AMBUSH_SPAWNS.map((spawn) => ({
    creatureEntry: spawn.entry,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    o: spawn.o,
    despawnMs: KAYA_AMBUSH_DESPAWN_MS,
    attackEscort: true,
  }));
}

/** Port of npc_kayaAI::WaypointReached. Cite: stonetalon_mountains.cpp:59–81 */
export function kayaWaypointReached(pointId: number): KayaWaypointResult {
  switch (pointId) {
    case 17:
      return {
        handled: true,
        textIds: [SAY_AMBUSH],
        summons: kayaDoSpawnAmbush(),
        questId: null,
        cite: 'stonetalon_mountains.cpp:64-72 case 17 SAY_AMBUSH + 3× Grimtotem TEMPSPAWN 30000',
      };
    case 19:
      return {
        handled: true,
        textIds: [SAY_END],
        summons: [],
        questId: QUEST_PROTECT_KAYA,
        cite: 'stonetalon_mountains.cpp:74-79 case 19 SAY_END + RewardPlayerAndGroupAtEventExplored(6523)',
      };
    default:
      return {
        handled: false,
        textIds: [],
        summons: [],
        questId: null,
        cite: 'stonetalon_mountains.cpp:59-81 no case for this pointId',
      };
  }
}

export interface KayaJustSummonedResult {
  handled: boolean;
  attackEscort: boolean;
  cite: string;
}

/** Port of npc_kayaAI::JustSummoned — any ambush pack attacks Kaya. Cite: stonetalon_mountains.cpp:54–57 */
export function kayaJustSummoned(summonedEntry: number): KayaJustSummonedResult {
  const isAmbush = KAYA_AMBUSH_SPAWNS.some((s) => s.entry === summonedEntry);
  if (!isAmbush) {
    return {
      handled: false,
      attackEscort: false,
      cite: 'stonetalon_mountains.cpp:54-57 entry not ambush pack → no-op (AI still AttackStart any summon)',
    };
  }
  return {
    handled: true,
    attackEscort: true,
    cite: 'stonetalon_mountains.cpp:56 pSummoned->AI()->AttackStart(m_creature)',
  };
}

export interface KayaQuestAcceptResult {
  handled: boolean;
  factionId: number;
  factionFlags: number;
  textId: number | null;
  startEscort: boolean;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_kaya. Cite: stonetalon_mountains.cpp:89–102 */
export function kayaQuestAccept(questId: number): KayaQuestAcceptResult {
  if (questId !== QUEST_PROTECT_KAYA) {
    return {
      handled: false,
      factionId: 0,
      factionFlags: 0,
      textId: null,
      startEscort: false,
      questId,
      cite: 'stonetalon_mountains.cpp:93 quest != 6523 → no-op',
    };
  }
  return {
    handled: true,
    factionId: FACTION_ESCORT_H_PASSIVE,
    factionFlags: TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC,
    textId: SAY_START,
    startEscort: true,
    questId: QUEST_PROTECT_KAYA,
    cite: 'stonetalon_mountains.cpp:95-99 faction 775 RESTORE|TOGGLE_IMMUNE_NPC + SAY_START + Start(false)',
  };
}

// Pure helpers — go_covert_ops

export type CovertOpsPhase =
  | typeof PHASE_INACTIVE
  | typeof PHASE_CALLING
  | typeof PHASE_HOMING;

export interface CovertOpsState {
  phase: CovertOpsPhase;
  callTimerMs: number;
  returnTimerMs: number;
  /** Entries gathered on deactivation (runtime list of nearby Venture Co.). */
  ventureNpcEntries: number[];
}

/** Port of go_covertopsAI::Reset / JustSpawned. Cite: stonetalon_mountains.cpp:137–142, 160–163 */
export function covertOpsReset(): CovertOpsState {
  return {
    phase: PHASE_INACTIVE,
    callTimerMs: COVERT_OPS_CALL_TIMER_MS,
    returnTimerMs: COVERT_OPS_RETURN_TIMER_MS,
    ventureNpcEntries: [],
  };
}

export interface CovertOpsLootResult {
  handled: boolean;
  next: CovertOpsState;
  gatherRadiusYd: number;
  ventureEntries: readonly number[];
  cite: string;
}

// Port of go_covertopsAI::OnLootStateChange on GO_JUST_DEACTIVATED; the caller supplies the
// Venture Co. entries in range. Cite: stonetalon_mountains.cpp:144–158.
export function covertOpsOnLootStateChange(
  justDeactivated: boolean,
  state: CovertOpsState,
  nearbyEntries: readonly number[] = [],
): CovertOpsLootResult {
  if (!justDeactivated) {
    return {
      handled: false,
      next: state,
      gatherRadiusYd: COVERT_OPS_GATHER_RADIUS_YD,
      ventureEntries: VENTURE_CO_LIST,
      cite: 'stonetalon_mountains.cpp:146 loot state != GO_JUST_DEACTIVATED → no-op',
    };
  }
  // Filter nearby to ventureCoList membership (cpp visits each entry ≤100yd).
  const gathered = nearbyEntries.filter((e) =>
    (VENTURE_CO_LIST as readonly number[]).includes(e),
  );
  return {
    handled: true,
    next: {
      ...state,
      phase: PHASE_CALLING,
      // callTimer kept from Reset arm (2s) — cpp does not re-arm on deactivate
      ventureNpcEntries: gathered,
    },
    gatherRadiusYd: COVERT_OPS_GATHER_RADIUS_YD,
    ventureEntries: VENTURE_CO_LIST,
    cite: 'stonetalon_mountains.cpp:146-157 GO_JUST_DEACTIVATED → PHASE_CALLING + gather ventureCoList ≤100yd',
  };
}

export interface CovertOpsNpcAction {
  /** Skip dead / in-combat (cpp continue). */
  skip: boolean;
  /** SetWalk(false) then MovePoint(1, contact). */
  moveToWagon: boolean;
  /** SetWalk(true) + EnterEvadeMode. */
  returnHome: boolean;
  contactRadiusYd: number;
}

export interface CovertOpsUpdateResult {
  next: CovertOpsState;
  /** Per gathered NPC actions this tick (empty when waiting on timer). */
  npcActions: CovertOpsNpcAction[];
  cite: string;
}

// Port of one go_covertopsAI::UpdateAI timer step; `npcAliveCombat` aligns with ventureNpcEntries.
// Cite: stonetalon_mountains.cpp:165–207.
export function covertOpsUpdateAI(
  state: CovertOpsState,
  diffMs: number,
  npcAliveCombat: ReadonlyArray<{ alive: boolean; inCombat: boolean }> = [],
): CovertOpsUpdateResult {
  switch (state.phase) {
    case PHASE_CALLING: {
      if (state.callTimerMs > diffMs) {
        return {
          next: { ...state, callTimerMs: state.callTimerMs - diffMs },
          npcActions: [],
          cite: 'stonetalon_mountains.cpp:185-186 m_callTimer -= diff (still waiting)',
        };
      }
      const npcActions: CovertOpsNpcAction[] = state.ventureNpcEntries.map((_, i) => {
        const flags = npcAliveCombat[i];
        const skip = !flags || !flags.alive || flags.inCombat;
        return {
          skip,
          moveToWagon: !skip,
          returnHome: false,
          contactRadiusYd: COVERT_OPS_CONTACT_RADIUS_YD,
        };
      });
      return {
        next: {
          ...state,
          callTimerMs: 0,
          phase: PHASE_HOMING,
        },
        npcActions,
        cite: 'stonetalon_mountains.cpp:170-183 PHASE_CALLING timer done → MovePoint contact 10yd run → PHASE_HOMING',
      };
    }
    case PHASE_HOMING: {
      if (state.returnTimerMs > diffMs) {
        return {
          next: { ...state, returnTimerMs: state.returnTimerMs - diffMs },
          npcActions: [],
          cite: 'stonetalon_mountains.cpp:201-202 m_returnTimer -= diff (still waiting)',
        };
      }
      const npcActions: CovertOpsNpcAction[] = state.ventureNpcEntries.map((_, i) => {
        const flags = npcAliveCombat[i];
        const skip = !flags || !flags.alive || flags.inCombat;
        return {
          skip,
          moveToWagon: false,
          returnHome: !skip,
          contactRadiusYd: COVERT_OPS_CONTACT_RADIUS_YD,
        };
      });
      return {
        next: {
          ...state,
          returnTimerMs: 0,
          phase: PHASE_INACTIVE,
        },
        npcActions,
        cite: 'stonetalon_mountains.cpp:189-199 PHASE_HOMING timer done → walk + EnterEvadeMode → PHASE_INACTIVE',
      };
    }
    default:
      return {
        next: state,
        npcActions: [],
        cite: 'stonetalon_mountains.cpp:204-205 PHASE_INACTIVE → no UpdateAI work',
      };
  }
}

// ScriptDev IR — npc_kaya

// npc_kayaAI, creature 11856. No combat cast timers — Reset is empty. The escort ambush and quest
// credit are waypoint helpers, and ambush 11910/11912/11913 are all in bake.
export const NPC_KAYA_SCRIPT: ScriptDevIR = {
  name: 'npc_kaya',
  boundCreatures: [NPC_KAYA],
  sourceFile: 'kalimdor/stonetalon_mountains.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty (no combat timers / no escort counter)',
        cite: 'stonetalon_mountains.cpp:52 Reset() override { }',
      },
    ],
  },
  cites: [
    'stonetalon_mountains.cpp:31-102 npc_kaya',
    'stonetalon_mountains.cpp:37-45 NPC_GRIMTOTEM_* SAY_* QUEST=6523',
    'stonetalon_mountains.cpp:52 Reset empty',
    'stonetalon_mountains.cpp:54-57 JustSummoned AttackStart Kaya',
    'stonetalon_mountains.cpp:59-81 WaypointReached WP17 ambush / WP19 credit',
    'stonetalon_mountains.cpp:69-71 TEMPSPAWN_CORPSE_TIMED_DESPAWN 30000 3× grimtotem',
    'stonetalon_mountains.cpp:74-79 WP19 SAY_END + explore credit 6523',
    'stonetalon_mountains.cpp:89-102 QuestAccept 6523 faction 775 + SAY_START + Start',
    'ScriptDevAIMgr.h:56 FACTION_ESCORT_H_PASSIVE=775',
  ],
};

// ScriptDev IR — go_covert_ops

// go_covertopsAI on GO 19590: OnLootStateChange plus UpdateAI phase timers (2 s call, 45 s return).
// Present in gameobject-data but absent from tables/gameObjects, so the product spawn is unused.
export const GO_COVERT_OPS_SCRIPT: ScriptDevIR = {
  name: 'go_covert_ops',
  boundCreatures: [],
  boundGos: [GO_VENTURE_WAGON_TRAP],
  sourceFile: 'kalimdor/stonetalon_mountains.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `m_phase=PHASE_INACTIVE; m_callTimer=${COVERT_OPS_CALL_TIMER_MS}; m_returnTimer=${COVERT_OPS_RETURN_TIMER_MS}`,
        cite: 'stonetalon_mountains.cpp:137-142 Reset phase + call 2s + return 45s',
      },
    ],
  },
  goUse: {
    // Not pGOUse — OnLootStateChange GO_JUST_DEACTIVATED; document residual for host.
    goEntries: [GO_VENTURE_WAGON_TRAP],
    actions: [
      {
        kind: 'flavor',
        text: `OnLootStateChange GO_JUST_DEACTIVATED → PHASE_CALLING gather ${VENTURE_CO_LIST.join('/')}` +
          ` ≤${COVERT_OPS_GATHER_RADIUS_YD}yd; UpdateAI call ${COVERT_OPS_CALL_TIMER_MS}ms MovePoint contact ${COVERT_OPS_CONTACT_RADIUS_YD}yd then return ${COVERT_OPS_RETURN_TIMER_MS}ms EnterEvadeMode (covertOpsOnLootStateChange / covertOpsUpdateAI)`,
        cite: 'stonetalon_mountains.cpp:144-207',
      },
    ],
    cite: 'stonetalon_mountains.cpp:144-158 OnLootStateChange; :165-207 UpdateAI',
  },
  unusedBindings: [
    {
      entry: GO_VENTURE_WAGON_TRAP,
      kind: 'go',
      reason:
        'GO 19590 Venture Co. Wagon Trap is DB-bound ScriptName go_covert_ops (scriptdev2.sql:538) and present in gameobject-data.json but absent from tables/gameObjects.json product GO list - IR + pure helper phase machine ported; product GO AI tick not spawnable until tables row.',
      cite: 'scriptdev2.sql:538; stonetalon_mountains.cpp:125-213; tables/gameObjects missing 19590',
    },
  ],
  cites: [
    'stonetalon_mountains.cpp:104-213 go_covert_ops',
    'stonetalon_mountains.cpp:111-123 Venture Co. entries + PHASE_* + ventureCoList',
    'stonetalon_mountains.cpp:137-142 Reset call=2s return=45s',
    'stonetalon_mountains.cpp:144-158 OnLootStateChange GO_JUST_DEACTIVATED gather ≤100yd',
    'stonetalon_mountains.cpp:165-207 UpdateAI PHASE_CALLING/HOMING',
    'stonetalon_mountains.cpp:177 GetContactPoint radius 10.0f',
    'stonetalon_mountains.cpp:236-239 RegisterSelf GetGameObjectAI go_covert_ops',
    'scriptdev2.sql:538 entry 19590',
    'Common.h:119 IN_MILLISECONDS=1000',
  ],
};
