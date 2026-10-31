// EventAI overlays for razorfen-downs.

import type { CreatureAiBundle, CreatureDef } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_SPAWN,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script, templateStub } from './helpers.ts';

export const summonOnly: ReadonlyArray<readonly [number, CreatureDef]> = [
  // 8585 Frost Spectre — lvl 41; HP 1823; melee 59–78; Armor=2101; Rank=1; Type=6 Undead;
  // Faction=16; atk 2000; gold 54–311.
  [
    8585,
    templateStub({
      entry: 8585,
      name: 'Frost Spectre',
      level: 41,
      hpMin: 1823,
      hpMax: 1823,
      dmgMin: 59,
      dmgMax: 78,
      armor: 2101,
      attackTimeMs: 2000,
      creatureType: 6,
      factionId: 16,
      lootId: 0,
      minGold: 311,
      maxGold: 54,
    }),
  ]
];

// Amnennar the Coldbringer 7358: DB 735807/735808 cast 12642, whose effect chain summons 3× Frost
// Spectre 8585. The CAST→SUMMON chain is not SI-wired, so the SPAWN injects the same entry ×3.
const AMNENNAR_AI: CreatureAiBundle = {
  scripts: [
    // 735808 fires first as HP drops (66% band above 33%).
    // DB event_flags=1 repeat 0/0; flags 0 → one-shot (survey: one cast at each threshold).
    script({
      id: 735808,
      eventType: EVENT_T.HP,
      flags: 0,
      p1: 66,
      p2: 0,
      actions: [
        act(ACTION_T_SPAWN, 8585, 1, 0),
        act(ACTION_T_SPAWN, 8585, 1, 0),
        act(ACTION_T_SPAWN, 8585, 1, 0),
      ],
    }),
    script({
      id: 735807,
      eventType: EVENT_T.HP,
      flags: 0,
      p1: 33,
      p2: 0,
      actions: [
        act(ACTION_T_SPAWN, 8585, 1, 0),
        act(ACTION_T_SPAWN, 8585, 1, 0),
        act(ACTION_T_SPAWN, 8585, 1, 0),
      ],
    }),
  ],
};

// Tuten'kash 7355 (Razorfen Downs). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15671-15673 creature_id=7355.
const TUTENKASH_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 735501,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 12254, 0, 34)],
    }),
    script({
      id: 735502,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 3000,
      p2: 5000,
      p3: 6000,
      p4: 8000,
      actions: [act(ACTION_T_CAST, 12252, 4, 32)],
    }),
    script({
      id: 735503,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9000,
      p2: 14_000,
      p3: 15_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 12255, 0, 0)],
    }),
  ],
};

// Plaguemaw the Rotting 7356 (Razorfen Downs). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15675-15676 creature_id=7356.
const PLAGUEMAW_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 735601,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 12947, 0, 34)],
    }),
    script({
      id: 735602,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 12_000,
      p3: 15_000,
      p4: 23_000,
      actions: [act(ACTION_T_CAST, 12946, 0, 0)],
    }),
  ],
};

// Mordresh Fire Eye 7357 (Razorfen Downs). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15677-15678 creature_id=7357.
const MORDRESH_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 735701,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_SET_RANGED_MODE, 2, 35, 0),
        act(ACTION_T_TEXT, 6184, 0, 0),
      ],
    }),
    script({
      id: 735702,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 30_000,
      p2: 40_000,
      p3: 30_000,
      p4: 40_000,
      actions: [act(ACTION_T_TEXT, 4435, 4436, 4437)],
    }),
  ],
};

// Ragglesnout 7354 (Razorfen Downs). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15665-15669 creature_id=7354.
const RAGGLESNOUT_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 735401,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 735402,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9000,
      p2: 13_000,
      p3: 15_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 7645, 5, 512)],
    }),
    script({
      id: 735403,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 3000,
      p2: 40,
      p3: 12_000,
      p4: 16_000,
      actions: [act(ACTION_T_CAST, 12039, 12, 0)],
    }),
    script({
      id: 735404,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 3000,
      p2: 5000,
      p3: 20_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 11639, 4, 544)],
    }),
    script({
      id: 735405,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p1: 0,
      p2: 40,
      p3: 2400,
      p4: 3800,
      actions: [act(ACTION_T_CAST, 12471, 1, 256)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [7358, AMNENNAR_AI],
  [7355, TUTENKASH_AI],
  [7356, PLAGUEMAW_AI],
  [7357, MORDRESH_AI],
  [7354, RAGGLESNOUT_AI],
];
