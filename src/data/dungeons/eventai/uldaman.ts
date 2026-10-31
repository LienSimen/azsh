// EventAI overlays for uldaman.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_DESPAWN_GUARDIANS,
  ACTION_T_FLEE_FOR_ASSIST,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// Baelog 6906 (Uldaman). DB 690602 HP≤15%: FLEE_FOR_ASSIST (25). DB event_flags=1; flags 0 so flee arms
// once. Cite: creature_ai_scripts 690602; survey 11-uldaman.md (plain combat EventAI).
const BAELOG_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 690602,
      eventType: EVENT_T.HP,
      flags: 0,
      p1: 15,
      p2: 0,
      actions: [act(ACTION_T_FLEE_FOR_ASSIST, 0, 0, 0)],
    }),
  ],
};

// Ironaya 7228 (Uldaman). EventAI kit, no ScriptDev cpp. Cite: classic-db/ACID/acid_classic.sql:17192-17194
// creature_id=7228.
const IRONAYA_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 722801,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 15_000,
      p3: 2900,
      p4: 7300,
      actions: [act(ACTION_T_CAST, 8374, 1, 0)],
    }),
    script({
      id: 722802,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 20_800,
      p2: 31_400,
      p3: 28_900,
      p4: 49_400,
      actions: [act(ACTION_T_CAST, 10101, 1, 0)],
    }),
    script({
      id: 722803,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 29_200,
      p2: 37_400,
      p3: 26_500,
      p4: 43_400,
      actions: [act(ACTION_T_CAST, 11876, 17, 0)],
    }),
  ],
};

// Olaf 6908 (Uldaman). EventAI kit, no ScriptDev cpp. Cite: classic-db/ACID/acid_classic.sql:17132-17133
// creature_id=6908.
const OLAF_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 690801,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 10021, 0, 34)],
    }),
    script({
      id: 690802,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 15_000,
      p3: 6000,
      p4: 16_000,
      actions: [act(ACTION_T_CAST, 8242, 1, 0)],
    }),
  ],
};

// Eric "The Swift" 6907 (Uldaman). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17130 creature_id=6907.
const ERIC_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 690701,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p1: 10,
      p2: 60,
      p3: 6000,
      p4: 12_000,
      actions: [act(ACTION_T_CAST, 6268, 0, 0)],
    }),
  ],
};

// Revelosh 6910 (Uldaman), an EventAI kit with no ScriptDev cpp.
// Cite: acid_classic.sql:17135-17138; flags 1281 ranged, 1537 melee.
const REVELOSH_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 691001,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 25, 0)],
    }),
    script({
      id: 691002,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6700,
      p2: 15_000,
      p3: 18_100,
      p4: 24_900,
      actions: [act(ACTION_T_CAST, 16006, 4, 512)],
    }),
    script({
      id: 691003,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1281,
      p3: 3000,
      p4: 4000,
      actions: [act(ACTION_T_CAST, 15801, 1, 256)],
    }),
    script({
      id: 691004,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1537,
      p3: 5000,
      p4: 10_000,
      actions: [act(ACTION_T_CAST, 15801, 1, 256)],
    }),
  ],
};

// Grimlock 4854 (Uldaman). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17105-17107 creature_id=4854.
const GRIMLOCK_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 485401,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 485402,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_SET_RANGED_MODE, 2, 35, 0),
        act(ACTION_T_TEXT, 6213, 0, 0),
      ],
    }),
    script({
      id: 485403,
      eventType: EVENT_T.KILL,
      flags: 1025,
      p1: 5000,
      p2: 5000,
      p3: 1,
      actions: [act(ACTION_T_TEXT, 6214, 0, 0)],
    }),
  ],
};

// Stone Keeper 4857 (Uldaman). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17112-17114 creature_id=4857.
const STONE_KEEPER_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 485701,
      eventType: EVENT_T.TIMER_OOC,
      actions: [
        act(ACTION_T_CAST, 10255, 0, 34),
        act(ACTION_T_CAST, 18950, 0, 34),
      ],
    }),
    script({
      id: 485702,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4000,
      p2: 16_000,
      p3: 13_300,
      p4: 22_900,
      actions: [act(ACTION_T_CAST, 5568, 17, 0)],
    }),
    script({
      id: 485704,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_CAST, 9874, 0, 7)],
    }),
  ],
};

// Obsidian Sentinel 7023 (Uldaman). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17151-17156 creature_id=7023.
const OBSIDIAN_SENTINEL_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 702301,
      eventType: EVENT_T.TIMER_OOC,
      p1: 1000,
      p2: 1000,
      actions: [act(ACTION_T_DESPAWN_GUARDIANS, 0, 0, 0)],
    }),
    script({
      id: 702302,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 80,
      actions: [
        act(ACTION_T_CAST, 10_061, 0, 0),
        act(ACTION_T_CAST, 10_072, 0, 0),
        act(ACTION_T_TEXT, 3263, 0, 0),
      ],
    }),
    script({
      id: 702303,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 60,
      actions: [
        act(ACTION_T_CAST, 10_061, 0, 0),
        act(ACTION_T_CAST, 10_072, 0, 0),
        act(ACTION_T_TEXT, 3263, 0, 0),
      ],
    }),
    script({
      id: 702304,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 40,
      actions: [
        act(ACTION_T_CAST, 10_061, 0, 0),
        act(ACTION_T_CAST, 10_072, 0, 0),
        act(ACTION_T_TEXT, 3263, 0, 0),
      ],
    }),
    script({
      id: 702305,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 20,
      actions: [
        act(ACTION_T_CAST, 10_061, 0, 0),
        act(ACTION_T_CAST, 10_072, 0, 0),
        act(ACTION_T_TEXT, 3263, 0, 0),
      ],
    }),
    script({
      id: 702306,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 9941, 0, 34)],
    }),
  ],
};

// Ancient Stone Keeper 7206 (Uldaman). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17185-17186 creature_id=7206.
const ANCIENT_STONE_KEEPER_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 720601,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4300,
      p2: 12_000,
      p3: 30_000,
      p4: 50_000,
      actions: [act(ACTION_T_CAST, 10_094, 4, 512)],
    }),
    script({
      id: 720602,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4300,
      p2: 13_000,
      p3: 30_000,
      p4: 50_000,
      actions: [act(ACTION_T_CAST, 10_132, 15, 0)],
    }),
  ],
};

// Galgann Firehammer 7291 (Uldaman). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:17201-17205 creature_id=7291.
const GALGANN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 729101,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 6212, 0, 0)],
    }),
    script({
      id: 729102,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 9600,
      p4: 33_800,
      actions: [act(ACTION_T_CAST, 9482, 1, 0)],
    }),
    script({
      id: 729103,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 13_500,
      p2: 14_800,
      p3: 11_600,
      p4: 22_500,
      actions: [act(ACTION_T_CAST, 3356, 1, 0)],
    }),
    script({
      id: 729104,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 10_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 8053, 1, 0)],
    }),
    script({
      id: 729105,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 17_200,
      p2: 18_400,
      p3: 8400,
      p4: 14_500,
      actions: [act(ACTION_T_CAST, 11_969, 17, 0)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [6906, BAELOG_AI],
  [7228, IRONAYA_AI],
  [6908, OLAF_AI],
  [6907, ERIC_AI],
  [6910, REVELOSH_AI],
  [4854, GRIMLOCK_AI],
  [4857, STONE_KEEPER_AI],
  [7023, OBSIDIAN_SENTINEL_AI],
  [7206, ANCIENT_STONE_KEEPER_AI],
  [7291, GALGANN_AI],
];
