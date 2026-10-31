// Restore the form and stance attribute bits missing from the bake: the not-shapeshift attribute, the
// allow-while-not-shapeshifted bit, and ManaCostPercentage, which is not form-only.

import type { SpellDef } from '../../../data/schema.ts';
import formAttrsJson from './form-attrs.json' with { type: 'json' };

export interface FormAttrPatch {
  notShapeshift?: true;
  allowWhileNotShapeshifted?: true;
  /** ManaCostPercentage — base-mana (or create-health) share, not a talent cost mod. */
  costPct?: number;
}

/** id → sparse patch. Only keys that add missing SI5 fields. */
const FORM_ATTRS = formAttrsJson as Record<string, FormAttrPatch>;
// A numeric index, built once: the lookup runs per cast per unit, and the string key allocated a fresh
// string each time — 2.2% of a 40-unit tick profile for a table that never changes.
const FORM_ATTRS_BY_ID = new Map<number, FormAttrPatch>();
for (const k of Object.keys(FORM_ATTRS)) FORM_ATTRS_BY_ID.set(Number(k), FORM_ATTRS[k]!);

export function formAttrPatch(spellId: number): FormAttrPatch | null {
  return FORM_ATTRS_BY_ID.get(spellId | 0) ?? null;
}

// Player spells with a health power type and a mana cost percentage. Only Bloodrage has both in 1.12.
// Cite: classic-db spell_template 2687; Spell.cpp CalculatePowerCost :6339-6340.
const HEALTH_COST_PCT: Readonly<Record<number, number>> = {
  2687: 20, // Bloodrage
};
// Merge the ClassicDB form attributes onto a spell; baked fields win. The flat cost is NEVER overwritten
// with the percentage — a zero flat cost is not free when costPct is set.
export function applyFormAttrPatch(spell: SpellDef): SpellDef {
  const patch = formAttrPatch(spell.id);
  const healthPct = HEALTH_COST_PCT[spell.id | 0];
  if (!patch && healthPct == null) return spell;

  let changed = false;
  const out: SpellDef = { ...spell };

  if (patch?.notShapeshift && !out.notShapeshift) {
    out.notShapeshift = true;
    changed = true;
  }
  if (patch?.allowWhileNotShapeshifted && !out.allowWhileNotShapeshifted) {
    out.allowWhileNotShapeshifted = true;
    changed = true;
  }
  // Stamp costPct whenever it is missing, without requiring a zero flat cost: Bone Armor 16431 carries
  // both. Never write the percentage into `cost`. Cite: Spell.cpp:6331-6344.
  if (
    patch
    && patch.costPct != null
    && patch.costPct > 0
    && !(out.costPct && out.costPct > 0)
  ) {
    out.costPct = patch.costPct;
    changed = true;
  }
  // A health power cost is a percentage of create health, not mana. The bake maps that power type to
  // mana, so it is restored at resolve time, preferring the form-attrs percentage.
  if (healthPct != null && healthPct > 0) {
    const pct = (patch?.costPct != null && patch.costPct > 0) ? patch.costPct : healthPct;
    if (out.powerType !== 'health') {
      out.powerType = 'health';
      changed = true;
    }
    if (!(out.costPct && out.costPct > 0)) {
      out.costPct = pct;
      changed = true;
    }
  }

  return changed ? out : spell;
}

// In-place bake hydrate: stamp the form attributes onto a store-owned SpellDef, skipping fields already
// set, so a lookup sees ManaCostPercentage without a full re-bake.
export function hydrateSpellFormAttrs(spell: SpellDef): SpellDef {
  const patched = applyFormAttrPatch(spell);
  if (patched === spell) return spell;
  if (patched.notShapeshift) spell.notShapeshift = true;
  if (patched.allowWhileNotShapeshifted) spell.allowWhileNotShapeshifted = true;
  if (
    patched.costPct != null
    && patched.costPct > 0
    && !(spell.costPct && spell.costPct > 0)
  ) {
    spell.costPct = patched.costPct;
  }
  // POWER_HEALTH restore (Bloodrage) — applyFormAttrPatch may have flipped powerType.
  if (patched.powerType === 'health' && spell.powerType !== 'health') {
    spell.powerType = 'health';
  }
  return spell;
}
