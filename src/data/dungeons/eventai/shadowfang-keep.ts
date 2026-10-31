// EventAI overlays for shadowfang-keep.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CALL_FOR_HELP,
  ACTION_T_CAST,
  ACTION_T_SET_INST_DATA,
  ACTION_T_SOUND,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// Razorclaw the Butcher 3886 (Shadowfang Keep). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16357 creature_id=3886.
const RAZORCLAW_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 388601,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 7486, 0, 34)],
    }),
  ],
};

// Baron Silverlaine 3887 (Shadowfang Keep). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16359 creature_id=3887.
const SILVERLAINE_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 388701,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1000,
      p2: 1000,
      p3: 22_300,
      p4: 35_100,
      actions: [act(ACTION_T_CAST, 7068, 1, 0)],
    }),
  ],
};

// Rethilgore 3914 (Shadowfang Keep). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16361-16364 creature_id=3914.
const RETHILGORE_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 391401,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_INST_DATA, 2, 1, 0)],
    }),
    script({
      id: 391402,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 1300,
      p2: 14_600,
      p3: 14_200,
      p4: 36_000,
      actions: [act(ACTION_T_CAST, 7295, 1, 0)],
    }),
    script({
      id: 391403,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_SET_INST_DATA, 2, 3, 0)],
    }),
    script({
      id: 391404,
      eventType: EVENT_T.EVADE,
      actions: [act(ACTION_T_SET_INST_DATA, 2, 2, 0)],
    }),
  ],
};

// Wolf Master Nandos 3927 (Shadowfang Keep). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16366-16371 creature_id=3927.
const NANDOS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 392701,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_INST_DATA, 4, 1, 0)],
    }),
    script({
      id: 392702,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 30_000,
      p2: 45_000,
      p3: 33_700,
      p4: 48_800,
      actions: [act(ACTION_T_CAST, 7487, 0, 0)],
    }),
    script({
      id: 392703,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 45_000,
      p2: 50_000,
      p3: 45_400,
      p4: 51_700,
      actions: [act(ACTION_T_CAST, 7488, 0, 0)],
    }),
    script({
      id: 392704,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 60_000,
      p2: 70_000,
      p3: 69_500,
      p4: 69_500,
      actions: [act(ACTION_T_CAST, 7489, 0, 0)],
    }),
    script({
      id: 392705,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_SET_INST_DATA, 4, 3, 0)],
    }),
    script({
      id: 392706,
      eventType: EVENT_T.EVADE,
      actions: [act(ACTION_T_SET_INST_DATA, 4, 2, 0)],
    }),
  ],
};

// Fenrus the Devourer 4274 (Shadowfang Keep). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16373-16376 creature_id=4274.
const FENRUS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 427401,
      eventType: EVENT_T.AGGRO,
      flags: 2,
      actions: [
        act(ACTION_T_SET_INST_DATA, 3, 1, 0),
        act(ACTION_T_SOUND, 6017, 0, 0),
      ],
    }),
    script({
      id: 427402,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2600,
      p2: 7200,
      p3: 23_300,
      p4: 49_000,
      actions: [act(ACTION_T_CAST, 7125, 4, 0)],
    }),
    script({
      id: 427403,
      eventType: EVENT_T.DEATH,
      actions: [act(ACTION_T_SET_INST_DATA, 3, 3, 0)],
    }),
    script({
      id: 427404,
      eventType: EVENT_T.EVADE,
      actions: [act(ACTION_T_SET_INST_DATA, 3, 2, 0)],
    }),
  ],
};

// Commander Springvale 4278 (Shadowfang Keep). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16379-16380 creature_id=4278.
const SPRINGVALE_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 427801,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_300,
      p2: 17_800,
      p3: 61_100,
      p4: 63_500,
      actions: [act(ACTION_T_CAST, 5588, 1, 0)],
    }),
    script({
      id: 427802,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 800,
      p2: 40,
      p3: 17_500,
      p4: 22_300,
      actions: [act(ACTION_T_CAST, 1026, 12, 0)],
    }),
  ],
};

// Odo the Blindwatcher 4279 (Shadowfang Keep). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16382-16385 creature_id=4279.
const ODO_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 427901,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_CALL_FOR_HELP, 30, 0, 0)],
    }),
    script({
      id: 427902,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 75,
      actions: [act(ACTION_T_CAST, 7481, 0, 0)],
    }),
    script({
      id: 427903,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 50,
      actions: [act(ACTION_T_CAST, 7483, 0, 0)],
    }),
    script({
      id: 427904,
      eventType: EVENT_T.HP,
      flags: 1024,
      p1: 25,
      actions: [act(ACTION_T_CAST, 7484, 0, 0)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [3886, RAZORCLAW_AI],
  [3887, SILVERLAINE_AI],
  [3914, RETHILGORE_AI],
  [3927, NANDOS_AI],
  [4274, FENRUS_AI],
  [4278, SPRINGVALE_AI],
  [4279, ODO_AI],
];
