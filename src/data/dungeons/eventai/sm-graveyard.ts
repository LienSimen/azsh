// EventAI overlays for sm-graveyard.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// Interrogator Vishas 3983 (Scarlet Monastery Graveyard). EventAI kit. Cite:
// classic-db/ACID/acid_classic.sql:15908-15912 creature_id=3983.
const VISHAS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 398301,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 8981, 0, 34)],
    }),
    script({
      id: 398302,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 6204, 0, 0)],
    }),
    script({
      id: 398303,
      eventType: EVENT_T.HP,
      p1: 60,
      actions: [act(ACTION_T_TEXT, 6206, 0, 0)],
    }),
    script({
      id: 398304,
      eventType: EVENT_T.HP,
      p1: 30,
      actions: [act(ACTION_T_TEXT, 6207, 0, 0)],
    }),
    script({
      id: 398305,
      eventType: EVENT_T.KILL,
      flags: 1,
      p3: 1,
      actions: [act(ACTION_T_TEXT, 6205, 0, 0)],
    }),
  ],
};

// Fallen Champion 6488 (Scarlet Monastery Graveyard). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16030-16032 creature_id=6488.
const FALLEN_CHAMPION_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 648801,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 3000,
      p3: 240_000,
      p4: 245_000,
      actions: [act(ACTION_T_CAST, 7366, 0, 0)],
    }),
    script({
      id: 648802,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 10_000,
      p3: 7000,
      p4: 11_000,
      actions: [act(ACTION_T_CAST, 15_496, 1, 0)],
    }),
    script({
      id: 648803,
      eventType: EVENT_T.TARGET_HP,
      flags: 1025,
      p1: 20,
      p3: 30_000,
      p4: 35_000,
      actions: [act(ACTION_T_CAST, 7160, 1, 0)],
    }),
  ],
};

// Ironspine 6489 (Scarlet Monastery Graveyard). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16034-16035 creature_id=6489.
const IRONSPINE_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 648901,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5300,
      p2: 8400,
      p3: 16_000,
      p4: 35_800,
      actions: [act(ACTION_T_CAST, 21_007, 17, 0)],
    }),
    script({
      id: 648902,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6300,
      p2: 9400,
      p3: 20_500,
      p4: 36_200,
      actions: [act(ACTION_T_CAST, 3815, 17, 0)],
    }),
  ],
};

// Azshir the Sleepless 6490 (Scarlet Monastery Graveyard). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16037-16039 creature_id=6490.
const AZSHIR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 649001,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 30_000,
      p2: 30_000,
      p3: 30_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 5137, 1, 0)],
    }),
    script({
      id: 649002,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 20_000,
      p2: 20_000,
      p3: 20_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 7399, 1, 0)],
    }),
    script({
      id: 649003,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 50,
      p3: 20_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 9373, 4, 0)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [3983, VISHAS_AI],
  [6488, FALLEN_CHAMPION_AI],
  [6489, IRONSPINE_AI],
  [6490, AZSHIR_AI],
];
