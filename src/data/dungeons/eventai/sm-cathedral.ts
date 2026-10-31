// EventAI overlays for sm-cathedral.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CAST,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// High Inquisitor Fairbanks 4542 (SM Graveyard), an EventAI combat kit. SPELLHIT relay 454208
// is unported. Cite: acid_classic.sql:16009-16014.
const FAIRBANKS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 454201,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2800,
      p2: 11_900,
      p3: 6100,
      p4: 20_500,
      actions: [act(ACTION_T_CAST, 8282, 1, 0)],
    }),
    script({
      id: 454202,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 3200,
      p2: 11_300,
      p3: 5700,
      p4: 19_300,
      actions: [act(ACTION_T_CAST, 15090, 4, 0)],
    }),
    script({
      id: 454203,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 40_000,
      p2: 40_000,
      p3: 40_000,
      p4: 40_000,
      actions: [act(ACTION_T_CAST, 12096, 5, 0)],
    }),
    script({
      id: 454204,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 30_000,
      p2: 30_000,
      p3: 30_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 8399, 0, 0)],
    }),
    script({
      id: 454205,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 30,
      p2: 0,
      actions: [act(ACTION_T_CAST, 12039, 0, 0)],
    }),
    script({
      id: 454206,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 25,
      p2: 0,
      actions: [act(ACTION_T_CAST, 11647, 0, 0)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [4542, FAIRBANKS_AI],
];
