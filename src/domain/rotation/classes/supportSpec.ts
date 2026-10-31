// PURE: no DOM/RNG/Date. The healing-tree post-pass, shared by all four healer trees. Resto druid
// and resto shaman each held a copy; priest Holy/Discipline and paladin Holy held neither.

import type { SpellDef } from '../../../data/schema.ts';
import { inferRole } from '../../../engine/combat.ts';
import { cond } from '../classify.ts';
import type { Condition, RotationPhase, RotationRule } from '../types.ts';
import type { FinalizeContext } from './hooks.ts';
import { rebuildPhaseUsed } from './hooks.ts';

/** Party health above which a healer may spend the GCD on damage at all. */
const TOPPED_PCT = 90;

/** Roles a healer pays mana for damage with. `shoot` (the wand) and `control` are not on it. */
const DAMAGE_ROLES: ReadonlySet<string> = new Set(['nuke', 'instant_nuke', 'dot']);

function isPartyHealSpell(spell: SpellDef): boolean {
  return spell.effects.some(
    (e) =>
      e.kind === 'heal'
      || e.kind === 'restore_health'
      || e.kind === 'heal_max_health'
      || e.kind === 'holy_shock',
  );
}

// A healer in a GROUP spends no mana on damage; solo it keeps the kit. The wand, Judgement, the
// dispels, the interrupts and the CC rows stay — deleting the one condition hands the damage back.
export function gateSupportDamageRows(ctx: FinalizeContext): void {
  if (ctx.mode === 'pvp') return; // hand-authored fight lists; the duel/arena lab benches those
  addToDamageRows(ctx, cond('self', 'partySeats', '<=', 1), ['pull', 'combat']);
}

/** Hold damage until the party is topped. Resto shaman / druid have shipped this since the packs. */
export function gateSupportDamageOnTopped(ctx: FinalizeContext): void {
  addToDamageRows(ctx, cond('self', 'allyLowestHpPct', '>=', TOPPED_PCT), ['combat']);
}

/** Append `extra` to every mana-for-damage row in `phases` that does not already carry its metric. */
function addToDamageRows(
  ctx: FinalizeContext,
  extra: Condition,
  phases: readonly RotationPhase[],
): void {
  const defOf = (id: number): SpellDef | undefined => ctx.knownById.get(id) ?? ctx.ds.spell(id);
  for (const phase of phases) {
    ctx.phases[phase] = ctx.phases[phase].map((r: RotationRule) => {
      if (r.action.kind !== 'spell') return r;
      if (r.conditions.some((c) => c.metric === extra.metric)) return r;
      const sp = defOf(r.action.spellId);
      if (!sp || isPartyHealSpell(sp)) return r;
      if (!DAMAGE_ROLES.has(sp.role ?? inferRole(sp))) return r;
      return { ...r, conditions: [...r.conditions, extra] };
    });
    rebuildPhaseUsed(ctx, phase);
  }
}

// Resto combat was all Balance: heals lived only in recovery at <75%, so Wrath ate the GCD while
// the tank sat at 75-90%. Copies ally heals into combat; the callers gate the damage rows.
export function hoistSupportHealsIntoCombat(ctx: FinalizeContext): void {
  const defOf = (id: number): SpellDef | undefined => ctx.knownById.get(id) ?? ctx.ds.spell(id);
  const isHealRule = (r: RotationRule): boolean => {
    if (r.action.kind !== 'spell') return false;
    const sp = defOf(r.action.spellId);
    return !!sp && isPartyHealSpell(sp);
  };
  const heals = ctx.phases.recovery.filter(isHealRule).map((r) => {
    if (r.action.kind !== 'spell') return r;
    const next = r.conditions.map((c) =>
      c.metric === 'allyLowestHpPct' && c.op === '<' && c.value === 75
        ? { ...c, value: 80 }
        : c,
    );
    return next === r.conditions ? r : { ...r, conditions: next };
  });
  ctx.phases.recovery = ctx.phases.recovery.map((r) => {
    const hit = heals.find((h) =>
      h.action.kind === 'spell' && r.action.kind === 'spell' && h.action.spellId === r.action.spellId,
    );
    return hit ?? r;
  });
  const combatHealIds = new Set(
    ctx.phases.combat.filter(isHealRule).map((r) =>
      r.action.kind === 'spell' ? r.action.spellId : -1,
    ),
  );
  const toAdd = heals.filter((r) =>
    r.action.kind === 'spell' && !combatHealIds.has(r.action.spellId),
  );
  ctx.phases.combat = [...toAdd, ...ctx.phases.combat];
  rebuildPhaseUsed(ctx, 'combat');
  rebuildPhaseUsed(ctx, 'recovery');
}
