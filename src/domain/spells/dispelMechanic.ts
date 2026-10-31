// SPELL_EFFECT_DISPEL_MECHANIC holder match + ProcessDispelList peel. Cite: SpellEffects.cpp:2499–2519;
// SpellAuras.cpp:5788–5796 HasMechanic.

import type { Mechanic } from '../../data/schema.ts';
import { MECHANIC_ID } from '../creature/creatureAiConstants.ts';
import {
  processDispelList,
  type DispelRng,
  type DispellableAura,
} from './dispel.ts';

/** SharedDefines.h:374 MECHANIC_MOUNT. */
export const MECHANIC_MOUNT = 21;

export type MechanicSpellView = {
  mechanic?: string | number | null;
  rawEffects?: ReadonlyArray<{ mechanic?: number }> | null;
  // SpellEffect.mechanic is a Mechanic string on cc/root/speed and a raw id on dispel_mechanic.
  effects?: ReadonlyArray<{ kind: string; mechanic?: string | number | null }> | null;
};

export function mechanicIdOf(mechanic: string | number | null | undefined): number {
  if (mechanic == null) return 0;
  if (typeof mechanic === 'number') return Number.isFinite(mechanic) ? mechanic | 0 : 0;
  const id = MECHANIC_ID[mechanic as Mechanic];
  return id ?? 0;
}

/** SpellAuraHolder::HasMechanic — proto Mechanic / EffectMechanic; skip dispel_mechanic misc. Cite: SpellAuras.cpp:5788–5796. */
export function holderHasMechanic(
  spell: MechanicSpellView | null | undefined,
  mechanic: number,
): boolean {
  if (!mechanic || !spell) return false;
  if (mechanicIdOf(spell.mechanic) === mechanic) return true;
  for (const raw of spell.rawEffects ?? []) {
    if (((raw.mechanic ?? 0) | 0) === mechanic) return true;
  }
  for (const effect of spell.effects ?? []) {
    if (effect.kind === 'dispel_mechanic') continue;
    if (effect.mechanic && mechanicIdOf(effect.mechanic) === mechanic) return true;
  }
  return false;
}

// Live-row fallback for when the holder's SpellDef is on no kit: a stamped mechanic wins, a root maps
// to MECHANIC_ROOT and a hostile speed effect to MECHANIC_SNARE.
export function liveEffectHasMechanic(
  e: { kind?: string; mechanic?: string | number; hostile?: boolean },
  mechanic: number,
): boolean {
  if (mechanic <= 0) return false;
  if (e.mechanic != null && mechanicIdOf(e.mechanic) === mechanic) return true;
  if (e.kind === 'root' && mechanic === MECHANIC_ID.root) return true;
  if (e.kind === 'speed' && e.hostile === true && mechanic === MECHANIC_ID.snare) return true;
  return false;
}

export type MechanicLiveView = {
  spellId: number;
  stacks?: number;
  mechanic?: string | number;
  kind?: string;
  hostile?: boolean;
};

export function collectMechanicHolders(
  auras: ReadonlyArray<MechanicLiveView>,
  mechanic: number,
  lookup: (spellId: number) => MechanicSpellView | null | undefined,
): DispellableAura[] {
  const out: DispellableAura[] = [];
  for (const aura of auras) {
    if (liveEffectHasMechanic(aura, mechanic) || holderHasMechanic(lookup(aura.spellId), mechanic)) {
      out.push({ spellId: aura.spellId, dispelType: 0, stacks: aura.stacks ?? 1 });
    }
  }
  return out;
}

export function peelMechanicAuras<T extends { spellId: number }>(
  auras: readonly T[],
  mechanic: number,
  count: number,
  lookup: (spellId: number) => MechanicSpellView | null | undefined,
  rng: DispelRng,
): { kept: T[]; removed: T[] } {
  const candidates = collectMechanicHolders(auras, mechanic, lookup);
  if (!candidates.length) return { kept: auras.slice(), removed: [] };
  const { success } = processDispelList(candidates, count, rng);
  const left = new Map<number, number>();
  for (const row of success) left.set(row.spellId, (left.get(row.spellId) ?? 0) + 1);
  const kept: T[] = [];
  const removed: T[] = [];
  for (const aura of auras) {
    const n = left.get(aura.spellId) ?? 0;
    if (n > 0) {
      left.set(aura.spellId, n - 1);
      removed.push(aura);
    } else {
      kept.push(aura);
    }
  }
  return { kept, removed };
}
