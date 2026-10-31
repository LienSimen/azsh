// EventAI overlays for blackfathom-deeps.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CALL_FOR_HELP,
  ACTION_T_CAST,
  ACTION_T_SET_INST_DATA,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_SOUND,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

/** Aku'mai 4829 (BFD). KI-963 wall. Cite: classic-db/ACID/acid_classic.sql:13842-13843 creature_id=4829. */
const AKUMAI_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 482901,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 20_000,
      p3: 25_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 3815, 17, 0)],
    }),
    script({
      id: 482902,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 20_000,
      p3: 6000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 3490, 15, 0)],
    }),
  ],
};

// Twilight Lord Kelris 4832 (BFD). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:13856-13860 creature_id=4832.
const KELRIS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 483201,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_TEXT, 6171, 0, 0),
        act(ACTION_T_CALL_FOR_HELP, 60, 0, 0),
      ],
    }),
    script({
      id: 483202,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 0,
      p2: 10_000,
      p3: 7000,
      p4: 21_000,
      actions: [act(ACTION_T_CAST, 15587, 1, 0)],
    }),
    script({
      id: 483203,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 15_000,
      p3: 15_000,
      p4: 30_000,
      actions: [
        act(ACTION_T_CAST, 8399, 17, 0),
        act(ACTION_T_SOUND, 5804, 0, 0),
      ],
    }),
    script({
      id: 483204,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_SET_INST_DATA, 1, 3, 0)],
    }),
    script({
      id: 483205,
      eventType: EVENT_T.KILL,
      flags: 1025,
      p1: 5000,
      p2: 5000,
      p3: 1,
      actions: [act(ACTION_T_TEXT, 6172, 0, 0)],
    }),
  ],
};

// Old Serra'kis 4830 (Blackfathom Deeps). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:13845 creature_id=4830.
const SERRAKIS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 483001,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 8434, 0, 34)],
    }),
  ],
};

// Lady Sarevess 4831 (Blackfathom Deeps), an EventAI kit with no ScriptDev cpp. Cite:
// acid_classic.sql:13847-13854 creature_id=4831; flags 1281 ranged, 1537 melee.
const SAREVESS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 483101,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 25, 0)],
    }),
    script({
      id: 483102,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 6169, 0, 0)],
    }),
    script({
      id: 483103,
      eventType: EVENT_T.KILL,
      flags: 1025,
      p1: 5000,
      p2: 5000,
      p3: 1,
      actions: [act(ACTION_T_TEXT, 6170, 0, 0)],
    }),
    script({
      id: 483104,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 24_000,
      p3: 15_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 865, 17, 1024)],
    }),
    script({
      id: 483105,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 9000,
      p3: 9000,
      p4: 13_000,
      actions: [act(ACTION_T_CAST, 246, 5, 544)],
    }),
    script({
      id: 483106,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1281,
      p1: 3000,
      p2: 3000,
      p3: 5000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 8435, 1, 0)],
    }),
    script({
      id: 483107,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1537,
      p1: 3000,
      p2: 3000,
      p3: 2000,
      p4: 8000,
      actions: [act(ACTION_T_CAST, 8435, 1, 0)],
    }),
    script({
      id: 483108,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p1: 5,
      p2: 30,
      p3: 2000,
      p4: 3000,
      actions: [act(ACTION_T_CAST, 6660, 1, 256)],
    }),
  ],
};

// Ghamoo-ra 4887 (Blackfathom Deeps). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:13862 creature_id=4887.
const GHAMOORA_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 488701,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 15_000,
      p3: 9000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 5568, 17, 0)],
    }),
  ],
};

// Gelihast 6243 (Blackfathom Deeps). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:13870-13871 creature_id=6243.
const GELIHAST_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 624301,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 7165, 0, 34)],
    }),
    script({
      id: 624302,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 10_000,
      p3: 7000,
      p4: 13_000,
      actions: [act(ACTION_T_CAST, 6533, 1, 0)],
    }),
  ],
};

// Baron Aquanis 12876 (Blackfathom Deeps). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:13875-13878 creature_id=12876.
const AQUANIS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1287601,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 1287602,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 15_000,
      p3: 14_000,
      p4: 19_000,
      actions: [act(ACTION_T_CAST, 15_531, 17, 1024)],
    }),
    script({
      id: 1287603,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1281,
      p2: 1000,
      p3: 3000,
      p4: 4000,
      actions: [act(ACTION_T_CAST, 15_043, 1, 256)],
    }),
    script({
      id: 1287604,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1537,
      p2: 1000,
      p3: 5000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 15_043, 1, 256)],
    }),
  ],
};

// Lorgus Jett 12902 (Blackfathom Deeps). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:13880-13883 creature_id=12902.
const LORGUS_JETT_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1290201,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 1290202,
      eventType: EVENT_T.MISSING_AURA,
      flags: 1,
      p1: 12_550,
      p2: 1,
      p3: 15_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 12_550, 0, 0)],
    }),
    script({
      id: 1290203,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1281,
      p2: 1000,
      p3: 3000,
      p4: 4000,
      actions: [act(ACTION_T_CAST, 12_167, 1, 256)],
    }),
    script({
      id: 1290204,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1537,
      p2: 1000,
      p3: 5000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 12_167, 1, 256)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [4829, AKUMAI_AI],
  [4832, KELRIS_AI],
  [4830, SERRAKIS_AI],
  [4831, SAREVESS_AI],
  [4887, GHAMOORA_AI],
  [6243, GELIHAST_AI],
  [12876, AQUANIS_AI],
  [12902, LORGUS_JETT_AI],
];
