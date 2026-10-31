// Totem aura bookkeeping, peeled out of createSession (which sits on a filesize ratchet).
// Pure functions over the effect list — no session state, no rng, no DOM.

import type { ActiveEffect, Fighter } from './types.ts';
import type { CombatEvent, Side, TotemSide } from '../core/events.ts';
import { reverseBuffMod, applyResistMod } from './fighterFactory.ts';

// Remove the auras an unsummoned totem is responsible for, and ONLY those: UnSummon strips its FIRST
// kit spell, so an aura totem loses its buff while anything it triggered survives. That is twisting.
export function stripTotemAuras(args: {
  effects: ActiveEffect[];
  side: TotemSide;
  kitSpellId: number;
  t: number;
  bySide: (s: Side) => Fighter;
  push: (e: CombatEvent) => void;
}): number {
  const { effects, side, kitSpellId, t, bySide, push } = args;
  let removed = 0;
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]!;
    if (e.fromTotem !== side && e.source !== side) continue;
    const isOwnPulse = e.source === side && e.kind === 'proc_trigger_spell';
    const isMagnetCopy = e.kind === 'spell_magnet' && (e.fromTotem === side || e.source === side);
    if (!isOwnPulse && !isMagnetCopy && kitSpellId > 0 && e.spellId !== kitSpellId) continue;
    const owner = bySide(e.target);
    if (e.kind === 'buff') {
      reverseBuffMod(owner, e.mod, e.amount ?? 0, e.school, {
        creatureTypeMask: e.creatureTypeMask,
        schoolMask: e.schoolMask,
      });
      owner.buffActive.delete(e.spellId);
      push({ t, kind: 'aura', actor: e.target, name: e.name, applied: false });
    } else if (e.kind === 'resist') {
      applyResistMod(owner, e.school, -(e.amount ?? 0));
      owner.buffActive.delete(e.spellId);
      push({ t, kind: 'aura', actor: e.target, name: e.name, applied: false });
    } else if (e.kind === 'restore_health' || e.kind === 'restore_power') {
      owner.buffActive.delete(e.spellId);
      push({ t, kind: 'aura', actor: e.target, name: e.name, applied: false });
    } else if (e.kind === 'spell_magnet') {
      // Area copies drop when the totem caster dies. Cite: SpellAuras AreaAura::Update.
      owner.buffActive.delete(e.spellId);
      push({ t, kind: 'aura', actor: e.target, name: e.name, applied: false });
    }
    effects.splice(i, 1);
    removed++;
  }
  return removed;
}

// Totem summon ids sit in `buffActive` as rotation bookkeeping, never auras the caster carries. Below:
// the party-wide SPELL_MAGNET copies, durationMs 0 meaning the totem's lifetime. Cite: spell 8178.
export function applySpellMagnetToParty(args: {
  effects: ActiveEffect[];
  effectsOn?: (side: Side) => ActiveEffect[];
  party: readonly Fighter[];
  source: TotemSide;
  spell: { id: number; name: string; procCharges?: number };
  expiresAt: number;
  t: number;
  push: (e: CombatEvent) => void;
  touchEffect?: (e: ActiveEffect) => void;
}): void {
  const charges = args.spell.procCharges != null && args.spell.procCharges > 0
    ? args.spell.procCharges
    : 1;
  for (const fr of args.party) {
    if (fr.hp <= 0) continue;
    const rows = args.effectsOn?.(fr.side) ?? args.effects;
    const live = rows.find(
      (e) => e.kind === 'spell_magnet'
        && e.spellId === args.spell.id
        && e.target === fr.side
        && e.source === args.source,
    );
    if (live) {
      live.expiresAt = args.expiresAt;
      live.charges = charges;
      args.touchEffect?.(live);
      continue;
    }
    fr.buffActive.add(args.spell.id);
    args.effects.push({
      kind: 'spell_magnet',
      source: args.source,
      target: fr.side,
      spellId: args.spell.id,
      name: args.spell.name,
      expiresAt: args.expiresAt,
      charges,
      fromTotem: args.source,
    });
    args.push({ t: args.t, kind: 'aura', actor: fr.side, name: args.spell.name, applied: true });
  }
}

export function totemSummonMarkerIds(totems: Iterable<Fighter>): Set<number> {
  const out = new Set<number>();
  for (const tot of totems) {
    if (tot.totemSummonSpellId) out.add(tot.totemSummonSpellId);
  }
  return out;
}

/** Kit auras a standing totem is granting the player right now, with their real remaining time. */
export function totemGrantedAuras(
  effects: readonly ActiveEffect[],
  side: TotemSide,
  t: number,
): { spellId: number; name: string; remainingMs: number }[] {
  const out: { spellId: number; name: string; remainingMs: number }[] = [];
  for (const e of effects) {
    if (e.fromTotem !== side || e.target !== 'player' || e.expiresAt <= t) continue;
    out.push({
      spellId: e.spellId,
      name: e.name,
      remainingMs: Number.isFinite(e.expiresAt) ? Math.max(0, Math.round(e.expiresAt - t)) : 0,
    });
  }
  return out;
}
