// Auto-combat setup spell picker: group and sort known usable spells so the add-ability panel stays
// scannable, with Common and Situational buckets in the model. Pure, reusing rotation/classify.

import type { SpellDef } from '../../data/schema.ts';
import { inferRole } from '../../engine/combat.ts';
import {
  isInterruptSpell,
  isSelfDefensiveSpell,
  isThreatOrTauntUtility,
  isDispelSpell,
  isMultiTargetCombatSpell,
} from './classify.ts';

/** Picker section: everyday rotation fuel vs situational / long-CD tools. */
export type SpellPickerBucket = 'common' | 'situational';

export const SPELL_PICKER_BUCKET_ORDER: readonly SpellPickerBucket[] = ['common', 'situational'];

export const SPELL_PICKER_BUCKET_LABEL: Record<SpellPickerBucket, string> = {
  common: 'Common',
  situational: 'Situational & cooldowns',
};

// Classify a castable for the add-ability panel: Common is high-frequency fillers, keep-ups and
// forms; Situational is long cooldowns, CC, interrupts, taunts, defensives and pet utility.
export function spellPickerBucket(s: SpellDef): SpellPickerBucket {
  if (isInterruptSpell(s) || isSelfDefensiveSpell(s) || isThreatOrTauntUtility(s) || isDispelSpell(s)) {
    return 'situational';
  }
  const role = s.role ?? inferRole(s);
  if (
    role === 'control'
    || role === 'stealth'
    || role === 'pet_summon'
    || role === 'pet_tame'
    || role === 'pet_heal'
  ) {
    return 'situational';
  }
  // Long cooldowns (Bloodlust-family, PoM, Recklessness, Bestial Wrath, …).
  if ((s.cooldownMs ?? 0) >= 45_000) return 'situational';
  // Short self-buff CDs still feel "special" when > GCD economy (Adrenaline, Blade Flurry).
  if (role === 'buff' && (s.cooldownMs ?? 0) >= 20_000) return 'situational';
  if (s.effects?.some((e) => e.kind === 'next_cast_mod' || e.kind === 'reset_cooldowns')) {
    return 'situational';
  }
  return 'common';
}

/** Stable sort key inside a bucket: name, then lower id. */
export function compareSpellPickerEntries(a: SpellDef, b: SpellDef): number {
  const an = (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
  if (an !== 0) return an;
  return (a.id | 0) - (b.id | 0);
}

export interface SpellPickerEntry {
  spell: SpellDef;
  bucket: SpellPickerBucket;
  /** Value for the editor pick action (`s:<id>`). */
  value: string;
}

export interface ItemPickerEntry {
  entry: number;
  name: string;
  icon?: string;
  quality?: number;
  value: string;
}

// Build grouped picker rows from known usable spells. Optional `query` filters by name (case-insensitive
// substring).
export function buildSpellPickerEntries(
  spells: readonly SpellDef[],
  query = '',
): { common: SpellPickerEntry[]; situational: SpellPickerEntry[] } {
  const q = query.trim().toLowerCase();
  const common: SpellPickerEntry[] = [];
  const situational: SpellPickerEntry[] = [];
  for (const spell of spells) {
    if (q && !(spell.name ?? '').toLowerCase().includes(q)) continue;
    const bucket = spellPickerBucket(spell);
    const row: SpellPickerEntry = { spell, bucket, value: `s:${spell.id}` };
    if (bucket === 'common') common.push(row);
    else situational.push(row);
  }
  common.sort((a, b) => compareSpellPickerEntries(a.spell, b.spell));
  situational.sort((a, b) => compareSpellPickerEntries(a.spell, b.spell));
  return { common, situational };
}

// Soft priority hint for template chips when adding a spell. Used by the editor to surface freedom presets
// (CC casters, offtank peel, …).
export type SpellAddPreset =
  | 'default'
  | 'on_cast'       // enemy is casting (interrupt / sheep casters)
  | 'on_aggro'      // an enemy is on you (tank / peel)
  | 'off_target'    // your target is attacking someone else (taunt / offtank)
  | 'low_self_hp'   // your health is low
  | 'pack'          // 2+ living enemies
  | 'keep_up';      // not already on target/self (smart default path)

export interface SpellAddPresetDef {
  id: SpellAddPreset;
  label: string;
  /** Short title for the chip. */
  title: string;
}

/** Presets offered for a spell (always includes default). Ordered for the UI. */
export function spellAddPresetsFor(s: SpellDef): SpellAddPresetDef[] {
  const out: SpellAddPresetDef[] = [
    { id: 'default', label: 'Smart default', title: 'Smart default (recommended guard)' },
  ];
  const role = s.role ?? inferRole(s);
  if (isInterruptSpell(s) || role === 'control') {
    out.push({ id: 'on_cast', label: 'On cast', title: 'Only when the enemy is casting' });
  }
  if (isThreatOrTauntUtility(s) || role === 'control') {
    out.push({ id: 'off_target', label: 'Off me', title: 'Only when your target is attacking someone else' });
    out.push({ id: 'on_aggro', label: 'On me', title: 'Only when something is attacking you' });
  }
  if (isSelfDefensiveSpell(s) || role === 'buff') {
    out.push({ id: 'low_self_hp', label: 'Low HP', title: 'Only when your health is low' });
  }
  if (isMultiTargetCombatSpell(s) || role === 'control') {
    out.push({ id: 'pack', label: 'Pack', title: 'Only when 2+ living enemies' });
  }
  if (
    role === 'dot'
    || role === 'buff'
    || role === 'seal'
    || role === 'totem_summon'
    || s.effects?.some((e) => e.kind === 'dot' || e.kind === 'buff')
  ) {
    out.push({ id: 'keep_up', label: 'Keep up', title: 'Only when missing (refresh / reapply)' });
  }
  return out;
}
