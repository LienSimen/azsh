// Paladin kit materialization at the play surface: the intents that never became combat effects
// (Blessing of Sacrifice, Concentration Aura) and the scripted Blessing of Light ranks.

import type { SpellDef, SpellEffect } from '../../../data/schema.ts';
import type { InterpretResult } from './types.ts';
import { effectAmountRange } from './amount.ts';
import { durMs as durFromIndex } from './duration.ts';

/** SPELLFAMILY_PALADIN. Cite: DBCEnums.h SPELLFAMILY_PALADIN = 10. */
export const SPELLFAMILY_PALADIN = 10;

// The Blessing of Light family flag, shared with the other blessings. Rank-generic detection also
// uses the name. Cite: game-data spellFamilyFlags on 19977-19979 and 25890.
const BLESSING_FAMILY_FLAG = 0x10000000;

// The Holy Light and Flash of Light family flags for the Blessing of Light benefit. The C++ filters
// through spell_affect, which the bake has none of, so the kit rows' own flags are used.
export const HOLY_LIGHT_FAMILY_FLAGS = 0x80000000;
export const FLASH_OF_LIGHT_FAMILY_FLAGS = 0x40000000;

function isBlessingOfLight(spell: SpellDef): boolean {
  const name = spell.name ?? '';
  if (!/Blessing of Light/i.test(name)) return false;
  // Paladin family + blessing flag, or Greater BoL (same dummy dual-slot shape).
  if (((spell.spellFamilyName ?? 0) | 0) !== SPELLFAMILY_PALADIN) return false;
  const flags = Number(spell.spellFamilyFlags) || 0;
  return (flags & BLESSING_FAMILY_FLAG) === BLESSING_FAMILY_FLAG || /Greater Blessing of Light/i.test(name);
}

/** Materialize play-surface effects for remaining paladin kit + shared intents. */
export function materializePaladinKitEffects(
  spell: SpellDef,
  result: InterpretResult,
  effectsIn: SpellEffect[],
): SpellEffect[] {
  let effects = effectsIn.slice();
  const intents = result.intents ?? [];

  // ── Intent → effect bridges (SI3 intents-only auras) ─────────────────────
  for (const intent of intents) {
    if (intent.kind === 'split_damage_flat') {
      // Cite: Unit.cpp:2501–2537 flat split min(remaining, amount) to linked caster.
      if (!effects.some((e) => e.kind === 'split_damage_flat')) {
        effects.push({
          kind: 'split_damage_flat',
          amount: intent.amount,
          schoolMask: intent.schoolMask,
          durationMs: intent.durationMs,
        });
      }
    } else if (intent.kind === 'resist_pushback') {
      // Cite: Spell.cpp:6817–6820 resistChance += GetTotalAuraModifier(149) − 100.
      if (!effects.some((e) => e.kind === 'resist_pushback')) {
        // Concentration Aura is APPLY_AREA_AURA_PARTY (effect 35) → party applyTo.
        // Cite: SpellEffects EffectApplyAreaAura; game-data 19746 effect 35.
        const isParty = (spell.rawEffects ?? []).some((r) => (r.effect | 0) === 35);
        effects.push({
          kind: 'resist_pushback',
          amount: intent.amount,
          durationMs: intent.durationMs,
          ...(isParty ? { applyTo: 'party' as const } : {}),
        });
      }
    }
  }

  // ── Blessing of Light: dual DUMMY → scripted heal bonuses ────────────────
  // Cite: Paladin.cpp BlessingOfLight; rawEffects aura 4 ×2 basePoints.
  if (isBlessingOfLight(spell) && !effects.some((e) => e.kind === 'blessing_of_light')) {
    const dummies = (spell.rawEffects ?? []).filter(
      (r) => (r.effect | 0) === 6 && (r.auraName | 0) === 4,
    );
    if (dummies.length >= 2) {
      const hl = effectAmountRange(dummies[0]!, {}).min;
      const fol = effectAmountRange(dummies[1]!, {}).min;
      const durationMs = durFromIndex(spell.durationIndex) ?? 300_000;
      // Greater BoL targetA 61 (party); regular targetA 21 (single friend).
      // Combat routes via applyTo when set; friendly default uses lowest-HP ally path.
      const tgtA = dummies[0]!.targetA | 0;
      const applyTo =
        tgtA === 61 || (spell.rawEffects ?? []).some((r) => (r.effect | 0) === 35)
          ? ('party' as const)
          : ('friendly' as const);
      effects.push({
        kind: 'blessing_of_light',
        holyLight: hl,
        flashOfLight: fol,
        durationMs,
        applyTo,
      });
    }
  }

  return effects;
}
