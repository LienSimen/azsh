// The pre-pull out-of-combat effect seeders, peeled from createSession for the filesize ratchet. Same
// effect rows and the same RNG order as the former inlines; display auras stay in their own file.

import type { Rng } from '../core/rng.ts';
import { setCombustionStacks, type CombustionEffect } from './combustion.ts';
import { rollBetween } from './formulas.ts';
import { isHunterTrapTriggerSpellId } from '../spells/interpreter/hunter-kit.ts';
import type { CombatPosYd } from './combatGeometry.ts';
import type { Side } from '../core/events.ts';
import type { ActiveEffect, Fighter } from './types.ts';
import { seedDisplayAurasInto } from './seedDisplayAuras.ts';

/** Seed OOC damage shields (Lightning Shield) so prep casts carry into combat with charges. */
export function seedDamageShields(f: Fighter, effects: ActiveEffect[]): void {
  for (const sh of f.spec.startDamageShields ?? []) {
    // Absent charges = unlimited, the reading procsDamage.ts:1239 applies when it procs.
    if (sh.remainingMs <= 0 || (sh.charges != null && sh.charges <= 0)) continue;
    effects.push({
      kind: 'damage_shield',
      source: f.side,
      target: f.side,
      spellId: sh.spellId,
      name: sh.name,
      school: sh.school,
      min: sh.min,
      max: sh.max,
      expiresAt: sh.remainingMs,
      charges: sh.charges,
      nextProcAt: 0,
      cooldownMs: sh.cooldownMs && sh.cooldownMs > 0 ? sh.cooldownMs : undefined,
    });
    f.buffActive.add(sh.spellId);
  }
}

export function seedProcTriggers(
  f: Fighter,
  effects: ActiveEffect[],
  posOf?: (side: Side) => CombatPosYd | undefined,
): void {
  for (const p of f.spec.startProcTriggers ?? []) {
    if (p.remainingMs <= 0) continue;
    // Hunter trap GO stays at arm yards (caster feet). Cite: SpellEffects.cpp EffectSummonObject.
    const trapPos = p.trapPosYd ?? (isHunterTrapTriggerSpellId(p.triggerSpellId) ? posOf?.(f.side) : undefined);
    effects.push({
      kind: 'proc_trigger_spell',
      source: f.side,
      target: f.side,
      spellId: p.spellId,
      name: p.name,
      triggerSpellId: p.triggerSpellId,
      expiresAt: p.remainingMs,
      charges: p.charges,
      nextProcAt: 0,
      cooldownMs: p.cooldownMs,
      procFlags: p.procFlags,
      procPpm: p.procPpm,
      procChance: p.procChance,
      ...(trapPos ? { trapPosYd: { ...trapPos } } : {}),
    });
    f.buffActive.add(p.spellId);
  }
}

/** Cite: KI-181 pre-pull absorb. */
export function seedSchoolAbsorbs(f: Fighter, effects: ActiveEffect[], rng: Rng): void {
  for (const sh of f.spec.startSchoolAbsorbs ?? []) {
    if (sh.remainingMs <= 0) continue;
    const amount = Math.max(0, Math.round(rollBetween(sh.min, sh.max, rng.next())));
    f.schoolAbsorbs = f.schoolAbsorbs.filter((a) => a.id !== sh.spellId);
    f.schoolAbsorbs.push({ schoolMask: sh.schoolMask, amount, id: sh.spellId });
    effects.push({
      kind: 'school_absorb',
      source: f.side,
      target: f.side,
      spellId: sh.spellId,
      name: sh.name,
      expiresAt: sh.remainingMs,
      min: amount,
      max: amount,
    });
    f.buffActive.add(sh.spellId);
  }
}

export function seedManaShields(f: Fighter, effects: ActiveEffect[], rng: Rng): void {
  for (const sh of f.spec.startManaShields ?? []) {
    if (sh.remainingMs <= 0) continue;
    const amount = Math.max(0, Math.round(rollBetween(sh.min, sh.max, rng.next())));
    f.manaShields = f.manaShields.filter((a) => a.id !== sh.spellId);
    f.manaShields.push({
      schoolMask: sh.schoolMask,
      amount,
      manaMultiplier: sh.manaMultiplier,
      id: sh.spellId,
    });
    effects.push({
      kind: 'mana_shield',
      source: f.side,
      target: f.side,
      spellId: sh.spellId,
      name: sh.name,
      expiresAt: sh.remainingMs,
      min: amount,
      max: amount,
    });
    f.buffActive.add(sh.spellId);
  }
}

/** Cite: KI-182 pre-pull HoT; OBS_MOD_HEALTH pctOfMax (KI-833 Fel Stamina). */
export function seedRestoreHealth(f: Fighter, effects: ActiveEffect[]): void {
  for (const h of f.spec.startRestoreHealth ?? []) {
    if (h.remainingMs <= 0) continue;
    const tickMs = Math.max(1, h.tickMs);
    const amountPerTick = Math.max(0, h.amountPerTick);
    const pctOfMax = (h.pctOfMax ?? 0) > 0 ? Math.trunc(h.pctOfMax!) : undefined;
    effects.push({
      kind: 'restore_health',
      source: f.side,
      target: f.side,
      spellId: h.spellId,
      name: h.name,
      amountPerTick: pctOfMax != null ? 0 : amountPerTick,
      ...(pctOfMax != null ? { pctOfMax } : {}),
      tickMs,
      nextTickAt: tickMs,
      expiresAt: h.remainingMs,
    });
    f.buffActive.add(h.spellId);
  }
}

/** Cite: OBS_MOD_MANA Fel Energy 18792; SpellAuras PeriodicTick; KI-833. */
export function seedRestorePower(f: Fighter, effects: ActiveEffect[]): void {
  for (const p of f.spec.startRestorePower ?? []) {
    if (p.remainingMs <= 0) continue;
    const tickMs = Math.max(1, p.tickMs);
    const amountPerTick = p.amountPerTick ?? 0;
    const pctOfMax = (p.pctOfMax ?? 0) > 0 ? Math.trunc(p.pctOfMax!) : undefined;
    effects.push({
      kind: 'restore_power',
      source: f.side,
      target: f.side,
      spellId: p.spellId,
      name: p.name,
      amountPerTick: pctOfMax != null ? 0 : amountPerTick,
      ...(pctOfMax != null ? { pctOfMax } : {}),
      ...(p.powerType != null ? { powerType: p.powerType | 0 } : {}),
      tickMs,
      nextTickAt: tickMs,
      expiresAt: p.remainingMs,
    });
    f.buffActive.add(p.spellId);
  }
}

// OOC next_cast_mod (Presence of Mind / Nature's Swiftness / Cold Blood / …). Cite: applySpellLate
// next_cast_mod; buildCombatant startPendingSpellMod; KI-540.
export function seedPendingSpellMod(f: Fighter, effects: ActiveEffect[]): void {
  const m = f.spec.startPendingSpellMod;
  if (!m || m.remainingMs <= 0) return;
  f.pendingSpellMod = {
    spellId: m.spellId,
    name: m.name,
    appliesTo: m.appliesTo,
    critAdd: m.critAdd,
    instant: !!m.instant,
    freeCost: !!m.freeCost,
    // Prefer costModPct; accept legacy costPct from buildCombatant until that file remaps.
    costModPct: m.costModPct ?? m.costPct,
    costFlat: m.costFlat,
    effectPct: m.effectPct,
    castTimeFlat: m.castTimeFlat,
    spellFamilyName: m.spellFamilyName,
    familyFlags: m.familyFlags,
    rows: m.rows,
  };
  f.buffActive.add(m.spellId);
  effects.push({
    kind: 'buff',
    source: f.side,
    target: f.side,
    spellId: m.spellId,
    name: m.name,
    expiresAt: m.remainingMs,
    charges: 1,
  });
}

/** OOC Sweeping Strikes charges + buff row. Cite: UnitAuraProcHandler.cpp:810–841. */
export function seedSweepingStrikes(f: Fighter, effects: ActiveEffect[]): void {
  const ss = f.spec.startSweepingStrikes;
  if (!ss || ss.remainingMs <= 0 || ss.charges <= 0) return;
  f.sweepingStrikesCharges = ss.charges;
  f.buffActive.add(ss.spellId);
  effects.push({
    kind: 'buff',
    source: f.side,
    target: f.side,
    spellId: ss.spellId,
    name: ss.name,
    expiresAt: ss.remainingMs,
  });
}

/** OOC Combustion charges + buff row. Cite: UnitAuraProcHandler.cpp:991-1003. */
export function seedCombustion(f: Fighter, effects: ActiveEffect[]): void {
  const cb = f.spec.startCombustion;
  if (!cb || cb.remainingMs <= 0 || cb.charges <= 0) return;
  const eff = combustionEffectOfSpec(f, cb.spellId);
  if (!eff) return;
  f.combustionCharges = cb.charges;
  setCombustionStacks(f, eff, cb.stacks);
  f.buffActive.add(cb.spellId);
  effects.push({
    kind: 'buff',
    source: f.side,
    target: f.side,
    spellId: cb.spellId,
    name: cb.name,
    expiresAt: cb.remainingMs,
    charges: cb.charges,
  });
}

// The kit row that carries the payload — the spec only carries the counters.
function combustionEffectOfSpec(f: Fighter, spellId: number): CombustionEffect | null {
  for (const sp of f.spec.spells) {
    if (sp.id !== spellId) continue;
    for (const e of sp.effects) if (e.kind === 'combustion') return e;
  }
  return null;
}

/** OOC Vampiric Embrace leech pct. Cite: UnitAuraProcHandler.cpp:1015–1028. */
export function seedVampiricEmbrace(f: Fighter, effects: ActiveEffect[]): void {
  const ve = f.spec.startVampiricEmbrace;
  if (!ve || ve.remainingMs <= 0 || ve.pct <= 0) return;
  f.vampiricEmbracePct = ve.pct;
  f.buffActive.add(ve.spellId);
  effects.push({
    kind: 'buff',
    source: f.side,
    target: f.side,
    spellId: ve.spellId,
    name: ve.name,
    expiresAt: ve.remainingMs,
  });
}

// OOC paladin seal → ActiveSeal + buff chip (swing procs + Judgement + playerView.buffs). Mirrors
// applySpellLate seal branch at t=0 with remaining duration. Cite: KI-894; paladin-seals.ts.
export function seedActiveSeal(f: Fighter, effects: ActiveEffect[]): void {
  const s = f.spec.startActiveSeal;
  if (!s || s.remainingMs <= 0) return;
  f.activeSeal = {
    spellId: s.spellId,
    name: s.name,
    seal: s.seal,
    coeff: s.coeff,
    procPpm: s.procPpm,
    onSwingWeaponPct: s.onSwingWeaponPct,
    onSwingHeal: s.onSwingHeal,
    onSwingMana: s.onSwingMana,
    judge: s.judge,
    expiresAt: s.remainingMs,
  };
  f.buffActive.add(s.spellId);
  effects.push({
    kind: 'buff',
    source: f.side,
    target: f.side,
    spellId: s.spellId,
    name: s.name,
    expiresAt: s.remainingMs,
  });
}

// Apply every pre-pull seeder to the party, in turn order — the same list the store composes. It used
// to be three parameters with each group spelling the same triplet out six times. The seal stays player-only.
export function seedAllOocEffects(opts: {
  party: readonly Fighter[];
  player: Fighter;
  effects: ActiveEffect[];
  rng: Rng;
  posOf?: (side: Side) => CombatPosYd | undefined;
}): void {
  const { party, player, effects, rng, posOf } = opts;

  // The player and pet took shields and proc triggers before the companions, and the companions took
  // both per unit. One pass over the party is the same sequence, because neither seeder draws.
  for (const f of party) {
    seedDamageShields(f, effects);
    seedProcTriggers(f, effects, posOf);
  }

  // Cite: KI-181 pre-pull absorb; KI-182 pre-pull HoT; KI-833 OBS_MOD restore_power.
  for (const f of party) {
    seedSchoolAbsorbs(f, effects, rng);
    seedManaShields(f, effects, rng);
    seedRestoreHealth(f, effects);
    seedRestorePower(f, effects);
  }

  for (const f of party) seedPendingSpellMod(f, effects);
  for (const f of party) seedSweepingStrikes(f, effects);
  for (const f of party) seedCombustion(f, effects);
  for (const f of party) seedVampiricEmbrace(f, effects);

  // Pre-pull seal (player only). Cite: KI-894; oocCastEffects seal; applySpellLate seal.
  seedActiveSeal(player, effects);

  // OOC buffs / aspects / stances — display + combat-only mod seed (KI-522 Evasion).
  // Cite: seedDisplayAuras.ts; domain/prePullBuffs BENEFICIAL_MODS.
  for (const f of party) seedDisplayAurasInto(f, effects);
}
