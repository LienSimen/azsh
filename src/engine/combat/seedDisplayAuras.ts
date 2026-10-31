// Seed the out-of-combat display auras into a live fight at t=0. Sheet-baked mods are display-only so
// expiry cannot reverse them, while combat-only mods are seeded as real reversible rows.

import type { ActiveEffect, Fighter } from './types.ts';
import { applyBuffMod } from './fighterFactory.ts';
import { applyImmunityAura, AURA_TYPE, type ImmunityAura } from '../spells/immunity.ts';
import { auraStackIdentity, type AuraStackIdentity, type StackSpell } from '../spells/auraStacking.ts';

/** Multirank identity on a seeded row, so a mid-fight recast of the sibling can strip it. */
function stackFieldsOf(sp: StackSpell | undefined): { stackIdent?: AuraStackIdentity } {
  const id = auraStackIdentity(sp);
  return id ? { stackIdent: id } : {};
}

/** Mods already folded into CombatantSpec at buildCombatant time (do not re-apply / reverse). */
export const SHEET_BAKED_BUFF_MODS = new Set([
  'strength', 'agility', 'stamina', 'intellect', 'spirit', 'all_stats', 'all_stats_pct',
  'strength_pct', 'agility_pct', 'stamina_pct', 'intellect_pct', 'spirit_pct',
  'armor', 'attack_power', 'attack_power_pct', 'mp5', 'spell_power',
  // effectiveArmor folds aura 142 into spec.armor via activeBaseArmorPctMult — re-applying it
  // on the display path would multiply the base bucket twice. Cite: characterStats baseArmorValue.
  'armor_base_pct',
  // characterRatings folds spell_damage_<school> into spellDamageBySchool (sheet-baked).
  // Missing here it would be applied a second time on the display-aura path.
  'spell_damage_holy', 'spell_damage_fire', 'spell_damage_nature',
  'spell_damage_frost', 'spell_damage_shadow', 'spell_damage_arcane',
  // domain maxHealth / maxMana already sum these from activeAuras (Flask of the Titans / Wisdom).
  'max_health', 'max_mana',
]);

export function seedDisplayAurasInto(f: Fighter, effects: ActiveEffect[]): void {
  for (const a of f.spec.startDisplayAuras ?? []) {
    if (f.buffActive.has(a.spellId)) continue; // already seeded via form / shield / etc.
    f.buffActive.add(a.spellId);
    const permanent = a.permanent || a.remainingMs == null || !(a.remainingMs > 0);
    const expiresAt = permanent ? Number.POSITIVE_INFINITY : a.remainingMs!;
    const charges = a.charges != null && a.charges > 0 ? a.charges : undefined;
    const chargeFields = {
      ...(charges != null ? { charges } : {}),
      ...((a.procFlags ?? 0) !== 0 ? { procFlags: a.procFlags } : {}),
    };
    // Prefer the already-resolved kit spell (knownUsableSpells → resolveCombatSpell).
    const kitSpell = (f.spec.spells ?? []).find((s) => s.id === a.spellId);
    // An empty-bake aura carries its resolved payload on the spec itself, so live mods and mechanic
    // immunities must become real combat state here rather than display-only chips.
    let seededLive = false;
    for (const lb of a.liveBuffs ?? []) {
      applyBuffMod(f, lb.mod, lb.amount, lb.school);
      effects.push({
        kind: 'buff',
        source: f.side,
        target: f.side,
        spellId: a.spellId,
        name: a.name,
        mod: lb.mod,
        amount: lb.amount,
        school: lb.school,
        expiresAt,
        ...chargeFields,
      });
      seededLive = true;
    }
    const mechImmunities = (a.mechanicImmunities ?? []).filter((m) => m > 0);
    if (mechImmunities.length > 0) {
      for (const mech of mechImmunities) {
        const aura: ImmunityAura = {
          spellId: a.spellId,
          auraType: AURA_TYPE.MECHANIC_IMMUNITY,
          mechanic: mech,
          positive: true,
          durationMs: permanent ? undefined : a.remainingMs,
          ...(charges != null ? { charges } : {}),
        };
        f.immunity = applyImmunityAura(f.immunity, aura, []).state;
      }
      // One mirror row per spell — removeImmunityAura keys on spellId.
      // Cite: SpellAuras.cpp:2936–2948; stepSession immunity expiry.
      effects.push({
        kind: 'immunity',
        source: f.side,
        target: f.side,
        spellId: a.spellId,
        name: a.name,
        expiresAt,
        ...chargeFields,
        immunityMechanics: mechImmunities,
      });
      seededLive = true;
    }
    // DISPEL_IMMUNITY (Stoneform poison; boost disease). Cite: SpellAuras.cpp:3053; KI-605.
    const dispelImmunities = (a.dispelImmunities ?? []).filter((d) => d > 0);
    if (dispelImmunities.length > 0) {
      for (const dispelType of dispelImmunities) {
        const aura: ImmunityAura = {
          spellId: a.spellId,
          auraType: AURA_TYPE.DISPEL_IMMUNITY,
          dispelType,
          positive: true,
          durationMs: permanent ? undefined : a.remainingMs,
        };
        f.immunity = applyImmunityAura(f.immunity, aura, []).state;
      }
      if (!seededLive) {
        // One mirror row per spell — removeImmunityAura keys on spellId.
        effects.push({
          kind: 'immunity',
          source: f.side,
          target: f.side,
          spellId: a.spellId,
          name: a.name,
          expiresAt,
          ...chargeFields,
        });
      }
      seededLive = true;
    }
    // liveBuffs already carry armor_pct (Stoneform) when buildCombatant stashed it.
    if (seededLive) continue;
    // A party area aura: rows carry the sheet-folded amount (no applyBuffMod), so a sibling rank or the
    // holder's remove arm reverses exactly what the sheet added. Cite: SpellAuras.cpp:591-620.
    if (a.sheetBuffs?.length) {
      for (const be of a.sheetBuffs) {
        effects.push({
          kind: 'buff',
          source: f.side,
          target: f.side,
          spellId: a.spellId,
          name: a.name,
          mod: be.mod,
          amount: be.amount,
          school: be.school,
          expiresAt,
          ...(a.exclusionGroup != null ? { exclusionGroup: a.exclusionGroup } : {}),
          ...(a.stackIdent ? { stackIdent: a.stackIdent } : {}),
          ...chargeFields,
        });
      }
      continue;
    }
    const combatBuffs = (kitSpell?.effects ?? []).filter(
      (e): e is Extract<typeof e, { kind: 'buff' }> =>
        e.kind === 'buff'
        && !e.hostile
        && (e.amount ?? 0) !== 0
        && !!e.mod
        && !SHEET_BAKED_BUFF_MODS.has(e.mod),
    );
    if (combatBuffs.length > 0) {
      for (const be of combatBuffs) {
        applyBuffMod(f, be.mod, be.amount, be.school);
        effects.push({
          kind: 'buff',
          source: f.side,
          target: f.side,
          spellId: a.spellId,
          name: a.name,
          mod: be.mod,
          amount: be.amount,
          school: be.school,
          expiresAt,
          exclusionGroup: kitSpell?.exclusionGroup,
          ...stackFieldsOf(kitSpell),
          ...chargeFields,
        });
      }
      continue;
    }
    // Inner Fire armor / Furious Howl AP: sheet already folded the mod. Keep amount so
    // reverseBuffMod on last charge subtracts it. Cite: SpellAuras.cpp DropAuraCharge.
    const sheetCharged = a.chargedSheetBuffs ?? [];
    if (sheetCharged.length > 0 && charges != null) {
      for (const be of sheetCharged) {
        effects.push({
          kind: 'buff',
          source: f.side,
          target: f.side,
          spellId: a.spellId,
          name: a.name,
          mod: be.mod,
          amount: be.amount,
          school: be.school,
          expiresAt,
          ...chargeFields,
        });
      }
      continue;
    }
    if (permanent) {
      // Until-cancelled display chip (stance / aspect): no effect row.
      continue;
    }
    effects.push({
      kind: 'buff',
      source: f.side,
      target: f.side,
      spellId: a.spellId,
      name: a.name,
      expiresAt,
      ...chargeFields,
      // No mod/amount — stats already in CombatantSpec; expiry must not reverse sheet AP.
    });
  }
}
