// An on-use payload flattened through its trigger chain, plus implicit-target hostility.
// 134 items (every Protection Potion, the BG talismans, both rocket helms) matched no branch.

import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import { resolveCombatSpell } from '../../engine/spells/interpreter/item-triggers.ts';

export type OnUseSpellLookup = { spell(id: number): SpellDef | undefined };

/** SpellTargetInfoTable rows whose filter is TARGET_HARMFUL. Cite: SpellTargets.cpp:33-91. */
const HARMFUL_IMPLICIT_TARGETS: ReadonlySet<number> = new Set([2, 6, 13, 15, 16, 24, 28, 36, 54]);

/** An effect slot that aims at an enemy — the server's own hostility answer for a cast. */
export function onUseAimsAtEnemy(spell: SpellDef | undefined): boolean {
  return (spell?.rawEffects ?? []).some(
    (e) => HARMFUL_IMPLICIT_TARGETS.has(e.targetA | 0)
      || HARMFUL_IMPLICIT_TARGETS.has(e.targetB | 0),
  );
}

// The spell an effect casts IMMEDIATELY. Cite: SpellEffects.cpp EffectTriggerSpell (64). A proc
// aura (42/23) fires later off the holder, so following it read Chili's breath as offensive.
function triggeredIds(e: SpellEffect): number[] {
  return e.kind === 'trigger_spell' ? [e.spellId] : [];
}

// effects[] plus everything a trigger reaches, breadth-first with a visited set. The cast path
// already follows these hops (applySpell.ts:1658); the two classifiers did not.
export function onUseEffects(
  spell: SpellDef,
  ds: OnUseSpellLookup,
  maxDepth = 3,
): SpellEffect[] {
  const out: SpellEffect[] = [];
  const seen = new Set<number>([spell.id | 0]);
  let frontier: SpellDef[] = [spell];
  for (let depth = 0; depth <= maxDepth && frontier.length; depth++) {
    const next: SpellDef[] = [];
    for (const sp of frontier) {
      const effs = sp.effects?.length ? sp.effects : (resolveCombatSpell(sp).effects ?? []);
      for (const e of effs) {
        out.push(e);
        if (depth === maxDepth) continue;
        for (const id of triggeredIds(e)) {
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const trig = ds.spell(id);
          if (trig) next.push(trig);
        }
      }
    }
    frontier = next;
  }
  return out;
}

/** A beneficial speed aura — a hostile slow shares the kind. */
export function isBeneficialSpeed(e: SpellEffect): boolean {
  return e.kind === 'speed' && e.hostile !== true && (e.pct ?? 0) > 0;
}

export function hasFriendlyPayload(effects: readonly SpellEffect[]): boolean {
  return effects.some(
    (e) => e.kind === 'buff' || e.kind === 'heal' || e.kind === 'energize' || isBeneficialSpeed(e)
      || e.kind === 'reflect' || e.kind === 'summon_guardian',
  );
}

export function hasHostilePayload(effects: readonly SpellEffect[]): boolean {
  return effects.some(
    (e) => e.kind === 'direct_damage'
      || e.kind === 'dot'
      || (e.kind === 'cc' && !!e.mechanic)
      || e.kind === 'health_leech'
      || e.kind === 'root'
      || e.kind === 'power_burn'
      || e.kind === 'power_drain',
  );
}

// Self payloads the cast path lands that no combatItems branch names. Cite: applySpell.ts:2456
// school_absorb, :1751 proc_trigger_spell; applySpellLate.ts:1842 owned_spell_mods.
const COMBAT_SELF_PAYLOAD: ReadonlySet<SpellEffect['kind']> = new Set([
  'school_absorb', 'mana_shield', 'damage_shield', 'resist', 'proc_trigger_spell',
  'owned_spell_mods', 'next_cast_mod', 'extra_attacks', 'threat', 'modify_threat_pct',
  'combustion', 'sweeping_strikes', 'vampiric_embrace', 'magic_absorption', 'cheat_death',
  'eye_for_an_eye', 'split_damage', 'split_damage_flat', 'mod_mechanic_resistance',
  'resist_pushback', 'adaptive_warding', 'obsidian_armor', 'feign_death', 'stealth',
]);

export function hasCombatSelfPayload(effects: readonly SpellEffect[]): boolean {
  return effects.some((e) => COMBAT_SELF_PAYLOAD.has(e.kind));
}

// A meal, not a kit row: POSITIVE restore only (Skull of Impending Doom 5024's is a self-drain
// cost). The BG rations hide theirs two triggers down.
export function isFoodDrinkPayload(effects: readonly SpellEffect[]): boolean {
  return effects.some((e) => {
    if (e.kind !== 'restore_health' && e.kind !== 'restore_power') return false;
    const r = e as { min?: number; max?: number; amountPerTick?: number };
    return Math.max(r.min ?? 0, r.max ?? 0, r.amountPerTick ?? 0) > 0;
  });
}
