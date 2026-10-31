// Pet APPLY_AREA_AURA_PARTY bookkeeping (Blood Pact / Furious Howl).
// Mirrors totemAuras.ts: when the caster (pet) dies or unsummons, party copies drop.

import type { ActiveEffect, Fighter } from './types.ts';
import type { CombatEvent, Side } from '../core/events.ts';
import { reverseBuffMod } from './fighterFactory.ts';
import { spellFromKit } from './kitById.ts';

// Spell ids on the pet kit that are APPLY_AREA_AURA_PARTY (baked applyTo:'party'). Cite:
// SpellEffectDefines.h SPELL_EFFECT_APPLY_AREA_AURA_PARTY = 35.
export function petPartyAuraIdsFromKit(pet: Fighter): Set<number> {
  const out = new Set<number>();
  for (const sp of pet.spec.spells ?? []) {
    if (sp.effects.some((e) => e.kind === 'buff' && e.applyTo === 'party' && !e.hostile)) {
      out.add(sp.id);
    }
  }
  return out;
}

// Strip the party area auras the pet granted, and the sheet-baked permanent chips. Combat may hold live
// mod rows or only the buff flag, so both are cleared; the count returned may be 0 for the latter.
export function stripPetPartyAreaAuras(args: {
  effects: ActiveEffect[];
  pet: Fighter;
  t: number;
  bySide: (s: Side) => Fighter;
  push: (e: CombatEvent) => void;
  /** Extra sides that may hold a party copy (owner + allies). Pet self is included via bySide. */
  recipients: Side[];
}): number {
  const { effects, pet, t, bySide, push, recipients } = args;
  const partyIds = petPartyAuraIdsFromKit(pet);
  if (partyIds.size === 0) return 0;

  let removed = 0;
  // Targets where a live mod row was reversed (do not also reverse sheet amounts).
  const modReversed = new Set<string>();
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]!;
    // Only pet-sourced rows — player Battle Shout / PW:Fort stay. Cite: caster Guid on AreaAura.
    if (e.source !== 'pet') continue;
    if (!partyIds.has(e.spellId)) continue;
    if (e.kind === 'buff') {
      const owner = bySide(e.target);
      if (e.mod != null) {
        reverseBuffMod(owner, e.mod, e.amount ?? 0, e.school, {
          creatureTypeMask: e.creatureTypeMask,
          schoolMask: e.schoolMask,
        });
        modReversed.add(`${e.target}:${e.spellId}`);
        owner.buffActive.delete(e.spellId);
        push({ t, kind: 'aura', actor: e.target, name: e.name, applied: false });
      }
      // Display-only / no-mod trackers: leave buffActive for sheet reverse below.
    } else {
      const owner = bySide(e.target);
      owner.buffActive.delete(e.spellId);
    }
    effects.splice(i, 1);
    removed++;
  }

  // Sheet-baked permanent chips: maxHealth already includes stamina; no combat mod row (or only a no-mod
  // refresh tracker). Reverse via spell amount once. Cite: KI-436 startDisplayAuras; KI-066 dismiss/death.
  for (const side of recipients) {
    const unit = bySide(side);
    for (const spellId of partyIds) {
      if (modReversed.has(`${side}:${spellId}`)) continue;
      if (!unit.buffActive.has(spellId)) continue;
      const sp = spellFromKit(pet.spec.spells, spellId);
      if (sp) {
        for (const eff of sp.effects) {
          if (eff.kind === 'buff' && eff.applyTo === 'party' && !eff.hostile && eff.mod) {
            reverseBuffMod(unit, eff.mod, eff.amount, eff.school);
          }
        }
      }
      unit.buffActive.delete(spellId);
      const name = sp?.name ?? 'Blood Pact';
      push({ t, kind: 'aura', actor: side, name, applied: false });
    }
  }

  return removed;
}
