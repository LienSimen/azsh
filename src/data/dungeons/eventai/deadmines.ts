// EventAI overlays for deadmines.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_FLEE_FOR_ASSIST,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// Edwin VanCleef 639 (Deadmines). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16941-16947 creature_id=639.
const VANCLEEF_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 63901,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 6061, 0, 0)],
    }),
    script({
      id: 63902,
      eventType: EVENT_T.KILL,
      flags: 1025,
      p1: 5000,
      p2: 5000,
      p3: 1,
      actions: [act(ACTION_T_TEXT, 6062, 0, 0)],
    }),
    script({
      id: 63903,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 10,
      actions: [act(ACTION_T_TEXT, 6065, 0, 0)],
    }),
    script({
      id: 63904,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 35,
      p2: 11,
      actions: [act(ACTION_T_TEXT, 6064, 0, 0)],
    }),
    script({
      id: 63905,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 50,
      actions: [
        act(ACTION_T_CAST, 5200, 15, 2),
        act(ACTION_T_TEXT, 1048, 0, 0),
      ],
    }),
    script({
      id: 63906,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 75,
      p2: 51,
      actions: [act(ACTION_T_TEXT, 6063, 0, 0)],
    }),
    script({
      id: 63907,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 20_000,
      p3: 5000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 3391, 15, 0)],
    }),
  ],
};

// Sneed's Shredder 642 (Deadmines). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16954-16955 creature_id=642.
const SNEED_SHREDDER_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 64201,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 18_000,
      p3: 45_000,
      p4: 54_000,
      actions: [act(ACTION_T_CAST, 3603, 1, 0)],
    }),
    script({
      id: 64202,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9000,
      p2: 18_000,
      p3: 15_000,
      p4: 21_000,
      actions: [act(ACTION_T_CAST, 7399, 5, 512)],
    }),
  ],
};

// Sneed 643 (Deadmines). EventAI kit, no ScriptDev cpp. Cite: classic-db/ACID/acid_classic.sql:16957
// creature_id=643.
const SNEED_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 64301,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 18_000,
      p3: 62_000,
      p4: 86_200,
      actions: [act(ACTION_T_CAST, 6713, 1, 0)],
    }),
  ],
};

// Rhahk'Zor 644 (Deadmines). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16959-16960 creature_id=644.
const RHAHKZOR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 64401,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 5619, 0, 0)],
    }),
    script({
      id: 64402,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 15_000,
      p3: 15_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 6304, 1, 0)],
    }),
  ],
};

// Cookie 645 (Deadmines). EventAI kit, no ScriptDev cpp. Cite: classic-db/ACID/acid_classic.sql:16962-16964
// creature_id=645.
const COOKIE_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 64501,
      eventType: EVENT_T.HP,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
    script({
      id: 64502,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 50,
      p3: 22_200,
      p4: 33_900,
      actions: [act(ACTION_T_CAST, 5174, 0, 0)],
    }),
    script({
      id: 64503,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2400,
      p2: 3700,
      p3: 57_000,
      p4: 66_200,
      actions: [act(ACTION_T_CAST, 6306, 0, 0)],
    }),
  ],
};

// Captain Greenskin 647 (Deadmines). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16967-16968 creature_id=647.
const GREENSKIN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 64701,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6200,
      p2: 13_400,
      p3: 37_400,
      p4: 97_500,
      actions: [act(ACTION_T_CAST, 5208, 4, 32)],
    }),
    script({
      id: 64702,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 18_000,
      p3: 17_700,
      p4: 42_600,
      actions: [act(ACTION_T_CAST, 5532, 1, 0)],
    }),
  ],
};

// Gilnid 1763 (Deadmines). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16990-16991 creature_id=1763.
const GILNID_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 176301,
      eventType: EVENT_T.TIMER_OOC,
      flags: 1,
      p1: 120_000,
      p2: 120_000,
      p3: 120_000,
      p4: 120_000,
      actions: [act(ACTION_T_TEXT, 1145, 1146, 1147)],
    }),
    script({
      id: 176302,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 15_000,
      p3: 25_000,
      p4: 50_000,
      actions: [act(ACTION_T_CAST, 5213, 1, 0)],
    }),
  ],
};

// Miner Johnson 3586 (Deadmines). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16993-16994 creature_id=3586.
const MINER_JOHNSON_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 358601,
      eventType: EVENT_T.HP,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
    script({
      id: 358602,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2000,
      p2: 12_000,
      p3: 45_000,
      p4: 60_000,
      actions: [act(ACTION_T_CAST, 12097, 1, 32)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [639, VANCLEEF_AI],
  [642, SNEED_SHREDDER_AI],
  [643, SNEED_AI],
  [644, RHAHKZOR_AI],
  [645, COOKIE_AI],
  [647, GREENSKIN_AI],
  [1763, GILNID_AI],
  [3586, MINER_JOHNSON_AI],
];
