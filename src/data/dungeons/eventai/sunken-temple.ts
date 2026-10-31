// EventAI overlays for sunken-temple.

import type { CreatureAiBundle, CreatureAiSummon } from '../../schema.ts';
import {
  ACTION_T_CAST,
  ACTION_T_DESPAWN_GUARDIANS,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_SET_STAND_STATE,
  ACTION_T_SUMMON_ID,
  ACTION_T_TEXT,
  EVENT_T,
} from '../../../domain/creature/creatureAi.ts';
import { act, script } from './helpers.ts';

// dmapfid:generated-start — DB-extracted summon points (not hand-typed map pins)
const SUMMONS_JAMMALAN: CreatureAiSummon[] = [
  // id 2 Dreamscythe / id 3 Weaver — spawnTimeSecs 86400000 (survey ST E3)
  { id: 2, x: -422.56, y: 69.0183, z: -57.8122, o: 2.72416, spawnTimeSecs: 86_400_000 },
  { id: 3, x: -428.457, y: 117.458, z: -58.1544, o: 3.65981, spawnTimeSecs: 86_400_000 },
];
// dmapfid:generated-end

// Jammal'an the Prophet 5710: DB 571002 DEATH summons Dreamscythe 5721 and Weaver 5720.
// Requires the combat DEATH EventAI to fire on kill. Cite: creature_ai_scripts 571002.
const JAMMALAN_AI: CreatureAiBundle = {
  summons: SUMMONS_JAMMALAN,
  scripts: [
    script({
      id: 571002,
      eventType: EVENT_T.DEATH,
      actions: [
        act(ACTION_T_SUMMON_ID, 5721, 0, 2),
        act(ACTION_T_SUMMON_ID, 5720, 0, 3),
      ],
    }),
  ],
};

// Shade of Eranikus 5709 (Sunken Temple). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16804-16809 creature_id=5709.
const ERANIKUS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 570901,
      eventType: EVENT_T.TIMER_OOC,
      actions: [
        act(ACTION_T_CAST, 12_535, 0, 34),
        act(ACTION_T_SET_STAND_STATE, 3, 0, 0),
      ],
    }),
    script({
      id: 570902,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 4703, 0, 0)],
    }),
    script({
      id: 570903,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 21_000,
      p3: 20_000,
      p4: 40_000,
      actions: [act(ACTION_T_CAST, 12_890, 1, 0)],
    }),
    script({
      id: 570904,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 8000,
      p2: 16_000,
      p3: 10_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 11_876, 17, 0)],
    }),
    script({
      id: 570905,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 12_000,
      p3: 15_000,
      p4: 35_000,
      actions: [act(ACTION_T_CAST, 12_891, 1, 0)],
    }),
    script({
      id: 570906,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 20_000,
      p3: 5000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 3391, 15, 0)],
    }),
  ],
};

// Ogom the Wretched 5711 (Sunken Temple). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16821-16825 creature_id=5711.
const OGOM_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 571101,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 571102,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 24_000,
      p3: 20_700,
      p4: 26_200,
      actions: [act(ACTION_T_CAST, 12_493, 1, 32)],
    }),
    script({
      id: 571103,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9000,
      p2: 21_000,
      p3: 37_900,
      p4: 57_700,
      actions: [act(ACTION_T_CAST, 11_639, 4, 544)],
    }),
    script({
      id: 571104,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1281,
      p3: 3000,
      p4: 3000,
      actions: [act(ACTION_T_CAST, 12_471, 1, 256)],
    }),
    script({
      id: 571105,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1537,
      p2: 1000,
      p3: 5000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 12_471, 1, 256)],
    }),
  ],
};

const MORPHAZ_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 571901,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2000,
      p2: 8000,
      p3: 6000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 12_884, 1, 0)],
    }),
    script({
      id: 571902,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 18_000,
      p3: 15_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 12_882, 1, 0)],
    }),
  ],
};

const WEAVER_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 572001,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2000,
      p2: 8000,
      p3: 6000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 12_884, 1, 0)],
    }),
    script({
      id: 572002,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 18_000,
      p3: 15_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 12_882, 1, 0)],
    }),
  ],
};

const DREAMSCYTHE_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 572101,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_TEXT, 4364, 0, 0)],
    }),
    script({
      id: 572102,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 6220, 0, 0)],
    }),
    script({
      id: 572103,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2000,
      p2: 8000,
      p3: 6000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 12_884, 1, 0)],
    }),
    script({
      id: 572104,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 18_000,
      p3: 15_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 12_882, 1, 0)],
    }),
  ],
};

const HAZZAS_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 572201,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 2000,
      p2: 8000,
      p3: 6000,
      p4: 18_000,
      actions: [act(ACTION_T_CAST, 12_884, 1, 0)],
    }),
    script({
      id: 572202,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6000,
      p2: 18_000,
      p3: 15_000,
      p4: 25_000,
      actions: [act(ACTION_T_CAST, 12_882, 1, 0)],
    }),
  ],
};

// Atal'alarion 8580 (Sunken Temple). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16905-16908 creature_id=8580.
const ATALALARION_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 858001,
      eventType: EVENT_T.SPAWNED,
      actions: [act(ACTION_T_TEXT, 4485, 0, 0)],
    }),
    script({
      id: 858002,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_TEXT, 6216, 0, 0)],
    }),
    script({
      id: 858003,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 20_000,
      p3: 21_600,
      p4: 41_600,
      actions: [act(ACTION_T_CAST, 12_887, 1, 0)],
    }),
    script({
      id: 858004,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9700,
      p2: 18_900,
      p3: 20_500,
      p4: 32_200,
      actions: [act(ACTION_T_CAST, 6524, 17, 0)],
    }),
  ],
};

// Avatar of Hakkar 8443 (Sunken Temple), an EventAI kit with no ScriptDev cpp. 844302
// zone-pulse / call-for-help is skipped. Cite: acid_classic.sql:16896-16900.
const AVATAR_HAKKAR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 844301,
      eventType: EVENT_T.TIMER_GENERIC,
      p1: 1000,
      p2: 1000,
      actions: [act(ACTION_T_TEXT, 4546, 0, 0)],
    }),
    script({
      id: 844303,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 12_000,
      p2: 24_000,
      p3: 20_000,
      p4: 30_000,
      actions: [act(ACTION_T_CAST, 12_889, 16, 544)],
    }),
    script({
      id: 844304,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 10_000,
      p2: 15_000,
      p3: 15_000,
      p4: 20_000,
      actions: [act(ACTION_T_CAST, 6607, 1, 0)],
    }),
    script({
      id: 844305,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 5000,
      p2: 10_000,
      p3: 10_000,
      p4: 15_000,
      actions: [act(ACTION_T_CAST, 12_888, 5, 512)],
    }),
  ],
};

// Zolo 5712 (Sunken Temple). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16827-16829 creature_id=5712.
const ZOLO_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 571201,
      eventType: EVENT_T.TIMER_OOC,
      actions: [act(ACTION_T_CAST, 13_540, 0, 0)],
    }),
    script({
      id: 571202,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 6900,
      p2: 10_100,
      p3: 9500,
      p4: 12_400,
      actions: [act(ACTION_T_CAST, 12_058, 1, 0)],
    }),
    script({
      id: 571203,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 7000,
      p2: 12_000,
      p3: 25_000,
      p4: 35_000,
      actions: [act(ACTION_T_CAST, 12_506, 15, 0)],
    }),
  ],
};

// Gasher 5713 (Sunken Temple). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16831-16832 creature_id=5713.
const GASHER_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 571301,
      eventType: EVENT_T.TIMER_OOC,
      actions: [act(ACTION_T_CAST, 13_540, 0, 0)],
    }),
    script({
      id: 571302,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 10_000,
      p3: 6000,
      p4: 12_000,
      actions: [act(ACTION_T_CAST, 15_580, 1, 0)],
    }),
  ],
};

// Loro 5714 (Sunken Temple). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16834-16837 creature_id=5714.
const LORO_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 571401,
      eventType: EVENT_T.SPAWNED,
      actions: [
        act(ACTION_T_CAST, 12_782, 0, 34),
        act(ACTION_T_CAST, 9205, 0, 34),
      ],
    }),
    script({
      id: 571402,
      eventType: EVENT_T.TIMER_OOC,
      actions: [act(ACTION_T_CAST, 13_540, 0, 0)],
    }),
    script({
      id: 571403,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 10_000,
      p3: 7900,
      p4: 16_600,
      actions: [act(ACTION_T_CAST, 8242, 1, 0)],
    }),
    script({
      id: 571404,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9700,
      p2: 16_700,
      p3: 10_700,
      p4: 16_900,
      actions: [act(ACTION_T_CAST, 3639, 0, 0)],
    }),
  ],
};

// Hukku 5715 (Sunken Temple). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16839-16845 creature_id=5715.
const HUKKU_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 571501,
      eventType: EVENT_T.TIMER_OOC,
      p1: 1000,
      p2: 1000,
      actions: [
        act(ACTION_T_CAST, 12_790, 0, 0),
        act(ACTION_T_CAST, 13_540, 0, 0),
      ],
    }),
    script({
      id: 571502,
      eventType: EVENT_T.EVADE,
      actions: [act(ACTION_T_DESPAWN_GUARDIANS, 0, 0, 0)],
    }),
    script({
      id: 571503,
      eventType: EVENT_T.AGGRO,
      actions: [act(ACTION_T_SET_RANGED_MODE, 2, 35, 0)],
    }),
    script({
      id: 571504,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9400,
      p2: 18_200,
      p3: 21_200,
      p4: 31_300,
      actions: [act(ACTION_T_CAST, 12_279, 4, 544)],
    }),
    script({
      id: 571505,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 10_000,
      p3: 16_400,
      p4: 29_900,
      actions: [act(ACTION_T_CAST, 9081, 0, 0)],
    }),
    script({
      id: 571506,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p3: 3400,
      p4: 4800,
      actions: [act(ACTION_T_CAST, 12_471, 1, 256)],
    }),
  ],
};

// Zul'Lor 5716 (Sunken Temple). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16846-16848 creature_id=5716.
const ZULLOR_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 571601,
      eventType: EVENT_T.TIMER_OOC,
      actions: [act(ACTION_T_CAST, 13_540, 0, 0)],
    }),
    script({
      id: 571602,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9800,
      p2: 14_300,
      p3: 7900,
      p4: 16_200,
      actions: [act(ACTION_T_CAST, 15_584, 1, 0)],
    }),
    script({
      id: 571603,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 2000,
      p3: 6000,
      p4: 12_000,
      actions: [act(ACTION_T_CAST, 12_530, 17, 0)],
    }),
  ],
};

// Mijan 5717 (Sunken Temple). EventAI kit, no ScriptDev cpp. Cite:
// classic-db/ACID/acid_classic.sql:16850-16854 creature_id=5717.
const MIJAN_AI: CreatureAiBundle = {
  scripts: [
    script({
      id: 571701,
      eventType: EVENT_T.TIMER_OOC,
      actions: [act(ACTION_T_CAST, 13_540, 0, 0)],
    }),
    script({
      id: 571702,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p2: 3000,
      p3: 63_800,
      p4: 66_700,
      actions: [act(ACTION_T_CAST, 8148, 0, 0)],
    }),
    script({
      id: 571703,
      eventType: EVENT_T.FRIENDLY_HP,
      flags: 1025,
      p1: 4000,
      p2: 40,
      p3: 19_500,
      p4: 28_100,
      actions: [act(ACTION_T_CAST, 8362, 12, 0)],
    }),
    script({
      id: 571704,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      flags: 1025,
      p1: 9500,
      p2: 18_000,
      p3: 33_400,
      p4: 45_600,
      actions: [act(ACTION_T_CAST, 11_899, 0, 0)],
    }),
    script({
      id: 571705,
      eventType: EVENT_T.HP,
      flags: 1025,
      p1: 50,
      p3: 9000,
      p4: 12_000,
      actions: [act(ACTION_T_CAST, 12_492, 0, 0)],
    }),
  ],
};

export const overlays: ReadonlyArray<readonly [number, CreatureAiBundle]> = [
  [5710, JAMMALAN_AI],
  [5709, ERANIKUS_AI],
  [5711, OGOM_AI],
  [5719, MORPHAZ_AI],
  [5720, WEAVER_AI],
  [5721, DREAMSCYTHE_AI],
  [5722, HAZZAS_AI],
  [8580, ATALALARION_AI],
  [8443, AVATAR_HAKKAR_AI],
  [5712, ZOLO_AI],
  [5713, GASHER_AI],
  [5714, LORO_AI],
  [5715, HUKKU_AI],
  [5716, ZULLOR_AI],
  [5717, MIJAN_AI],
];
