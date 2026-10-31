// Razorfen Downs ScriptDev IR ports. Source: instance_razorfen_downs.cpp, razorfen_downs.cpp and
// the header — the gong waves, Tuten'kash credit, and Belnistrasz's ritual escort.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';

// Constants — razorfen_downs.h + razorfen_downs.cpp enums

// razorfen_downs.h:10–12
export const RFD_MAX_ENCOUNTER = 1;
export const RFD_MAX_WAVES = 3;
export const RFD_MAX_COUNT_POS = 2;

// razorfen_downs.h:14
export const TYPE_TUTEN_KASH = 0;

// razorfen_downs.h:16–18
export const NPC_TOMB_FIEND = 7349;
export const NPC_TOMB_REAVER = 7351;
export const NPC_TUTEN_KASH = 7355;

// razorfen_downs.h:20
export const GO_GONG = 148917;

// razorfen_downs.h:23–27 aSpawnLocations
export const RFD_SPAWN_LOCATIONS = [
  { x: 2484.83, y: 811.11, z: 43.4, o: 1.67, cite: 'razorfen_downs.h:25 Right corridor' },
  { x: 2546.03, y: 902.77, z: 47.16, o: 5.04, cite: 'razorfen_downs.h:26 Left corridor' },
] as const;

/** Gong wave table aWaveSummonInformation. Cite: razorfen_downs.h:35–40 */
export const RFD_GONG_WAVE_SUMMONS = [
  {
    waveIndex: 0,
    creatureEntry: NPC_TOMB_FIEND,
    count: 8,
    cite: 'razorfen_downs.h:37 NPC_TOMB_FIEND 8',
  },
  {
    waveIndex: 1,
    creatureEntry: NPC_TOMB_REAVER,
    count: 4,
    cite: 'razorfen_downs.h:38 NPC_TOMB_REAVER 4',
  },
  {
    waveIndex: 2,
    creatureEntry: NPC_TUTEN_KASH,
    count: 1,
    cite: 'razorfen_downs.h:39 NPC_TUTEN_KASH 1',
  },
] as const;

/** Random radius around corridor spawn points. Cite: instance_razorfen_downs.cpp:161 GetRandomPoint 5.0f */
export const RFD_GONG_SPAWN_RADIUS_YD = 5;

// ---- Belnistrasz (razorfen_downs.cpp) ----

// razorfen_downs.cpp:39
export const QUEST_EXTINGUISHING_THE_IDOL = 3525;

// razorfen_downs.cpp:41–48 script_texts
export const SAY_BELNISTRASZ_READY = -1129005;
export const SAY_BELNISTRASZ_START_RIT = -1129006;
export const SAY_BELNISTRASZ_AGGRO_1 = -1129007;
export const SAY_BELNISTRASZ_AGGRO_2 = -1129008;
export const SAY_BELNISTRASZ_3_MIN = -1129009;
export const SAY_BELNISTRASZ_2_MIN = -1129010;
export const SAY_BELNISTRASZ_1_MIN = -1129011;
export const SAY_BELNISTRASZ_FINISH = -1129012;

// razorfen_downs.cpp:50–55
export const NPC_IDOL_ROOM_SPAWNER = 8611;
export const NPC_WITHERED_BATTLE_BOAR = 7333;
export const NPC_WITHERED_QUILGUARD = 7329;
export const NPC_DEATHS_HEAD_GEOMANCER = 7335;
export const NPC_PLAGUEMAW_THE_ROTTING = 7356;

// razorfen_downs.cpp:57–60
export const GO_BELNISTRASZ_BRAZIER = 152097;
export const GO_IDOL_OVEN_FIRE = 151951;
export const GO_IDOL_CUP_FIRE = 151952;
export const GO_IDOL_MOUTH_FIRE = 151973;

// razorfen_downs.cpp:62–67
export const SPELL_ARCANE_INTELLECT = 13326;
export const SPELL_FIREBALL = 9053;
export const SPELL_FROST_NOVA = 11831;
export const SPELL_IDOL_SHUTDOWN = 12774;
export const SPELL_IDOL_ROOM_SHAKE = 12816;

/** 1.x-only summon spell ids kept in enum (commented casts in cpp). Cite: razorfen_downs.cpp:69–71 */
export const SPELL_SUMMON_1 = 12694; // NPC_WITHERED_BATTLE_BOAR
export const SPELL_SUMMON_2 = 14802; // NPC_DEATHS_HEAD_GEOMANCER
export const SPELL_SUMMON_3 = 14801; // NPC_WITHERED_QUILGUARD

// razorfen_downs.cpp:74–79 spawner coords
export const BELNI_SPAWNER_COORDS = [
  { x: 2582.79, y: 954.392, z: 52.4821, o: 3.78736 },
  { x: 2569.42, y: 956.38, z: 52.2732, o: 5.42797 },
  { x: 2570.62, y: 942.393, z: 53.7433, o: 0.71558 },
] as const;

// razorfen_downs.cpp:81 idol fire GO list
export const BELNI_IDOL_FIRE_GOS = [
  GO_IDOL_OVEN_FIRE,
  GO_IDOL_CUP_FIRE,
  GO_IDOL_MOUTH_FIRE,
] as const;

/** Escort waypoint that starts the ritual. Cite: razorfen_downs.cpp:169 uiPointId == 24 */
export const BELNI_RITUAL_WAYPOINT = 24;

// Ritual phase arm durations after each phase fires (m_uiRitualTimer assignment). Initial ctor arm:
// m_uiRitualTimer = 1000 (cpp:88). Cite: razorfen_downs.cpp:180–254 UpdateEscortAI ritual switch.
export const BELNI_RITUAL_STEPS = [
  {
    phase: 0,
    nextTimerMs: 1000,
    action: 'cast_idol_shutdown' as const,
    spellId: SPELL_IDOL_SHUTDOWN,
    textId: null as number | null,
    summonSpawner: false,
    cite: 'razorfen_downs.cpp:184-187 case 0 DoCast SPELL_IDOL_SHUTDOWN; next 1000',
  },
  {
    phase: 1,
    nextTimerMs: 39_000,
    action: 'summon_spawner' as const,
    spellId: null as number | null,
    textId: null as number | null,
    summonSpawner: true,
    cite: 'razorfen_downs.cpp:188-191 case 1 DoSummonSpawner; next 39000',
  },
  {
    phase: 2,
    nextTimerMs: 20_000,
    action: 'summon_spawner' as const,
    spellId: null as number | null,
    textId: null as number | null,
    summonSpawner: true,
    cite: 'razorfen_downs.cpp:192-195 case 2 DoSummonSpawner; next 20000',
  },
  {
    phase: 3,
    nextTimerMs: 20_000,
    action: 'yell' as const,
    spellId: null as number | null,
    textId: SAY_BELNISTRASZ_3_MIN,
    summonSpawner: false,
    cite: 'razorfen_downs.cpp:196-199 case 3 SAY_BELNISTRASZ_3_MIN; next 20000',
  },
  {
    phase: 4,
    nextTimerMs: 40_000,
    action: 'summon_spawner' as const,
    spellId: null as number | null,
    textId: null as number | null,
    summonSpawner: true,
    cite: 'razorfen_downs.cpp:200-203 case 4 DoSummonSpawner; next 40000',
  },
  {
    phase: 5,
    nextTimerMs: 40_000,
    action: 'summon_spawner_and_yell' as const,
    spellId: null as number | null,
    textId: SAY_BELNISTRASZ_2_MIN,
    summonSpawner: true,
    cite: 'razorfen_downs.cpp:204-208 case 5 DoSummonSpawner + SAY_2_MIN; next 40000',
  },
  {
    phase: 6,
    nextTimerMs: 20_000,
    action: 'summon_spawner' as const,
    spellId: null as number | null,
    textId: null as number | null,
    summonSpawner: true,
    cite: 'razorfen_downs.cpp:209-212 case 6 DoSummonSpawner; next 20000',
  },
  {
    phase: 7,
    nextTimerMs: 40_000,
    action: 'yell' as const,
    spellId: null as number | null,
    textId: SAY_BELNISTRASZ_1_MIN,
    summonSpawner: false,
    cite: 'razorfen_downs.cpp:213-216 case 7 SAY_BELNISTRASZ_1_MIN; next 40000',
  },
  {
    phase: 8,
    nextTimerMs: 20_000,
    action: 'summon_spawner' as const,
    spellId: null as number | null,
    textId: null as number | null,
    summonSpawner: true,
    cite: 'razorfen_downs.cpp:217-220 case 8 DoSummonSpawner; next 20000',
  },
  {
    phase: 9,
    nextTimerMs: 3000,
    action: 'yell' as const,
    spellId: null as number | null,
    textId: SAY_BELNISTRASZ_FINISH,
    summonSpawner: false,
    cite: 'razorfen_downs.cpp:221-224 case 9 SAY_BELNISTRASZ_FINISH; next 3000',
  },
  {
    phase: 10,
    nextTimerMs: 0,
    action: 'finish_ritual' as const,
    spellId: SPELL_IDOL_ROOM_SHAKE,
    textId: null as number | null,
    summonSpawner: false,
    cite: 'razorfen_downs.cpp:225-254 case 10 quest credit + remove shutdown + shake + deactivate fires',
  },
] as const;

// SpawnerSummon pack while m_uiRitualPhase ≤ 7: 2× boar + 1× quilguard + 1× geomancer. When phase > 7: 1×
// Plaguemaw. Cite: razorfen_downs.cpp:122–154
export const BELNI_RITUAL_TRASH_PACK = [
  { creatureEntry: NPC_WITHERED_BATTLE_BOAR, count: 2 },
  { creatureEntry: NPC_WITHERED_QUILGUARD, count: 1 },
  { creatureEntry: NPC_DEATHS_HEAD_GEOMANCER, count: 1 },
] as const;

/** Spawner TEMPSPAWN_TIMED_DESPAWN. Cite: razorfen_downs.cpp:164 10000 */
export const BELNI_SPAWNER_DESPAWN_MS = 10_000;

/** Trash TEMPSPAWN_TIMED_OOC_DESPAWN. Cite: razorfen_downs.cpp:126,153 60000 */
export const BELNI_RITUAL_MOB_DESPAWN_MS = 60_000;

// Pure helpers — DoSpawnWaveIfCan

export interface RfdGongWaveState {
  /** TYPE_TUTEN_KASH encounter value. */
  tutenKash: number;
  /** m_uiWaveCounter — waves already spawned (0..3). */
  waveCounter: number;
  /** True when any wave mob is still alive (m_lSpawnedMobsList non-empty). */
  spawnedMobsAlive: boolean;
}

export interface RfdGongWaveResult {
  ok: boolean;
  /** Summons for this gong use (empty when blocked). */
  summons: Array<{ creatureEntry: number; count: number }>;
  /** Wave index that was summoned (pre-increment counter). */
  waveIndex: number | null;
  /** New wave counter after SetData IN_PROGRESS. */
  waveCounterAfter: number;
  /** Instance data writes. */
  setData: Array<{ field: number; value: number }>;
  /** Gong should be NO_INTERACT after a successful spawn. */
  gongNoInteract: boolean;
  cite: string;
}

// Port of instance_razorfen_downs::DoSpawnWaveIfCan. Blocked when TYPE_TUTEN_KASH is DONE, wave
// mobs are alive, or the counter is at MAX_WAVES 3. Cite: instance_razorfen_downs.cpp:141–175.
export function doSpawnWaveIfCan(state: RfdGongWaveState): RfdGongWaveResult {
  // cpp:144–145
  if (state.tutenKash === INSTANCE_DATA.DONE) {
    return {
      ok: false,
      summons: [],
      waveIndex: null,
      waveCounterAfter: state.waveCounter,
      setData: [],
      gongNoInteract: false,
      cite: 'instance_razorfen_downs.cpp:144-145 GetData(TYPE_TUTEN_KASH) == DONE → return',
    };
  }
  // cpp:147–148
  if (state.spawnedMobsAlive) {
    return {
      ok: false,
      summons: [],
      waveIndex: null,
      waveCounterAfter: state.waveCounter,
      setData: [],
      gongNoInteract: false,
      cite: 'instance_razorfen_downs.cpp:147-148 m_lSpawnedMobsList non-empty → return',
    };
  }
  // cpp:152–153
  if (state.waveCounter >= RFD_MAX_WAVES) {
    return {
      ok: false,
      summons: [],
      waveIndex: null,
      waveCounterAfter: state.waveCounter,
      setData: [],
      gongNoInteract: false,
      cite: 'instance_razorfen_downs.cpp:152-153 m_uiWaveCounter >= MAX_WAVES → return',
    };
  }

  const wave = RFD_GONG_WAVE_SUMMONS[state.waveCounter]!;
  // cpp:155–170 summon loop; cpp:172–174 SetData IN_PROGRESS + gong NO_INTERACT
  return {
    ok: true,
    summons: [{ creatureEntry: wave.creatureEntry, count: wave.count }],
    waveIndex: state.waveCounter,
    waveCounterAfter: state.waveCounter + 1,
    setData: [{ field: TYPE_TUTEN_KASH, value: INSTANCE_DATA.IN_PROGRESS }],
    gongNoInteract: true,
    cite: 'instance_razorfen_downs.cpp:155-174 wave summon + SetData IN_PROGRESS',
  };
}

// Wave-clear re-enable: when last fiend/reaver dies, gong loses NO_INTERACT. Cite:
// instance_razorfen_downs.cpp:117–133
export function gongReenableOnWaveClear(
  tutenKash: number,
  remainingWaveMobs: number,
): boolean {
  if (tutenKash !== INSTANCE_DATA.IN_PROGRESS) return false;
  return remainingWaveMobs === 0;
}

// event_go_tutenkash_gong

// ProcessEventId_event_go_tutenkash_gong: a player plus GO target runs DoSpawnWaveIfCan, modelled
// as a goUse on Gong 148917. Bound as an event script, not a creature row.
export const EVENT_GO_TUTENKASH_GONG: ScriptDevIR = {
  name: 'event_go_tutenkash_gong',
  boundCreatures: [],
  boundGos: [GO_GONG],
  sourceFile: 'kalimdor/razorfen_downs/instance_razorfen_downs.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_GONG],
    gates: [
      {
        field: TYPE_TUTEN_KASH,
        notEquals: INSTANCE_DATA.DONE,
        cite: 'instance_razorfen_downs.cpp:144-145 DoSpawnWaveIfCan blocks when DONE',
      },
    ],
    // First successful use (NOT_STARTED / empty spawn list): spawn wave 0 + IN_PROGRESS.
    // Host smoke uses doSpawnWaveIfCan for multi-wave counter; goUse models first hit.
    actions: [
      {
        kind: 'summon_count',
        creatureEntry: NPC_TOMB_FIEND,
        count: 8,
        cite: 'instance_razorfen_downs.cpp:155-169 wave 0 aWaveSummonInformation Tomb Fiend ×8',
      },
      {
        kind: 'set_instance_data',
        field: TYPE_TUTEN_KASH,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'instance_razorfen_downs.cpp:172-173 SetData(TYPE_TUTEN_KASH, IN_PROGRESS)',
      },
    ],
    cite: 'instance_razorfen_downs.cpp:182-195 ProcessEventId_event_go_tutenkash_gong → DoSpawnWaveIfCan',
  },
  cites: [
    'instance_razorfen_downs.cpp:182-195',
    'instance_razorfen_downs.cpp:141-175 DoSpawnWaveIfCan',
    'razorfen_downs.h:20 GO_GONG=148917',
    'razorfen_downs.h:35-40 aWaveSummonInformation',
  ],
};

// instance_razorfen_downs

// instance_razorfen_downs, one encounter: TYPE_TUTEN_KASH goes IN_PROGRESS on each gong wave and
// DONE on his death. No doors. Bound via instance_template for map 129.
export const INSTANCE_RAZORFEN_DOWNS: ScriptDevIR = {
  name: 'instance_razorfen_downs',
  boundCreatures: [],
  sourceFile: 'kalimdor/razorfen_downs/instance_razorfen_downs.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    {
      creatureEntry: NPC_TUTEN_KASH,
      field: TYPE_TUTEN_KASH,
      onDeath: INSTANCE_DATA.DONE,
      // Aggro/IN_PROGRESS comes from gong SetData, not OnCreatureEnterCombat.
      cite: 'instance_razorfen_downs.cpp:135-137 OnCreatureDeath NPC_TUTEN_KASH → TYPE_TUTEN_KASH DONE; h:14 TYPE_TUTEN_KASH=0',
    },
  ],
  cites: [
    'instance_razorfen_downs.cpp:29-175 instance body',
    'instance_razorfen_downs.cpp:56-78 SetData TYPE_TUTEN_KASH',
    'instance_razorfen_downs.cpp:111-138 OnCreatureDeath waves + Tuten\'kash',
    'instance_razorfen_downs.cpp:141-175 DoSpawnWaveIfCan',
    'instance_razorfen_downs.cpp:197-208 AddSC_instance_razorfen_downs',
    'razorfen_downs.h:8-69',
    'no creature_template.ScriptName - instance_template map 129 (corpus boundCreatures empty)',
  ],
};

// npc_belnistrasz

// npc_belnistraszAI, creature 8516. Fireball init 1000 re-arm urand(2–3)s, Frost Nova init 6000
// re-arm urand(10–15)s. After WP24 the ritual phase machine runs and finishes quest 3525.
export const NPC_BELNISTRASZ: ScriptDevIR = {
  name: 'npc_belnistrasz',
  boundCreatures: [8516],
  sourceFile: 'kalimdor/razorfen_downs/razorfen_downs.cpp',
  spellIds: [
    SPELL_ARCANE_INTELLECT,
    SPELL_FIREBALL,
    SPELL_FROST_NOVA,
    SPELL_IDOL_SHUTDOWN,
    SPELL_IDOL_ROOM_SHAKE,
    SPELL_SUMMON_1,
    SPELL_SUMMON_2,
    SPELL_SUMMON_3,
  ],
  timers: [
    {
      id: 'fireball',
      spellId: SPELL_FIREBALL,
      // Reset m_uiFireballTimer = 1000 (cpp:102)
      initialMinMs: 1000,
      initialMaxMs: 1000,
      // CAST_OK re-arm urand(2000, 3000) (cpp:271)
      repeatMinMs: 2000,
      repeatMaxMs: 3000,
      target: 'victim',
      cite: 'razorfen_downs.cpp:102,268-272 Fireball init 1000 re-arm 2000-3000',
    },
    {
      id: 'frost_nova',
      spellId: SPELL_FROST_NOVA,
      // Reset m_uiFrostNovaTimer = 6000 (cpp:103)
      initialMinMs: 6000,
      initialMaxMs: 6000,
      // CAST_OK re-arm urand(10000, 15000) (cpp:279)
      repeatMinMs: 10_000,
      repeatMaxMs: 15_000,
      target: 'victim',
      cite: 'razorfen_downs.cpp:103,276-280 Frost Nova init 6000 re-arm 10000-15000',
    },
  ],
  // Quest accept 3525 starts escort (not QuestRewarded). Documented as cites +
  // pure ritual steps; host questRewarded is post-complete only.
  unusedBindings: [
    {
      entry: NPC_IDOL_ROOM_SPAWNER,
      kind: 'creature',
      reason:
        'NPC 8611 Idol Room Spawner is ritual summon-only (razorfen_downs.cpp:164); absent from product bake - IR ported; SpawnerSummon pack documented in BELNI_RITUAL_TRASH_PACK',
      cite: 'razorfen_downs.cpp:50,122-165; loadRealBundle missing 8611',
    },
    {
      entry: GO_BELNISTRASZ_BRAZIER,
      kind: 'go',
      reason:
        'GO 152097 Belnistrasz\'s Brazier is ritual-finish refresh (cpp:231-238); absent from product bake - IR ported',
      cite: 'razorfen_downs.cpp:57,231-238; loadRealBundle missing 152097',
    },
  ],
  cites: [
    'razorfen_downs.cpp:37-315 npc_belnistrasz',
    'razorfen_downs.cpp:85-91 ctor RitualPhase=0 RitualTimer=1000',
    'razorfen_downs.cpp:100-104 Reset combat timers',
    'razorfen_downs.cpp:122-165 SpawnerSummon + DoSummonSpawner',
    'razorfen_downs.cpp:167-174 WaypointReached 24 start ritual',
    'razorfen_downs.cpp:176-285 UpdateEscortAI ritual + combat',
    'razorfen_downs.cpp:293-306 QuestAccept 3525',
    'razorfen_downs.cpp:62-71 spell enum incl. 1.x summon ids',
  ],
};
