// Live-target aura snapshot + consume_aura peel. Cite: SpellEffects.cpp:1842–1877 Swiftmend; :291–306
// Conflagrate; :1048–1052 Hourglass.

import type { SpellEffect } from '../../data/schema.ts';
import { durMs } from '../spells/interpreter/duration.ts';
import type { TargetAuraSummary } from '../spells/interpreter/types.ts';
import type { ActiveEffect, Fighter } from './types.ts';
import { spellFromKit } from './kitById.ts';

const SPELL_AURA_PERIODIC_DAMAGE = 3;
const SPELL_AURA_PERIODIC_HEAL = 8;

export function targetAurasFromLive(
  src: Fighter,
  tgt: Fighter,
  live: readonly ActiveEffect[],
): TargetAuraSummary[] {
  const out: TargetAuraSummary[] = [];
  for (const e of live) {
    if (e.target !== tgt.side) continue;
    if (e.kind !== 'restore_health' && e.kind !== 'dot') continue;
    const def = spellFromKit(src.spec.spells, e.spellId)
      ?? spellFromKit(tgt.spec.spells, e.spellId);
    out.push({
      spellId: e.spellId,
      auraType: e.kind === 'restore_health' ? SPELL_AURA_PERIODIC_HEAL : SPELL_AURA_PERIODIC_DAMAGE,
      spellFamilyName: def?.spellFamilyName,
      spellFamilyFlags: e.spellFamilyFlags ?? def?.spellFamilyFlags,
      amount: e.amountPerTick ?? 0,
      durationMs: def ? (durMs(def.durationIndex) ?? 0) : 0,
      amplitudeMs: e.tickMs,
      casterIsSelf: e.source === src.side,
    });
  }
  return out;
}

export function applyConsumeAuraEffect(
  src: Fighter,
  tgt: Fighter,
  live: readonly ActiveEffect[],
  eff: Extract<SpellEffect, { kind: 'consume_aura' }>,
  peelAll: (who: Fighter, spellId: number) => void,
  peelStacks: (who: Fighter, spellId: number, n: number) => void,
): void {
  const peel = (who: Fighter, spellId: number) => {
    if ((eff.stacks ?? 0) === 1) peelStacks(who, spellId, 1);
    else peelAll(who, spellId);
  };
  if (eff.spellId) {
    const onTgt = live.some((e) => e.target === tgt.side && e.spellId === eff.spellId);
    if (onTgt) peel(tgt, eff.spellId);
    else peel(src, eff.spellId);
    return;
  }
  const tryFamily = (who: Fighter): boolean => {
    for (const e of live) {
      if (e.target !== who.side) continue;
      if (eff.casterOnly && e.source !== src.side) continue;
      if (eff.auraType === SPELL_AURA_PERIODIC_HEAL && e.kind !== 'restore_health') continue;
      if (eff.auraType === SPELL_AURA_PERIODIC_DAMAGE && e.kind !== 'dot') continue;
      const def = spellFromKit(src.spec.spells, e.spellId)
        ?? spellFromKit(who.spec.spells, e.spellId);
      const fam = def?.spellFamilyName ?? 0;
      const flags = e.spellFamilyFlags ?? def?.spellFamilyFlags ?? 0;
      if (fam !== (eff.spellFamilyName ?? 0)) continue;
      if (eff.spellFamilyFlags && (flags & eff.spellFamilyFlags) === 0) continue;
      peel(who, e.spellId);
      return true;
    }
    return false;
  };
  if (!tryFamily(tgt)) tryFamily(src);
}
