// EventAI overlays for ragefire-chasm.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CAST,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// Oggleflint 11517 (Ragefire Chasm). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15583 creature_id=11517.
const OGGLEFLINT_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1151701,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8400,
      p2: 15_900,
      p3: 5700,
      p4: 12_100,
      actions: [act(ACTION_T_CAST, 15584, 1, 0)],
    }),
  ],
};

// Jergosh the Invoker 11518 (Ragefire Chasm). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15585-15586 creature_id=11518.
const JERGOSH_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1151801,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 14_400,
      p3: 6700,
      p4: 23_100,
      actions: [act(ACTION_T_CAST, 20800, 1, 32)],
    }),
    script({
      id: 1151802,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5200,
      p2: 10_000,
      p3: 7600,
      p4: 16_600,
      actions: [act(ACTION_T_CAST, 18267, 1, 32)],
    }),
  ],
};

// Bazzalan 11519 (Ragefire Chasm). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15588-15589 creature_id=11519.
const BAZZALAN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1151901,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 3616, 0, 34)],
    }),
    script({
      id: 1151902,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4000,
      p2: 6000,
      p3: 4900,
      p4: 15_700,
      actions: [act(ACTION_T_CAST, 14873, 1, 0)],
    }),
  ],
};

// Taragaman the Hungerer 11520 (Ragefire Chasm). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15591-15592 creature_id=11520.
const TARAGAMAN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1152001,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7200,
      p2: 12_100,
      p3: 6700,
      p4: 16_900,
      actions: [act(ACTION_T_CAST, 18072, 1, 0)],
    }),
    script({
      id: 1152002,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9200,
      p2: 14_700,
      p3: 10_400,
      p4: 18_100,
      actions: [act(ACTION_T_CAST, 11970, 17, 0)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [11517, OGGLEFLINT_AI],
  [11518, JERGOSH_AI],
  [11519, BAZZALAN_AI],
  [11520, TARAGAMAN_AI],
];
