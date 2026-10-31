// Razorfen Kraul ScriptDev IR ports. Source: instance_razorfen_kraul.cpp, razorfen_kraul.cpp and
// the header — the ward-keeper door, Willix's escort and the Snufflenose gopher.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';

// Constants — razorfen_kraul.h + razorfen_kraul.cpp enums

// razorfen_kraul.h:10–16
export const RFK_MAX_ENCOUNTER = 1;
/** Encounter type id (NOT array index). Cite: razorfen_kraul.h:12 */
export const TYPE_AGATHELOS = 1;
export const GO_AGATHELOS_WARD = 21099;
export const NPC_WARD_KEEPER = 4625;

// razorfen_kraul.cpp:40 Willix quest
export const QUEST_WILLIX_THE_IMPORTER = 1144;

// razorfen_kraul.cpp:42–55 script_texts
export const SAY_WILLIX_READY = -1047000;
export const SAY_WILLIX_1 = -1047001;
export const SAY_WILLIX_2 = -1047002;
export const SAY_WILLIX_3 = -1047003;
export const SAY_WILLIX_4 = -1047004;
export const SAY_WILLIX_5 = -1047005;
export const SAY_WILLIX_6 = -1047006;
export const SAY_WILLIX_7 = -1047007;
export const SAY_WILLIX_END = -1047008;
export const SAY_WILLIX_AGGRO_1 = -1047009;
export const SAY_WILLIX_AGGRO_2 = -1047010;
export const SAY_WILLIX_AGGRO_3 = -1047011;
export const SAY_WILLIX_AGGRO_4 = -1047012;

// razorfen_kraul.cpp:57
export const NPC_RAGING_AGAMAR = 4514;

// razorfen_kraul.cpp:60–66 aBoarSpawn
export const WILLIX_BOAR_SPAWNS = [
  { x: 2151.42, y: 1733.18, z: 52.1, cite: 'razorfen_kraul.cpp:62 aBoarSpawn[0] WP15' },
  { x: 2144.463, y: 1726.89, z: 51.93, cite: 'razorfen_kraul.cpp:63 aBoarSpawn[1] WP15' },
  { x: 1956.433, y: 1597.97, z: 81.75, cite: 'razorfen_kraul.cpp:64 aBoarSpawn[2] WP45' },
  { x: 1958.971, y: 1599.01, z: 81.44, cite: 'razorfen_kraul.cpp:65 aBoarSpawn[3] WP45' },
] as const;

/** TEMPSPAWN_TIMED_OOC_DESPAWN for ambush boars. Cite: razorfen_kraul.cpp:107,119 25000 */
export const WILLIX_BOAR_DESPAWN_MS = 25_000;

/** Escort waypoint actions (WaypointReached switch). Cite: razorfen_kraul.cpp:91–130 */
export const WILLIX_WAYPOINTS = [
  {
    pointId: 3,
    textId: SAY_WILLIX_1,
    summons: [] as Array<{ creatureEntry: number; spawnIndex: number }>,
    questCredit: false,
    setQuestGiver: false,
    pauseEscort: false,
    cite: 'razorfen_kraul.cpp:95-97 case 3 SAY_WILLIX_1',
  },
  {
    pointId: 7,
    textId: SAY_WILLIX_2,
    summons: [],
    questCredit: false,
    setQuestGiver: false,
    pauseEscort: false,
    cite: 'razorfen_kraul.cpp:98-100 case 7 SAY_WILLIX_2',
  },
  {
    pointId: 10,
    textId: SAY_WILLIX_3,
    summons: [],
    questCredit: false,
    setQuestGiver: false,
    pauseEscort: false,
    cite: 'razorfen_kraul.cpp:101-103 case 10 SAY_WILLIX_3',
  },
  {
    pointId: 15,
    textId: SAY_WILLIX_4,
    summons: [
      { creatureEntry: NPC_RAGING_AGAMAR, spawnIndex: 0 },
      { creatureEntry: NPC_RAGING_AGAMAR, spawnIndex: 1 },
    ],
    questCredit: false,
    setQuestGiver: false,
    pauseEscort: false,
    cite: 'razorfen_kraul.cpp:104-109 case 15 SAY_WILLIX_4 + 2×4514 aBoarSpawn[0..1]',
  },
  {
    pointId: 26,
    textId: SAY_WILLIX_5,
    summons: [],
    questCredit: false,
    setQuestGiver: false,
    pauseEscort: false,
    cite: 'razorfen_kraul.cpp:110-112 case 26 SAY_WILLIX_5',
  },
  {
    pointId: 34,
    textId: SAY_WILLIX_6,
    summons: [],
    questCredit: false,
    setQuestGiver: false,
    pauseEscort: false,
    cite: 'razorfen_kraul.cpp:113-115 case 34 SAY_WILLIX_6',
  },
  {
    pointId: 45,
    textId: SAY_WILLIX_7,
    summons: [
      { creatureEntry: NPC_RAGING_AGAMAR, spawnIndex: 2 },
      { creatureEntry: NPC_RAGING_AGAMAR, spawnIndex: 3 },
    ],
    questCredit: false,
    setQuestGiver: false,
    pauseEscort: false,
    cite: 'razorfen_kraul.cpp:116-121 case 45 SAY_WILLIX_7 + 2×4514 aBoarSpawn[2..3]',
  },
  {
    pointId: 46,
    textId: SAY_WILLIX_END,
    summons: [],
    questCredit: true,
    setQuestGiver: true,
    pauseEscort: true,
    cite: 'razorfen_kraul.cpp:122-129 case 46 SAY_END + questgiver + Reward 1144 + pause',
  },
] as const;

// razorfen_kraul.cpp:161–163 Snufflenose
export const SPELL_SNUFFLENOSE_COMMAND = 8283;
export const NPC_SNUFFLENOSE_GOPHER = 4781;
export const GO_BLUELEAF_TUBBER = 20920;

/** Search radius for Blueleaf Tubber. Cite: razorfen_kraul.cpp:199 40.0f */
export const SNUFFLENOSE_TUBBER_RADIUS_YD = 40;

/** Tubber respawn after gopher reach. Cite: razorfen_kraul.cpp:186 5 * MINUTE */
export const BLUELEAF_TUBBER_RESPAWN_S = 5 * 60;

/** Quest 1221 Blueleaf Tubers (uses Snufflenose Command). Cite: cpp SDComment 1221 */
export const QUEST_BLUELEAF_TUBERS = 1221;

// Agathelos kit spell script in same cpp (not a ScriptName registry row)
// razorfen_kraul.cpp:250–260 Left for Dead 8555 → CastSpell 8359
export const SPELL_LEFT_FOR_DEAD = 8555;
export const SPELL_LEFT_FOR_DEAD_TRIGGER = 8359;

// Pure helpers — instance SetData ward-keeper counter

export interface RfkAgathelosState {
  /** m_uiWardKeepersRemaining (starts at OnCreatureCreate count, static 2). */
  wardKeepersRemaining: number;
  /** m_auiEncounter[0] current value. */
  encounter: number;
}

export interface RfkAgathelosSetDataResult {
  /** Remaining after this SetData call. */
  wardKeepersRemaining: number;
  /** Whether encounter + door write applied (remaining hit 0). */
  completed: boolean;
  /** Encounter value written when completed (uiData from SetData). */
  encounter: number;
  /** GO 21099 should open. */
  openWard: boolean;
  cite: string;
}

// Port of instance_razorfen_kraul::SetData(TYPE_AGATHELOS): each call decrements the ward-keeper
// count, and at 0 it stores the value and opens GO 21099. Cite: cpp:62–73.
export function applyAgathelosSetData(
  state: RfkAgathelosState,
  uiData: number,
): RfkAgathelosSetDataResult {
  // cpp:67 --m_uiWardKeepersRemaining
  const remaining = Math.max(0, state.wardKeepersRemaining - 1);
  // cpp:68–72
  if (remaining === 0) {
    return {
      wardKeepersRemaining: 0,
      completed: true,
      encounter: uiData,
      openWard: true,
      cite: 'instance_razorfen_kraul.cpp:67-72 remaining==0 → encounter=uiData + DoUseDoorOrButton(GO_AGATHELOS_WARD)',
    };
  }
  return {
    wardKeepersRemaining: remaining,
    completed: false,
    encounter: state.encounter,
    openWard: false,
    cite: 'instance_razorfen_kraul.cpp:67 remaining>0 → no encounter write / no door',
  };
}

// Pure helpers — Willix WaypointReached

export interface WillixWaypointResult {
  handled: boolean;
  textId: number | null;
  summons: Array<{ creatureEntry: number; x: number; y: number; z: number; despawnMs: number }>;
  questId: number | null;
  setQuestGiver: boolean;
  pauseEscort: boolean;
  cite: string;
}

/** Port of npc_willix_the_importerAI::WaypointReached. Cite: razorfen_kraul.cpp:91–130 */
export function willixWaypointReached(pointId: number): WillixWaypointResult {
  const step = WILLIX_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      textId: null,
      summons: [],
      questId: null,
      setQuestGiver: false,
      pauseEscort: false,
      cite: 'razorfen_kraul.cpp:91-130 no case for this pointId',
    };
  }
  return {
    handled: true,
    textId: step.textId,
    summons: step.summons.map((s) => {
      const pos = WILLIX_BOAR_SPAWNS[s.spawnIndex]!;
      return {
        creatureEntry: s.creatureEntry,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        despawnMs: WILLIX_BOAR_DESPAWN_MS,
      };
    }),
    questId: step.questCredit ? QUEST_WILLIX_THE_IMPORTER : null,
    setQuestGiver: step.setQuestGiver,
    pauseEscort: step.pauseEscort,
    cite: step.cite,
  };
}

// Pure helpers — Snufflenose DoFindNewTubber

export interface BlueleafTubber {
  /** Instance id / guid stand-in. */
  id: number;
  x: number;
  y: number;
  z: number;
  /** IsSpawned() — live / available to dig. */
  spawned: boolean;
  /** HasFlag(GO_FLAG_INTERACT_COND). Cite: cpp:210 */
  interactCond: boolean;
  /** IsWithinLOSInMap. Cite: cpp:210 */
  los: boolean;
}

export interface SnufflenoseFindResult {
  found: boolean;
  tubberId: number | null;
  /** Distance to chosen tubber (for tests). */
  dist: number | null;
  cite: string;
}

// Port of npc_snufflenose_gopherAI::DoFindNewTubber: unspawned tubbers with the interact-cond flag
// and LOS, within radius, nearest first. Cite: razorfen_kraul.cpp:196–225.
export function doFindNewTubber(
  gopher: { x: number; y: number; z: number },
  tubbers: BlueleafTubber[],
  radiusYd: number = SNUFFLENOSE_TUBBER_RADIUS_YD,
): SnufflenoseFindResult {
  const inRange = tubbers
    .map((t) => {
      const dx = t.x - gopher.x;
      const dy = t.y - gopher.y;
      const dz = t.z - gopher.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return { t, dist };
    })
    .filter((x) => x.dist <= radiusYd)
    .sort((a, b) => a.dist - b.dist);

  for (const { t, dist } of inRange) {
    // cpp:210 !IsSpawned() && HasFlag(INTERACT_COND) && IsWithinLOSInMap
    if (!t.spawned && t.interactCond && t.los) {
      return {
        found: true,
        tubberId: t.id,
        dist,
        cite: 'razorfen_kraul.cpp:208-224 nearest unspawned INTERACT_COND LOS tubber → MovePoint',
      };
    }
  }
  return {
    found: false,
    tubberId: null,
    dist: null,
    cite: 'razorfen_kraul.cpp:201-218 empty / no eligible tubber',
  };
}

// instance_razorfen_kraul

// instance_razorfen_kraul, one encounter: SetData(TYPE_AGATHELOS) decrements the ward-keeper count
// and opens GO 21099 at zero, driven by EventAI 462501. Bound via instance_template for map 47.
export const INSTANCE_RAZORFEN_KRAUL: ScriptDevIR = {
  name: 'instance_razorfen_kraul',
  boundCreatures: [],
  sourceFile: 'kalimdor/razorfen_kraul/instance_razorfen_kraul.cpp',
  spellIds: [],
  timers: [],
  // Ward keepers are not an OnCreatureDeath in the instance cpp — EventAI fires SET_INST_DATA.
  // Binding 4625 here would open the door on the first death; the counter is in the pure helper.
  encounters: [],
  doors: [
    {
      field: TYPE_AGATHELOS,
      goEntry: GO_AGATHELOS_WARD,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_razorfen_kraul.cpp:71 DoUseDoorOrButton(GO_AGATHELOS_WARD); h:14 GO=21099; type id h:12 TYPE_AGATHELOS=1',
    },
  ],
  cites: [
    'instance_razorfen_kraul.cpp:29-133 instance body',
    'instance_razorfen_kraul.cpp:40-49 OnObjectCreate GO_AGATHELOS_WARD',
    'instance_razorfen_kraul.cpp:52-59 OnCreatureCreate NPC_WARD_KEEPER ++remaining',
    'instance_razorfen_kraul.cpp:62-87 SetData TYPE_AGATHELOS decrement + door',
    'instance_razorfen_kraul.cpp:112-119 GetData TYPE_AGATHELOS',
    'instance_razorfen_kraul.cpp:127-133 AddSC_instance_razorfen_kraul',
    'razorfen_kraul.h:8-41',
    'EventAI 462501 DEATH SET_INST_DATA(1,3) → SetData path (eventai-missing-scripts / bake)',
    'no creature_template.ScriptName - instance_template map 47 (corpus boundCreatures empty)',
  ],
};

// npc_willix_the_importer

// npc_willix_the_importerAI, creature 4508. No combat cast timers — Reset is empty. The escort
// summons 2× 4514 at WP15 and WP45, and the InstanceDef ambush packs already place them.
export const NPC_WILLIX_THE_IMPORTER: ScriptDevIR = {
  name: 'npc_willix_the_importer',
  boundCreatures: [4508],
  sourceFile: 'kalimdor/razorfen_kraul/razorfen_kraul.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    // Aggro yells are random (4/7); host has no urand yell — document text set.
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_WILLIX_AGGRO_1,
        cite: 'razorfen_kraul.cpp:75-84 Aggro urand(0,6) cases 0-3 → SAY_WILLIX_AGGRO_1..4',
      },
    ],
  },
  cites: [
    'razorfen_kraul.cpp:34-153 npc_willix_the_importer',
    'razorfen_kraul.cpp:72 Reset empty (no combat timers)',
    'razorfen_kraul.cpp:75-84 Aggro random yells',
    'razorfen_kraul.cpp:86-89 JustSummoned AttackStart',
    'razorfen_kraul.cpp:91-130 WaypointReached WP3..46',
    'razorfen_kraul.cpp:107,119 TEMPSPAWN_TIMED_OOC_DESPAWN 25000',
    'razorfen_kraul.cpp:139-153 QuestAccept 1144',
    'razorfen_kraul.cpp:40 QUEST_WILLIX_THE_IMPORTER=1144',
    'razorfen_kraul.cpp:57 NPC_RAGING_AGAMAR=4514',
  ],
};

// npc_snufflenose_gopher

// npc_snufflenose_gopherAI and the SnufflenoseCommand spell script. Creature 4781 is absent from
// bake, so the binding is unused; spell 8283 exists but its effect is script-owned.
export const NPC_SNUFFLENOSE_GOPHER_SCRIPT: ScriptDevIR = {
  name: 'npc_snufflenose_gopher',
  boundCreatures: [NPC_SNUFFLENOSE_GOPHER],
  sourceFile: 'kalimdor/razorfen_kraul/razorfen_kraul.cpp',
  spellIds: [SPELL_SNUFFLENOSE_COMMAND],
  timers: [],
  spellHits: [
    {
      spellId: SPELL_SNUFFLENOSE_COMMAND,
      playerCaster: true,
      // No once — command can be reissued for next tubber (Reset clears movement only).
      // Actions are GO choreography (DoFindNewTubber pure helper) — no combat cast/summon.
      actions: [],
      cite: 'razorfen_kraul.cpp:239-247 spell_snufflenose_command OnEffectExecute → DoFindNewTubber; :196-225',
    },
  ],
  unusedBindings: [
    {
      entry: NPC_SNUFFLENOSE_GOPHER,
      kind: 'creature',
      reason:
        'NPC 4781 Snufflenose Gopher is quest-1221 pet/script (razorfen_kraul.cpp:162); absent from product bake - IR ported; DoFindNewTubber pure helper + spell 8283 documented',
      cite: 'razorfen_kraul.cpp:161-247; loadRealBundle missing 4781',
    },
  ],
  cites: [
    'razorfen_kraul.cpp:155-247 npc_snufflenose_gopher + SnufflenoseCommand',
    'razorfen_kraul.cpp:161 SPELL_SNUFFLENOSE_COMMAND=8283',
    'razorfen_kraul.cpp:162 NPC_SNUFFLENOSE_GOPHER=4781',
    'razorfen_kraul.cpp:163 GO_BLUELEAF_TUBBER=20920',
    'razorfen_kraul.cpp:179-193 MovementInform Refresh + 5*MINUTE respawn',
    'razorfen_kraul.cpp:196-225 DoFindNewTubber 40.0f radius',
    'razorfen_kraul.cpp:227-231 UpdateAI pet while !m_bIsMovementActive',
    'razorfen_kraul.cpp:263-278 AddSC_razorfen_kraul',
  ],
};
