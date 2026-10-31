// PURE: no DOM/RNG/Date. Priest rotation post-pass + kit policy.

import { SHAPESHIFT_FORM, type SpellDef } from '../../../data/schema.ts';
import { cond, isMultiTargetCombatSpell } from '../classify.ts';
import type { ClassRotationHooks, FinalizeContext } from './hooks.ts';
import { rebuildPhaseUsed } from './hooks.ts';
import { gateSupportDamageRows } from './supportSpec.ts';

/** Canonical tree → combat damage schools allowed in role-bucket fallback. */
const PRIEST_FALLBACK_SCHOOLS: Readonly<Record<string, ReadonlySet<string>>> = {
  Shadow: new Set(['shadow']),
  Holy: new Set(['holy']),
  Discipline: new Set(['holy']),
};

function schoolAllowed(spell: SpellDef, spec: string): boolean {
  const allowed = PRIEST_FALLBACK_SCHOOLS[spec];
  if (!allowed) return true;
  if (isMultiTargetCombatSpell(spell)) return true;
  const school = (spell.school ?? '').toLowerCase();
  if (allowed.has(school)) return true;
  return false;
}

function isHolyHealSpell(spell: SpellDef): boolean {
  if ((spell.school ?? '').toLowerCase() !== 'holy') return false;
  return spell.effects.some(
    (e) => e.kind === 'heal' || e.kind === 'restore_health' || e.kind === 'heal_max_health',
  );
}

// Shadowform forbids Holy, and recovery holy heals used to win the GCD or drop the form, so the
// priest died without a shadow spell. Gate holy heals on being out of form; keep PW:S and Fade.
function finalizeShadowRecovery(ctx: FinalizeContext): void {
  if (!/^shadow$/i.test(ctx.spec)) return;
  const sf = SHAPESHIFT_FORM.SHADOWFORM;
  ctx.phases.recovery = ctx.phases.recovery.map((r) => {
    if (r.action.kind !== 'spell') return r;
    const sp = ctx.knownById.get(r.action.spellId) ?? ctx.ds.spell(r.action.spellId);
    if (!sp || !isHolyHealSpell(sp)) return r;
    if (r.conditions.some((c) => c.metric === 'formId')) return r;
    return { ...r, conditions: [...r.conditions, cond('self', 'formId', '!=', sf)] };
  });
  const inject = (
    phase: 'recovery' | 'combat',
    spell: SpellDef | undefined,
    conditions: ReturnType<typeof cond>[],
  ): void => {
    if (!spell) return;
    if (ctx.phases[phase].some((r) => r.action.kind === 'spell' && r.action.spellId === spell.id)) {
      return;
    }
    ctx.phases[phase].unshift({
      id: ctx.nextFallbackId(),
      action: { kind: 'spell', spellId: spell.id },
      conditions,
      enabled: true,
    });
  };
  const pws = ctx.known.find((s) => /^power word: shield$/i.test(s.name));
  const fade = ctx.known.find((s) => /^fade$/i.test(s.name));
  const form = ctx.known.find((s) => /^shadowform$/i.test(s.name));
  inject('recovery', fade, [cond('self', 'hasAggro', '==', 1)]);
  if (pws) {
    inject('recovery', pws, [
      cond('self', 'healthPct', '<', 50),
      cond('self', 'buffPresent', '==', 0, pws.id),
    ]);
  }
  inject('combat', form, [cond('self', 'formId', '!=', sf)]);
  rebuildPhaseUsed(ctx, 'recovery');
  rebuildPhaseUsed(ctx, 'combat');
}

// Holy and Discipline both heal the party. Their lists ended Holy Fire -> SW:P -> Smite with no
// gate on any of them, which is the bar a 60 priest arrives at the last pull without.
function finalizeHealerDamage(ctx: FinalizeContext): void {
  if (!/^(holy|discipline)$/i.test(ctx.spec)) return;
  gateSupportDamageRows(ctx);
}

export const priestHooks: ClassRotationHooks = {
  allowFallbackSpell(spell, spec) {
    return schoolAllowed(spell, spec);
  },
  afterSuggestion(ctx) {
    finalizeShadowRecovery(ctx);
    finalizeHealerDamage(ctx);
  },
  afterFallback(ctx) {
    finalizeShadowRecovery(ctx);
    finalizeHealerDamage(ctx);
  },
};
