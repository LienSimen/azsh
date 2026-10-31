// EventAI overlays for wailing-caverns.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_FLEE_FOR_ASSIST,
  ACTION_T_SET_INST_DATA,
  ACTION_T_SET_PHASE,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// Mutanus the Devourer 3654 (Wailing Caverns). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17253-17258 creature_id=3654.
const MUTANUS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 365401,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_INST_DATA, 5, 1, 0)],
    }),
    script({
      id: 365404,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 10_000,
      p3: 10_000,
      p4: 16_000,
      actions: [act(ACTION_T_CAST, 8150, 0, 0)],
    }),
    script({
      id: 365402,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 11_000,
      p3: 25_000,
      p4: 36_000,
      actions: [act(ACTION_T_CAST, 7967, 5, 512)],
    }),
    script({
      id: 365403,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 15_000,
      p2: 21_000,
      p3: 18_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 7399, 4, 0)],
    }),
    script({
      id: 365405,
      eventType: EVENT_T.EVADE,
      actions: [act(ACTION_T_SET_INST_DATA, 5, 2, 0)],
    }),
    script({
      id: 365406,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_SET_INST_DATA, 5, 3, 0)],
    }),
  ],
};

// Lord Cobrahn 3669 (Wailing Caverns). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17263-17270 creature_id=3669.
const COBRAHN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 366901,
      eventType: EVENT_T.TIMER_OOC,
      p1: 1000,
      p2: 1000,
      actions: [act(ACTION_T_CAST, 3616, 0, 32)],
    }),
    script({
      id: 366902,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_SET_RANGED_MODE, 2, 35, 0),
        act(ACTION_T_SET_INST_DATA, 1, 1, 0),
        act(ACTION_T_TEXT, 6094, 0, 0),
      ],
    }),
    script({
      id: 366903,
      eventType: EVENT_T.EVADE,
      actions: [
        act(ACTION_T_SET_INST_DATA, 1, 2, 0),
        act(ACTION_T_SET_PHASE, 0, 0, 0),
      ],
    }),
    script({
      id: 366904,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_SET_INST_DATA, 1, 3, 0)],
    }),
    script({
      id: 366905,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 30,
      actions: [
        act(ACTION_T_CAST, 7965, 0, 0),
        act(ACTION_T_SET_PHASE, 1, 0, 0),
      ],
    }),
    script({
      id: 366906,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 800,
      p2: 40,
      p3: 18_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 5188, 12, 0)],
    }),
    script({
      id: 366907,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      inversePhaseMask: 1,
      flags: 1025,
      p1: 10_000,
      p2: 10_000,
      p3: 13_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 8040, 4, 544)],
    }),
    script({
      id: 366908,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p2: 40,
      p3: 2400,
      p4: 3800,
      actions: [act(ACTION_T_CAST, 9532, 1, 256)],
    }),
  ],
};

// Lord Pythas 3670 (Wailing Caverns). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17272-17278 creature_id=3670.
const PYTHAS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 367001,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_SET_RANGED_MODE, 2, 35, 0),
        act(ACTION_T_SET_INST_DATA, 2, 1, 0),
        act(ACTION_T_TEXT, 6095, 0, 0),
      ],
    }),
    script({
      id: 367002,
      eventType: EVENT_T.EVADE,
      actions: [
        act(ACTION_T_SET_INST_DATA, 2, 2, 0),
        act(ACTION_T_SET_PHASE, 0, 0, 0),
      ],
    }),
    script({
      id: 367003,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_SET_INST_DATA, 2, 3, 0)],
    }),
    script({
      id: 367004,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 800,
      p2: 40,
      p3: 20_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 5187, 12, 0)],
    }),
    script({
      id: 367005,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 12_000,
      p3: 12_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 700, 5, 544)],
    }),
    script({
      id: 367006,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 9000,
      p3: 12_000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 8147, 17, 0)],
    }),
    script({
      id: 367007,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p2: 40,
      p3: 2400,
      p4: 3800,
      actions: [act(ACTION_T_CAST, 9532, 1, 256)],
    }),
  ],
};

// Lady Anacondra 3671 (Wailing Caverns), an EventAI kit with no ScriptDev cpp. 367101 is
// TIMER_IN_COMBAT 0/0 flags 0, firing once at combat start. Cite: acid_classic.sql:17280-17287.
const ANACONDRA_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 367101,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      actions: [
        act(ACTION_T_SET_RANGED_MODE, 2, 35, 0),
        act(ACTION_T_SET_INST_DATA, 0, 1, 0),
        act(ACTION_T_TEXT, 6097, 0, 0),
      ],
    }),
    script({
      id: 367102,
      eventType: EVENT_T.EVADE,
      actions: [
        act(ACTION_T_SET_INST_DATA, 0, 2, 0),
        act(ACTION_T_SET_PHASE, 0, 0, 0),
      ],
    }),
    script({
      id: 367103,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_SET_INST_DATA, 0, 3, 0)],
    }),
    script({
      id: 367104,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
    script({
      id: 367105,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 800,
      p2: 40,
      p3: 17_000,
      p4: 21_000,
      actions: [act(ACTION_T_CAST, 5187, 12, 0)],
    }),
    script({
      id: 367106,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 12_000,
      p3: 12_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 700, 5, 32)],
    }),
    script({
      id: 367107,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 1000,
      p3: 75_000,
      p4: 90_000,
      actions: [act(ACTION_T_CAST, 8148, 0, 0)],
    }),
    script({
      id: 367108,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p2: 40,
      p3: 2400,
      p4: 3800,
      actions: [act(ACTION_T_CAST, 9532, 1, 256)],
    }),
  ],
};

// Lord Serpentis 3673 (Wailing Caverns). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17295-17300 creature_id=3673.
const SERPENTIS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 367301,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_SET_RANGED_MODE, 2, 35, 0),
        act(ACTION_T_SET_INST_DATA, 3, 1, 0),
        act(ACTION_T_TEXT, 6096, 0, 0),
      ],
    }),
    script({
      id: 367302,
      eventType: EVENT_T.EVADE,
      actions: [
        act(ACTION_T_SET_INST_DATA, 3, 2, 0),
        act(ACTION_T_SET_PHASE, 0, 0, 0),
      ],
    }),
    script({
      id: 367303,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_SET_INST_DATA, 3, 3, 0)],
    }),
    script({
      id: 367304,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 800,
      p2: 40,
      p3: 17_000,
      p4: 21_000,
      actions: [act(ACTION_T_CAST, 6778, 12, 0)],
    }),
    script({
      id: 367305,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 3000,
      p2: 6000,
      p3: 10_000,
      p4: 19_000,
      actions: [act(ACTION_T_CAST, 700, 5, 544)],
    }),
    script({
      id: 367306,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p2: 40,
      p3: 2400,
      p4: 3800,
      actions: [act(ACTION_T_CAST, 9532, 1, 256)],
    }),
  ],
};

// Skum 3674 (Wailing Caverns). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17302-17303 creature_id=3674.
const SKUM_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 367401,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p3: 2000,
      p4: 5000,
      actions: [act(ACTION_T_CAST, 6254, 1, 0)],
    }),
    script({
      id: 367402,
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

// Verdan the Everliving 5775 (Wailing Caverns). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17333 creature_id=5775.
const VERDAN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 577501,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 30_000,
      p3: 15_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 8142, 17, 0)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [3654, MUTANUS_AI],
  [3669, COBRAHN_AI],
  [3670, PYTHAS_AI],
  [3671, ANACONDRA_AI],
  [3673, SERPENTIS_AI],
  [3674, SKUM_AI],
  [5775, VERDAN_AI],
];
