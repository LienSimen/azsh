// EventAI overlays for stratholme-undead.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_SPAWN,
  ACTION_T_TEXT_NEW,
  EVENT_T,
  EFLAG_REPEATABLE,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// Baron Rivendare 10440: every 15 s the Raise Dead 17473 cascade raises 6× Mindless Skeleton
// 11197. The CAST→SUMMON chain is not SI-wired, so a SPAWN injects 11197 ×6 on that timer.
const RIVENDARE_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1044005,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: EFLAG_REPEATABLE,
      p1: 15000,
      p2: 15000,
      p3: 15000,
      p4: 15000,
      actions: [
        act(ACTION_T_SPAWN, 11197, 1, 0),
        act(ACTION_T_SPAWN, 11197, 1, 0),
        act(ACTION_T_SPAWN, 11197, 1, 0),
        act(ACTION_T_SPAWN, 11197, 1, 0),
        act(ACTION_T_SPAWN, 11197, 1, 0),
        act(ACTION_T_SPAWN, 11197, 1, 0),
      ],
    }),
  ],
};

// Ramstein the Gorger 10439 (Stratholme Undead). KI-1019 wall. Cite:
// classic-db/ACID/acid_classic.sql:16569-16572 creature_id=10439.
const RAMSTEIN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1043901,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 15088, 0, 34)],
    }),
    script({
      id: 1043902,
      eventType: EVENT_T.TIMER_GENERIC,
      p1: 4000,
      p2: 4000,
      actions: [act(ACTION_T_TEXT_NEW, 6425, 0, 0)],
    }),
    script({
      id: 1043903,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 3000,
      p2: 4000,
      p3: 7000,
      p4: 8000,
      actions: [act(ACTION_T_CAST, 5568, 17, 0)],
    }),
    script({
      id: 1043904,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 12_000,
      p2: 12_000,
      p3: 10_000,
      p4: 10_000,
      actions: [act(ACTION_T_CAST, 17307, 1, 0)],
    }),
  ],
};

// Nerub'enkan 10437 (Stratholme Undead). KI-1020 wall. Cite: classic-db/ACID/acid_classic.sql:16563-16566
// creature_id=10437.
const NERUBENKAN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1043701,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 15_000,
      p2: 15_000,
      p3: 20_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 4962, 5, 0)],
    }),
    script({
      id: 1043702,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 7000,
      p3: 12_000,
      p4: 14_000,
      actions: [act(ACTION_T_CAST, 6016, 1, 0)],
    }),
    script({
      id: 1043703,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 0,
      p2: 0,
      p3: 4000,
      p4: 5000,
      actions: [act(ACTION_T_CAST, 16418, 0, 0)],
    }),
    script({
      id: 1043704,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 10_000,
      p3: 17_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 17235, 0, 0)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [10440, RIVENDARE_AI],
  [10439, RAMSTEIN_AI],
  [10437, NERUBENKAN_AI],
];
