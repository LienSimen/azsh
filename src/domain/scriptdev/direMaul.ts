// Dire Maul ScriptDev IR ports. Source: dire_maul.cpp, instance_dire_maul.cpp and the header, plus
// acid_classic.sql:15013 for the Alzzin crumble wall. Every value cites file:line below.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { applyInstanceSetData, type InstanceHostResult } from './host.ts';

// Constants — dire_maul.h

// dire_maul.h:10–12
export const DM_MAX_ENCOUNTER = 19;
export const DM_MAX_GENERATORS = 5;
export const DM_MAX_PORTALS = 19;

// dire_maul.h:15–39 encounter types
export const TYPE_ALZZIN = 0;
export const TYPE_ZEVRIM = 1;
export const TYPE_IRONBARK = 2;
export const TYPE_WARPWOOD = 3;
export const TYPE_IMMOLTHAR = 4;
export const TYPE_PRINCE = 5;
export const TYPE_PYLON_1 = 6;
export const TYPE_PYLON_2 = 7;
export const TYPE_PYLON_3 = 8;
export const TYPE_PYLON_4 = 9;
export const TYPE_PYLON_5 = 10;
export const TYPE_KING_GORDOK = 11;
export const TYPE_MOLDAR = 12;
export const TYPE_FENGUS = 13;
export const TYPE_SLIPKIK = 14;
export const TYPE_KROMCRUSH = 15;
export const TYPE_CHORUSH = 16;
export const TYPE_STOMPER_KREEG = 17;
export const TYPE_DREADSTEED = 18;

// dire_maul.h:42–50 East GOs / NPCs
export const GO_CRUMBLE_WALL = 177220;
export const GO_CORRUPT_VINE = 179502;
export const GO_FELVINE_SHARD = 179559;
export const GO_CONSERVATORY_DOOR = 176907;
export const NPC_ZEVRIM_THORNHOOF = 11490;
export const NPC_OLD_IRONBARK = 11491;
export const NPC_IRONBARK_REDEEMED = 14241;
/** Alzzin the Wildshaper. Cite: dire_maul.h:15 TYPE_ALZZIN handled in Acid (not OnCreatureDeath). */
export const NPC_ALZZIN_THE_WILDSHAPER = 11492;
// Acid EVENT_T_HP → SET_INST_DATA(TYPE_ALZZIN, SPECIAL), which opens GO_CRUMBLE_WALL 177220. The
// cpp comment says 50% but the Acid row is 40%, and Acid owns the threshold.
export const ALZZIN_SPECIAL_HP_PCT = 40;

// dire_maul.h:52–90 West
export const NPC_TENDRIS_WARPWOOD = 11489;
export const NPC_PRINCE_TORTHELDRIN = 11486;
export const NPC_IMMOLTHAR = 11496;
export const NPC_ARCANE_ABERRATION = 11480;
export const NPC_MANA_REMNANT = 11483;
export const NPC_HIGHBORNE_SUMMONER = 11466;
export const NPC_WARLOCK_DUMMY_INFERNAL = 14501;
export const NPC_JEEVEE = 14500;

export const GO_PRINCES_CHEST = 179545;
export const GO_PRINCES_CHEST_AURA = 179563;
export const GO_CRYSTAL_GENERATOR_1 = 177259;
export const GO_CRYSTAL_GENERATOR_2 = 177257;
export const GO_CRYSTAL_GENERATOR_3 = 177258;
export const GO_CRYSTAL_GENERATOR_4 = 179504;
export const GO_CRYSTAL_GENERATOR_5 = 179505;
export const GO_FORCEFIELD = 179503;
export const GO_WARPWOOD_DOOR = 177221;
/** West Library Door. OnPlayerEnter near North before TYPE_WARPWOOD DONE → NO_INTERACT. Cite: dire_maul.h:70; instance_dire_maul.cpp:62-73,180-181. */
export const GO_WEST_LIBRARY_DOOR = 179550;

export const GO_BELL_OF_DETHMOORA = 179674;
export const GO_DOOMSDAY_CANDLE = 179673;
export const GO_WHEEL_OF_BLACK_MARCH = 179672;
export const GO_DREADSTEED_PORTAL = 179681;
export const GO_WARLOCK_RITUAL_CIRCLE = 179668;
export const GO_MOUNT_QUEST_SYMBOL1 = 179669;
export const GO_MOUNT_QUEST_SYMBOL2 = 179670;
export const GO_MOUNT_QUEST_SYMBOL3 = 179671;
export const GO_RITUAL_CANDLE_AURA = 179688;

/** Dreadsteed quest helper GOs bound to go_dreadsteed_quest_objects. */
export const GO_DREADSTEED_QUEST_OBJECT_ENTRIES = [
  GO_WHEEL_OF_BLACK_MARCH,
  GO_DOOMSDAY_CANDLE,
  GO_BELL_OF_DETHMOORA,
] as const;

// dire_maul.h:82–90 ritual spells + mobs
/** Quest object pulse auras — not combat-scheduled (corpus spellIds empty). */
export const SPELL_BLACK_MARCH_BLESSING = 23120;
export const SPELL_RITUAL_CANDLE_AURA = 23226;
export const SPELL_RITUAL_BELL_AURA = 23117;
export const SPELL_TELEPORT = 29216;

export const NPC_XOROTHIAN_IMP = 14482;
export const NPC_DREAD_GUARD = 14483;
export const NPC_LORD_HELNURATH = 14506;

// dire_maul.h:94–107 North
export const NPC_GUARD_MOLDAR = 14326;
export const NPC_STOMPER_KREEG = 14322;
export const NPC_GUARD_FENGUS = 14321;
export const NPC_GUARD_SLIPKIK = 14323;
export const NPC_CAPTAIN_KROMCRUSH = 14325;
export const NPC_CHO_RUSH_THE_OBSERVER = 14324;
export const NPC_KING_GORDOK = 11501;
export const NPC_MIZZLE_THE_CRAFTY = 14353;

export const GO_KNOTS_CACHE = 179501;
export const GO_KNOTS_BALL_AND_CHAIN = 179511;
export const GO_GORDOK_TRIBUTE = 179564;
export const GO_NORTH_LIBRARY_DOOR = 179549;
/** Slip'kik fixed trap GO. Cite: scriptdev2.sql:331 entry=179512 */
export const GO_FIXED_TRAP = 179512;
/** Gordok Courtyard Door — Courtyard Key 18266 / lock 1563. Cite: dbc_Lock; live_gameobject. */
export const GO_GORDOK_COURTYARD_DOOR = 177219;
/** Gordok Inner Door — Inner Door Key 18268 / lock 1564. */
export const GO_GORDOK_INNER_DOOR = 177217;
/** Fengus's Chest — only 100% source of Courtyard Key 18266. Cite: loot 16523. */
export const GO_FENGUS_CHEST = 179516;

// dire_maul.h:109–121 texts / factions / spells
export const SAY_FREE_IMMOLTHAR = -1429000;
export const SAY_KILL_IMMOLTHAR = -1429001;
export const SAY_IRONBARK_REDEEM = -1429002;
export const SAY_CHORUSH_KING_DEAD = -1429003;
export const SAY_SLIPKIK_TRAP = -1429004;
export const SAY_UNSUMMON_DEMON = -1429005;

export const FACTION_HOSTILE = 14;
export const FACTION_FRIENDLY = 35;
export const FACTION_OGRE = 45;

export const SPELL_KING_OF_GORDOK = 22799;
export const SPELL_ICE_LOCK = 22856;
export const SPELL_GUARD_SLIPKIK_TRIGGER = 31770;

// dire_maul.cpp:39–40 event ids
export const EVENT_ID_SUMMON_JEEVEE = 8420;
export const EVENT_ID_SUMMON_DREADSTEED = 8428;

// dire_maul.cpp:90 relay base for wave summons
export const SUMMON_WAVES_RELAY_SCRIPT_START_ID = 1_450_100;

// Dummy infernal controller spawn at ritual start. Cite: dire_maul.cpp:55
// SummonCreature(NPC_WARLOCK_DUMMY_INFERNAL, …)
export const WARLOCK_DUMMY_SPAWN_POS = {
  x: -37.9392,
  y: 812.805,
  z: -29.4525,
  o: 4.81711,
  cite: 'dire_maul.cpp:55',
} as const;

/** Pedestal approach coords for summoned demons. Cite: dire_maul.cpp:93 pedestalCords */
export const PEDESTAL_CORDS = {
  x: -38.5,
  y: 811.8,
  z: -29.5,
  cite: 'dire_maul.cpp:93 pedestalCords',
} as const;

/** Mizzle the Crafty spawn after King Gordok dies. Cite: dire_maul.h:124 afMizzleSpawnLoc */
export const MIZZLE_SPAWN_POS = {
  x: 683.296,
  y: 484.384,
  z: 29.544,
  o: 0.0174,
  cite: 'dire_maul.h:124 afMizzleSpawnLoc',
} as const;

// Ritual phase timers — npc_warlock_mount_ritualAI

// Initial phase timer before phase machine starts advancing. Cite: dire_maul.cpp:112 m_uiPhaseTimer = 48000
export const RITUAL_PHASE_INITIAL_MS = 48_000;

// After ProcessDreadsteedRitualStart (phase 1) delay before first wave. Cite: dire_maul.cpp:159
// m_uiPhaseTimer = 1000
export const RITUAL_PHASE1_NEXT_MS = 1000;

// Waves 1–8 (phases 2–9) re-arm between DoSummonPack calls. Cite: dire_maul.cpp:162 m_uiPhaseTimer = 45000
export const RITUAL_WAVE_INTERVAL_MS = 45_000;

/** Final (9th) wave duration before cleanup. Cite: dire_maul.cpp:166 m_uiPhaseTimer = 17500 */
export const RITUAL_FINAL_WAVE_MS = 17_500;

/** Initial helping-object deactivate timer. Cite: dire_maul.cpp:113 m_uiDeactivateTimer = 70000 */
export const RITUAL_DEACTIVATE_INITIAL_MS = 70_000;

// Subsequent deactivate re-arm urand(30000, 45000). Cite: dire_maul.cpp:218 m_uiDeactivateTimer =
// urand(30000, 45000)
export const RITUAL_DEACTIVATE_MIN_MS = 30_000;
export const RITUAL_DEACTIVATE_MAX_MS = 45_000;

// GO ritual aura pulse re-arm after first OnUse (1ms arm). Cite: dire_maul.cpp:278 m_uiPulseTimer = 6000;
// :297 m_uiPulseTimer = 1
export const RITUAL_GO_PULSE_INITIAL_MS = 1;
export const RITUAL_GO_PULSE_REPEAT_MS = 6000;

// Ritual symbol and circle respawn windows.
// Cite: dire_maul.cpp:119 DoRespawnGameObject(…, 900); instance_dire_maul.cpp:619–625 900 / 380.
export const RITUAL_SYMBOL_RESPAWN_S = 900;
export const RITUAL_PORTAL_RESPAWN_S = 380;

// Phase machine for the dreadsteed ritual controller 14501: phase 1 starts the ritual, 2–10 summon
// the nine waves, and 11 clears the demons and sets SPECIAL. Cite: dire_maul.cpp:109–183.
export const RITUAL_PHASE_STEPS = [
  {
    phase: 0,
    armMs: RITUAL_PHASE_INITIAL_MS,
    action: 'noop' as const,
    nextArmMs: 0,
    cite: 'dire_maul.cpp:112,155-186 phase 0 falls through; ++phase',
  },
  {
    phase: 1,
    armMs: 0,
    action: 'process_ritual_start' as const,
    nextArmMs: RITUAL_PHASE1_NEXT_MS,
    cite: 'dire_maul.cpp:157-160 ProcessDreadsteedRitualStart; timer=1000',
  },
  {
    phase: 2,
    armMs: RITUAL_PHASE1_NEXT_MS,
    action: 'summon_pack' as const,
    packIndex: 1,
    nextArmMs: RITUAL_WAVE_INTERVAL_MS,
    cite: 'dire_maul.cpp:161-164 case 2 DoSummonPack(1); timer=45000',
  },
  {
    phase: 3,
    armMs: RITUAL_WAVE_INTERVAL_MS,
    action: 'summon_pack' as const,
    packIndex: 2,
    nextArmMs: RITUAL_WAVE_INTERVAL_MS,
    cite: 'dire_maul.cpp:161-164 case 3 DoSummonPack(2)',
  },
  {
    phase: 4,
    armMs: RITUAL_WAVE_INTERVAL_MS,
    action: 'summon_pack' as const,
    packIndex: 3,
    nextArmMs: RITUAL_WAVE_INTERVAL_MS,
    cite: 'dire_maul.cpp:161-164 case 4 DoSummonPack(3)',
  },
  {
    phase: 5,
    armMs: RITUAL_WAVE_INTERVAL_MS,
    action: 'summon_pack' as const,
    packIndex: 4,
    nextArmMs: RITUAL_WAVE_INTERVAL_MS,
    cite: 'dire_maul.cpp:161-164 case 5 DoSummonPack(4)',
  },
  {
    phase: 6,
    armMs: RITUAL_WAVE_INTERVAL_MS,
    action: 'summon_pack' as const,
    packIndex: 5,
    nextArmMs: RITUAL_WAVE_INTERVAL_MS,
    cite: 'dire_maul.cpp:161-164 case 6 DoSummonPack(5)',
  },
  {
    phase: 7,
    armMs: RITUAL_WAVE_INTERVAL_MS,
    action: 'summon_pack' as const,
    packIndex: 6,
    nextArmMs: RITUAL_WAVE_INTERVAL_MS,
    cite: 'dire_maul.cpp:161-164 case 7 DoSummonPack(6)',
  },
  {
    phase: 8,
    armMs: RITUAL_WAVE_INTERVAL_MS,
    action: 'summon_pack' as const,
    packIndex: 7,
    nextArmMs: RITUAL_WAVE_INTERVAL_MS,
    cite: 'dire_maul.cpp:161-164 case 8 DoSummonPack(7)',
  },
  {
    phase: 9,
    armMs: RITUAL_WAVE_INTERVAL_MS,
    action: 'summon_pack' as const,
    packIndex: 8,
    nextArmMs: RITUAL_WAVE_INTERVAL_MS,
    cite: 'dire_maul.cpp:161-164 case 9 DoSummonPack(8)',
  },
  {
    phase: 10,
    armMs: RITUAL_WAVE_INTERVAL_MS,
    action: 'summon_pack' as const,
    packIndex: 9,
    nextArmMs: RITUAL_FINAL_WAVE_MS,
    cite: 'dire_maul.cpp:165-168 case 10 final wave DoSummonPack(9); timer=17500',
  },
  {
    phase: 11,
    armMs: RITUAL_FINAL_WAVE_MS,
    action: 'cleanup_special' as const,
    nextArmMs: 0,
    cite: 'dire_maul.cpp:169-183 teleport+yell+despawn; SetData SPECIAL; ForcedDespawn',
  },
] as const;

/** GO entry → ritual pulse spell. Cite: dire_maul.cpp:255–266 */
export const DREADSTEED_GO_PULSE_SPELL: Readonly<Record<number, number>> = {
  [GO_BELL_OF_DETHMOORA]: SPELL_RITUAL_BELL_AURA,
  [GO_DOOMSDAY_CANDLE]: SPELL_RITUAL_CANDLE_AURA,
  [GO_WHEEL_OF_BLACK_MARCH]: SPELL_BLACK_MARCH_BLESSING,
};

// Slip'kik trap detection radius (yards). Cite: instance_dire_maul.cpp:649 GetClosestCreatureWithEntry(…,
// 0.5f)
export const FIXED_TRAP_SLIPKIK_RADIUS_YD = 0.5;

// OnPlayerEnter probe for DM North entrance (library cross-wing gate). Cite: instance_dire_maul.cpp:66
// IsWithinDist2d(260.0f, -20.0f, 20.0f) Areatrigger 3189 lands at (254.92, -19.463) — inside this radius.
export const DM_NORTH_ENTER_PROBE = {
  x: 260.0,
  y: -20.0,
  radiusYd: 20.0,
  cite: 'instance_dire_maul.cpp:66 IsWithinDist2d(260.0f, -20.0f, 20.0f)',
} as const;

// Pure helpers

// Port of Object::IsWithinDist2d (squared compare). Cite: Object.h IsWithinDist2d;
// instance_dire_maul.cpp:66
export function isWithinDist2d(
  px: number,
  py: number,
  cx: number,
  cy: number,
  dist: number,
): boolean {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= dist * dist;
}

// Port of instance_dire_maul::OnPlayerEnter north-before-west test. True when the player enters near DM
// North and TYPE_WARPWOOD is not DONE. Cite: instance_dire_maul.cpp:66-69
export function shouldDoNorthBeforeWest(
  playerX: number,
  playerY: number,
  warpwoodData: number,
): boolean {
  return (
    isWithinDist2d(
      playerX,
      playerY,
      DM_NORTH_ENTER_PROBE.x,
      DM_NORTH_ENTER_PROBE.y,
      DM_NORTH_ENTER_PROBE.radiusYd,
    )
    && warpwoodData !== INSTANCE_DATA.DONE
  );
}

// GO_WEST_LIBRARY_DOOR 179550 flag pair: north-before-west sets NO_INTERACT so the illegal
// approach cannot Use it, otherwise LOCKED for the Crescent Key path. Cite: cpp:71-72, :180-181.
export function westLibraryDoorFlags(doNorthBeforeWest: boolean): {
  noInteract: boolean;
  locked: boolean;
} {
  return {
    noInteract: doNorthBeforeWest,
    locked: !doNorthBeforeWest,
  };
}

/** OnPlayerEnter door-flag result for GO 179550. Cite: instance_dire_maul.cpp:62-73 */
export function applyDireMaulOnPlayerEnter(
  playerX: number,
  playerY: number,
  getData: (field: number) => number,
): {
  doNorthBeforeWest: boolean;
  goEntry: number;
  noInteract: boolean;
  locked: boolean;
  cite: string;
} {
  const doNorthBeforeWest = shouldDoNorthBeforeWest(
    playerX,
    playerY,
    getData(TYPE_WARPWOOD),
  );
  const flags = westLibraryDoorFlags(doNorthBeforeWest);
  return {
    doNorthBeforeWest,
    goEntry: GO_WEST_LIBRARY_DOOR,
    noInteract: flags.noInteract,
    locked: flags.locked,
    cite: 'instance_dire_maul.cpp:62-73 OnPlayerEnter; h:70 GO_WEST_LIBRARY_DOOR=179550; h:20 TYPE_WARPWOOD=3',
  };
}

/** Port of instance_dire_maul::CheckAllGeneratorsDestroyed. Cite: instance_dire_maul.cpp:528–531 */
export function checkAllGeneratorsDestroyed(
  getData: (field: number) => number,
): boolean {
  for (let i = 0; i < DM_MAX_GENERATORS; i++) {
    if (getData(TYPE_PYLON_1 + i) !== INSTANCE_DATA.DONE) return false;
  }
  return true;
}

// Tribute-run alive-guard count (0–6) for INSTANCE_CONDITION_ID_* hard modes. Cite:
// instance_dire_maul.cpp:511–514
export function tributeRunAliveBosses(
  getData: (field: number) => number,
): number {
  const fields = [
    TYPE_MOLDAR,
    TYPE_FENGUS,
    TYPE_SLIPKIK,
    TYPE_KROMCRUSH,
    TYPE_CHORUSH,
    TYPE_STOMPER_KREEG,
  ];
  let n = 0;
  for (const f of fields) {
    if (getData(f) !== INSTANCE_DATA.DONE) n++;
  }
  return n;
}

// event_spells_warlock_dreadsteed

// ProcessEventId_event_spells_warlock_dreadsteed: event 8420 summons J'eevee and sets
// IN_PROGRESS, event 8428 sets DONE from SPECIAL. Cite: dire_maul.cpp:43–81.
export const EVENT_SPELLS_WARLOCK_DREADSTEED: ScriptDevIR = {
  name: 'event_spells_warlock_dreadsteed',
  boundCreatures: [],
  sourceFile: 'kalimdor/dire_maul/dire_maul.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [],
    branches: [
      {
        gate: {
          field: TYPE_DREADSTEED,
          equals: INSTANCE_DATA.NOT_STARTED,
          cite: 'dire_maul.cpp:52 GetData(TYPE_DREADSTEED) == NOT_STARTED',
        },
        actions: [
          {
            kind: 'summon_count',
            creatureEntry: NPC_WARLOCK_DUMMY_INFERNAL,
            count: 1,
            cite: 'dire_maul.cpp:55 SummonCreature(NPC_WARLOCK_DUMMY_INFERNAL)',
          },
          {
            kind: 'summon_count',
            creatureEntry: NPC_JEEVEE,
            count: 1,
            cite: 'dire_maul.cpp:58 SummonCreature(NPC_JEEVEE) path 1',
          },
          {
            kind: 'set_instance_data',
            field: TYPE_DREADSTEED,
            value: INSTANCE_DATA.IN_PROGRESS,
            cite: 'dire_maul.cpp:61 SetData(TYPE_DREADSTEED, IN_PROGRESS)',
          },
        ],
        cite: 'dire_maul.cpp:50-65 EVENT_ID_SUMMON_JEEVEE NOT_STARTED',
      },
      {
        gate: {
          field: TYPE_DREADSTEED,
          equals: INSTANCE_DATA.FAIL,
          cite: 'dire_maul.cpp:52 GetData(TYPE_DREADSTEED) == FAIL',
        },
        actions: [
          {
            kind: 'summon_count',
            creatureEntry: NPC_WARLOCK_DUMMY_INFERNAL,
            count: 1,
            cite: 'dire_maul.cpp:55 SummonCreature after FAIL restart',
          },
          {
            kind: 'summon_count',
            creatureEntry: NPC_JEEVEE,
            count: 1,
            cite: 'dire_maul.cpp:58 SummonCreature(NPC_JEEVEE) after FAIL',
          },
          {
            kind: 'set_instance_data',
            field: TYPE_DREADSTEED,
            value: INSTANCE_DATA.IN_PROGRESS,
            cite: 'dire_maul.cpp:61 SetData IN_PROGRESS after FAIL',
          },
        ],
        cite: 'dire_maul.cpp:50-65 EVENT_ID_SUMMON_JEEVEE FAIL',
      },
      {
        gate: {
          field: TYPE_DREADSTEED,
          equals: INSTANCE_DATA.SPECIAL,
          cite: 'dire_maul.cpp:70 GetData(TYPE_DREADSTEED) == SPECIAL',
        },
        actions: [
          {
            kind: 'set_instance_data',
            field: TYPE_DREADSTEED,
            value: INSTANCE_DATA.DONE,
            cite: 'dire_maul.cpp:72 SetData(TYPE_DREADSTEED, DONE)',
          },
        ],
        cite: 'dire_maul.cpp:68-76 EVENT_ID_SUMMON_DREADSTEED SPECIAL → DONE',
      },
    ],
    cite: 'dire_maul.cpp:43-81 ProcessEventId_event_spells_warlock_dreadsteed',
  },
  unusedBindings: [
    {
      entry: NPC_WARLOCK_DUMMY_INFERNAL,
      kind: 'creature',
      reason:
        'NPC 14501 Warlock Mount Ritual Mob is summon-only (dire_maul.cpp:55); absent from product bake - IR ported; no live-bake unit fight',
      cite: 'dire_maul.h:58; dire_maul.cpp:55; loadRealBundle missing 14501',
    },
    {
      entry: NPC_LORD_HELNURATH,
      kind: 'creature',
      reason:
        'NPC 14506 Lord Hel\'nurath is dreadsteed boss summon (OnCreatureDeath → TYPE_DREADSTEED DONE); absent from bake',
      cite: 'dire_maul.h:90; instance_dire_maul.cpp:437-439; loadRealBundle missing 14506',
    },
  ],
  cites: [
    'dire_maul.cpp:43-81',
    'dire_maul.cpp:39-40 EVENT_ID_SUMMON_JEEVEE=8420 EVENT_ID_SUMMON_DREADSTEED=8428',
    'dire_maul.h:39 TYPE_DREADSTEED=18',
    'scriptdev2.sql:335-336',
  ],
};

// npc_warlock_mount_ritual

// npc_warlock_mount_ritualAI on the dummy controller 14501, which is ABSENT from the product bake
// so the binding is unused. The wave summons are relay dbscripts, not host-executable.
export const NPC_WARLOCK_MOUNT_RITUAL: ScriptDevIR = {
  name: 'npc_warlock_mount_ritual',
  boundCreatures: [NPC_WARLOCK_DUMMY_INFERNAL],
  sourceFile: 'kalimdor/dire_maul/dire_maul.cpp',
  // Combat kit empty — the controller has no fight casts. The ritual only casts SPELL_TELEPORT on
  // summoned demons at cleanup; the phase and deactivate timers are RITUAL_* constants.
  spellIds: [],
  timers: [],
  // C++ Reset (cpp:109-114) only zeros phase/timers — no SetData / yells.
  unusedBindings: [
    {
      entry: NPC_WARLOCK_DUMMY_INFERNAL,
      kind: 'creature',
      reason:
        'creature_template entry 14501 bound via ScriptName=npc_warlock_mount_ritual (scriptdev2.sql:332) but absent from product bake - IR ported; ritual timers documented in RITUAL_* constants; no live-bake unit fight',
      cite: 'scriptdev2.sql:332; loadRealBundle missing 14501; dire_maul.cpp:95-223',
    },
  ],
  cites: [
    'dire_maul.cpp:95-223 npc_warlock_mount_ritualAI',
    'dire_maul.cpp:112 m_uiPhaseTimer=48000',
    'dire_maul.cpp:113 m_uiDeactivateTimer=70000',
    'dire_maul.cpp:157-183 phase switch',
    'dire_maul.cpp:162 m_uiPhaseTimer=45000 waves',
    'dire_maul.cpp:166 m_uiPhaseTimer=17500 final wave',
    'dire_maul.cpp:181 SetData(TYPE_DREADSTEED, SPECIAL)',
    'dire_maul.cpp:218 urand(30000,45000) deactivate re-arm',
    'dire_maul.cpp:90 SUMMON_WAVES_RELAY_SCRIPT_START_ID=1450100',
    'scriptdev2.sql:332',
  ],
};

// go_dreadsteed_quest_objects

// DreadsteedQuestObjects GameObjectAI on GO 179672/179673/179674: despawns unless the ritual is
// IN_PROGRESS, then pulses its ritual aura every 6000 ms. Cite: dire_maul.cpp:229–299.
export const GO_DREADSTEED_QUEST_OBJECTS: ScriptDevIR = {
  name: 'go_dreadsteed_quest_objects',
  boundCreatures: [],
  boundGos: [...GO_DREADSTEED_QUEST_OBJECT_ENTRIES],
  sourceFile: 'kalimdor/dire_maul/dire_maul.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [...GO_DREADSTEED_QUEST_OBJECT_ENTRIES],
    gates: [
      {
        field: TYPE_DREADSTEED,
        equals: INSTANCE_DATA.IN_PROGRESS,
        cite: 'dire_maul.cpp:239 GetData(TYPE_DREADSTEED) != IN_PROGRESS → ForcedDespawn on spawn; OnUse only meaningful in-progress',
      },
    ],
    // OnUse arms pulse (cpp:297); spell selection by entry is host/product GO AI.
    actions: [],
    cite: 'dire_maul.cpp:291-298 OnUse arm m_uiPulseTimer=1; UpdateAI 248-282 pulse 6000ms',
  },
  cites: [
    'dire_maul.cpp:229-299 DreadsteedQuestObjects',
    'dire_maul.cpp:255-266 GO→spell map BELL=23117 CANDLE=23226 WHEEL=23120',
    'dire_maul.cpp:278 m_uiPulseTimer=6000',
    'dire_maul.cpp:297 m_uiPulseTimer=1',
    'dire_maul.h:72-74 GO_BELL/CANDLE/WHEEL',
    'scriptdev2.sql:333',
  ],
};

// go_fixed_trap

// go_ai_fixed_trap on GO 179512: proximity, not a player use — within 0.5 yd of Guard Slip'kik it
// fires, yells and turns him hostile. Cite: instance_dire_maul.cpp:637–660.
export const GO_FIXED_TRAP_SCRIPT: ScriptDevIR = {
  name: 'go_fixed_trap',
  boundCreatures: [],
  boundGos: [GO_FIXED_TRAP],
  sourceFile: 'kalimdor/dire_maul/instance_dire_maul.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_FIXED_TRAP],
    actions: [
      {
        kind: 'yell',
        textId: SAY_SLIPKIK_TRAP,
        cite: 'instance_dire_maul.cpp:652 DoScriptText(SAY_SLIPKIK_TRAP, slipkik)',
      },
      {
        kind: 'stop_combat',
        cite: 'instance_dire_maul.cpp:653 slipkik->AI()->EnterEvadeMode()',
      },
      {
        kind: 'force_despawn',
        delayMs: 0,
        cite: 'instance_dire_maul.cpp:656 m_go->SetLootState(GO_JUST_DEACTIVATED)',
      },
    ],
    cite: 'instance_dire_maul.cpp:637-660 go_ai_fixed_trap proximity 0.5y to NPC_GUARD_SLIPKIK=14323',
  },
  cites: [
    'instance_dire_maul.cpp:637-660',
    'instance_dire_maul.cpp:649 radius 0.5f',
    'instance_dire_maul.cpp:655 FACTION_HOSTILE=14 temp',
    'dire_maul.h:97 NPC_GUARD_SLIPKIK=14323',
    'dire_maul.h:113 SAY_SLIPKIK_TRAP=-1429004',
    'scriptdev2.sql:331 entry=179512',
  ],
};

// instance_dire_maul

// instance_dire_maul, m_auiEncounter[19]: East 0–2, West 3–10, North 11–17, Dreadsteed 18. Bound
// through instance_template for the map 429 wings; go_fixed_trap is its own script.
export const INSTANCE_DIRE_MAUL: ScriptDevIR = {
  name: 'instance_dire_maul',
  boundCreatures: [],
  sourceFile: 'kalimdor/dire_maul/instance_dire_maul.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    // East
    {
      creatureEntry: NPC_ZEVRIM_THORNHOOF,
      field: TYPE_ZEVRIM,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_dire_maul.cpp:417-419 OnCreatureDeath Zevrim → TYPE_ZEVRIM DONE',
    },
    {
      // Redeemed form death opens conservatory (Old Ironbark transforms on Zevrim DONE).
      creatureEntry: NPC_IRONBARK_REDEEMED,
      field: TYPE_IRONBARK,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_dire_maul.cpp:420-422 Ironbark Redeemed → TYPE_IRONBARK DONE',
    },
    // West bosses
    {
      creatureEntry: NPC_TENDRIS_WARPWOOD,
      field: TYPE_WARPWOOD,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_dire_maul.cpp:431-433 Tendris → TYPE_WARPWOOD DONE',
    },
    {
      creatureEntry: NPC_IMMOLTHAR,
      field: TYPE_IMMOLTHAR,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_dire_maul.cpp:405-407 combat IN_PROGRESS; :434-436 death DONE',
    },
    {
      creatureEntry: NPC_LORD_HELNURATH,
      field: TYPE_DREADSTEED,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_dire_maul.cpp:437-439 Hel\'nurath → TYPE_DREADSTEED DONE',
    },
    // North
    {
      creatureEntry: NPC_KING_GORDOK,
      field: TYPE_KING_GORDOK,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_dire_maul.cpp:443-445 King Gordok → TYPE_KING_GORDOK DONE',
    },
    {
      creatureEntry: NPC_GUARD_MOLDAR,
      field: TYPE_MOLDAR,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_dire_maul.cpp:447-449',
    },
    {
      creatureEntry: NPC_GUARD_FENGUS,
      field: TYPE_FENGUS,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_dire_maul.cpp:450-452',
    },
    {
      creatureEntry: NPC_GUARD_SLIPKIK,
      field: TYPE_SLIPKIK,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_dire_maul.cpp:453-455',
    },
    {
      creatureEntry: NPC_CAPTAIN_KROMCRUSH,
      field: TYPE_KROMCRUSH,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_dire_maul.cpp:456-458',
    },
    {
      creatureEntry: NPC_CHO_RUSH_THE_OBSERVER,
      field: TYPE_CHORUSH,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_dire_maul.cpp:459-461',
    },
    {
      creatureEntry: NPC_STOMPER_KREEG,
      field: TYPE_STOMPER_KREEG,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_dire_maul.cpp:462-464',
    },
  ],
  doors: [
    {
      field: TYPE_IRONBARK,
      goEntry: GO_CONSERVATORY_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_dire_maul.cpp:127-129 OnObjectCreate GO_CONSERVATORY_DOOR when TYPE_IRONBARK DONE; h:45',
    },
    {
      field: TYPE_ALZZIN,
      goEntry: GO_CRUMBLE_WALL,
      openOn: [INSTANCE_DATA.DONE, INSTANCE_DATA.SPECIAL],
      cite:
        'instance_dire_maul.cpp:247-250 SPECIAL + :233-237 DONE → DoUseDoorOrButton(GO_CRUMBLE_WALL=177220); acid_classic.sql:15013 1149214 HP≤40 SET_INST_DATA(0,SPECIAL=4)',
    },
    {
      field: TYPE_ALZZIN,
      goEntry: GO_CORRUPT_VINE,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_dire_maul.cpp:239 DoUseDoorOrButton(GO_CORRUPT_VINE=179502) on ALZZIN DONE',
    },
    {
      field: TYPE_WARPWOOD,
      goEntry: GO_WARPWOOD_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_dire_maul.cpp:257-258 TYPE_WARPWOOD DONE → GO_WARPWOOD_DOOR; also lock 1562 Crescent Key 18249 / picklock 300',
    },
    // The forcefield opens when all five pylons are DONE. The host opens on TYPE_PYLON_5 DONE as
    // the last-pylon smoke path; the product may re-check all five via checkAllGeneratorsDestroyed.
    {
      field: TYPE_PYLON_5,
      goEntry: GO_FORCEFIELD,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_dire_maul.cpp:287-288 CheckAllGeneratorsDestroyed → ProcessForceFieldOpening GO_FORCEFIELD; last pylon smoke',
    },
    // North key doors — player-click open (locks.json), not instance TYPE_* fields.
    // Registered so the doors table matches East/West pattern for map 429.
    {
      field: TYPE_KING_GORDOK,
      goEntry: GO_GORDOK_COURTYARD_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'GO 177219 lock 1563 Courtyard Key 18266; key-only door (player open, not TYPE flag)',
    },
    {
      field: TYPE_KING_GORDOK,
      goEntry: GO_GORDOK_INNER_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'GO 177217 lock 1564 Inner Door Key 18268 or picklock 200',
    },
    {
      field: TYPE_KING_GORDOK,
      goEntry: GO_NORTH_LIBRARY_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'GO 179549 lock 1562 Crescent Key 18249 or picklock 300; locks.json 1562; gameobject-data.json keyId 18249',
    },
    // GO 179550 West Library Door: same lock 1562 (player-click / north-before-west).
    // Not bound openOn TYPE_* — instance only toggles NO_INTERACT/LOCKED (cpp:62-73).
  ],
  unusedBindings: [
    {
      entry: NPC_IRONBARK_REDEEMED,
      kind: 'creature',
      reason:
        'NPC 14241 Ironbark the Redeemed is UpdateEntry transform of 11491 on TYPE_ZEVRIM DONE; absent as static bake row - encounter IR still maps death → TYPE_IRONBARK',
      cite: 'instance_dire_maul.cpp:216-223; loadRealBundle missing 14241',
    },
    {
      entry: NPC_LORD_HELNURATH,
      kind: 'creature',
      reason:
        'NPC 14506 Lord Hel\'nurath dreadsteed encounter boss is summon-only; absent from bake',
      cite: 'instance_dire_maul.cpp:437-439; loadRealBundle missing 14506',
    },
    {
      entry: NPC_MIZZLE_THE_CRAFTY,
      kind: 'creature',
      reason:
        'NPC 14353 Mizzle summoned on TYPE_KING_GORDOK DONE (cpp:347); absent from bake',
      cite: 'instance_dire_maul.cpp:347; dire_maul.h:102; loadRealBundle missing 14353',
    },
  ],
  cites: [
    'instance_dire_maul.cpp:29-697',
    'instance_dire_maul.cpp:41-59 Update dreadsteed fail conditions',
    'instance_dire_maul.cpp:62-73 OnPlayerEnter north-before-west GO 179550',
    'instance_dire_maul.cpp:180-181 OnObjectCreate GO_WEST_LIBRARY_DOOR flags',
    'instance_dire_maul.cpp:210-384 SetData',
    'instance_dire_maul.cpp:233-253 TYPE_ALZZIN SPECIAL/DONE doors + Felvine respawn',
    'instance_dire_maul.cpp:256-259 TYPE_WARPWOOD DONE → GO_WARPWOOD_DOOR',
    'instance_dire_maul.cpp:394-466 OnCreatureEnterCombat/Death',
    'instance_dire_maul.cpp:528-531 CheckAllGeneratorsDestroyed',
    'instance_dire_maul.cpp:615-626 ProcessDreadsteedRitualStart',
    'dire_maul.h:20 TYPE_WARPWOOD=3',
    'dire_maul.h:70 GO_WEST_LIBRARY_DOOR=179550',
    'dire_maul.h:8-180',
    'acid_classic.sql:15013-15020 Alzzin 1149214 SPECIAL@40% / 1149221 DONE',
    'scriptdev2.sql:329-336',
  ],
};

// Acid 1149214: HP≤40% → SetData(TYPE_ALZZIN, SPECIAL) → open Crumble Wall 177220. Cite:
// acid_classic.sql:15013; instance_dire_maul.cpp:247-250; sc_instance.h:18 SPECIAL=4.
export function applyAlzzinHpSpecial(store: Map<number, number>): InstanceHostResult {
  return applyInstanceSetData(
    INSTANCE_DIRE_MAUL,
    TYPE_ALZZIN,
    INSTANCE_DATA.SPECIAL,
    store,
  );
}

// Acid 1149221: death sets TYPE_ALZZIN DONE, which opens the wall and Corrupt Vine 179502. Felvine
// Shard 179559 is the InstanceDef lootObjects revealedByFlag seam. Cite: acid_classic.sql:15020.
export function applyAlzzinDeathDone(store: Map<number, number>): InstanceHostResult {
  return applyInstanceSetData(
    INSTANCE_DIRE_MAUL,
    TYPE_ALZZIN,
    INSTANCE_DATA.DONE,
    store,
  );
}
