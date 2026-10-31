// EventAI overlays for the-stockade.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_FLEE_FOR_ASSIST,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// Bazil Thredd 1716 (Stockade). KI-993 wall. Cite: classic-db/ACID/acid_classic.sql:17051-17054
// creature_id=1716.
const BAZIL_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 171602,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 32,
      p1: 1000,
      p2: 1000,
      actions: [
        act(ACTION_T_TEXT, 1392, 1388, 1387),
        act(ACTION_T_TEXT, 1391, 1394, 1395),
        act(ACTION_T_TEXT, 1393, 1390, 1395),
      ],
    }),
    script({
      id: 171603,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 10_700,
      p3: 15_100,
      p4: 25_900,
      actions: [act(ACTION_T_CAST, 7964, 0, 0)],
    }),
    script({
      id: 171604,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8500,
      p2: 10_200,
      p3: 26_300,
      p4: 30_500,
      actions: [act(ACTION_T_CAST, 9128, 0, 0)],
    }),
    script({
      id: 171605,
      eventType: EVENT_T.HP,
      p1: 15,
      p2: 0,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
  ],
};

// Dextren Ward 1663 (Stockades). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17017-17020 creature_id=1663.
const DEXTREN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 166301,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 7165, 0, 0)],
    }),
    script({
      id: 166302,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 9600,
      p3: 14_000,
      p4: 22_300,
      actions: [act(ACTION_T_CAST, 19134, 1, 0)],
    }),
    script({
      id: 166303,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4800,
      p2: 7200,
      p3: 9600,
      p4: 21_600,
      actions: [act(ACTION_T_CAST, 11976, 1, 0)],
    }),
    script({
      id: 166304,
      eventType: EVENT_T.HP,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
  ],
};

// Kam Deepfury 1666 (Stockades). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17022-17025 creature_id=1666.
const KAM_DEEPFURY_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 166601,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 3418, 0, 34)],
    }),
    script({
      id: 166602,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
    script({
      id: 166603,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1024,
      p1: 1200,
      p2: 5900,
      actions: [act(ACTION_T_CAST, 7164, 0, 0)],
    }),
    script({
      id: 166604,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 10_000,
      p3: 9300,
      p4: 24_600,
      actions: [act(ACTION_T_CAST, 8242, 1, 0)],
    }),
  ],
};

// Targorr the Dread 1696 (Stockades). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17027-17028 creature_id=1696.
const TARGORR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 169601,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 30,
      actions: [
        act(ACTION_T_CAST, 8599, 0, 0),
        act(ACTION_T_TEXT, 1191, 0, 0),
      ],
    }),
    script({
      id: 169602,
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

// Hamhock 1717 (Stockades). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17056-17057 creature_id=1717.
const HAMHOCK_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 171701,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5800,
      p2: 9700,
      p3: 10_500,
      p4: 10_500,
      actions: [act(ACTION_T_CAST, 6742, 0, 32)],
    }),
    script({
      id: 171702,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5800,
      p2: 8100,
      p3: 12_900,
      p4: 19_400,
      actions: [act(ACTION_T_CAST, 421, 1, 0)],
    }),
  ],
};

// Bruegal Ironknuckle 1720 (Stockades). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17059-17060 creature_id=1720.
const BRUEGAL_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 172001,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      p1: 1000,
      p2: 1000,
      actions: [
        act(ACTION_T_TEXT, 1391, 1395, 1393),
        act(ACTION_T_TEXT, 1391, 1395, 1390),
      ],
    }),
    script({
      id: 172002,
      eventType: EVENT_T.HP,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [1716, BAZIL_AI],
  [1663, DEXTREN_AI],
  [1666, KAM_DEEPFURY_AI],
  [1696, TARGORR_AI],
  [1717, HAMHOCK_AI],
  [1720, BRUEGAL_AI],
];
