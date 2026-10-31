// Druid rotation post-pass and kit policy. Pure. The form button selects that form's kit via formId
// gates. Recovery holds NO form rows: a recast toggle there read as "jump into form when low".

import type { SpellDef } from '../../../data/schema.ts';
import { inferRole } from '../../../engine/combat.ts';
import type { ClassRotationHooks } from './hooks.ts';
import {
  gateSupportDamageOnTopped,
  gateSupportDamageRows,
  hoistSupportHealsIntoCombat,
} from './supportSpec.ts';

function isFeralSpecName(spec: string): boolean {
  const s = spec.toLowerCase();
  return s === 'feral' || s === 'feral combat' || s.startsWith('feral')
    || s === 'feral tank' || s === 'feraltank' || s === 'guardian' || s === 'bear';
}

// Form-kit vs caster-kit filter for role-bucket FALLBACK damage roles. Authored pack rules still win; this
// only filters the unlisted tail.
function allowDruidFallbackSpell(spell: SpellDef, spec: string): boolean {
  const role = spell.role ?? inferRole(spell);

  if (isFeralSpecName(spec)) {
    // Cat/Bear kit: energy/rage spenders, physical strikes, named feral tools.
    if (spell.powerType === 'energy' || spell.powerType === 'rage') return true;
    if (spell.school === 'physical') return true;
    if (/feral|faerie fire \(feral\)/i.test(spell.name)) return true;
    // Skip mana caster nukes/DoTs (Moonfire/Starfire/Wrath/Insect Swarm/…) as ALWAYS fillers.
    return false;
  }
  // Balance / Restoration: mana caster kit — no cat/bear energy-rage mash.
  if (spell.powerType === 'energy' || spell.powerType === 'rage') return false;
  const school = spell.school;
  if (school === 'physical' && (role === 'strike' || role === 'instant_nuke')) return false;
  // Druid caster schools (Wrath/Moonfire nature; Starfire arcane) + nature control (roots/hibernate).
  // Cite: Spell.dbc School; nature/arcane are the Balance kit.
  if (school === 'nature' || school === 'arcane') return true;
  // Unknown schools drop (holy/fire/frost/shadow/physical non-strikes).
  return false;
}

export const druidHooks: ClassRotationHooks = {
  allowFormFallback(spec) {
    // Form enter: only on form-using specs (Feral druids).
    return isFeralSpecName(spec);
  },
  allowFallbackSpell(spell, spec) {
    return allowDruidFallbackSpell(spell, spec);
  },
  afterFallback(ctx) {
    if (/^restoration$/i.test(ctx.spec)) {
      hoistSupportHealsIntoCombat(ctx);
      gateSupportDamageOnTopped(ctx);
      gateSupportDamageRows(ctx);
    }
  },
};
