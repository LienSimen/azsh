// "Hate to Zero": the dummy whose C++ body resets threat. Both ids carry no misc value, so the generic
// dispatcher no-ops and the boss kept the table a mechanic exists to lose. Cite: UnitAI.cpp:773-781.

import type { RegistryHandler, RegistryPack } from '../types.ts';

/** Arlokk's, cast on her vanish. Cite: boss_arlokk.cpp:50. */
export const HATE_TO_ZERO_20538 = 20538;
/** The Enrage-carried one: 23537 Enrage triggers it on Chromaggus, Venoxis and Mandokir. */
export const HATE_TO_ZERO_9204 = 9204;

const handleHateToZero: RegistryHandler = (state) => {
  state.effects.push({ kind: 'reset_own_threat' });
  return true;
};

export const raidThreatWipePack: RegistryPack = {
  id: 'raid-threat-wipe',
  dummy: {
    [HATE_TO_ZERO_20538]: handleHateToZero,
    [HATE_TO_ZERO_9204]: handleHateToZero,
  },
};
