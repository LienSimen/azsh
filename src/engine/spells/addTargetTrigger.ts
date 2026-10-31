// ADD_TARGET_TRIGGER holders whose payload hits the spell's victim: Shadow Weaving, Improved Scorch,
// Frostbite. Cite: SpellAuras.cpp:170; Spell.cpp:7433-7468 ProcSpellAuraTriggers.

import type { SpellDef } from '../../data/schema.ts';
import { interpretSpell } from './interpreter/index.ts';
import { SPELL_AURA_ADD_TARGET_TRIGGER } from './interpreter/opcodes.ts';

export type VictimAddTargetTriggerRow = {
  triggerSpellId: number;
  chancePct: number;
  familyName: number;
  familyFlags: number;
};

function triggerHitsVictim(trig: SpellDef): boolean {
  const effects = interpretSpell(trig).effects ?? [];
  for (const e of effects) {
    if (e.kind === 'direct_damage' || e.kind === 'dot' || e.kind === 'cc' || e.kind === 'root') {
      return true;
    }
    if (e.kind === 'buff') {
      if (e.hostile === true) return true;
      if (e.hostile !== false && (e.amount ?? 0) < 0) return true;
    }
  }
  return false;
}

// Aura 109 rows on `holder` whose trigger is a victim hit (hostile buff / root / CC / damage). Empty when
// the interpreter rewrote the holder (Improved Sprint) or the payload is self-only.
export function victimAddTargetTriggerRows(
  holder: SpellDef,
  lookup: (id: number) => SpellDef | undefined,
): VictimAddTargetTriggerRow[] {
  const raw = holder.rawEffects ?? [];
  if (!raw.some((e) => (e.auraName | 0) === SPELL_AURA_ADD_TARGET_TRIGGER)) return [];
  const resolved = interpretSpell(holder).effects ?? [];
  const out: VictimAddTargetTriggerRow[] = [];
  for (const e of resolved) {
    if (e.kind !== 'add_target_trigger') continue;
    const trigId = e.triggerSpellId | 0;
    if (!trigId) continue;
    const trig = lookup(trigId);
    if (!trig || !triggerHitsVictim(trig)) continue;
    out.push({
      triggerSpellId: trigId,
      chancePct: e.chancePct | 0,
      familyName: (e.familyName ?? holder.spellFamilyName ?? 0) | 0,
      familyFlags: (e.familyFlags ?? 0) >>> 0,
    });
  }
  return out;
}
