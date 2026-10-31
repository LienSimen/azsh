// EventAI overlays for zul-farrak.

import type { CreatureAiBundle, CreatureAiSummon, CreatureDef } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_FLEE_FOR_ASSIST,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_SUMMON_ID,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script, templateStub } from './helpers.ts';

// dmapfid:generated-start — DB-extracted summon points (not hand-typed map pins)
const SUMMONS_ANTUSUL: CreatureAiSummon[] = [
  // id 12–15: Antu'sul broodling points (coords placement-only; spawnTimeSecs=1800)
  { id: 12, x: 1786.02, y: 743.399, z: 15.4818, o: 6.10865, spawnTimeSecs: 1800 },
  { id: 13, x: 1823.42, y: 748.297, z: 20.7949, o: 3.94444, spawnTimeSecs: 1800 },
  { id: 14, x: 1810.2, y: 749.873, z: 17.5979, o: 4.55531, spawnTimeSecs: 1800 },
  { id: 15, x: 1798.41, y: 757.586, z: 15.2164, o: 5.06145, spawnTimeSecs: 1800 },
];
// dmapfid:generated-end

const SUMMONS_UKORZ: CreatureAiSummon[] = [
  { id: 22, x: 1717.61, y: 1006.29, z: 53.66, o: 0.9, spawnTimeSecs: 10_000 },
  { id: 23, x: 1717.61, y: 1006.29, z: 53.66, o: 0.9, spawnTimeSecs: 10_000 },
  { id: 24, x: 1717.61, y: 1006.29, z: 53.66, o: 0.9, spawnTimeSecs: 10_000 },
  { id: 25, x: 1717.61, y: 1006.29, z: 53.66, o: 0.9, spawnTimeSecs: 10_000 },
];

export const summonOnly: ReadonlyArray<readonly [number, CreatureDef]> = [
  // 8138 Sul'lithuz Broodling — level 39; health 3123/1292 (Max inverted in DB); melee 109.97/97.40;
  // Armor 1016; Rank 1; Type 10; Faction 16; attack 2000 ms; mana 3075; LootId 8138; gold 29–145.
  [
    8138,
    templateStub({
      entry: 8138,
      name: "Sul'lithuz Broodling",
      level: 39,
      hpMin: 3123,
      hpMax: 1292,
      dmgMin: 109.97,
      dmgMax: 97.4,
      armor: 1016,
      attackTimeMs: 2000,
      creatureType: 10,
      factionId: 16,
      lootId: 8138,
      minGold: 29,
      maxGold: 145,
      mana: 3075,
    }),
  ],
  // 8156 Servant of Antu'sul — lvl 48; HP 6186; melee 80.41–106.62; Armor=2888; Rank=1;
  // Type=10; Faction=16; atk 2000; gold 80–964 (DB MinLootGold=964 Max=80 → normalized).
  [
    8156,
    templateStub({
      entry: 8156,
      name: "Servant of Antu'sul",
      level: 48,
      hpMin: 6186,
      hpMax: 6186,
      dmgMin: 80.41,
      dmgMax: 106.62,
      armor: 2888,
      attackTimeMs: 2000,
      creatureType: 10,
      factionId: 16,
      lootId: 0,
      minGold: 964,
      maxGold: 80,
    }),
  ]
];

// Antu'sul 8127 (Zul'Farrak) — the 7 DB rows verbatim plus creature_ai_summons coords, which the
// bake lacks. The old hand port dropped three rows and double-spawned servants. Cite: id 8127.
const ANTUSUL_AI: CreatureAiBundle = {
  summons: SUMMONS_ANTUSUL,
  scripts: [
    // 812701 — AGGRO: yell (broadcast 4166).
    script({
      id: 812701,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 4166, 0, 0)],
    }),
    // 812702 — TIMER_IN_COMBAT flags 0, initial 3000–3000, no repeat: 2 broodlings @12+@13.
    script({
      id: 812702,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      p1: 3000,
      p2: 3000,
      p3: 0,
      p4: 0,
      actions: [
        act(ACTION_T_SUMMON_ID, 8138, 1, 12),
        act(ACTION_T_SUMMON_ID, 8138, 1, 13),
      ],
    }),
    // 812703 — same timer; spawn ids 14 + 15.
    script({
      id: 812703,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      p1: 3000,
      p2: 3000,
      p3: 0,
      p4: 0,
      actions: [
        act(ACTION_T_SUMMON_ID, 8138, 1, 14),
        act(ACTION_T_SUMMON_ID, 8138, 1, 15),
      ],
    }),
    // 812704 — flags 1057 = REPEATABLE|RANDOM_ACTION|COMBAT_ACTION: ONE random cast of
    // {Earthgrab 8376, Earthgrab 8376, Healing Ward 11899} per 13.3–21.7s period.
    script({
      id: 812704,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1057,
      p1: 11600,
      p2: 11600,
      p3: 13300,
      p4: 21700,
      actions: [
        act(ACTION_T_CAST, 8376, 0, 0),
        act(ACTION_T_CAST, 8376, 0, 0),
        act(ACTION_T_CAST, 11899, 0, 0),
      ],
    }),
    // 812705 — HP≤75% flags 1024 (fire once): yell + CAST 11894 → 1× Servant 8156.
    script({
      id: 812705,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 75,
      p2: 0,
      actions: [
        act(ACTION_T_TEXT, 4177, 0, 0),
        act(ACTION_T_CAST, 11894, 0, 0),
      ],
    }),
    // 812706 — HP≤25% flags 1024: yell + CAST 11894 ×2 → 2× Servant 8156.
    script({
      id: 812706,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 25,
      p2: 0,
      actions: [
        act(ACTION_T_TEXT, 4178, 0, 0),
        act(ACTION_T_CAST, 11894, 0, 0),
        act(ACTION_T_CAST, 11894, 0, 0),
      ],
    }),
    // 812707 — HP≤20% flags 1024: CAST 11895 Healing Wave of Antu'sul.
    script({
      id: 812707,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 20,
      p2: 0,
      actions: [act(ACTION_T_CAST, 11895, 0, 0)],
    }),
  ],
};

// Gahz'rilla 7273 (Zul'Farrak). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17389-17391 creature_id=7273.
const GAHZRILLA_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 727301,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9700,
      p2: 21_600,
      p3: 22_800,
      p4: 33_800,
      actions: [act(ACTION_T_CAST, 11836, 1, 0)],
    }),
    script({
      id: 727302,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 27_700,
      p2: 31_200,
      p3: 16_900,
      p4: 28_900,
      actions: [act(ACTION_T_CAST, 11902, 4, 0)],
    }),
    script({
      id: 727303,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8400,
      p2: 36_100,
      p3: 8500,
      p4: 27_700,
      actions: [act(ACTION_T_CAST, 11131, 4, 0)],
    }),
  ],
};

// Chief Ukorz Sandscalp 7267 (Zul'Farrak). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17370-17378; summons ids 22-25 :19987-19990.
const UKORZ_AI: CreatureAiBundle = {
  summons: SUMMONS_UKORZ,
  scripts: [
    script({
      id: 726701,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 11_838, 0, 34)],
    }),
    script({
      id: 726702,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 6225, 0, 0)],
    }),
    script({
      id: 726703,
      eventType: EVENT_T.KILL,
      flags: 1,
      p1: 5000,
      p2: 5000,
      p3: 1,
      actions: [act(ACTION_T_TEXT, 6226, 0, 0)],
    }),
    script({
      id: 726704,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 30,
      actions: [
        act(ACTION_T_TEXT, 6227, 0, 0),
        act(ACTION_T_CAST, 11_904, 0, 0),
        act(ACTION_T_SUMMON_ID, 7787, 1, 22),
      ],
    }),
    script({
      id: 726705,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 30,
      actions: [
        act(ACTION_T_SUMMON_ID, 7787, 1, 23),
        act(ACTION_T_SUMMON_ID, 7787, 1, 24),
        act(ACTION_T_SUMMON_ID, 7787, 1, 25),
      ],
    }),
    script({
      id: 726706,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 60,
      p3: 120_000,
      p4: 125_000,
      actions: [
        act(ACTION_T_TEXT, 6228, 0, 0),
        act(ACTION_T_CAST, 8269, 0, 0),
      ],
    }),
    script({
      id: 726707,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 3000,
      p3: 240_000,
      p4: 245_000,
      actions: [act(ACTION_T_CAST, 7366, 0, 0)],
    }),
    script({
      id: 726708,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 12_000,
      p2: 16_400,
      p3: 7400,
      p4: 24_600,
      actions: [act(ACTION_T_CAST, 11_837, 1, 0)],
    }),
    script({
      id: 726709,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6100,
      p2: 20_600,
      p3: 8700,
      p4: 19_400,
      actions: [act(ACTION_T_CAST, 15_623, 1, 0)],
    }),
  ],
};

// Theka the Martyr 7272 (Zul'Farrak). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17386-17387 creature_id=7272.
const THEKA_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 727201,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 15_700,
      p2: 18_800,
      p3: 10_900,
      p4: 22_900,
      actions: [act(ACTION_T_CAST, 8600, 4, 32)],
    }),
    script({
      id: 727202,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 30,
      actions: [act(ACTION_T_CAST, 11_089, 0, 6)],
    }),
  ],
};

// Shadowpriest Sezz'ziz 7275 (Zul'Farrak). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17399-17405 creature_id=7275.
const SEZZZIZ_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 727501,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 727502,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
    script({
      id: 727503,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 11_300,
      p2: 15_900,
      p3: 22_500,
      p4: 32_600,
      actions: [act(ACTION_T_CAST, 13_704, 17, 0)],
    }),
    script({
      id: 727504,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 2000,
      p2: 40,
      p3: 27_800,
      p4: 34_200,
      actions: [act(ACTION_T_CAST, 8362, 12, 0)],
    }),
    script({
      id: 727505,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 3000,
      p2: 40,
      p3: 14_200,
      p4: 25_300,
      actions: [act(ACTION_T_CAST, 12_039, 12, 0)],
    }),
    script({
      id: 727506,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p2: 40,
      p3: 3400,
      p4: 3800,
      actions: [act(ACTION_T_CAST, 15_537, 1, 256)],
    }),
  ],
};

// Hydromancer Velratha 7795 (Zul'Farrak). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17445-17449 creature_id=7795.
const VELRATHA_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 779501,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 779502,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 50,
      p3: 9500,
      p4: 21_600,
      actions: [act(ACTION_T_CAST, 12_491, 0, 0)],
    }),
    script({
      id: 779503,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 17_200,
      p2: 19_200,
      p3: 13_300,
      p4: 27_700,
      actions: [act(ACTION_T_CAST, 11_086, 0, 0)],
    }),
    script({
      id: 779504,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 20_000,
      p3: 16_900,
      p4: 21_800,
      actions: [act(ACTION_T_CAST, 15_245, 17, 0)],
    }),
    script({
      id: 779505,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p2: 40,
      p3: 3600,
      p4: 4800,
      actions: [act(ACTION_T_CAST, 12_739, 1, 256)],
    }),
  ],
};

// Nekrum Gutchewer 7796 (Zul'Farrak). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17451 creature_id=7796.
const NEKRUM_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 779601,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6400,
      p2: 16_400,
      p3: 16_900,
      p4: 21_700,
      actions: [act(ACTION_T_CAST, 8600, 4, 0)],
    }),
  ],
};

// Ruuzlu 7797 (Zul'Farrak). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17453-17455 creature_id=7797.
const RUUZLU_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 779701,
      eventType: EVENT_T.TARGET_HP,
      flags: 1025,
      p1: 20,
      p3: 30_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 7160, 1, 0)],
    }),
    script({
      id: 779702,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 3000,
      p3: 240_000,
      p4: 240_000,
      actions: [act(ACTION_T_CAST, 7366, 0, 0)],
    }),
    script({
      id: 779703,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7800,
      p2: 12_900,
      p3: 7400,
      p4: 18_400,
      actions: [act(ACTION_T_CAST, 15_623, 1, 0)],
    }),
  ],
};

// Sandarr Dunereaver 10080 (Zul'Farrak). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17485-17488 creature_id=10080.
const SANDARR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1008001,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 10_000,
      p3: 15_700,
      p4: 26_100,
      actions: [act(ACTION_T_CAST, 14_516, 1, 0)],
    }),
    script({
      id: 1008002,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 3000,
      p2: 11_800,
      p3: 14_500,
      p4: 35_600,
      actions: [act(ACTION_T_CAST, 13_730, 0, 0)],
    }),
    script({
      id: 1008003,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9700,
      p2: 19_800,
      p3: 15_300,
      p4: 24_800,
      actions: [act(ACTION_T_CAST, 15_615, 1, 0)],
    }),
    script({
      id: 1008004,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
  ],
};

// Zerillis 10082 (Zul'Farrak). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17494-17498 creature_id=10082.
const ZERILLIS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1008201,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 25, 0)],
    }),
    script({
      id: 1008202,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
    script({
      id: 1008203,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4000,
      p2: 8000,
      p3: 12_100,
      p4: 25_400,
      actions: [act(ACTION_T_CAST, 6533, 1, 1024)],
    }),
    script({
      id: 1008204,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 11_000,
      p3: 4800,
      p4: 18_100,
      actions: [act(ACTION_T_CAST, 12_551, 1, 0)],
    }),
    script({
      id: 1008205,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p1: 5,
      p2: 30,
      p3: 2300,
      p4: 3700,
      actions: [act(ACTION_T_CAST, 15_547, 1, 256)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [8127, ANTUSUL_AI],
  [7273, GAHZRILLA_AI],
  [7267, UKORZ_AI],
  [7272, THEKA_AI],
  [7275, SEZZZIZ_AI],
  [7795, VELRATHA_AI],
  [7796, NEKRUM_AI],
  [7797, RUUZLU_AI],
  [10080, SANDARR_AI],
  [10082, ZERILLIS_AI],
];
