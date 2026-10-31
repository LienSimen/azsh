// The runtime consumer for the two spell-modifier auras. Combat reads effects, not interpreter intents,
// so this turns them into the rows the cast, crit, damage and duration pipelines actually apply.

import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import { applySpellMod, type SpellMod, type SpellModOpLabel } from './spellMods.ts';

/** SpellDefines.h:396–424 — numbers from that enum, not the brief's later-expansion list. */
export const SPELLMOD_DAMAGE = 0;
export const SPELLMOD_DURATION = 1;
export const SPELLMOD_THREAT = 2;
export const SPELLMOD_RADIUS = 6;
export const SPELLMOD_CRITICAL_CHANCE = 7;
export const SPELLMOD_ALL_EFFECTS = 8;
export const SPELLMOD_NOT_LOSE_CASTING_TIME = 9;
export const SPELLMOD_CASTING_TIME = 10;
export const SPELLMOD_COOLDOWN = 11;
export const SPELLMOD_COST = 14;
export const SPELLMOD_DOT = 22;
export const SPELLMOD_SPELL_BONUS_DAMAGE = 24;

/** Orc Command racial — pet damage_done_pct special, not a self ALL_EFFECTS owned mod. */
const COMMAND_RACIAL_IDS = new Set([20575, 20576]);

export interface SpellModIntentLike {
  kind: string;
  spellModOp: number;
  amount: number;
  durationMs: number;
  auraCharges?: number;
  familyFlags?: number;
}

export interface OwnedSpellMod {
  spellId: number;
  op: number;
  type: 'flat' | 'pct';
  value: number;
  familyName?: number;
  familyFlags?: number;
}

export interface SpellModOwner {
  ownedSpellMods?: readonly OwnedSpellMod[] | null;
}

function opLabel(op: number): SpellModOpLabel {
  switch (op) {
    case SPELLMOD_CASTING_TIME: return 'CASTING_TIME';
    case SPELLMOD_COST: return 'COST';
    case SPELLMOD_DAMAGE: return 'DAMAGE';
    case SPELLMOD_DOT: return 'DOT';
    case SPELLMOD_DURATION: return 'DURATION';
    case SPELLMOD_CRITICAL_CHANCE: return 'CRITICAL_CHANCE';
    case SPELLMOD_THREAT: return 'THREAT';
    case SPELLMOD_RADIUS: return 'RADIUS';
    case SPELLMOD_COOLDOWN: return 'COOLDOWN';
    case SPELLMOD_ALL_EFFECTS: return 'ALL_EFFECTS';
    case SPELLMOD_NOT_LOSE_CASTING_TIME: return 'NOT_LOSE_CASTING_TIME';
    case SPELLMOD_SPELL_BONUS_DAMAGE: return 'SPELL_BONUS_DAMAGE';
    default: return `OP_${op}`;
  }
}

// isAffectedOnSpell: the same family name, then the mask against the flags. A ZERO mask means no
// affect row at all, so it falls back to the family alone. Cite: Player.cpp:350-357.
export function isSpellAffectedByMod(
  mod: { spellId?: number; familyName?: number; spellFamilyName?: number; familyFlags?: number },
  spell: Pick<SpellDef, 'id' | 'spellFamilyName' | 'spellFamilyFlags' | 'spellClassMask'>,
): boolean {
  if (mod.spellId != null && spell.id === mod.spellId) return false;
  // OwnedSpellMod.familyName / PendingSpellMod.spellFamilyName — same C++ field.
  const fam = (mod.familyName ?? mod.spellFamilyName ?? 0) | 0;
  if (fam !== 0 && ((spell.spellFamilyName ?? 0) | 0) !== fam) return false;
  const mask = (mod.familyFlags ?? 0) | 0;
  if (mask !== 0) {
    const flags = Number(spell.spellFamilyFlags ?? spell.spellClassMask?.[0] ?? 0) | 0;
    if ((flags & mask) === 0) return false;
  }
  return true;
}

/** SpellAuras.cpp:912-917 HandleAddModifier — DBC procCharges 0, the C++ stamps 1 on these two. */
export const CUSTOM_AURA_CHARGE_1_IDS: ReadonlySet<number> = new Set([17941, 22008]);

type ChargeCarrier = Pick<SpellDef, 'passive' | 'procCharges' | 'stackAmount'> & { id?: number };

// SpellModifier::isFinite is `charges > 0`, and StackAmount > 1 passes 0 so a stacking holder never
// expires at use. Cite: SpellAuras.cpp:929-931; PlayerDefines.h:60 SpellModifier.
export function spellModCharges(spell: ChargeCarrier | null | undefined): number {
  if (!spell || spell.passive) return 0;
  const custom = CUSTOM_AURA_CHARGE_1_IDS.has((spell.id ?? 0) | 0) ? 1 : 0;
  const charges = custom || ((spell.procCharges ?? 0) | 0);
  if (charges <= 0) return 0;
  return ((spell.stackAmount ?? 0) | 0) > 1 ? 0 : charges;
}

/** Charged / until-next-cast (PoM, Clearcasting, Cold Blood) vs lasting (Arcane Power, Barkskin). */
export function isNextCastSpellMod(
  intent: SpellModIntentLike,
  spell?: ChargeCarrier | null,
): boolean {
  if (spell?.passive) return false;
  if ((intent.auraCharges ?? 0) > 0) return true;
  if (spell) return spellModCharges(spell) > 0;
  return ((intent.durationMs ?? 0) | 0) === 0;
}

// The FINITE twin of ownedSpellModsFromSpell: the 107/108 rows of a charged holder, as the C++
// SpellModifier(op, type, value, mask) list that the next matching cast consumes.
export function chargedSpellModsFromSpell(
  spell: SpellDef | undefined | null,
): OwnedSpellMod[] {
  if (!spell || spellModCharges(spell) <= 0) return [];
  const out: OwnedSpellMod[] = [];
  for (const raw of spell.rawEffects ?? []) {
    const aura = (raw.auraName ?? 0) | 0;
    if (aura !== 107 && aura !== 108) continue;
    // Cite: DBCStructure.h:817 CalculateSimpleValue = EffectBasePoints + EffectBaseDice.
    const value = ((raw.basePoints ?? 0) | 0) + Math.max((raw.baseDice ?? 0) | 0, 0);
    if (!value) continue;
    out.push({
      spellId: spell.id | 0,
      op: (raw.miscValue ?? 0) | 0,
      type: aura === 108 ? 'pct' : 'flat',
      value,
      familyName: spell.spellFamilyName,
      familyFlags: (raw.itemType ?? 0) | 0,
    });
  }
  return out;
}

export function applyOwnedSpellMod(
  owner: SpellModOwner | null | undefined,
  spell: Pick<SpellDef, 'id' | 'spellFamilyName' | 'spellFamilyFlags' | 'spellClassMask'>,
  op: number,
  basevalue: number,
): number {
  const rows = owner?.ownedSpellMods;
  if (!rows?.length) return basevalue;
  const mods: SpellMod[] = [];
  const label = opLabel(op);
  for (const m of rows) {
    if (m.op !== op) continue;
    if (!isSpellAffectedByMod(m, spell)) continue;
    mods.push({ type: m.type, value: m.value, op: label });
  }
  if (!mods.length) return basevalue;
  return applySpellMod(basevalue, mods, { op: label }).value;
}

function ownedThreatSpellModPct(
  owner: SpellModOwner | null | undefined,
  spell: Pick<SpellDef, 'id' | 'spellFamilyName' | 'spellFamilyFlags' | 'spellClassMask'>,
): number {
  const rows = owner?.ownedSpellMods;
  if (!rows?.length) return 0;
  let total = 0;
  for (const m of rows) {
    if (m.op !== SPELLMOD_THREAT) continue;
    if (!isSpellAffectedByMod(m, spell)) continue;
    total += m.value;
  }
  return total;
}

export function stripOwnedSpellMods(owner: { ownedSpellMods?: OwnedSpellMod[]; radiusSpellMods?: SpellMod[] }, spellId: number): void {
  if (owner.ownedSpellMods?.length) {
    owner.ownedSpellMods = owner.ownedSpellMods.filter((m) => m.spellId !== spellId);
  }
  if (owner.radiusSpellMods?.length) {
    owner.radiusSpellMods = owner.radiusSpellMods.filter((m) => m.id !== `owned:${spellId}:${SPELLMOD_RADIUS}`);
  }
}

export function addOwnedSpellMods(
  owner: { ownedSpellMods?: OwnedSpellMod[]; radiusSpellMods?: SpellMod[] },
  mods: readonly OwnedSpellMod[],
): void {
  if (!mods.length) return;
  if (!owner.ownedSpellMods) owner.ownedSpellMods = [];
  for (const m of mods) {
    owner.ownedSpellMods.push({ ...m });
    if (m.op === SPELLMOD_RADIUS) {
      if (!owner.radiusSpellMods) owner.radiusSpellMods = [];
      owner.radiusSpellMods.push({
        type: m.type,
        value: m.value,
        op: 'RADIUS',
        id: `owned:${m.spellId}:${m.op}`,
      });
    }
  }
}

function intentFamilyFlags(intent: SpellModIntentLike): number {
  return (intent.familyFlags ?? 0) | 0;
}

function ownedFromIntent(
  intent: SpellModIntentLike,
  spell: { id?: number; spellFamilyName?: number } | undefined,
  type: 'flat' | 'pct',
): OwnedSpellMod {
  return {
    spellId: (spell?.id ?? 0) | 0,
    op: intent.spellModOp | 0,
    type,
    value: intent.amount,
    familyName: spell?.spellFamilyName,
    familyFlags: intentFamilyFlags(intent),
  };
}

// Materialize the two spell-modifier auras into combat effects: a charged one becomes a next-cast
// modifier, a lasting percent one a damage percent, and the rest owned modifier rows.
export function materializeSpellModIntents(
  intents: readonly {
    kind: string;
    spellModOp?: number;
    amount?: number;
    durationMs?: number;
    auraCharges?: number;
    familyFlags?: number;
  }[] | undefined,
  existing: SpellEffect[],
  spell?: Pick<SpellDef, 'id' | 'passive' | 'procCharges' | 'stackAmount' | 'spellFamilyName'>,
): SpellEffect[] {
  if (!intents?.length) return existing;

  let freeCost = false;
  let instant = false;
  let costModPct: number | undefined;
  let critAdd: number | undefined;
  let damageDonePct: number | undefined;
  let effectPct: number | undefined;
  let castTimeFlat: number | undefined;
  let pushbackResist: number | undefined;
  let nextCastDurationMs = 0;
  let lastingDurationMs = 0;
  let any = false;
  const owned: OwnedSpellMod[] = [];
  let nextCastFamilyFlags = 0;

  for (const rawIntent of intents) {
    if (rawIntent.kind !== 'add_flat_modifier' && rawIntent.kind !== 'add_pct_modifier') continue;
    const intent: SpellModIntentLike = {
      kind: rawIntent.kind,
      spellModOp: rawIntent.spellModOp ?? 0,
      amount: rawIntent.amount ?? 0,
      durationMs: rawIntent.durationMs ?? 0,
      auraCharges: rawIntent.auraCharges,
      familyFlags: rawIntent.familyFlags,
    };
    any = true;
    const op = intent.spellModOp | 0;
    const amt = intent.amount;
    const pct = intent.kind === 'add_pct_modifier';
    const nextCast = isNextCastSpellMod(intent, spell);
    const dur = intent.durationMs | 0;
    if (nextCast) nextCastDurationMs = Math.max(nextCastDurationMs, dur);
    else lastingDurationMs = Math.max(lastingDurationMs, dur);

    if (op === SPELLMOD_COST) {
      if (nextCast && pct) {
        if (amt <= -100) freeCost = true;
        else costModPct = (costModPct ?? 0) + amt;
      } else if (!nextCast && amt !== 0) {
        owned.push(ownedFromIntent(intent, spell, pct ? 'pct' : 'flat'));
      }
    } else if (op === SPELLMOD_CASTING_TIME) {
      if (nextCast) {
        if (pct && amt <= -100) instant = true;
        else if (amt !== 0) castTimeFlat = (castTimeFlat ?? 0) + amt;
        const flags = intentFamilyFlags(intent);
        if (flags) nextCastFamilyFlags |= flags;
      } else if (amt !== 0) {
        owned.push(ownedFromIntent(intent, spell, pct ? 'pct' : 'flat'));
      }
    } else if (op === SPELLMOD_CRITICAL_CHANCE) {
      if (nextCast) {
        critAdd = (critAdd ?? 0) + amt / 100;
        const flags = intentFamilyFlags(intent);
        if (flags) nextCastFamilyFlags |= flags;
      } else if (amt !== 0) {
        owned.push(ownedFromIntent(intent, spell, pct ? 'pct' : 'flat'));
      }
    } else if (op === SPELLMOD_DAMAGE || op === SPELLMOD_SPELL_BONUS_DAMAGE) {
      if (pct && amt !== 0) damageDonePct = (damageDonePct ?? 0) + amt;
      else if (!pct && amt !== 0 && !nextCast) {
        owned.push(ownedFromIntent(intent, spell, 'flat'));
      }
    } else if (op === SPELLMOD_DOT && damageDonePct == null) {
      if (pct && amt !== 0) damageDonePct = amt;
      else if (!pct && amt !== 0 && !nextCast) {
        owned.push(ownedFromIntent(intent, spell, 'flat'));
      }
    } else if (op === SPELLMOD_DOT && amt !== 0 && !pct && !nextCast) {
      owned.push(ownedFromIntent(intent, spell, 'flat'));
    } else if (op === SPELLMOD_ALL_EFFECTS) {
      if (nextCast && pct && amt !== 0) effectPct = (effectPct ?? 0) + amt;
      else if (!nextCast && amt !== 0) {
        owned.push(ownedFromIntent(intent, spell, pct ? 'pct' : 'flat'));
      }
    } else if (op === SPELLMOD_NOT_LOSE_CASTING_TIME) {
      if (amt !== 0) pushbackResist = (pushbackResist ?? 0) + amt;
    } else if (!nextCast && amt !== 0) {
      // DURATION / THREAT / COOLDOWN / RADIUS / leftover lasting ops with a live consume site.
      owned.push(ownedFromIntent(intent, spell, pct ? 'pct' : 'flat'));
    }
  }

  if (!any) return existing;

  const out: SpellEffect[] = [];
  if (damageDonePct != null && damageDonePct !== 0) {
    out.push({
      kind: 'buff',
      mod: 'damage_done_pct',
      amount: damageDonePct,
      durationMs: lastingDurationMs > 0 ? lastingDurationMs : (nextCastDurationMs > 0 ? nextCastDurationMs : 15_000),
      applyTo: 'self',
    });
  }
  if (pushbackResist != null && pushbackResist !== 0) {
    out.push({
      kind: 'resist_pushback',
      amount: pushbackResist,
      durationMs: lastingDurationMs > 0 ? lastingDurationMs : (nextCastDurationMs > 0 ? nextCastDurationMs : 15_000),
      applyTo: 'self',
    } as never);
  }
  if (freeCost || instant || costModPct != null || critAdd != null || effectPct != null || castTimeFlat != null) {
    out.push({
      kind: 'next_cast_mod',
      appliesTo: 'any',
      durationMs: nextCastDurationMs,
      ...(freeCost ? { freeCost: true as const } : {}),
      ...(instant ? { instant: true as const } : {}),
      ...(costModPct != null ? { costModPct, costPct: costModPct } : {}),
      ...(critAdd != null ? { critAdd } : {}),
      ...(effectPct != null ? { effectPct } : {}),
      ...(castTimeFlat != null ? { castTimeFlat } : {}),
      ...(nextCastFamilyFlags ? { familyFlags: nextCastFamilyFlags } : {}),
    });
  }
  if (owned.length) {
    out.push({
      kind: 'owned_spell_mods',
      durationMs: lastingDurationMs,
      applyTo: 'self',
      mods: owned.map((m) => ({
        op: m.op,
        type: m.type,
        amount: m.value,
        familyFlags: m.familyFlags,
      })),
    });
  }
  if (!out.length && any && existing.length === 0) {
    let amt = 0;
    for (const intent of intents) {
      if (intent.kind !== 'add_flat_modifier' && intent.kind !== 'add_pct_modifier') continue;
      if (intent.amount) { amt = intent.amount; break; }
    }
    out.push({
      kind: 'buff',
      mod: 'spell_mod',
      amount: amt,
      durationMs: lastingDurationMs > 0 ? lastingDurationMs : 15_000,
      applyTo: 'self',
    } as never);
  }
  if (!out.length) return existing;
  const extra = out.filter((e) => {
    if (e.kind === 'resist_pushback') return !existing.some((x) => x.kind === 'resist_pushback');
    if (e.kind === 'next_cast_mod') return !existing.some((x) => x.kind === 'next_cast_mod');
    if (e.kind === 'owned_spell_mods') return !existing.some((x) => x.kind === 'owned_spell_mods');
    if (e.kind === 'buff' && e.mod === 'damage_done_pct') {
      return !existing.some((x) => x.kind === 'buff' && x.mod === 'damage_done_pct');
    }
    if (e.kind === 'buff' && String(e.mod) === 'spell_mod') {
      return !existing.some((x) => x.kind === 'buff' && String(x.mod) === 'spell_mod');
    }
    return true;
  });
  return extra.length ? [...existing, ...extra] : existing;
}

// Permanent / lasting 107/108 rows from a bake spell (known passive, set bonus, OOC aura). Skips charged
// next-cast auras (those arm startPendingSpellMod).
export function ownedSpellModsFromSpell(
  spell: SpellDef | undefined | null,
): OwnedSpellMod[] {
  if (!spell || COMMAND_RACIAL_IDS.has(spell.id | 0)) return [];
  const out: OwnedSpellMod[] = [];
  for (const raw of spell.rawEffects ?? []) {
    const aura = (raw.auraName ?? 0) | 0;
    if (aura !== 107 && aura !== 108) continue;
    const intent: SpellModIntentLike = {
      kind: aura === 108 ? 'add_pct_modifier' : 'add_flat_modifier',
      spellModOp: (raw.miscValue ?? 0) | 0,
      amount: ((raw.basePoints ?? 0) | 0) + Math.max((raw.baseDice ?? 0) | 0, 0),
      durationMs: 0,
      familyFlags: (raw.itemType ?? 0) | 0,
    };
    if (isNextCastSpellMod(intent, spell)) continue;
    if (!intent.amount) continue;
    out.push({
      spellId: spell.id | 0,
      op: intent.spellModOp,
      type: aura === 108 ? 'pct' : 'flat',
      value: intent.amount,
      familyName: spell.spellFamilyName,
      familyFlags: intent.familyFlags,
    });
  }
  return out;
}
