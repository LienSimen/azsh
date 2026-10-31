// SPELL_EFFECT_SUMMON_OBJECT_WILD places temporary world gameobjects from a cast. There is no full map
// spawner here, so the play surface is the session's wild-summon list for the spell's duration.

import type { SpellDef, SpellEffect } from '../../data/schema.ts';

/** One wild GO currently present from a successful cast. */
export interface WildSummonedObject {
  /** gameobject_template.entry (EffectMiscValue). */
  goEntry: number;
  /** Spell that summoned it (SetSpellId). */
  spellId: number;
  // Wall-clock ms when the GO despawns. `0` means no timed despawn (C++ RespawnTime 0 when m_duration ≤ 0).
  expiresAtMs: number;
}

/** Collect place-GO payloads from resolved combat/OOC effects. */
export function collectSummonObjectWild(
  effects: readonly SpellEffect[],
  spellId: number,
  nowMs: number,
): WildSummonedObject[] {
  const out: WildSummonedObject[] = [];
  for (const e of effects) {
    if (e.kind !== 'summon_object_wild') continue;
    const goEntry = e.goEntry | 0;
    if (goEntry <= 0) continue;
    const durationMs = e.durationMs | 0;
    out.push({
      goEntry,
      spellId: spellId | 0,
      expiresAtMs: durationMs > 0 ? nowMs + durationMs : 0,
    });
  }
  return out;
}

/** Drop expired rows (timed only); keep untimed (expiresAtMs 0). */
export function pruneWildSummoned(
  list: readonly WildSummonedObject[] | undefined,
  nowMs: number,
): WildSummonedObject[] {
  if (!list?.length) return [];
  return list.filter((w) => w.expiresAtMs === 0 || w.expiresAtMs > nowMs);
}

/** Append new summons after pruning expired. Same goEntry may stack (wild has no slot). */
export function mergeWildSummoned(
  existing: readonly WildSummonedObject[] | undefined,
  added: readonly WildSummonedObject[],
  nowMs: number,
): WildSummonedObject[] {
  const kept = pruneWildSummoned(existing, nowMs);
  if (!added.length) return kept;
  return [...kept, ...added];
}

/** Active goEntry list for world listing / interact presence. */
function activeWildGoEntries(
  list: readonly WildSummonedObject[] | undefined,
  nowMs: number,
): number[] {
  return pruneWildSummoned(list, nowMs).map((w) => w.goEntry);
}

// Resolve a spell's place-GO effects (SI5). Empty when the spell has no effect 76 materialize (or empty
// miscValue early-out).
export function collectSummonObjectWildFromSpell(
  spell: SpellDef | null | undefined,
  nowMs: number,
): WildSummonedObject[] {
  if (!spell?.effects?.length) return [];
  return collectSummonObjectWild(spell.effects, spell.id | 0, nowMs);
}
