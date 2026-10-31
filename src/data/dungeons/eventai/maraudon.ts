// EventAI overlays for maraudon.

import type { CreatureAiBundle, CreatureAiSummon } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_SUMMON_ID,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

const SUMMONS_THERADRAS: CreatureAiSummon[] = [
  { id: 21, x: 28.067, y: 61.875, z: -123.405, o: 4.67, spawnTimeSecs: 600_000 },
];

const SUMMONS_CELEBRAS: CreatureAiSummon[] = [
  { id: 7, x: 726.106, y: 77.9764, z: -86.5913, o: 6.00393, spawnTimeSecs: 18_000_000 },
];

// Princess Theradras 12201 (Maraudon). KI-977 wall. No ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15435-15439; summons id 21 :19986.
const THERADRAS_AI: CreatureAiBundle = {
  summons: SUMMONS_THERADRAS,
  scripts: [
    script({
      id: 1220101,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_SUMMON_ID, 12238, 0, 21)],
    }),
    script({
      id: 1220102,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 13_000,
      p3: 20_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 21909, 15, 0)],
    }),
    script({
      id: 1220103,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 15_000,
      p3: 8000,
      p4: 10_000,
      actions: [act(ACTION_T_CAST, 21832, 4, 512)],
    }),
    script({
      id: 1220104,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 20_000,
      p3: 20_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 21869, 17, 0)],
    }),
    script({
      id: 1220105,
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

// Celebras the Cursed 12225 (Maraudon). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15477-15481; summons id 7 :19975.
const CELEBRAS_AI: CreatureAiBundle = {
  summons: SUMMONS_CELEBRAS,
  scripts: [
    script({
      id: 1222501,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4000,
      p2: 5000,
      p3: 7000,
      p4: 9000,
      actions: [act(ACTION_T_CAST, 21807, 4, 0)],
    }),
    script({
      id: 1222502,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 10_000,
      p3: 15_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 12747, 1, 0)],
    }),
    script({
      id: 1222503,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 15_000,
      p2: 15_000,
      p3: 20_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 21968, 0, 0)],
    }),
    script({
      id: 1222504,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 50_000,
      p2: 60_000,
      p3: 50_000,
      p4: 60_000,
      actions: [act(ACTION_T_CAST, 21793, 0, 0)],
    }),
    script({
      id: 1222505,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_SUMMON_ID, 13716, 0, 7)],
    }),
  ],
};

// Landslide 12203 (Maraudon). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15441-15443 creature_id=12203.
const LANDSLIDE_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1220301,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 1000,
      p3: 60_000,
      p4: 60_000,
      actions: [act(ACTION_T_CAST, 21808, 0, 0)],
    }),
    script({
      id: 1220302,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2000,
      p2: 3000,
      p3: 8000,
      p4: 9000,
      actions: [act(ACTION_T_CAST, 5568, 17, 0)],
    }),
    script({
      id: 1220303,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 10_000,
      p3: 18_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 18670, 1, 0)],
    }),
  ],
};

// Razorlash 12258 (Maraudon). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15518-15519 creature_id=12258.
const RAZORLASH_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1225801,
      eventType: EVENT_T.SPAWNED,
      actions: [
        act(ACTION_T_CAST, 8876, 0, 34),
        act(ACTION_T_CAST, 15978, 0, 34),
      ],
    }),
    script({
      id: 1225802,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4000,
      p2: 12_000,
      p3: 6000,
      p4: 12_000,
      actions: [act(ACTION_T_CAST, 11427, 1, 0)],
    }),
  ],
};

// Rotgrip 13596 (Maraudon). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15534-15535 creature_id=13596.
const ROTGRIP_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1359601,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 15978, 0, 34)],
    }),
    script({
      id: 1359602,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p3: 11_000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 16495, 1, 0)],
    }),
  ],
};

// Tinkerer Gizlock 13601 (Maraudon). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15539-15543 creature_id=13601.
const GIZLOCK_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1360101,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_SET_RANGED_MODE, 2, 25, 0),
        act(ACTION_T_TEXT, 8852, 0, 0),
      ],
    }),
    script({
      id: 1360102,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 25_000,
      p2: 25_000,
      p3: 25_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 29419, 4, 512)],
    }),
    script({
      id: 1360103,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9000,
      p2: 12_000,
      p3: 14_000,
      p4: 17_000,
      actions: [act(ACTION_T_CAST, 9143, 1, 0)],
    }),
    script({
      id: 1360104,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 9000,
      p3: 16_000,
      p4: 19_000,
      actions: [act(ACTION_T_CAST, 21833, 0, 0)],
    }),
    script({
      id: 1360105,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p1: 5,
      p2: 30,
      p3: 2300,
      p4: 3900,
      actions: [act(ACTION_T_CAST, 16100, 1, 256)],
    }),
  ],
};

// Lord Vyletongue 12236 (Maraudon). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15483-15487 creature_id=12236.
const VYLETONGUE_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1223601,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 25, 0)],
    }),
    script({
      id: 1223602,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 20_000,
      p3: 9000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 21655, 0, 0)],
    }),
    script({
      id: 1223603,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 14_000,
      p3: 14_000,
      p4: 21_000,
      actions: [act(ACTION_T_CAST, 7964, 17, 0)],
    }),
    script({
      id: 1223604,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 0,
      p2: 10_000,
      p3: 7000,
      p4: 21_000,
      actions: [act(ACTION_T_CAST, 21390, 1, 0)],
    }),
    script({
      id: 1223605,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p1: 5,
      p2: 30,
      p3: 2000,
      p4: 4000,
      actions: [act(ACTION_T_CAST, 16100, 1, 256)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [12201, THERADRAS_AI],
  [12225, CELEBRAS_AI],
  [12203, LANDSLIDE_AI],
  [12258, RAZORLASH_AI],
  [13596, ROTGRIP_AI],
  [13601, GIZLOCK_AI],
  [12236, VYLETONGUE_AI],
];
