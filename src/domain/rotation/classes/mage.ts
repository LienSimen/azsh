// PURE: no DOM/RNG/Date. Mage rotation post-pass + kit policy.

import type { SpellDef } from '../../../data/schema.ts';
import { normalizeSpellName } from '../rotationSuggestions.ts';
import {
  isMultiTargetCombatSpell,
  isNovaKiteSpell,
  novaKiteConditions,
  NOVA_KITE_STEP_BACK_YD,
} from '../classify.ts';
import type { ClassRotationHooks } from './hooks.ts';

/** Canonical tree → combat damage schools allowed in role-bucket fallback. */
const MAGE_FALLBACK_SCHOOLS: Readonly<Record<string, ReadonlySet<string>>> = {
  Frost: new Set(['frost']),
  Fire: new Set(['fire']),
  Arcane: new Set(['arcane']),
};

function schoolAllowed(spell: SpellDef, spec: string): boolean {
  const allowed = MAGE_FALLBACK_SCHOOLS[spec];
  if (!allowed) return true;
  // Multi-target / channeled AoE is available cross-spec and self-gates on enemyCount>=2.
  if (isMultiTargetCombatSpell(spell)) return true;
  const school = (spell.school ?? '').toLowerCase();
  if (allowed.has(school)) return true;
  return false;
}

export const mageHooks: ClassRotationHooks = {
  allowFallbackSpell(spell, spec) {
    return schoolAllowed(spell, spec);
  },
  afterFallback(ctx) {
    let nova: (typeof ctx.known)[number] | undefined;
    for (let i = ctx.known.length - 1; i >= 0; i--) {
      if (isNovaKiteSpell(ctx.known[i]!)) { nova = ctx.known[i]; break; }
    }
    if (nova && !ctx.phases.combat.some((r) => r.action.kind === 'spell' && r.action.spellId === nova.id)) {
      ctx.phases.combat.unshift({
        id: ctx.nextFallbackId(),
        action: { kind: 'spell', spellId: nova.id },
        conditions: novaKiteConditions(nova),
        enabled: true,
        after: { stepBackYd: NOVA_KITE_STEP_BACK_YD },
      });
    }
    // Presence of Mind is a one-shot next-cast talent, never a buffPresent keep-up. When an
    // authored pull blocked injection, still expose it as a bare when-ready pull tool.
    const pom = ctx.known.find((s) => normalizeSpellName(s.name) === 'presence of mind');
    if (pom && !ctx.phases.pull.some((r) => r.action.kind === 'spell' && r.action.spellId === pom.id)) {
      ctx.phases.pull.push({
        id: ctx.nextFallbackId(),
        action: { kind: 'spell', spellId: pom.id },
        conditions: [], // CD-gated at session; not buffPresent (never clears)
        enabled: true,
      });
    }

    // Frost: the school nuke before cross-school instant fillers, since role buckets put
    // instant_nuke first and starve Frostbolt. Only the two fillers swap — gated rows stay put.
    if (ctx.spec === 'Frost') {
      type Rule = (typeof ctx.phases.combat)[number];
      const spellIdOf = (r: Rule): number | null =>
        r.action.kind === 'spell' ? r.action.spellId : null;
      const schoolOf = (id: number) => (ctx.knownById.get(id)?.school ?? '').toLowerCase();
      const isFrostCombat = (r: Rule) => {
        const id = spellIdOf(r);
        return id != null && schoolOf(id) === 'frost';
      };
      const isFireInstantFiller = (r: Rule) => {
        const id = spellIdOf(r);
        if (id == null) return false;
        const s = ctx.knownById.get(id);
        if (!s) return false;
        const name = normalizeSpellName(s.name);
        const castMs = s.castTimeMs ?? 0;
        return (s.school ?? '').toLowerCase() === 'fire' && (name === 'fire blast' || castMs === 0);
      };
      const ungated = (r: Rule) => r.enabled !== false && r.conditions.length === 0;
      // The primary cast: the first ungated frost rule that actually has a cast time. The
      // instants (Ice Block / Frost Nova / Ice Barrier) are frost too and are not the nuke.
      const combat = ctx.phases.combat;
      const nukeIdx = combat.findIndex((r) => {
        if (!ungated(r) || !isFrostCombat(r)) return false;
        const id = spellIdOf(r);
        return id != null && (ctx.knownById.get(id)?.castTimeMs ?? 0) > 0;
      });
      if (nukeIdx > 0) {
        const above = combat.slice(0, nukeIdx).filter((r) => ungated(r) && isFireInstantFiller(r));
        if (above.length) {
          const kept = combat.filter((r) => !above.includes(r));
          const at = kept.indexOf(combat[nukeIdx]!) + 1;
          ctx.phases.combat = [...kept.slice(0, at), ...above, ...kept.slice(at)];
        }
      }
    }
  },
};
