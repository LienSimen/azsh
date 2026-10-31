// The ex-Wave-M families: Feign Death, the hunter traps and the possess and charm fixtures. This pack
// owns the sourced gameobject notes for the trap trigger spells and invents no spell ids.

import type { RegistryPack } from '../types.ts';

// A hunter trap cast to its summoned gameobject entry and that trap's trigger spell — the entry from
// the raw effect's misc value, the trigger from the gameobject template. Cite: gameobject-data.json.
export interface HunterTrapGoNote {
  /** Player cast spell id (Freezing / Immolation / Frost / Explosive ranks). */
  spellId: number;
  name: string;
  /** EffectMiscValue = gameobject entry. */
  goEntry: number;
  // GO trap data3 spell cast on trigger (Use). Not on the cast spell row — attached only via
  // gameobject_template.
  triggerSpellId: number;
  /** Object slot for SUMMON_OBJECT_SLOT1. Cite: SpellEffects.cpp:4739 → 0. */
  slot: 0;
}

/** Sourced hunter trap family rows for fixtures / SI5 GO arm. */
export const HUNTER_TRAP_GO_NOTES: readonly HunterTrapGoNote[] = [
  // Freezing Trap R1: misc 2561 → Freezing Trap GO → spell 3355.
  // Cite: game-data 1499; gameobject-data 2561 trap.spellId 3355; enrich smoke trap 2561.
  { spellId: 1499, name: 'Freezing Trap', goEntry: 2561, triggerSpellId: 3355, slot: 0 },
  // Freezing Trap R2: GO Freezing Trap II. Cite: game-data 14310; gameobject-data 164876.
  { spellId: 14310, name: 'Freezing Trap', goEntry: 164876, triggerSpellId: 14308, slot: 0 },
  // Freezing Trap R3: GO Freezing Trap III. Cite: game-data 14311; gameobject-data 164877.
  { spellId: 14311, name: 'Freezing Trap', goEntry: 164877, triggerSpellId: 14309, slot: 0 },
  // Immolation Trap R1. Cite: game-data 13795; gameobject-data 164638 trap.spellId 13797.
  { spellId: 13795, name: 'Immolation Trap', goEntry: 164638, triggerSpellId: 13797, slot: 0 },
  // Frost Trap. Cite: game-data 13809; gameobject-data 164639 trap.spellId 13810.
  { spellId: 13809, name: 'Frost Trap', goEntry: 164639, triggerSpellId: 13810, slot: 0 },
  // Explosive Trap R1. Cite: game-data 13813; gameobject-data 164839 trap.spellId 13812.
  { spellId: 13813, name: 'Explosive Trap', goEntry: 164839, triggerSpellId: 13812, slot: 0 },
] as const;

/** Lookup by cast spell id. */
export const HUNTER_TRAP_BY_SPELL_ID: ReadonlyMap<number, HunterTrapGoNote> = new Map(
  HUNTER_TRAP_GO_NOTES.map((n) => [n.spellId, n]),
);

// The interrupt flag bit for a damage break. The sampled charm and possess spells carry no interrupt
// flags in the classic table, so the charm surface has no break-on-damage.
export const AURA_INTERRUPT_FLAG_DAMAGE = 0x2;

/** Sample charm/possess spells for fixtures (aura 6 / 2). */
export const EX_WAVE_M_CHARM_POSSESS = {
  /** Dominate Mind — MOD_CHARM. Cite: spell-data 7645; SpellAuras.cpp:2282. */
  dominateMind: 7645,
  /** Enslave Demon — MOD_CHARM. Cite: game-data 1098. */
  enslaveDemon: 1098,
  /** Mind Control — MOD_POSSESS. Cite: game-data 605; charm-possess.md. */
  mindControl: 605,
  /** Control Shredder — MOD_POSSESS. Cite: SpellAuras.cpp possess path; spell-data 21556. */
  controlShredder: 21556,
} as const;

// Feign Death spell ids. 5384 = aura apply (FEIGN_DEATH 66); 5385 = dummy learn/trigger of 5384. Cite:
// game-data 5384/5385; SpellAuras.cpp:2382 HandleFeignDeath.
export const FEIGN_DEATH_SPELL_ID = 5384;
export const FEIGN_DEATH_TRIGGER_SPELL_ID = 5385;

// No dummy/script handlers here — Life Tap is life-tap.ts; traps/charm/feign use SI3 generic EFFECT/AURA
// handlers. Pack keeps GO notes + family constants.
export const exWaveMPack: RegistryPack = {
  id: 'ex-wave-m',
  dummy: {},
  script: {},
};
