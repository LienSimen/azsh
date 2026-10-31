// Pack-strength budget (COMBAT-INTERACTION-V2 §Pack-strength budget / S4.6).
//
// Threat weight per creature = eliteRank × heavyAbilityCount × levelDeltaToParty,
// all sourced from creature_template (+ baked spell kits). Over-budget packs are
// SPLIT into sequential sub-pulls — never HP/damage nerfed.
//
// Sources (cite, do not invent creature stats):
//   SharedDefines.h CREATURE_ELITE_*              Rank column
//   SpellEffectDefines.h SPELL_EFFECT_*           heavy special classification
//   SpellMgr.h IsEffectHandledImmediatelySpellLaunch  damage/heal launch effects
//   creature_template.Rank / spells / level       CreatureDef.scaling.rank, .spells, .level
//   dungeonRoute MAYHEM_SOFT_CAP / CHAIN_MAX_ATOMS + AUTHORING prefer-4  budget presets
//
// Pure: no DOM, no Date.now, no Math.random (LOCK 4).

import type { CreatureDef, EncounterDef, EncounterPackMember, SpellDef } from '../data/schema.ts';
import { CREATURE_ELITE } from '../data/schema.ts';
import type { FusionAbsorbGuard, PullFusion, RouteDensity } from './dungeonRoute.ts';
import { MAYHEM_SOFT_CAP, CHAIN_MAX_ATOMS } from './dungeonRoute.ts';

// ---- Spell effect ids (SpellEffectDefines.h) ---------------------------------

/** SPELL_EFFECT_SCHOOL_DAMAGE */
export const SPELL_EFFECT_SCHOOL_DAMAGE = 2;
/** SPELL_EFFECT_HEALTH_LEECH */
export const SPELL_EFFECT_HEALTH_LEECH = 9;
/** SPELL_EFFECT_HEAL — pack healers are high-pressure specials */
export const SPELL_EFFECT_HEAL = 10;
/** SPELL_EFFECT_WEAPON_DAMAGE_NOSCHOOL */
export const SPELL_EFFECT_WEAPON_DAMAGE_NOSCHOOL = 17;
/** SPELL_EFFECT_WEAPON_PERCENT_DAMAGE — Mortal Strike family */
export const SPELL_EFFECT_WEAPON_PERCENT_DAMAGE = 31;
/** SPELL_EFFECT_WEAPON_DAMAGE */
export const SPELL_EFFECT_WEAPON_DAMAGE = 58;
/** SPELL_EFFECT_HEAL_MECHANICAL */
export const SPELL_EFFECT_HEAL_MECHANICAL = 75;
/** SPELL_EFFECT_NORMALIZED_WEAPON_DMG */
export const SPELL_EFFECT_NORMALIZED_WEAPON_DMG = 121;
/** SPELL_EFFECT_APPLY_AURA */
export const SPELL_EFFECT_APPLY_AURA = 6;

/** SPELL_AURA_PERIODIC_DAMAGE (SharedDefines AuraType) */
export const SPELL_AURA_PERIODIC_DAMAGE = 3;
/** SPELL_AURA_PERIODIC_HEAL */
export const SPELL_AURA_PERIODIC_HEAL = 8;
/** SPELL_AURA_PERIODIC_LEECH */
export const SPELL_AURA_PERIODIC_LEECH = 53;
/** SPELL_AURA_PERIODIC_DAMAGE_PERCENT */
export const SPELL_AURA_PERIODIC_DAMAGE_PERCENT = 89;

// Direct damage / heal launch effects that pressure a pack (tank spikes, healer adds). Cite: SpellMgr.h
// IsEffectHandledImmediatelySpellLaunch ~144–152 (damage + heal subset).
const HEAVY_LAUNCH_EFFECTS: ReadonlySet<number> = new Set([
  SPELL_EFFECT_SCHOOL_DAMAGE,
  SPELL_EFFECT_WEAPON_DAMAGE_NOSCHOOL,
  SPELL_EFFECT_WEAPON_PERCENT_DAMAGE,
  SPELL_EFFECT_WEAPON_DAMAGE,
  SPELL_EFFECT_NORMALIZED_WEAPON_DMG,
  SPELL_EFFECT_HEALTH_LEECH,
  SPELL_EFFECT_HEAL,
  SPELL_EFFECT_HEAL_MECHANICAL,
]);

const HEAVY_PERIODIC_AURAS: ReadonlySet<number> = new Set([
  SPELL_AURA_PERIODIC_DAMAGE,
  SPELL_AURA_PERIODIC_HEAL,
  SPELL_AURA_PERIODIC_LEECH,
  SPELL_AURA_PERIODIC_DAMAGE_PERCENT,
]);

/** Synthesized SpellEffect.kind values that count as heavy when rawEffects absent. */
const HEAVY_SYNTH_KINDS: ReadonlySet<string> = new Set([
  'direct_damage',
  'weapon_damage',
  'normalized_weapon_damage',
  'heal',
  'dot',
  'health_leech',
]);

// ---- Presets / budgets ------------------------------------------------------

// Pack-strength budget presets (COMBAT-INTERACTION-V2 §Pack-strength budget). Speedrun = low, Normal =
// medium, Full-Mayhem = high.
export type PackBudgetPreset = 'speedrun' | 'normal' | 'fullMayhem';

// CHAIN_MAX_ATOMS re-exported from dungeonRoute (vision §8b.4 chain upper target).
export { CHAIN_MAX_ATOMS };

// AUTHORING.md / dungeon `splitPackSizes` prefer default — classic mono pack feel. Kept for authoring
// tools; NOT a threat budget (see PACK_THREAT_BUDGET).
export const AUTHORING_PREFER_PACK_SIZE = 4;

/**
 * Per-pack threat-weight budgets by preset, in EFFECTIVE-COMBATANT units
 * (creatureThreatWeight: plain at-level mob ≈ 1, elite special-caster ≈ 2.5–3.75).
 * Calibrated against the real baked packs of all 19 classic 5-mans so that
 * authored trash pulls pass intact at their intended entry level — only
 * genuinely oversized pulls (8+ stacked elite casters, runaway fusion merges)
 * split. Never an HP/damage multiplier (COMBAT-INTERACTION-V2 guardrails).
 *
 * ⚠️ These were 20 / 24 / 40 until 2026-08-14, and the note above says why that was never
 * safe: "authored trash pulls pass intact" is a statement about the DATA, not about whether
 * the intended party survives. `budgetOverride` below exists precisely to plot the second
 * number, and plotting it says the old table was a level-60 calibration. In these units an
 * at-level elite is exactly 2.0 (1 body + eliteSurcharge 1), so `normal: 24` licensed a
 * TWELVE-elite simultaneous pull — a raid pull, not a 5-man pull.
 *
 * probe-dungeon-completion, all 26 defs, each at its OWN band (def.levelRange, not --level 60):
 *
 *   budget  = elites/pull   complete   bossesKilled   stalled
 *       24            12       6/26         63/218         20
 *       12             6       6/26         75/218         20
 *       10             5      10/26         91/218         16
 *        8             4      12/26        111/218         14   <- shipped
 *        6             3      12/26        109/218         14
 *
 * 8 is both the principled value — four at-level elites is what a classic 5-man actually pulls
 * — and the measured peak: the curve is bracketed on BOTH sides, 10 is clearly worse and 6 buys
 * nothing (same 12 instances, two fewer bosses). So this is not a number fitted to a score;
 * tightening past it stops paying. Nothing is removed by this — `expandRouteByPackBudget` splits an
 * over-budget pack into SEQUENTIAL sub-pulls, which is what a real player does when they pull
 * half a room. speedrun/fullMayhem keep the documented ladder shape and their old ratios to
 * normal (0.83x and 1.67x).
 */
export const PACK_THREAT_BUDGET: Readonly<Record<PackBudgetPreset, number>> = {
  speedrun: 7,
  normal: 8,
  fullMayhem: 13,
};

/**
 * Raids keep the pre-2026-08-14 table. `enterInstance` passes a packBudget for EVERY
 * instance — `asRaid` only changes seating — so a flat tightening would have split 40-man
 * raid trash into four-elite pulls as well. The curve above was measured on the 5/10-man set
 * only (probe-dungeon-completion skips `maxPlayers > 10`; raids are probe-play-raid's lane
 * and docs/archive/raids/PLAN.md's program), so raids keep the numbers they were tuned under until
 * someone plots the same curve for them.
 */
export const PACK_THREAT_BUDGET_RAID: Readonly<Record<PackBudgetPreset, number>> = {
  speedrun: 20,
  normal: 24,
  fullMayhem: 40,
};

/** Raid-sized groups (>10) keep the legacy budget; 5- and 10-mans use the measured one. */
export const RAID_PARTY_SIZE_MIN = 11;

/**
 * Cap on simultaneous heavy-special streams (creatures with ≥1 distinct heavy
 * ability). Same ladder shape as threat budgets — Full-Mayhem highest.
 * Note: splitting makes runs SLOWER (more pulls), so Speedrun is only slightly
 * tighter than Normal — its tempo comes from route density + chain fusion,
 * never from shredding authored packs.
 */
export const PACK_HEAVY_SPECIAL_CAP: Readonly<Record<PackBudgetPreset, number>> = {
  speedrun: 8,
  normal: 10,
  fullMayhem: 12,
};

/**
 * Map route density + fusion knobs onto the budget presets.
 *
 * The `speedrun` tier is no longer selectable from here — RouteDensity 'speedrun' was
 * deleted 2026-08-17 — but the tier stays in the tables: it is the pack-STRENGTH axis, and
 * `packBudget.preset` can still name it directly.
 */
export function packBudgetPresetFor(
  density: RouteDensity,
  fusion: PullFusion = 'single',
): PackBudgetPreset {
  // Full clear and/or mayhem fusion = high budget ("Full-Mayhem").
  if (density === 'full' || fusion === 'mayhem') return 'fullMayhem';
  return 'normal';
}

/**
 * Measurement-only override: `PC_PACK_THREAT_BUDGET=18` makes probe sweeps able to produce a
 * completion-vs-budget curve without editing this table. Node-only and absent in the browser,
 * so it can never change what a player gets. The calibration above was validated against
 * "authored packs pass intact" and never against "can the intended party clear the dungeon" —
 * that second number is probe-dungeon-completion, and this knob is how it gets plotted.
 */
function budgetOverride(): number | null {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.PC_PACK_THREAT_BUDGET;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function threatBudgetFor(preset: PackBudgetPreset, groupSize?: number): number {
  const table = (groupSize ?? 5) >= RAID_PARTY_SIZE_MIN
    ? PACK_THREAT_BUDGET_RAID
    : PACK_THREAT_BUDGET;
  return budgetOverride() ?? table[preset];
}

export function heavySpecialCapFor(preset: PackBudgetPreset): number {
  return PACK_HEAVY_SPECIAL_CAP[preset];
}

// ---- Creature inputs (template-sourced) -------------------------------------

export type SpellLookup = (spellId: number) => SpellDef | undefined;
export type CreatureLookup = (entry: number) => CreatureDef | undefined;

/** True when a baked spell is a heavy combat special (damage / heal pressure). */
export function isHeavySpecialSpell(spell: SpellDef | null | undefined): boolean {
  if (!spell) return false;
  for (const e of spell.effects ?? []) {
    if (HEAVY_SYNTH_KINDS.has(e.kind)) return true;
  }
  for (const raw of spell.rawEffects ?? []) {
    if (HEAVY_LAUNCH_EFFECTS.has(raw.effect)) return true;
    if (raw.effect === SPELL_EFFECT_APPLY_AURA && HEAVY_PERIODIC_AURAS.has(raw.auraName)) {
      return true;
    }
  }
  return false;
}

/**
 * Count of DISTINCT heavy specials on a creature's cast kit
 * (creature_template_spells + AI). Rank variants of the same spell (Heal r4 +
 * Heal r0) dedupe by name — a kit is pressure per distinct ability, not per
 * baked rank row. Unknown / missing spell rows do not invent abilities.
 */
export function heavyAbilityCount(
  creature: CreatureDef | null | undefined,
  spellOf: SpellLookup,
): number {
  if (!creature) return 0;
  const ids = creature.spells ?? [];
  const distinct = new Set<string>();
  for (const id of ids) {
    const sp = spellOf(id);
    if (isHeavySpecialSpell(sp)) distinct.add(sp!.name ?? String(id));
  }
  return distinct.size;
}

/** Rank from template scaling when present; else NORMAL (0). */
export function creatureEliteRank(creature: CreatureDef | null | undefined): number {
  if (!creature) return CREATURE_ELITE.NORMAL;
  const r = creature.scaling?.rank;
  return typeof r === 'number' && Number.isFinite(r) ? r : CREATURE_ELITE.NORMAL;
}

export function creatureLevel(creature: CreatureDef | null | undefined, fallback: number): number {
  if (!creature) return fallback;
  if (typeof creature.level === 'number' && Number.isFinite(creature.level)) return creature.level;
  const minL = creature.scaling?.minLevel;
  if (typeof minL === 'number' && Number.isFinite(minL)) return minL;
  return fallback;
}

/**
 * Additive elite surcharge (effective-combatant units).
 * CREATURE_ELITE ladder: NORMAL +0, ELITE +1, RAREELITE +1.5, WORLDBOSS +2;
 * RARE (loot-special normal mob) +0.5. Cite: SharedDefines.h CREATURE_ELITE_*.
 */
function eliteSurcharge(rank: number): number {
  const r = Number.isFinite(rank) ? Math.trunc(rank) : CREATURE_ELITE.NORMAL;
  if (r === CREATURE_ELITE.ELITE) return 1;
  if (r === CREATURE_ELITE.RAREELITE) return 1.5;
  if (r === CREATURE_ELITE.WORLDBOSS) return 2;
  if (r === CREATURE_ELITE.RARE) return 0.5;
  return 0;
}

/**
 * Single-creature threat weight in EFFECTIVE-COMBATANT units — additive and
 * bounded, so the budget stays headcount-shaped:
 *   1 (a body) + eliteSurcharge + min(distinctHeavies, 2)·0.5
 *     + clamp(levelDelta, −2..+3)·0.25
 * A plain at-level mob ≈ 1; an elite special-caster 2 levels up ≈ 3;
 * nothing multiplies into the old runaway 6–34 range that shattered every
 * authored pack into single-mob pulls.
 * Cite: COMBAT-INTERACTION-V2 §Pack-strength budget (split, never nerf).
 */
export function creatureThreatWeight(
  creature: CreatureDef | null | undefined,
  partyLevel: number,
  spellOf: SpellLookup,
): number {
  const rank = creatureEliteRank(creature);
  const heavy = heavyAbilityCount(creature, spellOf);
  const lvl = creatureLevel(creature, partyLevel);
  const pl = Number.isFinite(partyLevel) ? Math.trunc(partyLevel) : lvl;
  const delta = Math.max(-2, Math.min(3, Math.trunc(lvl) - pl));
  return 1 + eliteSurcharge(rank) + Math.min(heavy, 2) * 0.5 + delta * 0.25;
}

// ---- Pack aggregate ---------------------------------------------------------

/** One living hostile slot in a pull (primary or pack member copy). */
export interface PackCombatantSlot {
  creatureEntry: number;
  poolCandidates?: number[];
  /** Source spawn guid when known (split preserves relative order). */
  spawnGuid?: number;
}

/** Expand primary + pack[] into per-creature slots (stable authored order). */
export function expandEncounterCombatants(enc: EncounterDef): PackCombatantSlot[] {
  const slots: PackCombatantSlot[] = [{ creatureEntry: enc.creatureEntry }];
  if (enc.poolCandidates?.length) {
    slots[0]!.poolCandidates = [...enc.poolCandidates];
  }
  const guids = enc.spawnGuids ?? [];
  if (guids.length > 0) slots[0]!.spawnGuid = guids[0];

  let guidIdx = 1;
  for (const m of enc.pack ?? []) {
    const count = m.count > 0 ? Math.trunc(m.count) : 0;
    for (let i = 0; i < count; i++) {
      const slot: PackCombatantSlot = { creatureEntry: m.creatureEntry };
      if (m.poolCandidates?.length) slot.poolCandidates = [...m.poolCandidates];
      if (guidIdx < guids.length) slot.spawnGuid = guids[guidIdx];
      guidIdx++;
      slots.push(slot);
    }
  }
  return slots;
}

export interface PackThreatBreakdown {
  threatWeight: number;
  /** Creatures with ≥1 heavy special (simultaneous special streams). */
  simultaneousHeavySpecials: number;
  combatantCount: number;
}

export function packThreatBreakdown(
  slots: readonly PackCombatantSlot[],
  partyLevel: number,
  creatureOf: CreatureLookup,
  spellOf: SpellLookup,
): PackThreatBreakdown {
  let threatWeight = 0;
  let simultaneousHeavySpecials = 0;
  for (const s of slots) {
    const c = creatureOf(s.creatureEntry);
    const w = creatureThreatWeight(c, partyLevel, spellOf);
    threatWeight += w;
    if (heavyAbilityCount(c, spellOf) > 0) simultaneousHeavySpecials++;
  }
  return { threatWeight, simultaneousHeavySpecials, combatantCount: slots.length };
}

export function packExceedsBudget(
  breakdown: PackThreatBreakdown,
  preset: PackBudgetPreset,
  /** Party size the budget is for; >10 keeps the legacy raid table. */
  groupSize?: number,
): boolean {
  return (
    breakdown.threatWeight > threatBudgetFor(preset, groupSize)
    || breakdown.simultaneousHeavySpecials > heavySpecialCapFor(preset)
  );
}

// ---- Split (not nerf) -------------------------------------------------------

function slotsFitBudget(
  slots: readonly PackCombatantSlot[],
  partyLevel: number,
  creatureOf: CreatureLookup,
  spellOf: SpellLookup,
  preset: PackBudgetPreset,
  groupSize?: number,
): boolean {
  if (slots.length === 0) return true;
  return !packExceedsBudget(
    packThreatBreakdown(slots, partyLevel, creatureOf, spellOf), preset, groupSize,
  );
}

/**
 * Fusion absorb guard: refuse merging `next` over PACK_THREAT_BUDGET / heavy-special
 * cap, and over MAYHEM_SOFT_CAP threat (body softCap alone still fused WC Fang packs
 * to threat 12.75). First atom stays ungated in planFusionBatches.
 */
export function makeFusionBudgetGuard(
  partyLevel: number,
  creatureOf: CreatureLookup,
  spellOf: SpellLookup,
  preset: PackBudgetPreset,
  groupSize?: number,
): FusionAbsorbGuard {
  return (batchSoFar, next) => {
    const slots = [...batchSoFar, next].flatMap(expandEncounterCombatants);
    if (slots.length === 0) return true;
    const bd = packThreatBreakdown(slots, partyLevel, creatureOf, spellOf);
    const threatCap = Math.min(threatBudgetFor(preset, groupSize), MAYHEM_SOFT_CAP);
    if (bd.threatWeight > threatCap) return false;
    if (bd.simultaneousHeavySpecials > heavySpecialCapFor(preset)) return false;
    return true;
  };
}

/**
 * Greedy left-to-right bin pack: grow the current sub-pull while both caps hold;
 * open a new sub-pull when the next creature would exceed. Deterministic.
 * A single creature that alone exceeds budget still forms its own pull (never nerfed).
 */
export function partitionSlotsToBudget(
  slots: readonly PackCombatantSlot[],
  partyLevel: number,
  creatureOf: CreatureLookup,
  spellOf: SpellLookup,
  preset: PackBudgetPreset,
  /** Party size the budget is for; >10 keeps the legacy raid table. */
  groupSize?: number,
): PackCombatantSlot[][] {
  if (slots.length === 0) return [];
  const bins: PackCombatantSlot[][] = [];
  let cur: PackCombatantSlot[] = [];
  for (const slot of slots) {
    const trial = cur.length ? [...cur, slot] : [slot];
    if (cur.length > 0 && !slotsFitBudget(trial, partyLevel, creatureOf, spellOf, preset, groupSize)) {
      bins.push(cur);
      cur = [slot];
    } else {
      cur = trial;
    }
  }
  if (cur.length) bins.push(cur);
  return bins;
}

function slotsToEncounterShape(slots: readonly PackCombatantSlot[]): {
  creatureEntry: number;
  pack?: EncounterPackMember[];
  poolCandidates?: number[];
  spawnGuids?: number[];
} {
  if (slots.length === 0) {
    throw new Error('slotsToEncounterShape: empty');
  }
  const primary = slots[0]!;
  const pack: EncounterPackMember[] = [];
  // Collapse consecutive same-entry non-CSE copies into count rows; CSE stays count=1.
  let i = 1;
  while (i < slots.length) {
    const s = slots[i]!;
    if (s.poolCandidates?.length) {
      pack.push({
        creatureEntry: s.creatureEntry,
        count: 1,
        poolCandidates: [...s.poolCandidates],
      });
      i++;
      continue;
    }
    let count = 1;
    while (
      i + count < slots.length
      && slots[i + count]!.creatureEntry === s.creatureEntry
      && !slots[i + count]!.poolCandidates?.length
    ) {
      count++;
    }
    pack.push({ creatureEntry: s.creatureEntry, count });
    i += count;
  }
  const spawnGuids = slots.map((s) => s.spawnGuid).filter((g): g is number => g != null);
  return {
    creatureEntry: primary.creatureEntry,
    ...(primary.poolCandidates?.length ? { poolCandidates: [...primary.poolCandidates] } : {}),
    ...(pack.length ? { pack } : {}),
    ...(spawnGuids.length === slots.length ? { spawnGuids } : {}),
  };
}

/**
 * objectGate that sets a flag the same encounter also requires — the item/use
 * transforms the whole room at once (Dawn's Gambit). Door-trash objectGate that
 * only unlocks a later pack is not this (Deadmines Cannon / Pirate / Shipbuilder).
 * Cite: instance_scholomance.cpp:440-469 HandleDawnGambitEvent.
 */
function isSelfGatingObjectGate(enc: EncounterDef): boolean {
  const required = new Set<string>();
  const setByGate = new Set<string>();
  for (const ev of enc.events ?? []) {
    if (ev.kind === 'requiresFlag') required.add(ev.flag);
    if (ev.kind === 'objectGate') setByGate.add(ev.setsFlag);
  }
  for (const flag of setByGate) {
    if (required.has(flag)) return true;
  }
  return false;
}

/**
 * Bosses and multi-phase scripted trash stay one pull. Ordinary objectGate /
 * requiresFlag trash may still split — those gates ride the first atom, and
 * later atoms get requiresFlag so fusion cannot re-merge them (isFusionBreak).
 */
function isBudgetAtomic(enc: EncounterDef): boolean {
  if (enc.kind === 'boss') return true;
  if (isSelfGatingObjectGate(enc)) return true;
  for (const ev of enc.events ?? []) {
    if (ev.kind === 'onDeathSummon' || ev.kind === 'waves' || ev.kind === 'hpThreshold') {
      return true;
    }
  }
  return false;
}

/**
 * Split one encounter into sequential sub-pulls when over budget.
 * Bosses / multi-phase scripted pulls are never split. Under budget → [enc] untouched.
 * Sub-pulls after the first carry requiresFlag so fusion cannot re-merge them
 * (isFusionBreak) and route unlock stays sequential.
 */
export function splitEncounterToBudget(
  enc: EncounterDef,
  partyLevel: number,
  creatureOf: CreatureLookup,
  spellOf: SpellLookup,
  preset: PackBudgetPreset,
  /** Party size the budget is for; >10 keeps the legacy raid table. */
  groupSize?: number,
): EncounterDef[] {
  if (isBudgetAtomic(enc)) return [enc];

  const slots = expandEncounterCombatants(enc);
  if (slots.length <= 1) return [enc];

  const breakdown = packThreatBreakdown(slots, partyLevel, creatureOf, spellOf);
  // groupSize matters here too: without it a raid pack is judged against the 5-man budget,
  // falls past this early-out, and only `bins.length <= 1` below saves it from being renamed.
  if (!packExceedsBudget(breakdown, preset, groupSize)) return [enc];

  const bins = partitionSlotsToBudget(slots, partyLevel, creatureOf, spellOf, preset, groupSize);
  if (bins.length <= 1) return [enc];

  const out: EncounterDef[] = [];
  for (let bi = 0; bi < bins.length; bi++) {
    const shape = slotsToEncounterShape(bins[bi]!);
    const id = bi === 0 ? enc.id : `${enc.id}__budget${bi + 1}`;
    const name =
      bins.length > 1 ? `${enc.name} (${bi + 1}/${bins.length})` : enc.name;

    // Preserve original requiresFlag / objectGate on the first atom only.
    // Chain later atoms with requiresFlag so fusion cannot re-fuse them and
    // unlock order stays sequential via flags set on prior clear.
    const events: NonNullable<EncounterDef['events']> = [];
    if (bi === 0) {
      for (const ev of enc.events ?? []) {
        if (ev.kind === 'requiresFlag' || ev.kind === 'objectGate') events.push(ev);
      }
    } else {
      events.push({ kind: 'requiresFlag', flag: `__packBudget:${enc.id}:${bi}` });
    }
    // Intermediate setsFlag unlocks the next budget atom; final atom keeps original setsFlag.
    if (bi < bins.length - 1) {
      events.push({ kind: 'setsFlag', flag: `__packBudget:${enc.id}:${bi + 1}` });
    } else {
      for (const ev of enc.events ?? []) {
        if (ev.kind === 'setsFlag') events.push(ev);
        // Multi-phase scripted events stay on the final sub-pull only.
        if (
          ev.kind === 'onDeathSummon'
          || ev.kind === 'waves'
          || ev.kind === 'hpThreshold'
        ) {
          events.push(ev);
        }
      }
    }

    const sub: EncounterDef = {
      id,
      name,
      kind: enc.kind,
      creatureEntry: shape.creatureEntry,
      ...(shape.poolCandidates ? { poolCandidates: shape.poolCandidates } : {}),
      ...(shape.pack ? { pack: shape.pack } : {}),
      ...(enc.origin ? { origin: { ...enc.origin } } : {}),
      // Room-sticky tour keys on these. Dropping them made every over-budget
      // Scholomance Reliquary pack a singleton, so the tour walked Chamber first.
      ...(enc.roomId !== undefined ? { roomId: enc.roomId } : {}),
      ...(enc.roomName !== undefined ? { roomName: enc.roomName } : {}),
      ...(shape.spawnGuids ? { spawnGuids: shape.spawnGuids } : {}),
      ...(enc.intro && bi === 0 ? { intro: enc.intro } : {}),
      ...(enc.bossSpells && bi === 0 ? { bossSpells: [...enc.bossSpells] } : {}),
      ...(events.length ? { events } : {}),
    };
    out.push(sub);
  }
  return out;
}

// Expand a density-filtered route: each over-budget trash atom becomes sequential sub-pulls. Bosses /
// multi-phase scripted trash pass through. Deterministic.
export function expandRouteByPackBudget(
  route: readonly EncounterDef[],
  partyLevel: number,
  creatureOf: CreatureLookup,
  spellOf: SpellLookup,
  preset: PackBudgetPreset,
  /** Party size the budget is for; >10 keeps the legacy raid table. */
  groupSize?: number,
): EncounterDef[] {
  const out: EncounterDef[] = [];
  for (const enc of route) {
    out.push(...splitEncounterToBudget(enc, partyLevel, creatureOf, spellOf, preset, groupSize));
  }
  return out;
}
