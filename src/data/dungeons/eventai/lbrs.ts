// EventAI overlays for lbrs.

import type { CreatureAiBundle, CreatureAiSummon } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_SUMMON_ID,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

const SUMMONS_HALYCON: CreatureAiSummon[] = [
  { id: 20, x: -167.538, y: -415.014, z: 76.1469, o: 1.56698, spawnTimeSecs: 10_800_000 },
];

// Highlord Omokk 9196 (LBRS). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14393-14396 creature_id=9196.
const OMOKK_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 919601,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 20,
      actions: [
        act(ACTION_T_CAST, 8269, 0, 2),
        act(ACTION_T_TEXT, 2384, 0, 0),
      ],
    }),
    script({
      id: 919602,
      eventType: EVENT_T.KILL,
      flags: 1025,
      p3: 1,
      actions: [act(ACTION_T_TEXT, 1927, 0, 0)],
    }),
    script({
      id: 919603,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 16_000,
      p3: 12_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 10_101, 1, 0)],
    }),
    script({
      id: 919604,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 3000,
      p3: 15_000,
      p4: 25_000,
      actions: [act(ACTION_T_TEXT, 1925, 1926, 1927)],
    }),
  ],
};

// Shadow Hunter Vosh'gajin 9236 (LBRS). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14435-14436 creature_id=9236.
const VOSHGAJIN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 923601,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 20_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 16_098, 17, 0)],
    }),
    script({
      id: 923602,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 15_000,
      p3: 15_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 16_097, 17, 0)],
    }),
  ],
};

// War Master Voone 9237 (LBRS). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14438-14444 creature_id=9237.
const VOONE_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 923701,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 32_000,
      p2: 32_000,
      p3: 16_000,
      p4: 16_000,
      actions: [act(ACTION_T_CAST, 15_615, 1, 0)],
    }),
    script({
      id: 923702,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 20_000,
      p2: 20_000,
      p3: 14_000,
      p4: 14_000,
      actions: [act(ACTION_T_CAST, 10_966, 1, 0)],
    }),
    script({
      id: 923703,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 14_000,
      p2: 14_000,
      p3: 12_000,
      p4: 12_000,
      actions: [act(ACTION_T_CAST, 15_754, 1, 0)],
    }),
    script({
      id: 923704,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 12_000,
      p2: 12_000,
      p3: 10_000,
      p4: 10_000,
      actions: [act(ACTION_T_CAST, 15_708, 1, 0)],
    }),
    script({
      id: 923705,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 8000,
      p3: 6000,
      p4: 6000,
      actions: [act(ACTION_T_CAST, 15_618, 1, 0)],
    }),
    script({
      id: 923706,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 1000,
      p3: 8000,
      p4: 8000,
      actions: [act(ACTION_T_CAST, 16_075, 4, 0)],
    }),
    script({
      id: 923707,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 3000,
      p2: 15_000,
      p3: 3000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 3391, 15, 0)],
    }),
  ],
};

// Quartermaster Zigris 9736 (LBRS). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14581-14585 creature_id=9736.
const ZIGRIS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 973601,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 25, 0)],
    }),
    script({
      id: 973602,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 50,
      p3: 35_000,
      p4: 40_000,
      actions: [act(ACTION_T_CAST, 15_504, 0, 0)],
    }),
    script({
      id: 973603,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 15_000,
      p2: 20_000,
      p3: 20_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 16_497, 4, 1536)],
    }),
    script({
      id: 973604,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 10_000,
      p3: 15_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 15_609, 1, 1536)],
    }),
    script({
      id: 973605,
      eventType: EVENT_T.RANGE,
      flags: 1025,
      p1: 5,
      p2: 35,
      p3: 2000,
      p4: 3000,
      actions: [act(ACTION_T_CAST, 16_496, 1, 256)],
    }),
  ],
};

// Halycon 10220 (LBRS). EventAI kit, no ScriptDev cpp. Cite: classic-db/ACID/acid_classic.sql:14615-14617;
// summons id 20 :19985.
const HALYCON_AI: CreatureAiBundle = {
  summons: SUMMONS_HALYCON,
  scripts: [
    script({
      id: 10_22001,
      eventType: EVENT_T.DEATH,
      actions: [
        act(ACTION_T_TEXT, 5548, 0, 0),
        act(ACTION_T_SUMMON_ID, 10_268, 0, 20),
      ],
    }),
    script({
      id: 10_22002,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 12_000,
      p3: 6000,
      p4: 14_000,
      actions: [act(ACTION_T_CAST, 13_738, 1, 0)],
    }),
    script({
      id: 10_22003,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 10_000,
      p3: 5000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 3391, 15, 0)],
    }),
  ],
};

// Gizrul the Slavener 10268 (LBRS). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14636-14638 creature_id=10268.
const GIZRUL_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_26801,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 20,
      p3: 120_000,
      p4: 120_000,
      actions: [act(ACTION_T_CAST, 8269, 0, 2)],
    }),
    script({
      id: 10_26802,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 20_000,
      p3: 10_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 16_128, 1, 0)],
    }),
    script({
      id: 10_26803,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 10_000,
      p3: 10_000,
      p4: 10_000,
      actions: [act(ACTION_T_CAST, 16_495, 1, 0)],
    }),
  ],
};

// Urok Doomhowl 10584 (LBRS). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14712-14715 creature_id=10584. START_RELAY_SCRIPT 1058401 left unported.
const UROK_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_58401,
      eventType: EVENT_T.SPAWNED,
      actions: [
        act(ACTION_T_CAST, 16_473, 0, 2),
        act(ACTION_T_TEXT, 5832, 0, 0),
      ],
    }),
    script({
      id: 10_58402,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 20_000,
      p4: 40_000,
      actions: [act(ACTION_T_CAST, 16_508, 1, 0)],
    }),
    script({
      id: 10_58403,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9000,
      p2: 18_000,
      p3: 17_000,
      p4: 21_000,
      actions: [act(ACTION_T_CAST, 16_509, 1, 0)],
    }),
    script({
      id: 10_58404,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 30_000,
      p3: 8000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 15_580, 1, 0)],
    }),
  ],
};

// Mother Smolderweb 10596 (LBRS). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:14717-14719 creature_id=10596.
const SMOLDERWEB_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_59601,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_CAST, 16_103, 0, 2)],
    }),
    script({
      id: 10_59602,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 12_500,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 16_468, 17, 0)],
    }),
    script({
      id: 10_59603,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 24_000,
      p3: 8000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 16_104, 1, 0)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [9196, OMOKK_AI],
  [9236, VOSHGAJIN_AI],
  [9237, VOONE_AI],
  [9736, ZIGRIS_AI],
  [10220, HALYCON_AI],
  [10268, GIZRUL_AI],
  [10584, UROK_AI],
  [10596, SMOLDERWEB_AI],
];
