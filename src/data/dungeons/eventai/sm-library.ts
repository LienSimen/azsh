// EventAI overlays for sm-library.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// Houndmaster Loksey 3974 (Scarlet Monastery Library). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15897-15900 creature_id=3974.
const LOKSEY_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 397401,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 2655, 0, 0)],
    }),
    script({
      id: 397402,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9300,
      p2: 9300,
      p3: 30_100,
      p4: 38_200,
      actions: [act(ACTION_T_CAST, 6192, 0, 0)],
    }),
    script({
      id: 397403,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2000,
      p2: 5000,
      p3: 30_100,
      p4: 38_200,
      actions: [act(ACTION_T_CAST, 6742, 0, 0)],
    }),
    script({
      id: 397404,
      eventType: EVENT_T.FRIENDLY_MISSING_BUFF,
      flags: 1025,
      p1: 6742,
      p2: 15,
      p3: 10_900,
      p4: 18_100,
      actions: [act(ACTION_T_CAST, 6742, 12, 0)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [3974, LOKSEY_AI],
];
