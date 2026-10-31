/** Slot GO replace. Cite: SpellEffects.cpp:4734–4790 EffectSummonObject; Unit.h:1979 m_ObjectSlotGuid[4]. */

import type { SpellDef, SpellEffect } from '../../data/schema.ts';

/** One slot GO currently occupying m_ObjectSlotGuid[slot]. */
export interface SlotSummonedObject {
  /** gameobject_template.entry (EffectMiscValue). */
  goEntry: number;
  /** Spell that summoned it (SetSpellId). */
  spellId: number;
  /** 0..3 — SLOT1→0 SLOT2→1. Cite: SpellEffects.cpp:4739–4744. */
  slot: number;
  // Wall-clock ms when the GO despawns. `0` means no timed despawn (C++ RespawnTime 0 when m_duration ≤ 0).
  expiresAtMs: number;
}

/** Collect slot-GO payloads from resolved combat/OOC effects. */
export function collectSummonObjectSlot(
  effects: readonly SpellEffect[],
  spellId: number,
  nowMs: number,
): SlotSummonedObject[] {
  const out: SlotSummonedObject[] = [];
  for (const e of effects) {
    if (e.kind !== 'summon_object_slot') continue;
    const goEntry = e.goEntry | 0;
    if (goEntry <= 0) continue;
    const slot = e.slot | 0;
    if (slot < 0 || slot > 3) continue;
    const durationMs = e.durationMs | 0;
    out.push({
      goEntry,
      spellId: spellId | 0,
      slot,
      expiresAtMs: durationMs > 0 ? nowMs + durationMs : 0,
    });
  }
  return out;
}

/** Drop expired rows (timed only); keep untimed (expiresAtMs 0). */
export function pruneSlotSummoned(
  list: readonly SlotSummonedObject[] | undefined,
  nowMs: number,
): SlotSummonedObject[] {
  if (!list?.length) return [];
  return list.filter((w) => w.expiresAtMs === 0 || w.expiresAtMs > nowMs);
}

/** Replace any occupant of the same slot, then append. Cite: :4748–4756 / :4790. */
export function placeSummonObjectSlot(
  existing: readonly SlotSummonedObject[] | undefined,
  added: readonly SlotSummonedObject[],
  nowMs: number,
): SlotSummonedObject[] {
  const kept = pruneSlotSummoned(existing, nowMs);
  if (!added.length) return kept;
  const taken = new Set(added.map((a) => a.slot));
  return [...kept.filter((k) => !taken.has(k.slot)), ...added];
}

/** Resolve a spell's slot-GO effects. Empty when no SLOT* materialize (or empty misc). */
export function collectSummonObjectSlotFromSpell(
  spell: SpellDef | null | undefined,
  nowMs: number,
): SlotSummonedObject[] {
  if (!spell?.effects?.length) return [];
  return collectSummonObjectSlot(spell.effects, spell.id | 0, nowMs);
}
