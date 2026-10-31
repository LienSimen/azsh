// EventAI overlays for ubrs.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// The Beast 10430 (UBRS) — ACID EventAI is the kit, with no ScriptDev cpp. flags 1025 =
// REPEATABLE|COMBAT_ACTION. Cite: acid_classic.sql:14692-14698.
const THE_BEAST_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1043001,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 20_000,
      p3: 5000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 15570, 1, 0)],
    }),
    script({
      id: 1043002,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 21_000,
      p3: 10_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 14100, 17, 0)],
    }),
    script({
      id: 1043003,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 24_000,
      p3: 6000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 16785, 17, 0)],
    }),
    script({
      id: 1043004,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 20_000,
      p3: 5000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 16636, 8, 0)],
    }),
    script({
      id: 1043005,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p1: 5,
      p2: 40,
      p3: 8000,
      p4: 10_000,
      actions: [act(ACTION_T_CAST, 16788, 1, 0)],
    }),
    script({
      id: 1043006,
      eventType: EVENT_T.TARGET_NOT_REACHABLE,
      flags: 1025,
      actions: [act(ACTION_T_CAST, 20477, 1, 0)],
    }),
    script({
      id: 1043007,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 15_000,
      p3: 6000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 16144, 1, 0)],
    }),
  ],
};

// General Drakkisath 10363 (UBRS). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14662-14667 creature_id=10363.
const DRAKKISATH_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1036301,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 0,
      p2: 5000,
      p3: 30_000,
      p4: 60_000,
      actions: [act(ACTION_T_CAST, 16789, 15, 0)],
    }),
    script({
      id: 1036302,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 40_000,
      p3: 8000,
      p4: 40_000,
      actions: [act(ACTION_T_CAST, 12097, 1, 32)],
    }),
    script({
      id: 1036303,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 30_000,
      p3: 16_000,
      p4: 48_000,
      actions: [act(ACTION_T_CAST, 16805, 1, 0)],
    }),
    script({
      id: 1036304,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 24_000,
      p3: 15_000,
      p4: 35_000,
      actions: [act(ACTION_T_CAST, 15588, 17, 0)],
    }),
    script({
      id: 1036305,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 30_000,
      p3: 10_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 16419, 4, 512)],
    }),
    script({
      id: 1036306,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 14_000,
      p3: 8000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 15754, 1, 0)],
    }),
  ],
};

// Goraluk Anvilcrack 10899 (UBRS). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14756-14758 creature_id=10899.
const GORALUK_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_89901,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 8000,
      p3: 10_000,
      p4: 10_000,
      actions: [act(ACTION_T_CAST, 6253, 1, 0)],
    }),
    script({
      id: 10_89902,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 10_000,
      p3: 20_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 16_172, 1, 0)],
    }),
    script({
      id: 10_89903,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1205,
      p1: 5000,
      p2: 8000,
      p3: 6000,
      p4: 10_000,
      actions: [act(ACTION_T_CAST, 15_580, 1, 0)],
    }),
  ],
};

// Solakar Flamewreath 10264 (UBRS). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14632-14634 creature_id=10264.
const SOLAKAR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_26401,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_TEXT, 5547, 0, 0)],
    }),
    script({
      id: 10_26402,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 15_000,
      p3: 10_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 16_727, 17, 0)],
    }),
    script({
      id: 10_26403,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 1000,
      p3: 8000,
      p4: 8000,
      actions: [act(ACTION_T_CAST, 16_556, 15, 0)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [10430, THE_BEAST_AI],
  [10363, DRAKKISATH_AI],
  [10899, GORALUK_AI],
  [10264, SOLAKAR_AI],
];
