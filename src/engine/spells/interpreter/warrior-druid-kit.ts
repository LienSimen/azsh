// Warrior and druid kit materialization at the play surface: the intents the mapper left empty, folded
// into engine-consumable effects without inventing numbers.

import type { ControlKind, SpellDef, SpellEffect } from '../../../data/schema.ts';
import type { InterpretResult } from './types.ts';
import { effectBaseAmount } from './registry/helpers.ts';
import { durMs as durFromIndex } from './duration.ts';

// ── SharedDefines Mechanics (subset) ─────────────────────────────────────────
// Cite: SharedDefines.h Mechanics; EffectDispelMechanic miscValue.
const MECHANIC_ROOT = 7;
const MECHANIC_SNARE = 11;
const MECHANIC_FEAR = 5;
const MECHANIC_SLEEP = 10;
const MECHANIC_CHARM = 1;
const MECHANIC_STUN = 12;
const MECHANIC_SILENCE = 9;
const MECHANIC_DISARM = 3;

// Map a mechanic id to a control kind for a cleanse. Root and snare are distinct — Escape Artist has a
// dispel row for each. Cite: SharedDefines.h MECHANIC_ROOT and SNARE; Spell.sql 20589.
function mechanicToControl(mechanic: number): ControlKind | null {
  switch (mechanic) {
    case MECHANIC_ROOT:
      return 'root';
    case MECHANIC_SNARE:
      return 'snare';
    case MECHANIC_FEAR:
      return 'fear';
    case MECHANIC_SLEEP:
      return 'incapacitate';
    case MECHANIC_CHARM:
      return 'charm';
    case MECHANIC_STUN:
      return 'stun';
    case MECHANIC_SILENCE:
      return 'silence';
    case MECHANIC_DISARM:
      return 'disarm';
    default:
      return null;
  }
}

// The warrior Execute family flag.
// Cite: Spell.sql SpellFamilyFlags on 5308 and 20658-20662.
export const EXECUTE_FAMILY_FLAGS = 0x20000000;
export const SPELLFAMILY_WARRIOR = 4;

// Execute rank → DmgMultiplier1 (rage stored * mult). Rage is stored *10 in CMaNGOS; display rage R →
// damage += (R*10)*mult. Cite: Spell.sql DmgMultiplier1; Warrior.cpp:26–28.
export const EXECUTE_DMG_MULTIPLIER: Readonly<Record<number, number>> = {
  5308: 0.3,
  20658: 0.6,
  20660: 0.9,
  20661: 1.2,
  20662: 1.5,
};

/** Damage carrier cast by WarriorExecute. Cite: Warrior.cpp:28 CastCustomSpell(20647). */
export const EXECUTE_DAMAGE_SPELL_ID = 20647;

// True for the castable Execute ranks that materialize direct damage — not the empty intermediate and
// not the damage-carrier script spell. Cite: Warrior.cpp:22-29 WarriorExecute.
export function isWarriorExecuteSpell(spell: { id?: number } | null | undefined): boolean {
  const id = (spell?.id ?? 0) | 0;
  return EXECUTE_DMG_MULTIPLIER[id] != null;
}

// Execute's rage-to-damage: the effect value plus current rage times the damage multiplier. The C++
// stores rage ten times larger than the display units this engine uses. Cite: Warrior.cpp:26-28.
export function executeDamageAmount(
  baseAmount: number,
  rageDisplay: number,
  dmgMultiplier: number,
): number {
  const storedRage = Math.max(0, Math.trunc(rageDisplay)) * 10;
  return Math.max(0, Math.trunc(baseAmount + storedRage * dmgMultiplier));
}

// ── Retaliation ──────────────────────────────────────────────────────────────
/** Retaliation self-buff. Cite: Spell.sql 20230; UnitAuraProcHandler.cpp:844. */
export const RETALIATION_SPELL_ID = 20230;
// Counterattack payload (WEAPON_DAMAGE_NOSCHOOL). Cite: UnitAuraProcHandler.cpp:850 triggered_spell_id =
// 22858 (Warrior.cpp RetaliationWarrior uses 20240 — not in bake; 22858 is the DBC trigger).
export const RETALIATION_DAMAGE_SPELL_ID = 22858;
/** ProcCharges from Spell.sql 20230. */
export const RETALIATION_PROC_CHARGES = 30;

// The Frenzied Regeneration ranks, whose periodic trigger id is 0 and whose tick is scripted.
// Cite: SpellAuras.cpp:1104-1116; Spell.sql 22842, 22895, 22896.
export const FRENZIED_REGEN_SPELL_IDS = new Set([22842, 22895, 22896]);
/** Heal carrier. Cite: SpellAuras.cpp:1115 CastCustomSpell(22845). */
export const FRENZIED_REGEN_HEAL_SPELL_ID = 22845;
/** Max rage (stored) converted per tick. Cite: SpellAuras.cpp:1111–1112. */
export const FRENZIED_REGEN_MAX_STORED_RAGE = 100;

// The Frenzied Regeneration tick: heal from the rage spent, at the life-per-rage rate, converting from
// the C++'s ten-times-larger storage. Cite: SpellAuras.cpp:1108-1115.
export function frenziedRegenTick(
  lifePerRage: number,
  displayRage: number,
): { heal: number; displayRageSpent: number } {
  const stored = Math.min(
    Math.max(0, Math.trunc(displayRage)) * 10,
    FRENZIED_REGEN_MAX_STORED_RAGE,
  );
  const heal = Math.max(0, Math.trunc((stored * lifePerRage) / 10));
  const displayRageSpent = stored / 10;
  return { heal, displayRageSpent };
}

// The life-per-rage rate recovered from the baked maximum tick, which is ten times it.
// Cite: SpellAuras.cpp:1108.
export function frenziedRegenLifePerRage(amountPerTick: number): number {
  return Math.max(1, Math.trunc(amountPerTick / 10));
}

// ── Barkskin ─────────────────────────────────────────────────────────────────
/** Barkskin castable. Cite: Spell.sql 22812. */
export const BARKSKIN_SPELL_ID = 22812;
// The Barkskin effect companion, which carries the real auras the tooltip references: -25% melee haste
// and -20% physical damage taken. Cite: Spell.sql 22839.
export const BARKSKIN_EFFECT_SPELL_ID = 22839;
/** Sourced amounts from rawEffects on 22839 (bp+die). */
export const BARKSKIN_HASTE_AMOUNT = -25;
export const BARKSKIN_PHYSICAL_TAKEN_AMOUNT = -20;

// Materialize Warrior/Druid play-surface effects from interpret intents + spell id specials. Mutates
// nothing on `spell`; returns a new effects array (may equal input when nothing to add).
export function materializeWarriorDruidKitEffects(
  spell: SpellDef,
  result: InterpretResult,
  effectsIn: SpellEffect[],
): SpellEffect[] {
  let effects = effectsIn.slice();
  const id = spell.id | 0;
  const intents = result.intents ?? [];

  // ── intent → effect bridges (SI3 intents-only auras) ─────────────────────
  const cleanseControls = new Set<ControlKind>();
  // immuneMs from MECHANIC_IMMUNITY duration (WotF 5s). Cite: Spell.sql DurationIndex 28 → 5s.
  let cleanseImmuneMs = 0;
  for (const intent of intents) {
    if (intent.kind === 'mod_block_percent') {
      // Cite: SpellAuras.cpp:3789–3800 HandleAuraModBlockPercent; BuffMod parry/dodge pattern.
      if (!effects.some((e) => e.kind === 'buff' && e.mod === 'block')) {
        effects.push({
          kind: 'buff',
          mod: 'block',
          amount: intent.amount,
          durationMs: intent.durationMs,
        });
      }
    } else if (intent.kind === 'dispel_mechanic') {
      const c = mechanicToControl(intent.mechanic);
      if (c) cleanseControls.add(c);
    }
  }
  // A mechanic immunity for charm, fear or sleep is the real breaker shape, but the interpretation
  // drops the seed cleanse, so the racial greys out under fear. Re-materialize it for that set only.
  const hasCharmCc = effects.some(
    (e) =>
      e.kind === 'cc'
      && ((e as { mechanic?: string }).mechanic === 'charm'
        || (e as { control?: string }).control === 'charm'),
  );
  const BREAKER_IMMUNITY_MECHANICS = new Set([MECHANIC_CHARM, MECHANIC_FEAR, MECHANIC_SLEEP]);
  for (const e of effects) {
    if (hasCharmCc) break;
    if (e.kind !== 'mechanic_immunity') continue;
    if (!BREAKER_IMMUNITY_MECHANICS.has(e.mechanic | 0)) continue;
    const c = mechanicToControl(e.mechanic | 0);
    if (c) cleanseControls.add(c);
    const dur = e.durationMs | 0;
    if (dur > cleanseImmuneMs) cleanseImmuneMs = dur;
  }
  if (cleanseControls.size > 0) {
    // UNION into an existing cleanse rather than skipping when one is present: the bake row for the
    // racial carries only fear and incapacitate, and whichever ran first used to win.
    const existing = effects.find((e) => e.kind === 'cleanse');
    if (existing && existing.kind === 'cleanse') {
      for (const c of existing.controls ?? []) cleanseControls.add(c);
      existing.controls = [...cleanseControls];
      const prev = existing.immuneMs ?? 0;
      const next = Math.max(prev, cleanseImmuneMs);
      if (next > 0) existing.immuneMs = next;
    } else {
      const cleanse: SpellEffect = cleanseImmuneMs > 0
        ? { kind: 'cleanse', controls: [...cleanseControls], immuneMs: cleanseImmuneMs }
        : { kind: 'cleanse', controls: [...cleanseControls] };
      effects.push(cleanse);
    }
  }

  // ── Retaliation 20230: DUMMY aura → take-melee proc → 22858 weapon swing ──
  // Cite: UnitAuraProcHandler.cpp:843–851; Spell.sql ProcCharges=30 DurationIndex=8.
  if (id === RETALIATION_SPELL_ID && !effects.some((e) => e.kind === 'proc_trigger_spell')) {
    // DurationIndex 8 → 15_000 ms. Cite: duration.ts FALLBACK_DURATION_MS; Spell.sql.
    const durationMs = durFromIndex(spell.durationIndex) ?? 15_000;
    effects.push({
      kind: 'proc_trigger_spell',
      triggerSpellId: RETALIATION_DAMAGE_SPELL_ID,
      durationMs,
      charges: RETALIATION_PROC_CHARGES,
    });
  }

  // ── Retaliation payload 22858: WEAPON_DAMAGE_NOSCHOOL bp=0 → 100% weapon ──
  if (id === RETALIATION_DAMAGE_SPELL_ID && effects.length === 0) {
    effects.push({ kind: 'weapon_percent_damage', pct: 100 });
  }

  // Barkskin folds in its companion's combat auras. The damage-taken aura is a PERCENT, not a flat
  // reduction. Cite: Spell.sql 22839; Unit.cpp:7628.
  if (id === BARKSKIN_SPELL_ID) {
    const dur = durFromIndex(spell.durationIndex) ?? 15_000;
    // Self-buffs: amount is negative (damage taken / haste) but must NOT use the legacy "amount < 0 ⇒
    // hostile" path. Cite: combat.ts isHostileBuffEffect; Spell.sql 22812 targetA=1 (self).
    if (!effects.some((e) => e.kind === 'buff' && e.mod === 'physical_taken_pct')) {
      effects.push({
        kind: 'buff',
        mod: 'physical_taken_pct',
        amount: BARKSKIN_PHYSICAL_TAKEN_AMOUNT,
        durationMs: dur,
        hostile: false,
      });
    }
    if (!effects.some((e) => e.kind === 'buff' && e.mod === 'haste')) {
      effects.push({
        kind: 'buff',
        mod: 'haste',
        amount: BARKSKIN_HASTE_AMOUNT,
        durationMs: dur,
        hostile: false,
      });
    }
  }

  // ── Frenzied Regeneration: PERIODIC_TRIGGER trigger=0 scripted ───────────
  // Cite: SpellAuras.cpp:1104–1116.
  if (FRENZIED_REGEN_SPELL_IDS.has(id) && !effects.some((e) => e.kind === 'restore_health')) {
    const raw = (spell.rawEffects ?? []).find((r) => (r.effect | 0) === 6 && (r.auraName | 0) === 23);
    if (raw) {
      // LifePerRage = modifier amount (bp+1): r1=10, r2=15, r3=20.
      const lifePerRage = effectBaseAmount(raw, {});
      const tickMs = (raw.amplitude | 0) || 1000;
      const durationMs = durFromIndex(spell.durationIndex) ?? 10_000;
      // Max tick heal when rage pool ≥ 10 display (stored 100):
      // FRTriggerBasePoints = lRage * LifePerRage / 10. Cite: :1114.
      const amountPerTick = Math.max(
        1,
        Math.trunc((FRENZIED_REGEN_MAX_STORED_RAGE * lifePerRage) / 10),
      );
      effects.push({
        kind: 'restore_health',
        amountPerTick,
        tickMs,
        durationMs,
      });
    }
  }

  // ── Execute: DUMMY OnCast → direct damage (base + rage * mult) ────────────
  // Cite: Warrior.cpp:22–29; replaces empty trigger→26651 dead-proc chain.
  if (
    ((spell.spellFamilyName ?? 0) | 0) === SPELLFAMILY_WARRIOR
    && ((Number(spell.spellFamilyFlags) || 0) & EXECUTE_FAMILY_FLAGS) === EXECUTE_FAMILY_FLAGS
    && EXECUTE_DMG_MULTIPLIER[id] != null
  ) {
    const raw0 = (spell.rawEffects ?? []).find((r) => (r.effect | 0) === 3);
    if (raw0) {
      const base = effectBaseAmount(raw0, {});
      const mult = EXECUTE_DMG_MULTIPLIER[id]!;
      // Rage not available at census-time → base only; combat passes rage via ctx later.
      // materializeExecuteWithRage in resolveCombatSpell supplies rage when present.
      const rage = 0;
      const amount = executeDamageAmount(base, rage, mult);
      // Replace trigger-only shell with real damage.
      effects = effects.filter((e) => e.kind !== 'trigger_spell');
      if (!effects.some((e) => e.kind === 'direct_damage')) {
        effects.push({
          kind: 'direct_damage',
          school: 'physical',
          min: amount,
          max: amount,
        });
      }
    }
  }

  return effects;
}

/** Re-apply Execute damage with cast-time rage (display 0–100). Cite: Warrior.cpp:26–28. */
export function applyExecuteRageToEffects(
  spell: SpellDef,
  effects: SpellEffect[],
  rageDisplay: number | undefined,
): SpellEffect[] {
  const id = spell.id | 0;
  const mult = EXECUTE_DMG_MULTIPLIER[id];
  if (mult == null || rageDisplay == null) return effects;
  const raw0 = (spell.rawEffects ?? []).find((r) => (r.effect | 0) === 3);
  if (!raw0) return effects;
  const base = effectBaseAmount(raw0, {});
  const amount = executeDamageAmount(base, rageDisplay, mult);
  return effects.map((e) =>
    e.kind === 'direct_damage'
      ? { ...e, min: amount, max: amount }
      : e,
  );
}

