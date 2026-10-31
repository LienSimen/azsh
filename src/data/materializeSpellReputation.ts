// Materialize SPELL_EFFECT_REPUTATION (103) onto bake rows the ETL mapper never emitted — 56 spells,
// 55 of them hollow. amount = bp + baseDice, faction = EffectMiscValue. Cite: SpellEffects.cpp:4908.

import type { SpellDef } from './schema.ts';

const SPELL_EFFECT_REPUTATION = 103;

/** Stamp missing effect-103 reputation grants onto spell.effects. Idempotent. */
export function materializeSpellReputation(spell: SpellDef): void {
  const raw = spell.rawEffects;
  if (!raw?.length) return;
  const slots = raw.filter((r) => (r.effect | 0) === SPELL_EFFECT_REPUTATION);
  if (!slots.length) return;
  if (!spell.effects) spell.effects = [];
  for (const r of slots) {
    const factionId = r.miscValue | 0;
    // Cite: :4918-4921 !factionEntry return - an empty faction id has no FactionStore row.
    if (!factionId) continue;
    const amount = (r.basePoints | 0) + Math.max(r.baseDice | 0, 0);
    if (!amount) continue;
    // One row per faction: the 7 two-slot spells (Armorsmithing, the +500 goblin turn-ins)
    // pair a gain with a rival loss, never two rows on the same faction.
    if (spell.effects.some((e) => e.kind === 'reputation' && e.factionId === factionId)) continue;
    spell.effects.push({ kind: 'reputation', factionId, amount });
  }
}
