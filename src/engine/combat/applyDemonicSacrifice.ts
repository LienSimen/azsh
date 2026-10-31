// Combat Demonic Sacrifice: kill pet, apply result aura by entry (not shell 18788). Cite:
// Warlock.cpp:214–234; spell_template 18789–18792; SpellEffects.cpp:3254–3255.
import type { ActiveEffect, Fighter } from './types.ts';
import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import { applyBuffMod } from './fighterFactory.ts';
import { POWER_MANA } from '../spells/effects.ts';
import { DEMONIC_SACRIFICE_RESULT_SPELL_IDS } from '../spells/interpreter/handlers/shared.ts';
import type { Side } from '../core/events.ts';

type SacEff = Extract<SpellEffect, { kind: 'demonic_sacrifice' }>;
type SacBuff = SacEff['byPet'][number];

export function applyDemonicSacrificeEffect(input: {
  src: Fighter;
  pet: Fighter | null | undefined;
  spell: SpellDef;
  eff: SacEff;
  effects: ActiveEffect[];
  t: number;
  durFor: (ms: number) => number;
  dead: (f: Fighter) => boolean;
  push: (e: { t: number; kind: string; actor: Side; spellId?: number; name?: string; applied?: boolean }) => void;
}): boolean {
  const { src, pet, spell, eff, effects, t, durFor, dead, push } = input;
  if (!pet || dead(pet)) return false;
  const b: SacBuff | undefined = eff.byPet[pet.spec.creatureEntry ?? 0];
  if (!b) return false;
  const isPctRegen =
    (b.restore === 'health' || b.restore === 'power')
    && (b.pctOfMax ?? 0) > 0
    && (b.tickMs ?? 0) > 0;
  const isDamageBuff = b.mod != null && b.amount != null;
  if (!isPctRegen && !isDamageBuff) return false;

  pet.hp = 0;
  push({ t, kind: 'death', actor: 'pet' });
  const dur = durFor(b.durationMs);
  const auraSpellId = (b.resultSpellId | 0) > 0 ? (b.resultSpellId | 0) : spell.id;
  for (const sid of DEMONIC_SACRIFICE_RESULT_SPELL_IDS) {
    if (sid === auraSpellId) continue;
    src.buffActive.delete(sid);
    for (let i = effects.length - 1; i >= 0; i--) {
      if (effects[i]!.spellId === sid && effects[i]!.target === src.side) effects.splice(i, 1);
    }
  }
  src.buffActive.add(auraSpellId);
  if (isPctRegen && b.restore && b.pctOfMax != null && b.tickMs != null) {
    const kind = b.restore === 'health' ? 'restore_health' as const : 'restore_power' as const;
    const tickMs = Math.max(1, b.tickMs);
    const pctOfMax = Math.trunc(b.pctOfMax);
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]!;
      if (e.kind === kind && e.spellId === auraSpellId && e.target === src.side) effects.splice(i, 1);
    }
    effects.push({
      kind, source: src.side, target: src.side, spellId: auraSpellId, name: spell.name,
      amountPerTick: 0, pctOfMax, tickMs, nextTickAt: t + tickMs, expiresAt: t + dur,
      // Fel Energy is OBS_MOD_MANA, which the C++ ticks against POWER_MANA. Cite: SpellAuras.cpp:4865.
      ...(kind === 'restore_power' ? { powerType: POWER_MANA } : {}),
    });
  } else if (isDamageBuff && b.mod != null && b.amount != null) {
    applyBuffMod(src, b.mod, b.amount, b.school);
    effects.push({
      kind: 'buff', source: src.side, target: src.side, spellId: auraSpellId, name: spell.name,
      mod: b.mod, amount: b.amount, school: b.school, expiresAt: t + dur,
    });
  }
  push({ t, kind: 'aura', actor: src.side, spellId: auraSpellId, name: spell.name, applied: true });
  return true;
}
