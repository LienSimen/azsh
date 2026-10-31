// Heal and party-heal target resolution — the single site for applyTo routing. Heals are never fanned
// externally: selection re-picks the lowest ally later, so an outside fan double-heals it.

import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import { isTotemSide } from '../core/events.ts';
import { FRIENDLY_MULTI_TARGETS, wantsFriendlyFan } from './friendlyFan.ts';
import { TARGET_UNIT_FRIEND_CHAIN_HEAL } from './chainFan.ts';

/** TARGET_UNIT_RAID_AND_CLASS — same class as the (player) target. */
export const TARGET_UNIT_RAID_AND_CLASS = 61;

/** APPLY_AREA_AURA_PARTY — a party aura even when its own target is the caster. */
const EFFECT_APPLY_AREA_AURA_PARTY = 35;

// Single selected friend/party/raid. Cite: SpellTargetDefines.h TARGET_UNIT_FRIEND/PARTY/RAID.
const SELECTED_UNIT_HEAL_TARGETS: ReadonlySet<number> = new Set([3, 21, 35, 57, 58]);

export type HealApplyTo = 'self' | 'pet' | 'friendly' | 'party';

// The living pet mapped to this caster: the seat its own spec names, else the session pet. That edge
// lives on the unit it starts from, rather than being found by scanning the ally array.
export function resolvePetHealFighter<F extends { side: string; spec?: { petSide?: string } }>(
  src: F,
  unitOfSide: (side: string) => F | null | undefined,
  pet: F | null | undefined,
  dead: (f: F) => boolean,
  isAlly: (side: string) => boolean,
): F | null {
  if (isAlly(src.side)) {
    const ps = src.spec?.petSide;
    const mapped = ps ? unitOfSide(ps) ?? null : null;
    if (mapped && !dead(mapped)) return mapped;
    return null;
  }
  if (pet && !dead(pet)) return pet;
  return null;
}

// Audience for a heal effect. Raw implicit targets win over a baked applyTo so a single-unit DBC
// row cannot keep a stale party fan. Chain-heal 45 is jump-based, not a flat splash.
export function resolveHealApplyTo(spell: SpellDef, eff: SpellEffect & { applyTo?: HealApplyTo }): HealApplyTo | undefined {
  const raw = spell.rawEffects;
  if (raw?.length) {
    let best: HealApplyTo | undefined;
    const rank: Record<HealApplyTo, number> = { self: 0, pet: 1, friendly: 2, party: 3 };
    for (const re of raw) {
      if ((re.effect | 0) === 0) continue;
      const t = (re.targetA | 0) || (re.targetB | 0);
      if (t === TARGET_UNIT_FRIEND_CHAIN_HEAL) continue;
      let at: HealApplyTo | undefined;
      if ((re.effect | 0) === EFFECT_APPLY_AREA_AURA_PARTY || FRIENDLY_MULTI_TARGETS.has(t)) {
        at = 'party';
      } else if (SELECTED_UNIT_HEAL_TARGETS.has(t)) {
        at = 'friendly';
      } else if (t === 5) {
        at = 'pet';
      }
      if (at && (!best || rank[at] > rank[best])) best = at;
    }
    if (!best && wantsFriendlyFan(spell)) best = 'party';
    if (best) return best;
  }
  return eff.applyTo;
}

/** True when the spell's raw row asks for RAID_AND_CLASS (Greater Blessings). */
export function wantsRaidAndClass(spell: SpellDef): boolean {
  for (const re of spell.rawEffects ?? []) {
    if ((re.targetA | 0) === TARGET_UNIT_RAID_AND_CLASS) return true;
    if ((re.targetB | 0) === TARGET_UNIT_RAID_AND_CLASS) return true;
  }
  return false;
}

// Filter a party or raid audience to members sharing the primary target's class. A missing class on
// either side keeps the unit — fail open for NPCs and test dummies.
export function filterSameClass<F extends { spec: { classId?: number } }>(
  primary: F,
  pool: F[],
): F[] {
  const cls = primary.spec.classId;
  if (cls == null || cls === 0) return pool;
  return pool.filter((u) => {
    const c = u.spec.classId;
    if (c == null || c === 0) return true;
    return c === cls;
  });
}

// Implicit targets that reach the caster's SUBGROUP only — `FillRaidOrPartyTargets(raid=false)` for
// 20/33/34, and the group walk at Spell.cpp:2449 for 37.
const SUBGROUP_TARGETS: ReadonlySet<number> = new Set([
  20, // TARGET_ENUM_UNITS_PARTY_WITHIN_CASTER_RANGE
  33, // TARGET_ENUM_UNITS_PARTY_AOE_AT_SRC_LOC
  34, // TARGET_ENUM_UNITS_PARTY_AOE_AT_DEST_LOC
  37, // TARGET_UNIT_FRIEND_AND_PARTY
]);

// Multi-unit friendly targets that are NOT group-scoped: the raid enums, raid-and-class, and the
// friendly area-at-location enums. A Greater Blessing walks the whole group filtered by class.
const OPEN_FAN_TARGETS: ReadonlySet<number> = new Set([
  56, // TARGET_ENUM_UNITS_RAID_WITHIN_CASTER_RANGE
  TARGET_UNIT_RAID_AND_CLASS, // 61
  29, 30, 31, 59, // friendly AoE at dynobj / src / dest / cone
]);

// Does this spell's friendly fan stop at the caster's subgroup? The raw targets decide, exactly as the
// C++ does. Only when the raw row carries no fan at all does the baked audience stand in.
export function fanStopsAtSubgroup(spell: SpellDef, applyTo: HealApplyTo | undefined): boolean {
  let sawOpenFan = false;
  for (const re of spell.rawEffects ?? []) {
    if ((re.effect | 0) === 0) continue;
    if ((re.effect | 0) === EFFECT_APPLY_AREA_AURA_PARTY) return true;
    for (const t of [re.targetA | 0, re.targetB | 0]) {
      if (SUBGROUP_TARGETS.has(t)) return true;
      if (OPEN_FAN_TARGETS.has(t)) sawOpenFan = true;
    }
  }
  return sawOpenFan ? false : applyTo === 'party';
}

// The same raid subgroup — the party half of the raid-or-party fill. Either side ungrouped is true:
// enemy packs and 1v1 fixtures carry no group, and a missing field must not delete a real party buff.
export function sameSubgroup(
  a: { spec?: { subgroup?: number } },
  b: { spec?: { subgroup?: number } },
): boolean {
  const ga = a.spec?.subgroup;
  const gb = b.spec?.subgroup;
  if (ga == null || gb == null) return true;
  return ga === gb;
}

// A friendly fan is the group's players and each one's controlled pet — never a totem, never a
// guardian. Cite: Spell.cpp:7345-7350 GetPet() only; SpellAuras.cpp:445 the same; Pet.cpp:378.
export function isPartyFanBody<F extends { side: string; spec?: { summonOwnerSide?: string } }>(
  u: F,
): boolean {
  return !isTotemSide(u.side) && u.spec?.summonOwnerSide == null;
}

// The class-B timed party fan: the caster's own subgroup, and of those only the units inside the
// spell's radius at cast. A missing radius or distance fails open, and the caster is always kept.
export function filterPartyFanByRadius<
  F extends { side: string; spec?: { subgroup?: number; summonOwnerSide?: string } },
>(
  caster: F,
  pool: readonly F[],
  spell: SpellDef,
  applyTo: HealApplyTo | undefined,
  distanceBetween: (a: F, b: F) => number | undefined | null,
): F[] {
  const radiusYd = spell.radiusYd;
  const bySubgroup = fanStopsAtSubgroup(spell, applyTo);
  const out: F[] = [];
  for (const u of pool) {
    if (u.side === caster.side) {
      out.push(u);
      continue;
    }
    if (!isPartyFanBody(u)) continue;
    if (bySubgroup && !sameSubgroup(caster, u)) continue;
    if (radiusYd != null && radiusYd > 0) {
      const d = distanceBetween(caster, u);
      if (d != null && d > radiusYd) continue;
    }
    out.push(u);
  }
  return out;
}

// Implicit targets that name ONE friendly unit the caster SELECTED, never the caster itself.
// Cite: Spell.cpp:2298–2306 and :2326–2330; SpellTargets.cpp:68,90 both single-enumerator.
const SELECTED_FRIEND_TARGETS: ReadonlySet<number> = new Set([3, 21, 35, 37, 45, 57, 58, 61]);

// True when a self-shaped aura — a school absorb or a damage shield — belongs on the unit the cast
// NAMED rather than the caster. Derived from the raw implicit target, and 54 rows qualify.
export function auraHolderIsCastTarget(spell: SpellDef): boolean {
  for (const re of spell.rawEffects ?? []) {
    if ((re.effect | 0) === 0) continue;
    if (SELECTED_FRIEND_TARGETS.has(re.targetA | 0)) return true;
    if (SELECTED_FRIEND_TARGETS.has(re.targetB | 0)) return true;
  }
  return false;
}

// TARGET_UNIT_FRIEND is the selected unit; an unaimed keep-up is the caster. Cite: Spell.cpp:2298-2306.
export function selectedOrSelfFriendly<F extends { side: string }>(
  src: F,
  tgt: F,
  pinned: F | null | undefined,
  dead: (f: F) => boolean,
  isHostileSide: (side: string) => boolean,
): F {
  const sameSide = (u: F): boolean => isHostileSide(u.side) === isHostileSide(src.side) && !dead(u);
  if (pinned && sameSide(pinned)) return pinned;
  if (sameSide(tgt)) return tgt;
  return src;
}

// TARGET_UNIT_PARTY is the one selected-friend target the caster may NOT be, and the imp's Fire
// Shield is the row it exists for. Cite: Spell.cpp:2325-2330 "can only be casted on a party member
// and not on the caster (some seals, fire shield from imp, etc..)".
const TARGET_UNIT_PARTY = 35;

/** True when this spell's aura must land on a party member OTHER than the caster. */
export function auraHolderExcludesCaster(spell: SpellDef): boolean {
  for (const re of spell.rawEffects ?? []) {
    if ((re.effect | 0) === 0) continue;
    if ((re.targetA | 0) === TARGET_UNIT_PARTY) return true;
    if ((re.targetB | 0) === TARGET_UNIT_PARTY) return true;
  }
  return false;
}

// SPELL_EFFECT_APPLY_AREA_AURA_PARTY. The aura sits on the caster and AreaAura::Update radiates it
// to the subgroup — Retribution Aura is a damage shield shaped this way, not a self-only one.
// Cite: SpellEffects.cpp EffectApplyAreaAura; SpellAuras.cpp AreaAura::Update.
const SPELL_EFFECT_APPLY_AREA_AURA_PARTY = 35;

/** True when this spell radiates its aura to the caster's party rather than landing on one unit. */
export function auraRadiatesToParty(spell: SpellDef): boolean {
  return (spell.rawEffects ?? []).some(
    (re) => (re.effect | 0) === SPELL_EFFECT_APPLY_AREA_AURA_PARTY,
  );
}
