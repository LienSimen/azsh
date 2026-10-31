// EventAI overlays for gnomeregan.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_TEXT,
  ACTION_T_TEXT_NEW,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// Crowd Pummeler 9-60 6229 (Gnomeregan). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15308-15310 creature_id=6229.
const CROWD_PUMMELER_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 622901,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 15_000,
      p3: 17_200,
      p4: 33_400,
      actions: [act(ACTION_T_CAST, 10887, 17, 0)],
    }),
    script({
      id: 622902,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9600,
      p2: 22_900,
      p3: 16_900,
      p4: 33_700,
      actions: [act(ACTION_T_CAST, 5568, 17, 0)],
    }),
    script({
      id: 622903,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 11_000,
      p2: 13_400,
      p3: 8300,
      p4: 18_100,
      actions: [act(ACTION_T_CAST, 8374, 1, 0)],
    }),
  ],
};

// Techbot 6231 (Gnomeregan). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15315-15319 creature_id=6231.
const TECHBOT_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 623101,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 20_000,
      p2: 30_000,
      p3: 30_000,
      p4: 60_000,
      actions: [act(ACTION_T_CAST, 10860, 15, 0)],
    }),
    script({
      id: 623102,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 18_000,
      p3: 15_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 10858, 15, 0)],
    }),
    script({
      id: 623103,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 16_000,
      p3: 20_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 10855, 1, 0)],
    }),
    script({
      id: 623104,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 10_000,
      p3: 25_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 10852, 17, 0)],
    }),
    script({
      id: 623105,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 1000,
      p3: 11_000,
      p4: 11_000,
      actions: [act(ACTION_T_TEXT_NEW, 0, 1, 906)],
    }),
  ],
};

// Electrocutioner 6000 6235 (Gnomeregan). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15327-15330 creature_id=6235.
const ELECTROCUTIONER_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 623501,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 6177, 0, 0)],
    }),
    script({
      id: 623502,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 20_000,
      p3: 14_500,
      p4: 27_400,
      actions: [act(ACTION_T_CAST, 11082, 1, 0)],
    }),
    script({
      id: 623503,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 12_000,
      p2: 26_500,
      p3: 10_900,
      p4: 27_300,
      actions: [act(ACTION_T_CAST, 11084, 4, 512)],
    }),
    script({
      id: 623504,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 17_200,
      p2: 33_700,
      p3: 17_800,
      p4: 38_300,
      actions: [act(ACTION_T_CAST, 11085, 4, 512)],
    }),
  ],
};

// Dark Iron Ambassador 6228 (Gnomeregan). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15301-15306 creature_id=6228.
const DARK_IRON_AMBASSADOR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 622801,
      eventType: EVENT_T.SPELLHIT,
      p1: 9798,
      p2: -1,
      actions: [act(ACTION_T_TEXT, 3367, 0, 0)],
    }),
    script({
      id: 622802,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 622803,
      eventType: EVENT_T.MISSING_AURA,
      flags: 1,
      p1: 12_544,
      p2: 1,
      p3: 15_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 12_544, 0, 0)],
    }),
    script({
      id: 622804,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 11_000,
      p3: 60_000,
      p4: 65_000,
      actions: [act(ACTION_T_CAST, 184, 0, 0)],
    }),
    script({
      id: 622805,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1024,
      p1: 2000,
      p2: 3000,
      actions: [
        act(ACTION_T_CAST, 10_870, 0, 2),
        act(ACTION_T_CAST, 10_870, 0, 2),
      ],
    }),
    script({
      id: 622806,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p2: 40,
      p3: 2400,
      p4: 3800,
      actions: [act(ACTION_T_CAST, 9053, 1, 256)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [6229, CROWD_PUMMELER_AI],
  [6231, TECHBOT_AI],
  [6235, ELECTROCUTIONER_AI],
  [6228, DARK_IRON_AMBASSADOR_AI],
];
