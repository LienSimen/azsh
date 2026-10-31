// EventAI overlays for blackrock-depths.

import type { CreatureAiBundle, CreatureDef } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_DESPAWN_GUARDIANS,
  ACTION_T_FLEE_FOR_ASSIST,
  ACTION_T_REMOVE_UNIT_FLAG,
  ACTION_T_SET_INST_DATA,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script, templateStub } from './helpers.ts';

export const summonOnly: ReadonlyArray<readonly [number, CreatureDef]> = [
  // ---- BRD Ring of Law trash (ClassicDB creature_template; MinLevelHealth…MeleeBaseAttackTime) ----
  // 8926 Deep Stinger — lvl 50–52; HP 6645–7113; melee 85–117; Armor 3885; Type 1; atk 2000.
  [
    8926,
    templateStub({
      entry: 8926,
      name: 'Deep Stinger',
      level: 50,
      hpMin: 6645,
      hpMax: 7113,
      dmgMin: 85,
      dmgMax: 117,
      armor: 3885,
      attackTimeMs: 2000,
      creatureType: 1,
      factionId: 16,
      lootId: 8926,
      minGold: 0,
      maxGold: 0,
    }),
  ],
  // 8927 Dark Screecher — HP 2215–2371; melee 85–117; Armor 3108.
  [
    8927,
    templateStub({
      entry: 8927,
      name: 'Dark Screecher',
      level: 50,
      hpMin: 2215,
      hpMax: 2371,
      dmgMin: 85,
      dmgMax: 117,
      armor: 3108,
      attackTimeMs: 2000,
      creatureType: 1,
      factionId: 16,
      lootId: 8927,
      minGold: 0,
      maxGold: 0,
    }),
  ],
  // 8928 Burrowing Thundersnout — HP 5538–5928; melee 85–117; Armor 3108.
  [
    8928,
    templateStub({
      entry: 8928,
      name: 'Burrowing Thundersnout',
      level: 50,
      hpMin: 5538,
      hpMax: 5928,
      dmgMin: 85,
      dmgMax: 117,
      armor: 3108,
      attackTimeMs: 2000,
      creatureType: 1,
      factionId: 16,
      lootId: 8928,
      minGold: 0,
      maxGold: 0,
    }),
  ],
  // 8932 Borer Beetle — HP 2215–2371; melee 85–117; Armor 3108.
  [
    8932,
    templateStub({
      entry: 8932,
      name: 'Borer Beetle',
      level: 50,
      hpMin: 2215,
      hpMax: 2371,
      dmgMin: 85,
      dmgMax: 117,
      armor: 3108,
      attackTimeMs: 2000,
      creatureType: 1,
      factionId: 16,
      lootId: 8932,
      minGold: 0,
      maxGold: 0,
    }),
  ]
];

// Panzor the Invincible 8923 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14082 creature_id=8923.
const PANZOR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 892301,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 9941, 0, 34)],
    }),
  ],
};

// Golem Lord Argelmach 8983 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14110-14114 creature_id=8983.
const ARGELMACH_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 898301,
      eventType: EVENT_T.TIMER_OOC,
      flags: 1,
      p1: 1000,
      p2: 1000,
      p3: 600_000,
      p4: 600_000,
      actions: [act(ACTION_T_CAST, 15_507, 0, 1)],
    }),
    script({
      id: 898302,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 16_000,
      p3: 6000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 15_305, 1, 0)],
    }),
    script({
      id: 898303,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 21_000,
      p3: 6000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 15_605, 4, 512)],
    }),
    script({
      id: 898304,
      eventType: EVENT_T.MISSING_AURA,
      flags: 1,
      p1: 15_507,
      p2: 1,
      p3: 10_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 15_507, 0, 1)],
    }),
    script({
      id: 898305,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 5297, 0, 0)],
    }),
  ],
};

// Bael'Gar 9016 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14116-14120 creature_id=9016.
const BAELGAR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 901601,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 23_378, 0, 34)],
    }),
    script({
      id: 901602,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 80,
      actions: [
        act(ACTION_T_CAST, 13_895, 4, 512),
        act(ACTION_T_TEXT, 5283, 0, 0),
      ],
    }),
    script({
      id: 901603,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 60,
      actions: [
        act(ACTION_T_CAST, 13_895, 4, 512),
        act(ACTION_T_TEXT, 5283, 0, 0),
      ],
    }),
    script({
      id: 901604,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 40,
      actions: [
        act(ACTION_T_CAST, 13_895, 4, 512),
        act(ACTION_T_TEXT, 5283, 0, 0),
      ],
    }),
    script({
      id: 901605,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 20,
      actions: [
        act(ACTION_T_CAST, 13_895, 4, 512),
        act(ACTION_T_TEXT, 5283, 0, 0),
      ],
    }),
  ],
};

// Lord Incendius 9017 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14122-14126 creature_id=9017.
const INCENDIUS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 901701,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 5000,
      p3: 20_000,
      p4: 28_000,
      actions: [act(ACTION_T_CAST, 26_977, 0, 0)],
    }),
    script({
      id: 901702,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 11_000,
      p3: 9000,
      p4: 16_000,
      actions: [act(ACTION_T_CAST, 13_900, 1, 0)],
    }),
    script({
      id: 901703,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9000,
      p2: 17_000,
      p3: 18_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 14_099, 4, 0)],
    }),
    script({
      id: 901704,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 12_000,
      p2: 16_000,
      p3: 11_000,
      p4: 14_000,
      actions: [act(ACTION_T_CAST, 13_899, 4, 0)],
    }),
    script({
      id: 901705,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_TEXT, 5061, 0, 0)],
    }),
  ],
};

// Pyromancer Loregrain 9024 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14134-14137 creature_id=9024.
const LOREGRAIN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 902401,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2000,
      p2: 7000,
      p3: 30_000,
      p4: 45_000,
      actions: [act(ACTION_T_CAST, 15_041, 0, 0)],
    }),
    script({
      id: 902402,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4000,
      p2: 6000,
      p3: 7000,
      p4: 11_000,
      actions: [act(ACTION_T_CAST, 15_095, 1, 0)],
    }),
    script({
      id: 902403,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 11_000,
      p3: 12_000,
      p4: 19_000,
      actions: [act(ACTION_T_CAST, 15_616, 4, 0)],
    }),
    script({
      id: 902404,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 10_000,
      p3: 25_000,
      p4: 35_000,
      actions: [act(ACTION_T_CAST, 15_038, 0, 0)],
    }),
  ],
};

// Lord Roccor 9025 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14139-14141 creature_id=9025.
const ROCCOR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 902501,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 15_000,
      p3: 13_000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 13_729, 1, 0)],
    }),
    script({
      id: 902502,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 11_000,
      p3: 9000,
      p4: 14_000,
      actions: [act(ACTION_T_CAST, 13_728, 4, 2048)],
    }),
    script({
      id: 902503,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 15_000,
      p3: 9000,
      p4: 14_000,
      actions: [act(ACTION_T_CAST, 6524, 17, 0)],
    }),
  ],
};

// Gorosh the Dervish 9027 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14143-14145 creature_id=9027.
const GOROSH_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 902701,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 22_000,
      p2: 22_000,
      p3: 15_000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 15_708, 1, 0)],
    }),
    script({
      id: 902702,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 12_000,
      p2: 12_000,
      p3: 15_000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 13_736, 0, 0)],
    }),
    script({
      id: 902703,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 30_000,
      p2: 30_000,
      p3: 45_000,
      p4: 45_000,
      actions: [act(ACTION_T_CAST, 21_049, 0, 0)],
    }),
  ],
};

// Grizzle 9028 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14147-14149 creature_id=9028.
const GRIZZLE_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 902801,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 14_000,
      p3: 7000,
      p4: 14_000,
      actions: [act(ACTION_T_CAST, 6524, 17, 0)],
    }),
    script({
      id: 902802,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 51,
      p3: 15_000,
      p4: 15_000,
      actions: [
        act(ACTION_T_CAST, 8269, 0, 0),
        act(ACTION_T_TEXT, 1191, 0, 0),
      ],
    }),
    script({
      id: 902803,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4000,
      p2: 12_000,
      p3: 4000,
      p4: 12_000,
      actions: [act(ACTION_T_CAST, 15_579, 1, 0)],
    }),
  ],
};

// Eviscerator 9029 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14151-14153 creature_id=9029.
const EVISCERATOR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 902901,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4000,
      p2: 8000,
      p3: 6000,
      p4: 12_000,
      actions: [act(ACTION_T_CAST, 14_331, 1, 32)],
    }),
    script({
      id: 902902,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 12_000,
      p3: 12_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 15_245, 1, 0)],
    }),
    script({
      id: 902903,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 12_000,
      p3: 12_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 7121, 0, 0)],
    }),
  ],
};

// Anub'shiah 9031 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14156-14161 creature_id=9031.
const ANUBSHIAH_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 903101,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_CAST, 13_787, 0, 0)],
    }),
    script({
      id: 903102,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 7000,
      p3: 7000,
      p4: 7000,
      actions: [act(ACTION_T_CAST, 15_472, 4, 0)],
    }),
    script({
      id: 903103,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 16_000,
      p2: 16_000,
      p3: 12_000,
      p4: 12_000,
      actions: [act(ACTION_T_CAST, 15_471, 5, 0)],
    }),
    script({
      id: 903104,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 12_000,
      p2: 12_000,
      p3: 45_000,
      p4: 45_000,
      actions: [act(ACTION_T_CAST, 12_493, 4, 0)],
    }),
    script({
      id: 903105,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 24_000,
      p2: 24_000,
      p3: 18_000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 15_470, 4, 0)],
    }),
    script({
      id: 903106,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 12_000,
      p3: 23_000,
      p4: 26_000,
      actions: [act(ACTION_T_CAST, 8994, 5, 0)],
    }),
  ],
};

// Hedrum the Creeper 9032 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14163-14166 creature_id=9032.
const HEDRUM_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 903201,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 13_767, 0, 34)],
    }),
    script({
      id: 903202,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 15_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 3609, 1, 0)],
    }),
    script({
      id: 903203,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 15_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 15_474, 0, 0)],
    }),
    script({
      id: 903204,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 5000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 15_475, 0, 0)],
    }),
  ],
};

// Fineous Darkvire 9056 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14231-14236 creature_id=9056.
const FINEOUS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 905601,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 10_000,
      p3: 240_000,
      p4: 240_000,
      actions: [act(ACTION_T_CAST, 8258, 0, 0)],
    }),
    script({
      id: 905602,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 18_000,
      p3: 8000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 13_953, 1, 0)],
    }),
    script({
      id: 905603,
      eventType: EVENT_T.TARGET_CASTING,
      flags: 1025,
      p1: 5000,
      p2: 20_000,
      actions: [act(ACTION_T_CAST, 11_978, 1, 0)],
    }),
    script({
      id: 905604,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 60,
      p3: 15_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 15_493, 0, 0)],
    }),
    script({
      id: 905605,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 40,
      actions: [act(ACTION_T_CAST, 15_493, 0, 0)],
    }),
    script({
      id: 905606,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 20,
      p3: 12_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 15_346, 0, 0)],
    }),
  ],
};

// Houndmaster Grebmar 9319 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14240-14243 creature_id=9319.
const GREBMAR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 931901,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
    script({
      id: 931902,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 12_000,
      p3: 15_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 13_730, 17, 0)],
    }),
    script({
      id: 931903,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 21_000,
      p3: 7000,
      p4: 21_000,
      actions: [act(ACTION_T_CAST, 15_615, 1, 2048)],
    }),
    script({
      id: 931904,
      eventType: EVENT_T.FRIENDLY_MISSING_BUFF,
      flags: 1025,
      p1: 21_049,
      p2: 30,
      p3: 3000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 21_049, 12, 0)],
    }),
  ],
};

// Warder Stilgiss 9041 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14220-14226 creature_id=9041.
const STILGISS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 904101,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 904102,
      eventType: EVENT_T.MISSING_AURA,
      flags: 1,
      p1: 12_544,
      p2: 1,
      p3: 15_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 12_544, 0, 0)],
    }),
    script({
      id: 904103,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
    script({
      id: 904104,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 3000,
      p2: 15_000,
      p3: 65_000,
      p4: 70_000,
      actions: [act(ACTION_T_CAST, 15_044, 0, 0)],
    }),
    script({
      id: 904105,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 18_000,
      p3: 14_000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 12_674, 17, 1024)],
    }),
    script({
      id: 904106,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1281,
      p3: 3000,
      p4: 4000,
      actions: [act(ACTION_T_CAST, 12_675, 1, 256)],
    }),
    script({
      id: 904107,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1537,
      p3: 5000,
      p4: 10_000,
      actions: [act(ACTION_T_CAST, 12_675, 1, 256)],
    }),
  ],
};

// Verek 9042 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14228-14229 creature_id=9042.
const VEREK_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 904201,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 10_000,
      p3: 20_000,
      p4: 45_000,
      actions: [act(ACTION_T_CAST, 15_042, 4, 32)],
    }),
    script({
      id: 904202,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 30,
      p3: 120_000,
      p4: 120_000,
      actions: [
        act(ACTION_T_CAST, 8599, 0, 0),
        act(ACTION_T_TEXT, 1191, 0, 0),
      ],
    }),
  ],
};

// Ribbly Screwspigot 9543 (Blackrock Depths). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14289-14291 creature_id=9543.
const RIBBLY_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 954301,
      eventType: EVENT_T.FACING_TARGET,
      flags: 1025,
      p1: 1,
      p3: 5000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 12_540, 4, 0)],
    }),
    script({
      id: 954302,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 14_000,
      p3: 12_000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 9080, 1, 0)],
    }),
    script({
      id: 954303,
      eventType: EVENT_T.HP,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
  ],
};

// Hate'rel 9034 (Blackrock Depths Seven). EventAI kit. Cite: classic-db/ACID/acid_classic.sql:14169-14174
// creature_id=9034.
const HATEREL_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 903401,
      eventType: EVENT_T.REACHED_HOME,
      actions: [act(ACTION_T_SET_INST_DATA, 4, 2, 0)],
    }),
    script({
      id: 903402,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_SET_RANGED_MODE, 2, 35, 0),
        act(ACTION_T_REMOVE_UNIT_FLAG, 256, 0, 0),
        act(ACTION_T_CAST, 15_088, 0, 34),
      ],
    }),
    script({
      id: 903403,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 14_000,
      p2: 17_000,
      p3: 15_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 14_033, 16, 512)],
    }),
    script({
      id: 903404,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9000,
      p2: 14_000,
      p3: 40_000,
      p4: 48_000,
      actions: [act(ACTION_T_CAST, 12_040, 0, 0)],
    }),
    script({
      id: 903405,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p3: 5000,
      p4: 7000,
      actions: [act(ACTION_T_CAST, 15_580, 1, 0)],
    }),
    script({
      id: 903406,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p3: 3400,
      p4: 4800,
      actions: [act(ACTION_T_CAST, 15_232, 1, 256)],
    }),
  ],
};

// Anger'rel 9035 (Blackrock Depths Seven). EventAI kit. Cite: classic-db/ACID/acid_classic.sql:14176-14181
// creature_id=9035.
const ANGERREL_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 903501,
      eventType: EVENT_T.REACHED_HOME,
      actions: [act(ACTION_T_SET_INST_DATA, 4, 2, 0)],
    }),
    script({
      id: 903502,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_REMOVE_UNIT_FLAG, 256, 0, 0)],
    }),
    script({
      id: 903503,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 9000,
      p3: 5000,
      p4: 9000,
      actions: [act(ACTION_T_CAST, 11_971, 1, 0)],
    }),
    script({
      id: 903504,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 7000,
      p3: 7000,
      p4: 11_000,
      actions: [act(ACTION_T_CAST, 15_580, 1, 0)],
    }),
    script({
      id: 903505,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 11_000,
      p2: 15_000,
      p3: 10_000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 12_169, 0, 0)],
    }),
    script({
      id: 903506,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 3000,
      p3: 20_000,
      p4: 26_000,
      actions: [act(ACTION_T_CAST, 15_062, 0, 0)],
    }),
  ],
};

// Vile'rel 9036 (Blackrock Depths Seven). EventAI kit. Cite: classic-db/ACID/acid_classic.sql:14183-14188
// creature_id=9036.
const VILEREL_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 903601,
      eventType: EVENT_T.REACHED_HOME,
      actions: [act(ACTION_T_SET_INST_DATA, 4, 2, 0)],
    }),
    script({
      id: 903602,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_SET_RANGED_MODE, 2, 25, 0),
        act(ACTION_T_REMOVE_UNIT_FLAG, 256, 0, 0),
      ],
    }),
    script({
      id: 903603,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 15_000,
      p2: 20_000,
      p3: 15_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 15_585, 0, 0)],
    }),
    script({
      id: 903604,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 5000,
      p2: 40,
      p3: 16_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 15_586, 12, 0)],
    }),
    script({
      id: 903605,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 2500,
      p2: 40,
      p3: 60_000,
      p4: 120_000,
      actions: [act(ACTION_T_CAST, 11_974, 12, 0)],
    }),
    script({
      id: 903606,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p3: 3400,
      p4: 4800,
      actions: [act(ACTION_T_CAST, 15_587, 1, 256)],
    }),
  ],
};

// Gloom'rel 9037 (Blackrock Depths Seven). EventAI kit. Cite: classic-db/ACID/acid_classic.sql:14190-14195
// creature_id=9037.
const GLOOMREL_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 903701,
      eventType: EVENT_T.REACHED_HOME,
      actions: [act(ACTION_T_SET_INST_DATA, 4, 2, 0)],
    }),
    script({
      id: 903702,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_REMOVE_UNIT_FLAG, 256, 0, 0)],
    }),
    script({
      id: 903703,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 3000,
      p2: 9000,
      p3: 12_000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 9080, 1, 0)],
    }),
    script({
      id: 903704,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 13_800,
      p2: 19_200,
      p3: 8100,
      p4: 17_800,
      actions: [act(ACTION_T_CAST, 15_584, 1, 0)],
    }),
    script({
      id: 903705,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 5000,
      p3: 6000,
      p4: 10_000,
      actions: [act(ACTION_T_CAST, 13_737, 1, 0)],
    }),
    script({
      id: 903706,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1024,
      p1: 10_000,
      p2: 30_000,
      actions: [act(ACTION_T_CAST, 13_847, 15, 0)],
    }),
  ],
};

// Seeth'rel 9038 (Blackrock Depths Seven). EventAI kit. Cite: classic-db/ACID/acid_classic.sql:14197-14203
// creature_id=9038.
const SEETHREL_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 903801,
      eventType: EVENT_T.REACHED_HOME,
      actions: [act(ACTION_T_SET_INST_DATA, 4, 2, 0)],
    }),
    script({
      id: 903802,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_SET_RANGED_MODE, 2, 35, 0),
        act(ACTION_T_REMOVE_UNIT_FLAG, 256, 0, 0),
      ],
    }),
    script({
      id: 903803,
      eventType: EVENT_T.MISSING_AURA,
      flags: 1,
      p1: 12_544,
      p2: 1,
      p3: 15_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 12_544, 0, 0)],
    }),
    script({
      id: 903804,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 3000,
      p2: 5000,
      p3: 64_000,
      p4: 75_000,
      actions: [act(ACTION_T_CAST, 15_044, 0, 0)],
    }),
    script({
      id: 903805,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9000,
      p2: 14_000,
      p3: 19_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 15_244, 1, 0)],
    }),
    script({
      id: 903806,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 10_000,
      p3: 16_000,
      p4: 23_000,
      actions: [act(ACTION_T_CAST, 12_674, 17, 1024)],
    }),
    script({
      id: 903807,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p3: 3400,
      p4: 4800,
      actions: [act(ACTION_T_CAST, 12_675, 1, 256)],
    }),
  ],
};

// Doom'rel 9039 (Blackrock Depths Seven). EventAI kit. Cite: classic-db/ACID/acid_classic.sql:14205-14209
// creature_id=9039.
const DOOMREL_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 903901,
      eventType: EVENT_T.REACHED_HOME,
      actions: [
        act(ACTION_T_SET_INST_DATA, 4, 2, 0),
        act(ACTION_T_DESPAWN_GUARDIANS, 0, 0, 0),
      ],
    }),
    script({
      id: 903902,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_REMOVE_UNIT_FLAG, 256, 0, 0),
        act(ACTION_T_CAST, 15_092, 0, 2),
        act(ACTION_T_CAST, 13_787, 0, 34),
      ],
    }),
    script({
      id: 903903,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 12_000,
      p3: 8000,
      p4: 12_000,
      actions: [act(ACTION_T_CAST, 15_245, 1, 0)],
    }),
    script({
      id: 903904,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 18_000,
      p2: 20_000,
      p3: 25_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 12_742, 4, 0)],
    }),
    script({
      id: 903905,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 8000,
      p3: 40_000,
      p4: 45_000,
      actions: [act(ACTION_T_CAST, 12_493, 4, 0)],
    }),
  ],
};

// Dope'rel 9040 (Blackrock Depths Seven). EventAI kit. Cite: classic-db/ACID/acid_classic.sql:14211-14218
// creature_id=9040.
const DOPEREL_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 904001,
      eventType: EVENT_T.REACHED_HOME,
      actions: [act(ACTION_T_SET_INST_DATA, 4, 2, 0)],
    }),
    script({
      id: 904002,
      eventType: EVENT_T.TIMER_OOC,
      p1: 1000,
      p2: 1000,
      actions: [act(ACTION_T_CAST, 22_766, 0, 32)],
    }),
    script({
      id: 904003,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_REMOVE_UNIT_FLAG, 256, 0, 0)],
    }),
    script({
      id: 904004,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 5000,
      p3: 25_000,
      p4: 35_000,
      actions: [act(ACTION_T_CAST, 15_087, 0, 0)],
    }),
    script({
      id: 904005,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 10_000,
      p3: 12_000,
      p4: 16_000,
      actions: [act(ACTION_T_CAST, 15_583, 1, 0)],
    }),
    script({
      id: 904006,
      eventType: EVENT_T.FACING_TARGET,
      flags: 1025,
      p1: 1,
      p3: 12_000,
      p4: 17_000,
      actions: [act(ACTION_T_CAST, 12_540, 4, 0)],
    }),
    script({
      id: 904007,
      eventType: EVENT_T.FACING_TARGET,
      flags: 1025,
      p3: 5000,
      p4: 9000,
      actions: [act(ACTION_T_CAST, 15_582, 1, 0)],
    }),
    script({
      id: 904008,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 7000,
      p3: 6000,
      p4: 9000,
      actions: [act(ACTION_T_CAST, 15_581, 1, 0)],
    }),
  ],
};

// General Angerforge 9033 Alarm is ScriptDev-only, so an EventAI HP SPAWN overlay here doubled the
// <30% opener. Cite: boss_general_angerforge.cpp:93-108.

// Ambassador Flamelash 9156 aggro destroyers and rune spirits are ScriptDev-only; an EventAI AGGRO
// SPAWN×4 overlay here doubled Fireguard Destroyers to 8. Cite: boss_ambassador_flamelash.cpp:88-91.

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [8923, PANZOR_AI],
  [8983, ARGELMACH_AI],
  [9016, BAELGAR_AI],
  [9017, INCENDIUS_AI],
  [9024, LOREGRAIN_AI],
  [9025, ROCCOR_AI],
  [9027, GOROSH_AI],
  [9028, GRIZZLE_AI],
  [9029, EVISCERATOR_AI],
  [9031, ANUBSHIAH_AI],
  [9032, HEDRUM_AI],
  [9056, FINEOUS_AI],
  [9319, GREBMAR_AI],
  [9041, STILGISS_AI],
  [9042, VEREK_AI],
  [9543, RIBBLY_AI],
  [9034, HATEREL_AI],
  [9035, ANGERREL_AI],
  [9036, VILEREL_AI],
  [9037, GLOOMREL_AI],
  [9038, SEETHREL_AI],
  [9039, DOOMREL_AI],
  [9040, DOPEREL_AI],
];
