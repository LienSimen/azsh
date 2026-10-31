// Which pool a Powers index names on a fighter, since a restore, an energize and a drain all carry
// EffectMiscValue. Cite: SharedDefines.h Powers; SpellAuras.cpp:4836-4844 PERIODIC_ENERGIZE.

import { POWER_MANA, POWER_RAGE, POWER_FOCUS, POWER_ENERGY } from '../spells/effects.ts';
import type { Fighter } from './types.ts';

export { powerTypeName } from '../spells/effects.ts';

export function powerOfType(f: Fighter, powerType: number): number {
  if (powerType === POWER_MANA) return f.spec.powerType === 'mana' ? f.power : f.mana;
  if (powerType === POWER_RAGE && f.spec.powerType === 'rage') return f.power;
  if (powerType === POWER_FOCUS && f.spec.powerType === 'focus') return f.power;
  if (powerType === POWER_ENERGY && f.spec.powerType === 'energy') return f.power;
  return 0;
}

// 0 here is the C++ `GetMaxPower(power) == 0 → break`: the unit has no such pool, so the tick is a
// no-op rather than a credit to whatever bar it does have. Cite: SpellAuras.cpp:4838.
export function maxPowerOfType(f: Fighter, powerType: number): number {
  if (powerType === POWER_MANA) return f.spec.powerType === 'mana' ? f.spec.maxPower : f.maxMana;
  if (powerType === POWER_RAGE && f.spec.powerType === 'rage') return f.spec.maxPower;
  if (powerType === POWER_FOCUS && f.spec.powerType === 'focus') return f.spec.maxPower;
  if (powerType === POWER_ENERGY && f.spec.powerType === 'energy') return f.spec.maxPower;
  return 0;
}

export function setPowerOfType(f: Fighter, powerType: number, value: number): void {
  const v = Math.max(0, Math.trunc(value));
  if (powerType === POWER_MANA) {
    if (f.spec.powerType === 'mana') f.power = Math.min(f.spec.maxPower, v);
    else f.mana = Math.min(f.maxMana, v);
    return;
  }
  if (
    (powerType === POWER_RAGE && f.spec.powerType === 'rage')
    || (powerType === POWER_FOCUS && f.spec.powerType === 'focus')
    || (powerType === POWER_ENERGY && f.spec.powerType === 'energy')
  ) {
    f.power = Math.min(f.spec.maxPower, v);
  }
}

export function casterPowerTypeId(f: Fighter): number {
  if (f.spec.powerType === 'mana') return POWER_MANA;
  if (f.spec.powerType === 'rage') return POWER_RAGE;
  if (f.spec.powerType === 'focus') return POWER_FOCUS;
  if (f.spec.powerType === 'energy') return POWER_ENERGY;
  return POWER_MANA;
}
