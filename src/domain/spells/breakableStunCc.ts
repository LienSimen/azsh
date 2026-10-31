// MOD_STUN to the Phonecraft CC surface. CMaNGOS uses aura 12 for hard stuns AND for sleep, shackle,
// sap and banish, so the Mechanic and AuraInterruptFlags decide the real behaviour.

import type { ControlKind, Mechanic, School, SpellDef, SpellEffect } from '../../data/schema.ts';
import { CREATURE_TYPE } from '../../data/schema.ts';

/** SharedDefines.h Mechanics (1-based). */
export const MECHANIC_SLEEP = 10;
export const MECHANIC_STUN = 12;
export const MECHANIC_FREEZE = 13;
export const MECHANIC_KNOCKOUT = 14;
export const MECHANIC_BANISH = 18;
export const MECHANIC_SHACKLE = 20;
export const MECHANIC_SAPPED = 30;

// Resolve the spell-level mechanic id for a MOD_STUN slot: the raw mechanic wins, with the DBC name
// and tooltip as the fallback for extracts that lost the column.
export function resolveModStunMechanicId(
  spell: Pick<SpellDef, 'name' | 'description'>,
  rawMechanic: number,
): number {
  const fromRaw = rawMechanic | 0;
  if (fromRaw > 0) return fromRaw;

  const name = (spell.name || '').toLowerCase();
  // Exact DBC English names (Sleep ranks, Hibernate ranks, Shackle Undead ranks).
  if (name === 'sleep' || name === 'hibernate' || name.startsWith('zzoldsleep')) {
    return MECHANIC_SLEEP;
  }
  if (name === 'shackle undead') return MECHANIC_SHACKLE;

  // Creature-cast sleeps sometimes use unique names; tooltip still says awaken.
  const desc = (spell.description || '').toLowerCase();
  if (desc.includes('awaken') && (desc.includes('to sleep') || desc.includes('puts') && desc.includes('sleep'))) {
    return MECHANIC_SLEEP;
  }
  if (desc.includes('shackle') && desc.includes('undead')) return MECHANIC_SHACKLE;

  return 0;
}

export interface ModStunCcShape {
  control: ControlKind;
  mechanic: Mechanic;
  breakOnDamage?: boolean;
  onlyTypes?: number[];
}

// Map a mechanic id to the engine CC shape for MOD_STUN. A hard stun stays control plus mechanic with
// no break-on-damage. Sap and Gouge share knockout with bombs, so the name separates them.
export function modStunCcShape(mechanicId: number, spellName?: string): ModStunCcShape {
  const name = (spellName || '').toLowerCase();
  // Sap / Gouge: classic stores MECHANIC_KNOCKOUT (14); play surface is incap+sap.
  // Cite: SpellMgr.h MECHANIC_KNOCKOUT Includes Sap, Gouge; enrich-stealth.mjs.
  if (name === 'sap' || name === 'gouge') {
    return { control: 'incapacitate', mechanic: 'sap', breakOnDamage: true };
  }

  switch (mechanicId | 0) {
    case MECHANIC_SLEEP:
      // Sleep / Hibernate: break-on-damage incapacitate. DR track = sleep.
      // Cite: SpellMgr.h MECHANIC_SLEEP; tooltip "Any damage caused will awaken".
      return { control: 'incapacitate', mechanic: 'sleep', breakOnDamage: true };
    case MECHANIC_SHACKLE:
      // Shackle Undead: break-on-damage incap, undead only. The mechanic is SHACKLE, not sleep, so
      // Will of the Forsaken must not purge it. Cite: SharedDefines MECHANIC_SHACKLE=20.
      return {
        control: 'incapacitate',
        mechanic: 'shackle',
        breakOnDamage: true,
        onlyTypes: [CREATURE_TYPE.UNDEAD],
      };
    case MECHANIC_SAPPED:
      return { control: 'incapacitate', mechanic: 'sap', breakOnDamage: true };
    case MECHANIC_KNOCKOUT:
      // Bombs, Gouge and Sap share knockout. Without a Sap or Gouge name above, keep break-on-damage
      // with the real mechanic id rather than collapsing it to a stun.
      return { control: 'stun', mechanic: 'knockout', breakOnDamage: true };
    case MECHANIC_BANISH:
      // Banish isolation rides mechanic banish; control stays stun-like lockout.
      // Cite: SpellAuras.cpp ~3025 MECHANIC_BANISH → UNIT_STAT_ISOLATED.
      return { control: 'stun', mechanic: 'banish' };
    case MECHANIC_FREEZE:
      // Freezing Trap Effect: MOD_STUN + damage break. Cite: spell_template 3355 AIF=2.
      return { control: 'stun', mechanic: 'freeze', breakOnDamage: true };
    default:
      // MECHANIC_STUN (12) or 0 / unknown → hard stun.
      return { control: 'stun', mechanic: 'stun' };
  }
}

// AURA_INTERRUPT_FLAG_DAMAGE — any damage removes the aura. The dump has 0 on every row, so the live
// source is Spell.dbc field 18. Cite: SpellDefines.h:362–386; Unit.cpp DealDamage.
export const AURA_INTERRUPT_FLAG_DAMAGE = 0x2;

/** Build a cc SpellEffect for a MOD_STUN slot. */
export function buildModStunCcEffect(
  mechanicId: number,
  durationMs: number,
  school: School,
  spellName?: string,
  /** Spell.dbc AuraInterruptFlags (or 0). When DAMAGE is set, stamp breakOnDamage. */
  auraInterruptFlags = 0,
): SpellEffect {
  const shape = modStunCcShape(mechanicId, spellName);
  const eff: SpellEffect = {
    kind: 'cc',
    control: shape.control,
    mechanic: shape.mechanic,
    durationMs,
    school,
  };
  // Mechanic-driven break (sleep/knockout/freeze) OR DBC AIF_DAMAGE (Tidal Charm, bombs, Encage).
  // Hammer of Justice has AIF=0 so stays hard. Cite: Spell.dbc field 18; census dimension I.
  if (shape.breakOnDamage || ((auraInterruptFlags | 0) & AURA_INTERRUPT_FLAG_DAMAGE) !== 0) {
    (eff as { breakOnDamage?: boolean }).breakOnDamage = true;
  }
  if (shape.onlyTypes) (eff as { onlyTypes?: number[] }).onlyTypes = shape.onlyTypes;
  return eff;
}

/** SPELL_AURA_MOD_CONFUSE — SetConfused, never SetStunned. Cite: SpellAuras.cpp:2354–2366. */
const SPELL_AURA_MOD_CONFUSE = 5;

// In-place retag of a MOD_CONFUSE disorient the bake surfaced as a hard stun: Blind and Scatter Shot
// read as stuns that no damage ended. Gated on an actual aura-5 slot, so a real stun cannot be caught.
export function retagDisorientOnSpell(spell: SpellDef): boolean {
  if (!spell.effects?.length) return false;
  if (!spell.rawEffects?.some((r) => (r.auraName | 0) === SPELL_AURA_MOD_CONFUSE)) return false;
  let changed = false;
  for (const e of spell.effects) {
    if (e.kind !== 'cc' || e.mechanic !== 'disoriented') continue;
    if (e.control === 'incapacitate' && e.breakOnDamage === true) continue;
    (e as { control: ControlKind }).control = 'incapacitate';
    (e as { breakOnDamage?: boolean }).breakOnDamage = true;
    changed = true;
  }
  return changed;
}

// In-place retag of bake-surface hard-stun CC that is really sleep, shackle or hibernate, for repros
// and kits that read bake effects before resolve. Real stuns are untouched.
export function retagBreakableStunOnSpell(spell: SpellDef): boolean {
  if (!spell.effects?.length) return false;
  const mechId = resolveModStunMechanicId(spell, 0);
  if (!mechId || mechId === MECHANIC_STUN) return false;
  // Only retag when the slot still looks like generic MOD_STUN hard stun.
  let changed = false;
  for (let i = 0; i < spell.effects.length; i++) {
    const e = spell.effects[i]!;
    if (e.kind !== 'cc') continue;
    if (e.control !== 'stun' || e.mechanic !== 'stun') continue;
    const next = buildModStunCcEffect(mechId, e.durationMs, e.school, spell.name);
    spell.effects[i] = next;
    changed = true;
  }
  // Also stamp raw.mechanic so later SI paths see the sourced id without name fallback.
  if (changed && spell.rawEffects) {
    for (const raw of spell.rawEffects) {
      if ((raw.auraName | 0) === 12 && (raw.mechanic | 0) === 0) {
        raw.mechanic = mechId;
      }
    }
  }
  return changed;
}
