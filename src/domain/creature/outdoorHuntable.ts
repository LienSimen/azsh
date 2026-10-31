// Outdoor grind eligibility for the zone.huntable runtime prune. Quest-kill must not punch
// CIVILIAN, faction-35 or same-side noXp through. Cite: zone-derive.mjs:89–164; Creature.h:56.

import type { FactionTemplateDef } from '../../data/schema.ts';
import { FACTION_GROUP_MASK } from './faction.ts';
import { CREATURE_EXTRA_FLAG } from './creatureAiConstants.ts';
import { unitCannotBeAttacked, type UnitFlagsBearer } from './unitFlags.ts';

/** FactionTemplate.dbc id 35 — PLAYER / Friendly. Pets, Binding VW, credit doodads. */
export const FRIENDLY_PLAYER_FACTION_TEMPLATE = 35;

/** CreatureType 8. Cite: SharedDefines.h CREATURE_TYPE_CRITTER. */
export const CREATURE_TYPE_CRITTER = 8;

/** Bits that mean "not a yellow-name grind target" even when quest-kill listed them. */
export const OUTDOOR_NONGRIND_EXTRA =
  CREATURE_EXTRA_FLAG.CIVILIAN | CREATURE_EXTRA_FLAG.INVISIBLE;

export const PLAYER_FACTION_GROUPS =
  FACTION_GROUP_MASK.PLAYER | FACTION_GROUP_MASK.ALLIANCE | FACTION_GROUP_MASK.HORDE;

export type OutdoorHuntableCreature = UnitFlagsBearer & {
  factionId?: number;
  noXp?: boolean;
  extraFlags?: number;
  creatureType?: number;
};

export type ZoneFactionSide = 'alliance' | 'horde' | 'contested' | undefined;

export function isFriendlyPlayerFactionTemplate(factionId: number | undefined): boolean {
  return ((factionId ?? 0) | 0) === FRIENDLY_PLAYER_FACTION_TEMPLATE;
}

export function isPlayerFactionGroup(ourMask: number): boolean {
  return (ourMask & PLAYER_FACTION_GROUPS) !== 0;
}

export function extraFlagsBlockOutdoorGrind(extraFlags: number | undefined): boolean {
  return ((extraFlags ?? 0) & OUTDOOR_NONGRIND_EXTRA) !== 0;
}

// Same-side noXp NPC in an Alliance or Horde zone — rescue patients, NO_XP city guards, garment
// heal proxies. Wildlife noXp has no ALLIANCE/HORDE group bit, so it stays.
export function isSameSideNoXp(
  noXp: boolean | undefined,
  factionTemplate: FactionTemplateDef | null | undefined,
  zoneFaction: ZoneFactionSide,
): boolean {
  if (!noXp || !factionTemplate) return false;
  if (zoneFaction === 'alliance') {
    return (factionTemplate.ourMask & FACTION_GROUP_MASK.ALLIANCE) !== 0;
  }
  if (zoneFaction === 'horde') {
    return (factionTemplate.ourMask & FACTION_GROUP_MASK.HORDE) !== 0;
  }
  return false;
}

// True → drop from outdoor zone.huntable. Fail open on a missing creature (lazy catalog) — huntableEntryOk
// already does.
export function isOutdoorNonGrindCreature(
  c: OutdoorHuntableCreature | null | undefined,
  factionTemplate: FactionTemplateDef | null | undefined,
  zoneFaction?: ZoneFactionSide,
): boolean {
  if (!c) return false;
  if (((c.creatureType ?? 0) | 0) === CREATURE_TYPE_CRITTER) return true;
  if (isFriendlyPlayerFactionTemplate(c.factionId)) return true;
  if (extraFlagsBlockOutdoorGrind(c.extraFlags)) return true;
  if (unitCannotBeAttacked(c)) return true;
  if (isSameSideNoXp(c.noXp, factionTemplate, zoneFaction)) return true;
  return false;
}
