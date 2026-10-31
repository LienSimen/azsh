// Instance scripts for the two raids whose FIGHTS stay with the bake. Zul'Gurub and Naxxramas run
// off creature_spell_list, so only their SetData tables are ported: pure state, colliding with nothing.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';

/** naxxramas.h:61 TYPE_FOUR_HORSEMEN */
export const TYPE_FOUR_HORSEMEN = 8;
/** naxxramas.h:10 MAX_ENCOUNTER — GetData only reads below this. */
export const NAXX_MAX_ENCOUNTER = 16;
/** Side-store for m_horsemenKilled. Cite: naxxramas.h:311; naxxramas.cpp:56. */
export const NAXX_HORSEMEN_KILLED_KEY = NAXX_MAX_ENCOUNTER;
/** Four BossAI SetDataType(TYPE_FOUR_HORSEMEN) deaths. Cite: naxxramas.h:88-91; cpp:536. */
export const NAXX_HORSEMEN_COUNT = 4;
/** naxxramas.h:143 GO_MILI_HORSEMEN_DOOR */
export const GO_MILI_HORSEMEN_DOOR = 181119;
/** Mograine / Zeliek / Korthazz / Blaumeux. Cite: naxxramas.h:88-91. */
export const NAXX_HORSEMEN_ENTRIES = [16062, 16063, 16064, 16065] as const;

export interface HorsemenSetDataResult {
  horsemenKilled: number;
  completed: boolean;
  writes: Array<{ field: number; value: number }>;
  openDoors: number[];
  flavor: string[];
  cite: string;
}

// Port of instance_naxxramas::SetData(TYPE_FOUR_HORSEMEN): each Horseman's death increments the
// counter and only the fourth writes DONE. FAIL zeroes it. Cite: naxxramas.cpp:527-553.
export function applyHorsemenSetData(
  store: Map<number, number>,
  uiData: number,
): HorsemenSetDataResult {
  const data = uiData | 0;
  const current = store.get(TYPE_FOUR_HORSEMEN) ?? 0;
  if (current === data) {
    return {
      horsemenKilled: store.get(NAXX_HORSEMEN_KILLED_KEY) ?? 0,
      completed: current === INSTANCE_DATA.DONE,
      writes: [],
      openDoors: [],
      flavor: [],
      cite: 'naxxramas.cpp:529-531 skip if already set',
    };
  }
  let killed = store.get(NAXX_HORSEMEN_KILLED_KEY) ?? 0;
  if (data === INSTANCE_DATA.DONE) {
    killed = (killed | 0) + 1;
    store.set(NAXX_HORSEMEN_KILLED_KEY, killed);
    if (killed !== NAXX_HORSEMEN_COUNT) {
      return {
        horsemenKilled: killed,
        completed: false,
        writes: [],
        openDoors: [],
        flavor: [],
        cite: 'naxxramas.cpp:532-537 DONE ++m_horsemenKilled; write only at 4',
      };
    }
  }
  if (data === INSTANCE_DATA.FAIL) {
    killed = 0;
    store.set(NAXX_HORSEMEN_KILLED_KEY, 0);
  }
  store.set(TYPE_FOUR_HORSEMEN, data);
  const completed = data === INSTANCE_DATA.DONE;
  return {
    horsemenKilled: killed,
    completed,
    writes: [{ field: TYPE_FOUR_HORSEMEN, value: data }],
    openDoors: completed ? [GO_MILI_HORSEMEN_DOOR] : [],
    flavor: [],
    cite: 'naxxramas.cpp:552-553 write encounter + DoUseDoorOrButton(GO_MILI_HORSEMEN_DOOR 181119)',
  };
}

export const INSTANCE_ZULGURUB: ScriptDevIR = {
  name: 'instance_zulgurub',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/zulgurub/zulgurub.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    { creatureEntry: 14517, field: 0, cite: 'zulgurub.h:12 TYPE_JEKLIK' },
    { creatureEntry: 14507, field: 1, cite: 'zulgurub.h:13 TYPE_VENOXIS' },
    { creatureEntry: 14510, field: 2, cite: 'zulgurub.h:14 TYPE_MARLI' },
    { creatureEntry: 14509, field: 3, cite: 'zulgurub.h:15 TYPE_THEKAL' },
    // TYPE_ARLOKK 4 and TYPE_OHGAN 5 are both unbound: Arlokk 14515 is Gong-summoned with no
    // creature row, and TYPE_OHGAN is written by Mandokir's own IR, not by a death here.
    { creatureEntry: 11347, field: 6, cite: 'zulgurub.h:18 TYPE_LORKHAN (Zealot Lorkhan 11347)' },
    { creatureEntry: 11348, field: 7, cite: 'zulgurub.h:19 TYPE_ZATH (Zealot Zath 11348)' },
  ],
  cites: [
    'zulgurub.h:8-40 MAX_ENCOUNTER 8, TYPE_* and NPC_* constants',
    'zulgurub.cpp SetData / OnCreatureDeath',
    'zulgurub.h:16-17 TYPE_ARLOKK 4 / TYPE_OHGAN 5 unbound - Arlokk 14515 is Gong-summoned and has no creature row',
    'zulgurub.cpp:139-147 TYPE_OHGAN == SPECIAL walks Mandokir to aMandokirDownstairsPos (zulgurub.h:45). '
      + 'The writer is ACID, not C++: Vilebranch Speaker 11391 EventAI row 1139104 EVENT_T_DEATH -> '
      + 'ACTION_T_SET_INST_DATA(5, 4). Ported in data/dungeons/zul-gurub.ts + ui/live/liveFloorState.ts, not here.',
  ],
};

export const INSTANCE_NAXXRAMAS: ScriptDevIR = {
  name: 'instance_naxxramas',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/naxxramas/naxxramas.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    { creatureEntry: 15956, field: 0, cite: 'naxxramas.h:53 TYPE_ANUB_REKHAN' },
    { creatureEntry: 15953, field: 1, cite: 'naxxramas.h:54 TYPE_FAERLINA' },
    { creatureEntry: 15952, field: 2, cite: 'naxxramas.h:55 TYPE_MAEXXNA' },
    { creatureEntry: 15954, field: 3, cite: 'naxxramas.h:56 TYPE_NOTH' },
    { creatureEntry: 15936, field: 4, cite: 'naxxramas.h:57 TYPE_HEIGAN' },
    { creatureEntry: 16011, field: 5, cite: 'naxxramas.h:58 TYPE_LOATHEB' },
    { creatureEntry: 16061, field: 6, cite: 'naxxramas.h:59 TYPE_RAZUVIOUS' },
    { creatureEntry: 16060, field: 7, cite: 'naxxramas.h:60 TYPE_GOTHIK' },
    // One slot, four BossAI SetDataType deaths. Host applyHorsemenSetData writes DONE at 4.
    { creatureEntry: 16062, field: 8, cite: 'naxxramas.h:61,88 TYPE_FOUR_HORSEMEN Mograine 16062' },
    { creatureEntry: 16063, field: 8, cite: 'naxxramas.h:61,89 TYPE_FOUR_HORSEMEN Zeliek 16063' },
    { creatureEntry: 16064, field: 8, cite: 'naxxramas.h:61,90 TYPE_FOUR_HORSEMEN Korthazz 16064' },
    { creatureEntry: 16065, field: 8, cite: 'naxxramas.h:61,91 TYPE_FOUR_HORSEMEN Blaumeux 16065' },
    { creatureEntry: 16028, field: 9, cite: 'naxxramas.h:62 TYPE_PATCHWERK' },
    { creatureEntry: 15931, field: 10, cite: 'naxxramas.h:63 TYPE_GROBBULUS' },
    { creatureEntry: 15932, field: 11, cite: 'naxxramas.h:64 TYPE_GLUTH' },
    { creatureEntry: 15928, field: 12, cite: 'naxxramas.h:65 TYPE_THADDIUS' },
    { creatureEntry: 15989, field: 13, cite: 'naxxramas.h:66 TYPE_SAPPHIRON' },
    { creatureEntry: 15990, field: 14, cite: 'naxxramas.h:67 TYPE_KELTHUZAD' },
  ],
  cites: [
    'naxxramas.h:53-71 - MAX_ENCOUNTER is 16 with only FIFTEEN TYPE_ constants; the array is one oversized and there is no sixteenth boss',
    'naxxramas.cpp SetData / OnCreatureDeath',
    'naxxramas.cpp:527-553 TYPE_FOUR_HORSEMEN m_horsemenKilled gates DONE at 4',
  ],
};
