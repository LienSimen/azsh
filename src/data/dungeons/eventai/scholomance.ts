// EventAI overlays for scholomance.

import type { CreatureAiBundle } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_REMOVEAURASFROMSPELL,
  ACTION_T_REMOVE_UNIT_FLAG,
  ACTION_T_SET_PHASE,
  ACTION_T_TEXT,
  EVENT_T,
  EFLAG_REPEATABLE,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// The Ravenian 10507 (Scholomance), DB rows 1050701–1050708: AGGRO sets phase 1 and phase-masked
// CASTs follow. EVENT_T_TARGET_AURA (24) is not in the combat-ready subset for stack flips yet.
const RAVENIAN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 1050701,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_PHASE, 1, 0, 0)],
    }),
    // CAST kept so castEntriesFromAiScripts carries eventInversePhaseMask=5
    script({
      id: 1050702,
      eventType: EVENT_T.RANGE,
      flags: EFLAG_REPEATABLE,
      inversePhaseMask: 5, // bits 0+2 → only phase 1
      p1: 0,
      p2: 5,
      p3: 6000,
      p4: 11000,
      actions: [act(ACTION_T_CAST, 17963, 1, 0)],
    }),
    // TARGET_AURA = 24 (CreatureEventAI.h) — armed if non-CAST; stack gate needs full aura model
    script({
      id: 1050703,
      eventType: 24, // EVENT_T_TARGET_AURA
      flags: EFLAG_REPEATABLE,
      inversePhaseMask: 5,
      p1: 17963,
      p2: 5,
      p3: 5000,
      p4: 5000,
      actions: [act(ACTION_T_SET_PHASE, 2, 0, 0)],
    }),
    script({
      id: 1050704,
      eventType: EVENT_T.TARGET_MISSING_AURA,
      flags: EFLAG_REPEATABLE,
      inversePhaseMask: 3, // bits 0+1 → only phase 2+
      p1: 17963,
      p2: 1,
      p3: 5000,
      p4: 5000,
      actions: [act(ACTION_T_SET_PHASE, 1, 0, 0)],
    }),
    // Unmasked timer casts (DB 1050705–07)
    script({
      id: 1050705,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: EFLAG_REPEATABLE,
      p1: 8000,
      p2: 12000,
      p3: 7000,
      p4: 10000,
      actions: [act(ACTION_T_CAST, 15584, 1, 0)], // Cleave
    }),
    script({
      id: 1050706,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: EFLAG_REPEATABLE,
      p1: 16000,
      p2: 24000,
      p3: 12000,
      p4: 18000,
      actions: [act(ACTION_T_CAST, 15550, 1, 0)], // Trample
    }),
    script({
      id: 1050707,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: EFLAG_REPEATABLE,
      p1: 17000,
      p2: 21000,
      p3: 14000,
      p4: 19000,
      actions: [act(ACTION_T_CAST, 18670, 1, 0)], // Knock Away
    }),
  ],
};

// Vectus 10432 (Scholomance). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16061-16063 creature_id=10432.
const VECTUS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_43201,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_CAST, 13_377, 0, 34)],
    }),
    script({
      id: 10_43202,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 12_000,
      p2: 14_000,
      p3: 12_000,
      p4: 14_000,
      actions: [act(ACTION_T_CAST, 16_046, 0, 0)],
    }),
    script({
      id: 10_43203,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2000,
      p2: 4000,
      p3: 20_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 18_399, 4, 0)],
    }),
  ],
};

// Marduk Blackpool 10433 (Scholomance). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16065-16069 creature_id=10433.
const MARDUK_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_43301,
      eventType: EVENT_T.AGGRO,
      chance: 50,
      actions: [act(ACTION_T_TEXT, 6234, 0, 0)],
    }),
    script({
      id: 10_43302,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_CAST, 17_695, 0, 34)],
    }),
    script({
      id: 10_43303,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 15_000,
      p3: 6200,
      p4: 14_900,
      actions: [act(ACTION_T_CAST, 17_228, 1, 0)],
    }),
    script({
      id: 10_43304,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 15_400,
      p2: 17_800,
      p3: 7500,
      p4: 22_400,
      actions: [act(ACTION_T_CAST, 15_754, 1, 0)],
    }),
    script({
      id: 10_43305,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 15_900,
      p3: 8000,
      p4: 16_000,
      actions: [act(ACTION_T_CAST, 12_040, 0, 32)],
    }),
  ],
};

// Lady Illucia Barov 10502 (Scholomance). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16158-16162 creature_id=10502.
const ILLUCIA_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_50201,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 11_000,
      p3: 12_000,
      p4: 19_000,
      actions: [act(ACTION_T_CAST, 12_528, 0, 0)],
    }),
    script({
      id: 10_50202,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9000,
      p2: 15_000,
      p3: 11_000,
      p4: 16_000,
      actions: [act(ACTION_T_CAST, 17_289, 4, 0)],
    }),
    script({
      id: 10_50203,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 14_000,
      p2: 18_000,
      p3: 30_000,
      p4: 36_000,
      actions: [act(ACTION_T_CAST, 18_671, 0, 0)],
    }),
    script({
      id: 10_50204,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 21_000,
      p2: 32_000,
      p3: 18_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 12_542, 4, 0)],
    }),
    script({
      id: 10_50205,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 17_000,
      p2: 23_000,
      p3: 21_000,
      p4: 26_000,
      actions: [act(ACTION_T_CAST, 14_515, 5, 0)],
    }),
  ],
};

// Lord Alexei Barov 10504 (Scholomance). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16165-16166 creature_id=10504.
const ALEXEI_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_50401,
      eventType: EVENT_T.TIMER_OOC,
      actions: [
        act(ACTION_T_CAST, 17_467, 0, 34),
        act(ACTION_T_CAST, 15_506, 0, 34),
      ],
    }),
    script({
      id: 10_50402,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 15_000,
      p3: 15_000,
      p4: 21_000,
      actions: [act(ACTION_T_CAST, 17_820, 1, 0)],
    }),
  ],
};

// Instructor Malicia 10505 (Scholomance). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16168-16173 creature_id=10505.
const MALICIA_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_50501,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 4000,
      p2: 9000,
      p3: 18_000,
      p4: 26_000,
      actions: [act(ACTION_T_CAST, 17_831, 4, 32)],
    }),
    script({
      id: 10_50502,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 12_000,
      p3: 11_000,
      p4: 16_000,
      actions: [act(ACTION_T_CAST, 18_376, 1, 32)],
    }),
    script({
      id: 10_50503,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 12_000,
      p2: 18_000,
      p3: 24_000,
      p4: 28_000,
      actions: [act(ACTION_T_CAST, 8362, 0, 0)],
    }),
    script({
      id: 10_50504,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 14_000,
      p2: 19_000,
      p3: 12_000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 13_747, 5, 0)],
    }),
    script({
      id: 10_50505,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 1200,
      p2: 40,
      p3: 14_000,
      p4: 21_000,
      actions: [act(ACTION_T_CAST, 17_843, 12, 0)],
    }),
    script({
      id: 10_50506,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 50,
      p3: 7000,
      p4: 12_000,
      actions: [act(ACTION_T_CAST, 15_586, 0, 0)],
    }),
  ],
};

// Kirtonos the Herald 10506 (Scholomance), an EventAI kit with no ScriptDev cpp. 1050609
// ACTION_T_THREAT_SINGLE is skipped. Cite: acid_classic.sql:16175-16185.
const KIRTONOS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_50601,
      eventType: EVENT_T.AGGRO,
      actions: [
        act(ACTION_T_TEXT, 5788, 0, 0),
        act(ACTION_T_SET_PHASE, 1, 0, 0),
      ],
    }),
    script({
      id: 10_50602,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      inversePhaseMask: 5,
      flags: 1025,
      p1: 10_000,
      p2: 16_100,
      p3: 9700,
      p4: 33_600,
      actions: [act(ACTION_T_CAST, 18_144, 1, 0)],
    }),
    script({
      id: 10_50603,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      inversePhaseMask: 5,
      flags: 1025,
      p1: 14_100,
      p2: 32_400,
      p3: 56_100,
      p4: 79_500,
      actions: [act(ACTION_T_CAST, 6016, 1, 0)],
    }),
    script({
      id: 10_50604,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      inversePhaseMask: 5,
      flags: 1025,
      p1: 17_000,
      p2: 28_000,
      p3: 14_600,
      p4: 33_900,
      actions: [act(ACTION_T_CAST, 12_882, 0, 0)],
    }),
    script({
      id: 10_50605,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      inversePhaseMask: 5,
      chance: 85,
      flags: 1025,
      p1: 10_200,
      p2: 63_900,
      p3: 32_500,
      p4: 47_500,
      actions: [act(ACTION_T_CAST, 8379, 1, 0)],
    }),
    script({
      id: 10_50606,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      inversePhaseMask: 5,
      flags: 1025,
      p1: 18_100,
      p2: 18_500,
      p3: 15_500,
      p4: 28_800,
      actions: [
        act(ACTION_T_CAST, 16_467, 0, 0),
        act(ACTION_T_SET_PHASE, 2, 0, 0),
      ],
    }),
    script({
      id: 10_50607,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      inversePhaseMask: 3,
      flags: 1025,
      p1: 42_200,
      p2: 47_700,
      p3: 4000,
      p4: 7000,
      actions: [act(ACTION_T_CAST, 17_228, 1, 0)],
    }),
    script({
      id: 10_50608,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      inversePhaseMask: 3,
      flags: 1025,
      p1: 53_200,
      p2: 56_000,
      p3: 29_000,
      p4: 50_000,
      actions: [act(ACTION_T_CAST, 12_889, 4, 0)],
    }),
    script({
      id: 10_50609,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      inversePhaseMask: 3,
      flags: 1025,
      p1: 34_000,
      p2: 40_000,
      p3: 33_800,
      p4: 46_800,
      actions: [act(ACTION_T_CAST, 14_515, 5, 0)],
    }),
    script({
      id: 10_50610,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      inversePhaseMask: 3,
      flags: 1,
      p1: 54_300,
      p2: 59_900,
      p3: 33_800,
      p4: 46_800,
      actions: [
        act(ACTION_T_REMOVEAURASFROMSPELL, 0, 16_467, 0),
        act(ACTION_T_SET_PHASE, 1, 0, 0),
      ],
    }),
    script({
      id: 10_50611,
      eventType: EVENT_T.EVADE,
      actions: [act(ACTION_T_SET_PHASE, 0, 0, 0)],
    }),
  ],
};

// Ras Frostwhisper 10508 (Scholomance), an EventAI kit with no ScriptDev cpp. SPELLHIT relay
// 1050803 is unported. Cite: acid_classic.sql:16192-16199.
const RAS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_50801,
      eventType: EVENT_T.TIMER_OOC,
      actions: [act(ACTION_T_REMOVE_UNIT_FLAG, 256, 0, 0)],
    }),
    script({
      id: 10_50802,
      eventType: EVENT_T.MISSING_AURA,
      flags: 1,
      p1: 18_100,
      p2: 1,
      p3: 15_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 18_100, 0, 0)],
    }),
    script({
      id: 10_50804,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 15_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 18_099, 17, 0)],
    }),
    script({
      id: 10_50805,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 15_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 18_763, 1, 0)],
    }),
    script({
      id: 10_50806,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 16_000,
      p3: 12_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 12_096, 1, 0)],
    }),
    script({
      id: 10_50807,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 10_000,
      p3: 10_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 8398, 17, 0)],
    }),
    script({
      id: 10_50808,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 20_000,
      p3: 16_000,
      p4: 32_000,
      actions: [act(ACTION_T_CAST, 11_130, 17, 0)],
    }),
  ],
};

// Lorekeeper Polkelt 10901 (Scholomance). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16203-16205 creature_id=10901.
const POLKELT_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 10_90101,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 12_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 18_151, 4, 544)],
    }),
    script({
      id: 10_90102,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 18_000,
      p3: 12_000,
      p4: 24_000,
      actions: [act(ACTION_T_CAST, 18_149, 4, 544)],
    }),
    script({
      id: 10_90103,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 24_000,
      p3: 12_000,
      p4: 36_000,
      actions: [act(ACTION_T_CAST, 8245, 17, 0)],
    }),
  ],
};

// Doctor Theolen Krastinov 11261 (Scholomance). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16212-16214 creature_id=11261.
const THEOLEN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 11_26101,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 50,
      p3: 120_000,
      p4: 120_000,
      actions: [
        act(ACTION_T_CAST, 8269, 0, 0),
        act(ACTION_T_TEXT, 1191, 0, 0),
      ],
    }),
    script({
      id: 11_26102,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 18_000,
      p3: 6000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 16_509, 1, 32)],
    }),
    script({
      id: 11_26103,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 18_000,
      p3: 6000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 18_103, 1, 0)],
    }),
  ],
};

// Rattlegore 11622 (Scholomance). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16241-16243 creature_id=11622.
const RATTLEGORE_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 11_62201,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7300,
      p2: 22_100,
      p3: 10_800,
      p4: 27_600,
      actions: [act(ACTION_T_CAST, 10_101, 1, 0)],
    }),
    script({
      id: 11_62202,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6200,
      p2: 21_800,
      p3: 7500,
      p4: 21_300,
      actions: [act(ACTION_T_CAST, 18_368, 1, 0)],
    }),
    script({
      id: 11_62203,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 15_800,
      p2: 21_400,
      p3: 13_100,
      p4: 26_400,
      actions: [act(ACTION_T_CAST, 16_727, 0, 0)],
    }),
  ],
};

// Blood Steward of Kirtonos 14861 (Scholomance). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16292-16294 creature_id=14861.
const BLOOD_STEWARD_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 14_86101,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 19_400,
      p2: 19_700,
      p3: 4200,
      p4: 22_900,
      actions: [act(ACTION_T_CAST, 22_371, 1, 32)],
    }),
    script({
      id: 14_86102,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6100,
      p2: 18_200,
      p3: 3600,
      p4: 22_600,
      actions: [act(ACTION_T_CAST, 12_493, 1, 32)],
    }),
    script({
      id: 14_86103,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 16_000,
      p2: 19_000,
      p3: 27_300,
      p4: 46_900,
      actions: [act(ACTION_T_CAST, 3609, 1, 0)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [10507, RAVENIAN_AI],
  [10432, VECTUS_AI],
  [10433, MARDUK_AI],
  [10502, ILLUCIA_AI],
  [10504, ALEXEI_AI],
  [10505, MALICIA_AI],
  [10506, KIRTONOS_AI],
  [10508, RAS_AI],
  [10901, POLKELT_AI],
  [11261, THEOLEN_AI],
  [11622, RATTLEGORE_AI],
  [14861, BLOOD_STEWARD_AI],
];
