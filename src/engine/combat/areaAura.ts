// Continuous AREA AURAS (class A) — membership is live, not a duration clock. The holder re-collects
// the in-radius, same-subgroup party each slice; a unit out of radius or ungrouped has it REMOVED.

import type { Side } from '../core/events.ts';
import {
  applySpellMod,
  radiusSpellModsFromTalentEffects,
  SPELLMOD_RADIUS_LABEL,
  SPELLMOD_RADIUS_OP,
  type SpellMod,
} from '../spells/spellMods.ts';
import { isWithinRadiusYd, type CombatPosYd } from './combatGeometry.ts';
import { fighterIsInCombat } from './combatFlag.ts';
import {
  SLOW_ENGAGED_RATE,
  SLOW_IDLE_RATE,
  slowSliceDue,
  type SlowDiag,
} from './slowUpdate.ts';
import type { ActiveEffect, Fighter } from './types.ts';

// The radius-mod reader is pure and lives in spellMods.ts so buildCombatant can call it without the
// combat session graph. Re-exported here because this is the module that documents what it is FOR.
export { radiusSpellModsFromTalentEffects, SPELLMOD_RADIUS_LABEL, SPELLMOD_RADIUS_OP };

// The effective radius: the base scaled by the owner's SPELLMOD_RADIUS. An absent base is returned
// unchanged — a missing radius on a real class-A aura is a bake gap, never an invented default.
export function effectiveAreaRadiusYd(
  baseRadiusYd: number | undefined | null,
  mods: readonly SpellMod[] | undefined | null,
): number | undefined {
  if (baseRadiusYd == null || !(baseRadiusYd > 0)) return undefined;
  if (!mods || mods.length === 0) return baseRadiusYd;
  const { value } = applySpellMod(baseRadiusYd, mods, { op: SPELLMOD_RADIUS_LABEL });
  return value > 0 ? value : baseRadiusYd;
}

// One live class-A area-aura holder registered on the session. The closures are the apply-missing and
// remove arms, so the pass owns only the geometry and membership decision.
export interface AreaAuraSource {
  // Unit whose position is the aura origin. Totem side for totem kits (Classic: at the caster's feet, not
  // the caster), pet side for Blood Pact, caster side for Sanctity / Devotion.
  holderSide: Side;
  /** Aura spell id (kit / party spell) — identifies the rows this source owns. */
  spellId: number;
  name: string;
  // `GetSpellRadius(EffectRadiusIndex)` yards. `undefined` = the bake has no radius for a real area aura —
  // a gap, surfaced by `missingRadius`, and failed open.
  baseRadiusYd?: number;
  /** Unit whose SPELLMOD_RADIUS mods scale the radius (totem OWNER, or the caster). */
  modOwnerSide: Side;
  // Re-apply to a member that is (still / again) in radius. Must be idempotent. `t` is the pass's
  // clock: a closure that kept its cast's `t` stamped a late joiner's row in the past and ticked it up.
  apply: (target: Fighter, t: number) => void;
  /** Remove this holder's rows from a member that left radius / party / died. */
  strip: (target: Fighter) => void;
  /** Current membership candidates (living party / pet rules). */
  members: () => Fighter[];
  // Sides that currently hold this holder's rows, member or not. members() alone cannot express the
  // remove arm: the C++ runs it from the TARGET, so a unit that LEFT still re-checks and removes.
  carriers: () => Side[];
  /** False once the holder is gone (totem unsummoned / caster dead / caster lost its own row). */
  alive: () => boolean;
  /** Cast-tick radius filter — not C2-gated. Set by registerAreaAuraSource. */
  radiusPending?: boolean;
  // spell_group of an exclusive family (paladin auras are group 8): one holder keeps ONE source per
  // group, so switching Devotion to Sanctity strips Devotion off every carrier.
  exclusionGroup?: number;
}

// A holder swapping auras inside one exclusive group loses the old row, so every carrier loses it too.
// Cite: Unit.cpp:4907 RemoveNoStackAurasDueToAuraHolder; SpellStacking.cpp:358; SpellAuras.cpp:597.
export function stripExclusiveSiblingSources(
  sources: AreaAuraSource[],
  incoming: Pick<AreaAuraSource, 'holderSide' | 'spellId' | 'exclusionGroup'>,
  bySide: (side: Side | string) => Fighter | undefined,
): number {
  const group = incoming.exclusionGroup;
  if (group == null || group === 0) return 0;
  let stripped = 0;
  for (let i = sources.length - 1; i >= 0; i--) {
    const s = sources[i]!;
    if (s.holderSide !== incoming.holderSide) continue;
    if (s.spellId === incoming.spellId) continue;
    if (s.exclusionGroup !== group) continue;
    for (const side of s.carriers()) {
      const unit = bySide(side);
      if (unit) s.strip(unit);
    }
    sources.splice(i, 1);
    stripped++;
  }
  return stripped;
}

// Rows of OTHER spells in the same exclusive group that this holder left on any unit, source-registered
// or not (a Retribution Aura damage shield has no source). Reversed and removed, count returned.
export function stripHolderRowsInGroup(
  effects: ActiveEffect[],
  holderSide: Side,
  keepSpellId: number,
  group: number,
  groupOf: (spellId: number) => number | undefined,
  bySide: (side: Side | string) => Fighter | undefined,
  reverse: (unit: Fighter, e: ActiveEffect) => void,
  fromHolder?: readonly ActiveEffect[],
): number {
  let removed = 0;
  const rows = fromHolder ?? effects;
  for (let i = rows.length - 1; i >= 0; i--) {
    const e = rows[i]!;
    if (e.source !== holderSide) continue;
    if (e.spellId === keepSpellId) continue;
    if ((e.exclusionGroup ?? groupOf(e.spellId)) !== group) continue;
    if (isSheetBakedDisplayRow(e)) continue;
    const unit = bySide(e.target);
    if (!unit) continue;
    if (!e.broken) reverse(unit, e);
    else unit.buffActive.delete(e.spellId);
    const idx = fromHolder ? effects.lastIndexOf(e) : i;
    if (idx >= 0) effects.splice(idx, 1);
    removed++;
  }
  return removed;
}

// A sheet-baked display row: the stats already live in the spec, so the effect carries no mod to
// reverse. Stripping one would let a re-entry stack combat stats on top of the sheet.
function isSheetBakedDisplayRow(e: ActiveEffect): boolean {
  return e.kind === 'buff' && e.mod == null;
}

// Remove one holder's rows for `spellId` from `target` and reverse their live side-effects. Scoped by
// source, so twin holders never strip each other. Cite: AreaAura::Update remove arm ~592–624.
export function stripAreaAuraRowsFrom(
  effects: ActiveEffect[],
  target: Fighter,
  spellId: number,
  holderSide: Side,
  reverse: (unit: Fighter, e: ActiveEffect) => void,
  onTarget?: readonly ActiveEffect[],
): number {
  let removed = 0;
  const rows = onTarget ?? effects;
  for (let i = rows.length - 1; i >= 0; i--) {
    const e = rows[i]!;
    if (e.target !== target.side) continue;
    if (e.spellId !== spellId) continue;
    if (e.source !== holderSide) continue;
    if (isSheetBakedDisplayRow(e)) continue;
    if (!e.broken) reverse(target, e);
    else target.buffActive.delete(e.spellId);
    const idx = onTarget ? effects.lastIndexOf(e) : i;
    if (idx >= 0) effects.splice(idx, 1);
    removed++;
  }
  return removed;
}

/** True when this holder still has at least one live row for `spellId` on `target`. */
export function hasAreaAuraRow(
  effects: readonly ActiveEffect[],
  target: Fighter,
  spellId: number,
  holderSide: Side,
): boolean {
  return effects.some(
    (e) => e.target === target.side && e.spellId === spellId && e.source === holderSide,
  );
}

// Distinct sides carrying this holder's rows. Sheet-baked display rows are excluded, since stripping
// deliberately leaves them alone and listing such a side would re-strip nothing every slice.
export function areaAuraCarrierSides(
  effects: readonly ActiveEffect[],
  spellId: number,
  holderSide: Side,
): Side[] {
  const out: Side[] = [];
  for (const e of effects) {
    if (e.spellId !== spellId) continue;
    if (e.source !== holderSide) continue;
    if (isSheetBakedDisplayRow(e)) continue;
    if (out.includes(e.target)) continue;
    out.push(e.target);
  }
  return out;
}

export interface AreaAuraMaintainDeps {
  sources: AreaAuraSource[];
  posOf: (side: Side | string) => CombatPosYd | undefined;
  bySide: (side: Side | string) => Fighter | undefined;
  dead: (f: Fighter) => boolean;
  /** Geometry present? Absent → legacy whole-side behaviour, no strips. */
  hasGeometry: () => boolean;
  t: number;
  tickMs: number;
  diag?: SlowDiag;
}

/** Holder C2 slice — Recoil leftover; death/unsummon is not on this clock. */
export function areaAuraRadiusDue(
  holderSide: string,
  t: number,
  tickMs: number,
  engaged: boolean,
  pending: boolean,
): boolean {
  if (pending) return true;
  return slowSliceDue(
    holderSide,
    t,
    tickMs,
    engaged ? SLOW_ENGAGED_RATE : SLOW_IDLE_RATE,
  );
}

// The remove arm for carriers that are no longer members. The C++ runs it from the TARGET, so a
// holder-side members() loop never revisits a unit that left — Devotion Aura sat on a departed rogue.
function stripDepartedCarriers(s: AreaAuraSource, deps: AreaAuraMaintainDeps): void {
  const carriers = s.carriers();
  if (carriers.length === 0) return;
  const memberSides = new Set<Side>();
  for (const m of s.members()) memberSides.add(m.side);
  for (const side of carriers) {
    if (memberSides.has(side)) continue;
    const unit = deps.bySide(side);
    if (unit) s.strip(unit);
  }
}

// AreaAura::Update for every registered holder, once per tick after motion. Radius and membership ride
// the slow slice; holder death, unsummon and member death still strip immediately.
export function runAreaAuraMaintain(deps: AreaAuraMaintainDeps): void {
  const { sources } = deps;
  if (sources.length === 0) return;
  const geometry = deps.hasGeometry();

  for (let i = sources.length - 1; i >= 0; i--) {
    const s = sources[i]!;
    if (!s.alive()) {
      // Holder gone strips EVERY carrier, not just the current members — a unit that left
      // the party before the totem was unsummoned still holds rows.
      stripDepartedCarriers(s, deps);
      for (const m of s.members()) s.strip(m);
      sources.splice(i, 1);
      continue;
    }
    const pending = s.radiusPending === true;
    if (pending) s.radiusPending = false;
    const probe = deps.bySide(s.modOwnerSide) ?? deps.bySide(s.holderSide);
    const engaged = probe ? fighterIsInCombat(probe, deps.t) : false;
    const due = areaAuraRadiusDue(s.holderSide, deps.t, deps.tickMs, engaged, pending);
    if (!due) {
      for (const m of s.members()) {
        if (deps.dead(m)) s.strip(m);
      }
      if (deps.diag) deps.diag.areaAuraSkip++;
      continue;
    }
    if (deps.diag) deps.diag.areaAuraRadius++;
    // Membership and radius share the C2 slice: subgroup/leave is membership, not geometry.
    stripDepartedCarriers(s, deps);
    const origin = geometry ? deps.posOf(s.holderSide) : undefined;
    const modOwner = deps.bySide(s.modOwnerSide);
    const radius = effectiveAreaRadiusYd(s.baseRadiusYd, modOwner?.radiusSpellMods);
    for (const m of s.members()) {
      if (deps.dead(m)) {
        s.strip(m);
        continue;
      }
      if (!geometry) {
        // No coords — keep the historic whole-side reach (never invent a radius).
        s.apply(m, deps.t);
        continue;
      }
      // isWithinRadiusYd fails OPEN on a missing radius or a missing position:
      // a bake gap must not silently delete a real party aura (§4.7).
      if (isWithinRadiusYd(origin, deps.posOf(m.side), radius)) s.apply(m, deps.t);
      else s.strip(m);
    }
  }
}
