// PURE: no DOM/RNG/Date. Warlock rotation post-pass + kit policy.

import type { SpellDef } from '../../../data/schema.ts';
import {
  bindConjureStockGate,
  isCreateHealthstoneSpell,
  isMultiTargetCombatSpell,
} from '../classify.ts';
import type { ClassRotationHooks, FinalizeContext } from './hooks.ts';
import { rebuildPhaseUsed } from './hooks.ts';
import type { RotationRule } from '../types.ts';

/** Canonical tree → combat damage schools allowed in role-bucket fallback. */
const WARLOCK_FALLBACK_SCHOOLS: Readonly<Record<string, ReadonlySet<string>>> = {
  // Immolate (fire) stays when authored; fallback must not inject Destro fillers.
  Affliction: new Set(['shadow']),
  Demonology: new Set(['shadow']),
  Destruction: new Set(['fire', 'shadow']),
};

function schoolAllowed(spell: SpellDef, spec: string): boolean {
  const allowed = WARLOCK_FALLBACK_SCHOOLS[spec];
  if (!allowed) return true;
  // Multi-target / channeled AoE (Rain of Fire / Hellfire) cross-spec (KI-216 family).
  if (isMultiTargetCombatSpell(spell)) return true;
  const school = (spell.school ?? '').toLowerCase();
  if (allowed.has(school)) return true;
  return false;
}

function spellRankScore(s: SpellDef): number {
  if ((s.rank ?? 0) > 0) return s.rank ?? 0;
  return s.spellLevel ?? s.reqLevel ?? 0;
}

// Best known Create Healthstone in buffs. Packs named one rank (Lesser / unranked) so a new
// trainer rank never entered the list; inject or rewrite to the highest the book can cast.
function ensureCreateHealthstoneBuffRow(ctx: FinalizeContext): void {
  let best: SpellDef | null = null;
  for (const s of ctx.known) {
    if (!isCreateHealthstoneSpell(s)) continue;
    if ((s.reqLevel ?? 0) > (ctx.char.level | 0)) continue;
    if (!best || spellRankScore(s) > spellRankScore(best)) best = s;
  }
  if (!best) return;
  const next: RotationRule[] = [];
  let placed = false;
  for (const r of ctx.phases.buffs) {
    if (r.action.kind === 'spell' && isCreateHealthstoneSpell(ctx.ds.spell(r.action.spellId))) {
      if (placed) continue;
      next.push({
        id: r.id,
        action: { kind: 'spell', spellId: best.id },
        conditions: bindConjureStockGate(best, r.conditions),
        enabled: r.enabled,
      });
      placed = true;
      continue;
    }
    next.push(r);
  }
  if (!placed) {
    next.push({
      id: ctx.nextFallbackId(),
      action: { kind: 'spell', spellId: best.id },
      conditions: bindConjureStockGate(best, []),
      enabled: true,
    });
  }
  ctx.phases.buffs = next;
  rebuildPhaseUsed(ctx, 'buffs');
}

export const warlockHooks: ClassRotationHooks = {
  allowFallbackSpell(spell, spec) {
    return schoolAllowed(spell, spec);
  },
  afterFallback(ctx) {
    ensureCreateHealthstoneBuffRow(ctx);
  },
};
