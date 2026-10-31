// EventAI overlays for razorfen-kraul.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CALL_FOR_HELP,
  ACTION_T_CAST,
  ACTION_T_DESPAWN_GUARDIANS,
  ACTION_T_FLEE_FOR_ASSIST,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// Agathelos the Raging 4422 (RFK). KI-996 wall. Cite: classic-db/ACID/acid_classic.sql:15735-15738
// creature_id=4422.
const AGATHELOS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 442201,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p1: 5,
      p2: 60,
      p3: 10_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 8260, 0, 0)],
    }),
    script({
      id: 442202,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1024,
      p1: 40_000,
      p2: 80_000,
      actions: [act(ACTION_T_CAST, 8269, 15, 0)],
    }),
    script({
      id: 442203,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 21_000,
      p3: 24_000,
      p4: 32_000,
      actions: [act(ACTION_T_CAST, 8285, 17, 0)],
    }),
    script({
      id: 442204,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 60_000,
      p2: 90_000,
      p3: 30_000,
      p4: 60_000,
      actions: [act(ACTION_T_CAST, 8555, 1, 0)],
    }),
  ],
};

// Death Speaker Jargba 4428 (Razorfen Kraul), an EventAI kit with no ScriptDev cpp.
// Cite: acid_classic.sql:15748-15751 creature_id=4428; flags 1281 ranged, 1537 melee.
const JARGBA_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 442801,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 442802,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 12_000,
      p3: 10_000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 14515, 5, 512)],
    }),
    script({
      id: 442803,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1281,
      p3: 3000,
      p4: 4000,
      actions: [act(ACTION_T_CAST, 9613, 1, 256)],
    }),
    script({
      id: 442804,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1537,
      p3: 3000,
      p4: 8000,
      actions: [act(ACTION_T_CAST, 9613, 1, 256)],
    }),
  ],
};

// Overlord Ramtusk 4420 (Razorfen Kraul). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15718-15721 creature_id=4420.
const RAMTUSK_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 442001,
      eventType: EVENT_T.TIMER_OOC,
      p1: 1000,
      p2: 1000,
      actions: [act(ACTION_T_CAST, 7165, 0, 32)],
    }),
    script({
      id: 442002,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_TEXT, 6178, 0, 0),
        act(ACTION_T_CALL_FOR_HELP, 15, 0, 0),
      ],
    }),
    script({
      id: 442003,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 20_000,
      p3: 30_000,
      p4: 45_000,
      actions: [act(ACTION_T_CAST, 9128, 0, 0)],
    }),
    script({
      id: 442004,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 20_000,
      p3: 8000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 15_548, 17, 0)],
    }),
  ],
};

// Charlga Razorflank 4421 (Razorfen Kraul). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15723-15733 creature_id=4421.
const CHARLGA_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 442101,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 442102,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 6179, 0, 0)],
    }),
    script({
      id: 442103,
      eventType: EVENT_T.KILL,
      flags: 1,
      p1: 5000,
      p2: 5000,
      p3: 1,
      actions: [act(ACTION_T_TEXT, 6180, 0, 0)],
    }),
    script({
      id: 442104,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 60,
      actions: [act(ACTION_T_TEXT, 6181, 0, 0)],
    }),
    script({
      id: 442105,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 40,
      actions: [act(ACTION_T_TEXT, 6182, 0, 0)],
    }),
    script({
      id: 442106,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 20,
      actions: [act(ACTION_T_TEXT, 6183, 0, 0)],
    }),
    script({
      id: 442107,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 25,
      p3: 60_000,
      p4: 60_000,
      actions: [act(ACTION_T_CAST, 8358, 0, 0)],
    }),
    script({
      id: 442108,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2000,
      p2: 14_000,
      p3: 15_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 8361, 0, 0)],
    }),
    script({
      id: 442109,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 3450,
      p2: 40,
      p3: 10_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 6077, 12, 0)],
    }),
    script({
      id: 442110,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1281,
      p3: 2500,
      p4: 3500,
      actions: [act(ACTION_T_CAST, 8292, 1, 256)],
    }),
    script({
      id: 442111,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1537,
      p3: 2500,
      p4: 7000,
      actions: [act(ACTION_T_CAST, 8292, 1, 256)],
    }),
  ],
};

// Aggem Thorncurse 4424 (Razorfen Kraul). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15740-15742 creature_id=4424.
const AGGEM_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 442401,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 40_000,
      p4: 60_000,
      actions: [act(ACTION_T_CAST, 6192, 0, 0)],
    }),
    script({
      id: 442402,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4000,
      p2: 12_000,
      p3: 20_000,
      p4: 45_000,
      actions: [act(ACTION_T_CAST, 8286, 0, 0)],
    }),
    script({
      id: 442403,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 75,
      p3: 13_000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 14_900, 0, 0)],
    }),
  ],
};

// Roogug 6168 (Razorfen Kraul). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:15882-15887 creature_id=6168.
const ROOGUG_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 616801,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 616802,
      eventType: EVENT_T.TIMER_OOC,
      p1: 1000,
      p2: 1000,
      actions: [act(ACTION_T_DESPAWN_GUARDIANS, 0, 0, 0)],
    }),
    script({
      id: 616803,
      eventType: EVENT_T.TIMER_OOC,
      p1: 2000,
      p2: 2000,
      actions: [act(ACTION_T_CAST, 8270, 0, 0)],
    }),
    script({
      id: 616804,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 15,
      actions: [
        act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0),
        act(ACTION_T_TEXT, 1150, 0, 0),
      ],
    }),
    script({
      id: 616805,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1281,
      p3: 3000,
      p4: 4000,
      actions: [act(ACTION_T_CAST, 9532, 1, 256)],
    }),
    script({
      id: 616806,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1537,
      p3: 3000,
      p4: 8000,
      actions: [act(ACTION_T_CAST, 9532, 1, 256)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [4422, AGATHELOS_AI],
  [4428, JARGBA_AI],
  [4420, RAMTUSK_AI],
  [4421, CHARLGA_AI],
  [4424, AGGEM_AI],
  [6168, ROOGUG_AI],
];
