// Seed out-of-combat school-immunity auras into a live session. Cite: SPELL_AURA_SCHOOL_IMMUNITY;
// buildCombatant startSchoolImmunities; SpellAuras.cpp HandleAuraModSchoolImmunity.
import { AURA_TYPE } from '../spells/immunity.ts';
import type { Fighter } from './types.ts';

export type GrantImmunityAuraFn = (
  owner: Fighter,
  aura: {
    spellId: number;
    auraType: number;
    schoolMask?: number;
    spellMechanic?: number;
    positive?: boolean;
    immunityPurgesEffect?: boolean;
    durationMs?: number;
  },
  expiresAt: number,
  name: string,
  source: Fighter['side'],
) => void;

/** Grant every startSchoolImmunities row on the fighter. Call after installCrowdControl. */
export function seedFighterSchoolImmunities(
  f: Fighter,
  grant: GrantImmunityAuraFn,
): void {
  for (const imm of f.spec.startSchoolImmunities ?? []) {
    if (imm.remainingMs <= 0) continue;
    grant(
      f,
      {
        spellId: imm.spellId,
        auraType: AURA_TYPE.SCHOOL_IMMUNITY,
        schoolMask: imm.schoolMask | 0,
        spellMechanic: imm.mechanic || undefined,
        positive: imm.positive !== false,
        immunityPurgesEffect: true,
        durationMs: imm.remainingMs,
      },
      imm.remainingMs,
      imm.name,
      f.side,
    );
  }
}
