// The trap gameobjects a wild-summon cast turns into a ground pool. A POINTER table only: the damage,
// school and radius are read off the payload's own bake, and smoke fails on a pointer that drifts.

export type TrapObjectPool = {
  /** gameobject_template trap.spellId - the payload cast on whoever is inside. */
  spellId: number;
  /** trap.cooldown re-arm. GameObject.cpp:1532 falls back to 4 s when the field is 0. */
  cooldownMs: number;
};

/** GameObject.cpp:1532 `goInfo->trap.cooldown ? goInfo->trap.cooldown : uint32(4)`. */
const DEFAULT_TRAP_REARM_MS = 4000;

export const TRAP_OBJECT_POOLS: ReadonlyMap<number, TrapObjectPool> = new Map([
  // Jeklik's rider pots. Spell 23971 Summon Liquid Fire -> GO 180125, which fires 23972 Blaze.
  // trap.cooldown is absent on 180125, so the re-arm is the C++ default.
  [180125, { spellId: 23972, cooldownMs: DEFAULT_TRAP_REARM_MS }],
  // Magmadar's lava bomb. Spells 20494/20495 both name GO 177704, which fires 19428
  // Conflagration on trap.cooldown 1.
  [177704, { spellId: 19428, cooldownMs: 1000 }],
]);

/** The pool a summoned goEntry lays down, or undefined when the GO is not a damaging trap. */
export function trapObjectPoolFor(goEntry: number): TrapObjectPool | undefined {
  return TRAP_OBJECT_POOLS.get(goEntry | 0);
}
